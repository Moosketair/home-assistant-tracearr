"""A9: a rejected Tracearr key can be replaced without recreating the entry."""
import asyncio
from copy import deepcopy
import json
from unittest.mock import patch

import pytest

from homeassistant.config_entries import ConfigEntryState, UnknownEntry
from homeassistant.helpers import entity_registry as er
import voluptuous as vol

from custom_components.tracearr_ha.api import TracearrClient
from core import DOMAIN, core, observed
from simulateur import KEY, Gate, Tracearr

NEW_KEY = "trr_pub_replacement_fixture"
BAD_KEY = "trr_pub_invalid_fixture"


def reauth_flows(bench, entry):
    return list(entry.async_get_active_flows(bench.hass, {"reauth"}))


@pytest.mark.parametrize("loaded", [False, True], ids=["first_refresh", "loaded"])
def test_key_replacement_in_place(loaded, caplog):
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            sim.change("started", "tv")
            entries = b.hass.config_entries
            entry = await b.add(sim)
            old = b.coord(entry)
            original = (entry.entry_id, entry.unique_id, entry.title)
            options = {"aliases": {"fixture": "Recette"}, "future_option": {"keep": True}}
            assert entries.async_update_entry(entry, options=options, data={**entry.data, "future_data": True})
            await b.hass.async_block_till_done()
            registry = er.async_get(b.hass)
            entity_id = registry.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_total")
            entity = registry.async_update_entity(entity_id, name="Total personnalisé")

            await ws.call("tracearr_ha/subscribe")
            sub = ws.seq
            await ws.snapshots(sub)
            sim.key = NEW_KEY
            if loaded:
                # REST authorization can fail while the already-open SSE is healthy.
                sim.errors["streams"] = (403, {})
                await old.async_refresh()
                await old.async_refresh()
                await b.hass.async_block_till_done()
                failed, = await ws.snapshots(sub)
                assert (failed[0]["connected"], failed[0]["sse_connected"]) == (False, True)
                assert len(failed[0]["streams"]) == 1
                assert b.hass.states.get(entity_id).state == "unavailable"
                sim.errors.clear()
            else:
                # A stored key is rejected by the first refresh on the next setup.
                assert not await entries.async_reload(entry.entry_id)
                await b.hass.async_block_till_done()
                assert entry.entry_id not in b.hass.data[DOMAIN]
            active = reauth_flows(b, entry)
            assert len(active) == 1
            fid = active[0]["flow_id"]
            form = await entries.flow.async_configure(fid)
            assert form["type"] == "form"
            (field, control), = form["data_schema"].schema.items()
            assert field == "token" and field.default is vol.UNDEFINED
            assert control.serialize()["selector"]["text"]["type"] == "password"
            before = deepcopy(dict(entry.data))
            for invalid_key in (BAD_KEY, "  "):
                invalid = await entries.flow.async_configure(fid, {"token": invalid_key})
                assert invalid["errors"] == {"base": "invalid_auth"}
                assert entry.data == before
            for route, status, error in [("streams", 403, "invalid_auth"), ("servers", 503, "cannot_connect")]:
                # One working endpoint is not enough to recover a complete snapshot.
                sim.errors[route] = (status, {})
                rejected = await entries.flow.async_configure(fid, {"token": NEW_KEY})
                assert rejected["errors"] == {"base": error}
                assert entry.data == before
                sim.errors.clear()

            for route, payload in [
                ("servers", {}),
                ("streams", {}),
                ("streams", {"data": [sim.session("bad", bitrate="inexploitable")]}),
                ("servers", {"data": [{"server_id": []}]}),
                ("servers", {"data": [{"server_id": "bad", "server_name": ["inexploitable"]}]}),
            ]:
                sim.responses[route] = payload
                rejected = await entries.flow.async_configure(fid, {"token": NEW_KEY})
                assert (rejected["type"], rejected.get("errors")) == ("form", {"base": "cannot_connect"})
                assert entry.data == before and entry.options == options
                if loaded:
                    await b.hass.async_block_till_done()
                    assert entry.state == ConfigEntryState.LOADED and b.coord(entry) is old
                    row, = (await ws.call("tracearr_ha/get"))["entries"]
                    assert row["id"] == entry.entry_id and row["streams"][0]["id"] == "tv"
                    assert await ws.snapshots(sub) == []
                sim.responses.clear()

            result = await entries.flow.async_configure(fid, {"token": f" {NEW_KEY} "})
            assert (result["type"], result["reason"]) == ("abort", "reauth_successful")
            await b.hass.async_block_till_done()
            assert entry.state == ConfigEntryState.LOADED
            replacement = await b.ready(entry)
            assert replacement is not old
            assert old._sse_task.done() and old._poll_task.done()
            assert entries.async_entries(DOMAIN) == [entry]
            assert reauth_flows(b, entry) == []
            assert (entry.entry_id, entry.unique_id, entry.title) == original
            assert entry.data == {**before, "token": NEW_KEY}
            assert entry.options == options
            assert registry.async_get(entity_id) == entity
            assert b.hass.states.get(entity_id).state == "1"
            snapshots = await ws.snapshots(sub)
            assert [] in snapshots
            assert snapshots[-1][0]["connected"] and snapshots[-1][0]["sse_connected"]
            assert snapshots[-1][0]["id"] == entry.entry_id
            assert snapshots[-1][0]["aliases"] == options["aliases"]
            public_and_logs = json.dumps(snapshots) + caplog.text
            assert not any(key in public_and_logs for key in (KEY, BAD_KEY, NEW_KEY))

    asyncio.run(run())


