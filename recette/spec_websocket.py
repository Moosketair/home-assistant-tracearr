"""P1-A: test what an already open HA WebSocket actually receives."""
import asyncio
from contextlib import AsyncExitStack
from unittest.mock import patch

import pytest
from homeassistant.components.websocket_api.const import SIGNAL_WEBSOCKET_DISCONNECTED
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import callback
from homeassistant.helpers.dispatcher import DATA_DISPATCHER, async_dispatcher_connect

from custom_components.tracearr_ha.const import EVENT_SIGNAL
from core import core, observed
from simulateur import Gate, Tracearr


def ids(entries, entry):
    row, = (row for row in entries if row["id"] == entry.entry_id)
    return {s["id"] for s in row["streams"]}


async def subscribe(socket, entry):
    await socket.call("tracearr_ha/subscribe")
    sub = socket.seq
    initial, = await socket.snapshots(sub)
    assert ids(initial, entry) == set()
    return sub


async def check_change(sim, bench, entry, sid):
    coord = bench.coord(entry)
    sim.change("started", sid)
    await observed(coord, lambda: sid in coord.streams)


@pytest.mark.parametrize("reloads, subscribers, instances", [(1, 1, 1), (2, 2, 2)])
def test_subscription_survives_reload(reloads, subscribers, instances):
    async def run():
        async with AsyncExitStack() as stack:
            sims = [await stack.enter_async_context(Tracearr().serve()) for _ in range(instances)]
            bench = await stack.enter_async_context(core())
            entries = [await bench.add(sim) for sim in sims]
            entry = entries[0]
            sockets = [await stack.enter_async_context(bench.connect()) for _ in range(subscribers)]
            listener_count = len(bench.coord(entry)._listeners)
            subs = [await subscribe(ws, entry) for ws in sockets]
            await check_change(sims[0], bench, entry, "before")
            for ws, sub in zip(sockets, subs, strict=True):
                before, = await ws.snapshots(sub)
                assert ids(before, entry) == {"before"}
            for _ in range(reloads):
                old = bench.coord(entry)
                assert await bench.hass.config_entries.async_reload(entry.entry_id)
                assert await bench.ready(entry) is not old
                assert not old._listeners
                assert len(bench.coord(entry)._listeners) == listener_count
            # Drop lifecycle notifications. No event from another entry may
            # accidentally make the missing post-reload notification look good.
            for ws, sub in zip(sockets, subs, strict=True):
                await ws.snapshots(sub)
            await check_change(sims[0], bench, entry, "after")
            for ws, sub in zip(sockets, subs, strict=True):
                current = await ws.call("tracearr_ha/get")
                assert ids(current["entries"], entry) == {"before", "after"}
                only, = await ws.snapshots(sub)  # exactly once, same subscription
                assert ids(only, entry) == {"before", "after"}
            if instances > 1:
                await check_change(sims[1], bench, entries[1], "independent")
                for ws, sub in zip(sockets, subs, strict=True):
                    other, = await ws.snapshots(sub)
                    assert ids(other, entries[1]) == {"independent"}
    asyncio.run(run())


def test_unsubscribe_after_reload_and_remove():
    async def run():
        async with Tracearr().serve() as s, Tracearr().serve() as other, core() as b:
            e, keep = await b.add(s), await b.add(other)
            async with b.connect() as left, b.connect() as right:
                a, z = await subscribe(left, e), await subscribe(right, e)
                old = b.coord(e)
                assert await b.hass.config_entries.async_reload(e.entry_id)
                assert await b.ready(e) is not old
                await left.call("unsubscribe_events", subscription=a)
                await right.call("unsubscribe_events", subscription=z)
                assert not old._listeners, "listener retained by unloaded coordinator after unsubscribe"
                await left.snapshots(a)
                await right.snapshots(z)
                # A fresh subscriber should see the remaining entry once per change.
                fresh = await subscribe(right, e)
                await b.hass.config_entries.async_remove(e.entry_id)
                assert b.hass.config_entries.async_get_entry(e.entry_id) is None
                removed = await right.snapshots(fresh)
                assert removed and all(len(rows) == 1 and rows[0]["id"] == keep.entry_id for rows in removed)
                await check_change(other, b, keep, "remaining")
                assert await left.snapshots(a) == []
                only, = await right.snapshots(fresh)
                assert len(only) == 1 and ids(only, keep) == {"remaining"}
                await right.call("unsubscribe_events", subscription=fresh)
                await check_change(other, b, keep, "no-listeners")
                assert await right.snapshots(fresh) == []
    asyncio.run(run())


