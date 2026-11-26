"""A10: an invalid REST recovery must not corrupt sensors or the domain socket."""
import asyncio

from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.update_coordinator import UpdateFailed

from core import DOMAIN, core, observed
from simulateur import Tracearr
from spec_race import held


def state(bench, entry, domain, suffix):
    entity_id = er.async_get(bench.hass).async_get_entity_id(domain, DOMAIN, f"{entry.entry_id}_{suffix}")
    return bench.hass.states.get(entity_id).state


def test_invalid_rest_recovery_preserves_stale_cache_and_other_entry():
    async def run():
        async with Tracearr().serve() as sim, Tracearr().serve() as other, core() as b, b.connect() as ws:
            other.servers[0]["server_id"] = "other-server"
            sim.change("started", "tv", bitrate=2000)
            other.change("started", "other", bitrate=3000)
            entry, second = await b.add(sim), await b.add(other)
            coord = b.coord(entry)
            await ws.call("tracearr_ha/subscribe")
            sub = ws.seq
            initial, = await ws.snapshots(sub)
            previous = {row["id"]: row for row in initial}[entry.entry_id]

            sim.errors["events"] = (503, {})
            sim.raw(None)
            await observed(coord, lambda: not coord.sse_connected)
            sim.errors["streams"] = (503, {})
            await coord.async_refresh()

            async def check_stale():
                rows = {row["id"]: row for row in (await ws.call("tracearr_ha/get"))["entries"]}
                row = rows[entry.entry_id]
                assert not row["connected"] and not row["sse_connected"] and row["streams_stale"]
                assert row["streams"] == previous["streams"] and row["stats"] == previous["stats"]
                assert row["last_sync"] == previous["last_sync"]
                assert state(b, entry, "binary_sensor", "connected") == "off"
                assert state(b, entry, "sensor", "bandwidth_mbps") == "unavailable"
                assert state(b, second, "sensor", "bandwidth_mbps") != "unavailable"
                assert not coord.last_update_success and isinstance(coord.last_exception, UpdateFailed)
                return rows

            await check_stale()
            await ws.snapshots(sub)
            del sim.errors["streams"]
            sim.streams["tv"]["bitrate"] = "inexploitable"
            await coord.async_refresh()
            await check_stale()

            other.change("progress", "other", bitrate=4000)
            await observed(b.coord(second), lambda: b.coord(second).data["stats"]["bandwidth_mbps"] == 4)
            rows = await check_stale()
            notices = await ws.snapshots(sub)
            assert notices and {r["id"]: r for r in notices[-1]} == rows
            assert rows[second.entry_id]["stats"]["bandwidth_mbps"] == 4
            assert float(state(b, second, "sensor", "bandwidth_mbps")) == 4

            # A sparse row and explicit nulls are data, not a corrupt snapshot.
            optional = {"id": "new", "bitrate": None, "duration_ms": None, "poster_url": None,
                        "video_decision": None, "library_id": None, "genres": None}
            sim.streams = {"new": optional}
            await coord.async_refresh()
            restored, = await ws.snapshots(sub)
            row = next(r for r in restored if r["id"] == entry.entry_id)
            assert row["connected"] and not row["streams_stale"] and coord.last_update_success
            assert row["streams"] == [optional] and row["stats"]["bandwidth_mbps"] == 0
            assert float(state(b, entry, "sensor", "total")) == 1
            assert state(b, entry, "binary_sensor", "connected") == "on"

            sim.streams.clear()
            await coord.async_refresh()
            empty, = await ws.snapshots(sub)
            row = next(r for r in empty if r["id"] == entry.entry_id)
            assert not row["streams_stale"] and row["streams"] == []
            assert float(state(b, entry, "sensor", "total")) == 0

    asyncio.run(run())


def test_rejected_rest_does_not_undo_concurrent_sse():
    async def run():
        async with Tracearr().serve() as sim, core() as b, b.connect() as ws:
            sim.change("started", "tv")
            entry = await b.add(sim)
            coord = b.coord(entry)
            await ws.call("tracearr_ha/subscribe")
            sub = ws.seq
            await ws.snapshots(sub)

            sim.responses["streams"] = {"data": [sim.session("tv", is_transcode="inexploitable")]}
            async with held(sim, coord):
                sim.event("stream.progress", {"id": "tv", "bitrate": "inexploitable"})
                sim.change("progress", "tv", progress_ms=17000, bitrate=None)
                await observed(coord, lambda: coord.streams["tv"]["progress_ms"] == 17000)
                live, = await ws.snapshots(sub)
                assert live[0]["streams"][0]["bitrate"] is None
            rejected, = await ws.snapshots(sub)
            row, = rejected
            assert (row["connected"], row["sse_connected"], row["streams_stale"]) == (False, True, False)
            assert row["streams"] == live[0]["streams"] and row["stats"] == live[0]["stats"]
            assert not coord.last_update_success and isinstance(coord.last_exception, UpdateFailed)
            assert state(b, entry, "binary_sensor", "connected") == "off"
            assert state(b, entry, "sensor", "total") == "unavailable"
            assert (await ws.call("tracearr_ha/get"))["entries"] == rejected

            sim.responses.clear()
            await coord.async_refresh()
            assert float(state(b, entry, "sensor", "total")) == 1

    asyncio.run(run())
