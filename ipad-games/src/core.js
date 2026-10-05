'use strict';
/* ============================================================
   Core: menu, seats, game context helpers. See API.md.
   ============================================================ */

const COLORS = ['#ff5a5f', '#3b9cff', '#ffc93c'];
const NAMES = ['Красный', 'Синий', 'Жёлтый'];
const SIDE_ROT = { bottom: 0, top: 180, left: 90, right: -90 };

const App = {
  n: 2,
  wins: [0, 0, 0],
  games: [],
  el: null,
  ctx: null,
};

function registerGame(def) {
  if (!def.minPlayers) def.minPlayers = 2;
  if (!def.maxPlayers) def.maxPlayers = 3;
  App.games.push(def);
}

/* ---------- small utils (global, usable by games) ---------- */
const U = {
  rand: (a, b) => a + Math.random() * (b - a),
  randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
  h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'style' && typeof attrs[k] === 'object') Object.assign(e.style, attrs[k]);
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  },
  // hex color -> rgba string with alpha
  alpha(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  },
};

/* ---------- compatibility + performance safety ---------- */
// roundRect for older Safari (< 16).
if (window.CanvasRenderingContext2D && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    let rr = Array.isArray(r) ? r[0] : (typeof r === 'object' && r ? r.x : r) || 0;
    rr = Math.max(0, Math.min(rr, Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + rr, y);
    this.arcTo(x + w, y, x + w, y + h, rr);
    this.arcTo(x + w, y + h, x, y + h, rr);
    this.arcTo(x, y + h, x, y, rr);
    this.arcTo(x, y, x + w, y, rr);
    this.closePath();
    return this;
  };
}
if (!Array.prototype.at) {
  Array.prototype.at = function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return this[i]; };
}
// Canvas glow (shadowBlur) is expensive on some devices. If frames get slow, glow is switched off.
const Perf = { lowFx: false };
(function () {
  const proto = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
  const d = proto && Object.getOwnPropertyDescriptor(proto, 'shadowBlur');
  if (!d || !d.set) return;
  Object.defineProperty(proto, 'shadowBlur', {
    configurable: true, enumerable: d.enumerable,
    get() { return d.get.call(this); },
    set(v) { d.set.call(this, Perf.lowFx ? 0 : v); },
  });
})();

function seatSides(n) {
  return n === 2 ? ['bottom', 'top'] : ['bottom', 'left', 'right'];
}

/* ---------- wake lock (keep screen on during games) ---------- */
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release(); wakeLock = null;
    }
  } catch (e) { /* not supported */ }
}

/* ============================================================
   Game context
   ============================================================ */
