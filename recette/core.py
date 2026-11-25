"""Minimal real HA backend: config entries, platforms, HTTP auth and WebSocket."""
import asyncio
from contextlib import asynccontextmanager
from tempfile import TemporaryDirectory

from aiohttp import ClientSession
from aiohttp.test_utils import TestServer
from homeassistant import bootstrap, config_entries, loader
from homeassistant.auth import auth_manager_from_config
from homeassistant.components import websocket_api
from homeassistant.components.http import HomeAssistantHTTP
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import DATA_RESOLVER
from homeassistant.setup import async_setup_component

from simulateur import KEY

DOMAIN = "tracearr_ha"


async def observed(coord, predicate, timeout=5):
    """Wait on a coordinator notification, not on wall-clock polling."""
    reached = asyncio.Event()

    def check():
        if predicate():
            reached.set()

    unsub = coord.async_add_listener(check)
    try:
        check()
        await asyncio.wait_for(reached.wait(), timeout)
    finally:
        unsub()


class Socket:
    def __init__(self, ws):
        self.ws = ws
        self.seq = 0
        self.events = []

    async def call(self, kind, **fields):
        """A result to a subsequent get is a FIFO fence for earlier notifications."""
        self.seq += 1
        await self.ws.send_json({"id": self.seq, "type": kind, **fields})
        while True:
            message = await self.ws.receive_json(timeout=5)
            if message["type"] == "event":
                self.events.append(message)
                continue
            assert (message["type"], message["id"], message["success"]) == ("result", self.seq, True), message
            return message.get("result")

    async def snapshots(self, sub):
        await self.call("tracearr_ha/get")
        batch, self.events = self.events, []
        assert all(msg["id"] == sub for msg in batch)
        return [msg["event"]["entries"] for msg in batch]


class Bench:
    def __init__(self, hass, server):
        self.hass = hass
        self.server = server

    def coord(self, entry):
        return self.hass.data[DOMAIN][entry.entry_id]

    async def ready(self, entry):
        coord = self.coord(entry)
        await observed(coord, lambda: coord.sse_connected)
        return coord

    async def add(self, sim):
        flow = await self.hass.config_entries.flow.async_init(
            DOMAIN, context={"source": "user"}, data={"url": sim.url, "token": KEY}
        )
        assert flow["type"] == "create_entry", flow["type"]
        entry = flow["result"]
        await self.hass.async_block_till_done()
        assert entry.state == config_entries.ConfigEntryState.LOADED
        await self.ready(entry)
        return entry

    @asynccontextmanager
    async def connect(self):
        auth = self.hass.auth
        user = await auth.async_create_user("Lecteur de recette")
        refresh = await auth.async_create_refresh_token(user, client_id="http://localhost/")
        async with ClientSession() as client, client.ws_connect(self.server.make_url("/api/websocket")) as ws:
            assert (await ws.receive_json(timeout=5))["type"] == "auth_required"
            await ws.send_json({"type": "auth", "access_token": auth.async_create_access_token(refresh)})
            assert (await ws.receive_json(timeout=5))["type"] == "auth_ok"
            yield Socket(ws)


@asynccontextmanager
async def core():
    with TemporaryDirectory(prefix="ha-recette-") as directory:
        hass = HomeAssistant(directory)
        loader.async_setup(hass)
        hass.config.skip_pip = True
        # Numeric loopback URLs only: avoid starting Core's multicast resolver.
        class NoDNS:
            async def resolve(self, *args, **kwargs):
                raise AssertionError("Unexpected DNS lookup in isolated bench")

            async def close(self):
                pass

        hass.data[DATA_RESOLVER] = NoDNS()
        hass.config_entries = config_entries.ConfigEntries(hass, {})
        try:
            assert await bootstrap.async_load_base_functionality(hass) is not False
            hass.auth = await auth_manager_from_config(hass, [], [])
            hass.http = HomeAssistantHTTP(hass, None, None, None, ["127.0.0.1"], 0, [], "modern")
            await hass.http.async_initialize(cors_origins=[], use_x_forwarded_for=False,
                login_threshold=-1, is_ban_enabled=False, use_x_frame_options=True)
            assert await websocket_api.async_setup(hass, {})
            # Skip dashboard assets/onboarding and discovery. The domain still
            # registers its real routes, WS commands, sensor platforms and flow.
            hass.config.components.update({"http", "websocket_api", "frontend", "lovelace"})
            assert await async_setup_component(hass, DOMAIN, {})
            async with TestServer(hass.http.app, host="127.0.0.1") as server:
                await hass.async_start()
                yield Bench(hass, server)
        finally:
            for entry in hass.config_entries.async_entries(DOMAIN):
                if entry.state == config_entries.ConfigEntryState.LOADED:
                    assert await hass.config_entries.async_unload(entry.entry_id)
            await hass.async_stop(force=True)
