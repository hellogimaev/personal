registerGame({
  id: 'spot',
  title: 'Найди пару',
  emoji: '👀',
  desc: 'Найди картинку, которая есть и у тебя, и в центре',
  rules: 'В центре общая карта, у каждого игрока своя. Ровно одна твоя картинка есть и в центре.\nНайди её и нажми у себя первым: +1. Ошибся: заморозка ❄️ на 1,5 с.\n⚡ Нашёл быстрее 2,5 с: +1 сверху.\n⭐ Золотой символ в центре: +2 (чаще достаётся отстающему).\n🔥 Три раунда подряд: соперники замёрзнут на 2 с.\nРаунды-сюрпризы: 🌀 Карусель (карта крутится), 🔍 Мелочь, 🕶️ Тени, 👯 Двойная (найди обе картинки, +2), 🌪️ Вихрь (картинки бегают).\nИгра до 10 очков.',
  start(ctx) {
    const TARGET = 10;
    const PER_CARD = 8;
    const POOL = ['🍎', '🍌', '🍇', '🍉', '🍓', '🍒', '🍍', '🥕', '🌽', '🍄', '🌵', '🌲', '🌻', '🌹', '🍁',
      '🔥', '💧', '⭐', '🌙', '⚡', '❄️', '🌈', '🎈', '🎁', '🎸', '🥁', '🎲', '🧩', '⚽', '🏀', '🎯',
      '🚗', '🚀', '✈️', '⛵', '🚲', '⏰', '🔑', '💡', '📷', '✏️', '✂️', '🧲', '🐶', '🐱', '🐰', '🦊',
      '🐼', '🐸', '🐵', '🐔', '🐧', '🐢', '🐙', '🦋', '🐝', '🐞', '🦀', '🐳', '🦄', '👻', '🤖', '👑',
      '🎩', '👓', '💎', '❤️', '🍕', '🧀', '🍦'];
    const MODS = {
      spin: { icon: '🌀', text: 'Карусель!' },
      tiny: { icon: '🔍', text: 'Мелочь!' },
      shadow: { icon: '🕶️', text: 'Тени!' },
      double: { icon: '👯', text: 'Двойная: найди обе!' },
      swirl: { icon: '🌪️', text: 'Вихрь!' },
    };
    const FAST = 2.5;

    const score = ctx.players.map(() => 0);
    const frozenUntil = ctx.players.map(() => -1);
    let state = 'play'; // play | show | done
    let center = [];          // symbols on the center card
    let hands = [];           // hands[i] = symbols on player i's card
    let common = [];          // common[i] = matching symbols for player i (1, or 2 in "double")
    let found = [];           // found[i] = Set of already found symbols this round
    let mod = null, lastMod = null, golden = null;
    let roundNo = 0, roundStart = 0;
    let streak = { who: -1, n: 0 };
    let swirlTimer = null;

    ctx.root.classList.add('g-spot');
    ctx.root.append(U.h('style', null, `
      .g-spot .ctr{position:absolute;border-radius:50%;background:#f4f1e8;
        box-shadow:0 0 0 8px rgba(255,255,255,.06),0 10px 40px rgba(0,0,0,.5);overflow:hidden;transition:box-shadow .3s}
      .g-spot .spin{position:absolute;inset:0}
      .g-spot.m-spin .spin{animation:spotSpin 11s linear infinite}
      .g-spot.pz .spin{animation-play-state:paused}
      @keyframes spotSpin{to{transform:rotate(360deg)}}
      .g-spot.m-spin .ctr{box-shadow:0 0 0 8px rgba(120,200,255,.35),0 10px 40px rgba(0,0,0,.5)}
      .g-spot .sym{position:absolute;left:0;top:0;line-height:1;text-align:center;
        transition:transform .25s, filter .25s;will-change:transform}
      .g-spot .ctr .sym.gold{filter:drop-shadow(0 0 5px #ffc400) drop-shadow(0 0 12px #ffb300)}
      .g-spot .ctr .sym.gold::after{content:'';position:absolute;inset:-12%;border-radius:50%;border:4px dashed #e0a800;
        animation:spotSpin 4s linear infinite}
      .g-spot .ctr .sym.hit{filter:drop-shadow(0 0 6px var(--hc)) drop-shadow(0 0 14px var(--hc))}
      .g-spot.m-shadow .sym{filter:brightness(0) opacity(.82)}
      .g-spot.m-shadow .ctr .sym.gold{filter:brightness(0) drop-shadow(0 0 5px #ffc400) drop-shadow(0 0 12px #ffb300)}
      .g-spot.m-shadow .ctr .sym.hit{filter:brightness(0) drop-shadow(0 0 6px var(--hc)) drop-shadow(0 0 14px var(--hc))}
      .g-spot .badge{position:absolute;width:76px;height:76px;margin:-38px 0 0 -38px;border-radius:50%;background:#2b3157;
        border:4px solid #fff;display:flex;align-items:center;justify-content:center;font-size:42px;z-index:5;
        box-shadow:0 6px 18px rgba(0,0,0,.45);transform:scale(0);transition:transform .3s cubic-bezier(.3,1.6,.6,1)}
      .g-spot .badge.on{transform:scale(1)}
      .g-spot .zi{position:absolute;inset:8px;display:flex;gap:10px;align-items:stretch}
      .g-spot .sc{flex:0 0 84px;border-radius:20px;background:var(--pc);color:#111;display:flex;flex-direction:column;
        align-items:center;justify-content:center;font-weight:900;position:relative}
      .g-spot .sc .n{font-size:48px;line-height:1}
      .g-spot .sc .t{font-size:15px;opacity:.7;margin-top:2px}
      .g-spot .sc .st{position:absolute;top:-6px;right:-6px;font-size:22px;line-height:1;display:none}
      .g-spot .sc .st.on{display:block;animation:spotPop .4s}
      .g-spot .sc.bump{animation:spotPop .45s}
      @keyframes spotPop{0%{transform:scale(1)}40%{transform:scale(1.25)}100%{transform:scale(1)}}
      .g-spot .zi.tall{flex-direction:column}
      .g-spot .zi.tall .sc{flex:0 0 64px;flex-direction:row;gap:10px}
      .g-spot .zi.tall .sc .n{font-size:40px}
      .g-spot .card{flex:1;position:relative;border-radius:22px;background:#f4f1e8;
        box-shadow:inset 0 0 0 5px var(--pc);overflow:hidden;transition:opacity .2s}
      .g-spot .cell{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:16px}
      .g-spot.m-swirl .cell{transition:left .45s ease-in-out, top .45s ease-in-out}
      .g-spot .cell.ok{background:color-mix(in srgb, var(--pc) 45%, transparent)}
      .g-spot .cell.half{background:color-mix(in srgb, var(--pc) 30%, transparent);box-shadow:inset 0 0 0 3px var(--pc)}
      .g-spot .cell.bad{background:rgba(255,40,60,.35);animation:spotShake .3s}
      .g-spot .cell .sym{position:static;pointer-events:none}
      .g-spot .frz{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;
        background:rgba(120,190,255,.6);color:#0b2a4a;font-weight:900;font-size:24px;border-radius:22px;text-align:center;
        backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);z-index:3}
      .g-spot .frz b{font-size:56px;line-height:1}
      .g-spot .card.frozen .frz{display:flex}
      .g-spot .card.won{box-shadow:inset 0 0 0 5px var(--pc),0 0 0 4px #fff}
      .g-spot.cd .card .cell,.g-spot.cd .ctr .sym{visibility:hidden}
      @keyframes spotShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
    `));

    /* ---------- center card ---------- */
    const ctr = U.h('div', { class: 'ctr' });
    const spin = U.h('div', { class: 'spin' });
    ctr.append(spin);
    const badge = U.h('div', { class: 'badge' });
    ctx.root.append(ctr, badge);
    let ctrSyms = [];

    /* ---------- player zones ---------- */
    const depth = ctx.n === 2 ? 0.27 : 0.25;
    const seats = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth });
      const inner = U.h('div', { class: 'zi' });
      const scN = U.h('div', { class: 'n' }, '0');
      const st = U.h('div', { class: 'st' }, '🔥');
      const sc = U.h('div', { class: 'sc' }, scN, U.h('div', { class: 't' }, 'из ' + TARGET), st);
      const frzIcon = U.h('b', null, '❄️'), frzText = U.h('div', null, 'Заморозка');
      const card = U.h('div', { class: 'card' }, U.h('div', { class: 'frz' }, frzIcon, frzText));
      inner.append(sc, card);
      z.el.append(inner);
      return { z, inner, card, sc, scN, st, frzIcon, frzText, cells: [], order: [] };
    });

    /* ---------- dealing ---------- */
    function pickMod() {
      if (roundNo <= 1 || Math.random() < 0.35) return null;
      const keys = Object.keys(MODS).filter(k => k !== lastMod);
      return U.pick(keys);
    }

    function deal() {
      roundNo++;
      mod = pickMod();
      if (mod) lastMod = mod;
      const k = mod === 'double' ? 2 : 1;
      const pool = U.shuffle(POOL);
      center = pool.slice(0, PER_CARD);
      const rest = pool.slice(PER_CARD);
      const commons = U.shuffle(center).slice(0, ctx.n * k);
      hands = []; common = []; found = [];
      ctx.players.forEach(p => {
        const mine = commons.slice(p.i * k, p.i * k + k);
        const others = U.shuffle(rest).slice(0, PER_CARD - k);
        common[p.i] = mine;
        found[p.i] = new Set();
        hands[p.i] = U.shuffle([...mine, ...others]);
      });
      // golden symbol: sometimes, preferably for the player who is behind
      golden = null;
      if (mod !== 'double' && roundNo > 1 && Math.random() < 0.35) {
        const min = Math.min(...score), max = Math.max(...score);
        const behind = ctx.players.filter(p => score[p.i] === min).map(p => p.i);
        const who = max - min >= 2 ? U.pick(behind) : U.randInt(0, ctx.n - 1);
        golden = common[who][0];
      }
      Object.keys(MODS).forEach(m => ctx.root.classList.toggle('m-' + m, m === mod));
      buildCenter();
      seats.forEach((s, i) => buildHand(i));
      layout();
      // announce
      badge.textContent = mod ? MODS[mod].icon : '';
      badge.classList.toggle('on', !!mod);
      const msgs = [];
      if (mod) msgs.push(`${MODS[mod].icon} ${MODS[mod].text}`);
      if (golden) msgs.push('⭐ Золотой символ: +2');
      if (msgs.length) ctx.toast(msgs.join('  '), { ms: 1500, size: 26, color: '#2b3157' });
      if (swirlTimer) { ctx.cancel(swirlTimer); swirlTimer = null; }
      if (mod === 'swirl') swirlTimer = ctx.every(1700, () => {
        if (state !== 'play') return;
        seats.forEach(s => { s.order = U.shuffle(s.order); layoutHand(s); });
      });
      roundStart = ctx.time;
    }

    function buildCenter() {
      spin.replaceChildren();
      const tiny = mod === 'tiny';
      // slot 0 in the middle, the rest on a ring; random sizes and rotations
      const ringOff = Math.random() * Math.PI * 2;
      ctrSyms = center.map((sym, k) => {
        const el = U.h('div', { class: 'sym' + (sym === golden ? ' gold' : '') }, sym);
        const a = ringOff + (k - 1) * Math.PI * 2 / (PER_CARD - 1);
        el._pos = k === 0
          ? { x: 0, y: 0, s: tiny ? U.rand(0.16, 0.55) : U.rand(0.4, 0.5) }
          : { x: Math.cos(a) * 0.63, y: Math.sin(a) * 0.63, s: tiny ? U.pick([U.rand(0.12, 0.17), U.rand(0.36, 0.44)]) : U.rand(0.29, 0.4) };
        el._pos.jx = U.rand(-0.04, 0.04); el._pos.jy = U.rand(-0.04, 0.04);
        el._rot = Math.random() * 360;
        el._sym = sym;
        spin.append(el);
        return el;
      });
    }

    function buildHand(i) {
      const s = seats[i];
      const tiny = mod === 'tiny';
      s.card.querySelectorAll('.cell').forEach(c => c.remove());
      s.card.classList.remove('won');
      s.cells = hands[i].map(sym => {
        const symEl = U.h('div', { class: 'sym' }, sym);
        const cell = U.h('div', { class: 'cell' }, symEl);
        cell._sym = sym;
        cell._symEl = symEl;
        cell._s = tiny ? U.pick([U.rand(0.24, 0.34), U.rand(0.85, 0.98)]) : U.rand(0.6, 0.86);
        cell._rot = U.rand(-35, 35);
        cell._jx = U.rand(-1, 1); cell._jy = U.rand(-1, 1);
        ctx.tap(cell, () => press(i, cell));
        s.card.append(cell);
        return cell;
      });
      s.order = null;
    }

    /* ---------- layout ---------- */
    // 3 players in portrait: the bottom player's strip is short, so their card grows upward
    // into the free space above it (the center card does not need the full height).
    let extra = 0;
    const EXM = 50;
    function centerRegion() {
      const W = ctx.W, H = ctx.H;
      const d = seats[0].z.h;
      // keep clear of the exit button (2p: middle of the left edge, 3p: middle of the top edge)
      if (ctx.n === 2) return { x: EXM, y: d, w: W - 2 * EXM, h: H - 2 * d };
      return { x: d, y: EXM, w: W - 2 * d, h: H - d - extra - EXM };
    }

    function layout() {
      if (ctx.n === 3) {
        const d = seats[0].z.h, rw = ctx.W - 2 * d, rh = ctx.H - d - EXM;
        extra = Math.round(U.clamp(rh - rw - 20, 0, d * 0.9));
        seats[0].inner.style.top = (8 - extra) + 'px';
        seats[0].inner.classList.toggle('tall', extra > 40);
      }
      const r = centerRegion();
      const D = Math.max(120, Math.min(r.w, r.h) * 0.94);
      const R = D / 2;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      Object.assign(ctr.style, { width: D + 'px', height: D + 'px', left: (cx - R) + 'px', top: (cy - R) + 'px' });
      // badge: on the rim, on the side with more free room
      const bx = r.w - D > r.h - D ? cx + R + 8 : cx + R * 0.78, by = r.w - D > r.h - D ? cy : cy + R * 0.78;
      badge.style.left = Math.min(bx + 30, r.x + r.w - 40) + 'px';
      badge.style.top = by + 'px';
      ctrSyms.forEach(el => {
        const p = el._pos;
        const fs = p.s * R;
        el.style.fontSize = fs + 'px';
        el.style.width = el.style.height = fs * 1.15 + 'px';
        el.style.lineHeight = fs * 1.15 + 'px';
        const x = R + (p.x + p.jx) * R - fs * 0.575, y = R + (p.y + p.jy) * R - fs * 0.575;
        el._base = `translate(${x}px,${y}px) rotate(${el._rot}deg)`;
        el.style.transform = el._base + (el.classList.contains('hit') ? ' scale(1.35)' : '');
      });
      seats.forEach(layoutHand);
    }

    function layoutHand(s) {
      const cw = s.card.clientWidth, ch = s.card.clientHeight;
      if (!cw || !ch) return;
      const pad = 8;
      const iw = cw - 2 * pad, ih = ch - 2 * pad;
      let best = null;
      for (const [c, r] of [[8, 1], [4, 2], [3, 3], [2, 4], [1, 8]]) {
        const m = Math.min(iw / c, ih / r);
        if (!best || m > best.m) best = { c, r, m };
      }
      const cwid = iw / best.c, chei = ih / best.r;
      const used = best.c * best.r;
      // slot order (random; with a 3x3 grid one slot stays empty)
      if (!s.order || s.order.length !== used) s.order = U.shuffle([...Array(used).keys()]);
      s.cells.forEach((cell, idx) => {
        const k = s.order[idx];
        const cx = k % best.c, cy = Math.floor(k / best.c);
        Object.assign(cell.style, { left: pad + cx * cwid + 'px', top: pad + cy * chei + 'px', width: cwid + 'px', height: chei + 'px' });
        const m = Math.min(cwid, chei);
        const fs = m * cell._s;
        const slackX = Math.max(0, (cwid - fs * 1.2) / 2), slackY = Math.max(0, (chei - fs * 1.2) / 2);
        cell._symEl.style.fontSize = fs + 'px';
        cell._symEl.style.transform = `translate(${cell._jx * slackX}px,${cell._jy * slackY}px) rotate(${cell._rot}deg)`;
      });
    }
    ctx.onResize(() => layout());

    /* ---------- play ---------- */
    const isFrozen = (i) => ctx.time < frozenUntil[i];
    function freeze(i, ms, icon, text) {
      frozenUntil[i] = Math.max(frozenUntil[i], ctx.time + ms / 1000);
      seats[i].frzIcon.textContent = icon;
      seats[i].frzText.textContent = text;
    }

    function render() {
      seats.forEach((s, i) => {
        s.scN.textContent = score[i];
        s.st.classList.toggle('on', streak.who === i && streak.n >= 2);
        s.st.textContent = streak.who === i ? '🔥'.repeat(Math.min(streak.n, 3)) : '';
      });
    }

    function press(i, cell) {
      if (state !== 'play' || isFrozen(i)) return;
      if (found[i].has(cell._sym)) return;
      if (!common[i].includes(cell._sym)) {
        freeze(i, 1500, '❄️', 'Заморозка');
        cell.classList.add('bad');
        ctx.after(1500, () => cell.classList.remove('bad'));
        return;
      }
      found[i].add(cell._sym);
      const c = ctrSyms.find(e => e._sym === cell._sym);
      if (c) {
        c.style.setProperty('--hc', ctx.players[i].color);
        c.classList.add('hit');
        c.style.transform = c._base + ' scale(1.35)';
      }
      if (found[i].size < common[i].length) { cell.classList.add('half'); return; }
      // round won
      state = 'show';
      cell.classList.add('ok');
      seats[i].card.querySelectorAll('.cell.half').forEach(e => e.classList.replace('half', 'ok'));
      seats[i].card.classList.add('won');
      let pts = mod === 'double' ? 2 : 1;
      const parts = [`${cell._sym} +${pts}`];
      if (golden && common[i].includes(golden)) { pts++; parts.push('⭐+1'); }
      if (ctx.time - roundStart < FAST) { pts++; parts.push('⚡+1'); }
      score[i] += pts;
      if (streak.who === i) streak.n++; else streak = { who: i, n: 1 };
      let streakHit = false;
      if (streak.n >= 3) { streakHit = true; streak.n = 0; }
      seats[i].sc.classList.remove('bump'); void seats[i].sc.offsetWidth; seats[i].sc.classList.add('bump');
      render();
      if (score[i] >= TARGET) {
        state = 'done';
        ctx.toast(parts.join(' '), { color: ctx.players[i].color, fg: '#111', ms: 1100 });
        ctx.after(1200, () => ctx.end({ winner: i, scores: score.slice() }));
        return;
      }
      ctx.toast(parts.join(' '), { color: ctx.players[i].color, fg: '#111', ms: 1000, size: pts > 1 ? 30 : 24 });
      ctx.after(1100, () => {
        nextRound();
        if (streakHit) {
          ctx.toast(`🔥 Серия ${ctx.players[i].name}! Соперники замёрзли`, { color: '#ff7a1a', fg: '#111', ms: 1600 });
          ctx.players.forEach(p => { if (p.i !== i) freeze(p.i, 2000, '🔥', 'Серия соперника!'); });
        }
      });
    }

    function nextRound() {
      if (state === 'done') return;
      state = 'play';
      deal();
      render();
    }

    ctx.loop(() => {
      ctx.root.classList.toggle('cd', ctx.paused && ctx.time === 0);
      ctx.root.classList.toggle('pz', ctx.paused);
      seats.forEach((s, i) => s.card.classList.toggle('frozen', isFrozen(i)));
    });
    deal();
    render();
    // the zones' inner sizes are known only after the first layout pass
    requestAnimationFrame(() => layout());
  },
});
