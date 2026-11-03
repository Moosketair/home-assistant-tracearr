"""Small async Tracearr Public API v2 client.

No credentials are ever returned to the frontend or placed in logs.
"""
from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

from aiohttp import ClientError, ClientResponse, ClientSession, ClientTimeout

API_PREFIX = "/api/v2/public"


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

    async def events(self) -> AsyncIterator[dict]:
        """Read SSE event/data frames, including multiline data and comment pings."""
        headers = {**self.headers, "Accept": "text/event-stream"}
        try:
            async with self.session.get(
                self.url("events"), headers=headers, timeout=ClientTimeout(total=None, sock_read=80),
                allow_redirects=False,
            ) as response:
                self._check(response)
                event_name = None
                data_lines: list[str] = []
                async for raw in response.content:
                    line = raw.decode("utf-8", errors="replace").rstrip("\r\n")
                    if not line:
                        if data_lines:
                            try:
                                event = json.loads("\n".join(data_lines))
                                if isinstance(event, dict):
                                    event.setdefault("type", event_name)
                                    yield event
                            except (ValueError, TypeError):
                                pass
                        data_lines = []
                        event_name = None
                    elif line.startswith(":"):
                        continue
                    elif line.startswith("event:"):
                        event_name = line[6:].strip()
                    elif line.startswith("data:"):
                        data_lines.append(line[5:].lstrip(" "))
        except (asyncio.TimeoutError, ClientError) as exc:
            raise TracearrUnavailable("Tracearr event connection lost") from exc
