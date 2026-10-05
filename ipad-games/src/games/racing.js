registerGame({
  id: 'racing',
  title: 'Гонки',
  emoji: '🏎️',
  desc: '3 круга, ящики с сюрпризами и дождь',
  rules: 'Машина газует сама. Держи ◀ или ▶, чтобы поворачивать (◀ против часовой, ▶ по часовой).\n' +
    'Трава сильно тормозит. Машины толкаются. Нужно проехать 3 круга через все чекпоинты: срезать не выйдет.\n' +
    'Собирай ❓ ящики и жми ПРЕДМЕТ:\n' +
    '🚀 Турбо  🍌 Банан (бросаешь назад, кто наедет — крутится)\n' +
    '🛢️ Масло (лужа назад, на ней заносит)  🛡️ Щит от всех ловушек\n' +
    '🧲 Магнит (тянет к сопернику впереди)  ⚡ Молния (тормозит всех соперников)\n' +
    '🆘 Отстающий получает предметы лучше и чуть быстрее едет.\n' +
    '🌧️ Иногда начинается дождь: трасса становится скользкой.\n' +
    'Кто первым проедет 3 круга, тот победил.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const P = ctx.players, N = ctx.n;
    const DEPTH = 0.2, LAPS = 3, NCP = 16, TAU = Math.PI * 2;
    const ITEMS = {
      turbo: { icon: '🚀', name: 'Турбо!', c: '#ff9a3c' },
      banana: { icon: '🍌', name: 'Банан!', c: '#ffe14d' },
      oil: { icon: '🛢️', name: 'Масло!', c: '#8a7cff' },
      shield: { icon: '🛡️', name: 'Щит!', c: '#7fe7ff' },
      magnet: { icon: '🧲', name: 'Магнит!', c: '#ff7ad9' },
      bolt: { icon: '⚡', name: 'Молния!', c: '#fff36b' },
    };
    const WEIGHTS = {
      lead: { banana: 4, oil: 3, shield: 3, turbo: 1 },
      mid: { turbo: 3, banana: 2, oil: 2, magnet: 2, shield: 1, bolt: 1 },
      last: { turbo: 4, magnet: 3, bolt: 3, shield: 1 },
    };

    ctx.root.classList.add('g-racing');
    ctx.root.append(U.h('style', null, `
      .g-racing .zone-inner{display:flex;align-items:stretch;gap:1.4vmin;padding:1.4vmin}
      .g-racing .cb{flex:1 1 0;max-width:24vmin;min-width:0;border-radius:3vmin;border:.5vmin solid var(--pc);color:var(--pc);
        background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;
        font-size:8vmin;font-weight:900;touch-action:none;transition:transform .07s,background .07s,box-shadow .07s}
      .g-racing .cb.on{background:var(--pc);color:#0f1220;transform:scale(.95);box-shadow:0 0 3.5vmin var(--pc)}
      .g-racing .mid{flex:1.8 1 0;min-width:0;display:flex;flex-direction:column;gap:1vmin}
      .g-racing .info{display:flex;align-items:center;justify-content:space-between;gap:1vmin;color:#fff;
        font-weight:900;pointer-events:none;padding:0 .6vmin;height:4.8vmin;font-size:3vmin;white-space:nowrap}
      .g-racing .info .pos{color:var(--pc);font-size:3.4vmin}
      .g-racing .info .note{font-size:3vmin;min-width:0;overflow:hidden}
      .g-racing .item{flex:1 1 auto;max-width:none;flex-direction:column;gap:.3vmin;font-size:3vmin;letter-spacing:.2vmin;position:relative}
      .g-racing .item .ic{font-size:6.5vmin;line-height:1;min-height:6.5vmin}
      .g-racing .item.has{background:rgba(255,255,255,.14);box-shadow:0 0 2.5vmin var(--pc);animation:rcPulse .8s ease-in-out infinite alternate}
      .g-racing .item.rolling .ic{animation:rcRoll .12s linear infinite}
      @keyframes rcPulse{from{box-shadow:0 0 1vmin var(--pc)}to{box-shadow:0 0 4vmin var(--pc)}}
      @keyframes rcRoll{from{transform:translateY(-15%)}to{transform:translateY(15%)}}
      .g-racing .zone-inner.flash{animation:rcFlash .6s ease-out}
      @keyframes rcFlash{from{background:rgba(255,255,255,.35)}to{background:transparent}}
    `));

    const C = ctx.canvas();
    const g = C.g;
    let bg = null; // offscreen static track

    /* ---------- geometry ---------- */
    let F = { x: 0, y: 0, w: 100, h: 100 }, T = {};
    function fieldRect() {
      const d = Math.round(DEPTH * Math.min(ctx.W, ctx.H));
      const s = P.map(p => p.side);
      const l = s.includes('left') ? d : 0, r = s.includes('right') ? d : 0;
      const t = s.includes('top') ? d : 0, b = s.includes('bottom') ? d : 0;
      const m = 8, el = N === 2 ? 44 : 0, et = N === 3 ? 44 : 0; // keep the exit button spot free
      return { x: l + m + el, y: t + m + et, w: Math.max(150, ctx.W - l - r - 2 * m - el), h: Math.max(150, ctx.H - t - b - 2 * m - et) };
    }
    function buildTrack() {
      const hw = Math.max(26, Math.min(F.w, F.h) * 0.1);
      const cx = F.x + F.w / 2, cy = F.y + F.h / 2;
      const a = F.w / 2 - hw - 12, b = F.h / 2 - hw - 12;
      const rc = Math.min(a, b) * 0.78;
      const L = 4 * (a - rc) + 4 * (b - rc) + TAU * rc;
      const land = a >= b;
      T = { hw, cx, cy, a, b, rc, L, land, a0: land ? Math.PI / 2 : 0,
        vmax: L / 12, carL: hw * 0.7, carW: hw * 0.4 };
      T.cr = T.carL * 0.45;
    }
    // point on centerline at arc length s (clockwise on screen, from the top-left end of the top straight)
    function pointAt(s) {
      const { a, b, rc, cx, cy } = T;
      const sa = 2 * (a - rc), sb = 2 * (b - rc), q = Math.PI / 2 * rc;
      s = ((s % T.L) + T.L) % T.L;
      const segs = [
        [sa, (d) => [-a + rc + d, -b, 0]],
        [q, (d) => { const t = -Math.PI / 2 + d / rc; return [a - rc + Math.cos(t) * rc, -b + rc + Math.sin(t) * rc, t + Math.PI / 2]; }],
        [sb, (d) => [a, -b + rc + d, Math.PI / 2]],
        [q, (d) => { const t = d / rc; return [a - rc + Math.cos(t) * rc, b - rc + Math.sin(t) * rc, t + Math.PI / 2]; }],
        [sa, (d) => [a - rc - d, b, Math.PI]],
        [q, (d) => { const t = Math.PI / 2 + d / rc; return [-a + rc + Math.cos(t) * rc, b - rc + Math.sin(t) * rc, t + Math.PI / 2]; }],
        [sb, (d) => [-a, b - rc - d, -Math.PI / 2]],
        [q, (d) => { const t = Math.PI + d / rc; return [-a + rc + Math.cos(t) * rc, -b + rc + Math.sin(t) * rc, t + Math.PI / 2]; }],
      ];
      for (const [len, f] of segs) {
        if (s <= len) { const [x, y, ang] = f(s); return { x: cx + x, y: cy + y, ang }; }
        s -= len;
      }
      return { x: cx - a + rc, y: cy - b, ang: 0 };
    }
    // s of the start line (middle of the longest straight)
    const startS = () => T.land ? 2 * (T.a - T.rc) + Math.PI / 2 * T.rc + 2 * (T.b - T.rc) + Math.PI / 2 * T.rc + (T.a - T.rc)
      : 2 * (T.a - T.rc) + Math.PI / 2 * T.rc + (T.b - T.rc);
    function sd(x, y) {
      const px = x - T.cx, py = y - T.cy;
      const qx = Math.abs(px) - T.a + T.rc, qy = Math.abs(py) - T.b + T.rc;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - T.rc;
    }
    const onTrack = (x, y, k = 1) => Math.abs(sd(x, y)) < T.hw * k;
    function frac(x, y) {
      let f = (Math.atan2(y - T.cy, x - T.cx) - T.a0) / TAU;
      f -= Math.floor(f);
      return f;
    }

    function drawStatic() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      bg = document.createElement('canvas');
      bg.width = Math.round(ctx.W * dpr); bg.height = Math.round(ctx.H * dpr);
      const b = bg.getContext('2d');
      b.setTransform(dpr, 0, 0, dpr, 0, 0);
      b.fillStyle = '#0f1220'; b.fillRect(0, 0, ctx.W, ctx.H);
      // grass with stripes
      b.fillStyle = '#1d4a2c';
      b.beginPath(); b.roundRect(F.x, F.y, F.w, F.h, 16); b.fill();
      b.save(); b.clip();
      b.fillStyle = 'rgba(255,255,255,.035)';
      for (let k = -F.h; k < F.w; k += 36) {
        b.beginPath(); b.moveTo(F.x + k, F.y); b.lineTo(F.x + k + 18, F.y); b.lineTo(F.x + k + 18 + F.h, F.y + F.h); b.lineTo(F.x + k + F.h, F.y + F.h); b.fill();
      }
      for (let k = 0; k < 40; k++) {
        const x = F.x + Math.random() * F.w, y = F.y + Math.random() * F.h;
        if (onTrack(x, y, 1.3)) continue;
        b.font = `${T.hw * 0.5}px sans-serif`; b.globalAlpha = 0.5;
        b.fillText(Math.random() < 0.5 ? '🌳' : '🌿', x, y);
      }
      b.globalAlpha = 1;
      b.restore();
      const path = new Path2D();
      path.roundRect(T.cx - T.a, T.cy - T.b, T.a * 2, T.b * 2, T.rc);
      // curbs
      b.lineJoin = 'round';
      b.strokeStyle = '#e8ecff'; b.lineWidth = T.hw * 2 + 12; b.stroke(path);
      b.strokeStyle = '#ff4d5e'; b.setLineDash([16, 16]); b.stroke(path); b.setLineDash([]);
      // asphalt
      b.strokeStyle = '#3a3f55'; b.lineWidth = T.hw * 2; b.stroke(path);
      b.strokeStyle = 'rgba(255,255,255,.04)'; b.lineWidth = T.hw * 1.2; b.stroke(path);
      // center dashes
      b.strokeStyle = 'rgba(255,255,255,.35)'; b.lineWidth = 3; b.setLineDash([22, 22]); b.stroke(path); b.setLineDash([]);
      // start line (checkered)
      const sp = pointAt(startS());
      b.save(); b.translate(sp.x, sp.y); b.rotate(sp.ang + Math.PI / 2);
      const cs = T.hw / 4;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) {
        b.fillStyle = (i + j) % 2 ? '#111' : '#fff';
        b.fillRect(-T.hw + i * cs, -cs + j * cs, cs, cs);
      }
      b.restore();
      // direction arrows
      for (let k = 1; k < 8; k++) {
        const p = pointAt(startS() + T.L * k / 8);
        b.save(); b.translate(p.x, p.y); b.rotate(p.ang);
        b.fillStyle = 'rgba(255,255,255,.12)';
        b.beginPath(); b.moveTo(T.hw * 0.35, 0); b.lineTo(-T.hw * 0.15, -T.hw * 0.3); b.lineTo(-T.hw * 0.15, T.hw * 0.3); b.fill();
        b.restore();
      }
    }

    let firstLayout = true;
    function layout() {
      const oF = F;
      F = fieldRect();
      buildTrack();
      drawStatic();
      boxes.forEach(bx => { const p = pointAt(bx.s); const n = { x: -Math.sin(p.ang), y: Math.cos(p.ang) }; bx.x = p.x + n.x * bx.lat * T.hw; bx.y = p.y + n.y * bx.lat * T.hw; });
      if (firstLayout) { firstLayout = false; return; }
      const map = (o) => { o.x = F.x + (o.x - oF.x) / oF.w * F.w; o.y = F.y + (o.y - oF.y) / oF.h * F.h; };
      cars.forEach(c => { map(c); c.vx *= F.w / oF.w; c.vy *= F.h / oF.h; });
      hazards.forEach(map); parts.forEach(map); skids.forEach(map);
    }

    /* ---------- state ---------- */
    const cars = P.map(p => ({
      i: p.i, c: p.color, x: 0, y: 0, ang: 0, vx: 0, vy: 0, spd: 0,
      cps: 0, finished: false, item: null, rolling: 0, rollIcon: '❓',
      turbo: 0, spin: 0, oil: 0, shield: 0, magnet: 0, slow: 0, bump: 0, warned: 0, lastLapSaid: false, grass: 0,
    }));
    let boxes = [], hazards = [], parts = [], skids = [], floats = [];
    let rain = 0, rainDrops = [], ended = false, raceT = 0, flashA = 0, flashC = '#fff', shake = 0;
    for (const sf of [0.3, 0.72]) for (const lat of [-0.55, 0, 0.55]) boxes.push({ sfrac: sf, lat, s: 0, x: 0, y: 0, cd: 0 });

    layout();
    function placeBoxes() { boxes.forEach(b => { b.s = startS() + T.L * b.sfrac; }); layout(); }
    placeBoxes();
    ctx.onResize(() => { layout(); });

    function gridStart() {
      const st = pointAt(startS());
      const fwd = { x: Math.cos(st.ang), y: Math.sin(st.ang) }, nrm = { x: -fwd.y, y: fwd.x };
      const lats = N === 2 ? [-0.45, 0.45] : [-0.6, 0, 0.6];
      const order = U.shuffle(cars.map((_, i) => i));
      order.forEach((ci, k) => {
        const c = cars[ci], back = T.carL * 1.6;
        c.x = st.x - fwd.x * back + nrm.x * lats[k] * T.hw;
        c.y = st.y - fwd.y * back + nrm.y * lats[k] * T.hw;
        c.ang = st.ang;
      });
    }
    gridStart();

    /* ---------- progress ---------- */
    const sector = (c) => Math.floor(frac(c.x, c.y) * NCP) % NCP;
    const lapOf = (c) => Math.max(0, Math.floor((c.cps - 1) / NCP));
    function key(c) {
      if (c.finished) return 1e6 - c.finishT;
      const f = frac(c.x, c.y) * NCP;
      const cur = Math.floor(f) % NCP, exp = (c.cps - 1 + NCP) % NCP;
      return c.cps + (c.cps > 0 && cur === exp ? f - Math.floor(f) : 0);
    }
    function ranks() {
      const order = cars.slice().sort((a, b) => key(b) - key(a));
      const r = [];
      order.forEach((c, k) => { r[c.i] = k; });
      return r;
    }
    let rank = cars.map((_, i) => i);

    /* ---------- UI ---------- */
    const allBtns = [];
    function holdBtn(label) {
      const b = U.h('div', { class: 'cb' }, label);
      b.ids = new Set();
      ctx.pointer(b, {
        down: (id) => { b.ids.add(id); b.classList.add('on'); },
        up: (id) => { b.ids.delete(id); if (!b.ids.size) b.classList.remove('on'); },
      });
      allBtns.push(b);
      return b;
    }
    const releaseAll = (e) => allBtns.forEach(b => { if (b.ids.delete(e.pointerId) && !b.ids.size) b.classList.remove('on'); });
    window.addEventListener('pointerup', releaseAll);
    window.addEventListener('pointercancel', releaseAll);
    ctx.onCleanup(() => { window.removeEventListener('pointerup', releaseAll); window.removeEventListener('pointercancel', releaseAll); });

    const ui = P.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH });
      z.el.style.background = `linear-gradient(0deg, ${U.alpha(p.color, .22)}, ${U.alpha(p.color, .05)})`;
      z.el.style.borderTop = `2px solid ${U.alpha(p.color, .6)}`;
      const L = holdBtn('◀︎'), R = holdBtn('▶︎');
      const ic = U.h('div', { class: 'ic' }, '');
      const lbl = U.h('div', null, 'ПРЕДМЕТ');
      const item = U.h('div', { class: 'cb item' }, ic, lbl);
      ctx.tap(item, () => useItem(p.i));
      const pos = U.h('div', { class: 'pos' }), lap = U.h('div'), note = U.h('div', { class: 'note' });
      const mid = U.h('div', { class: 'mid' }, U.h('div', { class: 'info' }, pos, note, lap), item);
      z.el.append(L, mid, R);
      return { z, L, R, item, ic, lbl, pos, lap, note, cache: {} };
    });
    const MEDAL = ['🥇 1-й', '🥈 2-й', '🥉 3-й'];
    function renderUI() {
      cars.forEach((c, i) => {
        const u = ui[i], k = u.cache;
        const pos = MEDAL[rank[i]];
        if (k.pos !== pos) { k.pos = pos; u.pos.textContent = pos; }
        const lap = c.finished ? '🏁 финиш' : `🏁 ${Math.min(LAPS, lapOf(c) + 1)}/${LAPS}`;
        if (k.lap !== lap) { k.lap = lap; u.lap.textContent = lap; }
        let note = '';
        if (rain > 0) note = '🌧️';
        if (rank[i] === N - 1 && !c.finished) note += '🆘';
        if (k.note !== note) { k.note = note; u.note.textContent = note; }
        const ic = c.rolling > 0 ? c.rollIcon : c.item ? ITEMS[c.item].icon : '';
        if (k.ic !== ic) { k.ic = ic; u.ic.textContent = ic; }
        const lbl = c.rolling > 0 ? '…' : c.item ? 'ЖМИ!' : 'ПРЕДМЕТ';
        if (k.lbl !== lbl) { k.lbl = lbl; u.lbl.textContent = lbl; }
        u.item.classList.toggle('has', !!c.item && c.rolling <= 0);
        u.item.classList.toggle('rolling', c.rolling > 0);
      });
    }
    function zoneFlash(i) { const el = ui[i].z.el; el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }

    /* ---------- effects ---------- */
    function burst(x, y, color, n, sp, size, life) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, s = U.rand(sp * 0.3, sp);
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life || 1, c: color, r: U.rand(size * 0.5, size) });
      }
    }
    function floatText(i, x, y, text, color) { floats.push({ i, x, y, text, c: color || '#fff', t: 0 }); }
    function say(text, o) { return ctx.toast(text, Object.assign({ ms: 1500, offset: Math.min(F.w, F.h) * (N === 2 ? 0.16 : 0.22) }, o || {})); }

    /* ---------- items ---------- */
    function rollItem(c) {
      const r = rank[c.i];
      const w = r === 0 ? WEIGHTS.lead : r === N - 1 ? WEIGHTS.last : WEIGHTS.mid;
      let tot = 0; for (const k in w) tot += w[k];
      let x = Math.random() * tot;
      for (const k in w) { x -= w[k]; if (x <= 0) return k; }
      return 'turbo';
    }
    function behind(c, d) { return { x: c.x - Math.cos(c.ang) * d, y: c.y - Math.sin(c.ang) * d }; }
    function aheadOf(c) {
      const order = cars.slice().sort((a, b) => key(b) - key(a));
      const k = order.indexOf(c);
      return k > 0 ? order[k - 1] : null;
    }
    function useItem(i) {
      const c = cars[i];
      if (!c.item || c.rolling > 0 || ended || c.finished) return;
      const it = c.item; c.item = null;
      const info = ITEMS[it];
      floatText(i, c.x, c.y - T.carL, `${info.icon} ${info.name}`, info.c);
      if (it === 'turbo') { c.turbo = 2.0; burst(c.x, c.y, '#ff9a3c', 16, 220, 4); }
      if (it === 'banana') { const p = behind(c, T.carL * 1.1); hazards.push({ k: 'banana', x: p.x, y: p.y, r: T.hw * 0.28, owner: i, t: 0, life: 40 }); }
      if (it === 'oil') { const p = behind(c, T.carL * 1.4); hazards.push({ k: 'oil', x: p.x, y: p.y, r: T.hw * 0.62, owner: i, t: 0, life: 12 }); }
      if (it === 'shield') { c.shield = 6; }
      if (it === 'magnet') {
        c.magnet = 2.6;
        const tg = aheadOf(c);
        if (!tg) floatText(i, c.x, c.y, 'впереди никого 🙂', '#fff');
      }
      if (it === 'bolt') {
        flashA = 0.6; flashC = '#fff36b'; shake = 8;
        say(`⚡ ${P[i].name}: молния!`, { color: '#fff36b', fg: '#111', ms: 1300 });
        cars.forEach(o => {
          if (o === c || o.finished) return;
          if (o.shield > 0) { floatText(o.i, o.x, o.y - T.carL, '🛡️ отбито!', '#7fe7ff'); return; }
          o.slow = 2.4; o.spd *= 0.5;
          burst(o.x, o.y, '#fff36b', 18, 260, 4);
        });
      }
      renderUI();
    }

    /* ---------- events ---------- */
    let rainPlanned = U.rand(10, 22);
    function startRain() {
      rain = 15;
      say('🌧️ Дождь! Трасса скользкая', { color: '#5aa9ff', fg: '#fff', ms: 1900 });
      flashA = 0.3; flashC = '#5aa9ff';
    }
    ctx.after(1, () => say('ГАЗ! 🏁', { color: '#3ddc97', fg: '#111', ms: 900 }));

    function finish(c) {
      c.finished = true; c.finishT = raceT;
      if (ended) return;
      ended = true;
      flashA = 0.6; flashC = c.c;
      burst(c.x, c.y, c.c, 70, 500, 6, 1.4);
      burst(c.x, c.y, '#fff', 40, 400, 4, 1.4);
      say(`🏁 ${P[c.i].name} побеждает!`, { color: c.c, fg: '#111', ms: 1800 });
      const sc = cars.map(o => Math.min(LAPS, lapOf(o)));
      ctx.after(1900, () => ctx.end({ winner: c.i, scores: sc, msg: 'Первым проехал 3 круга' }));
    }

    /* ---------- simulation ---------- */
    function hitHazard(c, h) {
      if (c.shield > 0) { floatText(c.i, c.x, c.y - T.carL, '🛡️ щит спас!', '#7fe7ff'); burst(h.x, h.y, '#7fe7ff', 12, 200, 3); return true; }
      if (h.k === 'banana') {
        c.spin = 1.1; c.spd *= 0.3; shake = 6;
        floatText(c.i, c.x, c.y - T.carL, '🍌 Занесло!', '#ffe14d');
        burst(h.x, h.y, '#ffe14d', 18, 250, 4);
        return true;
      }
      if (h.k === 'oil') {
        if (c.oil <= 0) floatText(c.i, c.x, c.y - T.carL, '🛢️ Скользко!', '#b9b0ff');
        c.oil = 0.9;
        return false;
      }
      return false;
    }
    function update(dt) {
      raceT += dt;
      if (rainPlanned > 0 && raceT > rainPlanned) { rainPlanned = -1; startRain(); }
      rain = Math.max(0, rain - dt);
      if (rain > 0 && rain - dt <= 0) say('☀️ Дождь кончился', { ms: 1200 });
      rank = ranks();
      const lastI = cars.findIndex((_, i) => rank[i] === N - 1);
      for (const c of cars) {
        for (const k of ['turbo', 'spin', 'oil', 'shield', 'magnet', 'slow', 'bump', 'warned']) c[k] = Math.max(0, c[k] - dt);
        if (c.rolling > 0) {
          c.rolling -= dt;
          if (Math.random() < dt * 14) c.rollIcon = ITEMS[U.pick(Object.keys(ITEMS))].icon;
          if (c.rolling <= 0) {
            zoneFlash(c.i);
            if (rank[c.i] === N - 1 && N > 1 && (c.item === 'bolt' || c.item === 'magnet' || c.item === 'turbo'))
              floatText(c.i, c.x, c.y - T.carL, '🆘 Удачный ящик!', '#fff');
          }
        }
        const u = ui[c.i];
        let steer = 0;
        if (u.L.ids.size) steer -= 1;
        if (u.R.ids.size) steer += 1;
        const on = onTrack(c.x, c.y);
        const rb = (c.i === lastI && N > 1 && !c.finished) ? 1.05 : 1;
        let vmax = T.vmax * rb;
        if (!on && c.turbo <= 0 && c.magnet <= 0) vmax *= 0.4;
        if (c.turbo > 0) vmax *= 1.65;
        if (c.slow > 0) vmax *= 0.55;
        if (c.finished) vmax *= 0.5;
        const acc = c.spd < vmax ? T.vmax * 0.9 : T.vmax * (on ? 1.2 : 2.6);
        c.spd += U.clamp(vmax - c.spd, -acc * dt, acc * dt);
        if (c.spin > 0) {
          c.ang += dt * 13;
        } else {
          const turn = 2.7 * (c.oil > 0 ? 0.35 : 1) * (0.6 + 0.4 * Math.min(1, c.spd / T.vmax));
          c.ang += steer * turn * dt;
        }
        let grip = rain > 0 ? 2.3 : 9;
        if (c.oil > 0) grip = 0.9;
        if (c.spin > 0) grip = 1.5;
        const hx = Math.cos(c.ang), hy = Math.sin(c.ang);
        let tx = hx * c.spd, ty = hy * c.spd;
        if (c.magnet > 0) {
          const tg = aheadOf(c);
          if (tg) {
            const dx = tg.x - c.x, dy = tg.y - c.y, d = Math.hypot(dx, dy) || 1;
            tx += dx / d * T.vmax * 0.5; ty += dy / d * T.vmax * 0.5;
            if (Math.random() < dt * 20) parts.push({ x: c.x + dx * Math.random(), y: c.y + dy * Math.random(), vx: 0, vy: 0, life: 0.5, c: '#ff7ad9', r: 3 });
          }
        }
        const k = Math.min(1, grip * dt);
        c.vx += (tx - c.vx) * k; c.vy += (ty - c.vy) * k;
        c.x += c.vx * dt; c.y += c.vy * dt;
        // field bounds
        if (c.x < F.x + T.cr) { c.x = F.x + T.cr; c.vx = Math.abs(c.vx) * 0.4; }
        if (c.x > F.x + F.w - T.cr) { c.x = F.x + F.w - T.cr; c.vx = -Math.abs(c.vx) * 0.4; }
        if (c.y < F.y + T.cr) { c.y = F.y + T.cr; c.vy = Math.abs(c.vy) * 0.4; }
        if (c.y > F.y + F.h - T.cr) { c.y = F.y + F.h - T.cr; c.vy = -Math.abs(c.vy) * 0.4; }
        // effects
        const slip = Math.hypot(c.vx - hx * c.spd, c.vy - hy * c.spd);
        if (slip > T.vmax * 0.35 && skids.length < 600 && on) skids.push({ x: c.x, y: c.y, a: 0.5 });
        if (!on && c.spd > 30 && Math.random() < dt * 25) parts.push({ x: c.x, y: c.y, vx: U.rand(-40, 40), vy: U.rand(-40, 40), life: 0.7, c: Math.random() < 0.5 ? '#6b8f3a' : '#8a6a3c', r: U.rand(2, 5) });
        if (c.turbo > 0 && Math.random() < dt * 50) {
          const b = behind(c, T.carL * 0.55);
          parts.push({ x: b.x, y: b.y, vx: -hx * 120 + U.rand(-30, 30), vy: -hy * 120 + U.rand(-30, 30), life: 0.45, c: Math.random() < 0.5 ? '#ffcf3c' : '#ff6a3c', r: U.rand(3, 6) });
        }
        // checkpoints
        if (!c.finished && sd(c.x, c.y) > -T.hw * 1.6) {
          const s = sector(c), exp = c.cps % NCP;
          if (s === exp) {
            c.cps++;
            if (c.cps > 1 && (c.cps - 1) % NCP === 0) {
              const lapsDone = (c.cps - 1) / NCP;
              if (lapsDone >= LAPS) { finish(c); continue; }
              zoneFlash(c.i);
              if (lapsDone === LAPS - 1) {
                floatText(c.i, c.x, c.y - T.carL, '🏁 Последний круг!', '#fff');
              } else floatText(c.i, c.x, c.y - T.carL, `Круг ${lapsDone + 1}!`, '#fff');
            }
          } else if (c.cps > 0 && ((s - exp + NCP) % NCP) >= 2 && ((s - exp + NCP) % NCP) <= NCP / 2 && c.warned <= 0) {
            c.warned = 2.5;
            floatText(c.i, c.x, c.y - T.carL, '↩ Срезал! Вернись', '#ff4d6d');
          }
        }
        // item boxes
        for (const bx of boxes) {
          if (bx.cd > 0) continue;
          if (U.dist(c.x, c.y, bx.x, bx.y) < T.cr + T.hw * 0.2) {
            bx.cd = 3;
            burst(bx.x, bx.y, '#ffd84d', 14, 220, 4);
            if (!c.item && c.rolling <= 0 && !c.finished) { c.item = rollItem(c); c.rolling = 0.8; }
          }
        }
        // hazards
        for (const h of hazards) {
          if (h.dead) continue;
          if (h.owner === c.i && h.t < 1) continue;
          if (U.dist(c.x, c.y, h.x, h.y) < h.r + T.cr * 0.7) { if (hitHazard(c, h) && h.k === 'banana') h.dead = true; }
        }
      }
      // car collisions
      for (let a = 0; a < cars.length; a++) for (let b = a + 1; b < cars.length; b++) {
        const A = cars[a], B = cars[b];
        const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), md = T.cr * 2;
        if (d < md && d > 0.01) {
          const nx = dx / d, ny = dy / d, ov = md - d;
          const wa = A.shield > 0 && B.shield <= 0 ? 0.15 : B.shield > 0 && A.shield <= 0 ? 0.85 : 0.5;
          A.x -= nx * ov * wa; A.y -= ny * ov * wa; B.x += nx * ov * (1 - wa); B.y += ny * ov * (1 - wa);
          const rv = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
          if (rv < 0) {
            const j = -rv * 1.3;
            A.vx -= nx * j * wa * 2; A.vy -= ny * j * wa * 2;
            B.vx += nx * j * (1 - wa) * 2; B.vy += ny * j * (1 - wa) * 2;
            if (-rv > 40 && A.bump <= 0) {
              A.bump = B.bump = 0.3; shake = Math.max(shake, 4);
              burst(A.x + nx * T.cr, A.y + ny * T.cr, '#ffe9a8', 12, 260, 3, 0.6);
            }
          }
        }
      }
      for (const bx of boxes) bx.cd = Math.max(0, bx.cd - dt);
      for (const h of hazards) { h.t += dt; if (h.t > h.life) h.dead = true; }
      hazards = hazards.filter(h => !h.dead);
      for (const s of skids) s.a -= dt * 0.12;
      skids = skids.filter(s => s.a > 0);
      if (raceT > 170 && !ended) {
        const best = cars.slice().sort((a, b) => key(b) - key(a))[0];
        finish(best);
      }
    }

    /* ---------- drawing ---------- */
    function drawCar(c, t) {
      const L = T.carL, W = T.carW;
      g.save(); g.translate(c.x, c.y); g.rotate(c.ang);
      // shadow + glow
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.roundRect(-L / 2 + 3, -W / 2 + 4, L, W, W * 0.35); g.fill();
      const gl = g.createRadialGradient(0, 0, 2, 0, 0, L);
      gl.addColorStop(0, U.alpha(c.c, 0.35)); gl.addColorStop(1, U.alpha(c.c, 0));
      g.fillStyle = gl; g.beginPath(); g.arc(0, 0, L, 0, TAU); g.fill();
      if (c.slow > 0) g.scale(0.75, 0.75);
      // wheels
      g.fillStyle = '#111';
      for (const sx of [-0.3, 0.3]) for (const sy of [-1, 1]) g.fillRect(sx * L - L * 0.12, sy * W * 0.5 - W * 0.14, L * 0.24, W * 0.28);
      // body
      g.fillStyle = c.c; g.beginPath(); g.roundRect(-L / 2, -W / 2, L, W, W * 0.35); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(-L * 0.06, -W / 2, L * 0.06, W); // stripe
      g.fillStyle = 'rgba(20,30,60,.85)'; g.beginPath(); g.roundRect(L * 0.06, -W * 0.36, L * 0.2, W * 0.72, 3); g.fill();
      g.fillStyle = '#fff8c0'; g.fillRect(L / 2 - 3, -W * 0.42, 3, W * 0.2); g.fillRect(L / 2 - 3, W * 0.22, 3, W * 0.2);
      g.restore();
      if (c.shield > 0) {
        const blink = c.shield < 1.2 ? (Math.sin(t * 20) > 0 ? 1 : 0.3) : 1;
        g.strokeStyle = U.alpha('#7fe7ff', 0.85 * blink); g.lineWidth = 3;
        g.fillStyle = U.alpha('#7fe7ff', 0.12 * blink);
        g.beginPath(); g.arc(c.x, c.y, L * 0.72, 0, TAU); g.fill(); g.stroke();
      }
      if (c.slow > 0) {
        g.save(); g.translate(c.x, c.y); g.font = `${L * 0.6}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('⚡', Math.sin(t * 30) * 3, -L * 0.6); g.restore();
      }
    }

    ctx.loop((dt, now) => {
      const t = now / 1000;
      if (dt > 0 && !ended) update(dt);
      else if (dt > 0) { for (const c of cars) { c.x += c.vx * dt * 0.6; c.y += c.vy * dt * 0.6; c.vx *= 0.97; c.vy *= 0.97; } }
      if (dt > 0) {
        for (const p of parts) { p.life -= dt * 1.6; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; }
        parts = parts.filter(p => p.life > 0);
        if (parts.length > 500) parts.splice(0, parts.length - 500);
        for (const f of floats) f.t += dt;
        floats = floats.filter(f => f.t < 1.6);
        flashA = Math.max(0, flashA - dt * 1.2);
        shake = Math.max(0, shake - dt * 30);
      }
      g.save();
      if (shake > 0) g.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
      if (bg) g.drawImage(bg, 0, 0, ctx.W, ctx.H);
      if (rain > 0) {
        g.fillStyle = `rgba(40,80,160,${0.18 * Math.min(1, rain)})`;
        g.fillRect(F.x, F.y, F.w, F.h);
      }
      // skids
      g.fillStyle = 'rgba(0,0,0,.5)';
      for (const s of skids) { g.globalAlpha = s.a; g.fillRect(s.x - 2, s.y - 2, 4, 4); }
      g.globalAlpha = 1;
      // boxes
      for (const bx of boxes) {
        if (bx.cd > 0) continue;
        const s = T.hw * 0.38, bob = Math.sin(t * 4 + bx.x) * 2;
        g.save(); g.translate(bx.x, bx.y + bob); g.rotate(Math.sin(t * 2 + bx.y) * 0.25);
        g.fillStyle = U.alpha('#ffd84d', 0.25 + 0.15 * Math.sin(t * 6)); g.beginPath(); g.arc(0, 0, s * 1.2, 0, TAU); g.fill();
        const gr = g.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
        gr.addColorStop(0, '#ffe680'); gr.addColorStop(1, '#ff9f1c');
        g.fillStyle = gr; g.beginPath(); g.roundRect(-s / 2, -s / 2, s, s, 4); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
        g.fillStyle = '#7a3b00'; g.font = `900 ${s * 0.75}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('?', 0, 1);
        g.restore();
      }
      // hazards
      for (const h of hazards) {
        const fade = Math.min(1, (h.life - h.t) / 1.5);
        g.globalAlpha = fade;
        if (h.k === 'oil') {
          g.fillStyle = 'rgba(20,10,40,.85)';
          g.beginPath(); g.ellipse(h.x, h.y, h.r, h.r * 0.8, h.x, 0, TAU); g.fill();
          const sh = g.createRadialGradient(h.x - h.r * 0.3, h.y - h.r * 0.3, 2, h.x, h.y, h.r);
          sh.addColorStop(0, 'rgba(160,120,255,.6)'); sh.addColorStop(0.5, 'rgba(80,200,255,.25)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = sh; g.fill();
        } else {
          g.font = `${h.r * 2.2}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('🍌', h.x, h.y);
        }
        g.globalAlpha = 1;
      }
      for (const c of cars) drawCar(c, t);
      for (const p of parts) {
        g.globalAlpha = Math.min(1, p.life * 1.5); g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
      // rain
      if (rain > 0) {
        while (rainDrops.length < 120) rainDrops.push({ x: Math.random(), y: Math.random(), s: U.rand(0.6, 1.2) });
        g.strokeStyle = 'rgba(170,200,255,.45)'; g.lineWidth = 1.5;
        g.beginPath();
        for (const d of rainDrops) {
          if (dt > 0) { d.y += dt * 1.4 * d.s; d.x += dt * 0.3 * d.s; if (d.y > 1) { d.y -= 1; d.x = Math.random(); } if (d.x > 1) d.x -= 1; }
          const x = F.x + d.x * F.w, y = F.y + d.y * F.h;
          g.moveTo(x, y); g.lineTo(x - 5 * d.s, y - 16 * d.s);
        }
        g.stroke();
      }
      for (const f of floats) {
        g.save(); ctx.facing(g, f.i, f.x, f.y);
        g.globalAlpha = Math.min(1, (1.6 - f.t) * 2);
        g.font = `900 ${Math.max(17, T.hw * 0.42)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.75)';
        g.strokeText(f.text, 0, -f.t * 30); g.fillStyle = f.c; g.fillText(f.text, 0, -f.t * 30);
        g.restore();
      }
      g.globalAlpha = 1;
      g.restore();
      if (flashA > 0) { g.fillStyle = U.alpha(flashC, Math.min(0.4, flashA)); g.fillRect(0, 0, ctx.W, ctx.H); }
      uiT -= dt || 0.016;
      if (uiT <= 0) { uiT = 0.08; renderUI(); }
    });
    let uiT = 0;
    renderUI();
    ctx.dbg = { cars, ui, pointAt, frac, sd, get T() { return T; }, get rain() { return rain; }, get hazards() { return hazards; } }; // for automated tests
  },
});
