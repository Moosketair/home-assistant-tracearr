"""REST snapshot + a single SSE stream for all Tracearr servers."""
from __future__ import annotations

import asyncio
import logging
import time
from collections import OrderedDict
from collections.abc import Coroutine
from contextlib import aclosing
from typing import Any, NamedTuple

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import TracearrAuthError, TracearrClient, TracearrRateLimited, TracearrUnavailable
from .model import (
    PlaybackIdentity,
    snapshot_rows,
    stats,
    stream_join_fields,
    stream_mutation,
)

_LOGGER = logging.getLogger(__name__)
_MAX_MUTATIONS = 4096
_MAX_STOPPED_IDS = 1024
_STOP_TTL = 120
_MAX_PRIOR_PLAYS = 4


class _RowChange(NamedTuple):
    fields: dict | None  # None: stopped; {}: only a late stop for another incarnation.
    replace: bool
    new_play: bool
    identity: PlaybackIdentity
    prior: dict[PlaybackIdentity, bool]  # True if explicitly stopped during this GET.
    prior_overflow: bool
    stop_overflow: bool

    def excludes(self, rest: PlaybackIdentity) -> bool:
        return self.stop_overflow or any(
            stopped and not play.incompatible(rest) for play, stopped in self.prior.items()
        )

    def stopped_match(self, identity: PlaybackIdentity) -> bool:
        return any(stopped and play.matches_stopped_play(identity) for play, stopped in self.prior.items())


class _RefreshChanges:
    """Coalesce overlapping mutations, never retain an event history."""

    def __init__(self, *, streams: bool = False) -> None:
        self.rows: dict[str, _RowChange] = {}
        self.streams = streams
        self.overflow = False

    def record(self, key: str, fields: dict | None, *, replace: bool = False,
               new_play: bool = False, identity: PlaybackIdentity = PlaybackIdentity(),
               previous_plays: tuple[PlaybackIdentity, ...] = (), late_stop: bool = False) -> None:
        if self.overflow:
            return
        if key not in self.rows and len(self.rows) >= _MAX_MUTATIONS:
            self.rows.clear()
            self.overflow = True
            return
        previous = self.rows.get(key)
        prior = previous.prior if previous else {}
        truncated = bool(previous and previous.prior_overflow)
        stop_overflow = bool(previous and previous.stop_overflow)
        proofs = (*previous_plays, identity) if fields is None else previous_plays
        for play in proofs:
            stopped = fields is None and play == identity
            if play in prior or len(prior) < _MAX_PRIOR_PLAYS:
                prior[play] = stopped or prior.get(play, False)
            else:
                truncated = True
                stop_overflow |= stopped
        if late_stop:
            # Negative evidence about the REST row, not a mutation of the
            # active row. Keep any coalesced fields for that active play.
            self.rows[key] = (previous._replace(prior_overflow=truncated, stop_overflow=stop_overflow)
                              if previous else _RowChange({}, False, False, PlaybackIdentity(),
                                                           prior, truncated, stop_overflow))
            return
        if fields is None:
            self.rows[key] = _RowChange(None, True, False, identity, prior, truncated, stop_overflow)
        else:
            compatible = previous is not None and not previous.identity.incompatible(identity)
            keep = compatible and previous.fields is not None and not (replace or new_play)
            if keep:
                previous.fields.update(fields)
            self.rows[key] = _RowChange(
                previous.fields if keep else dict(fields),
                replace or bool(previous and previous.replace),
                new_play or bool(previous and previous.new_play),
                previous.identity.continued_with(identity) if keep else identity, prior, truncated, stop_overflow,
            )

    def merge(self, incoming: dict[str, dict], live: dict[str, dict]) -> dict[str, dict]:
        if self.overflow:
            # Never partially protect a snapshot. Retry at the next REST cycle.
            return live
        for key, change in self.rows.items():
            fetched = incoming.get(key)
            rest = PlaybackIdentity.from_row(fetched) if self.streams and fetched is not None else None
            if rest is not None and change.excludes(rest):
                # Reject this GET's row, not the ID. A distinct live play can
                # survive an obsolete snapshot even without a concurrent start.
                if key in live:
                    incoming[key] = live[key]
                else:
                    incoming.pop(key, None)
                continue
            if change.fields:
                # After stop/start the live row belongs to the new incarnation;
                # the in-flight REST row may still describe the stopped one.
                current = live.get(key)
                base = current if change.replace or fetched is None else fetched
                fields = change.fields
                if rest is not None:
                    known = change.identity
                    same_media = known.same_media(rest)
                    music = "track" in (known.media_type, rest.media_type)
                    boundary = change.new_play or change.replace
                    if boundary and music:
                        distinct_from_prior = not change.prior_overflow and all(
                            play.incompatible(rest) for play in change.prior
                        )
                        if same_media is True and not known.different_start(rest) and distinct_from_prior:
                            base = fetched
                        elif current is not None:
                            base = {**current, **(stream_join_fields(fetched) if same_media is True else {})}
                    elif boundary and known.other_server(rest):
                        base = current
                    elif not boundary and (known.other_server(rest) or (
                        (music or any(change.prior.values())) and known.incompatible(rest)
                    )):
                        # Never move a delta onto a different server or known track/play.
                        continue
                    if music and same_media is True and fields.get("media_id") is None and base and base.get("media_id"):
                        fields = {key: value for key, value in fields.items() if key != "media_id"}
                if base is not None:  # Progress/health alone cannot create a row.
                    incoming[key] = {**base, **fields}
        return incoming


