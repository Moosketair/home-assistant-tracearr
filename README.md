# Tracearr HA — HACS integration + Lovelace cards

[![Validate](https://github.com/Moosketair/home-assistant-tracearr/actions/workflows/validate.yml/badge.svg)](https://github.com/Moosketair/home-assistant-tracearr/actions/workflows/validate.yml)

**Français** · Home Assistant custom integration for Tracearr Public API v2. Compatible with streams from **Plex, Jellyfin and Emby**. **Alpha 0.1.1** — test on your installation before relying on the sensors for automations.

## What it does / Fonctionnalités

- Uses `GET /api/v2/public/streams` and `GET /api/v2/public/servers` to initialize the session cache.
- Maintains **one** authenticated SSE connection to `GET /api/v2/public/events` (Tracearr **2.7.0+**) for every Home Assistant instance, with reconnect and rate-limit handling.
- On every `ready` SSE event, resynchronizes via REST (the API does not replay missed events). Polling fallback runs about every 15 seconds when SSE is disconnected and a safety refresh runs about every minute while connected.
- Shows movie/TV/music title, artwork, user, playback position, server, player, quality, bitrate, codecs, paused status.
- Sensors for active streams, paused/playing counts, direct, video-only, audio-only, combined A/V and unknown transcodes, total transcodes, approximate bandwidth.
- Online sensor for Tracearr; online and active stream entities for each media server.
- **Two independent Lovelace cards** included: all streams, and single stream.
- **Three layouts** on the grouped card: vertical list, adaptive grid, carousel; automatic or fixed columns, carousel arrows and optional auto scroll.
- Responsive CSS; configurable Home Assistant **Sections** grid columns/rows; height in pixels for other dashboards.
- Graphical Lovelace card editor: show/hide details, filtering, paused sessions, compact mode, aliases and avatars.
- Global user aliases via **Settings → Devices & services → Tracearr → Configure**, with an account picker or bulk JSON editor. Card-level alias overrides are also available.

**Important limits:** Tracearr `/streams` v2 does not publish a LAN/WAN flag or stable user identity ID. The card does not invent either. The card's individual mode can select the most recent stream, or match a user/server through its filters; a fixed session ID is also supported. When a session ends, the individual card shows an empty state. No playback control or remote termination is implemented.

## Installation (once a GitHub repository exists)

1. In HACS, add a **custom repository** with the repository URL and category **Integration**.
2. Install **Tracearr HA**, restart Home Assistant.
3. Go to **Settings → Devices & services → Add integration → Tracearr HA**.
4. Enter the **Tracearr URL** (reachable from your Home Assistant machine, e.g. `https://tracearr.example.org`) and your `trr_pub_...` key, generated in **Tracearr → Settings → Data & API → API**.
5. Refresh your Home Assistant browser page (hard reload if necessary). Under **Edit dashboard → Add card**, search for **Tracearr** and choose a card. The integration registers its included JavaScript automatically when Home Assistant starts.

> HACS custom repository installation is possible only after the repo has been published. To install from the ZIP manually, copy the directory `custom_components/tracearr_ha` into `/config/custom_components/tracearr_ha/` on your Home Assistant system, and restart HA. The rest of the setup is identical.

### YAML examples (optional)

**All currently playing sessions, adaptive grid:**

```yaml
type: custom:tracearr-streams-card
mode: grid
columns: auto
show_transcodes: true
show_progress: true
show_quality: true
show_paused: true
```

**Carousel with 2 sessions per slide:**

```yaml
type: custom:tracearr-streams-card
mode: carousel
carousel_visible: 2
carousel_autoplay: true
carousel_interval: 8
show_transcodes: false
compact: false
```

**Vertical list, compact:**

```yaml
type: custom:tracearr-streams-card
mode: list
compact: true
show_poster: false
show_bitrate: true
show_codecs: true
```

**A single user's most recent session:**

```yaml
type: custom:tracearr-stream-card
filter_user: alice
selection: recent
show_poster: true
```

Card configuration is also available through the built-in Lovelace visual editor, without YAML.

### User display names

Use the integration's **Configure** option to select a Tracearr server account and enter an alias, e.g. display `alice` as `Alice maison`. Accounts remain unchanged in Plex or Jellyfin.

To change a name only on one dashboard card, use **Aliases**, one mapping per line, in its editor:

```text
alice=Alice maison
plex:alice=Alice Plex
<server_uuid>:alice=Alice salon
```

For custom avatars, enter the same style of mapping but with HTTPS image URLs. External images must be available in the viewing browser. The app does not expose a user's Tracearr API key to Lovelace.

### Connection details / security

- This integration **never sends the Tracearr API key to the browser**. Cards subscribe to Home Assistant's authenticated WebSocket data feed.
- Tracearr-proxied movie posters are read by the HA backend and served through a **Home Assistant signed image URL** for a short time. The image route only accepts an image path from the active session cache, and only fetches Tracearr's own `/api/v1/images/proxy` endpoint (no general-purpose proxy).
- API keys belong in the config flow and are stored by Home Assistant in its config entry store. Use HTTPS, especially for remote Tracearr instances. No keys should ever be written into a dashboard YAML file.
- Some upstream user avatar URLs may be external URLs (e.g. from Plex). Browser access to these depends on the image provider. A fallback initial is used if the URL isn't available.
- A **503** causes a timed reconnect; **429** obeys `Retry-After`; **401/403** is considered a credential error. Tracearr ends SSE connections after roughly 30 minutes; reconnect is normal.
- The event stream can contain a latest position not present in a later full update. While playing, a full update does not decrease the stored progress.
- Images are only available while the associated session remains in the cache. Artwork for stopped streams is not retained.
- The "hide empty" option hides the card content. Home Assistant's layout may still reserve a section cell for that card.

### Compatibility

- Home Assistant **2025.6+** (development target; first verified static against 2026 documentation, not yet field-tested).
- Tracearr API v2; for SSE the server must be **Tracearr 2.7.0+**. Older versions without SSE can still use REST polling, provided they implement the v2 endpoints.
- Modern Chromium/Firefox/Safari for the responsive card and CSS `color-mix`/container queries.

### Troubleshooting

1. **No entities:** inspect HA **Settings → System → Logs** for `tracearr_ha`; verify the URL from the HA host (not only from a browser) and check `GET /api/v2/public/servers` credentials.
2. **SSE reconnects every 25–30 seconds:** adjust your reverse proxy to disable response buffering and raise idle/read timeout above 30 seconds; Tracearr sends a ping every ~25 seconds.
3. **Cards don't appear in the card picker:** restart HA, hard refresh the dashboard tab, and verify that `/tracearr_ha/tracearr-card.js` is reachable. It is automatically loaded through the frontend integration.
4. **Image placeholders:** the v2 `poster_url` may refer to a v1 image proxy; this alpha only supports authorized requests to that Tracearr-local proxy and cannot test your host's image authentication in advance. Check the HA log / browser network inspector.
5. **Transcode "unknown":** the server set `is_transcode` without reliable audio/video decisions; the integration deliberately does not guess.

## Development

```bash
python -m compileall -q custom_components
python -m pytest -q tests
node --check custom_components/tracearr_ha/frontend/tracearr-card.js
```

The test suite checks transcode classification and SSE event state changes without needing a running HA. Integration end-to-end tests against an actual Home Assistant and Tracearr instance are still required before calling this a stable release.

## Roadmap

- Dedicated GUI selector for offline user filtering, including users with no active session.
- Robust media image proxy testing against multiple Tracearr image backends.
- Better per-user statistics and diagnostics.
- Native localization of the Lovelace editor (currently French), accessibility and screen-reader testing.
- Visual snapshot tests on dashboard Sections and Mobile.

MIT License. Not affiliated with the Tracearr, Home Assistant, Plex, Jellyfin or Emby projects.
