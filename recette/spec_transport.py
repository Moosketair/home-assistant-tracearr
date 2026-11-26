"""Positive controls, independent of the two expected stable failures."""
import asyncio
from contextlib import aclosing

from aiohttp import ClientSession
import pytest

from custom_components.tracearr_ha.api import TracearrAuthError, TracearrClient, TracearrRateLimited
from core import core, observed
from simulateur import Gate, KEY, PNG, Tracearr


def test_api_contract_and_fragments():
    async def run():
        async with Tracearr().serve() as sim, ClientSession() as session:
            client = TracearrClient(session, sim.url, KEY)
            with pytest.raises(TracearrAuthError):
                await TracearrClient(session, sim.url, "invalid").servers()
            assert {s["server_type"] for s in (await client.servers())["data"]} == {"plex", "jellyfin", "emby"}
            assert await client.users() == []
            assert (await client.get("history"))["meta"]["nextCursor"] is None
            sim.errors["streams"] = 429, {"Retry-After": "7"}
            with pytest.raises(TracearrRateLimited) as limited:
                await client.streams()
            assert limited.value.retry_after == 7
            del sim.errors["streams"]
            async with aclosing(client.events()) as events:
                assert (await anext(events))["type"] == "ready"
                sim.raw(b": ping\n\ndata: {broken}\n\ndata: {}\n\n")
                sim.change("started", "wire")
                assert (await anext(events))["data"] == (await client.streams())["data"][0]
            gate = sim.gates["image"] = Gate()
            async with session.get(sim.url + "/api/v1/images/proxy", headers=client.headers) as res:
                await gate.entered.wait()
                assert res.status == 200
                prefix = await res.content.readexactly(8)
                gate.release.set()
                assert prefix + await res.read() == PNG
    asyncio.run(asyncio.wait_for(run(), 10))


def test_disconnect_ready_resynchronizes():
    async def run():
        async with Tracearr().serve() as sim, core() as bench:
            entry = await bench.add(sim)
            coord = bench.coord(entry)
            sim.raw(None)  # EOF, not cancellation of the coordinator
            await observed(coord, lambda: not coord.sse_connected)
            sim.change("started", "while-offline")
            # Real coordinator has a 5 s backoff after ready.
            await observed(coord, lambda: coord.sse_connected and "while-offline" in coord.streams, timeout=12)
            assert len(sim.clients) == 1
    asyncio.run(run())
