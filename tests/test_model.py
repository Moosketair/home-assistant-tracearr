"""Tests using only the pure Python model, no Home Assistant required."""
import importlib.util
import json
from pathlib import Path

import pytest

path = Path(__file__).resolve().parents[1] / "custom_components/tracearr_ha/model.py"
spec = importlib.util.spec_from_file_location("tracearr_model", path)
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)
MUSIC = json.loads((Path(__file__).parent / "fixtures/music_streams.json").read_text())


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


def test_snapshot_rows_preserve_optional_values_and_empty_collection():
    row = {"id": "a", "bitrate": None, "duration_ms": None,
           "library_id": None, "genres": None, "future_metadata": {"nullable": None}}
    rows = model.snapshot_rows({"data": [row]})
    assert rows == {"a": row}
    assert model.stats(rows)["bandwidth_mbps"] == 0
    assert model.snapshot_rows({"data": []}, servers=True) == {}
    assert model.snapshot_rows({"data": [{"server_id": "s", "reason": None}]}, servers=True) == {
        "s": {"server_id": "s", "reason": None},
    }


@pytest.mark.parametrize("rows", [
    [{"id": "a", "bitrate": False}],
    [{"id": "a", "progress_ms": "42"}],
    [{"id": "a", "is_transcode": "false"}],
    [{"id": "a", "duration_ms": {}}],
    [{"id": "a"}, {"id": "a"}],
])
def test_snapshot_rows_reject_invalid_essential_values(rows):
    with pytest.raises(ValueError, match="^Invalid Tracearr streams row$"):
        model.snapshot_rows({"data": rows})


def test_music_stats_and_non_track_stats():
    plex, jf, emby = MUSIC.values()
    movie = {
        **plex, "id": "movie", "media_type": "movie", "bitrate": 2000,
        "video_decision": "transcode",
    }
    episode = {
        **movie, "id": "episode", "media_type": "episode", "audio_decision": "transcode",
    }
    cases = [
        (plex, "direct"), (jf, "audio"), (emby, "unknown"),
        ({**emby, "audio_decision": "transcode"}, "audio"),
        ({**emby, "is_transcode": False, "audio_decision": "transcode"}, "audio"),
        ({**emby, "is_transcode": False, "audio_decision": "copy"}, "direct"),
        ({**emby, "is_transcode": False}, "unknown"),
        ({**emby, "media_type": "unknown"}, "video"),
    ]
    assert [model.transcode_kind(row) for row, _ in cases] == [kind for _, kind in cases]
    rows = model.snapshot_rows({"data": [plex, jf, emby, movie, episode]})
    assert model.stats(rows) == {
        "total": 5, "playing": 4, "paused": 1, "direct": 1,
        "video": 1, "audio": 1, "both": 1, "unknown": 1,
        "transcodes": 4, "bandwidth_mbps": 5.03,
    }
    assert model.stats({emby["id"]: {**emby, "is_transcode": False}})["transcodes"] == 0


@pytest.mark.parametrize("server", MUSIC)
def test_music_metadata_survives_snapshot_full_update_and_progress(server):
    row = {**MUSIC[server], "track_number": "atypique", "artist_name": None}
    sid = row["id"]
    streams = model.snapshot_rows({"data": [row]})
    assert streams[sid] == row
    assert model.apply_event(streams, {
        "type": "stream.updated", "data": {**row, "artist_name": "", "genres": None, "library_id": None},
    })
    assert model.apply_event(streams, {
        "type": "stream.progress", "data": {"id": sid, "state": "paused", "progress_ms": 900, "bitrate": None},
    })
    assert streams[sid] == {**row, "artist_name": "", "state": "paused", "progress_ms": 900, "bitrate": None}


def test_music_transition_drops_old_fields_even_with_same_title_and_canonical_id():
    old = MUSIC["plex"]
    sid = old["id"]
    streams = {sid: old}
    new = {
        "id": sid, "server_id": old["server_id"], "media_type": "track", "media_id": old["media_id"],
        "rating_key": "102", "media_title": old["media_title"], "artist_name": "Artiste suivant",
        "progress_ms": 100, "state": "playing", "genres": None, "library_id": None,
    }
    assert model.apply_event(streams, {"type": "stream.updated", "data": new})
    assert streams[sid] == new  # No stale album, duration, artwork or enrichment.
    assert old["genres"] == ["Instrumental"]


def test_music_repeat_restarts_with_observed_new_start_time():
    old = MUSIC["plex"]
    sid = old["id"]
    streams = {sid: old}
    repeated = {**old, "started_at": "2026-11-27T12:00:12.000Z", "progress_ms": 0}
    assert model.apply_event(streams, {
        "type": "stream.updated", "data": {**repeated, "genres": None, "library_id": None},
    })
    assert streams[sid] == repeated


def test_music_same_track_late_full_update_cannot_undo_seek_progress():
    old = MUSIC["plex"]
    sid = old["id"]
    streams = {sid: old}
    # A new, lower position is allowed on progress, not on a trailing full update.
    for progress in (9000, 4400):
        assert model.apply_event(streams, {
            "type": "stream.progress", "data": {"id": sid, "progress_ms": progress},
        })
    assert model.apply_event(streams, {
        "type": "stream.updated",
        "data": {**old, "media_id": None, "genres": None, "library_id": None, "progress_ms": 3800},
    })
    assert streams[sid] == {**old, "media_id": None, "progress_ms": 4400}
