"""Subset of Tracearr public v2, controlled in-process, served on loopback only."""
import asyncio
import base64
from contextlib import asynccontextmanager
from copy import deepcopy
from dataclasses import dataclass, field
import json

from aiohttp import web
from aiohttp.test_utils import TestServer

KEY = "trr_pub_fixture_only"
STAMP = "2026-01-01T12:00:00Z"
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNg2HMFAAJQAZHdVw5FAAAAAElFTkSuQmCC"
)


@dataclass
class Gate:
    entered: asyncio.Event = field(default_factory=asyncio.Event)
    release: asyncio.Event = field(default_factory=asyncio.Event)

    async def wait(self):
        self.entered.set()
        await self.release.wait()


class Tracearr:
    def __init__(self):
        self.servers = [
            {"server_id": f"00000000-0000-4000-8000-{i:012d}", "server_type": kind,
             "server_name": f"Fixture {kind}", "status": "up"}
            for i, kind in enumerate(("plex", "jellyfin", "emby"), 1)
        ]
        self.streams = {}
        self.clients = set()
        self.errors = {}
        self.gates = {}

    def session(self, sid, server=0, **fields):
        return {"id": sid, **{k: self.servers[server][k] for k in
                ("server_id", "server_name", "server_type")}, "username": "fixture",
                "media_type": "movie", "media_title": "Film test", "started_at": STAMP,
                "state": "playing", "duration_ms": 120000, "progress_ms": 0,
                "bitrate": 1000, "is_transcode": False, "video_decision": "copy",
                "audio_decision": "copy", "poster_url": "/api/v1/images/proxy?fixture=1",
                **fields}

    def raw(self, frame):
        for queue in self.clients:
            queue.put_nowait(frame)

    def event(self, kind, data):
        payload = json.dumps({"type": kind, "at": STAMP, "data": data})
        self.raw(f"event: {kind}\ndata: {payload}\n\n".encode())

    def change(self, kind, sid, **fields):
        if kind == "started":
            row = self.streams[sid] = self.session(sid, **fields)
        elif kind == "stopped":
            old = self.streams.pop(sid)
            row = {"id": sid, "server_id": old["server_id"], "stream": old}
        else:
            assert kind in {"updated", "progress"}
            row = self.streams[sid]
            row.update(fields)
            if kind == "progress":
                row = {k: row[k] for k in ("id", "server_id", "state", "progress_ms", "bitrate")}
        self.event("stream." + kind, row)

    def health(self, status):
        self.servers[0]["status"] = status
        self.event("server.health", {k: self.servers[0][k] for k in ("server_id", "server_name", "status")})

    async def handle(self, request):
        if request.headers.get("Authorization") != "Bearer " + KEY:
            raise web.HTTPUnauthorized()
        resource = request.match_info.get("resource", "image")
        if resource in self.errors:
            status, headers = self.errors[resource]
            return web.json_response({"error": "fixture"}, status=status, headers=headers)
        if resource == "events":
            response = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
            await response.prepare(request)
            queue = asyncio.Queue()
            self.clients.add(queue)
            try:
                await response.write(f'event: ready\ndata: {{"type":"ready","at":"{STAMP}","data":{{}}}}\n\n'.encode())
                while (frame := await queue.get()) is not None:
                    await response.write(frame)
            finally:
                self.clients.remove(queue)
            return response
        if resource == "image":
            response = web.StreamResponse(headers={"Content-Type": "image/png"})
            await response.prepare(request)
            await response.write(PNG[:8])
            if gate := self.gates.get(resource):
                await gate.wait()
            await response.write_eof(PNG[8:])
            return response
        if resource == "servers":
            result = {"data": deepcopy(self.servers), "tracearr_version": "3.2.1"}
        elif resource == "streams":
            result = {"data": deepcopy(list(self.streams.values())), "summary": {"total": len(self.streams)}}
        elif resource in ("users", "history"):
            result = {"data": [], "meta": {"nextCursor": None, "pageSize": 100}}
        else:
            raise web.HTTPNotFound()
        if gate := self.gates.get(resource):
            await gate.wait()
        return web.json_response(result)

    @asynccontextmanager
    async def serve(self):
        app = web.Application()
        app.router.add_get("/api/v2/public/{resource}", self.handle)
        app.router.add_get("/api/v1/images/proxy", self.handle)
        async with TestServer(app, host="127.0.0.1") as server:
            self.url = str(server.make_url("/")).rstrip("/")
            try:
                yield self
            finally:
                for gate in self.gates.values():
                    gate.release.set()
                self.raw(None)
