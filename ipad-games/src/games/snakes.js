registerGame({
  id: 'snakes',
  title: 'Змейки',
  emoji: '🐍',
  desc: 'Не врежься в след, лови бонусы, выживи последним',
  rules: 'Змейка ползёт сама и оставляет след. Держи ◀ или ▶ в своей зоне, чтобы поворачивать.\n' +
    'Врезался в след или в край поля: выбыл. В следах бывают дырки.\n' +
    'Бонусы на поле:\n' +
    '⚡ скорость · 🐢 соперники медленнее · 👻 призрак (сквозь следы)\n' +
    '🧽 ластик (стирает все следы) · 🦘 прыжок (спасает от одного удара)\n' +
    '🔄 соперникам руль наоборот · 📐 соперники поворачивают только углом · 🔍 толстый след\n' +
    'Раунды бывают особые: 🌀 без стен, 🚀 турбо, 🌑 тьма, 🎁 бонусный дождь.\n' +
    'Отстающий начинает раунд с прыжком в запасе. До 3 побед.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const WIN = 3;
    const DEPTH = 0.2;
    const BG = '#0f1220';
    const ARW_L = '◀︎', ARW_R = '▶︎';
    const TAU = Math.PI * 2;

    ctx.root.classList.add('g-snakes');
    ctx.root.append(U.h('style', null, `
      .g-snakes .zone-inner{display:flex;align-items:stretch;gap:1.6vmin;padding:1.5vmin}
      .g-snakes .cb{flex:1 1 0;max-width:27vmin;border-radius:3vmin;border:.5vmin solid var(--pc);color:var(--pc);
        background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;
        font-size:8vmin;font-weight:900;touch-action:none;transition:transform .07s}
      .g-snakes .cb.on{background:var(--pc);color:#0f1220;transform:scale(.95);box-shadow:0 0 3.5vmin var(--pc)}
      .g-snakes .cb.rev{border-style:dashed;animation:sn-wob .5s ease-in-out infinite alternate}
      @keyframes sn-wob{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}
      .g-snakes .info{flex:1.1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
        color:var(--pc);font-weight:900;text-align:center;pointer-events:none}
      .g-snakes .pips{font-size:4.6vmin;letter-spacing:.5vmin;line-height:1;white-space:nowrap}
      .g-snakes .st{font-size:2.4vmin;opacity:.85;margin-top:.7vmin;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
      .g-snakes .st.dead{opacity:.5}
      .g-snakes .fx{font-size:2.9vmin;min-height:3.6vmin;margin-top:.6vmin;white-space:nowrap;color:#fff;font-variant-numeric:tabular-nums;
        overflow:hidden;max-width:100%}
      .g-snakes .fx span{display:inline-block;margin:0 .4vmin;padding:.1vmin .7vmin;border-radius:1vmin;background:rgba(255,255,255,.12)}
      .g-snakes .fx span.bad{background:rgba(255,77,109,.35)}
      .g-snakes .bans{position:absolute;left:0;right:0;bottom:calc(100% + 1.2vmin);display:flex;flex-direction:column;
        align-items:center;gap:.8vmin;pointer-events:none;z-index:5}
      .g-snakes .ban{padding:.9vmin 2.2vmin;border-radius:2vmin;background:rgba(15,18,32,.78);border:.4vmin solid var(--bc);
        color:#fff;font-weight:900;font-size:3vmin;white-space:nowrap;box-shadow:0 0 3vmin var(--bc);
        animation:sn-ban 1.9s ease-out forwards}
      .g-snakes .ban.long{animation-duration:3s}
      @keyframes sn-ban{0%{transform:scale(.3);opacity:0}10%{transform:scale(1.15);opacity:1}20%{transform:scale(1)}
        80%{opacity:1}100%{opacity:0;transform:translateY(-2vmin)}}
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
      const fx = U.h('div', { class: 'fx' });
      const bans = U.h('div', { class: 'bans' });
      z.el.append(L, U.h('div', { class: 'info' }, pips, st, fx), R, bans);
      return { z, L, R, pips, st, fx, bans, fxKey: '' };
    });

    // announcement just above the player's zone, facing them
    function banner(i, text, color, long) {
      const u = ui[i];
      const b = U.h('div', { class: 'ban' + (long ? ' long' : '') }, text);
      b.style.setProperty('--bc', color || ctx.players[i].color);
      u.bans.append(b);
      while (u.bans.children.length > 2) u.bans.firstChild.remove();
      setTimeout(() => b.remove(), long ? 3100 : 2000);
    }

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

    /* ---------- power-ups & modifiers ---------- */
    const PU = {
      fast:   { em: '⚡', col: '#3ddc97', w: 3,   self: '⚡ Скорость!' },
      slow:   { em: '🐢', col: '#7bd88f', w: 2,   self: '🐢 Все медленнее!', foe: '🐢 Замедление!' },
      ghost:  { em: '👻', col: '#c9d2ff', w: 2,   self: '👻 Призрак!' },
      eraser: { em: '🧽', col: '#ffd166', w: 1.4 },
      jump:   { em: '🦘', col: '#ff9f43', w: 2,   self: '🦘 Прыжок в запасе!' },
      rev:    { em: '🔄', col: '#ff6b9a', w: 2,   self: '🔄 Путаница врагам!', foe: '🔄 Руль наоборот!' },
      square: { em: '📐', col: '#5ec8ff', w: 1.5, self: '📐 Углы врагам!', foe: '📐 Только углы!' },
      thick:  { em: '🔍', col: '#b48bff', w: 2,   self: '🔍 Толстый след!' },
    };
    const PU_KEYS = Object.keys(PU);
    function pickPU() {
      if (window.__dbgPU) return U.pick(window.__dbgPU); // test hook
      let tot = 0; for (const k of PU_KEYS) tot += PU[k].w;
      let r = Math.random() * tot;
      for (const k of PU_KEYS) { r -= PU[k].w; if (r <= 0) return k; }
      return 'fast';
    }
    const MODS = {
      none:  { name: 'Обычный раунд' },
      wrap:  { name: '🌀 Без стен!', chip: '🌀 края переносят' },
      turbo: { name: '🚀 Турбо!', chip: '🚀 турбо' },
      dark:  { name: '🌑 Тьма!', chip: '🌑 тьма' },
      rain:  { name: '🎁 Бонусный дождь!', chip: '🎁 бонусы' },
    };

    /* ---------- state ---------- */
    const wins = ctx.players.map(() => 0);
    let round = 0;
    let mod = 'none', lastMod = 'none';
    let state = 'play'; // ready | play | over
    let roundT = 0;
    let TW = 7, SPEED = 110, TURN = 3.1, LAG = 12;
    const GC = 2; // collision grid cell (logical units)
    let gw = 0, gh = 0, grid = null;
    let off = null, og = null, OK = 2;
    let fog = null, fg = null;
    let snakes = [];
    let parts = [], rings = [], pups = [];
    let nextPU = 2;
    let shake = 0, flash = 0;

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
      if (mod === 'wrap') { x = (x + FW) % FW; y = (y + FH) % FH; }
      if (x < 0 || y < 0 || x >= FW || y >= FH) return true;
      return grid[Math.floor(y / GC) * gw + Math.floor(x / GC)] === 1;
    }

    function chooseMod() {
      if (window.__dbgMod) return window.__dbgMod; // test hook
      if (round === 1 && Math.random() < 0.5) return 'none';
      const opts = ['wrap', 'turbo', 'dark', 'rain', 'none'].filter(m => m !== lastMod);
      return U.pick(opts);
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
      if (!fog) { fog = document.createElement('canvas'); fg = fog.getContext('2d'); }
      fog.width = Math.max(1, Math.round(FW / 3)); fog.height = Math.max(1, Math.round(FH / 3));
      parts = []; rings = []; pups = [];
      roundT = 0;
      nextPU = U.rand(1.5, 3);
      mod = chooseMod(); lastMod = mod;

      const edge = Math.max(TW * 6, Math.min(FW, FH) * 0.1);
      const best = Math.max(...wins);
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
          q: [], dist: 0, untilGap: S * U.rand(0.25, 0.55), gapLeft: 0,
          fx: { fast: 0, slow: 0, ghost: 0, rev: 0, square: 0, thick: 0 },
          jumps: (best > 0 && wins[p.i] < best) ? 1 : 0, air: 0, sqL: false, sqR: false,
        };
      });
      ui.forEach(u => { u.st.classList.remove('dead'); });
      setStatus();
      renderUI();
      const announce = () => {
        if (mod !== 'none') ctx.players.forEach(p => banner(p.i, MODS[mod].name, '#ffffff', true));
        snakes.forEach(s => { if (s.jumps) banner(s.i, '🆘 Фора: 🦘 прыжок', '#ff9f43', true); });
      };
      ui.forEach(u => u.bans.replaceChildren());
      if (round > 1) {
        state = 'ready';
        say(`Раунд ${round}`, { ms: 1100, size: 30 });
        announce();
        ctx.after(1500, () => {
          state = 'play';
          say('Вперёд!', { ms: 700, color: '#3ddc97', fg: '#0f1220' });
        });
      } else {
        state = 'play';
        ctx.onStart = announce;
      }
    }

    function setStatus() {
      ui.forEach((u, i) => {
        const s = snakes[i];
        if (s && !s.alive) return;
        u.st.textContent = mod !== 'none' ? MODS[mod].chip : 'в игре';
      });
    }

    function renderUI() {
      ui.forEach((u, i) => {
        let s = '';
        for (let k = 0; k < WIN; k++) s += k < wins[i] ? '●' : '○';
        u.pips.textContent = s;
      });
    }

    function renderFx() {
      ui.forEach((u, i) => {
        const s = snakes[i];
        if (!s) return;
        const f = s.fx, parts2 = [];
        const add = (em, t, bad) => parts2.push([em + ' ' + Math.ceil(t), bad]);
        if (s.alive) {
          if (f.fast > 0) add('⚡', f.fast);
          if (f.ghost > 0) add('👻', f.ghost);
          if (f.thick > 0) add('🔍', f.thick);
          if (f.slow > 0) add('🐢', f.slow, true);
          if (f.rev > 0) add('🔄', f.rev, true);
          if (f.square > 0) add('📐', f.square, true);
          if (s.jumps > 0) parts2.push(['🦘×' + s.jumps, false]);
        }
        const key = parts2.map(p => p[0]).join('|');
        if (key === u.fxKey) return;
        u.fxKey = key;
        u.fx.replaceChildren(...parts2.map(p => U.h('span', { class: p[1] ? 'bad' : '' }, p[0])));
        const rev = s.alive && f.rev > 0;
        u.L.classList.toggle('rev', rev); u.R.classList.toggle('rev', rev);
      });
    }

    function burst(x, y, c, n, sp) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, v = U.rand(20, sp || 120) * S / 700;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(.4, 1), t: 0, c });
      }
    }

    function kill(s) {
      if (!s.alive) return;
      s.alive = false;
      burst(s.x, s.y, s.color, 34, 160);
      burst(s.x, s.y, '#ffffff', 10, 90);
      rings.push({ x: s.x, y: s.y, t: 0, life: 0.6, c: s.color, r: TW * 10 });
      shake = Math.max(shake, 9);
      const u = ui[s.i];
      u.st.textContent = 'выбыл';
      u.st.classList.add('dead');
    }

    function spawnPU() {
      if (state !== 'play') return;
      const max = mod === 'rain' ? 4 : 3;
      if (pups.length >= max) return;
      const pr = Math.max(TW * 2.2, S * 0.026);
      for (let tries = 0; tries < 40; tries++) {
        const x = U.rand(pr * 2, FW - pr * 2), y = U.rand(pr * 2, FH - pr * 2);
        if (snakes.some(s => s.alive && U.dist(s.x, s.y, x, y) < S * 0.12)) continue;
        if (pups.some(q => U.dist(q.x, q.y, x, y) < S * 0.12)) continue;
        let blocked = false;
        for (let k = 0; k < 8 && !blocked; k++) {
          const a = k / 8 * TAU;
          if (occ(x + Math.cos(a) * pr, y + Math.sin(a) * pr)) blocked = true;
        }
        if (blocked || occ(x, y)) continue;
        pups.push({ x, y, r: pr, type: pickPU(), t: 0, life: 9 });
        return;
      }
    }

    function applyPU(s, type) {
      const def = PU[type];
      const foes = snakes.filter(o => o !== s && o.alive);
      rings.push({ x: s.x, y: s.y, t: 0, life: 0.45, c: def.col, r: TW * 7 });
      if (type === 'fast') { s.fx.fast = 4; s.fx.slow = 0; }
      else if (type === 'ghost') s.fx.ghost = 3;
      else if (type === 'thick') s.fx.thick = 5;
      else if (type === 'jump') s.jumps = Math.min(3, s.jumps + 1);
      else if (type === 'slow') foes.forEach(o => { o.fx.slow = 4; o.fx.fast = 0; });
      else if (type === 'rev') foes.forEach(o => { o.fx.rev = 4; });
      else if (type === 'square') foes.forEach(o => { o.fx.square = 4; });
      else if (type === 'eraser') {
        grid.fill(0);
        og.clearRect(0, 0, FW, FH);
        snakes.forEach(o => { o.pen = false; o.q.forEach(e => { e.gap = true; }); });
        flash = 0.5;
        shake = Math.max(shake, 6);
        ctx.players.forEach(p => banner(p.i, p.i === s.i ? '🧽 Ластик! Поле чистое' : '🧽 Все следы стёрты!', def.col));
        return;
      }
      banner(s.i, def.self, def.col);
      if (def.foe) foes.forEach(o => banner(o.i, def.foe, '#ff4d6d'));
    }

    function stepSnake(s, dt) {
      const u = ui[s.i];
      let L = u.L.ids.size > 0, R = u.R.ids.size > 0;
      for (const k in s.fx) s.fx[k] = Math.max(0, s.fx[k] - dt);
      s.air = Math.max(0, s.air - dt);
      if (s.fx.rev > 0) { const t = L; L = R; R = t; }
      let turn = 0;
      if (s.fx.square > 0) {
        if (L && !s.sqL) s.a -= Math.PI / 2;
        if (R && !s.sqR) s.a += Math.PI / 2;
      } else turn = (R ? 1 : 0) - (L ? 1 : 0);
      s.sqL = L; s.sqR = R;
      if (state === 'ready') { s.a += turn * TURN * 0.6 * dt; return; }
      let speed = SPEED * (1 + Math.min(0.5, roundT * 0.012));
      if (mod === 'turbo') speed *= 1.35;
      if (s.fx.fast > 0) speed *= 1.6;
      if (s.fx.slow > 0) speed *= 0.6;
      const tw = TW * (s.fx.thick > 0 ? 2.3 : 1);
      const dist = speed * dt;
      const steps = Math.max(1, Math.ceil(dist / 1));
      const ds = dist / steps;
      og.strokeStyle = s.color;
      og.lineWidth = tw;
      og.shadowColor = s.color;
      og.shadowBlur = 7 * OK;
      og.beginPath();
      let drew = false;
      if (s.pen) og.moveTo(s.x, s.y);
      for (let k = 0; k < steps; k++) {
        s.a += turn * TURN * dt / steps;
        const ca = Math.cos(s.a), sa = Math.sin(s.a);
        let px = s.x, py = s.y;
        s.x += ca * ds; s.y += sa * ds;
        s.dist += ds;
        if (mod === 'wrap') {
          let w = false;
          if (s.x < 0) { s.x += FW; w = true; } else if (s.x >= FW) { s.x -= FW; w = true; }
          if (s.y < 0) { s.y += FH; w = true; } else if (s.y >= FH) { s.y -= FH; w = true; }
          if (w) {
            if (drew) { og.stroke(); og.beginPath(); drew = false; }
            s.pen = false; px = s.x; py = s.y;
          }
        }
        const phase = s.fx.ghost > 0 || s.air > 0;
        // gaps
        let gap = false;
        if (s.gapLeft > 0) { s.gapLeft -= ds; gap = true; if (s.gapLeft <= 0) s.untilGap = S * U.rand(0.22, 0.6); }
        else { s.untilGap -= ds; if (s.untilGap <= 0) s.gapLeft = TW * 4.2; }
        if (phase) gap = true;
        if (gap) { s.pen = false; }
        else {
          if (!s.pen) { og.moveTo(px, py); s.pen = true; }
          og.lineTo(s.x, s.y); drew = true;
        }
        s.q.push({ x: s.x, y: s.y, d: s.dist, gap, w: tw });
        while (s.q.length && s.q[0].d < s.dist - LAG * (tw / TW)) {
          const e = s.q.shift();
          if (!e.gap) stamp(e.x, e.y, e.w / 2);
        }
        // pick up power-ups
        for (const q of pups) {
          if (!q.taken && U.dist(s.x, s.y, q.x, q.y) < q.r + TW) { q.taken = true; burst(q.x, q.y, PU[q.type].col, 18, 140); applyPU(s, q.type); }
        }
        // collision
        const r = TW / 2;
        let hit = false;
        if (mod !== 'wrap' && (s.x < r || s.y < r || s.x > FW - r || s.y > FH - r)) hit = 'wall';
        if (!hit && !phase) {
          for (const o2 of [0, -0.75, 0.75]) {
            const fx = s.x + Math.cos(s.a + o2) * (r + 0.7), fy = s.y + Math.sin(s.a + o2) * (r + 0.7);
            if (occ(fx, fy)) { hit = 'trail'; break; }
          }
          if (!hit) {
            const fx = s.x + ca * (r + 0.7), fy = s.y + sa * (r + 0.7);
            for (const o of snakes) {
              if (o === s) continue;
              for (const e of o.q) {
                if (e.gap) continue;
                const dx = e.x - fx, dy = e.y - fy, rr = e.w / 2;
                if (dx * dx + dy * dy < rr * rr) { hit = 'trail'; break; }
              }
              if (hit) break;
            }
          }
        }
        if (hit === 'trail' && s.jumps > 0) {
          s.jumps--;
          s.air = 0.5;
          banner(s.i, '🦘 Прыг!', '#ff9f43');
          rings.push({ x: s.x, y: s.y, t: 0, life: 0.4, c: '#ff9f43', r: TW * 6 });
          hit = false;
        }
        if (hit) {
          if (s.x < r) s.x = r; if (s.y < r) s.y = r;
          if (s.x > FW - r) s.x = FW - r; if (s.y > FH - r) s.y = FH - r;
          if (drew) og.stroke(); kill(s); return;
        }
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
          if (state === 'play') {
            pups = pups.filter(q => { q.t += dt; return !q.taken && q.t < q.life; });
            nextPU -= dt;
            if (nextPU <= 0) { spawnPU(); nextPU = U.rand(2.8, 4.5) * (mod === 'rain' ? 0.45 : 1); }
            if (snakes.filter(s => s.alive).length <= 1) endRound();
          }
        }
        for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
        parts = parts.filter(p => p.t < p.life);
        for (const r of rings) r.t += dt;
        rings = rings.filter(r => r.t < r.life);
        shake *= Math.exp(-dt * 9);
        flash = Math.max(0, flash - dt);
      }
      renderFx();
      draw();
    });

    function drawPU(g, q, now) {
      const blink = q.life - q.t < 2 && Math.floor(now * 8) % 2 === 0;
      if (blink) return;
      const pop = Math.min(1, q.t * 4);
      const r = q.r * pop * (1 + 0.08 * Math.sin(now * 6 + q.x));
      const col = PU[q.type].col;
      g.save();
      g.shadowColor = col; g.shadowBlur = 18;
      g.fillStyle = 'rgba(15,18,32,.85)';
      g.strokeStyle = col; g.lineWidth = r * 0.16;
      g.beginPath(); g.arc(q.x, q.y, r, 0, TAU); g.fill(); g.stroke();
      g.restore();
      g.font = `${Math.round(r * 1.15)}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(PU[q.type].em, q.x, q.y + r * 0.06);
    }

    function draw() {
      const g = C.g, dpr = C.dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = BG;
      g.fillRect(0, 0, ctx.W, ctx.H);
      const { s } = view;
      const sx = shake > 0.3 ? U.rand(-shake, shake) : 0, sy = shake > 0.3 ? U.rand(-shake, shake) : 0;
      const ox = view.ox + sx, oy = view.oy + sy;
      g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
      const now = performance.now() / 1000;
      // field
      g.fillStyle = '#141832';
      g.fillRect(0, 0, FW, FH);
      g.save();
      if (mod === 'wrap') {
        g.strokeStyle = '#5ec8ff';
        g.setLineDash([12, 10]);
        g.lineDashOffset = -now * 30;
        g.shadowColor = '#5ec8ff';
      } else {
        g.strokeStyle = '#3a4580';
        g.shadowColor = '#6c7cff';
      }
      g.lineWidth = 3;
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
      if (mod !== 'dark') for (const q of pups) drawPU(g, q, now);
      // heads
      const pulse = 0.5 + 0.5 * Math.sin(now * 6);
      for (const sn of snakes) {
        if (sn.alive) {
          const ghost = sn.fx.ghost > 0;
          const hop = sn.air > 0 ? Math.sin((0.5 - sn.air) / 0.5 * Math.PI) : 0;
          const hr = TW * (1.2 + hop * 1.0);
          g.save();
          if (hop > 0) { // shadow on the ground
            g.fillStyle = 'rgba(0,0,0,.45)';
            g.beginPath(); g.arc(sn.x + hop * TW, sn.y + hop * TW * 1.5, TW * 1.1, 0, TAU); g.fill();
          }
          g.globalAlpha = ghost ? 0.35 + 0.25 * pulse : 1;
          g.shadowColor = sn.color;
          g.shadowBlur = 16;
          g.fillStyle = sn.color;
          g.beginPath(); g.arc(sn.x, sn.y, hr, 0, TAU); g.fill();
          g.shadowBlur = 0;
          g.fillStyle = '#fff';
          g.beginPath(); g.arc(sn.x, sn.y, hr * 0.42, 0, TAU); g.fill();
          if (sn.fx.thick > 0 || sn.fx.fast > 0) {
            g.strokeStyle = U.alpha(sn.fx.fast > 0 ? '#3ddc97' : '#b48bff', 0.7);
            g.lineWidth = TW * 0.3;
            g.beginPath(); g.arc(sn.x, sn.y, hr + TW * (0.8 + 0.4 * pulse), 0, TAU); g.stroke();
          }
          if (sn.fx.slow > 0 || sn.fx.rev > 0 || sn.fx.square > 0) {
            g.strokeStyle = U.alpha('#ff4d6d', 0.5 + 0.4 * pulse);
            g.lineWidth = TW * 0.3;
            g.setLineDash([TW * 0.8, TW * 0.6]);
            g.beginPath(); g.arc(sn.x, sn.y, hr + TW * 1.8, now * 3, now * 3 + TAU); g.stroke();
            g.setLineDash([]);
          }
          g.restore();
          if (state === 'ready' || ctx.paused || roundT < 1.2) {
            // heading arrow + ring
            const L = TW * 6, ca = Math.cos(sn.a), sa = Math.sin(sn.a);
            g.save();
            g.strokeStyle = U.alpha(sn.color, 0.5 + 0.4 * pulse);
            g.fillStyle = g.strokeStyle;
            g.lineWidth = TW * 0.5;
            g.beginPath(); g.arc(sn.x, sn.y, TW * (2.2 + pulse), 0, TAU); g.stroke();
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
      // particles & rings
      for (const p of parts) {
        const k = 1 - p.t / p.life;
        g.globalAlpha = k;
        g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, TW * 0.5 * (0.4 + k), 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
      for (const r of rings) {
        const k = r.t / r.life;
        g.strokeStyle = U.alpha(r.c, 1 - k);
        g.lineWidth = TW * 0.6 * (1 - k) + 1;
        g.beginPath(); g.arc(r.x, r.y, r.r * (0.2 + k), 0, TAU); g.stroke();
      }
      // darkness modifier
      if (mod === 'dark' && fog) {
        const k = fog.width / FW;
        fg.setTransform(1, 0, 0, 1, 0, 0);
        fg.globalCompositeOperation = 'source-over';
        fg.fillStyle = 'rgba(6,8,16,.96)';
        fg.fillRect(0, 0, fog.width, fog.height);
        fg.globalCompositeOperation = 'destination-out';
        const R = S * 0.15 * k;
        for (const sn of snakes) {
          if (!sn.alive) continue;
          const x = sn.x * k, y = sn.y * k;
          const gr = fg.createRadialGradient(x, y, R * 0.45, x, y, R);
          gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          fg.fillStyle = gr;
          fg.beginPath(); fg.arc(x, y, R, 0, TAU); fg.fill();
        }
        fg.globalCompositeOperation = 'source-over';
        g.drawImage(fog, 0, 0, FW, FH);
        // power-ups glow through the dark, heads stay visible
        for (const q of pups) drawPU(g, q, now);
        for (const sn of snakes) if (sn.alive) {
          g.save(); g.shadowColor = sn.color; g.shadowBlur = 14; g.fillStyle = sn.color;
          g.beginPath(); g.arc(sn.x, sn.y, TW * 1.2, 0, TAU); g.fill(); g.restore();
        }
      }
      if (flash > 0) {
        g.fillStyle = `rgba(255,255,255,${flash * 0.5})`;
        g.fillRect(0, 0, FW, FH);
      }
    }

    newRound();
  },
});
