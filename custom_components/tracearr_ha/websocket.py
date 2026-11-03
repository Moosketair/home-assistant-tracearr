"""Authenticated Home Assistant WebSocket feed for Lovelace cards."""
from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import callback

from .const import CONF_ALIASES, CONF_AVATARS, CONF_NETWORK_LOCATIONS, DOMAIN


def _payload(hass) -> dict[str, Any]:
    entries = []
    for entry in hass.config_entries.async_entries(DOMAIN):
        coordinator = hass.data.get(DOMAIN, {}).get(entry.entry_id)
        if not coordinator:
            continue
        data = coordinator.snapshot()
        entries.append({
            "id": entry.entry_id,
            "name": entry.title,
            "aliases": entry.options.get(CONF_ALIASES, {}),
            "avatars": entry.options.get(CONF_AVATARS, {}),
            "network_locations": entry.options.get(CONF_NETWORK_LOCATIONS, {}),
            **data,
        })
    return {"entries": entries}


@websocket_api.websocket_command({vol.Required("type"): "tracearr_ha/get"})
@callback
def ws_get(hass, connection, msg):
    connection.send_result(msg["id"], _payload(hass))


@websocket_api.websocket_command({vol.Required("type"): "tracearr_ha/subscribe"})
@callback
def ws_subscribe(hass, connection, msg):
    unsubscribers = []

    @callback
    def send():
        connection.send_message(websocket_api.event_message(msg["id"], _payload(hass)))

    for coordinator in hass.data.get(DOMAIN, {}).values():
        unsubscribers.append(coordinator.async_add_listener(send))

    @callback
    def unsubscribe():
        for fn in unsubscribers:
            fn()

    connection.subscriptions[msg["id"]] = unsubscribe
    connection.send_result(msg["id"])
    send()


def async_register_ws(hass):
    websocket_api.async_register_command(hass, ws_get)
    websocket_api.async_register_command(hass, ws_subscribe)
