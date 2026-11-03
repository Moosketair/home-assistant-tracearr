"""Constants for Tracearr HA."""
from __future__ import annotations

DOMAIN = "tracearr_ha"
CONF_URL = "url"
CONF_TOKEN = "token"
CONF_ALIASES = "aliases"
CONF_AVATARS = "avatars"
EVENT_SIGNAL = f"{DOMAIN}_update"
DEFAULT_TIMEOUT = 15
FRONTEND_URL = f"/tracearr_ha/tracearr-card.js"
IMAGE_URL = "/api/tracearr_ha/image/{entry_id}/{session_id}/{kind}"
