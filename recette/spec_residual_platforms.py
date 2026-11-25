"""B3: retry HA platform teardown before replacing a rolled-back generation."""
import asyncio
from contextlib import contextmanager
from unittest.mock import patch

import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.helpers import entity_registry as er

from core import DOMAIN, core, observed
from simulateur import Gate, Tracearr
from spec_generation import check_recovery, producers, subscribe


@contextmanager
def platform_refusals(b, target):
    manager = type(b.hass.config_entries)
    original = manager.async_forward_entry_unload
    attempts = []
    refuse = set()
    errors = set()
    gates = {}
    armed = False

    def arm():
        nonlocal armed
        armed = True

    async def unload(ce, entry, domain):
        if entry is target and armed:
            assert entry.setup_lock.locked()
            attempts.append(domain)
            if (gate := gates.get(domain)) is not None:
                await gate.wait()
            if domain in errors:
                raise RuntimeError("fixture: platform unload raised")
            if domain in refuse:
                return False
        return await original(ce, entry, domain)

    with patch.object(manager, "async_forward_entry_unload", unload):
        yield attempts, refuse, errors, gates, arm


async def fail_setup(b, entry, arm):
    captured = []

    def break_options(*args):
        captured.append(entry.runtime_data)
        arm()
        raise RuntimeError("fixture: setup failed after forwarding both platforms")

    with patch.object(type(entry), "add_update_listener", break_options):
        assert not await b.hass.config_entries.async_reload(entry.entry_id)
    assert entry.state is ConfigEntryState.SETUP_ERROR
    return captured[0]


def customize(b, entry):
    registry = er.async_get(b.hass)
    entity_id = registry.async_get_entity_id("sensor", DOMAIN, entry.entry_id + "_total")
    return registry.async_update_entity(entity_id, name="Compteur de recette")


async def assert_withdrawn(b, entry, sim, ws, *, other=None):
    await asyncio.wait_for(sim.no_clients.wait(), 5)
    assert entry.entry_id not in b.hass.data[DOMAIN]
    assert producers() == (["Tracearr SSE", "Tracearr poll"] if other else [])
    rows = (await ws.call("tracearr_ha/get"))["entries"]
    assert [r["id"] for r in rows] == ([other.entry_id] if other else [])


@pytest.mark.parametrize("raises", [False, True])
def test_first_reload_recovers_when_unload_becomes_possible(raises):
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            entry = await b.add(sim)
            saved = customize(b, entry)
            sub = await subscribe(ws)
            with platform_refusals(b, entry) as (attempts, refuse, errors, _, arm):
                (errors if raises else refuse).add("sensor")
                retired = await fail_setup(b, entry, arm)
                assert retired.platforms == {"sensor"}
                assert len(retired.coordinator._listeners) == 13
                await assert_withdrawn(b, entry, sim, ws)
                attempts.clear()
                refuse.clear()
                errors.clear()
                await check_recovery(b, entry, sim, ws, sub, saved.entity_id, retired=retired, saved=saved)
                assert attempts[0] == "sensor"
                assert not retired.platforms and not retired.coordinator._listeners
    asyncio.run(run())


def test_persistent_refusal_is_bounded_and_isolated_then_recovers():
    async def run():
        async with Tracearr().serve() as sim, Tracearr().serve() as independent, core() as b, b.connect() as ws:
            entry, other = await b.add(sim), await b.add(independent)
            saved = customize(b, entry)
            sub = await subscribe(ws)
            ce = b.hass.config_entries
            other_coord = b.coord(other)
            with platform_refusals(b, entry) as (attempts, refuse, _, __, arm):
                refuse.update(("sensor", "binary_sensor"))
                retired = await fail_setup(b, entry, arm)
                assert retired.platforms == {"sensor", "binary_sensor"}
                refuse.remove("binary_sensor")
                await ws.snapshots(sub)
                for n in range(3):
                    attempts.clear()
                    assert not await ce.async_reload(entry.entry_id)
                    assert entry.state is ConfigEntryState.SETUP_ERROR
                    await assert_withdrawn(b, entry, sim, ws, other=other)
                    assert retired.platforms == {"sensor"}
                    assert attempts == (["binary_sensor", "sensor"] if n == 0 else ["sensor"])
                    assert getattr(entry, "runtime_data", None) is retired
                    assert await ws.snapshots(sub) == []
                    sid = f"other-{n}"
                    independent.change("started", sid)
                    await observed(other_coord, lambda: sid in other_coord.streams)
                    only, = await ws.snapshots(sub)
                    assert only[0]["stats"]["total"] == n + 1
                    assert b.coord(other) is other_coord and len(independent.clients) == 1
                await ce.async_remove(other.entry_id)
                await ws.snapshots(sub)
                refuse.clear()
                await check_recovery(b, entry, sim, ws, sub, saved.entity_id, retired=retired, saved=saved)
                assert not retired.coordinator._listeners
    asyncio.run(run())


@pytest.mark.parametrize("still_refuses", [False, True])
def test_remove_incomplete_rollback_attempts_remaining_platform(still_refuses):
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            entry = await b.add(sim)
            sub = await subscribe(ws)
            with platform_refusals(b, entry) as (attempts, refuse, _, __, arm):
                refuse.add("sensor")
                retired = await fail_setup(b, entry, arm)
                await ws.snapshots(sub)
                if not still_refuses:
                    refuse.clear()
                attempts.clear()
                ce = b.hass.config_entries
                await ce.async_remove(entry.entry_id)
                assert ce.async_get_entry(entry.entry_id) is None
                assert attempts == ["sensor"]
                assert retired.platforms == ({"sensor"} if still_refuses else set())
                if not still_refuses:
                    assert not retired.coordinator._listeners
                await assert_withdrawn(b, entry, sim, ws)
                retired.coordinator._emit()
                assert await ws.snapshots(sub) == []
    asyncio.run(run())


def test_cancel_retry_keeps_only_unconfirmed_platforms():
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            entry = await b.add(sim)
            saved = customize(b, entry)
            sub = await subscribe(ws)
            with platform_refusals(b, entry) as (attempts, refuse, _, gates, arm):
                refuse.update(("sensor", "binary_sensor"))
                retired = await fail_setup(b, entry, arm)
                await ws.snapshots(sub)
                refuse.remove("binary_sensor")
                gate = gates["sensor"] = Gate()
                attempts.clear()
                task = asyncio.create_task(b.hass.config_entries.async_reload(entry.entry_id))
                entered = asyncio.create_task(gate.entered.wait())
                try:
                    await asyncio.wait({task, entered}, timeout=5, return_when=asyncio.FIRST_COMPLETED)
                    assert gate.entered.is_set(), "relay reload did not retry the retained platform"
                    task.cancel()
                    await assert_withdrawn(b, entry, sim, ws)
                    assert not task.done() and retired.platforms == {"sensor"}
                finally:
                    gate.release.set()
                    entered.cancel()
                    await asyncio.gather(entered, return_exceptions=True)
                    try:
                        assert not await asyncio.wait_for(task, 5)
                    except asyncio.CancelledError:
                        assert task.cancelled()
                assert getattr(entry, "runtime_data", None) is retired
                assert attempts == ["binary_sensor", "sensor"] and retired.platforms == {"sensor"}
                assert await ws.snapshots(sub) == []
                refuse.clear()
                await check_recovery(b, entry, sim, ws, sub, saved.entity_id, retired=retired, saved=saved)
                assert not retired.coordinator._listeners
    asyncio.run(run())
