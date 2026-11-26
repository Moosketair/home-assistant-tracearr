"""A6 publication: option-only snapshots preserve live sessions and HA totals."""
import asyncio
from copy import deepcopy
import json

import pytest

from homeassistant.helpers import entity_registry as er

from core import DOMAIN, core, observed
from simulateur import Tracearr
from spec_race import held


def test_network_json_round_trip_explicit_unknown():
    async def run():
        async with Tracearr().serve() as sim, core() as b:
            sim.change("started", "tv", device="tv")
            entry = await b.add(sim)
            plex, jellyfin, _ = [row["server_id"] for row in sim.servers]
            key = f"{plex}:device:tv"
            original = {f"server:{plex}": "remote", f"server:{jellyfin}": "local"}
            other_options = {"aliases": {"fixture": "Recette"}, "avatars": {},
                             "future_option": {"keep": True}}
            entries = b.hass.config_entries
            assert entries.async_update_entry(entry, options={**other_options, "network_locations": original})
            options = entries.options

            async def open_step(*steps):
                form = await options.async_init(entry.entry_id)
                for step in steps:
                    assert form["type"] == "menu"
                    form = await options.async_configure(form["flow_id"], {"next_step_id": step})
                assert form["type"] == "form"
                return form

            async def submit(form, data):
                return await options.async_configure(form["flow_id"], data)

            table = await open_step("devices_table", "devices_plex")
            label = next(label for label in table["data_schema"]({}) if "tv (appareil)" in label)
            assert table["data_schema"]({})[label] == "remote"
            assert (await submit(table, {label: "unknown"}))["type"] == "create_entry"
            saved = {**original, key: "unknown"}
            assert entry.options == {**other_options, "network_locations": saved}

            editor = await open_step("advanced", "network_json")
            prefilled = editor["data_schema"]({})["network_locations"]
            assert json.loads(prefilled) == saved
            assert (await submit(editor, {"network_locations": prefilled}))["type"] == "create_entry"
            table = await open_step("devices_table", "devices_plex")
            assert table["data_schema"]({})[label] == "unknown"
            options.async_abort(table["flow_id"])
            assert entry.options == {**other_options, "network_locations": saved}

            editor = await open_step("advanced", "network_json")
            assert (await submit(editor, {"network_locations": json.dumps(original)}))["type"] == "create_entry"
            table = await open_step("devices_table", "devices_plex")
            assert table["data_schema"]({})[label] == "remote"
            options.async_abort(table["flow_id"])
            assert entry.options == {**other_options, "network_locations": original}

    asyncio.run(run())


@pytest.mark.parametrize("value", ['[]', '{"":"local"}', '{"device:tv":null}', '{"device:tv":"other"}'])
def test_network_json_still_rejects_invalid_mapping(value):
    async def run():
        async with Tracearr().serve() as sim, core() as b:
            entry = await b.add(sim)
            options = b.hass.config_entries.options
            menu = await options.async_init(entry.entry_id)
            fid = menu["flow_id"]
            await options.async_configure(fid, {"next_step_id": "advanced"})
            await options.async_configure(fid, {"next_step_id": "network_json"})
            before = entry.options
            result = await options.async_configure(fid, {"network_locations": value})
            assert result["errors"] == {"base": "invalid_json"}
            assert entry.options == before
            options.async_abort(fid)

    asyncio.run(run())


def test_network_options_publish_without_refresh_and_survive_rest_sse():
    async def run():
        async with Tracearr().serve() as sim, Tracearr().serve() as other, core() as b, b.connect() as ws:
            other.servers[0]["server_id"] = "other-plex"
            for name, server, bitrate in [("tv", 0, 1000), ("tablet", 0, 2000), ("box", 1, 4000), ("web", 2, 8000)]:
                sim.change("started", name, server=server, device=name, bitrate=bitrate)
            other.change("started", "other-tv", device="tv")
            entry, second = await b.add(sim), await b.add(other)
            coord, second_coord = b.coord(entry), b.coord(second)
            plex, jellyfin, emby = [row["server_id"] for row in sim.servers]
            registry = er.async_get(b.hass)
            entries = b.hass.config_entries
            other_options = {"network_locations": {f"server:{plex}": "remote", "server:other-plex": "local"}}
            entries.async_update_entry(second, options=other_options)
            await b.hass.async_block_till_done()
            await ws.call("tracearr_ha/subscribe")
            sub = ws.seq
            initial, = await ws.snapshots(sub)
            other_row, = [r for r in initial if r["id"] == second.entry_id]
            other_data = second_coord.data
            initial_streams = deepcopy(coord.streams)
            initial_stats = dict(coord.data["stats"])

            def check(snapshot, rules, total=15):
                rows = {r["id"]: r for r in snapshot}
                assert set(rows) == {entry.entry_id, second.entry_id}
                assert rows[second.entry_id] == other_row
                assert second_coord.data is other_data
                row = rows[entry.entry_id]
                assert row["network_locations"] == rules
                assert row["aliases"] == {"fixture": "Recette"}
                assert row["avatars"] == {"fixture": "https://example.invalid/avatar.png"}
                assert {s["id"]: s for s in row["streams"]} == sim.streams
                assert row["stats"] == coord.data["stats"] == {**initial_stats, "bandwidth_mbps": total}
                assert (row["stats"]["total"], row["stats"]["bandwidth_mbps"]) == (4, total)
                assert b.coord(entry) is coord

                def sensor(key):
                    entity_id = registry.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_{key}")
                    return float(b.hass.states.get(entity_id).state)

                assert (sensor("total"), sensor("bandwidth_mbps")) == (4, total)
                assert [sensor(f"{sid}_streams") for sid in (plex, jellyfin, emby)] == [2, 1, 1]

            async def save(rules):
                options = {"network_locations": rules, "aliases": {"fixture": "Recette"},
                           "avatars": {"fixture": "https://example.invalid/avatar.png"}}
                previous_data = coord.data
                assert entries.async_update_entry(entry, options=options)
                await observed(coord, lambda: coord.data is not previous_data)
                update, = await ws.snapshots(sub)
                check(update, rules)
                assert coord.streams == initial_streams

            device_key = f"{plex}:device:tv"
            base = {f"server:{plex}": "remote", f"server:{jellyfin}": "local"}
            local = {**base, device_key: "local"}
            await save(local)
            await save({**local, device_key: "remote"})
            await save(local)
            # The REST response is already captured. Publish the server rule,
            # then an SSE bitrate change, without waiting for that response.
            bulk = {**base, f"server:{plex}": "local"}
            async with held(sim, coord):
                await save(bulk)
                sim.change("progress", "tv", bitrate=3000)
                await observed(coord, lambda: coord.streams["tv"]["bitrate"] == 3000)
                live, = await ws.snapshots(sub)
                check(live, bulk, total=17)
            synced, = await ws.snapshots(sub)
            check(synced, bulk, total=17)
            check((await ws.call("tracearr_ha/get"))["entries"], bulk, total=17)

    asyncio.run(run())