def test_removing_entry_during_reauth_validation_does_not_write_or_reload():
    async def run():
        async with Tracearr().serve() as sim, core() as b:
            entries = b.hass.config_entries
            entry = await b.add(sim)
            sim.key = NEW_KEY
            await b.coord(entry).async_refresh()
            await b.hass.async_block_till_done()
            active, = reauth_flows(b, entry)
            gate = sim.gates["servers"] = Gate()
            pending = asyncio.create_task(entries.flow.async_configure(active["flow_id"], {"token": NEW_KEY}))
            try:
                await asyncio.wait_for(gate.entered.wait(), 5)
                await entries.async_remove(entry.entry_id)
            finally:
                gate.release.set()
            result = await asyncio.wait_for(pending, 5)
            assert (result["type"], result["reason"]) == ("abort", "reauth_entry_removed")
            assert entry.data["token"] == KEY
            assert entries.async_entries(DOMAIN) == []
            assert b.hass.data[DOMAIN] == {}

    asyncio.run(run())


def test_reauth_cannot_commit_while_native_removal_is_unloading():
    async def run():
        async with Tracearr().serve() as sim, core() as b:
            entries = b.hass.config_entries
            manager = type(entries)
            entry = await b.add(sim)
            before = dict(entry.data)
            sim.key = NEW_KEY
            await b.coord(entry).async_refresh()
            await b.hass.async_block_till_done()
            active, = reauth_flows(b, entry)
            rest = sim.gates["servers"] = Gate()
            platforms = Gate()
            response_read = asyncio.Event()
            late_reload_errors = []
            read_servers = TracearrClient.servers
            unload = manager.async_forward_entry_unload
            reload = manager.async_reload

            async def read(client):
                response = await read_servers(client)
                response_read.set()
                return response

            async def held_unload(ce, target, domain):
                if target is entry and domain == "binary_sensor":
                    await platforms.wait()
                return await unload(ce, target, domain)

            async def watch_reload(ce, entry_id):
                try:
                    return await reload(ce, entry_id)
                except UnknownEntry:
                    late_reload_errors.append(entry_id)
                    raise

            with (
                patch.object(TracearrClient, "servers", read),
                patch.object(manager, "async_forward_entry_unload", held_unload),
                patch.object(manager, "async_reload", watch_reload),
                patch.object(manager, "async_schedule_reload", autospec=True,
                             side_effect=manager.async_schedule_reload) as scheduled,
            ):
                pending = asyncio.create_task(entries.flow.async_configure(active["flow_id"], {"token": NEW_KEY}))
                removal = None
                try:
                    await asyncio.wait_for(rest.entered.wait(), 5)
                    removal = asyncio.create_task(entries.async_remove(entry.entry_id))
                    await asyncio.wait_for(platforms.entered.wait(), 5)
                    assert entry.state is ConfigEntryState.UNLOAD_IN_PROGRESS
                    assert entries.async_get_entry(entry.entry_id) is entry
                    assert reauth_flows(b, entry)  # HA has not cancelled this flow yet.
                    rest.release.set()
                    await asyncio.wait_for(response_read.wait(), 5)
                    saved_during_unload = entry.data != before
                    scheduled_during_unload = scheduled.call_count
                finally:
                    rest.release.set()
                    platforms.release.set()
                assert not (await asyncio.wait_for(removal, 5))["require_restart"]
                result = await asyncio.wait_for(pending, 5)
                await b.hass.async_block_till_done()
                assert (
                    saved_during_unload, scheduled_during_unload,
                    result["reason"], scheduled.call_count, len(late_reload_errors),
                ) == (False, 0, "reauth_entry_removed", 0, 0)
            assert entry.data == before and entries.async_get_entry(entry.entry_id) is None
            assert not reauth_flows(b, entry)

    asyncio.run(run())


