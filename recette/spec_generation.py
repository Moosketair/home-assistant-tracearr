"""Generation ownership under partial HA setup, unload and definitive removal."""
import asyncio
import gc
import weakref
from unittest.mock import patch

import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.helpers import entity_registry as er

from custom_components.tracearr_ha import binary_sensor
from core import DOMAIN, core, observed
from simulateur import Gate, Tracearr


def producers():
    return sorted(t.get_name() for t in asyncio.all_tasks()
                  if t.get_name() in ("Tracearr SSE", "Tracearr poll"))


async def subscribe(ws):
    await ws.call("tracearr_ha/subscribe")
    sub = ws.seq
    await ws.snapshots(sub)
    return sub


async def check_recovery(b, e, sim, ws, sub, entity_id, retired=None, saved=None):
    ce = b.hass.config_entries
    assert await ce.async_reload(e.entry_id)
    coord = await b.ready(e)
    assert len(sim.clients) == 1 and producers() == ["Tracearr SSE", "Tracearr poll"]
    await ws.snapshots(sub)
    if retired is not None:
        await retired.close()
        assert b.coord(e) is coord and await ws.snapshots(sub) == []
    sim.change("started", "recovered")
    await observed(coord, lambda: "recovered" in coord.streams)
    event, = await ws.snapshots(sub)
    row, = event
    assert row["stats"]["total"] == 1
    registry = er.async_get(b.hass)
    assert registry.async_get_entity_id("sensor", DOMAIN, e.entry_id + "_total") == entity_id
    if saved is not None:
        active = registry.async_get(entity_id)
        assert (active.id, active.name) == (saved.id, saved.name)
    assert b.hass.states.get(entity_id).state == "1"
    assert not (await ce.async_remove(e.entry_id))["require_restart"]
    assert await ws.snapshots(sub) == [[]]
    await asyncio.wait_for(sim.no_clients.wait(), 5)
    assert not producers() and not coord._listeners


@pytest.mark.parametrize("direct_remove, with_other", [(False, True), (True, True), (True, False)])
def test_refused_unload_and_final_remove(direct_remove, with_other):
    async def run():
        async with Tracearr().serve() as sim, Tracearr().serve() as other, core() as b, \
                b.connect() as ws, b.connect() as second:
            sub = await subscribe(ws)
            peer = await subscribe(second)
            e = await b.add(sim)
            keep = await b.add(other) if with_other else None
            c = b.coord(e)
            generation = getattr(e, "runtime_data", None)
            ce = b.hass.config_entries
            await ws.snapshots(sub)
            await second.snapshots(peer)
            unload = type(ce).async_forward_entry_unload

            async def refuse_binary(manager, entry, domain):
                if entry is e and domain == "binary_sensor":
                    return False
                return await unload(manager, entry, domain)

            with patch.object(type(ce), "async_forward_entry_unload", refuse_binary):
                if not direct_remove:
                    assert not await ce.async_unload(e.entry_id)
                    assert ce.async_get_entry(e.entry_id) is e and b.coord(e) is c
                    assert await ws.snapshots(sub) == []
                    sim.change("started", "still-owned")
                    await observed(c, lambda: "still-owned" in c.streams)
                    visible, = await ws.snapshots(sub)
                    assert {r["id"] for r in visible} == {keep.entry_id, e.entry_id}
                    assert await second.snapshots(peer) == [visible]
                assert (await ce.async_remove(e.entry_id))["require_restart"]
            assert ce.async_get_entry(e.entry_id) is None
            remaining = (await ws.call("tracearr_ha/get"))["entries"]
            assert [r["id"] for r in remaining] == ([keep.entry_id] if keep else [])
            assert await ws.snapshots(sub) == [remaining]
            assert await second.snapshots(peer) == [remaining]
            assert e.entry_id not in b.hass.data[DOMAIN]
            assert c._sse_task.done() and c._poll_task.done()
            await asyncio.wait_for(sim.no_clients.wait(), 5)
            assert producers() == (["Tracearr SSE", "Tracearr poll"] if keep else [])
            sim.change("started", "late")
            c._emit()
            from custom_components.tracearr_ha import async_remove_entry
            await async_remove_entry(b.hass, e)  # second finalizer must have no effect
            await generation.close()  # same generation, already retired
            await b.hass.async_block_till_done()
            assert not c._listeners
            assert await ws.snapshots(sub) == []
            assert await second.snapshots(peer) == []
            if keep:
                other.change("started", "live")
                await observed(b.coord(keep), lambda: "live" in b.coord(keep).streams)
                only, = await ws.snapshots(sub)
                assert only[0]["streams"][0]["id"] == "live"
                await ce.async_remove(keep.entry_id)
                assert await ws.snapshots(sub) == [[]] and not producers()
    asyncio.run(run())


