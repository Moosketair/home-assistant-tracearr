"""Malformed SSE and fragmented artwork, through the real HA backend."""
import asyncio
from contextlib import aclosing
from datetime import timedelta
import gzip

from aiohttp import ClientSession, ClientTimeout, web
from homeassistant.components.http.auth import async_sign_path
import pytest

from custom_components.tracearr_ha import frontend
from custom_components.tracearr_ha.api import TracearrClient
from core import core, observed
from simulateur import Gate, KEY, PNG, Tracearr


@pytest.mark.parametrize("bad_frame", [
    "missing-type", "unknown", "bad-envelope", "bad-bitrate", "bad-transcode",
    "bad-position", "nonfinite", "invalid-utf8", "surrogate", "deep-json", "nested-json",
    "long-line", "long-frame", "id-only",
    "bad-health", "bad-ready",
])
def test_bad_sse_frame_does_not_mutate_or_interrupt(bad_frame):
    frames = {
        "missing-type": b"data: {}\n\n",
        "unknown": b'event: future.event\ndata: {"data":{"id":"other"}}\n\n',
        "bad-envelope": b'data: {"type":"stream.stopped","data":[]}\n\n',
        "bad-bitrate": b'data: {"type":"stream.progress","data":{"id":"s","bitrate":"bad"}}\n\n',
        "bad-transcode": b'data: {"type":"stream.started","data":{"id":"other","is_transcode":[],"state":"playing"}}\n\n',
        "bad-position": b'data: {"type":"stream.updated","data":{"id":"s","progress_ms":null}}\n\n',
        "nonfinite": b'data: {"type":"stream.progress","data":{"id":"s","bitrate":1e999}}\n\n',
        "invalid-utf8": b'data: {"type":"stream.started","data":{"id":"\xff"}}\n\n',
        "surrogate": b'data: {"type":"stream.updated","data":{"id":"s","username":"\\ud800"}}\n\n',
        "deep-json": b"data: " + b"[" * 1500 + b"0" + b"]" * 1500 + b"\n\n",
        "nested-json": b'data: {"type":"stream.started","data":{"id":"other","extra":'
                       + b"[" * 100 + b"0" + b"]" * 100 + b"}}\n\n",
        "long-line": b"data: " + b"x" * 300_000 + b"\n\n",
        "long-frame": b'data: {"type":"stream.stopped",\n' + b"data:  \n" * 40_000
                      + b'data: "data":{"id":"s"}}\n\n',
        "id-only": b'data: {"type":"stream.started","data":{"id":"other"}}\n\n',
        "bad-health": b'data: {"type":"server.health","data":{"server_id":"00000000-0000-4000-8000-000000000001","status":[]}}\n\n',
        "bad-ready": b'data: {"type":"ready","data":null}\n\n',
    }

    async def run():
        async with Tracearr().serve() as sim, core() as bench:
            sim.change("started", "s")
            entry = await bench.add(sim)
            coord = bench.coord(entry)
            queue, = sim.clients
            ready_serial = coord._ready_serial
            async with bench.connect() as ws:
                await ws.call("tracearr_ha/subscribe")
                sub = ws.seq
                await ws.snapshots(sub)
                sim.raw(frames[bad_frame])
                # Multiple data lines, CRLF and fallback to the SSE event name.
                sim.raw(b': ping\r\n\r\nevent: stream.progress\r\n'
                        b'data: {"data":\r\ndata: {"id":"s","progress_ms":42,"bitrate":null}}\r\n\r\n')
                await observed(coord, lambda: coord.streams.get("s", {}).get("progress_ms") == 42)
                snapshots = await ws.snapshots(sub)
                assert len(snapshots) == 1
                snapshot = snapshots[0][0]
                assert [(row["id"], row["bitrate"]) for row in snapshot["streams"]] == [("s", None)]
                assert snapshot["stats"]["bandwidth_mbps"] == 0
                assert snapshot["sse_connected"] and coord.last_update_success
                assert sim.clients == {queue} and coord._ready_serial == ready_serial
                task = coord._sse_task
                assert not task.done()
                assert await bench.hass.config_entries.async_unload(entry.entry_id)
                assert task.cancelled() and coord._poll_task.cancelled()

    asyncio.run(asyncio.wait_for(run(), 12))


