/* Tracearr HA Lovelace cards 0.1.0 - no external frontend dependencies. */
(() => {
  "use strict";
  if (customElements.get("tracearr-streams-card")) return;

  const DEFAULTS = {
    mode: "grid", columns: "auto", carousel_visible: 1, carousel_autoplay: false,
    carousel_interval: 7, compact: false, show_title: true, show_counter: true,
    show_transcodes: false, show_poster: true, show_avatar: true,
    show_progress: true, show_quality: true, show_device: true, show_server: true,
    show_bitrate: false, show_health: true, show_codecs: false, show_year: true, show_remaining: true,
    show_paused: true, hide_empty: false, sort: "recent", filter_transcode: "all",
    selection: "recent", grid_columns: 12, grid_rows: 0, height: 0,
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
  const labels = {
    direct: "Direct", video: "Transcode vidéo", audio: "Transcode audio", both: "Vidéo + audio", unknown: "Inconnu",
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
    :host { display:block; color:var(--primary-text-color); container-type:inline-size; min-width:0; }
    ha-card { --tr-accent:var(--accent-color,#00a5ad); background:var(--ha-card-background,var(--card-background-color,#20252a));
      border-radius:var(--ha-card-border-radius,16px); overflow:hidden; color:var(--primary-text-color,#eee); height:100%; }
    .root { padding:14px; min-width:0; overflow:auto; max-height:100%; box-sizing:border-box; }
    .head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:0 0 12px; }
    .head h3 { margin:0; font-size:17px; font-weight:700; }
    .count { padding:4px 9px; background:color-mix(in srgb,var(--tr-accent) 18%,transparent); border-radius:30px; color:var(--primary-text-color); font-weight:600; font-size:12px; }
    .stats { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
    .stats span { padding:5px 8px; font-size:11px; background:var(--secondary-background-color,rgba(255,255,255,.06)); border-radius:9px; }
    .streams { display:flex; flex-direction:column; gap:10px; }
    .streams.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,var(--min-column,290px)),1fr)); }
    .streams.carousel { overflow-x:auto; flex-direction:row; scroll-snap-type:x mandatory; scrollbar-width:thin; scroll-behavior:smooth; padding-bottom:4px; }
    .carousel .stream { flex:0 0 calc((100% - (var(--carousel-visible,1) - 1)*10px)/var(--carousel-visible,1)); scroll-snap-align:start; min-width:0; }
    .stream { position:relative; display:flex; gap:12px; min-width:0; min-height:116px; padding:12px; box-sizing:border-box;
      border-radius:12px; background:var(--secondary-background-color,rgba(255,255,255,.05)); border:1px solid var(--divider-color,rgba(255,255,255,.08)); }
    .stream::before { content:""; position:absolute; left:0; top:13px; bottom:13px; width:3px; border-radius:3px; background:var(--tr-accent); }
    .poster { width:73px; height:109px; flex:0 0 73px; border-radius:7px; object-fit:cover; background:rgba(100,100,100,.15); }
    .poster.empty { display:grid; place-items:center; font-size:25px; }
    .info { min-width:0; flex:1; display:flex; flex-direction:column; gap:5px; }
    .user { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--secondary-text-color,#aaa); }
    .avatar { width:23px; height:23px; border-radius:50%; object-fit:cover; background:rgba(100,100,100,.25); }
    .fallback-avatar { display:grid; place-items:center; font-size:11px; font-weight:bold; color:var(--primary-text-color); }
    .title { font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .subtitle { color:var(--secondary-text-color,#aaa); font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .progress { margin-top:auto; width:100%; height:5px; border-radius:7px; overflow:hidden; background:color-mix(in srgb,var(--tr-accent) 20%,transparent); }
    .fill { display:block; height:100%; background:var(--tr-accent); border-radius:7px; transition:width 1s linear; }
    .times { display:flex; justify-content:space-between; font-size:10px; color:var(--secondary-text-color,#aaa); font-variant-numeric:tabular-nums; }
    .meta { display:flex; align-items:center; flex-wrap:wrap; gap:5px; font-size:10px; color:var(--secondary-text-color,#aaa); }
    .chip { background:color-mix(in srgb,var(--tr-accent) 14%,transparent); border-radius:6px; padding:2px 6px; }
    .warn { background:color-mix(in srgb,#efb252 19%,transparent); }
    .paused { opacity:.72; }
    .empty-message { text-align:center; padding:18px 8px; color:var(--secondary-text-color); font-size:13px; }
    .carousel-nav { display:flex; justify-content:center; align-items:center; gap:12px; margin-top:6px; }
    button.nav { border:0; background:var(--secondary-background-color); color:var(--primary-text-color); border-radius:8px; padding:6px 11px; cursor:pointer; }
    .compact .stream { min-height:78px; padding:8px; gap:8px; }
    .compact .poster { width:48px; flex-basis:48px; height:72px; }
    .compact .user { font-size:11px; }
    .compact .info { gap:3px; }
    @container (max-width:520px) { .streams.grid { grid-template-columns:1fr!important; } .carousel .stream { flex-basis:100%!important; } }
    @media (prefers-reduced-motion:reduce) { .streams.carousel { scroll-behavior:auto; } .fill { transition:none; } }
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
      this._entry = null;
    }
    static getStubConfig() { return {...DEFAULTS}; }
    static getConfigElement() { return document.createElement("tracearr-card-editor"); }
    setConfig(config) {
      if (!config || !["list", "grid", "carousel", undefined].includes(config.mode)) throw Error("Invalid Tracearr layout");
      this._config = {...DEFAULTS, ...config};
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
      const cfg = this._config;
      const opts = {columns: Math.max(3, Math.min(12, Number(cfg.grid_columns) || 12)), min_columns: 3};
      if (Number(cfg.grid_rows) > 0) { opts.rows = Number(cfg.grid_rows); opts.min_rows = 2; }
      return opts;
    }
    _setTimers() {
      clearInterval(this._tick);
      clearInterval(this._carouselTimer);
      this._tick = this._carouselTimer = null;
      if (this._closed) return;
      this._tick = setInterval(() => this._updateProgress(), 1000);
      if (this._config.mode === "carousel" && this._config.carousel_autoplay) {
        const duration = Math.max(3, Number(this._config.carousel_interval) || 7);
        this._carouselTimer = setInterval(() => {
          if (!this.isConnected || this.matches(":hover") || document.hidden || window.matchMedia("(prefers-reduced-motion:reduce)").matches) return;
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
          .then(result => { this._images.set(path,{url:result.path,expires:Date.now()+540000}); if (!this._closed) this.render(); })
          .catch(() => { this._images.set(path,{url:"",expires:Date.now()+60000}); });
        this._images.set(path,{pending,expires:Date.now()+60000});
      }
      return "";
    }
    _streamCard(entry,s) {
      const c = this._config;
      const mode = transcodeMode(s);
      const image = c.show_poster ? this._image(entry,s,"poster") : "";
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
      if (mode !== "direct") meta.push(`<span class="chip ${mode === "unknown" ? "warn" : ""}">${E(labels[mode])}</span>`);
      if (c.show_bitrate && s.bitrate != null) meta.push(`<span class="chip">${E((s.bitrate/1000).toFixed(1))} Mb/s</span>`);
      if (c.show_codecs) meta.push(`<span>${E([s.stream_video_codec_display,s.stream_audio_codec_display].filter(Boolean).join(" / "))}</span>`);
      return `<article class="stream ${paused?"paused":""}" data-session="${E(s.id)}">
        ${c.show_poster ? (image ? `<img class="poster" src="${E(image)}" alt="Affiche" loading="lazy">` : `<div class="poster empty">▣</div>`) : ""}
        <div class="info">
          ${c.show_avatar ? `<div class="user">${avatar ? `<img class="avatar" src="${E(avatar)}" alt="">` : `<span class="avatar fallback-avatar">${E(name.slice(0,1).toUpperCase())}</span>`}<span>${E(name)}</span>${paused ? `<span class="chip warn">Pause</span>` : ""}</div>` : `<div class="user">${E(name)}${paused ? ` · Pause` : ""}</div>`}
          <div class="title" title="${E(title)}">${E(title)}</div>
          ${subtitle ? `<div class="subtitle">${E(subtitle)}</div>` : ""}
          ${c.show_progress ? `<div class="progress"><span class="fill" data-id="${E(s.id)}" style="width:${ratio.toFixed(2)}%"></span></div><div class="times"><span class="time-current" data-id="${E(s.id)}">${fmtTime(s.progress_ms)}</span>${c.show_remaining ? `<span class="time-remaining" data-id="${E(s.id)}">-${fmtTime(Math.max(0,(s.duration_ms||0)-(s.progress_ms||0)))}</span>` : ""}</div>` : ""}
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
    _scroll(direction) {
      const el = this.shadowRoot.querySelector(".streams.carousel");
      if (!el) return;
      const item = el.querySelector(".stream");
      if (!item) return;
      const step = item.getBoundingClientRect().width + 10;
      if (direction > 0 && el.scrollLeft + el.clientWidth >= el.scrollWidth - 5) el.scrollTo({left:0,behavior:"smooth"});
      else el.scrollBy({left:direction * step,behavior:"smooth"});
    }
    render() {
      const entry = this._entryData();
      const c = this._config;
      if (!this.shadowRoot) return;
      const streams = this._streams(entry);
      const oldScroll = this.shadowRoot.querySelector(".streams.carousel")?.scrollLeft || 0;
      if (c.hide_empty && !streams.length) { this.shadowRoot.innerHTML = `<style>${style}</style>`; this.style.display="none"; return; }
      this.style.display="";
      const stat = entry?.stats || {};
      const head = c.show_title || c.show_counter ? `<div class="head">${c.show_title ? `<h3>${E(c.title || "Lectures en cours")}</h3>` : "<span></span>"}${c.show_counter ? `<span class="count">${streams.length} flux</span>` : ""}</div>` : "";
      const statChips = !this._individual && c.show_transcodes ? `<div class="stats"><span>Flux : ${Number(stat.total||0)}</span><span>Vidéo : ${Number(stat.video||0)}</span><span>Audio : ${Number(stat.audio||0)}</span><span>Les deux : ${Number(stat.both||0)}</span><span>Total transcodes : ${Number(stat.transcodes||0)}</span><span>Autres : ${Number(stat.unknown||0)}</span></div>` : "";
      const cols = c.columns === "auto" ? "repeat(auto-fit,minmax(min(100%,var(--min-column,290px)),1fr))" : `repeat(${Math.max(1, Math.min(4,Number(c.columns)||1))}, minmax(0,1fr))`;
      const visible = Math.max(1,Math.min(4,Number(c.carousel_visible)||1));
      const items = streams.map(s => this._streamCard(entry,s)).join("");
      const body = `<div class="streams ${E(c.mode)}" style="grid-template-columns:${E(cols)};--carousel-visible:${visible}">${items || `<div class="empty-message">${entry && !entry.connected ? "Tracearr indisponible" : "Aucune lecture en cours"}</div>`}</div>`;
      const nav = c.mode === "carousel" && streams.length > visible ? `<div class="carousel-nav"><button class="nav" data-step="-1" aria-label="Précédent">❮</button><span>${streams.length} lectures</span><button class="nav" data-step="1" aria-label="Suivant">❯</button></div>` : "";
      this.shadowRoot.innerHTML = `<style>${style}</style><ha-card style="${Number(c.height)>0?`height:${Math.max(100, Math.min(2000,Number(c.height)))}px;`:""}"><div class="root ${c.compact?"compact":""}" style="--min-column:${c.compact?"210px":"290px"}">${head}${statChips}${body}${nav}</div></ha-card>`;
      const carousel = this.shadowRoot.querySelector(".streams.carousel");
      if (carousel) carousel.scrollLeft = oldScroll;
      this.shadowRoot.querySelectorAll("button[data-step]").forEach(btn => btn.addEventListener("click", () => this._scroll(Number(btn.dataset.step))));
      this._updateProgress();
    }
  }
  class TracearrStreamsCard extends BaseTracearrCard { get _individual() { return false; } }
  class TracearrStreamCard extends BaseTracearrCard { get _individual() { return true; } }

  const editorStyle = `
    :host { display:block; font:inherit; } .editor { padding:10px 0; display:grid; gap:13px; }
    label { display:grid; gap:4px; font-size:13px; color:var(--primary-text-color); }
    select,input[type=text],input[type=number],textarea { padding:9px; font:inherit; width:100%; min-width:0; box-sizing:border-box;
      color:var(--primary-text-color); background:var(--card-background-color); border:1px solid var(--divider-color,#777); border-radius:7px; }
    .check { display:flex; align-items:center; gap:8px; } .check input { accent-color:var(--accent-color); }
    h4 { margin:7px 0 2px; font-size:13px; } .columns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; }
    textarea { min-height:64px; resize:vertical; } small { font-size:11px; color:var(--secondary-text-color); }
  `;
  const fields = [
    ["show_title","Afficher le titre"], ["show_counter","Afficher le nombre de flux"],
    ["show_transcodes","Compteurs de transcodage"], ["show_poster","Afficher les affiches"],
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
      <label class="check"><input type="checkbox" data-field="carousel_autoplay" ${c.carousel_autoplay?"checked":""}>Défilement automatique</label>` : `<h4>Lecture individuelle</h4>${this._select("selection","Choix du flux",[["recent","Flux le plus récent"],["stream","ID de session précis"]])}
      <label>ID de session (facultatif)<input type="text" data-field="stream_id" value="${E(c.stream_id||"")}"></label>`}
      <h4>Dimensions</h4><div class="columns">
      <label>Largeur Sections (3–12 colonnes)<input type="number" min="3" max="12" data-field="grid_columns" value="${E(c.grid_columns)}"></label>
      <label>Hauteur Sections (0 = auto)<input type="number" min="0" max="30" data-field="grid_rows" value="${E(c.grid_rows)}"></label>
      </div><label>Hauteur CSS en pixels (0 = auto)<input type="number" min="0" max="2000" data-field="height" value="${E(c.height)}"></label>
      <h4>Filtrage</h4>${this._select("filter_server","Serveur",[["","Tous les serveurs"],...servers])}
      ${this._select("filter_user","Utilisateur",[["","Tous les utilisateurs"],...users.map(u=>[u,u])])}
      ${this._select("filter_transcode","Transcodage",[["all","Tous"],["direct","Direct"],["video","Vidéo seule"],["audio","Audio seul"],["both","Vidéo et audio"],["unknown","Inconnu"]])}
      ${this._select("sort","Trier par",[["recent","Date de début"],["user","Utilisateur"],["server","Serveur"]])}
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
