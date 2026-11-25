"""Resources owned by one setup of a Tracearr config entry."""
from __future__ import annotations

import asyncio
from collections.abc import Callable, Coroutine
from contextlib import AsyncExitStack, ExitStack
import logging
from typing import Any, TypeVar

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.entity_platform import async_get_platforms

from .const import DOMAIN, EVENT_SIGNAL
from .coordinator import TracearrCoordinator

_LOGGER = logging.getLogger(__name__)
_T = TypeVar("_T")


async def finish_cleanup(work: Coroutine[Any, Any, _T]) -> _T:
    """Hold HA's entry lock until cleanup finishes, even on repeated cancellation."""
    task = asyncio.create_task(work)
    cancelled = None
    while not task.done():
        try:
            await asyncio.shield(task)
        except asyncio.CancelledError as exc:
            cancelled = exc
        except Exception:
            break  # Retrieve the exception below.
    if cancelled is not None:
        try:
            task.result()
        except Exception:
            _LOGGER.exception("Tracearr cleanup also failed during cancellation")
        raise cancelled
    return task.result()


class EntryGeneration:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, coordinator: TracearrCoordinator):
        self.hass = hass
        self.entry = entry
        self.coordinator = coordinator
        self.callbacks = ExitStack()
        self.platforms: set[str] = set()
        self.discovery: dict[str, Callable[[], None]] = {}

    @callback
    def notify(self) -> None:
        if self.hass.data[DOMAIN].get(self.entry.entry_id) is self.coordinator:
            async_dispatcher_send(self.hass, EVENT_SIGNAL)

    async def forward(self, domain: str) -> None:
        # HA can allocate the EntityPlatform and catch a setup error internally.
        # The older Core also lists reset platform objects. Count only NEW ones.
        before = set(async_get_platforms(self.hass, DOMAIN))
        try:
            await self.hass.config_entries.async_forward_entry_setups(self.entry, [domain])
        finally:
            if any(p not in before and p.config_entry is self.entry and p.domain == domain
                   for p in async_get_platforms(self.hass, DOMAIN)):
                self.platforms.add(domain)
        if domain not in self.discovery:
            raise RuntimeError(f"Tracearr platform {domain} did not complete setup")

    async def unload_platforms(self) -> bool:
        # Keep failed domains for the definitive-remove hook. Make progress on
        # the others even if one HA platform refuses or raises.
        for domain in sorted(self.platforms):
            try:
                unloaded = await self.hass.config_entries.async_unload_platforms(self.entry, [domain])
            except Exception:
                _LOGGER.exception("Error unloading Tracearr platform %s", domain)
                unloaded = False
            if unloaded:
                self.platforms.remove(domain)
                if remove := self.discovery.pop(domain, None):
                    remove()
        return not self.platforms

    async def _rollback_platforms(self) -> None:
        if getattr(self.entry, "runtime_data", None) is self and not await self.unload_platforms():
            _LOGGER.error("HA refused to unload Tracearr platforms %s", self.platforms)

    def _forget(self) -> None:
        if getattr(self.entry, "runtime_data", None) is self:
            del self.entry.runtime_data

    def _release_discovery(self) -> None:
        with ExitStack() as stack:
            while self.discovery:
                _, remove = self.discovery.popitem()
                stack.callback(remove)

    def close(self) -> Coroutine[Any, Any, None]:
        """Withdraw synchronously, even if the cleanup task has not run yet."""
        entries = self.hass.data[DOMAIN]
        if entries.get(self.entry.entry_id) is self.coordinator:
            del entries[self.entry.entry_id]
            async_dispatcher_send(self.hass, EVENT_SIGNAL)
        return self._release()

    async def _release(self) -> None:
        async with AsyncExitStack() as cleanup:
            # The caller holds the HA entry lock through the whole teardown.
            cleanup.callback(self._forget)
            cleanup.push_async_callback(self._rollback_platforms)
            cleanup.callback(self._release_discovery)
            cleanup.push_async_callback(self.coordinator.stop)
            self.callbacks.close()

    async def unload(self) -> bool:
        if not await self.unload_platforms():
            return False
        await self.close()
        return True
