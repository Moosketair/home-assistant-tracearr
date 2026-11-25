"""REST snapshot + a single SSE stream for all Tracearr servers."""
from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Coroutine
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import TracearrAuthError, TracearrClient, TracearrRateLimited, TracearrUnavailable
from .model import apply_event, stats

_LOGGER = logging.getLogger(__name__)
_MAX_MUTATIONS = 4096


class _RefreshChanges:
    """Coalesce overlapping mutations, never retain an event history."""

    def __init__(self) -> None:
        self.rows: dict[str, dict | None] = {}
        self.overflow = False

    def record(self, key: str, fields: dict | None) -> None:
        if self.overflow:
            return
        if key not in self.rows and len(self.rows) >= _MAX_MUTATIONS:
            self.rows.clear()
            self.overflow = True
            return
        self.rows[key] = fields

    def merge(self, incoming: dict[str, dict], live: dict[str, dict]) -> dict[str, dict]:
        if self.overflow:
            # Never partially protect a snapshot. Retry at the next REST cycle.
            return live
        for key, fields in self.rows.items():
            if fields is None:
                incoming.pop(key, None)
            else:
                if key not in incoming and key not in live and "id" not in fields:
                    # Progress/health alone cannot construct a session/server.
                    continue
                incoming[key] = {**incoming.get(key, live.get(key, {})), **fields}
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
            self.async_set_updated_data(self.snapshot())

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
            if self._sse_ready and ready_serial == self._ready_serial:
                self.sse_connected = self.connected
                self._emit()

    async def _sse_loop(self) -> None:
        retry = 5
        while True:
            try:
                async for event in self.client.events():
                    if event.get("type") == "ready":
                        # Do not block ingress on REST, including a refresh already
                        # running. A ready during that request needs a later fetch.
                        self._sse_ready = True
                        self._ready_serial += 1
                        self._refresh_requested.set()
                        retry = 5
                    elif event.get("type") == "server.health":
                        payload = event.get("data", {})
                        if isinstance(payload, dict) and isinstance(payload.get("server_id"), str):
                            fields = {k: payload[k] for k in ("status", "reason") if k in payload}
                            if self._server_changes is not None:
                                previous = self._server_changes.rows.get(payload["server_id"]) or {}
                                self._server_changes.record(payload["server_id"], {**previous, **fields})
                            server = self.servers.get(payload.get("server_id"))
                            if server:
                                server.update(fields)
                                self._emit()
                    elif event.get("type", "").startswith("stream."):
                        changed = apply_event(self.streams, event)
                        self._record_stream_change(event, changed)
                        if changed:
                            self._emit()
            except TracearrRateLimited as exc:
                retry = exc.retry_after
            except TracearrAuthError:
                _LOGGER.warning("Tracearr key rejected; reconnecting slowly until corrected")
                retry = 300
            except (TracearrUnavailable, asyncio.TimeoutError) as exc:
                _LOGGER.debug("Tracearr SSE disconnected: %s", exc)
                retry = min(max(retry * 2, 5), 60)
            finally:
                self._sse_ready = False
                self.sse_connected = False
                self._emit()
            await asyncio.sleep(retry)

    def _record_stream_change(self, event: dict, changed: bool) -> None:
        changes = self._stream_changes
        payload = event.get("data")
        if changes is None or not isinstance(payload, dict):
            return
        key = payload.get("id")
        if not isinstance(key, str):
            return
        kind = event.get("type")
        if kind == "stream.stopped":
            # Also protect an absent session that the REST result may contain.
            changes.record(key, None)
        elif kind == "stream.progress":
            if key in changes.rows and changes.rows[key] is None:
                return  # A partial progress must not undo an overlapping stop.
            row = self.streams[key] if changed else payload
            fields = {**(changes.rows.get(key) or {}),
                      **{k: row[k] for k in ("state", "progress_ms", "bitrate") if k in row}}
            changes.record(key, fields)
        elif changed:
            changes.record(key, dict(self.streams[key]))
