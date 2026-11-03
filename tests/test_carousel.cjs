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

test('can hide scrollbar without breaking accessible scroll container', () => {
  const {card} = setup();
  card._config = {...card._config, mode:'carousel',carousel_hide_scrollbar:true,show_poster:false,show_avatar:false};
  card.render();
  assert.match(card.shadowRoot.innerHTML, /streams carousel hide-scrollbar/);
  assert.match(card.shadowRoot.innerHTML,/\.streams\.carousel\.hide-scrollbar::\-webkit-scrollbar/);
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
