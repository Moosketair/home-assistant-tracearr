"""Create a synthetic Tracearr entry and Sections dashboard using the real HA APIs."""
import json
import sys

import requests

from simulateur import KEY

BASE = "http://127.0.0.1:18424"
USER = "recette"
PASSWORD = "Tracearr-fixture-only-42!"
SERVER = "00000000-0000-4000-8000-000000000001"
FLOW = "/api/config/config_entries/flow"
OPTIONS = "/api/config/config_entries/options/flow"


def dashboard(entry):
    common = {
        "entry_id": entry, "show_bitrate": True, "show_poster": False,
        "grid_options": {"rows": "auto"},
        "header_show_bandwidth": True, "header_show_paused": True,
        "header_metric_settings": {"streams": {
            "align": "center", "blink_positive": True, "blink_seconds": 3,
        }},
        "header_badge_color_mode": "custom", "header_badge_custom_color": "#006c7a",
    }
    cards = [
        dict(common, type="custom:tracearr-streams-card", title="Tracearr · Liste LAN",
             bitrate_scope="local", show_counter=True),
        dict(common, type="custom:tracearr-streams-card", title="Tracearr · Carrousel WAN",
             mode="carousel", bitrate_scope="remote"),
        dict(common, type="custom:tracearr-stream-card", title="Tracearr · Alice",
             selection="account", selected_account=f"{SERVER}:alice"),
    ]
    return {"views": [{"title": "Recette", "type": "sections", "path": "recette",
                       "max_columns": 2, "sections": [
                           {"type": "grid", "cards": cards[:2]},
                           {"type": "grid", "cards": cards[2:]},
                       ]}]}


def bootstrap(config):
    """Create the real HA account without enabling default/cloud onboarding integrations."""
    import asyncio
    from pathlib import Path

    import aiohttp

    def call(path, **data):
        response = requests.post(BASE + path, timeout=20, **data)
        response.raise_for_status()
        return response.json()

    code = call("/api/onboarding/users", json={
        "name": "Recette fictive", "username": USER, "password": PASSWORD,
        "client_id": BASE + "/", "language": "fr",
    })["auth_code"]
    tokens = call("/auth/token", data={
        "grant_type": "authorization_code", "code": code, "client_id": BASE + "/",
    })
    headers = {"Authorization": "Bearer " + tokens["access_token"]}
    flow = call(FLOW, headers=headers, json={"handler": "tracearr_ha"})
    result = call(f"{FLOW}/{flow['flow_id']}", headers=headers,
                  json={"url": "http://127.0.0.1:18425", "token": KEY})
    assert result["type"] == "create_entry", result.get("errors")
    entry = result["result"]["entry_id"]
    flow = call(OPTIONS, headers=headers, json={"handler": entry})
    target = f"{OPTIONS}/{flow['flow_id']}"
    for option in ("advanced", "network_json"):
        call(target, headers=headers, json={"next_step_id": option})
    result = call(target, headers=headers, json={"network_locations": json.dumps({
        "plex:alice": "local", "jellyfin:bob": "remote",
    })})
    assert result["type"] == "create_entry", result.get("errors")

    async def save():
        async with aiohttp.ClientSession() as session, session.ws_connect(
            BASE + "/api/websocket"
        ) as ws:
            assert (await ws.receive_json())["type"] == "auth_required"
            await ws.send_json({"type": "auth", "access_token": tokens["access_token"]})
            assert (await ws.receive_json())["type"] == "auth_ok"

            sequence = 0

            async def cmd(kind, **data):
                nonlocal sequence
                sequence += 1
                await ws.send_json({"id": sequence, "type": kind, **data})
                value = await ws.receive_json(timeout=15)
                assert value["success"], (kind, value.get("error"))
                return value["result"]

            await cmd("config_entries/update", entry_id=entry, title="Tracearr de recette")
            entities = await cmd("config/entity_registry/list")
            entity = next(row["entity_id"] for row in entities if row["config_entry_id"] == entry)
            await cmd("config/entity_registry/update", entity_id=entity, name="Capteur personnalisé")
            await cmd("lovelace/dashboards/create", url_path="tracearr-recette",
                      title="Tracearr de recette", show_in_sidebar=True,
                      require_admin=False)
            await cmd("lovelace/config/save", url_path="tracearr-recette", config=dashboard(entry))

    asyncio.run(save())
    # Only IDs, never the HA access/refresh token or the API key.
    (Path(config) / "seed.json").write_text(json.dumps({"entry": entry}))


if __name__ == "__main__":
    bootstrap(sys.argv[1])
