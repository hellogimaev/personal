registerGame({
  id: 'math',
  title: 'Математический батл',
  emoji: '🧮',
  desc: 'Реши пример быстрее всех',
  rules: 'У каждого перед собой один и тот же пример и 4 варианта ответа.\nПервый верный ответ даёт +1 очко.\nОшибся: до следующего примера ты заблокирован.\nКто первым наберёт 7 очков, тот победил.',
  start(ctx) {
    const N = ctx.n;
    const TARGET = 7;
    const DEPTH = N === 2 ? 0.36 : 0.3;
    const LIMIT = 20000; // ms per problem before it is skipped
    const score = ctx.players.map(() => 0);
    let prob = null, popts = [], locked = new Set(), state = 'wait', timeoutId = null, qStart = 0, num = 0;

    ctx.root.classList.add('g-math');
    ctx.root.append(U.h('style', null, `
      .g-math .mz{display:flex;flex-direction:column;padding:10px 12px 12px}
      .g-math .hd{display:flex;align-items:center;justify-content:center;gap:10px;position:relative;flex:none}
      .g-math .q{font-weight:900;white-space:nowrap;color:#fff;letter-spacing:.5px}
      .g-math .q b{color:var(--ok)}
      .g-math .sc{position:absolute;right:0;top:50%;transform:translateY(-50%);background:var(--pc);color:#111;
        font-weight:900;border-radius:12px;padding:2px 10px;font-size:20px}
      .g-math .tm{position:absolute;left:4px;right:4px;bottom:2px;height:4px;border-radius:2px;background:rgba(255,255,255,.08)}
      .g-math .tm i{position:absolute;left:0;top:0;bottom:0;border-radius:2px;background:var(--pc);opacity:.7}
      .g-math .opts{flex:1;display:grid;gap:10px;min-height:0}
      .g-math .ob{border-radius:18px;background:var(--card2);color:#fff;font-weight:900;display:flex;align-items:center;justify-content:center;
        box-shadow:inset 0 -5px 0 rgba(0,0,0,.25), 0 0 0 3px ${'var(--pc)'} inset;transition:background .12s,opacity .12s}
      .g-math .ob.bad{background:var(--bad);animation:mathShake .3s}
      .g-math .ob.ok{background:var(--ok);color:#111}
      .g-math .ob.right{background:rgba(61,220,151,.35)}
      .g-math .mz.locked .ob:not(.bad){opacity:.35}
      .g-math .mz.won{box-shadow:0 0 0 5px var(--pc) inset;border-radius:20px}
      .g-math .lockmsg{position:absolute;left:0;right:0;text-align:center;font-weight:800;color:var(--bad);font-size:16px;bottom:-2px;display:none}
      @keyframes mathShake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}75%{transform:translateX(8px)}}
      .g-math .pips{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;gap:10px;pointer-events:none}
      .g-math .pips div{display:flex;gap:8px}
      .g-math .pips span{width:18px;height:18px;border-radius:50%;border:3px solid;opacity:.9}
    `));

    // center: score pips (no text, so readable from every side)
    const pipsEl = U.h('div', { class: 'pips' });
    const pipRows = ctx.players.map(p => {
      const row = U.h('div');
      for (let k = 0; k < TARGET; k++) row.append(U.h('span', { style: { borderColor: p.color } }));
      pipsEl.append(row);
      return row;
    });
    ctx.root.append(pipsEl);

    const zones = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH, className: 'mz' });
      const q = U.h('div', { class: 'q' }, '…');
      const sc = U.h('div', { class: 'sc' }, '0');
      const tmBar = U.h('i');
      const hd = U.h('div', { class: 'hd' }, q, sc, U.h('div', { class: 'tm' }, tmBar));
      const opts = U.h('div', { class: 'opts' });
      const btns = [0, 1, 2, 3].map(k => {
        const b = U.h('div', { class: 'ob' }, '');
        ctx.tap(b, () => answer(p.i, k));
        opts.append(b);
        return b;
      });
      z.el.append(hd, opts);
      return { z, q, sc, hd, opts, btns, tmBar };
    });

    function layout() {
      for (const zb of zones) {
        const w = zb.z.w - 24, h = zb.z.h - 22;
        const cols = w / h >= 2.1 ? 4 : 2;
        const hh = Math.round(h * (cols === 4 ? 0.36 : 0.3));
        zb.hd.style.height = hh + 'px';
        const qf = Math.round(Math.min(hh * 0.72, (w - 120) / 6.2, 56));
        zb.qf = qf; zb.qw = w - 2 * 64;
        fit(zb);
        zb.opts.style.gridTemplateColumns = `repeat(${cols},1fr)`;
        const rows = 4 / cols;
        const bh = (h - hh - 10 * (rows - 1)) / rows, bw = (w - 10 * (cols - 1)) / cols;
        const bf = Math.round(Math.min(bh * 0.5, bw * 0.3, 44));
        zb.btns.forEach(b => { b.style.fontSize = bf + 'px'; });
      }
      const s = Math.max(10, Math.min(18, (Math.min(ctx.W, ctx.H) * 0.3) / TARGET - 8));
      pipsEl.querySelectorAll('span').forEach(e => { e.style.width = e.style.height = s + 'px'; });
    }
    layout();
    ctx.onResize(layout);

    // shrink the problem text until it fits between the score pills
    function fit(zb) {
      let f = zb.qf || 40;
      zb.q.style.fontSize = f + 'px';
      while (f > 14 && zb.q.scrollWidth > zb.qw) { f -= 2; zb.q.style.fontSize = f + 'px'; }
    }

    function renderScores() {
      zones.forEach((zb, i) => { zb.sc.textContent = score[i]; });
      pipRows.forEach((row, i) => {
        [...row.children].forEach((e, k) => { e.style.background = k < score[i] ? ctx.players[i].color : 'transparent'; });
      });
    }

    // ----- problems -----
    const R = U.randInt;
    function makeProblem() {
      const t = Math.random();
      let text, ans, a, b, c, kind;
      if (t < 0.25) { kind = 'add'; a = R(13, 79); b = R(12, 79); ans = a + b; text = `${a} + ${b}`; }
      else if (t < 0.5) { kind = 'sub'; a = R(31, 99); b = R(12, a - 9); ans = a - b; text = `${a} − ${b}`; }
      else if (t < 0.75) { kind = 'mul'; a = R(3, 12); b = R(3, 12); ans = a * b; text = `${a} × ${b}`; }
      else {
        kind = 'mul'; a = R(3, 9); b = R(3, 9); c = R(5, 29);
        const m = a * b, f = Math.random();
        if (f < 0.4 && m - c >= 0) { ans = m - c; text = `${a} × ${b} − ${c}`; }
        else if (f < 0.7) { ans = m + c; text = `${a} × ${b} + ${c}`; }
        else { ans = c + m; text = `${c} + ${a} × ${b}`; }
      }
      return { text, ans, a, b, kind };
    }
    function makeOptions(p) {
      const ans = p.ans;
      let cands = [ans + 1, ans - 1, ans + 2, ans - 2, ans + 10, ans - 10, ans + 9, ans - 11];
      if (p.kind === 'mul') cands = cands.concat([ans + p.a, ans - p.a, ans + p.b, ans - p.b, ans + p.a, ans - p.b]);
      if (ans >= 10) {
        const r = +String(ans).split('').reverse().join('');
        if (r !== ans) cands.push(r);
      }
      const out = [ans];
      for (const c of U.shuffle(cands)) {
        if (out.length >= 4) break;
        if (c >= 0 && !out.includes(c)) out.push(c);
      }
      for (let k = 3; out.length < 4; k++) if (!out.includes(ans + k)) out.push(ans + k);
      return out;
    }

    function next() {
      num++;
      prob = makeProblem();
      const opts = makeOptions(prob);
      popts = ctx.players.map(() => U.shuffle(opts));
      locked = new Set();
      state = 'q';
      qStart = ctx.time;
      zones.forEach((zb, i) => {
        zb.z.el.classList.remove('locked', 'won');
        zb.q.textContent = prob.text;
        fit(zb);
        zb.btns.forEach((b, k) => { b.className = 'ob'; b.textContent = popts[i][k]; });
      });
      timeoutId = ctx.after(LIMIT, () => { ctx.toast('Время вышло', { ms: 1000 }); reveal(-1); });
    }

    function answer(i, k) {
      if (state !== 'q' || locked.has(i)) return;
      const zb = zones[i];
      if (popts[i][k] === prob.ans) {
        score[i]++;
        zb.btns[k].classList.add('ok');
        zb.z.el.classList.add('won');
        reveal(i);
      } else {
        locked.add(i);
        zb.btns[k].classList.add('bad');
        zb.z.el.classList.add('locked');
        if (locked.size >= N) { ctx.toast('Никто не угадал', { ms: 1000 }); reveal(-1); }
      }
    }

    function reveal(w) {
      state = 'reveal';
      ctx.cancel(timeoutId);
      zones.forEach((zb, i) => {
        zb.q.innerHTML = '';
        zb.q.append(prob.text + ' = ', U.h('b', null, String(prob.ans)));
        fit(zb);
        zb.btns.forEach((b, k) => { if (popts[i][k] === prob.ans && !b.classList.contains('ok')) b.classList.add('right'); });
      });
      renderScores();
      if (w >= 0 && score[w] >= TARGET) {
        ctx.toast(`${ctx.players[w].name} победил!`, { color: ctx.players[w].color, fg: '#111', ms: 1200 });
        ctx.after(1100, () => ctx.end({ winner: w, scores: score.slice() }));
        return;
      }
      if (w >= 0) ctx.toast(`+1 ${ctx.players[w].name}`, { color: ctx.players[w].color, fg: '#111', ms: 1000 });
      ctx.after(w >= 0 ? 1300 : 1600, next);
    }

    ctx.loop(() => {
      const f = state === 'q' ? U.clamp(1 - (ctx.time - qStart) / (LIMIT / 1000), 0, 1) : 0;
      zones.forEach(zb => { zb.tmBar.style.width = (f * 100).toFixed(1) + '%'; });
    });

    renderScores();
    zones.forEach(zb => { zb.q.textContent = 'Готовьтесь…'; fit(zb); });
    ctx.after(0, next); // fires when the countdown ends
  },
});
