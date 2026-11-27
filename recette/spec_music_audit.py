"""6C.3.A counterexamples using the public REST/SSE and HA WebSocket bench."""
import asyncio

import pytest

from core import core, observed
from simulateur import Tracearr
from spec_race import held, views
from custom_components.tracearr_ha import coordinator as module
from custom_components.tracearr_ha.model import PlaybackIdentity


def track(sim, key, **fields):
    return sim.session("same", media_type="track", rating_key=key, media_id=f"m{key}",
                       media_title=f"Morceau {key}", artist_name=f"Artiste {key}",
                       album_name=f"Album {key}", genres=[key], **fields)


def test_audit_p11_lost_identity_does_not_overlay_next_rest_track():
    async def run():
        async with Tracearr().serve() as sim, core() as bench, bench.connect() as ws:
            a, b = track(sim, "a"), track(sim, "b", progress_ms=100, poster_url=None)
            sim.streams["same"] = a
            entry = await bench.add(sim)
            coord = bench.coord(entry)
            sim.streams["same"] = b
            async with held(sim, coord):
                sim.event("stream.updated", {**a, "rating_key": None, "media_id": None, "genres": None})
                sim.event("stream.progress", {"id": "same", "server_id": a["server_id"], "progress_ms": 4800})
                await observed(coord, lambda: coord.streams["same"]["progress_ms"] == 4800)
            await views(bench, entry, sim, ws)
    asyncio.run(run())


def test_audit_p11_progress_for_unknown_id_is_scoped_to_server():
    async def run():
        async with Tracearr().serve() as sim, core() as bench, bench.connect() as ws:
            entry = await bench.add(sim)
            coord = bench.coord(entry)
            sim.streams["same"] = track(sim, "b", server=1, progress_ms=100)
            async with held(sim, coord):
                sim.event("stream.progress", {
                    "id": "same", "server_id": sim.servers[0]["server_id"], "progress_ms": 4800,
                })
                sim.health("down")
                await observed(coord, lambda: coord.servers[sim.servers[0]["server_id"]]["status"] == "down")
            await views(bench, entry, sim, ws)
    asyncio.run(run())


@pytest.mark.parametrize("media_type", ["track", "movie", "episode", "trailer"])
@pytest.mark.parametrize("inflight", [False, True])
def test_audit_p12_stopped_play_cannot_resurrect(media_type, inflight):
    async def run():
        async with Tracearr().serve() as sim, core() as bench:
            a = sim.session("same", media_type=media_type, rating_key="a", media_id="ma")
            b = {**a, "started_at": "2026-01-01T12:01:00Z", "progress_ms": 100}
            sim.streams["same"] = a
            entry = await bench.add(sim)
            coord = bench.coord(entry)

            async def frame(kind, data):
                sim.event(kind, data)
                sim.health("down" if sim.servers[0]["status"] == "up" else "up")
                target = sim.servers[0]["status"]
                await observed(coord, lambda: coord.servers[a["server_id"]]["status"] == target)

            if inflight:
                sim.streams["same"] = b
                async with held(sim, coord):
                    await frame("stream.stopped", {"id": "same", "server_id": a["server_id"], "stream": a})
                    await frame("stream.started", b)
                    await frame("stream.updated", a)
                    assert coord.streams["same"] == b
                assert coord.streams["same"] == b
            else:
                sim.streams.clear()
                await frame("stream.stopped", {"id": "same", "server_id": a["server_id"], "stream": a})
                await frame("stream.updated", a)
                assert "same" not in coord.streams
                # A valid new play may reuse the server, ID and rating key.
                sim.streams["same"] = b
                await frame("stream.started", b)
                await frame("stream.updated", a)
                assert coord.streams["same"] == b
    asyncio.run(run())


