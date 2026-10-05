registerGame({
  id: 'snakes',
  title: 'Змейки',
  emoji: '🐍',
  desc: 'Не врежься в след и выживи последним',
  rules: 'Каждая змейка ползёт сама и оставляет за собой след.\nДержи ◀ или ▶ в своей зоне, чтобы поворачивать.\nВрезался в любой след или в край поля: выбыл.\nВ следах бывают дырки, в них можно проскочить.\nПоследний выживший выигрывает раунд. До 3 побед.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const WIN = 3;
    const DEPTH = 0.2;
    const BG = '#0f1220';
    const ARW_L = '◀︎', ARW_R = '▶︎';

    ctx.root.classList.add('g-snakes');
    ctx.root.append(U.h('style', null, `
      .g-snakes .zone-inner{display:flex;align-items:stretch;gap:1.6vmin;padding:1.5vmin}
      .g-snakes .cb{flex:1 1 0;max-width:27vmin;border-radius:3vmin;border:.5vmin solid var(--pc);color:var(--pc);
        background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;
        font-size:8vmin;font-weight:900;touch-action:none;transition:transform .07s,background .07s,box-shadow .07s}
      .g-snakes .cb.on{background:var(--pc);color:#0f1220;transform:scale(.95);box-shadow:0 0 3.5vmin var(--pc)}
      .g-snakes .info{flex:1.1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
        color:var(--pc);font-weight:900;text-align:center;pointer-events:none}
      .g-snakes .pips{font-size:5vmin;letter-spacing:.5vmin;line-height:1;white-space:nowrap}
      .g-snakes .st{font-size:2.6vmin;opacity:.85;margin-top:1vmin;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
      .g-snakes .st.dead{opacity:.5}
    `));

    const C = ctx.canvas();

    /* ---------- controls ---------- */
    const allBtns = [];
    function btn(label) {
      const b = U.h('div', { class: 'cb' }, label);
      const ids = new Set();
      b.ids = ids;
      ctx.pointer(b, {
        down: (id) => { ids.add(id); b.classList.add('on'); },
        up: (id) => { ids.delete(id); if (!ids.size) b.classList.remove('on'); },
      });
      allBtns.push(b);
      return b;
    }
    // safety net for lost pointer capture
    const releaseAll = (e) => allBtns.forEach(b => { if (b.ids.delete(e.pointerId) && !b.ids.size) b.classList.remove('on'); });
    window.addEventListener('pointerup', releaseAll);
    window.addEventListener('pointercancel', releaseAll);
    ctx.onCleanup(() => {
      window.removeEventListener('pointerup', releaseAll);
      window.removeEventListener('pointercancel', releaseAll);
    });

    const ui = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH });
      z.el.style.background = `linear-gradient(0deg, ${U.alpha(p.color, .2)}, ${U.alpha(p.color, .05)})`;
      z.el.style.borderTop = `2px solid ${U.alpha(p.color, .6)}`;
      const L = btn(ARW_L), R = btn(ARW_R);
      const pips = U.h('div', { class: 'pips' });
      const st = U.h('div', { class: 'st' }, 'в игре');
      z.el.append(L, U.h('div', { class: 'info' }, pips, st), R);
      return { z, L, R, pips, st };
    });

    /* ---------- field geometry ---------- */
    function say(text, o) {
      const fr = fieldRect();
      return ctx.toast(text, Object.assign({ offset: Math.max(70, Math.min(fr.w, fr.h) * 0.27) }, o || {}));
    }
    function fieldRect() {
      const d = Math.round(DEPTH * Math.min(ctx.W, ctx.H));
      const sides = ctx.players.map(p => p.side);
      const l = sides.includes('left') ? d : 0, r = sides.includes('right') ? d : 0;
      const t = sides.includes('top') ? d : 0, b = sides.includes('bottom') ? d : 0;
      const m = 8;
      // keep the core exit button (2p: middle of left edge, 3p: middle of top edge) off the field
      const ex = 46;
      const exL = ctx.n === 2 ? ex : 0, exT = ctx.n === 2 ? 0 : ex;
      return { x: l + m + exL, y: t + m + exT, w: Math.max(120, ctx.W - l - r - 2 * m - exL), h: Math.max(120, ctx.H - t - b - 2 * m - exT) };
    }
    let FW = 600, FH = 400, S = 500; // logical field
    let view = { s: 1, ox: 0, oy: 0 };
    function updView() {
      const fr = fieldRect();
      const s = Math.min(fr.w / FW, fr.h / FH);
      view = { s, ox: fr.x + (fr.w - FW * s) / 2, oy: fr.y + (fr.h - FH * s) / 2 };
    }
    ctx.onResize(updView);

    /* ---------- state ---------- */
    const wins = ctx.players.map(() => 0);
    let round = 0;
    let state = 'play'; // ready | play | over
    let roundT = 0;
    let TW = 7, SPEED = 110, TURN = 3.1, LAG = 12;
    const GC = 2; // collision grid cell (logical units)
    let gw = 0, gh = 0, grid = null;
    let off = null, og = null, OK = 2;
    let snakes = [];
    let parts = [];

    function stamp(x, y, r) {
      const x0 = Math.max(0, Math.floor((x - r) / GC)), x1 = Math.min(gw - 1, Math.floor((x + r) / GC));
      const y0 = Math.max(0, Math.floor((y - r) / GC)), y1 = Math.min(gh - 1, Math.floor((y + r) / GC));
      const r2 = r * r;
      for (let cy = y0; cy <= y1; cy++) {
        const dy = (cy + .5) * GC - y;
        for (let cx = x0; cx <= x1; cx++) {
          const dx = (cx + .5) * GC - x;
          if (dx * dx + dy * dy <= r2) grid[cy * gw + cx] = 1;
        }
      }
    }
    function occ(x, y) {
      if (x < 0 || y < 0 || x >= FW || y >= FH) return true;
      return grid[Math.floor(y / GC) * gw + Math.floor(x / GC)] === 1;
    }

    function newRound() {
      round++;
      const fr = fieldRect();
      FW = Math.round(fr.w); FH = Math.round(fr.h);
      S = Math.sqrt(FW * FH);
      updView();
      TW = Math.max(5, S * 0.0105);
      SPEED = S * 0.15;
      TURN = 3.1;
      LAG = TW * 1.7;
      gw = Math.ceil(FW / GC); gh = Math.ceil(FH / GC);
      grid = new Uint8Array(gw * gh);
      OK = Math.min(2, Math.sqrt(4e6 / (FW * FH)));
      if (!off) { off = document.createElement('canvas'); og = off.getContext('2d'); }
      off.width = Math.round(FW * OK); off.height = Math.round(FH * OK);
      og.setTransform(OK, 0, 0, OK, 0, 0);
      og.clearRect(0, 0, FW, FH);
      og.lineCap = 'round'; og.lineJoin = 'round';
      parts = [];
      roundT = 0;

      const edge = Math.max(TW * 6, Math.min(FW, FH) * 0.1);
      snakes = ctx.players.map(p => {
        const v = ctx.inward(p.i);
        let x, y;
        const jitter = U.rand(-0.18, 0.18);
        if (p.side === 'bottom') { x = FW * (0.5 + jitter); y = FH - edge; }
        else if (p.side === 'top') { x = FW * (0.5 + jitter); y = edge; }
        else if (p.side === 'left') { x = edge; y = FH * (0.5 + jitter); }
        else { x = FW - edge; y = FH * (0.5 + jitter); }
        const a = Math.atan2(v.y, v.x) + U.rand(-0.35, 0.35);
        return {
          i: p.i, color: p.color, x, y, a, alive: true, pen: false,
          q: [], dist: 0, untilGap: S * U.rand(0.25, 0.55), gapLeft: 0, deadAt: 0,
        };
      });
      ui.forEach(u => { u.st.textContent = 'в игре'; u.st.classList.remove('dead'); });
      renderUI();
      if (round > 1) {
        state = 'ready';
        say(`Раунд ${round}`, { ms: 1100, size: 30 });
        ctx.after(1300, () => {
          state = 'play';
          say('Вперёд!', { ms: 700, color: '#3ddc97', fg: '#0f1220' });
        });
      } else {
        state = 'play';
      }
    }

    function renderUI() {
      ui.forEach((u, i) => {
        let s = '';
        for (let k = 0; k < WIN; k++) s += k < wins[i] ? '●' : '○';
        u.pips.textContent = s;
      });
    }

    function kill(s) {
      if (!s.alive) return;
      s.alive = false;
      s.deadAt = ctx.time;
      for (let k = 0; k < 28; k++) {
        const a = Math.random() * Math.PI * 2, v = U.rand(20, 120) * S / 700;
        parts.push({ x: s.x, y: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(.5, 1.1), t: 0, c: s.color });
      }
      const u = ui[s.i];
      u.st.textContent = 'выбыл';
      u.st.classList.add('dead');
    }

    function stepSnake(s, dt) {
      const L = ui[s.i].L.ids.size > 0, R = ui[s.i].R.ids.size > 0;
      const turn = (R ? 1 : 0) - (L ? 1 : 0);
      if (state === 'ready') { s.a += turn * TURN * 0.6 * dt; return; }
      const speed = SPEED * (1 + Math.min(0.5, roundT * 0.012));
      const dist = speed * dt;
      const steps = Math.max(1, Math.ceil(dist / 1));
      const ds = dist / steps;
      og.strokeStyle = s.color;
      og.lineWidth = TW;
      og.shadowColor = s.color;
      og.shadowBlur = 7 * OK;
      og.beginPath();
      let drew = false;
      if (s.pen) og.moveTo(s.x, s.y);
      for (let k = 0; k < steps; k++) {
        s.a += turn * TURN * dt / steps;
        const ca = Math.cos(s.a), sa = Math.sin(s.a);
        const px = s.x, py = s.y;
        s.x += ca * ds; s.y += sa * ds;
        s.dist += ds;
        // gaps
        let gap = false;
        if (s.gapLeft > 0) { s.gapLeft -= ds; gap = true; if (s.gapLeft <= 0) s.untilGap = S * U.rand(0.22, 0.6); }
        else { s.untilGap -= ds; if (s.untilGap <= 0) s.gapLeft = TW * 4.2; }
        if (gap) { s.pen = false; }
        else {
          if (!s.pen) { og.moveTo(px, py); s.pen = true; }
          og.lineTo(s.x, s.y); drew = true;
        }
        s.q.push({ x: s.x, y: s.y, d: s.dist, gap });
        while (s.q.length && s.q[0].d < s.dist - LAG) {
          const e = s.q.shift();
          if (!e.gap) stamp(e.x, e.y, TW / 2);
        }
        // collision: front points
        const r = TW / 2;
        let hit = false;
        if (s.x < r || s.y < r || s.x > FW - r || s.y > FH - r) hit = true;
        if (!hit) {
          for (const off2 of [0, -0.75, 0.75]) {
            const fx = s.x + Math.cos(s.a + off2) * (r + 0.7), fy = s.y + Math.sin(s.a + off2) * (r + 0.7);
            if (occ(fx, fy)) { hit = true; break; }
          }
        }
        if (!hit) {
          // fresh (not yet stamped) trails of other snakes
          const fx = s.x + ca * (r + 0.7), fy = s.y + sa * (r + 0.7);
          for (const o of snakes) {
            if (o === s) continue;
            for (const e of o.q) {
              if (e.gap) continue;
              const dx = e.x - fx, dy = e.y - fy;
              if (dx * dx + dy * dy < r * r) { hit = true; break; }
            }
            if (hit) break;
          }
        }
        if (hit) { if (drew) og.stroke(); kill(s); return; }
      }
      if (drew) og.stroke();
    }

    function endRound() {
      state = 'over';
      const alive = snakes.filter(s => s.alive);
      if (alive.length === 1) {
        const w = alive[0].i;
        wins[w]++;
        renderUI();
        ui[w].st.textContent = 'раунд твой!';
        const p = ctx.players[w];
        if (wins[w] >= WIN) {
          say(`${p.name} побеждает!`, { color: p.color, fg: '#111', ms: 1500 });
          ctx.after(1500, () => ctx.end({ winner: w, scores: wins.slice() }));
          return;
        }
        say(`Раунд: ${p.name}`, { color: p.color, fg: '#111', ms: 1500 });
      } else {
        say('Ничья в раунде', { ms: 1500 });
      }
      ctx.after(1900, newRound);
    }

    ctx.loop((dt) => {
      if (dt > 0) {
        if (state !== 'over') roundT += dt;
        if (state === 'play' || state === 'ready') {
          for (const s of snakes) if (s.alive) stepSnake(s, dt);
          if (state === 'play' && snakes.filter(s => s.alive).length <= 1) endRound();
        }
        for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
        parts = parts.filter(p => p.t < p.life);
      }
      draw();
    });

    function draw() {
      const g = C.g, dpr = C.dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = BG;
      g.fillRect(0, 0, ctx.W, ctx.H);
      const { s, ox, oy } = view;
      g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
      // field
      g.fillStyle = '#141832';
      g.fillRect(0, 0, FW, FH);
      g.save();
      g.strokeStyle = '#3a4580';
      g.lineWidth = 3;
      g.shadowColor = '#6c7cff';
      g.shadowBlur = 10;
      g.strokeRect(-1.5, -1.5, FW + 3, FH + 3);
      g.restore();
      // faint grid
      g.strokeStyle = 'rgba(255,255,255,.035)';
      g.lineWidth = 1;
      g.beginPath();
      const step = S / 12;
      for (let x = step; x < FW; x += step) { g.moveTo(x, 0); g.lineTo(x, FH); }
      for (let y = step; y < FH; y += step) { g.moveTo(0, y); g.lineTo(FW, y); }
      g.stroke();
      if (off) g.drawImage(off, 0, 0, FW, FH);
      // heads
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 160);
      for (const sn of snakes) {
        if (sn.alive) {
          g.save();
          g.shadowColor = sn.color;
          g.shadowBlur = 16;
          g.fillStyle = sn.color;
          g.beginPath(); g.arc(sn.x, sn.y, TW * 1.2, 0, Math.PI * 2); g.fill();
          g.shadowBlur = 0;
          g.fillStyle = '#fff';
          g.beginPath(); g.arc(sn.x, sn.y, TW * 0.5, 0, Math.PI * 2); g.fill();
          g.restore();
          if (state === 'ready' || ctx.paused || roundT < 1.2) {
            // heading arrow + ring
            const L = TW * 6, ca = Math.cos(sn.a), sa = Math.sin(sn.a);
            g.save();
            g.strokeStyle = U.alpha(sn.color, 0.5 + 0.4 * pulse);
            g.fillStyle = g.strokeStyle;
            g.lineWidth = TW * 0.5;
            g.beginPath(); g.arc(sn.x, sn.y, TW * (2.2 + pulse), 0, Math.PI * 2); g.stroke();
            const tx = sn.x + ca * L, ty = sn.y + sa * L;
            g.beginPath(); g.moveTo(sn.x + ca * TW * 3.5, sn.y + sa * TW * 3.5); g.lineTo(tx, ty); g.stroke();
            g.beginPath();
            g.moveTo(tx + ca * TW * 1.6, ty + sa * TW * 1.6);
            g.lineTo(tx - sa * TW * 1.1, ty + ca * TW * 1.1);
            g.lineTo(tx + sa * TW * 1.1, ty - ca * TW * 1.1);
            g.closePath(); g.fill();
            g.restore();
          }
        } else {
          // dead marker
          g.save();
          g.globalAlpha = 0.7;
          g.strokeStyle = '#fff';
          g.lineWidth = TW * 0.45;
          const r = TW * 1.1;
          g.beginPath();
          g.moveTo(sn.x - r, sn.y - r); g.lineTo(sn.x + r, sn.y + r);
          g.moveTo(sn.x + r, sn.y - r); g.lineTo(sn.x - r, sn.y + r);
          g.stroke();
          g.restore();
        }
      }
      // particles
      for (const p of parts) {
        const k = 1 - p.t / p.life;
        g.globalAlpha = k;
        g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, TW * 0.5 * (0.4 + k), 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }

    newRound();
  },
});