def test_reauth_after_refused_unload_saves_key_without_attempting_reload(caplog):
    async def run():
        async with Tracearr().serve() as sim, core() as b:
            entries = b.hass.config_entries
            manager = type(entries)
            entry = await b.add(sim)
            coord = b.coord(entry)
            before = dict(entry.data)
            options = {"aliases": {"fixture": "Recette"}}
            entries.async_update_entry(entry, options=options)
            registry = er.async_get(b.hass)
            entity_id = registry.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_total")
            saved_entity = registry.async_update_entity(entity_id, name="Total personnalisé")
            sim.key = NEW_KEY
            await coord.async_refresh()
            await b.hass.async_block_till_done()
            active, = reauth_flows(b, entry)
            unload = manager.async_forward_entry_unload

            async def refuse(ce, target, domain):
                if target is entry and domain == "binary_sensor":
                    return False
                return await unload(ce, target, domain)

            with patch.object(manager, "async_forward_entry_unload", refuse):
                assert not await entries.async_unload(entry.entry_id)
            assert entry.state is ConfigEntryState.FAILED_UNLOAD
            assert entries.async_get_entry(entry.entry_id) is entry and b.coord(entry) is coord
            try:
                with patch.object(manager, "async_schedule_reload") as scheduled:
                    fid = active["flow_id"]
                    invalid = await entries.flow.async_configure(fid, {"token": BAD_KEY})
                    assert invalid["errors"] == {"base": "invalid_auth"}
                    assert entry.data == before
                    valid = await entries.flow.async_configure(fid, {"token": NEW_KEY})
                    assert (valid["type"], valid["reason"]) == ("abort", "reauth_restart_required")
                    scheduled.assert_not_called()
                assert entry.data == {**before, "token": NEW_KEY} and entry.options == options
                assert registry.async_get(entity_id) == saved_entity
                assert entry.state is ConfigEntryState.FAILED_UNLOAD and b.coord(entry) is coord
                assert not any(key in caplog.text for key in (KEY, BAD_KEY, NEW_KEY))
            finally:
                await entries.async_remove(entry.entry_id)

    asyncio.run(run())


def test_reload_aborts_reauth_before_late_validation_can_write():
    async def run():
        async with Tracearr().serve() as sim, core() as b:
            entries = b.hass.config_entries
            entry = await b.add(sim)
            old = b.coord(entry)
            sim.key = NEW_KEY
            await old.async_refresh()
            await b.hass.async_block_till_done()
            active, = reauth_flows(b, entry)
            gate = sim.gates["servers"] = Gate()
            pending = asyncio.create_task(entries.flow.async_configure(active["flow_id"], {"token": NEW_KEY}))
            try:
                await asyncio.wait_for(gate.entered.wait(), 5)
                del sim.gates["servers"]
                sim.key = KEY
                assert await entries.async_reload(entry.entry_id)
                replacement = await b.ready(entry)
                assert replacement is not old and not reauth_flows(b, entry)
            finally:
                gate.release.set()
            try:
                result = await asyncio.wait_for(pending, 5)
                assert (result["type"], result["reason"]) == ("abort", "reauth_interrupted")
            finally:
                await b.hass.async_block_till_done()
            assert entry.data["token"] == KEY
            assert entry.state == ConfigEntryState.LOADED and b.coord(entry) is replacement

    asyncio.run(run())


def test_sse_only_auth_refusal_keeps_rest_without_reauth(caplog):
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            entry = await b.add(sim)
            coord = b.coord(entry)
            sim.errors["events"] = (403, {})
            sim.raw(None)
            await observed(coord, lambda: not coord.sse_connected)
            # Observe the actual rejected reconnect on the simulated HTTP server.
            async with asyncio.timeout(10):
                while "Tracearr key rejected" not in caplog.text:
                    await asyncio.sleep(0.05)
            sim.change("started", "rest")
            await coord.async_refresh()
            row, = (await ws.call("tracearr_ha/get"))["entries"]
            assert row["connected"] and not row["sse_connected"] and not row["streams_stale"]
            assert row["stats"]["total"] == 1 and not reauth_flows(b, entry)

    asyncio.run(run())


def test_initial_invalid_key_and_transient_failure_do_not_start_reauth():
    async def run():
        async with Tracearr().serve() as sim, core() as b:
            entries = b.hass.config_entries
            result = await entries.flow.async_init(
                DOMAIN, context={"source": "user"}, data={"url": sim.url, "token": BAD_KEY},
            )
            assert result["errors"] == {"base": "invalid_auth"}
            assert not entries.async_entries(DOMAIN)
            entries.flow.async_abort(result["flow_id"])

            entry = await b.add(sim)
            coord = b.coord(entry)
            sim.errors["streams"] = (503, {})
            await coord.async_refresh()
            await b.hass.async_block_till_done()
            assert (coord.connected, coord.sse_connected, coord.last_update_success) == (False, True, False)
            assert reauth_flows(b, entry) == []
            sim.errors.clear()
            await coord.async_refresh()
            assert (coord.connected, coord.sse_connected, coord.last_update_success) == (True, True, True)

    asyncio.run(run())
