registerGame({
  id: 'memory',
  title: 'Мемори',
  emoji: '🃏',
  desc: 'Пары, джокеры, бомбы и магнит-воришка',
  rules: 'Ходите по очереди: чей ход, у того светится край экрана.\nОткрой две карты. Одинаковые: +1 и ходишь ещё. Разные: ход переходит.\n⏳ На каждую карту 8 секунд, потом ход сгорает.\n🔥 Вторая и следующие пары за один ход: +1 сверху.\nОсобые пары (золотые карты):\n💣 Бомба: все закрытые карты перемешиваются.\n👁️ Глаз: на секунду показывает одну пару.\n🧲 Магнит: забирает 1 очко у лидера.\n💰 Клад: пара стоит 2.\n🃏 Джокер подходит к любой карте: открой джокер и любую карту, и её пара тоже твоя.\nПобеждает тот, у кого больше очков.',
  start(ctx) {
    const TURN = 8;
    const SPECIAL = { '💣': 'bomb', '👁️': 'eye', '🧲': 'magnet', '💰': 'chest' };
    const JOKER = '🃏';
    const SYMBOLS = ['🍎', '🍉', '🍓', '🍒', '🌻', '🌵', '🍄', '⭐', '🌙', '🔥', '💧', '❄️', '⚽', '🏀', '🎈',
      '🎁', '🐸', '🐼', '🦋', '🐙', '🐢', '👑', '💎', '🌈', '🍩', '🎲', '🐞', '🍋', '🌸', '🍀'];
    const score = ctx.players.map(() => 0);
    let turn = U.randInt(0, ctx.n - 1);
    let open = [];       // up to 2 cards currently face up (not yet matched)
    let busy = false;    // animations / effects in progress
    let done = false;
    let combo = 0;       // pairs found in the current turn
    let deadline = 0;

    ctx.root.classList.add('g-memory');
    ctx.root.append(U.h('style', null, `
      .g-memory .board{position:absolute}
      .g-memory .mc{position:absolute;perspective:700px;transition:left .6s cubic-bezier(.5,0,.3,1),top .6s cubic-bezier(.5,0,.3,1)}
      .g-memory .mc .in{position:absolute;inset:0;transition:transform .32s;transform-style:preserve-3d}
      .g-memory .mc.up .in{transform:rotateY(180deg)}
      .g-memory .mc .f,.g-memory .mc .b{position:absolute;inset:0;border-radius:16px;backface-visibility:hidden;-webkit-backface-visibility:hidden;
        display:flex;align-items:center;justify-content:center}
      .g-memory .mc .b{background:radial-gradient(circle at 50% 50%,#3a4372 0 18%,transparent 19%),
        repeating-linear-gradient(45deg,#2b3360 0 10px,#252c55 10px 20px);
        box-shadow:inset 0 0 0 3px #3d4680}
      .g-memory .mc .f{background:#f4f1e8;transform:rotateY(180deg);line-height:1}
      .g-memory .mc.sp .f{background:radial-gradient(circle,#fff6d0,#ffd56a);box-shadow:inset 0 0 0 5px #e0a800}
      .g-memory .mc.jk .f{background:radial-gradient(circle,#f3e8ff,#c9a6ff);box-shadow:inset 0 0 0 5px #8a4dff}
      .g-memory .mc.got .f{box-shadow:inset 0 0 0 6px var(--fc)}
      .g-memory .mc.got{opacity:.5;transition:opacity .4s .5s}
      .g-memory .mc.gone{opacity:0;transform:scale(.6);transition:opacity .5s .4s,transform .5s .4s;pointer-events:none}
      .g-memory .mc.miss .f{box-shadow:inset 0 0 0 5px #7d84a8}
      .g-memory .mc.miss{animation:memShake .35s}
      .g-memory .mc.peek .f{box-shadow:inset 0 0 0 6px #61e3ff,0 0 24px #61e3ff}
      @keyframes memShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}
      .g-memory .mc.pop .in{animation:memPop .35s}
      @keyframes memPop{50%{transform:rotateY(180deg) scale(1.12)}}
      .g-memory .zi{position:absolute;inset:6px;border-radius:18px;display:flex;align-items:center;justify-content:space-between;
        padding:0 18px;gap:12px;background:#1a1f35;border:3px solid transparent;transition:background .25s,box-shadow .25s;font-weight:900;overflow:hidden}
      .g-memory .zi .tx{font-size:24px;color:#9aa1c4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .g-memory .zi .tx b{color:var(--tc)}
      .g-memory .zi .sc{font-size:22px;color:var(--pc);white-space:nowrap;flex:0 0 auto;display:flex;align-items:baseline;gap:6px}
      .g-memory .zi .sc span{font-size:34px;display:inline-block}
      .g-memory .zi .sc span.bump{animation:memBump .5s}
      @keyframes memBump{40%{transform:scale(1.5)}}
      .g-memory .zi.on{background:var(--pc);border-color:#fff;box-shadow:0 0 30px 6px var(--pc)}
      .g-memory .zi.on .tx{color:#111;font-size:28px}
      .g-memory .zi.on .sc{color:#111}
      .g-memory .zi .tm{position:absolute;left:0;bottom:0;height:7px;background:rgba(0,0,0,.45);display:none}
      .g-memory .zi.on .tm{display:block}
      .g-memory .zi .tm.low{background:#fff}
    `));

    /* ---------- zones: name / score / turn indicator ---------- */
    const seats = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: 78 });
      const tx = U.h('div', { class: 'tx' });
      const scN = U.h('span', null, '0');
      const sc = U.h('div', { class: 'sc' }, 'очки:', scN);
      const tm = U.h('div', { class: 'tm' });
      const inner = U.h('div', { class: 'zi' }, tx, sc, tm);
      z.el.append(inner);
      return { z, inner, tx, scN, tm };
    });

    /* ---------- cards ---------- */
    const board = U.h('div', { class: 'board' });
    ctx.root.append(board);
    const normal = U.shuffle(SYMBOLS).slice(0, 10);
    const syms = [...normal, ...normal, ...Object.keys(SPECIAL), ...Object.keys(SPECIAL), JOKER, JOKER];
    const cards = U.shuffle(syms).map((sym, k) => {
      const f = U.h('div', { class: 'f' }, sym);
      const cls = 'mc' + (SPECIAL[sym] ? ' sp' : '') + (sym === JOKER ? ' jk' : '');
      const el = U.h('div', { class: cls }, U.h('div', { class: 'in' }, U.h('div', { class: 'b' }), f));
      const c = { sym, el, f, up: false, got: false, slot: k, joker: sym === JOKER };
      ctx.tap(el, () => flip(c));
      board.append(el);
      return c;
    });

    let grid = null;
    function layout() {
      const W = ctx.W, H = ctx.H, d = seats[0].z.h;
      // keep clear of the exit button (2p: middle of the left edge, 3p: middle of the top edge)
      const r = ctx.n === 2 ? { x: 50, y: d, w: W - 100, h: H - 2 * d } : { x: d, y: 50, w: W - 2 * d, h: H - d - 50 };
      const pad = 10;
      const iw = r.w - 2 * pad, ih = r.h - 2 * pad;
      let best = null;
      for (const [c, rr] of [[6, 5], [5, 6], [10, 3], [3, 10]]) {
        const s = Math.min(iw / c, ih / rr);
        if (!best || s > best.s) best = { c, r: rr, s };
      }
      const cell = best.s, gap = Math.max(5, cell * 0.07), size = cell - gap;
      grid = { cols: best.c, cell, gap, size };
      const bw = cell * best.c, bh = cell * best.r;
      Object.assign(board.style, { left: r.x + (r.w - bw) / 2 + 'px', top: r.y + (r.h - bh) / 2 + 'px', width: bw + 'px', height: bh + 'px' });
      cards.forEach(place);
    }
    function place(c) {
      const { cols, cell, gap, size } = grid;
      const x = c.slot % cols, y = Math.floor(c.slot / cols);
      Object.assign(c.el.style, { left: x * cell + gap / 2 + 'px', top: y * cell + gap / 2 + 'px', width: size + 'px', height: size + 'px' });
      c.f.style.fontSize = size * 0.62 + 'px';
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
        else if (on) s.tx.textContent = combo >= 1 ? `Твой ход! 🔥×${combo}` : 'Твой ход!';
        else s.tx.replaceChildren('Ход: ', U.h('b', null, ctx.players[turn].name));
      });
    }
    function bump(i) {
      const e = seats[i].scN;
      e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump');
    }
    const say = (text, color) => ctx.toast(text, { color: color || ctx.players[turn].color, fg: '#111', ms: 1300 });

    function flip(c) {
      if (done || busy || c.up || c.got || open.length >= 2) return;
      c.up = true;
      c.el.classList.add('up');
      open.push(c);
      deadline = ctx.time + TURN;
      if (open.length < 2) return;
      const [a, b] = open;
      busy = true;
      if (a.joker || b.joker || a.sym === b.sym) {
        ctx.after(420, () => resolveMatch(a, b));
      } else {
        ctx.after(450, () => { a.el.classList.add('miss'); b.el.classList.add('miss'); });
        ctx.after(1250, () => {
          [a, b].forEach(x => { x.up = false; x.el.classList.remove('up', 'miss'); });
          nextTurn();
        });
      }
    }

    function take(list) {
      list.forEach(x => {
        x.got = true; x.up = true;
        x.el.classList.add('up', 'got', 'pop');
        x.el.style.setProperty('--fc', ctx.players[turn].color);
      });
    }

    function resolveMatch(a, b) {
      open = [];
      let sym = a.sym, delay = 0;
      if (a.joker && b.joker) {
        take([a, b]);
      } else if (a.joker || b.joker) {
        const x = a.joker ? b : a, j = a.joker ? a : b;
        sym = x.sym;
        const partner = cards.find(c => c !== x && !c.got && !c.joker && c.sym === x.sym);
        take([j, x]);
        j.el.classList.add('gone');
        if (partner) { partner.up = true; partner.el.classList.add('up'); ctx.after(500, () => take([partner])); delay = 600; }
        say('🃏 Джокер!');
      } else take([a, b]);

      ctx.after(delay, () => {
        let pts = 1;
        const msgs = [];
        if (combo >= 1) { pts++; msgs.push('🔥 Комбо +1'); }
        combo++;
        const eff = SPECIAL[sym];
        if (eff === 'chest') { pts++; msgs.push('💰 Клад +1'); }
        score[turn] += pts;
        bump(turn);
        let wait = 0;
        if (eff === 'magnet') {
          const others = ctx.players.filter(p => p.i !== turn && score[p.i] > 0);
          if (others.length) {
            const max = Math.max(...others.map(p => score[p.i]));
            const victim = U.pick(others.filter(p => score[p.i] === max)).i;
            score[victim]--; score[turn]++;
            bump(victim);
            msgs.push(`🧲 −1 у: ${ctx.players[victim].name}`);
          } else msgs.push('🧲 Красть не у кого');
        }
        if (eff === 'bomb') { msgs.push('💣 Перемешка!'); wait = 900; ctx.after(300, shuffleDown); }
        if (eff === 'eye') { msgs.push('👁️ Подсказка!'); wait = peek(); }
        if (msgs.length) say(msgs.join('  '));
        else say(`Пара! +${pts}`);
        render();
        ctx.after(wait, () => {
          busy = false;
          deadline = ctx.time + TURN;
          if (cards.filter(c => !c.got).length <= 1 && cards.filter(c => !c.got && !c.joker).length === 0) finish();
        });
      });
    }

    function shuffleDown() {
      const down = cards.filter(c => !c.got && !c.up);
      const slots = U.shuffle(down.map(c => c.slot));
      down.forEach((c, k) => { c.slot = slots[k]; place(c); });
    }

    // Show one random hidden pair for a moment. Returns how long the effect takes (ms).
    function peek() {
      const down = cards.filter(c => !c.got && !c.up && !c.joker);
      if (!down.length) return 0;
      const a = U.pick(down);
      const pair = down.filter(c => c.sym === a.sym);
      ctx.after(400, () => pair.forEach(c => c.el.classList.add('up', 'peek')));
      ctx.after(1900, () => pair.forEach(c => c.el.classList.remove('up', 'peek')));
      return 2300;
    }

    function nextTurn() {
      open = [];
      busy = false;
      combo = 0;
      turn = (turn + 1) % ctx.n;
      deadline = ctx.time + TURN;
      render();
    }

    function finish() {
      done = true;
      render();
      const best = Math.max(...score);
      const winners = ctx.players.filter(p => score[p.i] === best).map(p => p.i);
      const draw = winners.length === ctx.n;
      ctx.after(1100, () => ctx.end({ winners: draw ? [] : winners, scores: score.slice(), msg: 'Очки: ' + score.join(' : ') }));
    }

    ctx.loop(() => {
      if (done) return;
      const s = seats[turn];
      const left = busy ? TURN : Math.max(0, deadline - ctx.time);
      s.tm.style.width = (left / TURN) * 100 + '%';
      s.tm.classList.toggle('low', left < 3);
      if (!busy && !ctx.paused && left <= 0) {
        // time is up: close open cards, pass the turn
        busy = true;
        say(`⏳ Время! Ход переходит`, '#9aa1c4');
        open.forEach(x => { x.up = false; x.el.classList.remove('up'); });
        ctx.after(400, nextTurn);
      }
    });

    deadline = TURN;
    render();
  },
});