@pytest.mark.parametrize("error_type", [RuntimeError, TimeoutError])
def test_internal_sse_failure_is_diagnosed_without_leaking_data(monkeypatch, caplog, error_type):
    async def run():
        async with Tracearr().serve() as sim, core() as bench:
            sim.change("started", "s")
            entry = await bench.add(sim)
            coord = bench.coord(entry)
            task, poll = coord._sse_task, coord._poll_task
            serial = coord._ready_serial
            sensitive = f"Bearer {KEY} {sim.url}/?signature=fixture-private body-fixture-private"

            def apply_failure(_event):
                raise error_type(sensitive)

            monkeypatch.setattr(coord, "_apply_stream_event", apply_failure)
            async with bench.connect() as ws:
                await ws.call("tracearr_ha/subscribe")
                sub = ws.seq
                await ws.snapshots(sub)
                sim.change("progress", "s", progress_ms=1234)
                # Wait for completion without propagating the old task's error.
                done, _ = await asyncio.wait({task}, timeout=1)
                assert task in done, "internal errors must not enter the reconnect delay"
                snapshot = (await ws.snapshots(sub))[-1][0]
                assert snapshot["connected"] and not snapshot["sse_connected"]
                assert coord.connected and coord.last_update_success and not coord._sse_ready
                assert coord._ready_serial == serial and not poll.done()
                # Wake the unchanged recovery producer, not a manual refresh.
                coord._refresh_requested.set()
                await observed(coord, lambda: coord.streams["s"]["progress_ms"] == 1234)
                assert not coord.sse_connected and coord._ready_serial == serial
                assert await bench.hass.config_entries.async_unload(entry.entry_id)
                assert task.done() and poll.cancelled()
                errors = [r for r in caplog.records if r.name.endswith(".coordinator") and r.levelname == "ERROR"]
                assert len(errors) == 1
                assert "SSE" in errors[0].getMessage() and error_type.__name__ in errors[0].getMessage()
                assert "apply_failure:" in errors[0].getMessage()
                assert errors[0].exc_info is None and task.exception() is None
                for secret in (KEY, sim.url, "fixture-private", "Bearer"):
                    assert secret not in caplog.text

    asyncio.run(asyncio.wait_for(run(), 12))


@pytest.mark.parametrize("cancel", [False, True])
def test_sse_source_is_closed_on_task_end(monkeypatch, cancel):
    async def run():
        async with Tracearr().serve() as sim, core() as bench:
            events = TracearrClient.events
            closed = asyncio.Event()

            async def observe_source(self):
                try:
                    async with aclosing(events(self)) as source:
                        async for event in source:
                            yield event
                finally:
                    closed.set()

            # Keep a reference so GC cannot close the source on the task's
            # behalf, masking whether the coordinator explicitly closed it.
            sources = []

            def tracked_source(self):
                source = observe_source(self)
                sources.append(source)
                return source

            monkeypatch.setattr(TracearrClient, "events", tracked_source)
            entry = await bench.add(sim)
            coord = bench.coord(entry)
            task = coord._sse_task
            if cancel:
                assert await bench.hass.config_entries.async_unload(entry.entry_id)
                assert task.cancelled()
            else:
                def apply_failure(_event):
                    raise ValueError("fixture")

                monkeypatch.setattr(coord, "_apply_stream_event", apply_failure)
                sim.change("started", "s")
                await asyncio.wait({task})
            try:
                assert closed.is_set()
                assert cancel or task.exception() is None
                assert not coord.client.session.closed
            finally:
                await sources[0].aclose()

    asyncio.run(asyncio.wait_for(run(), 12))


class ArtworkTracearr(Tracearr):
    def __init__(self, mode):
        super().__init__()
        self.mode = mode
        self.calls = 0

    async def handle(self, request):
        if request.match_info.get("resource"):
            return await super().handle(request)
        self.calls += 1
        assert request.headers.get("Authorization") == f"Bearer {KEY}"
        if self.mode == "redirect":
            raise web.HTTPFound("/api/v1/images/proxy?redirected=1")
        if self.mode == "mime":
            return web.Response(body=PNG, content_type="image/svg+xml")
        if self.mode == "encoded":
            return web.Response(body=gzip.compress(PNG), headers={
                "Content-Type": "image/png", "Content-Encoding": "gzip",
            })
        mime = "image/png" if self.mode in ("length", "truncated") else "application/octet-stream"
        response = web.StreamResponse(headers={"Content-Type": mime})
        if self.mode in ("length", "truncated"):
            response.content_length = len(PNG)
        elif self.mode == "declared-over":
            response.content_length = 8_000_001
        await response.prepare(request)
        if self.mode == "declared-over":
            return response
        # Split even the signature so sniffing a prefix cannot succeed.
        await response.write(PNG[:3])
        await self.gates["image"].wait()
        if self.mode == "timeout":
            return response
        if self.mode == "truncated":
            request.transport.close()
        elif self.mode == "chunked-over":
            await response.write_eof(b"x" * 7_999_998)
        elif self.mode == "exact":
            await response.write_eof(PNG[3:] + b"x" * (8_000_000 - len(PNG)))
        else:
            await response.write_eof(PNG[3:])
        return response


