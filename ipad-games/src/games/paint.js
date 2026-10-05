registerGame({
  id: 'paint',
  title: 'Покраска',
  emoji: '🖌️',
  desc: 'Закрась своим цветом больше всех, лови бонусы',
  rules: 'Твой валик катится сам и красит поле. Держи ◀ или ▶ в своей зоне, чтобы поворачивать.\n' +
    'Чужую краску можно закрашивать. Через 60 секунд побеждает больший процент поля.\n' +
    'Бонусы:\n' +
    '🖌️ широкая кисть · ⚡ скорость · 💣 клякса · ❄️ заморозить соперников\n' +
    '🛡️ щит (твою краску не закрасить) · 🔀 соперникам руль наоборот\n' +
    '🧲 магнит для бонусов · 🔄 обмен всей территорией с лидером\n' +
    'События: 🌧️ ливень из краски (больше капель отстающим) и ⏩ финишный рывок в последние 10 секунд.\n' +
    'Игра бывает особой: 🧊 скользко, 🎁 бонусы ×2, 🖌️ широкие кисти.\n' +
    'Последнему месту помогает 🆘 фора: кисть шире, бонусы ближе.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const DUR = 60;
    const DEPTH = 0.2;
    const BG = '#0f1220';
    const ARW_L = '◀︎', ARW_R = '▶︎';
    const TAU = Math.PI * 2;

    ctx.root.classList.add('g-paint');
    ctx.root.append(U.h('style', null, `
      .g-paint .zone-inner{display:flex;align-items:stretch;gap:1.6vmin;padding:1.5vmin}
      .g-paint .cb{flex:1 1 0;max-width:27vmin;border-radius:3vmin;border:.5vmin solid var(--pc);color:var(--pc);
        background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;
        font-size:8vmin;font-weight:900;touch-action:none;transition:transform .07s}
      .g-paint .cb.on{background:var(--pc);color:#0f1220;transform:scale(.95);box-shadow:0 0 3.5vmin var(--pc)}
      .g-paint .cb.rev{border-style:dashed;animation:pt-wob .5s ease-in-out infinite alternate}
      .g-paint .cb.ice{background:rgba(160,220,255,.35);border-color:#bfe8ff}
      @keyframes pt-wob{from{transform:rotate(-4deg)}to{transform:rotate(4deg)}}
      .g-paint .info{flex:1.1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
        color:var(--pc);font-weight:900;text-align:center;pointer-events:none}
      .g-paint .pct{font-size:6vmin;line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums}
      .g-paint .pct.lead::after{content:' 👑';font-size:3.4vmin;vertical-align:middle}
      .g-paint .sub{font-size:2.6vmin;margin-top:.5vmin;white-space:nowrap;color:#e8ebff;opacity:.9;font-variant-numeric:tabular-nums}
      .g-paint .sub.hot{color:#ff6b6b;opacity:1}
      .g-paint .fx{font-size:2.7vmin;min-height:3.3vmin;margin-top:.5vmin;white-space:nowrap;color:#fff;font-variant-numeric:tabular-nums;
        overflow:hidden;max-width:100%}
      .g-paint .fx span{display:inline-block;margin:0 .3vmin;padding:.1vmin .6vmin;border-radius:1vmin;background:rgba(255,255,255,.12)}
      .g-paint .fx span.bad{background:rgba(255,77,109,.35)}
      .g-paint .bar{width:90%;height:.8vmin;border-radius:1vmin;background:rgba(255,255,255,.1);margin-top:.5vmin;overflow:hidden}
      .g-paint .bar i{display:block;height:100%;background:#e8ebff;opacity:.8;width:100%}
      .g-paint .bans{position:absolute;left:0;right:0;bottom:calc(100% + 1.2vmin);display:flex;flex-direction:column;
        align-items:center;gap:.8vmin;pointer-events:none;z-index:5}
      .g-paint .ban{padding:.9vmin 2.2vmin;border-radius:2vmin;background:rgba(15,18,32,.78);border:.4vmin solid var(--bc);
        color:#fff;font-weight:900;font-size:3vmin;white-space:nowrap;box-shadow:0 0 3vmin var(--bc);
        animation:pt-ban 1.9s ease-out forwards}
      .g-paint .ban.long{animation-duration:3s}
      @keyframes pt-ban{0%{transform:scale(.3);opacity:0}10%{transform:scale(1.15);opacity:1}20%{transform:scale(1)}
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
      const pct = U.h('div', { class: 'pct' }, '0%');
      const sub = U.h('div', { class: 'sub' }, '1:00');
      const fx = U.h('div', { class: 'fx' });
      const barI = U.h('i');
      const bans = U.h('div', { class: 'bans' });
      z.el.append(L, U.h('div', { class: 'info' }, pct, sub, fx, U.h('div', { class: 'bar' }, barI)), R, bans);
      return { z, L, R, pct, sub, fx, barI, bans, last: '', fxKey: '' };
    });

    function banner(i, text, color, long) {
      const u = ui[i];
      const b = U.h('div', { class: 'ban' + (long ? ' long' : '') }, text);
      b.style.setProperty('--bc', color || ctx.players[i].color);
      u.bans.append(b);
      while (u.bans.children.length > 2) u.bans.firstChild.remove();
      setTimeout(() => b.remove(), long ? 3100 : 2000);
    }
    function bannerAll(text, color, long) { ctx.players.forEach(p => banner(p.i, text, color, long)); }

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
    const fr0 = fieldRect();
    const S = Math.sqrt(fr0.w * fr0.h);
    const CS = Math.max(8, Math.round(S / 62)); // cell size
    const gw = Math.max(10, Math.floor(fr0.w / CS)), gh = Math.max(10, Math.floor(fr0.h / CS));
    const FW = gw * CS, FH = gh * CS;
    const TOTAL = gw * gh;
    let view = { s: 1, ox: 0, oy: 0 };
    function updView() {
      const fr = fieldRect();
      const s = Math.min(fr.w / FW, fr.h / FH);
      view = { s, ox: fr.x + (fr.w - FW * s) / 2, oy: fr.y + (fr.h - FH * s) / 2 };
    }
    updView();
    ctx.onResize(updView);

    /* ---------- round modifier ---------- */
    const MODS = {
      none:  { name: '' },
      ice:   { name: '🧊 Скользко!', chip: '🧊' },
      bonus: { name: '🎁 Бонусы ×2!', chip: '🎁' },
      wide:  { name: '🖌️ Широкие кисти у всех!', chip: '🖌️' },
    };
    const mod = window.__dbgMod || (Math.random() < 0.3 ? 'none' : U.pick(['ice', 'bonus', 'wide'])); // __dbgMod: test hook

    /* ---------- paint grid ---------- */
    const owner = new Int8Array(TOTAL).fill(-1);
    const counts = ctx.players.map(() => 0);
    const off = document.createElement('canvas');
    off.width = gw; off.height = gh;
    const og = off.getContext('2d');
    const rgb = ctx.players.map(p => { const n = parseInt(p.color.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; });
    function redrawAll() {
      const img = og.createImageData(gw, gh);
      for (let k = 0; k < TOTAL; k++) {
        const o = owner[k];
        if (o < 0) continue;
        img.data[k * 4] = rgb[o][0]; img.data[k * 4 + 1] = rgb[o][1]; img.data[k * 4 + 2] = rgb[o][2]; img.data[k * 4 + 3] = 255;
      }
      og.putImageData(img, 0, 0);
    }
    function paintCircle(x, y, r, who) {
      const x0 = Math.max(0, Math.floor((x - r) / CS)), x1 = Math.min(gw - 1, Math.floor((x + r) / CS));
      const y0 = Math.max(0, Math.floor((y - r) / CS)), y1 = Math.min(gh - 1, Math.floor((y + r) / CS));
      const r2 = r * r;
      og.fillStyle = ctx.players[who].color;
      for (let cy = y0; cy <= y1; cy++) {
        const dy = (cy + .5) * CS - y;
        for (let cx = x0; cx <= x1; cx++) {
          const dx = (cx + .5) * CS - x;
          if (dx * dx + dy * dy > r2) continue;
          const k = cy * gw + cx;
          const o = owner[k];
          if (o === who) continue;
          if (o >= 0) {
            if (blobs && blobs[o].fx.shield > 0) continue;
            counts[o]--;
          }
          owner[k] = who;
          counts[who]++;
          og.fillRect(cx, cy, 1, 1);
        }
      }
    }

    /* ---------- blobs ---------- */
    const R0 = CS * 2.3;
    const SPEED = S * 0.21 * (mod === 'ice' ? 1.15 : 1);
    const TURN = 3.3 * (mod === 'ice' ? 0.55 : 1);
    const edge = Math.max(R0 * 2.5, Math.min(FW, FH) * 0.12);
    let blobs = null;
    blobs = ctx.players.map(p => {
      const v = ctx.inward(p.i);
      let x, y;
      if (p.side === 'bottom') { x = FW / 2; y = FH - edge; }
      else if (p.side === 'top') { x = FW / 2; y = edge; }
      else if (p.side === 'left') { x = edge; y = FH / 2; }
      else { x = FW - edge; y = FH / 2; }
      if (ctx.n === 2) x += (p.side === 'bottom' ? -1 : 1) * FW * 0.12;
      return { i: p.i, color: p.color, x, y, a: Math.atan2(v.y, v.x), bump: 0, roll: 0, r: R0,
        fx: { big: 0, fast: 0, freeze: 0, shield: 0, rev: 0, magnet: 0 }, help: false };
    });
    blobs.forEach(b => paintCircle(b.x, b.y, R0 * 1.3, b.i));

    /* ---------- power-ups ---------- */
    const PU = {
      big:    { em: '🖌️', col: '#c58bff', w: 2.5, self: '🖌️ Широкая кисть!' },
      fast:   { em: '⚡', col: '#3ddc97', w: 2.5, self: '⚡ Скорость!' },
      bomb:   { em: '💣', col: '#ff9f43', w: 2,   self: '💣 Клякса!' },
      freeze: { em: '❄️', col: '#9fdcff', w: 1.6, self: '❄️ Враги заморожены!', foe: '❄️ Заморозка!' },
      shield: { em: '🛡️', col: '#ffd166', w: 1.6, self: '🛡️ Щит на краску!' },
      rev:    { em: '🔀', col: '#ff6b9a', w: 1.6, self: '🔀 Путаница врагам!', foe: '🔀 Руль наоборот!' },
      magnet: { em: '🧲', col: '#ff5a7a', w: 1.2, self: '🧲 Магнит!' },
      swap:   { em: '🔄', col: '#7af0ff', w: 0.7, self: '🔄 Обмен с лидером!', foe: '🔄 Тебя обокрали!' },
    };
    const PU_KEYS = Object.keys(PU);
    function pickPU() {
      if (window.__dbgPU) return U.pick(window.__dbgPU); // test hook
      const keys = PU_KEYS.filter(k => k !== 'swap' || elapsed > 15);
      let tot = 0; for (const k of keys) tot += PU[k].w;
      let r = Math.random() * tot;
      for (const k of keys) { r -= PU[k].w; if (r <= 0) return k; }
      return 'big';
    }
    let pups = [];
    let parts = [], rings = [], drops = [];
    let shake = 0;
    function spawnPU() {
      if (state !== 'play' || pups.length >= (mod === 'bonus' ? 4 : 2)) return;
      const pr = CS * 1.6;
      const helped = blobs.find(b => b.help);
      for (let tries = 0; tries < 40; tries++) {
        let x, y;
        if (helped && Math.random() < 0.6 && tries < 20) {
          const a = Math.random() * TAU, d = U.rand(S * 0.15, S * 0.3);
          x = helped.x + Math.cos(a) * d; y = helped.y + Math.sin(a) * d;
          if (x < pr * 2 || y < pr * 2 || x > FW - pr * 2 || y > FH - pr * 2) continue;
        } else { x = U.rand(pr * 2, FW - pr * 2); y = U.rand(pr * 2, FH - pr * 2); }
        if (blobs.some(b => U.dist(b.x, b.y, x, y) < S * 0.14)) continue;
        if (pups.some(q => U.dist(q.x, q.y, x, y) < S * 0.15)) continue;
        pups.push({ x, y, r: pr, type: pickPU(), t: 0, life: 10 });
        return;
      }
    }

    let state = 'play';
    let elapsed = 0;
    let lastTick = -1;
    let nextPU = 3;
    const rainAt = U.rand(18, 38);
    let rainLeft = 0, rainAcc = 0, rushOn = false, rained = false;

    function fmt(t) {
      t = Math.max(0, Math.ceil(t));
      return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    }
    function renderUI() {
      const left = DUR - elapsed;
      const best = Math.max(...counts);
      ui.forEach((u, i) => {
        const pc = Math.round(counts[i] / TOTAL * 100);
        const key = pc + '|' + fmt(left) + (counts[i] === best);
        if (key !== u.last) {
          u.last = key;
          u.pct.textContent = pc + '%';
          u.pct.classList.toggle('lead', counts[i] === best && best > 0 && counts.filter(c => c === best).length === 1);
          u.sub.textContent = '⏱ ' + fmt(left) + (rushOn ? ' ⏩' : '') + (MODS[mod].chip ? ' ' + MODS[mod].chip : '');
          u.sub.classList.toggle('hot', left <= 10);
          u.barI.style.width = (Math.max(0, left) / DUR * 100).toFixed(1) + '%';
        }
        const b = blobs[i], f = b.fx, chips = [];
        const add = (em, t, bad) => chips.push([em + ' ' + Math.ceil(t), bad]);
        if (f.big > 0) add('🖌️', f.big);
        if (f.fast > 0) add('⚡', f.fast);
        if (f.shield > 0) add('🛡️', f.shield);
        if (f.magnet > 0) add('🧲', f.magnet);
        if (f.freeze > 0) add('❄️', f.freeze, true);
        if (f.rev > 0) add('🔀', f.rev, true);
        if (b.help) chips.push(['🆘 фора', false]);
        const fk = chips.map(c => c[0]).join('|');
        if (fk !== u.fxKey) {
          u.fxKey = fk;
          u.fx.replaceChildren(...chips.map(c => U.h('span', { class: c[1] ? 'bad' : '' }, c[0])));
          u.L.classList.toggle('rev', f.rev > 0); u.R.classList.toggle('rev', f.rev > 0);
          u.L.classList.toggle('ice', f.freeze > 0); u.R.classList.toggle('ice', f.freeze > 0);
        }
      });
    }

    function finish() {
      state = 'over';
      let pcs = counts.map(c => Math.round(c / TOTAL * 100));
      if (new Set(pcs).size < pcs.length) pcs = counts.map(c => Math.round(c / TOTAL * 1000) / 10);
      const best = Math.max(...counts);
      const winners = counts.map((c, i) => c === best ? i : -1).filter(i => i >= 0);
      const msg = ctx.players.map(p => `${p.name} ${pcs[p.i]}%`).join(' · ');
      if (winners.length === 1) {
        const p = ctx.players[winners[0]];
        say(`${p.name}: ${pcs[p.i]}%!`, { color: p.color, fg: '#111', ms: 1800 });
      } else say('Ничья!', { ms: 1800 });
      ctx.after(1900, () => ctx.end({ winners, scores: pcs, msg }));
    }

    ctx.onStart = () => {
      say('Крась!', { ms: 800, color: '#3ddc97', fg: '#0f1220' });
      if (mod !== 'none') bannerAll(MODS[mod].name, '#ffffff', true);
    };

    ctx.loop((dt) => {
      if (dt > 0 && state === 'play') update(dt);
      if (dt > 0) {
        for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        parts = parts.filter(p => p.t < p.life);
        for (const r of rings) r.t += dt;
        rings = rings.filter(r => r.t < r.life);
        shake *= Math.exp(-dt * 9);
      }
      renderUI();
      draw();
    });

    function applyPU(b, q) {
      const def = PU[q.type];
      const foes = blobs.filter(o => o !== b);
      rings.push({ x: q.x, y: q.y, t: 0, life: 0.45, c: def.col, r: CS * 6 });
      burst(q.x, q.y, def.col, 18);
      switch (q.type) {
        case 'big': b.fx.big = 5; break;
        case 'fast': b.fx.fast = 5; b.fx.freeze = 0; break;
        case 'bomb':
          paintCircle(q.x, q.y, CS * 6.5, b.i);
          burst(q.x, q.y, b.color, 40);
          rings.push({ x: q.x, y: q.y, t: 0, life: 0.6, c: b.color, r: CS * 9 });
          shake = Math.max(shake, 7);
          break;
        case 'freeze': foes.forEach(o => { o.fx.freeze = 2.2; o.fx.fast = 0; burst(o.x, o.y, '#bfe8ff', 16); }); shake = Math.max(shake, 4); break;
        case 'shield': b.fx.shield = 5; break;
        case 'rev': foes.forEach(o => { o.fx.rev = 4; }); break;
        case 'magnet': b.fx.magnet = 6; break;
        case 'swap': {
          let lead = -1, lc = -1;
          for (const o of foes) if (counts[o.i] > lc) { lc = counts[o.i]; lead = o.i; }
          if (lead < 0 || counts[lead] <= counts[b.i]) { // already leading: becomes a big splash
            paintCircle(q.x, q.y, CS * 6.5, b.i);
            banner(b.i, '💣 Ты лидер: клякса!', def.col);
            shake = Math.max(shake, 6);
            return;
          }
          for (let k = 0; k < TOTAL; k++) {
            if (owner[k] === b.i) owner[k] = lead; else if (owner[k] === lead) owner[k] = b.i;
          }
          const t = counts[b.i]; counts[b.i] = counts[lead]; counts[lead] = t;
          redrawAll();
          shake = Math.max(shake, 12);
          banner(b.i, def.self, def.col);
          banner(lead, def.foe, '#ff4d6d');
          return;
        }
      }
      banner(b.i, def.self, def.col);
      if (def.foe) foes.forEach(o => banner(o.i, def.foe, '#ff4d6d'));
    }

    function update(dt) {
      elapsed += dt;
      const left = DUR - elapsed;
      if (left <= 3.999 && Math.ceil(left) !== lastTick && left > 0) {
        lastTick = Math.ceil(left);
        say(String(lastTick), { ms: 700, size: 40 });
      }
      if (!rushOn && left <= 10) {
        rushOn = true;
        bannerAll('⏩ Финишный рывок: скорость ×1.5!', '#ff6b6b', true);
        shake = Math.max(shake, 5);
      }
      if (!rained && elapsed >= rainAt) {
        rained = true;
        rainLeft = 4;
        bannerAll('🌧️ Ливень из краски!', '#5ec8ff', true);
      }
      if (rainLeft > 0) {
        rainLeft = Math.max(0, rainLeft - dt);
        rainAcc += dt;
        while (rainAcc > 0.09) {
          rainAcc -= 0.09;
          // weight toward players with less paint
          const w = counts.map(c => Math.pow(1 - c / TOTAL, 3) + 0.05);
          let r = Math.random() * w.reduce((a, b) => a + b, 0), who = 0;
          for (let k = 0; k < w.length; k++) { r -= w[k]; if (r <= 0) { who = k; break; } }
          drops.push({ x: U.rand(0, FW), y: U.rand(0, FH), who, t: 0, life: 0.45, r: CS * U.rand(1.6, 2.8) });
        }
      }
      drops = drops.filter(d => {
        d.t += dt;
        if (d.t >= d.life) {
          paintCircle(d.x, d.y, d.r, d.who);
          burst(d.x, d.y, ctx.players[d.who].color, 5);
          return false;
        }
        return true;
      });
      if (elapsed >= nextPU) { spawnPU(); nextPU = elapsed + U.rand(3.5, 6) * (mod === 'bonus' ? 0.5 : 1); }
      // comeback: last place with a real gap gets help
      const best = Math.max(...counts), worst = Math.min(...counts);
      blobs.forEach(b => {
        b.helpHold = Math.max(0, (b.helpHold || 0) - dt);
        if (b.helpHold > 0) return; // hysteresis: keep the state for a while
        const want = elapsed > 8 && counts[b.i] === worst && (best - worst) / TOTAL > (b.help ? 0.03 : 0.06);
        if (want !== b.help) {
          b.help = want;
          b.helpHold = 5;
          if (want && !b.helpSaid) { b.helpSaid = true; banner(b.i, '🆘 Фора: кисть шире!', '#ff9f43'); }
        }
      });
      for (const b of blobs) {
        const u = ui[b.i];
        let L = u.L.ids.size > 0, R = u.R.ids.size > 0;
        if (b.fx.rev > 0) { const t = L; L = R; R = t; }
        const turn = (R ? 1 : 0) - (L ? 1 : 0);
        for (const k in b.fx) b.fx[k] = Math.max(0, b.fx[k] - dt);
        b.bump = Math.max(0, b.bump - dt);
        if (b.fx.freeze > 0) { b.r = R0; continue; }
        b.a += turn * TURN * dt;
        const sp = SPEED * (b.fx.fast > 0 ? 1.65 : 1) * (rushOn ? 1.5 : 1);
        const rad = R0 * (b.fx.big > 0 ? 1.8 : 1) * (mod === 'wide' ? 1.35 : 1) * (b.help ? 1.25 : 1);
        b.r = rad;
        const dist = sp * dt;
        const steps = Math.max(1, Math.ceil(dist / (CS * 0.5)));
        for (let k = 0; k < steps; k++) {
          b.x += Math.cos(b.a) * dist / steps;
          b.y += Math.sin(b.a) * dist / steps;
          const rr = R0 * 0.9;
          let hitWall = false;
          if (b.x < rr) { b.x = rr; b.a = Math.PI - b.a; hitWall = true; }
          if (b.x > FW - rr) { b.x = FW - rr; b.a = Math.PI - b.a; hitWall = true; }
          if (b.y < rr) { b.y = rr; b.a = -b.a; hitWall = true; }
          if (b.y > FH - rr) { b.y = FH - rr; b.a = -b.a; hitWall = true; }
          if (hitWall) burst(b.x, b.y, b.color, 4);
          paintCircle(b.x, b.y, rad, b.i);
        }
        b.roll += dist / (R0 * 0.5);
        if (b.fx.fast > 0 || rushOn) parts.push({ x: b.x - Math.cos(b.a) * R0, y: b.y - Math.sin(b.a) * R0, vx: 0, vy: 0, life: 0.3, t: 0, c: b.color });
      }
      // blob-blob bumps
      for (let i = 0; i < blobs.length; i++) for (let j = i + 1; j < blobs.length; j++) {
        const a = blobs[i], b = blobs[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), md = R0 * 1.8;
        if (d >= md || d < 0.001) continue;
        const nx = dx / d, ny = dy / d, ov = (md - d) / 2;
        a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
        const reflect = (o, mx, my) => {
          const vx = Math.cos(o.a), vy = Math.sin(o.a), dot = vx * mx + vy * my;
          if (dot > 0) o.a = Math.atan2(vy - 2 * dot * my, vx - 2 * dot * mx);
        };
        reflect(a, nx, ny); reflect(b, -nx, -ny);
        if (a.bump <= 0) { burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffffff', 12); shake = Math.max(shake, 3); }
        a.bump = b.bump = 0.25;
      }
      // power-ups (magnet pulls)
      for (const q of pups) {
        q.t += dt;
        for (const b of blobs) {
          if (b.fx.magnet <= 0) continue;
          const dx = b.x - q.x, dy = b.y - q.y, d = Math.hypot(dx, dy);
          if (d > 1) { const v = Math.min(d, S * 0.45 * dt); q.x += dx / d * v; q.y += dy / d * v; }
        }
      }
      pups = pups.filter(q => {
        if (q.t > q.life) return false;
        for (const b of blobs) {
          if (b.fx.freeze <= 0 && U.dist(b.x, b.y, q.x, q.y) < R0 + q.r) { applyPU(b, q); return false; }
        }
        return true;
      });
      if (elapsed >= DUR) finish();
    }

    function burst(x, y, c, n) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * TAU, v = U.rand(30, 160) * S / 700;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(.35, .8), t: 0, c });
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
      g.fillStyle = mod === 'ice' ? '#16203a' : '#151a35';
      g.fillRect(0, 0, FW, FH);
      // painted cells
      g.imageSmoothingEnabled = false;
      g.globalAlpha = 0.82;
      g.drawImage(off, 0, 0, FW, FH);
      g.globalAlpha = 1;
      g.imageSmoothingEnabled = true;
      // shielded territory shimmer
      for (const b of blobs) {
        if (b.fx.shield <= 0) continue;
        g.save();
        g.globalAlpha = 0.18 + 0.1 * Math.sin(now * 8);
        g.fillStyle = '#ffffff';
        for (let k = 0; k < TOTAL; k += 1) {
          if (owner[k] !== b.i) continue;
          const cx = k % gw, cy = (k - cx) / gw;
          if ((cx + cy) % 2) continue;
          g.fillRect(cx * CS + CS * 0.3, cy * CS + CS * 0.3, CS * 0.4, CS * 0.4);
        }
        g.restore();
      }
      // cell grid
      g.strokeStyle = 'rgba(15,18,32,.55)';
      g.lineWidth = Math.max(1, 1.2 / s);
      g.beginPath();
      for (let x = CS; x < FW; x += CS) { g.moveTo(x, 0); g.lineTo(x, FH); }
      for (let y = CS; y < FH; y += CS) { g.moveTo(0, y); g.lineTo(FW, y); }
      g.stroke();
      // border
      g.save();
      g.strokeStyle = rushOn ? '#ff6b6b' : '#3a4580';
      g.lineWidth = 3;
      g.shadowColor = rushOn ? '#ff6b6b' : '#6c7cff';
      g.shadowBlur = rushOn ? 14 + 8 * Math.sin(now * 10) : 10;
      g.strokeRect(-1.5, -1.5, FW + 3, FH + 3);
      g.restore();

      // rain drops (shrinking target rings)
      for (const d of drops) {
        const k = d.t / d.life;
        g.strokeStyle = U.alpha(ctx.players[d.who].color, 0.3 + 0.6 * k);
        g.lineWidth = CS * 0.25;
        g.beginPath(); g.arc(d.x, d.y, d.r * (2.2 - 1.2 * k), 0, TAU); g.stroke();
      }
      // power-ups
      for (const q of pups) {
        const blink = q.life - q.t < 2 && Math.floor(now * 8) % 2 === 0;
        if (blink) continue;
        const pop = Math.min(1, q.t * 4);
        const r = q.r * pop * (1 + 0.08 * Math.sin(now * 6 + q.x));
        const col = PU[q.type].col;
        g.save();
        g.shadowColor = col; g.shadowBlur = 18;
        g.fillStyle = 'rgba(15,18,32,.85)';
        g.strokeStyle = col; g.lineWidth = CS * 0.3;
        g.beginPath(); g.arc(q.x, q.y, r, 0, TAU); g.fill(); g.stroke();
        g.restore();
        g.font = `${Math.round(r * 1.15)}px sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(PU[q.type].em, q.x, q.y + r * 0.06);
      }
      // particles under the blobs
      for (const p of parts) {
        const k = 1 - p.t / p.life;
        g.globalAlpha = k;
        g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, CS * 0.3 * (0.4 + k), 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
      // blobs
      for (const b of blobs) {
        const R = b.r || R0;
        const frozen = b.fx.freeze > 0;
        g.save();
        g.shadowColor = b.color; g.shadowBlur = 22;
        g.fillStyle = b.color;
        g.beginPath(); g.arc(b.x, b.y, R0, 0, TAU); g.fill();
        g.shadowBlur = 0;
        if (R > R0 * 1.01) {
          g.strokeStyle = U.alpha('#ffffff', 0.55);
          g.setLineDash([CS * 0.6, CS * 0.5]);
          g.lineWidth = CS * 0.2;
          g.beginPath(); g.arc(b.x, b.y, R, now * 2, now * 2 + TAU); g.stroke();
          g.setLineDash([]);
        }
        g.translate(b.x, b.y);
        g.rotate(b.a);
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.beginPath(); g.arc(R0 * 0.35, 0, R0 * 0.32, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(15,18,32,.45)';
        g.lineWidth = R0 * 0.12;
        const ph = (b.roll % 1) * R0 * 0.6;
        for (let k = -2; k <= 2; k++) {
          const xx = k * R0 * 0.6 - ph + R0 * 0.3;
          if (Math.abs(xx) > R0 * 0.85) continue;
          const hh = Math.sqrt(R0 * R0 - xx * xx) * 0.85;
          g.beginPath(); g.moveTo(xx, -hh); g.lineTo(xx, hh); g.stroke();
        }
        g.restore();
        if (frozen) {
          g.save();
          g.fillStyle = 'rgba(190,232,255,.55)';
          g.strokeStyle = '#e6f7ff';
          g.lineWidth = CS * 0.2;
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = k / 6 * TAU + 0.3;
            const rr = R0 * (1.25 + (k % 2) * 0.2);
            if (k === 0) g.moveTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr); else g.lineTo(b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr);
          }
          g.closePath(); g.fill(); g.stroke();
          g.font = `${Math.round(R0 * 1.1)}px sans-serif`;
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('❄️', b.x, b.y);
          g.restore();
        }
        if (b.fx.shield > 0) {
          g.save();
          g.strokeStyle = U.alpha('#ffd166', 0.6 + 0.3 * Math.sin(now * 8));
          g.lineWidth = CS * 0.3;
          g.shadowColor = '#ffd166'; g.shadowBlur = 12;
          g.beginPath(); g.arc(b.x, b.y, R0 * 1.45, 0, TAU); g.stroke();
          g.restore();
        }
        if (b.fx.magnet > 0) {
          g.save();
          g.strokeStyle = U.alpha('#ff5a7a', 0.35);
          g.lineWidth = CS * 0.2;
          const ph2 = (now * 1.5) % 1;
          for (let k = 0; k < 2; k++) {
            const rr = R0 * (4 - 2.8 * ((ph2 + k * 0.5) % 1));
            g.beginPath(); g.arc(b.x, b.y, rr, 0, TAU); g.stroke();
          }
          g.restore();
        }
        if (b.fx.rev > 0) {
          g.save();
          g.strokeStyle = U.alpha('#ff4d6d', 0.7);
          g.lineWidth = CS * 0.25;
          g.setLineDash([CS * 0.6, CS * 0.5]);
          g.beginPath(); g.arc(b.x, b.y, R0 * 1.7, -now * 3, -now * 3 + TAU); g.stroke();
          g.restore();
        }
        if (ctx.paused || elapsed < 1.2) {
          const ca = Math.cos(b.a), sa = Math.sin(b.a), L = R0 * 2.6;
          const pulse = 0.5 + 0.5 * Math.sin(now * 6);
          g.save();
          g.strokeStyle = g.fillStyle = U.alpha(b.color, 0.55 + 0.4 * pulse);
          g.lineWidth = CS * 0.35;
          const tx = b.x + ca * L, ty = b.y + sa * L;
          g.beginPath(); g.moveTo(b.x + ca * R0 * 1.4, b.y + sa * R0 * 1.4); g.lineTo(tx, ty); g.stroke();
          g.beginPath();
          g.moveTo(tx + ca * CS, ty + sa * CS);
          g.lineTo(tx - sa * CS * 0.7, ty + ca * CS * 0.7);
          g.lineTo(tx + sa * CS * 0.7, ty - ca * CS * 0.7);
          g.closePath(); g.fill();
          g.restore();
        }
      }
      for (const r of rings) {
        const k = r.t / r.life;
        g.strokeStyle = U.alpha(r.c, 1 - k);
        g.lineWidth = CS * 0.5 * (1 - k) + 1;
        g.beginPath(); g.arc(r.x, r.y, r.r * (0.2 + k), 0, TAU); g.stroke();
      }
    }
  },
});
