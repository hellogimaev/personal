registerGame({
  id: 'sumo',
  title: 'Сумо',
  emoji: '🥋',
  desc: 'Вытолкни соперников с круглой арены',
  rules: 'У каждого тяжёлый шар своего цвета на арене.\n' +
    'Управление — джойстик: коснись пальцем своей части экрана и тяни в нужную сторону. Чем дальше тянешь, тем сильнее разгон.\n' +
    'Толкай соперников за край арены. Кто остался на арене последним, выиграл раунд.\n' +
    'Через 20 секунд арена начинает сжиматься.\n' +
    'Кто первым выиграет 3 раунда, тот победил.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const { cv, g } = ctx.canvas();
    const P = ctx.players;
    const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", Roboto, sans-serif';
    // toast with copies spread apart so they don't overlap in 3p
    const say = (text, o = {}) => ctx.toast(text, Object.assign({ offset: ctx.n === 3 ? Math.min(ctx.W, ctx.H) * 0.2 : 70 }, o));
    const WIN_ROUNDS = 3;
    // Physics in normalized units: 1 = min(W,H), origin at screen center.
    const A0 = 0.39;      // arena radius
    const RB = 0.062;     // ball radius
    const ACC = 1.15;     // max acceleration
    const DRAG = 1.25;    // velocity damping per second (exp)
    const E = 0.9;        // restitution between balls
    const JOY = 0.095;    // joystick full-deflection radius
    const SHRINK_AT = 20, SHRINK_V = 0.018, A_MIN = RB * 1.3;

    const wins = P.map(() => 0);
    let round = 0, state = 'fight', roundStart = 0, A = A0, warned = false;
    let W = ctx.W, H = ctx.H, S = Math.min(W, H);
    ctx.onResize(() => { W = ctx.W; H = ctx.H; S = Math.min(W, H); });
    const toS = (x, y) => ({ x: W / 2 + x * S, y: H / 2 + y * S });

    const balls = P.map(p => ({ i: p.i, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, fall: 0, onArena: true, hit: 0 }));
    function placeBalls() {
      for (const b of balls) {
        const v = ctx.inward(b.i);
        b.x = -v.x * A0 * 0.55; b.y = -v.y * A0 * 0.55;
        b.vx = b.vy = 0; b.fall = 0; b.onArena = true; b.hit = 0; b.safe = false;
      }
    }
    placeBalls();

    // ---------- joysticks ----------
    const joys = P.map(() => null); // {id, ox, oy, x, y} in screen px
    const owner = new Map();
    ctx.pointer(cv, {
      down(id, x, y) {
        const i = ctx.seatAt(x, y);
        owner.set(id, i);
        joys[i] = { id, ox: x, oy: y, x, y }; // latest finger in own zone takes the stick
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
      if (m < 0.08) return { x: 0, y: 0 }; // dead zone
      return { x: dx, y: dy };
    }

    // ---------- rounds ----------
    function newRound() {
      round++;
      A = A0; warned = false;
      placeBalls();
      state = 'ready';
      say(`Раунд ${round}`, { ms: 1100 });
      ctx.after(1200, () => { state = 'fight'; roundStart = ctx.time; });
    }
    round = 1; roundStart = 0;

    function checkRound() {
      if (state !== 'fight') return;
      const on = balls.filter(b => b.onArena);
      if (on.length > 1) return;
      state = 'end';
      if (on.length === 1) {
        const w = on[0].i;
        on[0].safe = true; // the winner can't fall off after the round is decided
        wins[w]++;
        if (wins[w] >= WIN_ROUNDS) {
          state = 'over';
          say(`${P[w].name} — чемпион!`, { color: P[w].color, fg: '#111', ms: 1500 });
          ctx.after(1500, () => ctx.end({ winner: w, scores: wins.slice(), msg: `Раунды: ${wins.join(' : ')}` }));
          return;
        }
        say(`Раунд за: ${P[w].name}`, { color: P[w].color, fg: '#111', ms: 1300 });
      } else {
        say('Ничья в раунде', { ms: 1300 });
      }
      ctx.after(1700, newRound);
    }

    // ---------- physics ----------
    function collide(a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = RB * 2;
      if (d >= min) return;
      let nx, ny;
      if (d < 1e-9) { nx = 1; ny = 0; } else { nx = dx / d; ny = dy / d; }
      const ma = 1, mb = 1; // equal "heavy" masses
      const over = min - d;
      a.x -= nx * over * mb / (ma + mb); a.y -= ny * over * mb / (ma + mb);
      b.x += nx * over * ma / (ma + mb); b.y += ny * over * ma / (ma + mb);
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) {
        const j = -(1 + E) * rv / (1 / ma + 1 / mb);
        a.vx -= j * nx / ma; a.vy -= j * ny / ma;
        b.vx += j * nx / mb; b.vy += j * ny / mb;
        const k = Math.min(1, -rv * 2);
        a.hit = Math.max(a.hit, k); b.hit = Math.max(b.hit, k);
      }
    }
    function step(dt) {
      if (state === 'fight' || state === 'end') {
        if (state === 'fight' && ctx.time - roundStart > SHRINK_AT) {
          if (!warned) { warned = true; say('Арена сжимается!', { ms: 1200 }); }
          A = Math.max(A_MIN, A - SHRINK_V * dt);
        }
      }
      const moving = state !== 'ready';
      for (const b of balls) {
        if (b.onArena && state === 'fight') {
          const s = stick(b.i);
          b.ax = s.x * ACC; b.ay = s.y * ACC;
        } else { b.ax = b.ay = 0; }
        b.hit = Math.max(0, b.hit - dt * 3);
      }
      if (!moving) return;
      const maxV = Math.max(...balls.map(b => Math.hypot(b.vx, b.vy)));
      const n = U.clamp(Math.ceil(maxV * dt / (RB * 0.25)), 1, 30);
      const h = dt / n, damp = Math.exp(-DRAG * h);
      for (let s = 0; s < n; s++) {
        for (const b of balls) {
          const dmp = b.safe ? Math.exp(-5 * h) : damp;
          b.vx = (b.vx + b.ax * h) * dmp;
          b.vy = (b.vy + b.ay * h) * dmp;
          b.x += b.vx * h; b.y += b.vy * h;
        }
        for (let a = 0; a < balls.length; a++) for (let c = a + 1; c < balls.length; c++) {
          if (balls[a].onArena && balls[c].onArena) collide(balls[a], balls[c]);
        }
        for (const b of balls) {
          const d = Math.hypot(b.x, b.y);
          if (b.safe && d > A - RB * 0.2) {
            // keep the round winner on the mat
            const k = (A - RB * 0.2) / d; b.x *= k; b.y *= k;
            const vr = (b.vx * b.x + b.vy * b.y) / ((A - RB * 0.2) || 1);
            if (vr > 0) { b.vx -= vr * b.x / (A - RB * 0.2); b.vy -= vr * b.y / (A - RB * 0.2); }
          } else if (b.onArena && d > A) {
            b.onArena = false;
            b.fall = 0.0001;
          }
        }
      }
      for (const b of balls) if (!b.onArena) b.fall = Math.min(1, b.fall + dt * 1.6);
      checkRound();
    }

    // ---------- drawing ----------
    function circle(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
    function drawArena(t) {
      g.fillStyle = '#0f1220';
      g.fillRect(0, 0, W, H);
      const c = toS(0, 0), r = A * S;
      // abyss glow
      const gr = g.createRadialGradient(c.x, c.y, r * 0.2, c.x, c.y, r * 1.25);
      gr.addColorStop(0, 'rgba(60,70,130,.0)');
      gr.addColorStop(0.75, 'rgba(60,70,130,.12)');
      gr.addColorStop(1, 'rgba(60,70,130,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, W, H);
      // mat
      circle(c.x, c.y, r);
      const mat = g.createRadialGradient(c.x, c.y - r * 0.3, r * 0.1, c.x, c.y, r);
      mat.addColorStop(0, '#2a3160');
      mat.addColorStop(1, '#1c2244');
      g.fillStyle = mat; g.fill();
      // shrinking ring
      const shrinking = A < A0 - 1e-4;
      const pulse = shrinking ? 0.5 + 0.5 * Math.sin(t / 140) : 0;
      g.save();
      g.lineWidth = Math.max(4, S * 0.01);
      g.strokeStyle = shrinking ? `rgba(255,${Math.round(120 - 60 * pulse)},${Math.round(110 - 60 * pulse)},.95)` : '#e8ecff';
      g.shadowColor = shrinking ? '#ff5a5f' : '#9fb4ff'; g.shadowBlur = 18;
      circle(c.x, c.y, r); g.stroke();
      g.restore();
      // start lines and center mark
      g.strokeStyle = 'rgba(255,255,255,.12)';
      g.lineWidth = 3;
      circle(c.x, c.y, Math.min(r * 0.92, A0 * S * 0.22)); g.stroke();
      if (shrinking) {
        // ghost of original size
        g.save(); g.setLineDash([8, 10]);
        g.strokeStyle = 'rgba(255,255,255,.08)';
        circle(c.x, c.y, A0 * S); g.stroke();
        g.restore();
      }
    }
    function drawBall(b) {
      const p = P[b.i], c = toS(b.x, b.y);
      const sc = b.onArena ? 1 : Math.max(0, 1 - b.fall);
      if (sc <= 0.01) return;
      const r = RB * S * sc;
      g.save();
      g.globalAlpha = b.onArena ? 1 : Math.max(0, 1 - b.fall * 0.8);
      // shadow
      if (b.onArena) { circle(c.x + r * 0.12, c.y + r * 0.18, r); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill(); }
      g.shadowColor = p.color; g.shadowBlur = 16 + 30 * b.hit;
      circle(c.x, c.y, r);
      const gr = g.createRadialGradient(c.x - r * 0.35, c.y - r * 0.35, r * 0.1, c.x, c.y, r);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.3, p.color);
      gr.addColorStop(1, U.alpha(p.color, 0.7));
      g.fillStyle = gr; g.fill();
      g.shadowBlur = 0;
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.3)'; g.stroke();
      // direction indicator from the joystick
      const s = stick(b.i);
      if (b.onArena && (s.x || s.y)) {
        g.beginPath();
        g.moveTo(c.x + s.x * r * 0.25, c.y + s.y * r * 0.25);
        g.lineTo(c.x + s.x * r * 0.85, c.y + s.y * r * 0.85);
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = Math.max(3, r * 0.14); g.lineCap = 'round'; g.stroke();
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
    function drawHud() {
      for (const p of P) {
        const v = ctx.inward(p.i);
        const m = p.side === 'bottom' ? { x: W / 2, y: H } : p.side === 'top' ? { x: W / 2, y: 0 } : p.side === 'left' ? { x: 0, y: H / 2 } : { x: W, y: H / 2 };
        const len = (p.side === 'left' || p.side === 'right') ? H : W;
        const off = Math.min(S * 0.34, len / 2 - S * 0.13);
        g.save();
        ctx.facing(g, p.i, m.x + v.x * S * 0.065, m.y + v.y * S * 0.065);
        g.translate(off, 0);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const r = S * 0.017, gap = S * 0.05;
        for (let k = 0; k < WIN_ROUNDS; k++) {
          circle((k - (WIN_ROUNDS - 1) / 2) * gap, -S * 0.012, r);
          if (k < wins[p.i]) { g.fillStyle = p.color; g.shadowColor = p.color; g.shadowBlur = 12; g.fill(); g.shadowBlur = 0; }
          else { g.strokeStyle = U.alpha(p.color, 0.55); g.lineWidth = 3; g.stroke(); }
        }
        g.font = `700 ${Math.round(S * 0.022)}px ${FONT}`;
        g.fillStyle = 'rgba(255,255,255,.5)';
        g.fillText(`раунд ${round}`, 0, S * 0.025);
        g.restore();
      }
    }

    ctx.loop((dt, t) => {
      if (dt > 0) step(dt);
      drawArena(t);
      // falling balls under the arena-level ones
      for (const b of balls) if (!b.onArena) drawBall(b);
      for (const b of balls) if (b.onArena) drawBall(b);
      drawHud();
      drawJoys();
    });

    ctx._sumo = { balls, wins, joys, get state() { return state; }, get A() { return A; } };
  },
});
