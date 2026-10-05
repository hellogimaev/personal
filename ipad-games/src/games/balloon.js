registerGame({
  id: 'balloon',
  title: 'Шарик',
  emoji: '🎈',
  desc: 'Надувай быстрее всех, но не лопни',
  rules: 'Жми НАСОС, чтобы надуть свой шарик. Каждый качок даёт очки, и чем больше шарик, тем дороже качок.\n' +
    'У каждого шарика свой скрытый предел. Лопнул — 0 за раунд. Жми СДАТЬ, чтобы забрать очки.\n' +
    'На раунд 10 секунд: кто не успел сдать, тому засчитывается как есть.\n' +
    '😰 Шкала напряжения подсказывает, но врёт. Шарик дрожит и скрипит перед взрывом.\n' +
    '🔍 Прощупать (1 раз за игру): узнаёшь, между каким числом качков шарик лопнет.\n' +
    '🪡 Иголка: кто сдал первым, может уколоть шарик соперника (он станет слабее).\n' +
    '🌡️ Жара: все шарики слабее.  🌟 Золотой раунд: очки ×2.\n' +
    '🍀 Отстающему с 4-го раунда шарик чуть прочнее.\n' +
    '5 раундов, больше всех очков — победа.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const P = ctx.players, N = ctx.n, ROUNDS = 5, DEPTH = 0.2, ROUND_T = 10, TAU = Math.PI * 2;
    const TYPES = {
      normal: { icon: '🎈', name: 'Обычный раунд', mult: 1, k: 1 },
      heat: { icon: '🌡️', name: 'Жара! Шарики слабее', mult: 1, k: 0.62 },
      golden: { icon: '🌟', name: 'Золотой раунд ×2', mult: 2, k: 1 },
      final: { icon: '🌟', name: 'Золотой финал ×2', mult: 2, k: 1 },
    };
    const schedule = ['normal'].concat(U.shuffle(['heat', 'golden', 'normal']), ['final']);

    ctx.root.classList.add('g-balloon');
    ctx.root.append(U.h('style', null, `
      .g-balloon .zone-inner{display:flex;flex-direction:column;gap:1vmin;padding:1.2vmin 1.6vmin}
      .g-balloon .info{display:flex;justify-content:space-between;align-items:center;gap:2vmin;color:#fff;font-weight:900;
        font-size:3vmin;height:4.4vmin;white-space:nowrap;padding:0 1vmin;pointer-events:none}
      .g-balloon .info .tot{color:var(--pc);font-size:3.6vmin}
      .g-balloon .row{flex:1 1 auto;display:flex;gap:1.4vmin;min-height:0}
      .g-balloon .bt{border-radius:3vmin;border:.5vmin solid var(--pc);color:#fff;background:rgba(255,255,255,.05);
        display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:900;touch-action:none;min-width:0;
        transition:transform .06s, background .1s, opacity .2s}
      .g-balloon .bt .e{font-size:5.5vmin;line-height:1}
      .g-balloon .bt .l{font-size:2.6vmin;margin-top:.4vmin;white-space:nowrap}
      .g-balloon .pump{flex:2.2 1 0;background:var(--pc);color:#0f1220;font-size:5vmin}
      .g-balloon .pump .l{font-size:4.2vmin}
      .g-balloon .pump.hit{transform:scale(.94)}
      .g-balloon .bank{flex:1.3 1 0}
      .g-balloon .probe{flex:.9 1 0}
      .g-balloon .bt.off{opacity:.25}
      .g-balloon .needle{position:absolute;inset:0;display:none;gap:1.4vmin;padding:1.2vmin 1.6vmin;background:rgba(15,18,32,.94);
        border-radius:2vmin;z-index:3}
      .g-balloon .needle.on{display:flex}
      .g-balloon .needle .bt{flex:1 1 0}
      .g-balloon .needle .bt .l{font-size:3.2vmin}
      .g-balloon .needle .t{flex:0 0 auto;align-self:center;color:#fff;font-weight:900;font-size:3vmin;text-align:center;line-height:1.2}
    `));

    const { g } = ctx.canvas();

    /* ---------- state ---------- */
    const total = P.map(() => 0);
    const probeLeft = P.map(() => 1);
    let round = 0, type = TYPES.normal, phase = 'intro', roundEnd = 0, firstBank = -1;
    let parts = [], rings = [], floats = [], flash = 0, flashC = '#fff', shake = 0;
    const bl = P.map(p => ({
      i: p.i, air: 0, thr: 20, state: 'idle', pts: 0, noise: 0, wob: 0, pumpT: 0, hint: null, luck: false,
      burstT: 0, needleUntil: 0, needled: 0,
    }));
    const ptsFor = (a) => { let s = 0; for (let k = 1; k <= a; k++) s += 1 + Math.floor((k - 1) / 4); return s; };

    /* ---------- geometry ---------- */
    let Rm = 80, pos = [];
    function fieldRect() {
      const d = Math.round(DEPTH * Math.min(ctx.W, ctx.H));
      const s = P.map(p => p.side);
      const l = s.includes('left') ? d : 0, r = s.includes('right') ? d : 0;
      const t = s.includes('top') ? d : 0, b = s.includes('bottom') ? d : 0;
      return { x: l, y: t, w: ctx.W - l - r, h: ctx.H - t - b };
    }
    function layout() {
      const f = fieldRect();
      let R = Math.min(f.w, f.h) * 0.3;
      for (let it = 0; it < 40; it++) {
        pos = P.map(p => {
          const v = ctx.inward(p.i), off = R * 1.25 + 14;
          let x, y;
          if (p.side === 'bottom') { x = f.x + f.w / 2; y = f.y + f.h - off; }
          else if (p.side === 'top') { x = f.x + f.w / 2; y = f.y + off; }
          else if (p.side === 'left') { x = f.x + off; y = f.y + f.h * (N === 3 ? 0.36 : 0.5); }
          else { x = f.x + f.w - off; y = f.y + f.h * (N === 3 ? 0.36 : 0.5); }
          return { x, y, v };
        });
        let ok = true;
        for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) if (U.dist(pos[a].x, pos[a].y, pos[b].x, pos[b].y) < R * 2.75 + 20) ok = false;
        if (P.some(p => (p.side === 'left' || p.side === 'right') && pos[p.i].y - R * 1.4 < f.y + 50)) ok = false;
        if (ok) break;
        R *= 0.94;
      }
      Rm = R;
    }
    layout();
    ctx.onResize(layout);
    const radius = (b) => Rm * (0.34 + 0.66 * Math.min(1.2, b.air / 32));

    /* ---------- UI ---------- */
    const ui = P.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH });
      z.el.style.background = `linear-gradient(0deg, ${U.alpha(p.color, .2)}, ${U.alpha(p.color, .04)})`;
      z.el.style.borderTop = `2px solid ${U.alpha(p.color, .6)}`;
      const tot = U.h('div', { class: 'tot' }), mid = U.h('div'), cur = U.h('div');
      const probe = U.h('div', { class: 'bt probe' }, U.h('div', { class: 'e' }, '🔍'), U.h('div', { class: 'l' }, 'щупать'));
      const pump = U.h('div', { class: 'bt pump' }, U.h('div', { class: 'e' }, '🎈'), U.h('div', { class: 'l' }, 'НАСОС'));
      const bank = U.h('div', { class: 'bt bank' }, U.h('div', { class: 'e' }, '💰'), U.h('div', { class: 'l' }, 'СДАТЬ'));
      const needle = U.h('div', { class: 'needle' });
      z.el.append(U.h('div', { class: 'info' }, tot, mid, cur), U.h('div', { class: 'row' }, probe, pump, bank), needle);
      ctx.tap(pump, () => doPump(p.i));
      ctx.tap(bank, () => doBank(p.i));
      ctx.tap(probe, () => doProbe(p.i));
      return { z, tot, mid, cur, probe, pump, bank, needle, cache: {} };
    });
    function set(u, k, el, v) { if (u.cache[k] !== v) { u.cache[k] = v; el.textContent = v; } }
    function render() {
      const left = phase === 'pump' ? Math.max(0, Math.ceil(roundEnd - ctx.time)) : ROUND_T;
      bl.forEach((b, i) => {
        const u = ui[i];
        set(u, 'tot', u.tot, `⭐ ${total[i]}`);
        set(u, 'mid', u.mid, `${type.icon} ${round}/${ROUNDS}${phase === 'pump' ? ` · ⏱️ ${left}` : ''}`);
        let cur = '';
        if (b.state === 'pump' || b.state === 'idle') cur = b.hint ? `🔍 ${b.hint[0]}–${b.hint[1]} · ${b.air}` : `качков: ${b.air}`;
        if (b.state === 'banked') cur = `✓ +${b.pts}`;
        if (b.state === 'burst') cur = '💥 0';
        set(u, 'cur', u.cur, cur);
        const canAct = phase === 'pump' && b.state === 'pump';
        u.pump.classList.toggle('off', !canAct);
        u.bank.classList.toggle('off', !canAct || b.air === 0);
        u.probe.classList.toggle('off', !canAct || probeLeft[i] <= 0 || !!b.hint);
      });
    }

    /* ---------- effects ---------- */
    function burst(x, y, color, n, sp, size, life) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, s = U.rand(sp * 0.25, sp);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life || 1, c: color, r: U.rand(size * 0.4, size), rot: Math.random() * 6, rag: Math.random() < 0.5 });
      }
    }
    function floatText(i, text, color, big) {
      const p = pos[i];
      floats.push({ i, x: p.x, y: p.y, text, c: color || '#fff', t: 0, big });
    }
    function say(text, o) {
      const f = fieldRect();
      return ctx.toast(text, Object.assign({ ms: 1500, offset: N === 2 ? 46 : Math.min(f.w, f.h) * 0.08 }, o || {}));
    }
    const colorOf = (i) => (type === TYPES.golden || type === TYPES.final) ? '#ffcf3c' : P[i].color;

    /* ---------- actions ---------- */
    function doPump(i) {
      const b = bl[i];
      if (phase !== 'pump' || b.state !== 'pump') return;
      b.air++;
      b.pumpT = 1;
      b.noise = U.clamp(b.noise + U.rand(-0.12, 0.12), -0.22, 0.22);
      const u = ui[i].pump; u.classList.remove('hit'); void u.offsetWidth; u.classList.add('hit');
      ctx.after(70, () => u.classList.remove('hit'));
      const p = pos[i], r = radius(b);
      for (let k = 0; k < 3; k++) parts.push({ x: p.x + p.v.x * r * 1.2, y: p.y + p.v.y * r * 1.2, vx: p.v.x * U.rand(40, 90) + U.rand(-40, 40), vy: p.v.y * U.rand(40, 90) + U.rand(-40, 40), life: 0.5, c: 'rgba(255,255,255,.7)', r: U.rand(2, 4) });
      if (b.air > b.thr) pop(i);
      render();
    }
    function pop(i) {
      const b = bl[i];
      b.state = 'burst'; b.burstT = 1; b.pts = 0;
      const p = pos[i], r = radius(b);
      burst(p.x, p.y, colorOf(i), 40, 620, 10, 1.2);
      burst(p.x, p.y, '#ffffff', 20, 420, 4, 0.8);
      rings.push({ x: p.x, y: p.y, r0: r, r1: r + Rm * 1.6, t: 0, c: colorOf(i) });
      flash = 0.45; flashC = colorOf(i); shake = Math.max(shake, 14);
      floatText(i, '💥 БАХ!', '#ff6b6b', true);
      checkRoundOver();
    }
    function doBank(i) {
      const b = bl[i];
      if (phase !== 'pump' || b.state !== 'pump' || b.air === 0) return;
      bankIt(i, false);
      if (firstBank < 0) {
        firstBank = i;
        const targets = bl.filter(o => o.i !== i && o.state === 'pump');
        if (targets.length) offerNeedle(i, targets);
      }
      checkRoundOver();
    }
    function bankIt(i, auto) {
      const b = bl[i];
      b.state = 'banked';
      b.pts = ptsFor(b.air) * type.mult;
      total[i] += b.pts;
      const p = pos[i];
      burst(p.x, p.y, '#3ddc97', 18, 260, 5);
      rings.push({ x: p.x, y: p.y, r0: radius(b), r1: radius(b) + 60, t: 0, c: '#3ddc97' });
      floatText(i, `${auto ? '⏰ ' : '💰 '}+${b.pts}`, '#3ddc97', true);
      render();
    }
    function doProbe(i) {
      const b = bl[i];
      if (phase !== 'pump' || b.state !== 'pump' || probeLeft[i] <= 0 || b.hint) return;
      probeLeft[i]--;
      const w = U.randInt(5, 8), lo = Math.max(b.air + 1, b.thr + 1 - U.randInt(1, w - 1));
      b.hint = [lo, Math.max(lo + 2, lo + w)];
      floatText(i, `🔍 лопнет на ${b.hint[0]}–${b.hint[1]}`, '#7fe7ff');
      const p = pos[i];
      rings.push({ x: p.x, y: p.y, r0: radius(b), r1: radius(b) + 40, t: 0, c: '#7fe7ff' });
      render();
    }
    function offerNeedle(i, targets) {
      const nd = ui[i].needle;
      nd.replaceChildren(U.h('div', { class: 't' }, '🪡', U.h('br'), 'уколоть?'));
      const close = () => { nd.classList.remove('on'); ctx.cancel(tmr); };
      targets.forEach(o => {
        const btn = U.h('div', { class: 'bt', style: { borderColor: P[o.i].color, background: U.alpha(P[o.i].color, 0.25) } },
          U.h('div', { class: 'e' }, '🪡'), U.h('div', { class: 'l' }, P[o.i].name));
        ctx.tap(btn, () => { close(); needle(i, o.i); });
        nd.append(btn);
      });
      const no = U.h('div', { class: 'bt', style: { flex: '.6 1 0' } }, U.h('div', { class: 'e' }, '✕'), U.h('div', { class: 'l' }, 'нет'));
      ctx.tap(no, close);
      nd.append(no);
      nd.classList.add('on');
      const tmr = ctx.after(4500, close);
      floatText(i, '🪡 Можешь уколоть!', '#fff');
    }
    function needle(from, to) {
      const b = bl[to];
      if (phase !== 'pump' || b.state !== 'pump') return;
      b.thr = Math.max(1, b.thr - 4);
      b.needled = 1;
      if (b.hint) b.hint = null; // the old hint is no longer valid
      say(`🪡 ${P[from].name} уколол ${P[to].name}!`, { color: P[from].color, fg: '#111', ms: 1500 });
      const p = pos[to];
      burst(p.x, p.y, '#e0e6ff', 14, 300, 3);
      floatText(to, '🪡 Укол! шарик слабее', '#ff9ab0');
      if (b.air > b.thr) ctx.after(250, () => { if (b.state === 'pump') pop(to); });
      render();
    }

    /* ---------- rounds ---------- */
    function nextRound() {
      round++;
      if (round > ROUNDS) return finishGame();
      type = TYPES[schedule[round - 1]];
      firstBank = -1;
      const mn = Math.min(...total), mx = Math.max(...total);
      const lows = total.map((v, i) => v === mn ? i : -1).filter(i => i >= 0);
      bl.forEach(b => {
        b.air = 0; b.state = 'idle'; b.pts = 0; b.noise = U.rand(-0.15, 0.15); b.hint = null; b.burstT = 0; b.needled = 0;
        const base = 6 + (Math.random() + Math.random()) / 2 * 26;
        b.thr = Math.max(3, Math.round(base * type.k));
        b.luck = round >= 4 && lows.length === 1 && lows[0] === b.i && mx > mn;
        if (b.luck) b.thr += 4;
        ui[b.i].needle.classList.remove('on');
      });
      phase = 'pre';
      say(`Раунд ${round}/${ROUNDS}: ${type.icon} ${type.name}`, { color: type === TYPES.heat ? '#ff6b3d' : type.mult > 1 ? '#ffcf3c' : '#fff', fg: '#111', ms: 1700 });
      if (type === TYPES.heat) { flash = 0.4; flashC = '#ff6b3d'; }
      if (type.mult > 1) { flash = 0.4; flashC = '#ffcf3c'; }
      const lucky = bl.find(b => b.luck);
      if (lucky) ctx.after(900, () => floatText(lucky.i, '🍀 Удача: шарик прочнее', '#7dff8a'));
      ctx.after(1800, () => {
        phase = 'pump'; roundEnd = ctx.time + ROUND_T;
        bl.forEach(b => { b.state = 'pump'; });
        say('КАЧАЙ!', { color: '#3ddc97', fg: '#111', ms: 700 });
        render();
      });
      render();
    }
    function checkRoundOver() {
      if (phase !== 'pump') return;
      if (bl.every(b => b.state !== 'pump')) endRound();
    }
    function endRound() {
      phase = 'post';
      bl.forEach(b => { ui[b.i].needle.classList.remove('on'); });
      // reveal thresholds
      bl.forEach(b => { if (b.state === 'banked') ctx.after(500, () => floatText(b.i, `предел был ${b.thr}`, '#9aa1c4')); });
      render();
      ctx.after(2600, nextRound);
    }
    function finishGame() {
      phase = 'over';
      const mx = Math.max(...total);
      const w = P.filter(p => total[p.i] === mx).map(p => p.i);
      ctx.end({ winners: w.length === N ? [] : w, scores: total.slice(), msg: `${ROUNDS} раундов позади` });
    }
    ctx.after(1, nextRound); // game timers only run after the countdown

    /* ---------- loop ---------- */
    function update(dt) {
      if (phase === 'pump' && ctx.time >= roundEnd) {
        bl.forEach(b => { if (b.state === 'pump') { if (b.air > 0) bankIt(b.i, true); else { b.state = 'banked'; b.pts = 0; } } });
        endRound();
      }
      for (const b of bl) {
        b.pumpT = Math.max(0, b.pumpT - dt * 5);
        b.burstT = Math.max(0, b.burstT - dt);
        b.needled = Math.max(0, b.needled - dt);
        b.wob += dt * (4 + 14 * Math.pow(Math.min(1, b.air / Math.max(1, b.thr)), 2));
      }
    }

    function drawBalloon(b, t) {
      const p = pos[b.i];
      const col = colorOf(b.i);
      g.save(); ctx.facing(g, b.i, p.x, p.y);
      const fr = Math.min(1.2, b.air / Math.max(1, b.thr)); // true fraction (drives wobble/squeak)
      const r = radius(b);
      const anchorY = Rm * 1.25 + 14; // edge of the zone in local coords
      if (b.state !== 'burst') {
        // string
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, r * 1.1 + 6);
        g.bezierCurveTo(Math.sin(t * 2) * 10, r * 1.1 + (anchorY - r) * 0.4, -Math.sin(t * 2) * 10, r * 1.1 + (anchorY - r) * 0.7, 0, anchorY);
        g.stroke();
        const wob = (b.state === 'pump' ? (0.01 + 0.06 * fr * fr) : 0.012);
        const sxk = 1 + Math.sin(b.wob) * wob + b.pumpT * 0.06, syk = 1 - Math.sin(b.wob) * wob + b.pumpT * 0.03;
        const jx = b.state === 'pump' && fr > 0.75 ? U.rand(-1, 1) * fr * 3 : 0;
        g.save(); g.translate(jx, 0); g.scale(sxk, syk);
        // glow
        const gl = g.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.7);
        gl.addColorStop(0, U.alpha(col, 0.35)); gl.addColorStop(1, U.alpha(col, 0));
        g.fillStyle = gl; g.beginPath(); g.arc(0, 0, r * 1.7, 0, TAU); g.fill();
        // body
        const bg = g.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.05, 0, 0, r * 1.15);
        bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.12, U.alpha(col, 1)); bg.addColorStop(1, U.alpha(col, 0.75));
        g.fillStyle = bg;
        g.beginPath(); g.ellipse(0, 0, r, r * 1.12, 0, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; g.stroke();
        // knot
        g.fillStyle = col; g.beginPath(); g.moveTo(-7, r * 1.12 + 8); g.lineTo(7, r * 1.12 + 8); g.lineTo(0, r * 1.12 - 2); g.fill();
        // highlight
        g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(-r * 0.38, -r * 0.45, r * 0.16, r * 0.28, -0.5, 0, TAU); g.fill();
        g.restore();
        // gold sparkles
        if (type.mult > 1 && Math.random() < 0.3) parts.push({ x: p.x + U.rand(-r, r), y: p.y + U.rand(-r, r), vx: 0, vy: -20, life: 0.7, c: '#fff6c0', r: 2.5, star: true });
        // squeak lines near burst (true value, but noisy)
        if (b.state === 'pump' && fr + b.noise * 0.5 > 0.68) {
          const k = Math.min(1, (fr + b.noise * 0.5 - 0.68) / 0.3);
          g.strokeStyle = `rgba(255,255,255,${0.35 + 0.5 * k})`; g.lineWidth = 3;
          for (let s = 0; s < 3; s++) {
            const a = -Math.PI * 0.85 + s * 0.35 + Math.sin(t * 9 + s) * 0.05;
            const rr = r * 1.18 + 6 + (Math.sin(t * 18 + s * 2) > 0 ? 4 : 0);
            g.beginPath(); g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); g.lineTo(Math.cos(a) * (rr + 10 + 8 * k), Math.sin(a) * (rr + 10 + 8 * k)); g.stroke();
            const a2 = -Math.PI * 0.15 - s * 0.35;
            g.beginPath(); g.moveTo(Math.cos(a2) * rr, Math.sin(a2) * rr); g.lineTo(Math.cos(a2) * (rr + 10 + 8 * k), Math.sin(a2) * (rr + 10 + 8 * k)); g.stroke();
          }
        }
        if (b.needled > 0) {
          g.font = `${Rm * 0.35}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.globalAlpha = b.needled; g.fillText('🪡', r * 0.9, -r * 0.6); g.globalAlpha = 1;
        }
        // label inside balloon
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const lbl = b.state === 'banked' ? `✓ ${b.pts}` : String(ptsFor(b.air) * type.mult);
        g.font = `900 ${Math.max(16, r * 0.42)}px -apple-system, sans-serif`;
        g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.45)'; g.strokeText(lbl, 0, 0);
        g.fillStyle = '#fff'; g.fillText(lbl, 0, 0);
        if (b.luck && b.state === 'pump') { g.font = `${Math.max(14, r * 0.3)}px sans-serif`; g.fillText('🍀', 0, -r * 0.62); }
      } else {
        // burst remains
        g.globalAlpha = 0.6;
        g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, anchorY - Rm * 0.6); g.lineTo(0, anchorY); g.stroke();
        g.fillStyle = col;
        g.beginPath(); g.moveTo(-8, anchorY - Rm * 0.6); g.lineTo(8, anchorY - Rm * 0.6); g.lineTo(3, anchorY - Rm * 0.6 - 14); g.lineTo(-5, anchorY - Rm * 0.6 - 10); g.fill();
        g.globalAlpha = 1;
        g.font = `900 ${Rm * 0.32}px -apple-system, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#ff6b6b'; g.fillText('💥 0', 0, 0);
      }
      // stress meter (unreliable!)
      if (b.state === 'pump' || b.state === 'idle') {
        const mh = Rm * 1.7, mw = Math.max(10, Rm * 0.11), mx = Rm * 1.12 + 8, my = -mh / 2;
        const shown = U.clamp(fr * 0.95 + b.noise + Math.sin(t * 3 + b.i) * 0.03, 0, 1);
        g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.roundRect(mx, my, mw, mh, mw / 2); g.fill();
        const gr = g.createLinearGradient(0, my + mh, 0, my);
        gr.addColorStop(0, '#3ddc97'); gr.addColorStop(0.55, '#ffd84d'); gr.addColorStop(1, '#ff4d6d');
        g.fillStyle = gr; g.beginPath(); g.roundRect(mx, my + mh * (1 - shown), mw, mh * shown, mw / 2); g.fill();
        g.font = `${Math.max(14, mw * 1.6)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('😰', mx + mw / 2, my - mw * 1.3);
      }
      g.restore();
    }

    ctx.loop((dt, now) => {
      const t = now / 1000;
      if (dt > 0) update(dt);
      if (dt > 0) {
        for (const p of parts) { p.life -= dt * 1.3; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; p.rot += dt * 8; }
        parts = parts.filter(p => p.life > 0);
        for (const r of rings) r.t += dt * 1.8;
        rings = rings.filter(r => r.t < 1);
        for (const f of floats) f.t += dt;
        floats = floats.filter(f => f.t < 1.8);
        flash = Math.max(0, flash - dt * 1.3);
        shake = Math.max(0, shake - dt * 40);
      }
      g.save();
      g.fillStyle = '#0f1220'; g.fillRect(0, 0, ctx.W, ctx.H);
      if (shake > 0) g.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
      const f = fieldRect();
      if (type === TYPES.heat && phase !== 'over') {
        const hg = g.createLinearGradient(0, f.y, 0, f.y + f.h);
        hg.addColorStop(0, `rgba(255,90,40,${0.12 + 0.05 * Math.sin(t * 3)})`); hg.addColorStop(0.5, 'rgba(255,90,40,.03)'); hg.addColorStop(1, `rgba(255,90,40,${0.12 + 0.05 * Math.cos(t * 3)})`);
        g.fillStyle = hg; g.fillRect(f.x, f.y, f.w, f.h);
        if (dt > 0 && Math.random() < 0.3) parts.push({ x: f.x + Math.random() * f.w, y: f.y + Math.random() * f.h, vx: 0, vy: -30, life: 0.8, c: 'rgba(255,140,60,.5)', r: 3 });
      }
      if (type.mult > 1 && phase !== 'over') {
        const gg = g.createRadialGradient(f.x + f.w / 2, f.y + f.h / 2, 0, f.x + f.w / 2, f.y + f.h / 2, Math.max(f.w, f.h) * 0.6);
        gg.addColorStop(0, 'rgba(255,207,60,.12)'); gg.addColorStop(1, 'rgba(255,207,60,0)');
        g.fillStyle = gg; g.fillRect(f.x, f.y, f.w, f.h);
      }
      // round timer ring in the center
      if (phase === 'pump') {
        const left = Math.max(0, roundEnd - ctx.time), cx = f.x + f.w / 2, cy = f.y + f.h / 2;
        const rr = Math.max(22, Math.min(f.w, f.h) * 0.045);
        const tcx = cx, tcy = N === 3 ? f.y + 56 + rr : cy;
        g.fillStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.arc(tcx, tcy, rr, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 6; g.beginPath(); g.arc(tcx, tcy, rr, 0, TAU); g.stroke();
        g.strokeStyle = left < 3 ? '#ff4d6d' : '#fff'; g.beginPath(); g.arc(tcx, tcy, rr, -Math.PI / 2, -Math.PI / 2 + TAU * left / ROUND_T); g.stroke();
        g.font = `${rr * 0.9}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('⏳', tcx, tcy + 2);
      }
      bl.forEach(b => drawBalloon(b, t));
      for (const r of rings) {
        g.strokeStyle = U.alpha(r.c, 1 - r.t); g.lineWidth = 6 * (1 - r.t) + 1;
        g.beginPath(); g.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * r.t, 0, TAU); g.stroke();
      }
      for (const p of parts) {
        g.globalAlpha = Math.min(1, p.life * 1.5); g.fillStyle = p.c;
        if (p.rag) { g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8); g.restore(); }
        else { g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill(); }
      }
      g.globalAlpha = 1;
      for (const fl of floats) {
        const p = pos[fl.i];
        g.save(); ctx.facing(g, fl.i, p.x, p.y);
        g.globalAlpha = Math.min(1, (1.8 - fl.t) * 2);
        const fs = fl.big ? Math.max(26, Rm * 0.36) : Math.max(17, Rm * 0.2);
        g.font = `900 ${fs}px -apple-system, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const y = -Rm * 0.75 - fl.t * 30;
        g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(fl.text, 0, y);
        g.fillStyle = fl.c; g.fillText(fl.text, 0, y);
        g.restore();
      }
      g.globalAlpha = 1;
      g.restore();
      if (flash > 0) { g.fillStyle = U.alpha(flashC, Math.min(0.4, flash)); g.fillRect(0, 0, ctx.W, ctx.H); }
      renderT -= dt;
      if (renderT <= 0) { renderT = 0.2; render(); }
    });
    let renderT = 0;
    render();
    ctx.dbg = { ui, bl, total, get phase() { return phase; }, get round() { return round; } }; // for automated tests
  },
});