@pytest.mark.parametrize("final", ["a", "c"])
def test_audit_p21_does_not_mix_playback_fields_across_observed_intermediate_track(final):
    async def run():
        async with Tracearr().serve() as sim, core() as bench, bench.connect() as ws:
            a = track(sim, "a", progress_ms=5500, bitrate=900, stream_audio_codec="FLAC")
            b = track(sim, "b")
            last = track(sim, final)
            for key in ("progress_ms", "bitrate", "stream_audio_codec", "poster_url"):
                last.pop(key, None)
            sim.streams["same"] = a
            entry = await bench.add(sim)
            coord = bench.coord(entry)
            if final == "c":
                sim.streams["same"] = {**last, "progress_ms": 120, "bitrate": 255}
            async with held(sim, coord):
                sim.event("stream.updated", b)
                await observed(coord, lambda: coord.streams["same"]["rating_key"] == "b")
                sim.event("stream.updated", {**last, "genres": None})
                await observed(coord, lambda: coord.streams["same"]["rating_key"] == final)
            expected = last if final == "a" else sim.streams["same"]
            assert coord.streams["same"] == expected
            sim.streams["same"] = expected
            await views(bench, entry, sim, ws)
    asyncio.run(run())


@pytest.mark.parametrize("stop_start", [False, True])
def test_audit_p22_null_canonical_id_keeps_proven_rest_enrichment(stop_start):
    async def run():
        async with Tracearr().serve() as sim, core() as bench, bench.connect() as ws:
            a = track(sim, "a")
            b = track(sim, "b", started_at="2026-01-01T12:01:00Z", progress_ms=900)
            b["library_id"] = "fictional"
            sim.streams["same"] = a
            entry = await bench.add(sim)
            coord = bench.coord(entry)
            sim.streams["same"] = b
            async with held(sim, coord):
                if stop_start:
                    sim.event("stream.stopped", {"id": "same", "server_id": a["server_id"], "stream": a})
                    await observed(coord, lambda: not coord.streams)
                sim.event("stream.started" if stop_start else "stream.updated",
                          {**b, "media_id": None, "genres": None, "library_id": None})
                await observed(coord, lambda: coord.streams.get("same", {}).get("rating_key") == "b")
            await views(bench, entry, sim, ws)
    asyncio.run(run())


def test_retired_proofs_are_bounded_by_id_incarnation_and_age(monkeypatch):
    monkeypatch.setattr(module, "_MAX_STOPPED_IDS", 2)
    marks = module._StoppedPlays()
    for start in range(5):
        marks.remember("reuse", PlaybackIdentity("server", "track", "a", None, str(start)), start)
    assert [play.started_at for _, play in marks.recent("reuse", 5)] == ["1", "2", "3", "4"]
    marks.remember("second", PlaybackIdentity("server"), 5)
    marks.remember("third", PlaybackIdentity("server"), 6)
    assert not marks.recent("reuse", 6)
    assert set(marks.rows) == {"second", "third"}
    assert not marks.recent("third", 6 + module._STOP_TTL)
    assert not marks.rows


def test_retired_proof_does_not_block_rest_recovery_or_cross_reload():
    async def run():
        async with Tracearr().serve() as sim, core() as bench:
            a, b = track(sim, "a"), track(sim, "b", started_at="2026-01-01T12:01:00Z")
            sim.streams["same"] = a
            entry = await bench.add(sim)
            coord = bench.coord(entry)
            sim.change("stopped", "same")
            await observed(coord, lambda: not coord.streams)
            sim.raw(None)
            await observed(coord, lambda: not coord.sse_connected)
            sim.streams["same"] = b
            await coord.async_refresh()
            assert coord.streams == sim.streams and not coord.data["streams_stale"]
            assert coord._stopped_plays.rows
            assert await bench.hass.config_entries.async_reload(entry.entry_id)
            replacement = await bench.ready(entry)
            assert not coord._stopped_plays.rows and not coord._stream_identities
            assert replacement.streams == sim.streams and not replacement._stopped_plays.rows
    asyncio.run(run())


def test_partial_streams_from_two_servers_are_never_coalesced():
    async def run():
        async with Tracearr().serve() as sim, core() as bench, bench.connect() as ws:
            entry = await bench.add(sim)
            coord = bench.coord(entry)
            b = track(sim, "b", server=1, progress_ms=100)
            expected = {**b, "progress_ms": 520}
            sim.streams["same"] = b
            async with held(sim, coord):
                sim.event("stream.progress", {
                    "id": "same", "server_id": sim.servers[0]["server_id"], "bitrate": 999,
                })
                sim.event("stream.progress", {"id": "same", "server_id": b["server_id"], "progress_ms": 520})
                sim.health("down")
                await observed(coord, lambda: coord.servers[sim.servers[0]["server_id"]]["status"] == "down")
            sim.streams["same"] = expected
            await views(bench, entry, sim, ws)
    asyncio.run(run())
