registerGame({
  id: 'airhockey',
  title: 'Аэрохоккей',
  emoji: '🏒',
  desc: 'Отбивай шайбу, лови бонусы, защищай ворота',
  rules: 'Каждый водит пальцем свою биту (круг своего цвета) на своей части поля.\n' +
    'Ворота — в середине твоего края. Забей шайбу в чужие ворота и не пропусти в свои.\n' +
    '2 игрока: кто первым забьёт 7 голов, тот победил.\n' +
    '3 игрока: у каждого 5 жизней, пропущенный гол — минус жизнь. Последний оставшийся побеждает.\n' +
    'Бонусы на поле достаются тому, кто последним коснулся шайбы:\n' +
    '🥅 узкие свои ворота · 🕳️ широкие ворота соперникам · ⚫ вторая шайба\n' +
    '🔨 большая бита · 🧱 стенка перед воротами · ⚡ мощный удар (следующий удар ×2)\n' +
    '🧊 лёд (без трения) · 🌪️ вихрь в центре · 👻 шайба-призрак\n' +
    'Иногда включается ⭐ «Золотой гол»: 10 секунд каждый гол считается за два!',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const { cv, g } = ctx.canvas();
    const P = ctx.players;
    const N = ctx.n;
    const WIN_GOALS = 7, LIVES = 5;
    const E_MALLET = 0.9;
    const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", Roboto, sans-serif';
    const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    // toast with copies spread apart so they don't overlap in 3p
    // only the latest message stays on screen, so quick events don't pile up
    let lastToast = null;
    const say = (text, o = {}) => {
      if (lastToast) lastToast.forEach(e => e.remove());
      lastToast = ctx.toast(text, Object.assign({ offset: ctx.n === 3 ? Math.min(ctx.W, ctx.H) * 0.2 : 70 }, o));
      return lastToast;
    };

    const goals = P.map(() => 0);      // 2p: goals scored by player
    const lives = P.map(() => LIVES);  // 3p
    const out = P.map(() => false);
    const effects = P.map(() => []);   // per player {k, until, dur}
    const glob = [];                   // global effects {k, until, dur}
    let over = false;

    const PU = {
      narrow: { icon: '🥅', name: 'Узкие ворота', w: 2 },
      wide: { icon: '🕳️', name: 'Широкие ворота соперникам', w: 2, bad: true },
      puck2: { icon: '⚫', name: 'Вторая шайба!', w: 2 },
      big: { icon: '🔨', name: 'Большая бита', w: 2 },
      wall: { icon: '🧱', name: 'Стенка у ворот', w: 2 },
      power: { icon: '⚡', name: 'Мощный удар', w: 2 },
      ice: { icon: '🧊', name: 'Лёд! Без трения', w: 1.3 },
      vortex: { icon: '🌪️', name: 'Вихрь в центре!', w: 1.3 },
      ghost: { icon: '👻', name: 'Шайба-призрак', w: 1.3 },
      gold: { icon: '⭐', name: 'Золотой гол ×2' },
    };
    function addFx(list, k, dur) {
      const e = list.find(e => e.k === k);
      if (e) { e.until = ctx.time + dur; e.dur = dur; } else list.push({ k, until: ctx.time + dur, dur });
    }
    const has = (i, k) => effects[i].some(e => e.k === k);
    const gHas = (k) => glob.some(e => e.k === k);
    const delFx = (i, k) => { effects[i] = effects[i].filter(e => e.k !== k); };

    // ---------- geometry ----------
    let W = ctx.W, H = ctx.H, S, RM, RP, GOAL, MAXV, MALLET_V, IR;
    const edgeFn = (side) => side === 'bottom' ? { ax: 0, ay: -1, c: H } : side === 'top' ? { ax: 0, ay: 1, c: 0 }
      : side === 'left' ? { ax: 1, ay: 0, c: 0 } : { ax: -1, ay: 0, c: W };
    const active = () => P.filter(p => !out[p.i]).map(p => p.i);
    function clip(poly, nx, ny, k) {
      const res = [];
      for (let j = 0; j < poly.length; j++) {
        const a = poly[j], b = poly[(j + 1) % poly.length];
        const da = nx * a.x + ny * a.y - k, db = nx * b.x + ny * b.y - k;
        if (da <= 0) res.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
          const t = da / (da - db);
          res.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
      return res;
    }
    function regionPoly(i, inset) {
      let poly = [{ x: inset, y: inset }, { x: W - inset, y: inset }, { x: W - inset, y: H - inset }, { x: inset, y: H - inset }];
      const me = edgeFn(P[i].side);
      for (const k of active()) {
        if (k === i) continue;
        const o = edgeFn(P[k].side);
        poly = clip(poly, me.ax - o.ax, me.ay - o.ay, o.c - me.c);
      }
      return poly;
    }
    let fieldPolys = [];
    function rebuildRegions() { fieldPolys = P.map(p => out[p.i] ? [] : regionPoly(p.i, 0)); }
    function inPoly(poly, x, y) {
      let sign = 0;
      for (let j = 0; j < poly.length; j++) {
        const a = poly[j], b = poly[(j + 1) % poly.length];
        const cr = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
        if (Math.abs(cr) < 1e-9) continue;
        const s = cr > 0 ? 1 : -1;
        if (sign === 0) sign = s; else if (s !== sign) return false;
      }
      return true;
    }
    function project(poly, x, y) {
      if (poly.length < 3 || inPoly(poly, x, y)) return { x, y };
      let best = null, bd = Infinity;
      for (let j = 0; j < poly.length; j++) {
        const a = poly[j], b = poly[(j + 1) % poly.length];
        const ex = b.x - a.x, ey = b.y - a.y, L2 = ex * ex + ey * ey || 1;
        const t = U.clamp(((x - a.x) * ex + (y - a.y) * ey) / L2, 0, 1);
        const qx = a.x + ex * t, qy = a.y + ey * t, d = (qx - x) ** 2 + (qy - y) ** 2;
        if (d < bd) { bd = d; best = { x: qx, y: qy }; }
      }
      return best;
    }
    function seatActive(x, y) {
      let best = -1, bd = Infinity;
      for (const i of active()) {
        const e = edgeFn(P[i].side), d = e.ax * x + e.ay * y + e.c;
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    }
    function edgeMid(i) {
      const s = P[i].side;
      return s === 'bottom' ? { x: W / 2, y: H } : s === 'top' ? { x: W / 2, y: 0 } : s === 'left' ? { x: 0, y: H / 2 } : { x: W, y: H / 2 };
    }
    const ownerOf = (side) => { const p = P.find(q => q.side === side); return p ? p.i : -1; };

    function layout() {
      W = ctx.W; H = ctx.H;
      S = Math.min(W, H);
      RM = S * 0.058;
      RP = S * 0.034;
      GOAL = S * 0.36;
      MAXV = S * 2.4;
      MALLET_V = S * 4.5;
      IR = S * 0.04;
      rebuildRegions();
    }
    layout();
    const goalW = P.map(() => GOAL);   // animated current goal width
    const malR = P.map(() => RM);      // animated mallet radius
    const targetGoal = (i) => GOAL * (has(i, 'narrow') ? 0.55 : 1) * (has(i, 'wide') ? 1.5 : 1);
    const targetMal = (i) => RM * (has(i, 'big') ? 1.6 : 1);
    // goal opening half-width for side, or 0 if closed
    function goalHalf(side) {
      const i = ownerOf(side);
      if (i < 0 || out[i] || over) return 0;
      return goalW[i] / 2;
    }

    // ---------- objects ----------
    const pucks = [];
    const mallets = P.map(p => {
      const m = edgeMid(p.i), v = ctx.inward(p.i);
      return { x: m.x + v.x * S * 0.2, y: m.y + v.y * S * 0.2, vx: 0, vy: 0, tx: null, ty: null, ptr: null };
    });
    const flash = P.map(() => 0);
    const items = [];

    // ---------- juice ----------
    const parts = [], rings = [];
    let shakeT = 0, shakeA = 0, flashA = 0, flashC = '#fff';
    function burst(x, y, color, n, speed, life = 0.6, size = 4) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.25 + Math.random() * 0.75);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, t: life * (0.6 + Math.random() * 0.4), color, size: size * (0.6 + Math.random() * 0.8) });
      }
      if (parts.length > 700) parts.splice(0, parts.length - 700);
    }
    function sparks(x, y, nx, ny, color, n, speed) {
      for (let k = 0; k < n; k++) {
        const a = Math.atan2(ny, nx) + U.rand(-1.1, 1.1), s = speed * U.rand(0.3, 1);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.45, t: U.rand(0.2, 0.45), color, size: U.rand(2, 4.5) });
      }
    }
    const ring = (x, y, r0, r1, color, life = 0.5, w = 5) => rings.push({ x, y, r0, r1, color, life, t: life, w });
    const shake = (a, t = 0.35) => { shakeA = Math.max(shakeT > 0 ? shakeA : 0, a); shakeT = Math.max(shakeT, t); };
    function updJuice(dt) {
      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k]; p.t -= dt;
        if (p.t <= 0) { parts.splice(k, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        const d = Math.exp(-3 * dt); p.vx *= d; p.vy *= d;
      }
      for (let k = rings.length - 1; k >= 0; k--) { rings[k].t -= dt; if (rings[k].t <= 0) rings.splice(k, 1); }
      shakeT = Math.max(0, shakeT - dt);
      flashA = Math.max(0, flashA - dt * 2.5);
    }
    function drawJuice() {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const p of parts) {
        const a = Math.max(0, p.t / p.life);
        g.globalAlpha = Math.min(1, a * 1.4);
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, Math.PI * 2); g.fill();
      }
      g.globalCompositeOperation = 'source-over';
      for (const r of rings) {
        const k = 1 - r.t / r.life;
        g.globalAlpha = 1 - k;
        g.strokeStyle = r.color; g.lineWidth = r.w * (1 - k) + 1;
        g.beginPath(); g.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, Math.PI * 2); g.stroke();
      }
      g.restore();
    }

    ctx.onResize(() => {
      const ow = W, oh = H, os = S;
      layout();
      const sx = W / ow, sy = H / oh;
      for (const pk of pucks) { pk.x *= sx; pk.y *= sy; pk.trail = []; }
      for (const it of items) { it.x *= sx; it.y *= sy; }
      parts.length = 0;
      P.forEach(p => { goalW[p.i] *= S / os; malR[p.i] *= S / os; });
      for (const m of mallets) {
        m.x *= sx; m.y *= sy;
        if (m.tx != null) { m.tx *= sx; m.ty *= sy; }
      }
      P.forEach(p => { if (!out[p.i]) { const q = project(regionPoly(p.i, malR[p.i]), mallets[p.i].x, mallets[p.i].y); mallets[p.i].x = q.x; mallets[p.i].y = q.y; } });
    });

    // ---------- input ----------
    const owner = new Map();
    let malletPolys = P.map(p => regionPoly(p.i, RM));
    ctx.pointer(cv, {
      down(id, x, y) {
        if (over) return;
        const i = seatActive(x, y);
        if (i < 0) return;
        owner.set(id, i);
        const m = mallets[i];
        m.ptr = id;
        const q = project(malletPolys[i], x, y);
        m.tx = q.x; m.ty = q.y; m.fx = x; m.fy = y;
      },
      move(id, x, y) {
        const i = owner.get(id);
        if (i == null || out[i]) return;
        const m = mallets[i];
        if (m.ptr !== id) return;
        m.fx = x; m.fy = y;
        const q = project(malletPolys[i], x, y);
        m.tx = q.x; m.ty = q.y;
      },
      up(id) {
        const i = owner.get(id);
        owner.delete(id);
        if (i != null && mallets[i].ptr === id) { mallets[i].ptr = null; mallets[i].tx = null; mallets[i].fx = null; }
      },
    });

    // ---------- serve / goals ----------
    let serving = false;
    function newPuck(x, y, vx, vy) {
      const pk = { x, y, vx, vy, alpha: 0, trail: [], last: null, ghostUntil: 0, boostUntil: 0 };
      pucks.push(pk);
      return pk;
    }
    function serve(toward) {
      serving = false;
      if (over) return;
      const act = active();
      if (toward == null || out[toward]) toward = U.pick(act);
      const v = ctx.inward(toward);
      const ang = U.rand(-0.45, 0.45);
      const dx = -v.x, dy = -v.y, c = Math.cos(ang), s = Math.sin(ang);
      const sp = S * 0.32;
      newPuck(W / 2, H / 2, (dx * c - dy * s) * sp, (dx * s + dy * c) * sp);
      ring(W / 2, H / 2, RP, RP * 4, '#dff1ff', 0.5, 4);
    }
    serving = true;
    ctx.after(500, () => serve());

    function goalAgainst(i, pk) {
      pucks.splice(pucks.indexOf(pk), 1);
      flash[i] = 1;
      const val = gHas('gold') ? 2 : 1;
      const m = edgeMid(i), v = ctx.inward(i);
      burst(m.x + v.x * 10, m.y + v.y * 10, P[i].color, 50, S * 1.1, 0.9, 5);
      burst(m.x + v.x * 10, m.y + v.y * 10, val > 1 ? '#ffd84a' : '#ffffff', 20, S * 0.8, 0.7, 3);
      ring(m.x, m.y, RP, S * 0.3, P[i].color, 0.6, 8);
      shake(S * 0.02, 0.45);
      flashA = 0.4; flashC = P[i].color;
      const x2 = val > 1 ? ' ×2' : '';
      if (N === 2) {
        const sc = 1 - i;
        goals[sc] += val;
        if (goals[sc] >= WIN_GOALS) {
          over = true;
          pucks.length = 0; items.length = 0;
          say(`🏆 ${P[sc].name} победил!`, { color: P[sc].color, fg: '#111', ms: 1400 });
          ctx.after(1300, () => ctx.end({ winner: sc, scores: goals.slice(), msg: `Счёт ${goals[0]} : ${goals[1]}` }));
          return;
        }
        say(`🥅 Гол${x2}! +${val} ${P[sc].name}`, { color: P[sc].color, fg: '#111' });
      } else {
        lives[i] = Math.max(0, lives[i] - val);
        if (lives[i] <= 0) {
          out[i] = true;
          effects[i] = [];
          const mm = mallets[i]; mm.ptr = null; mm.tx = null;
          rebuildRegions();
          const act = active();
          if (act.length <= 1) {
            over = true;
            pucks.length = 0; items.length = 0;
            const w = act[0];
            say(`🏆 ${P[w].name} победил!`, { color: P[w].color, fg: '#111', ms: 1400 });
            ctx.after(1300, () => ctx.end({ winner: w, scores: lives.slice(), msg: 'Остался последним' }));
            return;
          }
          say(`💀 ${P[i].name} выбывает`, { color: P[i].color, fg: '#111', ms: 1400 });
        } else {
          say(`🥅 Гол${x2}! ${P[i].name}: −${val} ${val > 1 ? 'жизни' : 'жизнь'}`, { color: P[i].color, fg: '#111' });
        }
      }
      if (pucks.length === 0 && !serving) { serving = true; ctx.after(1000, () => serve(i)); }
    }

    // ---------- items ----------
    let nextItem = 4, nextGold = U.rand(25, 35);
    function spawnItem() {
      const pool = Object.keys(PU).filter(k => PU[k].w).map(k => [k, PU[k].w]);
      if (pucks.length >= 3) pool.forEach(e => { if (e[0] === 'puck2') e[1] = 0; });
      const tot = pool.reduce((s, e) => s + e[1], 0);
      let r = Math.random() * tot, k = pool[0][0];
      for (const e of pool) { r -= e[1]; if (r <= 0) { k = e[0]; break; } }
      for (let tries = 0; tries < 20; tries++) {
        const x = U.rand(W * 0.2, W * 0.8), y = U.rand(H * 0.2, H * 0.8);
        if (items.some(it => Math.hypot(it.x - x, it.y - y) < IR * 4)) continue;
        if (mallets.some((m, j) => !out[j] && Math.hypot(m.x - x, m.y - y) < malR[j] + IR * 1.5)) continue;
        items.push({ x, y, k, born: ctx.time, life: 12 });
        ring(x, y, IR * 2.5, IR, '#ffffff', 0.4, 3);
        return;
      }
    }
    function collect(it, pk) {
      const i = pk.last, def = PU[it.k], col = P[i].color;
      const opp = active().filter(j => j !== i);
      burst(it.x, it.y, col, 26, S * 0.7, 0.7, 4);
      burst(it.x, it.y, '#ffffff', 10, S * 0.4, 0.5, 3);
      ring(it.x, it.y, IR, IR * 4, col, 0.55, 6);
      switch (it.k) {
        case 'narrow': addFx(effects[i], 'narrow', 10); break;
        case 'wide': opp.forEach(j => addFx(effects[j], 'wide', 9)); break;
        case 'big': addFx(effects[i], 'big', 10); break;
        case 'wall': addFx(effects[i], 'wall', 9); break;
        case 'power': addFx(effects[i], 'power', 12); break;
        case 'ice': addFx(glob, 'ice', 8); break;
        case 'vortex': addFx(glob, 'vortex', 8); break;
        case 'ghost': pk.ghostUntil = ctx.time + 5; break;
        case 'puck2': {
          const a = Math.random() * Math.PI * 2, sp = S * 0.4;
          const np = newPuck(it.x, it.y, Math.cos(a) * sp, Math.sin(a) * sp);
          np.alpha = 1; np.last = i;
          break;
        }
      }
      say(`${def.icon} ${def.name}`, { color: col, fg: '#111', ms: 1300 });
    }

    // ---------- physics ----------
    function collideMallet(pk, j) {
      const m = mallets[j], rm = malR[j];
      const dx = pk.x - m.x, dy = pk.y - m.y, min = rm + RP;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) return;
      let d = Math.sqrt(d2), nx, ny;
      if (d < 1e-6) { nx = 0; ny = -1; } else { nx = dx / d; ny = dy / d; }
      pk.x = m.x + nx * min; pk.y = m.y + ny * min;
      const rel = (pk.vx - m.vx) * nx + (pk.vy - m.vy) * ny;
      if (rel < 0) {
        pk.vx -= (1 + E_MALLET) * rel * nx;
        pk.vy -= (1 + E_MALLET) * rel * ny;
        pk.last = j;
        const imp = -rel;
        const cx = m.x + nx * rm, cy = m.y + ny * rm;
        if (has(j, 'power') && imp > S * 0.25) {
          delFx(j, 'power');
          pk.vx *= 2; pk.vy *= 2;
          pk.boostUntil = ctx.time + 1.2;
          sparks(cx, cy, nx, ny, '#ffe95c', 40, S * 1.3);
          ring(cx, cy, RP, S * 0.18, '#ffe95c', 0.4, 6);
          shake(S * 0.012, 0.25);
          say('⚡ Мощный удар!', { color: P[j].color, fg: '#111', ms: 800 });
        } else if (imp > S * 0.15) {
          sparks(cx, cy, nx, ny, P[j].color, Math.min(24, 4 + Math.round(imp / S * 10)), Math.min(S * 1.2, imp * 0.6));
          if (imp > S * 1.5) shake(S * 0.005, 0.12);
        }
      }
    }
    function bounce(pk, nx, ny, e) {
      const vn = pk.vx * nx + pk.vy * ny;
      if (vn < 0) {
        pk.vx -= (1 + e) * vn * nx; pk.vy -= (1 + e) * vn * ny;
        if (-vn > S * 1.0) sparks(pk.x - nx * RP, pk.y - ny * RP, nx, ny, '#cfe8ff', 6, S * 0.5);
      }
    }
    function postBounce(pk, px, py, e) {
      const dx = pk.x - px, dy = pk.y - py, d = Math.hypot(dx, dy);
      if (d >= RP || d < 1e-6) return;
      const nx = dx / d, ny = dy / d;
      pk.x = px + nx * RP; pk.y = py + ny * RP;
      bounce(pk, nx, ny, e);
    }
    // capsule segment collision (temporary wall in front of a goal)
    function segBounce(pk, ax, ay, bx, by, rad, e) {
      const ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey || 1;
      const t = U.clamp(((pk.x - ax) * ex + (pk.y - ay) * ey) / L2, 0, 1);
      const qx = ax + ex * t, qy = ay + ey * t;
      const dx = pk.x - qx, dy = pk.y - qy, d = Math.hypot(dx, dy), min = RP + rad;
      if (d >= min || d < 1e-6) return;
      const nx = dx / d, ny = dy / d;
      pk.x = qx + nx * min; pk.y = qy + ny * min;
      bounce(pk, nx, ny, e);
    }
    function wallSeg(i) {
      const m = edgeMid(i), v = ctx.inward(i), a = ctx.toScreen(i, 1, 0);
      const d = S * 0.15, half = goalW[i] * 0.42;
      const cx = m.x + v.x * d, cy = m.y + v.y * d;
      return [cx - a.x * half, cy - a.y * half, cx + a.x * half, cy + a.y * half];
    }
    function walls(pk, e) {
      for (const side of ['left', 'right']) {
        const gh = goalHalf(side);
        const open = gh > 0 && Math.abs(pk.y - H / 2) < gh;
        if (side === 'left') { if (pk.x < RP && !open) { pk.x = RP; bounce(pk, 1, 0, e); } }
        else if (pk.x > W - RP && !open) { pk.x = W - RP; bounce(pk, -1, 0, e); }
        if (gh > 0) { const ex = side === 'left' ? 0 : W; postBounce(pk, ex, H / 2 - gh, e); postBounce(pk, ex, H / 2 + gh, e); }
      }
      for (const side of ['top', 'bottom']) {
        const gh = goalHalf(side);
        const open = gh > 0 && Math.abs(pk.x - W / 2) < gh;
        if (side === 'top') { if (pk.y < RP && !open) { pk.y = RP; bounce(pk, 0, 1, e); } }
        else if (pk.y > H - RP && !open) { pk.y = H - RP; bounce(pk, 0, -1, e); }
        if (gh > 0) { const ey = side === 'top' ? 0 : H; postBounce(pk, W / 2 - gh, ey, e); postBounce(pk, W / 2 + gh, ey, e); }
      }
      for (const p of P) if (!out[p.i] && has(p.i, 'wall')) { const s = wallSeg(p.i); segBounce(pk, s[0], s[1], s[2], s[3], S * 0.012, e); }
      if (pk.x < -RP * 0.2) return ownerOf('left');
      if (pk.x > W + RP * 0.2) return ownerOf('right');
      if (pk.y < -RP * 0.2) return ownerOf('top');
      if (pk.y > H + RP * 0.2) return ownerOf('bottom');
      return -1;
    }
    function puckPuck(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = RP * 2;
      if (d >= min || d < 1e-6) return;
      const nx = dx / d, ny = dy / d, o = (min - d) / 2;
      a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) { const j = -rv * 0.95; a.vx -= j * nx; a.vy -= j * ny; b.vx += j * nx; b.vy += j * ny; }
    }

    function step(dt) {
      // effects
      for (const p of P) effects[p.i] = effects[p.i].filter(e => e.until > ctx.time);
      for (let k = glob.length - 1; k >= 0; k--) {
        if (glob[k].until <= ctx.time) {
          if (glob[k].k === 'gold') say('⭐ Золотой гол закончился', { ms: 900 });
          glob.splice(k, 1);
        }
      }
      const kk = 1 - Math.exp(-dt * 8);
      for (const p of P) {
        goalW[p.i] += (targetGoal(p.i) - goalW[p.i]) * kk;
        malR[p.i] += (targetMal(p.i) - malR[p.i]) * kk;
      }
      malletPolys = P.map(p => out[p.i] ? [] : regionPoly(p.i, malR[p.i]));
      // re-project targets in case the region changed (bigger mallet, someone knocked out)
      for (const p of P) {
        const m = mallets[p.i];
        if (out[p.i]) continue;
        if (m.fx != null) { const q = project(malletPolys[p.i], m.fx, m.fy); m.tx = q.x; m.ty = q.y; }
        else { const q = project(malletPolys[p.i], m.x, m.y); if (Math.abs(q.x - m.x) + Math.abs(q.y - m.y) > 0.5) { m.tx = q.x; m.ty = q.y; } }
      }
      const ice = gHas('ice'), vortex = gHas('vortex');
      const eWall = ice ? 0.98 : 0.88;
      let maxSp = 0;
      for (const pk of pucks) maxSp = Math.max(maxSp, Math.hypot(pk.vx, pk.vy));
      const n = U.clamp(Math.ceil(Math.max(maxSp, MALLET_V) * dt / (RP * 0.4)), 1, 60);
      const h = dt / n;
      const fr = ice ? 1 : Math.exp(-0.25 * h);
      for (let s = 0; s < n; s++) {
        for (const p of P) {
          const m = mallets[p.i];
          if (out[p.i]) { m.vx = m.vy = 0; continue; }
          const ox = m.x, oy = m.y;
          if (m.tx != null) {
            const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy), mx = MALLET_V * h;
            if (d > mx) { m.x += dx / d * mx; m.y += dy / d * mx; } else { m.x = m.tx; m.y = m.ty; }
          }
          m.vx = (m.x - ox) / h; m.vy = (m.y - oy) / h;
        }
        for (let q = pucks.length - 1; q >= 0; q--) {
          const pk = pucks[q];
          if (vortex) {
            const dx = pk.x - W / 2, dy = pk.y - H / 2, d = Math.hypot(dx, dy), rad = S * 0.32;
            if (d < rad && d > 1) {
              const f = S * 2.2 * (1 - d / rad);
              pk.vx += (-dy / d) * f * h - dx / d * f * 0.15 * h;
              pk.vy += (dx / d) * f * h - dy / d * f * 0.15 * h;
            }
          }
          pk.x += pk.vx * h; pk.y += pk.vy * h;
          pk.vx *= fr; pk.vy *= fr;
          for (const p of P) if (!out[p.i]) collideMallet(pk, p.i);
          for (const o of pucks) if (o !== pk) puckPuck(pk, o);
          const gi = walls(pk, eWall);
          for (const p of P) {
            if (out[p.i]) continue;
            const m = mallets[p.i], dx = m.x - pk.x, dy = m.y - pk.y, d = Math.hypot(dx, dy), min = malR[p.i] + RP;
            if (d < min && d > 1e-6) { m.x = pk.x + dx / d * min; m.y = pk.y + dy / d * min; }
          }
          const cap = pk.boostUntil > ctx.time ? MAXV * 1.5 : MAXV;
          const v = Math.hypot(pk.vx, pk.vy);
          if (v > cap) { pk.vx *= cap / v; pk.vy *= cap / v; }
          if (gi >= 0) { goalAgainst(gi, pk); if (over) return; }
        }
      }
      // items
      for (const pk of pucks) {
        if (pk.last == null || out[pk.last]) continue;
        for (let k = items.length - 1; k >= 0; k--) {
          const it = items[k];
          if (Math.hypot(it.x - pk.x, it.y - pk.y) < IR * 1.3 + RP) { items.splice(k, 1); collect(it, pk); }
        }
      }
      for (let k = items.length - 1; k >= 0; k--) if (ctx.time - items[k].born > items[k].life) items.splice(k, 1);
      if (ctx.time > nextItem) {
        if (items.length < 2) spawnItem();
        nextItem = ctx.time + U.rand(4, 6.5);
      }
      if (ctx.time > nextGold) {
        addFx(glob, 'gold', 10);
        say('⭐ Золотой гол ×2 — 10 секунд!', { color: '#ffd84a', fg: '#111', ms: 1600 });
        ring(W / 2, H / 2, S * 0.05, S * 0.6, '#ffd84a', 0.8, 10);
        nextGold = ctx.time + U.rand(35, 45);
      }
      // per-frame visuals
      for (const pk of pucks) {
        pk.alpha = Math.min(1, pk.alpha + dt * 5);
        pk.trail.push({ x: pk.x, y: pk.y });
        if (pk.trail.length > 10) pk.trail.shift();
        if (pk.boostUntil > ctx.time) burst(pk.x, pk.y, '#ffe95c', 2, S * 0.1, 0.4, 3);
      }
      if (vortex && Math.random() < dt * 40) {
        const a = Math.random() * Math.PI * 2, r = U.rand(0.05, 0.32) * S;
        parts.push({ x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r, vx: -Math.sin(a) * S * 0.5, vy: Math.cos(a) * S * 0.5, life: 0.7, t: 0.7, color: '#9fd8ff', size: 2.5 });
      }
    }

    // ---------- drawing ----------
    function poly(pts) {
      g.beginPath();
      pts.forEach((p, j) => j ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
      g.closePath();
    }
    function circle(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
    function emoji(ch, x, y, size) {
      g.font = `${Math.round(size)}px ${EMOJI}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ch, x, y + size * 0.05);
    }

    function drawField() {
      const gold = gHas('gold'), ice = gHas('ice');
      g.fillStyle = ice ? '#13203a' : '#0f1220';
      g.fillRect(-40, -40, W + 80, H + 80);
      P.forEach(p => {
        if (out[p.i] || fieldPolys[p.i].length < 3) return;
        poly(fieldPolys[p.i]);
        g.fillStyle = U.alpha(p.color, 0.06);
        g.fill();
      });
      if (ice) {
        // frosty sheen
        const gr = g.createLinearGradient(0, 0, W, H);
        gr.addColorStop(0, 'rgba(180,230,255,.07)'); gr.addColorStop(0.5, 'rgba(180,230,255,.02)'); gr.addColorStop(1, 'rgba(180,230,255,.08)');
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      }
      g.save();
      g.setLineDash([14, 12]);
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(255,255,255,.12)';
      if (N === 2) {
        g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
        g.setLineDash([]);
        circle(W / 2, H / 2, S * 0.13); g.stroke();
      } else {
        P.forEach(p => { if (!out[p.i] && fieldPolys[p.i].length >= 3) { poly(fieldPolys[p.i]); g.stroke(); } });
      }
      g.restore();
      if (gHas('vortex')) {
        g.save();
        g.translate(W / 2, H / 2);
        g.rotate(ctx.time * 3);
        for (let k = 0; k < 4; k++) {
          g.rotate(Math.PI / 2);
          g.beginPath();
          for (let s = 0; s <= 30; s++) { const t = s / 30, r = S * 0.32 * t, a = t * 2.4; s ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(0, 0); }
          g.strokeStyle = 'rgba(140,210,255,.28)'; g.lineWidth = 3; g.stroke();
        }
        g.restore();
      }
      circle(W / 2, H / 2, 6); g.fillStyle = 'rgba(255,255,255,.18)'; g.fill();

      g.lineWidth = 8;
      g.strokeStyle = gold ? `rgba(255,216,74,${0.55 + 0.3 * Math.sin(ctx.time * 8)})` : '#3a4270';
      g.strokeRect(4, 4, W - 8, H - 8);
      for (const p of P) {
        const side = p.side, gh = out[p.i] ? GOAL / 2 : goalW[p.i] / 2;
        const horiz = side === 'top' || side === 'bottom';
        const ex = side === 'left' ? 0 : side === 'right' ? W : W / 2;
        const ey = side === 'top' ? 0 : side === 'bottom' ? H : H / 2;
        if (out[p.i]) {
          g.fillStyle = '#4a5280';
          if (horiz) g.fillRect(W / 2 - gh, side === 'top' ? 0 : H - 10, gh * 2, 10);
          else g.fillRect(side === 'left' ? 0 : W - 10, H / 2 - gh, 10, gh * 2);
          continue;
        }
        const f = flash[p.i];
        g.fillStyle = '#0f1220';
        if (horiz) g.fillRect(W / 2 - gh, side === 'top' ? 0 : H - 10, gh * 2, 10);
        else g.fillRect(side === 'left' ? 0 : W - 10, H / 2 - gh, 10, gh * 2);
        const v = ctx.inward(p.i);
        const depth = S * 0.07;
        const grad = g.createLinearGradient(ex, ey, ex + v.x * depth, ey + v.y * depth);
        grad.addColorStop(0, U.alpha(gold ? '#ffd84a' : p.color, 0.45 + 0.5 * f));
        grad.addColorStop(1, U.alpha(p.color, 0));
        g.fillStyle = grad;
        if (horiz) g.fillRect(W / 2 - gh, side === 'top' ? 0 : H - depth, gh * 2, depth);
        else g.fillRect(side === 'left' ? 0 : W - depth, H / 2 - gh, depth, gh * 2);
        g.fillStyle = p.color;
        g.shadowColor = p.color; g.shadowBlur = 14;
        const posts = horiz ? [[W / 2 - gh, ey], [W / 2 + gh, ey]] : [[ex, H / 2 - gh], [ex, H / 2 + gh]];
        for (const [x, y] of posts) { circle(x, y, 9); g.fill(); }
        g.shadowBlur = 0;
        g.strokeStyle = U.alpha(p.color, 0.35);
        g.lineWidth = 3;
        g.beginPath();
        const a0 = Math.atan2(v.y, v.x);
        g.arc(ex, ey, gh, a0 - Math.PI / 2, a0 + Math.PI / 2);
        g.stroke();
        if (has(p.i, 'wall')) {
          const s = wallSeg(p.i);
          g.save();
          g.lineCap = 'round';
          g.shadowColor = '#ffb35c'; g.shadowBlur = 18;
          g.strokeStyle = '#ffb35c'; g.lineWidth = S * 0.024;
          g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); g.stroke();
          g.restore();
        }
      }
    }

    // effect timer rings in rows: from x0 going in `dir`, wrapping inward (local -y) before xMax
    function drawEffectRings(list, x0, y0, dir, avail) {
      const r = S * 0.026, gap = r * 2.5;
      const perRow = Math.max(1, Math.floor(avail / gap) + 1);
      list.forEach((e, k) => {
        const x = x0 + dir * (k % perRow) * gap, y = y0 - Math.floor(k / perRow) * gap;
        const frac = U.clamp((e.until - ctx.time) / e.dur, 0, 1);
        circle(x, y, r); g.fillStyle = 'rgba(10,12,24,.75)'; g.fill();
        g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 4; g.stroke();
        g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        g.strokeStyle = PU[e.k].bad ? '#ff6b6b' : e.k === 'gold' ? '#ffd84a' : '#5dffa8'; g.lineWidth = 4; g.stroke();
        emoji(PU[e.k].icon, x, y, r * 1.15);
      });
    }
    function drawHud() {
      for (const p of P) {
        const m = edgeMid(p.i), v = ctx.inward(p.i);
        const len = (p.side === 'left' || p.side === 'right') ? H : W;
        const off = Math.min(GOAL / 2 + S * 0.15, len / 2 - S * 0.1);
        g.save();
        ctx.facing(g, p.i, m.x + v.x * S * 0.075, m.y + v.y * S * 0.075);
        if (!out[p.i]) {
          const x0 = -(GOAL / 2 + S * 0.06), xEnd = -(len / 2 - S * 0.04);
          drawEffectRings(effects[p.i].concat(glob), x0, 0, -1, Math.max(0, x0 - xEnd));
        }
        g.translate(off, 0);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (N === 2) {
          const o = 1 - p.i;
          g.font = `900 ${Math.round(S * 0.07)}px ${FONT}`;
          g.fillStyle = p.color;
          g.shadowColor = p.color; g.shadowBlur = 12;
          g.fillText(goals[p.i], -S * 0.045, 0);
          g.shadowBlur = 0;
          g.font = `800 ${Math.round(S * 0.045)}px ${FONT}`;
          g.fillStyle = 'rgba(255,255,255,.5)';
          g.fillText(':', 0, -2);
          g.fillStyle = P[o].color;
          g.fillText(goals[o], S * 0.04, 2);
          g.font = `700 ${Math.round(S * 0.02)}px ${FONT}`;
          g.fillStyle = 'rgba(255,255,255,.45)';
          g.fillText(`до ${WIN_GOALS}`, 0, S * 0.045);
        } else if (out[p.i]) {
          g.font = `900 ${Math.round(S * 0.04)}px ${FONT}`;
          g.fillStyle = U.alpha(p.color, 0.6);
          g.fillText('выбыл', 0, 0);
        } else {
          const r = S * 0.013, gap = S * 0.036;
          for (let k = 0; k < LIVES; k++) {
            circle((k - (LIVES - 1) / 2) * gap, -S * 0.008, r);
            if (k < lives[p.i]) { g.fillStyle = p.color; g.shadowColor = p.color; g.shadowBlur = 10; g.fill(); g.shadowBlur = 0; }
            else { g.strokeStyle = U.alpha(p.color, 0.5); g.lineWidth = 2; g.stroke(); }
          }
          g.font = `700 ${Math.round(S * 0.02)}px ${FONT}`;
          g.fillStyle = 'rgba(255,255,255,.45)';
          g.fillText('жизни', 0, S * 0.03);
        }
        g.restore();
      }
    }

    function drawMallet(p, m) {
      const c = p.color, rm = malR[p.i];
      g.save();
      const pw = has(p.i, 'power');
      g.shadowColor = pw ? '#ffe95c' : c; g.shadowBlur = (m.ptr != null ? 26 : 14) + (pw ? 10 + 8 * Math.sin(ctx.time * 12) : 0);
      circle(m.x, m.y, rm);
      const gr = g.createRadialGradient(m.x - rm * 0.3, m.y - rm * 0.3, rm * 0.1, m.x, m.y, rm);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.25, c);
      gr.addColorStop(1, U.alpha(c, 0.75));
      g.fillStyle = gr; g.fill();
      g.shadowBlur = 0;
      circle(m.x, m.y, rm * 0.72);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.stroke();
      circle(m.x, m.y, rm * 0.42);
      g.fillStyle = c; g.fill();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.stroke();
      if (pw) {
        circle(m.x, m.y, rm + 5 + 3 * Math.sin(ctx.time * 12));
        g.strokeStyle = 'rgba(255,233,92,.8)'; g.lineWidth = 3; g.stroke();
        emoji('⚡', m.x, m.y, rm * 0.6);
      }
      g.restore();
    }

    function drawPucks() {
      for (const pk of pucks) {
        let alpha = pk.alpha;
        if (pk.ghostUntil > ctx.time) alpha *= (Math.sin(ctx.time * 11) > 0.5 ? 0.9 : 0.05);
        const col = pk.last != null ? P[pk.last].color : '#bfe6ff';
        g.save();
        g.globalAlpha = alpha;
        for (let k = 0; k < pk.trail.length; k++) {
          const tr = pk.trail[k], a = (k + 1) / pk.trail.length;
          circle(tr.x, tr.y, RP * (0.35 + 0.55 * a));
          g.fillStyle = U.alpha(col, 0.16 * a);
          g.fill();
        }
        g.shadowColor = pk.boostUntil > ctx.time ? '#ffe95c' : col; g.shadowBlur = 22;
        circle(pk.x, pk.y, RP);
        g.fillStyle = '#eef6ff'; g.fill();
        g.shadowBlur = 0;
        circle(pk.x, pk.y, RP * 0.62);
        g.strokeStyle = U.alpha(col, 0.7); g.lineWidth = 3; g.stroke();
        g.restore();
      }
      if (serving && !over) {
        const a = 0.25 + 0.2 * Math.sin(performance.now() / 120);
        circle(W / 2, H / 2, RP * 1.2);
        g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 3; g.stroke();
      }
    }
    function drawItems() {
      for (const it of items) {
        const age = ctx.time - it.born, left = it.life - age;
        if (left < 2.5 && Math.sin(age * 20) < 0) continue;
        const r = IR * (0.6 + 0.4 * Math.min(1, age * 4)) * (1 + 0.06 * Math.sin(age * 5));
        g.save();
        g.translate(it.x, it.y);
        g.shadowColor = '#fff'; g.shadowBlur = 18;
        circle(0, 0, r); g.fillStyle = 'rgba(30,36,70,.92)'; g.fill();
        g.lineWidth = 3; g.strokeStyle = `hsla(${(age * 120) % 360},90%,70%,.95)`; g.stroke();
        g.shadowBlur = 0;
        g.rotate(Math.sin(age * 1.5) * 0.35);
        emoji(PU[it.k].icon, 0, 0, r * 1.15);
        g.restore();
      }
    }

    ctx.loop((dt) => {
      if (dt > 0) {
        if (!over) step(dt);
        updJuice(dt);
        for (let i = 0; i < flash.length; i++) flash[i] = Math.max(0, flash[i] - dt * 1.2);
      }
      g.save();
      if (shakeT > 0) { const k = shakeA * Math.min(1, shakeT / 0.3); g.translate(U.rand(-k, k), U.rand(-k, k)); }
      drawField();
      drawHud();
      drawItems();
      for (const p of P) if (!out[p.i]) drawMallet(p, mallets[p.i]);
      drawPucks();
      drawJuice();
      g.restore();
      if (flashA > 0) { g.fillStyle = U.alpha(flashC, flashA * 0.3); g.fillRect(0, 0, W, H); }
    });

    ctx._ah = { pucks, mallets, goals, lives, out, items, effects, glob, spawnItem, PU, newPuck };
  },
});
