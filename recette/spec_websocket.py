"""P1-A: test what an already open HA WebSocket actually receives."""
import asyncio
from contextlib import AsyncExitStack

import pytest

from core import core, observed
from simulateur import Tracearr


class LostSubscription(AssertionError):
    """Only the missing notification, after all positive controls passed."""


class RetainedListener(AssertionError):
    """The old coordinator retains the active client's single listener."""


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
@pytest.mark.xfail(strict=True, raises=LostSubscription, reason="A1: subscription bound to old coordinator")
def test_subscription_survives_reload(reloads, subscribers, instances):
    async def run():
        async with AsyncExitStack() as stack:
            sims = [await stack.enter_async_context(Tracearr().serve()) for _ in range(instances)]
            bench = await stack.enter_async_context(core())
            entries = [await bench.add(sim) for sim in sims]
            entry = entries[0]
            sockets = [await stack.enter_async_context(bench.connect()) for _ in range(subscribers)]
            subs = [await subscribe(ws, entry) for ws in sockets]
            await check_change(sims[0], bench, entry, "before")
            for ws, sub in zip(sockets, subs, strict=True):
                before, = await ws.snapshots(sub)
                assert ids(before, entry) == {"before"}
            for _ in range(reloads):
                old = bench.coord(entry)
                assert await bench.hass.config_entries.async_reload(entry.entry_id)
                assert await bench.ready(entry) is not old
            # Drop lifecycle notifications. No event from another entry may
            # accidentally make the missing post-reload notification look good.
            for ws, sub in zip(sockets, subs, strict=True):
                await ws.snapshots(sub)
            await check_change(sims[0], bench, entry, "after")
            missing = []
            for ws, sub in zip(sockets, subs, strict=True):
                current = await ws.call("tracearr_ha/get")
                assert ids(current["entries"], entry) == {"before", "after"}
                batch = await ws.snapshots(sub)
                if batch:
                    only, = batch  # duplicates are unexpected failures
                    assert ids(only, entry) == {"before", "after"}
                missing.append(not batch)
            if instances > 1:
                await check_change(sims[1], bench, entries[1], "independent")
                for ws, sub in zip(sockets, subs, strict=True):
                    other, = await ws.snapshots(sub)
                    assert ids(other, entries[1]) == {"independent"}
            if any(missing):
                assert all(missing), "Only some subscribers lost data"
                raise LostSubscription(f"{sum(missing)}/{len(sockets)} subscribers missed 'after'")
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


@pytest.mark.xfail(strict=True, raises=RetainedListener, reason="A1: listener still on unloaded coordinator")
def test_old_coordinator_releases_listener():
    async def run():
        async with Tracearr().serve() as sim, core() as b:
            entry = await b.add(sim)
            old = b.coord(entry)
            async with b.connect() as ws:
                sub = await subscribe(ws, entry)
                assert await b.hass.config_entries.async_reload(entry.entry_id)
                assert await b.ready(entry) is not old
                count = len(old._listeners)
                await ws.call("unsubscribe_events", subscription=sub)
                assert not old._listeners
                if count == 1:
                    raise RetainedListener("old listener only released at unsubscribe")
                assert count == 0
    asyncio.run(run())
