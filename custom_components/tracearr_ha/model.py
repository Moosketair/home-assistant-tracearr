"""Pure calculation and event processing for the Tracearr session cache."""
from __future__ import annotations

from typing import Any


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


def apply_event(streams: dict[str, dict], event: dict) -> bool:
    """Modify streams in place. Return True if sessions were changed."""
    kind = event.get("type")
    payload = event.get("data")
    if not isinstance(payload, dict):
        return False
    session_id = payload.get("id")
    if not isinstance(session_id, str):
        return False
    if kind == "stream.stopped":
        return streams.pop(session_id, None) is not None
    if kind in ("stream.started", "stream.updated"):
        current = streams.get(session_id, {})
        new = {**current, **payload}
        # Full updates can trail a previously received progress update.
        same_media = (current.get("media_id") or current.get("rating_key") or current.get("media_title")) == (new.get("media_id") or new.get("rating_key") or new.get("media_title"))
        if kind == "stream.updated" and same_media and current.get("state") == "playing" and new.get("state") == "playing":
            if current.get("progress_ms", 0) > new.get("progress_ms", 0):
                new["progress_ms"] = current["progress_ms"]
        streams[session_id] = new
        return True
    if kind == "stream.progress" and session_id in streams:
        current = streams[session_id]
        state = payload.get("state", current.get("state"))
        progress = payload.get("progress_ms", current.get("progress_ms", 0))
        current.update({"state": state, "progress_ms": progress, "bitrate": payload.get("bitrate", current.get("bitrate"))})
        return True
    return False
