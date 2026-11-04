"""Expose the bundled dashboard cards and a credential-protected image proxy."""
from __future__ import annotations

from pathlib import Path
from urllib.parse import urlsplit

from aiohttp import ClientError, ClientTimeout, web
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.components.http import KEY_HASS

from .const import DOMAIN, FRONTEND_URL


async def async_register_frontend(hass):
    path = str(Path(__file__).parent / "frontend" / "tracearr-card.js")
    await hass.http.async_register_static_paths([StaticPathConfig(FRONTEND_URL, path, False)])
    hass.http.register_view(TracearrArtworkView())
    # Register as a Lovelace resource in storage mode, so loading is ordered
    # after the Home Assistant UI's custom-elements registry is initialized.
    # Unlike add_extra_js_url, this avoids a race observed in some 2026 HA builds.
    lovelace = hass.data.get("lovelace")
    # Home Assistant 2026 exposes resource_mode, not mode, on LovelaceData.
    # Keep the older attribute as a fallback for previous Core versions.
    resource_mode = (
        getattr(lovelace, "resource_mode", None)
        or getattr(lovelace, "mode", None)
    )
    if resource_mode == "storage":
        resources = lovelace.resources
        if not resources.loaded:
            await resources.async_load()
        base_path = FRONTEND_URL
        wanted = FRONTEND_URL + "?v=0.1.10"
        existing = [item for item in resources.async_items() if item["url"].split("?")[0] == base_path]
        if not existing:
            await resources.async_create_item({"res_type": "module", "url": wanted})
        elif existing[0]["url"] != wanted:
            await resources.async_update_item(existing[0]["id"], {"res_type": "module", "url": wanted})
    # YAML-managed Lovelace resources are read-only and must be added manually.


class TracearrArtworkView(HomeAssistantView):
    """Serve only images referenced by an active stream, never arbitrary URLs."""
    url = "/api/tracearr_ha/image/{entry_id}/{session_id}/{kind}"
    name = "api:tracearr_ha:image"
    requires_auth = True

    async def get(self, request, entry_id, session_id, kind):
        if kind not in ("poster", "avatar"):
            return web.Response(status=404)
        hass = request.app[KEY_HASS]
        coord = hass.data.get(DOMAIN, {}).get(entry_id)
        if not coord:
            return web.Response(status=404)
        item = coord.streams.get(session_id)
        if not item:
            return web.Response(status=404)
        uri = item.get("poster_url" if kind == "poster" else "user_avatar_url")
        if not isinstance(uri, str) or not uri:
            return web.Response(status=404)
        parsed = urlsplit(uri)
        origin = urlsplit(coord.client.base_url)
        # Prevent SSRF: fetch only Tracearr's own image-proxy endpoint.
        if parsed.scheme and (parsed.scheme, parsed.netloc) != (origin.scheme, origin.netloc):
            return web.Response(status=404)
        if parsed.path != "/api/v1/images/proxy":
            return web.Response(status=404)
        url = f"{coord.client.base_url}{parsed.path}?{parsed.query}"
        try:
            async with coord.client.session.get(url, headers=coord.client.headers,
                    timeout=ClientTimeout(total=12), allow_redirects=False) as response:
                if response.status != 200:
                    return web.Response(status=404)
                data = await response.content.read(2_000_001)
                if len(data) > 2_000_000:
                    return web.Response(status=413)
                content_type = response.headers.get("Content-Type", "")
                safe_type = content_type.split(";", 1)[0].strip().lower()
                if safe_type not in ("image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"):
                    return web.Response(status=415)
                return web.Response(body=data, content_type=safe_type,
                                    headers={"Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff"})
        except (ClientError, TimeoutError):
            return web.Response(status=502)
