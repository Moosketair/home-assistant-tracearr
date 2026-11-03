/* Tracearr HA Lovelace cards 0.1.4 - no external frontend dependencies. */
(() => {
  "use strict";
  if (customElements.get("tracearr-streams-card")) return;

  const DEFAULTS = {
    mode: "grid", columns: "auto", carousel_visible: 1, carousel_autoplay: false,
    carousel_interval: 7, carousel_transition: "slide", carousel_transition_speed: 600,
    carousel_hide_scrollbar: true, carousel_show_arrows: true, carousel_mouse_drag: true,
    carousel_pause_on_hover: false, compact: false, show_title: true, show_counter: true,
    show_transcodes: false, show_transcode_icons: true, show_poster: true, show_avatar: true,
    show_progress: true, show_quality: true, show_device: true, show_server: true,
    show_bitrate: false, show_health: true, show_codecs: false, show_year: true, show_remaining: true,
    show_paused: true, hide_empty: false, sort: "recent", filter_transcode: "all",
    show_header: true, header_show_streams: true, header_show_bandwidth: false,
    header_show_direct: false, header_show_paused: false,
    header_show_video: false, header_show_audio: false, header_show_both: false,
    header_show_transcodes_total: false, header_show_server_counts: false,
    stream_surface: "soft",
    selection: "recent", grid_columns: 12, grid_rows: 0, height: 0,
    font_size: 14, accent_color_mode: "theme", accent_custom_color: "#00BCD4",
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
  const transcodeMode = (s) => {
    if (s.video_decision === "transcode" && s.audio_decision === "transcode") return "both";
    if (s.video_decision === "transcode") return "video";
    if (s.audio_decision === "transcode") return "audio";
    if (s.is_transcode) return "unknown";
    if (["copy", "directplay"].includes(s.video_decision) || ["copy", "directplay"].includes(s.audio_decision)) return "direct";
    return "unknown";
  };
  const SERVER_ACCENTS = Object.freeze({ plex: "#E5A00D", jellyfin: "#AA5CC3", emby: "#52B54B" });
  const TRANSITION_EFFECTS = ["slide", "fade", "zoom", "flip", "none"];
  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  };
  const codecState = (decision) => decision === "transcode" ? "transcode" :
    ["directplay", "copy"].includes(decision) ? "direct" : "unknown";
  const badgeIcon = (kind) => kind === "video" ?
    `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M9 5v14M15 5v14M3 9h6M3 15h6M15 9h6M15 15h6"/></svg>` :
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4" stroke-linecap="round"/></svg>`;
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
    .metric { display:inline-flex; align-items:center; padding:4px 9px; border-radius:20px;
      font-size:calc(var(--tr-font-size)*.80); font-weight:600; background:var(--pill-bg);
      color:var(--pill-text); white-space:nowrap; }
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
    .subtitle { font-size:calc(var(--tr-font-size)*.9); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
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
      border-radius:7px; transition:width 1s linear; }
    .times { display:flex; justify-content:space-between; align-items:center; gap:8px;
      font-size:calc(var(--tr-font-size)*.82); font-variant-numeric:tabular-nums; }
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
    @media (prefers-reduced-motion:reduce) { .fill { transition:none; } }
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
      this._entry = null;
    }
    static getStubConfig() { return {...DEFAULTS}; }
    static getConfigElement() { return document.createElement("tracearr-card-editor"); }
    setConfig(config) {
      if (!config || !["list", "grid", "carousel", undefined].includes(config.mode)) throw Error("Invalid Tracearr layout");
      this._config = normalizeConfig(config);
      this._renderFingerprint = null;
      this._carouselIndex = 0;
      this._stopCarouselAnimation();
      this._setTimers();
      this.render();
    }
    set hass(hass) {
      this._hass = hass;
      if (hass?.connection && this._connection !== hass.connection) this._subscribe(hass.connection);
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
      this._tick = setInterval(() => this._updateProgress(), 1000);
      if (this._config.mode === "carousel" && this._config.carousel_autoplay) {
        const duration = clamp(this._config.carousel_interval, 3, 120, 7);
        this._carouselTimer = setInterval(() => {
          if (!this.isConnected || (this._config.carousel_pause_on_hover && this.matches(":hover")) || document.hidden || window.matchMedia("(prefers-reduced-motion:reduce)").matches) return;
          this._scroll(1);
        }, duration * 1000);
      }
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
          .then(result => { this._images.set(path,{url:result.path,expires:Date.now()+540000}); if (!this._closed) { this._renderFingerprint = null; this.render(); } })
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
    _streamSummary(streams) {
      const sums = {total:streams.length, direct:0, video:0, audio:0, both:0,
        transcodes:0, unknown:0, paused:0, bandwidth:0, byServer:new Map()};
      for (const s of streams) {
        const kind = transcodeMode(s);
        sums[kind]++;
        if (kind === "video" || kind === "audio" || kind === "both" || s.is_transcode) sums.transcodes++;
        if (s.state === "paused") sums.paused++;
        sums.bandwidth += Math.max(0, Number(s.bitrate) || 0);
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
      const metrics = [];
      const add = (active,label,colorType=null) => {
        if (!active) return;
        const palette = this._palette(colorType, !colorType);
        metrics.push(`<span class="metric" style="--pill-bg:${palette.bg};--pill-text:${palette.text}">${E(label)}</span>`);
      };
      add(c.header_show_streams, `${summary.total} flux`);
      add(c.header_show_bandwidth, `Débit : ${(summary.bandwidth/1000).toFixed(1)} Mb/s`);
      add(c.header_show_direct, `Direct : ${summary.direct}`);
      add(c.header_show_paused, `Pause : ${summary.paused}`);
      add(c.header_show_video, `Vidéo : ${summary.video}`);
      add(c.header_show_audio, `Audio : ${summary.audio}`);
      add(c.header_show_both, `Vidéo + audio : ${summary.both}`);
      add(c.header_show_transcodes_total, `Transcodes : ${summary.transcodes}`);
      if (c.header_show_server_counts) {
        for (const server of summary.byServer.values()) add(true, `${server.name} : ${server.count}`,server.type);
      }
      const title = c.show_title ? `<h3>${E(c.title || "Lectures en cours")}</h3>` : "";
      if (!title && !metrics.length) return "";
      return `<header class="head">${title}${metrics.length ? `<div class="head-metrics">${metrics.join("")}</div>` : ""}</header>`;
    }
    _streamCard(entry,s) {
      const c = this._config;
      const poster = c.show_poster ? this._image(entry,s,"poster") : "";
      const avatar = c.show_avatar ? this._image(entry,s,"avatar") : "";
      const name = this._name(entry,s);
      const episode = s.media_type === "episode" ? `S${String(s.season_number ?? "?").padStart(2,"0")}E${String(s.episode_number ?? "?").padStart(2,"0")}` : "";
      const title = s.media_type === "episode" && s.show_title ? s.show_title : (s.media_title || "Média inconnu");
      const subtitle = [s.media_type === "episode" ? `${episode} ${s.media_title || ""}` : "", c.show_year && s.year ? String(s.year) : ""].filter(Boolean).join(" · ");
      const ratio = s.duration_ms > 0 ? 100 * Math.min(1, (s.progress_ms || 0) / s.duration_ms) : 0;
      const paused = s.state === "paused";
      this._positions.set(s.id, {progress:s.progress_ms || 0, duration:s.duration_ms || 0, at:Date.now(), state:s.state});
      const meta = [];
      if (c.show_health && entry?.servers?.find(server => server.server_id === s.server_id)?.status === "down") meta.push(`<span class="chip warn">Serveur hors ligne</span>`);
      if (c.show_server) meta.push(`<span>${E(s.server_name || s.server_type || "")}</span>`);
      if (c.show_device && (s.device || s.player)) meta.push(`<span>${E(s.device || s.player)}</span>`);
      if (c.show_quality && s.resolution) meta.push(`<span class="chip">${E(s.resolution)}</span>`);
      // The separate video/audio icons take the place of the old text badge.
      if (c.show_bitrate && s.bitrate != null) meta.push(`<span class="chip">${E((s.bitrate/1000).toFixed(1))} Mb/s</span>`);
      if (c.show_codecs && (s.stream_video_codec_display || s.stream_audio_codec_display)) meta.push(`<span>${E([s.stream_video_codec_display,s.stream_audio_codec_display].filter(Boolean).join(" / "))}</span>`);
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
          <div class="title" title="${E(title)}">${E(title)}</div>
          ${subtitle ? `<div class="subtitle">${E(subtitle)}</div>` : ""}
          ${c.show_progress ? `<div class="progress"><span class="fill" data-id="${E(s.id)}" style="width:${ratio.toFixed(2)}%"></span></div><div class="times"><span class="time-current" data-id="${E(s.id)}">${fmtTime(s.progress_ms)}</span>${paused ? `<span class="time-paused">En pause</span>` : c.show_remaining ? `<span class="time-remaining" data-id="${E(s.id)}">-${fmtTime(Math.max(0,(s.duration_ms||0)-(s.progress_ms||0)))}</span>` : ""}</div>` : ""}
          ${meta.length ? `<div class="meta">${meta.join("<span aria-hidden=\"true\">·</span>")}</div>` : ""}
        </div>
      </article>`;
    }
    _updateProgress() {
      if (!this.shadowRoot || !this.isConnected) return;
      this.shadowRoot.querySelectorAll(".fill[data-id]").forEach(el => {
        const item = this._positions.get(el.dataset.id);
        if (!item || !item.duration) return;
        const current = Math.min(item.duration, item.progress + (item.state === "playing" ? Math.max(0,Date.now()-item.at) : 0));
        el.style.width = `${(100*current/item.duration).toFixed(2)}%`;
        const currentNode = this.shadowRoot.querySelector(`.time-current[data-id="${CSS.escape(el.dataset.id)}"]`);
        const remainingNode = this.shadowRoot.querySelector(`.time-remaining[data-id="${CSS.escape(el.dataset.id)}"]`);
        if (currentNode) currentNode.textContent = fmtTime(current);
        if (remainingNode) remainingNode.textContent = `-${fmtTime(Math.max(0,item.duration-current))}`;
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
    _scroll(direction) {
      const el = this.shadowRoot.querySelector(".streams.carousel");
      if (!el) return;
      const cards = [...el.querySelectorAll(".stream")];
      const max = this._carouselMaxIndex(cards.length, el, cards);
      if (max < 1) return;
      const next = this._carouselIndex + (direction > 0 ? 1 : -1);
      this._carouselIndex = next > max ? 0 : next < 0 ? max : next;
      this._goToCarouselIndex(el, cards, this._carouselIndex);
    }

    render() {
      const entry = this._entryData();
      const c = this._config;
      if (!this.shadowRoot) return;
      const streams = this._streams(entry);
      // Progress arrives frequently over SSE. Updating DOM for every tick destroys
      // the native carousel's scroll position and interrupts transitions.
      const fingerprint = JSON.stringify({
        config: c,
        streams: streams.map(({progress_ms, ...rest}) => rest),
        stats: entry?.stats,
        servers: entry?.servers,
        aliases: entry?.aliases,
        avatars: entry?.avatars,
        connected: entry?.connected,
      });
      if (fingerprint === this._renderFingerprint && this.shadowRoot.querySelector("ha-card")) {
        const now = Date.now();
        for (const s of streams) this._positions.set(s.id, {
          progress: s.progress_ms || 0, duration: s.duration_ms || 0, at: now, state: s.state,
        });
        this._updateProgress();
        return;
      }
      this._renderFingerprint = fingerprint;
      const carousel = this.shadowRoot.querySelector(".streams.carousel");
      const oldScroll = carousel?.scrollLeft || 0;
      this._stopCarouselAnimation();
      if (c.hide_empty && !streams.length) { this.shadowRoot.innerHTML = `<style>${style}</style>`; this.style.display="none"; return; }
      this.style.display="";
      const head = this._header(streams);
      const cols = c.columns === "auto" ? "repeat(auto-fit,minmax(min(100%,var(--min-column,290px)),1fr))" : `repeat(${Math.max(1, Math.min(4,Number(c.columns)||1))}, minmax(0,1fr))`;
      const visible = clamp(c.carousel_visible, 1, 4, 1);
      const items = streams.map(s => this._streamCard(entry,s)).join("");
      // Always conceal the native scrollbar; navigation remains via buttons,
      // touch swipe, optional mouse drag and keyboard arrow keys.
      const classes = `streams ${E(c.mode)}`;
      const body = `<div class="${classes}" ${c.mode === "carousel" ? `tabindex="0" role="region" aria-label="Lectures en carrousel"` : ""} style="grid-template-columns:${E(cols)};--carousel-visible:${visible}">${items || `<div class="empty-message">${entry && !entry.connected ? "Tracearr indisponible" : "Aucune lecture en cours"}</div>`}</div>`;
      const nav = c.mode === "carousel" && c.carousel_show_arrows && streams.length > 1 ? `<div class="carousel-nav"><button class="nav" data-step="-1" aria-label="Précédent">❮</button><span>${streams.length} lectures</span><button class="nav" data-step="1" aria-label="Suivant">❯</button></div>` : "";
      // When HA Sections assigns grid_options.rows, the native grid height wins.
      // Otherwise the optional pixel height applies (e.g. masonry dashboards).
      const rowsAssigned = Number(c.grid_options?.rows) > 0;
      const fixedHeight = Number(c.height) > 0 && !rowsAssigned ? `height:${clamp(c.height,100,2000,240)}px;` : "";
      this.shadowRoot.innerHTML = `<style>${style}</style><ha-card style="${fixedHeight}--tr-font-size:${clamp(c.font_size,10,28,14)}px"><div class="root ${c.compact?"compact":""} ${c.stream_surface === "transparent" ? "flat-streams" : ""}" style="--min-column:${c.compact?"210px":"290px"}">${head}${body}${nav}</div></ha-card>`;
      const newCarousel = this.shadowRoot.querySelector(".streams.carousel");
      if (newCarousel) {
        const cards = [...newCarousel.querySelectorAll(".stream")];
        this._carouselIndex = Math.min(this._carouselIndex, this._carouselMaxIndex(cards.length, newCarousel, cards));
        if (cards.length) {
          newCarousel.scrollLeft = cards[this._carouselIndex].offsetLeft - cards[0].offsetLeft;
        } else newCarousel.scrollLeft = oldScroll;
        this._enableMouseDrag(newCarousel, cards);
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
      return `<label>${E(label)}<input type="number" min="${min}" max="${max}" data-field="${E(name)}" value="${E(this._config[name])}"></label>`;
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
        ]);
      const layout=(isIndividual ? this._select("selection","Choix de la lecture",[["recent","Lecture la plus récente"],["stream","Session précise"]])+
        `<label>ID de session<input type="text" data-field="stream_id" value="${E(c.stream_id||"")}"></label>` :
        this._select("mode","Disposition",[["list","Liste verticale"],["grid","Grille adaptative"],["carousel","Carrousel"]])+
        this._select("columns","Colonnes en mode grille",[["auto","Automatique"],["1","1"],["2","2"],["3","3"],["4","4"]]))+
        this._checks([["compact","Mode compact"],["hide_empty","Masquer si vide"],["show_paused","Inclure les lectures en pause"]])+
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
        ["show_year","Année ou épisode"],["show_transcode_icons","Icônes vidéo et audio"],
      ]);
      const footer=this._checks([
        ["show_server","Nom du serveur"],["show_device","Appareil / lecteur"],
        ["show_quality","Résolution"],["show_bitrate","Débit du flux"],
        ["show_codecs","Codecs"],["show_health","État du serveur"],
      ])+`<small>Les badges de résolution et de débit adoptent la palette globale avec une écriture blanche ou noire automatique.</small>`;
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
        this._group("footer","Bandeau d'informations du flux",footer),
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