function makeCtx(game, n) {
  const root = U.h('div', { class: 'game-root' });
  App.el.replaceChildren(root);

  const timers = new Map();
  const cleanups = [];
  const resizeFns = [];
  const zones = [];
  const canvases = [];
  let alive = true;

  const ctx = {
    n,
    root,
    game,
    W: root.clientWidth || innerWidth,
    H: root.clientHeight || innerHeight,
    paused: false,
    players: seatSides(n).map((side, i) => ({
      i, side, rot: SIDE_ROT[side], color: COLORS[i], name: NAMES[i],
    })),
    get alive() { return alive; },
  };
  ctx.colors = ctx.players.map(p => p.color);

  /* ----- timing: one rAF clock; game time stops while paused ----- */
  // ctx.time = seconds of un-paused game time. after/every use game time.
  ctx.time = 0;
  let timerSeq = 0;
  const loops = [];
  ctx.after = (ms, fn) => {
    const id = ++timerSeq;
    timers.set(id, { at: ctx.time + ms / 1000, fn });
    return id;
  };
  ctx.every = (ms, fn) => {
    const id = ++timerSeq;
    timers.set(id, { at: ctx.time + ms / 1000, fn, period: ms / 1000 });
    return id;
  };
  ctx.cancel = (id) => { timers.delete(id); };
  // fn(dt, t): dt in seconds (0 while paused, so you can still draw), t = performance.now()
  ctx.loop = (fn) => { loops.push(fn); return fn; };
  let last = performance.now();
  let fpsAvg = 1 / 60, fpsFrames = 0;
  const frame = (t) => {
    if (!alive) return;
    const rawDt = (t - last) / 1000;
    const dt = Math.min(0.05, Math.max(0, rawDt));
    last = t;
    // Slow-frame watchdog: about 2 s averaging under ~40 fps turns glow effects off for the session.
    if (!Perf.lowFx && rawDt > 0 && rawDt < 0.5) {
      fpsAvg = fpsAvg * 0.98 + rawDt * 0.02; fpsFrames++;
      if (fpsFrames > 120 && fpsAvg > 1 / 40) { Perf.lowFx = true; console.log('lowFx on'); }
    }
    if (!ctx.paused) {
      ctx.time += dt;
      for (const [id, tm] of [...timers]) {
        if (!alive) return;
        if (timers.get(id) !== tm || tm.at > ctx.time) continue;
        if (tm.period) tm.at += tm.period; else timers.delete(id);
        try { tm.fn(); } catch (e) { console.error(e); }
      }
    }
    for (const fn of loops) {
      if (!alive) return;
      try { fn(ctx.paused ? 0 : dt, t); } catch (e) { console.error(e); }
    }
    rafId = requestAnimationFrame(frame);
  };
  let rafId = requestAnimationFrame(frame);
  ctx.onCleanup = (fn) => cleanups.push(fn);
  ctx.onResize = (fn) => resizeFns.push(fn);

  /* ----- geometry ----- */
  // Which player "owns" a screen point: the one whose edge is closest.
  ctx.seatAt = (x, y) => {
    let best = 0, bd = Infinity;
    for (const p of ctx.players) {
      const d = p.side === 'bottom' ? ctx.H - y : p.side === 'top' ? y : p.side === 'left' ? x : ctx.W - x;
      if (d < bd) { bd = d; best = p.i; }
    }
    return best;
  };
  // Rotate a vector from player-local frame (x right, y down, as the player sees it) into screen frame.
  ctx.toScreen = (i, x, y) => {
    const a = ctx.players[i].rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return { x: x * c - y * s, y: x * s + y * c };
  };
  // Rotate a vector from screen frame into player-local frame.
  ctx.toLocal = (i, x, y) => {
    const a = -ctx.players[i].rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return { x: x * c - y * s, y: x * s + y * c };
  };
  // Canvas: translate to (x,y) and rotate so drawing "upright" faces player i.
  ctx.facing = (g, i, x, y) => {
    g.translate(x, y);
    g.rotate(ctx.players[i].rot * Math.PI / 180);
  };
  // Unit vector pointing from player i's edge towards the screen center.
  ctx.inward = (i) => ({ bottom: { x: 0, y: -1 }, top: { x: 0, y: 1 }, left: { x: 1, y: 0 }, right: { x: -1, y: 0 } })[ctx.players[i].side];

  /* ----- zones: DOM strip along a player's edge, rotated to face them ----- */
  ctx.zone = (i, opts = {}) => {
    const z = {
      i, depth: opts.depth ?? 0.25, // fraction of min(W,H) if <=1, else px
      outer: U.h('div', { class: 'zone' }),
      el: U.h('div', { class: 'zone-inner' }),
      w: 0, h: 0,
    };
    z.outer.append(z.el);
    if (opts.className) z.el.className += ' ' + opts.className;
    z.el.style.setProperty('--pc', ctx.players[i].color);
    (opts.parent || root).append(z.outer);
    zones.push(z);
    layoutZone(z);
    return z;
  };
  function zoneRect(z) {
    const W = ctx.W, H = ctx.H, p = ctx.players[z.i];
    const d = z.depth <= 1 ? Math.round(z.depth * Math.min(W, H)) : z.depth;
    const sides = ctx.players.map(q => q.side);
    const inset = (s) => sides.includes(s) ? d : 0;
    switch (p.side) {
      case 'bottom': return { x: inset('left'), y: H - d, w: W - inset('left') - inset('right'), h: d, len: W - inset('left') - inset('right'), d };
      case 'top': return { x: inset('left'), y: 0, w: W - inset('left') - inset('right'), h: d, len: W - inset('left') - inset('right'), d };
      case 'left': return { x: 0, y: 0, w: d, h: H, len: H, d };
      case 'right': return { x: W - d, y: 0, w: d, h: H, len: H, d };
    }
  }
  function layoutZone(z) {
    const r = zoneRect(z);
    Object.assign(z.outer.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    z.w = r.len; z.h = r.d; z.rect = r;
    Object.assign(z.el.style, {
      width: r.len + 'px', height: r.d + 'px',
      transform: `translate(-50%,-50%) rotate(${ctx.players[z.i].rot}deg)`,
    });
  }

  /* ----- canvas ----- */
  ctx.canvas = (opts = {}) => {
    const cv = U.h('canvas');
    if (opts.z != null) cv.style.zIndex = opts.z;
    root.prepend(cv);
    const c = { cv, g: cv.getContext('2d'), dpr: 1 };
    canvases.push(c);
    sizeCanvas(c);
    return c;
  };
  function sizeCanvas(c) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.dpr = dpr;
    c.cv.width = Math.round(ctx.W * dpr);
    c.cv.height = Math.round(ctx.H * dpr);
    c.cv.style.width = ctx.W + 'px';
    c.cv.style.height = ctx.H + 'px';
    c.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ----- input ----- */
  // handlers: {down(id,x,y,e), move(id,x,y,e), up(id,x,y,e)}; x,y in screen px relative to root.
  ctx.pointer = (el, handlers) => {
    const rect = () => root.getBoundingClientRect();
    const pos = (e) => { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const down = (e) => {
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      if (handlers.down) handlers.down(e.pointerId, ...pos(e), e);
    };
    const move = (e) => { if (handlers.move) handlers.move(e.pointerId, ...pos(e), e); };
    const up = (e) => { if (handlers.up) handlers.up(e.pointerId, ...pos(e), e); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  // Fires fn immediately on touch start (no click delay). Returns the element.
  ctx.tap = (el, fn) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (alive && !ctx.paused) fn(e); });
    return el;
  };

  /* ----- messages ----- */
  const toastLayer = U.h('div', { class: 'toast-layer' });
  root.append(toastLayer);
  // Shows text once per player, near the center, each copy rotated to face its player.
  ctx.toast = (text, opts = {}) => {
    const ms = opts.ms ?? 1200;
    // default: each copy sits ~28% of the short side from center, toward its player, so copies never cross
    const off = opts.offset ?? (ctx.n === 2 ? 70 : Math.min(ctx.W, ctx.H) * 0.28);
    const els = ctx.players.map(p => {
      const v = ctx.inward(p.i);
      const t = U.h('div', { class: 'toast' }, text);
      if (opts.color) t.style.background = opts.color;
      if (opts.fg) t.style.color = opts.fg;
      if (opts.size) t.style.fontSize = opts.size + 'px';
      const cx = -v.x * off, cy = -v.y * off;
      t.style.transform = `translate(-50%,-50%) translate(${cx}px,${cy}px) rotate(${p.rot}deg)`;
      toastLayer.append(t);
      return t;
    });
    ctx.after(ms, () => els.forEach(e => e.remove()));
    return els;
  };

  /* ----- end of game ----- */
  ctx.end = (result = {}) => {
    if (!alive) return;
    let winners = result.winners ?? (result.winner != null ? [result.winner] : []);
    winners.forEach(w => App.wins[w]++);
    destroy();
    showResult(game, n, winners, result);
  };

  /* ----- resize ----- */
  const onWinResize = () => {
    ctx.W = root.clientWidth; ctx.H = root.clientHeight;
    canvases.forEach(sizeCanvas);
    zones.forEach(layoutZone);
    resizeFns.forEach(f => f(ctx.W, ctx.H));
  };
  window.addEventListener('resize', onWinResize);

  function destroy() {
    if (!alive) return;
    alive = false;
    timers.clear();
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onWinResize);
    cleanups.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  }
  ctx._destroy = destroy;

  /* ----- exit button ----- */
  const exit = U.h('button', { class: 'exit', 'aria-label': 'Выход' }, '✕');
  exit.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    ctx.paused = true;
    const ov = U.h('div', { class: 'overlay' },
      U.h('div', { class: 'dialog' },
        U.h('h3', null, 'Выйти из игры?'),
        U.h('div', { class: 'btn-row' },
          U.h('button', { class: 'btn ghost', onclick: () => { ov.remove(); ctx.paused = false; } }, 'Играть дальше'),
          U.h('button', { class: 'btn', onclick: () => { destroy(); showMenu(); } }, 'В меню'))));
    root.append(ov);
  });
  // Put the exit button on an edge no player sits at: 2p → middle of the left edge, 3p → middle of the top edge.
  if (n === 2) Object.assign(exit.style, { left: '6px', top: '50%', transform: 'translateY(-50%)' });
  else Object.assign(exit.style, { left: '50%', top: '6px', transform: 'translateX(-50%)' });
  root.append(exit);

  return ctx;
}

