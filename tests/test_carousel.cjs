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
  stream.progress_ms = 5000;
  card.render();
  assert.equal(card.shadowRoot.renders,before);
  assert.equal(card._carouselIndex,1);
  assert.equal(carousel.scrollLeft,110);
  assert.equal(card._positions.get('s1').progress,5000);
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

test('playback bar respects theme, per-server and sanitized custom colors', () => {
  const {card} = setup();
  card._config = {...card._config,show_poster:false,show_avatar:false};
  const s={id:'x', username:'x', server_type:'jellyfin',media_title:'Film',media_type:'movie',state:'playing',progress_ms:0,duration_ms:10000};
  assert.match(card._streamCard(null,s), /--progress-accent:var\(--accent-color,#00BCD4\)/);
  card._config.progress_color_mode='server';
  assert.match(card._streamCard(null,s), /--progress-accent:var\(--stream-accent\)/);
  card._config.progress_color_mode='custom';
  card._config.progress_custom_color='#fF304a';
  assert.match(card._streamCard(null,s), /--progress-accent:#fF304a/);
  card._config.progress_custom_color='red;background:url(https://bad.example)';
  assert.match(card._streamCard(null,s), /--progress-accent:#00BCD4/);
  assert.doesNotMatch(card._streamCard(null,s),/bad\.example/);
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
