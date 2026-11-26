"""Pilot the existing Tracearr fixture for the isolated HA dashboard (loopback)."""
import argparse

from aiohttp import web

from simulateur import KEY, Tracearr

PORT = 18425
NEXT_KEY = KEY + "_rotated"


def application(key=KEY):
    sim = Tracearr()

    def reset():
        sim.raw(None)
        sim.key = key
        sim.errors.clear()
        sim.responses.clear()
        sim.streams.clear()
        sim.change("started", "lan", username="alice", media_title="Orbite de recette",
                   bitrate=8000, progress_ms=17000, duration_ms=900000, poster_url=None)
        sim.change("started", "wan", server=1, username="bob", media_title="Voyage fictif",
                   bitrate=2500, progress_ms=30000, duration_ms=900000, poster_url=None)

    def grid_playback(count):
        for sid in list(sim.streams):
            sim.change("stopped", sid)
        if count:
            sim.change(
                "started", "lan", username="alice", media_title="Orbite de recette", poster_url=None,
                bitrate=8000, resolution="4K", source_video_width=3840, source_video_height=2160,
                source_video_codec="hevc", stream_video_codec="h264", stream_video_details={"width": 1920, "height": 1080},
                source_video_details={"dynamicRange": "HDR10+"}, source_audio_codec="truehd", source_audio_channels=8,
                transcode_info={"sourceContainer": "mkv", "streamContainer": "mp4"},
                is_transcode=True, video_decision="transcode",
            )
        for i in range(1, count):
            sim.change("started", f"other-{i}", server=1, username="bob", resolution="1080p",
                       source_video_codec="av1", media_title=f"Lecture fictive {i}", poster_url=None)

    async def action(request):
        # Do not accept control requests from a web page or a rebinding host.
        if request.host != f"127.0.0.1:{PORT}" or request.headers.get("Origin"):
            raise web.HTTPForbidden()
        name = request.match_info["action"]
        if name == "reset":
            reset()
        elif name in {"grid-empty", "grid-one", "grid-three"}:
            grid_playback({"grid-empty": 0, "grid-one": 1, "grid-three": 3}[name])
        elif name == "grid-recover":
            sim.errors.clear()
            sim.raw(None)
        elif name in {"pause", "play"}:
            sim.change("updated", "lan", state="paused" if name == "pause" else "playing",
                       progress_ms=23000)
        elif name == "progress":
            sim.change("progress", "lan", progress_ms=27000)
        elif name == "down":
            sim.errors.update({route: (503, {}) for route in ("streams", "servers", "events")})
            sim.raw(None)
        elif name == "recover":
            sim.errors.clear()
            sim.streams["lan"].update(state="playing", progress_ms=12000)
            sim.raw(None)
        elif name == "revoke":
            sim.key = NEXT_KEY if sim.key == KEY else KEY
            sim.raw(None)
        else:
            raise web.HTTPNotFound()
        return web.json_response({"scenario": name})

    async def shutdown(app):
        sim.raw(None)

    reset()
    app = web.Application()
    app.router.add_get("/api/v2/public/{resource}", sim.handle)
    app.router.add_get("/api/v1/images/proxy", sim.handle)
    app.router.add_post("/scenario/{action}", action)
    app.on_shutdown.append(shutdown)
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rotated", action="store_true", help="start with the second fixture key")
    args = parser.parse_args()
    web.run_app(application(NEXT_KEY if args.rotated else KEY), host="127.0.0.1",
                port=PORT, access_log=None, handler_cancellation=True)
