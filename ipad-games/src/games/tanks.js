registerGame({
  id: 'tanks',
  title: 'Танчики',
  emoji: '🛡️',
  desc: 'Стреляй рикошетом, собирай бонусы, выживи последним',
  rules: 'Танк едет вперёд сам. ◀ и ▶ поворачивают, ОГОНЬ стреляет (можно держать).\n' +
    'Снаряды отскакивают от стен. После рикошета свой снаряд тоже ранит!\n' +
    'У танка 3 жизни. Последний уцелевший выигрывает раунд. До 2 побед.\n' +
    'Бонусы в ящиках:\n' +
    '🔱 тройной выстрел · 🔴 лазер · 🎯 самонаведение · 🛡️ щит\n' +
    '💣 мины позади · 🚀 ускорение · ❤️ ремонт · 👻 невидимка\n' +
    '🧱 Кирпичи разрушаются от выстрелов.\n' +
    'Раунды бывают особые: 💥 рикошет ×5, 🌫️ туман войны, 🌀 порталы, 🧱 стройка.\n' +
    'Отстающий начинает раунд со щитом.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const WIN = 2;
    const HP = 3;
    const DEPTH = 0.2;
    const BG = '#0f1220';
    const ARW_L = '◀︎', ARW_R = '▶︎';
    const RELOAD = 0.75, MAXB = 3;
    const TAU = Math.PI * 2;

    ctx.root.classList.add('g-tanks');
    ctx.root.append(U.h('style', null, `
      .g-tanks .zone-inner{display:flex;align-items:stretch;gap:1.4vmin;padding:1.5vmin}
      .g-tanks .cb{flex:1 1 0;max-width:24vmin;border-radius:3vmin;border:.5vmin solid var(--pc);color:var(--pc);
        background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;
        font-size:8vmin;font-weight:900;touch-action:none;transition:transform .07s}
      .g-tanks .cb.on{background:var(--pc);color:#0f1220;transform:scale(.95);box-shadow:0 0 3.5vmin var(--pc)}
      .g-tanks .mid{flex:1.5 1 0;min-width:0;display:flex;flex-direction:column;gap:1vmin}
      .g-tanks .info{display:flex;align-items:center;justify-content:space-between;gap:1vmin;color:var(--pc);
        font-weight:900;pointer-events:none;padding:0 .6vmin;height:4.4vmin}
      .g-tanks .hearts{font-size:3.4vmin;line-height:1;white-space:nowrap;letter-spacing:.2vmin}
      .g-tanks .hearts .off{opacity:.22;filter:grayscale(1)}
      .g-tanks .hearts .sh{filter:drop-shadow(0 0 .6vmin #ffd166)}
      .g-tanks .wins{font-size:4.2vmin;line-height:1;white-space:nowrap}
      .g-tanks .fire{flex:1 1 auto;max-width:none;flex-direction:column;position:relative;overflow:hidden}
      .g-tanks .fire .lb{font-size:4.4vmin;letter-spacing:.3vmin;line-height:1}
      .g-tanks .fire .fx{font-size:2.6vmin;line-height:1;margin-top:.8vmin;white-space:nowrap;color:#fff;pointer-events:none;
        font-variant-numeric:tabular-nums;max-width:100%;overflow:hidden}
      .g-tanks .fire .fx:empty{display:none}
      .g-tanks .fire .fx span{display:inline-block;margin:0 .3vmin;padding:.2vmin .6vmin;border-radius:1vmin;background:rgba(255,255,255,.14)}
      .g-tanks .fire.on .fx span{background:rgba(15,18,32,.35)}
      .g-tanks .fire .rl{position:absolute;left:0;bottom:0;height:.9vmin;background:var(--pc);opacity:.7}
      .g-tanks .fire.on .rl{background:#0f1220}
      .g-tanks .zone-inner.dead{opacity:.45}
      .g-tanks .bans{position:absolute;left:0;right:0;bottom:calc(100% + 1.2vmin);display:flex;flex-direction:column;
        align-items:center;gap:.8vmin;pointer-events:none;z-index:5}
      .g-tanks .zone-inner.dead .bans{opacity:1}
      .g-tanks .ban{padding:.9vmin 2.2vmin;border-radius:2vmin;background:rgba(15,18,32,.78);border:.4vmin solid var(--bc);
        color:#fff;font-weight:900;font-size:3vmin;white-space:nowrap;box-shadow:0 0 3vmin var(--bc);
        animation:tk-ban 1.9s ease-out forwards}
      .g-tanks .ban.long{animation-duration:3s}
      @keyframes tk-ban{0%{transform:scale(.3);opacity:0}10%{transform:scale(1.15);opacity:1}20%{transform:scale(1)}
        80%{opacity:1}100%{opacity:0;transform:translateY(-2vmin)}}
    `));

    const C = ctx.canvas();

    /* ---------- controls ---------- */
    const allBtns = [];
    function btn(label, cls) {
      const b = U.h('div', { class: 'cb' + (cls ? ' ' + cls : '') }, label);
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
      const rl = U.h('div', { class: 'rl' });
      const fx = U.h('div', { class: 'fx' });
      const F = btn('', 'fire');
      F.append(U.h('div', { class: 'lb' }, 'ОГОНЬ'), fx, rl);
      const hearts = U.h('div', { class: 'hearts' });
      const winsEl = U.h('div', { class: 'wins' });
      const mid = U.h('div', { class: 'mid' }, U.h('div', { class: 'info' }, hearts, winsEl), F);
      const bans = U.h('div', { class: 'bans' });
      z.el.append(L, mid, R, bans);
      return { z, L, R, F, rl, fx, hearts, winsEl, bans, last: '', fxKey: '' };
    });

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
    let FW = 600, FH = 400, S = 500;
    let view = { s: 1, ox: 0, oy: 0 };
    function updView() {
      const fr = fieldRect();
      const s = Math.min(fr.w / FW, fr.h / FH);
      view = { s, ox: fr.x + (fr.w - FW * s) / 2, oy: fr.y + (fr.h - FH * s) / 2 };
    }
    ctx.onResize(updView);

    /* ---------- power-ups & modifiers ---------- */
    const PU = {
      triple: { em: '🔱', col: '#5ec8ff', w: 2,   self: '🔱 Тройной выстрел ×3!' },
      laser:  { em: '🔴', col: '#ff3b5c', w: 1.5, self: '🔴 Лазер заряжен!' },
      homing: { em: '🎯', col: '#ff9f43', w: 1.6, self: '🎯 Самонаведение ×3!' },
      shield: { em: '🛡️', col: '#ffd166', w: 1.6, self: '🛡️ Щит!' },
      mines:  { em: '💣', col: '#c58bff', w: 1.5, self: '💣 Мины позади!' },
      speed:  { em: '🚀', col: '#3ddc97', w: 1.6, self: '🚀 Ускорение!' },
      repair: { em: '❤️', col: '#ff5a7a', w: 1.3, self: '❤️ Ремонт +1!' },
      invis:  { em: '👻', col: '#c9d2ff', w: 1.2, self: '👻 Невидимка!' },
    };
    const PU_KEYS = Object.keys(PU);
    function pickPU() {
      if (window.__dbgPU) return U.pick(window.__dbgPU); // test hook
      let tot = 0; for (const k of PU_KEYS) tot += PU[k].w;
      let r = Math.random() * tot;
      for (const k of PU_KEYS) { r -= PU[k].w; if (r <= 0) return k; }
      return 'triple';
    }
    const MODS = {
      none:     { name: '' },
      ricochet: { name: '💥 Рикошет ×5!' },
      fog:      { name: '🌫️ Туман войны!' },
      portals:  { name: '🌀 Порталы!' },
      bricks:   { name: '🧱 Стройка!' },
    };

    /* ---------- state ---------- */
    const wins = ctx.players.map(() => 0);
    let round = 0;
    let mod = 'none', lastMod = 'none';
    let state = 'play';
    let roundT = 0;
    let RT = 20, SPEED = 50, TURN = 2.4, BSPEED = 320, BR = 4, BOUNCES = 2;
    let tanks = [], bullets = [], walls = [], parts = [], rings = [], pups = [], mines = [], beams = [], portals = [];
    let nextPU = 3;
    let shake = 0;
    let fog = null, fg = null;

    function rectsOverlap(a, b, gap) {
      return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
    }
    function circleRectDist(cx, cy, r) {
      const nx = U.clamp(cx, r.x, r.x + r.w), ny = U.clamp(cy, r.y, r.y + r.h);
      return Math.hypot(cx - nx, cy - ny);
    }
    const mirrorPt = (x, y) => ctx.n === 2 ? { x: FW - x, y: FH - y } : { x: FW - x, y };
    const mirrorRect = (r) => ctx.n === 2
      ? { x: FW - r.x - r.w, y: FH - r.y - r.h, w: r.w, h: r.h }
      : { x: FW - r.x - r.w, y: r.y, w: r.w, h: r.h };

    function genPortals(spawns) {
      const pr = RT * 1.3;
      for (let t = 0; t < 200; t++) {
        const x = U.rand(pr * 3, FW - pr * 3), y = U.rand(pr * 3, FH - pr * 3);
        const m = mirrorPt(x, y);
        if (U.dist(x, y, m.x, m.y) < Math.min(FW, FH) * 0.45) continue;
        if (spawns.some(s => U.dist(s.x, s.y, x, y) < RT * 5 || U.dist(s.x, s.y, m.x, m.y) < RT * 5)) continue;
        return [{ x, y, r: pr, c: '#5ec8ff' }, { x: m.x, y: m.y, r: pr, c: '#ff8bd8' }];
      }
      return [];
    }

    function genWalls(spawns) {
      const M = Math.min(FW, FH);
      const gap = RT * 3.2;
      const thick = Math.max(RT * 0.9, M * 0.045);
      const res = [];
      const ok = (r) => {
        const keep = r.brick ? RT * 0.5 : gap;
        if (r.x < keep || r.y < keep || r.x + r.w > FW - keep || r.y + r.h > FH - keep) return false;
        for (const s of spawns) if (circleRectDist(s.x, s.y, r) < RT * 4) return false;
        for (const p of portals) if (circleRectDist(p.x, p.y, r) < p.r + RT * 2.2) return false;
        for (const o of res) {
          const gg = (r.brick && o.brick) ? RT * 0.25 : (r.brick || o.brick) ? RT * 0.6 : gap;
          if (rectsOverlap(r, o, gg)) return false;
        }
        return true;
      };
      if (Math.random() < 0.75) {
        const cw = U.pick([thick, M * 0.12, M * 0.22]), ch = cw === thick ? M * 0.22 : (cw > M * 0.15 ? thick : M * 0.12);
        const vertical = ctx.n === 3 ? true : Math.random() < 0.5;
        const w = vertical ? Math.min(cw, ch) : Math.max(cw, ch), h = vertical ? Math.max(cw, ch) : Math.min(cw, ch);
        const r = { x: (FW - w) / 2, y: (FH - h) / 2, w, h };
        if (ok(r)) res.push(r);
      }
      let pairs = 0;
      const wantPairs = mod === 'bricks' ? 2 : 3;
      for (let t = 0; t < 300 && pairs < wantPairs; t++) {
        const long = U.rand(0.14, 0.3) * M;
        const horiz = Math.random() < 0.5;
        const w = horiz ? long : thick, h = horiz ? thick : long;
        const r = { x: U.rand(0, FW - w), y: U.rand(0, FH - h), w, h };
        const m = mirrorRect(r);
        if (!ok(r)) continue;
        if (rectsOverlap(r, m, gap) && !(Math.abs(r.x - m.x) < 1 && Math.abs(r.y - m.y) < 1)) continue;
        res.push(r);
        if (ok(m)) res.push(m); else { res.pop(); continue; }
        pairs++;
      }
      // destructible bricks (mirrored pairs)
      const bs = Math.max(RT * 1.5, M * 0.06);
      const wantBricks = mod === 'bricks' ? 9 : U.randInt(1, 3);
      let bp = 0;
      for (let t = 0; t < 400 && bp < wantBricks; t++) {
        const r = { x: U.rand(0, FW - bs), y: U.rand(0, FH - bs), w: bs, h: bs, brick: true, hp: 2 };
        const m = Object.assign(mirrorRect(r), { brick: true, hp: 2 });
        if (!ok(r)) continue;
        if (rectsOverlap(r, m, RT * 0.25)) continue;
        res.push(r);
        if (ok(m)) res.push(m); else { res.pop(); continue; }
        bp++;
      }
      return res;
    }

    function chooseMod() {
      if (window.__dbgMod) return window.__dbgMod; // test hook
      if (round === 1 && Math.random() < 0.4) return 'none';
      return U.pick(['ricochet', 'fog', 'portals', 'bricks', 'none'].filter(m => m !== lastMod));
    }

    function newRound() {
      round++;
      const fr = fieldRect();
      FW = Math.round(fr.w); FH = Math.round(fr.h);
      S = Math.sqrt(FW * FH);
      updView();
      RT = Math.max(14, S * 0.033);
      SPEED = S * 0.08;
      TURN = 2.5;
      BSPEED = S * 0.46;
      BR = Math.max(3, S * 0.0062);
      mod = chooseMod(); lastMod = mod;
      BOUNCES = mod === 'ricochet' ? 5 : 2;
      bullets = []; parts = []; rings = []; pups = []; mines = []; beams = []; portals = [];
      roundT = 0;
      nextPU = U.rand(2, 3.5);
      if (!fog) { fog = document.createElement('canvas'); fg = fog.getContext('2d'); }
      fog.width = Math.max(1, Math.round(FW / 3)); fog.height = Math.max(1, Math.round(FH / 3));
      const sp = Math.max(RT * 2.4, Math.min(FW, FH) * 0.11);
      const spawns = ctx.players.map(p => {
        if (p.side === 'bottom') return { x: FW / 2, y: FH - sp };
        if (p.side === 'top') return { x: FW / 2, y: sp };
        if (p.side === 'left') return { x: sp, y: FH / 2 };
        return { x: FW - sp, y: FH / 2 };
      });
      if (ctx.n === 2) { spawns[0].x -= FW * 0.15; spawns[1].x += FW * 0.15; }
      if (mod === 'portals') { portals = genPortals(spawns); if (!portals.length) mod = 'none'; }
      walls = genWalls(spawns);
      const best = Math.max(...wins);
      tanks = ctx.players.map((p, k) => {
        const v = ctx.inward(p.i);
        return {
          i: p.i, color: p.color, x: spawns[k].x, y: spawns[k].y, a: Math.atan2(v.y, v.x),
          hp: HP, alive: true, cd: 0, flash: 0, inv: 1.2, recoil: 0, tread: 0, portalCd: 0,
          shield: (best > 0 && wins[p.i] < best) ? 1 : 0,
          triple: 0, laser: 0, homing: 0, mineQ: 0, mineCd: 0,
          fx: { speed: 0, invis: 0 },
        };
      });
      ui.forEach(u => u.z.el.classList.remove('dead'));
      const announce = () => {
        if (mod !== 'none') ctx.players.forEach(p => banner(p.i, MODS[mod].name, '#ffffff', true));
        tanks.forEach(t => { if (t.shield) banner(t.i, '🆘 Фора: 🛡️ щит', '#ff9f43', true); });
      };
      ui.forEach(u => u.bans.replaceChildren());
      if (round > 1) {
        state = 'ready';
        say(`Раунд ${round}`, { ms: 1100, size: 30 });
        announce();
        ctx.after(1500, () => { state = 'play'; say('В бой!', { ms: 700, color: '#3ddc97', fg: '#0f1220' }); });
      } else {
        state = 'play';
        ctx.onStart = announce;
      }
    }

    function renderUI() {
      ui.forEach((u, i) => {
        const t = tanks[i];
        const key = (t ? t.hp : HP) + '|' + wins[i] + '|' + (t ? t.shield : 0);
        if (key !== u.last) {
          u.last = key;
          const hs = Array.from({ length: HP }, (_, k) => U.h('span', { class: t && k < t.hp ? '' : 'off' }, '❤️'));
          if (t && t.shield) hs.push(U.h('span', { class: 'sh' }, '🛡️'));
          u.hearts.replaceChildren(...hs);
          let w = '';
          for (let k = 0; k < WIN; k++) w += k < wins[i] ? '★' : '☆';
          u.winsEl.textContent = w;
        }
        const cdFrac = t ? Math.max(0, t.cd) / RELOAD : 0;
        u.rl.style.width = ((1 - cdFrac) * 100).toFixed(0) + '%';
        const chips = [];
        if (t && t.alive) {
          if (t.laser) chips.push('🔴');
          if (t.triple) chips.push('🔱' + t.triple);
          if (t.homing) chips.push('🎯' + t.homing);
          if (t.mineQ) chips.push('💣' + t.mineQ);
          if (t.fx.speed > 0) chips.push('🚀' + Math.ceil(t.fx.speed));
          if (t.fx.invis > 0) chips.push('👻' + Math.ceil(t.fx.invis));
        }
        const fk = chips.join('|');
        if (fk !== u.fxKey) { u.fxKey = fk; u.fx.replaceChildren(...chips.map(c => U.h('span', null, c))); }
      });
    }

    function solidAt(x, y) {
      for (const r of walls) if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return r;
      return null;
    }

    function collideTank(t) {
      t.x = U.clamp(t.x, RT, FW - RT);
      t.y = U.clamp(t.y, RT, FH - RT);
      for (const r of walls) {
        const nx = U.clamp(t.x, r.x, r.x + r.w), ny = U.clamp(t.y, r.y, r.y + r.h);
        const dx = t.x - nx, dy = t.y - ny;
        const d = Math.hypot(dx, dy);
        if (d >= RT) continue;
        if (d < 0.001) {
          const l = t.x - r.x, rr = r.x + r.w - t.x, tp = t.y - r.y, b = r.y + r.h - t.y;
          const m = Math.min(l, rr, tp, b);
          if (m === l) t.x = r.x - RT; else if (m === rr) t.x = r.x + r.w + RT;
          else if (m === tp) t.y = r.y - RT; else t.y = r.y + r.h + RT;
          continue;
        }
        t.x = nx + dx / d * RT; t.y = ny + dy / d * RT;
      }
    }

    function burst(x, y, c, n, sp, life, rad) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, v = U.rand(30, sp || 110) * S / 700;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(.15, life || .35), t: 0, c, r: rad || BR * 0.6 });
      }
    }

    function damageBrick(r) {
      r.hp--;
      burst(r.x + r.w / 2, r.y + r.h / 2, '#d9774a', 8, 120, 0.5, BR);
      if (r.hp <= 0) {
        walls = walls.filter(w => w !== r);
        burst(r.x + r.w / 2, r.y + r.h / 2, '#e8945e', 22, 180, 0.7, BR * 1.3);
        shake = Math.max(shake, 4);
      }
    }

    function fire(t) {
      if (t.cd > 0) return;
      const mine = bullets.filter(b => b.owner === t.i).length;
      if (!t.laser && mine >= MAXB) return;
      t.cd = RELOAD;
      t.recoil = 1;
      const ca = Math.cos(t.a), sa = Math.sin(t.a);
      const bx = t.x + ca * RT * 1.45, by = t.y + sa * RT * 1.45;
      if (t.laser) {
        t.laser = 0;
        shootLaser(t);
        return;
      }
      const angs = t.triple ? [-0.22, 0, 0.22] : [0];
      if (t.triple) t.triple--;
      const home = t.homing > 0;
      if (home) t.homing--;
      for (const da of angs) {
        const a = t.a + da;
        const b = { owner: t.i, color: t.color, x: bx, y: by, vx: Math.cos(a) * BSPEED, vy: Math.sin(a) * BSPEED, bounces: 0, t: 0, trail: [], home, portalCd: 0 };
        if (solidAt(bx, by)) { b.x = t.x; b.y = t.y; b.vx *= -1; b.vy *= -1; b.bounces = 1; }
        bullets.push(b);
      }
      for (let k = 0; k < 6; k++) {
        const a = t.a + U.rand(-0.5, 0.5), v = U.rand(40, 120) * S / 700;
        parts.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(.15, .3), t: 0, c: '#ffe8a0', r: BR * 0.8 });
      }
    }

    function shootLaser(t) {
      let x = t.x + Math.cos(t.a) * RT * 1.3, y = t.y + Math.sin(t.a) * RT * 1.3;
      let vx = Math.cos(t.a), vy = Math.sin(t.a);
      const pts = [{ x, y }];
      const step = BR * 0.8;
      let bounces = 0, len = 0;
      const maxLen = S * 3;
      outer:
      while (len < maxLen) {
        const px = x, py = y;
        x += vx * step; y += vy * step; len += step;
        let bounced = false;
        if (x < 0 || x > FW) { vx = -vx; x = U.clamp(x, 0, FW); bounced = true; }
        if (y < 0 || y > FH) { vy = -vy; y = U.clamp(y, 0, FH); bounced = true; }
        const r = !bounced && solidAt(x, y);
        if (r) {
          if (r.brick) { pts.push({ x, y }); damageBrick(r); damageBrick(r); break; }
          const inX = px > r.x && px < r.x + r.w, inY = py > r.y && py < r.y + r.h;
          if (!inX) vx = -vx;
          if (!inY) vy = -vy;
          if (inX && inY) { vx = -vx; vy = -vy; }
          x = px; y = py;
          bounced = true;
        }
        if (bounced) {
          pts.push({ x, y });
          bounces++;
          burst(x, y, '#ff3b5c', 6, 120);
          if (bounces > 1) break;
        }
        for (const o of tanks) {
          if (!o.alive || (o === t && bounces === 0)) continue;
          if ((o.x - x) ** 2 + (o.y - y) ** 2 < (RT * 0.95) ** 2) {
            pts.push({ x, y });
            hurt(o, x, y, '#ff3b5c', t.i);
            break outer;
          }
        }
      }
      if (pts.length === 1 || pts[pts.length - 1].x !== x) pts.push({ x, y });
      beams.push({ pts, t: 0, life: 0.4, c: t.color });
      shake = Math.max(shake, 6);
    }

    function hurt(t, x, y, col, by) {
      if (!t.alive) return;
      if (t.inv > 0) { burst(x, y, '#ffffff', 6); return; }
      if (t.shield) {
        t.shield = 0;
        t.inv = 0.4;
        rings.push({ x: t.x, y: t.y, t: 0, c: '#ffd166', life: 0.5, r: RT * 2.5 });
        burst(t.x, t.y, '#ffd166', 18, 160);
        banner(t.i, '🛡️ Щит спас!', '#ffd166');
        return;
      }
      t.hp--;
      t.flash = 0.6;
      t.inv = 0.6;
      shake = Math.max(shake, 7);
      rings.push({ x: t.x, y: t.y, t: 0, c: '#ffffff', life: 0.35, r: RT * 2.2 });
      burst(x, y, col, 14, 140, 0.5, BR);
      if (t.hp <= 0) {
        t.alive = false;
        ui[t.i].z.el.classList.add('dead');
        rings.push({ x: t.x, y: t.y, t: 0, c: t.color, life: 0.7, r: RT * 4 });
        burst(t.x, t.y, t.color, 30, 220, 1.2, BR * 1.3);
        burst(t.x, t.y, '#ffb347', 20, 200, 1, BR * 1.3);
        shake = Math.max(shake, 14);
        banner(t.i, by === t.i ? '💥 Сам себя подбил!' : '💥 Подбит!', '#ff4d6d');
      }
    }

    function applyPU(t, type) {
      const def = PU[type];
      rings.push({ x: t.x, y: t.y, t: 0, c: def.col, life: 0.45, r: RT * 2.6 });
      burst(t.x, t.y, def.col, 16, 150, 0.5, BR);
      let text = def.self;
      switch (type) {
        case 'triple': t.triple = 3; break;
        case 'laser': t.laser = 1; break;
        case 'homing': t.homing = 3; break;
        case 'shield': t.shield = 1; break;
        case 'mines': t.mineQ = 3; t.mineCd = 0.2; break;
        case 'speed': t.fx.speed = 5; break;
        case 'invis': t.fx.invis = 4; break;
        case 'repair':
          if (t.hp < HP) t.hp++; else { t.shield = 1; text = '❤️ Цел: держи 🛡️ щит!'; }
          break;
      }
      banner(t.i, text, def.col);
    }

    function spawnPU() {
      if (state !== 'play' || pups.length >= ctx.n + 1) return;
      const pr = RT * 0.85;
      for (let tries = 0; tries < 50; tries++) {
        const x = U.rand(pr * 2, FW - pr * 2), y = U.rand(pr * 2, FH - pr * 2);
        if (walls.some(r => circleRectDist(x, y, r) < pr * 1.6)) continue;
        if (tanks.some(t => t.alive && U.dist(t.x, t.y, x, y) < S * 0.12)) continue;
        if (pups.some(q => U.dist(q.x, q.y, x, y) < S * 0.15)) continue;
        if (portals.some(p => U.dist(p.x, p.y, x, y) < p.r * 2.5)) continue;
        pups.push({ x, y, r: pr, type: pickPU(), t: 0, life: 12 });
        return;
      }
    }

    function explodeMine(m) {
      m.dead = true;
      const R = RT * 2.4;
      rings.push({ x: m.x, y: m.y, t: 0, c: '#ffb347', life: 0.55, r: R * 1.3 });
      burst(m.x, m.y, '#ffb347', 26, 220, 0.7, BR * 1.2);
      burst(m.x, m.y, '#ffffff', 10, 140, 0.4, BR);
      shake = Math.max(shake, 10);
      for (const t of tanks) if (t.alive && U.dist(t.x, t.y, m.x, m.y) < R + RT * 0.5) hurt(t, t.x, t.y, '#ffb347', m.owner);
      for (const r of walls.slice()) if (r.brick && circleRectDist(m.x, m.y, r) < R) { damageBrick(r); damageBrick(r); }
    }

    function teleport(o, isTank) {
      if (portals.length < 2 || o.portalCd > 0) return false;
      for (let k = 0; k < 2; k++) {
        const p = portals[k], q = portals[1 - k];
        if ((o.x - p.x) ** 2 + (o.y - p.y) ** 2 < p.r * p.r) {
          rings.push({ x: p.x, y: p.y, t: 0, c: p.c, life: 0.4, r: p.r * 2 });
          o.x = q.x; o.y = q.y;
          if (o.trail) o.trail.length = 0;
          o.portalCd = isTank ? 1.0 : 0.25;
          rings.push({ x: q.x, y: q.y, t: 0, c: q.c, life: 0.4, r: q.r * 2 });
          burst(q.x, q.y, q.c, 10, 120);
          return true;
        }
      }
      return false;
    }

    function endRound() {
      state = 'over';
      const alive = tanks.filter(t => t.alive);
      if (alive.length === 1) {
        const w = alive[0].i, p = ctx.players[w];
        wins[w]++;
        renderUI();
        if (wins[w] >= WIN) {
          say(`${p.name} побеждает!`, { color: p.color, fg: '#111', ms: 1500 });
          ctx.after(1600, () => ctx.end({ winner: w, scores: wins.slice() }));
          return;
        }
        say(`Раунд: ${p.name}`, { color: p.color, fg: '#111', ms: 1500 });
      } else say('Ничья в раунде', { ms: 1500 });
      ctx.after(2000, newRound);
    }

    function update(dt) {
      roundT += dt;
      for (const t of tanks) {
        if (!t.alive) continue;
        const u = ui[t.i];
        const turn = (u.R.ids.size ? 1 : 0) - (u.L.ids.size ? 1 : 0);
        t.cd = Math.max(0, t.cd - dt);
        t.flash = Math.max(0, t.flash - dt);
        t.recoil = Math.max(0, t.recoil - dt * 6);
        if (state !== 'play') { t.a += turn * TURN * dt * 0.7; continue; }
        t.inv = Math.max(0, t.inv - dt);
        t.portalCd = Math.max(0, t.portalCd - dt);
        for (const k in t.fx) t.fx[k] = Math.max(0, t.fx[k] - dt);
        const fast = t.fx.speed > 0;
        t.a += turn * TURN * (fast ? 1.25 : 1) * dt;
        const sp = SPEED * (fast ? 1.9 : 1);
        t.x += Math.cos(t.a) * sp * dt;
        t.y += Math.sin(t.a) * sp * dt;
        t.tread += sp * dt;
        collideTank(t);
        teleport(t, true);
        if (fast && t.fx.invis <= 0) parts.push({ x: t.x - Math.cos(t.a) * RT, y: t.y - Math.sin(t.a) * RT, vx: 0, vy: 0, life: 0.35, t: 0, c: '#3ddc97', r: BR });
        if (u.F.ids.size) fire(t);
        if (t.mineQ > 0) {
          t.mineCd -= dt;
          if (t.mineCd <= 0) {
            t.mineQ--; t.mineCd = 0.45;
            mines.push({ x: t.x - Math.cos(t.a) * RT * 1.4, y: t.y - Math.sin(t.a) * RT * 1.4, owner: t.i, c: t.color, t: 0 });
          }
        }
        // pick-ups
        for (const q of pups) if (!q.taken && U.dist(t.x, t.y, q.x, q.y) < RT + q.r) { q.taken = true; applyPU(t, q.type); }
      }
      if (state !== 'play') return;
      // tank-tank separation
      for (let i = 0; i < tanks.length; i++) for (let j = i + 1; j < tanks.length; j++) {
        const a = tanks[i], b = tanks[j];
        if (!a.alive || !b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d < RT * 2 && d > 0.001) {
          const o = (RT * 2 - d) / 2;
          a.x -= dx / d * o; a.y -= dy / d * o; b.x += dx / d * o; b.y += dy / d * o;
          collideTank(a); collideTank(b);
        }
      }
      pups = pups.filter(q => { q.t += dt; return !q.taken && q.t < q.life; });
      nextPU -= dt;
      if (nextPU <= 0) { spawnPU(); nextPU = U.rand(3, 4.5); }
      // mines
      for (const m of mines) {
        m.t += dt;
        if (m.t < 0.8) continue;
        for (const t of tanks) if (t.alive && U.dist(t.x, t.y, m.x, m.y) < RT + RT * 0.35) { explodeMine(m); break; }
      }
      // bullets
      for (const b of bullets) {
        b.t += dt;
        b.portalCd = Math.max(0, b.portalCd - dt);
        if (b.home && b.t > 0.15) {
          let best = null, bd = Infinity;
          for (const t of tanks) {
            if (!t.alive || t.i === b.owner || t.fx.invis > 0) continue;
            const d = U.dist(t.x, t.y, b.x, b.y);
            if (d < bd) { bd = d; best = t; }
          }
          if (best) {
            const want = Math.atan2(best.y - b.y, best.x - b.x), cur = Math.atan2(b.vy, b.vx);
            let da = want - cur;
            while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
            const na = cur + U.clamp(da, -3.2 * dt, 3.2 * dt), v = Math.hypot(b.vx, b.vy);
            b.vx = Math.cos(na) * v; b.vy = Math.sin(na) * v;
          }
        }
        const dist = Math.hypot(b.vx, b.vy) * dt;
        const steps = Math.max(1, Math.ceil(dist / (BR * 0.8)));
        for (let k = 0; k < steps && !b.dead; k++) {
          const px = b.x, py = b.y;
          b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
          let bounced = false;
          if (b.x < BR) { b.x = 2 * BR - b.x; b.vx = Math.abs(b.vx); bounced = true; }
          if (b.x > FW - BR) { b.x = 2 * (FW - BR) - b.x; b.vx = -Math.abs(b.vx); bounced = true; }
          if (b.y < BR) { b.y = 2 * BR - b.y; b.vy = Math.abs(b.vy); bounced = true; }
          if (b.y > FH - BR) { b.y = 2 * (FH - BR) - b.y; b.vy = -Math.abs(b.vy); bounced = true; }
          if (!bounced) for (const r of walls) {
            if (b.x > r.x - BR && b.x < r.x + r.w + BR && b.y > r.y - BR && b.y < r.y + r.h + BR) {
              if (r.brick) { b.dead = true; damageBrick(r); break; }
              const wasInX = px > r.x - BR && px < r.x + r.w + BR;
              const wasInY = py > r.y - BR && py < r.y + r.h + BR;
              if (!wasInX) b.vx = -b.vx;
              if (!wasInY) b.vy = -b.vy;
              if (wasInX && wasInY) { b.vx = -b.vx; b.vy = -b.vy; }
              b.x = px; b.y = py;
              bounced = true;
              break;
            }
          }
          if (b.dead) break;
          if (bounced) {
            b.bounces++;
            if (b.bounces > BOUNCES) { b.dead = true; burst(b.x, b.y, b.color, 6); break; }
            burst(b.x, b.y, '#ffffff', 3);
          }
          if (portals.length) teleport(b, false);
          for (const m of mines) {
            if (!m.dead && (m.x - b.x) ** 2 + (m.y - b.y) ** 2 < (RT * 0.45 + BR) ** 2) { b.dead = true; explodeMine(m); break; }
          }
          if (b.dead) break;
          for (const t of tanks) {
            if (!t.alive) continue;
            if (t.i === b.owner && b.bounces === 0) continue;
            if ((t.x - b.x) ** 2 + (t.y - b.y) ** 2 < (RT * 0.95 + BR) ** 2) {
              b.dead = true;
              hurt(t, b.x, b.y, b.color, b.owner);
              break;
            }
          }
        }
        b.trail.push(b.x, b.y);
        if (b.trail.length > 12) b.trail.splice(0, 2);
        if (b.t > (mod === 'ricochet' ? 10 : 6)) b.dead = true;
      }
      for (let i = 0; i < bullets.length; i++) for (let j = i + 1; j < bullets.length; j++) {
        const a = bullets[i], c = bullets[j];
        if (a.dead || c.dead) continue;
        if ((a.x - c.x) ** 2 + (a.y - c.y) ** 2 < (BR * 2.2) ** 2) {
          a.dead = c.dead = true;
          burst((a.x + c.x) / 2, (a.y + c.y) / 2, '#ffffff', 10);
        }
      }
      bullets = bullets.filter(b => !b.dead);
      mines = mines.filter(m => !m.dead);
      if (tanks.filter(t => t.alive).length <= 1) endRound();
    }

    ctx.loop((dt) => {
      if (dt > 0) {
        if (state !== 'over') update(dt);
        else for (const t of tanks) { t.flash = Math.max(0, t.flash - dt); }
        for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy *= 0.95; }
        parts = parts.filter(p => p.t < p.life);
        for (const r of rings) r.t += dt;
        rings = rings.filter(r => r.t < r.life);
        for (const b of beams) b.t += dt;
        beams = beams.filter(b => b.t < b.life);
        shake *= Math.exp(-dt * 9);
      }
      renderUI();
      draw();
    });

    function roundRect(g, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    function drawTank(g, t, now) {
      const invis = t.fx.invis > 0;
      g.save();
      if (invis) g.globalAlpha = 0.09 + 0.05 * Math.sin(now * 9);
      else if (t.inv > 0 && t.flash <= 0 && Math.floor(now * 12) % 2 === 0) g.globalAlpha = 0.55;
      g.translate(t.x, t.y);
      g.rotate(t.a);
      const r = RT;
      const white = t.flash > 0 && Math.floor(t.flash * 20) % 2 === 0;
      const col = white ? '#ffffff' : t.color;
      g.fillStyle = '#20263f';
      roundRect(g, -r * 0.95, -r * 0.95, r * 1.9, r * 0.5, r * 0.15); g.fill();
      roundRect(g, -r * 0.95, r * 0.45, r * 1.9, r * 0.5, r * 0.15); g.fill();
      g.strokeStyle = U.alpha(t.color, 0.6);
      g.lineWidth = Math.max(1, r * 0.07);
      const ph = (t.tread % (r * 0.38));
      for (let x = -r * 0.95 + ph; x < r * 0.95; x += r * 0.38) {
        g.beginPath(); g.moveTo(x, -r * 0.93); g.lineTo(x, -r * 0.47); g.moveTo(x, r * 0.47); g.lineTo(x, r * 0.93); g.stroke();
      }
      g.shadowColor = col; g.shadowBlur = 16;
      g.fillStyle = col;
      roundRect(g, -r * 0.8, -r * 0.55, r * 1.6, r * 1.1, r * 0.25); g.fill();
      g.shadowBlur = 0;
      const rc = t.recoil * r * 0.25;
      g.fillStyle = t.laser ? '#ff3b5c' : '#e8ebff';
      if (t.triple) {
        for (const dy of [-0.2, 0.2]) { roundRect(g, r * 0.1 - rc, r * dy - r * 0.07, r * 1.05, r * 0.14, r * 0.05); g.fill(); }
      }
      roundRect(g, r * 0.1 - rc, -r * 0.13, r * 1.25, r * 0.26, r * 0.08); g.fill();
      g.fillStyle = 'rgba(15,18,32,.35)';
      g.beginPath(); g.arc(0, 0, r * 0.42, 0, TAU); g.fill();
      g.fillStyle = t.homing ? '#ff9f43' : '#ffffff';
      g.beginPath(); g.arc(0, 0, r * 0.26, 0, TAU); g.fill();
      g.restore();
      if (t.shield && !invis) {
        g.save();
        g.strokeStyle = U.alpha('#ffd166', 0.55 + 0.3 * Math.sin(now * 7));
        g.fillStyle = U.alpha('#ffd166', 0.08);
        g.lineWidth = r * 0.12;
        g.shadowColor = '#ffd166'; g.shadowBlur = 12;
        g.beginPath(); g.arc(t.x, t.y, r * 1.45, 0, TAU); g.fill(); g.stroke();
        g.restore();
      }
      if (t.laser && !invis) {
        g.save();
        g.strokeStyle = U.alpha('#ff3b5c', 0.25 + 0.15 * Math.sin(now * 12));
        g.lineWidth = 1.5;
        g.setLineDash([6, 6]);
        g.beginPath(); g.moveTo(t.x + Math.cos(t.a) * r * 1.4, t.y + Math.sin(t.a) * r * 1.4);
        g.lineTo(t.x + Math.cos(t.a) * r * 6, t.y + Math.sin(t.a) * r * 6); g.stroke();
        g.restore();
      }
      if (state !== 'play' || ctx.paused || roundT < 1) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 6);
        g.save();
        g.strokeStyle = U.alpha(t.color, 0.4 + 0.4 * pulse);
        g.lineWidth = r * 0.12;
        g.beginPath(); g.arc(t.x, t.y, r * (1.6 + 0.25 * pulse), 0, TAU); g.stroke();
        g.restore();
      }
    }

    function drawPU(g, q, now) {
      const blink = q.life - q.t < 2.5 && Math.floor(now * 8) % 2 === 0;
      if (blink) return;
      const pop = Math.min(1, q.t * 4);
      const r = q.r * pop * (1 + 0.07 * Math.sin(now * 5 + q.x));
      const col = PU[q.type].col;
      g.save();
      g.translate(q.x, q.y);
      g.rotate(Math.sin(now * 2 + q.y) * 0.15);
      g.shadowColor = col; g.shadowBlur = 18;
      g.fillStyle = 'rgba(15,18,32,.85)';
      g.strokeStyle = col; g.lineWidth = r * 0.14;
      roundRect(g, -r, -r, r * 2, r * 2, r * 0.35); g.fill(); g.stroke();
      g.shadowBlur = 0;
      g.font = `${Math.round(r * 1.2)}px sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(PU[q.type].em, 0, r * 0.06);
      g.restore();
    }

    function drawBullets(g) {
      for (const b of bullets) {
        g.save();
        g.strokeStyle = U.alpha(b.home ? '#ff9f43' : b.color, 0.45);
        g.lineWidth = BR * 1.2;
        g.lineCap = 'round';
        g.beginPath();
        for (let k = 0; k < b.trail.length; k += 2) { if (k === 0) g.moveTo(b.trail[k], b.trail[k + 1]); else g.lineTo(b.trail[k], b.trail[k + 1]); }
        g.stroke();
        g.shadowColor = b.color; g.shadowBlur = 12;
        g.fillStyle = b.color;
        g.beginPath(); g.arc(b.x, b.y, BR * 1.25, 0, TAU); g.fill();
        g.fillStyle = b.home ? '#ff9f43' : '#fff';
        g.beginPath(); g.arc(b.x, b.y, BR * 0.6, 0, TAU); g.fill();
        g.restore();
      }
    }

    function draw() {
      const g = C.g, dpr = C.dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = BG;
      g.fillRect(0, 0, ctx.W, ctx.H);
      const { s } = view;
      const ox = view.ox + (shake > 0.3 ? U.rand(-shake, shake) : 0), oy = view.oy + (shake > 0.3 ? U.rand(-shake, shake) : 0);
      g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
      const now = performance.now() / 1000;
      g.fillStyle = '#141832';
      g.fillRect(0, 0, FW, FH);
      g.strokeStyle = 'rgba(255,255,255,.035)';
      g.lineWidth = 1;
      g.beginPath();
      const step = S / 14;
      for (let x = step; x < FW; x += step) { g.moveTo(x, 0); g.lineTo(x, FH); }
      for (let y = step; y < FH; y += step) { g.moveTo(0, y); g.lineTo(FW, y); }
      g.stroke();
      g.save();
      g.strokeStyle = mod === 'ricochet' ? '#ff9f43' : '#4a57a0';
      g.lineWidth = 3;
      g.shadowColor = mod === 'ricochet' ? '#ff9f43' : '#6c7cff';
      g.shadowBlur = 10;
      g.strokeRect(-1.5, -1.5, FW + 3, FH + 3);
      g.restore();
      // portals
      for (const p of portals) {
        g.save();
        g.shadowColor = p.c; g.shadowBlur = 20;
        for (let k = 0; k < 3; k++) {
          g.strokeStyle = U.alpha(p.c, 0.9 - k * 0.25);
          g.lineWidth = RT * 0.14;
          g.beginPath();
          g.arc(p.x, p.y, p.r * (1 - k * 0.28), now * (2 + k) + k, now * (2 + k) + k + Math.PI * 1.4);
          g.stroke();
        }
        g.fillStyle = U.alpha(p.c, 0.15);
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, TAU); g.fill();
        g.restore();
      }
      // walls
      for (const r of walls) {
        g.save();
        if (r.brick) {
          g.shadowColor = '#e8945e'; g.shadowBlur = 8;
          g.fillStyle = r.hp >= 2 ? '#8a4a2e' : '#5e3322';
          roundRect(g, r.x, r.y, r.w, r.h, r.w * 0.12); g.fill();
          g.shadowBlur = 0;
          g.strokeStyle = '#e8945e'; g.lineWidth = 1.5; g.stroke();
          g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5;
          g.beginPath();
          g.moveTo(r.x, r.y + r.h / 2); g.lineTo(r.x + r.w, r.y + r.h / 2);
          g.moveTo(r.x + r.w / 2, r.y); g.lineTo(r.x + r.w / 2, r.y + r.h / 2);
          g.moveTo(r.x + r.w / 4, r.y + r.h / 2); g.lineTo(r.x + r.w / 4, r.y + r.h);
          g.moveTo(r.x + r.w * 3 / 4, r.y + r.h / 2); g.lineTo(r.x + r.w * 3 / 4, r.y + r.h);
          if (r.hp < 2) { g.moveTo(r.x + r.w * 0.2, r.y + r.h * 0.15); g.lineTo(r.x + r.w * 0.55, r.y + r.h * 0.6); g.lineTo(r.x + r.w * 0.8, r.y + r.h * 0.85); }
          g.stroke();
        } else {
          g.shadowColor = '#6c7cff'; g.shadowBlur = 14;
          g.fillStyle = '#2a3263';
          roundRect(g, r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.25); g.fill();
          g.shadowBlur = 0;
          g.strokeStyle = '#7f8cff';
          g.lineWidth = 2;
          g.stroke();
        }
        g.restore();
      }
      // mines
      for (const m of mines) {
        const armed = m.t >= 0.8;
        g.save();
        g.fillStyle = '#2b2f45';
        g.strokeStyle = U.alpha(m.c, 0.8);
        g.lineWidth = 2;
        g.beginPath(); g.arc(m.x, m.y, RT * 0.42, 0, TAU); g.fill(); g.stroke();
        const on = armed ? Math.floor(now * 4) % 2 === 0 : true;
        g.fillStyle = on ? (armed ? '#ff3b3b' : '#888') : '#552222';
        if (on && armed) { g.shadowColor = '#ff3b3b'; g.shadowBlur = 10; }
        g.beginPath(); g.arc(m.x, m.y, RT * 0.14, 0, TAU); g.fill();
        g.restore();
      }
      for (const t of tanks) if (!t.alive) {
        g.save();
        g.translate(t.x, t.y); g.rotate(t.a);
        g.globalAlpha = 0.35;
        g.fillStyle = '#555c7a';
        roundRect(g, -RT * 0.8, -RT * 0.55, RT * 1.6, RT * 1.1, RT * 0.25); g.fill();
        g.restore();
      }
      for (const t of tanks) if (t.alive) drawTank(g, t, now);
      if (mod !== 'fog') { for (const q of pups) drawPU(g, q, now); drawBullets(g); }
      // laser beams
      for (const bm of beams) {
        const k = 1 - bm.t / bm.life;
        g.save();
        g.lineCap = 'round'; g.lineJoin = 'round';
        g.shadowColor = '#ff3b5c'; g.shadowBlur = 20;
        g.strokeStyle = U.alpha('#ff3b5c', k);
        g.lineWidth = BR * 2.6 * k + 1;
        g.beginPath();
        bm.pts.forEach((p, idx) => idx ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
        g.stroke();
        g.shadowBlur = 0;
        g.strokeStyle = U.alpha('#ffffff', k);
        g.lineWidth = BR * 0.8 * k + 0.5;
        g.stroke();
        g.restore();
      }
      for (const r of rings) {
        const k = r.t / r.life;
        g.strokeStyle = U.alpha(r.c, 1 - k);
        g.lineWidth = RT * 0.15;
        g.beginPath(); g.arc(r.x, r.y, r.r * (0.3 + k * 0.9), 0, TAU); g.stroke();
      }
      for (const p of parts) {
        const k = 1 - p.t / p.life;
        g.globalAlpha = k;
        g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, p.r * (0.4 + k), 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
      if (mod === 'fog' && fog) {
        const k = fog.width / FW;
        fg.setTransform(1, 0, 0, 1, 0, 0);
        fg.globalCompositeOperation = 'source-over';
        fg.fillStyle = 'rgba(8,10,20,.95)';
        fg.fillRect(0, 0, fog.width, fog.height);
        fg.globalCompositeOperation = 'destination-out';
        const R = S * 0.2 * k;
        for (const t of tanks) {
          if (!t.alive) continue;
          const x = t.x * k, y = t.y * k;
          const gr = fg.createRadialGradient(x, y, R * 0.45, x, y, R);
          gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          fg.fillStyle = gr;
          fg.beginPath(); fg.arc(x, y, R, 0, TAU); fg.fill();
        }
        fg.globalCompositeOperation = 'source-over';
        g.drawImage(fog, 0, 0, FW, FH);
        for (const q of pups) drawPU(g, q, now);
        g.globalAlpha = 0.7; drawBullets(g); g.globalAlpha = 1;
      }
    }

    newRound();
  },
});
