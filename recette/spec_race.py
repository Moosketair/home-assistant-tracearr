"""P1-B: stale /streams snapshot vs. newer events on the actual SSE socket."""
import asyncio
from copy import deepcopy
from unittest.mock import patch

import pytest

from custom_components.tracearr_ha.api import TracearrClient
from core import core, observed
from simulateur import Gate, Tracearr


class StaleSnapshot(AssertionError):
    """Final cache equals the exact stale snapshot, not an arbitrary mismatch."""


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


@pytest.mark.parametrize("case", CASES)
@pytest.mark.xfail(strict=True, raises=StaleSnapshot, reason="A2: stale REST snapshot wins")
def test_latest_stream_state(case):
    async def run():
        first_decoded = asyncio.Event()
        applied_before_release = []
        upstream = TracearrClient.events

        async def witness(client):
            async for event in upstream(client):
                if event["type"].startswith("stream."):
                    first_decoded.set()
                yield event  # no extra await between decoding and production dispatch
                if event["type"].startswith("stream.") and not gate.release.is_set():
                    applied_before_release.append(deepcopy(coord.streams))

        async with Tracearr().serve() as sim:
            sim.change("started", "main", state="paused" if case == "resume" else "playing")
            sim.change("started", "parallel", server=1)
            with patch.object(TracearrClient, "events", witness):
                async with core() as bench:
                    entry = await bench.add(sim)
                    coord = bench.coord(entry)
                    old = deepcopy(sim.streams)
                    assert coord.streams == old
                    gate = sim.gates["servers"] = Gate()
                    refresh = asyncio.create_task(coord.async_refresh())
                    try:
                        await asyncio.wait_for(gate.entered.wait(), 5)  # /streams already returned
                        for kind, sid, fields in CASES[case]:
                            sim.change(kind, sid, **fields)
                        # Synchronize on ingress, not on application under a
                        # future shared lock (that would deadlock the fixed code).
                        await asyncio.wait_for(first_decoded.wait(), 5)
                    finally:
                        gate.release.set()
                        await asyncio.wait_for(refresh, 5)
                    assert coord.last_update_success
                    # FIFO marker behind all stream events; no later REST rescue.
                    sim.health("down")
                    await observed(coord, lambda: coord.servers[sim.servers[0]["server_id"]]["status"] == "down")
                    assert sim.streams != old
                    # Depending on TCP chunking, trailing sequence events can be
                    # processed after the REST response. The first change is on
                    # a distinct stream and must survive in all orderings.
                    if coord.streams != sim.streams:
                        assert applied_before_release and applied_before_release[0] != old
                        if coord.streams == old:
                            raise StaleSnapshot(f"{case}: final cache equals pre-event REST data")
                        if case == "sequence" and coord.streams == {
                            **sim.streams, "parallel": old["parallel"]
                        }:
                            raise StaleSnapshot("sequence: earlier progress lost, trailing update preserved")
                    assert coord.streams == sim.streams
    asyncio.run(run())