@pytest.mark.parametrize("stage", ["SSE", "poll", "options"])
def test_broken_start_rolls_back(stage):
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            e = await b.add(sim)
            sub = await subscribe(ws)
            ce = b.hass.config_entries
            entity_id = er.async_get(b.hass).async_get_entity_id("sensor", DOMAIN, e.entry_id + "_total")
            failed = []
            generations = []
            task_factory = type(b.hass).async_create_background_task

            def create(hass, coro, name, *args, **kwargs):
                if name == "Tracearr " + stage:
                    failed.append(b.coord(e))
                    generations.append(getattr(e, "runtime_data", None))
                    raise RuntimeError("fixture: cannot create producer")
                return task_factory(hass, coro, name, *args, **kwargs)

            def options(*args):
                failed.append(b.coord(e))
                generations.append(getattr(e, "runtime_data", None))
                assert len(producers()) == 2
                raise RuntimeError("fixture: cannot install options listener")

            fault = (patch.object(type(e), "add_update_listener", options) if stage == "options"
                     else patch.object(type(b.hass), "async_create_background_task", create))
            with fault:
                assert not await ce.async_reload(e.entry_id)
            assert e.state == ConfigEntryState.SETUP_ERROR
            abandoned, = failed
            events = await ws.snapshots(sub)
            assert events[-1] == [] and (await ws.call("tracearr_ha/get"))["entries"] == []
            assert e.entry_id not in b.hass.data[DOMAIN] and not producers()
            assert not abandoned._listeners
            await asyncio.wait_for(sim.no_clients.wait(), 5)
            sim.change("started", "while-failed")
            abandoned._emit()
            assert await ws.snapshots(sub) == []
            assert "while-failed" not in abandoned.streams
            sim.change("stopped", "while-failed")
            await check_recovery(b, e, sim, ws, sub, entity_id, generations[0])
    asyncio.run(run())


@pytest.mark.parametrize("fault", ["cancel", "binary_error"])
def test_real_sensor_rolled_back(fault):
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            e = await b.add(sim)
            sub = await subscribe(ws)
            ce = b.hass.config_entries
            entity_id = er.async_get(b.hass).async_get_entity_id("sensor", DOMAIN, e.entry_id + "_total")
            registry = er.async_get(b.hass)
            saved = registry.async_update_entity(entity_id, name="Compteur personnalisé")
            original = type(ce).async_forward_entry_setups
            gate = Gate()
            captured = []

            async def forward(manager, entry, platforms):
                if "sensor" in platforms:
                    await original(manager, entry, ["sensor"])
                    captured.append(b.coord(e))
                    assert b.hass.states.get(entity_id).state == "0"
                    if fault == "cancel":
                        await gate.wait()
                if "binary_sensor" in platforms:
                    await original(manager, entry, ["binary_sensor"])

            async def broken_binary(*args):
                raise RuntimeError("fixture: real binary entity platform fails")

            with patch.object(type(ce), "async_forward_entry_setups", forward), \
                 patch.object(binary_sensor, "async_setup_entry", broken_binary):
                task = asyncio.create_task(ce.async_reload(e.entry_id))
                if fault == "cancel":
                    await asyncio.wait_for(gate.entered.wait(), 5)
                    task.cancel()
                try:
                    assert not await asyncio.wait_for(task, 5)
                except asyncio.CancelledError:
                    assert fault == "cancel" and task.cancelled()
            abandoned, = captured
            assert not abandoned._listeners and not producers()
            assert (await ws.call("tracearr_ha/get"))["entries"] == []
            assert registry.async_get(entity_id).id == saved.id
            assert registry.async_get(entity_id).name == "Compteur personnalisé"
            await check_recovery(b, e, sim, ws, sub, entity_id, saved=saved)
    asyncio.run(run())


