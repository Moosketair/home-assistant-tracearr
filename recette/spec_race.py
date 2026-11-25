"""P1-B: deterministic REST/SSE races through real HA, sensors and WebSocket."""
import asyncio
from contextlib import asynccontextmanager
from copy import deepcopy
from unittest.mock import patch

import pytest
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.update_coordinator import UpdateFailed

from custom_components.tracearr_ha.api import TracearrClient
from custom_components.tracearr_ha import coordinator as module
from core import DOMAIN, core, observed
from simulateur import Gate, Tracearr


CASES = {
    "start": [("started", "new", {"server": 2})],
    "stop": [("stopped", "main", {})],
    "progress": [("progress", "main", {"progress_ms": 42000})],
    "pause": [("updated", "main", {"state": "paused"})],
    "resume": [("updated", "main", {"state": "playing"})],
    "sequence": [("progress", "parallel", {"progress_ms": 13000}),
                 ("updated", "main", {"state": "paused"}),
                 ("updated", "main", {"state": "playing", "progress_ms": 8000})],
}


@asynccontextmanager
async def held(sim, coord, resource="servers"):
    gate = sim.gates[resource] = Gate()
    task = asyncio.create_task(coord.async_refresh())
    try:
        await asyncio.wait_for(gate.entered.wait(), 5)
        yield gate, task
    finally:
        gate.release.set()
        await asyncio.gather(task, return_exceptions=True)
        sim.gates.pop(resource, None)


async def views(b, entry, sim, ws):
    coord = b.coord(entry)
    assert coord.streams == sim.streams
    assert coord.data["streams"] == coord.snapshot()["streams"]
    rows = (await ws.call("tracearr_ha/get"))["entries"]
    row, = [r for r in rows if r["id"] == entry.entry_id]
    assert {s["id"]: s for s in row["streams"]} == sim.streams
    assert row["stats"] == coord.snapshot()["stats"]
    registry = er.async_get(b.hass)
    for key in ("total", "playing", "paused", "bandwidth_mbps"):
        entity_id = registry.async_get_entity_id("sensor", DOMAIN, entry.entry_id + "_" + key)
        assert float(b.hass.states.get(entity_id).state) == row["stats"][key]
    for server in sim.servers:
        sid = server["server_id"]
        entity_id = registry.async_get_entity_id("sensor", DOMAIN, f"{entry.entry_id}_{sid}_streams")
        assert int(b.hass.states.get(entity_id).state) == sum(s["server_id"] == sid for s in sim.streams.values())


def clean(coord):
    # Also usable when checking behavioral tests against the pre-fix backend,
    # which has no reconciliation structures.
    assert getattr(coord, "_stream_changes", None) is None
    assert getattr(coord, "_server_changes", None) is None
    assert not getattr(coord, "_refresh_tasks", ())


@pytest.mark.parametrize("resource", ["streams", "servers"])
@pytest.mark.parametrize("case", CASES)
def test_latest_stream_state(case, resource):
    async def run():
        async with Tracearr().serve() as sim:
            sim.change("started", "main", state="paused" if case == "resume" else "playing")
            sim.change("started", "parallel", server=1)
            async with core() as b, b.connect() as ws:
                entry = await b.add(sim)
                coord = b.coord(entry)
                await ws.call("tracearr_ha/subscribe")
                sub = ws.seq
                await ws.snapshots(sub)
                async with held(sim, coord, resource):
                    for kind, sid, fields in CASES[case]:
                        sim.change(kind, sid, **fields)
                    # Application and HA delivery must precede network release.
                    await observed(coord, lambda: coord.streams == sim.streams)
                    await views(b, entry, sim, ws)
                    await ws.snapshots(sub)
                assert coord.last_update_success
                await views(b, entry, sim, ws)
                for snapshot in await ws.snapshots(sub):
                    assert {s["id"]: s for s in snapshot[0]["streams"]} == sim.streams
                clean(coord)
    asyncio.run(run())


