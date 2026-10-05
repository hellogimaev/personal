registerGame({
  id: 'tug',
  title: 'Перетягивание',
  emoji: '💪',
  desc: 'Жми быстрее всех и перетяни узел к себе',
  rules: 'Посередине завязан узел каната.\nКаждое нажатие на свою большую кнопку тянет узел к вашему краю.\nКто первым затащит узел за свою линию (она вашего цвета), тот победил.\nУзел понемногу сползает обратно к центру, так что тянуть надо без остановки.\nЧем дольше схватка, тем сильнее рывки.',
  start(ctx) {
    const N = ctx.n;
    // 3p: push the toast copies further apart so the rotated copies don't overlap
    const say = (text, o = {}) => ctx.toast(text, Object.assign({ offset: N === 3 ? Math.max(90, text.length * 7.5 + 30) : 70 }, o));
    const DEPTH = 0.22;
    // Pull direction of each player in normalized play-space (u right, v down).
    // 3p: the three pulls sum to zero, so equal tapping keeps the knot still.
    const PULL = N === 2 ? [[0, 1], [0, -1]] : [[0, 1], [-1, -0.5], [1, -0.5]];
    const IMP = 0.27;       // velocity impulse per tap
    const DAMP = 6;         // velocity damping per second
    const DECAY = 0.08;     // drift back to center per second (fraction of offset)
    const KNOT_R = 26;

    const pos = { u: 0, v: 0 }, vel = { u: 0, v: 0 };
    const taps = ctx.players.map(() => 0);
    const tension = ctx.players.map(() => 0);
    const parts = [];
    let shake = 0, flash = 0;
    let state = 'play'; // play | done
    let winner = -1;
    let powerNoted = false;

    ctx.root.classList.add('g-tug');
    ctx.root.append(U.h('style', null, `
      .g-tug .tb{position:absolute;inset:10px;border-radius:24px;background:var(--pc);color:#111;
        display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:900;
        box-shadow:inset 0 -8px 0 rgba(0,0,0,.18);overflow:hidden}
      .g-tug .tb .lbl{font-size:30px;letter-spacing:2px;line-height:1}
      .g-tug .tb .cnt{font-size:17px;opacity:.7;margin-top:6px}
      .g-tug .tb .bar{position:absolute;left:18px;right:18px;top:10px;height:8px;border-radius:4px;background:rgba(0,0,0,.18)}
      .g-tug .tb .bar i{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:rgba(0,0,0,.55);width:0}
      .g-tug .tb.hit{animation:tugHit .14s ease-out}
      .g-tug .tb.won{outline:6px solid #fff}
      .g-tug .tb.lost{opacity:.35}
      @keyframes tugHit{0%{transform:scale(.94);filter:brightness(1.35)}100%{transform:scale(1);filter:none}}
    `));

    const { g } = ctx.canvas();

    const zones = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH });
      const bar = U.h('i');
      const b = U.h('div', { class: 'tb' },
        U.h('div', { class: 'bar' }, bar),
        U.h('div', { class: 'lbl' }, 'ТЯНИ!'),
        U.h('div', { class: 'cnt' }, 'рывков: 0'));
      z.el.append(b);
      ctx.tap(b, () => pull(p.i));
      return { z, b, bar, cnt: b.querySelector('.cnt') };
    });

    function layoutBtns() {
      zones.forEach(zb => {
        const h = zb.z.h;
        zb.b.querySelector('.lbl').style.fontSize = Math.round(U.clamp(h * 0.2, 26, 46)) + 'px';
        zb.cnt.style.fontSize = Math.round(U.clamp(h * 0.09, 15, 22)) + 'px';
      });
    }
    layoutBtns();
    ctx.onResize(layoutBtns);

    // ----- geometry -----
    function geo() {
      const W = ctx.W, H = ctx.H, d = zones[0].z.h, M = 18;
      if (N === 2) return { W, H, d, cx: W / 2, cy: H / 2, hx: 0, hy: (H - 2 * d) / 2 - M };
      return { W, H, d, cx: W / 2, cy: (H - d) / 2, hx: (W - 2 * d) / 2 - M, hy: (H - d) / 2 - M };
    }
    const toXY = (G, u, v) => ({ x: G.cx + u * G.hx, y: G.cy + v * G.hy });
    function anchor(G, i) {
      const side = ctx.players[i].side;
      const p = toXY(G, PULL[i][0], PULL[i][1]);
      if (side === 'bottom') return { x: p.x, y: G.H - G.d };
      if (side === 'top') return { x: p.x, y: G.d };
      if (side === 'left') return { x: G.d, y: p.y };
      return { x: G.W - G.d, y: p.y };
    }
    // How far the knot is toward player i's goal line (1 = reached).
    function progress(i) {
      const side = ctx.players[i].side;
      return side === 'bottom' ? pos.v : side === 'top' ? -pos.v : side === 'left' ? -pos.u : pos.u;
    }
    const power = () => 1 + Math.max(0, ctx.time - 15) * 0.06;

    function pull(i) {
      if (state !== 'play') return;
      taps[i]++;
      const k = IMP * power();
      vel.u += PULL[i][0] * k;
      vel.v += PULL[i][1] * k;
      tension[i] = Math.min(1, tension[i] + 0.4);
      shake = Math.min(1, shake + 0.35);
      parts.push({ i, s: 0 });
      const zb = zones[i];
      zb.b.classList.remove('hit'); void zb.b.offsetWidth; zb.b.classList.add('hit');
      zb.cnt.textContent = 'рывков: ' + taps[i];
    }

    function win(i) {
      state = 'done';
      winner = i;
      flash = 1;
      zones.forEach((zb, k) => zb.b.classList.add(k === i ? 'won' : 'lost'));
      say(`${ctx.players[i].name} перетянул!`, { color: ctx.players[i].color, fg: '#111', ms: 1400 });
      ctx.after(1300, () => ctx.end({ winner: i, msg: 'Рывков: ' + taps.map((t, k) => `${NAMES[k]} ${t}`).join(' · ') }));
    }

    ctx.loop((dt, t) => {
      const G = geo();
      if (dt > 0 && state === 'play') {
        pos.u += vel.u * dt; pos.v += vel.v * dt;
        const damp = Math.exp(-DAMP * dt);
        vel.u *= damp; vel.v *= damp;
        const dec = Math.exp(-DECAY * dt);
        pos.u *= dec; pos.v *= dec;
        if (N === 2) pos.u = 0;
        // win check before clamping
        let best = -1, bp = 1;
        for (let i = 0; i < N; i++) { const pr = progress(i); if (pr >= bp) { bp = pr; best = i; } }
        if (best >= 0) win(best);
        // keep the knot on screen (3p top edge has no player)
        const vmin = N === 3 ? -1 + KNOT_R / Math.max(1, G.hy) : -1;
        if (pos.v < vmin) { pos.v = vmin; if (vel.v < 0) vel.v = 0; }
        pos.u = U.clamp(pos.u, -1, 1); pos.v = U.clamp(pos.v, -1, 1);
        if (!powerNoted && ctx.time > 15) {
          powerNoted = true;
          say('Рывки сильнее!', { ms: 1100 });
        }
      }
      for (let i = 0; i < N; i++) tension[i] = Math.max(0, tension[i] - dt * 1.6);
      shake = Math.max(0, shake - dt * 4);
      flash = Math.max(0, flash - dt * 1.2);
      for (const p of parts) p.s += dt / 0.35;
      while (parts.length && parts[0].s >= 1) parts.shift();
      zones.forEach((zb, i) => { zb.bar.style.width = Math.round(U.clamp((progress(i) + 1) / 2, 0, 1) * 100) + '%'; });
      draw(G, t / 1000);
    });

    function draw(G, T) {
      const { W, H } = G;
      g.clearRect(0, 0, W, H);
      // goal lines
      for (let i = 0; i < N; i++) {
        const p = ctx.players[i], c = p.color;
        const near = U.clamp((progress(i) + 1) / 2, 0, 1);
        g.save();
        g.lineWidth = 6;
        g.strokeStyle = c;
        g.shadowColor = c;
        g.shadowBlur = 8 + 30 * near * near;
        g.setLineDash([18, 10]);
        g.beginPath();
        if (p.side === 'bottom' || p.side === 'top') {
          const y = G.cy + (p.side === 'bottom' ? 1 : -1) * G.hy;
          const x0 = N === 3 ? G.d : 0, x1 = N === 3 ? W - G.d : W;
          g.moveTo(x0, y); g.lineTo(x1, y);
          // goal band
          g.fillStyle = U.alpha(c, 0.06 + 0.18 * near * near);
          g.fillRect(x0, p.side === 'bottom' ? y : G.d, x1 - x0, p.side === 'bottom' ? H - G.d - y : y - G.d);
        } else {
          const x = G.cx + (p.side === 'right' ? 1 : -1) * G.hx;
          g.moveTo(x, 0); g.lineTo(x, H - G.d);
          g.fillStyle = U.alpha(c, 0.06 + 0.18 * near * near);
          g.fillRect(p.side === 'left' ? G.d : x, 0, p.side === 'left' ? x - G.d : W - G.d - x, H - G.d);
        }
        g.stroke();
        g.restore();
      }
      // center mark
      g.save();
      g.strokeStyle = 'rgba(255,255,255,.18)';
      g.lineWidth = 3;
      g.beginPath(); g.arc(G.cx, G.cy, KNOT_R + 14, 0, Math.PI * 2); g.stroke();
      g.restore();

      const sx = (Math.random() - 0.5) * 6 * shake, sy = (Math.random() - 0.5) * 6 * shake;
      const k = toXY(G, pos.u, pos.v);
      k.x += sx; k.y += sy;
      // ropes
      for (let i = 0; i < N; i++) {
        const a = anchor(G, i), c = ctx.players[i].color;
        const dx = a.x - k.x, dy = a.y - k.y, L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L;
        const sag = (1 - tension[i]) * Math.min(26, L * 0.08) * Math.sin(T * 2.2 + i * 2);
        const mx = (a.x + k.x) / 2 + nx * sag, my = (a.y + k.y) / 2 + ny * sag;
        g.save();
        g.lineCap = 'round';
        g.strokeStyle = '#6b5236';
        g.lineWidth = 14;
        g.beginPath(); g.moveTo(k.x, k.y); g.quadraticCurveTo(mx, my, a.x, a.y); g.stroke();
        g.strokeStyle = c;
        g.lineWidth = 9;
        g.beginPath(); g.moveTo(k.x, k.y); g.quadraticCurveTo(mx, my, a.x, a.y); g.stroke();
        g.strokeStyle = 'rgba(0,0,0,.28)';
        g.lineWidth = 9;
        g.setLineDash([6, 10]);
        g.lineDashOffset = -T * 40 * (1 + tension[i] * 3);
        g.beginPath(); g.moveTo(k.x, k.y); g.quadraticCurveTo(mx, my, a.x, a.y); g.stroke();
        g.restore();
      }
      // tap pulses travelling along the rope toward the puller
      for (const p of parts) {
        const a = anchor(G, p.i);
        const x = U.lerp(k.x, a.x, p.s), y = U.lerp(k.y, a.y, p.s);
        g.save();
        g.globalAlpha = 1 - p.s;
        g.fillStyle = '#fff';
        g.shadowColor = ctx.players[p.i].color;
        g.shadowBlur = 16;
        g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      // knot
      let lead = -1, lp = 0.08;
      for (let i = 0; i < N; i++) if (progress(i) > lp) { lp = progress(i); lead = i; }
      const kc = winner >= 0 ? ctx.players[winner].color : lead >= 0 ? ctx.players[lead].color : '#ffffff';
      g.save();
      g.shadowColor = kc;
      g.shadowBlur = 20 + 30 * flash;
      g.fillStyle = '#f5e6c8';
      g.beginPath(); g.arc(k.x, k.y, KNOT_R * (1 + 0.12 * shake), 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
      g.lineWidth = 6;
      g.strokeStyle = kc;
      g.stroke();
      g.strokeStyle = 'rgba(80,60,30,.6)';
      g.lineWidth = 3;
      g.beginPath(); g.arc(k.x, k.y, KNOT_R * 0.5, 0.3, Math.PI * 1.6); g.stroke();
      g.restore();
    }
  },
});