def test_old_coordinator_releases_listener():
    async def run():
        async with Tracearr().serve() as sim, core() as b:
            entry = await b.add(sim)
            old = b.coord(entry)
            async with b.connect() as ws:
                sub = await subscribe(ws, entry)
                assert await b.hass.config_entries.async_reload(entry.entry_id)
                assert await b.ready(entry) is not old
                assert not old._listeners
                await ws.call("unsubscribe_events", subscription=sub)
                assert not old._listeners
    asyncio.run(run())


def domain_listeners(bench):
    # White-box leak check on the two pinned Core versions, in addition to wire assertions.
    return len(bench.hass.data.get(DATA_DISPATCHER, {}).get(EVENT_SIGNAL, {}))


def test_subscribe_and_unsubscribe_during_reload():
    async def run():
        async with Tracearr().serve() as sim, Tracearr().serve() as other, core() as b:
            entry, keep = await b.add(sim), await b.add(other)
            old = b.coord(entry)
            async with b.connect() as ws:
                before = await subscribe(ws, entry)
                gate = sim.gates["streams"] = Gate()
                reload_task = asyncio.create_task(b.hass.config_entries.async_reload(entry.entry_id))
                try:
                    await asyncio.wait_for(gate.entered.wait(), 5)
                    gone, = await ws.snapshots(before)
                    assert [r["id"] for r in gone] == [keep.entry_id]
                    during = await subscribe(ws, keep)
                    assert domain_listeners(b) == 2
                    await check_change(other, b, keep, "during")
                    await ws.call("tracearr_ha/get")  # FIFO fence for both IDs on one socket
                    batch, ws.events = ws.events, []
                    assert sorted(m["id"] for m in batch) == [before, during]
                    for msg in batch:
                        rows = msg["event"]["entries"]
                        assert len(rows) == 1 and ids(rows, keep) == {"during"}
                    await ws.call("unsubscribe_events", subscription=before)
                    assert domain_listeners(b) == 1
                    old._emit()
                    assert await ws.snapshots(during) == []
                finally:
                    gate.release.set()
                    assert await asyncio.wait_for(reload_task, 5)
                assert await b.ready(entry) is not old
                restored = await ws.snapshots(during)
                assert restored and all(ids(rows, entry) == set() for rows in restored)
                old._emit()  # late producer after a replacement is live
                assert await ws.snapshots(during) == []
                await check_change(sim, b, entry, "restored")
                only, = await ws.snapshots(during)
                assert ids(only, entry) == {"restored"}
    asyncio.run(run())


def test_empty_subscription_remove_last_and_add_new():
    async def run():
        async with Tracearr().serve() as sim, Tracearr().serve() as new, core() as b, b.connect() as ws:
            await ws.call("tracearr_ha/subscribe")
            sub = ws.seq
            assert await ws.snapshots(sub) == [[]]
            sim.change("started", "original")
            entry = await b.add(sim)
            old = b.coord(entry)
            added = await ws.snapshots(sub)
            assert added and all(ids(rows, entry) == {"original"} for rows in added)
            await b.hass.config_entries.async_remove(entry.entry_id)
            assert await ws.snapshots(sub) == [[]]
            old._emit()
            assert await ws.snapshots(sub) == []
            new.change("started", "replacement")
            replacement = await b.add(new)
            assert replacement.entry_id != entry.entry_id
            added = await ws.snapshots(sub)
            assert added and all(len(rows) == 1 and ids(rows, replacement) == {"replacement"} for rows in added)
    asyncio.run(run())


