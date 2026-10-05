registerGame({
  id: 'rhythm',
  title: 'Ритм',
  emoji: '🎵',
  desc: 'Жми в такт, лови золотые ноты и вредничай',
  rules: 'У каждого три дорожки и три кнопки. Ноты летят ко всем одновременно, по одному ритму.\nЖми кнопку дорожки, когда нота на кольце: точно +3, почти +1, мимо: комбо сгорает.\nДлинные ноты: держи кнопку до конца хвоста, бонус +4.\nКомбо даёт множитель до ×3. Комбо 15: 🔥 FEVER, очки ×2.\n8 точных подряд: 🛡️ щит спасает комбо от одного промаха.\n⭐ Золотая нота: +8 и пакость соперникам:\n👻 Призраки (ноты пропадают), ⚡ Разгон (ноты быстрее), 🌪️ Тряска.\nОтстающему: 🆘 очки ×2. Последние 12 секунд: 🎆 всё ×2.\nЗвука нет: следи за пульсом фона.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const BASE_TRAVEL = 1.8;
    const T0 = 2.2;
    const SONG_END = 58.5;
    const PERFECT = 0.075, GOOD = 0.16, LATE = 0.3;
    const bpm = U.randInt(110, 140);
    const beat = 60 / bpm;
    const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    const n = ctx.n;

    /* ---------- shared pattern ---------- */
    const TPL = [
      [[1, 0, 0, 0, 1, 0, 0, 0], [1, 0, 0, 0, 1, 0, 1, 0], [1, 0, 1, 0, 1, 0, 0, 0]],
      [[1, 0, 1, 0, 1, 0, 1, 0], [1, 0, 1, 0, 1, 0, 0, 0], [1, 0, 0, 1, 1, 0, 1, 0], [1, 0, 1, 0, 0, 0, 1, 0]],
      [[1, 0, 1, 1, 1, 0, 1, 0], [1, 0, 1, 0, 1, 1, 1, 0], [1, 1, 1, 0, 1, 0, 1, 0], [1, 0, 1, 0, 1, 0, 1, 1]],
      [[1, 1, 1, 0, 1, 1, 1, 0], [1, 0, 1, 1, 1, 0, 1, 1], [1, 1, 1, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1, 1, 0]],
    ];
    let pattern = [];
    {
      let prevLane = 1, prevT = -9;
      for (let m = 0; ; m++) {
        const mt = T0 + m * 4 * beat;
        if (mt > SONG_END) break;
        const level = Math.min(3, Math.floor((mt / SONG_END) * 4));
        const tpl = U.pick(TPL[level]);
        const holdBar = level >= 1 && m % 2 === 1 && Math.random() < 0.55;
        for (let s = 0; s < 8; s++) {
          if (!tpl[s] && !(holdBar && s === 0)) continue;
          const t = mt + s * beat / 2;
          if (t > SONG_END) break;
          let lane;
          if (t - prevT < beat * 0.75) lane = (prevLane + U.randInt(1, 2)) % 3;
          else lane = U.randInt(0, 2);
          const note = { t, lane, dur: 0, gold: false };
          if (holdBar && s === 0) note.dur = beat * (level >= 2 && Math.random() < 0.5 ? 3 : 2);
          pattern.push(note);
          if (!note.dur && level >= 2 && s % 4 === 0 && Math.random() < (level === 3 ? 0.4 : 0.25)) {
            pattern.push({ t, lane: (lane + U.randInt(1, 2)) % 3, dur: 0, gold: false });
          }
          prevLane = lane; prevT = t;
        }
      }
      // no other notes in a lane while it holds a long note
      const holds = pattern.filter(p => p.dur);
      pattern = pattern.filter(p => !holds.some(h => h !== p && h.lane === p.lane && p.t > h.t - 0.01 && p.t <= h.t + h.dur + beat * 0.45));
      pattern.sort((a, b) => a.t - b.t);
      // golden notes: about one every 9 seconds, plain single notes only
      let nextGold = 7;
      for (const p of pattern) {
        if (p.t >= nextGold && !p.dur && p.t < SONG_END - 4 && !pattern.some(q => q !== p && Math.abs(q.t - p.t) < 0.01)) {
          p.gold = true; nextGold = p.t + U.rand(8, 10.5);
        }
      }
    }
    const lastT = Math.max(...pattern.map(p => p.t + p.dur));
    const FINAL_AT = lastT - 12;
    const notes = ctx.players.map(() => pattern.map(p => ({ t: p.t, lane: p.lane, dur: p.dur, gold: p.gold, state: 0, holding: false, tick: 0 })));
    const st = ctx.players.map(() => ({
      score: 0, combo: 0, best: 0, perfRun: 0, shield: false, fever: false,
      ghost: 0, speed: 0, shake: 0, boost: 0, travel: BASE_TRAVEL,
    }));
    ctx._dbg = { notes, st }; // for automated tests
    const fx = [];      // judgement labels
    const banners = []; // per-player announcements on the canvas
    let parts = [];
    const press = ctx.players.map(() => [0, 0, 0]);
    const held = ctx.players.map(() => [new Set(), new Set(), new Set()]);
    const comboMult = (c) => Math.min(3, 1 + Math.floor(c / 10));
    const finalOn = () => ctx.time >= FINAL_AT;
    const mult = (i) => comboMult(st[i].combo) * (st[i].fever ? 2 : 1) * (finalOn() ? 2 : 1) * (st[i].boost > 0 ? 2 : 1);

    ctx.root.classList.add('g-rhythm');
    ctx.root.append(U.h('style', null, `
      .g-rhythm .rz{position:absolute;inset:0}
      .g-rhythm .rb{position:absolute;top:10px;bottom:42px;border-radius:18px;border:3px solid var(--pc);
        background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;transition:background .08s}
      .g-rhythm .rb::after{content:'';width:34%;max-width:46px;aspect-ratio:1;border-radius:50%;background:var(--pc);opacity:.55}
      .g-rhythm .rb.on{background:var(--pc)}
      .g-rhythm .rb.on::after{background:#fff;opacity:.9}
      .g-rhythm .rz.fever .rb{box-shadow:0 0 22px 4px var(--pc)}
      .g-rhythm .info{position:absolute;left:0;right:0;bottom:0;height:40px;display:flex;align-items:center;justify-content:center;
        gap:12px;font-weight:800;font-size:19px;white-space:nowrap;pointer-events:none}
      .g-rhythm .info b{color:var(--pc);font-size:26px;font-variant-numeric:tabular-nums}
      .g-rhythm .info .cb{color:var(--muted);font-variant-numeric:tabular-nums}
      .g-rhythm .info .mx{background:var(--pc);color:#111;border-radius:10px;padding:1px 8px;font-size:18px}
      .g-rhythm .info .mx.x1{background:rgba(255,255,255,.12);color:var(--muted)}
      .g-rhythm .info .ic{font-size:20px;letter-spacing:2px}
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
        ctx.pointer(b, {
          down: (id, x, y, e) => {
            if (ctx.paused || over) return;
            held[p.i][k].add(id);
            hit(p.i, k, e);
          },
          up: (id) => { held[p.i][k].delete(id); },
        });
        box.append(b);
        return b;
      });
      const sc = U.h('b', null, '0');
      const cb = U.h('span', { class: 'cb' }, 'комбо 0');
      const mx = U.h('span', { class: 'mx x1' }, '×1');
      const ic = U.h('span', { class: 'ic' }, '');
      const tm = U.h('span', { class: 'tm' }, '');
      box.append(U.h('div', { class: 'info' }, U.h('span', null, 'очки ', sc), cb, mx, ic, tm));
      z.el.append(box);
      return { z, box, btns, sc, cb, mx, ic, tm, key: '' };
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
    // Lane block centered on the free field.
    function block(i, F) {
      const p = ctx.players[i], horiz = p.side === 'bottom' || p.side === 'top';
      let a0 = horiz ? F.x0 : F.y0, a1 = horiz ? F.x1 : F.y1;
      const lw = Math.min(190, (a1 - a0 - 16) / 3);
      const r = zones[i].z.rect;
      const zc = horiz ? r.x + r.w / 2 : r.y + r.h / 2;
      const d = (a0 + a1) / 2 - zc;
      const shift = (p.side === 'bottom' || p.side === 'left') ? d : -d;
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

    function geom(i, F) {
      const r = zones[i].z.rect, v = ctx.inward(i);
      const { lw, shift } = block(i, F);
      const nr = Math.min(lw * 0.3, 36);
      const sh = ctx.toScreen(i, shift, 0);
      const ex = r.x + r.w / 2 + v.x * r.d / 2 + sh.x, ey = r.y + r.h / 2 + v.y * r.d / 2 + sh.y;
      const hx = ex + v.x * (nr + 8), hy = ey + v.y * (nr + 8);
      const sx = F.cx - v.x * 34, sy = F.cy - v.y * 34;
      const lanes = [0, 1, 2].map(k => {
        const a = ctx.toScreen(i, (k - 1) * lw, 0);
        const b = ctx.toScreen(i, (k - 1) * lw * 0.13, 0);
        return { hx: hx + a.x, hy: hy + a.y, sx: sx + b.x, sy: sy + b.y, ex: ex + a.x, ey: ey + a.y };
      });
      const half = ctx.toScreen(i, lw / 2, 0), halfS = ctx.toScreen(i, lw * 0.13 / 2, 0);
      const side = ctx.toScreen(i, 1, 0);
      return { lanes, lw, nr, half, halfS, v, side };
    }

    /* ---------- effects ---------- */
    function announce(i, text, color, life = 1.6) {
      for (let q = banners.length - 1; q >= 0; q--) if (banners[q].i === i) banners.splice(q, 1);
      banners.push({ i, text, color, life, max: life });
    }
    function sparks(x, y, color, count, speed = 260) {
      for (let k = 0; k < count; k++) {
        const a = Math.random() * 6.283, sp = U.rand(speed * 0.3, speed);
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: color, r: U.rand(2, 5) });
      }
    }
    function ringPos(i, k) {
      const G = geom(i, field());
      return G.lanes[k];
    }
    const SAB = [
      { id: 'ghost', text: '👻 Призраки!', col: '#c9b8ff', dur: 5 },
      { id: 'speed', text: '⚡ Разгон!', col: '#ffd84a', dur: 5 },
      { id: 'shake', text: '🌪️ Тряска!', col: '#8fe3ff', dur: 5 },
    ];
    // Красный -> Красного, Синий -> Синего
    const gen = (name) => name.replace(/ый$/, 'ого').replace(/ий$/, 'его');
    function sabotage(from) {
      const s = U.pick(SAB);
      ctx.players.forEach(p => {
        if (p.i === from) return;
        st[p.i][s.id] = Math.max(st[p.i][s.id], s.dur);
        announce(p.i, `${s.text} от ${gen(ctx.players[from].name)}`, s.col);
      });
      return s;
    }

    /* ---------- judging ---------- */
    function judge(i, k, kind, nt) {
      const s = st[i];
      if (nt) nt.state = kind === 'miss' ? 2 : 1;
      let pts = 0;
      if (kind === 'miss') {
        s.perfRun = 0;
        if (s.shield && s.combo > 0) {
          s.shield = false;
          announce(i, '🛡️ Щит спас комбо!', '#8fe3ff', 1.2);
        } else {
          if (s.fever) announce(i, 'FEVER погас', '#9aa1c4', 1);
          s.combo = 0; s.fever = false;
        }
      } else {
        pts = (kind === 'perfect' ? 3 : 1) * mult(i);
        s.combo++;
        if (kind === 'perfect') {
          s.perfRun++;
          if (s.perfRun % 8 === 0 && !s.shield) { s.shield = true; announce(i, '🛡️ Щит!', '#8fe3ff', 1.3); }
        } else s.perfRun = 0;
        if (s.combo >= 15 && !s.fever) {
          s.fever = true;
          announce(i, '🔥 FEVER ×2!', '#ff8c42', 1.6);
          const G = geom(i, field());
          G.lanes.forEach(L => sparks(L.hx, L.hy, '#ff8c42', 16, 340));
        }
        if (nt && nt.gold) {
          pts += 8;
          const sb = sabotage(i);
          announce(i, `⭐ +8 и ${sb.text.split(' ')[0]} соперникам!`, '#ffd84a', 1.6);
          const L = ringPos(i, k); sparks(L.hx, L.hy, '#ffd84a', 34, 420);
        }
        if (nt && nt.dur) nt.holding = true;
        const L = ringPos(i, k);
        sparks(L.hx, L.hy, kind === 'perfect' ? ctx.players[i].color : '#ffffff', kind === 'perfect' ? 14 : 6);
      }
      s.best = Math.max(s.best, s.combo);
      s.score += pts;
      for (let q = fx.length - 1; q >= 0; q--) if (fx[q].i === i && fx[q].k === k) fx.splice(q, 1);
      fx.push({ i, k, kind, pts, life: 1 });
    }

    function hit(i, k, e) {
      press[i][k] = 1;
      const b = zones[i].btns[k];
      b.classList.add('on');
      setTimeout(() => b.classList.remove('on'), 110);
      let tt = ctx.time;
      if (e && e.timeStamp) tt += U.clamp((e.timeStamp - lastFrameT) / 1000, 0, 0.05);
      let best = null, bd = Infinity;
      for (const nt of notes[i]) {
        if (nt.state || nt.lane !== k) continue;
        const d = Math.abs(nt.t - tt);
        if (d < bd) { bd = d; best = nt; }
        if (nt.t > tt + 1) break;
      }
      if (best && bd <= PERFECT) judge(i, k, 'perfect', best);
      else if (best && bd <= GOOD) judge(i, k, 'good', best);
      else if (best && bd <= LATE) judge(i, k, 'miss', best);
      else if (!notes[i].some(nt => nt.holding && nt.lane === k)) judge(i, k, 'miss', null);
    }

    let over = false, lastSec = -1, finalAnnounced = false;
    function finish() {
      if (over) return;
      over = true;
      ctx.after(700, () => {
        const scores = st.map(s => s.score);
        const max = Math.max(...scores);
        let winners = ctx.players.map(p => p.i).filter(i => scores[i] === max);
        if (winners.length === n) winners = [];
        const bestCombo = Math.max(...st.map(s => s.best));
        ctx.end({ winners, scores, msg: `${bpm} BPM · лучшее комбо: ${bestCombo}` });
      });
    }
    // comeback: every 12 s a player far behind gets double points for 6 s
    ctx.every(12000, () => {
      if (over || finalOn()) return;
      const sc = st.map(s => s.score), max = Math.max(...sc), min = Math.min(...sc);
      if (max < 20 || min > max * 0.7) return;
      const i = sc.indexOf(min);
      st[i].boost = 6;
      announce(i, '🆘 Подмога: очки ×2!', '#3ddc97', 1.8);
    });

    function updateInfo(i) {
      const s = st[i], zz = zones[i];
      const m = mult(i);
      const icons = (s.shield ? '🛡️' : '') + (s.fever ? '🔥' : '') + (s.boost > 0 ? '🆘' : '') +
        (s.ghost > 0 ? '👻' : '') + (s.speed > 0 ? '⚡' : '') + (s.shake > 0 ? '🌪️' : '');
      const key = [s.score, s.combo, m, icons].join('|');
      if (key === zz.key) return;
      zz.key = key;
      zz.sc.textContent = s.score;
      zz.cb.textContent = 'комбо ' + s.combo;
      zz.mx.textContent = '×' + m;
      zz.mx.classList.toggle('x1', m === 1);
      zz.ic.textContent = icons;
      zz.box.classList.toggle('fever', s.fever);
    }

    const LABEL = { perfect: 'Точно!', good: 'Хорошо', miss: 'Мимо', hold: 'Удержал!', broke: 'Отпустил' };
    const LCOL = { perfect: '#3ddc97', good: '#ffffff', miss: '#ff4d6d', hold: '#ffd84a', broke: '#ff8c42' };

    /* ---------- loop ---------- */
    ctx.loop((dt, t) => {
      lastFrameT = t;
      const now = ctx.time;
      const W = ctx.W, H = ctx.H;
      const F = field();

      if (!over) {
        ctx.players.forEach(p => {
          const s = st[p.i];
          for (const k of ['ghost', 'speed', 'shake', 'boost']) s[k] = Math.max(0, s[k] - dt);
          const want = s.speed > 0 ? 1.1 : BASE_TRAVEL;
          s.travel += (want - s.travel) * Math.min(1, dt * 3);
          for (const nt of notes[p.i]) {
            if (nt.t > now) break;
            if (!nt.state && now - nt.t > LATE) judge(p.i, nt.lane, 'miss', nt);
            if (nt.holding) {
              const down = held[p.i][nt.lane].size > 0;
              if (now >= nt.t + nt.dur) {
                nt.holding = false;
                const pts = 4 * mult(p.i);
                s.score += pts;
                fx.push({ i: p.i, k: nt.lane, kind: 'hold', pts, life: 1 });
                const L = ringPos(p.i, nt.lane); sparks(L.hx, L.hy, '#ffd84a', 22, 340);
              } else if (!down && now < nt.t + nt.dur - 0.12) {
                nt.holding = false; nt.broken = true;
                fx.push({ i: p.i, k: nt.lane, kind: 'broke', pts: 0, life: 1 });
              } else if (dt > 0) {
                nt.tick += dt;
                if (nt.tick >= 0.2) {
                  nt.tick -= 0.2; s.score += 1;
                  const L = ringPos(p.i, nt.lane); sparks(L.hx, L.hy, ctx.players[p.i].color, 3, 160);
                }
              }
            }
          }
        });
        if (now >= FINAL_AT && !finalAnnounced) {
          finalAnnounced = true;
          ctx.toast('🎆 Финал: все очки ×2!', { ms: 1700, color: '#ff8c42', fg: '#111' });
        }
        if (now > lastT + 0.8) finish();
      }
      ctx.players.forEach(p => updateInfo(p.i));

      const remain = Math.max(0, Math.ceil(lastT + 0.8 - now));
      if (remain !== lastSec) {
        lastSec = remain;
        zones.forEach(zz => { zz.tm.textContent = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`; });
      }

      // beat pulse
      const since = ((now - T0) % beat + beat) % beat;
      const beatIdx = Math.round((now - since - T0) / beat);
      const strong = ((beatIdx % 4) + 4) % 4 === 0;
      const pulse = Math.exp(-since / beat * 4.5) * (strong ? 1 : 0.6);
      const fin = finalOn() && !over;

      g.clearRect(0, 0, W, H);
      g.fillStyle = '#0f1220';
      g.fillRect(0, 0, W, H);
      const R = Math.hypot(W, H) * 0.55;
      const grd = g.createRadialGradient(F.cx, F.cy, 0, F.cx, F.cy, R);
      const hue = fin ? '255,120,90' : '150,120,255';
      grd.addColorStop(0, `rgba(${hue},${0.10 + 0.22 * pulse})`);
      grd.addColorStop(0.5, `rgba(90,80,200,${0.04 + 0.10 * pulse})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);

      ctx.players.forEach(p => {
        const s = st[p.i];
        const G = geom(p.i, F);
        const col = p.color;
        const tr = s.travel;
        g.save();
        if (s.shake > 0) {
          const a = Math.min(1, s.shake) * 9;
          g.translate(Math.sin(t / 37 + p.i) * a, Math.cos(t / 29 + p.i) * a);
        }
        // lanes
        G.lanes.forEach((L, k) => {
          g.beginPath();
          g.moveTo(L.sx - G.halfS.x, L.sy - G.halfS.y);
          g.lineTo(L.sx + G.halfS.x, L.sy + G.halfS.y);
          g.lineTo(L.ex + G.half.x, L.ey + G.half.y);
          g.lineTo(L.ex - G.half.x, L.ey - G.half.y);
          g.closePath();
          press[p.i][k] = Math.max(0, press[p.i][k] - dt * 6);
          let a = (k % 2 ? 0.07 : 0.11) + press[p.i][k] * 0.25;
          if (s.fever) a += 0.12 + 0.1 * pulse;
          g.fillStyle = U.alpha(col, a);
          g.fill();
          g.strokeStyle = U.alpha(s.fever ? '#ff8c42' : col, s.fever ? 0.7 : 0.25); g.lineWidth = s.fever ? 2.5 : 1.5; g.stroke();
        });
        // beat grid lines
        for (let b = Math.ceil((now - T0) / beat); ; b++) {
          const tb = T0 + b * beat;
          if (tb > now + tr) break;
          if (tb < now) continue;
          const f = 1 - (tb - now) / tr;
          const a = G.lanes[0], c = G.lanes[2];
          const x1 = U.lerp(a.sx - G.halfS.x, a.hx - G.half.x, f), y1 = U.lerp(a.sy - G.halfS.y, a.hy - G.half.y, f);
          const x2 = U.lerp(c.sx + G.halfS.x, c.hx + G.half.x, f), y2 = U.lerp(c.sy + G.halfS.y, c.hy + G.half.y, f);
          const bar = ((b % 4) + 4) % 4 === 0;
          g.strokeStyle = `rgba(255,255,255,${(bar ? 0.16 : 0.07) * f})`;
          g.lineWidth = bar ? 3 : 1.5;
          g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
        }
        // hit rings
        G.lanes.forEach((L, k) => {
          g.beginPath();
          g.arc(L.hx, L.hy, G.nr + 4 + pulse * 5, 0, Math.PI * 2);
          g.lineWidth = 4 + pulse * 3;
          g.strokeStyle = U.alpha(col, 0.55 + 0.45 * Math.max(pulse, press[p.i][k]));
          if (held[p.i][k].size && notes[p.i].some(nt => nt.holding && nt.lane === k)) { g.strokeStyle = '#ffd84a'; g.lineWidth = 7; }
          g.stroke();
          g.fillStyle = U.alpha(col, 0.08 + press[p.i][k] * 0.35);
          g.fill();
        });
        // notes
        const pos = (L, f) => [U.lerp(L.sx, L.hx, f), U.lerp(L.sy, L.hy, f)];
        const vis = (f) => {
          let a = 1;
          if (f < 0.08) a *= Math.max(0, f / 0.08);
          if (s.ghost > 0 && f > 0.3 && f < 0.86) a *= 1 - Math.min(1, s.ghost * 2);
          return a;
        };
        for (const nt of notes[p.i]) {
          if (nt.t - now > tr) break;
          if (nt.state === 1 && !nt.holding && !nt.broken) continue; // hit / completed
          const L = G.lanes[nt.lane];
          const f = nt.holding ? 1 : 1 - (nt.t - now) / tr;
          const dead = nt.state === 2 || nt.broken;
          if (nt.dur) {
            // long note: a band from head to tail
            const ft = 1 - (nt.t + nt.dur - now) / tr;
            if (ft > 1.25) continue;
            const fh = Math.min(f, 1.25), fc = U.clamp(ft, 0, 1.25);
            const [hx, hy] = pos(L, fh), [tx, ty] = pos(L, fc);
            const wh = G.nr * U.lerp(0.3, 1, Math.min(1, fh)) * 0.55, wt = G.nr * U.lerp(0.3, 1, Math.min(1, fc)) * 0.55;
            g.globalAlpha = dead ? 0.35 : Math.max(0.25, vis(Math.min(1, (fh + fc) / 2)));
            g.beginPath();
            g.moveTo(hx + G.side.x * wh, hy + G.side.y * wh);
            g.lineTo(tx + G.side.x * wt, ty + G.side.y * wt);
            g.lineTo(tx - G.side.x * wt, ty - G.side.y * wt);
            g.lineTo(hx - G.side.x * wh, hy - G.side.y * wh);
            g.closePath();
            g.fillStyle = dead ? '#555b78' : U.alpha(col, nt.holding ? 0.95 : 0.6);
            g.fill();
            g.lineWidth = 2; g.strokeStyle = nt.holding ? '#ffd84a' : 'rgba(255,255,255,.7)'; g.stroke();
            g.globalAlpha = 1;
            if (nt.holding || nt.broken) continue;
          } else if (f > 1.25) continue;
          const [x, y] = pos(L, Math.min(f, 1.25));
          const r = Math.max(1, G.nr * U.lerp(0.3, 1, Math.min(1, f)));
          const a = dead ? Math.min(1, Math.max(0, 1 - (f - 1) * 5)) * 0.5 : vis(f);
          if (a <= 0.01) continue;
          g.globalAlpha = a;
          if (nt.gold && !dead) { g.shadowColor = '#ffd84a'; g.shadowBlur = 20 + 10 * pulse; }
          g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
          g.fillStyle = dead ? '#555b78' : nt.gold ? '#ffd84a' : col;
          g.fill();
          g.shadowBlur = 0;
          g.lineWidth = Math.max(2, r * 0.16); g.strokeStyle = '#fff'; g.stroke();
          if (nt.gold && !dead) {
            g.font = `${Math.round(r * 1.1)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillStyle = '#fff';
            g.fillText('⭐', x, y + r * 0.05);
          } else {
            g.beginPath(); g.arc(x, y, r * (nt.dur ? 0.5 : 0.38), 0, Math.PI * 2);
            g.fillStyle = 'rgba(255,255,255,0.85)'; g.fill();
          }
          g.globalAlpha = 1;
        }
        // ghost fog band
        if (s.ghost > 0) {
          const a = Math.min(1, s.ghost * 2) * 0.5;
          const A = G.lanes[0], C = G.lanes[2];
          const P = (L, f, sgn, hw, hs) => [U.lerp(L.sx + sgn * hs.x, L.hx + sgn * hw.x, f), U.lerp(L.sy + sgn * hs.y, L.hy + sgn * hw.y, f)];
          const p1 = P(A, 0.3, -1, G.half, G.halfS), p2 = P(C, 0.3, 1, G.half, G.halfS), p3 = P(C, 0.86, 1, G.half, G.halfS), p4 = P(A, 0.86, -1, G.half, G.halfS);
          g.fillStyle = `rgba(190,180,255,${a * 0.35})`;
          g.beginPath(); g.moveTo(...p1); g.lineTo(...p2); g.lineTo(...p3); g.lineTo(...p4); g.closePath(); g.fill();
        }
        g.restore();
      });

      // center metronome
      g.beginPath();
      g.arc(F.cx, F.cy, 16 + pulse * 12, 0, Math.PI * 2);
      g.fillStyle = fin ? `rgba(255,140,66,${0.4 + 0.6 * pulse})` : `rgba(255,255,255,${0.25 + 0.6 * pulse})`;
      g.fill();

      // particles
      for (const q of parts) {
        if (dt > 0) { q.life -= dt * 1.8; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94; }
        if (q.life <= 0) continue;
        g.globalAlpha = Math.min(1, q.life * 1.5);
        g.fillStyle = q.c;
        g.beginPath(); g.arc(q.x, q.y, q.r, 0, 6.283); g.fill();
      }
      g.globalAlpha = 1;
      parts = parts.filter(q => q.life > 0);

      // judgement labels
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const f of fx) {
        if (dt > 0) f.life -= dt * 1.8;
        if (f.life <= 0) continue;
        const G = geom(f.i, F), L = G.lanes[f.k];
        const off = G.nr * 2 + 14 + (1 - f.life) * 24;
        g.save();
        g.globalAlpha = Math.min(1, f.life * 2);
        ctx.facing(g, f.i, L.hx + G.v.x * off, L.hy + G.v.y * off);
        g.font = `900 ${f.kind === 'perfect' || f.kind === 'hold' ? 26 : 22}px ${FONT}`;
        const txt = LABEL[f.kind] + (f.pts ? ` +${f.pts}` : '');
        g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(txt, 0, 0);
        g.fillStyle = LCOL[f.kind]; g.fillText(txt, 0, 0);
        g.restore();
      }
      for (let k = fx.length - 1; k >= 0; k--) if (fx[k].life <= 0) fx.splice(k, 1);

      // announcements in the middle of each player's lanes
      for (const b of banners) {
        if (dt > 0) b.life -= dt;
        if (b.life <= 0) continue;
        const G = geom(b.i, F), L = G.lanes[1];
        const x = U.lerp(L.sx, L.hx, 0.5), y = U.lerp(L.sy, L.hy, 0.5);
        const k = Math.min(1, (b.max - b.life) * 6);
        g.save();
        g.globalAlpha = Math.min(1, b.life * 2.5);
        ctx.facing(g, b.i, x, y);
        g.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
        g.font = `900 26px ${FONT}`;
        const w = Math.min(g.measureText(b.text).width + 28, G.lw * 3 * 0.9 + 60);
        g.fillStyle = 'rgba(10,12,24,.82)';
        g.beginPath();
        if (g.roundRect) g.roundRect(-w / 2, -24, w, 48, 14); else g.rect(-w / 2, -24, w, 48);
        g.fill();
        g.lineWidth = 3; g.strokeStyle = b.color; g.stroke();
        g.fillStyle = b.color;
        g.fillText(b.text, 0, 1, w - 16);
        g.restore();
      }
      for (let k = banners.length - 1; k >= 0; k--) if (banners[k].life <= 0) banners.splice(k, 1);
    });
  },
});
