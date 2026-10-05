registerGame({
  id: 'tug',
  title: 'Перетягивание',
  emoji: '💪',
  desc: 'Жми быстрее всех и перетяни узел к себе',
  rules: 'Каждое нажатие на свою большую кнопку тянет узел к вашему краю. Кто первым затащит узел за свою линию, тот победил.\n' +
    '⭐ Звезда: появляется у всех сразу, кто первым схватит, делает супер-рывок.\n' +
    '❄️ Снежинка: кто схватит, замораживает лидера среди соперников на 2.5 с.\n' +
    '🔁 Наоборот: 3 секунды нажатия тянут узел ОТ тебя. Лучше не жать!\n' +
    '🆘 Второе дыхание: чем дальше узел от тебя, тем сильнее твои рывки.\n' +
    '🔥 Через 15 секунд все рывки становятся сильнее.',
  start(ctx) {
    const N = ctx.n;
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
    const frozen = ctx.players.map(() => 0);   // game time until which the player is frozen
    let invUntil = 0;                           // game time until which pulls are inverted
    let item = null;                            // {type, els, timer}
    let lastEvent = '';
    const parts = [];
    let shake = 0, flash = 0;
    let state = 'play'; // play | done
    let winner = -1;
    let powerNoted = false;

    ctx.root.classList.add('g-tug');
    ctx.root.append(U.h('style', null, `
      .g-tug .tb{position:absolute;inset:10px;border-radius:24px;background:var(--pc);color:#111;
        display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:900;
        box-shadow:inset 0 -8px 0 rgba(0,0,0,.18);overflow:hidden;transition:filter .2s}
      .g-tug .tb .lbl{letter-spacing:2px;line-height:1}
      .g-tug .tb .cnt{opacity:.7;margin-top:6px}
      .g-tug .tb .bar{position:absolute;left:18px;right:18px;top:10px;height:8px;border-radius:4px;background:rgba(0,0,0,.18)}
      .g-tug .tb .bar i{position:absolute;left:0;top:0;bottom:0;border-radius:4px;background:rgba(0,0,0,.55);width:0}
      .g-tug .tb .boost{position:absolute;right:14px;bottom:12px;font-size:18px;background:rgba(0,0,0,.25);color:#fff;border-radius:10px;padding:2px 8px;display:none}
      .g-tug .tb.hit{animation:tugHit .14s ease-out}
      .g-tug .tb.won{outline:6px solid #fff}
      .g-tug .tb.lost{opacity:.35}
      .g-tug .tb.frozen{filter:saturate(.2) brightness(1.3)}
      .g-tug .tb .ice{position:absolute;inset:0;display:none;align-items:center;justify-content:center;font-size:60px;
        background:repeating-linear-gradient(135deg,rgba(190,235,255,.75) 0 14px,rgba(150,210,255,.6) 14px 28px);color:#0b3550}
      .g-tug .tb.frozen .ice{display:flex}
      .g-tug .tb .lbl,.g-tug .tb .cnt{position:relative;z-index:1}
      .g-tug .tb.inv::after{content:'';position:absolute;inset:0;
        background:repeating-linear-gradient(45deg,rgba(150,80,255,.7) 0 18px,rgba(150,80,255,.3) 18px 36px);animation:tugInv .4s infinite alternate}
      .g-tug .tb.inv .lbl{color:#fff;text-shadow:0 2px 6px rgba(0,0,0,.6)}
      @keyframes tugInv{0%{opacity:.55}100%{opacity:1}}
      @keyframes tugHit{0%{transform:scale(.94);filter:brightness(1.35)}100%{transform:scale(1);filter:none}}
      .g-tug .it{position:absolute;width:86px;height:86px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        font-size:52px;z-index:3;background:radial-gradient(circle,rgba(255,255,255,.95) 0,rgba(255,255,255,.55) 55%,rgba(255,255,255,0) 72%);
        animation:tugItem .5s ease-in-out infinite alternate}
      .g-tug .it.fade{opacity:.4;transition:opacity .6s}
      @keyframes tugItem{0%{transform:scale(.9) rotate(-8deg)}100%{transform:scale(1.08) rotate(8deg)}}
      .fx-flash{position:absolute;inset:0;z-index:36;pointer-events:none;transition:opacity .55s ease-out}
      .fx-shake{animation:fxShake .35s}
      @keyframes fxShake{0%,100%{translate:0 0}20%{translate:-9px 4px}40%{translate:8px -5px}60%{translate:-6px -3px}80%{translate:5px 3px}}
      .toast.fx-ban{font-size:26px;text-align:center;line-height:1.15;border:2px solid rgba(255,255,255,.3);animation:fxPop .4s ease-out;padding:10px 20px}
      .toast.fx-ban b{font-size:34px;margin-right:8px;vertical-align:-4px}
      .toast.fx-ban small{display:block;font-size:16px;font-weight:700;opacity:.85;margin-top:2px}
      @keyframes fxPop{0%{scale:.3;opacity:0}60%{scale:1.12;opacity:1}100%{scale:1}}
    `));

    const { g } = ctx.canvas();

    // ---------- juice: particles, flashes, shake, announcements ----------
    const fx = (() => {
      const { cv, g } = ctx.canvas({ z: 35 });
      cv.style.pointerEvents = 'none';
      const ps = [];
      const layer = U.h('div', { class: 'toast-layer' });
      ctx.root.append(layer);
      const active = [];
      const api = {
        at(el) {
          const r = el.getBoundingClientRect(), R = ctx.root.getBoundingClientRect();
          return { x: r.left - R.left + r.width / 2, y: r.top - R.top + r.height / 2 };
        },
        burst(x, y, color, n = 22, sp = 360, size = 6) {
          for (let k = 0; k < n; k++) {
            const a = Math.random() * 6.283, s = sp * (0.35 + Math.random() * 0.65), l = 0.5 + Math.random() * 0.5;
            ps.push({ kind: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, color, size: size * (0.6 + Math.random() * 0.8) });
          }
        },
        ring(x, y, color, r = 90) { ps.push({ kind: 'r', x, y, life: 0.5, max: 0.5, color, r }); },
        text(x, y, str, color, i, size = 34) {
          const v = ctx.toScreen(i, 0, -60);
          ps.push({ kind: 't', x, y, vx: v.x, vy: v.y, str, color, rot: ctx.players[i].rot, size, life: 1.1, max: 1.1 });
        },
        flash(color, a = 0.3) {
          const d = U.h('div', { class: 'fx-flash', style: { background: color, opacity: a } });
          ctx.root.append(d); void d.offsetWidth; d.style.opacity = 0;
          setTimeout(() => d.remove(), 700);
        },
        shake(el = ctx.root) { el.classList.remove('fx-shake'); void el.offsetWidth; el.classList.add('fx-shake'); },
        // announcement facing each player, just in front of their own zone (stacks if several are shown)
        banner(icon, title, sub, o = {}) {
          ctx.players.forEach(p => {
            const e = U.h('div', { class: 'toast fx-ban' }, U.h('b', null, icon), title, sub ? U.h('small', null, sub) : null);
            if (o.color) e.style.background = o.color;
            if (o.fg) e.style.color = o.fg;
            const z = zones[p.i].z, r = z.rect, v = ctx.inward(p.i);
            Object.assign(e.style, { maxWidth: (z.w - 16) + 'px', whiteSpace: 'normal' });
            layer.append(e);
            // room between this zone's inner edge and the screen center; drop older banners that would not fit
            const ex = r.x + r.w / 2 + v.x * z.h / 2, ey = r.y + r.h / 2 + v.y * z.h / 2;
            const room = (ctx.W / 2 - ex) * v.x + (ctx.H / 2 - ey) * v.y;
            const mine = active.filter(a => a.i === p.i);
            const sum = () => mine.reduce((s, a) => s + a.e.offsetHeight + 8, 0);
            while (mine.length && sum() + e.offsetHeight + 12 > Math.max(room, e.offsetHeight + 12)) {
              const old = mine.shift(); old.e.remove(); active.splice(active.indexOf(old), 1);
            }
            const stack = sum();
            const off = z.h / 2 + 12 + stack + e.offsetHeight / 2;
            Object.assign(e.style, { left: (r.x + r.w / 2 + v.x * off) + 'px', top: (r.y + r.h / 2 + v.y * off) + 'px', transform: `translate(-50%,-50%) rotate(${p.rot}deg)` });
            const a = { i: p.i, e };
            active.push(a);
            ctx.after(o.ms ?? 1700, () => { e.remove(); const k = active.indexOf(a); if (k >= 0) active.splice(k, 1); });
          });
        },
      };
      ctx.loop((dt) => {
        g.clearRect(0, 0, ctx.W, ctx.H);
        const damp = Math.exp(-3 * dt);
        for (let k = ps.length - 1; k >= 0; k--) {
          const p = ps[k];
          p.life -= dt;
          if (p.life <= 0) { ps.splice(k, 1); continue; }
          const f = p.life / p.max;
          if (p.kind === 'p') {
            p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= damp; p.vy *= damp;
            g.globalAlpha = Math.min(1, f * 1.5);
            g.fillStyle = p.color;
            g.beginPath(); g.arc(p.x, p.y, p.size * (0.4 + 0.6 * f), 0, 6.283); g.fill();
          } else if (p.kind === 'r') {
            g.globalAlpha = f;
            g.strokeStyle = p.color; g.lineWidth = 8 * f + 1;
            g.beginPath(); g.arc(p.x, p.y, p.r * (1 - f) + 10, 0, 6.283); g.stroke();
          } else {
            p.x += p.vx * dt; p.y += p.vy * dt;
            g.save();
            g.globalAlpha = Math.min(1, f * 2);
            g.translate(p.x, p.y); g.rotate(p.rot * Math.PI / 180);
            g.font = `900 ${p.size}px -apple-system,system-ui,sans-serif`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(p.str, 0, 0);
            g.fillStyle = p.color; g.fillText(p.str, 0, 0);
            g.restore();
          }
        }
        g.globalAlpha = 1;
      });
      return api;
    })();

    const zones = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH });
      const bar = U.h('i');
      const boost = U.h('div', { class: 'boost' }, '');
      const b = U.h('div', { class: 'tb' },
        U.h('div', { class: 'bar' }, bar),
        U.h('div', { class: 'lbl' }, 'ТЯНИ!'),
        U.h('div', { class: 'cnt' }, 'рывков: 0'),
        boost,
        U.h('div', { class: 'ice' }, '❄️'));
      z.el.append(b);
      ctx.tap(b, () => pull(p.i));
      return { z, b, bar, boost, lbl: b.querySelector('.lbl'), cnt: b.querySelector('.cnt') };
    });

    function layoutBtns() {
      zones.forEach(zb => {
        const h = zb.z.h;
        zb.lbl.style.fontSize = Math.round(U.clamp(h * 0.2, 26, 46)) + 'px';
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
    // How far the knot is toward player i's goal line (1 = reached, -1 = far side).
    function progress(i) {
      const side = ctx.players[i].side;
      return side === 'bottom' ? pos.v : side === 'top' ? -pos.v : side === 'left' ? -pos.u : pos.u;
    }
    const power = () => 1 + Math.max(0, ctx.time - 15) * 0.06;
    // 🆘 comeback: the farther the knot is from you, the stronger you pull
    const comeback = (i) => 1 + 0.8 * U.clamp(-progress(i), 0, 1);
    const knotXY = () => toXY(geo(), pos.u, pos.v);

    function kick(i, mult) {
      const k = IMP * power() * mult;
      vel.u += PULL[i][0] * k;
      vel.v += PULL[i][1] * k;
    }

    function pull(i) {
      if (state !== 'play') return;
      const zb = zones[i];
      if (ctx.time < frozen[i]) {
        fx.shake(zb.b);
        return;
      }
      taps[i]++;
      const inv = ctx.time < invUntil;
      kick(i, comeback(i) * (inv ? -1 : 1));
      tension[i] = Math.min(1, tension[i] + 0.4);
      shake = Math.min(1, shake + 0.35);
      parts.push({ i, s: 0, inv });
      zb.b.classList.remove('hit'); void zb.b.offsetWidth; zb.b.classList.add('hit');
      zb.cnt.textContent = 'рывков: ' + taps[i];
    }

    // ----- spice: items and events -----
    function clearItem() {
      if (!item) return;
      ctx.cancel(item.timer);
      item.els.forEach(e => e.remove());
      item = null;
    }
    function spawnItem(type) {
      clearItem();
      const icon = type === 'star' ? '⭐' : '❄️';
      const els = zones.map((zb, i) => {
        const S = 86, w = zb.z.w, h = zb.z.h;
        const x = U.rand(16, Math.max(16, w - 16 - S)), y = U.rand(22, Math.max(22, h - 12 - S));
        const e = U.h('div', { class: 'it', style: { left: x + 'px', top: y + 'px' } }, icon);
        ctx.tap(e, () => grab(i));
        zb.z.el.append(e);
        return e;
      });
      item = { type, els, timer: ctx.after(3200, clearItem) };
      ctx.after(2400, () => { if (item && item.els === els) els.forEach(e => e.classList.add('fade')); });
      fx.banner(icon, type === 'star' ? 'Звезда!' : 'Снежинка!', 'хватай первым');
    }
    function grab(i) {
      if (!item || state !== 'play') return;
      const type = item.type;
      const at = fx.at(item.els[i]);
      clearItem();
      const p = ctx.players[i];
      fx.burst(at.x, at.y, type === 'star' ? '#ffd84a' : '#bfe9ff', 26, 420, 7);
      fx.ring(at.x, at.y, '#fff', 110);
      if (type === 'star') {
        kick(i, 6 * comeback(i));
        tension[i] = 1;
        shake = 1; flash = 1;
        const k = knotXY();
        fx.burst(k.x, k.y, p.color, 40, 520, 8);
        fx.ring(k.x, k.y, p.color, 160);
        fx.flash(p.color, 0.25);
        fx.shake();
        fx.banner('⭐', 'Супер-рывок!', p.name, { color: p.color, fg: '#111', ms: 1300 });
      } else {
        // freeze the opponent who is closest to winning
        let t = -1, best = -Infinity;
        for (let j = 0; j < N; j++) if (j !== i && progress(j) > best) { best = progress(j); t = j; }
        frozen[t] = ctx.time + 2.5;
        zones[t].b.classList.add('frozen');
        const a = fx.at(zones[t].b);
        fx.burst(a.x, a.y, '#bfe9ff', 40, 500, 7);
        fx.flash('#9fdcff', 0.25);
        fx.banner('❄️', 'Заморозка!', `${ctx.players[t].name} замёрз на 2.5 с`, { color: '#bfe9ff', fg: '#0b3550', ms: 1500 });
      }
    }
    function invert() {
      invUntil = ctx.time + 3;
      zones.forEach(zb => { zb.b.classList.add('inv'); zb.lbl.textContent = '🔁 НЕ ЖМИ'; });
      fx.flash('#b16cff', 0.3);
      fx.banner('🔁', 'Наоборот!', '3 с: нажатие тянет ОТ тебя', { color: '#b16cff', fg: '#fff', ms: 2000 });
      ctx.after(3000, () => {
        zones.forEach(zb => { zb.b.classList.remove('inv'); zb.lbl.textContent = 'ТЯНИ!'; });
        if (state === 'play') fx.banner('💪', 'Тяни снова!', null, { ms: 900 });
      });
    }
    function randomEvent() {
      if (state !== 'play') return;
      let opts = ['star', 'star', 'ice', 'ice', 'inv'];
      if (lastEvent === 'inv') opts = opts.filter(o => o !== 'inv');
      const e = U.pick(opts);
      lastEvent = e;
      if (e === 'inv') invert(); else spawnItem(e);
      ctx.after(U.rand(5000, 7500), randomEvent);
    }
    ctx.after(4000, randomEvent);

    function win(i) {
      state = 'done';
      winner = i;
      flash = 1;
      clearItem();
      zones.forEach((zb, k) => zb.b.classList.add(k === i ? 'won' : 'lost'));
      const k = knotXY();
      fx.burst(k.x, k.y, ctx.players[i].color, 60, 650, 9);
      fx.burst(k.x, k.y, '#ffffff', 30, 400, 5);
      fx.ring(k.x, k.y, ctx.players[i].color, 220);
      fx.shake();
      fx.banner('🏆', `${ctx.players[i].name} перетянул!`, null, { color: ctx.players[i].color, fg: '#111', ms: 1500 });
      ctx.after(1500, () => ctx.end({ winner: i, msg: 'Рывков: ' + taps.map((t, k) => `${NAMES[k]} ${t}`).join(' · ') }));
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
          fx.banner('🔥', 'Рывки сильнее!', null, { ms: 1200 });
        }
      }
      for (let i = 0; i < N; i++) {
        tension[i] = Math.max(0, tension[i] - dt * 1.6);
        const zb = zones[i];
        if (frozen[i] && ctx.time >= frozen[i]) { frozen[i] = 0; zb.b.classList.remove('frozen'); }
        const cb = comeback(i);
        const show = cb > 1.15 && state === 'play';
        zb.boost.style.display = show ? 'block' : 'none';
        if (show) zb.boost.textContent = '🆘 ×' + cb.toFixed(1);
        zb.bar.style.width = Math.round(U.clamp((progress(i) + 1) / 2, 0, 1) * 100) + '%';
      }
      shake = Math.max(0, shake - dt * 4);
      flash = Math.max(0, flash - dt * 1.2);
      for (const p of parts) p.s += dt / 0.35;
      while (parts.length && parts[0].s >= 1) parts.shift();
      draw(G, t / 1000);
    });

    function draw(G, T) {
      const { W, H } = G;
      g.clearRect(0, 0, W, H);
      const inv = ctx.time < invUntil && state === 'play';
      if (inv) {
        g.fillStyle = `rgba(177,108,255,${0.08 + 0.06 * Math.sin(T * 12)})`;
        g.fillRect(0, 0, W, H);
      }
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
        g.fillStyle = U.alpha(c, 0.06 + 0.18 * near * near);
        if (p.side === 'bottom' || p.side === 'top') {
          const y = G.cy + (p.side === 'bottom' ? 1 : -1) * G.hy;
          const x0 = N === 3 ? G.d : 0, x1 = N === 3 ? W - G.d : W;
          g.moveTo(x0, y); g.lineTo(x1, y);
          g.fillRect(x0, p.side === 'bottom' ? y : G.d, x1 - x0, p.side === 'bottom' ? H - G.d - y : y - G.d);
        } else {
          const x = G.cx + (p.side === 'right' ? 1 : -1) * G.hx;
          g.moveTo(x, 0); g.lineTo(x, H - G.d);
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

      const sx = (Math.random() - 0.5) * 8 * shake, sy = (Math.random() - 0.5) * 8 * shake;
      const k = toXY(G, pos.u, pos.v);
      k.x += sx; k.y += sy;
      // ropes
      for (let i = 0; i < N; i++) {
        const a = anchor(G, i);
        const fr = ctx.time < frozen[i];
        const c = fr ? '#bfe9ff' : inv ? '#b16cff' : ctx.players[i].color;
        const dx = a.x - k.x, dy = a.y - k.y, L = Math.hypot(dx, dy) || 1;
        const nx = -dy / L, ny = dx / L;
        const sag = (1 - tension[i]) * Math.min(26, L * 0.08) * Math.sin(T * 2.2 + i * 2);
        const mx = (a.x + k.x) / 2 + nx * sag, my = (a.y + k.y) / 2 + ny * sag;
        g.save();
        g.lineCap = 'round';
        g.strokeStyle = fr ? '#e8f8ff' : '#6b5236';
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
      // tap pulses travelling along the rope
      for (const p of parts) {
        const a = anchor(G, p.i);
        const s = p.inv ? 1 - p.s : p.s;
        const x = U.lerp(k.x, a.x, s), y = U.lerp(k.y, a.y, s);
        g.save();
        g.globalAlpha = 1 - p.s;
        g.fillStyle = p.inv ? '#e2c6ff' : '#fff';
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
      g.shadowBlur = 20 + 40 * flash;
      g.fillStyle = '#f5e6c8';
      g.beginPath(); g.arc(k.x, k.y, KNOT_R * (1 + 0.12 * shake + 0.3 * flash), 0, Math.PI * 2); g.fill();
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
