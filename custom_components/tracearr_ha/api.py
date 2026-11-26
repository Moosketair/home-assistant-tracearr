"""Small async Tracearr Public API v2 client.

No credentials are ever returned to the frontend or placed in logs.
"""
from __future__ import annotations

import asyncio
import json
import math
from collections.abc import AsyncGenerator, AsyncIterator
from typing import Any

from aiohttp import ClientError, ClientResponse, ClientSession, ClientTimeout

API_PREFIX = "/api/v2/public"
_MAX_EVENT_BYTES = 256 * 1024
_EVENT_CHUNK_BYTES = 16 * 1024
_MAX_JSON_DEPTH = 64


def _event_float(raw: str) -> float:
    number = float(raw)
    if not math.isfinite(number):
        raise ValueError("Non-finite SSE number")
    return number


def _event_int(raw: str) -> int:
    number = int(raw)
    if not -(2**63) <= number < 2**63:
        raise ValueError("Out-of-range SSE integer")
    return number


def _decode_event(lines: list[str], name: str | None) -> dict | None:
    try:
        event = json.loads("\n".join(lines), parse_float=_event_float, parse_constant=_event_float,
                           parse_int=_event_int)
        if not isinstance(event, dict) or not isinstance(event.get("data"), dict):
            return None
        kind = event.setdefault("type", name)
        if not isinstance(kind, str) or not kind:
            return None
        # Keep rows serializable by Home Assistant's WebSocket encoder.
        _check_json_tree(event, 0)
        return event
    except (ValueError, RecursionError):
        return None


def _check_json_tree(value: Any, depth: int) -> None:
    if depth > _MAX_JSON_DEPTH:
        raise ValueError("SSE JSON nested too deeply")
    if isinstance(value, str):
        value.encode("utf-8")  # Reject escaped lone surrogates.
    elif isinstance(value, dict):
        for key, item in value.items():
            key.encode("utf-8")
            _check_json_tree(item, depth + 1)
    elif isinstance(value, list):
        for item in value:
            _check_json_tree(item, depth + 1)


async def _sse_frames(content) -> AsyncIterator[dict]:
    """Read bounded frames; skip damaged blocks up to their next empty line."""
    name = None
    lines: list[str] = []
    line = bytearray()
    size = 0
    discard = False
    nonempty = False
    trailing_cr = False
    async for chunk in content.iter_chunked(_EVENT_CHUNK_BYTES):
        if trailing_cr and chunk.startswith(b"\n"):
            chunk = chunk[1:]
        trailing_cr = chunk.endswith(b"\r")
        parts = chunk.replace(b"\r\n", b"\n").replace(b"\r", b"\n").split(b"\n")
        for index, part in enumerate(parts):
            nonempty = nonempty or bool(part)
            if not discard:
                size += len(part)
                if size > _MAX_EVENT_BYTES:
                    discard = True
                    line.clear()
                    lines.clear()
                    name = None
                else:
                    line.extend(part)
            if index == len(parts) - 1:
                break  # Partial line, completed only by a later delimiter.
            if not nonempty:
                event = _decode_event(lines, name) if not discard and lines else None
                name, size, discard = None, 0, False
                lines.clear()
                if event is not None:
                    yield event
            elif not discard:
                size += 1  # Count each line ending as one byte.
                try:
                    field = line.decode("utf-8")
                except UnicodeDecodeError:
                    discard = True
                    lines.clear()
                    name = None
                else:
                    if field.startswith("event:"):
                        name = field[6:].strip()
                    elif field.startswith("data:"):
                        lines.append(field[5:].removeprefix(" "))
            line.clear()
            nonempty = False


class TracearrError(Exception):
    """Base API error."""


class TracearrAuthError(TracearrError):
    """Invalid key or insufficient permissions."""


class TracearrUnavailable(TracearrError):
    """Tracearr is unavailable."""


class TracearrRateLimited(TracearrUnavailable):
    """API reports too many requests or connections."""

    def __init__(self, retry_after: int = 30) -> None:
        super().__init__("Tracearr rate limit reached")
        self.retry_after = max(1, min(retry_after, 3600))


class TracearrClient:
    """Communicate using Home Assistant's shared aiohttp session."""

    def __init__(self, session: ClientSession, base_url: str, token: str) -> None:
        self.session = session
        self.base_url = base_url.rstrip("/")
        self.headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    def url(self, path: str) -> str:
        return f"{self.base_url}{API_PREFIX}/{path.lstrip('/')}"

    @staticmethod
    def _check(response: ClientResponse) -> None:
        if response.status in (401, 403):
            raise TracearrAuthError("API key invalid or unauthorized")
        if response.status == 429:
            try:
                retry_after = int(response.headers.get("Retry-After", "30"))
            except ValueError:
                retry_after = 30
            raise TracearrRateLimited(retry_after)
        if response.status >= 400:
            raise TracearrUnavailable(f"Tracearr HTTP {response.status}")

    async def get(self, resource: str, params: dict[str, Any] | None = None) -> dict:
        try:
            async with self.session.get(
                self.url(resource), headers=self.headers, params=params,
                timeout=ClientTimeout(total=15), allow_redirects=False,
            ) as resp:
                self._check(resp)
                result = await resp.json(content_type=None)
                if not isinstance(result, dict):
                    raise TracearrUnavailable("Unexpected Tracearr response")
                return result
        except (asyncio.TimeoutError, ClientError) as exc:
            raise TracearrUnavailable("Tracearr request failed") from exc

    async def streams(self) -> dict:
        return await self.get("streams")

    async def servers(self) -> dict:
        return await self.get("servers")

    async def users(self) -> list[dict]:
        """List users when aliases are edited; consume cursor pages with safety bound."""
        results: list[dict] = []
        cursor = None
        for _ in range(50):
            params: dict[str, Any] = {"pageSize": 100}
            if cursor:
                params["cursor"] = cursor
            page = await self.get("users", params)
            results.extend(page.get("data", []))
            cursor = page.get("meta", {}).get("nextCursor")
            if not cursor:
                break
        return results

    async def events(self) -> AsyncGenerator[dict, None]:
        """Read SSE event/data frames, including multiline data and comment pings."""
        headers = {**self.headers, "Accept": "text/event-stream"}
        try:
            async with self.session.get(
                self.url("events"), headers=headers, timeout=ClientTimeout(total=None, sock_read=80),
                allow_redirects=False,
            ) as response:
                self._check(response)
                async for event in _sse_frames(response.content):
                    yield event
        except (asyncio.TimeoutError, ClientError) as exc:
            raise TracearrUnavailable("Tracearr event connection lost") from exc