def test_same_session_sequence_and_rest_recovery():
    async def run():
        async with Tracearr().serve() as sim:
            sim.change("started", "main")
            async with core() as b, b.connect() as ws:
                entry = await b.add(sim)
                coord = b.coord(entry)
                async with held(sim, coord):
                    for kind, fields in [
                        ("progress", {"progress_ms": 40000}),
                        ("updated", {"state": "paused"}),
                        ("progress", {"progress_ms": 5000}),  # seek backward
                        ("updated", {"state": "playing"}),
                    ]:
                        sim.change(kind, "main", **fields)
                        await observed(coord, lambda: coord.streams == sim.streams)
                    sim.change("started", "short")
                    sim.change("stopped", "short")
                    # Final stop must supersede every earlier mutation.
                    sim.event("stream.stopped", {"id": "main"})
                    await observed(coord, lambda: not coord.streams)
                    sim.streams.pop("main")
                assert not coord.streams
                clean(coord)
                # No tombstone may prevent a later REST-only correction.
                sim.streams["main"] = sim.session("main", progress_ms=90000)
                sim.streams["missed"] = sim.session("missed", server=2)
                await coord.async_request_refresh()  # real HA debouncer path
                await observed(coord, lambda: coord.streams == sim.streams)
                await views(b, entry, sim, ws)
    asyncio.run(run())


@pytest.mark.parametrize("timing", ["before_request", "during_request", "already_in_snapshot"])
def test_snapshot_and_event_order(timing):
    async def run():
        async with Tracearr().serve() as sim:
            sim.change("started", "main")
            async with core() as b, b.connect() as ws:
                entry = await b.add(sim)
                coord = b.coord(entry)
                if timing == "before_request":
                    sim.change("progress", "main", progress_ms=10000)
                    await observed(coord, lambda: coord.streams == sim.streams)
                    sim.streams["main"].update(progress_ms=2000, state="paused")
                elif timing == "already_in_snapshot":
                    sim.streams["main"]["progress_ms"] = 10000
                async with held(sim, coord):
                    if timing != "before_request":
                        # All fixture timestamps are identical: they cannot order this.
                        sim.change("progress", "main", progress_ms=10000)
                        await observed(coord, lambda: coord.streams == sim.streams)
                await views(b, entry, sim, ws)
                clean(coord)
    asyncio.run(run())


@pytest.mark.parametrize("failure", ["error", "cancel"])
def test_failed_refresh_keeps_live_events(failure):
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            entry = await b.add(sim)
            coord = b.coord(entry)
            async with held(sim, coord, "streams") as (_, task):
                sim.change("started", "new")
                await observed(coord, lambda: coord.streams == sim.streams)
                if failure == "error":
                    sim.errors["servers"] = 503, {}
                else:
                    task.cancel()
            assert coord.streams == sim.streams
            clean(coord)
            sim.errors.clear()
            sim.streams["missed"] = sim.session("missed")
            await coord.async_refresh()
            await views(b, entry, sim, ws)
    asyncio.run(run())


def test_health_boundaries_and_hot_session_rest_fields():
    async def run():
        async with Tracearr().serve() as sim:
            sim.change("started", "main")
            async with core() as b, b.connect() as ws:
                entry = await b.add(sim)
                coord = b.coord(entry)
                async with held(sim, coord, "streams"):
                    sim.health("down")
                    await observed(coord, lambda: next(iter(coord.servers.values()))["status"] == "down")
                    # Newer REST status: health preceded the servers GET.
                    sim.servers[0]["status"] = "up"
                assert next(iter(coord.servers.values()))["status"] == "up"
                for i in range(3):
                    sim.streams["main"]["genres"] = [f"REST-{i}"]
                    async with held(sim, coord):
                        sim.change("progress", "main", progress_ms=1000 * (i + 1))
                        sim.health("down")
                        await observed(coord, lambda: coord.streams["main"]["progress_ms"] == 1000 * (i + 1)
                                       and next(iter(coord.servers.values()))["status"] == "down")
                    await views(b, entry, sim, ws)
                    assert coord.servers == {s["server_id"]: s for s in sim.servers}
                    clean(coord)
    asyncio.run(run())


