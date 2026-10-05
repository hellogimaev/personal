registerGame({
  id: 'math',
  title: 'Математический батл',
  emoji: '🧮',
  desc: 'Реши пример быстрее всех',
  rules: 'У каждого перед собой один и тот же пример и варианты ответа. Первый верный ответ даёт очко, ошибся: ждёшь следующий пример. До 7 очков. Примеры постепенно усложняются.\n' +
    'Особые раунды:\n' +
    '⚡ Блиц: всего 4 секунды.\n' +
    '✖️2 Двойные очки: верный ответ +2.\n' +
    '🎯 Угадай знак: 7 ? 8 = 56, выбери + − × ÷.\n' +
    '⚖️ Сравни: что больше, левое или правое?\n' +
    '🕵️ Кража: верный ответ отнимает очко у лидера.\n' +
    '☠️ Риск: верно +2, ошибка −1.\n' +
    '🔥 Серия: 3 победы подряд дают +1 бонус.\n' +
    '🆘 Подсказка: кто отстал на 3+ очка, у того один неверный ответ убран.',
  start(ctx) {
    const N = ctx.n;
    const TARGET = 7;
    const DEPTH = N === 2 ? 0.36 : 0.3;
    const LIMIT = 20000; // ms per problem before it is skipped
    const MODES = {
      blitz: { icon: '⚡', name: 'Блиц', sub: 'всего 4 секунды!', color: '#ffd84a' },
      double: { icon: '✖️2', name: 'Двойные очки', sub: 'верный ответ +2', color: '#3ddc97' },
      sign: { icon: '🎯', name: 'Угадай знак', sub: 'какой знак пропущен?', color: '#4dd0ff' },
      cmp: { icon: '⚖️', name: 'Сравни', sub: 'что больше?', color: '#c39bff' },
      steal: { icon: '🕵️', name: 'Кража', sub: 'верный ответ крадёт очко у лидера', color: '#ff8a5c' },
      risk: { icon: '☠️', name: 'Риск', sub: 'верно +2, ошибка −1', color: '#ff4d6d' },
    };
    const score = ctx.players.map(() => 0);
    const hinted = ctx.players.map(() => false);
    let prob = null, popts = [], locked = new Set(), state = 'wait', timeoutId = null, qStart = 0, qLimit = LIMIT, num = 0;
    let mode = 'normal', lastMode = 'normal';
    let lastWinner = -1, streak = 0;

    ctx.root.classList.add('g-math');
    ctx.root.append(U.h('style', null, `
      .g-math .mz{display:flex;flex-direction:column;padding:10px 12px 12px;border-radius:20px;transition:box-shadow .2s}
      .g-math .hd{display:flex;align-items:center;justify-content:center;gap:10px;position:relative;flex:none}
      .g-math .q{font-weight:900;white-space:nowrap;color:#fff;letter-spacing:.5px}
      .g-math .q b{color:var(--ok)}
      .g-math .q.pre{color:var(--mc,#fff);animation:mathPulse .5s ease-in-out infinite alternate}
      @keyframes mathPulse{0%{scale:1}100%{scale:1.08}}
      .g-math .sc{position:absolute;right:0;top:50%;transform:translateY(-50%);background:var(--pc);color:#111;
        font-weight:900;border-radius:12px;padding:2px 10px;font-size:20px}
      .g-math .tag{position:absolute;left:0;top:50%;transform:translateY(-50%);border-radius:12px;padding:2px 8px;font-size:20px;
        background:rgba(255,255,255,.12);display:none}
      .g-math .tm{position:absolute;left:4px;right:4px;bottom:2px;height:5px;border-radius:3px;background:rgba(255,255,255,.08)}
      .g-math .tm i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--pc);opacity:.7}
      .g-math .tm.blitz i{background:#ffd84a;opacity:1}
      .g-math .opts{flex:1;display:grid;gap:10px;min-height:0}
      .g-math .ob{border-radius:18px;background:var(--card2);color:#fff;font-weight:900;display:flex;align-items:center;justify-content:center;
        box-shadow:inset 0 -5px 0 rgba(0,0,0,.25), 0 0 0 3px var(--pc) inset;transition:background .12s,opacity .12s}
      .g-math .ob.bad{background:var(--bad);animation:mathShake .3s}
      .g-math .ob.ok{background:var(--ok);color:#111;animation:mathOk .35s}
      .g-math .ob.right{background:rgba(61,220,151,.35)}
      .g-math .ob.gone{opacity:.12;pointer-events:none}
      .g-math .ob.hidden{display:none}
      .g-math .ob.blank{opacity:.25}
      .g-math .mz.locked .ob:not(.bad){opacity:.3}
      .g-math .mz.won{box-shadow:0 0 0 5px var(--pc) inset, 0 0 40px var(--pc)}
      @keyframes mathShake{0%,100%{translate:0}25%{translate:-8px}75%{translate:8px}}
      @keyframes mathOk{0%{scale:1}50%{scale:1.12}100%{scale:1}}
      .g-math .pips{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;flex-direction:column;gap:10px;pointer-events:none}
      .g-math .pips div{display:flex;gap:8px;align-items:center}
      .g-math .pips span{border-radius:50%;border:3px solid;opacity:.9;transition:background .3s}
      .g-math .pips em{font-style:normal;font-size:18px;width:22px;text-align:center}
      .g-math .coin{position:absolute;z-index:45;font-size:44px;font-weight:900;pointer-events:none;transform:translate(-50%,-50%);
        transition:left .75s cubic-bezier(.5,-0.3,.5,1.3),top .75s cubic-bezier(.5,-0.3,.5,1.3),opacity .3s}
      .fx-flash{position:absolute;inset:0;z-index:36;pointer-events:none;transition:opacity .55s ease-out}
      .fx-shake{animation:fxShake .35s}
      @keyframes fxShake{0%,100%{translate:0 0}20%{translate:-9px 4px}40%{translate:8px -5px}60%{translate:-6px -3px}80%{translate:5px 3px}}
      .toast.fx-ban{font-size:26px;text-align:center;line-height:1.15;border:2px solid rgba(255,255,255,.3);animation:fxPop .4s ease-out;padding:10px 20px}
      .toast.fx-ban b{font-size:34px;margin-right:8px;vertical-align:-4px}
      .toast.fx-ban small{display:block;font-size:16px;font-weight:700;opacity:.85;margin-top:2px}
      @keyframes fxPop{0%{scale:.3;opacity:0}60%{scale:1.12;opacity:1}100%{scale:1}}
    `));

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

    // center: score pips (no text, so readable from every side)
    const pipsEl = U.h('div', { class: 'pips' });
    const pipRows = ctx.players.map(p => {
      const row = U.h('div');
      for (let k = 0; k < TARGET; k++) row.append(U.h('span', { style: { borderColor: p.color } }));
      row.append(U.h('em'));
      pipsEl.append(row);
      return row;
    });
    ctx.root.append(pipsEl);

    const zones = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH, className: 'mz' });
      const q = U.h('div', { class: 'q' }, '…');
      const sc = U.h('div', { class: 'sc' }, '0/' + TARGET);
      const tag = U.h('div', { class: 'tag' }, '');
      const tmBar = U.h('i');
      const tm = U.h('div', { class: 'tm' }, tmBar);
      const hd = U.h('div', { class: 'hd' }, tag, q, sc, tm);
      const opts = U.h('div', { class: 'opts' });
      const btns = [0, 1, 2, 3].map(k => {
        const b = U.h('div', { class: 'ob' }, '');
        ctx.tap(b, () => answer(p.i, k));
        opts.append(b);
        return b;
      });
      z.el.append(hd, opts);
      return { z, q, sc, tag, hd, opts, btns, tm, tmBar, qf: 40, qw: 200 };
    });

    let nOpts = 4;
    function layout() {
      for (const zb of zones) {
        const w = zb.z.w - 24, h = zb.z.h - 22;
        const wide = w / h >= 2.1;
        const cols = nOpts === 3 ? 3 : nOpts === 2 ? 2 : wide ? 4 : 2;
        const rows = Math.ceil(nOpts / cols);
        const hh = Math.round(h * (rows === 1 ? 0.36 : 0.3));
        zb.hd.style.height = hh + 'px';
        zb.sc.style.fontSize = zb.tag.style.fontSize = Math.round(U.clamp(hh * 0.3, 16, 24)) + 'px';
        zb.qf = Math.round(Math.min(hh * 0.72, 56));
        zb.qw = w - 2 * (Math.max(zb.sc.offsetWidth, zb.tag.offsetWidth) + 10);
        fit(zb);
        zb.opts.style.gridTemplateColumns = `repeat(${cols},1fr)`;
        const bh = (h - hh - 10 * (rows - 1)) / rows, bw = (w - 10 * (cols - 1)) / cols;
        const bf = Math.round(Math.min(bh * 0.5, bw * 0.3, 44));
        zb.btns.forEach(b => { b.style.fontSize = bf + 'px'; });
      }
      const s = Math.max(10, Math.min(18, (Math.min(ctx.W, ctx.H) * 0.3) / TARGET - 8));
      pipsEl.querySelectorAll('span').forEach(e => { e.style.width = e.style.height = s + 'px'; });
    }

    // shrink the problem text until it fits between the pills
    function fit(zb, scale = 1) {
      let f = Math.round((zb.qf || 40) * scale);
      zb.q.style.fontSize = f + 'px';
      while (f > 14 && zb.q.scrollWidth > zb.qw) { f -= 2; zb.q.style.fontSize = f + 'px'; }
    }

    function renderScores() {
      zones.forEach((zb, i) => { zb.sc.textContent = score[i] + '/' + TARGET; });
      pipRows.forEach((row, i) => {
        [...row.querySelectorAll('span')].forEach((e, k) => { e.style.background = k < score[i] ? ctx.players[i].color : 'transparent'; });
        row.querySelector('em').textContent = lastWinner === i && streak >= 2 ? '🔥' : '';
      });
    }

    // ----- problems -----
    const R = U.randInt;
    function arith(L) {
      const t = Math.random();
      let text, ans, a, b, c, kind;
      if (t < 0.25) {
        kind = 'add';
        if (L === 0) { a = R(13, 59); b = R(12, 49); } else if (L === 1) { a = R(25, 89); b = R(25, 89); } else { a = R(105, 399); b = R(26, 99); }
        ans = a + b; text = `${a} + ${b}`;
      } else if (t < 0.5) {
        kind = 'sub';
        if (L === 0) { a = R(31, 99); b = R(12, a - 9); } else if (L === 1) { a = R(100, 199); b = R(25, 99); } else { a = R(200, 499); b = R(45, 199); }
        ans = a - b; text = `${a} − ${b}`;
      } else if (t < 0.75 - L * 0.1) {
        kind = 'mul';
        if (L === 0) { a = R(3, 9); b = R(3, 9); } else if (L === 1) { a = R(3, 12); b = R(4, 12); } else { a = R(11, 19); b = R(3, 9); }
        ans = a * b; text = `${a} × ${b}`;
      } else {
        kind = 'mul'; a = R(3, 9 + L); b = R(3, 9); c = R(5, 29 + L * 20);
        const m = a * b, f = Math.random();
        if (f < 0.4 && m - c >= 0) { ans = m - c; text = `${a} × ${b} − ${c}`; }
        else if (f < 0.7) { ans = m + c; text = `${a} × ${b} + ${c}`; }
        else { ans = c + m; text = `${c} + ${a} × ${b}`; }
      }
      // distractors close to the answer
      let cands = [ans + 1, ans - 1, ans + 2, ans - 2, ans + 10, ans - 10, ans + 9, ans - 11];
      if (kind === 'mul') cands = cands.concat([ans + a, ans - a, ans + b, ans - b, ans + a, ans - b]);
      if (ans >= 10) { const r = +String(ans).split('').reverse().join(''); if (r !== ans) cands.push(r); }
      const out = [ans];
      for (const x of U.shuffle(cands)) { if (out.length >= 4) break; if (x >= 0 && !out.includes(x)) out.push(x); }
      for (let k = 3; out.length < 4; k++) if (!out.includes(ans + k)) out.push(ans + k);
      return { text, ans: String(ans), opts: out.map(String) };
    }
    function signProblem(L) {
      for (;;) {
        const op = U.pick(['+', '−', '×', '÷']);
        let a, b;
        if (op === '÷') { b = R(2, 9); a = b * R(2, 12); }
        else if (op === '×') { a = R(3, 9 + L * 3); b = R(3, 9); }
        else { a = R(12, 60 + L * 30); b = R(4, Math.min(a - 1, 40)); }
        const res = { '+': a + b, '−': a - b, '×': a * b, '÷': a % b === 0 ? a / b : NaN };
        const c = res[op];
        if (Object.keys(res).filter(k => res[k] === c).length > 1) continue;
        return { text: `${a} ? ${b} = ${c}`, ans: op, opts: ['+', '−', '×', '÷'] };
      }
    }
    function expr(v) {
      // random expression whose value is v
      if (Math.random() < 0.5 || v < 20) { const x = R(Math.max(1, Math.round(v * 0.25)), Math.max(2, Math.round(v * 0.75))); return `${x} + ${v - x}`; }
      const y = R(5, 30); return `${v + y} − ${y}`;
    }
    function cmpProblem(L) {
      const a = R(3, 9 + L * 2), b = R(4, 12);
      const v1 = a * b;
      const d = Math.random() < 0.25 ? 0 : U.pick([-3, -2, -1, 1, 2, 3]) * (L + 1);
      const v2 = Math.max(4, v1 + d);
      const left = `${a} × ${b}`, right = expr(v2);
      const ans = v1 > v2 ? '>' : v1 < v2 ? '<' : '=';
      return { text: `${left}  ?  ${right}`, ans, opts: ['<', '=', '>'] };
    }
    function makeProblem() {
      const L = Math.min(2, Math.floor((num - 1) / 6));
      if (mode === 'sign') return signProblem(L);
      if (mode === 'cmp') return cmpProblem(L);
      return arith(L);
    }

    function pickMode() {
      if (num <= 1) return 'normal';
      const pool = ['normal', 'normal', 'normal', 'blitz', 'double', 'sign', 'cmp', 'risk'];
      const max = Math.max(...score);
      if (max >= 2) pool.push('steal');
      let m;
      do { m = U.pick(pool); } while (m !== 'normal' && m === lastMode);
      return m;
    }

    function next() {
      num++;
      mode = pickMode();
      lastMode = mode;
      locked = new Set();
      zones.forEach(zb => { zb.z.el.classList.remove('locked', 'won'); zb.tm.classList.toggle('blitz', mode === 'blitz'); });
      if (mode === 'normal') { show(); return; }
      const M = MODES[mode];
      state = 'pre';
      fx.banner(M.icon, M.name, M.sub, { color: M.color, fg: '#111', ms: 1500 });
      fx.flash(M.color, 0.18);
      zones.forEach(zb => {
        zb.q.className = 'q pre';
        zb.q.style.setProperty('--mc', M.color);
        zb.q.textContent = `${M.icon} ${M.name}`;
        fit(zb, 0.65);
        zb.tag.style.display = 'block';
        zb.tag.textContent = M.icon;
        zb.btns.forEach(b => { b.className = 'ob blank'; b.textContent = ''; });
      });
      ctx.after(1300, show);
    }

    function show() {
      prob = makeProblem();
      if (nOpts !== prob.opts.length) { nOpts = prob.opts.length; }
      popts = ctx.players.map(() => U.shuffle(prob.opts));
      state = 'q';
      qStart = ctx.time;
      qLimit = mode === 'blitz' ? 4000 : LIMIT;
      const maxS = Math.max(...score);
      const newHints = [];
      zones.forEach((zb, i) => {
        zb.q.className = 'q';
        zb.q.textContent = prob.text;
        zb.tag.style.display = mode === 'normal' ? 'none' : 'block';
        zb.btns.forEach((b, k) => {
          b.className = 'ob' + (k >= nOpts ? ' hidden' : '');
          b.textContent = k < nOpts ? popts[i][k] : '';
        });
        // 🆘 comeback hint: remove one wrong option
        if (maxS - score[i] >= 3) {
          const wrong = [];
          for (let k = 0; k < nOpts; k++) if (popts[i][k] !== prob.ans) wrong.push(k);
          const k = U.pick(wrong);
          zb.btns[k].classList.add('gone');
          zb.btns[k].textContent = '✕';
          if (!hinted[i]) { hinted[i] = true; newHints.push(ctx.players[i].name); }
        }
      });
      if (newHints.length) fx.banner('🆘', 'Подсказка', newHints.join(', ') + ': один неверный ответ убран', { ms: 1600 });
      layout();
      timeoutId = ctx.after(qLimit, () => { fx.banner('⏰', 'Время вышло', null, { ms: 1000 }); reveal(-1); });
    }

    function fly(from, to, str) {
      const e = U.h('div', { class: 'coin', style: { left: from.x + 'px', top: from.y + 'px' } }, str);
      ctx.root.append(e);
      void e.offsetWidth;
      e.style.left = to.x + 'px';
      e.style.top = to.y + 'px';
      ctx.after(800, () => { fx.burst(to.x, to.y, '#ffd84a', 20, 300, 6); e.remove(); });
    }

    function answer(i, k) {
      if (state !== 'q' || locked.has(i)) return;
      const zb = zones[i], p = ctx.players[i];
      const b = zb.btns[k];
      const at = fx.at(b);
      if (popts[i][k] === prob.ans) {
        const gain = mode === 'double' || mode === 'risk' ? 2 : 1;
        score[i] += gain;
        b.classList.add('ok');
        zb.z.el.classList.add('won');
        fx.burst(at.x, at.y, p.color, 26, 420, 7);
        fx.burst(at.x, at.y, '#3ddc97', 14, 300, 5);
        fx.ring(at.x, at.y, '#fff', 100);
        fx.text(at.x, at.y, '+' + gain, '#fff', i);
        // 🕵️ steal from the leader
        if (mode === 'steal') {
          let j = -1;
          for (let q = 0; q < N; q++) if (q !== i && score[q] > 0 && (j < 0 || score[q] > score[j])) j = q;
          if (j >= 0) {
            score[j]--;
            fly(fx.at(zones[j].sc), fx.at(zb.sc), '🪙');
            fx.text(fx.at(zones[j].sc).x, fx.at(zones[j].sc).y, '−1', '#ff4d6d', j);
            fx.banner('🕵️', `${p.name} крадёт очко!`, `у игрока ${ctx.players[j].name}`, { color: p.color, fg: '#111', ms: 1500 });
          }
        }
        // 🔥 streak
        if (lastWinner === i) streak++; else { lastWinner = i; streak = 1; }
        if (streak >= 3) {
          streak = 0;
          score[i]++;
          ctx.after(450, () => {
            const a = fx.at(zb.sc);
            fx.burst(a.x, a.y, '#ff9a3c', 30, 380, 7);
            fx.text(a.x, a.y, '🔥+1', '#ffb340', i, 42);
          });
          fx.banner('🔥', 'Серия!', `${p.name}: 3 подряд, бонус +1`, { color: '#ff9a3c', fg: '#111', ms: 1600 });
        }
        reveal(i);
      } else {
        locked.add(i);
        b.classList.add('bad');
        zb.z.el.classList.add('locked');
        fx.burst(at.x, at.y, '#ff4d6d', 12, 220, 5);
        if (lastWinner === i) { lastWinner = -1; streak = 0; }
        if (mode === 'risk' && score[i] > 0) {
          score[i]--;
          fx.text(at.x, at.y, '−1', '#ff4d6d', i);
          fx.shake(zb.z.el);
          renderScores();
        }
        if (locked.size >= N) { fx.banner('🤷', 'Никто не угадал', null, { ms: 1100 }); reveal(-1); }
      }
    }

    function reveal(w) {
      state = 'reveal';
      ctx.cancel(timeoutId);
      zones.forEach((zb, i) => {
        zb.q.innerHTML = '';
        if (prob.text.includes('?')) {
          const [l, r] = prob.text.split('?');
          zb.q.append(l, U.h('b', null, prob.ans), r);
        } else zb.q.append(prob.text + ' = ', U.h('b', null, prob.ans));
        fit(zb);
        zb.btns.forEach((b, k) => { if (popts[i][k] === prob.ans && !b.classList.contains('ok')) b.classList.add('right'); });
      });
      renderScores();
      const max = Math.max(...score);
      if (max >= TARGET) {
        const wi = score.indexOf(max);
        state = 'done';
        fx.flash(ctx.players[wi].color, 0.35);
        fx.shake();
        const a = fx.at(zones[wi].z.el);
        fx.burst(a.x, a.y, ctx.players[wi].color, 60, 600, 9);
        fx.banner('🏆', `${ctx.players[wi].name} победил!`, null, { color: ctx.players[wi].color, fg: '#111', ms: 1500 });
        ctx.after(1500, () => ctx.end({ winner: wi, scores: score.slice() }));
        return;
      }
      ctx.after(w >= 0 ? 1400 : 1700, next);
    }

    ctx.loop(() => {
      const f = state === 'q' ? U.clamp(1 - (ctx.time - qStart) / (qLimit / 1000), 0, 1) : 0;
      zones.forEach(zb => { zb.tmBar.style.width = (f * 100).toFixed(1) + '%'; });
    });

    layout();
    ctx.onResize(layout);
    renderScores();
    zones.forEach(zb => { zb.q.textContent = 'Готовьтесь…'; fit(zb); });
    ctx.after(0, next); // fires when the countdown ends
  },
});
