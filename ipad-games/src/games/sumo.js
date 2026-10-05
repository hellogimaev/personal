registerGame({
  id: 'sumo',
  title: 'Сумо',
  emoji: '🥋',
  desc: 'Толкайся, хватай бонусы, вытолкни всех с арены',
  rules: 'У каждого тяжёлый шар своего цвета на арене.\n' +
    'Управление — джойстик: коснись своей части экрана и тяни в нужную сторону.\n' +
    '🚀 Двойное касание — рывок туда, куда ты двигался (перезарядка 2 с).\n' +
    'Вытолкни соперников за край. Последний на арене выигрывает раунд. Через 20 с арена сжимается.\n' +
    'Бонусы на арене — наезжай своим шаром:\n' +
    '💪 тяжеловес · 🛡️ бампер (отбрасывает соперников) · ⚡ ударная волна · 🍌 банановые шкурки соперникам · 👟 турбо\n' +
    'У каждого раунда свой сюрприз: 🧊 лёд, 🔍 маленькая арена, 🐘 тяжеловесы, 🔴 бамперы по краю, 🌀 карусель, 🕳️ дыры.\n' +
    'Кто первым выиграет 3 раунда, тот победил.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const { cv, g } = ctx.canvas();
    const P = ctx.players;
    const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", Roboto, sans-serif';
    const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    // only the latest message stays on screen, so quick events don't pile up
    let lastToast = null;
    const say = (text, o = {}) => {
      if (lastToast) lastToast.forEach(e => e.remove());
      lastToast = ctx.toast(text, Object.assign({ offset: ctx.n === 3 ? Math.min(ctx.W, ctx.H) * 0.2 : 70 }, o));
      return lastToast;
    };
    const WIN_ROUNDS = 3;
    // Physics in normalized units: 1 = min(W,H), origin at screen center.
    const A_BASE = 0.39;
    const RB = 0.062;
    const ACC = 1.15;
    const DRAG = 1.25;
    const E = 0.9;
    const JOY = 0.095;
    const SHRINK_AT = 20, SHRINK_V = 0.018;
    const DASH_CD = 2, DASH_V = 1.0;
    const IR = 0.038;

    const PU = {
      heavy: { icon: '💪', name: 'Тяжеловес', w: 2 },
      bumper: { icon: '🛡️', name: 'Бампер', w: 2 },
      shock: { icon: '⚡', name: 'Ударная волна!', w: 2 },
      banana: { icon: '🍌', name: 'Шкурки соперникам!', w: 1.6 },
      turbo: { icon: '👟', name: 'Турбо', w: 1.6 },
    };
    const MODS = {
      none: { icon: '🥋', name: 'Обычный раунд' },
      ice: { icon: '🧊', name: 'Ледяные пятна' },
      small: { icon: '🔍', name: 'Маленькая арена' },
      fat: { icon: '🐘', name: 'Тяжеловесы' },
      bumpers: { icon: '🔴', name: 'Бамперы по краю' },
      spin: { icon: '🌀', name: 'Карусель' },
      holes: { icon: '🕳️', name: 'Дыры' },
    };

    const wins = P.map(() => 0);
    const effects = P.map(() => []);
    let round = 1, state = 'fight', roundStart = 0, A0 = A_BASE, A = A_BASE, warned = false;
    let mod = 'none', modBag = [];
    let W = ctx.W, H = ctx.H, S = Math.min(W, H);
    ctx.onResize(() => { W = ctx.W; H = ctx.H; S = Math.min(W, H); });
    const toS = (x, y) => ({ x: W / 2 + x * S, y: H / 2 + y * S });

    function addFx(i, k, dur) {
      const e = effects[i].find(e => e.k === k);
      if (e) { e.until = ctx.time + dur; e.dur = dur; } else effects[i].push({ k, until: ctx.time + dur, dur });
    }
    const has = (i, k) => effects[i].some(e => e.k === k);

    const balls = P.map(p => ({ i: p.i, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, r: RB, fall: 0, onArena: true, hit: 0, safe: false, stun: 0, dashAt: -9, lastDir: null, lastDirAt: -9, spin: 0 }));
    const baseR = () => RB * (mod === 'fat' ? 1.3 : 1);
    const radiusOf = (b) => baseR() * (has(b.i, 'heavy') ? 1.3 : 1);
    const massOf = (b) => (has(b.i, 'heavy') ? 2.5 : 1);
    function placeBalls() {
      for (const b of balls) {
        const v = ctx.inward(b.i);
        b.x = -v.x * A0 * 0.55; b.y = -v.y * A0 * 0.55;
        b.vx = b.vy = 0; b.fall = 0; b.onArena = true; b.hit = 0; b.safe = false; b.stun = 0; b.r = radiusOf(b); b.spin = 0;
      }
    }

    // ---------- round modifiers & hazards ----------
    const items = [];
    let peels = [], patches = [], holes = [], posts = [];
    let nextItem = 3, nextHole = 0, spinDir = 1, nextSpinFlip = 0;
    function setupMod() {
      A0 = A_BASE * (mod === 'small' ? 0.78 : 1);
      A = A0;
      patches = []; holes = []; posts = []; peels = []; items.length = 0;
      if (mod === 'ice') {
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * Math.PI * 2 + U.rand(-0.4, 0.4), r = U.rand(0.1, 0.25) * A0 / A_BASE;
          patches.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, r: U.rand(0.1, 0.13) });
        }
      }
      if (mod === 'bumpers') for (let k = 0; k < 6; k++) posts.push({ a: k / 6 * Math.PI * 2 + Math.PI / 6, r: 0.03, hit: 0 });
      nextHole = 4; spinDir = Math.random() < 0.5 ? -1 : 1; nextSpinFlip = 7;
      nextItem = 3;
    }
    function pickMod() {
      if (!modBag.length) modBag = U.shuffle(['ice', 'small', 'fat', 'bumpers', 'spin', 'holes']);
      return modBag.pop();
    }
    setupMod();
    placeBalls();
    ctx.onStart = () => say('Раунд 1 · 🥋 Толкай соперников!', { ms: 1300 });

    // ---------- juice (normalized units) ----------
    const parts = [], rings = [], pops = [];
    let shakeT = 0, shakeA = 0;
    function burst(x, y, color, n, speed, life = 0.6, size = 4) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.25 + Math.random() * 0.75);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, t: life * (0.6 + Math.random() * 0.4), color, size: size * (0.6 + Math.random() * 0.8) });
      }
      if (parts.length > 700) parts.splice(0, parts.length - 700);
    }
    const ring = (x, y, r0, r1, color, life = 0.5, w = 5) => rings.push({ x, y, r0, r1, color, life, t: life, w });
    const pop = (x, y, text) => pops.push({ x, y, text, t: 0.9, life: 0.9 });
    const shake = (a, t = 0.35) => { shakeA = Math.max(shakeT > 0 ? shakeA : 0, a); shakeT = Math.max(shakeT, t); };
    function updJuice(dt) {
      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k]; p.t -= dt;
        if (p.t <= 0) { parts.splice(k, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        const d = Math.exp(-3 * dt); p.vx *= d; p.vy *= d;
      }
      for (let k = rings.length - 1; k >= 0; k--) { rings[k].t -= dt; if (rings[k].t <= 0) rings.splice(k, 1); }
      for (let k = pops.length - 1; k >= 0; k--) { pops[k].t -= dt; pops[k].y -= dt * 0.05; if (pops[k].t <= 0) pops.splice(k, 1); }
      shakeT = Math.max(0, shakeT - dt);
    }

    // ---------- joysticks ----------
    const joys = P.map(() => null);
    const lastTap = P.map(() => -9);
    const owner = new Map();
    ctx.pointer(cv, {
      down(id, x, y) {
        const i = ctx.seatAt(x, y);
        owner.set(id, i);
        joys[i] = { id, ox: x, oy: y, x, y };
        const now = performance.now() / 1000;
        if (now - lastTap[i] < 0.33) { tryDash(i); lastTap[i] = -9; } else lastTap[i] = now;
      },
      move(id, x, y) {
        const i = owner.get(id);
        if (i == null || !joys[i] || joys[i].id !== id) return;
        joys[i].x = x; joys[i].y = y;
      },
      up(id) {
        const i = owner.get(id);
        owner.delete(id);
        if (i != null && joys[i] && joys[i].id === id) joys[i] = null;
      },
    });
    function stick(i) {
      const j = joys[i];
      if (!j) return { x: 0, y: 0 };
      let dx = (j.x - j.ox) / S / JOY, dy = (j.y - j.oy) / S / JOY;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      if (m < 0.08) return { x: 0, y: 0 };
      return { x: dx, y: dy };
    }
    function tryDash(i) {
      const b = balls[i];
      if (ctx.paused || state !== 'fight' || !b.onArena || b.stun > 0) return;
      if (ctx.time - b.dashAt < DASH_CD) return;
      let d = null;
      const s = stick(i);
      if (s.x || s.y) d = s;
      else if (b.lastDir && ctx.time - b.lastDirAt < 1.5) d = b.lastDir;
      else if (Math.hypot(b.vx, b.vy) > 0.05) d = { x: b.vx, y: b.vy };
      else d = { x: -b.x, y: -b.y };
      const L = Math.hypot(d.x, d.y) || 1;
      b.vx += d.x / L * DASH_V; b.vy += d.y / L * DASH_V;
      b.dashAt = ctx.time;
      ring(b.x, b.y, b.r, b.r * 2.4, P[i].color, 0.35, 5);
      for (let k = 0; k < 14; k++) {
        const sp = U.rand(0.2, 0.6);
        parts.push({ x: b.x, y: b.y, vx: -d.x / L * sp + U.rand(-0.15, 0.15), vy: -d.y / L * sp + U.rand(-0.15, 0.15), life: 0.45, t: U.rand(0.25, 0.45), color: P[i].color, size: U.rand(3, 6) });
      }
      pop(b.x, b.y - b.r * 1.4, '🚀');
    }

    // ---------- rounds ----------
    function newRound() {
      round++;
      warned = false;
      mod = pickMod();
      setupMod();
      for (const p of P) effects[p.i] = [];
      placeBalls();
      state = 'ready';
      say(`Раунд ${round} · ${MODS[mod].icon} ${MODS[mod].name}`, { ms: 1700 });
      ctx.after(1800, () => { state = 'fight'; roundStart = ctx.time; nextItem = ctx.time + 2.5; nextHole = ctx.time + 3; nextSpinFlip = ctx.time + 7; });
    }
    function checkRound() {
      if (state !== 'fight') return;
      const on = balls.filter(b => b.onArena);
      if (on.length > 1) return;
      state = 'end';
      if (on.length === 1) {
        const w = on[0].i;
        on[0].safe = true;
        wins[w]++;
        const c = on[0];
        burst(c.x, c.y, P[w].color, 40, 0.6, 0.9, 5);
        ring(c.x, c.y, c.r, c.r * 4, P[w].color, 0.7, 8);
        if (wins[w] >= WIN_ROUNDS) {
          state = 'over';
          say(`🏆 ${P[w].name} — чемпион!`, { color: P[w].color, fg: '#111', ms: 1500 });
          ctx.after(1500, () => ctx.end({ winner: w, scores: wins.slice(), msg: `Раунды: ${wins.join(' : ')}` }));
          return;
        }
        say(`🥋 Раунд за: ${P[w].name}`, { color: P[w].color, fg: '#111', ms: 1300 });
      } else {
        say('Ничья в раунде', { ms: 1300 });
      }
      ctx.after(1700, newRound);
    }

    // ---------- items ----------
    function spawnItem() {
      const pool = Object.keys(PU).map(k => [k, PU[k].w]);
      const tot = pool.reduce((s, e) => s + e[1], 0);
      let r = Math.random() * tot, k = pool[0][0];
      for (const e of pool) { r -= e[1]; if (r <= 0) { k = e[0]; break; } }
      for (let tries = 0; tries < 20; tries++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * A * 0.7;
        const x = Math.cos(a) * d, y = Math.sin(a) * d;
        if (balls.some(b => b.onArena && Math.hypot(b.x - x, b.y - y) < b.r + IR * 2)) continue;
        if (items.some(it => Math.hypot(it.x - x, it.y - y) < IR * 4)) continue;
        items.push({ x, y, k, born: ctx.time, life: 10 });
        ring(x, y, IR * 2.5, IR, '#ffffff', 0.4, 3);
        return;
      }
    }
    function collect(it, b) {
      const i = b.i, col = P[i].color, def = PU[it.k];
      burst(it.x, it.y, col, 26, 0.6, 0.7, 4);
      ring(it.x, it.y, IR, IR * 4, col, 0.55, 6);
      switch (it.k) {
        case 'heavy': addFx(i, 'heavy', 8); break;
        case 'bumper': addFx(i, 'bumper', 7); break;
        case 'turbo': addFx(i, 'turbo', 6); break;
        case 'shock': {
          ring(b.x, b.y, b.r, 0.7, '#ffe95c', 0.6, 10);
          ring(b.x, b.y, b.r, 0.5, '#ffffff', 0.45, 5);
          shake(0.018, 0.35);
          for (const o of balls) {
            if (o === b || !o.onArena) continue;
            const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy) || 1;
            const k = U.clamp(1.6 * (1 - d / 0.8), 0.35, 1.6) / massOf(o);
            o.vx += dx / d * k; o.vy += dy / d * k;
            o.hit = 1;
          }
          break;
        }
        case 'banana': {
          for (const o of balls) {
            if (o === b || !o.onArena) continue;
            for (let n = 0; n < 2; n++) {
              const sp = Math.hypot(o.vx, o.vy);
              const ahead = sp > 0.05 ? { x: o.vx / sp, y: o.vy / sp } : { x: -o.x, y: -o.y };
              const L = Math.hypot(ahead.x, ahead.y) || 1;
              let x = o.x + ahead.x / L * (o.r * 2.2 + n * 0.08) + U.rand(-0.05, 0.05);
              let y = o.y + ahead.y / L * (o.r * 2.2 + n * 0.08) + U.rand(-0.05, 0.05);
              const dd = Math.hypot(x, y);
              if (dd > A * 0.9) { x *= A * 0.9 / dd; y *= A * 0.9 / dd; }
              peels.push({ x, y, owner: i, born: ctx.time, rot: U.rand(0, 6.28) });
            }
          }
          break;
        }
      }
      say(`${def.icon} ${def.name}`, { color: col, fg: '#111', ms: 1200 });
    }

    // ---------- physics ----------
    function collide(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r;
      if (d >= min) return;
      let nx, ny;
      if (d < 1e-9) { nx = 1; ny = 0; } else { nx = dx / d; ny = dy / d; }
      const ma = massOf(a), mb = massOf(b);
      const ov = min - d;
      a.x -= nx * ov * mb / (ma + mb); a.y -= ny * ov * mb / (ma + mb);
      b.x += nx * ov * ma / (ma + mb); b.y += ny * ov * ma / (ma + mb);
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) {
        const j = -(1 + E) * rv / (1 / ma + 1 / mb);
        a.vx -= j * nx / ma; a.vy -= j * ny / ma;
        b.vx += j * nx / mb; b.vy += j * ny / mb;
        // bumper shields fling the other ball
        if (has(a.i, 'bumper')) { b.vx += nx * 0.75; b.vy += ny * 0.75; ring(b.x - nx * b.r, b.y - ny * b.r, 0.01, 0.12, '#9fe8ff', 0.35, 5); }
        if (has(b.i, 'bumper')) { a.vx -= nx * 0.75; a.vy -= ny * 0.75; ring(a.x + nx * a.r, a.y + ny * a.r, 0.01, 0.12, '#9fe8ff', 0.35, 5); }
        const k = Math.min(1, -rv * 2);
        a.hit = Math.max(a.hit, k); b.hit = Math.max(b.hit, k);
        const cx = a.x + nx * a.r, cy = a.y + ny * a.r;
        const n = Math.round(4 + 22 * k);
        for (let q = 0; q < n; q++) {
          const ang = Math.atan2(ny, nx) + Math.PI / 2 * (q % 2 ? 1 : -1) + U.rand(-0.6, 0.6), sp = U.rand(0.1, 0.7) * (0.4 + k);
          parts.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.45, t: U.rand(0.2, 0.45), color: q % 3 ? '#fff4c8' : P[q % 2 ? a.i : b.i].color, size: U.rand(2, 4.5) });
        }
        if (-rv > 0.55) shake(0.008 + 0.01 * k, 0.2);
      }
    }
    function step(dt) {
      for (const p of P) effects[p.i] = effects[p.i].filter(e => e.until > ctx.time);
      if (state === 'fight' && ctx.time - roundStart > SHRINK_AT) {
        if (!warned) { warned = true; say('⚠️ Арена сжимается!', { ms: 1200 }); }
        A = Math.max(baseR() * 1.3, A - SHRINK_V * dt);
      }
      const moving = state !== 'ready';
      for (const b of balls) {
        b.stun = Math.max(0, b.stun - dt);
        if (b.onArena && state === 'fight' && b.stun <= 0) {
          const s = stick(b.i);
          let acc = ACC * (has(b.i, 'turbo') ? 1.7 : 1) * (mod === 'fat' ? 0.9 : 1) / Math.sqrt(massOf(b));
          if (patches.some(pt => Math.hypot(b.x - pt.x, b.y - pt.y) < pt.r)) acc *= 0.45;
          b.ax = s.x * acc; b.ay = s.y * acc;
          if (s.x || s.y) { b.lastDir = { x: s.x, y: s.y }; b.lastDirAt = ctx.time; }
        } else { b.ax = b.ay = 0; }
        b.hit = Math.max(0, b.hit - dt * 3);
        b.r += (radiusOf(b) - b.r) * (1 - Math.exp(-dt * 8));
        b.spin *= Math.exp(-dt * 2);
      }
      if (!moving) return;
      // carousel: tangential drift
      let spinF = 0;
      if (mod === 'spin' && state === 'fight') {
        if (ctx.time > nextSpinFlip) { spinDir = -spinDir; nextSpinFlip = ctx.time + U.rand(6, 9); say('🌀 Карусель в другую сторону!', { ms: 900 }); }
        spinF = 0.45 * spinDir;
      }
      const maxV = Math.max(...balls.map(b => Math.hypot(b.vx, b.vy)));
      const n = U.clamp(Math.ceil(maxV * dt / (RB * 0.25)), 1, 30);
      const h = dt / n;
      for (let s = 0; s < n; s++) {
        for (const b of balls) {
          let drag = b.safe ? 5 : DRAG;
          if (b.onArena && patches.some(pt => Math.hypot(b.x - pt.x, b.y - pt.y) < pt.r)) drag = 0.15;
          if (b.stun > 0) drag *= 0.4;
          const dmp = Math.exp(-drag * h);
          let ax = b.ax, ay = b.ay;
          if (spinF && b.onArena) { const d = Math.hypot(b.x, b.y) || 1; ax += -b.y / d * spinF * (d / A0); ay += b.x / d * spinF * (d / A0); }
          b.vx = (b.vx + ax * h) * dmp;
          b.vy = (b.vy + ay * h) * dmp;
          b.x += b.vx * h; b.y += b.vy * h;
        }
        for (let a = 0; a < balls.length; a++) for (let c = a + 1; c < balls.length; c++) {
          if (balls[a].onArena && balls[c].onArena) collide(balls[a], balls[c]);
        }
        for (const b of balls) {
          if (!b.onArena) continue;
          // rim bumpers
          for (const pt of posts) {
            const px = Math.cos(pt.a) * A, py = Math.sin(pt.a) * A;
            const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy), min = b.r + pt.r;
            if (d < min && d > 1e-6) {
              const nx = dx / d, ny = dy / d;
              b.x = px + nx * min; b.y = py + ny * min;
              const vn = b.vx * nx + b.vy * ny;
              if (vn < 0.6) { b.vx += (0.6 - vn) * nx * 1.4; b.vy += (0.6 - vn) * ny * 1.4; }
              if (pt.hit < 0.5) { ring(px, py, pt.r, pt.r * 3, '#ff6b6b', 0.3, 4); }
              pt.hit = 1;
            }
          }
          const d = Math.hypot(b.x, b.y);
          const inHole = holes.some(ho => ho.open && Math.hypot(b.x - ho.x, b.y - ho.y) < ho.r);
          if (b.safe && d > A - b.r * 0.2) {
            const lim = A - b.r * 0.2, k = lim / d; b.x *= k; b.y *= k;
            const vr = (b.vx * b.x + b.vy * b.y) / (lim || 1);
            if (vr > 0) { b.vx -= vr * b.x / lim; b.vy -= vr * b.y / lim; }
          } else if (!b.safe && (d > A || inHole)) {
            b.onArena = false;
            b.fall = 0.0001;
            burst(b.x, b.y, P[b.i].color, 30, 0.5, 0.8, 4);
            shake(0.014, 0.3);
            pop(b.x, b.y - b.r, '💥');
          }
        }
        // banana peels
        for (const b of balls) {
          if (!b.onArena) continue;
          for (let k = peels.length - 1; k >= 0; k--) {
            const pe = peels[k];
            if (pe.owner === b.i && ctx.time - pe.born < 1.5) continue;
            if (Math.hypot(b.x - pe.x, b.y - pe.y) < b.r + 0.02) {
              peels.splice(k, 1);
              b.stun = 0.9;
              const a = Math.random() * Math.PI * 2;
              b.vx = b.vx * 0.6 + Math.cos(a) * 0.45; b.vy = b.vy * 0.6 + Math.sin(a) * 0.45;
              b.spin = 14;
              pop(b.x, b.y - b.r * 1.3, '🍌');
              burst(pe.x, pe.y, '#ffe46b', 14, 0.35, 0.5, 3);
            }
          }
        }
      }
      for (const b of balls) if (!b.onArena) b.fall = Math.min(1, b.fall + dt * 1.6);
      for (const pt of posts) pt.hit = Math.max(0, pt.hit - dt * 4);
      // items
      if (state === 'fight') {
        for (const b of balls) {
          if (!b.onArena) continue;
          for (let k = items.length - 1; k >= 0; k--) {
            const it = items[k];
            if (Math.hypot(it.x - b.x, it.y - b.y) < IR + b.r) { items.splice(k, 1); collect(it, b); }
          }
        }
        for (let k = items.length - 1; k >= 0; k--) {
          const it = items[k];
          if (ctx.time - it.born > it.life || Math.hypot(it.x, it.y) > A - IR * 0.5) items.splice(k, 1);
        }
        if (ctx.time > nextItem) { if (items.length < 2) spawnItem(); nextItem = ctx.time + U.rand(3.5, 5.5); }
        // peels/patches outside the shrinking arena vanish
        peels = peels.filter(pe => Math.hypot(pe.x, pe.y) < A && ctx.time - pe.born < 14);
        // holes
        if (mod === 'holes') {
          if (ctx.time > nextHole) {
            for (let tries = 0; tries < 10; tries++) {
              const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * A * 0.75;
              const x = Math.cos(a) * d, y = Math.sin(a) * d;
              if (holes.some(ho => Math.hypot(ho.x - x, ho.y - y) < 0.2)) continue;
              holes.push({ x, y, r: 0.065, born: ctx.time, open: false });
              break;
            }
            nextHole = ctx.time + U.rand(3.5, 5);
          }
          for (const ho of holes) {
            const age = ctx.time - ho.born;
            if (!ho.open && age > 1.6) { ho.open = true; ring(ho.x, ho.y, ho.r, ho.r * 2, '#ff6b6b', 0.4, 4); }
          }
          holes = holes.filter(ho => ctx.time - ho.born < 8.5);
        }
      }
      checkRound();
    }

    // ---------- drawing ----------
    function circle(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
    function emoji(ch, x, y, size) {
      g.font = `${Math.round(size)}px ${EMOJI}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ch, x, y + size * 0.05);
    }
    function drawArena(t) {
      g.fillStyle = '#0f1220';
      g.fillRect(-40, -40, W + 80, H + 80);
      const c = toS(0, 0), r = A * S;
      const gr = g.createRadialGradient(c.x, c.y, r * 0.2, c.x, c.y, r * 1.25);
      gr.addColorStop(0, 'rgba(60,70,130,.0)');
      gr.addColorStop(0.75, 'rgba(60,70,130,.12)');
      gr.addColorStop(1, 'rgba(60,70,130,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      circle(c.x, c.y, r);
      const mat = g.createRadialGradient(c.x, c.y - r * 0.3, r * 0.1, c.x, c.y, r);
      mat.addColorStop(0, '#2a3160');
      mat.addColorStop(1, '#1c2244');
      g.fillStyle = mat; g.fill();
      // carousel stripes
      if (mod === 'spin') {
        g.save();
        circle(c.x, c.y, r); g.clip();
        g.translate(c.x, c.y);
        g.rotate(ctx.time * 0.9 * spinDir);
        g.fillStyle = 'rgba(255,255,255,.04)';
        for (let k = 0; k < 8; k += 2) {
          g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, k * Math.PI / 4, (k + 1) * Math.PI / 4); g.closePath(); g.fill();
        }
        g.restore();
      }
      // ice patches
      for (const pt of patches) {
        const q = toS(pt.x, pt.y);
        const ig = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, pt.r * S);
        ig.addColorStop(0, 'rgba(200,240,255,.38)');
        ig.addColorStop(1, 'rgba(160,220,255,.08)');
        circle(q.x, q.y, pt.r * S); g.fillStyle = ig; g.fill();
        g.strokeStyle = 'rgba(220,245,255,.35)'; g.lineWidth = 2; g.stroke();
      }
      // holes
      for (const ho of holes) {
        const q = toS(ho.x, ho.y), age = ctx.time - ho.born;
        if (!ho.open) {
          const a = 0.35 + 0.35 * Math.sin(age * 18);
          circle(q.x, q.y, ho.r * S); g.strokeStyle = `rgba(255,107,107,${a})`; g.lineWidth = 4; g.setLineDash([8, 8]); g.stroke(); g.setLineDash([]);
        } else {
          const close = 8.5 - age < 0.6 ? (8.5 - age) / 0.6 : 1;
          circle(q.x, q.y, ho.r * S * close);
          const hg = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, ho.r * S);
          hg.addColorStop(0, '#000'); hg.addColorStop(0.8, '#05060c'); hg.addColorStop(1, '#3a2040');
          g.fillStyle = hg; g.fill();
        }
      }
      const shrinking = A < A0 - 1e-4;
      const pulse = shrinking ? 0.5 + 0.5 * Math.sin(t / 140) : 0;
      g.save();
      g.lineWidth = Math.max(4, S * 0.01);
      g.strokeStyle = shrinking ? `rgba(255,${Math.round(120 - 60 * pulse)},${Math.round(110 - 60 * pulse)},.95)` : '#e8ecff';
      g.shadowColor = shrinking ? '#ff5a5f' : '#9fb4ff'; g.shadowBlur = 18;
      circle(c.x, c.y, r); g.stroke();
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,.12)';
      g.lineWidth = 3;
      circle(c.x, c.y, Math.min(r * 0.92, A0 * S * 0.22)); g.stroke();
      if (shrinking) {
        g.save(); g.setLineDash([8, 10]);
        g.strokeStyle = 'rgba(255,255,255,.08)';
        circle(c.x, c.y, A0 * S); g.stroke();
        g.restore();
      }
      // rim bumpers
      for (const pt of posts) {
        const q = toS(Math.cos(pt.a) * A, Math.sin(pt.a) * A);
        g.save();
        g.shadowColor = '#ff5a5f'; g.shadowBlur = 12 + 20 * pt.hit;
        circle(q.x, q.y, pt.r * S * (1 + 0.25 * pt.hit));
        g.fillStyle = pt.hit > 0 ? '#ffd0d0' : '#ff6b6b'; g.fill();
        g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke();
        g.restore();
      }
      // peels
      for (const pe of peels) {
        const q = toS(pe.x, pe.y);
        g.save(); g.translate(q.x, q.y); g.rotate(pe.rot);
        emoji('🍌', 0, 0, 0.045 * S);
        g.restore();
      }
    }
    function drawItems() {
      for (const it of items) {
        const age = ctx.time - it.born, left = it.life - age;
        if (left < 2.5 && Math.sin(age * 20) < 0) continue;
        const q = toS(it.x, it.y);
        const r = IR * S * (0.6 + 0.4 * Math.min(1, age * 4)) * (1 + 0.06 * Math.sin(age * 5));
        g.save();
        g.translate(q.x, q.y);
        g.shadowColor = '#fff'; g.shadowBlur = 18;
        circle(0, 0, r); g.fillStyle = 'rgba(30,36,70,.92)'; g.fill();
        g.lineWidth = 3; g.strokeStyle = `hsla(${(age * 120) % 360},90%,70%,.95)`; g.stroke();
        g.shadowBlur = 0;
        g.rotate(Math.sin(age * 1.5) * 0.35);
        emoji(PU[it.k].icon, 0, 0, r * 1.15);
        g.restore();
      }
    }
    function drawBall(b) {
      const p = P[b.i], c = toS(b.x, b.y);
      const sc = b.onArena ? 1 : Math.max(0, 1 - b.fall);
      if (sc <= 0.01) return;
      const r = b.r * S * sc;
      g.save();
      g.globalAlpha = b.onArena ? 1 : Math.max(0, 1 - b.fall * 0.8);
      if (b.onArena) { circle(c.x + r * 0.12, c.y + r * 0.18, r); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill(); }
      g.shadowColor = p.color; g.shadowBlur = 16 + 30 * b.hit;
      circle(c.x, c.y, r);
      const gr = g.createRadialGradient(c.x - r * 0.35, c.y - r * 0.35, r * 0.1, c.x, c.y, r);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.3, p.color);
      gr.addColorStop(1, U.alpha(p.color, 0.7));
      g.fillStyle = gr; g.fill();
      g.shadowBlur = 0;
      g.lineWidth = has(b.i, 'heavy') ? 6 : 3; g.strokeStyle = has(b.i, 'heavy') ? 'rgba(20,20,30,.6)' : 'rgba(0,0,0,.3)'; g.stroke();
      if (has(b.i, 'bumper')) {
        circle(c.x, c.y, r + 6 + 2 * Math.sin(ctx.time * 10));
        g.strokeStyle = 'rgba(159,232,255,.9)'; g.lineWidth = 4; g.stroke();
      }
      if (has(b.i, 'turbo') && b.onArena && Math.random() < 0.6) {
        parts.push({ x: b.x - b.vx * 0.05, y: b.y - b.vy * 0.05, vx: -b.vx * 0.3, vy: -b.vy * 0.3, life: 0.35, t: 0.35, color: '#ffb35c', size: 4 });
      }
      if (b.stun > 0) {
        for (let k = 0; k < 3; k++) {
          const a = ctx.time * 8 + k * 2.1;
          emoji('💫', c.x + Math.cos(a) * r * 0.9, c.y - r * 0.9 + Math.sin(a) * r * 0.3, r * 0.4);
        }
      }
      const s = stick(b.i);
      if (b.onArena && (s.x || s.y)) {
        g.beginPath();
        g.moveTo(c.x + s.x * r * 0.25, c.y + s.y * r * 0.25);
        g.lineTo(c.x + s.x * r * 0.85, c.y + s.y * r * 0.85);
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = Math.max(3, r * 0.14); g.lineCap = 'round'; g.stroke();
      }
      g.restore();
    }
    function drawJuice() {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const p of parts) {
        const a = Math.max(0, p.t / p.life), q = toS(p.x, p.y);
        g.globalAlpha = Math.min(1, a * 1.4);
        g.fillStyle = p.color;
        g.beginPath(); g.arc(q.x, q.y, p.size * (0.4 + 0.6 * a), 0, Math.PI * 2); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      for (const r of rings) {
        const k = 1 - r.t / r.life, q = toS(r.x, r.y);
        g.globalAlpha = 1 - k;
        g.strokeStyle = r.color; g.lineWidth = r.w * (1 - k) + 1;
        g.beginPath(); g.arc(q.x, q.y, (r.r0 + (r.r1 - r.r0) * k) * S, 0, Math.PI * 2); g.stroke();
      }
      for (const pp of pops) {
        const q = toS(pp.x, pp.y);
        g.globalAlpha = Math.min(1, pp.t / pp.life * 2);
        emoji(pp.text, q.x, q.y, S * 0.05 * (1 + 0.3 * (1 - pp.t / pp.life)));
      }
      g.restore();
    }
    function drawJoys() {
      P.forEach(p => {
        const j = joys[p.i];
        if (!j) return;
        const R0 = JOY * S;
        g.save();
        circle(j.ox, j.oy, R0);
        g.fillStyle = U.alpha(p.color, 0.1); g.fill();
        g.lineWidth = 3; g.strokeStyle = U.alpha(p.color, 0.55); g.stroke();
        const s = stick(p.i);
        let kx = j.x - j.ox, ky = j.y - j.oy;
        const m = Math.hypot(kx, ky);
        if (m > R0) { kx *= R0 / m; ky *= R0 / m; }
        circle(j.ox + kx, j.oy + ky, R0 * 0.45);
        g.shadowColor = p.color; g.shadowBlur = 16;
        g.fillStyle = U.alpha(p.color, s.x || s.y ? 0.85 : 0.55); g.fill();
        g.restore();
      });
    }
    function fxRing(x, y, r, frac, color, icon) {
      circle(x, y, r); g.fillStyle = 'rgba(10,12,24,.75)'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 4; g.stroke();
      g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      g.strokeStyle = color; g.lineWidth = 4; g.stroke();
      emoji(icon, x, y, r * 1.15);
    }
    function drawHud() {
      for (const p of P) {
        const v = ctx.inward(p.i);
        const m = p.side === 'bottom' ? { x: W / 2, y: H } : p.side === 'top' ? { x: W / 2, y: 0 } : p.side === 'left' ? { x: 0, y: H / 2 } : { x: W, y: H / 2 };
        const len = (p.side === 'left' || p.side === 'right') ? H : W;
        const off = Math.min(S * 0.34, len / 2 - S * 0.13);
        g.save();
        ctx.facing(g, p.i, m.x + v.x * S * 0.065, m.y + v.y * S * 0.065);
        // effects + dash cooldown on the left side (from the player's view)
        const rr = S * 0.026, gap = rr * 2.5;
        const b = balls[p.i];
        const cd = U.clamp((ctx.time - b.dashAt) / DASH_CD, 0, 1);
        g.globalAlpha = cd >= 1 ? 1 : 0.6;
        fxRing(-off, -S * 0.004, rr, cd, cd >= 1 ? '#5dffa8' : '#9aa1c4', '🚀');
        g.globalAlpha = 1;
        effects[p.i].forEach((e, k) => fxRing(-off + (k + 1) * gap, -S * 0.004, rr, U.clamp((e.until - ctx.time) / e.dur, 0, 1), '#5dffa8', PU[e.k].icon));
        g.translate(off, 0);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const r = S * 0.017, pg = S * 0.05;
        for (let k = 0; k < WIN_ROUNDS; k++) {
          circle((k - (WIN_ROUNDS - 1) / 2) * pg, -S * 0.012, r);
          if (k < wins[p.i]) { g.fillStyle = p.color; g.shadowColor = p.color; g.shadowBlur = 12; g.fill(); g.shadowBlur = 0; }
          else { g.strokeStyle = U.alpha(p.color, 0.55); g.lineWidth = 3; g.stroke(); }
        }
        g.font = `700 ${Math.round(S * 0.022)}px ${FONT}`;
        g.fillStyle = 'rgba(255,255,255,.5)';
        g.fillText(`раунд ${round} ${MODS[mod].icon}`, 0, S * 0.026);
        g.restore();
      }
    }

    ctx.loop((dt, t) => {
      if (dt > 0) { step(dt); updJuice(dt); }
      g.save();
      if (shakeT > 0) { const k = shakeA * S * Math.min(1, shakeT / 0.3); g.translate(U.rand(-k, k), U.rand(-k, k)); }
      drawArena(t);
      drawItems();
      for (const b of balls) if (!b.onArena) drawBall(b);
      for (const b of balls) if (b.onArena) drawBall(b);
      drawJuice();
      g.restore();
      drawHud();
      drawJoys();
    });

    ctx._sumo = { balls, wins, joys, effects, items, spawnItem, PU, tryDash, get state() { return state; }, get A() { return A; }, get mod() { return mod; } };
  },
});
