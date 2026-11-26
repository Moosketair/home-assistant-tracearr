"""REST snapshot + a single SSE stream for all Tracearr servers."""
from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Coroutine
from contextlib import aclosing
from typing import Any, NamedTuple

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import TracearrAuthError, TracearrClient, TracearrRateLimited, TracearrUnavailable
from .model import stats, stream_mutation

_LOGGER = logging.getLogger(__name__)
_MAX_MUTATIONS = 4096


class _RowChange(NamedTuple):
    fields: dict
    replace: bool


class _RefreshChanges:
    """Coalesce overlapping mutations, never retain an event history."""

    def __init__(self) -> None:
        self.rows: dict[str, _RowChange | None] = {}
        self.overflow = False

    def record(self, key: str, fields: dict | None, *, replace: bool = False) -> None:
        if self.overflow:
            return
        if key not in self.rows and len(self.rows) >= _MAX_MUTATIONS:
            self.rows.clear()
            self.overflow = True
            return
        if fields is None:
            self.rows[key] = None
        elif not replace and (previous := self.rows.get(key)) is not None:
            previous.fields.update(fields)
        else:
            self.rows[key] = _RowChange(dict(fields), replace)

    def was_stopped(self, key: str) -> bool:
        return key in self.rows and self.rows[key] is None

    def merge(self, incoming: dict[str, dict], live: dict[str, dict]) -> dict[str, dict]:
        if self.overflow:
            # Never partially protect a snapshot. Retry at the next REST cycle.
            return live
        for key, change in self.rows.items():
            if change is None:
                incoming.pop(key, None)
            else:
                # After stop/start the live row belongs to the new incarnation;
                # the in-flight REST row may still describe the stopped one.
                base = live.get(key) if change.replace else incoming.get(key, live.get(key))
                if base is not None:  # Progress/health alone cannot create a row.
                    incoming[key] = {**base, **change.fields}
        return incoming


