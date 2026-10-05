registerGame({
  id: 'spot',
  title: 'Найди пару',
  emoji: '👀',
  desc: 'Найди картинку, которая есть и у тебя, и в центре',
  rules: 'В центре лежит общая карта, у каждого игрока своя карта.\nНа твоей карте ровно одна картинка есть и на центральной.\nНайди её и нажми у себя первым: +1 очко, и все получают новые карты.\nОшибся: заморозка на 1,5 секунды.\nИгра идёт до 7 очков.',
  start(ctx) {
    const TARGET = 7;
    const PER_CARD = 8;
    const FREEZE_MS = 1500;
    const POOL = ['🍎', '🍌', '🍇', '🍉', '🍓', '🍒', '🍍', '🥕', '🌽', '🍄', '🌵', '🌲', '🌻', '🌹', '🍁',
      '🔥', '💧', '⭐', '🌙', '⚡', '❄️', '🌈', '🎈', '🎁', '🎸', '🥁', '🎲', '🧩', '⚽', '🏀', '🎯',
      '🚗', '🚀', '✈️', '⛵', '🚲', '⏰', '🔑', '💡', '📷', '✏️', '✂️', '🧲', '🐶', '🐱', '🐰', '🦊',
      '🐼', '🐸', '🐵', '🐔', '🐧', '🐢', '🐙', '🦋', '🐝', '🐞', '🦀', '🐳', '🦄', '👻', '🤖', '👑',
      '🎩', '👓', '💎', '❤️', '🍕', '🧀', '🍦'];

    const score = ctx.players.map(() => 0);
    const frozen = ctx.players.map(() => false);
    let state = 'play'; // play | show | done
    let center = [];          // symbols on the center card
    let hands = [];           // hands[i] = symbols on player i's card
    let common = [];          // common[i] = the matching symbol for player i

    ctx.root.classList.add('g-spot');
    ctx.root.append(U.h('style', null, `
      .g-spot .ctr{position:absolute;border-radius:50%;background:#f4f1e8;
        box-shadow:0 0 0 8px rgba(255,255,255,.06),0 10px 40px rgba(0,0,0,.5);overflow:hidden}
      .g-spot .sym{position:absolute;left:0;top:0;line-height:1;text-align:center;
        transition:transform .25s, filter .25s;will-change:transform}
      .g-spot .ctr .sym.hit{filter:drop-shadow(0 0 6px var(--hc)) drop-shadow(0 0 14px var(--hc))}
      .g-spot .zi{position:absolute;inset:8px;display:flex;gap:10px;align-items:stretch}
      .g-spot .sc{flex:0 0 84px;border-radius:20px;background:var(--pc);color:#111;display:flex;flex-direction:column;
        align-items:center;justify-content:center;font-weight:900}
      .g-spot .sc .n{font-size:48px;line-height:1}
      .g-spot .sc .t{font-size:15px;opacity:.7;margin-top:2px}
      .g-spot .zi.tall{flex-direction:column}
      .g-spot .zi.tall .sc{flex:0 0 64px;flex-direction:row;gap:10px}
      .g-spot .zi.tall .sc .n{font-size:40px}
      .g-spot .card{flex:1;position:relative;border-radius:22px;background:#f4f1e8;
        box-shadow:inset 0 0 0 5px var(--pc);overflow:hidden;transition:opacity .2s}
      .g-spot .cell{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:16px}
      .g-spot .cell.ok{background:color-mix(in srgb, var(--pc) 45%, transparent)}
      .g-spot .cell.bad{background:rgba(255,40,60,.35);animation:spotShake .3s}
      .g-spot .cell .sym{position:static;pointer-events:none}
      .g-spot .frz{position:absolute;inset:0;display:none;align-items:center;justify-content:center;flex-direction:column;
        background:rgba(120,190,255,.55);color:#0b2a4a;font-weight:900;font-size:26px;border-radius:22px;
        backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}
      .g-spot .frz b{font-size:60px;line-height:1}
      .g-spot .card.frozen .frz{display:flex}
      .g-spot .card.won{box-shadow:inset 0 0 0 5px var(--pc),0 0 0 4px #fff}
      .g-spot.cd .card .cell,.g-spot.cd .ctr .sym{visibility:hidden}
      @keyframes spotShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
    `));

    /* ---------- center card ---------- */
    const ctr = U.h('div', { class: 'ctr' });
    ctx.root.append(ctr);
    let ctrSyms = [];

    /* ---------- player zones ---------- */
    // The exit button sits in the screen's top-left corner: keep that end of a zone free.
    const exitEnd = (i) => {
      const side = ctx.players[i].side;
      if (side === 'top') return 'right';
      if (side === 'left') return 'left';
      return null;
    };
    const depth = ctx.n === 2 ? 0.27 : 0.25;
    const seats = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth });
      const inner = U.h('div', { class: 'zi' });
      const scN = U.h('div', { class: 'n' }, '0');
      const sc = U.h('div', { class: 'sc' }, scN, U.h('div', { class: 't' }, 'из ' + TARGET));
      const card = U.h('div', { class: 'card' }, U.h('div', { class: 'frz' }, U.h('b', null, '❄️'), 'Заморозка'));
      const end = exitEnd(p.i);
      if (end === 'right') { inner.style.right = '56px'; inner.append(card, sc); } else {
        if (end === 'left') inner.style.left = '56px';
        inner.append(sc, card);
      }
      z.el.append(inner);
      return { z, inner, card, scN, cells: [] };
    });

    /* ---------- dealing ---------- */
    function deal() {
      const pool = U.shuffle(POOL);
      center = pool.slice(0, PER_CARD);
      const rest = pool.slice(PER_CARD);
      const commons = U.shuffle(center).slice(0, ctx.n);
      hands = []; common = [];
      ctx.players.forEach(p => {
        const others = U.shuffle(rest).slice(0, PER_CARD - 1);
        common[p.i] = commons[p.i];
        hands[p.i] = U.shuffle([commons[p.i], ...others]);
      });
      buildCenter();
      seats.forEach((s, i) => buildHand(i));
      layout();
    }

    function buildCenter() {
      ctr.replaceChildren();
      // slot 0 in the middle, the rest on a ring; random sizes and rotations
      const ringOff = Math.random() * Math.PI * 2;
      ctrSyms = center.map((sym, k) => {
        const el = U.h('div', { class: 'sym' }, sym);
        const a = ringOff + (k - 1) * Math.PI * 2 / (PER_CARD - 1);
        el._pos = k === 0 ? { x: 0, y: 0, s: U.rand(0.4, 0.5) } : { x: Math.cos(a) * 0.63, y: Math.sin(a) * 0.63, s: U.rand(0.29, 0.4) };
        el._pos.jx = U.rand(-0.04, 0.04); el._pos.jy = U.rand(-0.04, 0.04);
        el._rot = Math.random() * 360;
        el._sym = sym;
        ctr.append(el);
        return el;
      });
    }

    function buildHand(i) {
      const s = seats[i];
      s.card.querySelectorAll('.cell').forEach(c => c.remove());
      s.card.classList.remove('won');
      s.cells = hands[i].map(sym => {
        const symEl = U.h('div', { class: 'sym' }, sym);
        const cell = U.h('div', { class: 'cell' }, symEl);
        cell._sym = sym;
        cell._symEl = symEl;
        cell._s = U.rand(0.6, 0.86);
        cell._rot = U.rand(-35, 35);
        cell._jx = U.rand(-1, 1); cell._jy = U.rand(-1, 1);
        ctx.tap(cell, () => press(i, cell));
        s.card.append(cell);
        return cell;
      });
    }

    /* ---------- layout ---------- */
    // 3 players in portrait: the bottom player's strip is short, so their card grows upward
    // into the free space above it (the center card does not need the full height).
    let extra = 0;
    function centerRegion() {
      const W = ctx.W, H = ctx.H;
      const d = seats[0].z.h;
      if (ctx.n === 2) return { x: 0, y: d, w: W, h: H - 2 * d };
      return { x: d, y: 0, w: W - 2 * d, h: H - d - extra };
    }

    function layout() {
      if (ctx.n === 3) {
        const d = seats[0].z.h, rw = ctx.W - 2 * d, rh = ctx.H - d;
        extra = Math.round(U.clamp(rh - rw - 20, 0, d * 0.9));
        seats[0].inner.style.top = (8 - extra) + 'px';
        seats[0].inner.classList.toggle('tall', extra > 40);
      }
      const r = centerRegion();
      const D = Math.max(120, Math.min(r.w, r.h) * 0.94);
      const R = D / 2;
      Object.assign(ctr.style, { width: D + 'px', height: D + 'px', left: (r.x + r.w / 2 - R) + 'px', top: (r.y + r.h / 2 - R) + 'px' });
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
      // with a 3x3 grid one slot stays empty: pick which at random once per deal
      if (s._skip == null || s._skipFor !== hands[s.z.i]) { s._skip = U.randInt(0, used - 1); s._skipFor = hands[s.z.i]; }
      let k = 0;
      s.cells.forEach((cell, idx) => {
        if (used > PER_CARD && k === s._skip) k++;
        const cx = k % best.c, cy = Math.floor(k / best.c);
        k++;
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
    function render() {
      seats.forEach((s, i) => {
        s.scN.textContent = score[i];
        s.card.classList.toggle('frozen', frozen[i]);
      });
    }

    function press(i, cell) {
      if (state !== 'play' || frozen[i]) return;
      if (cell._sym === common[i]) {
        state = 'show';
        score[i]++;
        cell.classList.add('ok');
        seats[i].card.classList.add('won');
        const c = ctrSyms.find(e => e._sym === cell._sym);
        if (c) {
          c.style.setProperty('--hc', ctx.players[i].color);
          c.classList.add('hit');
          c.style.transform = c._base + ' scale(1.35)';
        }
        render();
        if (score[i] >= TARGET) {
          state = 'done';
          ctx.toast(`${ctx.players[i].name} нашёл ${cell._sym}`, { color: ctx.players[i].color, fg: '#111', ms: 1100 });
          ctx.after(1200, () => ctx.end({ winner: i, scores: score.slice() }));
        } else {
          ctx.toast(`+1 ${ctx.players[i].name}`, { color: ctx.players[i].color, fg: '#111', ms: 900 });
          ctx.after(1000, nextRound);
        }
      } else {
        frozen[i] = true;
        cell.classList.add('bad');
        render();
        ctx.after(FREEZE_MS, () => {
          frozen[i] = false;
          cell.classList.remove('bad');
          render();
        });
      }
    }

    function nextRound() {
      if (state === 'done') return;
      state = 'play';
      deal();
      render();
    }

    ctx.loop(() => { ctx.root.classList.toggle('cd', ctx.paused && ctx.time === 0); });
    deal();
    render();
    // the zones' inner sizes are known only after the first layout pass
    requestAnimationFrame(() => layout());
  },
});
