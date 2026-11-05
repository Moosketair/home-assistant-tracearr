"""Artwork proxy regression tests without importing Home Assistant."""
import ast
import asyncio
import logging
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlsplit

from aiohttp import ClientError, ClientSession, ClientTimeout, web


SOURCE = Path(__file__).resolve().parents[1] / "custom_components/tracearr_ha/frontend.py"


def load_artwork_view():
    module = ast.parse(SOURCE.read_text())
    node = next(n for n in module.body if isinstance(n, ast.ClassDef) and n.name == "TracearrArtworkView")
    namespace = {
        "HomeAssistantView": object,
        "KEY_HASS": "hass",
        "DOMAIN": "tracearr_ha",
        "urlsplit": urlsplit,
        "web": web,
        "ClientError": ClientError,
        "ClientTimeout": ClientTimeout,
        "_LOGGER": logging.getLogger(__name__),
        "MAX_ARTWORK_BYTES": 8_000_000,
    }
    exec(compile(ast.fix_missing_locations(ast.Module(body=[node], type_ignores=[])), str(SOURCE), "exec"), namespace)
    return namespace["TracearrArtworkView"]


def test_artwork_proxy_uses_image_accept_and_accepts_octet_stream():
    async def scenario():
        seen = []
        png = b"\x89PNG\r\n\x1a\n" + b"test image bytes"

        async def image(request):
            seen.append((request.headers.get("Accept"), request.headers.get("Authorization")))
            return web.Response(body=png, content_type="application/octet-stream")

        app = web.Application()
        app.router.add_get("/api/v1/images/proxy", image)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        try:
            async with ClientSession() as session:
                base = f"http://127.0.0.1:{port}"
                client = SimpleNamespace(base_url=base, session=session,
                    headers={"Authorization": "Bearer test", "Accept": "application/json"})
                coord = SimpleNamespace(client=client,
                    streams={"s": {"poster_url": f"{base}/api/v1/images/proxy?key=abc"}})
                hass = SimpleNamespace(data={"tracearr_ha": {"e": coord}})
                req = SimpleNamespace(app={"hass": hass})
                view = load_artwork_view()()
                response = await view.get(req, "e", "s", "poster")
                assert response.status == 200
                assert response.content_type == "image/png"
                assert response.body == png
                assert seen == [("image/avif,image/webp,image/*,*/*;q=0.8", "Bearer test")]
                # Reject an arbitrary external URL even if the stream references it.
                coord.streams["s"]["poster_url"] = "https://example.org/api/v1/images/proxy"
                assert (await view.get(req, "e", "s", "poster")).status == 404
                assert len(seen) == 1
        finally:
            await runner.cleanup()

    asyncio.run(scenario())


def test_artwork_proxy_rejects_non_images():
    async def scenario():
        async def bad_image(request):
            return web.Response(body=b"<html>not an image</html>", content_type="application/octet-stream")

        app = web.Application()
        app.router.add_get("/api/v1/images/proxy", bad_image)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        try:
            async with ClientSession() as session:
                base = f"http://127.0.0.1:{port}"
                client = SimpleNamespace(base_url=base, session=session, headers={})
                coord = SimpleNamespace(client=client, streams={"s":{"poster_url":"/api/v1/images/proxy"}})
                req = SimpleNamespace(app={"hass": SimpleNamespace(data={"tracearr_ha":{"e":coord}})})
                assert (await load_artwork_view()().get(req,"e","s","poster")).status == 415
        finally:
            await runner.cleanup()

    asyncio.run(scenario())