/* ============================================================
   Screens
   ============================================================ */
function tallyEl() {
  const el = U.h('div', { class: 'tally' });
  for (let i = 0; i < App.n; i++) {
    el.append(U.h('span', null, U.h('span', { class: 'dot', style: { background: COLORS[i] } }), String(App.wins[i])));
  }
  const reset = U.h('button', { class: 'reset' }, 'сброс');
  reset.addEventListener('click', () => { App.wins = [0, 0, 0]; save(); showMenu(); });
  el.append(reset);
  return el;
}

function save() {
  try { localStorage.setItem('pg.state', JSON.stringify({ n: App.n, wins: App.wins })); } catch (e) {}
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('pg.state') || 'null');
    if (s) { App.n = s.n === 3 ? 3 : 2; if (Array.isArray(s.wins)) App.wins = s.wins.concat([0, 0, 0]).slice(0, 3); }
  } catch (e) {}
}

function showMenu() {
  keepAwake(false);
  App.ctx = null;
  // Group cards into sections (App.sections: [{title, ids}]); unlisted games go to the last section.
  const sections = (App.sections || [{ title: '', ids: [] }]).map(s => ({ ...s, games: [] }));
  for (const g of App.games) {
    const sec = sections.find(s => s.ids.includes(g.id)) || sections[sections.length - 1];
    sec.games.push(g);
  }
  const grid = U.h('div', { class: 'sections' });
  for (const sec of sections) {
    if (!sec.games.length) continue;
    const sg = U.h('div', { class: 'grid' });
    for (const g of sec.games) {
      const ok = App.n >= g.minPlayers && App.n <= g.maxPlayers;
      const card = U.h('button', { class: 'card' + (ok ? '' : ' off') },
        U.h('div', { class: 'em' }, g.emoji),
        U.h('div', { class: 't' }, g.title),
        U.h('div', { class: 'd' }, ok ? g.desc : `Только для ${g.minPlayers === g.maxPlayers ? g.minPlayers : g.minPlayers + '–' + g.maxPlayers} игроков`));
      if (ok) card.addEventListener('click', () => showRules(g));
      sg.append(card);
    }
    if (sec.title) grid.append(U.h('h2', { class: 'sec-title' }, sec.title));
    grid.append(sg);
  }
  const seg = U.h('div', { class: 'seg' });
  [2, 3].forEach(k => {
    const b = U.h('button', { class: App.n === k ? 'on' : '' }, `${k} игрока`);
    b.addEventListener('click', () => { App.n = k; save(); showMenu(); });
    seg.append(b);
  });
  const menu = U.h('div', { class: 'menu' },
    U.h('div', { class: 'menu-inner' },
      U.h('h1', null, 'Игры на одном iPad'),
      U.h('p', { class: 'sub' }, 'Положите iPad на стол, каждый садится к своему краю. Работает без интернета.'),
      U.h('div', { class: 'top-row' }, seg, tallyEl()),
      grid,
      U.h('div', { class: 'foot' }, `Всего игр: ${App.games.length} · счёт побед сохраняется`)));
  App.el.replaceChildren(menu);
}

