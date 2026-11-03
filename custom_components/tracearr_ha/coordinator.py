"""REST snapshot + a single SSE stream for all Tracearr servers."""
from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Callable
from datetime import timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import TracearrAuthError, TracearrClient, TracearrRateLimited, TracearrUnavailable
from .model import apply_event, stats

_LOGGER = logging.getLogger(__name__)


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

    async def _async_update_data(self) -> dict:
        try:
            async with self._lock:
                response = await self.client.streams()
                server_response = await self.client.servers()
                self.streams = {s["id"]: s for s in response.get("data", []) if isinstance(s, dict) and isinstance(s.get("id"), str)}
                self.servers = {s["server_id"]: s for s in server_response.get("data", []) if isinstance(s, dict) and isinstance(s.get("server_id"), str)}
                self.connected = True
                self.last_sync = time.time()
                return self.snapshot()
        except (TracearrUnavailable, TracearrAuthError) as exc:
            self.connected = False
            raise UpdateFailed(str(exc)) from exc

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
        self.async_set_updated_data(self.snapshot())

    def start(self) -> None:
        self._sse_task = self.hass.async_create_background_task(self._sse_loop(), "Tracearr SSE", eager_start=False)
        self._poll_task = self.hass.async_create_background_task(self._poll_loop(), "Tracearr poll", eager_start=False)

    async def stop(self) -> None:
        tasks = [t for t in (self._sse_task, self._poll_task) if t is not None]
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _poll_loop(self) -> None:
        while True:
            await asyncio.sleep(60 if self.sse_connected else 15)
            await self.async_refresh()

    async def _sse_loop(self) -> None:
        retry = 5
        while True:
            try:
                async for event in self.client.events():
                    if event.get("type") == "ready":
                        # Event replay is not supported by Tracearr: always resync.
                        await self.async_refresh()
                        self.sse_connected = self.connected
                        self._emit()
                        retry = 5
                    elif event.get("type") == "server.health":
                        payload = event.get("data", {})
                        if isinstance(payload, dict):
                            server = self.servers.get(payload.get("server_id"))
                            if server:
                                server.update({k: payload[k] for k in ("status", "reason") if k in payload})
                                self._emit()
                    elif event.get("type", "").startswith("stream."):
                        if apply_event(self.streams, event):
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
                self.sse_connected = False
                self._emit()
            await asyncio.sleep(retry)
