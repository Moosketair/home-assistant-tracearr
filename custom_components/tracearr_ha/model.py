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


def _normalize_bitrate(fields: dict) -> dict:
    """An out-of-range negative sample means no measurement, not no session."""
    bitrate = fields.get("bitrate")
    return {**fields, "bitrate": None} if bitrate is not None and bitrate < 0 else fields


def snapshot_rows(response: dict, *, servers: bool = False) -> dict[str, dict]:
    """Validate and index one REST collection without mutating its rows."""
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
        rows[identity] = row if servers else _normalize_bitrate(row)
    return rows


def transcode_kind(stream: dict) -> str:
    """Classify mutually exclusive A/V modes; distinguish unknown decisions."""
    video = stream.get("video_decision")
    audio = stream.get("audio_decision")
    if stream.get("media_type") == "track":
        # A track has no video stream, regardless of the adapter's decision.
        if audio == "transcode":
            return "audio"
        if not stream.get("is_transcode") and audio in ("directplay", "copy"):
            return "direct"
        return "unknown"
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
    total_bitrate = sum(max(0, s.get("bitrate") or 0) for s in values)
    return {
        "total": len(values),
        "playing": sum(s.get("state") == "playing" for s in values),
        "paused": sum(s.get("state") == "paused" for s in values),
        "direct": modes.count("direct"),
        "video": modes.count("video"),
        "audio": modes.count("audio"),
        "both": modes.count("both"),
        "unknown": modes.count("unknown"),
        "transcodes": sum(bool(s.get("is_transcode")) or mode in ("audio", "video", "both")
                          for s, mode in zip(values, modes)),
        "bandwidth_mbps": round(total_bitrate / 1000, 2),
    }


class StreamMutation(NamedTuple):
    key: str
    kind: str
    fields: dict | None
    join_nulls: tuple[str, ...] = ()
    new_play: bool = False
    identity: PlaybackIdentity | None = None

    def apply(self, streams: dict[str, dict], previous: PlaybackIdentity | None = None) -> bool:
        """Update the live cache without treating placeholders as edits."""
        if self.fields is None:
            return streams.pop(self.key, None) is not None
        if self.kind == "stream.progress" and (self.key not in streams or not self.fields):
            return False
        current = streams.get(self.key, {})
        if self.new_play:
            # On repeat, only the library enrichment can be carried over.
            previous = previous or PlaybackIdentity.from_row(current)
            current = (stream_join_fields(current)
                       if self.identity and previous.same_media(self.identity) is True else {})
        streams[self.key] = {**dict.fromkeys(self.join_nulls), **current, **self.fields}
        return True


def stream_join_fields(row: dict) -> dict:
    fields = {key: row[key] for key in _REST_JOIN_FIELDS if key in row}
    if _identity_value(row, "media_id"):
        fields["media_id"] = row["media_id"]
    return fields


def _identity_value(row: dict, key: str) -> str | None:
    value = row.get(key)
    # Public UUIDs, rating keys and ISO dates fit; don't retain large
    # unexpected strings in the short-lived identity history.
    return value if isinstance(value, str) and len(value) <= 256 and value.strip() else None


class PlaybackIdentity(NamedTuple):
    """Positive evidence, kept apart from nullable display fields."""

    server: str | None = None
    media_type: str | None = None
    rating_key: str | None = None
    media_id: str | None = None
    started_at: str | None = None

    @classmethod
    def from_row(cls, row: dict) -> PlaybackIdentity:
        return cls(*(_identity_value(row, key) for key in
                     ("server_id", "media_type", "rating_key", "media_id", "started_at")))

    def other_server(self, other: PlaybackIdentity) -> bool:
        return bool(self.server and other.server and self.server != other.server)

    def same_media(self, other: PlaybackIdentity) -> bool | None:
        if self.other_server(other) or (self.media_type and other.media_type and self.media_type != other.media_type):
            return False
        if self.rating_key and other.rating_key:
            if self.rating_key != other.rating_key:
                return False
            if self.server and other.server:
                return True
        if self.media_id and other.media_id:
            return self.media_id == other.media_id
        return None

    def different_start(self, other: PlaybackIdentity) -> bool:
        return bool(self.started_at and other.started_at and self.started_at != other.started_at)

    def incompatible(self, other: PlaybackIdentity) -> bool:
        return self.same_media(other) is False or self.different_start(other)

    def continued_with(self, other: PlaybackIdentity) -> PlaybackIdentity:
        return other if self.incompatible(other) else PlaybackIdentity(*(new or old for old, new in zip(self, other)))

    def matches_stopped_play(self, other: PlaybackIdentity) -> bool:
        # Use started_at as an identity component, never order it.
        return bool(self.server and self.server == other.server and self.started_at
                    and self.started_at == other.started_at and self.same_media(other) is True)


def stream_mutation(streams: dict[str, dict], event: dict,
                    identities: dict[str, PlaybackIdentity] | None = None) -> StreamMutation | None:
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
    current = streams.get(session_id, {})
    previous = (identities or {}).get(session_id) or PlaybackIdentity.from_row(current)
    if kind == "stream.stopped":
        stopped = payload.get("stream")
        identity = PlaybackIdentity.from_row(stopped if isinstance(stopped, dict) else {})
        server = _identity_value(payload, "server_id")
        if server:
            if identity.server and server != identity.server:
                return None
            identity = identity._replace(server=server)
        return StreamMutation(session_id, kind, None, identity=previous.continued_with(identity))
    if kind == "stream.progress":
        identity = PlaybackIdentity(server=_identity_value(payload, "server_id"))
        if previous.other_server(identity):
            return None
        fields = {k: payload[k] for k in _PROGRESS_FIELDS if k in payload}
        if not fields or not _valid_stream_fields(fields):
            return None
        return StreamMutation(session_id, kind, _normalize_bitrate(fields), identity=identity)
    # formatActiveStream without the REST join always supplies these nulls.
    # Other nullable fields, e.g. bitrate, are actual event data.
    join_nulls = tuple(k for k in _REST_JOIN_FIELDS if k in payload and payload[k] is None)
    fields = {k: v for k, v in payload.items() if k not in join_nulls}
    if len(fields) <= 1 or not _valid_stream_fields(fields):
        return None
    identity = PlaybackIdentity.from_row(fields)
    if kind == "stream.updated" and previous.other_server(identity):
        return None
    music = "track" in (previous.media_type, identity.media_type)
    same_media = previous.same_media(identity)
    new_play = previous.other_server(identity) or (music and (previous.incompatible(identity) or not current))
    if music and same_media is True and fields.get("media_id") is None and current.get("media_id"):
        fields.pop("media_id", None)  # The source still identifies the same library item.
    if kind == "stream.updated" and "progress_ms" in fields and not new_play:
        # A trailing full update must not regress live progress, nor turn
        # the cached position into a new mutation against the REST result.
        new = {**current, **fields}
        same_play = (music and same_media is True) or (
            (current.get("media_id") or current.get("rating_key") or current.get("media_title"))
            == (new.get("media_id") or new.get("rating_key") or new.get("media_title"))
        )
        position = current.get("progress_ms", 0)
        if (same_play and current.get("state") == new.get("state") == "playing"
                and _valid_measurement(position) and position > fields["progress_ms"]):
            del fields["progress_ms"]
    return StreamMutation(session_id, kind, _normalize_bitrate(fields), join_nulls, new_play, identity)


def apply_event(streams: dict[str, dict], event: dict) -> bool:
    """Apply a normalized SSE event to the live cache."""
    mutation = stream_mutation(streams, event)
    return mutation is not None and mutation.apply(streams)
