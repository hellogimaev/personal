registerGame({
  id: 'chain',
  title: 'Цепная реакция',
  emoji: '💥',
  desc: 'Перегрузи клетки и захвати поле цепными взрывами',
  rules: 'Ходите по очереди: нажми на пустую или свою клетку, чтобы добавить шарик.\n' +
    'Когда шариков столько же, сколько у клетки соседей (угол 2, край 3, середина 4), она взрывается: шарики летят к соседям и перекрашивают их в твой цвет. Взрывы идут цепочкой!\n' +
    'Остался без шариков (после первого круга) — выбыл. Последний с шариками побеждает.\n' +
    '⭐ Звезда — захватил клетку со звездой: ещё один ход.\n' +
    '🧱 Стена — пустая клетка, соседи у неё меньше, взрываются быстрее.\n' +
    '🧨 Бомба — у каждого одна: кнопка в твоей зоне, затем нажми клетку — поле 3×3 очищается (это твой ход).\n' +
    '🎲 Каждые 3 круга событие: ↔️ сдвиг ряда, ⚪ клетка лидера пустеет, ⭐ новая звезда, 🆘 подарок отстающему, 🧱 новая стена.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const P = ctx.players, N = ctx.n;
    const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", Roboto, sans-serif';
    const SHORT = N === 2 ? 6 : 7, LONG = N === 2 ? 8 : 9;
    const DEPTH = 84;
    const FLY = 0.2;
    const MAX_TURNS = 240;

    // logical grid: a in [0,SHORT), b in [0,LONG)
    const cells = [];
    for (let a = 0; a < SHORT; a++) { cells.push([]); for (let b = 0; b < LONG; b++) cells[a].push({ a, b, o: -1, n: 0, blocked: false, star: false, slide: null, pop: 0 }); }
    const all = () => cells.flat();
    const inside = (a, b) => a >= 0 && a < SHORT && b >= 0 && b < LONG;
    const nbrs = (c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([da, db]) => [c.a + da, c.b + db]).filter(([a, b]) => inside(a, b) && !cells[a][b].blocked).map(([a, b]) => cells[a][b]);
    const cap = (c) => nbrs(c).length;

    let turn = U.randInt(0, N - 1);
    const alive = P.map(() => true);
    const moves = P.map(() => 0);
    const bombUsed = P.map(() => false);
    let armed = false;
    let state = 'input'; // input | anim | over
    let turns = 0, eventEvery = 3 * N, extra = false;
    let flyers = [], waveQueue = null;
    const parts = [], rings = [];
    let pulse = 0, shake = 0, flash = 0, flashColor = '#fff';
    let geo = null;

    /* ---------- board features ---------- */
    function validCaps() { return all().every(c => c.blocked || cap(c) >= 2); }
    function setupBoard() {
      for (let tries = 0; tries < 200; tries++) {
        all().forEach(c => { c.blocked = false; c.star = false; });
        const nb = U.randInt(2, N === 2 ? 3 : 4);
        const free = U.shuffle(all());
        for (let k = 0; k < nb; k++) free[k].blocked = true;
        if (!validCaps()) continue;
        const ns = N === 2 ? 3 : 4;
        U.shuffle(all().filter(c => !c.blocked)).slice(0, ns).forEach(c => { c.star = true; });
        return;
      }
      all().forEach(c => { c.blocked = false; });
    }
    setupBoard();

    /* ---------- styles & HUD ---------- */
    ctx.root.classList.add('g-chain');
    ctx.root.append(U.h('style', null, `
      .g-chain .bx{position:absolute;inset:8px 10px;border-radius:18px;display:flex;align-items:center;gap:12px;padding:0 10px 0 16px;
        background:#1a1f35;border:3px solid transparent;font-weight:900;color:#f2f4ff;transition:background .25s, box-shadow .25s, border-color .25s, opacity .3s}
      .g-chain .bx .dot{width:30px;height:30px;border-radius:50%;background:radial-gradient(circle at 35% 30%, #fff8, var(--pc) 45%);flex:0 0 auto;box-shadow:0 0 10px var(--pc)}
      .g-chain .bx .mid{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
      .g-chain .bx .tx{font-size:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#9aa1c4}
      .g-chain .bx .tx b{color:var(--tc)}
      .g-chain .bx .sub{font-size:15px;color:#9aa1c4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .g-chain .bx .bomb{width:62px;height:62px;border-radius:16px;background:#2a3157;font-size:32px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;
        border:3px solid transparent;transition:transform .15s, opacity .2s, background .2s}
      .g-chain .bx .bomb.off{opacity:.25}
      .g-chain .bx .bomb.used{opacity:.12;filter:grayscale(1)}
      .g-chain .bx .bomb.armed{background:#ff4d6d;border-color:#fff;transform:scale(1.08);animation:gcPulse .6s infinite alternate}
      @keyframes gcPulse{from{box-shadow:0 0 0 0 rgba(255,77,109,.8)}to{box-shadow:0 0 22px 8px rgba(255,77,109,.8)}}
      .g-chain .bx.on{background:color-mix(in srgb, var(--pc) 28%, #1a1f35);border-color:var(--pc);box-shadow:0 0 30px 6px var(--pc)}
      .g-chain .bx.on .tx{color:#fff}
      .g-chain .bx.out{opacity:.35}
      .g-chain .bx.win{background:var(--pc);border-color:#fff}
      .g-chain .bx.win .tx,.g-chain .bx.win .sub{color:#111}
    `));
    const { cv, g } = ctx.canvas();
    const hud = P.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH });
      const tx = U.h('div', { class: 'tx' }), sub = U.h('div', { class: 'sub' });
      const bomb = U.h('div', { class: 'bomb' }, '🧨');
      const bx = U.h('div', { class: 'bx' }, U.h('div', { class: 'dot' }), U.h('div', { class: 'mid' }, tx, sub), bomb);
      z.el.append(bx);
      ctx.tap(bomb, () => onBomb(p.i));
      return { bx, tx, sub, bomb };
    });
    function orbs(i) { let s = 0; for (const c of all()) if (c.o === i) s += c.n; return s; }
    function render(winner = -1) {
      hud.forEach((h, i) => {
        h.bx.style.setProperty('--tc', P[turn].color);
        const on = state !== 'over' && i === turn && alive[i];
        h.bx.classList.toggle('on', on);
        h.bx.classList.toggle('out', !alive[i]);
        h.bx.classList.toggle('win', winner === i);
        if (state === 'over') h.tx.textContent = winner === i ? 'Победа! 🏆' : winner >= 0 ? `Победил ${P[winner].name}` : 'Конец';
        else if (!alive[i]) h.tx.textContent = '☠ выбыл';
        else if (on) h.tx.textContent = armed ? '🧨 Выбери клетку!' : 'Твой ход!';
        else h.tx.replaceChildren('Ход: ', U.h('b', null, P[turn].name));
        h.sub.textContent = `шариков: ${orbs(i)}` + (bombUsed[i] ? '' : ' · 🧨 бомба есть');
        const can = on && state === 'input' && !bombUsed[i] && moves[i] > 0;
        h.bomb.classList.toggle('used', bombUsed[i]);
        h.bomb.classList.toggle('off', !bombUsed[i] && !can);
        h.bomb.classList.toggle('armed', on && armed);
      });
    }

    /* ---------- geometry ---------- */
    function layout() {
      const W = ctx.W, H = ctx.H;
      const r = N === 2 ? { x: 56, y: DEPTH, w: W - 112, h: H - 2 * DEPTH } : { x: DEPTH, y: 54, w: W - 2 * DEPTH, h: H - DEPTH - 54 };
      const portrait = r.h >= r.w;
      const cols = portrait ? SHORT : LONG, rows = portrait ? LONG : SHORT;
      const pad = 10;
      const cell = Math.floor(Math.min((r.w - 2 * pad) / cols, (r.h - 2 * pad) / rows));
      const bw = cell * cols, bh = cell * rows;
      geo = { r, portrait, cols, rows, cell, bx: Math.round(r.x + (r.w - bw) / 2), by: Math.round(r.y + (r.h - bh) / 2), bw, bh };
    }
    layout();
    ctx.onResize(layout);
    function cellXY(c) { // center in px
      const { portrait, cell, bx, by } = geo;
      const col = portrait ? c.a : c.b, row = portrait ? c.b : c.a;
      return { x: bx + (col + 0.5) * cell, y: by + (row + 0.5) * cell };
    }
    function cellAt(x, y) {
      const { portrait, cell, bx, by, cols, rows } = geo;
      const col = Math.floor((x - bx) / cell), row = Math.floor((y - by) / cell);
      if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
      return portrait ? cells[col][row] : cells[row][col];
    }

    /* ---------- juice ---------- */
    function burst(x, y, color, n = 14, sp = 200) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.283, s = U.rand(0.25, 1) * sp;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.3, 0.7), t: 0, color, s: U.rand(2, 4.5) });
      }
    }
    function ring(x, y, r, color, grow = 2.2, life = 0.45) { rings.push({ x, y, r, max: r * grow, color, life, t: 0 }); }
    // queued toasts: one message at a time; a waiting message shortens the current one
    const tq = []; let tShown = null;
    function say(text, o = {}) { tq.push({ text, o }); }
    ctx.loop(() => {
      if (tShown && (ctx.time - tShown.t0 >= tShown.ms || (tq.length && ctx.time - tShown.t0 >= 0.9))) { tShown.els.forEach(e => e.remove()); tShown = null; }
      if (!tShown && tq.length) {
        const it = tq.shift();
        const o = Object.assign({ offset: N === 3 ? Math.min(ctx.W, ctx.H) * 0.34 : 80 }, it.o);
        tShown = { t0: ctx.time, ms: (o.ms ?? 1600) / 1000, els: ctx.toast(it.text, Object.assign({}, o, { ms: 600000 })) };
      }
    });
    function sayP(i, text, o = {}) { return say(text, Object.assign({ color: P[i].color, fg: '#111' }, o)); }

    /* ---------- moves ---------- */
    function onBomb(i) {
      if (state !== 'input' || i !== turn || bombUsed[i] || !alive[i]) return;
      if (moves[i] === 0) { sayP(i, '🧨 Бомба доступна со второго хода', { ms: 1200 }); return; }
      armed = !armed;
      if (armed) sayP(i, '🧨 Выбери клетку: взрыв 3×3', { ms: 1500 });
      render();
    }
    ctx.pointer(cv, {
      down(id, x, y) {
        if (ctx.paused || state !== 'input' || !geo) return;
        const c = cellAt(x, y);
        if (!c) return;
        const p = cellXY(c);
        if (armed) { useBomb(c); return; }
        if (c.blocked || (c.o !== -1 && c.o !== turn)) {
          c.pop = -0.3; ring(p.x, p.y, geo.cell * 0.3, '#ff4d6d', 1.6, 0.3);
          return;
        }
        play(c);
      },
    });
    function play(c) {
      const me = turn;
      moves[me]++;
      extra = false;
      c.n++; c.o = me; c.pop = 0.25;
      const p = cellXY(c);
      ring(p.x, p.y, geo.cell * 0.25, P[me].color, 2, 0.35);
      if (c.star) takeStar(c, me);
      state = 'anim';
      runWaves(me);
    }
    function takeStar(c, i) {
      c.star = false;
      if (i === turn) extra = true;
      const p = cellXY(c);
      burst(p.x, p.y, '#ffd84d', 30, 280); ring(p.x, p.y, geo.cell * 0.3, '#ffd84d', 3, 0.6);
    }
    function useBomb(c) {
      const me = turn;
      armed = false; bombUsed[me] = true; moves[me]++;
      const p = cellXY(c);
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
        if (!inside(c.a + da, c.b + db)) continue;
        const d = cells[c.a + da][c.b + db];
        if (d.blocked) continue;
        const q = cellXY(d);
        if (d.n) burst(q.x, q.y, d.o >= 0 ? P[d.o].color : '#fff', 10 + d.n * 4, 260);
        d.n = 0; d.o = -1; d.pop = 0.3;
      }
      burst(p.x, p.y, '#ffb347', 60, 520); burst(p.x, p.y, '#fff3b0', 30, 320);
      ring(p.x, p.y, geo.cell * 0.5, '#ffb347', 4, 0.6); ring(p.x, p.y, geo.cell * 0.3, '#fff', 4.5, 0.5);
      shake = 0.5; flash = 0.35; flashColor = '#ffb347';
      sayP(me, '🧨 БУМ! Поле 3×3 очищено', { ms: 1500 });
      state = 'anim';
      extra = false;
      ctx.after(500, () => finishMove(me));
    }

    // explode all critical cells in waves, animating orbs flying to neighbours
    function runWaves(me) {
      let guard = 0;
      const next = () => {
        if (!ctx.alive) return;
        if (++guard > 400) { finishMove(me); return; }
        const crit = all().filter(c => !c.blocked && c.n >= cap(c));
        if (!crit.length || (allMoved() && onlyOneLeft())) { finishMove(me); return; }
        flyers = [];
        for (const c of crit) {
          const k = cap(c), o = c.o;
          c.n -= k; if (c.n <= 0) { c.n = 0; c.o = -1; }
          const p = cellXY(c);
          burst(p.x, p.y, P[o].color, 12, 240); ring(p.x, p.y, geo.cell * 0.3, P[o].color, 2.2, 0.35);
          for (const d of nbrs(c)) flyers.push({ from: c, to: d, o, t: 0 });
        }
        shake = Math.max(shake, Math.min(0.35, 0.08 + crit.length * 0.03));
        waveQueue = () => {
          for (const f of flyers) {
            const d = f.to;
            d.n++; d.o = f.o; d.pop = 0.2;
            if (d.star) takeStar(d, f.o);
          }
          flyers = [];
          next();
        };
      };
      next();
    }
    function allMoved() { return P.every(p => !alive[p.i] || moves[p.i] > 0); }
    function onlyOneLeft() {
      const withOrbs = P.filter(p => alive[p.i] && orbs(p.i) > 0);
      return withOrbs.length <= 1;
    }

    function finishMove(me) {
      waveQueue = null; flyers = [];
      turns++;
      // eliminations (only after everyone moved at least once)
      if (allMoved()) {
        for (const p of P) if (alive[p.i] && orbs(p.i) === 0) {
          alive[p.i] = false;
          sayP(p.i, `☠ ${p.name} выбыл`, { ms: 1800 });
          flash = 0.3; flashColor = p.color;
        }
      }
      const left = P.filter(p => alive[p.i]);
      if (left.length <= 1 || turns >= MAX_TURNS) {
        let w;
        if (left.length === 1) w = left[0].i;
        else { const best = Math.max(...P.map(p => orbs(p.i))); const ws = P.filter(p => orbs(p.i) === best); w = ws.length === 1 ? ws[0].i : -1; }
        state = 'over';
        if (w >= 0) {
          for (const c of all()) if (c.o === w) { const q = cellXY(c); burst(q.x, q.y, P[w].color, 8, 260); }
          sayP(w, `🏆 ${P[w].name} захватил поле!`, { ms: 2400 });
        }
        render(w);
        ctx.after(2400, () => ctx.end(w >= 0 ? { winner: w, scores: P.map(p => orbs(p.i)) } : { scores: P.map(p => orbs(p.i)) }));
        return;
      }
      if (extra && alive[me]) {
        sayP(me, `⭐ ${P[me].name}: звезда — ещё ход!`, { ms: 1500 });
        extra = false;
      } else {
        do { turn = (turn + 1) % N; } while (!alive[turn]);
      }
      state = 'input';
      if (turns % eventEvery === 0 && turns > 0) randomEvent();
      render();
    }

    /* ---------- random events ---------- */
    function randomEvent() {
      const opts = ['shift', 'neutral', 'star', 'help', 'wall'];
      for (const kind of U.shuffle(opts)) if (doEvent(kind)) return;
    }
    function doEvent(kind) {
      if (kind === 'shift') {
        // shift one display row by one cell (cyclic, orbs only)
        const rows = [];
        for (let b = 0; b < LONG; b++) rows.push({ line: cells.map(col => col[b]) });
        for (let a = 0; a < SHORT; a++) rows.push({ line: cells[a].slice() });
        const cand = rows.filter(r => r.line.some(c => c.n > 0));
        if (!cand.length) return false;
        const line = U.pick(cand).line.filter(c => !c.blocked);
        const dir = Math.random() < 0.5 ? 1 : -1;
        const data = line.map(c => ({ o: c.o, n: c.n }));
        line.forEach((c, k) => {
          const src = data[(k - dir + line.length) % line.length];
          const from = line[(k - dir + line.length) % line.length];
          c.o = src.o; c.n = Math.min(src.n, cap(c) - 1); if (!c.n) c.o = -1;
          const p0 = cellXY(from), p1 = cellXY(c);
          c.slide = { dx: p0.x - p1.x, dy: p0.y - p1.y, t: 0.4 };
          if (Math.abs(c.slide.dx) + Math.abs(c.slide.dy) > geo.cell * 1.5) c.slide = { dx: 0, dy: 0, t: 0.4, wrap: true };
        });
        say('↔️ Сдвиг! Ряд поехал', { color: '#4de3ff', fg: '#111', ms: 1800 });
        flash = 0.2; flashColor = '#4de3ff';
        return true;
      }
      if (kind === 'neutral') {
        const lead = P.filter(p => alive[p.i]).sort((x, y) => orbs(y.i) - orbs(x.i))[0];
        const cand = all().filter(c => c.o === lead.i && c.n > 0);
        if (cand.length < 2) return false;
        const c = cand.sort((x, y) => y.n - x.n)[0];
        const p = cellXY(c);
        burst(p.x, p.y, '#ffffff', 24, 220); ring(p.x, p.y, geo.cell * 0.3, '#ffffff', 2.6, 0.6);
        c.o = -1; c.n = 0; c.pop = 0.3;
        say(`⚪ Клетка лидера (${lead.name}) опустела`, { color: '#fff', fg: '#111', ms: 2000 });
        return true;
      }
      if (kind === 'star') {
        const cand = all().filter(c => !c.blocked && !c.star && c.n === 0);
        if (!cand.length) return false;
        const c = U.pick(cand); c.star = true;
        const p = cellXY(c);
        ring(p.x, p.y, geo.cell * 0.3, '#ffd84d', 3, 0.7); burst(p.x, p.y, '#ffd84d', 20, 200);
        say('⭐ Новая звезда: захвати — ещё ход', { color: '#ffd84d', fg: '#111', ms: 2000 });
        return true;
      }
      if (kind === 'help') {
        const al = P.filter(p => alive[p.i]).map(p => ({ i: p.i, o: orbs(p.i) })).sort((x, y) => x.o - y.o);
        if (al.length < 2 || al[0].o === al[al.length - 1].o) return false;
        const cand = all().filter(c => !c.blocked && c.n === 0 && cap(c) >= 2);
        if (!cand.length) return false;
        const i = al[0].i;
        const picks = U.shuffle(cand).slice(0, 2);
        for (const c of picks) { c.o = i; c.n = 1; c.pop = 0.3; const p = cellXY(c); burst(p.x, p.y, P[i].color, 20, 200); ring(p.x, p.y, geo.cell * 0.3, P[i].color, 2.6); }
        sayP(i, `🆘 Подмога: ${P[i].name} +2 шарика`, { ms: 2000 });
        return true;
      }
      if (kind === 'wall') {
        const cand = U.shuffle(all().filter(c => !c.blocked && c.n === 0 && !c.star));
        for (const c of cand) {
          c.blocked = true;
          if (validCaps()) {
            for (const d of all()) if (!d.blocked && d.n >= cap(d)) d.n = cap(d) - 1;
            const p = cellXY(c);
            burst(p.x, p.y, '#c98b5a', 24, 220); c.pop = 0.4;
            say('🧱 Выросла стена!', { color: '#c98b5a', fg: '#111', ms: 1800 });
            return true;
          }
          c.blocked = false;
        }
        return false;
      }
      return false;
    }

    /* ---------- drawing ---------- */
    function orbPos(n, k, rad, spin) {
      if (n === 1) return { x: 0, y: 0 };
      const a = spin + k * 6.283 / n;
      const d = rad * (n === 2 ? 0.5 : 0.62);
      return { x: Math.cos(a) * d, y: Math.sin(a) * d };
    }
    function starPath(x, y, r, rot = 0) {
      g.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = rot - Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r;
        k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath();
    }
    function drawOrb(x, y, r, color) {
      const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, color); gr.addColorStop(1, U.alpha(color, 0.75));
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
    }
    ctx.loop((dt) => {
      pulse += dt;
      if (!geo) return;
      // advance flyers
      if (flyers.length && dt > 0) {
        let done = true;
        for (const f of flyers) { f.t += dt / FLY; if (f.t < 1) done = false; }
        if (done && waveQueue) { const q = waveQueue; waveQueue = null; q(); }
      } else if (!flyers.length && waveQueue && dt > 0) { const q = waveQueue; waveQueue = null; q(); }

      const { cell, bx, by, bw, bh } = geo;
      g.save();
      g.fillStyle = '#0f1220'; g.fillRect(0, 0, ctx.W, ctx.H);
      if (shake > 0) { g.translate(U.rand(-7, 7) * shake, U.rand(-7, 7) * shake); shake -= dt; }
      const tc = state === 'over' ? '#ffffff' : P[turn].color;
      // board glow + background
      g.shadowColor = tc; g.shadowBlur = 30 + 10 * Math.sin(pulse * 3);
      g.fillStyle = '#141933';
      g.beginPath(); g.roundRect(bx - 6, by - 6, bw + 12, bh + 12, 14); g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = U.alpha(tc, 0.9); g.lineWidth = 3; g.stroke();
      // cells
      for (const c of all()) {
        const p = cellXY(c);
        const x0 = p.x - cell / 2, y0 = p.y - cell / 2;
        if (c.blocked) {
          g.fillStyle = '#3a2a24'; g.fillRect(x0 + 3, y0 + 3, cell - 6, cell - 6);
          g.strokeStyle = '#6b4a3a'; g.lineWidth = 2;
          const bh2 = (cell - 6) / 4;
          for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x0 + 3, y0 + 3 + k * bh2); g.lineTo(x0 + cell - 3, y0 + 3 + k * bh2); g.stroke(); }
          for (let k = 0; k < 4; k++) {
            const off = k % 2 ? cell * 0.25 : cell * 0.5;
            g.beginPath(); g.moveTo(x0 + off, y0 + 3 + k * bh2); g.lineTo(x0 + off, y0 + 3 + (k + 1) * bh2); g.stroke();
          }
          continue;
        }
        if (c.o >= 0) { g.fillStyle = U.alpha(P[c.o].color, 0.1); g.fillRect(x0 + 2, y0 + 2, cell - 4, cell - 4); }
        if (c.star) {
          g.globalAlpha = c.n ? 0.4 : 0.75 + 0.25 * Math.sin(pulse * 4 + c.a + c.b);
          g.shadowColor = '#ffd84d'; g.shadowBlur = c.n ? 0 : 16;
          starPath(p.x, p.y, cell * 0.24, pulse * 0.5 + c.a);
          g.fillStyle = '#ffd84d'; g.fill();
          g.shadowBlur = 0; g.globalAlpha = 1;
        }
      }
      // grid lines
      g.strokeStyle = U.alpha(tc, 0.35); g.lineWidth = 1.5;
      g.beginPath();
      for (let k = 1; k < geo.cols; k++) { g.moveTo(bx + k * cell, by); g.lineTo(bx + k * cell, by + bh); }
      for (let k = 1; k < geo.rows; k++) { g.moveTo(bx, by + k * cell); g.lineTo(bx + bw, by + k * cell); }
      g.stroke();
      // orbs
      const rad = cell * 0.17;
      for (const c of all()) {
        if (c.blocked || !c.n || c.o < 0) continue;
        let { x, y } = cellXY(c);
        if (c.slide) {
          if (dt > 0) c.slide.t -= dt;
          const f = Math.max(0, c.slide.t / 0.4);
          if (c.slide.wrap) { g.globalAlpha = 1 - f; } else { x += c.slide.dx * f; y += c.slide.dy * f; }
          if (c.slide.t <= 0) c.slide = null;
        }
        const k = cap(c), crit = c.n >= k - 1;
        if (c.pop) { if (dt > 0) c.pop = c.pop > 0 ? Math.max(0, c.pop - dt) : Math.min(0, c.pop + dt); }
        const sc = 1 + Math.abs(c.pop) * 1.2;
        const jit = crit ? 2.2 : 0;
        const spin = pulse * (crit ? 4 : 1.2) + c.a * 1.3 + c.b * 0.7;
        if (crit) {
          g.fillStyle = U.alpha(P[c.o].color, 0.16 + 0.1 * Math.sin(pulse * 10));
          g.beginPath(); g.arc(x, y, cell * 0.42, 0, 6.283); g.fill();
        }
        g.shadowColor = P[c.o].color; g.shadowBlur = crit ? 18 : 8;
        for (let m = 0; m < c.n; m++) {
          const q = orbPos(Math.min(c.n, 4), m, cell * 0.36, spin);
          drawOrb(x + q.x + U.rand(-jit, jit), y + q.y + U.rand(-jit, jit), rad * sc, P[c.o].color);
        }
        g.shadowBlur = 0; g.globalAlpha = 1;
      }
      // blocked tap feedback
      for (const c of all()) if (c.pop < 0 && (c.blocked || c.n === 0)) { if (dt > 0) c.pop = Math.min(0, c.pop + dt); }
      // flyers
      for (const f of flyers) {
        const a = cellXY(f.from), b = cellXY(f.to), t = Math.min(1, f.t), e = t * t * (3 - 2 * t);
        const x = U.lerp(a.x, b.x, e), y = U.lerp(a.y, b.y, e);
        g.shadowColor = P[f.o].color; g.shadowBlur = 20;
        drawOrb(x, y, rad * 1.1, P[f.o].color);
        g.shadowBlur = 0;
      }
      // armed bomb preview
      if (armed && state === 'input') {
        g.strokeStyle = `rgba(255,77,109,${0.5 + 0.4 * Math.sin(pulse * 8)})`; g.lineWidth = 4;
        g.setLineDash([10, 8]); g.strokeRect(bx + 2, by + 2, bw - 4, bh - 4); g.setLineDash([]);
      }
      // rings + particles
      for (let k = rings.length - 1; k >= 0; k--) {
        const r = rings[k]; r.t += dt;
        if (r.t > r.life) { rings.splice(k, 1); continue; }
        const f = r.t / r.life;
        g.strokeStyle = U.alpha(r.color, 1 - f); g.lineWidth = 5 * (1 - f) + 1;
        g.beginPath(); g.arc(r.x, r.y, U.lerp(r.r, r.max, f), 0, 6.283); g.stroke();
      }
      g.globalCompositeOperation = 'lighter';
      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k]; p.t += dt;
        if (p.t > p.life) { parts.splice(k, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93;
        g.globalAlpha = 1 - p.t / p.life; g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.s, 0, 6.283); g.fill();
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      if (flash > 0) { g.fillStyle = U.alpha(flashColor, Math.min(0.35, flash)); g.fillRect(-20, -20, ctx.W + 40, ctx.H + 40); flash -= dt; }
      g.restore();
    });

    // test hook
    ctx.root._ch = () => ({ state, turn, alive: alive.slice(), armed, bombUsed: bombUsed.slice(), moves: moves.slice(), turns,
      cells: all().map(c => ({ a: c.a, b: c.b, o: c.o, n: c.n, blocked: c.blocked, star: c.star, ...cellXY(c) })) });

    render();
    ctx.onStart = () => sayP(turn, `Первым ходит ${P[turn].name}`, { ms: 1500 });
  },
});
