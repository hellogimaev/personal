registerGame({
  id: 'nerves',
  title: 'Нервы',
  emoji: '😬',
  desc: 'Держи палец, пока растёт банк. Успей до взрыва',
  rules: 'Каждый держит палец на своей кнопке. Когда держат все, в центре начинает расти банк, всё быстрее и быстрее.\n' +
    'Отпустил палец: забрал текущий банк. В случайный момент бомба взрывается: кто ещё держит, получает 0.\n' +
    '⚠️ Перед взрывом часто искрит фитиль, но не всегда.\n' +
    'Особые раунды:\n' +
    '✖️2 Двойные очки\n' +
    '🎰 Рулетка: фитиль искрит обманом\n' +
    '👑 Последний получает всё: очки ×3 только у того, кто отпустил последним (до взрыва)\n' +
    '🔥 Штраф: взорвался — минус 30\n' +
    '🤑 Жадина: отпустил меньше чем за 0,5 с до взрыва — +50%\n' +
    '🛟 Страховка: отстающий в 5-м раунде получает защиту (половина банка при взрыве)\n' +
    '7 раундов, больше всех очков — победа.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const P = ctx.players, N = ctx.n, ROUNDS = 7, DEPTH = 0.26, TAU = Math.PI * 2;
    const TYPES = {
      normal: { icon: '💣', name: 'Обычный', hint: 'отпусти до взрыва', mult: 1 },
      double: { icon: '✖️2', name: 'Двойные очки', hint: 'всё ×2', mult: 2 },
      roulette: { icon: '🎰', name: 'Рулетка', hint: 'фитиль искрит обманом!', mult: 1 },
      last: { icon: '👑', name: 'Последний получает всё', hint: 'очки ×3 только последнему', mult: 3 },
      penalty: { icon: '🔥', name: 'Штраф', hint: 'взорвался: −30', mult: 1 },
      final: { icon: '🏆', name: 'Финал ×2', hint: 'решающий раунд', mult: 2 },
    };
    const schedule = ['normal'].concat(U.shuffle(['double', 'roulette', 'last', 'penalty', 'normal']), ['final']);

    ctx.root.classList.add('g-nerves');
    ctx.root.append(U.h('style', null, `
      .g-nerves .nb{position:absolute;inset:1.6vmin;border-radius:3.5vmin;border:.7vmin solid var(--pc);
        background:rgba(255,255,255,.04);display:flex;flex-direction:column;align-items:stretch;justify-content:space-between;
        padding:1.4vmin 2.4vmin;color:#fff;font-weight:900;touch-action:none;transition:background .12s, box-shadow .12s, transform .12s}
      .g-nerves .nb .top{display:flex;justify-content:space-between;align-items:center;gap:2vmin;font-size:3.2vmin;white-space:nowrap}
      .g-nerves .nb .tot{color:var(--pc)}
      .g-nerves .nb .chips{display:flex;gap:1.6vmin;font-size:2.8vmin}
      .g-nerves .nb .chips b{display:inline-block;width:2.4vmin;height:2.4vmin;border-radius:50%;margin-right:.6vmin;vertical-align:-.3vmin}
      .g-nerves .nb .main{text-align:center;font-size:6vmin;line-height:1.1;white-space:nowrap;overflow:hidden}
      .g-nerves .nb .sub{text-align:center;font-size:2.7vmin;opacity:.85;white-space:nowrap;overflow:hidden}
      .g-nerves .nb.hold{background:var(--pc);color:#0f1220;box-shadow:0 0 5vmin var(--pc);transform:scale(.985)}
      .g-nerves .nb.hold .tot{color:#0f1220}
      .g-nerves .nb.need{animation:nvPulse .9s ease-in-out infinite alternate}
      .g-nerves .nb.banked{background:rgba(61,220,151,.18);border-color:#3ddc97}
      .g-nerves .nb.bust{background:rgba(255,77,109,.25);border-color:#ff4d6d;animation:nvShake .45s linear}
      @keyframes nvPulse{from{box-shadow:0 0 0 var(--pc)}to{box-shadow:0 0 4vmin var(--pc)}}
      @keyframes nvShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-2vmin)}40%{transform:translateX(1.6vmin)}60%{transform:translateX(-1vmin)}80%{transform:translateX(.6vmin)}}
    `));

    const { g } = ctx.canvas();

    /* ---------- state ---------- */
    const total = P.map(() => 0);
    const held = P.map(() => new Set());
    let round = 0, type = null, phase = 'intro';
    let readyT = 0, t0 = 0, boomAt = 0, pot = 0, warn = 0, warnPlan = [], warnShown = false;
    let released = [], busted = [], gained = [], insured = P.map(() => false), insUsed = P.map(() => false);
    let parts = [], rings = [], flash = 0, flashC = '#fff', shake = 0, boomVis = 0, lastPot = 0, popT = 0;
    let result = '';

    /* ---------- geometry ---------- */
    function fieldRect() {
      const d = Math.round(DEPTH * Math.min(ctx.W, ctx.H));
      const s = P.map(p => p.side);
      const l = s.includes('left') ? d : 0, r = s.includes('right') ? d : 0;
      const t = s.includes('top') ? d : 0, b = s.includes('bottom') ? d : 0;
      return { x: l, y: t, w: ctx.W - l - r, h: ctx.H - t - b };
    }

    /* ---------- UI ---------- */
    const ui = P.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH });
      const tot = U.h('div', { class: 'tot' }), chips = U.h('div', { class: 'chips' });
      const main = U.h('div', { class: 'main' }), sub = U.h('div', { class: 'sub' });
      const b = U.h('div', { class: 'nb' }, U.h('div', { class: 'top' }, tot, chips), main, sub);
      z.el.append(b);
      ctx.pointer(b, {
        down: (id) => { const was = held[p.i].size > 0; held[p.i].add(id); if (!was) holdChange(p.i, true); },
        up: (id) => { if (held[p.i].delete(id) && !held[p.i].size) holdChange(p.i, false); },
      });
      return { z, b, tot, chips, main, sub, cache: {} };
    });
    const releaseAll = (e) => held.forEach((s, i) => { if (s.delete(e.pointerId) && !s.size) holdChange(i, false); });
    window.addEventListener('pointerup', releaseAll);
    window.addEventListener('pointercancel', releaseAll);
    ctx.onCleanup(() => { window.removeEventListener('pointerup', releaseAll); window.removeEventListener('pointercancel', releaseAll); });
    const isHeld = (i) => held[i].size > 0;

    function set(u, k, el, v, html) {
      if (u.cache[k] === v) return;
      u.cache[k] = v;
      if (html) el.innerHTML = v; else el.textContent = v;
      if (k === 'main' || k === 'sub') fit(u, el, k);
    }
    // shrink text until it fits the button width (zones differ a lot in length)
    function fit(u, el, k) {
      const z = u.z;
      let s = k === 'main' ? Math.min(z.h * 0.27, z.w * 0.1, 60) : Math.min(z.h * 0.11, 24);
      el.style.fontSize = s + 'px';
      while (el.scrollWidth > el.clientWidth + 1 && s > 11) { s *= 0.9; el.style.fontSize = s + 'px'; }
    }
    ctx.onResize(() => ui.forEach(u => { fit(u, u.main, 'main'); fit(u, u.sub, 'sub'); }));
    function render() {
      P.forEach((p, i) => {
        const u = ui[i];
        set(u, 'tot', u.tot, `⭐ ${total[i]}${insured[i] && !insUsed[i] ? ' 🛟' : ''}`);
        let ch = '';
        P.forEach((q, j) => {
          if (j === i) return;
          let v = '…';
          if (phase === 'arm' || phase === 'ready' || phase === 'intro') v = isHeld(j) ? '✓' : '✗';
          else if (released[j]) v = String(released[j].v);
          else if (busted[j]) v = '💥';
          if ((phase === 'boom') && gained[j] != null) v = (gained[j] > 0 ? '+' : '') + gained[j];
          ch += `<span><b style="background:${q.color}"></b>${v}</span>`;
        });
        set(u, 'ch', u.chips, ch, true);
        let main = '', sub = '';
        const T = type || TYPES.normal;
        const cls = { hold: false, need: false, banked: false, bust: false };
        if (phase === 'intro' || phase === 'arm') {
          main = isHeld(i) ? '✓ держишь' : '☝️ ПОЛОЖИ ПАЛЕЦ';
          sub = `Раунд ${round}/${ROUNDS}: ${T.icon} ${T.name}`;
          cls.hold = isHeld(i); cls.need = !isHeld(i);
        } else if (phase === 'ready') {
          main = 'Держи…'; sub = `${T.icon} ${T.hint}`; cls.hold = isHeld(i);
        } else if (phase === 'run') {
          if (released[i]) { main = `✋ ${released[i].v}`; sub = 'забрал, ждём взрыва'; cls.banked = true; }
          else { main = 'ДЕРЖИШЬ'; sub = 'отпусти, чтобы забрать банк'; cls.hold = isHeld(i); }
        } else if (phase === 'boom') {
          main = result ? resultText(i) : '';
          sub = subText(i);
          cls.banked = gained[i] > 0; cls.bust = !!busted[i];
        }
        set(u, 'main', u.main, main); set(u, 'sub', u.sub, sub);
        for (const k in cls) if (u.cache['c' + k] !== cls[k]) { u.cache['c' + k] = cls[k]; u.b.classList.toggle(k, cls[k]); }
      });
    }
    function resultText(i) {
      if (busted[i] && gained[i] < 0) return `💥 ${gained[i]}`;
      if (busted[i] && gained[i] > 0) return `🛟 +${gained[i]}`;
      if (busted[i]) return '💥 0';
      return gained[i] > 0 ? `+${gained[i]}` : '0';
    }
    function subText(i) {
      const r = released[i];
      const notes = [];
      if (r && r.greedy) notes.push('🤑 Жадина +50%');
      if (r && type === TYPES.last && !(gained[i] > 0)) notes.push('👑 не последний');
      if (busted[i] && insured[i] && gained[i] > 0) notes.push('страховка сработала');
      notes.push(`💣 на ${lastPot}`);
      return notes.join(' · ');
    }

    /* ---------- effects ---------- */
    function center() { const f = fieldRect(); return { x: f.x + f.w / 2, y: f.y + f.h / 2, S: Math.min(640, Math.min(f.w, f.h)) }; }
    function burst(x, y, color, n, sp, size, life) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, s = U.rand(sp * 0.25, sp);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life || 1, c: color, r: U.rand(size * 0.4, size) });
      }
    }
    function toZone(i, color, n) {
      const c = center(), r = ui[i].z.rect;
      const tx = r.x + r.w / 2, ty = r.y + r.h / 2;
      for (let k = 0; k < n; k++) {
        const t = U.rand(0.5, 0.9);
        parts.push({ x: c.x + U.rand(-20, 20), y: c.y + U.rand(-20, 20), vx: (tx - c.x) / t * U.rand(0.8, 1.1), vy: (ty - c.y) / t * U.rand(0.8, 1.1), life: 1, c: color, r: U.rand(3, 7), nodrag: true });
      }
    }
    // notices are drawn inside each player's copy of the pot display (toasts would overlap with 3 players)
    let notice = null;
    function say(text, o) { notice = { text, bg: (o && o.color) || '#fff', fg: (o && o.fg) || '#111', until: ctx.time + ((o && o.ms) || 1500) / 1000, t0: ctx.time }; }

    /* ---------- flow ---------- */
    function nextRound() {
      round++;
      if (round > ROUNDS) return finishGame();
      type = TYPES[schedule[round - 1]];
      released = P.map(() => null); busted = P.map(() => false); gained = P.map(() => null);
      result = ''; pot = 0; lastPot = 0; warn = 0; boomVis = 0;
      if (round === 5) {
        const mn = Math.min(...total), lows = total.map((v, i) => v === mn ? i : -1).filter(i => i >= 0);
        if (lows.length === 1 && Math.max(...total) > mn) {
          insured[lows[0]] = true;
          say(`🛟 ${P[lows[0]].name}: страховка!`, { color: P[lows[0]].color, fg: '#111', ms: 1800 });
        }
      }
      phase = 'arm';
      if (type !== TYPES.normal || round === 1) {
        ctx.after(round === 5 && insured.some(Boolean) ? 1900 : 0, () => say(`${type.icon} ${type.name}`, { color: '#fff', fg: '#111', ms: 1500 }));
      }
      checkAll();
      render();
    }
    function checkAll() {
      if (phase === 'arm' && P.every(p => isHeld(p.i))) { phase = 'ready'; readyT = 1.1; render(); }
    }
    function holdChange(i, on) {
      if (!ctx.alive) return;
      if (phase === 'arm') { if (on) checkAll(); render(); return; }
      if (phase === 'ready' && !on) {
        phase = 'arm';
        say(`${P[i].name} отпустил рано!`, { color: P[i].color, fg: '#111', ms: 1100 });
        render(); return;
      }
      if (phase === 'run' && !on && !released[i] && !busted[i]) {
        const el = ctx.time - t0;
        released[i] = { v: pot, t: el };
        toZone(i, P[i].color, 18);
        burst(center().x, center().y, P[i].color, 14, 260, 5);
        if (P.every(p => released[p.i])) resolve(false);
        render(); return;
      }
      render();
    }
    function startRun() {
      phase = 'run'; t0 = ctx.time;
      boomAt = 2.4 + Math.pow(Math.random(), 0.85) * 10.5;
      warnPlan = [];
      const real = type === TYPES.roulette ? Math.random() < 0.5 : Math.random() < 0.7;
      if (real) warnPlan.push(boomAt - U.rand(0.45, 0.85));
      if (type === TYPES.roulette) {
        for (let t = U.rand(0.8, 2); t < boomAt - 0.9; t += U.rand(0.9, 2.2)) warnPlan.push(t);
      } else if (Math.random() < 0.25) warnPlan.push(U.rand(1, Math.max(1.2, boomAt - 1.5))); // the odd false alarm
      warnPlan.sort((a, b) => a - b);
      render();
    }
    const potAt = (t) => Math.floor(6 * (Math.exp(0.3 * t) - 1));
    function resolve(exploded) {
      phase = 'boom';
      lastPot = potAt(boomAt);
      if (exploded) {
        const c = center();
        boomVis = 1; flash = 0.9; flashC = '#ffb347'; shake = 22;
        burst(c.x, c.y, '#ffb347', 70, 700, 9, 1.3);
        burst(c.x, c.y, '#ff4d3d', 50, 520, 7, 1.3);
        burst(c.x, c.y, '#fff', 30, 400, 4, 1.1);
        rings.push({ x: c.x, y: c.y, r0: c.S * 0.1, r1: c.S * 0.9, t: 0, c: '#ffb347' });
      } else {
        boomVis = 0.5;
        const c = center();
        burst(c.x, c.y, '#9aa1c4', 26, 260, 5);
      }
      const mult = type.mult;
      // who scores?
      let lastT = -1;
      P.forEach(p => { const r = released[p.i]; if (r && r.t > lastT) lastT = r.t; });
      P.forEach(p => {
        const i = p.i, r = released[i];
        if (!r) {
          busted[i] = true;
          if (insured[i] && !insUsed[i]) { insUsed[i] = true; gained[i] = Math.max(1, Math.round(lastPot * 0.5)); }
          else gained[i] = type === TYPES.penalty ? -Math.min(30, total[i]) : 0;
          return;
        }
        r.greedy = boomAt - r.t <= 0.5;
        let v = r.v;
        if (type === TYPES.last) v = r.t === lastT ? v * 3 : 0;
        else v *= mult;
        if (r.greedy && v > 0) v = Math.round(v * 1.5);
        gained[i] = v;
      });
      P.forEach(p => {
        total[p.i] += gained[p.i];
        const r = released[p.i];
        if (r && r.greedy && gained[p.i] > 0) ctx.after(500, () => toZone(p.i, '#3ddc97', 25));
        if (busted[p.i]) { const z = ui[p.i].z.rect; burst(z.x + z.w / 2, z.y + z.h / 2, '#ff4d6d', 20, 300, 5); }
      });
      result = 'y';
      render();
      ctx.after(exploded ? 2900 : 2400, nextRound);
    }
    function finishGame() {
      phase = 'over';
      const mx = Math.max(...total);
      const w = P.filter(p => total[p.i] === mx).map(p => p.i);
      ctx.end({ winners: w.length === N ? [] : w, scores: total.slice(), msg: '7 раундов позади' });
    }

    ctx.after(1, nextRound); // game timers only run after the countdown

    /* ---------- loop ---------- */
    function update(dt) {
      if (phase === 'ready') {
        readyT -= dt;
        if (!P.every(p => isHeld(p.i))) { phase = 'arm'; render(); }
        else if (readyT <= 0) startRun();
      } else if (phase === 'run') {
        const el = ctx.time - t0;
        const np = potAt(el);
        if (np !== pot) { pot = np; popT = 1; }
        while (warnPlan.length && el >= warnPlan[0]) {
          warnPlan.shift(); warn = 0.4;
          const c = center();
          burst(c.x, c.y - c.S * 0.2, '#ffe14d', 12, 220, 3, 0.6);
        }
        if (el >= boomAt) { pot = potAt(boomAt); resolve(true); }
      }
      warn = Math.max(0, warn - dt);
      popT = Math.max(0, popT - dt * 6);
    }

    ctx.loop((dt, now) => {
      const t = now / 1000;
      if (dt > 0) update(dt);
      if (dt > 0) {
        for (const p of parts) {
          p.life -= dt * 1.2; p.x += p.vx * dt; p.y += p.vy * dt;
          if (!p.nodrag) { p.vx *= 0.94; p.vy *= 0.94; }
        }
        parts = parts.filter(p => p.life > 0);
        for (const r of rings) r.t += dt * 1.6;
        rings = rings.filter(r => r.t < 1);
        flash = Math.max(0, flash - dt * 1.4);
        shake = Math.max(0, shake - dt * 40);
        boomVis = Math.max(0, boomVis - dt * 0.6);
      }
      const c = center(), S = c.S;
      g.save();
      g.fillStyle = '#0f1220'; g.fillRect(0, 0, ctx.W, ctx.H);
      if (shake > 0) g.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
      const el = phase === 'run' ? ctx.time - t0 : 0;
      const heat = phase === 'run' ? Math.min(1, pot / 150) : 0;
      // background glow
      const bgR = S * 0.75;
      const bgG = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, bgR);
      bgG.addColorStop(0, `rgba(${Math.round(60 + 190 * heat)},${Math.round(70 - 40 * heat)},${Math.round(140 - 100 * heat)},.45)`);
      bgG.addColorStop(1, 'rgba(15,18,32,0)');
      g.fillStyle = bgG; g.beginPath(); g.arc(c.x, c.y, bgR, 0, TAU); g.fill();
      // bomb
      const R = S * 0.15;
      const jit = phase === 'run' ? heat * 4 + (warn > 0 ? 5 : 0) : 0;
      const bx = c.x + U.rand(-jit, jit), by = c.y + U.rand(-jit, jit);
      const pulse = 1 + popT * 0.06 + (phase === 'run' ? Math.sin(t * (6 + el * 2)) * 0.03 * (1 + heat) : 0);
      if (phase !== 'boom' || boomVis < 0.6) {
        g.save(); g.translate(bx, by); g.scale(pulse, pulse);
        const bodyG = g.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R);
        bodyG.addColorStop(0, warn > 0 ? '#ff8a8a' : '#5b6390'); bodyG.addColorStop(1, warn > 0 ? '#7a0f1f' : '#1b1f38');
        g.fillStyle = bodyG; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
        g.lineWidth = 4; g.strokeStyle = warn > 0 ? '#ff4d6d' : `rgba(255,255,255,${0.15 + heat * 0.4})`; g.stroke();
        // progress ring of heat
        if (phase === 'run') {
          g.strokeStyle = `hsl(${50 - heat * 50},100%,60%)`; g.lineWidth = 6;
          g.beginPath(); g.arc(0, 0, R + 10, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, el / 13)); g.stroke();
        }
        // fuse spark
        const fx = R * 0.55, fy = -R * 0.8;
        g.strokeStyle = '#c9a26b'; g.lineWidth = 4; g.beginPath(); g.moveTo(R * 0.4, -R * 0.85); g.quadraticCurveTo(R * 0.7, -R * 1.2, fx + 6, fy - 14); g.stroke();
        if (phase === 'run' || warn > 0) {
          const sp = 6 + Math.random() * 6 + (warn > 0 ? 12 : 0);
          g.fillStyle = warn > 0 ? '#ff4d6d' : '#ffe14d';
          g.beginPath(); g.arc(fx + 6, fy - 14, sp, 0, TAU); g.fill();
          if (dt > 0 && Math.random() < 0.6) parts.push({ x: bx + fx + 6, y: by + fy - 14, vx: U.rand(-80, 80), vy: U.rand(-120, 20), life: 0.4, c: '#ffd84d', r: 2.5 });
        }
        g.font = `${R * 0.8}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(type ? (type.icon === '✖️2' ? '✖️' : type.icon) : '💣', 0, 4);
        g.restore();
      }
      // shock rings
      for (const r of rings) {
        g.strokeStyle = U.alpha(r.c, 1 - r.t); g.lineWidth = 12 * (1 - r.t) + 2;
        g.beginPath(); g.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * r.t, 0, TAU); g.stroke();
      }
      // pot copies facing each player
      const big = S * 0.13;
      const D = R + big * 0.95 + 14;
      P.forEach(p => {
        const v = ctx.inward(p.i);
        g.save(); ctx.facing(g, p.i, c.x - v.x * D, c.y - v.y * D);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        let txt = '', col = '#fff', small = '';
        if (phase === 'run') {
          txt = String(pot); col = `hsl(${55 - heat * 55},100%,${70 - heat * 10}%)`;
          small = type.mult > 1 ? `банк ×${type.mult}` : 'банк';
          if (warn > 0) small = '⚠️ ИСКРИТ!';
        } else if (phase === 'boom') {
          txt = boomVis > 0.5 ? 'БАХ!' : String(lastPot); col = boomVis > 0.5 ? '#ffb347' : '#ff6b6b';
          small = `💥 на ${lastPot}`;
        } else if (phase === 'ready') {
          txt = String(Math.max(1, Math.ceil(readyT / 0.37))); col = '#fff'; small = 'приготовились';
        } else if (phase === 'arm') {
          const k = P.filter(q => isHeld(q.i)).length;
          txt = `${k}/${N}`; col = '#9aa1c4'; small = 'пальцы на кнопки';
        }
        const sc = 1 + popT * 0.12;
        g.scale(sc, sc);
        g.font = `900 ${big}px -apple-system, sans-serif`;
        g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(txt, 0, 0);
        g.fillStyle = col; g.fillText(txt, 0, 0);
        if (notice && ctx.time < notice.until) {
          let fs = big * 0.32;
          g.font = `900 ${fs}px -apple-system, sans-serif`;
          let w = g.measureText(notice.text).width;
          const maxW = S * 0.6;
          if (w + fs > maxW) { fs *= maxW / (w + fs); g.font = `900 ${fs}px -apple-system, sans-serif`; w = g.measureText(notice.text).width; }
          const k = Math.min(1, (ctx.time - notice.t0) * 8);
          g.save(); g.translate(0, big * 0.78); g.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
          g.fillStyle = notice.bg; g.beginPath(); g.roundRect(-w / 2 - fs * 0.5, -fs * 0.75, w + fs, fs * 1.5, fs * 0.5); g.fill();
          g.fillStyle = notice.fg; g.fillText(notice.text, 0, 1);
          g.restore();
        } else {
          g.font = `800 ${big * 0.3}px -apple-system, sans-serif`;
          g.fillStyle = warn > 0 && phase === 'run' ? '#ff4d6d' : 'rgba(255,255,255,.75)';
          g.fillText(small, 0, big * 0.72);
        }
        g.restore();
      });
      for (const p of parts) {
        g.globalAlpha = Math.min(1, p.life * 1.5); g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
      g.restore();
      if (warn > 0 && phase === 'run') { g.fillStyle = `rgba(255,40,60,${warn * 0.35})`; g.fillRect(0, 0, ctx.W, ctx.H); }
      if (flash > 0) { g.fillStyle = U.alpha(flashC, Math.min(0.6, flash)); g.fillRect(0, 0, ctx.W, ctx.H); }
      if (phase === 'run') renderT -= dt; else renderT = 0;
      if (renderT <= 0) { renderT = 0.1; render(); }
    });
    let renderT = 0;
    render();
    ctx.dbg = { ui, get phase() { return phase; }, get round() { return round; }, get pot() { return pot; }, total }; // for automated tests
  },
});