@pytest.mark.parametrize("reconnect", [False, True])
def test_ready_during_refresh_does_not_block_ingress(reconnect):
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            entry = await b.add(sim)
            coord = b.coord(entry)
            # Witness the real iterator, including ready; no replacement payload.
            ready = asyncio.Event()
            upstream = TracearrClient.events

            async def witness(client):
                async for event in upstream(client):
                    yield event
                    if event.get("type") == "ready":
                        ready.set()

            # Existing iterator cannot be patched; observe the new one on reconnect.
            if reconnect:
                with patch.object(TracearrClient, "events", witness):
                    async with held(sim, coord):
                        sim.raw(None)
                        await observed(coord, lambda: not coord.sse_connected)
                        sim.streams["missed"] = sim.session("missed")
                        await asyncio.wait_for(ready.wait(), 12)
                        sim.change("started", "live")
                        await observed(coord, lambda: "live" in coord.streams)
                await observed(coord, lambda: coord.sse_connected and coord.streams == sim.streams)
            else:
                # ready's own REST runs in the poll producer. Another ready while
                # it is held must request a subsequent fetch and not stall SSE.
                gate = sim.gates["servers"] = Gate()
                sim.event("ready", {})
                try:
                    await asyncio.wait_for(gate.entered.wait(), 5)
                    sim.streams["missed"] = sim.session("missed")
                    sim.event("ready", {})
                    sim.change("started", "live")
                    await observed(coord, lambda: "live" in coord.streams)
                finally:
                    gate.release.set()
                    sim.gates.pop("servers")
                await observed(coord, lambda: coord.streams == sim.streams)
            await views(b, entry, sim, ws)
            assert len(sim.clients) == 1
            clean(coord)
    asyncio.run(run())


@pytest.mark.parametrize("action", ["unload", "reload"])
def test_retirement_during_refresh_is_isolated(action):
    async def run():
        async with Tracearr().serve() as sim, Tracearr().serve() as other, core() as b, b.connect() as ws:
            entry, peer = await b.add(sim), await b.add(other)
            coord, keep = b.coord(entry), b.coord(peer)
            await ws.call("tracearr_ha/subscribe")
            sub = ws.seq
            await ws.snapshots(sub)
            async with held(sim, coord) as (gate, task):
                sim.change("started", "same")
                other.change("started", "same", state="paused")
                await observed(coord, lambda: coord.streams == sim.streams)
                await observed(keep, lambda: keep.streams == other.streams)
                # A future generation must not encounter this old HTTP gate.
                sim.gates.pop("servers")
                ce = b.hass.config_entries
                method = ce.async_reload if action == "reload" else ce.async_unload
                assert await asyncio.wait_for(method(entry.entry_id), 5)
                assert task.done() and task.cancelled()
                clean(coord)
                assert not coord._refresh_requested.is_set()
                assert coord._sse_task.done() and coord._poll_task.done()
                if action == "reload":
                    current = await b.ready(entry)
                    assert current is not coord
                    await views(b, entry, sim, ws)
                else:
                    await asyncio.wait_for(sim.no_clients.wait(), 5)
                await views(b, peer, other, ws)
                await ws.snapshots(sub)
                before = deepcopy(coord.streams)
                gate.release.set()
                await coord.async_refresh()
                assert coord.streams == before
                assert await ws.snapshots(sub) == []
    asyncio.run(run())


def test_reconciliation_cap_and_cleanup():
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            entry = await b.add(sim)
            coord = b.coord(entry)
            with patch.object(module, "_MAX_MUTATIONS", 2):
                async with held(sim, coord):
                    for i in range(5):
                        sim.change("started", str(i))
                    await observed(coord, lambda: coord.streams == sim.streams)
                    assert coord._stream_changes.overflow
                    assert not coord._stream_changes.rows
                await views(b, entry, sim, ws)
                clean(coord)
                sim.streams.clear()  # missed stops must be repaired, no stale markers
                await coord.async_refresh()
                await views(b, entry, sim, ws)
                clean(coord)
    asyncio.run(run())


