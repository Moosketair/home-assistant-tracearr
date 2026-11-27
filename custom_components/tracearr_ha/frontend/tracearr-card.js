/* Tracearr HA Lovelace cards 0.1.18 - no external frontend dependencies. */
(() => {
  "use strict";
  if (customElements.get("tracearr-streams-card")) return;

  const DEFAULTS = {
    mode: "list", carousel_visible: 1, carousel_autoplay: false,
    carousel_interval: 7, carousel_transition: "slide", carousel_transition_speed: 600,
    carousel_hide_scrollbar: true, carousel_show_arrows: true, carousel_mouse_drag: true,
    carousel_pause_on_hover: false, compact: false, show_title: true, show_counter: true,
    show_transcodes: false, show_transcode_icons: true, show_poster: true, poster_size: 100, show_avatar: true,
    show_progress: true, show_end_time: false, show_quality: true, show_device: true, show_server: true,
    show_bitrate: false, show_health: true, show_codecs: false, show_year: true, show_remaining: true,
    show_paused: true, hide_empty: false, empty_mode: "message", empty_message: "Aucune lecture en cours",
    sort: "recent", filter_transcode: "all",
    show_header: true, header_show_streams: true, header_show_bandwidth: false,
    header_show_direct: false, header_show_paused: false,
    header_show_video: false, header_show_audio: false, header_show_both: false,
    header_show_transcodes_total: false, header_show_server_counts: false,
    header_entity_badges: [], header_metric_settings: {},
    header_badge_order: "streams,bandwidth,direct,paused,video,audio,both,transcodes_total,server_counts",
    header_positive_only: false, header_blink_positive: false,
    header_blink_seconds: 2, header_show_names: true,
    header_zero_color_mode: "normal", header_zero_custom_color: "#576574",
    stream_surface: "soft", stream_blur: 26, stream_overlay: 72,
    stream_accent_style: "rounded", stream_accent_width: 4,
    selection: "recent",
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
  const HEADER_ICONS = Object.freeze({
    streams:"mdi:play-circle-outline",bandwidth:"mdi:speedometer",direct:"mdi:check-circle-outline",
    paused:"mdi:pause-circle-outline",video:"mdi:filmstrip",audio:"mdi:music-note",
    both:"mdi:movie-music",transcodes_total:"mdi:swap-horizontal",server_counts:"mdi:server",
  });
  const badgeAlign = value => ["left","center","right"].includes(value) ? value : "auto";
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
  const optionalColor = value => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : undefined;
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

  // Public /streams and full SSE events share this vocabulary. Do not read
  // library metadata or infer premium variants from their base codecs.
  const TECH_STYLES = ["classic","premium","cinema","minimal","technical"];
  const TECH_GROUPS = {
    resolution:"video", hdr:"video", video_codec:"video",
    audio_format:"audio", audio_codec:"audio", channels:"audio",
    container:"general", bitrate:"general",
  };
  const TECH_FIELDS = Object.keys(TECH_GROUPS);
  const TECH_LABELS = {
    resolution:["Résolution","Resolution"], hdr:["Plage dynamique (HDR / SDR)","Dynamic range (HDR / SDR)"],
    video_codec:["Codec vidéo","Video codec"], audio_format:["Format audio","Audio format"],
    audio_codec:["Codec audio","Audio codec"], channels:["Canaux audio","Audio channels"],
    container:["Conteneur","Container"], bitrate:["Débit du flux","Stream bitrate"],
  };
  const TECH_STYLE_LABELS = [
    ["Classique","Classic"],["Premium","Premium"],["Cinéma","Cinema"],
    ["Minimaliste","Minimalist"],["Technique","Technical"],
  ];
  const techEnglish = hass => !!hass?.language && !/^fr(?:[-_]|$)/i.test(hass.language);
  const TECH_FOOTER_FIELDS = ["quality","codecs","bitrate"];
  const TECH_COLORS = {
    gold:"#dcab40", blue:"#5991e8", gray:"#8894a3", purple:"#a779e8",
    orange:"#e88d43", cyan:"#43b7dc", green:"#46be93", teal:"#3bb8ad",
  };
  const TECH_FORMATS = new Map();
  const TECH_ALIASES = new Map();
  function techFormat(category, id, short, name, color="gray", aliases=[], description) {
    const format = {id, short, name, category, color:TECH_COLORS[color], description};
    TECH_FORMATS.set(id,format);
    for (const alias of [id, short, ...aliases]) TECH_ALIASES.set(`${category}:${alias.toLowerCase()}`,format);
  }
  techFormat("resolution","8k","8K","8K Ultra HD","gold",["4320p"]);
  techFormat("resolution","4k","4K","4K Ultra HD","gold",["2160p","uhd"]);
  techFormat("resolution","1440p","1440p","Quad HD","blue",["qhd"]);
  techFormat("resolution","1080p","1080p","Full HD","blue",["fhd","2k"]);
  techFormat("resolution","720p","720p","HD","gray",["hd"]);
  techFormat("resolution","480p","480p","480p");
  techFormat("resolution","sd","SD",["Définition standard","Standard definition"]);
  techFormat("hdr","dv","DV","Dolby Vision","purple",["dolby vision","dovi"],"Dolby Vision");
  techFormat("hdr","hdr10plus","HDR10+","HDR10+","orange",[],["HDR dynamique","Dynamic HDR"]);
  techFormat("hdr","hdr10","HDR10","HDR10","orange",[],["HDR statique","Static HDR"]);
  techFormat("hdr","hdr","HDR",["HDR (type non précisé)","HDR (type unspecified)"],"orange",[],["Type non précisé","Type unspecified"]);
  techFormat("hdr","hlg","HLG","Hybrid Log-Gamma","orange");
  techFormat("hdr","sdr","SDR","Standard Dynamic Range","gray",[],["Plage standard","Standard range"]);
  techFormat("video_codec","h264","H.264","H.264 / AVC","gray",["avc","avc1","x264","h.264 (avc)"],"AVC");
  techFormat("video_codec","hevc","HEVC","H.265 / HEVC","teal",["h265","h.265","x265","hev1","hvc1","h.265 (hevc)"],"H.265");
  techFormat("video_codec","av1","AV1","AOMedia Video 1","teal",["av01"],"AOMedia");
  techFormat("video_codec","vp9","VP9","VP9","teal");
  techFormat("video_codec","vp8","VP8","VP8");
  techFormat("video_codec","mpeg2","MPEG-2","MPEG-2 Video","gray",["mpeg2video"]);
  techFormat("video_codec","mpeg4","MPEG-4","MPEG-4 Part 2");
  techFormat("video_codec","mpeg1","MPEG-1","MPEG-1 Video");
  techFormat("video_codec","vc1","VC-1","VC-1");
  techFormat("audio_format","atmos","ATMOS","Dolby Atmos","purple",["dolby atmos"],"Dolby");
  techFormat("audio_format","dtsx","DTS:X","DTS:X","cyan",["dts-x","dts:x ma","dts:x profile 2"],["Audio immersif","Immersive audio"]);
  const lossless = ["Sans perte","Lossless"];
  const channelDescription = ["Canaux","Channels"];
  techFormat("audio_codec","truehd","TRUEHD","Dolby TrueHD","green",["dolby truehd"],lossless);
  techFormat("audio_codec","eac3","E-AC-3","Dolby Digital Plus","gray",["eac-3","e-ac-3","dd+","dolby digital plus"],"Dolby Digital+");
  techFormat("audio_codec","ac3","AC-3","Dolby Digital","gray",["ac-3","dolby digital"],"Dolby Digital");
  techFormat("audio_codec","dts","DTS","DTS Digital Surround","cyan",["dca"]);
  techFormat("audio_codec","dtshd","DTS-HD","DTS-HD","cyan",["dts-hd"]);
  techFormat("audio_codec","dtshd_ma","DTS-HD MA","DTS-HD Master Audio","cyan",["dca-ma","dts-hd master audio","dts-hd-ma","dtshd-ma"],lossless);
  techFormat("audio_codec","dtshd_hra","DTS-HD HRA","DTS-HD High Resolution Audio","cyan",["dts-hd high resolution audio"]);
  techFormat("audio_codec","flac","FLAC","Free Lossless Audio Codec","green",[],lossless);
  techFormat("audio_codec","alac","ALAC","Apple Lossless Audio Codec","green",[],lossless);
  techFormat("audio_codec","pcm","PCM","Pulse-Code Modulation","green",["lpcm","pcm_s16le","pcm_s24le","pcm_s32le"]);
  techFormat("audio_codec","aac","AAC","Advanced Audio Coding");
  techFormat("audio_codec","opus","OPUS","Opus");
  techFormat("audio_codec","mp3","MP3","MPEG Audio Layer III");
  techFormat("audio_codec","vorbis","VORBIS","Vorbis");
  techFormat("channels","mono","MONO","Mono","gray",["1.0"]);
  techFormat("channels","stereo","2.0",["Stéréo","Stereo"],"gray",["stéréo"],["Stéréo","Stereo"]);
  techFormat("channels","5.1","5.1",["Surround 5.1","5.1 surround"],"gray",[],channelDescription);
  techFormat("channels","7.1","7.1",["Surround 7.1","7.1 surround"],"gray",[],channelDescription);
  techFormat("container","mkv","MKV","Matroska","gray",["matroska"],"Matroska");
  techFormat("container","mp4","MP4","MPEG-4 Part 14","gray",[],"MPEG-4");
  techFormat("container","mpegts","MPEG-TS","MPEG Transport Stream","gray",["ts"]);
  techFormat("container","webm","WEBM","WebM");
  techFormat("container","avi","AVI","Audio Video Interleave");
  techFormat("container","mov","MOV","QuickTime File Format");
  techFormat("container","m2ts","M2TS","MPEG-2 Transport Stream");
  techFormat("container","flv","FLV","Flash Video");

  const techText = value => typeof value === "string" && !/^(?:\*|—|-|n\/a|unknown|null)$/i.test(value.trim()) ? value.trim() : "";
  const techLookup = (category,value) => TECH_ALIASES.get(`${category}:${techText(value).toLowerCase()}`);
  function techValue(category, raw, extra="") {
    const text = techText(raw);
    if (!text) return null;
    const format = techLookup(category,text);
    return {...(format || {short:text, name:text}), extra};
  }
  const techCount = n => Number.isSafeInteger(n) && n > 0 ? n : 0;
  function techResolution(label, width, height) {
    const w = techCount(width), h = techCount(height);
    // Match Tracearr's dimension tiers, including cropped widescreen.
    const tier = w >= 6400 || h >= 4000 ? "8K" : w >= 3800 || h >= 2000 ? "4K" :
      w >= 2500 || h >= 1400 ? "1440p" : w >= 1800 || h >= 1000 ? "1080p" :
      w >= 1200 || h >= 700 ? "720p" : w >= 700 || h >= 400 ? "480p" : w || h ? "SD" : "";
    return techValue("resolution",techText(label) || tier,w && h ? `${w} × ${h}` : "");
  }
  function techChannels(display, count, layout) {
    const n = techCount(count);
    // A real layout takes precedence. Otherwise use the same channel-count
    // convention as Tracearr (5.1/7.1 are conventional labels, not measured layouts).
    const explicit = techText(layout);
    const named = techLookup("channels",explicit) || /^\d+\.\d+(?:\.\d+)?$/.test(explicit);
    const label = named ? explicit : techText(display) ||
      ({1:"Mono",2:"Stereo",6:"5.1",8:"7.1"}[n] || (n ? `${n} ch` : explicit));
    return techValue("channels",label,explicit && explicit.toLowerCase() !== label.toLowerCase() ? explicit : "");
  }
  function normalizeTechnical(result) {
    if (!TECH_STYLES.includes(result.technical_badge_style)) result.technical_badge_style = "classic";
    if (result.technical_badge_layout !== "separate") result.technical_badge_layout = "compact";
    if (!["destination","source_to_destination"].includes(result.technical_transcode_mode)) delete result.technical_transcode_mode;
    if (typeof result.technical_badge_colors !== "boolean") delete result.technical_badge_colors;
    const visibility = Object.fromEntries(TECH_FIELDS.filter(key => key !== "bitrate" &&
      typeof result.technical_badge_visibility?.[key] === "boolean").map(key => [key,result.technical_badge_visibility[key]]));
    const colors = Object.fromEntries([...TECH_FORMATS.keys()].flatMap(key => {
      const value = optionalColor(result.technical_badge_custom_colors?.[key]);
      return value ? [[key,value.toLowerCase()]] : [];
    }));
    delete result.technical_badge_visibility;
    if (Object.keys(visibility).length) result.technical_badge_visibility = visibility;
    delete result.technical_badge_custom_colors;
    if (Object.keys(colors).length) result.technical_badge_custom_colors = colors;
    if (typeof result.technical_badge_order === "string" &&
        result.technical_badge_order.split(",").some(key => TECH_FIELDS.includes(key.trim())))
      result.technical_badge_order = normalizedOrder(result.technical_badge_order,TECH_FIELDS).join(",");
    else delete result.technical_badge_order;
  }
  const legacyTechnical = c => c.technical_badge_style === "classic" && c.technical_badge_layout !== "separate" &&
    !c.technical_transcode_mode && !c.technical_badge_visibility && !c.technical_badge_order;
  function techVisible(c,key) {
    return c.technical_badge_visibility?.[key] ?? (key === "resolution" ? c.show_quality :
      key === "video_codec" || key === "audio_codec" ? c.show_codecs :
      key === "bitrate" ? c.show_bitrate : c.technical_badge_style !== "classic");
  }
  const sameTech = (a,b) => (a.id || a.short.toLowerCase()) === (b.id || b.short.toLowerCase());
  function technicalValues(s,c,bitrate) {
    const sourceAudio = s.source_audio_details;
    const streamAudio = s.stream_audio_details;
    const streamVideo = s.stream_video_details;
    const info = s.transcode_info;
    const sourceAudioCodec = techText(s.source_audio_codec) || s.source_audio_codec_display;
    const streamAudioCodec = techText(s.stream_audio_codec) || s.stream_audio_codec_display;
    const videoCodec = techValue("video_codec",techText(s.stream_video_codec) || s.stream_video_codec_display);
    const codecOnly = raw => techLookup("audio_format",raw) ? null : raw;
    const audioCodec = techValue("audio_codec",codecOnly(streamAudioCodec));
    const profile = techText(sourceAudio?.profile);
    const explicitAudioFormat = [profile,sourceAudioCodec].find(raw => techLookup("audio_format",raw));
    const source = {
      resolution:techResolution(s.resolution,s.source_video_width,s.source_video_height),
      hdr:techValue("hdr",s.source_video_details?.dynamicRange),
      video_codec:techValue("video_codec",techText(s.source_video_codec) || s.source_video_codec_display,s.source_video_details?.profile),
      audio_format:techValue("audio_format",sourceAudio?.atmos === true ? "Atmos" : explicitAudioFormat),
      audio_codec:techValue("audio_codec",codecOnly(sourceAudioCodec),profile && !explicitAudioFormat ? profile : ""),
      channels:techChannels(s.audio_channels_display,s.source_audio_channels,sourceAudio?.channelLayout),
      container:techValue("container",info?.sourceContainer),
    };
    // Plex and Jellyfin/Emby can publish source codec as stream codec when
    // output is missing. An equal codec during a transcode is ambiguous.
    const confirmedCodec = (before,after) => after && (!before || !sameTech(before,after)) ? after : null;
    const streamAudioFormat = techLookup("audio_format",streamAudioCodec);
    const output = {
      resolution:techResolution(null,streamVideo?.width,streamVideo?.height),
      video_codec:confirmedCodec(source.video_codec,videoCodec),
      audio_codec:confirmedCodec(source.audio_codec,audioCodec),
      audio_format:confirmedCodec(source.audio_format,streamAudioFormat),
      channels:techChannels(null,streamAudio?.channels),
      container:techValue("container",info?.streamContainer),
      // Output HDR is copied or assumed by the supported adapters; there is
      // no independent output HDR or Atmos/DTS:X flag in this contract.
    };
    const anyTranscode = s.is_transcode || s.video_decision === "transcode" || s.audio_decision === "transcode";
    const compare = c.technical_transcode_mode === "source_to_destination";
    const changed = key => {
      const group = TECH_GROUPS[key];
      return group === "general" ? anyTranscode || info?.containerDecision === "transcode" || !!output.container :
        codecState(s[`${group}_decision`]) !== "direct" && anyTranscode;
    };
    const showAudioFormat = techVisible(c,"audio_format");
    const showAudioCodec = techVisible(c,"audio_codec");
    const audioChanged = changed("audio_format");
    const preferredAudio = (format,codec) => {
      if (!format || !codec || !showAudioCodec || sameTech(format,codec)) return format || codec;
      return {...format,secondary:codec.short,extra:[codec.short,codec.extra].filter(Boolean).join(" · ")};
    };
    const sourceFormat = source.audio_format || (!audioChanged ? streamAudioFormat : null);
    const sourceCodec = source.audio_codec || (!audioChanged ? audioCodec : null);
    // Select independently on each side, after applying the same confidence
    // rules as the other categories. The format slot owns the combined badge.
    const audioBefore = preferredAudio(sourceFormat,sourceCodec);
    const audioAfter = preferredAudio(output.audio_format,output.audio_codec);
    const legacyFormat = source.audio_format || (!anyTranscode ? streamAudioFormat : null);
    const legacyCodec = audioCodec || source.audio_codec;
    const order = c.technical_badge_order ? c.technical_badge_order.split(",") : TECH_FIELDS;
    return order.flatMap(key => {
      if (!techVisible(c,key)) return [];
      if (key === "bitrate") return bitrate === null ? [] :
        [{key, value:{short:`${(bitrate/1000).toFixed(1)} Mb/s`,name:["Débit du flux","Stream bitrate"]}}];
      const before = source[key];
      if (!c.technical_transcode_mode) {
        // Preserve source resolution and the old stream codec preference.
        if (key === "audio_codec" && showAudioFormat && !legacyFormat) return [];
        const value = key === "audio_format" ? legacyFormat || legacyCodec :
          key === "audio_codec" ? legacyCodec : (key === "video_codec" ? videoCodec : null) || before;
        return value ? [{key,value}] : [];
      }
      if (key === "audio_codec" && showAudioFormat) return [];
      const from = key === "audio_format" ? audioBefore : before;
      if (!changed(key)) {
        const value = from || (key === "video_codec" ? videoCodec : key === "audio_codec" ? audioCodec : output[key]);
        return value ? [{key,value}] : [];
      }
      const after = key === "audio_format" ? audioAfter : output[key];
      if (!after) return compare && from ? [{key,value:from,sourceOnly:true}] : [];
      return [{key,value:after,before:compare && from && !sameTech(from,after) ? from : null}];
    });
  }
  const technicalStyle = `
    .technical { --tech-surface:#f3f5f8; --tech-ink:#141c28; }
    @media (prefers-color-scheme:dark) { :host(:not([data-tech-light])) .technical {
      --tech-surface:#252e3b; --tech-ink:#f6f8fc; } }
    :host([data-tech-dark]) .technical,.surface-blur .technical {
      --tech-surface:#252e3b; --tech-ink:#f6f8fc; }
    .technical,.tech-row { display:flex; flex-wrap:wrap; align-items:center; gap:.35em; min-width:0; max-width:100%; }
    .technical { flex:0 1 100%; }
    .technical[data-layout="separate"] .tech-row { flex:0 1 100%; }
    :is(.tech-badge,.tech-swatch) { --tech-color:#8894a3; box-sizing:border-box; display:inline-flex; flex-wrap:wrap;
      align-items:center; gap:.14em .37em; min-width:0; max-width:100%; overflow-wrap:anywhere;
      padding:.24em .55em; border:1px solid transparent; border-radius:.48em; line-height:1.2;
      font-weight:700; background:var(--tech-surface); color:var(--tech-ink); }
    .tech-badge.tech-comparison { padding:0; border:0; }
    .tech-part { display:inline-grid; min-width:0; max-width:100%; }
    .tech-detail { font-size:.84em; font-weight:500; }
    .tech-premium :is(.tech-badge:not(.tech-comparison),.tech-swatch) { background:color-mix(in srgb,var(--tech-color) 14%,var(--tech-surface));
      border-color:var(--tech-color); color:color-mix(in srgb,var(--tech-color) 23%,var(--tech-ink)); }
    .tech-cinema :is(.tech-badge:not(.tech-comparison),.tech-swatch) { background:var(--tech-color); color:var(--tech-contrast,#000);
      border-radius:.28em; padding-inline:.58em; }
    .tech-minimal :is(.tech-badge:not(.tech-comparison),.tech-swatch) { border-inline-start:.22em solid var(--tech-color); border-radius:.2em; }
    .tech-technical,.tech-technical .tech-row,.tech-technical .tech-comparison { align-items:stretch; }
    .tech-technical .tech-comparison > [aria-hidden] { align-self:center; }
    .tech-technical :is(.tech-badge:not(.tech-comparison),.tech-swatch) { border-color:color-mix(in srgb,var(--tech-color) 55%,var(--tech-surface));
      border-radius:.32em; }
    .tech-technical .tech-part strong { color:color-mix(in srgb,var(--tech-color) 23%,var(--tech-ink)); }
    .tech-classic :is(.tech-badge,.tech-swatch) { border-radius:7px; font-weight:600; }
  `;
  function renderTechnical(s,c,bitrate,en=false) {
    if (legacyTechnical(c)) {
      return {
        quality:c.show_quality && s.resolution ? `<span class="chip">${E(s.resolution)}</span>` : "",
        bitrate:bitrate !== null ? `<span class="chip">${E((bitrate/1000).toFixed(1))} Mb/s</span>` : "",
        codecs:c.show_codecs && (s.stream_video_codec_display || s.stream_audio_codec_display) ?
          `<span>${E([s.stream_video_codec_display,s.stream_audio_codec_display].filter(Boolean).join(" / "))}</span>` : "",
      };
    }
    const values = technicalValues(s,c,bitrate);
    if (!values.length) return {};
    const pick = text => Array.isArray(text) ? text[Number(en)] : text;
    const mode = c.technical_badge_style;
    const paint = item => {
      const {key,value,before,sourceOnly} = item;
      const paintColor = format => {
        const color = mode !== "classic" && c.technical_badge_colors !== false && format.id ?
          c.technical_badge_custom_colors?.[format.id] || format.color : TECH_COLORS.gray;
        return `style="--tech-color:${color};--tech-contrast:${contrastColor(color)}"`;
      };
      const detail = format => techText(format.extra);
      const full = format => `${pick(format.name)}${detail(format) ? ` (${detail(format)})` : ""}`;
      const label = `${pick(TECH_LABELS[key])} : ${before ? `${full(before)} → ` : ""}${full(value)}${sourceOnly ?
        (en ? " (source; output unknown)" : " (source ; destination inconnue)") : ""}`;
      const part = format => {
        // Prefer a short, known codec label over long adapter profile text.
        // The full profile remains in the accessible label and tooltip.
        const codec = format.category === "audio_codec" || format.category === "video_codec";
        const measured = !codec || !c.technical_transcode_mode;
        const subtitle = mode === "technical" && (format.secondary || (measured && detail(format)) ||
          pick(format.description));
        return `<span class="tech-part"><strong>${E(format.short)}</strong>${
          subtitle ? `<span class="tech-detail">${E(subtitle)}</span>` : ""}</span>`;
      };
      const swatch = format => `<span class="tech-swatch" ${paintColor(format)}>${part(format)}</span>`;
      return `<span class="tech-badge${before ? " tech-comparison" : ""}" data-tech="${key}" role="img" aria-label="${E(label)}" title="${E(label)}"${
        before ? "" : ` ${paintColor(value)}`}>` +
        `${before ? `${swatch(before)}<span aria-hidden="true">→</span>${swatch(value)}` : part(value)}</span>`;
    };
    const rows = c.technical_badge_layout === "separate" ? [...new Set(values.map(item => TECH_GROUPS[item.key]))].map(group =>
      `<div class="tech-row" data-tech-group="${group}">${values.filter(item => TECH_GROUPS[item.key] === group).map(paint).join("")}</div>`).join("") :
      values.map(paint).join("");
    return {technical:`<div class="technical tech-${mode}" data-layout="${c.technical_badge_layout}">${rows}</div>`};
  }
  function metaMarkup(metaByKey, order) {
    const footer = normalizedOrder(order,FOOTER_FIELDS);
    let inserted = false;
    const parts = footer.flatMap(key => {
      if (metaByKey.technical && TECH_FOOTER_FIELDS.includes(key)) {
        if (inserted) return [];
        inserted = true;
        return [{key:"technical",html:metaByKey.technical}];
      }
      return metaByKey[key] ? [{key,html:metaByKey[key]}] : [];
    });
    return parts.length ? `<div class="meta">${parts.map(({key,html},i) =>
      (i && key !== "technical" && parts[i-1].key !== "technical" ? '<span aria-hidden="true">·</span>' : "") + html).join("")}</div>` : "";
  }
  function syncTechTheme(el, hass) {
    el.toggleAttribute?.("data-tech-dark",hass?.themes?.darkMode === true);
    el.toggleAttribute?.("data-tech-light",hass?.themes?.darkMode === false);
  }
  function themeAccent(el) {
    // Use the theme's true RGB value for legible foreground contrast.
    try {
      if (typeof getComputedStyle !== "function") return "#00BCD4";
      const raw = getComputedStyle(el).getPropertyValue("--accent-color").trim() ||
        getComputedStyle(document.documentElement).getPropertyValue("--accent-color").trim();
      if (readRgb(raw)) return raw;
      const helper = document.createElement("span");
      helper.style.color = raw || "#00BCD4";
      (el.shadowRoot || el).appendChild(helper);
      const resolved = getComputedStyle(helper).color;
      helper.remove();
      if (readRgb(resolved)) return resolved;
    } catch (_) { /* detached element or browser without computed styles */ }
    return "#00BCD4";
  }
  function streamPalette(el, mode, customColor, serverType) {
    const raw = mode === "server" ? SERVER_ACCENTS[String(serverType||"").toLowerCase()] :
      mode === "custom" ? validColor(customColor) : null;
    return {bg:raw || "var(--accent-color,#00BCD4)",text:contrastColor(raw || themeAccent(el))};
  }
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
    /* Keep the native card border inside the one-row minimum. Wrapped content
       may grow naturally; a fixed Lovelace height retains the root scroller. */
    :host([data-sections]) ha-card:has(> .header-only > .head) {
      display:flex; flex-direction:column; min-height:var(--ha-section-grid-row-height,56px); }
    :host([data-sections]) .root.header-only:has(> .head) {
      display:flex; flex:1 1 auto; flex-direction:column; justify-content:safe center;
      height:auto; padding-block:6px; }
    :host([data-sections]) .header-only > .head { flex:none; margin-block-end:0; }
    :host([data-sections]) .header-only .head:not(.no-title) .head-metrics { flex-basis:auto; width:auto; }
    .availability-status:not(:empty) { margin:0 0 10px; padding:6px 9px; border-radius:7px;
      background:#fff1db; color:#843900; border-inline-start:3px solid #cc6800;
      font-size:calc(var(--tr-font-size)*.88); font-weight:700; overflow-wrap:anywhere; }
    .head { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px;
      margin:0 0 12px; color:var(--primary-text-color,#fff); }
    .head h3 { flex:0 1 auto; margin:0; font-size:calc(var(--tr-font-size)*1.24); font-weight:700;
      color:var(--primary-text-color,#fff); overflow-wrap:anywhere; }
    /* Pack the populated groups at their natural widths before centering.
       A group wider than the row wraps its own badges within the row. */
    .head-metrics { display:flex; flex:1 1 320px; width:0; flex-wrap:wrap;
      align-items:center; gap:5px 10px; min-width:0; }
    .head-group { display:flex; flex:0 0 auto; width:max-content; max-width:100%;
      flex-wrap:wrap; align-items:center; gap:5px; }
    .head-group.align-left { justify-content:flex-start; }
    .head-group.align-center { justify-content:center; margin-inline:auto; }
    .head-group.align-right { justify-content:flex-end; margin-inline-start:auto; }
    .head-metrics.center-last > .align-center { order:1; }
    .head.no-title .head-metrics { width:100%; }
    .metric { display:inline-flex; align-items:center; gap:4px; padding:4px 9px; border-radius:20px;
      font-size:calc(var(--tr-font-size)*.80); font-weight:600; background:var(--pill-bg);
      color:var(--pill-text); box-sizing:border-box; min-width:0; max-width:100%; }
    .root[data-stale] .metric:not([data-badge^="entity:"]) {
      color:var(--primary-text-color,#fff); background:color-mix(in srgb,currentColor 14%,transparent); }
    .metric-text { min-width:0; overflow-wrap:anywhere; }
    .metric ha-icon { --mdc-icon-size:16px; flex:none; width:16px; height:16px; display:inline-flex; }
    .metric.blink-positive { animation:tracearr-badge-pulse var(--badge-blink,2s) ease-in-out infinite; }
    @keyframes tracearr-badge-pulse { 0%,100% { opacity:1; } 50% { opacity:.22; } }
    .streams { display:flex; flex-direction:column; gap:10px; }
    .streams.carousel { overflow-x:auto; flex-direction:row; scroll-snap-type:x mandatory;
      scrollbar-width:none; -ms-overflow-style:none; scroll-behavior:auto; padding-bottom:0;
      overscroll-behavior-x:contain; cursor:grab; touch-action:pan-x pan-y; }
    .streams.carousel::-webkit-scrollbar { display:none; width:0; height:0; }
    .streams.carousel.is-dragging { cursor:grabbing; scroll-snap-type:none!important; user-select:none; }
    .streams.carousel.is-dragging * { user-select:none; pointer-events:none; }
    .carousel .stream { flex:0 0 calc((100% - (var(--carousel-visible,1) - 1)*10px)/var(--carousel-visible,1)); scroll-snap-align:start; min-width:0; }
    .stream { position:relative; isolation:isolate; overflow:hidden;
      display:flex; align-items:center; gap:12px; min-width:0; min-height:116px;
      padding:12px; box-sizing:border-box; border-radius:12px; background:color-mix(in srgb,
      var(--primary-text-color,#fff) 4%,transparent); border:1px solid var(--divider-color,rgba(255,255,255,.12));
      color:var(--primary-text-color,#fff); }
    /* The inner edge follows the stream's rounded border instead of sitting
       outside the card. The old straight edge remains optional. */
    .stream::before { content:""; position:absolute; left:0; top:0; bottom:0;
      box-sizing:border-box; width:calc(var(--tr-edge-width,4px) + 10px);
      border-left:var(--tr-edge-width,4px) solid var(--stream-accent,var(--accent-color,#00BCD4));
      border-radius:11px 0 0 11px; z-index:3; pointer-events:none; }
    .stream.accent-straight::before { width:var(--tr-edge-width,4px); border-left:0;
      border-radius:0; background:var(--stream-accent,var(--accent-color,#00BCD4)); }
    .stream.accent-none::before { display:none; }
    .root.flat-streams .stream { background:transparent; }
    /* Blurred poster used purely as decoration; readable information stays
       above the dark overlay. Missing posters keep the ordinary dark surface. */
    .stream.surface-blur { background:#191a1d; }
    .stream-backdrop { position:absolute; inset:0; z-index:0;
      overflow:hidden; border-radius:inherit; pointer-events:none; }
    .stream-backdrop .backdrop-image { position:absolute; inset:0;
      width:100%; height:100%; display:block; object-fit:cover; object-position:center;
      filter:blur(var(--tr-stream-blur,26px)) saturate(1.18);
      transform:scale(1.25); }
    .stream-backdrop::after { content:""; position:absolute; inset:0;
      background:rgba(7,8,12,var(--tr-stream-overlay,.72)); }
    .stream > .poster-wrap, .stream > .info { position:relative; z-index:1; }
    .stream > .media-flags { z-index:2; }
    .poster-wrap { position:relative; width:var(--tr-poster-width,73px); height:var(--tr-poster-height,109px); flex:0 0 var(--tr-poster-width,73px); align-self:center;
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
    .root[data-stale] .progress { background:color-mix(in srgb,currentColor 14%,transparent); }
    .root[data-stale] .fill { background:#808080; transition:none; }
    .times { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:5px 8px;
      font-size:calc(var(--tr-font-size)*.82); font-variant-numeric:tabular-nums; }
    /* Read elapsed / remaining as one unit; status or predicted end stays at the right. */
    .time-left { display:inline-flex; align-items:baseline; gap:4px; white-space:nowrap; }
    .time-separator { opacity:.8; }
    .time-end,.time-paused,.time-status { margin-left:auto; white-space:nowrap; text-align:right; }
    .time-end { opacity:.9; }
    .time-status { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:5px 8px; }
    .time-status > * { margin-left:0; }
    @container (max-width:360px) { .time-left { white-space:normal; } }
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
    .compact .poster-wrap { width:var(--tr-compact-poster-width,48px); flex-basis:var(--tr-compact-poster-width,48px); height:var(--tr-compact-poster-height,72px); }
    .compact .user { font-size:calc(var(--tr-font-size)*.83); }
    .compact .info { gap:3px; }
    .compact .media-flags { top:8px; right:8px; }
    @container (max-width:520px) { .carousel .stream { flex-basis:100%!important; } }
    @media (prefers-reduced-motion:reduce) { .fill { transition:none; } .metric.blink-positive { animation:none; } }
  `;

  function normalizeConfig(config) {
    const result = {...DEFAULTS, ...config};
    // The old grid layout is replaced by the full-width list. Native Sections
    // owns sizing; retired internal sizing controls are never persisted again.
    if (!['list', 'carousel'].includes(result.mode)) result.mode = 'list';
    for (const key of ['columns','grid_columns','grid_rows','height']) delete result[key];
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
    normalizeTechnical(result);
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
    result.poster_size = Math.round(clamp(result.poster_size, 50, 200, 100));
    if (!["soft","transparent","blur"].includes(result.stream_surface)) result.stream_surface = "soft";
    if (!["rounded","straight","none"].includes(result.stream_accent_style)) result.stream_accent_style = "rounded";
    result.stream_blur = Math.round(clamp(result.stream_blur,0,50,26));
    result.stream_overlay = Math.round(clamp(result.stream_overlay,25,95,72));
    result.stream_accent_width = Math.round(clamp(result.stream_accent_width,2,8,4));
    result.header_blink_seconds = clamp(result.header_blink_seconds, .5, 20, 2);
    // Per-statistic appearance inherits legacy global settings until changed.
    const rawMetrics = result.header_metric_settings && typeof result.header_metric_settings === "object" &&
      !Array.isArray(result.header_metric_settings) ? result.header_metric_settings : {};
    result.header_metric_settings = {};
    for (const key of HEADER_FIELDS) {
      const row = rawMetrics[key];
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      result.header_metric_settings[key] = {
        align:badgeAlign(row.align),
        show_name:typeof row.show_name === "boolean" ? row.show_name : undefined,
        show_icon:!!row.show_icon,
        only_positive:!!row.only_positive,
        blink_positive:!!row.blink_positive,
        blink_seconds:row.blink_seconds == null ? undefined : clamp(row.blink_seconds,.5,20,2),
        normal_custom_color:optionalColor(row.normal_custom_color),
        zero_color_mode:row.zero_color_mode === "custom" ? "custom" : "inherit",
        zero_custom_color:validColor(row.zero_custom_color || "#576574"),
        label:String(row.label || "").slice(0,100),
        icon:/^(mdi|hass):[a-z0-9-]+$/.test(String(row.icon || "")) ? row.icon : "",
      };
    }
    result.header_entity_badges = Array.isArray(result.header_entity_badges) ? result.header_entity_badges.slice(0, 20)
      .filter(row => row && typeof row === "object" && typeof row.entity === "string")
      .map((row,i) => ({...row, id: String(row.id || `legacy-${i}`), entity:row.entity, label:String(row.label || ""),
        show_name: typeof row.show_name === "boolean" ? row.show_name : undefined,
        show_icon: !!row.show_icon,
        align:badgeAlign(row.align),
        only_positive: !!row.only_positive, blink_positive: !!row.blink_positive,
        blink_seconds: row.blink_seconds ? clamp(row.blink_seconds,.5,20,2) : undefined,
        normal_custom_color: optionalColor(row.normal_custom_color),
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
      // Capture image events inside the shadow root; <img> errors do not bubble.
      this.shadowRoot.addEventListener?.("error", event => this._onArtworkError(event), true);
      this.shadowRoot.addEventListener?.("load", event => this._onArtworkLoad(event), true);
      this._config = normalizeConfig({});
      this._hass = null;
      this._techEnglish = false;
      this._payload = {entries: []};
      this._subscription = null;
      this._images = new Map();
      this._artworkSources = new Map();
      this._imageRetryTimers = new Map();
      this._imageAttempts = new Map();
      this._positions = new Map();
      this._tick = null;
      this._carouselTimer = null;
      this._carouselDelay = null;
      this._carouselFrame = null;
      this._carouselEffects = new Set();
      this._carouselAnimating = false;
      this._carouselIndex = 0;
      this._renderFingerprint = null;
      this._liveFingerprints = new Map();
      this._headerMarkup = "";
      this._headerResize = null;
      this._headerFrame = null;
      this._entryId = null;
      this._staleStreams = null;
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
      if (this.isConnected) this.render();
    }
    set hass(hass) {
      this._hass = hass;
      syncTechTheme(this,hass);
      const en = techEnglish(hass);
      if (en !== this._techEnglish) {
        this._techEnglish = en;
        if (this.isConnected && !legacyTechnical(this._config)) this.render();
      }
      if (!this.isConnected) return;
      if (this._subscription?.connection !== (hass?.connection || undefined)) this._subscribe(hass?.connection);
      // Entity badges read the current HA state, independent of Tracearr SSE.
      // Updating only the header prevents unrelated sensor changes from resetting
      // the carousel animation, scroll position or playback clocks.
      if (this._config.header_entity_badges?.length && this._renderFingerprint !== null &&
          this.shadowRoot?.querySelector("ha-card")) this._refreshHeader(this._streams(this._displayEntry(this._entryData())));
    }
    connectedCallback() {
      this.render();
      if (this._hass?.connection) this._subscribe(this._hass.connection);
    }
    disconnectedCallback() {
      this._unsubscribe();
      this._stopHeaderLayout();
      clearInterval(this._tick);
      clearInterval(this._carouselTimer);
      this._stopCarouselAnimation();
      this._tick = null;
      this._carouselTimer = null;
      this._carouselDelay = null;
      this._resetStreamState();
      this._entryId = null;
      this._payload = {entries: []};
      this._renderFingerprint = null;
      this._headerMarkup = "";
      this._carouselIndex = 0;
      this.shadowRoot.innerHTML = "";
    }
    _resetStreamState() {
      this._staleStreams = null;
      this._positions.clear();
      this._liveFingerprints.clear();
      this._images.clear();
      this._artworkSources.clear();
      this._imageAttempts.clear();
      for (const timer of this._imageRetryTimers.values()) clearTimeout(timer);
      this._imageRetryTimers.clear();
    }
    _disposeSubscription(unsubscribe) {
      try { Promise.resolve(unsubscribe()).catch(() => {}); }
      catch (_) { /* The connection may already be closed. */ }
    }
    _unsubscribe() {
      const previous = this._subscription;
      this._subscription = null;
      if (previous?.unsubscribe) this._disposeSubscription(previous.unsubscribe);
    }
    _subscribe(connection) {
      const hadSource = this._subscription !== null;
      this._unsubscribe();
      if (hadSource) {
        this._payload = {entries: []};
        this.render();
      }
      if (!connection) return;
      // The same HA connection can be reused after a detach/attach. Identify
      // the subscription itself so callbacks from the old mount stay inert.
      const subscription = this._subscription = {connection};
      connection.subscribeMessage((data) => {
        if (this._subscription !== subscription || !this.isConnected) return;
        this._payload = data || {entries: []};
        this.render();
      }, {type: "tracearr_ha/subscribe"}).then((unsubscribe) => {
        if (this._subscription !== subscription) this._disposeSubscription(unsubscribe);
        else subscription.unsubscribe = unsubscribe;
      }).catch(() => {
        if (this._subscription !== subscription) return;
        this._payload = {entries: []};
        this.render();
      });
    }
    getCardSize() { return this._config.mode === "list" ? 5 : 4; }
    set layout(value) { this.toggleAttribute("data-sections",value === "grid"); }
    getGridOptions() {
      // Sections merges its saved grid_options over these static defaults.
      // Intrinsic sizing reacts to stream updates without re-querying this API.
      return {columns:12, min_columns:3, max_columns:12,
        rows:"auto", min_rows:1, max_rows:30};
    }
    _setTimers(streams, stale=false) {
      const running = !stale && this.isConnected && (this._config.show_progress || this._config.show_end_time) &&
        streams.some(s => s.state === "playing" && Number(s.duration_ms) > 0);
      if (running && this._tick === null) this._tick = setInterval(() => this._updateProgress(), 250);
      else if (!running && this._tick !== null) {
        clearInterval(this._tick);
        this._tick = null;
      }
      this._armCarouselAutoplay(false, streams.length);
    }
    _armCarouselAutoplay(restart=false, count) {
      const c = this._config;
      const enabled = this.isConnected && c.mode === "carousel" && c.carousel_autoplay &&
        (count ?? this.shadowRoot.querySelector(".streams.carousel")?.querySelectorAll(".stream").length ?? 0) > 1;
      const delay = enabled ? clamp(c.carousel_interval, 3, 120, 7) * 1000 : null;
      if (!restart && delay === this._carouselDelay) return;
      clearInterval(this._carouselTimer);
      this._carouselTimer = null;
      this._carouselDelay = delay;
      if (delay === null) return;
      this._carouselTimer = setInterval(() => {
        if (!this.isConnected || (this._config.carousel_pause_on_hover && this.matches(":hover")) || document.hidden || window.matchMedia("(prefers-reduced-motion:reduce)").matches) return;
        this._scroll(1, true);
      }, delay);
    }
    _entryData() {
      const all = this._payload?.entries || [];
      return all.find(e => e.id === this._config.entry_id) || all[0] || null;
    }
    _streamsStale(entry) {
      return entry?.streams_stale ?? (entry?.connected === false && entry?.sse_connected === false);
    }
    _displayEntry(entry) {
      return this._staleStreams === null ? entry : {...entry, streams:this._staleStreams};
    }
    _availabilityText(entry, stale) {
      return stale ? `Tracearr indisponible — données non actualisées${entry?.name ? ` · ${entry.name}` : ""}` : "";
    }
    _refreshAvailability(entry, stale) {
      const root = this.shadowRoot.querySelector(".root");
      const status = root?.querySelector(".availability-status");
      if (!status) return;
      root.toggleAttribute("data-stale",stale);
      const text = this._availabilityText(entry,stale);
      if (status.textContent !== text) status.textContent = text;
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
      // An explicit individual-card target takes priority over stale generic
      // filters saved by an older dashboard configuration.
      const targeted = this._individual && ["stream", "account", "server"].includes(this._config.selection);
      if (!targeted && this._config.filter_server) streams = streams.filter(s => s.server_id === this._config.filter_server || s.server_name === this._config.filter_server);
      if (!targeted && this._config.filter_user) {
        const desired = String(this._config.filter_user).toLocaleLowerCase();
        streams = streams.filter(s => [s.username, this._name(entry,s)].some(n => String(n||"").toLocaleLowerCase() === desired));
      }
      if (this._config.filter_transcode && this._config.filter_transcode !== "all") streams = streams.filter(s => transcodeMode(s) === this._config.filter_transcode);
      const sort = this._config.sort;
      if (sort === "user") streams.sort((a,b) => this._name(entry,a).localeCompare(this._name(entry,b)));
      else if (sort === "server") streams.sort((a,b) => a.server_name.localeCompare(b.server_name));
      else streams.sort((a,b) => String(b.started_at).localeCompare(String(a.started_at)));
      if (this._individual) {
        const selection=this._config.selection;
        if (selection === "stream")
          streams = streams.filter(s => !!this._config.stream_id && String(s.id) === String(this._config.stream_id));
        else if (selection === "account")
          streams = streams.filter(s => !!this._config.selected_account && `${s.server_id}:${s.username}` === this._config.selected_account);
        else if (selection === "server")
          streams = streams.filter(s => !!this._config.selected_server && s.server_id === this._config.selected_server);
        return streams.slice(0, 1);
      }
      return streams;
    }
    _artworkPath(entry, stream, kind) {
      return `/api/tracearr_ha/image/${encodeURIComponent(entry.id)}/${encodeURIComponent(stream.id)}/${kind}`;
    }
    _pruneArtwork(entry, streams) {
      const sources = new Map();
      for (const stream of streams) {
        const poster = (this._config.show_poster || this._config.stream_surface === "blur") && stream.poster_url;
        const avatar = this._config.show_avatar && (this._avatar(entry,stream) || stream.user_avatar_url);
        if (poster) sources.set(this._artworkPath(entry,stream,"poster"), poster);
        if (avatar) sources.set(this._artworkPath(entry,stream,"avatar"), avatar);
      }
      for (const [path, source] of this._artworkSources) {
        if (sources.get(path) === source) continue;
        this._images.delete(path);
        this._imageAttempts.delete(path);
        clearTimeout(this._imageRetryTimers.get(path));
        this._imageRetryTimers.delete(path);
      }
      this._artworkSources = sources;
    }
    _image(entry,s,kind) {
      const direct = kind === "avatar" ? this._avatar(entry,s) : "";
      if (direct) return direct;
      const raw = kind === "poster" ? s.poster_url : s.user_avatar_url;
      if (!raw) return "";
      // Keep external URLs direct: the HA proxy must never fetch arbitrary hosts.
      if (typeof raw === "string" && /^https?:\/\//i.test(raw) && !raw.includes("/api/v1/images/proxy")) return safeImage(raw);
      if (!entry?.id || !s?.id) return "";
      const path = this._artworkPath(entry,s,kind);
      const cached = this._images.get(path);
      if (cached?.raw === raw && cached.expires > Date.now()) return cached.url || "";
      if ((cached?.pending && cached.raw === raw) || this._imageRetryTimers.has(path)) return "";
      if (this.isConnected && this._hass?.connection) {
        // A signature arriving after the initial render must update the image
        // directly: unchanged SSE fingerprints otherwise leave placeholders forever.
        const request = {pending:true,raw};
        this._images.set(path,request);
        this._hass.connection.sendMessagePromise({type:"auth/sign_path", path, expires:600})
          .then(result => {
            if (this._images.get(path) !== request) return;
            if (typeof result?.path !== "string" || !result.path.startsWith("/")) throw Error("Invalid signed image path");
            this._images.set(path,{url:result.path,raw,expires:Date.now()+540000});
            this._applyArtwork(s.id,kind,result.path);
          })
          .catch(() => {
            if (this._images.get(path) !== request) return;
            this._images.delete(path);
            this._scheduleImageRetry(entry,s,kind);
          });
      }
      return "";
    }
    _applyArtwork(sessionId,kind,url) {
      if (!url || !this.shadowRoot) return;
      // Replace only the relevant image, never the carousel/stream container.
      for (const card of this.shadowRoot.querySelectorAll(".stream")) {
        if (card.dataset.session !== String(sessionId)) continue;
        const target = kind === "poster" ? card.querySelector(".poster-wrap .poster") :
          card.querySelector(".user .avatar");
        if (target && !(target.tagName === "IMG" && target.getAttribute("src") === url)) {
          const css = kind === "poster" ? "poster" : "avatar";
          const alt = kind === "poster" ? "Affiche" : "";
          target.outerHTML = `<img class="${css}" data-kind="${kind}" src="${E(url)}" alt="${alt}" loading="eager" decoding="async">`;
        }
        // Signed artwork may arrive after the backdrop was initially rendered.
        // Update its image in place, preserving the live carousel DOM and index.
        if (kind === "poster") {
          const backdrop = card.querySelector(".stream-backdrop .backdrop-image, .stream-backdrop .backdrop-empty");
          if (backdrop && !(backdrop.tagName === "IMG" && backdrop.getAttribute("src") === url)) {
            const track = this._config.show_poster ? "" : ' data-kind="poster"';
            backdrop.outerHTML = `<img class="backdrop-image"${track} src="${E(url)}" alt="" decoding="async">`;
          }
        }
      }
    }
    _scheduleImageRetry(entry,stream,kind) {
      if (!entry?.id || !stream?.id || !this.isConnected) return;
      const path = this._artworkPath(entry,stream,kind);
      if (this._imageRetryTimers.has(path)) return;
      const count = (this._imageAttempts.get(path) || 0) + 1;
      if (count > 3) return;
      this._imageAttempts.set(path,count);
      const delay = [2000,5000,15000][count-1];
      const timer = setTimeout(() => {
        this._imageRetryTimers.delete(path);
        if (!this.isConnected) return;
        const currentEntry = this._displayEntry(this._entryData());
        const current = currentEntry?.id === entry.id &&
          this._streams(currentEntry).find(item => String(item.id) === String(stream.id));
        if (!current || !(kind === "poster" ? (this._config.show_poster || this._config.stream_surface === "blur") : this._config.show_avatar)) return;
        this._images.delete(path);
        const url = this._image(currentEntry,current,kind);
        if (url) this._applyArtwork(stream.id,kind,url);
      },delay);
      this._imageRetryTimers.set(path,timer);
    }
    _onArtworkError(event) {
      const img = event.target;
      const kind = img?.getAttribute?.("data-kind");
      if (kind !== "poster" && kind !== "avatar") return;
      const sessionId = img.closest?.(".stream")?.dataset?.session;
      const entry = this._displayEntry(this._entryData());
      const stream = entry?.streams?.find(s => String(s.id) === sessionId);
      if (!stream) return;
      const path = this._artworkPath(entry,stream,kind);
      const cached = this._images.get(path);
      // Ignore errors from an older URL if a newer signature already exists.
      if (cached?.url && cached.url !== img.getAttribute("src")) return;
      const isBackdrop = !!img.classList?.contains?.("backdrop-image");
      const fallback = kind === "poster" ?
        (isBackdrop ? '<div class="backdrop-empty"></div>' : '<div class="poster empty">▣</div>') :
        `<span class="avatar fallback-avatar">${E(this._name(entry,stream).slice(0,1).toUpperCase())}</span>`;
      // A failed foreground image must not leave a broken blurred image behind.
      const background = !isBackdrop && kind === "poster" ?
        img.closest?.(".stream")?.querySelector?.(".stream-backdrop .backdrop-image") : null;
      if (background) background.outerHTML = '<div class="backdrop-empty"></div>';
      img.outerHTML = fallback;
      this._images.delete(path);
      this._scheduleImageRetry(entry,stream,kind);
    }
    _onArtworkLoad(event) {
      const img = event.target;
      const kind = img?.getAttribute?.("data-kind");
      if (kind !== "poster" && kind !== "avatar") return;
      const sessionId = img.closest?.(".stream")?.dataset?.session;
      const entry = this._displayEntry(this._entryData());
      const stream = entry?.streams?.find(s => String(s.id) === sessionId);
      if (!stream) return;
      const path = this._artworkPath(entry,stream,kind);
      this._imageAttempts.delete(path);
      const timer = this._imageRetryTimers.get(path);
      if (timer !== undefined) clearTimeout(timer);
      this._imageRetryTimers.delete(path);
    }
    _palette(serverType, forceTheme=false) {
      const mode = forceTheme && this._config.accent_color_mode === "server" ? "theme" : this._config.accent_color_mode;
      return streamPalette(this,mode,this._config.accent_custom_color,serverType);
    }
    _headerPalette(serverType) {
      const mode = this._config.header_badge_color_mode || "inherit";
      if (mode === "inherit") return this._palette(serverType, !serverType);
      if (mode === "server") return this._paletteForMode("server", serverType);
      if (mode === "custom") return this._paletteForMode("custom", serverType, this._config.header_badge_custom_color);
      return this._paletteForMode("theme", serverType);
    }
    _paletteForMode(mode, serverType, customColor) {
      return streamPalette(this,mode,customColor,serverType);
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
      const globalMapping = asMapping(this._entryData()?.network_locations);
      const cardMapping = asMapping(this._config.network_locations);
      const candidates = [
        stream.device && stream.server_id && `${stream.server_id}:device:${stream.device}`,
        stream.player && stream.server_id && `${stream.server_id}:player:${stream.player}`,
        stream.server_id && stream.username && `${stream.server_id}:${stream.username}`,
        // Server-wide defaults beat generic device rules, but never override
        // an explicitly server-scoped device or user exception.
        stream.server_id && `server:${stream.server_id}`,
        stream.device && `device:${stream.device}`,
        stream.player && `player:${stream.player}`,
        stream.username && `${stream.server_type}:${stream.username}`,
        stream.username && `${stream.server_name}:${stream.username}`,
        stream.username,
      ].filter(Boolean);
      // A card exception takes precedence even if the global rule uses a more
      // specific server-scoped key than the card's unscoped device name.
      const location = candidates.map(key => cardMapping[key]).find(Boolean)
        || candidates.map(key => globalMapping[key]).find(Boolean) || direct;
      const value = String(location).trim().toLowerCase();
      if (["local", "lan", "interne"].includes(value)) return "local";
      if (["remote", "wan", "distant", "externe"].includes(value)) return "remote";
      return "unknown";
    }
    _includeBitrate(stream) {
      const scope = this._config.bitrate_scope || "both";
      return scope === "both" || this._networkScope(stream) === scope;
    }
    _scopedBitrate(stream) {
      return this._includeBitrate(stream) ? stream.bitrate ?? null : null;
    }
    _streamSummary(streams) {
      const sums = {total:streams.length, direct:0, video:0, audio:0, both:0,
        transcodes:0, unknown:0, paused:0, bandwidth:0, byServer:new Map()};
      for (const s of streams) {
        const kind = transcodeMode(s);
        sums[kind]++;
        if (kind === "video" || kind === "audio" || kind === "both" || s.is_transcode) sums.transcodes++;
        if (s.state === "paused") sums.paused++;
        sums.bandwidth += Math.max(0, Number(this._scopedBitrate(s)) || 0);
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
      // Every Tracearr statistic and HA entity can override the common style
      // and choose its own horizontal position without changing badge order.
      const add = (key, enabled, name, display, value, colorType=null, custom=null, identity=key) => {
        if (!enabled) return;
        if (!key.startsWith("entity:")) custom = c.header_metric_settings?.[key] || {};
        const count = Number(value);
        const positive = Number.isFinite(count) && count > 0;
        const hideZero = c.header_positive_only || !!custom?.only_positive;
        if (hideZero && !positive) return;
        const blinking = positive && (c.header_blink_positive || !!custom?.blink_positive);
        const duration = clamp(custom?.blink_seconds ?? c.header_blink_seconds,.5,20,2);
        const zeroMode = custom?.zero_color_mode === "custom" ? "custom" : c.header_zero_color_mode;
        const zeroColor = custom?.zero_color_mode === "custom" ? custom.zero_custom_color : c.header_zero_custom_color;
        const palette = !positive && zeroMode === "custom" ? this._paletteForMode("custom",null,zeroColor) :
          custom?.normal_custom_color ? this._paletteForMode("custom",null,custom.normal_custom_color) : this._headerPalette(colorType);
        const showName = custom?.show_name ?? c.header_show_names;
        const displayName = String(custom?.label || "").trim() || name;
        const safeIcon = String(custom?.icon || HEADER_ICONS[key] || "");
        const iconMarkup = custom?.show_icon && /^(mdi|hass):[a-z0-9-]+$/.test(safeIcon) ?
          `<ha-icon icon="${E(safeIcon)}" aria-hidden="true"></ha-icon>` : "";
        const output = `${showName && displayName ? `${E(displayName)} : ` : ""}${E(display)}`;
        const markup = `<span class="metric${blinking ? " blink-positive" : ""}" data-badge="${E(identity)}" style="--pill-bg:${palette.bg};--pill-text:${palette.text};--badge-blink:${duration}s" title="${E(displayName || display)}">${iconMarkup}<span class="metric-text">${output}</span></span>`;
        const position = badgeAlign(custom?.align);
        const align = position === "auto" ? (c.show_title ? "right" : "left") : position;
        metrics.set(key, [...(metrics.get(key) || []), {align,markup}]);
      };
      // Preserve the existing stream-count format "2 flux" when names are on.
      const streamSettings = c.header_metric_settings?.streams;
      const streamLabel = String(streamSettings?.label || "").trim();
      const showStreamName = streamSettings?.show_name ?? c.header_show_names;
      add("streams", c.header_show_streams, streamLabel,
        streamLabel ? String(summary.total) : (showStreamName ? `${summary.total} flux` : String(summary.total)), summary.total);
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
        for (const [id,server] of summary.byServer) add("server_counts",true,server.name,server.count,server.count,server.type,null,
          `server:${id}`);
      }
      // Custom badges consume the entity's current state, unit and icon.
      for (const [index,row] of (c.header_entity_badges || []).entries()) {
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
        add(`entity:${row.id}`, true, name, `${value}${units}`, value, null, {...row,icon:state?.attributes?.icon || fallback},
          `entity:${index}:${row.id}:${id}`);
      }
      const title = c.show_title ? `<h3>${E(c.title || "Lectures en cours")}</h3>` : "";
      const order = normalizedOrder(c.header_badge_order,
        [...HEADER_FIELDS, ...(c.header_entity_badges || []).map(row => `entity:${row.id}`)]);
      const orderedMetrics = order.flatMap(key => metrics.get(key) || []);
      if (!title && !orderedMetrics.length) return "";
      const groups = {left:[],center:[],right:[]};
      for (const badge of orderedMetrics) groups[badge.align].push(badge.markup);
      const populated = ["left","center","right"].filter(position => groups[position].length);
      // A center group alone is already centered by flex. With neighbors,
      // correct its position once the browser has laid out the flex rows.
      const layout = populated.length > 1 && populated.includes("center") ? " with-center" : "";
      const badgeMarkup = orderedMetrics.length ?
        `<div class="head-metrics${layout}">${populated.map(position =>
          `<div class="head-group align-${position}">${groups[position].join("")}</div>`).join("")}</div>` : "";
      return `<header class="head${title ? "" : " no-title"}">${title}${badgeMarkup}</header>`;
    }
    // API samples may be slightly older than the local playback time. Keep a
    // monotonic client-side clock for ordinary SSE updates; only snap when the
    // *difference between two API samples* is evidence of a real seek.
    _now() { return performance.now(); }
    _positionAt(clock, now=this._now()) {
      if (!clock) return 0;
      const delta = !clock.stale && clock.state === "playing" ? Math.max(0, now - clock.at) : 0;
      return clock.duration > 0 ? Math.min(clock.duration, clock.progress + delta) : clock.progress + delta;
    }
    _syncPosition(stream, now=this._now(), stale=false) {
      const id = stream.id;
      const duration = Math.max(0, Number(stream.duration_ms) || 0);
      const source = Math.max(0, Math.min(duration || Infinity, Number(stream.progress_ms) || 0));
      const state = stream.state === "playing" ? "playing" : "paused";
      // Session IDs can be reused; do not preserve an old film's clock.
      const media = [stream.started_at || "", stream.media_id || stream.rating_key || stream.media_title || ""].join("|");
      const old = this._positions.get(id);
      if (!old || old.media !== media || (!stale && (old.stale ||
          (old.duration && duration && Math.abs(old.duration-duration) > 10000)))) {
        const fresh = {progress:source, at:now, duration, state, media, stale,
          lastRaw:source, lastRawAt:now, lastRendered:source};
        this._positions.set(id, fresh);
        return fresh;
      }
      if (stale) {
        // Freeze the number the viewer actually saw, not an extrapolation
        // since the last paint or a partial sample from an unconfirmed SSE.
        old.progress = old.lastRendered;
        old.stale = true;
        return old;
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
      const blurred = c.stream_surface === "blur";
      const poster = c.show_poster || blurred ? this._image(entry,s,"poster") : "";
      const avatar = c.show_avatar ? this._image(entry,s,"avatar") : "";
      const name = this._name(entry,s);
      const mediaMarkup = this._mediaMarkup(s);
      const stale = this._streamsStale(entry);
      const clock = this._syncPosition(s, undefined, stale);
      const displayPosition = Math.max(clock.lastRendered, this._positionAt(clock));
      const ratio = clock.duration > 0 ? 100 * Math.min(1, displayPosition / clock.duration) : 0;
      const timePair = playbackSeconds(displayPosition, clock.duration);
      const paused = s.state === "paused";
      const showTimes = c.show_progress || c.show_end_time;
      const pauseLabel = paused ? `<span class="time-paused">En pause</span>` : "";
      const endLabel = c.show_end_time && clock.duration > 0 ?
        (stale ? `<span class="time-end">Non actualisé</span>` : clock.state === "playing" ?
          `<span class="time-end" data-id="${E(s.id)}">Fin à ${E(estimatedEnd(clock,displayPosition,Date.now()))}</span>` : "") : "";
      const rightTime = pauseLabel && endLabel ? `<span class="time-status">${pauseLabel}${endLabel}</span>` : pauseLabel || endLabel;
      const metaByKey = {};
      if (c.show_health && entry?.servers?.find(server => server.server_id === s.server_id)?.status === "down") metaByKey.health = (`<span class="chip warn">Serveur hors ligne</span>`);
      if (c.show_server) metaByKey.server = `<span>${E(s.server_name || s.server_type || "")}</span>`;
      if (c.show_device && (s.device || s.player)) metaByKey.device = `<span>${E(s.device || s.player)}</span>`;
      // The separate video/audio icons take the place of the old text badge.
      const bitrate = c.show_bitrate ? this._scopedBitrate(s) : null;
      Object.assign(metaByKey,renderTechnical(s,c,bitrate,this._techEnglish));
      const accent = SERVER_ACCENTS[String(s.server_type || "").toLowerCase()] || "var(--tr-accent)";
      const palette = this._palette(s.server_type);
      const sharedStyle = `--shared-accent:${palette.bg};--pill-bg:${palette.bg};--pill-text:${palette.text};--tr-stream-blur:${clamp(c.stream_blur,0,50,26)}px;--tr-stream-overlay:${clamp(c.stream_overlay,25,95,72)/100};--tr-edge-width:${clamp(c.stream_accent_width,2,8,4)}px`;
      const edgeMode = ["rounded","straight","none"].includes(c.stream_accent_style) ? c.stream_accent_style : "rounded";
      // Use the existing poster URL (no external backdrop requests).
      const backdropMarkup = blurred ? `<div class="stream-backdrop" aria-hidden="true">${poster ?
        `<img class="backdrop-image"${c.show_poster ? "" : ' data-kind="poster"'} src="${E(poster)}" alt="" decoding="async">` :
        '<div class="backdrop-empty"></div>'}</div>` : "";
      const indicators = c.show_transcode_icons ? `<div class="media-flags" aria-label="État du flux audio et vidéo">${["video","audio"].map(kind => {
        const decision = kind === "video" ? s.video_decision : s.audio_decision;
        const state = codecState(decision);
        const tip = `${kind === "video" ? "Vidéo" : "Audio"} : ${state === "transcode" ? "Transcodage" : state === "direct" ? "Lecture directe" : "Inconnu"}`;
        return `<span class="stream-indicator ${state}" role="img" aria-label="${E(tip)}" title="${E(tip)}">${badgeIcon(kind)}</span>`;
      }).join("")}</div>` : "";
      const posterMarkup = c.show_poster ? `<div class="poster-wrap">${poster ? `<img class="poster" data-kind="poster" src="${E(poster)}" alt="Affiche" loading="eager" decoding="async">` : `<div class="poster empty">▣</div>`}${paused ? `<span class="poster-paused" aria-label="Lecture en pause"><span class="pause-symbol" aria-hidden="true"></span></span>` : ""}</div>` : "";
      return `<article class="stream accent-${edgeMode}${blurred ? " surface-blur" : ""}" data-session="${E(s.id)}" style="--stream-accent:${accent};${sharedStyle}">
        ${backdropMarkup}
        ${posterMarkup}
        ${indicators}
        <div class="info">
          ${c.show_avatar ? `<div class="user">${avatar ? `<img class="avatar" data-kind="avatar" src="${E(avatar)}" alt="" loading="eager" decoding="async">` : `<span class="avatar fallback-avatar">${E(name.slice(0,1).toUpperCase())}</span>`}<span>${E(name)}</span></div>` : `<div class="user">${E(name)}</div>`}
          ${mediaMarkup}
          ${c.show_progress ? `<div class="progress"><span class="fill" data-id="${E(s.id)}" style="width:${ratio.toFixed(2)}%"></span></div>` : ""}
          ${showTimes || paused ? `<div class="times">${showTimes ? `<span class="time-left"><span class="time-current" data-id="${E(s.id)}">${formattedSeconds(timePair.elapsed)}</span>${c.show_remaining && c.show_progress ? `<span class="time-separator">/</span><span class="time-remaining" data-id="${E(s.id)}">-${formattedSeconds(timePair.remaining)}</span>` : ""}</span>` : ""}${rightTime}</div>` : ""}
          ${metaMarkup(metaByKey,c.footer_field_order)}
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
          const label = end ? `Fin à ${end}` : "";
          if (endNode.textContent !== label) endNode.textContent = label;
        }
      });
    }
    _stopCarouselAnimation() {
      if (this._carouselFrame !== null) cancelAnimationFrame(this._carouselFrame);
      this._carouselFrame = null;
      this._carouselAnimating = false;
      for (const animation of this._carouselEffects) animation.cancel();
      this._carouselEffects.clear();
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
              const animation = card.animate?.(frames, {duration, easing: "ease-in-out"});
              if (!animation) return;
              this._carouselEffects.add(animation);
              const release = () => this._carouselEffects.delete(animation);
              animation.addEventListener("finish", release, {once:true});
              animation.addEventListener("cancel", release, {once:true});
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
        this._armCarouselAutoplay(true);
      };
      el.addEventListener("pointerup", end);
      el.addEventListener("pointercancel", end);
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
      if (!fromAutoplay) this._armCarouselAutoplay(true);
    }

    _liveSnapshot(stream, entry) {
      const {progress_ms, ...rest} = stream;
      return JSON.stringify({rest,health:entry?.servers?.find(x => x.server_id === stream.server_id)?.status,
         showBitrate:this._config.show_bitrate && this._scopedBitrate(stream) !== null,
         stale:this._streamsStale(entry), technicalEnglish:!legacyTechnical(this._config) && this._techEnglish});
    }
    _refreshHeader(streams) {
      const header = this._header(streams);
      if (header === this._headerMarkup) return;
      const oldHeader = this.shadowRoot.querySelector(".head");
      let layoutChanged = true;
      if (oldHeader && header) {
        const template = document.createElement("template");
        template.innerHTML = header;
        layoutChanged = this._patchHeader(oldHeader, template.content.firstElementChild);
      } else if (oldHeader && !header) oldHeader.remove();
      else if (header) {
        const status = this.shadowRoot.querySelector(".availability-status");
        if (status) status.insertAdjacentHTML("afterend", header);
        else this.shadowRoot.querySelector(".root")?.insertAdjacentHTML("afterbegin", header);
      }
      this._headerMarkup = header;
      if (layoutChanged) this._observeHeaderLayout();
    }
    _patchHeader(current, next) {
      const title = current.querySelector("h3"), nextTitle = next.querySelector("h3");
      current.className = next.className;
      if (!nextTitle) title?.remove();
      else if (!title) current.prepend(nextTitle);
      else if (title.textContent !== nextTitle.textContent) title.textContent = nextTitle.textContent;

      const metrics = current.querySelector(".head-metrics"), nextMetrics = next.querySelector(".head-metrics");
      if (!nextMetrics || !metrics) {
        metrics?.remove();
        if (nextMetrics) current.append(nextMetrics);
        return metrics !== nextMetrics;
      }
      const before = [...metrics.children], after = [...nextMetrics.children];
      const stillUsed = new Set(after.map(group => group.className));
      const existing = new Map(before.map(group => [group.className,group]));
      before.filter(group => !stillUsed.has(group.className)).forEach(group => group.remove());
      let sibling = metrics.firstElementChild;
      for (const nextGroup of after) {
        const group = existing.get(nextGroup.className);
        if (!group) metrics.insertBefore(nextGroup,sibling);
        else {
          this._patchBadgeGroup(group,nextGroup);
          sibling = group.nextElementSibling;
        }
      }
      if (before.map(group => group.className).join() === after.map(group => group.className).join()) return false;
      metrics.className = nextMetrics.className;
      const center = metrics.querySelector(".align-center");
      if (center) center.style.translate = "";
      return true;
    }
    _patchBadgeGroup(group, nextGroup) {
      const key = node => node.dataset.badge;
      const next = [...nextGroup.children];
      const keys = new Set(next.map(key));
      const existing = new Map();
      for (const node of [...group.children]) {
        if (keys.has(key(node))) existing.set(key(node),node);
        else node.remove();
      }
      let sibling = group.firstElementChild;
      for (const fresh of next) {
        const badge = existing.get(key(fresh));
        if (!badge) {
          group.insertBefore(fresh,sibling);
          continue;
        }
        if (badge.className !== fresh.className) badge.className = fresh.className;
        if (badge.style.cssText !== fresh.style.cssText) badge.style.cssText = fresh.style.cssText;
        if (badge.title !== fresh.title) badge.title = fresh.title;
        if (badge.innerHTML !== fresh.innerHTML) badge.innerHTML = fresh.innerHTML;
        if (badge !== sibling) {
          // Server counts can be reordered when sessions change. A plain DOM
          // reinsert restarts CSS animation on engines without moveBefore.
          if (typeof group.moveBefore === "function") group.moveBefore(badge,sibling);
          else {
            const phase = badge.getAnimations?.()[0]?.currentTime;
            group.insertBefore(badge,sibling);
            const pulse = badge.getAnimations?.()[0];
            if (pulse && phase != null) pulse.currentTime = phase;
          }
        }
        sibling = badge.nextElementSibling;
      }
    }
    _stopHeaderLayout() {
      this._headerResize?.disconnect();
      this._headerResize = null;
      if (this._headerFrame !== null) cancelAnimationFrame(this._headerFrame);
      this._headerFrame = null;
    }
    _observeHeaderLayout() {
      this._stopHeaderLayout();
      if (!this.isConnected || typeof ResizeObserver !== "function") return;
      const metrics = this.shadowRoot.querySelector(".head-metrics.with-center");
      if (!metrics) return;
      const center = metrics.querySelector(".align-center");
      const left = metrics.querySelector(".align-left");
      const right = metrics.querySelector(".align-right");
      const update = () => {
        const row = metrics.getBoundingClientRect(), box = center.getBoundingClientRect();
        const style = getComputedStyle(metrics);
        const gap = parseFloat(style.columnGap);
        const start = left?.getBoundingClientRect(), end = right?.getBoundingClientRect();
        // If neither side fits alongside the center, keep the sides together
        // when possible instead of using three rows. This depends only on
        // intrinsic widths, so changing the order cannot change the decision.
        const fits = (a,b) => a.width + b.width + gap <= row.width + 0.01;
        const centerLast = !!(start && end && fits(start,end) && !fits(start,box) && !fits(end,box));
        if (this._headerFrame !== null) cancelAnimationFrame(this._headerFrame);
        this._headerFrame = null;
        if (metrics.classList.contains("center-last") !== centerLast) {
          // Repacking may change the observed height; don't do it during
          // observer delivery. The new row order only needs flex alignment.
          this._headerFrame = requestAnimationFrame(() => {
            this._headerFrame = null;
            metrics.classList.toggle("center-last", centerLast);
            center.style.translate = "";
            update(); // Position may change even if all observed sizes are unchanged.
          });
          return;
        }
        const onRow = rect => rect && rect.top < box.bottom && rect.bottom > box.top ? rect : null;
        const [l,r] = (style.direction === "rtl" ? [end,start] : [start,end]).map(onRow);
        const min = l ? l.right + gap : row.left;
        const max = (r ? r.left - gap : row.right) - box.width;
        const ideal = row.left + (row.width - box.width) / 2;
        const previous = parseFloat(center.style.translate) || 0;
        // Translation leaves flex sizing and wrapping alone, so it cannot
        // retrigger the observer. Clamp only against neighbors on this row.
        const delta = Math.max(min, Math.min(ideal, max)) - box.left;
        if (Math.abs(delta) > 0.01) center.style.translate = `${previous + delta}px`;
      };
      this._headerResize = new ResizeObserver(update);
      for (const node of [metrics, center, left, right]) if (node) this._headerResize.observe(node);
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
      let entry = this._entryData();
      const c = this._config;
      if (!this.shadowRoot) return;
      const stale = this._streamsStale(entry);
      const entryId = entry?.id ?? null;
      if (this._entryId !== entryId) {
        this._resetStreamState();
        this._entryId = entryId;
        this._renderFingerprint = null;
      }
      // An unconfirmed reconnect can deliver deltas, not a complete list.
      // Keep the last known panels until a reliable snapshot can replace them.
      this._staleStreams = stale ? this._staleStreams ?? [...(entry.streams || [])] : null;
      entry = this._displayEntry(entry);
      const streams = this._streams(entry);
      this._pruneArtwork(entry, streams);
      // Keep a stable carousel shell while live SSE properties change. The
      // original full DOM rebuild used to teleport the slider without any
      // transition whenever pause/bitrate/health/codec updates arrived.
      const fingerprint = JSON.stringify({
        config: c,
        streams: c.mode === "carousel" ? streams.map(s => s.id) : streams.map(({progress_ms, ...rest}) => rest),
        stats: c.mode === "carousel" ? undefined : entry?.stats,
        servers: c.mode === "carousel" ? undefined : entry?.servers,
        // Option-only WS snapshots can change the scoped bitrate without changing
        // the streams. In carousel mode, invalidate only the affected panels.
        bitrateIncluded: c.mode !== "carousel" && (c.show_bitrate || (c.show_header && c.header_show_bandwidth)) ?
          streams.map(s => this._scopedBitrate(s) !== null) : undefined,
        aliases: entry?.aliases,
        avatars: entry?.avatars,
        stale: c.mode === "carousel" && streams.length ? undefined : stale,
        technicalEnglish:c.mode !== "carousel" && !legacyTechnical(c) && this._techEnglish,
      });
      // Refresh each stream's clock even if the rest of the card is unchanged.
      // Crucially, do NOT reset its anchor on every incoming SSE progress event.
      const now = this._now();
      // Keep a previously displayed session's clock even while filtered out
      // (in particular during a hidden pause), but drop it on actual stop.
      const active = new Map((entry?.streams || []).map(stream => [stream.id,stream]));
      const visibleIds = new Set(streams.map(stream => stream.id));
      for (const id of this._positions.keys()) {
        if (!active.has(id)) this._positions.delete(id);
        else if (!visibleIds.has(id)) this._syncPosition(active.get(id), now, stale);
      }
      for (const stream of streams) this._syncPosition(stream, now, stale);
      this._setTimers(streams, stale);
      if (fingerprint === this._renderFingerprint && this.shadowRoot.querySelector("ha-card")) {
        if (c.mode === "carousel") this._updateCarouselLive(entry, streams);
        this._refreshAvailability(entry, stale);
        this._updateProgress();
        return;
      }
      this._renderFingerprint = fingerprint;
      const carousel = this.shadowRoot.querySelector(".streams.carousel");
      const oldScroll = carousel?.scrollLeft || 0;
      const previousAnchor = carousel?.querySelectorAll(".stream")?.[this._carouselIndex]?.dataset?.session;
      this._stopCarouselAnimation();
      if (!stale && c.empty_mode === "hide" && !streams.length) {
        this.shadowRoot.innerHTML = `<style>${style}</style>`;
        this._headerMarkup = "";
        this._liveFingerprints.clear();
        this._observeHeaderLayout();
        this.style.display="none";
        return;
      }
      this.style.display="";
      this._liveFingerprints = new Map(c.mode === "carousel" ? streams.map(s => [s.id, this._liveSnapshot(s,entry)]) : []);
      const visible = clamp(c.carousel_visible, 1, 4, 1);
      const posterScale = clamp(c.poster_size, 50, 200, 100) / 100;
      const posterVars = `--tr-poster-width:${Math.round(73 * posterScale)}px;--tr-poster-height:${Math.round(109 * posterScale)}px;--tr-compact-poster-width:${Math.round(48 * posterScale)}px;--tr-compact-poster-height:${Math.round(72 * posterScale)}px`;
      const items = streams.map(s => this._streamCard(entry,s)).join("");
      // Always conceal the native scrollbar; navigation remains via buttons,
      // touch swipe, optional mouse drag and keyboard arrow keys.
      const classes = `streams ${E(c.mode)}`;
      const emptyText = String(c.empty_message ?? "Aucune lecture en cours");
      const body = !streams.length && (stale || c.empty_mode === "header_only") ? "" :
        `<div class="${classes}" ${c.mode === "carousel" ? `tabindex="0" role="region" aria-label="Lectures en carrousel"` : ""} style="--carousel-visible:${visible}">${items || `<div class="empty-message">${E(emptyText)}</div>`}</div>`;
      const nav = c.mode === "carousel" && c.carousel_show_arrows && streams.length > 1 ? `<div class="carousel-nav"><button class="nav" data-step="-1" aria-label="Précédent">❮</button><span>${streams.length} lectures</span><button class="nav" data-step="1" aria-label="Suivant">❯</button></div>` : "";
      const shell = this.shadowRoot.querySelector("ha-card");
      const root = shell?.querySelector?.(".root");
      const shellStyle = `--tr-font-size:${clamp(c.font_size,10,28,14)}px;${posterVars}`;
      const rootClasses = `root ${c.compact?"compact":""} ${c.stream_surface === "transparent" ? "flat-streams" : ""}${!body && !stale ? " header-only" : ""}`;
      if (root) {
        // The body can still be rebuilt independently of the header. Keeping
        // the latter attached preserves CSS animation phases across snapshots.
        if (shell.getAttribute("style") !== shellStyle) shell.setAttribute("style",shellStyle);
        if (root.className !== rootClasses) root.className = rootClasses;
        this._refreshHeader(streams);
        root.querySelector(".streams")?.remove();
        root.querySelector(".carousel-nav")?.remove();
        root.insertAdjacentHTML("beforeend",body + nav);
      } else {
        this._headerMarkup = this._header(streams);
        const status = this._availabilityText(entry,stale);
        this.shadowRoot.innerHTML = `<style>${style}${technicalStyle}</style><ha-card style="${shellStyle}"><div class="${rootClasses}"${stale ? " data-stale" : ""}><div class="availability-status" role="status">${E(status)}</div>${this._headerMarkup}${body}${nav}</div></ha-card>`;
        this._observeHeaderLayout();
      }
      this._refreshAvailability(entry, stale);
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
        newCarousel.addEventListener("keydown", (event) => {
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            this._scroll(event.key === "ArrowRight" ? 1 : -1);
          }
        });
        // A touch swipe is manual navigation too: give the user the entire
        // interval before automatically advancing again.
        newCarousel.addEventListener("touchend", () => this._armCarouselAutoplay(true), {passive:true});
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
    .badge-row { display:grid; gap:8px; padding:10px; }
    details.subpanel { background:var(--card-background-color); border-radius:8px; }
    details.subpanel summary { padding:10px; font-weight:600; font-size:13px;
      background:transparent; }
    details.subpanel .section-body { gap:9px; }
    .group-label { margin-top:3px; }
    .badge-row ha-entity-picker { display:block; width:100%; }
    .badge-row button,.add-badge { border:1px solid var(--divider-color,#7775);
      border-radius:7px; padding:8px; color:var(--primary-text-color);
      background:var(--secondary-background-color,transparent); cursor:pointer; text-align:left; }
    .badge-color { display:grid; gap:8px; }
    .tech-preview { min-width:0; padding:10px; border-radius:7px;
      background:var(--secondary-background-color,transparent); font-size:.86em; }
    .tech-preview .meta { display:flex; flex-wrap:wrap; align-items:center; gap:5px; }
    .tech-preview .chip { padding:3px 7px; border-radius:7px; background:var(--pill-bg); color:var(--pill-text); font-weight:600; }
    .tech-reset { font:inherit; color:inherit; background:transparent; border:1px solid var(--divider-color,#888);
      border-radius:6px; padding:6px 8px; cursor:pointer; }
    .tech-reset:disabled { opacity:.5; cursor:default; }
    .range-row { display:flex; gap:12px; align-items:center; }
    .range-row input[type=range] { flex:1; min-width:0; accent-color:var(--accent-color); }
    .range-row output { min-width:50px; text-align:right; font-variant-numeric:tabular-nums; }
  `;
  class TracearrCardEditor extends HTMLElement {
    constructor() {
      super(); this.attachShadow({mode:"open"}); this._config=normalizeConfig({});
      this._payload={entries:[]}; this._openSections=new Set(["global","source"]);
      this._openSubdetails=new Set();
    }
    setConfig(config) {
      // Keep opened categories across dashboard editor rerenders.
      this._captureOpenSections();
      this._config=normalizeConfig(config);
      this.render();
    }
    set hass(hass) {
      const languageChanged = techEnglish(hass) !== techEnglish(this._hass);
      this._hass=hass;
      syncTechTheme(this,hass);
      if (languageChanged) { this._captureOpenSections(); this.render(); }
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
      const subdetails=this.shadowRoot.querySelectorAll("details[data-subdetail]");
      if (subdetails.length) this._openSubdetails=new Set([...subdetails].filter(d=>d.open).map(d=>d.dataset.subdetail));
    }
    _group(key,title,contents) {
      return `<details data-section="${E(key)}" ${this._openSections.has(key)?"open":""}><summary>${E(title)}</summary><div class="section-body">${contents}</div></details>`;
    }
    _subgroup(key,title,contents) {
      return `<details class="subpanel" data-subdetail="${E(key)}" ${this._openSubdetails.has(key)?"open":""}><summary>${E(title)}</summary><div class="section-body">${contents}</div></details>`;
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
    _range(name,label,min,max,unit) {
      const value = Math.round(clamp(this._config[name],min,max,min));
      return `<label>${E(label)}<span class="range-row"><input type="range" min="${min}" max="${max}" step="1" data-field="${E(name)}" value="${value}"><output data-range-output="${E(name)}">${value} ${E(unit)}</output></span></label>`;
    }
    _orderEditor(configKey, fields, labels=MEDIA_LABELS, rowLabel, en=false) {
      const order = normalizedOrder(this._config[configKey], fields);
      return `<div class="order-list">${order.map((field,index) => {
        const label = labels[field] || field;
        return `<div class="order-row">${rowLabel ? rowLabel(field,label) : `<span>${E(label)}</span>`}<div class="move-controls"><button type="button" data-order="${E(configKey)}" data-index="${index}" data-direction="-1" ${index===0?"disabled":""} aria-label="${en?"Move up:":"Monter"} ${E(label)}">↑</button><button type="button" data-order="${E(configKey)}" data-index="${index}" data-direction="1" ${index===order.length-1?"disabled":""} aria-label="${en?"Move down:":"Descendre"} ${E(label)}">↓</button></div></div>`;
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
    _alignmentSelect(current,attr) {
      const align = badgeAlign(current);
      return `<label>Alignement<select ${attr}>
        <option value="auto" ${align==="auto"?"selected":""}>Automatique (selon le titre)</option>
        <option value="left" ${align==="left"?"selected":""}>Gauche</option>
        <option value="center" ${align==="center"?"selected":""}>Centre</option>
        <option value="right" ${align==="right"?"selected":""}>Droite</option>
      </select></label>`;
    }
    _colorInput(label,color,attr,disabled=false) {
      return `<label>${E(label)}<input type="color" ${attr} value="${E(validColor(color))}" ${disabled ? "disabled" : ""}></label>`;
    }
    _normalColorEditor(color, attr) {
      return `<div class="badge-color"><label>Couleur normale<select ${attr}>` +
        `<option value="inherit" ${color ? "" : "selected"}>Palette par défaut</option>` +
        `<option value="custom" ${color ? "selected" : ""}>Couleur particulière</option></select></label>` +
        this._colorInput("Couleur normale personnalisée",color,attr,!color)+`</div>`;
    }
    _technicalPreview() {
      const c = this._config;
      const en = techEnglish(this._hass);
      const palette = legacyTechnical(c) ? streamPalette(this,c.accent_color_mode,c.accent_custom_color,"plex") : null;
      const example = {resolution:"4K", source_video_width:3840, source_video_height:2160,
        source_video_details:{dynamicRange:"HDR10+"}, source_video_codec:"HEVC",
        source_audio_codec:"eac3", source_audio_details:{atmos:true}, source_audio_channels:8,
        transcode_info:{sourceContainer:"mkv",streamContainer:"mp4"}, is_transcode:true,
        video_decision:"transcode", audio_decision:"transcode", stream_audio_details:{channels:2},
        stream_video_codec:"h264", stream_video_codec_display:"H.264", stream_audio_codec:"aac", stream_audio_codec_display:"AAC",
        stream_video_details:{width:1920,height:1080}};
      return `<div class="tech-preview${c.stream_surface === "blur" ? " surface-blur" : ""}"${palette ? ` style="--pill-bg:${palette.bg};--pill-text:${palette.text}"` : ""}>${
        metaMarkup(renderTechnical(example,c,c.show_bitrate ? 4200 : null,en),c.footer_field_order) ||
        `<small>${en ? "No visible technical information" : "Aucune information technique visible"}</small>`}</div>`;
    }
    _technicalEditor() {
      const c = this._config, en = techEnglish(this._hass);
      const t = (fr,eng) => en ? eng : fr;
      const labels = Object.fromEntries(TECH_FIELDS.map(key => [key,TECH_LABELS[key][Number(en)]]));
      const order = this._orderEditor("technical_badge_order",TECH_FIELDS,labels,
        (key,label) => `<label class="check"><input type="checkbox" ${
          key === "bitrate" ? 'data-field="show_bitrate"' : key === "resolution" && legacyTechnical(c) ? 'data-field="show_quality"' : `data-tech-visible="${key}"`} ${
          techVisible(c,key) ? "checked" : ""}>${E(label)}</label>`,en);
      const colorEditor = c.technical_badge_style === "classic" ? "" :
        `<label class="check"><input type="checkbox" data-field="technical_badge_colors" ${c.technical_badge_colors !== false ? "checked" : ""}>${t("Couleurs par format","Format colors")}</label>` +
        (c.technical_badge_colors === false ? "" : this._subgroup("technical-colors",t("Couleurs avancées","Advanced colors"),
          `<button type="button" class="tech-reset" data-tech-reset="all"${c.technical_badge_custom_colors ? "" : " disabled"}>${t("Réinitialiser toutes les couleurs","Reset all colors")}</button>` +
          TECH_FIELDS.map(key => {
            const formats = [...TECH_FORMATS.values()].filter(format => format.category === key);
            return formats.length ? this._subgroup(`technical-colors-${key}`,labels[key],formats.map(({id,short,name,color}) => {
              const current = c.technical_badge_custom_colors?.[id];
              const full = Array.isArray(name) ? name[Number(en)] : name;
              return this._colorInput(`${short} — ${full}`,current || color,`data-tech-color="${id}"`) +
                `<button type="button" class="tech-reset" data-tech-reset="${id}"${current ? "" : " disabled"}>${t("Réinitialiser","Reset")} ${E(short)}</button>`;
            }).join("")) : "";
          }).join("")));
      return this._select("technical_badge_style",t("Style","Style"),TECH_STYLES.map((key,i) => [key,TECH_STYLE_LABELS[i][Number(en)]])) +
        this._select("technical_badge_layout",t("Disposition","Layout"),[["compact",t("Compacte","Compact")],["separate",t("Séparée","Separate")]]) +
        this._select("technical_transcode_mode",t("Présentation du transcodage","Transcode display"),[
          ...(!c.technical_transcode_mode ? [["",t("Choisir un mode…","Choose a mode…")]] : []),
          ["destination",t("Destination uniquement","Destination only")],
          ["source_to_destination",t("Source → destination","Source → destination")],
        ]) +
        (legacyTechnical(c) ? `<small>${t("Le rendu historique suit l’ordre du bandeau jusqu’à la première personnalisation des catégories.",
          "The legacy display follows the footer order until you customize the categories.")}</small>` : "") +
        this._subgroup("technical-order",t("Informations affichées et ordre","Visible information and order"),
          `<small>${t("Format audio privilégie le format spécifique, sinon le codec. Activez uniquement Codec audio pour voir les codecs sans le format spécifique.",
            "Audio format shows the specific format when known, otherwise the codec. Enable only Audio codec to show codecs without the specific format.")}</small>` + order) + colorEditor +
        `<div class="group-label">${t("Aperçu — exemple transcodé","Preview — transcoding example")}</div>${this._technicalPreview()}`;
    }
    _footerOrderFields() {
      if (legacyTechnical(this._config)) return FOOTER_FIELDS;
      const anchor = normalizedOrder(this._config.footer_field_order,FOOTER_FIELDS).find(key => TECH_FOOTER_FIELDS.includes(key));
      return FOOTER_FIELDS.filter(key => !TECH_FOOTER_FIELDS.includes(key) || key === anchor);
    }
    _metricBadgeEditor() {
      const rows = this._config.header_metric_settings || {};
      const checks = this._checks(HEADER_FIELDS.map(key => [`header_show_${key}`, HEADER_LABELS[key]]));
      return checks + `<small>Ouvrez une statistique pour régler son alignement et son apparence individuellement. Les options non modifiées suivent le style global.</small>` +
        HEADER_FIELDS.map(key => {
          const item = rows[key] || {};
          const content = this._alignmentSelect(item.align,`data-metric-setting="align" data-metric-key="${E(key)}"`) +
            `<label>Nom personnalisé (facultatif)<input type="text" data-metric-setting="label" data-metric-key="${E(key)}" value="${E(item.label || "")}" placeholder="${E(HEADER_LABELS[key])}"></label>`+
            `<div class="columns">` +
              `<label class="check"><input type="checkbox" data-metric-setting="show_name" data-metric-key="${E(key)}" ${(item.show_name ?? this._config.header_show_names) ? "checked" : ""}>Afficher le nom</label>`+
              `<label class="check"><input type="checkbox" data-metric-setting="show_icon" data-metric-key="${E(key)}" ${item.show_icon ? "checked" : ""}>Afficher l'icône</label>`+
              `<label class="check"><input type="checkbox" data-metric-setting="only_positive" data-metric-key="${E(key)}" ${item.only_positive ? "checked" : ""}>Afficher si supérieur à 0</label>`+
              `<label class="check"><input type="checkbox" data-metric-setting="blink_positive" data-metric-key="${E(key)}" ${item.blink_positive ? "checked" : ""}>Clignoter si supérieur à 0</label>`+
            `</div>`+
            `<label>Icône MDI (facultatif)<input type="text" data-metric-setting="icon" data-metric-key="${E(key)}" value="${E(item.icon || "")}" placeholder="${E(HEADER_ICONS[key])}"></label>`+
            `<label>Durée d'un clignotement (secondes)<input type="number" min="0.5" max="20" step="0.5" data-metric-setting="blink_seconds" data-metric-key="${E(key)}" value="${E(item.blink_seconds ?? this._config.header_blink_seconds)}"></label>`+
            this._normalColorEditor(item.normal_custom_color,`data-metric-setting="normal_custom_color" data-metric-key="${E(key)}"`)+
            `<label>Couleur si valeur à zéro<select data-metric-setting="zero_color_mode" data-metric-key="${E(key)}"><option value="inherit" ${item.zero_color_mode!=="custom"?"selected":""}>Réglage global</option><option value="custom" ${item.zero_color_mode==="custom"?"selected":""}>Couleur particulière</option></select></label>`+
            `<label>Couleur personnalisée à zéro<input type="color" data-metric-setting="zero_custom_color" data-metric-key="${E(key)}" value="${E(validColor(item.zero_custom_color || "#576574"))}"></label>`;
          return this._subgroup(`metric-${key}`, HEADER_LABELS[key], content);
        }).join("");
    }
    _entityBadgeEditor() {
      const rows = this._config.header_entity_badges || [];
      return `<small>Ajoutez une entité, puis ouvrez sa fiche pour modifier ses options.</small>`+
        rows.map((row,index) => this._subgroup(`entity-${row.id}`,
          `${row.label || row.entity || 'Nouveau badge'}${row.entity ? ' · '+row.entity : ''}`,
          `<div class="badge-row" data-badge-row="${index}">`+
          `<label>Entité<ha-entity-picker data-badge-index="${index}" aria-label="Choisir une entité"></ha-entity-picker></label>`+
          `<label>Nom facultatif<input type="text" data-badge-label="${index}" placeholder="Nom de l'entité" value="${E(row.label || "")}"></label>`+
          this._alignmentSelect(row.align,`data-badge-setting="align" data-badge-index="${index}"`)+
          `<div class="columns">`+
            `<label class="check"><input type="checkbox" data-badge-setting="show_name" data-badge-index="${index}" ${(row.show_name ?? this._config.header_show_names) ? "checked" : ""}>Afficher le nom</label>`+
            `<label class="check"><input type="checkbox" data-badge-setting="show_icon" data-badge-index="${index}" ${row.show_icon ? "checked" : ""}>Icône de l'entité</label>`+
            `<label class="check"><input type="checkbox" data-badge-setting="only_positive" data-badge-index="${index}" ${row.only_positive ? "checked" : ""}>Afficher si supérieur à 0</label>`+
            `<label class="check"><input type="checkbox" data-badge-setting="blink_positive" data-badge-index="${index}" ${row.blink_positive ? "checked" : ""}>Clignoter si supérieur à 0</label>`+
          `</div>`+
          `<label>Durée d'un clignotement (secondes)<input type="number" min="0.5" max="20" step="0.5" data-badge-setting="blink_seconds" data-badge-index="${index}" value="${E(row.blink_seconds ?? this._config.header_blink_seconds)}"></label>`+
          this._normalColorEditor(row.normal_custom_color,`data-badge-setting="normal_custom_color" data-badge-index="${index}"`)+
          `<label>Couleur si valeur à zéro<select data-badge-setting="zero_color_mode" data-badge-index="${index}"><option value="inherit" ${row.zero_color_mode !== "custom" ? "selected" : ""}>Réglage global</option><option value="custom" ${row.zero_color_mode === "custom" ? "selected" : ""}>Couleur particulière</option></select></label>`+
          `<label>Couleur personnalisée à zéro<input type="color" data-badge-setting="zero_custom_color" data-badge-index="${index}" value="${E(validColor(row.zero_custom_color || "#576574"))}"></label>`+
          `<button class="remove-badge" type="button" data-badge-remove="${index}" aria-label="Supprimer le badge">Supprimer</button>`+
          `</div>`)).join("")+
        `<button type="button" class="add-badge" data-badge-add ${rows.length>=20?"disabled":""}>+ Ajouter un badge</button>`;
    }
    render() {
      const c=this._config;
      const entries=this._payload.entries||[];
      const selected=entries.find(e=>e.id===c.entry_id)||entries[0];
      const servers=[...new Map((selected?.servers||[]).map(s=>[s.server_id,[s.server_id,s.server_name]])).values()];
      const users=[...new Set((selected?.streams||[]).map(s=>s.username).filter(Boolean))].sort();
      const isIndividual=c.type==="custom:tracearr-stream-card";
      const streams=selected?.streams||[];
      const accounts=[...new Map(streams.filter(s=>s.username && s.server_id).map(s=>
        [`${s.server_id}:${s.username}`,[`${s.server_id}:${s.username}`,`${s.server_name||s.server_type} · ${s.username}`]])).values()];
      const sessionChoices=[...streams.map(s=>[s.id,`${s.server_name||s.server_type} · ${s.username} — ${s.show_title ? s.show_title + ' / ' : ''}${s.media_title}`])];
      // Keep stored targets selectable even after the session has ended.
      const withSaved=(choices,value,label)=>value && !choices.some(([id])=>String(id)===String(value))
        ? [...choices,[value,label]] : choices;
      const source=this._select("entry_id","Instance Tracearr",[["","Automatique (première instance)"],...entries.map(e=>[e.id,e.name])])+
        (isIndividual ?
          this._select("selection","Quelle lecture afficher ?",[
            ["recent","Dernière lecture active"],["account","Lecture d'un utilisateur"],
            ["server","Lecture d'un serveur"],["stream","Session en cours précise"]])+
          this._select("selected_account","Utilisateur (continue sur ses prochains films)",[["","Choisir un utilisateur"],
            ...withSaved(accounts,c.selected_account,"Utilisateur précédemment choisi")])+
          this._select("selected_server","Serveur",[["","Choisir un serveur"],
            ...withSaved(servers,c.selected_server,"Serveur précédemment choisi")])+
          this._select("stream_id","Session active (disparaît quand elle se termine)",[["","Choisir une lecture"],
            ...withSaved(sessionChoices,c.stream_id,"Session précédemment choisie (terminée)")])+
          `<small>Choisis une cible ci-dessus ; seuls les champs du mode sélectionné sont utilisés. Pour une carte permanente, privilégie un utilisateur plutôt qu'un ID de session temporaire.</small>`
        : "")+
        this._select("filter_server","Filtrer par serveur",[["","Tous les serveurs"],...servers])+
        this._select("filter_user","Filtrer par utilisateur",[["","Tous les utilisateurs"],...users.map(u=>[u,u])])+
        this._select("filter_transcode","Mode de lecture",[["all","Tous"],["direct","Direct"],["video","Vidéo seule"],["audio","Audio seul"],["both","Vidéo et audio"],["unknown","Inconnu"]])+
        this._select("sort","Ordre des flux",[["recent","Plus récent d'abord"],["user","Utilisateur"],["server","Serveur"]]);
      // Keep the visibility switches, and expose optional per-metric settings below.
      const headerMetrics=this._metricBadgeEditor();
      const headerCommon=this._checks([
        ["header_show_names","Afficher les noms des statistiques"],
        ["header_positive_only","Masquer les badges à zéro"],
        ["header_blink_positive","Clignoter si la valeur est positive"],
      ])+
        this._number("header_blink_seconds","Période de clignotement (secondes)",0.5,20)+
        this._select("header_badge_color_mode","Couleur des badges",[["inherit","Palette globale"],["theme","Thème Home Assistant"],["server","Couleur du serveur"],["custom","Personnalisée"]])+
        `<label>Couleur personnalisée<input type="color" data-field="header_badge_custom_color" value="${E(validColor(c.header_badge_custom_color))}"></label>`+
        this._select("header_zero_color_mode","Couleur à zéro",[["normal","Palette normale"],["custom","Personnalisée"]])+
        `<label>Couleur personnalisée à zéro<input type="color" data-field="header_zero_custom_color" value="${E(validColor(c.header_zero_custom_color))}"></label>`;
      const header=this._toggle("show_header","Afficher l'en-tête")+
        `<label>Titre<input type="text" data-field="title" placeholder="Lectures en cours" value="${E(c.title||"")}"></label>`+
        this._toggle("show_title","Afficher le titre")+
        this._subgroup("metrics","Statistiques Tracearr",headerMetrics)+
        this._subgroup("entities","Badges d'entités Home Assistant",this._entityBadgeEditor())+
        this._subgroup("shared-badges","Style et comportement communs aux badges",headerCommon)+
        this._subgroup("badge-order","Ordre des badges",this._headerOrderEditor());

      const carousel=this._checks([
          ["carousel_autoplay","Défilement automatique"],["carousel_show_arrows","Flèches de navigation"],
          ["carousel_mouse_drag","Glissement à la souris"],["carousel_pause_on_hover","Pause au survol"],
        ])+
        `<div class="columns">${this._number("carousel_visible","Nombre de flux visibles",1,4)}${this._number("carousel_interval","Intervalle (secondes)",3,120)}</div>`+
        this._select("carousel_transition","Transition",[["slide","Glissement"],["fade","Fondu"],["zoom","Zoom"],["flip","Retournement 3D"],["none","Sans animation"]])+
        this._number("carousel_transition_speed","Durée de transition (ms)",100,3000)+
        `<small>Barre horizontale masquée. Navigation tactile toujours disponible.</small>`;
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
      const footerFields = this._footerOrderFields();
      const footerLabels = legacyTechnical(c) ? FOOTER_LABELS :
        {...FOOTER_LABELS,[footerFields.find(key => TECH_FOOTER_FIELDS.includes(key))]:techEnglish(this._hass) ? "Technical badges" : "Badges techniques"};
      const footer=this._checks([
        ["show_server","Nom du serveur"],["show_device","Appareil / lecteur"],
        ["show_health","État du serveur"],
      ])+`<small>Ordre des informations du bandeau (champs masqués inclus) :</small>`+
        this._orderEditor("footer_field_order", footerFields, footerLabels);
      const network=this._select("bitrate_scope","Débits à afficher (sur les flux et dans l'en-tête)",[
          ["both","Tous les débits"],["local","Flux locaux uniquement"],["remote","Flux distants uniquement"]])+
        `<label>Exceptions pour cette carte (facultatif, priorité sur les réglages de l’intégration)<textarea data-field="network_locations" placeholder="plex:alice=remote&#10;device:Apple TV=local">${E(c.network_locations||"")}</textarea></label>`+
        `<small>Les affectations globales se configurent dans Paramètres → Appareils et services → Tracearr HA → Configurer → Localisation des appareils. Ici, vous pouvez ajouter des exceptions : serveur:utilisateur=local/remote, device:Nom=local/remote, player:Nom=local/remote ou utilisateur=local/remote. Les flux sans correspondance restent inconnus et ne sont pas comptés en mode local/distant.</small>`;
      const globalDisplay=(isIndividual ? "" :
        this._select("mode","Disposition",[["list","Liste verticale"],["carousel","Carrousel"]]))+
        this._checks([
        ["compact","Mode compact"],["show_paused","Inclure les lectures en pause"],
        ["show_poster","Affiche"],["show_avatar","Avatar"],
         ["show_progress","Progression"],["show_remaining","Temps restant"],
        ["show_end_time","Fin de lecture estimée"],["show_transcode_icons","Icônes vidéo/audio"],
      ])+
        this._select("stream_surface","Fond intérieur des lectures",[["soft","Légèrement contrasté"],["transparent","Transparent"],["blur","Affiche floutée (cinéma)"]])+
        `<small>Le fond cinéma utilise l'affiche du média et reste sombre pour préserver la lisibilité. Sans affiche, le fond reste uni.</small>`+
        this._range("stream_blur","Intensité du flou",0,50,"px")+
        this._range("stream_overlay","Assombrissement du fond",25,95,"%")+
        this._select("stream_accent_style","Style du liseré gauche",[["rounded","Arrondi (suit les coins)"],["straight","Trait droit (ancien style)"],["none","Masqué"]])+
        this._range("stream_accent_width","Épaisseur du liseré",2,8,"px")+
        this._number("font_size","Taille du texte (px)",10,28)+
        this._number("poster_size","Taille de l\'affiche (%)",50,200)+
        `<small>100 % correspond à la taille actuelle. Le réglage s\'applique aussi au mode compact.</small>`+
        this._select("empty_mode","En l'absence de lecture",[["message","Message personnalisé"],["header_only","En-tête uniquement"],["hide","Masquer la carte"]])+
        `<label>Message sans lecture<input type="text" data-field="empty_message" value="${E(c.empty_message??"Aucune lecture en cours")}"></label>`+
        this._select("accent_color_mode","Palette globale des couleurs",[["theme","Thème Home Assistant"],["server","Couleur de Plex / Jellyfin / Emby"],["custom","Personnalisée"]])+
        `<label>Couleur globale personnalisée<input type="color" data-field="accent_custom_color" value="${E(validColor(c.accent_custom_color))}"></label>`+
        `<small>La hauteur et la largeur se règlent uniquement dans l'onglet Mise en page de Home Assistant. Les couleurs propres aux badges restent prioritaires sur la palette globale.</small>`;
      const usersSection=`<label>Alias propres à cette carte<textarea data-field="aliases">${E(c.aliases||"")}</textarea></label>`+
        `<label>Avatars propres à cette carte (URLs HTTPS)<textarea data-field="avatars">${E(c.avatars||"")}</textarea></label>`+
        `<small>Pour modifier tous les utilisateurs, utilisez la liste dans Paramètres → Appareils et services → Tracearr HA → Configurer.</small>`;
      this.shadowRoot.innerHTML=`<style>${editorStyle}${technicalStyle}</style><div class="editor">${[
        this._group("global","Affichage général",globalDisplay),
        this._group("source","Choix des lectures et filtres",source),
        ...(!isIndividual ? [this._group("carousel","Navigation et carrousel",carousel)] : []),
        this._group("header","En-tête et badges",header),
        this._group("media","Titres, saisons et années",media),
        this._group("footer","Bandeau d'informations du flux",footer),
        this._group("technical",techEnglish(this._hass) ? "Technical badges" : "Badges techniques",this._technicalEditor()),
        this._group("network","Débit local / distant",network),
        this._group("users","Réglages avancés par carte",usersSection),
      ].join("")}</div>`;
      this.shadowRoot.querySelectorAll("[data-field]").forEach(el => {
        const name=el.dataset.field;
        if (el.tagName==="SELECT") el.value=String(c[name]??"");
        const fn=()=>{
          const value=el.type==="checkbox" ? el.checked :
            (el.type==="number" || el.type==="range") ? Number(el.value) : el.value;
          this._config={...this._config,[name]:value};
          if (name.startsWith("technical_") || name === "show_bitrate" || name === "show_quality") {
            this._updateTechnicalEditor(`[data-field="${name}"]`);
          } else {
            if (["stream_surface","accent_color_mode","accent_custom_color"].includes(name)) this._refreshTechnicalPreview();
            this._emit();
          }
        };
        el.addEventListener("change",fn);
        if (el.type === "range") el.addEventListener("input", () => {
          const output = this.shadowRoot.querySelector(`[data-range-output="${name}"]`);
          if (output) output.textContent = `${el.value} ${name === "stream_overlay" ? "%" : "px"}`;
        });
      });
      this.shadowRoot.querySelectorAll("[data-tech-visible]").forEach(input => input.addEventListener("change",() => {
        const key = input.dataset.techVisible;
        this._config = {...this._config,technical_badge_visibility:{...this._config.technical_badge_visibility,[key]:input.checked}};
        this._updateTechnicalEditor(`[data-tech-visible="${key}"]`);
      }));
      this.shadowRoot.querySelectorAll("[data-tech-color]").forEach(input => {
        const key = input.dataset.techColor;
        input.addEventListener("input",() => {
          const color = optionalColor(input.value);
          if (!color) return;
          const saved = this._config;
          this._config = {...saved,technical_badge_custom_colors:{...saved.technical_badge_custom_colors,[key]:color}};
          this._refreshTechnicalPreview();
          this._config = saved;
        });
        input.addEventListener("change",() => {
          const color = optionalColor(input.value);
          if (!color) return;
          this._config = {...this._config,technical_badge_custom_colors:{...this._config.technical_badge_custom_colors,[key]:color}};
          this._updateTechnicalEditor(`[data-tech-color="${key}"]`);
        });
      });
      this.shadowRoot.querySelectorAll("[data-tech-reset]").forEach(btn => btn.addEventListener("click",() => {
        const key = btn.dataset.techReset;
        const colors = key === "all" ? {} : {...this._config.technical_badge_custom_colors};
        delete colors[key];
        this._config = {...this._config,technical_badge_custom_colors:colors};
        this._updateTechnicalEditor(key === "all" ? '[data-subdetail="technical-colors"] > summary' : `[data-tech-color="${key}"]`);
      }));
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
      this.shadowRoot.querySelectorAll("[data-metric-setting],[data-badge-setting]").forEach(input => {
        const metric = input.dataset.metricSetting !== undefined;
        const field = metric ? input.dataset.metricSetting : input.dataset.badgeSetting;
        input.addEventListener("change", () => {
          let value = input.type === "checkbox" ? input.checked :
            input.type === "number" ? clamp(input.value,.5,20,2) : input.value;
          if (field === "normal_custom_color" && input.tagName === "SELECT") {
            const picker = input.closest(".badge-color").querySelector("input");
            if (value === "custom") {
              picker.disabled = false;
              value = picker.value;
            } else {
              picker.disabled = true;
              picker.value = validColor(undefined);
              value = undefined;
            }
          }
          const update = row => {
            const next = {...row};
            if (value === undefined) delete next[field];
            else next[field] = value;
            return next;
          };
          if (metric) {
            const key = input.dataset.metricKey;
            if (!HEADER_FIELDS.includes(key)) return;
            const settings = {...this._config.header_metric_settings};
            settings[key] = update(settings[key]);
            this._config = {...this._config,header_metric_settings:settings};
          } else {
            const rows = [...this._config.header_entity_badges];
            const index = Number(input.dataset.badgeIndex);
            if (!rows[index]) return;
            rows[index] = update(rows[index]);
            this._config = {...this._config,header_entity_badges:rows};
          }
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
          key==="footer_field_order" ? footerFields :
          key==="technical_badge_order" ? TECH_FIELDS :
          [...HEADER_FIELDS, ...(this._config.header_entity_badges || []).map(row => `entity:${row.id}`)];
        const order=normalizedOrder(this._config[key],allowed);
        const index=Number(btn.dataset.index), next=index+Number(btn.dataset.direction);
        if (index<0 || index>=order.length || next<0 || next>=order.length) return;
        [order[index],order[next]]=[order[next],order[index]];
        let savedOrder = order;
        if (key === "footer_field_order" && allowed !== FOOTER_FIELDS) {
          // Keep the other legacy slots saved but after the chosen group
          // anchor, so they cannot take its place when it moves down.
          let i = 0;
          const anchor = allowed.find(field => TECH_FOOTER_FIELDS.includes(field));
          const previous = normalizedOrder(this._config[key],FOOTER_FIELDS);
          savedOrder = previous.map(field => allowed.includes(field) ? order[i++] : field);
          const earlier = savedOrder.slice(0,savedOrder.indexOf(anchor)).filter(field => !allowed.includes(field));
          savedOrder = savedOrder.filter(field => !earlier.includes(field));
          savedOrder.splice(savedOrder.indexOf(anchor)+1,0,...earlier);
        }
        this._config={...this._config,[key]:savedOrder.join(",")};
        if (key === "technical_badge_order") {
          this._updateTechnicalEditor(`[data-order="${key}"][data-index="${next}"]:not(:disabled)`);
          return;
        }
        this._captureOpenSections();
        this.render();
        this._emit();
      }));
    }
    _refreshTechnicalPreview() {
      const preview = this.shadowRoot.querySelector(".tech-preview");
      if (preview) preview.outerHTML = this._technicalPreview();
    }
    _updateTechnicalEditor(focus) {
      this._captureOpenSections();
      this._config = {...this._config};
      normalizeTechnical(this._config);
      this.render();
      this.shadowRoot.querySelector(focus)?.focus();
      this._emit();
    }
  }
  customElements.define("tracearr-streams-card",TracearrStreamsCard);
  customElements.define("tracearr-stream-card",TracearrStreamCard);
  customElements.define("tracearr-card-editor",TracearrCardEditor);
  window.customCards=window.customCards||[];
  for (const [type,name,description] of [
    ["tracearr-streams-card","Tracearr – Lectures en cours","Liste ou carrousel des flux Plex, Jellyfin et Emby"],
    ["tracearr-stream-card","Tracearr – Lecture individuelle","Un seul flux Tracearr, à afficher séparément"],
  ]) if (!window.customCards.some(card=>card.type===type)) window.customCards.push({type,name,description,preview:false});
})();