class TracearrCoordinator(DataUpdateCoordinator[dict]):
    """Maintains one data cache, resilient to SSE gaps and reconnects."""

    def __init__(self, hass: HomeAssistant, client: TracearrClient) -> None:
        super().__init__(hass, _LOGGER, name="Tracearr HA", update_interval=None)
        self.client = client
        self.streams: dict[str, dict] = {}
        self.servers: dict[str, dict] = {}
        self.connected = False
        self.sse_connected = False
        self.last_sync: float | None = None
        self._sse_task: asyncio.Task | None = None
        self._poll_task: asyncio.Task | None = None
        self._lock = asyncio.Lock()
        self._refresh_requested = asyncio.Event()
        self._refresh_tasks: set[asyncio.Task] = set()
        self._stream_changes: _RefreshChanges | None = None
        self._server_changes: _RefreshChanges | None = None
        self._sse_ready = False
        self._ready_serial = 0
        self._stopped = False

    async def _async_update_data(self) -> dict:
        task = asyncio.current_task()
        self._refresh_tasks.add(task)
        try:
            async with self._lock:
                if self._stopped:
                    raise asyncio.CancelledError
                # A separate boundary per endpoint: health received before the
                # servers GET must not override that potentially newer response.
                self._stream_changes = _RefreshChanges()
                try:
                    response = await self.client.streams()
                    self._server_changes = _RefreshChanges()
                    server_response = await self.client.servers()
                    streams = {s["id"]: s for s in response.get("data", []) if isinstance(s, dict) and isinstance(s.get("id"), str)}
                    servers = {s["server_id"]: s for s in server_response.get("data", []) if isinstance(s, dict) and isinstance(s.get("server_id"), str)}
                    # No await from reconciliation through HA's publication.
                    self.streams = self._stream_changes.merge(streams, self.streams)
                    self.servers = self._server_changes.merge(servers, self.servers)
                    self.connected = True
                    self.last_sync = time.time()
                    return self.snapshot()
                finally:
                    self._stream_changes = self._server_changes = None
        except (TracearrUnavailable, TracearrAuthError) as exc:
            self.connected = False
            # HA retains the existing data on UpdateFailed, but listeners must
            # see REST connectivity change alongside the still-live cache.
            self.data = self.snapshot()
            raise UpdateFailed(str(exc)) from exc
        finally:
            self._refresh_tasks.discard(task)

    def snapshot(self) -> dict:
        return {
            "streams": list(self.streams.values()),
            "servers": list(self.servers.values()),
            "stats": stats(self.streams),
            "connected": self.connected,
            "sse_connected": self.sse_connected,
            "last_sync": self.last_sync,
        }

    def _emit(self) -> None:
        if not self._stopped:
            # async_set_updated_data marks the refresh successful and cancels
            # the request debouncer. An SSE/options notification does neither.
            self.data = self.snapshot()
            self.async_update_listeners()

    def start(self) -> None:
        self._sse_task = self._start_task(self._sse_loop(), "Tracearr SSE")
        self._poll_task = self._start_task(self._poll_loop(), "Tracearr poll")

    def _start_task(self, coro: Coroutine[Any, Any, None], name: str) -> asyncio.Task:
        try:
            return self.hass.async_create_background_task(coro, name, eager_start=False)
        except BaseException:
            coro.close()  # The task factory never took ownership.
            raise

    async def stop(self) -> None:
        self._stopped = True
        tasks = self._refresh_tasks | {t for t in (self._sse_task, self._poll_task) if t is not None}
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self._refresh_requested.clear()
        self._sse_ready = False
        self._stream_changes = self._server_changes = None
        await self.async_shutdown()  # Also release HA coordinator timers on failed setup.

    async def _poll_loop(self) -> None:
        while True:
            try:
                async with asyncio.timeout(60 if self.sse_connected else 15):
                    await self._refresh_requested.wait()
            except TimeoutError:
                pass
            self._refresh_requested.clear()
            ready_serial = self._ready_serial
            await self.async_refresh()
            if (self._sse_ready and not self.sse_connected and ready_serial == self._ready_serial
                    and self.connected and self.last_update_success):
                # Confirm an unconfirmed connection after a successful catch-up.
                # A REST failure cannot clear an already confirmed SSE transport.
                self.sse_connected = True
                self._emit()

    async def _sse_loop(self) -> None:
        retry = 5
        while True:
            failure = None
            try:
                async with aclosing(self.client.events()) as events:
                    async for event in events:
                        try:
                            if self._apply_sse_event(event):
                                retry = 5
                        except Exception as exc:
                            # An application failure, even a TimeoutError here,
                            # is not a transport failure and must not reconnect.
                            failure = exc
                            break
            except TracearrRateLimited as exc:
                retry = exc.retry_after
            except TracearrAuthError:
                _LOGGER.warning("Tracearr key rejected; reconnecting slowly until corrected")
                retry = 300
            except (TracearrUnavailable, asyncio.TimeoutError) as exc:
                _LOGGER.debug("Tracearr SSE disconnected: %s", exc)
                retry = min(max(retry * 2, 5), 60)
            except Exception as exc:
                failure = failure if failure is not None else exc
            finally:
                self._sse_ready = False
                self.sse_connected = False
                try:
                    self._emit()
                except Exception as exc:
                    if failure is None:
                        failure = exc
                if failure is not None:
                    self._log_sse_failure(failure)
            if failure is not None:
                return
            await asyncio.sleep(retry)

    @staticmethod
    def _log_sse_failure(exc: Exception) -> None:
        # Do not log exception text, chained exceptions, URLs or event payloads.
        origin = exc.__traceback__
        while origin is not None and origin.tb_next is not None:
            origin = origin.tb_next
        location = f"{origin.tb_frame.f_code.co_name}:{origin.tb_lineno}" if origin else "unknown"
        _LOGGER.error("Tracearr SSE stopped after an internal error (%s at %s); REST polling continues",
                      type(exc).__name__, location)

    def _apply_sse_event(self, event: dict) -> bool:
        """Apply one event; true means the reconnect delay can reset."""
        if event.get("type") == "ready":
            # Do not block ingress on REST, including a refresh already
            # running. A ready during that request needs a later fetch.
            self._sse_ready = True
            self._ready_serial += 1
            self._refresh_requested.set()
            return True
        elif event.get("type") == "server.health":
            payload = event.get("data", {})
            if (isinstance(payload, dict) and isinstance(payload.get("server_id"), str)
                    and payload["server_id"] and isinstance(payload.get("status"), str)
                    and payload["status"]
                    and (payload.get("reason") is None or isinstance(payload["reason"], str))):
                fields = {k: payload[k] for k in ("status", "reason") if k in payload}
                if self._server_changes is not None:
                    self._server_changes.record(payload["server_id"], fields)
                server = self.servers.get(payload.get("server_id"))
                if server:
                    server.update(fields)
                    self._emit()
        else:
            self._apply_stream_event(event)
        return False

    def _apply_stream_event(self, event: dict) -> None:
        mutation = stream_mutation(self.streams, event)
        if mutation is None:
            return
        changes = self._stream_changes
        if changes is not None:
            was_stopped = changes.was_stopped(mutation.key)
            if was_stopped and mutation.kind not in ("stream.started", "stream.stopped"):
                return  # An update/progress cannot undo a known overlapping stop.
            changes.record(mutation.key, mutation.fields, replace=was_stopped)
        if mutation.apply(self.streams):
            self._emit()