def test_events_for_rows_only_in_inflight_rest():
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            entry = await b.add(sim)
            coord = b.coord(entry)
            sim.streams["stopped"] = sim.session("stopped")
            sim.streams["progress"] = sim.session("progress")
            server = {**sim.servers[0], "server_id": "00000000-0000-4000-9000-000000000001"}
            sim.servers.append(server)
            async with held(sim, coord):
                sim.change("stopped", "stopped")
                sim.change("progress", "progress", progress_ms=50000)
                server["status"] = "down"
                sim.event("server.health", server)
                # Known-server marker proves all prior frames were processed.
                sim.health("down")
                await observed(coord, lambda: next(iter(coord.servers.values()))["status"] == "down")
            await b.hass.async_block_till_done()
            await views(b, entry, sim, ws)
            assert coord.servers[server["server_id"]]["status"] == "down"
            clean(coord)
    asyncio.run(run())


def test_periodic_poll_and_ready_share_one_rest_producer():
    async def run():
        tick = Gate()
        real_timeout = asyncio.timeout

        @asynccontextmanager
        async def clock(seconds):
            # Fire exactly one real polling timeout, controlled by a barrier.
            # Other Core timeouts and the initial ready use the normal clock.
            if (asyncio.current_task().get_name() == "Tracearr poll"
                    and seconds == 60 and not tick.release.is_set()):
                await tick.wait()
                seconds = 0
            async with real_timeout(seconds):
                yield

        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            with patch.object(module.asyncio, "timeout", clock):
                entry = await b.add(sim)
                coord = b.coord(entry)
                await asyncio.wait_for(tick.entered.wait(), 5)
                # Missed SSE start recovered by the actual periodic path.
                sim.streams["polled"] = sim.session("polled")
                gate = sim.gates["servers"] = Gate()
                tick.release.set()
                try:
                    await asyncio.wait_for(gate.entered.wait(), 5)
                    # This missed event postdates the periodic snapshot.
                    sim.streams["ready"] = sim.session("ready")
                    sim.event("ready", {})
                    sim.change("started", "live")
                    await observed(coord, lambda: "live" in coord.streams)
                    assert "polled" not in coord.streams
                finally:
                    gate.release.set()
                    sim.gates.pop("servers")
                await observed(coord, lambda: coord.streams == sim.streams)
                await views(b, entry, sim, ws)
                assert len(sim.clients) == 1
                clean(coord)
    asyncio.run(run())


def v321_update(row):
    """Synthetic formatActiveStream without the /streams identity join."""
    return {
        **dict.fromkeys((
            "user_thumb", "user_avatar_url", "show_title", "season_number", "episode_number",
            "year", "artist_name", "album_name", "track_number", "disc_number", "thumb_path",
            "source_video_codec", "source_audio_codec", "source_audio_channels",
            "source_video_width", "source_video_height", "source_video_details",
            "source_audio_details", "stream_video_codec", "stream_audio_codec",
            "stream_video_details", "stream_audio_details", "transcode_info", "subtitle_info",
            "resolution", "audio_channels_display",
            "source_video_codec_display", "source_audio_codec_display", "stream_video_codec_display",
            "stream_audio_codec_display", "device", "player", "product", "platform", "media_id",
            "show_media_id", "imdb_id", "tmdb_id", "tvdb_id", "rating_key", "parent_rating_key",
            "grandparent_rating_key",
        )),
        **row,
        "library_id": None,
        "genres": None,
    }


def test_v321_updates_keep_rest_enrichment_every_refresh():
    async def run():
        async with Tracearr().serve() as sim:
            sim.streams["main"] = {
                **v321_update(sim.session("main")), "library_id": "fixture-library", "genres": ["Initial"],
            }
            async with core() as b, b.connect() as ws:
                entry = await b.add(sim)
                coord = b.coord(entry)
                samples = []
                for i in range(1, 4):
                    row = sim.streams["main"]
                    row.update(library_id=f"library-{i}", genres=[f"genre-{i}"])
                    async with held(sim, coord):
                        row["progress_ms"] = i * 3000
                        sim.event("stream.updated", v321_update(row))
                        await observed(coord, lambda: coord.streams["main"]["progress_ms"] == i * 3000)
                    clean(coord)
                    samples.append(deepcopy(coord.streams["main"]))
                assert [(s["library_id"], s["genres"], s["progress_ms"]) for s in samples] == [
                    (f"library-{i}", [f"genre-{i}"], i * 3000) for i in range(1, 4)
                ]
                await views(b, entry, sim, ws)
    asyncio.run(run())


