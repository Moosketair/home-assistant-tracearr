/* Tracearr HA Lovelace cards 0.1.3 - no external frontend dependencies. */
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
    selection: "recent", grid_columns: 12, grid_rows: 0, height: 0,
    font_size: 14, progress_color_mode: "theme", progress_custom_color: "#00BCD4",
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
      color:#fff; container-type:inline-size; --tr-font-size:14px; }
    ha-card { --tr-accent:var(--accent-color,#00bcd4); background:transparent!important;
      background-color:transparent!important; box-shadow:none!important; border:0!important;
      border-radius:var(--ha-card-border-radius,16px); overflow:hidden; color:#fff;
      height:100%; min-height:0; box-sizing:border-box; }
    .root { padding:12px; min-width:0; height:100%; box-sizing:border-box; overflow-y:auto; overflow-x:hidden;
      color:#fff; scrollbar-width:thin; }
    .head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:0 0 12px; }
    .head h3 { margin:0; font-size:calc(var(--tr-font-size)*1.24); font-weight:700; color:#fff; }
    .count { padding:4px 9px; background:rgba(255,255,255,.08); border-radius:30px;
      color:#fff; font-weight:600; font-size:calc(var(--tr-font-size)*.85); }
    .stats { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
    .stats span { padding:5px 8px; font-size:calc(var(--tr-font-size)*.78);
      background:rgba(255,255,255,.07); color:#fff; border-radius:9px; }
    .streams { display:flex; flex-direction:column; gap:10px; }
    .streams.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--min-column,290px)),1fr)); }
    .streams.carousel { overflow-x:auto; flex-direction:row; scroll-snap-type:x mandatory;
      scrollbar-width:none; -ms-overflow-style:none; scroll-behavior:auto; padding-bottom:0;
      overscroll-behavior-x:contain; cursor:grab; touch-action:pan-x pan-y; }
    .streams.carousel::-webkit-scrollbar { display:none; width:0; height:0; }
    .streams.carousel.is-dragging { cursor:grabbing; scroll-snap-type:none!important; user-select:none; }
    .streams.carousel.is-dragging * { user-select:none; pointer-events:none; }
    .carousel .stream { flex:0 0 calc((100% - (var(--carousel-visible,1) - 1)*10px)/var(--carousel-visible,1)); scroll-snap-align:start; min-width:0; }
    .stream { position:relative; display:flex; gap:12px; min-width:0; min-height:116px; padding:12px;
      box-sizing:border-box; border-radius:12px; background:transparent;
      border:1px solid var(--divider-color,rgba(255,255,255,.12)); color:#fff; }
    .stream::before { content:""; position:absolute; left:0; top:0; bottom:0; width:3px;
      border-radius:3px; background:var(--stream-accent,var(--tr-accent)); }
    .poster-wrap { position:relative; width:73px; height:109px; flex:0 0 73px; border-radius:7px;
      overflow:hidden; background:rgba(100,100,100,.15); }
    .poster { width:100%; height:100%; display:block; object-fit:cover; }
    .poster.empty { display:grid; place-items:center; font-size:calc(var(--tr-font-size)*1.8); }
    .poster-paused { position:absolute; inset:0; display:flex; justify-content:center; align-items:center;
      background:rgba(0,0,0,.48); }
    .pause-symbol { display:flex; gap:5px; align-items:center; justify-content:center; }
    .pause-symbol::before,.pause-symbol::after { content:""; display:block; background:#fff; border:1px solid rgba(0,0,0,.3);
      border-radius:2px; width:6px; height:24px; box-shadow:0 0 5px rgba(0,0,0,.45); }
    .info { min-width:0; flex:1; display:flex; flex-direction:column; gap:5px; color:#fff; }
    .user { display:flex; align-items:center; gap:6px; padding-right:54px;
      font-size:calc(var(--tr-font-size)*.92); color:#fff; }
    .avatar { width:23px; height:23px; border-radius:50%; object-fit:cover; background:rgba(100,100,100,.25); }
    .fallback-avatar { display:grid; place-items:center; font-size:calc(var(--tr-font-size)*.78); font-weight:bold; color:#fff; }
    .title { font-weight:700; font-size:calc(var(--tr-font-size)*1.12); color:#fff;
      white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .subtitle { color:#fff; font-size:calc(var(--tr-font-size)*.9); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .media-flags { display:flex; position:absolute; right:12px; top:12px; align-items:center; gap:8px; z-index:1; }
    .stream-indicator { width:19px; height:19px; display:inline-flex; align-items:center;
      justify-content:center; color:#a3a3a3; }
    .stream-indicator svg { width:100%; height:100%; fill:none; stroke:currentColor;
      stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
    .stream-indicator.direct { color:#12bb70; }
    .stream-indicator.transcode { color:#ff9900; }
    .progress { margin-top:auto; width:100%; height:6px; border-radius:7px; overflow:hidden;
      background:color-mix(in srgb,var(--progress-accent) 24%,transparent); }
    .fill { display:block; height:100%; background:var(--progress-accent);
      border-radius:7px; transition:width 1s linear; }
    .times { display:flex; justify-content:space-between; align-items:center; gap:8px;
      font-size:calc(var(--tr-font-size)*.82); color:#fff; font-variant-numeric:tabular-nums; }
    .time-paused { color:#ff9900; font-weight:700; }
    .meta { display:flex; align-items:center; flex-wrap:wrap; gap:5px;
      font-size:calc(var(--tr-font-size)*.8); color:#fff; }
    .chip { background:rgba(255,255,255,.08); color:#fff; border-radius:6px; padding:2px 6px; }
    .warn { background:rgba(239,178,82,.16); color:#fff; }
    .empty-message { text-align:center; padding:18px 8px; color:#fff;
      font-size:var(--tr-font-size); }
    .carousel-nav { display:flex; justify-content:center; align-items:center; gap:12px;
      margin-top:8px; font-size:calc(var(--tr-font-size)*.85); color:#fff; }
    button.nav { border:1px solid rgba(255,255,255,.18); background:transparent; color:#fff;
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
      this._config = {...DEFAULTS, ...config};
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
      if (c.show_codecs) meta.push(`<span>${E([s.stream_video_codec_display,s.stream_audio_codec_display].filter(Boolean).join(" / "))}</span>`);
      const accent = SERVER_ACCENTS[String(s.server_type || "").toLowerCase()] || "var(--tr-accent)";
      const colorMode = c.progress_color_mode;
      const progressColor = colorMode === "server" ? "var(--stream-accent)" :
        colorMode === "custom" ? validColor(c.progress_custom_color) : "var(--accent-color,#00BCD4)";
      const indicators = c.show_transcode_icons ? `<div class="media-flags" aria-label="État du flux audio et vidéo">${["video","audio"].map(kind => {
        const decision = kind === "video" ? s.video_decision : s.audio_decision;
        const state = codecState(decision);
        const tip = `${kind === "video" ? "Vidéo" : "Audio"} : ${state === "transcode" ? "Transcodage" : state === "direct" ? "Lecture directe" : "Inconnu"}`;
        return `<span class="stream-indicator ${state}" role="img" aria-label="${E(tip)}" title="${E(tip)}">${badgeIcon(kind)}</span>`;
      }).join("")}</div>` : "";
      const posterMarkup = c.show_poster ? `<div class="poster-wrap">${poster ? `<img class="poster" src="${E(poster)}" alt="Affiche" loading="lazy">` : `<div class="poster empty">▣</div>`}${paused ? `<span class="poster-paused" aria-label="Lecture en pause"><span class="pause-symbol" aria-hidden="true"></span></span>` : ""}</div>` : "";
      return `<article class="stream" data-session="${E(s.id)}" style="--stream-accent:${accent};--progress-accent:${progressColor}">
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
      const stat = entry?.stats || {};
      const head = c.show_title || c.show_counter ? `<div class="head">${c.show_title ? `<h3>${E(c.title || "Lectures en cours")}</h3>` : "<span></span>"}${c.show_counter ? `<span class="count">${streams.length} flux</span>` : ""}</div>` : "";
      const statChips = !this._individual && c.show_transcodes ? `<div class="stats"><span>Flux : ${Number(stat.total||0)}</span><span>Vidéo : ${Number(stat.video||0)}</span><span>Audio : ${Number(stat.audio||0)}</span><span>Les deux : ${Number(stat.both||0)}</span><span>Total transcodes : ${Number(stat.transcodes||0)}</span><span>Autres : ${Number(stat.unknown||0)}</span></div>` : "";
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
      this.shadowRoot.innerHTML = `<style>${style}</style><ha-card style="${fixedHeight}--tr-font-size:${clamp(c.font_size,10,28,14)}px"><div class="root ${c.compact?"compact":""}" style="--min-column:${c.compact?"210px":"290px"}">${head}${statChips}${body}${nav}</div></ha-card>`;
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
    :host { display:block; font:inherit; } .editor { padding:10px 0; display:grid; gap:13px; }
    label { display:grid; gap:4px; font-size:13px; color:var(--primary-text-color); }
    select,input[type=text],input[type=number],textarea,input[type=color] { padding:9px; font:inherit; width:100%; min-width:0; box-sizing:border-box;
      color:var(--primary-text-color); background:var(--card-background-color); border:1px solid var(--divider-color,#777); border-radius:7px; }
    .check { display:flex; align-items:center; gap:8px; } .check input { accent-color:var(--accent-color); }
    h4 { margin:7px 0 2px; font-size:13px; } .columns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
    textarea { min-height:64px; resize:vertical; } small { font-size:11px; color:var(--secondary-text-color); }
  `;
  const fields = [
    ["show_title","Afficher le titre"], ["show_counter","Afficher le nombre de flux"],
    ["show_transcodes","Compteurs globaux de transcodage"], ["show_transcode_icons","Icônes vidéo / audio (vert = direct, orange = transcode)"],
    ["show_poster","Afficher les affiches"],
    ["show_avatar","Afficher les avatars"], ["show_progress","Afficher la progression"],
    ["show_remaining","Afficher le temps restant"], ["show_quality","Afficher la résolution"],
    ["show_device","Afficher le lecteur"], ["show_server","Afficher le serveur"],
    ["show_bitrate","Afficher le débit"], ["show_health","État du serveur"], ["show_codecs","Afficher les codecs"],
    ["show_year","Afficher l'année"], ["show_paused","Inclure les lectures en pause"],
    ["hide_empty","Masquer si aucune lecture"], ["compact","Affichage compact"],
  ];
  class TracearrCardEditor extends HTMLElement {
    constructor() { super(); this.attachShadow({mode:"open"}); this._config={...DEFAULTS}; this._payload={entries:[]}; }
    setConfig(config) { this._config={...DEFAULTS,...config}; this.render(); }
    set hass(hass) {
      this._hass=hass;
      if (hass?.connection && this._connection !== hass.connection) {
        this._connection=hass.connection;
        hass.connection.sendMessagePromise({type:"tracearr_ha/get"}).then(r=>{this._payload=r;this.render();}).catch(()=>{});
      }
    }
    _option(value,text) { return `<option value="${E(value)}">${E(text)}</option>`; }
    _select(name,label,options) {
      return `<label>${E(label)}<select data-field="${E(name)}">${options.map(([v,l])=>this._option(v,l)).join("")}</select></label>`;
    }
    render() {
      const c=this._config;
      const entries=this._payload.entries||[];
      const selected=entries.find(e=>e.id===c.entry_id)||entries[0];
      const servers=[...new Map((selected?.servers||[]).map(s=>[s.server_id,[s.server_id,s.server_name]])).values()];
      const users=[...new Set((selected?.streams||[]).map(s=>s.username).filter(Boolean))].sort();
      const isIndividual=c.type==="custom:tracearr-stream-card";
      this.shadowRoot.innerHTML=`<style>${editorStyle}</style><div class="editor">
      <h4>Source</h4>${this._select("entry_id","Instance Tracearr",[["","Automatique (première instance)"],...entries.map(e=>[e.id,e.name])])}
      ${!isIndividual ? `<h4>Disposition</h4>${this._select("mode","Type d'affichage",[["list","Liste verticale"],["grid","Grille adaptative"],["carousel","Carrousel"]])}
      ${this._select("columns","Colonnes de la grille",[["auto","Automatique"],["1","1"],["2","2"],["3","3"],["4","4"]])}
      <div class="columns"><label>Flux visibles dans le carrousel<input type="number" min="1" max="4" data-field="carousel_visible" value="${E(c.carousel_visible)}"></label>
      <label>Intervalle carrousel (s)<input type="number" min="3" max="120" data-field="carousel_interval" value="${E(c.carousel_interval)}"></label></div>
      <div class="columns">
        ${this._select("carousel_transition","Effet de transition",[["slide","Glissement"],["fade","Fondu"],["zoom","Zoom"],["flip","Retournement 3D"],["none","Sans animation"]])}
        <label>Durée de transition (ms)<input type="number" min="100" max="3000" step="100" data-field="carousel_transition_speed" value="${E(c.carousel_transition_speed)}"></label>
      </div>
      <label class="check"><input type="checkbox" data-field="carousel_autoplay" ${c.carousel_autoplay?"checked":""}>Défilement automatique</label>
      <small>La barre de défilement native est toujours masquée.</small>
      <label class="check"><input type="checkbox" data-field="carousel_show_arrows" ${c.carousel_show_arrows?"checked":""}>Afficher les boutons précédent / suivant</label>
      <label class="check"><input type="checkbox" data-field="carousel_mouse_drag" ${c.carousel_mouse_drag?"checked":""}>Navigation à la souris (cliquer-glisser)</label>
      <label class="check"><input type="checkbox" data-field="carousel_pause_on_hover" ${c.carousel_pause_on_hover?"checked":""}>Mettre en pause le défilement au survol de la souris</label>` : `<h4>Lecture individuelle</h4>${this._select("selection","Choix du flux",[["recent","Flux le plus récent"],["stream","ID de session précis"]])}
      <label>ID de session (facultatif)<input type="text" data-field="stream_id" value="${E(c.stream_id||"")}"></label>`}
      <h4>Dimensions</h4><div class="columns">
      <label>Largeur Sections (3–12 colonnes)<input type="number" min="3" max="12" data-field="grid_columns" value="${E(c.grid_columns)}"></label>
      <label>Hauteur initiale Sections (lignes ; 0 = 4)<input type="number" min="0" max="30" data-field="grid_rows" value="${E(c.grid_rows)}"></label>
      </div><small>La hauteur peut ensuite être redimensionnée directement avec la poignée native du tableau de bord Sections. Minimum : 2 lignes.</small>
      <label>Hauteur CSS en pixels (0 = auto, pour les dashboards hors Sections)<input type="number" min="0" max="2000" data-field="height" value="${E(c.height)}"></label>
      <h4>Filtrage</h4>${this._select("filter_server","Serveur",[["","Tous les serveurs"],...servers])}
      ${this._select("filter_user","Utilisateur",[["","Tous les utilisateurs"],...users.map(u=>[u,u])])}
      ${this._select("filter_transcode","Transcodage",[["all","Tous"],["direct","Direct"],["video","Vidéo seule"],["audio","Audio seul"],["both","Vidéo et audio"],["unknown","Inconnu"]])}
      ${this._select("sort","Trier par",[["recent","Date de début"],["user","Utilisateur"],["server","Serveur"]])}
      <h4>Apparence</h4>
      <label>Taille de la police (10–28 px)<input type="number" min="10" max="28" step="1" data-field="font_size" value="${E(c.font_size)}"></label>
      ${this._select("progress_color_mode","Couleur de la barre de lecture",[["theme","Thème Home Assistant"],["server","Selon le serveur (Plex / Jellyfin / Emby)"],["custom","Couleur personnalisée"]])}
      <label>Couleur personnalisée<input type="color" data-field="progress_custom_color" value="${E(validColor(c.progress_custom_color))}"></label>
      <small>Fond transparent et informations en blanc. L'état « En pause » et les icônes de transcodage gardent leurs couleurs.</small>
      <h4>Informations visibles</h4><label>Titre personnalisé<input type="text" data-field="title" value="${E(c.title||"")}"></label>
      <div class="columns">${fields.map(([name,label])=>`<label class="check"><input type="checkbox" data-field="${name}" ${c[name]?"checked":""}>${E(label)}</label>`).join("")}</div>
      <h4>Personnalisation des utilisateurs</h4><label>Alias (un par ligne : plex:alice=Alice)<textarea data-field="aliases">${E(c.aliases||"")}</textarea></label>
      <label>Avatars (un par ligne : plex:alice=https://... )<textarea data-field="avatars">${E(c.avatars||"")}</textarea></label>
      <small>Les alias définis ici sont prioritaires sur les alias globaux. Les ressources d'image externes doivent être accessibles depuis le navigateur.</small>
      </div>`;
      this.shadowRoot.querySelectorAll("[data-field]").forEach(el => {
        const name=el.dataset.field;
        if (el.tagName==="SELECT") el.value=String(c[name]??"");
        const fn=()=>{
          const value=el.type==="checkbox" ? el.checked : el.type==="number" ? Number(el.value) : el.value;
          this._config={...this._config,[name]:value};
          this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:this._config},bubbles:true,composed:true}));
        };
        el.addEventListener(el.tagName==="TEXTAREA"||el.type==="text" ? "change" : "change",fn);
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
