registerGame({
  id: 'blobs',
  title: 'Пожиратели',
  emoji: '🫧',
  desc: 'Ешь, расти и глотай соперников',
  rules: 'Коснись экрана у своего края и тяни палец — это джойстик, капля плывёт туда.\n' +
    'Ешь точки и расти. Чем больше капля, тем она медленнее.\n' +
    'Проглоти соперника: будь на 25% больше и накрой его центр. Съеденный теряет ❤️ и через 2 с возвращается.\n' +
    '💨 Рывок: двойной тап или тап вторым пальцем (теряешь немного массы).\n' +
    'Бонусы и события:\n' +
    '🌵 Колючка: лопает большие капли (−40% массы), малыши прячутся под ней\n' +
    '⚡ Скорость  🛡️ Щит (тебя не съесть)  🧲 Магнит для еды\n' +
    '🍗 ПИР: взрыв еды в центре\n' +
    '😴 Кто съел соперника, пару секунд медленнее (объелся)\n' +
    '🆘 Съеденный возвращается с бонусом массы в безопасном месте\n' +
    '⏱️ Последние 15 секунд еда ×2\n' +
    'У каждого 3 жизни. Побеждает последний выживший или самый большой через 90 секунд.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const P = ctx.players, N = ctx.n;
    const HUD = 0.085, GAME_T = 90, START_M = 200, LIVES = 3;
    const FOOD_N = 70, FOOD_V = 8, JOY_R = 62;
    const TAU = Math.PI * 2;

    ctx.root.classList.add('g-blobs');
    ctx.root.append(U.h('style', null, `
      .g-blobs .zone{pointer-events:none}
      .g-blobs .bh{display:flex;align-items:center;justify-content:space-between;gap:2vmin;padding:0 3vmin;
        color:var(--pc);font-weight:900;font-size:3.3vmin;white-space:nowrap}
      .g-blobs .bh .hearts{font-size:3.2vmin;letter-spacing:.3vmin}
      .g-blobs .bh .hearts .off{opacity:.2;filter:grayscale(1)}
      .g-blobs .bh .mass{color:#fff}
      .g-blobs .bh .pw{display:flex;gap:1.4vmin;min-width:0}
      .g-blobs .bh .pw span{background:rgba(255,255,255,.12);border-radius:2vmin;padding:.3vmin 1.2vmin;color:#fff;font-size:2.8vmin}
      .g-blobs .bh .dash{font-size:2.8vmin;color:#fff;opacity:.9}
      .g-blobs .bh .dash.cd{opacity:.3}
      .g-blobs .bh .tm{color:#fff;opacity:.85}
      .g-blobs .bh .tm.hot{color:#ff4d6d;opacity:1}
      .g-blobs .bh.dead{opacity:.45}
    `));

    const { g } = ctx.canvas();

    /* ---------- geometry: world units, short side of arena = 700 ---------- */
    let ar = { x: 0, y: 0, w: 100, h: 100 }, u = 1, WW = 700, WH = 700;
    function arenaRect() {
      const d = Math.round(HUD * Math.min(ctx.W, ctx.H));
      const s = P.map(p => p.side);
      const l = s.includes('left') ? d : 0, r = s.includes('right') ? d : 0;
      const t = s.includes('top') ? d : 0, b = s.includes('bottom') ? d : 0;
      const m = 6, el = N === 2 ? 44 : 0, et = N === 3 ? 44 : 0; // keep the exit button spot free
      return { x: l + m + el, y: t + m + et, w: Math.max(100, ctx.W - l - r - 2 * m - el), h: Math.max(100, ctx.H - t - b - 2 * m - et) };
    }
    const sx = (x) => ar.x + x * u, sy = (y) => ar.y + y * u;
    const wx = (x) => (x - ar.x) / u, wy = (y) => (y - ar.y) / u;

    /* ---------- state ---------- */
    let food = [], spikes = [], items = [], parts = [], rings = [], floats = [];
    let shake = 0, flash = 0, flashC = '#fff', ended = false, finalPhase = false, started = false;
    const blobs = P.map(p => ({
      i: p.i, c: p.color, x: 0, y: 0, vx: 0, vy: 0, m: START_M, lives: LIVES, alive: true, out: false,
      respawnT: 0, inv: 0, dashT: 0, dashCd: 0, speedT: 0, shieldT: 0, magnetT: 0,
      dirX: 0, dirY: -1, wob: Math.random() * 10, eat: 0, look: { x: 0, y: 0 },
    }));
    const rad = (m) => Math.sqrt(m) * 2.2;
    function spawnPoint(i) {
      const side = P[i].side, M = 90;
      if (side === 'bottom') return { x: WW / 2 + (N === 2 ? -WW * 0.2 : 0), y: WH - M };
      if (side === 'top') return { x: WW / 2 + WW * 0.2, y: M };
      if (side === 'left') return { x: M, y: WH / 2 };
      return { x: WW - M, y: WH / 2 };
    }

    function layout() {
      const oW = WW, oH = WH, first = !ar.set;
      ar = arenaRect(); ar.set = true;
      u = Math.min(ar.w, ar.h) / 700;
      WW = ar.w / u; WH = ar.h / u;
      if (first) return;
      const kx = WW / oW, ky = WH / oH;
      const all = [food, spikes, items, parts, floats];
      for (const arr of all) for (const o of arr) { o.x *= kx; o.y *= ky; }
      for (const b of blobs) { b.x *= kx; b.y *= ky; }
      for (const r of rings) { r.x *= kx; r.y *= ky; }
    }
    layout();
    ctx.onResize(layout);
    blobs.forEach(b => { const s = spawnPoint(b.i); b.x = s.x; b.y = s.y; b.inv = 1.5; });

    function freeSpot(minD) {
      for (let t = 0; t < 40; t++) {
        const x = U.rand(60, WW - 60), y = U.rand(60, WH - 60);
        let ok = true;
        for (const b of blobs) if (b.alive && U.dist(x, y, b.x, b.y) < rad(b.m) + minD) { ok = false; break; }
        if (ok) for (const s of spikes) if (U.dist(x, y, s.x, s.y) < 120) { ok = false; break; }
        if (ok) return { x, y };
      }
      return { x: U.rand(60, WW - 60), y: U.rand(60, WH - 60) };
    }
    function addFood(x, y, vx, vy, v) {
      food.push({ x, y, vx: vx || 0, vy: vy || 0, v: v || FOOD_V, h: Math.floor(Math.random() * 360), r: 4 + Math.random() * 2.5, age: 0 });
    }
    for (let k = 0; k < FOOD_N; k++) { const s = freeSpot(30); addFood(s.x, s.y); }
    for (let k = 0; k < 3; k++) { const s = freeSpot(140); spikes.push({ x: s.x, y: s.y, r: 30, rot: Math.random() * TAU, pulse: 0 }); }

    /* ---------- effects ---------- */
    function burst(x, y, color, n, sp, size) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, s = U.rand(sp * 0.3, sp);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, c: color, r: U.rand(size * 0.5, size) });
      }
    }
    function ring(x, y, color, r0, r1) { rings.push({ x, y, c: color, r0, r1, t: 0 }); }
    function floatText(i, x, y, text, color) { floats.push({ i, x, y, text, c: color || '#fff', t: 0 }); }
    function say(text, o) { return ctx.toast(text, Object.assign({ ms: 1500 }, N === 2 ? { offset: Math.min(ar.w, ar.h) * 0.2 } : {}, o || {})); }

    /* ---------- HUD ---------- */
    const hud = P.map(p => {
      const z = ctx.zone(p.i, { depth: HUD, className: 'bh' });
      z.el.style.background = `linear-gradient(0deg, ${U.alpha(p.color, .24)}, ${U.alpha(p.color, .06)})`;
      z.el.style.borderTop = `2px solid ${U.alpha(p.color, .6)}`;
      const hearts = U.h('div', { class: 'hearts' });
      const mass = U.h('div', { class: 'mass' });
      const pw = U.h('div', { class: 'pw' });
      const dash = U.h('div', { class: 'dash' }, '💨 рывок');
      const tm = U.h('div', { class: 'tm' });
      z.el.append(hearts, mass, pw, dash, tm);
      return { z, hearts, mass, pw, dash, tm, cache: {} };
    });
    function setTxt(h, key, el, val, html) {
      if (h.cache[key] === val) return;
      h.cache[key] = val;
      if (html) el.innerHTML = val; else el.textContent = val;
    }
    function renderHud() {
      const left = Math.max(0, Math.ceil(GAME_T - ctx.time));
      const ts = `⏱️ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      const big = leader();
      blobs.forEach((b, i) => {
        const h = hud[i];
        let hs = '';
        for (let k = 0; k < LIVES; k++) hs += k < b.lives ? '❤️' : '<span class="off">❤️</span>';
        setTxt(h, 'h', h.hearts, hs, true);
        setTxt(h, 'm', h.mass, b.out ? 'выбыл' : !b.alive ? `↻ ${Math.ceil(b.respawnT)}` : `${big === i ? '👑 ' : '⚖️ '}${Math.round(b.m)}`);
        let pw = '';
        if (b.speedT > 0) pw += `<span>⚡${Math.ceil(b.speedT)}</span>`;
        if (b.shieldT > 0) pw += `<span>🛡️${Math.ceil(b.shieldT)}</span>`;
        if (b.magnetT > 0) pw += `<span>🧲${Math.ceil(b.magnetT)}</span>`;
        if (b.full > 0) pw += `<span>😴${Math.ceil(b.full)}</span>`;
        setTxt(h, 'p', h.pw, pw, true);
        h.dash.classList.toggle('cd', b.dashCd > 0 || !b.alive);
        setTxt(h, 't', h.tm, ts);
        h.tm.classList.toggle('hot', left <= 15);
        h.z.el.classList.toggle('dead', b.out);
      });
    }
    function leader() {
      let best = -1, bm = 0;
      blobs.forEach((b, i) => { if (b.alive && !b.out && b.m > bm * 1.02) { bm = b.m; best = i; } });
      return best;
    }

    /* ---------- input: floating joystick per seat ---------- */
    const joy = P.map(() => null);       // {id, bx, by, dx, dy}
    const lastUp = P.map(() => ({ t: -9, dur: 9 }));
    const ptrs = new Map();               // pointerId -> {seat, role, t0}
    ctx.pointer(ctx.root, {
      down(id, x, y) {
        if (ended) return;
        const s = ctx.seatAt(x, y);
        const now = ctx.time;
        if (joy[s] && joy[s].id !== id) { ptrs.set(id, { seat: s, role: 'tap', t0: now }); dash(s); return; }
        ptrs.set(id, { seat: s, role: 'joy', t0: now });
        joy[s] = { id, bx: x, by: y, dx: 0, dy: 0 };
        const lu = lastUp[s];
        if (now - lu.t < 0.32 && lu.dur < 0.3) dash(s);
      },
      move(id, x, y) {
        const p = ptrs.get(id);
        if (!p || p.role !== 'joy') return;
        const j = joy[p.seat];
        if (!j || j.id !== id) return;
        let dx = x - j.bx, dy = y - j.by;
        const d = Math.hypot(dx, dy), max = JOY_R * 1.5;
        if (d > max) { j.bx += dx * (1 - max / d); j.by += dy * (1 - max / d); dx = x - j.bx; dy = y - j.by; }
        j.dx = dx; j.dy = dy;
      },
      up(id) {
        const p = ptrs.get(id);
        if (!p) return;
        ptrs.delete(id);
        if (p.role === 'joy' && joy[p.seat] && joy[p.seat].id === id) {
          joy[p.seat] = null;
          lastUp[p.seat] = { t: ctx.time, dur: ctx.time - p.t0 };
        }
      },
    });

    function dash(i) {
      const b = blobs[i];
      if (!b.alive || b.out || b.dashCd > 0 || ctx.paused || ended) return;
      const j = joy[i];
      let dx = b.dirX, dy = b.dirY;
      if (j && Math.hypot(j.dx, j.dy) > 8) { const d = Math.hypot(j.dx, j.dy); dx = j.dx / d; dy = j.dy / d; }
      const r = rad(b.m), sp = 720 * Math.pow(31 / r, 0.3);
      b.vx = dx * sp; b.vy = dy * sp;
      b.dashT = 0.3; b.dashCd = 1.1;
      if (b.m > 120) {
        const shed = b.m * 0.08;
        b.m -= shed;
        for (let k = 0; k < 3; k++) {
          const a = Math.atan2(-dy, -dx) + U.rand(-0.5, 0.5);
          addFood(b.x - dx * r, b.y - dy * r, Math.cos(a) * 260, Math.sin(a) * 260, shed / 3);
        }
      }
      burst(b.x - dx * r, b.y - dy * r, '#ffffff', 10, 260, 4);
      floatText(i, b.x, b.y - r, '💨', '#fff');
    }

    /* ---------- events ---------- */
    function feast() {
      say('🍗 ПИР! Еда в центре', { color: '#ffb347', fg: '#111', ms: 1800 });
      const cx = WW / 2, cy = WH / 2;
      for (let k = 0; k < 44; k++) {
        const a = Math.random() * TAU, s = U.rand(80, 520);
        addFood(cx, cy, Math.cos(a) * s, Math.sin(a) * s, FOOD_V * 1.5);
      }
      ring(cx, cy, '#ffb347', 10, 380);
      burst(cx, cy, '#ffd27a', 40, 500, 6);
      flash = 0.35; flashC = '#ffb347';
    }
    const ITEM_TYPES = [
      { k: 'speed', icon: '⚡', c: '#ffe14d', text: '⚡ Скорость!' },
      { k: 'shield', icon: '🛡️', c: '#7fe7ff', text: '🛡️ Щит!' },
      { k: 'magnet', icon: '🧲', c: '#ff7ad9', text: '🧲 Магнит!' },
    ];
    function spawnItem() {
      if (items.length >= 2 || ended) return;
      const s = freeSpot(120);
      const t = U.pick(ITEM_TYPES);
      items.push({ x: s.x, y: s.y, t, age: 0 });
      ring(s.x, s.y, t.c, 4, 60);
    }
    ctx.after(1, () => {
      started = true;
      say('Тяни палец у своего края!', { ms: 1600 });
    });
    ctx.every(7000, spawnItem);
    ctx.after(3000, spawnItem);
    ctx.every(24000, feast);
    ctx.after(GAME_T * 1000 - 15000, () => {
      finalPhase = true;
      say('⏱️ 15 секунд! Еда ×2', { color: '#ff4d6d', fg: '#fff', ms: 1800 });
      flash = 0.3; flashC = '#ff4d6d';
    });
    ctx.after(GAME_T * 1000, () => timeUp());

    function timeUp() {
      if (ended) return;
      let best = [], bm = -1;
      blobs.forEach((b, i) => {
        if (b.out) return;
        const m = b.alive ? b.m : START_M;
        if (m > bm + 0.5) { bm = m; best = [i]; } else if (Math.abs(m - bm) <= 0.5) best.push(i);
      });
      finish(best, 'Время вышло: самый большой побеждает');
    }
    function finish(winners, msg) {
      if (ended) return;
      ended = true;
      if (winners.length === 1) {
        const w = blobs[winners[0]];
        say(`🏆 ${P[w.i].name} побеждает!`, { color: w.c, fg: '#111', ms: 1600 });
        if (w.alive) { ring(w.x, w.y, w.c, rad(w.m), rad(w.m) + 300); burst(w.x, w.y, w.c, 60, 600, 7); }
      } else say('Ничья!', { ms: 1600 });
      const scores = blobs.map(b => b.out ? 0 : Math.round(b.alive ? b.m : START_M));
      ctx.after(1700, () => ctx.end({ winners, scores, msg }));
    }

    /* ---------- simulation ---------- */
    function popOnSpike(b, s) {
      const shed = b.m * 0.4;
      b.m -= shed;
      const r = rad(b.m), cnt = 14;
      for (let k = 0; k < cnt; k++) {
        const a = k / cnt * TAU + Math.random() * 0.3, sp = U.rand(250, 520);
        addFood(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, Math.cos(a) * sp, Math.sin(a) * sp, shed / cnt);
      }
      burst(b.x, b.y, b.c, 30, 500, 6);
      burst(s.x, s.y, '#5fe36b', 16, 300, 4);
      ring(b.x, b.y, '#5fe36b', r, r + 140);
      shake = Math.max(shake, 10);
      floatText(b.i, b.x, b.y - r - 10, '🌵 Лопнул! −40%', '#7dff8a');
      const ns = freeSpot(160); s.x = ns.x; s.y = ns.y; s.pulse = 1;
    }
    function eatBlob(a, b) {
      const gain = b.m * 0.6;
      a.m += gain; a.eat = 1; a.full = 2.5;
      b.sp = pickRespawn(b);
      b.alive = false; b.lives--; b.vx = b.vy = 0;
      burst(b.x, b.y, b.c, 45, 600, 7);
      burst(b.x, b.y, '#ffffff', 15, 400, 3);
      ring(a.x, a.y, a.c, rad(a.m), rad(a.m) + 220);
      shake = Math.max(shake, 16); flash = 0.25; flashC = a.c;
      floatText(a.i, a.x, a.y - rad(a.m) - 12, '😴 Объелся! медленнее', '#fff');
      if (b.lives <= 0) {
        b.out = true;
        say(`💀 ${P[a.i].name} съел ${P[b.i].name}! Выбыл`, { color: a.c, fg: '#111', ms: 1800 });
        const left = blobs.filter(x => !x.out);
        if (left.length === 1) finish([left[0].i], 'Последний выживший');
      } else {
        b.respawnT = 2;
        say(`🍽️ ${P[a.i].name} съел ${P[b.i].name}!`, { color: a.c, fg: '#111', ms: 1500 });
      }
    }
    // respawn where it is safest (own edge preferred), away from the big blobs
    function pickRespawn(b) {
      const M = 90, own = spawnPoint(b.i);
      const cands = [own, { x: M, y: M }, { x: WW - M, y: M }, { x: M, y: WH - M }, { x: WW - M, y: WH - M },
        { x: WW / 2, y: M }, { x: WW / 2, y: WH - M }, { x: M, y: WH / 2 }, { x: WW - M, y: WH / 2 }];
      let best = own, bs = -1e9;
      for (const c of cands) {
        let sc = c === own ? 120 : 0, md = 1e9;
        for (const o of blobs) if (o !== b && o.alive && !o.out) md = Math.min(md, U.dist(c.x, c.y, o.x, o.y) - rad(o.m) * 1.5);
        sc += Math.min(md, 400);
        if (sc > bs) { bs = sc; best = c; }
      }
      return { x: best.x, y: best.y };
    }
    function respawn(b) {
      const s = b.sp || spawnPoint(b.i);
      let maxO = 0;
      blobs.forEach(o => { if (o !== b && o.alive && !o.out) maxO = Math.max(maxO, o.m); });
      const bonus = Math.min(1000, Math.max(START_M, maxO * 0.6));
      b.m = bonus; b.x = s.x; b.y = s.y; b.vx = b.vy = 0; b.sp = null; b.full = 0;
      b.alive = true; b.inv = 3; b.dashCd = 0;
      b.speedT = b.shieldT = b.magnetT = 0;
      ring(b.x, b.y, b.c, 5, 120);
      burst(b.x, b.y, b.c, 20, 300, 5);
      if (bonus > START_M + 20) floatText(b.i, b.x, b.y - rad(b.m) - 14, `🆘 Бонус: масса ${Math.round(bonus)}`, '#fff');
      else floatText(b.i, b.x, b.y - rad(b.m) - 14, '🛡️ Возрождение', '#fff');
    }

    function update(dt) {
      for (const b of blobs) {
        if (b.out) continue;
        if (!b.alive) { b.respawnT -= dt; if (b.respawnT <= 0 && !ended) respawn(b); continue; }
        const r = rad(b.m);
        b.inv = Math.max(0, b.inv - dt);
        b.dashCd = Math.max(0, b.dashCd - dt);
        b.speedT = Math.max(0, b.speedT - dt);
        b.shieldT = Math.max(0, b.shieldT - dt);
        b.magnetT = Math.max(0, b.magnetT - dt);
        b.full = Math.max(0, (b.full || 0) - dt);
        b.eat = Math.max(0, b.eat - dt * 3);
        b.wob += dt * 3;
        const j = joy[b.i];
        let jx = 0, jy = 0;
        if (j && started && !ended) {
          const d = Math.hypot(j.dx, j.dy);
          if (d > 7) {
            const mag = Math.min(1, d / JOY_R);
            jx = j.dx / d * mag; jy = j.dy / d * mag;
            b.dirX = j.dx / d; b.dirY = j.dy / d;
          }
        }
        const sp = 255 * Math.pow(31 / r, 0.5) * (b.speedT > 0 ? 1.55 : 1) * (b.full > 0 ? 0.6 : 1);
        if (b.dashT > 0) {
          b.dashT -= dt;
          if (b.speedT > 0 && Math.random() < 0.5) parts.push({ x: b.x, y: b.y, vx: 0, vy: 0, life: 0.6, c: '#ffe14d', r: 4 });
        } else {
          const k = Math.min(1, dt * 7);
          b.vx += (jx * sp - b.vx) * k; b.vy += (jy * sp - b.vy) * k;
        }
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < r) { b.x = r; b.vx = Math.abs(b.vx) * 0.3; }
        if (b.x > WW - r) { b.x = WW - r; b.vx = -Math.abs(b.vx) * 0.3; }
        if (b.y < r) { b.y = r; b.vy = Math.abs(b.vy) * 0.3; }
        if (b.y > WH - r) { b.y = WH - r; b.vy = -Math.abs(b.vy) * 0.3; }
        b.look.x += ((jx || b.vx / 300) - b.look.x) * Math.min(1, dt * 6);
        b.look.y += ((jy || b.vy / 300) - b.look.y) * Math.min(1, dt * 6);
        if (b.speedT > 0 && Math.hypot(b.vx, b.vy) > 60 && Math.random() < dt * 30)
          parts.push({ x: b.x - b.vx / 300 * r, y: b.y - b.vy / 300 * r, vx: U.rand(-30, 30), vy: U.rand(-30, 30), life: 0.7, c: '#ffe14d', r: U.rand(2, 5) });
        // slow decay for big blobs
        if (b.m > 400) b.m -= (b.m - 400) * 0.012 * dt;

        // food
        const mult = finalPhase ? 2 : 1;
        const magR = r + 190;
        for (let k = food.length - 1; k >= 0; k--) {
          const f = food[k];
          const dx = b.x - f.x, dy = b.y - f.y, d = Math.hypot(dx, dy);
          if (b.magnetT > 0 && d < magR && d > 1 && f.age > 0.3) {
            const pull = 420 * dt;
            f.x += dx / d * pull; f.y += dy / d * pull;
          }
          if (d < r && f.age > 0.25) {
            b.m += f.v * mult;
            food.splice(k, 1);
            if (parts.length < 400) for (let q = 0; q < 3; q++) {
              const a = Math.random() * TAU;
              parts.push({ x: f.x, y: f.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, life: 0.5, c: `hsl(${f.h},90%,70%)`, r: 2.5 });
            }
          }
        }
        // items
        for (let k = items.length - 1; k >= 0; k--) {
          const it = items[k];
          if (U.dist(b.x, b.y, it.x, it.y) < r + 20) {
            items.splice(k, 1);
            if (it.t.k === 'speed') b.speedT = 6;
            if (it.t.k === 'shield') b.shieldT = 6;
            if (it.t.k === 'magnet') b.magnetT = 7;
            floatText(b.i, b.x, b.y - r - 12, it.t.text, it.t.c);
            ring(it.x, it.y, it.t.c, 10, 90);
            burst(it.x, it.y, it.t.c, 20, 320, 5);
          }
        }
        // spikes
        for (const s of spikes) {
          if (r > s.r * 1.3 && b.shieldT <= 0 && b.inv <= 0 && U.dist(b.x, b.y, s.x, s.y) < r * 0.85 + s.r * 0.4) popOnSpike(b, s);
        }
      }
      // blob vs blob
      for (let a = 0; a < blobs.length; a++) for (let c = a + 1; c < blobs.length; c++) {
        const A = blobs[a], B = blobs[c];
        if (!A.alive || !B.alive || A.out || B.out) continue;
        const ra = rad(A.m), rb = rad(B.m);
        const d = U.dist(A.x, A.y, B.x, B.y);
        const big = A.m >= B.m ? A : B, small = big === A ? B : A;
        const rbig = big === A ? ra : rb, rsmall = big === A ? rb : ra;
        const canEat = big.m >= small.m * 1.25 && small.inv <= 0 && small.shieldT <= 0 && !ended;
        if (canEat && d < rbig - rsmall * 0.3) { eatBlob(big, small); continue; }
        if (!canEat && d < ra + rb && d > 0.01) {
          // soft bump
          const ov = (ra + rb - d), nx = (B.x - A.x) / d, ny = (B.y - A.y) / d;
          const wa = B.m / (A.m + B.m), wb = 1 - wa;
          A.x -= nx * ov * wa * 0.5; A.y -= ny * ov * wa * 0.5;
          B.x += nx * ov * wb * 0.5; B.y += ny * ov * wb * 0.5;
          const rv = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
          if (rv < 0) {
            A.vx += nx * rv * wa; A.vy += ny * rv * wa;
            B.vx -= nx * rv * wb; B.vy -= ny * rv * wb;
          }
        }
      }
      // food physics + refill
      for (const f of food) {
        f.age += dt;
        if (f.vx || f.vy) {
          f.x += f.vx * dt; f.y += f.vy * dt;
          const fr = Math.pow(0.04, dt);
          f.vx *= fr; f.vy *= fr;
          if (Math.abs(f.vx) + Math.abs(f.vy) < 4) f.vx = f.vy = 0;
          if (f.x < 8) { f.x = 8; f.vx = Math.abs(f.vx); } if (f.x > WW - 8) { f.x = WW - 8; f.vx = -Math.abs(f.vx); }
          if (f.y < 8) { f.y = 8; f.vy = Math.abs(f.vy); } if (f.y > WH - 8) { f.y = WH - 8; f.vy = -Math.abs(f.vy); }
        }
      }
      refillT += dt;
      if (refillT > 0.3) { refillT = 0; if (food.length < FOOD_N) { const s = freeSpot(40); addFood(s.x, s.y); } }
      for (const s of spikes) { s.rot += dt * 0.4; s.pulse = Math.max(0, s.pulse - dt); }
      for (const it of items) it.age += dt;
    }
    let refillT = 0;

    /* ---------- drawing ---------- */
    function drawBlob(b, t) {
      const r = rad(b.m) * u, x = sx(b.x), y = sy(b.y);
      const spd = Math.hypot(b.vx, b.vy);
      // glow
      const gl = g.createRadialGradient(x, y, r * 0.6, x, y, r * 1.6);
      gl.addColorStop(0, U.alpha(b.c, 0.35)); gl.addColorStop(1, U.alpha(b.c, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(x, y, r * 1.6, 0, TAU); g.fill();
      // jelly body
      const segs = 36, amp = Math.min(0.06, 2.5 / Math.max(8, r)) + b.eat * 0.08;
      g.beginPath();
      for (let k = 0; k <= segs; k++) {
        const a = k / segs * TAU;
        const w = 1 + amp * Math.sin(a * 3 + b.wob * 2) + amp * 0.6 * Math.sin(a * 5 - b.wob * 3)
          + (spd > 40 ? 0.05 * Math.cos(a - Math.atan2(b.vy, b.vx)) * Math.min(1, spd / 400) : 0);
        const px = x + Math.cos(a) * r * w, py = y + Math.sin(a) * r * w;
        if (k) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.closePath();
      const fill = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
      fill.addColorStop(0, '#ffffff'); fill.addColorStop(0.15, U.alpha(b.c, 1)); fill.addColorStop(1, U.alpha(b.c, 0.85));
      g.fillStyle = fill; g.fill();
      g.lineWidth = Math.max(2, r * 0.07); g.strokeStyle = 'rgba(0,0,0,.35)'; g.stroke();
      // eyes
      const lx = U.clamp(b.look.x, -1, 1), ly = U.clamp(b.look.y, -1, 1);
      const er = Math.max(3.5, r * 0.2), ex = r * 0.32;
      const ld = Math.hypot(lx, ly) || 1, nlx = lx / ld * Math.min(1, ld), nly = ly / ld * Math.min(1, ld);
      for (const s of [-1, 1]) {
        // eyes sit perpendicular to look direction
        const ox = -nly * s * ex + nlx * r * 0.25, oy = nlx * s * ex + nly * r * 0.25;
        const exx = x + (Math.hypot(nlx, nly) > 0.1 ? ox : s * ex), eyy = y + (Math.hypot(nlx, nly) > 0.1 ? oy : -r * 0.1);
        g.fillStyle = '#fff'; g.beginPath(); g.arc(exx, eyy, er, 0, TAU); g.fill();
        g.fillStyle = '#111'; g.beginPath(); g.arc(exx + nlx * er * 0.45, eyy + nly * er * 0.45, er * 0.5, 0, TAU); g.fill();
      }
      // shield / spawn protection
      if (b.shieldT > 0 || b.inv > 0) {
        const blink = b.shieldT > 0 && b.shieldT < 1.5 ? (Math.sin(t * 20) > 0 ? 1 : 0.3) : 1;
        g.strokeStyle = U.alpha('#7fe7ff', 0.8 * blink); g.lineWidth = 3;
        g.beginPath(); g.arc(x, y, r + 7, 0, TAU); g.stroke();
        g.fillStyle = U.alpha('#7fe7ff', 0.12 * blink); g.fill();
      }
      if (b.magnetT > 0) {
        g.strokeStyle = U.alpha('#ff7ad9', 0.35); g.lineWidth = 2; g.setLineDash([6, 10]);
        g.lineDashOffset = -t * 40;
        g.beginPath(); g.arc(x, y, (rad(b.m) + 190) * u, 0, TAU); g.stroke(); g.setLineDash([]);
      }
      if (b.full > 0) {
        g.save(); ctx.facing(g, b.i, x, y);
        g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5);
        g.font = `${Math.max(14, r * 0.4)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('💤', r * 0.7, -r * 0.7 - Math.sin(t * 3) * 4);
        g.restore();
      }
      if (leader() === b.i && N > 1) {
        g.save(); ctx.facing(g, b.i, x, y);
        g.font = `${Math.max(16, r * 0.55)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('👑', 0, -r - Math.max(10, r * 0.25));
        g.restore();
      }
    }
    function drawSpike(s, t) {
      const x = sx(s.x), y = sy(s.y), r = s.r * u * (1 + s.pulse * 0.3 + 0.04 * Math.sin(t * 3 + s.x));
      g.save(); g.translate(x, y); g.rotate(s.rot);
      g.beginPath();
      const n = 14;
      for (let k = 0; k <= n * 2; k++) {
        const a = k / (n * 2) * TAU, rr = k % 2 ? r * 0.78 : r * 1.12;
        if (k) g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fillStyle = 'rgba(70,200,90,.82)'; g.fill();
      g.lineWidth = 3; g.strokeStyle = '#a6ff9e'; g.stroke();
      g.rotate(-s.rot);
      g.font = `${r * 0.9}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('🌵', 0, 2);
      g.restore();
    }
    function drawJoy(i, t) {
      const j = joy[i];
      if (!j) return;
      const c = P[i].color;
      g.strokeStyle = U.alpha(c, 0.55); g.lineWidth = 3;
      g.fillStyle = U.alpha(c, 0.1);
      g.beginPath(); g.arc(j.bx, j.by, JOY_R, 0, TAU); g.fill(); g.stroke();
      const d = Math.hypot(j.dx, j.dy), k = d > JOY_R ? JOY_R / d : 1;
      const kx = j.bx + j.dx * k, ky = j.by + j.dy * k;
      g.fillStyle = U.alpha(c, 0.75);
      g.beginPath(); g.arc(kx, ky, 28, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 2; g.stroke();
    }

    ctx.loop((dt, now) => {
      const t = now / 1000;
      if (dt > 0 && !ended) update(dt);
      if (dt > 0) {
        for (const p of parts) { p.life -= dt * 1.6; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; }
        parts = parts.filter(p => p.life > 0);
        for (const r of rings) r.t += dt * 1.8;
        rings = rings.filter(r => r.t < 1);
        for (const f of floats) f.t += dt;
        floats = floats.filter(f => f.t < 1.6);
        shake = Math.max(0, shake - dt * 40);
        flash = Math.max(0, flash - dt);
      }
      g.save();
      g.fillStyle = '#0f1220'; g.fillRect(0, 0, ctx.W, ctx.H);
      if (shake > 0) g.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
      // arena
      g.fillStyle = '#141933';
      g.beginPath(); g.roundRect(ar.x, ar.y, ar.w, ar.h, 18); g.fill();
      g.save(); g.clip();
      const step = 50 * u;
      g.strokeStyle = 'rgba(255,255,255,.045)'; g.lineWidth = 1;
      g.beginPath();
      for (let x = ar.x + (ar.w / 2) % step; x < ar.x + ar.w; x += step) { g.moveTo(x, ar.y); g.lineTo(x, ar.y + ar.h); }
      for (let y = ar.y + (ar.h / 2) % step; y < ar.y + ar.h; y += step) { g.moveTo(ar.x, y); g.lineTo(ar.x + ar.w, y); }
      g.stroke();
      if (finalPhase && !ended) { g.fillStyle = `rgba(255,77,109,${0.05 + 0.04 * Math.sin(t * 6)})`; g.fillRect(ar.x, ar.y, ar.w, ar.h); }
      // food
      const fm = finalPhase ? 1.3 : 1;
      for (const f of food) {
        const x = sx(f.x), y = sy(f.y), r = f.r * u * fm * (f.v > FOOD_V ? 1.25 : 1);
        g.fillStyle = `hsla(${f.h},90%,65%,.22)`; g.beginPath(); g.arc(x, y, r * 2.1, 0, TAU); g.fill();
        g.fillStyle = `hsl(${f.h},90%,66%)`; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      // items
      for (const it of items) {
        const x = sx(it.x), y = sy(it.y), bob = Math.sin(t * 4 + it.x) * 4, r = 22 * u + 6;
        const pop = Math.min(1, it.age * 4);
        g.fillStyle = U.alpha(it.t.c, 0.22 + 0.1 * Math.sin(t * 6)); g.beginPath(); g.arc(x, y + bob, r * 1.5 * pop, 0, TAU); g.fill();
        g.fillStyle = '#1d2242'; g.beginPath(); g.arc(x, y + bob, r * pop, 0, TAU); g.fill();
        g.strokeStyle = it.t.c; g.lineWidth = 3; g.stroke();
        g.font = `${r * 1.1 * pop}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(it.t.icon, x, y + bob + 2);
      }
      // blobs: small ones under spikes, big ones over
      const order = blobs.filter(b => b.alive && !b.out).sort((a, b) => a.m - b.m);
      for (const b of order) if (rad(b.m) <= 39) drawBlob(b, t);
      for (const s of spikes) drawSpike(s, t);
      for (const b of order) if (rad(b.m) > 39) drawBlob(b, t);
      // respawn markers
      for (const b of blobs) if (!b.alive && !b.out) {
        const s = b.sp || spawnPoint(b.i), x = sx(s.x), y = sy(s.y);
        g.strokeStyle = U.alpha(b.c, 0.6); g.lineWidth = 3; g.setLineDash([8, 8]); g.lineDashOffset = t * 30;
        g.beginPath(); g.arc(x, y, 30 * u, 0, TAU); g.stroke(); g.setLineDash([]);
        g.save(); ctx.facing(g, b.i, x, y); g.fillStyle = b.c; g.font = `900 ${26 * u + 6}px sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(Math.ceil(b.respawnT)), 0, 0); g.restore();
      }
      g.restore(); // clip
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2;
      g.beginPath(); g.roundRect(ar.x, ar.y, ar.w, ar.h, 18); g.stroke();
      // particles & rings
      for (const r of rings) {
        g.strokeStyle = U.alpha(r.c, 1 - r.t); g.lineWidth = 4 * (1 - r.t) + 1;
        g.beginPath(); g.arc(sx(r.x), sy(r.y), (r.r0 + (r.r1 - r.r0) * r.t) * u, 0, TAU); g.stroke();
      }
      for (const p of parts) {
        g.globalAlpha = Math.min(1, p.life * 1.5); g.fillStyle = p.c;
        g.beginPath(); g.arc(sx(p.x), sy(p.y), p.r * u, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
      for (const f of floats) {
        g.save(); ctx.facing(g, f.i, sx(f.x), sy(f.y));
        g.globalAlpha = Math.min(1, (1.6 - f.t) * 2);
        g.font = `900 ${Math.max(18, 22 * u)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.7)';
        g.strokeText(f.text, 0, -f.t * 40); g.fillStyle = f.c; g.fillText(f.text, 0, -f.t * 40);
        g.restore();
      }
      g.globalAlpha = 1;
      g.restore();
      for (let i = 0; i < N; i++) drawJoy(i, t);
      if (flash > 0) { g.fillStyle = U.alpha(flashC, Math.min(0.35, flash)); g.fillRect(0, 0, ctx.W, ctx.H); }
      hudT -= dt || 0.016;
      if (hudT <= 0) { hudT = 0.1; renderHud(); }
    });
    let hudT = 0;
    renderHud();
    ctx.dbg = { blobs, food, spikes, items, joy, get W() { return { ar, u, WW, WH }; } }; // for automated tests
  },
});
