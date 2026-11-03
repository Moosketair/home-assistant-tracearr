"""Tests using only the pure Python model, no Home Assistant required."""
import importlib.util
from pathlib import Path

path = Path(__file__).resolve().parents[1] / "custom_components/tracearr_ha/model.py"
spec = importlib.util.spec_from_file_location("tracearr_model", path)
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)


def test_transcodes():
    assert model.transcode_kind({"video_decision": "transcode", "audio_decision": "copy"}) == "video"
    assert model.transcode_kind({"video_decision": "copy", "audio_decision": "transcode"}) == "audio"
    assert model.transcode_kind({"video_decision": "transcode", "audio_decision": "transcode"}) == "both"
    assert model.transcode_kind({"video_decision": "directplay", "audio_decision": "directplay"}) == "direct"
    assert model.transcode_kind({"video_decision": None, "audio_decision": None, "is_transcode": True}) == "unknown"


def test_events_and_summary():
    streams = {}
    a = {"id": "a", "state": "playing", "progress_ms": 5000, "video_decision": "transcode", "audio_decision": "copy", "is_transcode": True, "bitrate": 3000}
    assert model.apply_event(streams, {"type": "stream.started", "data": a})
    assert model.apply_event(streams, {"type": "stream.progress", "data": {"id": "a", "state": "playing", "progress_ms": 6000, "bitrate": 2500}})
    assert model.apply_event(streams, {"type": "stream.updated", "data": {**a, "progress_ms": 5200}})
    assert streams["a"]["progress_ms"] == 6000
    summary = model.stats(streams)
    assert summary["video"] == 1
    assert summary["both"] == 0
    assert summary["total"] == 1
    assert model.apply_event(streams, {"type": "stream.stopped", "data": {"id": "a"}})
    assert streams == {}


def test_seek_back_and_media_change():
    streams = {}
    a = {"id": "same-session", "state": "playing", "progress_ms": 90000, "media_id": "movie-a"}
    model.apply_event(streams, {"type": "stream.started", "data": a})
    model.apply_event(streams, {"type": "stream.progress", "data": {"id": "same-session", "progress_ms": 20000}})
    assert streams["same-session"]["progress_ms"] == 20000  # real seek backward
    model.apply_event(streams, {"type": "stream.updated", "data": {**a, "progress_ms": 0, "media_id": "movie-b"}})
    assert streams["same-session"]["progress_ms"] == 0  # new media resets progress
