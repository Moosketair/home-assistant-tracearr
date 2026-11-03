"""Local HTTP test of the public REST + SSE client (no real API key required)."""
import asyncio
import importlib.util
import json
from pathlib import Path

from aiohttp import ClientSession, web

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
