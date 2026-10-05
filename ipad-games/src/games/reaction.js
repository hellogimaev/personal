registerGame({
  id: 'reaction',
  title: 'Реакция',
  emoji: '⚡',
  desc: 'Жми первым, когда круг станет зелёным',
  rules: 'Круг в центре загорится зелёным в случайный момент.\nКто первым нажмёт свою кнопку, получает очко.\nНажал раньше времени: минус очко.\nИгра идёт до 5 очков.',
  start(ctx) {
    const TARGET = 5;
    const score = ctx.players.map(() => 0);
    let state = 'wait'; // wait | go | done
    let blocked = new Set();
    let goTimer = null;

    ctx.root.classList.add('g-reaction');
    ctx.root.append(U.h('style', null, `
      .g-reaction .rb{position:absolute;inset:10px;border-radius:24px;background:${'var(--pc)'};opacity:.9;
        display:flex;flex-direction:column;align-items:center;justify-content:center;color:#111;font-weight:900}
      .g-reaction .rb .s{font-size:44px;line-height:1}
      .g-reaction .rb .l{font-size:16px;opacity:.75;margin-top:4px}
      .g-reaction .rb.blocked{opacity:.25}
      .g-reaction .rb.won{outline:6px solid #fff}
      .g-reaction .sig{position:absolute;left:50%;top:50%;border-radius:50%;transform:translate(-50%,-50%);
        background:#3a405f;transition:background .05s;box-shadow:0 0 0 10px rgba(255,255,255,.04)}
      .g-reaction .sig.go{background:#3ddc97;box-shadow:0 0 60px 10px rgba(61,220,151,.5)}
    `));

    const sig = U.h('div', { class: 'sig' });
    ctx.root.append(sig);
    const sizeSig = () => {
      const s = Math.min(ctx.W, ctx.H) * 0.32;
      sig.style.width = sig.style.height = s + 'px';
    };
    sizeSig();
    ctx.onResize(sizeSig);

    const buttons = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: 0.24 });
      const b = U.h('div', { class: 'rb' }, U.h('div', { class: 's' }, '0'), U.h('div', { class: 'l' }, 'жми, когда зелёный'));
      z.el.append(b);
      ctx.tap(b, () => press(p.i));
      return b;
    });

    function render() {
      buttons.forEach((b, i) => {
        b.querySelector('.s').textContent = score[i];
        b.classList.toggle('blocked', blocked.has(i));
      });
    }

    function newRound() {
      state = 'wait';
      blocked = new Set();
      buttons.forEach(b => b.classList.remove('won'));
      sig.classList.remove('go');
      render();
      goTimer = ctx.after(U.rand(1400, 4200), () => { state = 'go'; sig.classList.add('go'); });
    }

    function press(i) {
      if (state === 'done' || blocked.has(i)) return;
      if (state === 'wait') {
        score[i] = Math.max(0, score[i] - 1);
        blocked.add(i);
        ctx.toast(`${ctx.players[i].name}: фальстарт!`, { color: ctx.players[i].color, fg: '#111' });
        render();
        if (blocked.size === ctx.n) { ctx.cancel(goTimer); ctx.after(900, newRound); state = 'done'; }
        return;
      }
      state = 'done';
      score[i]++;
      buttons[i].classList.add('won');
      sig.classList.remove('go');
      render();
      if (score[i] >= TARGET) {
        ctx.after(700, () => ctx.end({ winner: i, scores: score }));
      } else {
        ctx.toast(`+1 ${ctx.players[i].name}`, { color: ctx.players[i].color, fg: '#111' });
        ctx.after(1200, newRound);
      }
    }

    newRound();
  },
});