function showRules(game) {
  const box = U.h('div', { class: 'rules-box' },
    U.h('div', { class: 'em' }, game.emoji),
    U.h('h2', null, game.title),
    U.h('p', null, game.rules || game.desc),
    U.h('div', { class: 'btn-row' },
      U.h('button', { class: 'btn ghost', onclick: showMenu }, 'Назад'),
      U.h('button', { class: 'btn', onclick: () => startGame(game) }, 'Старт')));
  App.el.replaceChildren(U.h('div', { class: 'rules' }, box));
}

function startGame(game, opts = {}) {
  keepAwake(true);
  const ctx = makeCtx(game, App.n);
  App.ctx = ctx;
  let ret;
  try { ret = game.start(ctx); } catch (e) { console.error(e); }
  if (typeof ret === 'function') ctx.onCleanup(ret);
  if (opts.noCountdown) return ctx;
  // Countdown: pause the game for 3 seconds.
  ctx.paused = true;
  const cd = U.h('div', { class: 'countdown' }, '3');
  ctx.root.append(cd);
  let k = 3;
  const tick = () => {
    k--;
    if (k > 0) { cd.textContent = k; setTimeout(tick, 700); }
    else { cd.remove(); if (ctx.alive) { ctx.paused = false; if (ctx.onStart) ctx.onStart(); } }
  };
  setTimeout(tick, 700);
  return ctx;
}