def test_partial_changes_only_overlay_fields_sent():
    async def run():
        async with Tracearr().serve() as sim:
            sim.change("started", "main")
            async with core() as b, b.connect() as ws:
                entry = await b.add(sim)
                coord = b.coord(entry)
                sim.streams["main"]["bitrate"] = 2600
                async with held(sim, coord):
                    sim.event("stream.updated", {"id": "main", "state": "paused"})
                    await observed(coord, lambda: coord.streams["main"]["state"] == "paused")
                    sim.event("stream.progress", {"id": "main", "progress_ms": 45000})
                    await observed(coord, lambda: coord.streams["main"]["progress_ms"] == 45000)
                    assert coord.streams["main"]["bitrate"] == 1000  # GET not published yet
                    sim.streams["main"].update(state="paused", progress_ms=45000)
                await views(b, entry, sim, ws)
                clean(coord)
    asyncio.run(run())


def test_live_update_ignores_join_nulls_but_applies_explicit_clear():
    async def run():
        async with Tracearr().serve() as sim:
            sim.streams["main"] = {
                **v321_update(sim.session("main")), "library_id": "fixture-library",
                "genres": ["Fixture"], "bitrate": 2500,
            }
            async with core() as b, b.connect() as ws:
                entry = await b.add(sim)
                coord = b.coord(entry)
                await ws.call("tracearr_ha/subscribe")
                sub = ws.seq
                await ws.snapshots(sub)
                row = sim.streams["main"]
                row.update(bitrate=None, state="paused")
                sim.event("stream.updated", v321_update(row))
                await observed(coord, lambda: coord.streams["main"]["state"] == "paused")
                assert coord.streams["main"]["bitrate"] is None  # Tracearr's nullable bitrate
                await views(b, entry, sim, ws)
                (event,), = await ws.snapshots(sub)
                assert event["streams"] == [row] and event["stats"]["bandwidth_mbps"] == 0
    asyncio.run(run())


def test_stop_restart_same_id_never_inherits_inflight_old_row():
    async def run():
        async with Tracearr().serve() as sim:
            sim.change("started", "same", library_id="old-library", genres=["Old"], player="old player")
            async with core() as b, b.connect() as ws:
                entry = await b.add(sim)
                coord = b.coord(entry)
                async with held(sim, coord):
                    sim.change("stopped", "same")
                    await observed(coord, lambda: not coord.streams)
                    sim.event("stream.updated", {"id": "same", "state": "paused"})
                    sim.event("stream.progress", {"id": "same", "progress_ms": 50000})
                    sim.health("down")  # FIFO fence after the two late frames
                    await observed(coord, lambda: next(iter(coord.servers.values()))["status"] == "down")
                    assert not coord.streams
                    sim.change("started", "same", media_title="Nouveau")
                    sim.change("progress", "same", progress_ms=7000)
                    await observed(coord, lambda: coord.streams == sim.streams)
                    await views(b, entry, sim, ws)
                await views(b, entry, sim, ws)
                clean(coord)
                sim.streams["same"].update(library_id="new-library", genres=["New"], player="new player")
                await coord.async_refresh()
                await views(b, entry, sim, ws)
    asyncio.run(run())


