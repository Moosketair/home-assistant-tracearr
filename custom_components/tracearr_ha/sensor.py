"""Tracearr global statistics sensors."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.const import UnitOfDataRate
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN

STAT_TYPES = {
    "total": ("Active streams", "mdi:play-network", None),
    "playing": ("Playing streams", "mdi:play", None),
    "paused": ("Paused streams", "mdi:pause", None),
    "direct": ("Direct streams", "mdi:video-check", None),
    "video": ("Video-only transcodes", "mdi:filmstrip", None),
    "audio": ("Audio-only transcodes", "mdi:music-note", None),
    "both": ("Video and audio transcodes", "mdi:video-wireless", None),
    "transcodes": ("Total transcodes", "mdi:swap-horizontal", None),
    "unknown": ("Unknown playback decision", "mdi:help-network", None),
    "bandwidth_mbps": ("Stream bandwidth", "mdi:speedometer", "Mbit/s"),
}

async def async_setup_entry(hass, entry, async_add_entities):
    coordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([TracearrStatsSensor(coordinator, entry, key) for key in STAT_TYPES])
    known: set[str] = set()

    def add_servers():
        created = []
        for server in coordinator.servers.values():
            sid = server["server_id"]
            if sid not in known:
                known.add(sid)
                created.append(TracearrServerStreams(coordinator, entry, sid))
        if created:
            async_add_entities(created)

    add_servers()
    entry.async_on_unload(coordinator.async_add_listener(add_servers))


class TracearrStatsSensor(CoordinatorEntity, SensorEntity):
    _attr_has_entity_name = True
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry, key):
        super().__init__(coordinator)
        self.key = key
        name, icon, unit = STAT_TYPES[key]
        self._attr_name = name
        self._attr_icon = icon
        self._attr_native_unit_of_measurement = unit
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_device_info = {"identifiers": {(DOMAIN, entry.entry_id)}, "name": "Tracearr", "manufacturer": "Tracearr", "model": "Public API v2"}

    @property
    def native_value(self):
        return (self.coordinator.data or {}).get("stats", {}).get(self.key)

    @property
    def available(self):
        return self.coordinator.connected and self.coordinator.last_update_success


class TracearrServerStreams(CoordinatorEntity, SensorEntity):
    """Number of active streams per media server."""
    _attr_has_entity_name = True
    _attr_name = "Active streams"
    _attr_icon = "mdi:play-network"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator, entry, server_id):
        super().__init__(coordinator)
        self.server_id = server_id
        self._attr_unique_id = f"{entry.entry_id}_{server_id}_streams"
        server = coordinator.servers.get(server_id, {})
        self._attr_device_info = {"identifiers": {(DOMAIN, server_id)}, "name": server.get("server_name", "Media server"), "manufacturer": "Tracearr", "model": server.get("server_type", "Media server")}

    @property
    def native_value(self):
        return sum(s.get("server_id") == self.server_id for s in self.coordinator.streams.values())

    @property
    def available(self):
        return self.coordinator.connected and self.coordinator.last_update_success
