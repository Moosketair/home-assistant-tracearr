/* Test carousel behavior against the actual browser-side custom element without third-party dependencies. */
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');

const classes = new Map();
let time = 0, nextId = 0;
const timers = new Map();
const frames = new Map();
class MockHTMLElement {
  attachShadow() {
    this.shadowRoot = {
      content: '', renders: 0,
      get innerHTML() { return this.content; },
      set innerHTML(value) { this.content = value; this.renders += 1; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
    this.style = {};
    return this.shadowRoot;
  }
  matches() { return false; }
}
const env = {
  HTMLElement: MockHTMLElement,
  customElements: {define(name, cls) { classes.set(name, cls); }, get(name) { return classes.get(name); }},
  window: {customCards: [], matchMedia() { return {matches: false}; }},
  document: {hidden: false, createElement() { return {}; }},
  setInterval(fn, duration) { const id = ++nextId; timers.set(id, {fn, duration}); return id; },
  clearInterval(id) { timers.delete(id); },
  requestAnimationFrame(fn) { const id = ++nextId; frames.set(id, fn); return id; },
  cancelAnimationFrame(id) { frames.delete(id); },
  performance: {now: () => time},
  Date, URL, CSS: {escape: text => text}, console,
};
const source = readFileSync(join(__dirname, '..', 'custom_components', 'tracearr_ha', 'frontend', 'tracearr-card.js'), 'utf8');
vm.runInNewContext(source, env);
const Card = classes.get('tracearr-streams-card');
assert.ok(Card, 'Lovelace custom element registered');

function setup({count=3, visible=1, effect='none', duration=600}={}) {
  const card = new Card();
  const animations = [];
  const cards = Array.from({length:count}, (_,i) => ({
    offsetLeft: i * 110,
    getBoundingClientRect() { return {width:100}; },
    animate(keyframes, opts) { animations.push({card:i, keyframes, opts}); },
  }));
  const listeners = [];
  const carousel = {
    cards, style: {}, scrollLeft: 0, clientWidth: visible*110-10,
    querySelectorAll(selector) { return selector === '.stream' ? cards : []; },
    addEventListener(event, fn) { listeners.push({event, fn}); },
  };
  card.isConnected = true;
  card._config = {...card._config, mode:'carousel', carousel_visible:visible,
    carousel_transition:effect, carousel_transition_speed:duration, carousel_autoplay:true};
  card.shadowRoot.querySelector = selector => {
    if (selector === '.streams.carousel') return carousel;
    if (selector === 'ha-card') return card.shadowRoot.renders ? {} : null;
    return null;
  };
  return {card,carousel,cards,animations,listeners};
}
function flushFrame(at) {
  time = at;
  const jobs = [...frames.values()];
  frames.clear();
  for (const job of jobs) job(time);
}

test('autoplay advances through all items and wraps to first (instead of jumping back)', () => {
  const {card, carousel} = setup({count:3});
  card._setTimers();
  const timer = [...timers.values()].find(t => t.duration === 7000);
  assert.ok(timer, 'autoplay timer configured');
  for (const [index, left] of [[1,110],[2,220],[0,0],[1,110]]) {
    timer.fn();
    assert.equal(card._carouselIndex, index);
    assert.equal(carousel.scrollLeft, left);
  }
  card.disconnectedCallback();
});

test('carousel honors multiple visible slides and wraps only after last complete view', () => {
  const {card,carousel} = setup({count:4, visible:2});
  for (const index of [1,2,0]) {
    card._scroll(1);
    assert.equal(card._carouselIndex, index);
    assert.equal(carousel.scrollLeft, index*110);
  }
  card._scroll(-1);
  assert.equal(card._carouselIndex, 2);
});

test('transition effects fade, zoom and 3D flip use configured duration', () => {
  for (const effect of ['fade','zoom','flip']) {
    const {card,animations} = setup({count:3, visible:2, effect, duration:1250});
    card._scroll(1);
    assert.equal(card._carouselIndex, 1);
    assert.equal(animations.length,2);
    assert.equal(animations[0].opts.duration,1250);
    assert.ok(animations[0].keyframes[0].opacity < 1);
  }
});

test('slide transition animates scroll at chosen speed', () => {
  time = 0;
  const {card,carousel} = setup({count:3, effect:'slide',duration:600});
  card._scroll(1);
  assert.equal(card._carouselAnimating,true);
  flushFrame(300);
  assert.ok(carousel.scrollLeft > 0 && carousel.scrollLeft < 110);
  flushFrame(600);
  assert.equal(carousel.scrollLeft,110);
  assert.equal(card._carouselAnimating,false);
  assert.equal(carousel.style.scrollSnapType,'');
});

test('progress-only SSE updates preserve carousel DOM, index and scroll position', () => {
  time = 0;
  const {card,carousel} = setup({count:2});
  const stream = {id:'s1', username:'Alice',server_id:'x',server_name:'Plex',server_type:'plex',media_type:'movie',
    media_title:'Test',state:'playing',started_at:'2026-11-03T10:00:00Z',progress_ms:1000,duration_ms:100000};
  const entry = {id:'tracearr',connected:true,streams:[stream],stats:{total:1},servers:[]};
  card._payload = {entries:[entry]};
  card._config = {...card._config, mode:'carousel',carousel_visible:1,show_poster:false,show_avatar:false};
  card.render();
  const before = card.shadowRoot.renders;
  card._carouselIndex = 1;
  carousel.scrollLeft = 110;
  time = 2000;
  stream.progress_ms = 2800; // slightly stale compared to 3000ms local clock
  card.render();
  assert.equal(card.shadowRoot.renders,before);
  assert.equal(card._carouselIndex,1);
  assert.equal(carousel.scrollLeft,110);
  assert.ok(card._positions.get('s1').progress >= 2950, 'SSE does not reset playback to stale position');
});

test('stream left-edge colors match Plex, Jellyfin and Emby brand themes', () => {
  const {card} = setup();
  card._config = {...card._config,show_poster:false,show_avatar:false};
  for (const [server,color] of [['plex','#E5A00D'],['jellyfin','#AA5CC3'],['emby','#52B54B']]) {
    const html = card._streamCard(null,{id:'1', username:'x', server_type:server,
      media_title:'Movie', media_type:'movie',state:'playing',progress_ms:0,duration_ms:10000});
    assert.ok(html.includes(`--stream-accent:${color}`), `${server} has its own accent`);
  }
});

test('carousel never renders a native scroll bar, even with an old saved false value', () => {
  const {card} = setup();
  card._config = {...card._config, mode:'carousel',carousel_hide_scrollbar:false,show_poster:false,show_avatar:false};
  card.render();
  assert.match(card.shadowRoot.innerHTML, /streams carousel/);
  assert.match(card.shadowRoot.innerHTML, /\.streams\.carousel::\-webkit-scrollbar \{ display:none/);
  assert.match(card.shadowRoot.innerHTML, /scrollbar-width:none/);
});


test('responsive carousel advances even when CSS displays one item on narrow cards', () => {
  const {card,carousel} = setup({count:3, visible:2});
  carousel.clientWidth = 100; // container query collapses to a single visible card
  card._scroll(1);
  card._scroll(1);
  assert.equal(card._carouselIndex,2);
  assert.equal(carousel.scrollLeft,220);
  card._scroll(1);
  assert.equal(card._carouselIndex,0);
});

test('autoplay remains active while hovering unless pause on hover is opted in', () => {
  const {card} = setup({count:3});
  card.matches = () => true;
  card._setTimers();
  const timer = [...timers.values()].find(t => t.duration === 7000);
  timer.fn();
  assert.equal(card._carouselIndex, 1);
  card._config.carousel_pause_on_hover = true;
  timer.fn();
  assert.equal(card._carouselIndex, 1);
  card.disconnectedCallback();
});


test('video and audio icons indicate independent direct, transcode or unknown states', () => {
  const {card} = setup();
  card._config = {...card._config,show_poster:false,show_avatar:false};
  const base = {id:'abc', username:'x', server_type:'plex',media_title:'Film',media_type:'movie',state:'playing',progress_ms:0,duration_ms:10000};
  let html=card._streamCard(null,{...base,video_decision:'directplay',audio_decision:'transcode',is_transcode:true});
  assert.match(html, /stream-indicator direct.*Vidéo : Lecture directe/s);
  assert.match(html, /stream-indicator transcode.*Audio : Transcodage/s);
  assert.doesNotMatch(html, /chip.*Transcode vidéo/);
  html=card._streamCard(null,{...base,video_decision:null,audio_decision:'copy'});
  assert.match(html, /stream-indicator unknown.*Vidéo : Inconnu/s);
  assert.match(html, /stream-indicator direct.*Audio : Lecture directe/s);
  card._config.show_transcode_icons=false;
  html=card._streamCard(null,{...base,video_decision:'transcode',audio_decision:'transcode'});
  assert.doesNotMatch(html,/media-flags/);
});

test('paused stream overlays poster and replaces remaining time with orange En pause', () => {
  const {card} = setup();
  card._config = {...card._config,show_poster:true,show_avatar:false,show_progress:true,show_remaining:true};
  // Set up fake image proxy avoiding external calls.
  card._image = (_,__,kind)=>kind==='poster'?'https://example.com/affiche.png':'';
  const base = {id:'abc', username:'x', server_type:'plex',media_title:'Film',media_type:'movie',state:'paused',progress_ms:20000,duration_ms:100000};
  let html=card._streamCard(null,base);
  assert.match(html, /poster-paused/);
  assert.match(html, /pause-symbol/);
  assert.match(html, /class="time-paused">En pause/);
  assert.doesNotMatch(html,/class="time-remaining"/);
  assert.doesNotMatch(html,/class="stream paused"/);
  card._config.show_remaining=false;
  html=card._streamCard(null,base);
  assert.match(html,/class="time-paused">En pause/);
  card._config.show_remaining=true;
  html=card._streamCard(null,{...base,state:'playing'});
  assert.doesNotMatch(html,/poster-paused/);
  assert.match(html,/class="time-remaining"/);
});

test('global palette styles progress and quality badges using theme, server or custom color', () => {
  const {card} = setup();
  card._config = {...card._config,show_poster:false,show_avatar:false,show_quality:true,show_bitrate:true};
  const s={id:'x', username:'x', server_type:'jellyfin',resolution:'4K',bitrate:12000,
    media_title:'Film',media_type:'movie',state:'playing',progress_ms:0,duration_ms:10000};
  let html=card._streamCard(null,s);
  assert.match(html, /--shared-accent:var\(--accent-color,#00BCD4\)/);
  assert.match(html, /--pill-bg:var\(--accent-color,#00BCD4\)/);
  assert.match(html, /--pill-text:#000000/);
  assert.match(html, /class="chip">4K/);
  assert.match(html, /class="chip">12\.0 Mb\/s/);
  card._config.accent_color_mode='server';
  html=card._streamCard(null,s);
  assert.match(html, /--shared-accent:#AA5CC3/);
  assert.match(html, /--pill-text:#000000/); // contrast on Jellyfin violet is slightly better with black
  html=card._streamCard(null,{...s,server_type:'plex'});
  assert.match(html, /--shared-accent:#E5A00D/);
  assert.match(html, /--pill-text:#000000/);
  card._config.accent_color_mode='custom';
  card._config.accent_custom_color='#101820';
  html=card._streamCard(null,s);
  assert.match(html, /--shared-accent:#101820/);
  assert.match(html, /--pill-text:#FFFFFF/);
  card._config.accent_custom_color='#ffed00';
  html=card._streamCard(null,s);
  assert.match(html, /--pill-text:#000000/);
  card._config.accent_custom_color='red;background:url(https://bad.example)';
  html=card._streamCard(null,s);
  assert.match(html, /--shared-accent:#00BCD4/);
  assert.doesNotMatch(html,/bad\.example/);
});

test('header metrics are configurable independently and count only visible sessions', () => {
  const {card}=setup();
  const streams=[
    {id:'1',server_id:'p',server_name:'Plex',server_type:'plex',is_transcode:true,video_decision:'transcode',audio_decision:'copy',bitrate:5000,state:'playing'},
    {id:'2',server_id:'p',server_name:'Plex',server_type:'plex',video_decision:'directplay',audio_decision:'directplay',bitrate:3000,state:'paused'},
    {id:'3',server_id:'j',server_name:'Jellyfin',server_type:'jellyfin',is_transcode:true,video_decision:'transcode',audio_decision:'transcode',bitrate:4000,state:'playing'},
  ];
  card._config={...card._config,title:'Activité multimédia',
    show_header:true, header_show_streams:true,header_show_bandwidth:true,header_show_server_counts:true,
    header_show_video:true,header_show_both:true,header_show_audio:false,header_show_paused:false};
  const html=card._header(streams);
  for(const fragment of ['Activité multimédia','3 flux','Débit : 12.0 Mb/s','Vidéo : 1','Vidéo + audio : 1','Plex : 2','Jellyfin : 1']) {
    assert.ok(html.includes(fragment),fragment);
  }
  assert.doesNotMatch(html, /Audio : 0|Pause : 1/);
  card._config.show_header=false;
  assert.equal(card._header(streams),'');
  card._config.show_header=true;card._config.show_title=false;
  assert.doesNotMatch(card._header(streams),/Activité multimédia/);
});

test('server metrics use server-specific color and custom header colors apply globally', () => {
  const {card}=setup();
  const streams=[{server_id:'p',server_type:'plex',server_name:'Plex',video_decision:'directplay',audio_decision:'directplay'}];
  card._config={...card._config,accent_color_mode:'server',header_show_server_counts:true};
  assert.match(card._header(streams),/Plex : 1/);
  assert.match(card._header(streams),/--pill-bg:#E5A00D;--pill-text:#000000/);
  card._config.accent_color_mode='custom';card._config.accent_custom_color='#001122';
  assert.match(card._header(streams),/--pill-bg:#001122;--pill-text:#FFFFFF/);
});

test('legacy color and summary settings are migrated, and new options win', () => {
  const {card}=setup();
  card.setConfig({show_counter:false,show_transcodes:true,progress_color_mode:'server'});
  assert.equal(card._config.header_show_streams,false);
  assert.equal(card._config.header_show_video,true);
  assert.equal(card._config.header_show_transcodes_total,true);
  assert.equal(card._config.accent_color_mode,'server');
  card.setConfig({accent_color_mode:'custom',accent_custom_color:'#121212',
    progress_color_mode:'server',header_show_video:false,show_transcodes:true});
  assert.equal(card._config.accent_color_mode,'custom');
  assert.equal(card._config.header_show_video,false);
});

test('native ha-card surface, nested stream panel and centered poster survive wrapped footer', () => {
  const {card}=setup();
  card._config={...card._config,show_poster:false,show_avatar:false};
  card.render();
  const html=card.shadowRoot.innerHTML;
  assert.match(html,/ha-card \{ border-radius:var\(--ha-card-border-radius/);
  assert.doesNotMatch(html,/background:transparent!important/);
  assert.match(html,/\.stream \{ position:relative; display:flex; align-items:center/);
  assert.match(html,/\.poster-wrap \{[^}]*align-self:center/s);
  assert.match(html,/\.meta \{[^}]*flex-wrap:wrap/s);
  card._config.stream_surface='transparent';card._renderFingerprint=null;card.render();
  assert.match(card.shadowRoot.innerHTML,/flat-streams/);
});

test('visual editor groups settings by header, stream, footer and shared palette', () => {
  const Editor=classes.get('tracearr-card-editor');
  const editor=new Editor();
  editor.setConfig({type:'custom:tracearr-streams-card'});
  const html=editor.shadowRoot.innerHTML;
  for(const title of ['En-tête et statistiques','Disposition et dimensions','Navigation et carrousel',
    'Contenu de la lecture','Bandeau d\'informations du flux','Apparence, couleurs et typographie',
    'Filtres et tri','Noms et avatars personnalisés']) {
    assert.ok(html.includes(title.replaceAll("'",'&#39;')),title);
  }
  assert.match(html,/data-field="header_show_server_counts"/);
  assert.match(html,/data-field="accent_color_mode"/);
  assert.match(html,/data-field="show_quality"/);
});

test('native Sections height is resizable and pixel height is not forced on grid-resized cards', () => {
  const {card} = setup();
  let opts=card.getGridOptions();
  assert.equal(opts.rows,4);
  assert.equal(opts.min_rows,2);
  assert.equal(opts.max_rows,30);
  card._config.grid_rows=7;
  opts=card.getGridOptions();
  assert.equal(opts.rows,7);
  card._config.height=330;
  card._config.font_size=18;
  card.render();
  assert.match(card.shadowRoot.innerHTML,/height:330px/);
  assert.match(card.shadowRoot.innerHTML,/--tr-font-size:18px/);
  card._config.grid_options={columns:6, rows:3};
  card._renderFingerprint=null;
  card.render();
  assert.doesNotMatch(card.shadowRoot.innerHTML,/height:330px/);
});

test('arrows can be hidden but carousel keyboard controls and dragging remain supported', () => {
  const {card,carousel,cards,listeners}=setup({count:3,visible:1,effect:'none'});
  card._config.carousel_show_arrows=false;
  card._config.carousel_mouse_drag=true;
  const classes=new Set();
  carousel.classList={add:c=>classes.add(c),remove:c=>classes.delete(c)};
  carousel.setPointerCapture=()=>{};
  carousel.hasPointerCapture=()=>false;
  card._enableMouseDrag(carousel,cards);
  const get = name => listeners.find(l=>l.event===name).fn;
  get('pointerdown')({pointerType:'mouse',button:0,clientX:220,pointerId:1});
  assert.ok(classes.has('is-dragging'));
  get('pointermove')({clientX:100,preventDefault:()=>{}});
  assert.equal(carousel.scrollLeft,120);
  get('pointerup')({pointerId:1});
  assert.equal(card._carouselIndex,1);
  assert.equal(carousel.scrollLeft,110);
  assert.ok(!classes.has('is-dragging'));
  get('keydown')({key:'ArrowRight',preventDefault:()=>{}});
  assert.equal(card._carouselIndex,2);
  card._payload={entries:[{id:'a',connected:true,streams:cards.map((c,i)=>({id:String(i),username:'x',server_type:'plex',media_title:'Film',media_type:'movie',state:'playing',started_at:String(i),progress_ms:0,duration_ms:10000}))}]};
  card._renderFingerprint=null;
  card.render();
  assert.doesNotMatch(card.shadowRoot.innerHTML,/data-step="-1"/);
});


test('irregular SSE samples keep elapsed and remaining times monotonic and nearly one second per second', () => {
  time = 0;
  const {card} = setup();
  const stream = {id:'video', started_at:'2026-11-03T17:30:00Z', media_title:'Film',
    state:'playing', progress_ms:2_928_000, duration_ms:6_880_000};
  card._syncPosition(stream);
  let last = 2_928_000;
  // Reproduces samples arriving every 2s with irregular, sometimes stale source positions.
  const jitter = [0,-800,600,-1700,900,-1100,1400,-650,800,-1900,1000];
  for (let sec=1; sec<=20; sec++) {
    time = sec*1000;
    if (sec % 2 === 0) {
      stream.progress_ms = 2_928_000 + sec*1000 + jitter[sec/2];
      card._syncPosition(stream);
    }
    const clock = card._positions.get('video');
    const shown = card._positionAt(clock);
    const change = shown-last;
    assert.ok(change >= 0, `not moving backwards at ${sec}s: ${change}`);
    assert.ok(change > 700 && change < 1300, `steady seconds at ${sec}s: ${change}`);
    assert.ok(6_880_000-shown <= 6_880_000-last, `remaining time does not increase at ${sec}s`);
    clock.lastRendered = shown;
    last = shown;
  }
});

test('pause freezes countdown, resume continues smoothly, and a new session resets the clock', () => {
  time = 0;
  const {card} = setup();
  const s = {id:'p', started_at:'start1', media_title:'A', state:'playing', progress_ms:60000,duration_ms:120000};
  card._syncPosition(s);
  time = 3000;
  s.state = 'paused'; s.progress_ms=62100;
  card._syncPosition(s);
  const frozen=card._positionAt(card._positions.get('p'));
  time=9000;
  s.progress_ms=62500;
  card._syncPosition(s);
  assert.equal(card._positionAt(card._positions.get('p')),frozen);
  s.state='playing';s.progress_ms=63100;
  card._syncPosition(s);
  time=10000;
  assert.ok(card._positionAt(card._positions.get('p')) > frozen + 700);
  s.started_at='start2';s.media_title='B';s.progress_ms=1500;
  card._syncPosition(s);
  assert.equal(card._positionAt(card._positions.get('p')),1500);
});

test('actual seek forward or backward causes intentional jumps, unlike jitter', () => {
  time = 0;
  const {card} = setup();
  const stream={id:'s',started_at:'A',media_title:'Test',state:'playing',progress_ms:50000,duration_ms:240000};
  card._syncPosition(stream);
  time=2000;stream.progress_ms=51700;card._syncPosition(stream);
  card._positions.get('s').lastRendered = card._positionAt(card._positions.get('s'));
  time=4000;stream.progress_ms=20000;
  card._syncPosition(stream);
  assert.equal(card._positionAt(card._positions.get('s')),20000);
  assert.equal(card._positions.get('s').lastRendered,20000);
  time=5000;stream.progress_ms=90000;
  card._syncPosition(stream);
  assert.equal(card._positionAt(card._positions.get('s')),90000);
});

test('progress clock uses monotonic time and a 250ms UI tick', () => {
  const {card} = setup();
  card._setTimers();
  assert.ok([...timers.values()].some(t => t.duration === 250));
  card.disconnectedCallback();
});
