registerGame({
  id: 'potato',
  title: 'Горячая картошка',
  emoji: '💣',
  desc: 'Передай бомбу, пока она не взорвалась',
  rules: 'Бомба тикает у одного из игроков, сколько осталось, никто не знает. У кого бомба, тот жмёт свою кнопку, чтобы передать её дальше по кругу. У кого взорвётся, теряет жизнь (всего 3). Последний оставшийся побеждает.\n' +
    'Особые бомбы:\n' +
    '⚡ Быстрая: очень короткий фитиль.\n' +
    '🔀 Хаос: кнопка убегает от пальца.\n' +
    '🎯 Точность: кнопка крошечная.\n' +
    '🔢 Код: чтобы передать, нажми 1 → 2 → 3 по порядку.\n' +
    '👯 Две бомбы сразу (когда играют трое).\n' +
    'Бонусы (хватай первым!): 🛡️ щит спасает от одного взрыва, 💖 возвращает жизнь.\n' +
    '🔄 Разворот: бомба иногда меняет направление.',
  start(ctx) {
    const N = ctx.n;
    const DEPTH = 0.3;
    const LIVES = 3;
    const KINDS = {
      normal: { icon: '💣', name: 'Новая бомба', sub: null, fuse: [6, 15], color: '#ff8a5c' },
      fast: { icon: '⚡', name: 'Быстрая бомба', sub: 'короткий фитиль!', fuse: [3, 6], color: '#ffd84a' },
      chaos: { icon: '🔀', name: 'Хаос', sub: 'кнопка убегает', fuse: [7, 13], color: '#c39bff' },
      tiny: { icon: '🎯', name: 'Точность', sub: 'кнопка крошечная', fuse: [7, 13], color: '#4dd0ff' },
      code: { icon: '🔢', name: 'Код', sub: 'жми 1 → 2 → 3', fuse: [9, 16], color: '#3ddc97' },
      double: { icon: '👯', name: 'Две бомбы!', sub: 'первый взрыв заканчивает раунд', fuse: [6, 13], color: '#ff5a5f' },
    };
    const lives = ctx.players.map(() => LIVES);
    const shield = ctx.players.map(() => false);
    let starter = U.randInt(0, N - 1);
    let dir = 1;
    let state = 'wait'; // wait | pre | play | boom | done
    let kind = 'normal', lastKind = '';
    let bombs = [];
    let pickup = null;
    let roundNo = 0;
    let passes = 0;
    let boomT = 0, boomAt = { x: 0, y: 0 };
    let phase = 0;
    const sparks = [];

    ctx.root.classList.add('g-potato');
    ctx.root.append(U.h('style', null, `
      .g-potato .pz{border-radius:22px;transition:background .2s}
      .g-potato .pz::before{content:'';position:absolute;inset:6px;border-radius:20px;border:3px solid var(--pc);opacity:.22;pointer-events:none}
      .g-potato .pz.hold::before{opacity:0}
      .g-potato .pz.hold{background:rgba(255,90,40,.10);box-shadow:0 0 0 4px var(--pc) inset}
      .g-potato .pz.dead{opacity:.35}
      .g-potato .pz.boom{animation:potBoom .7s}
      .g-potato .pz.saved{animation:potSaved .8s}
      @keyframes potBoom{0%{background:rgba(255,200,80,.9)}100%{background:transparent}}
      @keyframes potSaved{0%{background:rgba(120,200,255,.8)}100%{background:transparent}}
      .g-potato .ph{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;justify-content:center;gap:14px;
        font-weight:800;white-space:nowrap}
      .g-potato .ph .lv{letter-spacing:2px}
      .g-potato .ph .st{color:var(--muted)}
      .g-potato .pz.hold .ph .st{color:var(--pc)}
      .g-potato .pa{position:absolute}
      .g-potato .wait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--muted);
        font-weight:800;font-size:26px;opacity:.6}
      .g-potato .pt{position:absolute;border-radius:50%;background:var(--pc);color:#111;font-weight:900;z-index:2;
        display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.05;text-align:center;
        box-shadow:0 0 0 6px rgba(255,255,255,.18),0 8px 30px rgba(0,0,0,.4);animation:potIn .15s ease-out}
      .g-potato .pt .e{font-size:1.5em}
      .g-potato .pt.num{border-radius:22px;font-size:40px}
      .g-potato .pt.num.done{opacity:.25}
      .g-potato .pt.bad{animation:potBad .3s}
      .g-potato .pt.b2{background:#fff}
      @keyframes potIn{0%{scale:.4;opacity:.2}100%{scale:1;opacity:1}}
      @keyframes potBad{0%,100%{translate:0}25%{translate:-8px}75%{translate:8px}}
      .g-potato .pk{position:absolute;width:76px;height:76px;border-radius:50%;z-index:3;display:flex;align-items:center;justify-content:center;
        font-size:46px;background:radial-gradient(circle,rgba(255,255,255,.9) 0,rgba(255,255,255,.4) 55%,rgba(255,255,255,0) 72%);
        animation:potPk .45s ease-in-out infinite alternate}
      @keyframes potPk{0%{scale:.9;rotate:-10deg}100%{scale:1.1;rotate:10deg}}
      .fx-flash{position:absolute;inset:0;z-index:36;pointer-events:none;transition:opacity .55s ease-out}
      .fx-shake{animation:fxShake .35s}
      @keyframes fxShake{0%,100%{translate:0 0}20%{translate:-9px 4px}40%{translate:8px -5px}60%{translate:-6px -3px}80%{translate:5px 3px}}
      .toast.fx-ban{font-size:26px;text-align:center;line-height:1.15;border:2px solid rgba(255,255,255,.3);animation:fxPop .4s ease-out;padding:10px 20px}
      .toast.fx-ban b{font-size:34px;margin-right:8px;vertical-align:-4px}
      .toast.fx-ban small{display:block;font-size:16px;font-weight:700;opacity:.85;margin-top:2px}
      @keyframes fxPop{0%{scale:.3;opacity:0}60%{scale:1.12;opacity:1}100%{scale:1}}
    `));

    const { g } = ctx.canvas();

    // ---------- juice: particles, flashes, shake, announcements ----------
    const fx = (() => {
      const { cv, g } = ctx.canvas({ z: 35 });
      cv.style.pointerEvents = 'none';
      const ps = [];
      const layer = U.h('div', { class: 'toast-layer' });
      ctx.root.append(layer);
      const active = [];
      const api = {
        at(el) {
          const r = el.getBoundingClientRect(), R = ctx.root.getBoundingClientRect();
          return { x: r.left - R.left + r.width / 2, y: r.top - R.top + r.height / 2 };
        },
        burst(x, y, color, n = 22, sp = 360, size = 6) {
          for (let k = 0; k < n; k++) {
            const a = Math.random() * 6.283, s = sp * (0.35 + Math.random() * 0.65), l = 0.5 + Math.random() * 0.5;
            ps.push({ kind: 'p', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, color, size: size * (0.6 + Math.random() * 0.8) });
          }
        },
        ring(x, y, color, r = 90) { ps.push({ kind: 'r', x, y, life: 0.5, max: 0.5, color, r }); },
        text(x, y, str, color, i, size = 38) {
          const v = ctx.toScreen(i, 0, -60);
          ps.push({ kind: 't', x, y, vx: v.x, vy: v.y, str, color, rot: ctx.players[i].rot, size, life: 1.1, max: 1.1 });
        },
        flash(color, a = 0.3) {
          const d = U.h('div', { class: 'fx-flash', style: { background: color, opacity: a } });
          ctx.root.append(d); void d.offsetWidth; d.style.opacity = 0;
          setTimeout(() => d.remove(), 700);
        },
        shake(el = ctx.root) { el.classList.remove('fx-shake'); void el.offsetWidth; el.classList.add('fx-shake'); },
        // announcement facing each player, just in front of their own zone (stacks if several are shown)
        banner(icon, title, sub, o = {}) {
          ctx.players.forEach(p => {
            const e = U.h('div', { class: 'toast fx-ban' }, U.h('b', null, icon), title, sub ? U.h('small', null, sub) : null);
            if (o.color) e.style.background = o.color;
            if (o.fg) e.style.color = o.fg;
            const z = zones[p.i].z, r = z.rect, v = ctx.inward(p.i);
            Object.assign(e.style, { maxWidth: (z.w - 16) + 'px', whiteSpace: 'normal' });
            layer.append(e);
            // room between this zone's inner edge and the screen center; drop older banners that would not fit
            const ex = r.x + r.w / 2 + v.x * z.h / 2, ey = r.y + r.h / 2 + v.y * z.h / 2;
            const room = (ctx.W / 2 - ex) * v.x + (ctx.H / 2 - ey) * v.y;
            const mine = active.filter(a => a.i === p.i);
            const sum = () => mine.reduce((s, a) => s + a.e.offsetHeight + 8, 0);
            while (mine.length && sum() + e.offsetHeight + 12 > Math.max(room, e.offsetHeight + 12)) {
              const old = mine.shift(); old.e.remove(); active.splice(active.indexOf(old), 1);
            }
            const stack = sum();
            const off = z.h / 2 + 12 + stack + e.offsetHeight / 2;
            Object.assign(e.style, { left: (r.x + r.w / 2 + v.x * off) + 'px', top: (r.y + r.h / 2 + v.y * off) + 'px', transform: `translate(-50%,-50%) rotate(${p.rot}deg)` });
            const a = { i: p.i, e };
            active.push(a);
            ctx.after(o.ms ?? 1700, () => { e.remove(); const k = active.indexOf(a); if (k >= 0) active.splice(k, 1); });
          });
        },
      };
      ctx.loop((dt) => {
        g.clearRect(0, 0, ctx.W, ctx.H);
        const damp = Math.exp(-3 * dt);
        for (let k = ps.length - 1; k >= 0; k--) {
          const p = ps[k];
          p.life -= dt;
          if (p.life <= 0) { ps.splice(k, 1); continue; }
          const f = p.life / p.max;
          if (p.kind === 'p') {
            p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= damp; p.vy *= damp;
            g.globalAlpha = Math.min(1, f * 1.5);
            g.fillStyle = p.color;
            g.beginPath(); g.arc(p.x, p.y, p.size * (0.4 + 0.6 * f), 0, 6.283); g.fill();
          } else if (p.kind === 'r') {
            g.globalAlpha = f;
            g.strokeStyle = p.color; g.lineWidth = 8 * f + 1;
            g.beginPath(); g.arc(p.x, p.y, p.r * (1 - f) + 10, 0, 6.283); g.stroke();
          } else {
            p.x += p.vx * dt; p.y += p.vy * dt;
            g.save();
            g.globalAlpha = Math.min(1, f * 2);
            g.translate(p.x, p.y); g.rotate(p.rot * Math.PI / 180);
            g.font = `900 ${p.size}px -apple-system,system-ui,sans-serif`;
            g.textAlign = 'center'; g.textBaseline = 'middle';
            g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.6)'; g.strokeText(p.str, 0, 0);
            g.fillStyle = p.color; g.fillText(p.str, 0, 0);
            g.restore();
          }
        }
        g.globalAlpha = 1;
      });
      return api;
    })();

    const zones = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH, className: 'pz' });
      const lv = U.h('span', { class: 'lv' });
      const st = U.h('span', { class: 'st' });
      const ph = U.h('div', { class: 'ph' }, lv, st);
      const pa = U.h('div', { class: 'pa' });
      const wait = U.h('div', { class: 'wait' }, 'ждите…');
      pa.append(wait);
      z.el.append(ph, pa);
      return { z, lv, st, ph, pa, wait };
    });

    // ----- layout -----
    function geo(zb) {
      const w = zb.z.w, h = zb.z.h, PAD = 12;
      const HH = Math.round(U.clamp(h * 0.17, 30, 46));
      return { w, h, PAD, HH, aw: w - 2 * PAD, ah: h - HH - PAD, S: Math.round(U.clamp(Math.min(h - HH - PAD, w * 0.42) * 0.86, 76, 150)) };
    }
    function btnSize(b, G) {
      if (b.kind === 'tiny') return Math.max(62, Math.round(G.S * 0.48));
      if (b.kind === 'chaos') return Math.round(G.S * 0.8);
      if (b.kind === 'code') return Math.max(66, Math.round(Math.min(G.S * 0.62, G.ah * 0.55)));
      if (b.kind === 'double') return Math.round(G.S * 0.8);
      return G.S;
    }
    function layout() {
      zones.forEach(zb => {
        const G = geo(zb);
        zb.ph.style.height = G.HH + 'px';
        zb.ph.style.fontSize = Math.round(G.HH * 0.55) + 'px';
        Object.assign(zb.pa.style, { left: G.PAD + 'px', top: G.HH + 'px', width: G.aw + 'px', height: G.ah + 'px' });
      });
      bombs.forEach(b => { if (b.ready) placeBomb(b); });
    }

    // random free spot of size S inside the holder's play area, away from rects in `avoid`
    function freeSpot(G, S, avoid) {
      let best = null, bd = -1;
      for (let t = 0; t < 40; t++) {
        const x = U.rand(0, Math.max(0, G.aw - S)), y = U.rand(0, Math.max(0, G.ah - S));
        let dmin = Infinity;
        for (const r of avoid) dmin = Math.min(dmin, Math.hypot(x + S / 2 - r.x - r.s / 2, y + S / 2 - r.y - r.s / 2) - (S + r.s) / 2);
        if (dmin > 8) return { x, y };
        if (dmin > bd) { bd = dmin; best = { x, y }; }
      }
      return best;
    }
    function occupied(i, except) {
      const out = [];
      bombs.forEach(b => {
        if (b === except || b.holder !== i || !b.ready) return;
        if (b.codeEls) b.codeEls.forEach(e => out.push({ x: e._x, y: e._y, s: e._s }));
        else out.push({ x: b.x, y: b.y, s: b.S });
      });
      return out;
    }
    function setPos(e, x, y, s) { e._x = x; e._y = y; e._s = s; Object.assign(e.style, { left: x + 'px', top: y + 'px', width: s + 'px', height: s + 'px' }); }

    function placeBomb(b) {
      const zb = zones[b.holder], G = geo(zb), S = btnSize(b, G);
      b.S = S;
      if (b.kind === 'code') {
        const avoid = occupied(b.holder, b);
        b.codeEls.forEach(e => { const p = freeSpot(G, S, avoid); setPos(e, p.x, p.y, S); avoid.push({ x: p.x, y: p.y, s: S }); e.style.fontSize = Math.round(S * 0.5) + 'px'; });
        return;
      }
      const p = freeSpot(G, S, occupied(b.holder, b));
      b.x = p.x; b.y = p.y;
      setPos(b.el, p.x, p.y, S);
      b.el.style.fontSize = Math.round(S * 0.17) + 'px';
      const a = U.rand(0, 6.283);
      b.vx = Math.cos(a) * 230; b.vy = Math.sin(a) * 230;
    }

    function makeBombEls(b) {
      if (b.kind === 'code') {
        b.codeEls = [1, 2, 3].map(k => {
          const e = U.h('div', { class: 'pt num' }, String(k));
          ctx.tap(e, () => codeTap(b, k, e));
          return e;
        });
      } else {
        b.el = U.h('div', { class: 'pt' + (b.id === 1 ? ' b2' : '') }, U.h('div', { class: 'e' }, '💣'), U.h('div', null, 'ПЕРЕДАЙ'));
        ctx.tap(b.el, () => passOn(b));
      }
    }
    function removeEls(b) {
      if (b.el) b.el.remove();
      if (b.codeEls) b.codeEls.forEach(e => e.remove());
    }

    function render() {
      zones.forEach((zb, i) => {
        const dead = lives[i] <= 0;
        zb.lv.textContent = '❤️'.repeat(Math.max(0, lives[i])) + '🖤'.repeat(LIVES - Math.max(0, lives[i])) + (shield[i] ? ' 🛡️' : '');
        const held = state === 'play' ? bombs.filter(b => b.holder === i).length : 0;
        const ready = bombs.some(b => b.holder === i && b.ready);
        zb.z.el.classList.toggle('hold', held > 0 && !dead);
        zb.z.el.classList.toggle('dead', dead);
        zb.st.textContent = held > 1 ? '2 бомбы у тебя!' : held ? 'бомба у тебя!' : '';
        zb.wait.textContent = dead ? '💀 выбыл' : held ? 'лови!' : 'ждите…';
        zb.wait.style.display = held && ready ? 'none' : 'flex';
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

    function giveTo(b, i) {
      removeEls(b);
      b.holder = i;
      b.ready = false;
      b.angT = angleTo(i);
      b.codeNext = 1;
      if (b.codeEls) b.codeEls.forEach(e => e.classList.remove('done'));
      ctx.cancel(b.showT);
      render();
      b.showT = ctx.after(U.rand(150, 230), () => {
        if (state !== 'play' || b.holder !== i) return;
        placeBomb(b);
        if (b.el) zones[i].pa.append(b.el); else b.codeEls.forEach(e => zones[i].pa.append(e));
        b.ready = true;
        render();
      });
    }

    function passOn(b) {
      if (state !== 'play' || !b.ready) return;
      const from = b.holder;
      const at = fx.at(b.el || b.codeEls[2]);
      fx.burst(at.x, at.y, ctx.players[from].color, 12, 260, 5);
      passes++;
      b.pass = 1;
      if (alive().length > 2 && passes > 2 && Math.random() < 0.12) {
        dir = -dir;
        fx.banner('🔄', 'Разворот!', null, { ms: 1000 });
      }
      giveTo(b, nextOf(from));
    }

    function codeTap(b, k, e) {
      if (state !== 'play' || !b.ready) return;
      if (k === b.codeNext) {
        e.classList.add('done');
        const at = fx.at(e);
        fx.ring(at.x, at.y, '#3ddc97', 60);
        b.codeNext++;
        if (b.codeNext > 3) passOn(b);
      } else {
        b.codeNext = 1;
        b.codeEls.forEach(x => { x.classList.remove('done'); x.classList.remove('bad'); void x.offsetWidth; x.classList.add('bad'); });
      }
    }

    // ----- pickups -----
    function clearPickup() {
      if (!pickup) return;
      ctx.cancel(pickup.timer);
      pickup.els.forEach(e => e.remove());
      pickup = null;
    }
    function spawnPickup() {
      if (state !== 'play') return;
      clearPickup();
      const hurt = alive().some(i => lives[i] < LIVES);
      const type = hurt && Math.random() < 0.5 ? 'heart' : 'shield';
      const icon = type === 'heart' ? '💖' : '🛡️';
      const els = [];
      alive().forEach(i => {
        const zb = zones[i], G = geo(zb), S = 76;
        const p = freeSpot(G, S, occupied(i));
        const e = U.h('div', { class: 'pk', style: { left: p.x + 'px', top: p.y + 'px' } }, icon);
        ctx.tap(e, () => grab(i));
        zb.pa.append(e);
        els.push(e);
      });
      pickup = { type, els, timer: ctx.after(2600, clearPickup) };
      fx.banner(icon, type === 'heart' ? 'Жизнь!' : 'Щит!', 'хватай первым', { ms: 1300 });
    }
    function grab(i) {
      if (!pickup || state !== 'play') return;
      const type = pickup.type, p = ctx.players[i];
      const e = pickup.els.find(x => zones[i].pa.contains(x));
      const at = e ? fx.at(e) : fx.at(zones[i].z.el);
      clearPickup();
      fx.burst(at.x, at.y, type === 'heart' ? '#ff6b9a' : '#7cc8ff', 28, 380, 7);
      fx.ring(at.x, at.y, '#fff', 90);
      if (type === 'heart') {
        if (lives[i] < LIVES) { lives[i]++; fx.text(at.x, at.y, '+❤️', '#fff', i); fx.banner('💖', `${p.name}: +1 жизнь`, null, { color: p.color, fg: '#111', ms: 1300 }); }
        else fx.banner('💖', `${p.name}: и так полный`, null, { ms: 1100 });
      } else {
        shield[i] = true;
        fx.text(at.x, at.y, '🛡️', '#fff', i);
        fx.banner('🛡️', `${p.name}: щит`, 'спасёт от одного взрыва', { color: p.color, fg: '#111', ms: 1400 });
      }
      render();
    }

    // ----- rounds -----
    function pickKind() {
      if (roundNo === 1) return 'normal';
      const pool = ['normal', 'fast', 'chaos', 'tiny', 'code'];
      if (alive().length === 3) pool.push('double', 'double');
      let k;
      do { k = U.pick(pool); } while (k === lastKind);
      return k;
    }

    function newRound() {
      roundNo++;
      if (lives[starter] <= 0) starter = nextOf(starter);
      kind = pickKind();
      lastKind = kind;
      const K = KINDS[kind];
      state = 'pre';
      fx.banner(K.icon, K.name, K.sub, { color: K.color, fg: '#111', ms: 1500 });
      if (kind !== 'normal') fx.flash(K.color, 0.18);
      bombs = [];
      render();
      ctx.after(kind === 'normal' ? 700 : 1400, () => {
        state = 'play';
        passes = 0;
        const holders = kind === 'double' ? [starter, nextOf(starter)] : [starter];
        bombs = holders.map((h, id) => {
          const b = { id, kind, holder: h, fuseStart: ctx.time, fuseEnd: ctx.time + U.rand(K.fuse[0], K.fuse[1]), ang: angleTo(h), angT: angleTo(h), pass: 0, ready: false };
          makeBombEls(b);
          return b;
        });
        bombs.forEach(b => giveTo(b, b.holder));
        if (Math.random() < 0.75) ctx.after(U.rand(1500, 4500), spawnPickup);
      });
    }

    function explode(b) {
      state = 'boom';
      boomT = 1;
      const i = b.holder;
      bombs.forEach(removeEls);
      clearPickup();
      const zb = zones[i], p = ctx.players[i];
      const C = centerXY();
      boomAt = { x: C.x + bombOffset(b).x, y: C.y + bombOffset(b).y };
      const za = fx.at(zb.z.el);
      if (shield[i]) {
        shield[i] = false;
        zb.z.el.classList.remove('saved'); void zb.z.el.offsetWidth; zb.z.el.classList.add('saved');
        fx.burst(boomAt.x, boomAt.y, '#7cc8ff', 50, 520, 8);
        fx.burst(za.x, za.y, '#7cc8ff', 30, 400, 7);
        fx.flash('#7cc8ff', 0.35);
        fx.shake();
        fx.banner('🛡️', 'Щит спас!', p.name, { color: '#7cc8ff', fg: '#111', ms: 1600 });
      } else {
        lives[i]--;
        zb.z.el.classList.remove('boom'); void zb.z.el.offsetWidth; zb.z.el.classList.add('boom');
        for (let k = 0; k < 40; k++) {
          const a = U.rand(0, Math.PI * 2), s = U.rand(120, 520);
          sparks.push({ x: boomAt.x, y: boomAt.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.5, 1) });
        }
        fx.burst(za.x, za.y, '#ffb340', 40, 500, 8);
        fx.flash('#ffc850', 0.45);
        fx.shake();
        fx.text(za.x, za.y, '−❤️', '#fff', i, 46);
        const msg = lives[i] > 0 ? `${p.name}: −1 ❤️` : `${p.name} выбывает!`;
        fx.banner('💥', 'БУМ!', msg, { color: p.color, fg: '#111', ms: 1700 });
      }
      bombs = [];
      render();
      const left = alive();
      if (left.length <= 1) {
        state = 'done';
        ctx.after(1700, () => ctx.end({ winner: left[0], msg: 'Жизни: ' + lives.map((l, k) => `${NAMES[k]} ${Math.max(0, l)}`).join(' · ') }));
        return;
      }
      // the one who exploded starts next (if still in)
      starter = i;
      ctx.after(2100, newRound);
    }

    ctx.loop((dt, t) => {
      if (dt > 0 && state === 'play') {
        const b = bombs.find(x => ctx.time >= x.fuseEnd);
        if (b) explode(b);
      }
      // chaos: the pass button runs around
      if (dt > 0 && state === 'play') {
        for (const b of bombs) {
          if (b.kind !== 'chaos' || !b.ready) continue;
          const G = geo(zones[b.holder]);
          b.x += b.vx * dt; b.y += b.vy * dt;
          if (Math.random() < dt * 1.2) { const a = U.rand(0, 6.283); b.vx = Math.cos(a) * 230; b.vy = Math.sin(a) * 230; }
          const mx = Math.max(0, G.aw - b.S), my = Math.max(0, G.ah - b.S);
          if (b.x < 0 || b.x > mx) { b.vx = -b.vx; b.x = U.clamp(b.x, 0, mx); }
          if (b.y < 0 || b.y > my) { b.vy = -b.vy; b.y = U.clamp(b.y, 0, my); }
          b.el.style.left = b.x + 'px'; b.el.style.top = b.y + 'px';
        }
      }
      let prog = 0;
      if (state === 'play') for (const b of bombs) prog = Math.max(prog, U.clamp((ctx.time - b.fuseStart) / 15, 0, 1)); // relative to max fuse: hides real length
      if (state === 'play' && kind === 'fast') prog = Math.min(1, prog * 2.5);
      const freq = 1.1 + 5 * Math.pow(prog, 1.4) + (state === 'play' ? 0.4 * Math.sin(t / 700) : 0);
      phase += dt * Math.PI * 2 * freq;
      for (const b of bombs) {
        let da = b.angT - b.ang;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        b.ang += da * Math.min(1, dt * 14);
        b.pass = Math.max(0, b.pass - dt * 5);
      }
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
    function bombR() {
      const C = centerXY();
      return U.clamp(C.r * (bombs.length > 1 ? 0.15 : 0.2), 30, 90);
    }
    function bombOffset(b) {
      const R = bombR();
      const sep = bombs.length > 1 ? (b.id ? 1 : -1) * R * 1.6 : 0;
      return { x: sep + Math.cos(b.ang) * R * 0.5, y: Math.sin(b.ang) * R * 0.5 };
    }

    function drawBomb(b, x, y, R, hc, pulse, prog) {
      const scale = 1 + 0.06 * pulse * (0.5 + prog) + 0.15 * b.pass;
      g.save();
      g.translate(x, y);
      g.rotate(b.ang);
      g.scale(scale, scale);
      // fuse (points along +x = toward holder)
      g.strokeStyle = '#c9a36b';
      g.lineWidth = Math.max(4, R * 0.1);
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(R * 0.85, 0);
      g.quadraticCurveTo(R * 1.25, -R * 0.25, R * 1.45, R * 0.05);
      g.stroke();
      g.fillStyle = '#555c78';
      g.fillRect(R * 0.72, -R * 0.24, R * 0.26, R * 0.48);
      const bg = g.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
      bg.addColorStop(0, b.id ? '#8a8fa8' : '#5a6286');
      bg.addColorStop(1, '#151829');
      g.fillStyle = bg;
      g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
      g.lineWidth = 4;
      g.strokeStyle = U.alpha(hc, 0.6 + 0.4 * pulse);
      g.stroke();
      // kind icon on the bomb
      if (kind !== 'normal') {
        g.rotate(-b.ang);
        g.font = `${Math.round(R * 0.8)}px -apple-system,system-ui,sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.globalAlpha = 0.85;
        g.fillText(KINDS[kind].icon, 0, 0);
        g.globalAlpha = 1;
        g.rotate(b.ang);
      }
      const sx = R * 1.45, sy = R * 0.05;
      const sr = R * (0.16 + 0.12 * pulse);
      const sg = g.createRadialGradient(sx, sy, 0, sx, sy, sr * 2.2);
      sg.addColorStop(0, '#fff7c2');
      sg.addColorStop(0.4, '#ffb340');
      sg.addColorStop(1, 'rgba(255,90,40,0)');
      g.fillStyle = sg;
      g.beginPath(); g.arc(sx, sy, sr * 2.2, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    function draw(T, prog) {
      const W = ctx.W, H = ctx.H;
      g.clearRect(0, 0, W, H);
      const C = centerXY();
      const R = bombR();
      const pulse = 0.5 + 0.5 * Math.sin(phase);
      // glow toward each holder
      if (state === 'play') {
        for (const b of bombs) {
          const hc = ctx.players[b.holder].color;
          const v = ctx.inward(b.holder);
          const ox = C.x - v.x * R * 1.6, oy = C.y - v.y * R * 1.6;
          const gr = g.createRadialGradient(ox, oy, 0, ox, oy, R * 4);
          gr.addColorStop(0, U.alpha(hc, 0.28 + 0.25 * pulse * prog));
          gr.addColorStop(1, U.alpha(hc, 0));
          g.fillStyle = gr;
          g.fillRect(0, 0, W, H);
        }
      }
      if (boomT > 0) {
        g.fillStyle = `rgba(255,190,80,${boomT * 0.3})`;
        g.fillRect(0, 0, W, H);
        g.strokeStyle = `rgba(255,220,150,${boomT})`;
        g.lineWidth = 12 * boomT;
        g.beginPath(); g.arc(boomAt.x, boomAt.y, (1 - boomT) * Math.max(W, H) * 0.6, 0, Math.PI * 2); g.stroke();
      }
      if (state === 'play') {
        for (const b of bombs) {
          const o = bombOffset(b);
          drawBomb(b, C.x + o.x, C.y + o.y, R, ctx.players[b.holder].color, pulse, prog);
        }
      } else if (state === 'wait' || state === 'pre') {
        // idle bomb waiting in the middle
        drawBomb({ id: 0, ang: angleTo(starter), pass: 0 }, C.x, C.y, R, ctx.players[starter].color, pulse, 0);
      }
      // explosion sparks
      for (const s of sparks) {
        g.fillStyle = `rgba(255,${150 + Math.round(100 * s.life)},60,${Math.min(1, s.life * 1.5)})`;
        g.beginPath(); g.arc(s.x, s.y, 4 + 6 * s.life, 0, Math.PI * 2); g.fill();
      }
    }

    layout();
    ctx.onResize(layout);
    render();
    ctx.after(0, newRound); // starts when the countdown ends
  },
});
