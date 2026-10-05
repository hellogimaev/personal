registerGame({
  id: 'twister',
  title: 'Пальцовый твистер',
  emoji: '✋',
  desc: 'Держи пальцами все свои круги и не отпускай',
  rules: 'По очереди появляются круги цвета игроков. Поставь палец на свой новый круг, пока таймер не кончился, и держи ВСЕ свои круги.\n' +
    'Отпустил или соскользнул с любого своего круга — выбыл. Последний оставшийся берёт раунд. Игра до 2 побед.\n' +
    '🐌 Ползун — круг медленно ползёт, веди палец за ним.\n' +
    '⚡ Прыжок — круг перескакивает: убери палец и догони его.\n' +
    '🔄 Обмен — двое меняются кругами: передайте их друг другу.\n' +
    '🎁 Подарок — коснись и получи 🛡 щит: можно отпустить один палец.\n' +
    '🌊 Волна — все круги ненадолго поплыли.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const P = ctx.players, N = ctx.n;
    const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Rounded", "Segoe UI", Roboto, sans-serif';
    const WIN = 2;
    const DEPTH = 62;
    const wins = P.map(() => 0);
    let alive = P.map(() => true);
    let shields = P.map(() => 0);
    let circles = [];
    const ptr = new Map();          // pointerId -> {c, x, y}
    const parts = [], rings = [], links = [];
    let phase = 'between';          // play | between | over
    let round = 0, nextSpawn = 0, spawnN = 0, rot = 0, nextEvent = 0, cid = 0;
    let flash = 0, flashColor = '#fff', shake = 0;
    let wave = 0, drift = { x: 0, y: 0 };
    let W = ctx.W, H = ctx.H;
    const RAD = () => U.clamp(Math.min(W, H) * 0.064, 40, 64);

    ctx.root.classList.add('g-twister');
    ctx.root.append(U.h('style', null, `
      .g-twister .bx{position:absolute;inset:6px 8px;border-radius:16px;display:flex;align-items:center;justify-content:center;gap:12px;
        background:#1a1f35;border:2px solid color-mix(in srgb, var(--pc) 45%, transparent);font-weight:900;color:#f2f4ff;
        transition:opacity .3s, box-shadow .3s;padding:0 12px;white-space:nowrap;overflow:hidden}
      .g-twister .bx .dot{width:26px;height:26px;border-radius:50%;background:var(--pc);box-shadow:0 0 12px var(--pc);flex:0 0 auto}
      .g-twister .bx .nm{font-size:20px;color:var(--pc)}
      .g-twister .bx .pp{font-size:18px;letter-spacing:3px;color:var(--pc)}
      .g-twister .bx .sh{font-size:20px}
      .g-twister .bx .st{font-size:17px;color:#9aa1c4;overflow:hidden;text-overflow:ellipsis}
      .g-twister .bx.out{opacity:.35}
      .g-twister .bx.win{box-shadow:0 0 26px 4px var(--pc);border-color:#fff}
    `));

    const { cv, g } = ctx.canvas();

    /* ---------- HUD ---------- */
    const hud = P.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH });
      const pp = U.h('div', { class: 'pp' }), sh = U.h('div', { class: 'sh' }), st = U.h('div', { class: 'st' });
      const bx = U.h('div', { class: 'bx' }, U.h('div', { class: 'dot' }), U.h('div', { class: 'nm' }, p.name), pp, sh, st);
      z.el.append(bx);
      return { z, bx, pp, sh, st };
    });
    function renderHud() {
      hud.forEach((h, i) => {
        h.pp.textContent = '●'.repeat(wins[i]) + '○'.repeat(WIN - wins[i]);
        h.sh.textContent = shields[i] ? '🛡×' + shields[i] : '';
        const held = circles.filter(c => c.o === i && c.state === 'held').length;
        const wait = circles.some(c => c.o === i && c.state === 'wait');
        h.st.textContent = !alive[i] ? 'выбыл' : wait ? 'жми свой круг!' : held ? `держишь ${held}` : 'жди круг';
        h.bx.classList.toggle('out', !alive[i]);
      });
    }

    /* ---------- geometry ---------- */
    function playRect() {
      const s = P.map(p => p.side), m = 8;
      return {
        x0: (s.includes('left') ? DEPTH : 0) + m, x1: W - (s.includes('right') ? DEPTH : 0) - m,
        y0: (s.includes('top') ? DEPTH : 0) + m, y1: H - DEPTH - m,
      };
    }
    function nearExit(x, y, r) {
      // exit button: 2p middle of the left edge, 3p middle of the top edge
      return N === 2 ? (x - r < 70 && Math.abs(y - H / 2) < 50 + r) : (y - r < 70 && Math.abs(x - W / 2) < 50 + r);
    }
    function findSpot(r) {
      const R = playRect();
      let best = null, bestD = -1;
      for (let k = 0; k < 120; k++) {
        const x = U.rand(R.x0 + r, R.x1 - r), y = U.rand(R.y0 + r, R.y1 - r);
        if (nearExit(x, y, r)) continue;
        let dmin = 1e9;
        for (const c of circles) if (c.state === 'held' || c.state === 'wait') dmin = Math.min(dmin, U.dist(x, y, c.x, c.y) - c.r - r);
        if (dmin > 40) return { x, y };
        if (dmin > bestD) { bestD = dmin; best = { x, y }; }
      }
      return best || { x: W / 2, y: H / 2 };
    }

    /* ---------- juice ---------- */
    function burst(x, y, color, n = 16, sp = 220) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * 6.283, v = U.rand(0.25, 1) * sp;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(0.4, 0.9), t: 0, color, s: U.rand(2, 5.5) });
      }
    }
    function ring(x, y, r, color, grow = 2.4, life = 0.5) { rings.push({ x, y, r, max: r * grow, color, life, t: 0 }); }
    function say(text, o = {}) { return ctx.toast(text, Object.assign({ ms: 1500 }, o)); }
    function sayP(i, text, o = {}) { return say(text, Object.assign({ color: P[i].color, fg: '#111' }, o)); }

    /* ---------- circles ---------- */
    const ICON = { move: '🐌', jump: '⚡', bonus: '🎁' };
    function spawn(o, kind) {
      const r = RAD() * (kind === 'bonus' ? 0.92 : 1);
      const s = findSpot(r);
      const lim = kind === 'bonus' ? 3.4 : Math.max(2.8, 4.4 - spawnN * 0.06);
      const c = { id: ++cid, o, x: s.x, y: s.y, r, kind, state: 'wait', grace: false, t0: ctx.time, lim, dl: ctx.time + lim,
        vx: 0, vy: 0, jumpAt: 0, jumped: false, fx: 0 };
      if (kind === 'move') {
        const a = U.rand(0, 6.283), sp = U.rand(20, 32) * Math.min(W, H) / 820;
        c.vx = Math.cos(a) * sp; c.vy = Math.sin(a) * sp;
      }
      circles.push(c);
      burst(c.x, c.y, P[o].color, 14, 160);
      ring(c.x, c.y, c.r, P[o].color, 2.6, 0.6);
      if (kind === 'move') sayP(o, `🐌 ${P[o].name}: круг ползёт — веди палец!`);
      if (kind === 'jump') sayP(o, `⚡ ${P[o].name}: этот круг прыгнет!`);
      if (kind === 'bonus') sayP(o, `🎁 ${P[o].name}: подарок! Коснись его`);
      renderHud();
      return c;
    }
    function pickKind(o) {
      if (spawnN < N) return 'norm';
      const held = circles.filter(c => c.o === o && c.state === 'held').length;
      const r = Math.random();
      if (held >= 3 && shields[o] === 0 && r < 0.16) return 'bonus';
      if (r < 0.36) return 'move';
      if (r < 0.54) return 'jump';
      return 'norm';
    }
    function detach(c) {
      for (const [id, e] of ptr) if (e.c === c) ptr.delete(id);
    }
    function regrace(c, secs) {
      detach(c);
      c.state = 'wait'; c.grace = true; c.t0 = ctx.time; c.lim = secs; c.dl = ctx.time + secs;
    }

    /* ---------- events ---------- */
    function doSwap() {
      const cand = P.filter(p => alive[p.i] && circles.some(c => c.o === p.i && c.state === 'held')).map(p => p.i);
      if (cand.length < 2) return false;
      const [a, b] = U.shuffle(cand);
      const ca = U.pick(circles.filter(c => c.o === a && c.state === 'held'));
      const cb = U.pick(circles.filter(c => c.o === b && c.state === 'held'));
      ca.o = b; cb.o = a;
      regrace(ca, 4.5); regrace(cb, 4.5);
      links.push({ a: ca, b: cb, t: 0, life: 4.5 });
      ring(ca.x, ca.y, ca.r, '#fff', 2.2); ring(cb.x, cb.y, cb.r, '#fff', 2.2);
      say(`🔄 Обмен! ${P[a].name} ↔ ${P[b].name}: передайте круги`, { color: '#fff', fg: '#111', ms: 2200 });
      flash = 0.35; flashColor = '#ffffff';
      return true;
    }
    function doWave() {
      const a = U.rand(0, 6.283), sp = 34 * Math.min(W, H) / 820;
      drift = { x: Math.cos(a) * sp, y: Math.sin(a) * sp };
      wave = 3.5;
      say('🌊 Волна! Все круги плывут — держитесь', { color: '#4de3ff', fg: '#111', ms: 2000 });
    }

    /* ---------- elimination / rounds ---------- */
    function release(c, why) {
      if (phase !== 'play' || c.state !== 'held') return;
      detach(c);
      const o = c.o;
      if (shields[o] > 0) {
        shields[o]--;
        c.state = 'gone';
        burst(c.x, c.y, '#ffd84d', 26, 260); ring(c.x, c.y, c.r, '#ffd84d', 2.6);
        sayP(o, `🛡 ${P[o].name}: щит спас!`);
        renderHud();
        return;
      }
      eliminate(o, c, why);
    }
    function eliminate(o, c, why) {
      if (!alive[o] || phase !== 'play') return;
      alive[o] = false;
      if (c) { c.state = 'broken'; c.fx = 1.6; detach(c); }
      for (const d of circles) if (d.o === o && d !== c && (d.state === 'held' || d.state === 'wait')) {
        d.state = 'gone'; detach(d); burst(d.x, d.y, P[o].color, 18, 240);
      }
      if (c) { burst(c.x, c.y, '#ff4d6d', 40, 380); ring(c.x, c.y, c.r, '#ff4d6d', 3.4, 0.8); }
      flash = 0.45; flashColor = P[o].color; shake = 0.4;
      const txt = why === 'time' ? 'не успел' : why === 'slide' ? 'соскользнул' : 'отпустил палец';
      sayP(o, `💥 ${P[o].name} выбыл: ${txt}`, { ms: 1800, offset: N === 2 ? 120 : undefined });
      renderHud();
      const left = P.filter(p => alive[p.i]).map(p => p.i);
      if (left.length === 1) roundWin(left[0]);
      else if (left.length === 0) { phase = 'between'; say('Ничья в раунде — переигрываем', { ms: 1800 }); ctx.after(2200, newRound); }
    }
    function roundWin(w) {
      phase = 'between';
      wins[w]++;
      hud[w].bx.classList.add('win');
      for (const c of circles) if (c.o === w && c.state === 'held') { burst(c.x, c.y, P[w].color, 30, 320); ring(c.x, c.y, c.r, '#fff', 3); }
      renderHud();
      if (wins[w] >= WIN) {
        phase = 'over';
        sayP(w, `🏆 ${P[w].name} — чемпион твистера!`, { ms: 2400 });
        ctx.after(2200, () => ctx.end({ winner: w, scores: wins, msg: 'Пальцы не подвели' }));
      } else {
        sayP(w, `🏆 Раунд за ${P[w].name}!`, { ms: 2000 });
        ctx.after(2600, newRound);
      }
    }
    function newRound() {
      round++;
      circles = []; ptr.clear(); links.length = 0;
      alive = P.map(() => true); shields = P.map(() => 0);
      hud.forEach(h => h.bx.classList.remove('win'));
      phase = 'play'; spawnN = 0; rot = U.randInt(0, N - 1);
      nextSpawn = ctx.time + 0.9; nextEvent = ctx.time + U.rand(9, 12); wave = 0;
      say(`Раунд ${round}: держи свои круги!`, { ms: 1600 });
      renderHud();
    }

    /* ---------- input ---------- */
    ctx.pointer(cv, {
      down(id, x, y) {
        if (phase !== 'play' || ctx.paused) return;
        let best = null, bd = 1e9;
        for (const c of circles) if (c.state === 'wait') {
          const d = U.dist(x, y, c.x, c.y);
          if (d < c.r * 1.25 && d < bd) { bd = d; best = c; }
        }
        if (!best) return;
        if (best.kind === 'bonus') {
          best.state = 'gone';
          shields[best.o]++;
          burst(best.x, best.y, '#ffd84d', 36, 300); ring(best.x, best.y, best.r, '#ffd84d', 3);
          sayP(best.o, `🛡 ${P[best.o].name}: щит! Можно отпустить 1 палец`, { ms: 2000 });
          renderHud();
          return;
        }
        best.state = 'held'; best.grace = false;
        ptr.set(id, { c: best, x, y });
        if (best.kind === 'jump' && !best.jumped) best.jumpAt = ctx.time + U.rand(1.8, 3.2);
        burst(best.x, best.y, P[best.o].color, 10, 140); ring(best.x, best.y, best.r, '#fff', 1.6, 0.35);
        renderHud();
      },
      move(id, x, y) { const e = ptr.get(id); if (e) { e.x = x; e.y = y; } },
      up(id) {
        const e = ptr.get(id);
        if (!e) return;
        ptr.delete(id);
        if (phase !== 'play') return;
        if (ctx.paused) { regrace(e.c, 4); return; }
        release(e.c, 'up');
      },
    });

    ctx.onResize(() => {
      const sx = ctx.W / W, sy = ctx.H / H;
      W = ctx.W; H = ctx.H;
      for (const c of circles) { c.x *= sx; c.y *= sy; }
      if (phase === 'play') {
        let any = false;
        for (const c of circles) if (c.state === 'held') { regrace(c, 5); any = true; }
        if (any) say('Экран повернулся — поставьте пальцы заново', { ms: 2200 });
      }
    });

    /* ---------- loop ---------- */
    let pulse = 0;
    ctx.loop((dt) => {
      pulse += dt;
      if (dt > 0 && phase === 'play') {
        // spawns
        if (ctx.time >= nextSpawn) {
          for (let k = 0; k < N; k++) { rot = (rot + 1) % N; if (alive[rot]) break; }
          spawn(rot, pickKind(rot));
          spawnN++;
          nextSpawn = ctx.time + Math.max(1.25, 2.5 - spawnN * 0.05) * (N === 2 ? 1.15 : 1);
        }
        // random events
        if (ctx.time >= nextEvent) {
          if (!(Math.random() < 0.6 && doSwap())) doWave();
          nextEvent = ctx.time + U.rand(9, 13);
        }
        // motion
        const R = playRect();
        if (wave > 0) wave -= dt;
        for (const c of circles) {
          if (c.state !== 'held' && c.state !== 'wait') continue;
          let vx = c.vx, vy = c.vy;
          if (wave > 0) { vx += drift.x; vy += drift.y; }
          if (!vx && !vy) continue;
          c.x += vx * dt; c.y += vy * dt;
          if (c.x < R.x0 + c.r) { c.x = R.x0 + c.r; c.vx = Math.abs(c.vx); }
          if (c.x > R.x1 - c.r) { c.x = R.x1 - c.r; c.vx = -Math.abs(c.vx); }
          if (c.y < R.y0 + c.r) { c.y = R.y0 + c.r; c.vy = Math.abs(c.vy); }
          if (c.y > R.y1 - c.r) { c.y = R.y1 - c.r; c.vy = -Math.abs(c.vy); }
        }
        // fingers sliding out
        for (const [id, e] of [...ptr]) {
          if (e.c.state !== 'held') { ptr.delete(id); continue; }
          if (U.dist(e.x, e.y, e.c.x, e.c.y) > e.c.r * 1.35 + 8) { ptr.delete(id); release(e.c, 'slide'); if (phase !== 'play') break; }
        }
        // jumps
        if (phase === 'play') for (const c of circles) {
          if (c.kind === 'jump' && c.state === 'held' && !c.jumped && c.jumpAt && ctx.time >= c.jumpAt) {
            c.jumped = true;
            const ox = c.x, oy = c.y;
            burst(ox, oy, P[c.o].color, 20, 260);
            const s = findSpot(c.r);
            c.x = s.x; c.y = s.y;
            regrace(c, 3.4);
            links.push({ ax: ox, ay: oy, b: c, t: 0, life: 0.7, jump: true });
            ring(c.x, c.y, c.r, '#ffe14d', 2.8, 0.6);
            sayP(c.o, `⚡ ${P[c.o].name}: прыжок! Догони круг`);
          }
        }
        // timeouts
        if (phase === 'play') for (const c of circles) {
          if (c.state === 'wait' && ctx.time > c.dl) {
            if (c.kind === 'bonus') { c.state = 'gone'; burst(c.x, c.y, '#888', 10, 100); renderHud(); continue; }
            eliminate(c.o, c, 'time');
            if (phase !== 'play') break;
          }
        }
        circles = circles.filter(c => c.state !== 'gone' || false);
      }
      if (dt > 0) {
        for (const c of circles) if (c.state === 'broken') c.fx -= dt;
        circles = circles.filter(c => c.state !== 'broken' || c.fx > 0);
      }
      draw(dt);
    });

    /* ---------- drawing ---------- */
    function edgePoint(i, x, y) {
      const s = P[i].side;
      return s === 'bottom' ? { x, y: H } : s === 'top' ? { x, y: 0 } : s === 'left' ? { x: 0, y } : { x: W, y };
    }
    function draw(dt) {
      g.save();
      g.clearRect(0, 0, W, H);
      if (shake > 0) { shake -= dt; g.translate(U.rand(-6, 6) * shake * 2, U.rand(-6, 6) * shake * 2); }
      // background: subtle dotted grid
      g.fillStyle = '#0f1220'; g.fillRect(-20, -20, W + 40, H + 40);
      g.fillStyle = 'rgba(255,255,255,.05)';
      for (let x = 20; x < W; x += 40) for (let y = 20; y < H; y += 40) g.fillRect(x - 1, y - 1, 2, 2);
      if (wave > 0) {
        g.fillStyle = `rgba(77,227,255,${0.06 + 0.04 * Math.sin(pulse * 6)})`;
        g.fillRect(0, 0, W, H);
      }
      // beams from owner's edge to waiting circles
      for (const c of circles) if (c.state === 'wait') {
        const e = edgePoint(c.o, c.x, c.y);
        const gr = g.createLinearGradient(e.x, e.y, c.x, c.y);
        gr.addColorStop(0, U.alpha(P[c.o].color, 0.35)); gr.addColorStop(1, U.alpha(P[c.o].color, 0));
        g.strokeStyle = gr; g.lineWidth = c.r * 0.9;
        g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(c.x, c.y); g.stroke();
      }
      // swap / jump links
      for (let k = links.length - 1; k >= 0; k--) {
        const L = links[k];
        L.t += dt;
        if (L.t > L.life) { links.splice(k, 1); continue; }
        const a = 1 - L.t / L.life;
        g.strokeStyle = L.jump ? `rgba(255,225,77,${a})` : `rgba(255,255,255,${a * 0.8})`;
        g.lineWidth = L.jump ? 8 * a : 4;
        g.setLineDash(L.jump ? [] : [14, 10]); g.lineDashOffset = -pulse * 60;
        g.beginPath();
        g.moveTo(L.jump ? L.ax : L.a.x, L.jump ? L.ay : L.a.y);
        g.lineTo(L.b.x, L.b.y); g.stroke();
        g.setLineDash([]);
        if (!L.jump) {
          const mx = (L.a.x + L.b.x) / 2, my = (L.a.y + L.b.y) / 2;
          g.font = `32px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.globalAlpha = a; g.fillText('🔄', mx, my); g.globalAlpha = 1;
        }
      }
      // circles
      for (const c of circles) drawCircle(c);
      // rings
      for (let k = rings.length - 1; k >= 0; k--) {
        const r = rings[k];
        r.t += dt;
        if (r.t > r.life) { rings.splice(k, 1); continue; }
        const f = r.t / r.life;
        g.strokeStyle = U.alpha(r.color.length === 7 ? r.color : '#ffffff', 1 - f);
        g.lineWidth = 6 * (1 - f) + 1;
        g.beginPath(); g.arc(r.x, r.y, U.lerp(r.r, r.max, f), 0, 6.283); g.stroke();
      }
      // particles
      g.globalCompositeOperation = 'lighter';
      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k];
        p.t += dt;
        if (p.t > p.life) { parts.splice(k, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94;
        g.globalAlpha = 1 - p.t / p.life;
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.s, 0, 6.283); g.fill();
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      if (flash > 0) {
        g.fillStyle = U.alpha(flashColor, Math.min(0.35, flash));
        g.fillRect(-20, -20, W + 40, H + 40);
        flash -= dt;
      }
      g.restore();
    }
    function drawCircle(c) {
      const col = P[c.o].color;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (c.state === 'held') {
        const pr = c.r * (1 + 0.03 * Math.sin(pulse * 5 + c.id));
        g.shadowColor = col; g.shadowBlur = 28;
        g.fillStyle = col;
        g.beginPath(); g.arc(c.x, c.y, pr, 0, 6.283); g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 4;
        g.beginPath(); g.arc(c.x, c.y, pr - 6, 0, 6.283); g.stroke();
        g.fillStyle = 'rgba(0,0,0,.18)';
        g.beginPath(); g.arc(c.x, c.y, pr * 0.45, 0, 6.283); g.fill();
        if (c.kind !== 'norm') { g.font = `${Math.round(c.r * 0.6)}px ${FONT}`; g.fillText(c.jumped ? '✔' : ICON[c.kind], c.x, c.y + 2); }
      } else if (c.state === 'wait') {
        const f = U.clamp((c.dl - ctx.time) / c.lim, 0, 1);
        const pr = c.r * (0.72 + 0.28 * f);
        const urgent = f < 0.35;
        const blink = urgent ? 0.5 + 0.5 * Math.sin(pulse * 22) : 1;
        // halo
        const gr = g.createRadialGradient(c.x, c.y, pr * 0.3, c.x, c.y, c.r * 1.9);
        gr.addColorStop(0, U.alpha(col, 0.45)); gr.addColorStop(1, U.alpha(col, 0));
        g.fillStyle = gr; g.beginPath(); g.arc(c.x, c.y, c.r * 1.9, 0, 6.283); g.fill();
        g.fillStyle = U.alpha(col, 0.35 + 0.25 * blink);
        g.beginPath(); g.arc(c.x, c.y, pr, 0, 6.283); g.fill();
        g.strokeStyle = col; g.lineWidth = 4;
        if (c.grace) { g.setLineDash([10, 8]); g.lineDashOffset = -pulse * 40; }
        g.beginPath(); g.arc(c.x, c.y, pr, 0, 6.283); g.stroke();
        g.setLineDash([]);
        // timer ring
        g.strokeStyle = urgent ? '#ff4d6d' : '#ffffff'; g.lineWidth = 6; g.lineCap = 'round';
        g.beginPath(); g.arc(c.x, c.y, c.r + 9, -Math.PI / 2, -Math.PI / 2 + 6.283 * f); g.stroke();
        g.lineCap = 'butt';
        // icon / hint
        const ic = c.kind === 'bonus' ? '🎁' : c.grace ? (c.kind === 'jump' ? '⚡' : '🔄') : c.kind === 'norm' ? '👆' : ICON[c.kind];
        g.font = `${Math.round(c.r * 0.7)}px ${FONT}`;
        g.save(); ctx.facing(g, c.o, c.x, c.y); g.fillText(ic, 0, 2); g.restore();
        if (c.kind === 'bonus') {
          g.strokeStyle = '#ffd84d'; g.lineWidth = 3;
          g.beginPath(); g.arc(c.x, c.y, pr - 7, 0, 6.283); g.stroke();
        }
      } else if (c.state === 'broken') {
        const a = U.clamp(c.fx / 1.6, 0, 1);
        g.globalAlpha = a;
        g.fillStyle = U.alpha(col, 0.5);
        g.beginPath(); g.arc(c.x, c.y, c.r, 0, 6.283); g.fill();
        g.strokeStyle = '#ff4d6d'; g.lineWidth = 10; g.lineCap = 'round';
        const k = c.r * 0.55;
        g.beginPath(); g.moveTo(c.x - k, c.y - k); g.lineTo(c.x + k, c.y + k); g.moveTo(c.x + k, c.y - k); g.lineTo(c.x - k, c.y + k); g.stroke();
        g.lineCap = 'butt';
        g.strokeStyle = '#ff4d6d'; g.lineWidth = 4;
        g.beginPath(); g.arc(c.x, c.y, c.r + 10 + (1 - a) * 30, 0, 6.283); g.stroke();
        g.globalAlpha = 1;
      }
    }

    // test hook (read-only view of state)
    ctx.root._tw = () => ({ phase, alive: alive.slice(), wins: wins.slice(), circles: circles.map(c => ({ id: c.id, o: c.o, x: c.x, y: c.y, r: c.r, state: c.state, kind: c.kind })) });

    renderHud();
    newRound();
  },
});
