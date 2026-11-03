# Changelog

## 0.1.1 — Alpha (2026-11-03)

- Fix component setup on recent Home Assistant: LovelaceData exposes `resource_mode` instead of `mode`.
- Retain compatibility with older LovelaceData objects.
- Update Lovelace resource cache-busting version to 0.1.1.
- Add regression tests for storage/YAML resource modes.

## 0.1.0 — Alpha (2026-11-03)

- Initial Tracearr Public API v2 Home Assistant integration.
- Single SSE subscription with REST initial sync and periodic fallback.
- Overall and per-server stream count and server availability entities.
- Separate video, audio, video+audio, direct and unknown transcode statistics.
- Two Lovelace cards: grouped and single; list, responsive grid and carousel.
- Visual card editor, filters, progress, image proxy, per-user names and avatar overrides.
- Initial FR/EN setup translations and minimal CI tests.

**Not yet field-tested against a live Home Assistant / Tracearr instance.**
