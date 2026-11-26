"""Pure calculation and event processing for the Tracearr session cache."""
from __future__ import annotations

from typing import Any, NamedTuple

_REST_JOIN_FIELDS = ("library_id", "genres")
_PROGRESS_FIELDS = ("state", "progress_ms", "bitrate")
_MAX_SAFE_NUMBER = 2**53 - 1


def _valid_measurement(value: Any) -> bool:
    return type(value) in (int, float) and -_MAX_SAFE_NUMBER <= value <= _MAX_SAFE_NUMBER


def _valid_stream_fields(fields: dict) -> bool:
    """Validate fields consumed by the cache, stats and playback views."""
    return (
        ("progress_ms" not in fields or _valid_measurement(fields["progress_ms"]))
        and (fields.get("bitrate") is None or _valid_measurement(fields["bitrate"]))
        and (fields.get("duration_ms") is None or _valid_measurement(fields["duration_ms"]))
        and ("is_transcode" not in fields or isinstance(fields["is_transcode"], bool))
        and ("state" not in fields or isinstance(fields["state"], str) and bool(fields["state"]))
        and all(fields.get(key) is None or isinstance(fields[key], str) for key in (
            "server_id", "media_id", "rating_key", "media_title", "video_decision",
            "audio_decision", "poster_url", "user_avatar_url", "username", "server_name",
        ))
    )


def _valid_server_fields(fields: dict) -> bool:
    return all(fields.get(key) is None or isinstance(fields[key], str) for key in (
        "server_name", "server_type", "status", "reason",
    ))


def snapshot_rows(response: dict, *, servers: bool = False) -> dict[str, dict]:
    """Validate and index one REST collection without altering its rows."""
    resource, key, valid = ("servers", "server_id", _valid_server_fields) if servers else (
        "streams", "id", _valid_stream_fields,
    )
    data = response.get("data")
    if not isinstance(data, list):
        raise ValueError(f"Invalid Tracearr {resource} envelope")
    rows = {}
    for row in data:
        if (not isinstance(row, dict) or not isinstance(identity := row.get(key), str)
                or not identity or identity in rows or not valid(row)):
            raise ValueError(f"Invalid Tracearr {resource} row")
        rows[identity] = row
    return rows


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
    if kind not in ("stream.started", "stream.updated", "stream.progress", "stream.stopped"):
        return None
    payload = event.get("data")
    if not isinstance(payload, dict):
        return None
    session_id = payload.get("id")
    if not isinstance(session_id, str) or not session_id:
        return None
    if kind == "stream.stopped":
        return StreamMutation(session_id, kind, None)
    if kind == "stream.progress":
        fields = {k: payload[k] for k in _PROGRESS_FIELDS if k in payload}
        return StreamMutation(session_id, kind, fields) if fields and _valid_stream_fields(fields) else None
    # formatActiveStream without the REST join always supplies these nulls.
    # Other nullable fields, e.g. bitrate, are actual event data.
    join_nulls = tuple(k for k in _REST_JOIN_FIELDS if k in payload and payload[k] is None)
    fields = {k: v for k, v in payload.items() if k not in join_nulls}
    if len(fields) <= 1 or not _valid_stream_fields(fields):
        return None
    if kind == "stream.updated" and "progress_ms" in fields:
        # A trailing full update must not regress live progress, nor turn
        # the cached position into a new mutation against the REST result.
        current = streams.get(session_id, {})
        new = {**current, **fields}
        same_media = (current.get("media_id") or current.get("rating_key") or current.get("media_title")) == (new.get("media_id") or new.get("rating_key") or new.get("media_title"))
        position = current.get("progress_ms", 0)
        if (same_media and current.get("state") == new.get("state") == "playing"
                and _valid_measurement(position) and position > fields["progress_ms"]):
            del fields["progress_ms"]
    return StreamMutation(session_id, kind, fields, join_nulls)


def apply_event(streams: dict[str, dict], event: dict) -> bool:
    """Apply a normalized SSE event to the live cache."""
    mutation = stream_mutation(streams, event)
    return mutation is not None and mutation.apply(streams)
