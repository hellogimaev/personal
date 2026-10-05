registerGame({
  id: 'potato',
  title: 'Горячая картошка',
  emoji: '💣',
  desc: 'Передай бомбу, пока она не взорвалась',
  rules: 'Бомба тикает у одного из игроков, сколько осталось, никто не знает.\nУ кого бомба, тот видит у себя кнопку: жми её, чтобы передать бомбу дальше по кругу.\nКнопка каждый раз появляется в новом месте.\nУ кого бомба взорвётся, теряет жизнь (всего 3).\nПоследний оставшийся побеждает.',
  start(ctx) {
    const N = ctx.n;
    // 3p: push the toast copies further apart so the rotated copies don't overlap
    const say = (text, o = {}) => ctx.toast(text, Object.assign({ offset: N === 3 ? Math.max(90, text.length * 7.5 + 30) : 70 }, o));
    const DEPTH = 0.3;
    const LIVES = 3;
    const lives = ctx.players.map(() => LIVES);
    let holder = U.randInt(0, N - 1);
    let dir = 1;
    let state = 'wait'; // wait | play | boom | done
    let fuseStart = 0, fuseLen = 10, fuseEnd = Infinity;
    let showBtnTimer = null;
    let passes = 0;
    // bomb visuals
    let ang = 0, angTarget = 0, phase = 0, boomT = 0, pass = 0;
    const sparks = [];

    ctx.root.classList.add('g-potato');
    ctx.root.append(U.h('style', null, `
      .g-potato .pz{border-radius:22px;transition:background .2s}
      .g-potato .pz::before{content:'';position:absolute;inset:6px;border-radius:20px;border:3px solid var(--pc);opacity:.22;pointer-events:none}
      .g-potato .pz.hold::before{opacity:0}
      .g-potato .pz.hold{background:rgba(255,90,40,.10);box-shadow:0 0 0 4px var(--pc) inset}
      .g-potato .pz.dead{opacity:.35}
      .g-potato .pz.boom{animation:potBoom .6s}
      @keyframes potBoom{0%{background:rgba(255,200,80,.9)}100%{background:transparent}}
      .g-potato .ph{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;justify-content:center;gap:14px;
        font-weight:800;white-space:nowrap}
      .g-potato .ph .lv{letter-spacing:2px}
      .g-potato .ph .st{color:var(--muted)}
      .g-potato .pz.hold .ph .st{color:var(--pc)}
      .g-potato .pa{position:absolute}
      .g-potato .wait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);
        font-weight:800;font-size:26px;opacity:.6}
      .g-potato .pt{position:absolute;border-radius:50%;background:var(--pc);color:#111;font-weight:900;
        display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05;text-align:center;
        box-shadow:0 0 0 6px rgba(255,255,255,.18),0 8px 30px rgba(0,0,0,.4);animation:potIn .15s ease-out}
      .g-potato .pt .e{font-size:1.5em}
      @keyframes potIn{0%{transform:scale(.4);opacity:.2}100%{transform:scale(1);opacity:1}}
    `));

    const { g } = ctx.canvas();

    const zones = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH, className: 'pz' });
      const lv = U.h('span', { class: 'lv' });
      const st = U.h('span', { class: 'st' });
      const ph = U.h('div', { class: 'ph' }, lv, st);
      const pa = U.h('div', { class: 'pa' });
      const wait = U.h('div', { class: 'wait' }, 'ждите…');
      const pt = U.h('div', { class: 'pt' }, U.h('div', { class: 'e' }, '💣'), U.h('div', null, 'ПЕРЕДАЙ'));
      pa.append(wait);
      z.el.append(ph, pa);
      ctx.tap(pt, () => passOn(p.i));
      return { z, lv, st, ph, pa, wait, pt, bx: 0, by: 0, S: 0 };
    });

    // ----- layout -----
    function geo(zb) {
      const w = zb.z.w, h = zb.z.h, PAD = 12;
      const HH = Math.round(U.clamp(h * 0.17, 30, 46));
      return { w, h, PAD, HH, aw: w - 2 * PAD, ah: h - HH - PAD, S: Math.round(U.clamp(Math.min(h - HH - PAD, w * 0.42) * 0.86, 76, 150)) };
    }
    function layout() {
      zones.forEach((zb, i) => {
        const G = geo(zb);
        zb.ph.style.height = G.HH + 'px';
        zb.ph.style.fontSize = Math.round(G.HH * 0.55) + 'px';
        Object.assign(zb.pa.style, { left: G.PAD + 'px', top: G.HH + 'px', width: G.aw + 'px', height: G.ah + 'px' });
        zb.S = G.S;
        Object.assign(zb.pt.style, { width: G.S + 'px', height: G.S + 'px', fontSize: Math.round(G.S * 0.17) + 'px' });
        if (zb.pt.isConnected) placeBtn(i, true);
      });
    }

    // Screen position of a point given in zone-local coordinates.
    function toScreenPt(zb, lx, ly) {
      const r = zb.z.rect, v = ctx.toScreen(zb.z.i, lx - zb.z.w / 2, ly - zb.z.h / 2);
      return { x: r.x + r.w / 2 + v.x, y: r.y + r.h / 2 + v.y };
    }
    function placeBtn(i, keep) {
      const zb = zones[i], G = geo(zb), S = G.S;
      let x = keep ? zb.bx : 0, y = keep ? zb.by : 0;
      for (let tries = 0; tries < 30; tries++) {
        if (!keep || tries > 0) {
          x = U.rand(0, Math.max(0, G.aw - S));
          y = U.rand(0, Math.max(0, G.ah - S));
          // avoid jumping to almost the same spot
          if (!keep && tries < 15 && Math.hypot(x - zb.bx, y - zb.by) < S * 0.8) continue;
        }
        x = U.clamp(x, 0, Math.max(0, G.aw - S)); y = U.clamp(y, 0, Math.max(0, G.ah - S));
        const c = toScreenPt(zb, G.PAD + x + S / 2, G.HH + y + S / 2);
        if (c.x - S / 2 < 60 && c.y - S / 2 < 60) continue; // under the exit button
        break;
      }
      zb.bx = x; zb.by = y;
      zb.pt.style.left = x + 'px';
      zb.pt.style.top = y + 'px';
    }

    function render() {
      zones.forEach((zb, i) => {
        const dead = lives[i] <= 0;
        zb.lv.textContent = '❤️'.repeat(Math.max(0, lives[i])) + '🖤'.repeat(LIVES - Math.max(0, lives[i]));
        const hold = !dead && i === holder && (state === 'play' || state === 'wait');
        zb.z.el.classList.toggle('hold', hold);
        zb.z.el.classList.toggle('dead', dead);
        zb.st.textContent = hold ? 'бомба у тебя!' : '';
        zb.wait.textContent = dead ? '💀 выбыл' : hold ? 'лови!' : 'ждите…';
        zb.wait.style.display = hold && zb.pt.isConnected ? 'none' : 'flex';
      });
    }

    const alive = () => ctx.players.filter(p => lives[p.i] > 0).map(p => p.i);
    function nextOf(i) {
      for (let k = 1; k <= N; k++) {
        const j = ((i + dir * k) % N + N) % N;
        if (lives[j] > 0) return j;
      }
      return i;
    }
    // angle on screen pointing from center toward a player's edge
    const angleTo = (i) => { const v = ctx.inward(i); return Math.atan2(-v.y, -v.x); };

    function giveTo(i) {
      zones.forEach(zb => zb.pt.remove());
      holder = i;
      angTarget = angleTo(i);
      ctx.cancel(showBtnTimer);
      render();
      showBtnTimer = ctx.after(U.rand(150, 230), () => {
        if (state !== 'play' || holder !== i) return;
        placeBtn(i, false);
        zones[i].pa.append(zones[i].pt);
        render();
      });
    }

    function passOn(i) {
      if (state !== 'play' || i !== holder) return;
      passes++;
      pass = 1;
      if (alive().length > 2 && passes > 2 && Math.random() < 0.12) {
        dir = -dir;
        say('↺ Разворот!', { ms: 900 });
      }
      giveTo(nextOf(i));
    }

    function newRound() {
      state = 'play';
      fuseLen = U.rand(6, 15);
      fuseStart = ctx.time;
      fuseEnd = ctx.time + fuseLen;
      passes = 0;
      if (lives[holder] <= 0) holder = nextOf(holder);
      ang = angTarget = angleTo(holder);
      giveTo(holder);
    }

    function explode() {
      state = 'boom';
      boomT = 1;
      const i = holder;
      zones.forEach(zb => zb.pt.remove());
      lives[i]--;
      const zb = zones[i];
      zb.z.el.classList.remove('boom'); void zb.z.el.offsetWidth; zb.z.el.classList.add('boom');
      for (let k = 0; k < 40; k++) {
        const a = U.rand(0, Math.PI * 2), s = U.rand(120, 520);
        sparks.push({ x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.5, 1) });
      }
      const msg = lives[i] > 0 ? `💥 ${ctx.players[i].name}: −1 ❤️` : `💥 ${ctx.players[i].name} выбывает!`;
      say(msg, { color: ctx.players[i].color, fg: '#111', ms: 1600 });
      render();
      const left = alive();
      if (left.length <= 1) {
        state = 'done';
        ctx.after(1600, () => ctx.end({ winner: left[0], msg: 'Жизни: ' + lives.map((l, k) => `${NAMES[k]} ${Math.max(0, l)}`).join(' · ') }));
        return;
      }
      // the one who exploded starts next (if still in), else the next player
      if (lives[i] <= 0) holder = nextOf(i);
      ctx.after(2000, newRound);
    }

    ctx.loop((dt, t) => {
      if (dt > 0 && state === 'play' && ctx.time >= fuseEnd) explode();
      const prog = state === 'play' ? U.clamp((ctx.time - fuseStart) / 15, 0, 1) : 0; // relative to max fuse: hides real length
      const freq = 1.1 + 5 * Math.pow(prog, 1.4) + (state === 'play' ? 0.4 * Math.sin(t / 700) : 0);
      phase += dt * Math.PI * 2 * freq;
      let da = angTarget - ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      ang += da * Math.min(1, dt * 14 || 0);
      if (dt === 0 && state !== 'play') ang = angTarget;
      pass = Math.max(0, pass - dt * 5);
      boomT = Math.max(0, boomT - dt * 0.9);
      for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.96; s.vy *= 0.96; s.life -= dt; }
      for (let k = sparks.length - 1; k >= 0; k--) if (sparks[k].life <= 0) sparks.splice(k, 1);
      draw(t / 1000, prog);
    });

    function centerXY() {
      // center of the free area between zones
      const d = zones[0].z.h;
      if (N === 2) return { x: ctx.W / 2, y: ctx.H / 2, r: Math.min(ctx.W, ctx.H - 2 * d) };
      return { x: ctx.W / 2, y: (ctx.H - d) / 2, r: Math.min(ctx.W - 2 * d, ctx.H - d) };
    }

    function draw(T, prog) {
      const W = ctx.W, H = ctx.H;
      g.clearRect(0, 0, W, H);
      const C = centerXY();
      const R = U.clamp(C.r * 0.2, 34, 90);
      const pulse = 0.5 + 0.5 * Math.sin(phase);
      const hc = ctx.players[holder].color;
      // glow toward the holder
      if (state === 'play') {
        const v = ctx.inward(holder);
        const ox = C.x - v.x * R * 1.6, oy = C.y - v.y * R * 1.6;
        const gr = g.createRadialGradient(ox, oy, 0, ox, oy, R * 4);
        gr.addColorStop(0, U.alpha(hc, 0.28 + 0.25 * pulse * prog));
        gr.addColorStop(1, U.alpha(hc, 0));
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
      }
      if (state === 'boom' || state === 'done') {
        if (boomT > 0) {
          g.fillStyle = `rgba(255,190,80,${boomT * 0.35})`;
          g.fillRect(0, 0, W, H);
        }
      }
      // bomb
      const bx = C.x + Math.cos(ang) * R * 0.5 * (state === 'play' ? 1 : 0);
      const by = C.y + Math.sin(ang) * R * 0.5 * (state === 'play' ? 1 : 0);
      const scale = (state === 'play' ? 1 + 0.06 * pulse * (0.5 + prog) + 0.15 * pass : 1) * (boomT > 0 ? 1 + (1 - boomT) * 0.6 : 1);
      if (state === 'play' || state === 'wait') {
        g.save();
        g.translate(bx, by);
        g.rotate(ang);
        g.scale(scale, scale);
        // fuse (points along +x = toward holder)
        g.strokeStyle = '#c9a36b';
        g.lineWidth = Math.max(4, R * 0.1);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(R * 0.85, 0);
        g.quadraticCurveTo(R * 1.25, -R * 0.25, R * 1.45, R * 0.05);
        g.stroke();
        // cap
        g.fillStyle = '#555c78';
        g.fillRect(R * 0.72, -R * 0.24, R * 0.26, R * 0.48);
        // body
        const bg = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
        bg.addColorStop(0, '#5a6286');
        bg.addColorStop(1, '#151829');
        g.fillStyle = bg;
        g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
        g.lineWidth = 4;
        g.strokeStyle = U.alpha(hc, 0.6 + 0.4 * pulse);
        g.stroke();
        // spark at the fuse tip
        {
          const sx = R * 1.45, sy = R * 0.05;
          const sr = R * (0.16 + 0.12 * pulse);
          const sg = g.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.2);
          sg.addColorStop(0, '#fff7c2');
          sg.addColorStop(0.4, '#ffb340');
          sg.addColorStop(1, 'rgba(255,90,40,0)');
          g.fillStyle = sg;
          g.beginPath(); g.arc(sx, sy, sr * 2.2, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      }
      // explosion sparks
      for (const s of sparks) {
        g.fillStyle = `rgba(255,${150 + Math.round(100 * s.life)},60,${Math.min(1, s.life * 1.5)})`;
        g.beginPath(); g.arc(C.x + s.x, C.y + s.y, 4 + 6 * s.life, 0, Math.PI * 2); g.fill();
      }
    }

    layout();
    ctx.onResize(layout);
    angTarget = ang = angleTo(holder);
    render();
    ctx.after(0, newRound); // starts when the countdown ends
  },
});
