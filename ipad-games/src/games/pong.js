registerGame({
  id: 'pong',
  title: 'Пинг-понг',
  emoji: '🏓',
  desc: 'Отбивай мяч и лови бонусы',
  rules: 'У каждого ракетка вдоль своего края. Води пальцем в своей части экрана — ракетка едет за пальцем.\n' +
    'Пропустил мяч — минус жизнь (их 3). Выбывший игрок превращается в стенку. Последний оставшийся побеждает.\n' +
    'Чем дальше от центра ракетки попал мяч, тем круче он отлетает. Мяч ускоряется с каждым ударом.\n' +
    'Бонусы на поле достаются тому, кто последним отбил мяч:\n' +
    '📏 длинная ракетка · 🤏 мини-ракетки соперникам · ⚽ мультимяч (+2 мяча)\n' +
    '🔥 огненный мяч · 🌀 кручёный мяч · 👻 мяч-призрак\n' +
    '🧱 щит за спиной (спасёт один раз) · ❄️ заморозка соперников · 🔄 соперникам управление наоборот\n' +
    '❤️ +1 жизнь (появляется, когда кто-то отстаёт). Отстающим бонусы действуют дольше.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const { cv, g } = ctx.canvas();
    const P = ctx.players;
    const N = ctx.n;
    const LIVES = 3;
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
    const lives = P.map(() => LIVES);
    const out = P.map(() => false);
    const effects = P.map(() => []); // {k, until, dur}
    let over = false;

    let W, H, S, R, PL, PT, EDGE, FACE, BASEV, MAXV, CORNER, IR;
    const sideOf = (s) => P.find(p => p.side === s);
    const isPaddle = (s) => { const p = sideOf(s); return !!p && !out[p.i]; };
    const hasSeat = (s) => !!sideOf(s);
    const active = () => P.filter(p => !out[p.i]).map(p => p.i);
    function edgeMid(i) {
      const s = P[i].side;
      return s === 'bottom' ? { x: W / 2, y: H } : s === 'top' ? { x: W / 2, y: 0 } : s === 'left' ? { x: 0, y: H / 2 } : { x: W, y: H / 2 };
    }
    let corners = [];
    function layout() {
      W = ctx.W; H = ctx.H; S = Math.min(W, H);
      R = S * 0.022;
      PL = S * 0.25;
      PT = S * 0.026;
      EDGE = S * 0.06;
      FACE = EDGE + PT / 2;
      BASEV = S * 0.6;
      MAXV = S * 1.75;
      CORNER = FACE;
      IR = S * 0.04;
      corners = [];
      const add = (a, b, x, y) => { if (hasSeat(a) && hasSeat(b)) corners.push({ x, y, w: CORNER, h: CORNER }); };
      add('bottom', 'left', 0, H - CORNER);
      add('bottom', 'right', W - CORNER, H - CORNER);
      add('top', 'left', 0, 0);
      add('top', 'right', W - CORNER, 0);
    }
    layout();

    // ---------- effects ----------
    const PU = {
      long: { icon: '📏', name: 'Длинная ракетка', w: 3, good: true },
      mini: { icon: '🤏', name: 'Мини-ракетки соперникам', w: 2 },
      multi: { icon: '⚽', name: 'Мультимяч!', w: 2 },
      fire: { icon: '🔥', name: 'Огненный мяч!', w: 2 },
      curve: { icon: '🌀', name: 'Кручёный мяч!', w: 2 },
      shield: { icon: '🧱', name: 'Щит за спиной', w: 2, good: true },
      freeze: { icon: '❄️', name: 'Заморозка соперников', w: 2 },
      rev: { icon: '🔄', name: 'Соперникам наоборот', w: 1.5 },
      ghost: { icon: '👻', name: 'Мяч-призрак', w: 1.5 },
      life: { icon: '❤️', name: '+1 жизнь', w: 0 },
    };
    function addEffect(i, k, dur) {
      const e = effects[i].find(e => e.k === k);
      if (e) { e.until = ctx.time + dur; e.dur = dur; } else effects[i].push({ k, until: ctx.time + dur, dur });
    }
    const has = (i, k) => effects[i].some(e => e.k === k);
    const delEffect = (i, k) => { effects[i] = effects[i].filter(e => e.k !== k); };
    const trailing = (i) => { const act = active(); return act.length > 1 && lives[i] < Math.max(...act.map(j => lives[j])); };

    // ---------- paddles ----------
    const paddles = P.map(() => ({ u: 0, tu: 0, hit: 0, len: 0, fx: 0 }));
    const targetLen = (i) => PL * (has(i, 'long') ? 1.6 : 1) * (has(i, 'mini') ? 0.55 : 1);
    P.forEach(p => { paddles[p.i].len = PL; });
    function range(i) {
      const s = P[i].side, horiz = s === 'bottom' || s === 'top';
      const len = horiz ? W : H, mid = len / 2, pl = paddles[i].len;
      let smin = 0, smax = len;
      for (const c of corners) {
        const onEdge = s === 'bottom' ? c.y + c.h >= H - 1 : s === 'top' ? c.y <= 1 : s === 'left' ? c.x <= 1 : c.x + c.w >= W - 1;
        if (!onEdge) continue;
        if (horiz) { if (c.x <= 1) smin = Math.max(smin, c.x + c.w); else smax = Math.min(smax, c.x); }
        else { if (c.y <= 1) smin = Math.max(smin, c.y + c.h); else smax = Math.min(smax, c.y); }
      }
      const a = ctx.toScreen(i, 1, 0), sg = Math.round(horiz ? a.x : a.y);
      let u1 = sg * (smin + pl / 2 - mid), u2 = sg * (smax - pl / 2 - mid);
      if (u1 > u2) [u1, u2] = [u2, u1];
      if (u1 > u2) u1 = u2 = 0;
      return { lo: u1, hi: u2 };
    }
    function paddlePos(i) {
      const m = edgeMid(i), v = ctx.inward(i), a = ctx.toScreen(i, 1, 0), u = paddles[i].u;
      return { x: m.x + v.x * EDGE + a.x * u, y: m.y + v.y * EDGE + a.y * u };
    }

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
      const ow = W, oh = H;
      layout();
      for (const b of balls) { b.x *= W / ow; b.y *= H / oh; b.trail = []; }
      for (const it of items) { it.x *= W / ow; it.y *= H / oh; }
      parts.length = 0;
      P.forEach(p => { const r = range(p.i); paddles[p.i].u = U.clamp(paddles[p.i].u, r.lo, r.hi); paddles[p.i].tu = U.clamp(paddles[p.i].tu, r.lo, r.hi); });
    });

    // ---------- input ----------
    const owner = new Map();
    function seatActive(x, y) {
      let best = -1, bd = Infinity;
      for (const p of P) {
        if (out[p.i]) continue;
        const d = p.side === 'bottom' ? H - y : p.side === 'top' ? y : p.side === 'left' ? x : W - x;
        if (d < bd) { bd = d; best = p.i; }
      }
      return best;
    }
    function setTarget(i, x, y) {
      const m = edgeMid(i);
      const l = ctx.toLocal(i, x - m.x, y - m.y);
      const r = range(i);
      const lx = has(i, 'rev') ? -l.x : l.x;
      paddles[i].tu = U.clamp(lx, r.lo, r.hi);
      paddles[i].fx = l.x;
    }
    ctx.pointer(cv, {
      down(id, x, y) { if (over) return; const i = seatActive(x, y); if (i < 0) return; owner.set(id, i); setTarget(i, x, y); },
      move(id, x, y) { const i = owner.get(id); if (i == null || out[i]) return; setTarget(i, x, y); },
      up(id) { owner.delete(id); },
    });

    // ---------- balls ----------
    const balls = [];
    let rallyStart = 0;
    let serving = false;
    function newBall(x, y, vx, vy, sp, ownerI) {
      const b = { x, y, vx, vy, sp, trail: [], born: ctx.time, owner: ownerI, fire: false, curve: 0, curveUntil: 0, ghostUntil: 0 };
      balls.push(b);
      return b;
    }
    function spawnBall(toward) {
      const act = active();
      if (toward == null || out[toward]) toward = U.pick(act);
      const v = ctx.inward(toward);
      const ang = U.rand(-0.5, 0.5);
      const dx = -v.x, dy = -v.y, c = Math.cos(ang), s = Math.sin(ang);
      newBall(W / 2, H / 2, (dx * c - dy * s) * BASEV, (dx * s + dy * c) * BASEV, BASEV, null);
      ring(W / 2, H / 2, R, R * 5, '#fff', 0.5, 4);
    }
    function serve(toward) {
      if (over) return;
      serving = false;
      spawnBall(toward);
      rallyStart = ctx.time;
    }
    serving = true;
    ctx.after(600, () => serve());

    function lose(i, b) {
      lives[i]--;
      paddles[i].hit = -1;
      shake(S * 0.018, 0.4);
      flashA = 0.35; flashC = P[i].color;
      burst(U.clamp(b.x, 0, W), U.clamp(b.y, 0, H), P[i].color, 40, S * 0.9, 0.8, 5);
      burst(U.clamp(b.x, 0, W), U.clamp(b.y, 0, H), '#ffffff', 12, S * 0.6, 0.5, 3);
      if (lives[i] <= 0) {
        out[i] = true;
        effects[i] = [];
        const act = active();
        if (act.length <= 1) {
          over = true;
          balls.length = 0;
          items.length = 0;
          const w = act[0];
          say(`🏆 ${P[w].name} победил!`, { color: P[w].color, fg: '#111', ms: 1400 });
          ctx.after(1300, () => ctx.end({ winner: w, scores: lives.slice(), msg: 'Остался последним' }));
          return;
        }
        say(`💀 ${P[i].name} выбывает`, { color: P[i].color, fg: '#111', ms: 1400 });
      } else {
        say(`💔 ${P[i].name}: −1 жизнь`, { color: P[i].color, fg: '#111' });
      }
      rallyStart = ctx.time;
      if (balls.length === 0 && !serving) { serving = true; ctx.after(1000, () => serve(out[i] ? null : i)); }
    }

    // ---------- power-up items ----------
    const items = [];
    let nextItem = 4;
    function spawnItem() {
      const act = active();
      const imbalance = act.some(i => trailing(i));
      const pool = Object.keys(PU).map(k => [k, k === 'life' ? (imbalance ? 1.6 : 0) : PU[k].w]);
      if (N === 2 || act.length === 2) pool.forEach(e => { if (e[0] === 'rev') e[1] = 1.2; });
      let tot = pool.reduce((s, e) => s + e[1], 0), r = Math.random() * tot, k = pool[0][0];
      for (const e of pool) { r -= e[1]; if (r <= 0) { k = e[0]; break; } }
      for (let tries = 0; tries < 20; tries++) {
        const x = U.rand(W * 0.22, W * 0.78), y = U.rand(H * 0.22, H * 0.78);
        if (items.some(it => Math.hypot(it.x - x, it.y - y) < IR * 4)) continue;
        if (Math.hypot(x - W / 2, y - H / 2) < IR * 2) continue;
        items.push({ x, y, k, born: ctx.time, life: 12, spin: U.rand(-1, 1) });
        ring(x, y, IR * 2.5, IR, '#ffffff', 0.4, 3);
        return;
      }
    }
    function collect(it, b) {
      const i = b.owner;
      const def = PU[it.k];
      const bonus = trailing(i) ? 1.3 : 1;
      const opp = active().filter(j => j !== i);
      const col = P[i].color;
      burst(it.x, it.y, col, 26, S * 0.7, 0.7, 4);
      burst(it.x, it.y, '#ffffff', 10, S * 0.4, 0.5, 3);
      ring(it.x, it.y, IR, IR * 4, col, 0.55, 6);
      let msg = `${def.icon} ${def.name}`;
      switch (it.k) {
        case 'long': addEffect(i, 'long', 10 * bonus); break;
        case 'mini': opp.forEach(j => addEffect(j, 'mini', 8 * bonus)); break;
        case 'shield': addEffect(i, 'shield', 15 * bonus); break;
        case 'freeze': opp.forEach(j => { addEffect(j, 'freeze', 1.6 * bonus); const p = paddlePos(j); burst(p.x, p.y, '#bfe9ff', 24, S * 0.4, 0.8, 3); }); break;
        case 'rev': opp.forEach(j => addEffect(j, 'rev', 6 * bonus)); break;
        case 'multi': {
          const base = Math.atan2(b.vy, b.vx);
          for (const da of [-0.45, 0.45]) {
            if (balls.length >= 5) break;
            const nb = newBall(b.x, b.y, Math.cos(base + da) * b.sp, Math.sin(base + da) * b.sp, b.sp, i);
            nb.born = ctx.time - 1;
          }
          break;
        }
        case 'fire':
          b.fire = true; b.sp = Math.min(MAXV * 1.35, b.sp * 1.5);
          shake(S * 0.006, 0.2);
          break;
        case 'curve': b.curve = (Math.random() < 0.5 ? -1 : 1) * 1.6; b.curveUntil = ctx.time + 3.2; break;
        case 'ghost': b.ghostUntil = ctx.time + 5; break;
        case 'life': {
          let who = i;
          if (lives[i] >= LIVES) {
            const act = active();
            who = act.reduce((a, c) => lives[c] < lives[a] ? c : a, act[0]);
          }
          if (lives[who] < LIVES) lives[who]++;
          msg = `❤️ +1 жизнь: ${P[who].name}`;
          break;
        }
      }
      say(msg, { color: col, fg: '#111', ms: 1300 });
    }

    // ---------- physics ----------
    function wallAxis(b) {
      const wallOr = (s) => !isPaddle(s) || has(sideOf(s).i, 'shield');
      const shieldHit = (s) => {
        const p = sideOf(s);
        if (p && !out[p.i] && has(p.i, 'shield')) {
          delEffect(p.i, 'shield');
          sparks(b.x, b.y, ctx.inward(p.i).x, ctx.inward(p.i).y, '#ffcf8a', 26, S * 0.8);
          ring(b.x, b.y, R, R * 6, P[p.i].color, 0.5, 6);
          shake(S * 0.008, 0.2);
          say(`🧱 Щит спас: ${P[p.i].name}`, { color: P[p.i].color, fg: '#111', ms: 1000 });
          b.owner = p.i;
        }
      };
      if (b.x < R && wallOr('left')) { b.x = R; b.vx = Math.abs(b.vx); shieldHit('left'); }
      if (b.x > W - R && wallOr('right')) { b.x = W - R; b.vx = -Math.abs(b.vx); shieldHit('right'); }
      if (b.y < R && wallOr('top')) { b.y = R; b.vy = Math.abs(b.vy); shieldHit('top'); }
      if (b.y > H - R && wallOr('bottom')) { b.y = H - R; b.vy = -Math.abs(b.vy); shieldHit('bottom'); }
      for (const c of corners) {
        const qx = U.clamp(b.x, c.x, c.x + c.w), qy = U.clamp(b.y, c.y, c.y + c.h);
        let dx = b.x - qx, dy = b.y - qy;
        const d = Math.hypot(dx, dy);
        if (d >= R) continue;
        if (d < 1e-6) { const cx = c.x + c.w / 2, cy = c.y + c.h / 2; dx = W / 2 - cx; dy = H / 2 - cy; }
        const L = Math.hypot(dx, dy) || 1, nx = dx / L, ny = dy / L;
        if (d >= 1e-6) { b.x = qx + nx * R; b.y = qy + ny * R; } else { b.x += nx * R; b.y += ny * R; }
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; }
      }
    }
    function paddleHit(b, i) {
      const p = paddlePos(i), pl = paddles[i].len;
      const l = ctx.toLocal(i, b.x - p.x, b.y - p.y);
      const lv = ctx.toLocal(i, b.vx, b.vy);
      if (lv.y <= 0) return false;
      if (l.y < -PT / 2 - R || l.y > PT / 2) return false;
      if (Math.abs(l.x) > pl / 2 + R * 0.8) return false;
      const off = U.clamp(l.x / (pl / 2), -1, 1);
      const ang = off * 1.05 + U.rand(-0.05, 0.05);
      const wasFire = b.fire;
      if (b.fire) { b.fire = false; b.sp = Math.max(BASEV, b.sp / 1.5); }
      b.curve = 0; b.ghostUntil = 0;
      b.sp = Math.min(MAXV, b.sp * 1.06);
      b.owner = i;
      const nv = ctx.toScreen(i, Math.sin(ang) * b.sp, -Math.cos(ang) * b.sp);
      b.vx = nv.x; b.vy = nv.y;
      const np = ctx.toScreen(i, l.x, -PT / 2 - R);
      b.x = p.x + np.x; b.y = p.y + np.y;
      paddles[i].hit = 1;
      const v = ctx.inward(i);
      sparks(b.x, b.y, v.x, v.y, P[i].color, 10 + Math.round(10 * b.sp / MAXV), S * 0.7);
      if (wasFire) { sparks(b.x, b.y, v.x, v.y, '#ff9a3c', 30, S); shake(S * 0.01, 0.25); }
      return true;
    }
    function missedBy(b) {
      if (b.y > H + R * 2 && isPaddle('bottom')) return sideOf('bottom').i;
      if (b.y < -R * 2 && isPaddle('top')) return sideOf('top').i;
      if (b.x < -R * 2 && isPaddle('left')) return sideOf('left').i;
      if (b.x > W + R * 2 && isPaddle('right')) return sideOf('right').i;
      return -1;
    }
    function fixAngle(b) {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const minC = 0.22;
      const any = (axis) => axis === 'x' ? (isPaddle('left') || isPaddle('right')) : (isPaddle('top') || isPaddle('bottom'));
      if (Math.abs(b.vy) / sp < minC && !any('x')) { b.vy = (b.vy >= 0 ? 1 : -1) * minC * sp; b.vx = Math.sign(b.vx || 1) * Math.sqrt(1 - minC * minC) * sp; }
      if (Math.abs(b.vx) / sp < minC && !any('y')) { b.vx = (b.vx >= 0 ? 1 : -1) * minC * sp; b.vy = Math.sign(b.vy || 1) * Math.sqrt(1 - minC * minC) * sp; }
    }

    function step(dt) {
      // effects expiry
      for (const p of P) effects[p.i] = effects[p.i].filter(e => e.until > ctx.time);
      for (const p of P) {
        const pd = paddles[p.i];
        pd.len += (targetLen(p.i) - pd.len) * (1 - Math.exp(-dt * 10));
        const r = range(p.i);
        pd.tu = U.clamp(pd.tu, r.lo, r.hi);
        if (!has(p.i, 'freeze')) pd.u += (pd.tu - pd.u) * (1 - Math.exp(-dt * 30));
        pd.u = U.clamp(pd.u, r.lo, r.hi);
        pd.hit = pd.hit > 0 ? Math.max(0, pd.hit - dt * 3) : Math.min(0, pd.hit + dt * 2);
        if (has(p.i, 'freeze') && Math.random() < dt * 20) {
          const pp = paddlePos(p.i), a = ctx.toScreen(p.i, U.rand(-0.5, 0.5) * pd.len, 0);
          burst(pp.x + a.x, pp.y + a.y, '#cdeeff', 1, S * 0.08, 0.6, 2.5);
        }
      }
      for (let bi = balls.length - 1; bi >= 0; bi--) {
        const b = balls[bi];
        if (b.curve && ctx.time > b.curveUntil) b.curve = 0;
        const sp = Math.hypot(b.vx, b.vy);
        const n = U.clamp(Math.ceil(sp * dt / (R * 0.5)), 1, 60);
        const h = dt / n;
        let lost = -1;
        for (let s = 0; s < n; s++) {
          if (b.curve) {
            const a = b.curve * h, c = Math.cos(a), sn = Math.sin(a);
            const vx = b.vx * c - b.vy * sn; b.vy = b.vx * sn + b.vy * c; b.vx = vx;
          }
          b.x += b.vx * h; b.y += b.vy * h;
          for (const p of P) if (!out[p.i]) paddleHit(b, p.i);
          wallAxis(b);
          lost = missedBy(b);
          if (lost >= 0) break;
        }
        fixAngle(b);
        const cs = Math.hypot(b.vx, b.vy) || 1;
        b.vx *= b.sp / cs; b.vy *= b.sp / cs;
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 12) b.trail.shift();
        if (b.fire) { burst(b.x, b.y, Math.random() < 0.5 ? '#ff7a1a' : '#ffd23c', 2, S * 0.12, 0.45, R * 0.45); }
        if (b.curve) { const a = ctx.time * 14; parts.push({ x: b.x + Math.cos(a) * R * 1.4, y: b.y + Math.sin(a) * R * 1.4, vx: 0, vy: 0, life: 0.4, t: 0.4, color: '#b98cff', size: 3 }); }
        // pick up items
        if (b.owner != null && !out[b.owner]) {
          for (let k = items.length - 1; k >= 0; k--) {
            const it = items[k];
            if (Math.hypot(it.x - b.x, it.y - b.y) < IR + R) { items.splice(k, 1); collect(it, b); }
          }
        }
        if (lost >= 0) { balls.splice(balls.indexOf(b), 1); lose(lost, b); if (over) return; }
        else if (b.x < -S || b.x > W + S || b.y < -S || b.y > H + S) balls.splice(balls.indexOf(b), 1);
      }
      if (!over && balls.length === 0 && !serving) { serving = true; ctx.after(800, () => serve()); }
      if (!over && balls.length === 1 && ctx.time - rallyStart > 20) {
        spawnBall();
        rallyStart = ctx.time;
        say('⚽ Второй мяч!', { color: '#fff', fg: '#111' });
      }
      // items
      for (let k = items.length - 1; k >= 0; k--) if (ctx.time - items[k].born > items[k].life) items.splice(k, 1);
      if (ctx.time > nextItem) {
        const imbalance = active().some(i => trailing(i));
        if (items.length < 3) spawnItem();
        nextItem = ctx.time + U.rand(5, 8) - (imbalance ? 1.5 : 0);
      }
    }

    // ---------- drawing ----------
    function circle(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
    function rrect(x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    function emoji(ch, x, y, size) {
      g.font = `${Math.round(size)}px ${EMOJI}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ch, x, y + size * 0.05);
    }
    function drawField() {
      g.fillStyle = '#0f1220';
      g.fillRect(-40, -40, W + 80, H + 80);
      g.save();
      g.strokeStyle = 'rgba(255,255,255,.08)';
      g.lineWidth = 3;
      g.setLineDash([12, 14]);
      if (N === 2) { g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); }
      g.setLineDash([]);
      circle(W / 2, H / 2, S * 0.1); g.stroke();
      g.restore();
      const T = 8;
      for (const s of ['bottom', 'top', 'left', 'right']) {
        const p = sideOf(s);
        if (p && !out[p.i]) {
          const v = ctx.inward(p.i), m = edgeMid(p.i);
          const gr = g.createLinearGradient(m.x, m.y, m.x + v.x * FACE * 1.6, m.y + v.y * FACE * 1.6);
          gr.addColorStop(0, U.alpha(p.color, paddles[p.i].hit < 0 ? 0.6 : 0.18));
          gr.addColorStop(1, U.alpha(p.color, 0));
          g.fillStyle = gr;
          if (s === 'bottom') g.fillRect(0, H - FACE * 1.6, W, FACE * 1.6);
          else if (s === 'top') g.fillRect(0, 0, W, FACE * 1.6);
          else if (s === 'left') g.fillRect(0, 0, FACE * 1.6, H);
          else g.fillRect(W - FACE * 1.6, 0, FACE * 1.6, H);
          if (has(p.i, 'shield')) {
            // glowing brick wall along the edge
            g.save();
            g.shadowColor = '#ffb35c'; g.shadowBlur = 16;
            g.fillStyle = 'rgba(255,170,80,.85)';
            const th = 11 + Math.sin(ctx.time * 8) * 2;
            if (s === 'bottom') g.fillRect(0, H - th, W, th);
            else if (s === 'top') g.fillRect(0, 0, W, th);
            else if (s === 'left') g.fillRect(0, 0, th, H);
            else g.fillRect(W - th, 0, th, H);
            g.restore();
          }
        } else {
          g.fillStyle = p ? '#4a5280' : '#3a4270';
          if (s === 'bottom') g.fillRect(0, H - T, W, T);
          else if (s === 'top') g.fillRect(0, 0, W, T);
          else if (s === 'left') g.fillRect(0, 0, T, H);
          else g.fillRect(W - T, 0, T, H);
        }
      }
      g.fillStyle = '#3a4270';
      for (const c of corners) { rrect(c.x, c.y, c.w, c.h, 6); g.fill(); }
    }
    function heart(x, y, r, full, color) {
      g.beginPath();
      g.moveTo(x, y + r * 0.95);
      g.bezierCurveTo(x - r * 1.6, y - r * 0.1, x - r * 0.9, y - r * 1.35, x, y - r * 0.5);
      g.bezierCurveTo(x + r * 0.9, y - r * 1.35, x + r * 1.6, y - r * 0.1, x, y + r * 0.95);
      g.closePath();
      if (full) { g.fillStyle = U.alpha(color, 0.6); g.fill(); }
      else { g.strokeStyle = U.alpha(color, 0.3); g.lineWidth = 2; g.stroke(); }
    }
    const BAD = { mini: 1, freeze: 1, rev: 1 };
    function drawEffectRings(i, x0, y0, avail) {
      const r = S * 0.028, gap = r * 2.5;
      const perRow = Math.max(1, Math.floor(avail / gap) + 1);
      effects[i].forEach((e, k) => {
        const x = x0 + (k % perRow) * gap, y = y0 - Math.floor(k / perRow) * gap;
        const frac = U.clamp((e.until - ctx.time) / e.dur, 0, 1);
        circle(x, y, r); g.fillStyle = 'rgba(10,12,24,.75)'; g.fill();
        g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 4; g.stroke();
        g.beginPath(); g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        g.strokeStyle = BAD[e.k] ? '#ff6b6b' : '#5dffa8'; g.lineWidth = 4; g.stroke();
        emoji(PU[e.k].icon, x, y, r * 1.15);
      });
    }
    function drawHud() {
      for (const p of P) {
        const m = edgeMid(p.i), v = ctx.inward(p.i);
        g.save();
        ctx.facing(g, p.i, m.x + v.x * S * 0.2, m.y + v.y * S * 0.2);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        if (out[p.i]) {
          g.font = `900 ${Math.round(S * 0.05)}px ${FONT}`;
          g.fillStyle = U.alpha(p.color, 0.35);
          g.fillText('выбыл', 0, 0);
        } else {
          const r = S * 0.022, gap = S * 0.065;
          for (let k = 0; k < LIVES; k++) heart((k - (LIVES - 1) / 2) * gap, 0, r, k < lives[p.i], p.color);
          const len = (p.side === 'left' || p.side === 'right') ? H : W;
          const x0 = gap * 1.5 + S * 0.05;
          drawEffectRings(p.i, x0, 0, Math.max(0, len / 2 - S * 0.1 - x0));
        }
        g.restore();
      }
    }
    function drawPaddle(p) {
      const pd = paddles[p.i], c = paddlePos(p.i), pl = pd.len;
      const frozen = has(p.i, 'freeze'), rev = has(p.i, 'rev');
      g.save();
      g.translate(c.x, c.y);
      g.rotate(p.rot * Math.PI / 180);
      g.shadowColor = frozen ? '#bfe9ff' : p.color; g.shadowBlur = 16 + 24 * Math.max(0, pd.hit);
      rrect(-pl / 2, -PT / 2, pl, PT, PT / 2);
      g.fillStyle = frozen ? '#a9dcff' : p.color; g.fill();
      g.shadowBlur = 0;
      rrect(-pl / 2 + 6, -PT / 2 + 3, pl - 12, PT * 0.35, PT * 0.2);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fill();
      if (frozen) { rrect(-pl / 2, -PT / 2, pl, PT, PT / 2); g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke(); }
      if (rev) {
        g.font = `900 ${Math.round(PT * 1.2)}px ${FONT}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = 'rgba(20,10,40,.9)';
        g.fillText('⇄', 0, 1);
      }
      if (has(p.i, 'long')) {
        // little end-caps glow
        g.fillStyle = 'rgba(255,255,255,.8)';
        circle(-pl / 2 + PT / 2, 0, PT * 0.25); g.fill();
        circle(pl / 2 - PT / 2, 0, PT * 0.25); g.fill();
      }
      g.restore();
    }
    function drawItems() {
      for (const it of items) {
        const age = ctx.time - it.born, left = it.life - age;
        const appear = Math.min(1, age * 4);
        if (left < 2.5 && Math.sin(age * 20) < 0) continue; // blink before expiry
        const r = IR * (0.6 + 0.4 * appear) * (1 + 0.06 * Math.sin(age * 5));
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
    function drawBalls() {
      for (const b of balls) {
        const age = ctx.time - b.born;
        const col = b.fire ? '#ff8a2a' : b.owner != null ? P[b.owner].color : '#fff2c8';
        let alpha = Math.min(1, 0.3 + age * 3);
        if (b.ghostUntil > ctx.time) alpha *= (Math.sin(ctx.time * 11) > 0.55 ? 0.9 : 0.04);
        g.save();
        g.globalAlpha = alpha;
        for (let k = 0; k < b.trail.length; k++) {
          const tr = b.trail[k], a = (k + 1) / b.trail.length;
          circle(tr.x, tr.y, R * (0.25 + 0.65 * a));
          g.fillStyle = U.alpha(col, 0.22 * a);
          g.fill();
        }
        g.shadowColor = col; g.shadowBlur = b.fire ? 34 : 22;
        circle(b.x, b.y, b.fire ? R * 1.15 : R);
        g.fillStyle = b.fire ? '#ffe2a8' : '#fffaf0'; g.fill();
        g.shadowBlur = 0;
        if (b.owner != null && !b.fire) { circle(b.x, b.y, R * 0.45); g.fillStyle = U.alpha(col, 0.8); g.fill(); }
        g.restore();
      }
      if (serving && !over) {
        const a = 0.25 + 0.2 * Math.sin(performance.now() / 120);
        circle(W / 2, H / 2, R * 1.3);
        g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 3; g.stroke();
      }
    }

    ctx.loop((dt) => {
      if (dt > 0 && !over) step(dt);
      if (dt > 0) updJuice(dt);
      g.save();
      if (shakeT > 0) {
        const k = shakeA * Math.min(1, shakeT / 0.3);
        g.translate(U.rand(-k, k), U.rand(-k, k));
      }
      drawField();
      drawHud();
      drawItems();
      for (const p of P) if (!out[p.i]) drawPaddle(p);
      drawBalls();
      drawJuice();
      g.restore();
      if (flashA > 0) { g.fillStyle = U.alpha(flashC, flashA * 0.35); g.fillRect(0, 0, W, H); }
    });

    ctx._pong = { balls, lives, out, paddles, items, effects, spawnItem, PU };
  },
});
