registerGame({
  id: 'memory',
  title: 'Мемори',
  emoji: '🃏',
  desc: 'Открывай по две карты и собирай пары',
  rules: 'Ходите по очереди: чей ход, у того светится край экрана.\nОткрой две карты. Одинаковые: пара твоя, ходишь ещё раз.\nРазные: карты закроются, ход переходит дальше.\nКогда все пары найдены, побеждает тот, у кого их больше.',
  start(ctx) {
    const PAIRS = 15;
    const SYMBOLS = ['🍎', '🍉', '🍓', '🍒', '🌻', '🌵', '🍄', '⭐', '🌙', '🔥', '💧', '❄️', '⚽', '🏀', '🎈',
      '🎁', '🐸', '🐼', '🦋', '🐙', '🐢', '👑', '💎', '🌈', '🍩', '🎲', '🐞', '🍋', '🌸', '🍀'];
    const score = ctx.players.map(() => 0);
    let turn = U.randInt(0, ctx.n - 1);
    let open = [];       // up to 2 cards currently face up (not yet matched)
    let busy = false;    // waiting for a miss to flip back
    let found = 0;
    let done = false;

    ctx.root.classList.add('g-memory');
    ctx.root.append(U.h('style', null, `
      .g-memory .board{position:absolute}
      .g-memory .mc{position:absolute;perspective:700px}
      .g-memory .mc .in{position:absolute;inset:0;transition:transform .32s;transform-style:preserve-3d}
      .g-memory .mc.up .in{transform:rotateY(180deg)}
      .g-memory .mc .f,.g-memory .mc .b{position:absolute;inset:0;border-radius:16px;backface-visibility:hidden;-webkit-backface-visibility:hidden;
        display:flex;align-items:center;justify-content:center}
      .g-memory .mc .b{background:radial-gradient(circle at 50% 50%,#3a4372 0 18%,transparent 19%),
        repeating-linear-gradient(45deg,#2b3360 0 10px,#252c55 10px 20px);
        box-shadow:inset 0 0 0 3px #3d4680}
      .g-memory .mc .f{background:#f4f1e8;transform:rotateY(180deg);line-height:1}
      .g-memory .mc.got .f{box-shadow:inset 0 0 0 6px var(--fc)}
      .g-memory .mc.got{opacity:.55;transition:opacity .4s .5s}
      .g-memory .mc.miss .f{box-shadow:inset 0 0 0 5px #ff4d6d}
      .g-memory .mc.pop .in{animation:memPop .35s}
      @keyframes memPop{50%{transform:rotateY(180deg) scale(1.12)}}
      .g-memory .zi{position:absolute;inset:6px;border-radius:18px;display:flex;align-items:center;justify-content:space-between;
        padding:0 18px;gap:12px;background:#1a1f35;border:3px solid transparent;transition:background .25s,box-shadow .25s;font-weight:900}
      .g-memory .zi .tx{font-size:24px;color:#9aa1c4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .g-memory .zi .tx b{color:var(--tc)}
      .g-memory .zi .sc{font-size:22px;color:var(--pc);white-space:nowrap;flex:0 0 auto;display:flex;align-items:baseline;gap:6px}
      .g-memory .zi .sc span{font-size:34px}
      .g-memory .zi.on{background:var(--pc);border-color:#fff;box-shadow:0 0 30px 6px var(--pc)}
      .g-memory .zi.on .tx{color:#111;font-size:28px}
      .g-memory .zi.on .sc{color:#111}
    `));

    /* ---------- zones: name / score / turn indicator ---------- */
    const exitEnd = (i) => {
      const side = ctx.players[i].side;
      if (side === 'top') return 'right';
      if (side === 'left') return 'left';
      return null;
    };
    const seats = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: 78 });
      const tx = U.h('div', { class: 'tx' });
      const scN = U.h('span', null, '0');
      const sc = U.h('div', { class: 'sc' }, 'пар:', scN);
      const inner = U.h('div', { class: 'zi' }, tx, sc);
      const end = exitEnd(p.i);
      if (end === 'right') inner.style.right = '56px';
      if (end === 'left') inner.style.left = '56px';
      z.el.append(inner);
      return { z, inner, tx, scN };
    });

    /* ---------- cards ---------- */
    const board = U.h('div', { class: 'board' });
    ctx.root.append(board);
    const syms = U.shuffle(SYMBOLS).slice(0, PAIRS);
    const cards = U.shuffle([...syms, ...syms]).map((sym, k) => {
      const f = U.h('div', { class: 'f' }, sym);
      const el = U.h('div', { class: 'mc' }, U.h('div', { class: 'in' }, U.h('div', { class: 'b' }), f));
      const c = { sym, el, f, up: false, got: false };
      ctx.tap(el, () => flip(c));
      board.append(el);
      return c;
    });

    function layout() {
      const W = ctx.W, H = ctx.H, d = seats[0].z.h;
      const r = ctx.n === 2 ? { x: 0, y: d, w: W, h: H - 2 * d } : { x: d, y: 0, w: W - 2 * d, h: H - d };
      const pad = 10;
      const iw = r.w - 2 * pad, ih = r.h - 2 * pad;
      let best = null;
      for (const [c, rr] of [[6, 5], [5, 6], [10, 3], [3, 10]]) {
        const s = Math.min(iw / c, ih / rr);
        if (!best || s > best.s) best = { c, r: rr, s };
      }
      const cell = best.s, gap = Math.max(5, cell * 0.07), size = cell - gap;
      const bw = cell * best.c, bh = cell * best.r;
      Object.assign(board.style, { left: r.x + (r.w - bw) / 2 + 'px', top: r.y + (r.h - bh) / 2 + 'px', width: bw + 'px', height: bh + 'px' });
      cards.forEach((c, k) => {
        const x = k % best.c, y = Math.floor(k / best.c);
        Object.assign(c.el.style, { left: x * cell + gap / 2 + 'px', top: y * cell + gap / 2 + 'px', width: size + 'px', height: size + 'px' });
        c.f.style.fontSize = size * 0.62 + 'px';
      });
    }
    layout();
    ctx.onResize(layout);

    function render() {
      seats.forEach((s, i) => {
        const on = i === turn && !done;
        s.inner.classList.toggle('on', on);
        s.scN.textContent = score[i];
        s.inner.style.setProperty('--tc', ctx.players[turn].color);
        if (done) s.tx.textContent = '';
        else if (on) s.tx.textContent = 'Твой ход!';
        else s.tx.replaceChildren('Ход: ', U.h('b', null, ctx.players[turn].name));
      });
    }

    function flip(c) {
      if (done || busy || c.up || c.got || open.length >= 2) return;
      c.up = true;
      c.el.classList.add('up');
      open.push(c);
      if (open.length < 2) return;
      const [a, b] = open;
      if (a.sym === b.sym) {
        busy = true;
        ctx.after(380, () => {
          [a, b].forEach(x => {
            x.got = true;
            x.el.classList.add('got', 'pop');
            x.el.style.setProperty('--fc', ctx.players[turn].color);
          });
          open = [];
          busy = false;
          score[turn]++;
          found++;
          render();
          if (found === PAIRS) finish();
          else ctx.toast(`Пара! ${ctx.players[turn].name} ходит ещё`, { color: ctx.players[turn].color, fg: '#111', ms: 900 });
        });
      } else {
        busy = true;
        ctx.after(450, () => { a.el.classList.add('miss'); b.el.classList.add('miss'); });
        ctx.after(1250, () => {
          [a, b].forEach(x => { x.up = false; x.el.classList.remove('up', 'miss'); });
          open = [];
          busy = false;
          turn = (turn + 1) % ctx.n;
          render();
        });
      }
    }

    function finish() {
      done = true;
      render();
      const best = Math.max(...score);
      const winners = ctx.players.filter(p => score[p.i] === best).map(p => p.i);
      const draw = winners.length === ctx.n;
      ctx.after(1100, () => ctx.end({ winners: draw ? [] : winners, scores: score.slice(), msg: 'Пары: ' + score.join(' : ') }));
    }

    render();
  },
});