def test_poll_error_leaves_sse_and_ha_error_intact():
    async def run():
        tick, settled = Gate(), asyncio.Event()
        real_timeout = asyncio.timeout

        @asynccontextmanager
        async def clock(seconds):
            if asyncio.current_task().get_name() == "Tracearr poll":
                if not tick.release.is_set() and seconds == 60:
                    await tick.wait()
                    seconds = 0
                elif tick.release.is_set():
                    # Next wait means the entire failing poll, including any
                    # post-refresh notification, has finished.
                    settled.set()
            async with real_timeout(seconds):
                yield

        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            with patch.object(module.asyncio, "timeout", clock):
                entry = await b.add(sim)
                coord = b.coord(entry)
                await ws.call("tracearr_ha/subscribe")
                sub = ws.seq
                await ws.snapshots(sub)
                await asyncio.wait_for(tick.entered.wait(), 5)
                sim.errors["streams"] = (503, {})
                tick.release.set()
                await asyncio.wait_for(settled.wait(), 5)
                await failure_views(b, entry, sim, ws, sub, sse=True)
                sim.change("started", "live")
                await observed(coord, lambda: "live" in coord.streams)
                await failure_views(b, entry, sim, ws, sub, sse=True)
                del sim.errors["streams"]
                await coord.async_refresh()
                assert (coord.connected, coord.sse_connected, coord.last_update_success) == (True, True, True)
                await views(b, entry, sim, ws)
    asyncio.run(run())


async def failure_views(b, entry, sim, ws, sub, *, sse):
    coord = b.coord(entry)
    assert (coord.connected, coord.sse_connected, coord.last_update_success) == (False, sse, False)
    assert isinstance(coord.last_exception, UpdateFailed)
    assert coord.data == coord.snapshot()
    row, = (await ws.call("tracearr_ha/get"))["entries"]
    assert {s["id"]: s for s in row["streams"]} == sim.streams
    assert (row["connected"], row["sse_connected"], row["stats"]["total"]) == (False, sse, len(sim.streams))
    events = await ws.snapshots(sub)
    assert events and events[-1] == [row]
    reg = er.async_get(b.hass)
    total = reg.async_get_entity_id("sensor", DOMAIN, entry.entry_id + "_total")
    connected = reg.async_get_entity_id("binary_sensor", DOMAIN, entry.entry_id + "_connected")
    assert b.hass.states.get(total).state == "unavailable"
    assert b.hass.states.get(connected).state == "off"


def test_ready_error_and_real_sse_recovery():
    async def run():
        failed_ready = asyncio.Queue()
        original = module.TracearrCoordinator.async_refresh

        async def witness(coord):
            await original(coord)
            if not coord.connected:
                failed_ready.put_nowait(None)

        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            entry = await b.add(sim)
            coord = b.coord(entry)
            await ws.call("tracearr_ha/subscribe")
            sub = ws.seq
            await ws.snapshots(sub)
            sim.errors["streams"] = (503, {})
            with patch.object(module.TracearrCoordinator, "async_refresh", witness):
                sim.event("ready", {})  # Redis subscription recovery on same SSE
                await asyncio.wait_for(failed_ready.get(), 5)
                assert len(sim.clients) == 1
                await failure_views(b, entry, sim, ws, sub, sse=True)
                sim.raw(None)
                await observed(coord, lambda: not coord.sse_connected)
                await failure_views(b, entry, sim, ws, sub, sse=False)
                await asyncio.wait_for(sim.no_clients.wait(), 5)
                # First catch-up on the new connection also fails. It cannot
                # confirm the transport, and does not mask the HA failure.
                await asyncio.wait_for(failed_ready.get(), 12)
                assert len(sim.clients) == 1
                assert (coord.connected, coord.sse_connected, coord.last_update_success) == (False, False, False)
                sim.change("started", "unconfirmed-live")
                await observed(coord, lambda: "unconfirmed-live" in coord.streams)
                await failure_views(b, entry, sim, ws, sub, sse=False)
            sim.streams["missed"] = sim.session("missed")
            del sim.errors["streams"]
            sim.event("ready", {})
            await observed(coord, lambda: coord.sse_connected and "missed" in coord.streams, timeout=12)
            assert coord.connected and coord.last_update_success and len(sim.clients) == 1
            await views(b, entry, sim, ws)
    asyncio.run(run())
