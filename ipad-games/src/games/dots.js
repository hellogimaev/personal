registerGame({
  id: 'dots',
  title: 'Точки и квадраты',
  emoji: '▦',
  desc: 'Рисуй линии, замыкай квадраты, лови бонусы',
  rules: 'Ходите по очереди: чей ход, у того светится край.\n' +
    'Коснись между двумя точками — проведёшь линию (палец можно подвинуть, линия ставится, когда отпустишь).\n' +
    'Замкнул квадрат — он твой, и ты ходишь ещё раз. Больше очков — победа.\n' +
    '✖️2 — квадрат стоит 2 очка.\n' +
    '💣 Бомба — при замыкании стирает пару линий рядом.\n' +
    '❄️ Заморозка — следующий игрок пропускает ход.\n' +
    '💎 Кража — забираешь один квадрат у лидера.\n' +
    '🔁 Разворот (на троих) — порядок ходов меняется.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const P = ctx.players, N = ctx.n;
    const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", Roboto, sans-serif';
    const SHORT = N === 2 ? 5 : 6, LONG = N === 2 ? 6 : 7;
    const DEPTH = 80;
    const GEN = ['Красного', 'Синего', 'Жёлтого'];
    const ICON = { x2: '✖️2', bomb: '💣', freeze: '❄️', steal: '💎', rev: '🔁' };

    /* ---------- model ---------- */
    // dots (a,b): a in [0..SHORT], b in [0..LONG]; edges: t='a' joins (a,b)-(a+1,b); t='b' joins (a,b)-(a,b+1)
    const edges = [], emap = new Map();
    const addE = (t, a, b) => { const e = { t, a, b, o: -1, anim: 0, fade: 0, boxes: [] }; edges.push(e); emap.set(`${t}${a},${b}`, e); };
    for (let b = 0; b <= LONG; b++) for (let a = 0; a < SHORT; a++) addE('a', a, b);
    for (let b = 0; b < LONG; b++) for (let a = 0; a <= SHORT; a++) addE('b', a, b);
    const boxes = [];
    for (let a = 0; a < SHORT; a++) for (let b = 0; b < LONG; b++) {
      const bx = { a, b, o: -1, kind: null, pop: 0, es: [emap.get(`a${a},${b}`), emap.get(`a${a},${b + 1}`), emap.get(`b${a},${b}`), emap.get(`b${a + 1},${b}`)] };
      bx.es.forEach(e => e.boxes.push(bx));
      boxes.push(bx);
    }
    // specials
    const kinds = N === 2 ? ['x2', 'x2', 'bomb', 'bomb', 'freeze', 'steal'] : ['x2', 'x2', 'bomb', 'bomb', 'freeze', 'steal', 'rev', 'x2'];
    U.shuffle(boxes).slice(0, kinds.length).forEach((bx, k) => { bx.kind = kinds[k]; });

    const score = P.map(() => 0);
    let turn = U.randInt(0, N - 1), dir = 1, skipNext = false;
    let state = 'input';
    let preview = null, pid = null;
    const parts = [], rings = [];
    let pulse = 0, shake = 0, flash = 0, flashColor = '#fff';
    let geo = null;

    /* ---------- HUD ---------- */
    ctx.root.classList.add('g-dots');
    ctx.root.append(U.h('style', null, `
      .g-dots .bx{position:absolute;inset:8px 10px;border-radius:18px;display:flex;align-items:center;justify-content:center;gap:14px;padding:0 18px;
        background:#1a1f35;border:3px solid transparent;font-weight:900;color:#f2f4ff;transition:background .25s, box-shadow .25s, border-color .25s}
      .g-dots .bx .dot{width:30px;height:30px;border-radius:8px;background:var(--pc);flex:0 0 auto}
      .g-dots .bx .tx{flex:0 1 auto;min-width:0;font-size:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#9aa1c4}
      .g-dots .bx .tx b{color:var(--tc)}
      .g-dots .bx .fz{font-size:26px}
      .g-dots .bx .sc{font-size:40px;color:var(--pc);min-width:44px;text-align:center;margin-left:10px;transition:transform .2s}
      .g-dots .bx .sc.bump{transform:scale(1.35)}
      .g-dots .bx.on{background:color-mix(in srgb, var(--pc) 28%, #1a1f35);border-color:var(--pc);box-shadow:0 0 30px 6px var(--pc)}
      .g-dots .bx.on .tx{color:#fff}
      .g-dots .bx.win{background:var(--pc);border-color:#fff}
      .g-dots .bx.win .tx,.g-dots .bx.win .sc{color:#111}
    `));
    const { cv, g } = ctx.canvas();
    const hud = P.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH });
      const tx = U.h('div', { class: 'tx' }), sc = U.h('div', { class: 'sc' }, '0'), fz = U.h('div', { class: 'fz' });
      const bx = U.h('div', { class: 'bx' }, U.h('div', { class: 'dot' }), tx, fz, sc);
      z.el.append(bx);
      return { bx, tx, sc, fz };
    });
    const step = (i, d = dir) => (i + d + N) % N;
    function render(winners) {
      const frozen = skipNext ? step(turn) : -1;
      hud.forEach((h, i) => {
        h.bx.style.setProperty('--tc', P[turn].color);
        const on = state !== 'over' && i === turn;
        h.bx.classList.toggle('on', on);
        h.bx.classList.toggle('win', !!winners && winners.includes(i));
        if (h.sc.textContent !== String(score[i])) { h.sc.classList.add('bump'); setTimeout(() => h.sc.classList.remove('bump'), 220); }
        h.sc.textContent = score[i];
        h.fz.textContent = (i === frozen ? '❄️' : '') + (N === 3 && on ? (dir > 0 ? ' ↻' : ' ↺') : '');
        if (state === 'over') h.tx.textContent = winners.length === 0 ? 'Ничья' : winners.includes(i) ? 'Победа! 🏆' : 'Не в этот раз';
        else if (on) h.tx.textContent = 'Твой ход!';
        else h.tx.replaceChildren('Ход: ', U.h('b', null, P[turn].name));
      });
    }

    /* ---------- geometry ---------- */
    function layout() {
      const W = ctx.W, H = ctx.H;
      const r = N === 2 ? { x: 56, y: DEPTH, w: W - 112, h: H - 2 * DEPTH } : { x: DEPTH, y: 54, w: W - 2 * DEPTH, h: H - DEPTH - 54 };
      const portrait = r.h >= r.w;
      const cols = portrait ? SHORT : LONG, rows = portrait ? LONG : SHORT;
      const pad = 26;
      const cell = Math.floor(Math.min((r.w - 2 * pad) / cols, (r.h - 2 * pad) / rows));
      const bw = cell * cols, bh = cell * rows;
      geo = { portrait, cols, rows, cell, bx: Math.round(r.x + (r.w - bw) / 2), by: Math.round(r.y + (r.h - bh) / 2), bw, bh };
    }
    layout();
    ctx.onResize(layout);
    function dotXY(a, b) {
      const { portrait, cell, bx, by } = geo;
      return portrait ? { x: bx + a * cell, y: by + b * cell } : { x: bx + b * cell, y: by + a * cell };
    }
    function edgeEnds(e) { return [dotXY(e.a, e.b), e.t === 'a' ? dotXY(e.a + 1, e.b) : dotXY(e.a, e.b + 1)]; }
    function boxXY(bx) { const p = dotXY(bx.a + 0.5, bx.b + 0.5); return p; }
    function segDist(px, py, p, q) {
      const dx = q.x - p.x, dy = q.y - p.y, L = dx * dx + dy * dy;
      const t = U.clamp(((px - p.x) * dx + (py - p.y) * dy) / L, 0, 1);
      return Math.hypot(px - (p.x + t * dx), py - (p.y + t * dy));
    }
    function nearestEdge(x, y) {
      const { cell, bx, by, bw, bh } = geo;
      if (x < bx - cell * 0.5 || x > bx + bw + cell * 0.5 || y < by - cell * 0.5 || y > by + bh + cell * 0.5) return null;
      let best = null, bd = 1e9;
      for (const e of edges) {
        if (e.o >= 0) continue;
        const [p, q] = edgeEnds(e);
        const d = segDist(x, y, p, q);
        if (d < bd) { bd = d; best = e; }
      }
      return bd < cell * 0.6 ? best : null;
    }

    /* ---------- juice ---------- */
    function burst(x, y, color, n = 14, sp = 200) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.283, s = U.rand(0.25, 1) * sp;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.35, 0.8), t: 0, color, s: U.rand(2, 5) });
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
        tShown = { t0: ctx.time, ms: (o.ms ?? 1700) / 1000, els: ctx.toast(it.text, Object.assign({}, o, { ms: 600000 })) };
      }
    });
    function sayP(i, text, o = {}) { return say(text, Object.assign({ color: P[i].color, fg: '#111' }, o)); }

    /* ---------- input ---------- */
    ctx.pointer(cv, {
      down(id, x, y) {
        if (ctx.paused || state !== 'input' || pid != null) return;
        pid = id;
        preview = nearestEdge(x, y);
      },
      move(id, x, y) {
        if (id !== pid || state !== 'input') return;
        preview = nearestEdge(x, y);
      },
      up(id, x, y) {
        if (id !== pid) return;
        pid = null;
        const e = preview; preview = null;
        if (!e || state !== 'input' || ctx.paused || e.o >= 0) return;
        playEdge(e);
      },
    });

    /* ---------- moves ---------- */
    function playEdge(e) {
      const me = turn;
      e.o = me; e.anim = 0.001;
      const [p, q] = edgeEnds(e);
      burst((p.x + q.x) / 2, (p.y + q.y) / 2, P[me].color, 8, 120);
      const closed = e.boxes.filter(bx => bx.o < 0 && bx.es.every(s => s.o >= 0));
      const msgs = [];
      for (const bx of closed) {
        bx.o = me; bx.pop = 0.45;
        score[me] += bx.kind === 'x2' ? 2 : 1;
        const c = boxXY(bx);
        burst(c.x, c.y, P[me].color, 26, 280); ring(c.x, c.y, geo.cell * 0.3, P[me].color, 2.4, 0.5);
        if (bx.kind) msgs.push(bx);
      }
      let skipMsg = null;
      for (const bx of msgs) special(bx, me);
      if (!closed.length) {
        let nt = step(turn);
        if (skipNext) {
          skipNext = false;
          skipMsg = nt;
          nt = step(nt);
        }
        turn = nt;
        if (skipMsg != null) sayP(skipMsg, `❄️ ${P[skipMsg].name} пропускает ход`, { ms: 1600 });
      }
      if (boxes.every(bx => bx.o >= 0)) { finish(); return; }
      render();
    }
    function special(bx, me) {
      const c = boxXY(bx);
      if (bx.kind === 'x2') {
        sayP(me, `✖️2 ${P[me].name}: двойной квадрат!`, { ms: 1400 });
        ring(c.x, c.y, geo.cell * 0.3, '#ffd84d', 3, 0.6); burst(c.x, c.y, '#ffd84d', 24, 260);
      } else if (bx.kind === 'bomb') {
        // erase up to 2 drawn lines near the box whose neighbouring boxes are all still free
        const near = edges.filter(e => e.o >= 0 && e.boxes.every(b2 => b2.o < 0) &&
          e.boxes.some(b2 => Math.abs(b2.a - bx.a) + Math.abs(b2.b - bx.b) <= 2));
        const pick = U.shuffle(near).slice(0, 2);
        for (const e of pick) {
          e.o = -1; e.fade = 0.5;
          const [p, q] = edgeEnds(e);
          burst((p.x + q.x) / 2, (p.y + q.y) / 2, '#ffb347', 20, 260);
        }
        burst(c.x, c.y, '#ffb347', 40, 420); ring(c.x, c.y, geo.cell * 0.4, '#ffb347', 3.5, 0.6);
        shake = 0.45; flash = 0.3; flashColor = '#ffb347';
        say(pick.length ? `💣 Бум! Стёрто линий: ${pick.length}` : '💣 Бум! Но стирать нечего', { color: '#ffb347', fg: '#111', ms: 1600 });
      } else if (bx.kind === 'freeze') {
        skipNext = true;
        ring(c.x, c.y, geo.cell * 0.3, '#9be7ff', 3.2, 0.7); burst(c.x, c.y, '#9be7ff', 30, 260);
        flash = 0.25; flashColor = '#9be7ff';
        say('❄️ Заморозка: следующий пропустит ход', { color: '#9be7ff', fg: '#111', ms: 1800 });
      } else if (bx.kind === 'rev') {
        dir = -dir;
        ring(c.x, c.y, geo.cell * 0.3, '#b06bff', 3.2, 0.7); burst(c.x, c.y, '#b06bff', 30, 260);
        say('🔁 Разворот: ходы в обратную сторону', { color: '#b06bff', fg: '#fff', ms: 1800 });
      } else if (bx.kind === 'steal') {
        const opp = P.filter(p => p.i !== me && boxes.some(b2 => b2.o === p.i)).sort((x, y) => score[y.i] - score[x.i]);
        if (!opp.length) { say('💎 Кража: красть пока нечего', { ms: 1400 }); return; }
        const v = opp[0].i;
        const cand = boxes.filter(b2 => b2.o === v);
        const t = cand.find(b2 => b2.kind === 'x2') || U.pick(cand);
        t.o = me; t.pop = 0.5;
        const val = t.kind === 'x2' ? 2 : 1;
        score[v] -= val; score[me] += val;
        const tc = boxXY(t);
        burst(tc.x, tc.y, P[me].color, 30, 300); ring(tc.x, tc.y, geo.cell * 0.3, '#ffffff', 3, 0.6);
        sayP(me, `💎 ${P[me].name} крадёт квадрат у ${GEN[v]}`, { ms: 1900 });
      }
    }
    function finish() {
      state = 'over';
      const top = Math.max(...score);
      const winners = P.filter(p => score[p.i] === top).map(p => p.i);
      const ws = winners.length === N ? [] : winners;
      render(ws);
      for (const bx of boxes) if (ws.includes(bx.o)) { const c = boxXY(bx); burst(c.x, c.y, P[bx.o].color, 6, 220); }
      say(ws.length === 1 ? `🏆 ${P[ws[0]].name} побеждает!` : ws.length ? 'Ничья среди лидеров!' : 'Ничья!', { ms: 2200 });
      ctx.after(2300, () => ctx.end({ winners: ws, scores: score.slice(), msg: 'Квадраты: ' + score.join(' : ') }));
    }

    /* ---------- drawing ---------- */
    ctx.loop((dt) => {
      pulse += dt;
      if (!geo) return;
      const { cell, bx, by, bw, bh } = geo;
      g.save();
      g.fillStyle = '#0f1220'; g.fillRect(0, 0, ctx.W, ctx.H);
      if (shake > 0) { g.translate(U.rand(-7, 7) * shake, U.rand(-7, 7) * shake); shake -= dt; }
      const tc = state === 'over' ? '#ffffff' : P[turn].color;
      // board backdrop with glow in current player's colour
      g.shadowColor = tc; g.shadowBlur = 26 + 10 * Math.sin(pulse * 3);
      g.fillStyle = '#141933';
      g.beginPath(); g.roundRect(bx - 22, by - 22, bw + 44, bh + 44, 20); g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = U.alpha(tc, 0.8); g.lineWidth = 3; g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      // boxes
      for (const b of boxes) {
        const c = boxXY(b);
        if (b.pop > 0 && dt > 0) b.pop = Math.max(0, b.pop - dt);
        if (b.o >= 0) {
          const s = (1 - b.pop * 0.8) * (cell - 10);
          g.fillStyle = U.alpha(P[b.o].color, 0.6 + b.pop);
          g.beginPath(); g.roundRect(c.x - s / 2, c.y - s / 2, s, s, 10); g.fill();
          g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2; g.stroke();
          if (b.kind) { g.globalAlpha = 0.55; g.font = `${Math.round(cell * 0.3)}px ${FONT}`; g.fillText(b.kind === 'x2' ? '✖️2' : ICON[b.kind], c.x, c.y + 2); g.globalAlpha = 1; }
          else { g.fillStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.arc(c.x, c.y, cell * 0.12, 0, 6.283); g.fill(); }
        } else if (b.kind) {
          const k = 0.5 + 0.5 * Math.sin(pulse * 3 + b.a + b.b);
          const col = { x2: '#ffd84d', bomb: '#ffb347', freeze: '#9be7ff', steal: '#7dffb0', rev: '#b06bff' }[b.kind];
          const gr = g.createRadialGradient(c.x, c.y, 2, c.x, c.y, cell * 0.45);
          gr.addColorStop(0, U.alpha(col, 0.28 + 0.12 * k)); gr.addColorStop(1, U.alpha(col, 0));
          g.fillStyle = gr; g.fillRect(c.x - cell / 2, c.y - cell / 2, cell, cell);
          g.font = `${Math.round(cell * (0.34 + 0.03 * k))}px ${FONT}`;
          if (b.kind === 'x2') { g.font = `900 ${Math.round(cell * 0.3)}px ${FONT}`; g.fillStyle = col; g.fillText('×2', c.x, c.y + 2); }
          else g.fillText(ICON[b.kind], c.x, c.y + 2);
        }
      }
      // empty edge hints
      g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2; g.setLineDash([4, 8]);
      g.beginPath();
      for (const e of edges) if (e.o < 0 && e.fade <= 0) { const [p, q] = edgeEnds(e); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); }
      g.stroke(); g.setLineDash([]);
      // fading (bombed) edges
      for (const e of edges) if (e.fade > 0) {
        if (dt > 0) e.fade -= dt;
        const [p, q] = edgeEnds(e);
        g.strokeStyle = `rgba(255,179,71,${Math.max(0, e.fade * 2)})`; g.lineWidth = 8; g.lineCap = 'round';
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
      }
      // drawn edges
      g.lineCap = 'round';
      for (const e of edges) {
        if (e.o < 0) continue;
        if (e.anim > 0 && e.anim < 1 && dt > 0) e.anim = Math.min(1, e.anim + dt / 0.18);
        const f = e.anim > 0 ? e.anim : 1;
        const [p, q] = edgeEnds(e);
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        g.strokeStyle = P[e.o].color; g.lineWidth = Math.max(6, cell * 0.075);
        g.shadowColor = P[e.o].color; g.shadowBlur = f < 1 ? 20 : 8;
        g.beginPath(); g.moveTo(mx + (p.x - mx) * f, my + (p.y - my) * f); g.lineTo(mx + (q.x - mx) * f, my + (q.y - my) * f); g.stroke();
      }
      g.shadowBlur = 0;
      // preview
      if (preview && state === 'input') {
        const [p, q] = edgeEnds(preview);
        g.strokeStyle = U.alpha(P[turn].color, 0.45 + 0.3 * Math.sin(pulse * 10)); g.lineWidth = Math.max(10, cell * 0.11);
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
      }
      g.lineCap = 'butt';
      // dots
      const dr = Math.max(5, cell * 0.06);
      g.fillStyle = '#e8ecff'; g.shadowColor = '#9fb2ff'; g.shadowBlur = 10;
      for (let a = 0; a <= SHORT; a++) for (let b = 0; b <= LONG; b++) { const p = dotXY(a, b); g.beginPath(); g.arc(p.x, p.y, dr, 0, 6.283); g.fill(); }
      g.shadowBlur = 0;
      // fx
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
    ctx.root._dt = () => ({ state, turn, dir, skipNext, score: score.slice(),
      free: edges.filter(e => e.o < 0).map(e => { const [p, q] = edgeEnds(e); return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, closes: e.boxes.some(b => b.es.filter(s => s.o >= 0).length === 3) }; }) });

    render();
    ctx.onStart = () => sayP(turn, `Первым ходит ${P[turn].name}`, { ms: 1500 });
  },
});
