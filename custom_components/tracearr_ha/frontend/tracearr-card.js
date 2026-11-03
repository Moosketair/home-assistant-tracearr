/* Tracearr HA Lovelace cards 0.1.9 - no external frontend dependencies. */
(() => {
  "use strict";
  if (customElements.get("tracearr-streams-card")) return;

  const DEFAULTS = {
    mode: "grid", columns: "auto", carousel_visible: 1, carousel_autoplay: false,
    carousel_interval: 7, carousel_transition: "slide", carousel_transition_speed: 600,
    carousel_hide_scrollbar: true, carousel_show_arrows: true, carousel_mouse_drag: true,
    carousel_pause_on_hover: false, compact: false, show_title: true, show_counter: true,
    show_transcodes: false, show_transcode_icons: true, show_poster: true, show_avatar: true,
    show_progress: true, show_end_time: false, show_quality: true, show_device: true, show_server: true,
    show_bitrate: false, show_health: true, show_codecs: false, show_year: true, show_remaining: true,
    show_paused: true, hide_empty: false, empty_mode: "message", empty_message: "Aucune lecture en cours",
    sort: "recent", filter_transcode: "all",
    show_header: true, header_show_streams: true, header_show_bandwidth: false,
    header_show_direct: false, header_show_paused: false,
    header_show_video: false, header_show_audio: false, header_show_both: false,
    header_show_transcodes_total: false, header_show_server_counts: false,
    header_entity_badges: [], header_badge_order: "streams,bandwidth,direct,paused,video,audio,both,transcodes_total,server_counts",
    header_positive_only: false, header_blink_positive: false,
    header_blink_seconds: 2, header_show_names: true,
    header_zero_color_mode: "normal", header_zero_custom_color: "#576574",
    stream_surface: "soft",
    selection: "recent", grid_columns: 12, grid_rows: 0, height: 0,
    font_size: 14, accent_color_mode: "theme", accent_custom_color: "#00BCD4",
    // Independent movie / TV fields, with a rearrangeable visual order.
    movie_show_title: true, movie_show_year: true, movie_field_order: "title,year",
    series_show_title: true, series_show_episode_title: true,
    series_show_season_episode: true, series_show_season: true, series_show_episode_number: true,
    series_show_year: true,
    series_episode_style: "short", series_field_order: "series,season,episode_number,episode,year",
    bitrate_scope: "both", network_locations: "",
    footer_field_order: "health,server,device,quality,bitrate,codecs",
    // Header metric pills may have a separate palette from stream badges.
    header_badge_color_mode: "inherit", header_badge_custom_color: "#00BCD4",
    aliases: "", avatars: "",
  };
  const E = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[ch]);
  const fmtTime = (ms) => {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    const s = Math.floor(ms / 1000);
    return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor(s % 3600 / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` :
      `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  // Calculate the displayed seconds as a *pair*, never by independently
  // rounding elapsed and remaining milliseconds. This guarantees that both
  // clocks change on the same tick and add up to the displayed duration.
  const playbackSeconds = (progressMs, durationMs) => {
    const duration = Math.max(0, Number(durationMs) || 0);
    const progress = Math.max(0, Math.min(duration || Infinity, Number(progressMs) || 0));
    const total = Math.ceil(duration / 1000);
    const elapsed = Math.min(total, Math.floor(progress / 1000));
    return {elapsed, remaining: Math.max(0, total - elapsed), total};
  };
  const formattedSeconds = seconds => fmtTime(seconds * 1000);
  const timeOfDay = (epochMs) => new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(epochMs));
  const estimatedEnd = (clock, now, wallNow) => clock && clock.state === "playing" && clock.duration > 0
    ? timeOfDay(wallNow + Math.max(0, clock.duration - Math.min(clock.duration, now))) : "";
  const transcodeMode = (s) => {
    if (s.video_decision === "transcode" && s.audio_decision === "transcode") return "both";
    if (s.video_decision === "transcode") return "video";
    if (s.audio_decision === "transcode") return "audio";
    if (s.is_transcode) return "unknown";
    if (["copy", "directplay"].includes(s.video_decision) || ["copy", "directplay"].includes(s.audio_decision)) return "direct";
    return "unknown";
  };
  const MOVIE_FIELDS = Object.freeze(["title", "year"]);
  const SERIES_FIELDS = Object.freeze(["series", "season", "episode_number", "episode", "year"]);
  const MEDIA_LABELS = Object.freeze({
    title: "Titre du film", series: "Titre de la série", season: "Saison",
    episode_number: "Numéro d’épisode", episode: "Nom de l’épisode", year: "Année",
  });
  const FOOTER_FIELDS = Object.freeze(["health", "server", "device", "quality", "bitrate", "codecs"]);
  const FOOTER_LABELS = Object.freeze({
    health:"État du serveur",server:"Nom du serveur",device:"Appareil / lecteur",
    quality:"Résolution",bitrate:"Débit du flux",codecs:"Codecs",
  });
  const HEADER_FIELDS = Object.freeze(["streams", "bandwidth", "direct", "paused", "video", "audio", "both", "transcodes_total", "server_counts"]);
  const HEADER_LABELS = Object.freeze({
    streams:"Nombre de flux",bandwidth:"Débit total",direct:"Lectures directes",
    paused:"Lectures en pause",video:"Transcode vidéo seul",audio:"Transcode audio seul",
    both:"Transcode vidéo + audio",transcodes_total:"Total des transcodages",server_counts:"Flux par serveur",
  });
  function normalizedOrder(order, allowed) {
    const values = String(order || "").split(",").map(v => v.trim());
    return [...new Set([...values.filter(v => allowed.includes(v)), ...allowed])];
  }
  const SERVER_ACCENTS = Object.freeze({ plex: "#E5A00D", jellyfin: "#AA5CC3", emby: "#52B54B" });
  const TRANSITION_EFFECTS = ["slide", "fade", "zoom", "flip", "none"];
  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };
  const codecState = (decision) => decision === "transcode" ? "transcode" :
    ["directplay", "copy"].includes(decision) ? "direct" : "unknown";
  // Original inline pictograms: a movie clapperboard/play button and a
  // speaker with sound waves, using simple geometric paths (no Flaticon assets).
  const badgeIcon = (kind) => kind === "video" ?
    `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.8" y="8.5" width="18.4" height="12.3" rx="1.8"/><path d="M3.8 8.5 2.6 5.9a1.5 1.5 0 0 1 1-2L18.9 1.7a1.4 1.4 0 0 1 1.6 1.1l.4 2.3-17.1 3.4ZM8.3 3.2l3.1 4.1m2.2-4.8 3.2 4.1"/><path d="m9.5 11.8 5.7 3-5.7 3.1v-6.1Z" fill="currentColor" stroke="none"/></svg>` :
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4.2L12.8 4v16l-5.6-5H3V9Z"/><path d="M16.1 8.1c1.9 2 1.9 5.8 0 7.8m2.7-10.7c3.3 3.7 3.3 10 0 13.7"/></svg>`;
  const validColor = (value) => /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? value : "#00BCD4";
  // Centralized palette: progress, metric pills and per-stream badges share the
  // same choice. Contrast uses WCAG relative luminance (black or white).
  const readRgb = (value) => {
    const raw = String(value || "").trim();
    const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
      const v = hex[1].length === 3 ? [...hex[1]].map(x => x + x).join("") : hex[1];
      return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16));
    }
    const rgb = raw.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s*[,\s]+(\d+(?:\.\d+)?)\s*[,\s]+(\d+(?:\.\d+)?)/i);
    return rgb ? rgb.slice(1, 4).map(v => clamp(v, 0, 255, 0)) : null;
  };
  const contrastColor = (background) => {
    const rgb = readRgb(background) || [0, 188, 212];
    const linear = rgb.map(n => { const v = n / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    return luminance > 0.179 ? "#000000" : "#FFFFFF";
  };
  const asMapping = (input) => {
    if (input && typeof input === "object") return input;
    const result = {};
    for (const line of String(input || "").split(/\r?\n/)) {
      const at = line.indexOf("=");
      if (at > 0 && line.slice(at + 1).trim()) result[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
    return result;
  };
  const safeImage = (url) => {
    if (!url || typeof url !== "string") return "";
    try {
      const parsed = new URL(url);
      return ["http:", "https:"].includes(parsed.protocol) ? url : "";
    } catch { return ""; }
  };
  const style = `
    :host { display:block; width:100%; height:100%; min-width:0; box-sizing:border-box;
      color:var(--primary-text-color,#fff); container-type:inline-size; --tr-font-size:14px; }
    /* Home Assistant owns the real card surface, radius, border and shadow. */
    ha-card { border-radius:var(--ha-card-border-radius,16px); overflow:hidden;
      color:var(--primary-text-color,#fff); height:100%; min-height:0; box-sizing:border-box; }
    .root { padding:14px; min-width:0; height:100%; box-sizing:border-box;
      overflow-y:auto; overflow-x:hidden; scrollbar-width:thin; }
    .head { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px;
      margin:0 0 12px; color:var(--primary-text-color,#fff); }
    .head h3 { flex:0 1 auto; margin:0; font-size:calc(var(--tr-font-size)*1.24); font-weight:700;
      color:var(--primary-text-color,#fff); overflow-wrap:anywhere; }
    .head-metrics { display:flex; flex:1 1 auto; flex-wrap:wrap; align-items:center; gap:5px;
      min-width:0; justify-content:flex-end; }
    .metric { display:inline-flex; align-items:center; gap:4px; padding:4px 9px; border-radius:20px;
      font-size:calc(var(--tr-font-size)*.80); font-weight:600; background:var(--pill-bg);
      color:var(--pill-text); white-space:nowrap; }
    .metric ha-icon { --mdc-icon-size:16px; width:16px; height:16px; display:inline-flex; }
    .metric.blink-positive { animation:tracearr-badge-pulse var(--badge-blink,2s) ease-in-out infinite; }
    @keyframes tracearr-badge-pulse { 0%,100% { opacity:1; } 50% { opacity:.22; } }
    .streams { display:flex; flex-direction:column; gap:10px; }
    .streams.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--min-column,290px)),1fr)); }
    .streams.carousel { overflow-x:auto; flex-direction:row; scroll-snap-type:x mandatory;
      scrollbar-width:none; -ms-overflow-style:none; scroll-behavior:auto; padding-bottom:0;
      overscroll-behavior-x:contain; cursor:grab; touch-action:pan-x pan-y; }
    .streams.carousel::-webkit-scrollbar { display:none; width:0; height:0; }
    .streams.carousel.is-dragging { cursor:grabbing; scroll-snap-type:none!important; user-select:none; }
    .streams.carousel.is-dragging * { user-select:none; pointer-events:none; }
    .carousel .stream { flex:0 0 calc((100% - (var(--carousel-visible,1) - 1)*10px)/var(--carousel-visible,1)); scroll-snap-align:start; min-width:0; }
    .stream { position:relative; display:flex; align-items:center; gap:12px; min-width:0; min-height:116px;
      padding:12px; box-sizing:border-box; border-radius:12px; background:color-mix(in srgb,
      var(--primary-text-color,#fff) 4%,transparent); border:1px solid var(--divider-color,rgba(255,255,255,.12));
      color:var(--primary-text-color,#fff); }
    .stream::before { content:""; position:absolute; left:0; top:0; bottom:0; width:3px;
      border-radius:3px; background:var(--stream-accent,var(--accent-color,#00BCD4)); }
    .root.flat-streams .stream { background:transparent; }
    .poster-wrap { position:relative; width:73px; height:109px; flex:0 0 73px; align-self:center;
      border-radius:7px; overflow:hidden; background:rgba(100,100,100,.15); }
    .poster { width:100%; height:100%; display:block; object-fit:cover; }
    .poster.empty { display:grid; place-items:center; font-size:calc(var(--tr-font-size)*1.8); }
    .poster-paused { position:absolute; inset:0; display:flex; justify-content:center; align-items:center;
      background:rgba(0,0,0,.48); }
    .pause-symbol { display:flex; gap:5px; align-items:center; justify-content:center; }
    .pause-symbol::before,.pause-symbol::after { content:""; display:block; background:#fff; border:1px solid rgba(0,0,0,.3);
      border-radius:2px; width:6px; height:24px; box-shadow:0 0 5px rgba(0,0,0,.45); }
    .info { min-width:0; flex:1; display:flex; flex-direction:column; gap:5px; align-self:stretch;
      color:var(--primary-text-color,#fff); }
    .user { display:flex; align-items:center; gap:6px; padding-right:54px;
      font-size:calc(var(--tr-font-size)*.92); color:inherit; }
    .avatar { width:23px; height:23px; border-radius:50%; object-fit:cover; background:rgba(100,100,100,.25); }
    .fallback-avatar { display:grid; place-items:center; font-size:calc(var(--tr-font-size)*.78); font-weight:bold; }
    .title { font-weight:700; font-size:calc(var(--tr-font-size)*1.12);
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .subtitle { font-size:calc(var(--tr-font-size)*.9); white-space:normal; overflow-wrap:anywhere; }
    .media-flags { display:flex; position:absolute; right:12px; top:12px; align-items:center; gap:8px; z-index:1; }
    .stream-indicator { width:19px; height:19px; display:inline-flex; align-items:center;
      justify-content:center; color:#a3a3a3; }
    .stream-indicator svg { width:100%; height:100%; fill:none; stroke:currentColor;
      stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
    .stream-indicator.direct { color:#12bb70; }
    .stream-indicator.transcode { color:#ff9900; }
    .progress { margin-top:auto; width:100%; height:6px; border-radius:7px; overflow:hidden;
      background:color-mix(in srgb,var(--shared-accent) 24%,transparent); }
    .fill { display:block; height:100%; background:var(--shared-accent);
      border-radius:7px; transition:width .3s linear; }
    .times { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:5px 8px;
      font-size:calc(var(--tr-font-size)*.82); font-variant-numeric:tabular-nums; }
    .time-right { display:flex; justify-content:flex-end; flex-wrap:wrap; align-items:center; gap:4px 12px; }
    .time-end { white-space:nowrap; opacity:.9; }
    .time-paused { color:#ff9900; font-weight:700; }
    /* Footer information wraps freely; the poster remains vertically centered beside it. */
    .meta { display:flex; align-items:center; flex-wrap:wrap; gap:5px;
      margin-top:5px; padding-top:7px; border-top:1px solid var(--divider-color,rgba(255,255,255,.12));
      font-size:calc(var(--tr-font-size)*.80); }
    .chip { display:inline-flex; align-items:center; padding:3px 7px; border-radius:7px;
      background:var(--pill-bg); color:var(--pill-text); font-weight:600; }
    .chip.warn { background:color-mix(in srgb,#ff9900 14%,transparent); color:#ff9900; }
    .empty-message { text-align:center; padding:18px 8px;
      font-size:var(--tr-font-size); }
    .carousel-nav { display:flex; justify-content:center; align-items:center; gap:12px;
      margin-top:8px; font-size:calc(var(--tr-font-size)*.85); }
    button.nav { border:1px solid var(--divider-color,rgba(255,255,255,.18));
      background:transparent; color:var(--primary-text-color,#fff);
      border-radius:8px; padding:6px 11px; cursor:pointer; font-size:calc(var(--tr-font-size)*.95); }
    button.nav:focus-visible,.streams.carousel:focus-visible { outline:2px solid var(--focus-color,#00bcd4); outline-offset:2px; }
    .compact .stream { min-height:78px; padding:8px; gap:8px; }
    .compact .poster-wrap { width:48px; flex-basis:48px; height:72px; }
    .compact .user { font-size:calc(var(--tr-font-size)*.83); }
    .compact .info { gap:3px; }
    .compact .media-flags { top:8px; right:8px; }
    @container (max-width:520px) { .streams.grid { grid-template-columns:1fr!important; }
      .carousel .stream { flex-basis:100%!important; } }
    @media (prefers-reduced-motion:reduce) { .fill { transition:none; } .metric.blink-positive { animation:none; } }
  `;

  function normalizeConfig(config) {
    const result = {...DEFAULTS, ...config};
    // Pre-0.1.4 dashboards continue to behave the same until users change them.
    if (!("header_show_streams" in config)) result.header_show_streams = config.show_counter ?? true;
    if (config.show_transcodes && !["header_show_video","header_show_audio","header_show_both","header_show_transcodes_total"].some(k => k in config)) {
      result.header_show_video = result.header_show_audio = result.header_show_both = result.header_show_transcodes_total = true;
    }
    if (!("accent_color_mode" in config) && config.progress_color_mode) result.accent_color_mode = config.progress_color_mode;
    if (!("accent_custom_color" in config) && config.progress_custom_color) result.accent_custom_color = config.progress_custom_color;
    // A single pre-0.1.6 show_year switch controlled both movie and episode years.
    if (!("movie_show_year" in config) && "show_year" in config) result.movie_show_year = !!config.show_year;
    if (!("series_show_year" in config) && "show_year" in config) result.series_show_year = !!config.show_year;
    // Preserve existing dashboards: the old single switch controlled both numbers.
    if (!("series_show_season" in config) && "series_show_season_episode" in config)
      result.series_show_season = !!config.series_show_season_episode;
    if (!("series_show_episode_number" in config) && "series_show_season_episode" in config)
      result.series_show_episode_number = !!config.series_show_season_episode;
    result.movie_field_order = normalizedOrder(result.movie_field_order, MOVIE_FIELDS).join(",");
    result.footer_field_order = normalizedOrder(result.footer_field_order, FOOTER_FIELDS).join(",");
    // Place the newly separated episode number after season in old saved orders.
    const oldOrder = String(result.series_field_order || "").split(",").map(x => x.trim());
    if (!oldOrder.includes("episode_number")) {
      const seasonIndex = oldOrder.indexOf("season");
      oldOrder.splice(seasonIndex < 0 ? oldOrder.length : seasonIndex + 1, 0, "episode_number");
    }
    result.series_field_order = normalizedOrder(oldOrder.join(","), SERIES_FIELDS).join(",");
    if (!("empty_mode" in config) && config.hide_empty) result.empty_mode = "hide";
    if (!["message", "header_only", "hide"].includes(result.empty_mode)) result.empty_mode = "message";
    if (!["both", "local", "remote"].includes(result.bitrate_scope)) result.bitrate_scope = "both";
    result.header_blink_seconds = clamp(result.header_blink_seconds, .5, 20, 2);
    result.header_entity_badges = Array.isArray(result.header_entity_badges) ? result.header_entity_badges.slice(0, 20)
      .filter(row => row && typeof row === "object" && typeof row.entity === "string")
      .map((row,i) => ({...row, id: String(row.id || `legacy-${i}`), entity:row.entity, label:String(row.label || ""),
        show_name: typeof row.show_name === "boolean" ? row.show_name : undefined,
        show_icon: !!row.show_icon,
        only_positive: !!row.only_positive, blink_positive: !!row.blink_positive,
        blink_seconds: row.blink_seconds ? clamp(row.blink_seconds,.5,20,2) : undefined,
        zero_color_mode: row.zero_color_mode === "custom" ? "custom" : "inherit",
        zero_custom_color: validColor(row.zero_custom_color || "#576574"),
      })) : [];
    result.header_badge_order = normalizedOrder(result.header_badge_order,
      [...HEADER_FIELDS, ...result.header_entity_badges.map(row => `entity:${row.id}`)]).join(",");
    return result;
  }

  class BaseTracearrCard extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({mode: "open"});
      this._config = {...DEFAULTS};
      this._hass = null;
      this._payload = {entries: []};
      this._connection = null;
      this._unsubscribe = null;
      this._closed = false;
      this._images = new Map();
      this._positions = new Map();
      this._tick = null;
      this._carouselTimer = null;
      this._carouselFrame = null;
      this._carouselAnimating = false;
      this._carouselIndex = 0;
      this._renderFingerprint = null;
      this._liveFingerprints = new Map();
      this._headerMarkup = "";
      this._entry = null;
    }
    static getStubConfig() { return {...DEFAULTS}; }
    static getConfigElement() { return document.createElement("tracearr-card-editor"); }
    setConfig(config) {
      if (!config || !["list", "grid", "carousel", undefined].includes(config.mode)) throw Error("Invalid Tracearr layout");
      this._config = normalizeConfig(config);
      this._renderFingerprint = null;
      this._liveFingerprints.clear();
      this._carouselIndex = 0;
      this._stopCarouselAnimation();
      this._setTimers();
      this.render();
    }
    set hass(hass) {
      this._hass = hass;
      if (hass?.connection && this._connection !== hass.connection) this._subscribe(hass.connection);
      // Entity badges read the current HA state, independent of Tracearr SSE.
      // Updating only the header prevents unrelated sensor changes from resetting
      // the carousel animation, scroll position or playback clocks.
      if (this._config.header_entity_badges?.length && this._renderFingerprint !== null &&
          this.shadowRoot?.querySelector("ha-card")) this._refreshHeader(this._streams(this._entryData()));
    }
    connectedCallback() {
      this._closed = false;
      this._setTimers();
      if (this._hass?.connection && !this._connection) this._subscribe(this._hass.connection);
    }
    disconnectedCallback() {
      this._closed = true;
      clearInterval(this._tick);
      clearInterval(this._carouselTimer);
      this._stopCarouselAnimation();
      this._tick = null;
      this._carouselTimer = null;
      if (this._unsubscribe) this._unsubscribe();
      this._unsubscribe = null;
      this._connection = null;
    }
    _subscribe(connection) {
      if (this._unsubscribe) this._unsubscribe();
      this._unsubscribe = null;
      this._connection = connection;
      connection.subscribeMessage((data) => {
        if (this._closed) return;
        this._payload = data || {entries: []};
        this.render();
      }, {type: "tracearr_ha/subscribe"}).then((unsubscribe) => {
        if (this._closed || this._connection !== connection) unsubscribe();
        else this._unsubscribe = unsubscribe;
      }).catch(() => { this._payload = {entries: []}; this.render(); });
    }
    getCardSize() { return this._config.mode === "list" ? 5 : 4; }
    getGridOptions() {
      // "auto" rows cannot be resized vertically in HA Sections. Always return
      // a numeric default and sensible min/max so the native resize handle works.
      const cfg = this._config;
      const rows = clamp(cfg.grid_rows, 2, 30, 4);
      return {
        columns: clamp(cfg.grid_columns, 3, 12, 12), min_columns: 3, max_columns: 12,
        rows: Number(cfg.grid_rows) > 0 ? rows : 4,
        min_rows: 2, max_rows: 30,
      };
    }
    _setTimers() {
      clearInterval(this._tick);
      clearInterval(this._carouselTimer);
      this._tick = this._carouselTimer = null;
      if (this._closed) return;
      this._tick = setInterval(() => this._updateProgress(), 250);
      this._armCarouselAutoplay();
    }
    _armCarouselAutoplay() {
      clearInterval(this._carouselTimer);
      this._carouselTimer = null;
      if (this._closed || this._config.mode !== "carousel" || !this._config.carousel_autoplay) return;
      const duration = clamp(this._config.carousel_interval, 3, 120, 7);
      this._carouselTimer = setInterval(() => {
        if (!this.isConnected || (this._config.carousel_pause_on_hover && this.matches(":hover")) || document.hidden || window.matchMedia("(prefers-reduced-motion:reduce)").matches) return;
        this._scroll(1, true);
      }, duration * 1000);
    }
    _entryData() {
      const all = this._payload?.entries || [];
      return all.find(e => e.id === this._config.entry_id) || all[0] || null;
    }
    _mapping(entry, field) { return {...asMapping(entry?.[field]), ...asMapping(this._config[field])}; }
    _key(s) { return `${s.server_type}:${s.username}`; }
    _name(entry, s) {
      const map = this._mapping(entry, "aliases");
      return map[`${s.server_id}:${s.username}`] || map[this._key(s)] || map[`${s.server_name}:${s.username}`] || map[s.username] || s.username || "Inconnu";
    }
    _avatar(entry, s) {
      const map = this._mapping(entry, "avatars");
      return safeImage(map[`${s.server_id}:${s.username}`] || map[this._key(s)] || map[s.username]) || "";
    }
    _streams(entry) {
      let streams = [...(entry?.streams || [])];
      if (!this._config.show_paused) streams = streams.filter(s => s.state === "playing");
      if (this._config.filter_server) streams = streams.filter(s => s.server_id === this._config.filter_server || s.server_name === this._config.filter_server);
      if (this._config.filter_user) {
        const desired = String(this._config.filter_user).toLocaleLowerCase();
        streams = streams.filter(s => [s.username, this._name(entry,s)].some(n => String(n||"").toLocaleLowerCase() === desired));
      }
      if (this._config.filter_transcode && this._config.filter_transcode !== "all") streams = streams.filter(s => transcodeMode(s) === this._config.filter_transcode);
      const sort = this._config.sort;
      if (sort === "user") streams.sort((a,b) => this._name(entry,a).localeCompare(this._name(entry,b)));
      else if (sort === "server") streams.sort((a,b) => a.server_name.localeCompare(b.server_name));
      else streams.sort((a,b) => String(b.started_at).localeCompare(String(a.started_at)));
      if (this._individual) {
        if (this._config.selection === "stream" && this._config.stream_id) streams = streams.filter(s => s.id === this._config.stream_id);
        return streams.slice(0, 1);
      }
      return streams;
    }
    _image(entry,s,kind) {
      const direct = kind === "avatar" ? this._avatar(entry,s) : "";
      if (direct) return direct;
      const raw = kind === "poster" ? s.poster_url : s.user_avatar_url;
      if (!raw) return "";
      // Only proxy /api/v1/images/proxy URLs or same-origin ones; absolute external avatars can be shown directly.
      if (typeof raw === "string" && /^https?:\/\//i.test(raw) && !raw.includes("/api/v1/images/proxy")) return safeImage(raw);
      const path = `/api/tracearr_ha/image/${encodeURIComponent(entry.id)}/${encodeURIComponent(s.id)}/${kind}`;
      const cached = this._images.get(path);
      if (cached && cached.expires > Date.now()) return cached.url;
      if (!cached?.pending && this._hass?.connection) {
        const pending = this._hass.connection.sendMessagePromise({type:"auth/sign_path", path, expires:600})
          .then(result => { this._images.set(path,{url:result.path,expires:Date.now()+540000}); if (!this._closed) { this._liveFingerprints.delete(s.id); this.render(); } })
          .catch(() => { this._images.set(path,{url:"",expires:Date.now()+60000}); });
        this._images.set(path,{pending,expires:Date.now()+60000});
      }
      return "";
    }
    _themeAccent() {
      // Use the theme's true RGB value for legible foreground contrast.
      // The CSS var itself remains the color source so theme changes propagate.
      try {
        if (typeof getComputedStyle !== "function") return "#00BCD4";
        const style = getComputedStyle(this);
        const raw = style.getPropertyValue("--accent-color").trim() ||
          getComputedStyle(document.documentElement).getPropertyValue("--accent-color").trim();
        if (readRgb(raw)) return raw;
        if (typeof document.createElement === "function") {
          const helper = document.createElement("span");
          helper.style.color = raw || "#00BCD4";
          (this.shadowRoot || this).appendChild(helper);
          const resolved = getComputedStyle(helper).color;
          helper.remove();
          if (readRgb(resolved)) return resolved;
        }
      } catch (_) { /* detached editor preview or browser without computed styles */ }
      return "#00BCD4";
    }
    _palette(serverType, forceTheme=false) {
      const mode = forceTheme && this._config.accent_color_mode === "server" ? "theme" : this._config.accent_color_mode;
      const raw = mode === "server" ? SERVER_ACCENTS[String(serverType||"").toLowerCase()] :
        mode === "custom" ? validColor(this._config.accent_custom_color) : null;
      const cssColor = raw || "var(--accent-color,#00BCD4)";
      const foreground = contrastColor(raw || this._themeAccent());
      return {bg:cssColor, text:foreground};
    }
    _headerPalette(serverType) {
      const mode = this._config.header_badge_color_mode || "inherit";
      if (mode === "inherit") return this._palette(serverType, !serverType);
      if (mode === "server") return this._paletteForMode("server", serverType);
      if (mode === "custom") return this._paletteForMode("custom", serverType, this._config.header_badge_custom_color);
      return this._paletteForMode("theme", serverType);
    }
    _paletteForMode(mode, serverType, customColor) {
      const raw = mode === "server" ? SERVER_ACCENTS[String(serverType || "").toLowerCase()] :
        mode === "custom" ? validColor(customColor) : null;
      const bg = raw || "var(--accent-color,#00BCD4)";
      return {bg, text:contrastColor(raw || this._themeAccent())};
    }
    _mediaFields(stream) {
      const c = this._config;
      const episode = stream.media_type === "episode";
      if (!episode) {
        const fields = {
          title: c.movie_show_title && stream.media_title ? stream.media_title : "",
          year: c.movie_show_year && stream.year != null ? String(stream.year) : "",
        };
        return normalizedOrder(c.movie_field_order, MOVIE_FIELDS)
          .map(key => ({key, text:fields[key]})).filter(item => item.text);
      }
      const season = stream.season_number;
      const episodeNum = stream.episode_number;
      const long = c.series_episode_style === "long";
      const fields = {
        series: c.series_show_title && stream.show_title ? stream.show_title : "",
        season: c.series_show_season && season != null ?
          (long ? `Saison ${season}` : `S${String(season).padStart(2,"0")}`) : "",
        episode_number: c.series_show_episode_number && episodeNum != null ?
          (long ? `Épisode ${episodeNum}` : `E${String(episodeNum).padStart(2,"0")}`) : "",
        episode: c.series_show_episode_title && stream.media_title ? stream.media_title : "",
        year: c.series_show_year && stream.year != null ? String(stream.year) : "",
      };
      return normalizedOrder(c.series_field_order, SERIES_FIELDS)
        .map(key => ({key, text:fields[key]})).filter(item => item.text);
    }
    _mediaMarkup(stream) {
      const fields = this._mediaFields(stream);
      if (!fields.length) return "";
      const parts = [];
      for (const field of fields) {
        // Join S01 + E02 only when adjacent, preserving the user's field order.
        if (stream.media_type === "episode" && this._config.series_episode_style !== "long" &&
            field.key === "episode_number" && parts.length && parts.at(-1).key === "season") {
          parts[parts.length-1] = {key:"season_episode", text:parts.at(-1).text + field.text};
        } else parts.push(field);
      }
      return `<div class="title" title="${E(parts[0].text)}">${E(parts[0].text)}</div>` +
        (parts.length > 1 ? `<div class="subtitle">${parts.slice(1).map(field=>E(field.text)).join(" · ")}</div>` : "");
    }
    // Tracearr v2 has no local/WAN flag or client IP in /streams.
    // Users can explicitly map stable server-account and client-device names.
    _networkScope(stream) {
      const direct = String(stream.network_type || stream.network || "").toLowerCase();
      // Global device rules live in the integration options; individual cards
      // can override them without changing the settings of other dashboards.
      const mapping = {...asMapping(this._entryData()?.network_locations),
        ...asMapping(this._config.network_locations)};
      const candidates = [
        stream.device && `${stream.server_id}:device:${stream.device}`,
        stream.device && `device:${stream.device}`,
        stream.player && `${stream.server_id}:player:${stream.player}`,
        stream.player && `player:${stream.player}`,
        `${stream.server_id}:${stream.username}`, `${stream.server_type}:${stream.username}`,
        `${stream.server_name}:${stream.username}`, stream.username,
      ].filter(Boolean);
      const location = candidates.map(key => mapping[key]).find(Boolean) || direct;
      const value = String(location).trim().toLowerCase();
      if (["local", "lan", "interne"].includes(value)) return "local";
      if (["remote", "wan", "distant", "externe"].includes(value)) return "remote";
      return "unknown";
    }
    _includeBitrate(stream) {
      const scope = this._config.bitrate_scope || "both";
      return scope === "both" || this._networkScope(stream) === scope;
    }
    _streamSummary(streams) {
      const sums = {total:streams.length, direct:0, video:0, audio:0, both:0,
        transcodes:0, unknown:0, paused:0, bandwidth:0, byServer:new Map()};
      for (const s of streams) {
        const kind = transcodeMode(s);
        sums[kind]++;
        if (kind === "video" || kind === "audio" || kind === "both" || s.is_transcode) sums.transcodes++;
        if (s.state === "paused") sums.paused++;
        if (this._includeBitrate(s)) sums.bandwidth += Math.max(0, Number(s.bitrate) || 0);
        const id = s.server_id || `${s.server_type}:${s.server_name}`;
        const row = sums.byServer.get(id) || {name:s.server_name || s.server_type || "Serveur",type:s.server_type,count:0};
        row.count++;
        sums.byServer.set(id,row);
      }
      return sums;
    }
    _header(streams) {
      const c = this._config;
      if (!c.show_header) return "";
      const summary = this._streamSummary(streams);
      const metrics = new Map();
      // Each numeric metric can be hidden at zero, blink while positive, and
      // use a distinct zero-state color. Custom HA badges may override each.
      const add = (key, enabled, name, display, value, colorType=null, custom=null) => {
        if (!enabled) return;
        const count = Number(value);
        const positive = Number.isFinite(count) && count > 0;
        const hideZero = c.header_positive_only || !!custom?.only_positive;
        if (hideZero && !positive) return;
        const blinking = positive && (c.header_blink_positive || !!custom?.blink_positive);
        const duration = clamp(custom?.blink_seconds ?? c.header_blink_seconds,.5,20,2);
        const zeroMode = custom?.zero_color_mode === "custom" ? "custom" : c.header_zero_color_mode;
        const zeroColor = custom?.zero_color_mode === "custom" ? custom.zero_custom_color : c.header_zero_custom_color;
        const palette = !positive && zeroMode === "custom" ? this._paletteForMode("custom",null,zeroColor) : this._headerPalette(colorType);
        const showName = custom?.show_name ?? c.header_show_names;
        const safeIcon = String(custom?.icon || "");
        const iconMarkup = custom?.show_icon && /^(mdi|hass):[a-z0-9-]+$/.test(safeIcon) ?
          `<ha-icon icon="${E(safeIcon)}" aria-hidden="true"></ha-icon>` : "";
        const output = `${showName && name ? `${E(name)} : ` : ""}${E(display)}`;
        const markup = `<span class="metric${blinking ? " blink-positive" : ""}" style="--pill-bg:${palette.bg};--pill-text:${palette.text};--badge-blink:${duration}s" title="${E(name || display)}">${iconMarkup}${output}</span>`;
        metrics.set(key, [...(metrics.get(key) || []), markup]);
      };
      // Preserve the existing stream-count format "2 flux" when names are on.
      add("streams", c.header_show_streams, "", c.header_show_names ? `${summary.total} flux` : String(summary.total), summary.total);
      const bandwidthTitle = c.bitrate_scope === "local" ? "Débit local" :
        c.bitrate_scope === "remote" ? "Débit distant" : "Débit";
      add("bandwidth", c.header_show_bandwidth, bandwidthTitle, `${(summary.bandwidth/1000).toFixed(1)} Mb/s`, summary.bandwidth);
      add("direct", c.header_show_direct, "Direct", summary.direct, summary.direct);
      add("paused", c.header_show_paused, "Pause", summary.paused, summary.paused);
      add("video", c.header_show_video, "Vidéo", summary.video, summary.video);
      add("audio", c.header_show_audio, "Audio", summary.audio, summary.audio);
      add("both", c.header_show_both, "Vidéo + audio", summary.both, summary.both);
      add("transcodes_total", c.header_show_transcodes_total, "Transcodes", summary.transcodes, summary.transcodes);
      if (c.header_show_server_counts) {
        for (const server of summary.byServer.values()) add("server_counts",true,server.name,server.count,server.count,server.type);
      }
      // Custom badges consume the entity's current state, unit and icon.
      for (const row of c.header_entity_badges || []) {
        const id = String(row.entity || "");
        if (!/^[a-z_]+\.[a-z0-9_]+$/.test(id)) continue;
        const state = this._hass?.states?.[id];
        const name = String(row.label || state?.attributes?.friendly_name || id);
        const value = state?.state == null ? "Indisponible" : String(state.state);
        const unit = state?.attributes?.unit_of_measurement;
        const units = unit && !["unknown", "unavailable"].includes(value) ? ` ${unit}` : "";
        const domain = id.split(".")[0];
        const fallback = ({counter:"mdi:counter", sensor:"mdi:gauge", binary_sensor:"mdi:check-circle-outline",
          input_number:"mdi:numeric", number:"mdi:numeric", light:"mdi:lightbulb", switch:"mdi:toggle-switch"})[domain] || "mdi:information-outline";
        add(`entity:${row.id}`, true, name, `${value}${units}`, value, null, {...row,icon:state?.attributes?.icon || fallback});
      }
      const title = c.show_title ? `<h3>${E(c.title || "Lectures en cours")}</h3>` : "";
      const order = normalizedOrder(c.header_badge_order,
        [...HEADER_FIELDS, ...(c.header_entity_badges || []).map(row => `entity:${row.id}`)]);
      const orderedMetrics = order.flatMap(key => metrics.get(key) || []);
      if (!title && !orderedMetrics.length) return "";
      return `<header class="head">${title}${orderedMetrics.length ? `<div class="head-metrics">${orderedMetrics.join("")}</div>` : ""}</header>`;
    }
    // API samples may be slightly older than the local playback time. Keep a
    // monotonic client-side clock for ordinary SSE updates; only snap when the
    // *difference between two API samples* is evidence of a real seek.
    _now() { return performance.now(); }
    _positionAt(clock, now=this._now()) {
      if (!clock) return 0;
      const delta = clock.state === "playing" ? Math.max(0, now - clock.at) : 0;
      return clock.duration > 0 ? Math.min(clock.duration, clock.progress + delta) : clock.progress + delta;
    }
    _syncPosition(stream, now=this._now()) {
      const id = stream.id;
      const duration = Math.max(0, Number(stream.duration_ms) || 0);
      const source = Math.max(0, Math.min(duration || Infinity, Number(stream.progress_ms) || 0));
      const state = stream.state === "playing" ? "playing" : "paused";
      // Session IDs can be reused; do not preserve an old film's clock.
      const media = [stream.started_at || "", stream.media_id || stream.rating_key || stream.media_title || ""].join("|");
      const old = this._positions.get(id);
      if (!old || old.media !== media || (old.duration && duration && Math.abs(old.duration-duration) > 10000)) {
        const fresh = {progress:source, at:now, duration, state, media,
          lastRaw:source, lastRawAt:now, lastRendered:source};
        this._positions.set(id, fresh);
        return fresh;
      }
      const predicted = this._positionAt(old, now);
      const sinceRaw = Math.max(0, now - old.lastRawAt);
      const sampleDelta = source - old.lastRaw;
      // Rewinds greater than 4 seconds or a jump > 8 seconds beyond the
      // elapsed time since the previous distinct source sample indicate seeks.
      // Ordinary delayed/stale samples never force a backward jump.
      const seek = sampleDelta < -4000 || sampleDelta > sinceRaw + 8000;
      let position = seek ? source : predicted;
      if (!seek && source !== old.lastRaw) {
        // Gentle drift correction: at most 200ms per new API sample, so a 2s
        // sample cadence can never create a visible 2s leap or rewind.
        const error = source - predicted;
        position += Math.max(-200, Math.min(200, error * 0.12));
      }
      if (!seek && state === "paused") {
        // Paused streams must not drift or be nudged by delayed progress packets;
        // a deliberate seek is the only reason to change a paused position.
        position = old.state === "playing" ? Math.max(predicted, old.lastRendered) :
          Math.max(old.progress, old.lastRendered);
      }
      if (!seek) position = Math.max(position, old.lastRendered);
      old.progress = duration > 0 ? Math.min(duration, position) : position;
      old.at = now;
      old.duration = duration;
      old.state = state;
      if (seek) old.lastRendered = old.progress;
      if (source !== old.lastRaw) {
        old.lastRaw = source;
        old.lastRawAt = now;
      }
      return old;
    }
    _streamCard(entry,s) {
      const c = this._config;
      const poster = c.show_poster ? this._image(entry,s,"poster") : "";
      const avatar = c.show_avatar ? this._image(entry,s,"avatar") : "";
      const name = this._name(entry,s);
      const mediaMarkup = this._mediaMarkup(s);
      const clock = this._syncPosition(s);
      const displayPosition = Math.max(clock.lastRendered, this._positionAt(clock));
      const ratio = clock.duration > 0 ? 100 * Math.min(1, displayPosition / clock.duration) : 0;
      const timePair = playbackSeconds(displayPosition, clock.duration);
      const endLabel = c.show_end_time && clock.state === "playing" && clock.duration > 0 ?
        `<span class="time-end" data-id="${E(s.id)}">Fin estimée : ${E(estimatedEnd(clock,displayPosition,Date.now()))}</span>` : "";
      const paused = s.state === "paused";
      const metaByKey = {};
      if (c.show_health && entry?.servers?.find(server => server.server_id === s.server_id)?.status === "down") metaByKey.health = (`<span class="chip warn">Serveur hors ligne</span>`);
      if (c.show_server) metaByKey.server = `<span>${E(s.server_name || s.server_type || "")}</span>`;
      if (c.show_device && (s.device || s.player)) metaByKey.device = `<span>${E(s.device || s.player)}</span>`;
      if (c.show_quality && s.resolution) metaByKey.quality = `<span class="chip">${E(s.resolution)}</span>`;
      // The separate video/audio icons take the place of the old text badge.
      if (c.show_bitrate && this._includeBitrate(s) && s.bitrate != null)
        metaByKey.bitrate = `<span class="chip">${E((s.bitrate/1000).toFixed(1))} Mb/s</span>`;
      if (c.show_codecs && (s.stream_video_codec_display || s.stream_audio_codec_display)) metaByKey.codecs = `<span>${E([s.stream_video_codec_display,s.stream_audio_codec_display].filter(Boolean).join(" / "))}</span>`;
      const meta = normalizedOrder(c.footer_field_order, FOOTER_FIELDS).map(k => metaByKey[k]).filter(Boolean);
      const accent = SERVER_ACCENTS[String(s.server_type || "").toLowerCase()] || "var(--tr-accent)";
      const palette = this._palette(s.server_type);
      const sharedStyle = `--shared-accent:${palette.bg};--pill-bg:${palette.bg};--pill-text:${palette.text}`;
      const indicators = c.show_transcode_icons ? `<div class="media-flags" aria-label="État du flux audio et vidéo">${["video","audio"].map(kind => {
        const decision = kind === "video" ? s.video_decision : s.audio_decision;
        const state = codecState(decision);
        const tip = `${kind === "video" ? "Vidéo" : "Audio"} : ${state === "transcode" ? "Transcodage" : state === "direct" ? "Lecture directe" : "Inconnu"}`;
        return `<span class="stream-indicator ${state}" role="img" aria-label="${E(tip)}" title="${E(tip)}">${badgeIcon(kind)}</span>`;
      }).join("")}</div>` : "";
      const posterMarkup = c.show_poster ? `<div class="poster-wrap">${poster ? `<img class="poster" src="${E(poster)}" alt="Affiche" loading="lazy">` : `<div class="poster empty">▣</div>`}${paused ? `<span class="poster-paused" aria-label="Lecture en pause"><span class="pause-symbol" aria-hidden="true"></span></span>` : ""}</div>` : "";
      return `<article class="stream" data-session="${E(s.id)}" style="--stream-accent:${accent};${sharedStyle}">
        ${posterMarkup}
        ${indicators}
        <div class="info">
          ${c.show_avatar ? `<div class="user">${avatar ? `<img class="avatar" src="${E(avatar)}" alt="">` : `<span class="avatar fallback-avatar">${E(name.slice(0,1).toUpperCase())}</span>`}<span>${E(name)}</span></div>` : `<div class="user">${E(name)}</div>`}
          ${mediaMarkup}
          ${c.show_progress ? `<div class="progress"><span class="fill" data-id="${E(s.id)}" style="width:${ratio.toFixed(2)}%"></span></div>` : ""}
          ${c.show_progress || c.show_end_time ? `<div class="times"><span class="time-current" data-id="${E(s.id)}">${formattedSeconds(timePair.elapsed)}</span><div class="time-right">${paused ? `<span class="time-paused">En pause</span>` : c.show_remaining && c.show_progress ? `<span class="time-remaining" data-id="${E(s.id)}">-${formattedSeconds(timePair.remaining)}</span>` : ""}${endLabel}</div></div>` : ""}
          ${meta.length ? `<div class="meta">${meta.join("<span aria-hidden=\"true\">·</span>")}</div>` : ""}
        </div>
      </article>`;
    }
    _updateProgress() {
      if (!this.shadowRoot || !this.isConnected) return;
      // Capture one monotonic tick shared by the bar, elapsed, remaining and
      // end-time estimate. All visible seconds derive from the same integer.
      const now = this._now();
      const wallNow = Date.now();
      this.shadowRoot.querySelectorAll(".time-current[data-id]").forEach(currentNode => {
        const id = currentNode.dataset.id;
        const item = this._positions.get(id);
        if (!item || !item.duration) return;
        const current = Math.max(item.lastRendered, this._positionAt(item,now));
        item.lastRendered = Math.min(item.duration, current);
        const pair = playbackSeconds(item.lastRendered,item.duration);
        const selectorId = CSS.escape(id);
        const fillNode = this.shadowRoot.querySelector(`.fill[data-id="${selectorId}"]`);
        if (fillNode) fillNode.style.width = `${(100*item.lastRendered/item.duration).toFixed(2)}%`;
        const left = formattedSeconds(pair.elapsed);
        if (currentNode.textContent !== left) currentNode.textContent = left;
        const remainingNode = this.shadowRoot.querySelector(`.time-remaining[data-id="${selectorId}"]`);
        if (remainingNode) {
          const right = `-${formattedSeconds(pair.remaining)}`;
          if (remainingNode.textContent !== right) remainingNode.textContent = right;
        }
        const endNode = this.shadowRoot.querySelector(`.time-end[data-id="${selectorId}"]`);
        if (endNode) {
          const end = estimatedEnd(item,item.lastRendered,wallNow);
          const label = end ? `Fin estimée : ${end}` : "";
          if (endNode.textContent !== label) endNode.textContent = label;
        }
      });
    }
    _stopCarouselAnimation() {
      if (this._carouselFrame !== null) cancelAnimationFrame(this._carouselFrame);
      this._carouselFrame = null;
      this._carouselAnimating = false;
      const el = this.shadowRoot?.querySelector(".streams.carousel");
      if (el) el.style.scrollSnapType = "";
    }
    _carouselVisibleCount(el, cards) {
      // Container queries may force a single stream on small dashboard cards.
      // Use the actual rendered size instead of blindly trusting the editor value.
      const configured = clamp(this._config.carousel_visible, 1, 4, 1);
      const first = cards?.[0];
      const width = first?.getBoundingClientRect?.().width;
      if (!el?.clientWidth || !Number.isFinite(width) || width <= 0) return configured;
      const gap = 10;
      return clamp(Math.floor((el.clientWidth + gap + 1) / (width + gap)), 1, 4, 1);
    }
    _carouselMaxIndex(count, el, cards) {
      const visible = this._carouselVisibleCount(el, cards);
      return Math.max(0, count - visible);
    }
    _goToCarouselIndex(el, cards, index) {
      const first = cards[0];
      const target = cards[index];
      if (!first || !target) return;
      const left = target.offsetLeft - first.offsetLeft;
      this._stopCarouselAnimation();
      const duration = clamp(this._config.carousel_transition_speed, 100, 3000, 600);
      const chosen = this._config.carousel_transition;
      const effect = TRANSITION_EFFECTS.includes(chosen) ? chosen : "slide";
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (effect !== "slide" || reducedMotion) {
        // Different effects switch pages directly, then animate the incoming cards.
        // This also works with multiple visible streams (unlike stacked slides).
        el.scrollLeft = left;
        if (!reducedMotion && effect !== "none") {
          const frames = {
            fade: [{opacity: 0}, {opacity: 1}],
            zoom: [{opacity: 0.3, transform: "scale(.86)"}, {opacity: 1, transform: "scale(1)"}],
            flip: [{opacity: 0.4, transform: "perspective(900px) rotateY(-75deg)"}, {opacity: 1, transform: "perspective(900px) rotateY(0deg)"}],
          }[effect];
          if (frames) {
            cards.slice(index, index + this._carouselVisibleCount(el, cards)).forEach(card => {
              if (typeof card.animate === "function") card.animate(frames, {duration, easing: "ease-in-out"});
            });
          }
        }
        return;
      }
      if (Math.abs(el.scrollLeft - left) < 1) return;
      const from = el.scrollLeft;
      const start = performance.now();
      el.style.scrollSnapType = "none";
      this._carouselAnimating = true;
      const step = (now) => {
        if (!this.isConnected) { this._stopCarouselAnimation(); return; }
        const progress = Math.min(1, Math.max(0, (now - start) / duration));
        const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - ((-2 * progress + 2) ** 3) / 2;
        el.scrollLeft = from + (left - from) * eased;
        if (progress < 1) this._carouselFrame = requestAnimationFrame(step);
        else {
          el.scrollLeft = left;
          this._carouselFrame = null;
          this._carouselAnimating = false;
          el.style.scrollSnapType = "";
        }
      };
      this._carouselFrame = requestAnimationFrame(step);
    }
    _enableMouseDrag(el, cards) {
      if (!this._config.carousel_mouse_drag || !el) return;
      let startX = 0, scrollAtStart = 0, dragging = false;
      el.addEventListener("pointerdown", (event) => {
        if (event.pointerType !== "mouse" || event.button !== 0 || !cards.length) return;
        startX = event.clientX;
        scrollAtStart = el.scrollLeft;
        dragging = true;
        this._stopCarouselAnimation();
        el.classList.add("is-dragging");
        el.setPointerCapture?.(event.pointerId);
      });
      el.addEventListener("pointermove", (event) => {
        if (!dragging) return;
        const delta = event.clientX - startX;
        el.scrollLeft = scrollAtStart - delta;
        if (Math.abs(delta) > 5) event.preventDefault();
      });
      const end = (event) => {
        if (!dragging) return;
        dragging = false;
        el.classList.remove("is-dragging");
        if (el.hasPointerCapture?.(event.pointerId)) el.releasePointerCapture(event.pointerId);
        const first = cards[0];
        if (!first) return;
        const visibleMax = this._carouselMaxIndex(cards.length, el, cards);
        const nearest = cards.reduce((best, card, index) => {
          if (index > visibleMax) return best;
          const distance = Math.abs(el.scrollLeft - (card.offsetLeft - first.offsetLeft));
          return distance < best.distance ? {index, distance} : best;
        }, {index:0, distance:Infinity}).index;
        this._carouselIndex = nearest;
        this._goToCarouselIndex(el, cards, nearest);
        this._armCarouselAutoplay();
      };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
      el.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          this._scroll(event.key === "ArrowRight" ? 1 : -1);
        }
      });
    }
    _scroll(direction, fromAutoplay=false) {
      // Never cut an animation short if the configured interval fires while a
      // previous transition is still running.
      if (fromAutoplay && this._carouselAnimating) return;
      const el = this.shadowRoot.querySelector(".streams.carousel");
      if (!el) return;
      const cards = [...el.querySelectorAll(".stream")];
      const max = this._carouselMaxIndex(cards.length, el, cards);
      if (max < 1) return;
      const next = this._carouselIndex + (direction > 0 ? 1 : -1);
      this._carouselIndex = next > max ? 0 : next < 0 ? max : next;
      this._goToCarouselIndex(el, cards, this._carouselIndex);
      if (!fromAutoplay) this._armCarouselAutoplay();
    }

    _liveSnapshot(stream, entry) {
      const {progress_ms, ...rest} = stream;
      return JSON.stringify({rest,health:entry?.servers?.find(x => x.server_id === stream.server_id)?.status});
    }
    _refreshHeader(streams) {
      const header = this._header(streams);
      if (header === this._headerMarkup) return;
      const oldHeader = this.shadowRoot.querySelector(".head");
      const root = this.shadowRoot.querySelector(".root");
      if (oldHeader && header) oldHeader.outerHTML = header;
      else if (oldHeader && !header) oldHeader.remove();
      else if (!oldHeader && header) root?.insertAdjacentHTML("afterbegin", header);
      this._headerMarkup = header;
    }
    _updateCarouselLive(entry, streams) {
      const carousel = this.shadowRoot.querySelector(".streams.carousel");
      if (!carousel) return;
      // Keep the carousel element and its scroll animation untouched for routine
      // SSE updates (state, bitrate, codec, server health, posters, etc.).
      this._refreshHeader(streams);
      const cards = [...carousel.querySelectorAll(".stream")];
      for (let index=0; index<streams.length; index++) {
        const stream = streams[index];
        const signature = this._liveSnapshot(stream,entry);
        if (this._liveFingerprints.get(stream.id) === signature) continue;
        const card = cards[index];
        if (!card || card.dataset.session !== String(stream.id)) continue;
        const template = document.createElement("template");
        template.innerHTML = this._streamCard(entry,stream);
        const fresh = template.content?.firstElementChild;
        if (fresh) {
          card.innerHTML = fresh.innerHTML;
          card.style.cssText = fresh.style.cssText;
          this._liveFingerprints.set(stream.id,signature);
        }
      }
    }

    render() {
      const entry = this._entryData();
      const c = this._config;
      if (!this.shadowRoot) return;
      const streams = this._streams(entry);
      // Keep a stable carousel shell while live SSE properties change. The
      // original full DOM rebuild used to teleport the slider without any
      // transition whenever pause/bitrate/health/codec updates arrived.
      const fingerprint = JSON.stringify({
        config: c,
        streams: c.mode === "carousel" ? streams.map(s => s.id) : streams.map(({progress_ms, ...rest}) => rest),
        stats: c.mode === "carousel" ? undefined : entry?.stats,
        servers: c.mode === "carousel" ? undefined : entry?.servers,
        aliases: entry?.aliases,
        avatars: entry?.avatars,
        connected: entry?.connected,
      });
      // Refresh each stream's clock even if the rest of the card is unchanged.
      // Crucially, do NOT reset its anchor on every incoming SSE progress event.
      const now = this._now();
      for (const stream of streams) this._syncPosition(stream, now);
      if (fingerprint === this._renderFingerprint && this.shadowRoot.querySelector("ha-card")) {
        if (c.mode === "carousel") this._updateCarouselLive(entry, streams);
        this._updateProgress();
        return;
      }
      this._renderFingerprint = fingerprint;
      const carousel = this.shadowRoot.querySelector(".streams.carousel");
      const oldScroll = carousel?.scrollLeft || 0;
      const previousAnchor = carousel?.querySelectorAll(".stream")?.[this._carouselIndex]?.dataset?.session;
      this._stopCarouselAnimation();
      if (c.empty_mode === "hide" && !streams.length) { this.shadowRoot.innerHTML = `<style>${style}</style>`; this.style.display="none"; return; }
      this.style.display="";
      const head = this._header(streams);
      this._headerMarkup = head;
      this._liveFingerprints = new Map(streams.map(s => [s.id, this._liveSnapshot(s,entry)]));
      const cols = c.columns === "auto" ? "repeat(auto-fit,minmax(min(100%,var(--min-column,290px)),1fr))" : `repeat(${Math.max(1, Math.min(4,Number(c.columns)||1))}, minmax(0,1fr))`;
      const visible = clamp(c.carousel_visible, 1, 4, 1);
      const items = streams.map(s => this._streamCard(entry,s)).join("");
      // Always conceal the native scrollbar; navigation remains via buttons,
      // touch swipe, optional mouse drag and keyboard arrow keys.
      const classes = `streams ${E(c.mode)}`;
      const emptyText = entry && !entry.connected ? "Tracearr indisponible" : String(c.empty_message ?? "Aucune lecture en cours");
      const body = !streams.length && c.empty_mode === "header_only" ? "" :
        `<div class="${classes}" ${c.mode === "carousel" ? `tabindex="0" role="region" aria-label="Lectures en carrousel"` : ""} style="grid-template-columns:${E(cols)};--carousel-visible:${visible}">${items || `<div class="empty-message">${E(emptyText)}</div>`}</div>`;
      const nav = c.mode === "carousel" && c.carousel_show_arrows && streams.length > 1 ? `<div class="carousel-nav"><button class="nav" data-step="-1" aria-label="Précédent">❮</button><span>${streams.length} lectures</span><button class="nav" data-step="1" aria-label="Suivant">❯</button></div>` : "";
      // When HA Sections assigns grid_options.rows, the native grid height wins.
      // Otherwise the optional pixel height applies (e.g. masonry dashboards).
      const rowsAssigned = Number(c.grid_options?.rows) > 0;
      const fixedHeight = Number(c.height) > 0 && !rowsAssigned ? `height:${clamp(c.height,100,2000,240)}px;` : "";
      this.shadowRoot.innerHTML = `<style>${style}</style><ha-card style="${fixedHeight}--tr-font-size:${clamp(c.font_size,10,28,14)}px"><div class="root ${c.compact?"compact":""} ${c.stream_surface === "transparent" ? "flat-streams" : ""}" style="--min-column:${c.compact?"210px":"290px"}">${head}${body}${nav}</div></ha-card>`;
      const newCarousel = this.shadowRoot.querySelector(".streams.carousel");
      if (newCarousel) {
        const cards = [...newCarousel.querySelectorAll(".stream")];
        if (previousAnchor) {
          const anchored = streams.findIndex(s => s.id === previousAnchor);
          if (anchored >= 0) this._carouselIndex = anchored;
        }
        this._carouselIndex = Math.min(this._carouselIndex, this._carouselMaxIndex(cards.length, newCarousel, cards));
        if (cards.length) {
          newCarousel.scrollLeft = cards[this._carouselIndex].offsetLeft - cards[0].offsetLeft;
        } else newCarousel.scrollLeft = oldScroll;
        this._enableMouseDrag(newCarousel, cards);
        // A touch swipe is manual navigation too: give the user the entire
        // interval before automatically advancing again.
        newCarousel.addEventListener("touchend", () => this._armCarouselAutoplay(), {passive:true});
        newCarousel.addEventListener("scroll", () => {
          if (this._carouselAnimating || !cards.length) return;
          const step = cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : 0;
          if (step > 0) this._carouselIndex = Math.min(this._carouselMaxIndex(cards.length, newCarousel, cards), Math.max(0, Math.round(newCarousel.scrollLeft / step)));
        }, {passive:true});
      } else this._carouselIndex = 0;
      this.shadowRoot.querySelectorAll("button[data-step]").forEach(btn => btn.addEventListener("click", () => this._scroll(Number(btn.dataset.step))));
      this._updateProgress();
    }

  }
  class TracearrStreamsCard extends BaseTracearrCard { get _individual() { return false; } }
  class TracearrStreamCard extends BaseTracearrCard { get _individual() { return true; } }

  const editorStyle = `
    :host { display:block; font:inherit; } .editor { display:grid; gap:9px; padding:8px 0; }
    details { border:1px solid var(--divider-color,#8885); border-radius:10px; overflow:hidden; }
    summary { cursor:pointer; padding:12px; font-size:14px; font-weight:700; background:var(--secondary-background-color,transparent); }
    details[open] summary { border-bottom:1px solid var(--divider-color,#8885); }
    .section-body { padding:12px; display:grid; gap:11px; }
    label { display:grid; gap:5px; font-size:13px; color:var(--primary-text-color); }
    select,input[type=text],input[type=number],textarea,input[type=color] { padding:9px; font:inherit; width:100%; min-width:0; box-sizing:border-box;
      color:var(--primary-text-color); background:var(--card-background-color); border:1px solid var(--divider-color,#777); border-radius:7px; }
    .check { display:flex; align-items:center; gap:8px; } .check input { accent-color:var(--accent-color); flex-shrink:0; }
    .columns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
    textarea { min-height:64px; resize:vertical; } small { font-size:11px; color:var(--secondary-text-color); }
    .group-label { font-weight:700; font-size:13px; padding-top:5px; }
    .order-list { display:grid; gap:5px; }
    .order-row { display:flex; justify-content:space-between; align-items:center; gap:8px;
      border:1px solid var(--divider-color,#7775); border-radius:7px; padding:4px 6px 4px 10px; font-size:13px; }
    .move-controls { display:flex; gap:4px; }
    .move-controls button { background:var(--secondary-background-color,transparent);
      border:1px solid var(--divider-color,#7775); border-radius:6px; color:var(--primary-text-color);
      cursor:pointer; padding:5px 8px; font:inherit; }
    .move-controls button:disabled { opacity:.3; cursor:default; }
    .badge-row { display:grid; gap:8px; border:1px solid var(--divider-color,#7775);
      padding:9px; border-radius:8px; margin:6px 0; }
    .badge-row ha-entity-picker { display:block; width:100%; }
    .badge-row button,.add-badge { border:1px solid var(--divider-color,#7775);
      border-radius:7px; padding:8px; color:var(--primary-text-color);
      background:var(--secondary-background-color,transparent); cursor:pointer; text-align:left; }
  `;
  class TracearrCardEditor extends HTMLElement {
    constructor() {
      super(); this.attachShadow({mode:"open"}); this._config={...DEFAULTS};
      this._payload={entries:[]}; this._openSections=new Set(["header","layout"]);
    }
    setConfig(config) {
      // Keep opened categories across dashboard editor rerenders.
      this._captureOpenSections();
      this._config=normalizeConfig(config);
      this.render();
    }
    set hass(hass) {
      this._hass=hass;
      this.shadowRoot?.querySelectorAll("ha-entity-picker[data-badge-index]").forEach(p => { p.hass = hass; });
      if (hass?.connection && this._connection !== hass.connection) {
        this._connection=hass.connection;
        hass.connection.sendMessagePromise({type:"tracearr_ha/get"}).then(r=>{
          this._payload=r;this._captureOpenSections();this.render();
        }).catch(()=>{});
      }
    }
    _captureOpenSections() {
      const details=this.shadowRoot.querySelectorAll("details[data-section]");
      if (details.length) this._openSections=new Set([...details].filter(d=>d.open).map(d=>d.dataset.section));
    }
    _group(key,title,contents) {
      return `<details data-section="${E(key)}" ${this._openSections.has(key)?"open":""}><summary>${E(title)}</summary><div class="section-body">${contents}</div></details>`;
    }
    _option(value,text) { return `<option value="${E(value)}">${E(text)}</option>`; }
    _select(name,label,options) {
      return `<label>${E(label)}<select data-field="${E(name)}">${options.map(([v,l])=>this._option(v,l)).join("")}</select></label>`;
    }
    _toggle(name,label) {
      return `<label class="check"><input type="checkbox" data-field="${E(name)}" ${this._config[name]?"checked":""}>${E(label)}</label>`;
    }
    _checks(fields) { return `<div class="columns">${fields.map(([key,label])=>this._toggle(key,label)).join("")}</div>`; }
    _number(name,label,min,max) {
      return `<label>${E(label)}<input type="number" min="${min}" max="${max}" step="${Number.isInteger(min) ? 1 : .5}" data-field="${E(name)}" value="${E(this._config[name])}"></label>`;
    }
    _orderEditor(configKey, fields, labels=MEDIA_LABELS) {
      const order = normalizedOrder(this._config[configKey], fields);
      return `<div class="order-list">${order.map((field,index) => {
        const label = labels[field] || field;
        return `<div class="order-row"><span>${E(label)}</span><div class="move-controls"><button type="button" data-order="${E(configKey)}" data-index="${index}" data-direction="-1" ${index===0?"disabled":""} aria-label="Monter ${E(label)}">↑</button><button type="button" data-order="${E(configKey)}" data-index="${index}" data-direction="1" ${index===order.length-1?"disabled":""} aria-label="Descendre ${E(label)}">↓</button></div></div>`;
      }).join("")}</div>`;
    }
    _headerOrderEditor() {
      const custom = this._config.header_entity_badges || [];
      const options = [...HEADER_FIELDS, ...custom.map(row => `entity:${row.id}`)];
      const labels = {...HEADER_LABELS};
      custom.forEach(row => { labels[`entity:${row.id}`] = `Entité : ${row.label || row.entity || "Sans nom"}`; });
      return this._orderEditor("header_badge_order", options, labels);
    }
    _emit() {
      this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:this._config},bubbles:true,composed:true}));
    }
    _entityBadgeEditor() {
      const rows = this._config.header_entity_badges || [];
      return `<div class="group-label">Badges d'entités Home Assistant</div>`+
        `<small>Ajoutez un capteur, compteur ou toute autre entité ; son état sera actualisé automatiquement.</small>`+
        rows.map((row,index) => `<div class="badge-row" data-badge-row="${index}">`+
          `<label>Entité<ha-entity-picker data-badge-index="${index}" aria-label="Choisir une entité"></ha-entity-picker></label>`+
          `<label>Nom facultatif<input type="text" data-badge-label="${index}" placeholder="Nom de l'entité" value="${E(row.label || "")}"></label>`+
          `<div class="columns">`+
            `<label class="check"><input type="checkbox" data-badge-setting="show_name" data-badge-index="${index}" ${(row.show_name ?? this._config.header_show_names) ? "checked" : ""}>Afficher le nom</label>`+
            `<label class="check"><input type="checkbox" data-badge-setting="show_icon" data-badge-index="${index}" ${row.show_icon ? "checked" : ""}>Icône de l'entité</label>`+
            `<label class="check"><input type="checkbox" data-badge-setting="only_positive" data-badge-index="${index}" ${row.only_positive ? "checked" : ""}>Afficher si supérieur à 0</label>`+
            `<label class="check"><input type="checkbox" data-badge-setting="blink_positive" data-badge-index="${index}" ${row.blink_positive ? "checked" : ""}>Clignoter si supérieur à 0</label>`+
          `</div>`+
          `<label>Durée d'un clignotement (secondes)<input type="number" min="0.5" max="20" step="0.5" data-badge-setting="blink_seconds" data-badge-index="${index}" value="${E(row.blink_seconds ?? this._config.header_blink_seconds)}"></label>`+
          `<label>Couleur si valeur à zéro<select data-badge-setting="zero_color_mode" data-badge-index="${index}"><option value="inherit" ${row.zero_color_mode !== "custom" ? "selected" : ""}>Réglage global</option><option value="custom" ${row.zero_color_mode === "custom" ? "selected" : ""}>Couleur particulière</option></select></label>`+
          `<label>Couleur personnalisée à zéro<input type="color" data-badge-setting="zero_custom_color" data-badge-index="${index}" value="${E(validColor(row.zero_custom_color || "#576574"))}"></label>`+
          `<button class="remove-badge" type="button" data-badge-remove="${index}" aria-label="Supprimer le badge">Supprimer</button>`+
          `</div>`).join("")+
        `<button type="button" class="add-badge" data-badge-add ${rows.length>=20?"disabled":""}>+ Ajouter un badge</button>`;
    }
    render() {
      const c=this._config;
      const entries=this._payload.entries||[];
      const selected=entries.find(e=>e.id===c.entry_id)||entries[0];
      const servers=[...new Map((selected?.servers||[]).map(s=>[s.server_id,[s.server_id,s.server_name]])).values()];
      const users=[...new Set((selected?.streams||[]).map(s=>s.username).filter(Boolean))].sort();
      const isIndividual=c.type==="custom:tracearr-stream-card";
      const source=this._select("entry_id","Instance Tracearr",[["","Automatique (première instance)"],...entries.map(e=>[e.id,e.name])])+
        this._select("filter_server","Filtrer par serveur",[["","Tous les serveurs"],...servers])+
        this._select("filter_user","Filtrer par utilisateur",[["","Tous les utilisateurs"],...users.map(u=>[u,u])])+
        this._select("filter_transcode","Mode de lecture",[["all","Tous"],["direct","Direct"],["video","Vidéo seule"],["audio","Audio seul"],["both","Vidéo et audio"],["unknown","Inconnu"]])+
        this._select("sort","Ordre des flux",[["recent","Plus récent d'abord"],["user","Utilisateur"],["server","Serveur"]]);
      const header=this._toggle("show_header","Afficher le bandeau d'en-tête")+
        `<label>Titre de l'en-tête<input type="text" data-field="title" placeholder="Lectures en cours" value="${E(c.title||"")}"></label>`+
        this._toggle("show_title","Afficher le titre")+
        `<small>Les compteurs correspondent aux lectures affichées après filtrage.</small>`+
        this._checks([
          ["header_show_streams","Nombre de flux"],["header_show_bandwidth","Débit total"],
          ["header_show_direct","Lectures directes"],["header_show_paused","Lectures en pause"],
          ["header_show_video","Transcode vidéo seul"],["header_show_audio","Transcode audio seul"],
          ["header_show_both","Transcode vidéo + audio"],["header_show_transcodes_total","Total transcodages"],
          ["header_show_server_counts","Nombre de flux par serveur"],
        ])+
        `<div class="group-label">Couleur des badges d'en-tête</div>`+
        this._select("header_badge_color_mode","Palette des statistiques",[["inherit","Utiliser la palette globale"],["theme","Thème Home Assistant"],["server","Couleur du serveur (comptages par serveur)"],["custom","Couleur personnalisée"]])+
        `<label>Couleur personnalisée de l'en-tête<input type="color" data-field="header_badge_custom_color" value="${E(validColor(c.header_badge_custom_color))}"></label>`+
        `<small>En mode serveur, les statistiques globales utilisent la couleur du thème ; chaque compteur Plex/Jellyfin/Emby conserve sa couleur propre.</small>`+
        `<div class="group-label">Comportement des badges d'en-tête</div>`+
        this._checks([
          ["header_show_names","Afficher les noms des statistiques"],
          ["header_positive_only","Masquer les badges à zéro"],
          ["header_blink_positive","Clignoter quand la valeur est supérieure à zéro"],
        ])+
        this._number("header_blink_seconds","Durée du cycle de clignotement (secondes)",0.5,20)+
        this._select("header_zero_color_mode","Couleur quand la valeur est zéro",[
          ["normal","Palette habituelle"],["custom","Couleur spécifique"],
        ])+
        `<label>Couleur à zéro<input type="color" data-field="header_zero_custom_color" value="${E(validColor(c.header_zero_custom_color))}"></label>`+
        `<small>Pour les entités, vous pouvez aussi choisir ces comportements individuellement. Les animations sont désactivées si le navigateur demande de réduire les mouvements.</small>`+
        this._entityBadgeEditor()+
        `<div class="group-label">Ordre des badges (statistiques et entités)</div>`+
        this._headerOrderEditor();
      const layout=(isIndividual ? this._select("selection","Choix de la lecture",[["recent","Lecture la plus récente"],["stream","Session précise"]])+
        `<label>ID de session<input type="text" data-field="stream_id" value="${E(c.stream_id||"")}"></label>` :
        this._select("mode","Disposition",[["list","Liste verticale"],["grid","Grille adaptative"],["carousel","Carrousel"]])+
        this._select("columns","Colonnes en mode grille",[["auto","Automatique"],["1","1"],["2","2"],["3","3"],["4","4"]]))+
        this._checks([["compact","Mode compact"],["show_paused","Inclure les lectures en pause"]])+
        `<div class="columns">${this._number("grid_columns","Largeur Sections (3–12)",3,12)}${this._number("grid_rows","Hauteur initiale Sections (0=4)",0,30)}</div>`+
        this._number("height","Hauteur CSS hors Sections (0=auto)",0,2000)+
        `<small>Dans un dashboard Sections, la poignée native permet de redimensionner la carte en hauteur et en largeur.</small>`;
      const carousel=this._checks([
          ["carousel_autoplay","Défilement automatique"],["carousel_show_arrows","Flèches de navigation"],
          ["carousel_mouse_drag","Glissement à la souris"],["carousel_pause_on_hover","Pause au survol"],
        ])+
        `<div class="columns">${this._number("carousel_visible","Nombre de flux visibles",1,4)}${this._number("carousel_interval","Intervalle (secondes)",3,120)}</div>`+
        this._select("carousel_transition","Transition",[["slide","Glissement"],["fade","Fondu"],["zoom","Zoom"],["flip","Retournement 3D"],["none","Sans animation"]])+
        this._number("carousel_transition_speed","Durée de transition (ms)",100,3000)+
        `<small>Barre horizontale masquée. Navigation tactile toujours disponible.</small>`;
      const content=this._checks([
        ["show_poster","Affiche"],["show_avatar","Avatar utilisateur"],
        ["show_progress","Barre de lecture"],["show_remaining","Temps restant / En pause"],
        ["show_end_time","Heure de fin estimée (pendant lecture)"],
        ["show_transcode_icons","Icônes vidéo et audio"],
      ]);
      const media = `<div class="group-label">Films</div>`+
        this._checks([["movie_show_title","Afficher le titre"],["movie_show_year","Afficher l'année"]])+
        `<small>Ordre d'affichage (flèches pour déplacer les champs, même masqués) :</small>`+
        this._orderEditor("movie_field_order",MOVIE_FIELDS)+
        `<div class="group-label">Séries et épisodes</div>`+
        this._checks([["series_show_title","Titre de la série"],["series_show_episode_title","Nom de l'épisode"],
          ["series_show_season","Afficher la saison"],["series_show_episode_number","Afficher le numéro d'épisode"],
          ["series_show_year","Année de la série"]])+
        this._select("series_episode_style","Format de saison et épisode",[["short","S01E02"],["long","Saison 1 · Épisode 2"]])+
        `<small>Ordre d'affichage de toutes les informations :</small>`+
        this._orderEditor("series_field_order",SERIES_FIELDS)+
        `<small>Les réglages d'année sont indépendants entre films et séries.</small>`;
      const footer=this._checks([
        ["show_server","Nom du serveur"],["show_device","Appareil / lecteur"],
        ["show_quality","Résolution"],["show_bitrate","Débit du flux"],
        ["show_codecs","Codecs"],["show_health","État du serveur"],
      ])+`<small>Ordre des informations du bandeau (champs masqués inclus) :</small>`+
        this._orderEditor("footer_field_order", FOOTER_FIELDS, FOOTER_LABELS)+
        `<small>Les badges de résolution et de débit adoptent la palette globale avec une écriture blanche ou noire automatique.</small>`;
      const network=this._select("bitrate_scope","Débits à afficher (sur les flux et dans l'en-tête)",[
          ["both","Tous les débits"],["local","Flux locaux uniquement"],["remote","Flux distants uniquement"]])+
        `<label>Exceptions pour cette carte (facultatif, priorité sur les réglages de l’intégration)<textarea data-field="network_locations" placeholder="plex:alice=remote&#10;device:Apple TV=local">${E(c.network_locations||"")}</textarea></label>`+
        `<small>Les affectations globales se configurent dans Paramètres → Appareils et services → Tracearr HA → Configurer → Localisation des appareils. Ici, vous pouvez ajouter des exceptions : serveur:utilisateur=local/remote, device:Nom=local/remote, player:Nom=local/remote ou utilisateur=local/remote. Les flux sans correspondance restent inconnus et ne sont pas comptés en mode local/distant.</small>`;
      const empty=this._select("empty_mode","Quand aucun flux n'est actif",[
          ["message","Afficher un message"],["header_only","Afficher uniquement l'en-tête"],["hide","Masquer complètement la carte"]])+
        `<label>Message personnalisé<input type="text" data-field="empty_message" value="${E(c.empty_message??"Aucune lecture en cours")}"></label>`+
        `<small>Le message est remplacé par « Tracearr indisponible » si la connexion est perdue.</small>`;
      const colors=this._select("accent_color_mode","Palette commune (progression, badges, statistiques)",[
          ["theme","Couleur du thème Home Assistant"],["server","Selon Plex / Jellyfin / Emby"],["custom","Couleur personnalisée"],
        ])+
        `<label>Couleur personnalisée<input type="color" data-field="accent_custom_color" value="${E(validColor(c.accent_custom_color))}"></label>`+
        this._select("stream_surface","Fond intérieur des lectures",[["soft","Légèrement contrasté"],["transparent","Transparent"]])+
        this._number("font_size","Taille du texte (px)",10,28)+
        `<small>Le cadre extérieur utilise le fond, les arrondis et les bordures natifs de Home Assistant. Les badges calculent automatiquement leur contraste.</small>`;
      const usersSection=`<label>Alias (exemple : plex:alice=Alice)<textarea data-field="aliases">${E(c.aliases||"")}</textarea></label>`+
        `<label>Avatars (URL HTTPS, une ligne par utilisateur)<textarea data-field="avatars">${E(c.avatars||"")}</textarea></label>`+
        `<small>Ces réglages sont propres à cette carte et prioritaires sur les alias globaux.</small>`;
      this.shadowRoot.innerHTML=`<style>${editorStyle}</style><div class="editor">${[
        this._group("header","En-tête et statistiques",header),
        this._group("layout","Disposition et dimensions",layout),
        ...(!isIndividual ? [this._group("carousel","Navigation et carrousel",carousel)] : []),
        this._group("content","Contenu de la lecture",content),
        this._group("media","Titres, saisons et années",media),
        this._group("footer","Bandeau d'informations du flux",footer),
        this._group("network","Débit et localisation des flux",network),
        this._group("empty","Comportement sans lecture",empty),
        this._group("colors","Apparence, couleurs et typographie",colors),
        this._group("source","Filtres et tri",source),
        this._group("users","Noms et avatars personnalisés",usersSection),
      ].join("")}</div>`;
      this.shadowRoot.querySelectorAll("[data-field]").forEach(el => {
        const name=el.dataset.field;
        if (el.tagName==="SELECT") el.value=String(c[name]??"");
        const fn=()=>{
          const value=el.type==="checkbox" ? el.checked : el.type==="number" ? Number(el.value) : el.value;
          this._config={...this._config,[name]:value};
          this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:this._config},bubbles:true,composed:true}));
        };
        el.addEventListener("change",fn);
      });
      // HA's native searchable entity picker; each badge can display any domain.
      this.shadowRoot.querySelectorAll("ha-entity-picker[data-badge-index]").forEach(picker => {
        const index=Number(picker.dataset.badgeIndex);
        picker.hass=this._hass;
        picker.value=c.header_entity_badges?.[index]?.entity || "";
        picker.addEventListener("value-changed", event => {
          event.stopPropagation();
          const rows=[...(this._config.header_entity_badges || [])];
          if (!rows[index]) return;
          rows[index]={...rows[index],entity:String(event.detail?.value || "")};
          this._config={...this._config,header_entity_badges:rows};
          this._emit();
        });
      });
      this.shadowRoot.querySelectorAll("input[data-badge-label]").forEach(input => {
        input.addEventListener("change", () => {
          const rows=[...(this._config.header_entity_badges || [])];
          const index=Number(input.dataset.badgeLabel);
          if (!rows[index]) return;
          rows[index]={...rows[index],label:input.value};
          this._config={...this._config,header_entity_badges:rows};
          this._emit();
        });
      });
      this.shadowRoot.querySelectorAll("[data-badge-setting]").forEach(input => {
        input.addEventListener("change", () => {
          const rows = [...(this._config.header_entity_badges || [])];
          const index = Number(input.dataset.badgeIndex);
          if (!rows[index]) return;
          const field = input.dataset.badgeSetting;
          const value = input.type === "checkbox" ? input.checked :
            input.type === "number" ? clamp(input.value,.5,20,2) : input.value;
          rows[index] = {...rows[index], [field]: value};
          this._config = {...this._config,header_entity_badges:rows};
          this._emit();
        });
      });
      this.shadowRoot.querySelector("button[data-badge-add]")?.addEventListener("click", () => {
        const rows=[...(this._config.header_entity_badges || [])];
        if (rows.length>=20) return;
        this._captureOpenSections();
        const id = `badge-${Date.now()}-${rows.length}`;
        this._config={...this._config,
          header_entity_badges:[...rows,{id,entity:"",label:""}],
          header_badge_order: `${this._config.header_badge_order || HEADER_FIELDS.join(",")},entity:${id}`};
        this.render(); this._emit();
      });
      this.shadowRoot.querySelectorAll("button[data-badge-remove]").forEach(btn => {
        btn.addEventListener("click", () => {
          const index=Number(btn.dataset.badgeRemove);
          this._captureOpenSections();
          this._config={...this._config,header_entity_badges:this._config.header_entity_badges.filter((_,i)=>i!==index)};
          this.render(); this._emit();
        });
      });
      this.shadowRoot.querySelectorAll("button[data-order]").forEach(btn => btn.addEventListener("click", () => {
        const key=btn.dataset.order;
        const allowed= key==="movie_field_order" ? MOVIE_FIELDS :
          key==="series_field_order" ? SERIES_FIELDS :
          key==="footer_field_order" ? FOOTER_FIELDS :
          [...HEADER_FIELDS, ...(this._config.header_entity_badges || []).map(row => `entity:${row.id}`)];
        const order=normalizedOrder(this._config[key],allowed);
        const index=Number(btn.dataset.index), next=index+Number(btn.dataset.direction);
        if (index<0 || index>=order.length || next<0 || next>=order.length) return;
        [order[index],order[next]]=[order[next],order[index]];
        this._captureOpenSections();
        this._config={...this._config,[key]:order.join(",")};
        this.render();
        this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:this._config},bubbles:true,composed:true}));
      }));
    }
  }
  customElements.define("tracearr-streams-card",TracearrStreamsCard);
  customElements.define("tracearr-stream-card",TracearrStreamCard);
  customElements.define("tracearr-card-editor",TracearrCardEditor);
  window.customCards=window.customCards||[];
  for (const [type,name,description] of [
    ["tracearr-streams-card","Tracearr – Lectures en cours","Liste, grille ou carrousel des flux Plex, Jellyfin et Emby"],
    ["tracearr-stream-card","Tracearr – Lecture individuelle","Un seul flux Tracearr, à afficher séparément"],
  ]) if (!window.customCards.some(card=>card.type===type)) window.customCards.push({type,name,description,preview:false});
})();
