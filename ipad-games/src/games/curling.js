registerGame({
  id: 'curling',
  title: 'Кёрлинг',
  emoji: '🥌',
  desc: 'Щелчком запусти камень к центру мишени',
  rules: 'Ходите по очереди. Чей бросок — у того светится край.\n' +
    'Положи палец на свой камень у своего края, разгони и отпусти — скорость броска берётся из движения пальца. Медленно отпустил — камень просто переставлен.\n' +
    'Камни сталкиваются: выбивай чужие. Улетел за край — камень пропал.\n' +
    'В конце энда очки: центр 5, середина 3, край 1. 3 камня на игрока, 3 энда.\n' +
    '💣 Бомба — каждый 2-й камень может быть бомбой: взрывается при остановке и раскидывает всех.\n' +
    '🪨 Тяжёлый — тройной вес, сносит всё.\n' +
    '🧊 Лёд — на пятне нет трения.\n' +
    '🌀 Вихрь — закручивает камни.\n' +
    '⭐ Звезда — камень на ней даёт +2.\n' +
    '🔨 Отстающий бросает последним.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const P = ctx.players, N = ctx.n;
    const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", Roboto, sans-serif';
    const ENDS = 3, PER = 3, DEPTH = 64;
    const SR = 0.034;                     // stone radius (S units)
    const R1 = 0.06, R2 = 0.12, R3 = 0.18; // house rings
    const MU = 1.3, DRAG = 0.5, VMAX = 3.0, VSCALE = 0.8, E = 0.92;
    const BOMB_R = 0.22;

    const score = P.map(() => 0);
    let end = 0, order = [], turnIdx = 0, state = 'idle';
    let stones = [], cur = null, hazards = [];
    let drag = null;                       // {id, samples:[{t,x,y}]}
    const parts = [], rings = [], floats = [];
    let shake = 0, flash = 0, flashColor = '#fff', pulse = 0;
    let W, H, S, cx, cy, B = {};           // B = sheet bounds in world units

    ctx.root.classList.add('g-curling');
    ctx.root.append(U.h('style', null, `
      .g-curling .bx{position:absolute;inset:6px 8px;border-radius:16px;display:flex;align-items:center;justify-content:center;gap:12px;
        background:#1a1f35;border:2px solid transparent;font-weight:900;color:#f2f4ff;padding:0 12px;white-space:nowrap;overflow:hidden;
        transition:background .25s, box-shadow .25s, border-color .25s}
      .g-curling .bx .dot{width:26px;height:26px;border-radius:50%;background:var(--pc);flex:0 0 auto;box-shadow:inset 0 -4px 0 rgba(0,0,0,.3)}
      .g-curling .bx .sc{font-size:30px;color:var(--pc);min-width:36px;text-align:center}
      .g-curling .bx .st{font-size:20px;letter-spacing:2px}
      .g-curling .bx .tx{font-size:18px;color:#9aa1c4;overflow:hidden;text-overflow:ellipsis}
      .g-curling .bx.on{background:color-mix(in srgb, var(--pc) 30%, #1a1f35);border-color:var(--pc);box-shadow:0 0 28px 4px var(--pc)}
      .g-curling .bx.on .tx{color:#fff}
    `));

    const { cv, g } = ctx.canvas();

    /* ---------- HUD ---------- */
    const hud = P.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH });
      const sc = U.h('div', { class: 'sc' }, '0'), st = U.h('div', { class: 'st' }), tx = U.h('div', { class: 'tx' });
      const bx = U.h('div', { class: 'bx' }, U.h('div', { class: 'dot' }), sc, st, tx);
      z.el.append(bx);
      return { bx, sc, st, tx };
    });
    function thrownBy(i) { let k = 0; for (let t = 0; t < turnIdx; t++) if (order[t % N] === i) k++; return k; }
    const special = P.map(() => ({}));
    function specialFor(i) { return special[i][end] || 'bomb'; }
    function renderHud() {
      const ti = state === 'aim' || state === 'roll' ? order[turnIdx % N] : -1;
      hud.forEach((h, i) => {
        h.sc.textContent = score[i];
        const used = thrownBy(i) + (state === 'roll' && ti === i ? 0 : 0);
        let s = '';
        for (let k = 0; k < PER; k++) s += k < used ? '·' : (k === 1 ? (specialFor(i) === 'bomb' ? '💣' : '🪨') : '🥌');
        h.st.textContent = s;
        h.bx.classList.toggle('on', i === ti && state === 'aim');
        h.tx.textContent = state === 'aim' ? (i === ti ? (cur && cur.kind === 'bomb' ? 'Бросай бомбу! 💣' : cur && cur.kind === 'heavy' ? 'Тяжёлый бросок! 🪨' : 'Твой бросок!') : `бросает ${P[ti].name}`)
          : state === 'roll' ? 'катится…' : `энд ${Math.min(end, ENDS)}/${ENDS}`;
      });
    }

    /* ---------- geometry ---------- */
    function layout() {
      W = ctx.W; H = ctx.H; S = Math.min(W, H);
      const s = P.map(p => p.side), m = 8;
      const x0 = (s.includes('left') ? DEPTH : 0) + m, x1 = W - (s.includes('right') ? DEPTH : 0) - m;
      const y0 = (s.includes('top') ? DEPTH : 0) + m, y1 = H - DEPTH - m;
      cx = (x0 + x1) / 2;
      if (N === 2) cy = (y0 + y1) / 2;
      else cy = U.clamp(y1 - (cx - x0), y0 + (R3 + 0.06) * S, y1 - (R3 + 0.2) * S);
      B = { x0: (x0 - cx) / S, x1: (x1 - cx) / S, y0: (y0 - cy) / S, y1: (y1 - cy) / S };
    }
    layout();
    ctx.onResize(() => {
      layout();
      for (const st of stones) { st.u = U.clamp(st.u, B.x0 + SR, B.x1 - SR); st.v = U.clamp(st.v, B.y0 + SR, B.y1 - SR); }
      if (cur && !cur.thrown) { const L = launch(cur.o); cur.u = L.u; cur.v = L.v; }
      drag = null;
    });
    const X = (u) => cx + u * S, Y = (v) => cy + v * S;
    function edgeDist(i) { // distance (world) from center to player's sheet edge
      const sd = P[i].side;
      return sd === 'bottom' ? B.y1 : sd === 'top' ? -B.y0 : sd === 'left' ? -B.x0 : B.x1;
    }
    function hackDepth(i) { return U.clamp(edgeDist(i) - R3 - 0.05, 0.12, 0.24); }
    function launch(i) {
      const v = ctx.inward(i), d = edgeDist(i) - SR * 2.2;
      return { u: -v.x * d, v: -v.y * d };
    }
    // signed depth of a world point into player i's hack band (0 at edge, grows inward)
    function depthFromEdge(i, u, v) {
      const iv = ctx.inward(i);
      return edgeDist(i) + (u * iv.x + v * iv.y);
    }

    /* ---------- juice ---------- */
    function burst(x, y, color, n = 16, sp = 220) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.283, s = U.rand(0.25, 1) * sp;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.35, 0.8), t: 0, color, s: U.rand(2, 5) });
      }
    }
    function ring(x, y, r, color, grow = 2.4, life = 0.5) { rings.push({ x, y, r, max: r * grow, color, life, t: 0 }); }
    // toasts anchored between the house and each player's throwing line (keeps the house visible)
    const tLayer = U.h('div', { class: 'toast-layer' });
    ctx.root.append(tLayer);
    const live = P.map(() => []);
    function say(text, o = {}) {
      const ms = o.ms ?? 1600;
      const els = P.map(p => {
        const iv = ctx.inward(p.i);
        const line = edgeDist(p.i) - hackDepth(p.i);
        const mid = Math.max(R3 + 0.045, (R3 + line) / 2) * S + live[p.i].length * 52;
        const t = U.h('div', { class: 'toast' }, text);
        if (o.color) t.style.background = o.color;
        if (o.fg) t.style.color = o.fg;
        if (o.size) t.style.fontSize = o.size + 'px';
        Object.assign(t.style, { left: X(-iv.x * mid / S) + 'px', top: Y(-iv.y * mid / S) + 'px', transform: `translate(-50%,-50%) rotate(${p.rot}deg)` });
        tLayer.append(t);
        live[p.i].push(t);
        return t;
      });
      ctx.after(ms, () => els.forEach((e, i) => { e.remove(); live[i] = live[i].filter(x => x !== e); }));
      return els;
    }
    function floatText(u, v, text, color, o) { floats.push({ u, v, text, color, o, t: 0, life: 2.4 }); }

    /* ---------- ends & turns ---------- */
    function placeHazards() {
      hazards = [];
      const L = P.map(p => launch(p.i));
      const okSpot = (u, v, r, minC, extra = 0.03) => {
        if (u - r < B.x0 + 0.02 || u + r > B.x1 - 0.02 || v - r < B.y0 + 0.02 || v + r > B.y1 - 0.02) return false;
        if (Math.hypot(u, v) < minC) return false;
        if (L.some(l => Math.hypot(u - l.u, v - l.v) < r + 0.14)) return false;
        if (hazards.some(h => Math.hypot(u - h.u, v - h.v) < r + h.r + extra)) return false;
        return true;
      };
      const put = (kind, r, minC, maxC) => {
        for (let k = 0; k < 200; k++) {
          const a = U.rand(0, 6.283), d = U.rand(minC, maxC);
          const u = Math.cos(a) * d, v = Math.sin(a) * d;
          if (okSpot(u, v, r, minC)) { hazards.push({ kind, u, v, r, spin: Math.random() < 0.5 ? 1 : -1 }); return true; }
        }
        return false;
      };
      put('star', 0.035, R1 + 0.01, R3 - 0.02);
      const nIce = U.randInt(1, 2);
      for (let k = 0; k < nIce; k++) put('ice', U.rand(0.07, 0.1), 0.2, 0.5);
      if (end >= 2 || Math.random() < 0.5) put('vortex', 0.095, 0.22, 0.5);
    }
    function newEnd() {
      end++;
      stones = []; cur = null;
      placeHazards();
      // comeback: lowest total throws last (hammer)
      let base = P.map(p => p.i);
      const rotBy = (end - 1) % N;
      base = base.slice(rotBy).concat(base.slice(0, rotBy));
      const minS = Math.min(...score);
      const lows = base.filter(i => score[i] === minS);
      let hammer = null;
      if (end > 1 && lows.length < N) {
        hammer = lows[lows.length - 1];
        base = base.filter(i => i !== hammer).concat([hammer]);
      }
      order = base;
      turnIdx = 0;
      P.forEach(p => { special[p.i][end] = Math.random() < 0.6 ? 'bomb' : 'heavy'; });
      const hz = ['⭐ +2'];
      if (hazards.some(h => h.kind === 'ice')) hz.push('🧊 лёд');
      if (hazards.some(h => h.kind === 'vortex')) hz.push('🌀 вихрь');
      say(`Энд ${end}/${ENDS}: ${hz.join(' · ')}`, { ms: 2200, color: '#fff', fg: '#111' });
      if (hammer != null) ctx.after(2300, () => say(`🔨 ${P[hammer].name} бросает последним`, { ms: 2000, color: P[hammer].color, fg: '#111' }));
      ctx.after(hammer != null ? 1800 : 900, nextTurn);
      state = 'idle';
      renderHud();
    }
    function nextTurn() {
      if (turnIdx >= N * PER) { scoreEnd(); return; }
      const i = order[turnIdx % N];
      const k = thrownBy(i);
      const kind = k === 1 ? specialFor(i) : 'norm';
      const L = launch(i);
      cur = { u: L.u, v: L.v, vu: 0, vv: 0, o: i, kind, m: kind === 'heavy' ? 3 : 1, thrown: false, fuse: 0, out: 0, trail: [], hit: 0, born: ctx.time };
      stones.push(cur);
      state = 'aim';
      ring(X(cur.u), Y(cur.v), SR * S, P[i].color, 3, 0.6);
      if (kind === 'bomb') say(`💣 ${P[i].name}: камень-бомба!`, { color: P[i].color, fg: '#111', ms: 2000 });
      if (kind === 'heavy') say(`🪨 ${P[i].name}: тяжёлый камень ×3`, { color: P[i].color, fg: '#111', ms: 2000 });
      renderHud();
    }
    function throwStone(vu, vv) {
      cur.vu = vu; cur.vv = vv; cur.thrown = true;
      state = 'roll';
      turnIdx++;
      burst(X(cur.u), Y(cur.v), '#cfe8ff', 12, 160);
      renderHud();
    }
    function settled() {
      if (state !== 'roll') return;
      state = 'wait';
      ctx.after(450, nextTurn);
    }
    function pointsFor(st) {
      const d = Math.hypot(st.u, st.v);
      let p = d < R1 ? 5 : d < R2 ? 3 : d < R3 ? 1 : 0;
      const star = hazards.find(h => h.kind === 'star');
      const onStar = star && Math.hypot(st.u - star.u, st.v - star.v) < star.r + SR * 0.5;
      return { p, star: onStar ? 2 : 0 };
    }
    function scoreEnd() {
      state = 'score';
      cur = null;
      const got = P.map(() => 0);
      let delay = 0;
      for (const st of stones) {
        if (st.out) continue;
        const { p, star } = pointsFor(st);
        if (!p && !star) continue;
        got[st.o] += p + star;
        ctx.after(delay, () => {
          floatText(st.u, st.v, `+${p + star}${star ? ' ⭐' : ''}`, P[st.o].color, st.o);
          ring(X(st.u), Y(st.v), SR * S, P[st.o].color, 3.2, 0.7);
          burst(X(st.u), Y(st.v), P[st.o].color, 20, 240);
        });
        delay += 250;
      }
      ctx.after(delay + 300, () => {
        got.forEach((v, i) => { score[i] += v; });
        renderHud();
        const best = Math.max(...got);
        const msg = best === 0 ? `Энд ${end}: никто не попал` : `Энд ${end}: ` + P.map(p => `${p.name} +${got[p.i]}`).join(', ');
        say(msg, { ms: 2400 });
        if (end >= ENDS) {
          const top = Math.max(...score);
          const winners = P.filter(p => score[p.i] === top).map(p => p.i);
          state = 'over';
          ctx.after(2600, () => ctx.end({ winners: winners.length === N ? [] : winners, scores: score, msg: 'Очки: ' + score.join(' : ') }));
        } else ctx.after(2800, newEnd);
      });
      renderHud();
    }

    /* ---------- input ---------- */
    const sw = (x, y) => ({ u: (x - cx) / S, v: (y - cy) / S });
    ctx.pointer(cv, {
      down(id, x, y) {
        if (ctx.paused || state !== 'aim' || !cur || drag) return;
        if (U.dist(x, y, X(cur.u), Y(cur.v)) > SR * S * 2.6) return;
        drag = { id, ox: X(cur.u) - x, oy: Y(cur.v) - y, samples: [{ t: performance.now(), x, y }] };
      },
      move(id, x, y) {
        if (!drag || drag.id !== id || !cur || state !== 'aim') return;
        const now = performance.now();
        drag.samples.push({ t: now, x, y });
        while (drag.samples.length > 2 && now - drag.samples[0].t > 140) drag.samples.shift();
        const w = sw(x + drag.ox, y + drag.oy);
        const i = cur.o, hd = hackDepth(i);
        // keep the stone inside the throwing band
        const dEdge = depthFromEdge(i, w.u, w.v);
        const iv = ctx.inward(i);
        let u = w.u, v = w.v;
        if (dEdge < SR * 1.2) { u += iv.x * (SR * 1.2 - dEdge); v += iv.y * (SR * 1.2 - dEdge); }
        u = U.clamp(u, B.x0 + SR, B.x1 - SR); v = U.clamp(v, B.y0 + SR, B.y1 - SR);
        cur.u = u; cur.v = v;
        if (dEdge > hd) release(now); // crossed the line: auto-throw
      },
      up(id) {
        if (!drag || drag.id !== id) return;
        release(performance.now());
      },
    });
    function release(now) {
      const d = drag; drag = null;
      if (!d || !cur || state !== 'aim' || ctx.paused) return;
      const sm = d.samples.filter(s => now - s.t <= 80);
      const arr = sm.length >= 2 ? sm : d.samples.slice(-2);
      if (arr.length < 2) return;
      const a = arr[0], b = arr[arr.length - 1];
      const dt = Math.max(0.008, (b.t - a.t) / 1000);
      let vu = (b.x - a.x) / dt / S * VSCALE, vv = (b.y - a.y) / dt / S * VSCALE;
      const sp = Math.hypot(vu, vv);
      const iv = ctx.inward(cur.o);
      if (sp < 0.25 || (vu * iv.x + vv * iv.y) < 0.15) return; // just repositioned
      if (sp > VMAX) { vu *= VMAX / sp; vv *= VMAX / sp; }
      throwStone(vu, vv);
    }

    /* ---------- physics ---------- */
    function inHaz(st, kind) {
      for (const h of hazards) if (h.kind === kind && Math.hypot(st.u - h.u, st.v - h.v) < h.r) return h;
      return null;
    }
    function explode(b) {
      b.out = 1; b.dead = true;
      const x = X(b.u), y = Y(b.v);
      for (const st of stones) {
        if (st === b || st.out) continue;
        const du = st.u - b.u, dv = st.v - b.v, d = Math.hypot(du, dv) || 0.001;
        if (d > BOMB_R) continue;
        const imp = (1.6 * (1 - d / BOMB_R) + 0.35) / st.m;
        st.vu += du / d * imp; st.vv += dv / d * imp; st.hit = 0.4;
      }
      burst(x, y, '#ffb347', 50, 520); burst(x, y, '#fff3b0', 24, 300); burst(x, y, P[b.o].color, 20, 400);
      ring(x, y, SR * S, '#ffb347', BOMB_R / SR, 0.6); ring(x, y, SR * S, '#fff', BOMB_R / SR * 0.7, 0.4);
      shake = 0.5; flash = 0.4; flashColor = '#ffb347';
      say('💥 БУМ!', { ms: 900, color: '#ffb347', fg: '#111', size: 34 });
      if (state === 'wait' || state === 'roll') state = 'roll';
    }
    function step(dt) {
      for (const st of stones) {
        if (st.out || (!st.thrown && st === cur)) continue;
        const sp = Math.hypot(st.vu, st.vv);
        if (sp > 0) {
          const vx = inHaz(st, 'vortex');
          if (vx) { const a = vx.spin * 3.2 * dt, c = Math.cos(a), s = Math.sin(a); const nu = st.vu * c - st.vv * s; st.vv = st.vu * s + st.vv * c; st.vu = nu; }
          const fr = inHaz(st, 'ice') ? 0.1 : 1;
          const ns = Math.max(0, sp - (MU * fr + DRAG * sp * fr) * dt);
          if (ns < 0.012) { st.vu = 0; st.vv = 0; } else { st.vu *= ns / sp; st.vv *= ns / sp; }
          st.u += st.vu * dt; st.v += st.vv * dt;
          // off the sheet?
          if (st.u < B.x0 || st.u > B.x1 || st.v < B.y0 || st.v > B.y1) {
            st.out = 1;
            const x = X(U.clamp(st.u, B.x0, B.x1)), y = Y(U.clamp(st.v, B.y0, B.y1));
            burst(x, y, P[st.o].color, 22, 260); ring(x, y, SR * S, '#ff4d6d', 2.5, 0.5);
            floatText(st.u * 0.9, st.v * 0.9, '💨 за бортом', '#ff8ca0', st.o);
          }
        }
      }
      // collisions
      for (let a = 0; a < stones.length; a++) {
        const A = stones[a];
        if (A.out || (!A.thrown && A === cur)) continue;
        for (let b = a + 1; b < stones.length; b++) {
          const Bs = stones[b];
          if (Bs.out || (!Bs.thrown && Bs === cur)) continue;
          const du = Bs.u - A.u, dv = Bs.v - A.v, d = Math.hypot(du, dv);
          if (d >= SR * 2 || d === 0) continue;
          const nu = du / d, nv = dv / d;
          const ov = SR * 2 - d, mt = A.m + Bs.m;
          A.u -= nu * ov * Bs.m / mt; A.v -= nv * ov * Bs.m / mt;
          Bs.u += nu * ov * A.m / mt; Bs.v += nv * ov * A.m / mt;
          const rel = (Bs.vu - A.vu) * nu + (Bs.vv - A.vv) * nv;
          if (rel >= 0) continue;
          const j = -(1 + E) * rel / (1 / A.m + 1 / Bs.m);
          A.vu -= j * nu / A.m; A.vv -= j * nv / A.m;
          Bs.vu += j * nu / Bs.m; Bs.vv += j * nv / Bs.m;
          const x = X(A.u + nu * SR), y = Y(A.v + nv * SR), pw = Math.min(1, -rel / 1.5);
          burst(x, y, '#ffffff', 6 + Math.round(pw * 16), 120 + pw * 260);
          A.hit = Bs.hit = 0.25;
          if (pw > 0.4) { shake = Math.max(shake, 0.15 * pw); ring(x, y, 6, '#fff', 6, 0.3); }
        }
      }
    }

    /* ---------- loop ---------- */
    ctx.loop((dt) => {
      pulse += dt;
      if (dt > 0 && (state === 'roll' || state === 'wait' || state === 'score')) {
        const sub = 4;
        for (let k = 0; k < sub; k++) step(dt / sub);
        // bombs: fuse when stopped
        for (const st of stones) {
          if (st.out || st.kind !== 'bomb' || !st.thrown || st.dead) continue;
          if (st.vu === 0 && st.vv === 0) {
            if (!st.fuse) st.fuse = 0.8;
            st.fuse -= dt;
            if (st.fuse <= 0) explode(st);
          } else st.fuse = 0;
        }
        for (const st of stones) if (st.out) st.out += dt;
        stones = stones.filter(st => !st.out || st.out < 0.6);
        for (const st of stones) {
          if (st.out) continue;
          const sp = Math.hypot(st.vu, st.vv);
          if (sp > 0.05) { st.trail.push({ u: st.u, v: st.v }); if (st.trail.length > 14) st.trail.shift(); }
          else if (st.trail.length) st.trail.shift();
        }
        if (state === 'roll') {
          const moving = stones.some(st => !st.out && (st.vu || st.vv));
          const fusing = stones.some(st => !st.out && st.kind === 'bomb' && st.thrown && !st.dead);
          if (!moving && !fusing) settled();
        }
      }
      if (dt > 0) for (const st of stones) if (st.hit > 0) st.hit -= dt;
      draw(dt);
    });

    /* ---------- drawing ---------- */
    function draw(dt) {
      g.save();
      g.fillStyle = '#0a0c18'; g.fillRect(0, 0, W, H);
      if (shake > 0) { g.translate(U.rand(-8, 8) * shake, U.rand(-8, 8) * shake); shake -= dt; }
      // sheet
      const sx = X(B.x0), sy = Y(B.y0), sw2 = (B.x1 - B.x0) * S, sh = (B.y1 - B.y0) * S;
      const grd = g.createLinearGradient(sx, sy, sx + sw2, sy + sh);
      grd.addColorStop(0, '#1d2b4f'); grd.addColorStop(0.5, '#25375f'); grd.addColorStop(1, '#1b2747');
      g.fillStyle = grd;
      g.beginPath(); g.roundRect(sx, sy, sw2, sh, 18); g.fill();
      g.strokeStyle = 'rgba(255,77,109,.55)'; g.lineWidth = 3;
      g.shadowColor = '#ff4d6d'; g.shadowBlur = 14; g.stroke(); g.shadowBlur = 0;
      // ice scratches
      g.strokeStyle = 'rgba(255,255,255,.035)'; g.lineWidth = 1;
      for (let k = 0; k < 18; k++) {
        const yy = sy + (k + 0.5) * sh / 18;
        g.beginPath(); g.moveTo(sx + 10, yy); g.lineTo(sx + sw2 - 10, yy + 6); g.stroke();
      }
      // throwing bands
      const ti = state === 'aim' && cur ? cur.o : -1;
      for (const p of P) {
        const hd = hackDepth(p.i), iv = ctx.inward(p.i), on = p.i === ti;
        let rx, ry, rw, rh;
        const ed = edgeDist(p.i);
        if (p.side === 'bottom') { rx = sx; rw = sw2; ry = Y(ed - hd); rh = hd * S; }
        else if (p.side === 'top') { rx = sx; rw = sw2; ry = sy; rh = hd * S; }
        else if (p.side === 'left') { ry = sy; rh = sh; rx = sx; rw = hd * S; }
        else { ry = sy; rh = sh; rx = X(ed - hd); rw = hd * S; }
        g.fillStyle = U.alpha(p.color, on ? 0.13 + 0.05 * Math.sin(pulse * 5) : 0.05);
        g.fillRect(rx, ry, rw, rh);
        // hack line
        g.strokeStyle = U.alpha(p.color, on ? 0.9 : 0.3); g.lineWidth = on ? 3 : 2;
        g.setLineDash([12, 10]);
        g.beginPath();
        if (iv.y) { const ly = iv.y < 0 ? ry : ry + rh; g.moveTo(rx, ly); g.lineTo(rx + rw, ly); }
        else { const lx = iv.x > 0 ? rx + rw : rx; g.moveTo(lx, ry); g.lineTo(lx, ry + rh); }
        g.stroke(); g.setLineDash([]);
        if (on && !drag && cur && !cur.thrown) {
          const L = launch(p.i);
          g.save(); ctx.facing(g, p.i, X(L.u) + iv.x * SR * S * 3.4, Y(L.v) + iv.y * SR * S * 3.4);
          g.fillStyle = U.alpha('#ffffff', 0.55 + 0.35 * Math.sin(pulse * 6));
          g.font = `800 18px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('⇧ щёлкни камень', 0, 0);
          g.restore();
        }
      }
      // house
      const hx = X(0), hy = Y(0);
      const rc = [[R3, '#2d5bd7', 0.55], [R2, '#e8eeff', 0.22], [R1, '#ff4d6d', 0.6]];
      g.shadowColor = '#5b8cff'; g.shadowBlur = 30;
      for (const [r, c, a] of rc) {
        g.fillStyle = U.alpha(c, a); g.beginPath(); g.arc(hx, hy, r * S, 0, 6.283); g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.stroke();
      }
      g.fillStyle = '#fff'; g.beginPath(); g.arc(hx, hy, 0.012 * S, 0, 6.283); g.fill();
      // ring values facing the thrower (or bottom player)
      const fo = ti >= 0 ? ti : 0;
      g.save(); ctx.facing(g, fo, hx, hy);
      g.font = `900 ${Math.round(S * 0.026)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.fillText('5', 0, -R1 * S * 0.55); g.fillText('3', 0, -(R1 + R2) / 2 * S); g.fillText('1', 0, -(R2 + R3) / 2 * S);
      g.restore();
      // hazards
      for (const h of hazards) drawHazard(h);
      // stones
      for (const st of stones) drawStone(st);
      // aim indicator
      if (drag && cur && drag.samples.length >= 2) {
        const now = performance.now();
        const sm = drag.samples.filter(s => now - s.t <= 80);
        if (sm.length >= 2) {
          const a = sm[0], b = sm[sm.length - 1], dts = Math.max(0.008, (b.t - a.t) / 1000);
          const vu = (b.x - a.x) / dts / S * VSCALE, vv = (b.y - a.y) / dts / S * VSCALE, sp = Math.min(VMAX, Math.hypot(vu, vv));
          if (sp > 0.25) {
            const len = sp / VMAX * 0.3 * S, nx = vu / Math.hypot(vu, vv), ny = vv / Math.hypot(vu, vv);
            const x0 = X(cur.u), y0 = Y(cur.v);
            g.strokeStyle = U.alpha(P[cur.o].color, 0.8); g.lineWidth = 6; g.lineCap = 'round';
            g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + nx * len, y0 + ny * len); g.stroke(); g.lineCap = 'butt';
          }
        }
      }
      // rings fx
      for (let k = rings.length - 1; k >= 0; k--) {
        const r = rings[k]; r.t += dt;
        if (r.t > r.life) { rings.splice(k, 1); continue; }
        const f = r.t / r.life;
        g.strokeStyle = U.alpha(r.color, 1 - f); g.lineWidth = 6 * (1 - f) + 1;
        g.beginPath(); g.arc(r.x, r.y, U.lerp(r.r, r.max, f), 0, 6.283); g.stroke();
      }
      // particles
      g.globalCompositeOperation = 'lighter';
      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k]; p.t += dt;
        if (p.t > p.life) { parts.splice(k, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93;
        g.globalAlpha = 1 - p.t / p.life; g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.s, 0, 6.283); g.fill();
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      // floating texts
      for (let k = floats.length - 1; k >= 0; k--) {
        const f = floats[k]; f.t += dt;
        if (f.t > f.life) { floats.splice(k, 1); continue; }
        const a = Math.min(1, (f.life - f.t) * 2);
        const iv = ctx.inward(f.o);
        g.save(); ctx.facing(g, f.o, X(f.u) + iv.x * f.t * 12, Y(f.v) + iv.y * f.t * 12);
        g.globalAlpha = a;
        g.font = `900 ${Math.round(S * 0.04)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(f.text, 0, -SR * S * 1.6);
        g.fillStyle = f.color; g.fillText(f.text, 0, -SR * S * 1.6);
        g.restore();
      }
      if (flash > 0) { g.fillStyle = U.alpha(flashColor, Math.min(0.4, flash)); g.fillRect(-20, -20, W + 40, H + 40); flash -= dt; }
      g.restore();
    }
    function drawHazard(h) {
      const x = X(h.u), y = Y(h.v), r = h.r * S;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (h.kind === 'ice') {
        const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        gr.addColorStop(0, 'rgba(220,250,255,.55)'); gr.addColorStop(1, 'rgba(120,220,255,.18)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
        g.strokeStyle = 'rgba(180,240,255,.7)'; g.lineWidth = 2; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3;
        const gl = (pulse * 0.6) % 2;
        g.beginPath(); g.arc(x, y, r * 0.7, -2.4 + gl, -1.7 + gl); g.stroke();
        g.font = `${Math.round(r * 0.6)}px ${FONT}`; g.globalAlpha = 0.85; g.fillText('🧊', x, y); g.globalAlpha = 1;
      } else if (h.kind === 'vortex') {
        g.fillStyle = 'rgba(176,107,255,.14)'; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
        g.strokeStyle = 'rgba(176,107,255,.75)'; g.lineWidth = 3;
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          for (let s = 0; s <= 30; s++) {
            const f = s / 30, a = h.spin * (pulse * 2.5 + k * 2.094 + f * 4), rr = r * (1 - f * 0.85);
            const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
            s ? g.lineTo(px, py) : g.moveTo(px, py);
          }
          g.stroke();
        }
        g.font = `${Math.round(r * 0.5)}px ${FONT}`; g.fillText('🌀', x, y);
      } else if (h.kind === 'star') {
        const sc = 1 + 0.08 * Math.sin(pulse * 4);
        g.shadowColor = '#ffd84d'; g.shadowBlur = 22;
        g.fillStyle = 'rgba(255,216,77,.25)'; g.beginPath(); g.arc(x, y, r * sc, 0, 6.283); g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = '#ffd84d'; g.lineWidth = 2; g.setLineDash([5, 5]); g.stroke(); g.setLineDash([]);
        g.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = pulse * 0.6 - Math.PI / 2 + k * Math.PI / 5, rr = (k % 2 ? 0.42 : 0.85) * r * sc;
          k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        g.closePath(); g.fillStyle = '#ffd84d'; g.shadowColor = '#ffd84d'; g.shadowBlur = 14; g.fill(); g.shadowBlur = 0;
        g.font = `900 ${Math.round(r * 0.55)}px ${FONT}`; g.fillStyle = '#5a3d00'; g.fillText('+2', x, y + 1);
      }
    }
    function drawStone(st) {
      let x = X(st.u), y = Y(st.v), r = SR * S;
      const col = P[st.o].color;
      // trail
      if (st.trail.length > 1) {
        for (let k = 1; k < st.trail.length; k++) {
          const a = k / st.trail.length;
          g.strokeStyle = U.alpha(col, a * 0.35); g.lineWidth = r * 1.4 * a;
          g.beginPath(); g.moveTo(X(st.trail[k - 1].u), Y(st.trail[k - 1].v)); g.lineTo(X(st.trail[k].u), Y(st.trail[k].v)); g.stroke();
        }
      }
      let alpha = 1, scale = st.m > 1 ? 1.12 : 1;
      if (st.out) { alpha = Math.max(0, 1 - st.out / 0.6); scale *= 1 - st.out * 0.8; }
      if (alpha <= 0) return;
      r *= scale;
      g.globalAlpha = alpha;
      const active = st === cur && state === 'aim';
      if (active) {
        g.strokeStyle = U.alpha(col, 0.5 + 0.4 * Math.sin(pulse * 6)); g.lineWidth = 4;
        g.beginPath(); g.arc(x, y, r * 1.9 + 4 * Math.sin(pulse * 6), 0, 6.283); g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(x + 3, y + 4, r, 0, 6.283); g.fill();
      g.fillStyle = st.m > 1 ? '#5b5f70' : '#8c93a8'; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
      g.shadowColor = col; g.shadowBlur = st.hit > 0 || active ? 24 : 10;
      g.fillStyle = col; g.beginPath(); g.arc(x, y, r * 0.74, 0, 6.283); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(x - r * 0.2, y - r * 0.25, r * 0.35, r * 0.18, -0.5, 0, 6.283); g.fill();
      if (st.kind !== 'norm') {
        const blink = st.fuse > 0 && Math.sin(pulse * 30) > 0;
        if (blink) { g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); }
        g.font = `${Math.round(r * 1.05)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(st.kind === 'bomb' ? '💣' : '🪨', x, y + 1);
      }
      g.globalAlpha = 1;
    }

    // test hook
    ctx.root._cu = () => ({ state, end, score: score.slice(), turnIdx, S, cx, cy, cur: cur && { u: cur.u, v: cur.v, o: cur.o, kind: cur.kind, thrown: cur.thrown },
      stones: stones.map(s => ({ u: s.u, v: s.v, o: s.o, out: s.out })), hazards });

    renderHud();
    newEnd();
  },
});
