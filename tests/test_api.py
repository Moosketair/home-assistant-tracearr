"""Local HTTP test of the public REST + SSE client (no real API key required)."""
import asyncio
import importlib.util
import json
from pathlib import Path

from aiohttp import ClientSession, web
import pytest

path = Path(__file__).resolve().parents[1] / "custom_components/tracearr_ha/api.py"
spec = importlib.util.spec_from_file_location("tracearr_api", path)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


def test_local_api_and_sse():
    async def scenario():
        app = web.Application()

        async def servers(request):
            assert request.headers["Authorization"] == "Bearer trr_pub_test"
            return web.json_response({"data": [{"server_id": "s1", "server_name": "Jellyfin", "status": "up"}], "tracearr_version": "2.7.0"})

        async def streams(request):
            return web.json_response({"summary": {"total": 0}, "data": []})

        async def events(request):
            response = web.StreamResponse(status=200, headers={"Content-Type": "text/event-stream"})
            await response.prepare(request)
            for frame in [": ping\n\n", 'retry: 5000\n\nevent: ready\ndata: {"type":"ready","at":"2026-11-03T10:00:00Z","data":{}}\n\n',
                          'event: stream.progress\ndata: {"type":"stream.progress","data":{"id":"a","progress_ms":42000}}\n\n']:
                await response.write(frame.encode())
            await response.write_eof()
            return response

        app.router.add_get("/api/v2/public/servers", servers)
        app.router.add_get("/api/v2/public/streams", streams)
        app.router.add_get("/api/v2/public/events", events)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        try:
            async with ClientSession() as session:
                client = api.TracearrClient(session, f"http://127.0.0.1:{port}", "trr_pub_test")
                assert (await client.servers())["data"][0]["status"] == "up"
                assert (await client.streams())["summary"]["total"] == 0
                received = [event async for event in client.events()]
                assert [evt["type"] for evt in received] == ["ready", "stream.progress"]
                assert received[-1]["data"]["progress_ms"] == 42000
        finally:
            await runner.cleanup()

    asyncio.run(scenario())


def test_sse_delimiters_split_utf8_and_unterminated_eof():
    class Stream:
        async def iter_chunked(self, _size):
            for chunk in (
                b": comment\r",
                b'\n\r\nevent: stream.started\r',
                b'\ndata: {"data":{"id":"\xc3',
                b'\xa9"}}\r',
                b'\n\r',
                b'\nevent: ready\rdata: {"data":{}}\r\r',
                b'event: ready\ndata: {"data":{}}\n',
            ):
                yield chunk

    async def scenario():
        assert [event async for event in api._sse_frames(Stream())] == [
            {"type": "stream.started", "data": {"id": "é"}},
            {"type": "ready", "data": {}},
        ]

    asyncio.run(scenario())


@pytest.mark.parametrize("encoded", [
    "{",
    '{"data":[{"id":"a","extra":NaN}]}',
    '{"data":[{"id":"a","extra":9223372036854775808}]}',
    r'{"data":[{"id":"a","extra":"\ud800"}]}',
    '{"data":' + "[" * 65 + "0" + "]" * 65 + "}",
])
def test_rest_snapshot_rejects_unsendable_json(encoded):
    async def scenario():
        class Response:
            status = 200

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

            async def json(self, *, content_type, loads=json.loads):
                return loads(encoded)

        class Session:
            def get(self, *args, **kwargs):
                return Response()

        client = api.TracearrClient(Session(), "http://127.0.0.1", "fixture")
        for endpoint in (client.streams, client.servers):
            with pytest.raises(api.TracearrUnavailable, match="^Invalid Tracearr JSON snapshot$"):
                await endpoint()

    asyncio.run(scenario())
