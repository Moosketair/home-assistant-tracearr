"""Pure calculation and event processing for the Tracearr session cache."""
from __future__ import annotations

from typing import Any, NamedTuple

_REST_JOIN_FIELDS = ("library_id", "genres")
_PROGRESS_FIELDS = ("state", "progress_ms", "bitrate")


def transcode_kind(stream: dict) -> str:
    """Classify mutually exclusive A/V modes; distinguish unknown decisions."""
    video = stream.get("video_decision")
    audio = stream.get("audio_decision")
    if video == "transcode" and audio == "transcode":
        return "both"
    if video == "transcode":
        return "video"
    if audio == "transcode":
        return "audio"
    if stream.get("is_transcode"):
        return "unknown"
    if video in ("directplay", "copy") and audio in ("directplay", "copy", None):
        return "direct"
    if audio in ("directplay", "copy") and video is None:
        return "direct"
    return "unknown"


def stats(streams: dict[str, dict]) -> dict[str, Any]:
    """Compute frontend and HA entity stats from all active sessions."""
    values = list(streams.values())
    modes = [transcode_kind(s) for s in values]
    total_bitrate = sum(s.get("bitrate") or 0 for s in values)
    return {
        "total": len(values),
        "playing": sum(s.get("state") == "playing" for s in values),
        "paused": sum(s.get("state") == "paused" for s in values),
        "direct": modes.count("direct"),
        "video": modes.count("video"),
        "audio": modes.count("audio"),
        "both": modes.count("both"),
        "unknown": modes.count("unknown"),
        "transcodes": sum(s.get("is_transcode") or transcode_kind(s) in ("audio", "video", "both") for s in values),
        "bandwidth_mbps": round(total_bitrate / 1000, 2),
    }


class StreamMutation(NamedTuple):
    key: str
    kind: str
    fields: dict | None
    join_nulls: tuple[str, ...] = ()

    def apply(self, streams: dict[str, dict]) -> bool:
        """Update the live cache without treating placeholders as edits."""
        if self.fields is None:
            return streams.pop(self.key, None) is not None
        if self.kind == "stream.progress" and (self.key not in streams or not self.fields):
            return False
        streams[self.key] = {**dict.fromkeys(self.join_nulls), **streams.get(self.key, {}), **self.fields}
        return True


def stream_mutation(streams: dict[str, dict], event: dict) -> StreamMutation | None:
    """Normalize the fields actually supplied, independently of the live row."""
    kind = event.get("type")
    payload = event.get("data")
    if not isinstance(payload, dict):
        return None
    session_id = payload.get("id")
    if not isinstance(session_id, str):
        return None
    if kind == "stream.stopped":
        return StreamMutation(session_id, kind, None)
    if kind == "stream.progress":
        return StreamMutation(session_id, kind, {k: payload[k] for k in _PROGRESS_FIELDS if k in payload})
    if kind in ("stream.started", "stream.updated"):
        current = streams.get(session_id, {})
        # formatActiveStream without the REST join always supplies these nulls.
        # Other nullable fields, e.g. bitrate, are actual event data.
        join_nulls = tuple(k for k in _REST_JOIN_FIELDS if k in payload and payload[k] is None)
        fields = {k: v for k, v in payload.items() if k not in join_nulls}
        if kind == "stream.updated" and "progress_ms" in fields:
            # A trailing full update must not regress live progress, nor turn
            # the cached position into a new mutation against the REST result.
            new = {**current, **fields}
            same_media = (current.get("media_id") or current.get("rating_key") or current.get("media_title")) == (new.get("media_id") or new.get("rating_key") or new.get("media_title"))
            if (same_media and current.get("state") == new.get("state") == "playing"
                    and current.get("progress_ms", 0) > fields["progress_ms"]):
                del fields["progress_ms"]
        return StreamMutation(session_id, kind, fields, join_nulls)
    return None


def apply_event(streams: dict[str, dict], event: dict) -> bool:
    """Apply a normalized SSE event to the live cache."""
    mutation = stream_mutation(streams, event)
    return mutation is not None and mutation.apply(streams)
