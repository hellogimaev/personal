registerGame({
  id: 'pong',
  title: 'Пинг-понг',
  emoji: '🏓',
  desc: 'Отбивай мяч ракеткой у своего края',
  rules: 'У каждого ракетка вдоль своего края. Води пальцем в своей части экрана — ракетка едет за пальцем.\n' +
    'Пропустил мяч за свою ракетку — минус жизнь. Жизней 3.\n' +
    'Чем дальше от центра ракетки попал мяч, тем круче он отлетает. С каждым ударом мяч ускоряется.\n' +
    'Долгий розыгрыш? Появится второй мяч!\n' +
    'Выбывший игрок превращается в стенку. Последний оставшийся побеждает.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const { cv, g } = ctx.canvas();
    const P = ctx.players;
    const N = ctx.n;
    const LIVES = 3;
    const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", Roboto, sans-serif';
    const lives = P.map(() => LIVES);
    const out = P.map(() => false);
    let over = false;

    let W, H, S, R, PL, PT, EDGE, FACE, BASEV, MAXV, CORNER;
    const sideOf = (s) => P.find(p => p.side === s);
    const isPaddle = (s) => { const p = sideOf(s); return !!p && !out[p.i]; };
    const hasSeat = (s) => !!sideOf(s);
    const edgeLen = (i) => (P[i].side === 'left' || P[i].side === 'right') ? H : W;
    function edgeMid(i) {
      const s = P[i].side;
      return s === 'bottom' ? { x: W / 2, y: H } : s === 'top' ? { x: W / 2, y: 0 } : s === 'left' ? { x: 0, y: H / 2 } : { x: W, y: H / 2 };
    }
    // corner blocks where two seated edges meet (3p: bottom-left & bottom-right)
    let corners = [];
    function layout() {
      W = ctx.W; H = ctx.H; S = Math.min(W, H);
      R = S * 0.022;
      PL = S * 0.25;       // paddle length
      PT = S * 0.026;      // paddle thickness
      EDGE = S * 0.06;     // paddle center distance from edge
      FACE = EDGE + PT / 2; // inner face distance from edge
      BASEV = S * 0.6;
      MAXV = S * 1.75;
      CORNER = FACE;
      corners = [];
      const add = (a, b, x, y) => { if (hasSeat(a) && hasSeat(b)) corners.push({ x, y, w: CORNER, h: CORNER }); };
      add('bottom', 'left', 0, H - CORNER);
      add('bottom', 'right', W - CORNER, H - CORNER);
      add('top', 'left', 0, 0);
      add('top', 'right', W - CORNER, 0);
    }
    layout();
    // range of the paddle center along the edge (as offset from edge middle, in local x)
    function range(i) {
      const len = edgeLen(i);
      return Math.max(0, len / 2 - PL / 2 - (N === 3 ? CORNER : 0));
    }
    const paddles = P.map(() => ({ u: 0, tu: 0, hit: 0 })); // u: local-x offset from edge middle
    function paddlePos(i) {
      const m = edgeMid(i), v = ctx.inward(i), a = ctx.toScreen(i, 1, 0), u = paddles[i].u;
      return { x: m.x + v.x * EDGE + a.x * u, y: m.y + v.y * EDGE + a.y * u };
    }

    ctx.onResize(() => {
      const ow = W, oh = H;
      layout();
      for (const b of balls) { b.x *= W / ow; b.y *= H / oh; b.trail = []; }
      P.forEach(p => { const r = range(p.i); paddles[p.i].u = U.clamp(paddles[p.i].u, -r, r); paddles[p.i].tu = U.clamp(paddles[p.i].tu, -r, r); });
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
      paddles[i].tu = U.clamp(l.x, -r, r);
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
    function spawnBall(toward) {
      const act = P.filter(p => !out[p.i]).map(p => p.i);
      if (toward == null || out[toward]) toward = U.pick(act);
      const v = ctx.inward(toward);
      const ang = U.rand(-0.5, 0.5);
      const dx = -v.x, dy = -v.y, c = Math.cos(ang), s = Math.sin(ang);
      const sp = BASEV;
      balls.push({ x: W / 2, y: H / 2, vx: (dx * c - dy * s) * sp, vy: (dx * s + dy * c) * sp, sp, trail: [], born: ctx.time, hits: 0 });
    }
    function serve(toward) {
      if (over) return;
      serving = false;
      spawnBall(toward);
      rallyStart = ctx.time;
    }
    serving = true;
    ctx.after(600, () => serve());

    function lose(i) {
      lives[i]--;
      paddles[i].hit = -1;
      if (lives[i] <= 0) {
        out[i] = true;
        const act = P.filter(p => !out[p.i]).map(p => p.i);
        if (act.length <= 1) {
          over = true;
          balls.length = 0;
          const w = act[0];
          ctx.toast(`${P[w].name} победил!`, { color: P[w].color, fg: '#111', ms: 1400 });
          ctx.after(1300, () => ctx.end({ winner: w, scores: lives.slice(), msg: 'Остался последним' }));
          return;
        }
        ctx.toast(`${P[i].name} выбывает`, { color: P[i].color, fg: '#111', ms: 1400 });
      } else {
        ctx.toast(`${P[i].name}: −1 жизнь`, { color: P[i].color, fg: '#111' });
      }
      rallyStart = ctx.time;
      if (balls.length === 0 && !serving) { serving = true; ctx.after(1000, () => serve(out[i] ? null : i)); }
    }

    // ---------- physics ----------
    function wallAxis(b) {
      // left/right
      if (b.x < R && !isPaddle('left')) { b.x = R; b.vx = Math.abs(b.vx); }
      if (b.x > W - R && !isPaddle('right')) { b.x = W - R; b.vx = -Math.abs(b.vx); }
      if (b.y < R && !isPaddle('top')) { b.y = R; b.vy = Math.abs(b.vy); }
      if (b.y > H - R && !isPaddle('bottom')) { b.y = H - R; b.vy = -Math.abs(b.vy); }
      for (const c of corners) {
        const qx = U.clamp(b.x, c.x, c.x + c.w), qy = U.clamp(b.y, c.y, c.y + c.h);
        let dx = b.x - qx, dy = b.y - qy;
        const d = Math.hypot(dx, dy);
        if (d >= R) continue;
        if (d < 1e-6) { // center inside block: push out the short way toward the field
          const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
          dx = W / 2 - cx; dy = H / 2 - cy;
        }
        const L = Math.hypot(dx, dy) || 1, nx = dx / L, ny = dy / L;
        if (d >= 1e-6) { b.x = qx + nx * R; b.y = qy + ny * R; }
        else { b.x += nx * R; b.y += ny * R; }
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; }
      }
    }
    function paddleHit(b, i) {
      const p = paddlePos(i);
      const l = ctx.toLocal(i, b.x - p.x, b.y - p.y);
      const lv = ctx.toLocal(i, b.vx, b.vy);
      if (lv.y <= 0) return false; // moving away from this edge
      if (l.y < -PT / 2 - R || l.y > PT / 2) return false;
      if (Math.abs(l.x) > PL / 2 + R * 0.8) return false;
      const off = U.clamp(l.x / (PL / 2), -1, 1);
      const ang = off * 1.05; // up to ~60 degrees
      b.sp = Math.min(MAXV, b.sp * 1.06);
      b.hits++;
      const nv = ctx.toScreen(i, Math.sin(ang) * b.sp, -Math.cos(ang) * b.sp);
      b.vx = nv.x; b.vy = nv.y;
      const np = ctx.toScreen(i, l.x, -PT / 2 - R);
      b.x = p.x + np.x; b.y = p.y + np.y;
      paddles[i].hit = 1;
      return true;
    }
    function missedBy(b) {
      if (b.y > H + R * 2 && isPaddle('bottom')) return sideOf('bottom').i;
      if (b.y < -R * 2 && isPaddle('top')) return sideOf('top').i;
      if (b.x < -R * 2 && isPaddle('left')) return sideOf('left').i;
      if (b.x > W + R * 2 && isPaddle('right')) return sideOf('right').i;
      return -1;
    }
    // Avoid near-parallel-to-edge trajectories that bounce forever between two walls
    function fixAngle(b) {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const minC = 0.22;
      const any = (axis) => axis === 'x' ? (isPaddle('left') || isPaddle('right')) : (isPaddle('top') || isPaddle('bottom'));
      // if the ball travels almost purely along an axis where no paddle can receive it, tilt it
      if (Math.abs(b.vy) / sp < minC && !any('x')) { b.vy = (b.vy >= 0 ? 1 : -1) * minC * sp; b.vx = Math.sign(b.vx || 1) * Math.sqrt(1 - minC * minC) * sp; }
      if (Math.abs(b.vx) / sp < minC && !any('y')) { b.vx = (b.vx >= 0 ? 1 : -1) * minC * sp; b.vy = Math.sign(b.vy || 1) * Math.sqrt(1 - minC * minC) * sp; }
    }

    function step(dt) {
      // paddles follow finger quickly
      for (const p of P) {
        const pd = paddles[p.i];
        const k = 1 - Math.exp(-dt * 30);
        pd.u += (pd.tu - pd.u) * k;
        pd.hit = pd.hit > 0 ? Math.max(0, pd.hit - dt * 3) : Math.min(0, pd.hit + dt * 2);
      }
      for (let bi = balls.length - 1; bi >= 0; bi--) {
        const b = balls[bi];
        const sp = Math.hypot(b.vx, b.vy);
        const n = U.clamp(Math.ceil(sp * dt / (R * 0.5)), 1, 60);
        const h = dt / n;
        let lost = -1;
        for (let s = 0; s < n; s++) {
          b.x += b.vx * h; b.y += b.vy * h;
          for (const p of P) if (!out[p.i]) paddleHit(b, p.i);
          wallAxis(b);
          lost = missedBy(b);
          if (lost >= 0) break;
        }
        fixAngle(b);
        // keep speed magnitude consistent
        const cs = Math.hypot(b.vx, b.vy) || 1;
        b.vx *= b.sp / cs; b.vy *= b.sp / cs;
        b.trail.push({ x: b.x, y: b.y });
        if (b.trail.length > 10) b.trail.shift();
        if (lost >= 0) { balls.splice(bi, 1); lose(lost); if (over) return; }
        // safety: ball escaped somewhere weird
        else if (b.x < -S || b.x > W + S || b.y < -S || b.y > H + S) balls.splice(bi, 1);
      }
      if (!over && balls.length === 0 && !serving) { serving = true; ctx.after(800, () => serve()); }
      // second ball after a long rally
      if (!over && balls.length === 1 && ctx.time - rallyStart > 20) {
        spawnBall();
        rallyStart = ctx.time;
        ctx.toast('Второй мяч!', { color: '#fff', fg: '#111' });
      }
    }

    // ---------- drawing ----------
    function circle(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
    function rrect(x, y, w, h, r) {
      g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    function drawField() {
      g.fillStyle = '#0f1220';
      g.fillRect(0, 0, W, H);
      // center decoration
      g.save();
      g.strokeStyle = 'rgba(255,255,255,.08)';
      g.lineWidth = 3;
      g.setLineDash([12, 14]);
      if (N === 2) { g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); }
      g.setLineDash([]);
      circle(W / 2, H / 2, S * 0.1); g.stroke();
      g.restore();
      // miss lanes and walls
      const T = 8;
      for (const s of ['bottom', 'top', 'left', 'right']) {
        const p = sideOf(s);
        if (p && !out[p.i]) {
          // danger lane behind the paddle
          const v = ctx.inward(p.i), m = edgeMid(p.i);
          const gr = g.createLinearGradient(m.x, m.y, m.x + v.x * FACE * 1.6, m.y + v.y * FACE * 1.6);
          gr.addColorStop(0, U.alpha(p.color, paddles[p.i].hit < 0 ? 0.5 : 0.18));
          gr.addColorStop(1, U.alpha(p.color, 0));
          g.fillStyle = gr;
          if (s === 'bottom') g.fillRect(0, H - FACE * 1.6, W, FACE * 1.6);
          else if (s === 'top') g.fillRect(0, 0, W, FACE * 1.6);
          else if (s === 'left') g.fillRect(0, 0, FACE * 1.6, H);
          else g.fillRect(W - FACE * 1.6, 0, FACE * 1.6, H);
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
          for (let k = 0; k < LIVES; k++) {
            heart((k - (LIVES - 1) / 2) * gap, 0, r, k < lives[p.i], p.color);
          }
        }
        g.restore();
      }
    }
    function heart(x, y, r, full, color) {
      g.beginPath();
      g.moveTo(x, y + r * 0.95);
      g.bezierCurveTo(x - r * 1.6, y - r * 0.1, x - r * 0.9, y - r * 1.35, x, y - r * 0.5);
      g.bezierCurveTo(x + r * 0.9, y - r * 1.35, x + r * 1.6, y - r * 0.1, x, y + r * 0.95);
      g.closePath();
      if (full) { g.fillStyle = U.alpha(color, 0.55); g.fill(); }
      else { g.strokeStyle = U.alpha(color, 0.3); g.lineWidth = 2; g.stroke(); }
    }
    function drawPaddle(p) {
      const pd = paddles[p.i], c = paddlePos(p.i);
      g.save();
      g.translate(c.x, c.y);
      g.rotate(p.rot * Math.PI / 180);
      g.shadowColor = p.color; g.shadowBlur = 16 + 24 * Math.max(0, pd.hit);
      rrect(-PL / 2, -PT / 2, PL, PT, PT / 2);
      g.fillStyle = p.color; g.fill();
      g.shadowBlur = 0;
      rrect(-PL / 2 + 6, -PT / 2 + 3, PL - 12, PT * 0.35, PT * 0.2);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fill();
      g.restore();
    }
    function drawBalls() {
      for (const b of balls) {
        const age = ctx.time - b.born;
        for (let k = 0; k < b.trail.length; k++) {
          const tr = b.trail[k], a = (k + 1) / b.trail.length;
          circle(tr.x, tr.y, R * (0.3 + 0.6 * a));
          g.fillStyle = `rgba(255,240,200,${0.15 * a})`;
          g.fill();
        }
        g.save();
        g.globalAlpha = Math.min(1, 0.3 + age * 3);
        g.shadowColor = '#fff2c8'; g.shadowBlur = 20;
        circle(b.x, b.y, R);
        g.fillStyle = '#fffaf0'; g.fill();
        g.restore();
      }
      if (serving && !over) {
        // pulsing spawn marker
        const a = 0.25 + 0.2 * Math.sin(performance.now() / 120);
        circle(W / 2, H / 2, R * 1.3);
        g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = 3; g.stroke();
      }
    }

    ctx.loop((dt) => {
      if (dt > 0 && !over) step(dt);
      drawField();
      drawHud();
      for (const p of P) if (!out[p.i]) drawPaddle(p);
      drawBalls();
    });

    ctx._pong = { balls, lives, out, paddles };
  },
});