async def sign(bench, path, seconds=600):
    user = await bench.hass.auth.async_create_user("Lecteur image de recette")
    token = await bench.hass.auth.async_create_refresh_token(user, client_id="http://localhost/")
    return async_sign_path(bench.hass, path, timedelta(seconds=seconds), refresh_token_id=token.id)


@pytest.mark.parametrize(("mode", "status"), [
    ("length", 200), ("chunked", 200), ("exact", 200), ("truncated", 502),
    ("chunked-over", 413), ("declared-over", 413), ("redirect", 404), ("mime", 415),
    ("encoded", 502), ("timeout", 502),
])
def test_artwork_http(mode, status, monkeypatch):
    if mode == "timeout":
        def short_timeout(*, total):
            assert total == 20
            return ClientTimeout(total=0.5)
        monkeypatch.setattr(frontend, "ClientTimeout", short_timeout)

    async def run():
        async with ArtworkTracearr(mode).serve() as sim, core() as bench, ClientSession() as client:
            sim.change("started", "s", user_avatar_url="/api/v1/images/proxy?fixture=2")
            entry = await bench.add(sim)
            coord = bench.coord(entry)
            path = f"/api/tracearr_ha/image/{entry.entry_id}/s/{'avatar' if mode == 'length' else 'poster'}"
            signed = await sign(bench, path)
            gate = sim.gates["image"] = Gate()

            async def fetch():
                async with client.get(bench.server.make_url(signed)) as response:
                    return response.status, response.headers, await response.read()

            async with asyncio.TaskGroup() as group:
                request = group.create_task(fetch())
                if mode not in ("declared-over", "redirect", "mime", "encoded"):
                    await gate.entered.wait()
                    # Give the proxy the opportunity to consume the prefix while
                    # the upstream demonstrably still holds the rest.
                    if mode != "timeout":
                        await asyncio.wait({request}, timeout=0.15)
                        gate.release.set()
            gate.release.set()
            returned_status, headers, body = request.result()
            assert returned_status == status
            assert sim.calls == 1
            if status == 200:
                assert body == PNG + (b"x" * (8_000_000 - len(PNG)) if mode == "exact" else b"")
                assert headers["Content-Type"] == "image/png"
                assert headers["Cache-Control"] == "private, max-age=60"
                assert headers["X-Content-Type-Options"] == "nosniff"
            else:
                assert not body
            assert not coord.client.session.closed
            assert (await coord.client.servers())["data"]

    asyncio.run(asyncio.wait_for(run(), 15))


def test_artwork_access_boundaries():
    async def run():
        async with ArtworkTracearr("chunked").serve() as sim, core() as bench, ClientSession() as client:
            sim.change("started", "s")
            entry = await bench.add(sim)
            coord = bench.coord(entry)
            path = f"/api/tracearr_ha/image/{entry.entry_id}/s/poster"

            async def check(url, status):
                async with client.get(bench.server.make_url(url)) as response:
                    assert response.status == status

            await check(path, 401)
            await check(await sign(bench, path, -60), 401)
            await check(await sign(bench, path.replace("/s/", "/absent/")), 404)
            await check(await sign(bench, path.replace("/poster", "/banner")), 404)
            signed = await sign(bench, path)
            for uri in ("https://example.invalid/api/v1/images/proxy", "/other"):
                coord.streams["s"]["poster_url"] = uri
                await check(signed, 404)
            sim.change("stopped", "s")
            await observed(coord, lambda: "s" not in coord.streams)
            await check(signed, 404)
            assert sim.calls == 0

    asyncio.run(asyncio.wait_for(run(), 12))


def test_music_poster_revision_is_signed_and_does_not_change_proxy_target():
    class MusicArtwork(Tracearr):
        async def handle(self, request):
            if not request.match_info.get("resource"):
                assert set(request.query) == {"fixture"}
            return await super().handle(request)

    async def run():
        async with MusicArtwork().serve() as sim, core() as bench, ClientSession() as client:
            sim.change("started", "s", media_type="track", rating_key="101")
            entry = await bench.add(sim)
            path = f"/api/tracearr_ha/image/{entry.entry_id}/s/poster?rev=abc"
            signed = await sign(bench, path)
            async with client.get(bench.server.make_url(signed)) as response:
                assert response.status == 200
                assert await response.read() == PNG
                assert response.headers["Cache-Control"] == "private, max-age=60"
            async with client.get(bench.server.make_url(signed.replace("rev=abc", "rev=def"))) as response:
                assert response.status == 401

    asyncio.run(asyncio.wait_for(run(), 12))
