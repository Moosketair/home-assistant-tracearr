"""Tracearr HA integration entry point."""
from __future__ import annotations

import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import TracearrClient
from .const import CONF_TOKEN, CONF_URL, DOMAIN
from .coordinator import TracearrCoordinator
from .lifecycle import EntryGeneration, finish_cleanup
from .frontend import async_register_frontend
from .websocket import async_register_ws

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

PLATFORMS = ["sensor", "binary_sensor"]
_LOGGER = logging.getLogger(__name__)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    async_register_ws(hass)
    await async_register_frontend(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    client = TracearrClient(async_get_clientsession(hass), entry.data[CONF_URL], entry.data[CONF_TOKEN])
    coordinator = TracearrCoordinator(hass, client)
    generation = entry.runtime_data = EntryGeneration(hass, entry, coordinator)
    try:
        await coordinator.async_config_entry_first_refresh()
        hass.data[DOMAIN][entry.entry_id] = coordinator
        generation.notify()
        for domain in PLATFORMS:
            await generation.forward(domain)
        generation.callbacks.callback(coordinator.async_add_listener(generation.notify))
        coordinator.start()

        async def options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
            if hass.data[DOMAIN].get(entry.entry_id) is coordinator:
                coordinator._emit()

        generation.callbacks.callback(entry.add_update_listener(options_updated))
    except BaseException:
        try:
            await finish_cleanup(generation.close())
        except Exception:
            _LOGGER.exception("Secondary error rolling back Tracearr setup")
        raise
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    return await finish_cleanup(entry.runtime_data.unload())


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """HA also calls this after deleting an entry whose unload was refused."""
    if generation := getattr(entry, "runtime_data", None):
        await finish_cleanup(generation.close())
