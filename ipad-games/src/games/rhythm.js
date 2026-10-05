registerGame({
  id: 'rhythm',
  title: 'Ритм',
  emoji: '🎵',
  desc: 'Жми в такт: ноты летят к тебе по трём дорожкам',
  rules: 'У каждого три дорожки от центра к своему краю и три кнопки.\nНоты летят ко всем одновременно, по одному ритму.\nЖми кнопку дорожки, когда нота на кольце.\nТочно: +3, почти: +1, мимо: 0 и комбо сгорает.\nКомбо увеличивает множитель очков (до ×4).\nЗвука нет: следи за пульсом фона. Игра около минуты.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const TRAVEL = 1.8;       // seconds from center to hit line
    const T0 = 2.2;           // first note time
    const SONG_END = 58.5;    // last possible note
    const PERFECT = 0.075, GOOD = 0.16, LATE = 0.3;
    const bpm = U.randInt(110, 140);
    const beat = 60 / bpm;
    const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';

    /* ---------- shared pattern ---------- */
    // 8 eighth-note slots per bar; denser templates as the song goes on
    const TPL = [
      [[1, 0, 0, 0, 1, 0, 0, 0], [1, 0, 0, 0, 1, 0, 1, 0], [1, 0, 1, 0, 1, 0, 0, 0]],
      [[1, 0, 1, 0, 1, 0, 1, 0], [1, 0, 1, 0, 1, 0, 0, 0], [1, 0, 0, 1, 1, 0, 1, 0], [1, 0, 1, 0, 0, 0, 1, 0]],
      [[1, 0, 1, 1, 1, 0, 1, 0], [1, 0, 1, 0, 1, 1, 1, 0], [1, 1, 1, 0, 1, 0, 1, 0], [1, 0, 1, 0, 1, 0, 1, 1]],
      [[1, 1, 1, 0, 1, 1, 1, 0], [1, 0, 1, 1, 1, 0, 1, 1], [1, 1, 1, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1, 1, 0]],
    ];
    const pattern = [];
    {
      let prevLane = 1, prevT = -9;
      for (let m = 0; ; m++) {
        const mt = T0 + m * 4 * beat;
        if (mt > SONG_END) break;
        const level = Math.min(3, Math.floor((mt / SONG_END) * 4));
        const tpl = U.pick(TPL[level]);
        for (let s = 0; s < 8; s++) {
          if (!tpl[s]) continue;
          const t = mt + s * beat / 2;
          if (t > SONG_END) break;
          let lane;
          if (t - prevT < beat * 0.75) lane = (prevLane + U.randInt(1, 2)) % 3;
          else lane = U.randInt(0, 2);
          pattern.push({ t, lane });
          // chords on strong beats later in the song
          if (level >= 2 && s % 4 === 0 && Math.random() < (level === 3 ? 0.4 : 0.25)) {
            pattern.push({ t, lane: (lane + U.randInt(1, 2)) % 3 });
          }
          prevLane = lane; prevT = t;
        }
      }
    }
    const lastT = pattern[pattern.length - 1].t;
    // the same pattern for every player
    const notes = ctx.players.map(() => pattern.map(n => ({ t: n.t, lane: n.lane, state: 0 }))); // 0 pending, 1 hit, 2 missed
    const st = ctx.players.map(() => ({ score: 0, combo: 0, best: 0, perfect: 0 }));
    const fx = []; // judgement labels
    const press = ctx.players.map(() => [0, 0, 0]); // flash per lane
    const mult = (c) => Math.min(4, 1 + Math.floor(c / 10));

    ctx.root.classList.add('g-rhythm');
    ctx.root.append(U.h('style', null, `
      .g-rhythm .rz{position:absolute;inset:0}
      .g-rhythm .rb{position:absolute;top:10px;bottom:42px;border-radius:18px;border:3px solid var(--pc);
        background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;transition:background .08s}
      .g-rhythm .rb::after{content:'';width:34%;max-width:46px;aspect-ratio:1;border-radius:50%;background:var(--pc);opacity:.55}
      .g-rhythm .rb.on{background:var(--pc)}
      .g-rhythm .rb.on::after{background:#fff;opacity:.9}
      .g-rhythm .info{position:absolute;left:0;right:0;bottom:0;height:40px;display:flex;align-items:center;justify-content:center;
        gap:16px;font-weight:800;font-size:19px;white-space:nowrap;pointer-events:none}
      .g-rhythm .info b{color:var(--pc);font-size:26px;font-variant-numeric:tabular-nums}
      .g-rhythm .info .cb{color:var(--muted);font-variant-numeric:tabular-nums}
      .g-rhythm .info .mx{background:var(--pc);color:#111;border-radius:10px;padding:1px 8px;font-size:18px}
      .g-rhythm .info .mx.x1{background:rgba(255,255,255,.12);color:var(--muted)}
      .g-rhythm .info .tm{color:var(--muted);font-variant-numeric:tabular-nums}
    `));

    const { g } = ctx.canvas();
    let lastFrameT = performance.now();

    const zones = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: 0.2 });
      z.el.style.background = `linear-gradient(to bottom, ${U.alpha(p.color, 0.16)}, ${U.alpha(p.color, 0.04)})`;
      const box = U.h('div', { class: 'rz' });
      const btns = [0, 1, 2].map(k => {
        const b = U.h('div', { class: 'rb' });
        ctx.tap(b, (e) => hit(p.i, k, e));
        box.append(b);
        return b;
      });
      const sc = U.h('b', null, '0');
      const cb = U.h('span', { class: 'cb' }, 'комбо 0');
      const mx = U.h('span', { class: 'mx x1' }, '×1');
      const tm = U.h('span', { class: 'tm' }, '');
      box.append(U.h('div', { class: 'info' }, U.h('span', null, 'очки ', sc), cb, mx, tm));
      z.el.append(box);
      return { z, btns, sc, cb, mx, tm };
    });

    /* ---------- geometry ---------- */
    function field() {
      let x0 = 0, y0 = 0, x1 = ctx.W, y1 = ctx.H;
      ctx.players.forEach((p, i) => {
        const r = zones[i].z.rect;
        if (p.side === 'left') x0 = r.x + r.w;
        if (p.side === 'right') x1 = r.x;
        if (p.side === 'top') y0 = r.y + r.h;
        if (p.side === 'bottom') y1 = r.y;
      });
      return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    }
    // Lane block of player i along their edge: centered on the free field (not on the zone),
    // kept clear of the exit button in the top-left corner.
    function block(i, F) {
      const p = ctx.players[i], horiz = p.side === 'bottom' || p.side === 'top';
      let a0 = horiz ? F.x0 : F.y0, a1 = horiz ? F.x1 : F.y1;
      let lw = Math.min(190, (a1 - a0 - 16) / 3);
      if ((p.side === 'top' || p.side === 'left') && (a0 + a1) / 2 - 1.5 * lw < 60) {
        a0 = Math.max(a0, 60);
        lw = Math.min(190, (a1 - a0 - 16) / 3);
      }
      const r = zones[i].z.rect;
      const zc = horiz ? r.x + r.w / 2 : r.y + r.h / 2;
      const d = (a0 + a1) / 2 - zc; // screen offset along the edge
      const shift = (p.side === 'bottom' || p.side === 'left') ? d : -d; // in zone-local x
      return { lw, shift };
    }
    function layout() {
      const F = field();
      zones.forEach((zz, i) => {
        const { lw, shift } = block(i, F), w = zz.z.w;
        zz.btns.forEach((b, k) => {
          b.style.left = (w / 2 + shift + (k - 1) * lw - (lw - 10) / 2) + 'px';
          b.style.width = (lw - 10) + 'px';
        });
      });
    }
    layout();
    ctx.onResize(layout);

    // Per player: lane start points (near center), hit points, lane width, note radius
    function geom(i, F) {
      const r = zones[i].z.rect, v = ctx.inward(i);
      const { lw, shift } = block(i, F);
      const nr = Math.min(lw * 0.3, 36);
      const sh = ctx.toScreen(i, shift, 0);
      // inner edge of the zone, at the middle of the lane block
      const ex = r.x + r.w / 2 + v.x * r.d / 2 + sh.x, ey = r.y + r.h / 2 + v.y * r.d / 2 + sh.y;
      const hx = ex + v.x * (nr + 8), hy = ey + v.y * (nr + 8);
      const sx = F.cx - v.x * 34, sy = F.cy - v.y * 34;
      const lanes = [0, 1, 2].map(k => {
        const a = ctx.toScreen(i, (k - 1) * lw, 0);
        const b = ctx.toScreen(i, (k - 1) * lw * 0.13, 0);
        return { hx: hx + a.x, hy: hy + a.y, sx: sx + b.x, sy: sy + b.y, ex: ex + a.x, ey: ey + a.y };
      });
      const half = ctx.toScreen(i, lw / 2, 0), halfS = ctx.toScreen(i, lw * 0.13 / 2, 0);
      return { lanes, lw, nr, half, halfS, v };
    }

    /* ---------- input / judging ---------- */
    function judge(i, k, kind, n) {
      const s = st[i];
      if (n) n.state = kind === 'miss' ? 2 : 1;
      let pts = 0;
      if (kind === 'perfect') { pts = 3 * mult(s.combo); s.combo++; s.perfect++; }
      else if (kind === 'good') { pts = 1 * mult(s.combo); s.combo++; }
      else s.combo = 0;
      s.best = Math.max(s.best, s.combo);
      s.score += pts;
      for (let q = fx.length - 1; q >= 0; q--) if (fx[q].i === i && fx[q].k === k) fx.splice(q, 1);
      fx.push({ i, k, kind, pts, life: 1 });
      updateInfo(i);
    }

    function hit(i, k, e) {
      if (over) return;
      press[i][k] = 1;
      const b = zones[i].btns[k];
      b.classList.add('on');
      setTimeout(() => b.classList.remove('on'), 110);
      let tt = ctx.time;
      if (e && e.timeStamp) tt += U.clamp((e.timeStamp - lastFrameT) / 1000, 0, 0.05);
      let best = null, bd = Infinity;
      for (const n of notes[i]) {
        if (n.state || n.lane !== k) continue;
        const d = Math.abs(n.t - tt);
        if (d < bd) { bd = d; best = n; }
        if (n.t > tt + 1) break;
      }
      if (best && bd <= PERFECT) judge(i, k, 'perfect', best);
      else if (best && bd <= GOOD) judge(i, k, 'good', best);
      else if (best && bd <= LATE) judge(i, k, 'miss', best);
      else judge(i, k, 'miss', null); // stray tap: combo resets
    }

    function updateInfo(i) {
      const s = st[i], zz = zones[i];
      zz.sc.textContent = s.score;
      zz.cb.textContent = 'комбо ' + s.combo;
      const m = mult(s.combo);
      zz.mx.textContent = '×' + m;
      zz.mx.classList.toggle('x1', m === 1);
    }

    let over = false, lastSec = -1;
    function finish() {
      if (over) return;
      over = true;
      ctx.after(700, () => {
        const scores = st.map(s => s.score);
        const max = Math.max(...scores);
        let winners = ctx.players.map(p => p.i).filter(i => scores[i] === max);
        if (winners.length === ctx.n) winners = [];
        const bestCombo = Math.max(...st.map(s => s.best));
        ctx.end({ winners, scores, msg: `${bpm} BPM · лучшее комбо: ${bestCombo}` });
      });
    }

    const LABEL = { perfect: 'Точно!', good: 'Хорошо', miss: 'Мимо' };
    const LCOL = { perfect: '#3ddc97', good: '#ffffff', miss: '#ff4d6d' };

    /* ---------- loop ---------- */
    ctx.loop((dt, t) => {
      lastFrameT = t;
      const now = ctx.time;
      const W = ctx.W, H = ctx.H;
      const F = field();

      // auto-miss notes that went by
      if (!over) {
        ctx.players.forEach(p => {
          for (const n of notes[p.i]) {
            if (n.t > now) break;
            if (!n.state && now - n.t > LATE) judge(p.i, n.lane, 'miss', n);
          }
        });
        if (now > lastT + 0.8) finish();
      }

      const remain = Math.max(0, Math.ceil(lastT + 0.8 - now));
      if (remain !== lastSec) {
        lastSec = remain;
        zones.forEach(zz => { zz.tm.textContent = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`; });
      }

      // beat pulse (also during the intro)
      const since = ((now - T0) % beat + beat) % beat;
      const beatIdx = Math.round((now - since - T0) / beat);
      const strong = ((beatIdx % 4) + 4) % 4 === 0;
      const pulse = Math.exp(-since / beat * 4.5) * (strong ? 1 : 0.6);

      g.clearRect(0, 0, W, H);
      g.fillStyle = '#0f1220';
      g.fillRect(0, 0, W, H);
      const R = Math.hypot(W, H) * 0.55;
      const grd = g.createRadialGradient(F.cx, F.cy, 0, F.cx, F.cy, R);
      grd.addColorStop(0, `rgba(150,120,255,${0.10 + 0.22 * pulse})`);
      grd.addColorStop(0.5, `rgba(90,80,200,${0.04 + 0.10 * pulse})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      ctx.players.forEach(p => {
        const G = geom(p.i, F);
        const col = p.color;
        // lanes
        G.lanes.forEach((L, k) => {
          g.beginPath();
          g.moveTo(L.sx - G.halfS.x, L.sy - G.halfS.y);
          g.lineTo(L.sx + G.halfS.x, L.sy + G.halfS.y);
          g.lineTo(L.ex + G.half.x, L.ey + G.half.y);
          g.lineTo(L.ex - G.half.x, L.ey - G.half.y);
          g.closePath();
          press[p.i][k] = Math.max(0, press[p.i][k] - dt * 6);
          g.fillStyle = U.alpha(col, (k % 2 ? 0.07 : 0.11) + press[p.i][k] * 0.25);
          g.fill();
          g.strokeStyle = U.alpha(col, 0.25); g.lineWidth = 1.5; g.stroke();
        });
        // beat grid lines travelling down the lanes
        for (let b = Math.ceil((now - T0) / beat); ; b++) {
          const tb = T0 + b * beat;
          if (tb > now + TRAVEL) break;
          if (tb < now) continue;
          const f = 1 - (tb - now) / TRAVEL;
          const a = G.lanes[0], c = G.lanes[2];
          const x1 = U.lerp(a.sx - G.halfS.x, a.hx - G.half.x, f), y1 = U.lerp(a.sy - G.halfS.y, a.hy - G.half.y, f);
          const x2 = U.lerp(c.sx + G.halfS.x, c.hx + G.half.x, f), y2 = U.lerp(c.sy + G.halfS.y, c.hy + G.half.y, f);
          g.strokeStyle = `rgba(255,255,255,${(((b % 4) + 4) % 4 === 0 ? 0.16 : 0.07) * f})`;
          g.lineWidth = ((b % 4) + 4) % 4 === 0 ? 3 : 1.5;
          g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        }
        // hit rings
        G.lanes.forEach((L, k) => {
          g.beginPath();
          g.arc(L.hx, L.hy, G.nr + 4 + pulse * 5, 0, Math.PI * 2);
          g.lineWidth = 4 + pulse * 3;
          g.strokeStyle = U.alpha(col, 0.55 + 0.45 * Math.max(pulse, press[p.i][k]));
          g.stroke();
          g.fillStyle = U.alpha(col, 0.08 + press[p.i][k] * 0.35);
          g.fill();
        });
        // notes
        for (const n of notes[p.i]) {
          if (n.t - now > TRAVEL) break;
          if (n.state === 1) continue;
          const f = 1 - (n.t - now) / TRAVEL;
          if (f > 1.25) continue;
          const L = G.lanes[n.lane];
          const x = U.lerp(L.sx, L.hx, f), y = U.lerp(L.sy, L.hy, f);
          const r = G.nr * U.lerp(0.3, 1, Math.min(1, f));
          let a = n.state === 2 ? Math.max(0, 1 - (f - 1) * 5) * 0.5 : 1;
          if (f < 0.08) a *= f / 0.08;
          g.globalAlpha = a;
          g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
          g.fillStyle = n.state === 2 ? '#555b78' : col;
          g.fill();
          g.lineWidth = Math.max(2, r * 0.16); g.strokeStyle = '#fff'; g.stroke();
          g.beginPath(); g.arc(x, y, r * 0.38, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
          g.globalAlpha = 1;
        }
      });

      // center metronome
      g.beginPath();
      g.arc(F.cx, F.cy, 16 + pulse * 12, 0, Math.PI * 2);
      g.fillStyle = `rgba(255,255,255,${0.25 + 0.6 * pulse})`;
      g.fill();

      // judgement labels, facing their player, just above the hit rings
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const f of fx) {
        if (dt > 0) f.life -= dt * 1.8;
        if (f.life <= 0) continue;
        const G = geom(f.i, F), L = G.lanes[f.k];
        const off = G.nr * 2 + 14 + (1 - f.life) * 24;
        g.save();
        g.globalAlpha = Math.min(1, f.life * 2);
        ctx.facing(g, f.i, L.hx + G.v.x * off, L.hy + G.v.y * off);
        g.font = `900 ${f.kind === 'perfect' ? 26 : 22}px ${FONT}`;
        const txt = LABEL[f.kind] + (f.pts ? ` +${f.pts}` : '');
        g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(txt, 0, 0);
        g.fillStyle = LCOL[f.kind]; g.fillText(txt, 0, 0);
        g.restore();
      }
      for (let k = fx.length - 1; k >= 0; k--) if (fx[k].life <= 0) fx.splice(k, 1);
    });
  },
});