def test_reload_failure_then_recovery():
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            entry = await b.add(sim)
            sub = await subscribe(ws, entry)
            old = b.coord(entry)
            sim.errors["streams"] = 503, {}
            assert not await b.hass.config_entries.async_reload(entry.entry_id)
            assert entry.state == ConfigEntryState.SETUP_RETRY
            assert await ws.snapshots(sub) == [[]]
            old._emit()
            assert await ws.snapshots(sub) == []
            del sim.errors["streams"]
            sim.change("started", "recovered")
            assert await b.hass.config_entries.async_reload(entry.entry_id)
            assert await b.ready(entry) is not old
            batch = await ws.snapshots(sub)
            assert batch and all(ids(rows, entry) == {"recovered"} for rows in batch)
            assert domain_listeners(b) == 1
    asyncio.run(run())


def test_failed_platform_setup_withdraws_published_snapshot():
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            entry = await b.add(sim)
            sub = await subscribe(ws, entry)
            entries = b.hass.config_entries
            gate = Gate()

            async def fail_forward(*args):
                await gate.wait()
                raise RuntimeError("fixture: platform setup failed")

            with patch.object(type(entries), "async_forward_entry_setups", fail_forward):
                reload_task = asyncio.create_task(entries.async_reload(entry.entry_id))
                try:
                    await asyncio.wait_for(gate.entered.wait(), 5)
                    provisional = b.coord(entry)
                    removed, added = await ws.snapshots(sub)
                    assert removed == [] and ids(added, entry) == set()
                finally:
                    gate.release.set()
                    result = await asyncio.wait_for(reload_task, 5)
            assert not result and entry.state == ConfigEntryState.SETUP_ERROR
            assert await ws.snapshots(sub) == [[]]
            assert not provisional._listeners
            provisional._emit()
            assert await ws.snapshots(sub) == []
    asyncio.run(run())


def test_rest_and_options_use_replacement_relay():
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            entry = await b.add(sim)
            sub = await subscribe(ws, entry)
            assert await b.hass.config_entries.async_reload(entry.entry_id)
            coord = await b.ready(entry)
            await ws.snapshots(sub)
            sim.streams["rest"] = sim.session("rest")  # no SSE: only REST can notify
            await coord.async_refresh()
            only, = await ws.snapshots(sub)
            assert ids(only, entry) == {"rest"}
            aliases = {"fixture": "Recette"}
            b.hass.config_entries.async_update_entry(entry, options={"aliases": aliases})
            await b.hass.async_block_till_done()
            only, = await ws.snapshots(sub)
            row, = only
            assert row["id"] == entry.entry_id and row["aliases"] == aliases
    asyncio.run(run())


def test_aborted_socket_releases_all_its_subscriptions():
    async def run():
        async with Tracearr().serve() as sim, core() as b:
            entry = await b.add(sim)
            coord_count = len(b.coord(entry)._listeners)
            async with b.connect() as survivor, b.connect() as dropped:
                keep = await subscribe(survivor, entry)
                await subscribe(dropped, entry)
                await subscribe(dropped, entry)
                assert domain_listeners(b) == 3
                assert len(b.coord(entry)._listeners) == coord_count
                closed = asyncio.Event()

                @callback
                def on_disconnect():
                    closed.set()

                remove = async_dispatcher_connect(b.hass, SIGNAL_WEBSOCKET_DISCONNECTED, on_disconnect)
                try:
                    # Drop TCP without sending a WS close frame or unsubscribe.
                    dropped.ws._response.connection.transport.abort()
                    await asyncio.wait_for(closed.wait(), 5)
                finally:
                    remove()
                assert domain_listeners(b) == 1
                await check_change(sim, b, entry, "alive")
                only, = await survivor.snapshots(keep)
                assert ids(only, entry) == {"alive"}
                await survivor.call("unsubscribe_events", subscription=keep)
                assert domain_listeners(b) == 0
                assert len(b.coord(entry)._listeners) == coord_count
    asyncio.run(run())
