"""Tracearr connectivity and per-server health."""
from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity, BinarySensorDeviceClass
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([TracearrConnected(coordinator, entry)])
    known: set[str] = set()

    def add_servers():
        created = []
        for server in coordinator.servers.values():
            sid = server["server_id"]
            if sid not in known:
                known.add(sid)
                created.append(TracearrServerOnline(coordinator, entry, sid))
        if created:
            async_add_entities(created)

    add_servers()
    entry.async_on_unload(coordinator.async_add_listener(add_servers))


class TracearrConnected(CoordinatorEntity, BinarySensorEntity):
    _attr_has_entity_name = True
    _attr_name = "Connected"
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY

    def __init__(self, coordinator, entry):
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_connected"
        self._attr_device_info = {"identifiers": {(DOMAIN, entry.entry_id)}, "name": "Tracearr", "manufacturer": "Tracearr", "model": "Public API v2"}

    @property
    def is_on(self):
        return self.coordinator.connected

    @property
    def available(self):
        return True


class TracearrServerOnline(CoordinatorEntity, BinarySensorEntity):
    """Media server availability reported by Tracearr."""
    _attr_has_entity_name = True
    _attr_name = "Online"
    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY

    def __init__(self, coordinator, entry, server_id):
        super().__init__(coordinator)
        self.server_id = server_id
        self._attr_unique_id = f"{entry.entry_id}_{server_id}_online"
        server = coordinator.servers.get(server_id, {})
        self._attr_device_info = {"identifiers": {(DOMAIN, server_id)}, "name": server.get("server_name", "Media server"), "manufacturer": "Tracearr", "model": server.get("server_type", "Media server")}

    @property
    def is_on(self):
        status = self.coordinator.servers.get(self.server_id, {}).get("status")
        return True if status == "up" else False if status == "down" else None

    @property
    def available(self):
        return self.coordinator.connected and self.coordinator.last_update_success