def test_cancel_during_rollback_waits_for_cleanup():
    """Cancel twice while the rollback has a real sensor platform to unload."""
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            e = await b.add(sim)
            ce = b.hass.config_entries
            sub = await subscribe(ws)
            unload = type(ce).async_forward_entry_unload
            gate = Gate()
            failed = []

            def break_options(*args):
                failed.append(b.coord(e))
                raise RuntimeError("fixture: trigger rollback")

            async def wait_unload(manager, entry, platform):
                if failed and platform == "sensor":
                    await gate.wait()
                return await unload(manager, entry, platform)

            with patch.object(type(e), "add_update_listener", break_options), \
                 patch.object(type(ce), "async_forward_entry_unload", wait_unload):
                task = asyncio.create_task(ce.async_reload(e.entry_id))
                try:
                    await asyncio.wait_for(gate.entered.wait(), 5)
                    for _ in range(2):
                        task.cancel()
                        assert (await ws.call("tracearr_ha/get"))["entries"] == []
                        assert not task.done()
                finally:
                    gate.release.set()
                try:
                    assert not await asyncio.wait_for(task, 5)  # older Core catches cancellation
                except asyncio.CancelledError:
                    assert task.cancelled()
            assert not producers() and not failed[0]._listeners
            entity_id = er.async_get(b.hass).async_get_entity_id("sensor", DOMAIN, e.entry_id + "_total")
            await check_recovery(b, e, sim, ws, sub, entity_id)
    asyncio.run(run())


def test_cleanup_error_preserves_setup_exception(caplog):
    async def run():
        async with Tracearr().serve() as sim, core() as b:
            e = await b.add(sim)
            from custom_components.tracearr_ha.coordinator import TracearrCoordinator
            original = TracearrCoordinator.stop
            failed = []

            def fail(*args):
                failed.append(b.coord(e))
                raise ValueError("primary fixture error")

            async def also_fail(coord):
                await original(coord)
                if coord in failed:
                    raise RuntimeError("secondary fixture error")

            with patch.object(type(e), "add_update_listener", fail), \
                 patch.object(TracearrCoordinator, "stop", also_fail):
                assert not await b.hass.config_entries.async_reload(e.entry_id)
            errors = [record.exc_info[1] for record in caplog.records if record.exc_info]
            assert any(str(exc) == "primary fixture error" for exc in errors)
            assert any(str(exc) == "secondary fixture error" for exc in errors)
            assert not producers() and not failed[0]._listeners and e.entry_id not in b.hass.data[DOMAIN]
    asyncio.run(run())


def test_eight_generations_two_entries_three_subscriptions():
    async def run():
        async with Tracearr().serve() as a, Tracearr().serve() as z, core() as b, \
                b.connect() as left, b.connect() as right:
            e, f = await b.add(a), await b.add(z)
            subscriptions = [(left, [await subscribe(left), await subscribe(left)]),
                             (right, [await subscribe(right)])]
            refs = []
            baseline = len(b.coord(e)._listeners)
            for i in range(8):
                old = b.coord(e)
                refs.append(weakref.ref(old))
                assert await b.hass.config_entries.async_reload(e.entry_id)
                current = await b.ready(e)
                assert len(current._listeners) == baseline and not old._listeners
                del old
                for ws, _ in subscriptions:
                    await ws.call("tracearr_ha/get")
                    ws.events.clear()
                sid = str(i)
                a.change("started", sid)
                z.change("started", sid)
                await asyncio.gather(observed(current, lambda: sid in current.streams),
                                     observed(b.coord(f), lambda: sid in b.coord(f).streams))
                for ws, ids in subscriptions:
                    snap = (await ws.call("tracearr_ha/get"))["entries"]
                    assert len(snap) == 2 and all(r["stats"]["total"] == i + 1 for r in snap)
                    assert sorted(m["id"] for m in ws.events) == sorted(ids * 2)
                    for ident in ids:
                        assert [m["event"]["entries"] for m in ws.events if m["id"] == ident][-1] == snap
                assert len(producers()) == 4 and len(a.clients) == len(z.clients) == 1
            gc.collect()
            assert all(ref() is None for ref in refs)
    asyncio.run(run())