function showResult(game, n, winners, result) {
  save();
  const root = U.h('div', { class: 'game-root' });
  const players = seatSides(n).map((side, i) => ({ i, side, rot: SIDE_ROT[side] }));
  // per-seat label facing each player
  const W = App.el.clientWidth, H = App.el.clientHeight;
  for (const p of players) {
    const win = winners.includes(p.i);
    const txt = winners.length === 0 ? 'Ничья' : win ? 'Победа! 🏆' : 'Не в этот раз';
    const sc = result.scores ? `очки: ${result.scores[p.i]}` : '';
    const el = U.h('div', { class: 'result-seat', style: { color: COLORS[p.i] } }, txt, sc ? U.h('small', null, sc) : null);
    const off = Math.min(W, H) * 0.36;
    const v = { bottom: [0, 1], top: [0, -1], left: [-1, 0], right: [1, 0] }[p.side];
    el.style.transform = `translate(-50%,-50%) translate(${v[0] * off}px,${v[1] * off}px) rotate(${p.rot}deg)`;
    root.append(el);
  }
  const center = U.h('div', { class: 'dialog', style: { position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)' } },
    U.h('h3', null, winners.length ? winners.map(w => NAMES[w]).join(' и ') + (winners.length > 1 ? ' победили' : ' победил') : 'Ничья'),
    result.msg ? U.h('p', { style: { color: 'var(--muted)', margin: '0 0 14px' } }, result.msg) : null,
    U.h('div', { style: { marginBottom: '14px' } }, tallyEl()),
    U.h('div', { class: 'btn-row' },
      U.h('button', { class: 'btn ghost', onclick: showMenu }, 'Меню'),
      U.h('button', { class: 'btn', onclick: () => startGame(game) }, 'Ещё раз')));
  center.querySelector('.reset')?.remove();
  root.append(center);
  App.el.replaceChildren(root);
}

/* debug hook for automated tests */
window.__start = (id, n) => {
  App.n = n || App.n;
  const g = App.games.find(x => x.id === id);
  if (App.ctx) App.ctx._destroy();
  return startGame(g, { noCountdown: true });
};
