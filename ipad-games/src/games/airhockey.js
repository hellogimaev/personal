registerGame({
  id: 'airhockey',
  title: 'Аэрохоккей',
  emoji: '🏒',
  desc: 'Отбивай шайбу битой и защищай свои ворота',
  rules: 'Каждый водит пальцем свою биту (круг своего цвета) на своей половине поля.\n' +
    'Ворота — в середине твоего края. Забей шайбу в чужие ворота и не пропусти в свои.\n' +
    '2 игрока: кто первым забьёт 7 голов, тот победил.\n' +
    '3 игрока: у каждого 5 жизней, пропущенный гол — минус жизнь. Последний оставшийся побеждает.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const { cv, g } = ctx.canvas();
    const P = ctx.players;
    const N = ctx.n;
    const WIN_GOALS = 7, LIVES = 5;
    const E_MALLET = 0.9, E_WALL = 0.88;
    const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", Roboto, sans-serif';

    const goals = P.map(() => 0);      // 2p: goals scored by player
    const lives = P.map(() => LIVES);  // 3p
    const out = P.map(() => false);
    let over = false;

    // ---------- geometry ----------
    let W = ctx.W, H = ctx.H, S, RM, RP, GOAL, MAXV, MALLET_V;
    // edge distance d_side(x,y) = a.x*x + a.y*y + c
    const edgeFn = (side) => side === 'bottom' ? { ax: 0, ay: -1, c: H } : side === 'top' ? { ax: 0, ay: 1, c: 0 }
      : side === 'left' ? { ax: 1, ay: 0, c: 0 } : { ax: -1, ay: 0, c: W };
    const active = () => P.filter(p => !out[p.i]).map(p => p.i);

    // convex polygon clip by half-plane nx*x + ny*y <= k
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
    // Half-planes "my edge is nearest" against other active players.
    function regionPlanes(i) {
      const me = edgeFn(P[i].side), planes = [];
      for (const k of active()) {
        if (k === i) continue;
        const o = edgeFn(P[k].side);
        planes.push({ nx: me.ax - o.ax, ny: me.ay - o.ay, k: o.c - me.c });
      }
      return planes;
    }
    function regionPoly(i, inset) {
      let poly = [{ x: inset, y: inset }, { x: W - inset, y: inset }, { x: W - inset, y: H - inset }, { x: inset, y: H - inset }];
      for (const pl of regionPlanes(i)) poly = clip(poly, pl.nx, pl.ny, pl.k);
      return poly;
    }
    let fieldPolys = [], malletPolys = [];
    function rebuildRegions() {
      fieldPolys = P.map(p => out[p.i] ? [] : regionPoly(p.i, 0));
      malletPolys = P.map(p => out[p.i] ? [] : regionPoly(p.i, RM));
    }
    function inPoly(poly, x, y) {
      // convex, any orientation
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
    // does side have an open goal?
    const goalOpen = (side) => { const p = P.find(q => q.side === side); return !!p && !out[p.i] && !over; };
    const ownerOf = (side) => { const p = P.find(q => q.side === side); return p ? p.i : -1; };

    function layout() {
      W = ctx.W; H = ctx.H;
      S = Math.min(W, H);
      RM = S * 0.058;
      RP = S * 0.034;
      GOAL = S * 0.36;
      MAXV = S * 2.4;
      MALLET_V = S * 4.5;
      rebuildRegions();
    }
    layout();

    // ---------- objects ----------
    const puck = { x: W / 2, y: H / 2, vx: 0, vy: 0, live: true, alpha: 1, trail: [] };
    const mallets = P.map(p => {
      const m = edgeMid(p.i), v = ctx.inward(p.i);
      return { x: m.x + v.x * S * 0.2, y: m.y + v.y * S * 0.2, vx: 0, vy: 0, tx: null, ty: null, ptr: null };
    });
    const flash = P.map(() => 0); // goal flash timer

    ctx.onResize(() => {
      const ow = W, oh = H;
      layout();
      const sx = W / ow, sy = H / oh;
      puck.x *= sx; puck.y *= sy; puck.trail = [];
      for (const m of mallets) {
        m.x *= sx; m.y *= sy;
        if (m.tx != null) { m.tx *= sx; m.ty *= sy; }
      }
      P.forEach(p => { if (!out[p.i]) { const q = project(malletPolys[p.i], mallets[p.i].x, mallets[p.i].y); mallets[p.i].x = q.x; mallets[p.i].y = q.y; } });
    });

    // ---------- input ----------
    const owner = new Map(); // pointerId -> player
    ctx.pointer(cv, {
      down(id, x, y) {
        if (over) return;
        const i = seatActive(x, y);
        if (i < 0) return;
        owner.set(id, i);
        const m = mallets[i];
        m.ptr = id; // latest finger in own region takes the mallet
        const q = project(malletPolys[i], x, y);
        m.tx = q.x; m.ty = q.y;
      },
      move(id, x, y) {
        const i = owner.get(id);
        if (i == null || out[i]) return;
        const m = mallets[i];
        if (m.ptr !== id) return;
        const q = project(malletPolys[i], x, y);
        m.tx = q.x; m.ty = q.y;
      },
      up(id) {
        const i = owner.get(id);
        owner.delete(id);
        if (i != null && mallets[i].ptr === id) { mallets[i].ptr = null; mallets[i].tx = null; }
      },
    });

    // ---------- serve / goals ----------
    function serve(toward) {
      if (over) return;
      const act = active();
      if (toward == null || out[toward]) toward = U.pick(act);
      puck.x = W / 2; puck.y = H / 2;
      // in 3p keep the spawn point a bit lower so it's not on the top wall line of regions
      const v = ctx.inward(toward);
      const ang = U.rand(-0.45, 0.45);
      const dx = -v.x, dy = -v.y; // toward that player's edge
      const c = Math.cos(ang), s = Math.sin(ang);
      const sp = S * 0.32;
      puck.vx = (dx * c - dy * s) * sp; puck.vy = (dx * s + dy * c) * sp;
      puck.live = true; puck.alpha = 0; puck.trail = [];
    }
    ctx.after(500, () => serve());

    function goalAgainst(i) {
      puck.live = false;
      flash[i] = 1;
      if (N === 2) {
        const sc = 1 - i;
        goals[sc]++;
        if (goals[sc] >= WIN_GOALS) {
          over = true;
          ctx.toast(`${P[sc].name} победил!`, { color: P[sc].color, fg: '#111', ms: 1400 });
          ctx.after(1300, () => ctx.end({ winner: sc, scores: goals.slice(), msg: `Счёт ${goals[0]} : ${goals[1]}` }));
          return;
        }
        ctx.toast(`Гол! +1 ${P[sc].name}`, { color: P[sc].color, fg: '#111' });
      } else {
        lives[i]--;
        if (lives[i] <= 0) {
          out[i] = true;
          const m = mallets[i]; m.ptr = null; m.tx = null;
          rebuildRegions();
          const act = active();
          if (act.length <= 1) {
            over = true;
            const w = act[0];
            ctx.toast(`${P[w].name} победил!`, { color: P[w].color, fg: '#111', ms: 1400 });
            ctx.after(1300, () => ctx.end({ winner: w, scores: lives.slice(), msg: 'Остался последним' }));
            return;
          }
          ctx.toast(`${P[i].name} выбывает`, { color: P[i].color, fg: '#111', ms: 1400 });
        } else {
          ctx.toast(`Гол! ${P[i].name}: −1 жизнь`, { color: P[i].color, fg: '#111' });
        }
      }
      ctx.after(1000, () => serve(i));
    }

    // ---------- physics ----------
    function collideMallet(m) {
      const dx = puck.x - m.x, dy = puck.y - m.y, min = RM + RP;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min) return;
      let d = Math.sqrt(d2), nx, ny;
      if (d < 1e-6) { nx = 0; ny = -1; d = 0; } else { nx = dx / d; ny = dy / d; }
      puck.x = m.x + nx * min; puck.y = m.y + ny * min;
      const rel = (puck.vx - m.vx) * nx + (puck.vy - m.vy) * ny;
      if (rel < 0) {
        puck.vx -= (1 + E_MALLET) * rel * nx;
        puck.vy -= (1 + E_MALLET) * rel * ny;
      }
    }
    function postBounce(px, py) {
      const dx = puck.x - px, dy = puck.y - py, d = Math.hypot(dx, dy);
      if (d >= RP || d < 1e-6) return;
      const nx = dx / d, ny = dy / d;
      puck.x = px + nx * RP; puck.y = py + ny * RP;
      const vn = puck.vx * nx + puck.vy * ny;
      if (vn < 0) { puck.vx -= (1 + E_WALL) * vn * nx; puck.vy -= (1 + E_WALL) * vn * ny; }
    }
    // returns side index of goal scored or -1
    function walls() {
      const gh = GOAL / 2;
      // left / right
      for (const side of ['left', 'right']) {
        const open = goalOpen(side) && Math.abs(puck.y - H / 2) < gh;
        if (side === 'left') {
          if (puck.x < RP && !open) { puck.x = RP; if (puck.vx < 0) puck.vx = -puck.vx * E_WALL; }
        } else if (puck.x > W - RP && !open) { puck.x = W - RP; if (puck.vx > 0) puck.vx = -puck.vx * E_WALL; }
        if (goalOpen(side)) {
          const ex = side === 'left' ? 0 : W;
          postBounce(ex, H / 2 - gh); postBounce(ex, H / 2 + gh);
        }
      }
      for (const side of ['top', 'bottom']) {
        const open = goalOpen(side) && Math.abs(puck.x - W / 2) < gh;
        if (side === 'top') {
          if (puck.y < RP && !open) { puck.y = RP; if (puck.vy < 0) puck.vy = -puck.vy * E_WALL; }
        } else if (puck.y > H - RP && !open) { puck.y = H - RP; if (puck.vy > 0) puck.vy = -puck.vy * E_WALL; }
        if (goalOpen(side)) {
          const ey = side === 'top' ? 0 : H;
          postBounce(W / 2 - gh, ey); postBounce(W / 2 + gh, ey);
        }
      }
      if (puck.x < -RP * 0.2) return ownerOf('left');
      if (puck.x > W + RP * 0.2) return ownerOf('right');
      if (puck.y < -RP * 0.2) return ownerOf('top');
      if (puck.y > H + RP * 0.2) return ownerOf('bottom');
      return -1;
    }

    function step(dt) {
      const sp = Math.hypot(puck.vx, puck.vy);
      const n = U.clamp(Math.ceil(Math.max(sp, MALLET_V) * dt / (RP * 0.4)), 1, 60);
      const h = dt / n;
      const fr = Math.exp(-0.25 * h);
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
        if (!puck.live) continue;
        puck.x += puck.vx * h; puck.y += puck.vy * h;
        puck.vx *= fr; puck.vy *= fr;
        for (const p of P) if (!out[p.i]) collideMallet(mallets[p.i]);
        const gi = walls();
        // if the puck got squeezed against a wall, push the mallet out instead
        for (const p of P) {
          if (out[p.i]) continue;
          const m = mallets[p.i], dx = m.x - puck.x, dy = m.y - puck.y, d = Math.hypot(dx, dy), min = RM + RP;
          if (d < min && d > 1e-6) { m.x = puck.x + dx / d * min; m.y = puck.y + dy / d * min; }
        }
        const v = Math.hypot(puck.vx, puck.vy);
        if (v > MAXV) { puck.vx *= MAXV / v; puck.vy *= MAXV / v; }
        if (gi >= 0) { goalAgainst(gi); break; }
      }
    }

    // ---------- drawing ----------
    function poly(pts) {
      g.beginPath();
      pts.forEach((p, j) => j ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
      g.closePath();
    }
    function circle(x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }

    function drawField(t) {
      g.fillStyle = '#0f1220';
      g.fillRect(0, 0, W, H);
      // regions
      P.forEach(p => {
        if (out[p.i] || fieldPolys[p.i].length < 3) return;
        poly(fieldPolys[p.i]);
        g.fillStyle = U.alpha(p.color, 0.06);
        g.fill();
      });
      // region borders
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
      circle(W / 2, H / 2, 6); g.fillStyle = 'rgba(255,255,255,.18)'; g.fill();

      // walls
      g.lineWidth = 8;
      g.strokeStyle = '#3a4270';
      g.strokeRect(4, 4, W - 8, H - 8);
      // goals
      const gh = GOAL / 2;
      for (const p of P) {
        const side = p.side;
        const horiz = side === 'top' || side === 'bottom';
        const ex = side === 'left' ? 0 : side === 'right' ? W : W / 2;
        const ey = side === 'top' ? 0 : side === 'bottom' ? H : H / 2;
        if (out[p.i]) {
          // closed goal: draw a grey bar
          g.fillStyle = '#4a5280';
          if (horiz) g.fillRect(W / 2 - gh, side === 'top' ? 0 : H - 10, GOAL, 10);
          else g.fillRect(side === 'left' ? 0 : W - 10, H / 2 - gh, 10, GOAL);
          continue;
        }
        const f = flash[p.i];
        // cut the wall
        g.fillStyle = '#0f1220';
        if (horiz) g.fillRect(W / 2 - gh, side === 'top' ? 0 : H - 10, GOAL, 10);
        else g.fillRect(side === 'left' ? 0 : W - 10, H / 2 - gh, 10, GOAL);
        // goal mouth glow
        const v = ctx.inward(p.i);
        const depth = S * 0.07;
        const gx0 = horiz ? W / 2 - gh : ex, gy0 = horiz ? ey : H / 2 - gh;
        const grad = g.createLinearGradient(ex, ey, ex + v.x * depth, ey + v.y * depth);
        grad.addColorStop(0, U.alpha(p.color, 0.45 + 0.5 * f));
        grad.addColorStop(1, U.alpha(p.color, 0));
        g.fillStyle = grad;
        if (horiz) g.fillRect(gx0, side === 'top' ? 0 : H - depth, GOAL, depth);
        else g.fillRect(side === 'left' ? 0 : W - depth, gy0, depth, GOAL);
        // posts
        g.fillStyle = p.color;
        g.shadowColor = p.color; g.shadowBlur = 14;
        const posts = horiz ? [[W / 2 - gh, ey], [W / 2 + gh, ey]] : [[ex, H / 2 - gh], [ex, H / 2 + gh]];
        for (const [x, y] of posts) { circle(x, y, 9); g.fill(); }
        g.shadowBlur = 0;
        // crease arc
        g.strokeStyle = U.alpha(p.color, 0.35);
        g.lineWidth = 3;
        g.beginPath();
        const a0 = Math.atan2(v.y, v.x);
        g.arc(ex, ey, gh, a0 - Math.PI / 2, a0 + Math.PI / 2);
        g.stroke();
      }
    }

    function drawHud() {
      for (const p of P) {
        const m = edgeMid(p.i), v = ctx.inward(p.i);
        const len = (p.side === 'left' || p.side === 'right') ? H : W;
        const off = Math.min(GOAL / 2 + S * 0.15, len / 2 - S * 0.1);
        g.save();
        ctx.facing(g, p.i, m.x + v.x * S * 0.075, m.y + v.y * S * 0.075);
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
      const c = p.color;
      g.save();
      g.shadowColor = c; g.shadowBlur = m.ptr != null ? 26 : 14;
      circle(m.x, m.y, RM);
      const gr = g.createRadialGradient(m.x - RM * 0.3, m.y - RM * 0.3, RM * 0.1, m.x, m.y, RM);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.25, c);
      gr.addColorStop(1, U.alpha(c, 0.75));
      g.fillStyle = gr; g.fill();
      g.shadowBlur = 0;
      circle(m.x, m.y, RM * 0.72);
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.stroke();
      circle(m.x, m.y, RM * 0.42);
      g.fillStyle = c; g.fill();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; g.stroke();
      g.restore();
    }

    function drawPuck() {
      if (!puck.live && puck.alpha <= 0) return;
      g.save();
      g.globalAlpha = puck.alpha;
      for (let k = 0; k < puck.trail.length; k++) {
        const tr = puck.trail[k], a = (k + 1) / puck.trail.length;
        circle(tr.x, tr.y, RP * (0.4 + 0.5 * a));
        g.fillStyle = `rgba(200,230,255,${0.12 * a})`;
        g.fill();
      }
      g.shadowColor = '#bfe6ff'; g.shadowBlur = 22;
      circle(puck.x, puck.y, RP);
      g.fillStyle = '#eef6ff'; g.fill();
      g.shadowBlur = 0;
      circle(puck.x, puck.y, RP * 0.62);
      g.strokeStyle = 'rgba(15,18,32,.35)'; g.lineWidth = 3; g.stroke();
      g.restore();
    }

    ctx.loop((dt) => {
      if (dt > 0) {
        step(dt);
        for (let i = 0; i < flash.length; i++) flash[i] = Math.max(0, flash[i] - dt * 1.2);
        if (puck.live) {
          puck.alpha = Math.min(1, puck.alpha + dt * 5);
          puck.trail.push({ x: puck.x, y: puck.y });
          if (puck.trail.length > 8) puck.trail.shift();
        } else {
          puck.alpha = Math.max(0, puck.alpha - dt * 4);
          puck.trail.length = 0;
        }
      }
      drawField();
      drawHud();
      for (const p of P) if (!out[p.i]) drawMallet(p, mallets[p.i]);
      drawPuck();
    });

    // test hook
    ctx._ah = { puck, mallets, goals, lives, out };
  },
});
