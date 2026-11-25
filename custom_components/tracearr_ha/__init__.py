"""Tracearr HA integration entry point."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .api import TracearrClient
from .const import CONF_TOKEN, CONF_URL, DOMAIN, EVENT_SIGNAL
from .coordinator import TracearrCoordinator
from .frontend import async_register_frontend
from .websocket import async_register_ws

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

PLATFORMS = ["sensor", "binary_sensor"]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    hass.data.setdefault(DOMAIN, {})
    async_register_ws(hass)
    await async_register_frontend(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    client = TracearrClient(async_get_clientsession(hass), entry.data[CONF_URL], entry.data[CONF_TOKEN])
    coordinator = TracearrCoordinator(hass, client)
    await coordinator.async_config_entry_first_refresh()
    entries = hass.data[DOMAIN]
    entries[entry.entry_id] = coordinator

    @callback
    def notify_subscribers() -> None:
        # stop() may still emit from the old SSE task's finally block.
        if entries.get(entry.entry_id) is coordinator:
            async_dispatcher_send(hass, EVENT_SIGNAL)

    notify_subscribers()  # The first REST snapshot is now available.
    try:
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    except BaseException:
        # The entry was visible while platforms loaded, even if setup failed.
        _withdraw(hass, entry.entry_id)
        raise
    entry.async_on_unload(coordinator.async_add_listener(notify_subscribers))
    coordinator.start()
    entry.async_on_unload(entry.add_update_listener(_options_updated))
    return True


async def _options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    coordinator = hass.data[DOMAIN].get(entry.entry_id)
    if coordinator:
        coordinator._emit()


@callback
def _withdraw(hass: HomeAssistant, entry_id: str) -> TracearrCoordinator:
    """Remove the source before notifying subscribers or cancelling its tasks."""
    coordinator = hass.data[DOMAIN].pop(entry_id)
    async_dispatcher_send(hass, EVENT_SIGNAL)
    return coordinator


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    if not await hass.config_entries.async_unload_platforms(entry, PLATFORMS):
        return False
    coordinator = _withdraw(hass, entry.entry_id)
    await coordinator.stop()
    return True