class _StoppedPlays:
    """Short, bounded protection against identifiable retired SSE incarnations."""

    def __init__(self) -> None:
        self.rows: OrderedDict[str, list[tuple[float, PlaybackIdentity]]] = OrderedDict()

    def recent(self, key: str, now: float) -> list[tuple[float, PlaybackIdentity]]:
        # IDs are ordered by latest insertion. Prune entire expired buckets;
        # individual older entries of a still-active bucket are ignored.
        while self.rows and next(iter(self.rows.values()))[-1][0] <= now:
            self.rows.popitem(last=False)
        return [item for item in self.rows.get(key, ()) if item[0] > now]

    def remember(self, key: str, identity: PlaybackIdentity, now: float) -> None:
        recent = [(due, play) for due, play in self.recent(key, now) if play != identity]
        self.rows[key] = (recent + [(now + _STOP_TTL, identity)])[-_MAX_PRIOR_PLAYS:]
        self.rows.move_to_end(key)
        if len(self.rows) > _MAX_STOPPED_IDS:
            self.rows.popitem(last=False)


class TracearrCoordinator(DataUpdateCoordinator[dict]):
    """Maintains one data cache, resilient to SSE gaps and reconnects."""

    def __init__(self, hass: HomeAssistant, client: TracearrClient) -> None:
        super().__init__(hass, _LOGGER, name="Tracearr HA", update_interval=None)
        self.client = client
        self.streams: dict[str, dict] = {}
        self._stream_identities: dict[str, PlaybackIdentity] = {}
        self._stopped_plays = _StoppedPlays()
        self.servers: dict[str, dict] = {}
        self.connected = False
        self.sse_connected = False
        self._streams_reconciled = False
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
                self._stream_changes = _RefreshChanges(streams=True)
                try:
                    response = await self.client.streams()
                    self._server_changes = _RefreshChanges()
                    server_response = await self.client.servers()
                    try:
                        streams = snapshot_rows(response)
                        servers = snapshot_rows(server_response, servers=True)
                    except ValueError as exc:
                        raise TracearrUnavailable(str(exc)) from None
                    streams = self._stream_changes.merge(streams, self.streams)
                    servers = self._server_changes.merge(servers, self.servers)
                    reconciled = not self._stream_changes.overflow
                    last_sync = time.time()
                    # Prepare the published data (including stats) before
                    # committing either cache. No await in this section.
                    data = self._snapshot(streams, servers, True, reconciled, last_sync)
                    self._stream_identities = {
                        key: (self._stream_identities.get(key, PlaybackIdentity())
                              .continued_with(PlaybackIdentity.from_row(row)))
                        for key, row in streams.items()
                    }
                    self.streams, self.servers = streams, servers
                    self._streams_reconciled = reconciled
                    self.connected = True
                    self.last_sync = last_sync
                    return data
                finally:
                    self._stream_changes = self._server_changes = None
        except (TracearrUnavailable, TracearrAuthError) as exc:
            self.connected = False
            # HA retains the existing data on managed failures, but listeners must
            # see REST connectivity change alongside the still-live cache.
            self.data = self.snapshot()
            if isinstance(exc, TracearrAuthError):
                raise ConfigEntryAuthFailed("Tracearr API key invalid or unauthorized") from None
            raise UpdateFailed(str(exc)) from exc
        finally:
            self._refresh_tasks.discard(task)

    def snapshot(self) -> dict:
        return self._snapshot(self.streams, self.servers, self.connected, self._streams_reconciled, self.last_sync)

    def _snapshot(self, streams, servers, connected, reconciled, last_sync) -> dict:
        return {
            "streams": list(streams.values()),
            "servers": list(servers.values()),
            "stats": stats(streams),
            "connected": connected,
            "sse_connected": self.sse_connected,
            "streams_stale": not self.sse_connected and (not connected or not reconciled),
            "last_sync": last_sync,
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
        self._stream_identities.clear()
        self._stopped_plays.rows.clear()
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
                    and self.connected and self.last_update_success and self._streams_reconciled):
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
        mutation = stream_mutation(self.streams, event, self._stream_identities)
        if mutation is None:
            return
        changes = self._stream_changes
        key = mutation.key
        current = self.streams.get(key)
        previous = self._stream_identities.get(key) or PlaybackIdentity.from_row(current or {})
        identity = mutation.identity or PlaybackIdentity()
        now = time.monotonic()
        retired = self._stopped_plays.recent(key, now)
        window = changes.rows.get(key) if changes is not None else None
        was_stopped = window is not None and window.fields is None
        if mutation.kind == "stream.stopped":
            self._stopped_plays.remember(key, identity, now)
            if current is not None and previous.incompatible(identity):
                if changes is not None:
                    changes.record(key, None, identity=identity, late_stop=True)
                return
        else:
            if not previous.matches_stopped_play(identity) and (
                (window and window.stopped_match(identity))
                or any(play.matches_stopped_play(identity) for _, play in retired)
            ):
                return
            if mutation.kind != "stream.started":
                if was_stopped or (current is None and retired and not all(
                    play.incompatible(identity) for _, play in retired
                )):
                    return  # An ambiguous delta cannot reopen a recently retired ID.
                if window and window.stop_overflow and previous.incompatible(identity):
                    return  # Cannot rule out a forgotten stop. Wait for start or REST.
        reopen = mutation.kind == "stream.started" and current is None and bool(retired)
        if mutation.fields is None:
            self._stream_identities.pop(key, None)
        elif mutation.kind != "stream.progress":
            self._stream_identities[key] = identity if mutation.new_play or reopen else previous.continued_with(identity)
        if changes is not None:
            scope = identity if mutation.new_play or reopen else previous.continued_with(identity)
            prior = ()
            if reopen:
                prior = tuple(play for _, play in retired)
            elif mutation.new_play and current is not None:
                prior = (previous,)
            changes.record(key, mutation.fields, replace=was_stopped or reopen,
                           new_play=mutation.new_play, identity=scope, previous_plays=prior)
        if mutation.apply(self.streams, previous):
            self._emit()
