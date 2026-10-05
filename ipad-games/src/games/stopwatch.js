registerGame({
  id: 'stopwatch',
  title: 'Секундомер',
  emoji: '⏱️',
  desc: 'Останови таймер ровно в цель',
  rules: 'В каждом раунде есть цель, например 7.50 секунды. После отсчёта секундомер стартует сам, жми СТОП, когда думаешь, что прошло ровно столько. Кто ближе всех, получает очко. 5 раундов.\n' +
    'Режимы раундов:\n' +
    '⏱️ Классика: первые 1.5 с время видно.\n' +
    '👻 Невидимка: таймера не видно совсем.\n' +
    '🔄 Обратный: время идёт от цели к нулю, жми на нуле.\n' +
    '🌀 Отвлечение: на экране мелькают ложные цифры.\n' +
    '🎲 Случайная цель: цель с сотыми, например 6.37.\n' +
    '🎯 Снайпер: ошибся меньше чем на 0.10 с, получи +2 бонус.\n' +
    '🆘 Подсказка: кто отстаёт на 2+ очка, видит время на секунду дольше.\n' +
    '🏁 Финал: последний раунд, все очки ×2.',
  start(ctx) {
    const N = ctx.n;
    const ROUNDS = 5;
    const DEPTH = 0.3;
    const SHOW = 1.5;     // seconds the running time is visible
    const GRACE = 5;      // seconds after the target before the round auto-finishes
    const SNIPER = 0.10;
    const TARGETS = [3, 4, 5, 6.5, 7.5, 10];
    const MODES = {
      classic: { icon: '⏱️', name: 'Классика', sub: 'время видно 1.5 с', color: '#ffffff' },
      ghost: { icon: '👻', name: 'Невидимка', sub: 'таймера не видно совсем', color: '#c39bff' },
      reverse: { icon: '🔄', name: 'Обратный отсчёт', sub: 'жми, когда дойдёт до нуля', color: '#4dd0ff' },
      distract: { icon: '🌀', name: 'Отвлечение', sub: 'не верь цифрам!', color: '#ff8a5c' },
      random: { icon: '🎲', name: 'Случайная цель', sub: 'цель с сотыми', color: '#3ddc97' },
    };
    const score = ctx.players.map(() => 0);
    const help = ctx.players.map(() => false);
    let round = 0, target = 5, lastTarget = 0;
    let mode = 'classic';
    let modeBag = U.shuffle(['ghost', 'reverse', 'distract', 'random']);
    let state = 'idle'; // idle | intro | count | run | reveal | show | done
    let t0 = 0, times = [];
    let revealT0 = 0;
    let fakeNext = 0;
    let rolling = false;
    // precise timing between frames
    let frameT = performance.now(), frameGT = 0;

    ctx.root.classList.add('g-sw');
    ctx.root.append(U.h('style', null, `
      .g-sw .sz{display:flex;padding:10px 12px 12px;gap:12px;border-radius:20px}
      .g-sw .sz.row{flex-direction:row}
      .g-sw .sz.col{flex-direction:column;gap:6px}
      .g-sw .inf{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
        background:rgba(255,255,255,.05);border-radius:18px;padding:4px 8px;transition:box-shadow .25s,background .25s}
      .g-sw .top{display:flex;gap:10px;align-items:baseline;justify-content:center;white-space:nowrap;font-weight:800}
      .g-sw .tg{color:#fff}
      .g-sw .tg b{color:var(--pc)}
      .g-sw .sc{color:#c3c8e8}
      .g-sw .disp{font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap;line-height:1.1;color:#fff}
      .g-sw .disp.hid{color:var(--muted)}
      .g-sw .disp.mine{color:var(--pc)}
      .g-sw .disp.fake{color:#ff8a5c;opacity:.75}
      .g-sw .disp.roll{color:#3ddc97}
      .g-sw .disp.pop{animation:swPop .4s ease-out}
      .g-sw .res{font-weight:800;white-space:nowrap;color:var(--muted);min-height:1.2em}
      .g-sw .res.win{color:var(--ok)}
      .g-sw .stop{flex:none;border-radius:22px;background:var(--pc);color:#111;font-weight:900;display:flex;align-items:center;
        justify-content:center;letter-spacing:2px;box-shadow:inset 0 -7px 0 rgba(0,0,0,.2);transition:opacity .15s}
      .g-sw .stop.off{opacity:.3}
      .g-sw .stop.done{background:#2a3150;color:var(--pc);box-shadow:0 0 0 3px var(--pc) inset}
      .g-sw .stop.hit{animation:swHit .16s ease-out}
      .g-sw .sz.won .inf{box-shadow:0 0 0 4px var(--ok) inset,0 0 40px rgba(61,220,151,.5);background:rgba(61,220,151,.12)}
      .g-sw .badge{font-size:.8em;margin-left:6px}
      @keyframes swHit{0%{scale:.92}100%{scale:1}}
      @keyframes swPop{0%{scale:1.5}100%{scale:1}}
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
          ps.push({ kind: 't', x, y, vx: v.x, vy: v.y, str, color, rot: ctx.players[i].rot, size, life: 1.2, max: 1.2 });
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
      const z = ctx.zone(p.i, { depth: DEPTH, className: 'sz' });
      const tg = U.h('span', { class: 'tg' });
      const sc = U.h('span', { class: 'sc' });
      const disp = U.h('div', { class: 'disp' }, '—');
      const res = U.h('div', { class: 'res' }, '');
      const inf = U.h('div', { class: 'inf' }, U.h('div', { class: 'top' }, tg, sc), disp, res);
      const stop = U.h('div', { class: 'stop off' }, 'СТОП');
      z.el.append(inf, stop);
      ctx.tap(stop, () => press(p.i));
      return { z, tg, sc, disp, res, inf, stop };
    });

    function layout() {
      for (const zb of zones) {
        const w = zb.z.w - 24, h = zb.z.h - 22;
        const row = w / h > 1.7;
        zb.z.el.classList.toggle('row', row);
        zb.z.el.classList.toggle('col', !row);
        let infH;
        if (row) {
          const bw = Math.round(Math.min(h * 1.15, w * 0.42));
          Object.assign(zb.stop.style, { width: bw + 'px', height: 'auto' });
          zb.stop.style.fontSize = Math.round(Math.min(bw * 0.2, 46)) + 'px';
          infH = h;
        } else {
          const bh = Math.round(h * 0.4);
          Object.assign(zb.stop.style, { width: 'auto', height: bh + 'px' });
          zb.stop.style.fontSize = Math.round(Math.min(bh * 0.45, 46)) + 'px';
          infH = h - bh - 6;
        }
        const infW = row ? w - parseFloat(zb.stop.style.width) - 12 : w;
        const small = Math.round(U.clamp(Math.min(infH * 0.15, infW / 17), 13, 22));
        zb.tg.parentNode.style.fontSize = small + 'px';
        zb.res.style.fontSize = small + 'px';
        zb.disp.style.fontSize = Math.round(U.clamp(Math.min(infH * 0.42, infW / 5.2), 22, 72)) + 'px';
      }
    }
    layout();
    ctx.onResize(layout);

    const fmt = (s) => s.toFixed(2);
    const final = () => round === ROUNDS;
    function renderInfo() {
      zones.forEach((zb, i) => {
        zb.tg.innerHTML = '';
        const tTxt = rolling ? '?.??' : fmt(target);
        zb.tg.append(MODES[mode].icon + ' ', mode === 'reverse' ? 'С ' : 'Цель ', U.h('b', null, tTxt + ' с'), mode === 'reverse' ? ' до 0' : '');
        zb.sc.textContent = `· ${final() ? '🏁 финал' : `раунд ${Math.max(1, round)}/${ROUNDS}`} · очки ${score[i]}`;
      });
    }

    function elapsed() {
      // game time at the last frame plus real time since then (finer than one frame)
      return frameGT - t0 + (ctx.paused ? 0 : Math.min(0.05, (performance.now() - frameT) / 1000));
    }
    // how long player i may see the running time this round
    function visibleFor(i) {
      const base = mode === 'ghost' ? 0 : SHOW;
      return base + (help[i] ? 1 : 0);
    }

    function newRound() {
      round++;
      mode = round === 1 ? 'classic' : modeBag.pop() || 'classic';
      if (mode === 'random') target = Math.round(U.rand(3.2, 9.4) * 100) / 100;
      else { do { target = U.pick(TARGETS); } while (target === lastTarget); }
      lastTarget = target;
      times = ctx.players.map(() => null);
      const max = Math.max(...score);
      ctx.players.forEach(p => { help[p.i] = round > 1 && max - score[p.i] >= 2; });
      state = 'intro';
      const M = MODES[mode];
      if (final()) {
        fx.banner('🏁', 'Финал! Очки ×2', `${M.icon} ${M.name}`, { color: '#ffd84a', fg: '#111', ms: 2000 });
        fx.flash('#ffd84a', 0.25);
      } else {
        fx.banner(M.icon, M.name, M.sub, { color: M.color, fg: '#111', ms: 1800 });
        if (mode !== 'classic') fx.flash(M.color, 0.15);
      }
      zones.forEach(zb => {
        zb.z.el.classList.remove('won');
        zb.disp.className = 'disp';
        zb.disp.textContent = mode === 'random' ? '🎲' : fmt(target);
        zb.res.className = 'res';
        zb.res.textContent = 'приготовься…';
        zb.stop.className = 'stop off';
        zb.stop.textContent = 'СТОП';
      });
      rolling = mode === 'random';
      renderInfo();
      const helped = ctx.players.filter(p => help[p.i]);
      ctx.after(1900, () => {
        if (helped.length) fx.banner('🆘', 'Подсказка', helped.map(p => p.name).join(', ') + ': время видно дольше', { ms: 1500 });
        state = 'count';
        if (mode === 'random') {
          // slot-machine roll of the target
          let k = 0;
          const roll = () => {
            if (k++ < 10) {
              zones.forEach(zb => { zb.disp.className = 'disp roll'; zb.disp.textContent = fmt(U.rand(3, 9.9)); });
              ctx.after(70, roll);
            } else {
              rolling = false;
              zones.forEach(zb => { zb.disp.className = 'disp roll pop'; zb.disp.textContent = fmt(target); });
              renderInfo();
              ctx.after(900, countdown);
            }
          };
          roll();
        } else countdown();
      });
    }

    function countdown() {
      let count = 3;
      const step = () => {
        if (state !== 'count') return;
        if (count > 0) {
          zones.forEach(zb => { zb.disp.className = 'disp pop'; zb.disp.textContent = String(count); zb.res.textContent = 'старт через…'; });
          count--;
          ctx.after(650, step);
        } else go();
      };
      step();
    }

    function go() {
      state = 'run';
      t0 = ctx.time;
      frameGT = ctx.time; frameT = performance.now();
      fakeNext = 0;
      zones.forEach(zb => {
        zb.stop.className = 'stop';
        zb.res.textContent = mode === 'reverse' ? 'жми на нуле!' : 'считай про себя!';
      });
    }

    function press(i) {
      const zb = zones[i];
      if (state === 'count' || state === 'intro') {
        zb.res.textContent = 'ещё рано!';
        fx.shake(zb.stop);
        return;
      }
      if (state !== 'run' || times[i] != null) return;
      times[i] = elapsed();
      zb.stop.classList.remove('hit'); void zb.stop.offsetWidth; zb.stop.classList.add('hit');
      zb.stop.classList.add('done');
      zb.stop.textContent = '✓';
      zb.disp.className = 'disp mine';
      zb.disp.textContent = 'стоп!';
      const a = fx.at(zb.stop);
      fx.ring(a.x, a.y, ctx.players[i].color, 80);
      zb.res.textContent = times.every(t => t != null) ? '' : 'ждём остальных…';
      if (times.every(t => t != null)) finish();
    }

    // dramatic reveal: everyone's time rolls up from zero at once, then the verdict
    function finish() {
      state = 'reveal';
      revealT0 = ctx.time;
      zones.forEach((zb, i) => {
        zb.stop.className = 'stop off';
        zb.stop.textContent = 'СТОП';
        zb.res.className = 'res';
        zb.res.textContent = times[i] == null ? 'не нажал' : '🥁 …';
      });
      ctx.after(1500, verdict);
    }

    function verdict() {
      state = 'show';
      const mult = final() ? 2 : 1;
      const diffs = times.map(t => t == null ? Infinity : Math.abs(t - target));
      const best = Math.min(...diffs);
      const winners = best === Infinity ? [] : diffs.map((d, i) => d - best < 0.005 ? i : -1).filter(i => i >= 0);
      const snipers = diffs.map((d, i) => d <= SNIPER ? i : -1).filter(i => i >= 0);
      winners.forEach(i => { score[i] += mult; });
      snipers.forEach(i => { score[i] += 2 * mult; });
      zones.forEach((zb, i) => {
        zb.disp.className = 'disp mine pop';
        if (times[i] == null) {
          zb.disp.textContent = '—';
          zb.res.textContent = 'не нажал';
          return;
        }
        zb.disp.textContent = fmt(times[i]) + ' с';
        const d = times[i] - target;
        let pts = (winners.includes(i) ? mult : 0) + (snipers.includes(i) ? 2 * mult : 0);
        zb.res.textContent = (d >= 0 ? '+' : '−') + fmt(Math.abs(d)) + ' с' + (pts ? `  +${pts}` : '') + (snipers.includes(i) ? ' 🎯' : winners.includes(i) ? ' 🏆' : '');
        if (pts) {
          zb.res.className = 'res win';
          zb.z.el.classList.add('won');
          const a = fx.at(zb.inf);
          fx.burst(a.x, a.y, ctx.players[i].color, 34, 460, 7);
          fx.burst(a.x, a.y, '#3ddc97', 16, 300, 5);
          fx.ring(a.x, a.y, '#fff', 120);
          fx.text(a.x, a.y, '+' + pts, '#fff', i, 44);
        }
      });
      renderInfo();
      if (snipers.length) {
        fx.flash('#3ddc97', 0.3);
        fx.shake();
        fx.banner('🎯', 'Снайпер!', snipers.map(i => ctx.players[i].name).join(', ') + `: точнее 0.10 с, +${2 * mult}`, { color: '#3ddc97', fg: '#111', ms: 1800 });
      } else if (winners.length) {
        const c = winners.length === 1 ? ctx.players[winners[0]].color : undefined;
        fx.banner('🏆', '+' + mult + ' ' + winners.map(i => ctx.players[i].name).join(' и '), null, { color: c, fg: c ? '#111' : undefined, ms: 1600 });
      } else {
        fx.banner('😴', 'Никто не нажал', null, { ms: 1500 });
      }
      if (round >= ROUNDS) {
        state = 'done';
        const max = Math.max(...score);
        const ws = score.map((s, i) => s === max ? i : -1).filter(i => i >= 0);
        ctx.after(2800, () => ctx.end({ winners: ws, scores: score.slice() }));
      } else {
        ctx.after(3200, newRound);
      }
    }

    ctx.loop((dt, t) => {
      if (dt > 0) { frameT = t; frameGT = ctx.time; }
      if (state === 'run') {
        const e = ctx.time - t0;
        const flick = mode === 'distract' && ctx.time >= fakeNext;
        if (flick) fakeNext = ctx.time + U.rand(0.08, 0.22);
        zones.forEach((zb, i) => {
          if (times[i] != null) return;
          const shown = e < visibleFor(i);
          if (shown) {
            zb.disp.className = 'disp';
            zb.disp.textContent = fmt(mode === 'reverse' ? Math.max(0, target - e) : e);
          } else if (mode === 'distract') {
            if (flick) { zb.disp.className = 'disp fake'; zb.disp.textContent = fmt(U.rand(0, target * 1.6)); }
          } else {
            zb.disp.className = 'disp hid';
            zb.disp.textContent = mode === 'ghost' ? '👻' : '???';
          }
        });
        if (dt > 0 && e > target + GRACE) finish();
      } else if (state === 'reveal') {
        const f = U.clamp((ctx.time - revealT0) / 1.2, 0, 1);
        const ease = 1 - Math.pow(1 - f, 3);
        zones.forEach((zb, i) => {
          if (times[i] == null) return;
          zb.disp.className = 'disp mine';
          zb.disp.textContent = fmt(times[i] * ease);
        });
      }
      draw(t / 1000);
    });

    function draw(T) {
      const W = ctx.W, H = ctx.H, d = zones[0].z.h;
      g.clearRect(0, 0, W, H);
      const cx = W / 2, cy = N === 2 ? H / 2 : (H - d) / 2;
      const room = N === 2 ? Math.min(W, H - 2 * d) : Math.min(W - 2 * d, H - d);
      const R = U.clamp(room * 0.36, 40, 170);
      const SPAN = 12; // seconds per revolution
      const ang = (s) => -Math.PI / 2 + s / SPAN * Math.PI * 2;
      g.save();
      g.translate(cx, cy);
      if (final() && state !== 'idle') {
        g.shadowColor = '#ffd84a';
        g.shadowBlur = 30 + 10 * Math.sin(T * 4);
      }
      // dial
      g.fillStyle = '#1b2038';
      g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
      g.lineWidth = Math.max(4, R * 0.06);
      g.strokeStyle = final() ? '#ffd84a' : '#3a4270';
      g.stroke();
      g.shadowBlur = 0;
      // ticks
      for (let k = 0; k < SPAN; k++) {
        const a = ang(k);
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78);
        g.lineTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9);
        g.stroke();
      }
      // target marker (sniper window around it)
      if (state !== 'idle' && !rolling) {
        const a = ang(target), w = SNIPER / SPAN * Math.PI * 2;
        g.strokeStyle = 'rgba(61,220,151,.35)';
        g.lineWidth = Math.max(10, R * 0.12);
        g.beginPath(); g.arc(0, 0, R * 0.95, a - w, a + w); g.stroke();
        g.strokeStyle = '#3ddc97';
        g.lineWidth = Math.max(6, R * 0.08);
        g.lineCap = 'round';
        g.beginPath(); g.arc(0, 0, R * 0.95, a - 0.04, a + 0.04); g.stroke();
      }
      const e = state === 'run' ? ctx.time - t0 : 0;
      const handVisible = state === 'run' ? e < (mode === 'ghost' ? 0 : SHOW) : true;
      if (state === 'run' && mode === 'distract' && !handVisible) {
        // a lying hand that spins at random speeds
        const a = ang(e * (1.6 + Math.sin(T * 2.3) * 1.2) + Math.sin(T * 5) * 0.8);
        g.strokeStyle = 'rgba(255,138,92,.8)';
        g.lineWidth = Math.max(4, R * 0.05);
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8); g.stroke();
      } else if (state === 'run' && !handVisible) {
        // hidden: fog over the dial
        g.fillStyle = `rgba(15,18,32,${0.75 + 0.1 * Math.sin(T * 3)})`;
        g.beginPath(); g.arc(0, 0, R * 0.88, 0, Math.PI * 2); g.fill();
        g.strokeStyle = mode === 'ghost' ? 'rgba(195,155,255,.25)' : 'rgba(255,255,255,.12)';
        g.lineWidth = 2;
        for (let k = -3; k <= 3; k++) {
          const s = T * (k % 2 ? 1.2 : -0.9);
          g.beginPath(); g.arc(0, 0, R * (0.3 + 0.08 * (k + 3)), s, s + 1.6); g.stroke();
        }
      } else if (state !== 'reveal' && state !== 'show' && state !== 'done') {
        const s = state === 'run' ? (mode === 'reverse' ? Math.max(0, target - e) : e) : (mode === 'reverse' ? target : 0);
        const a = ang(s);
        g.strokeStyle = '#fff';
        g.lineWidth = Math.max(4, R * 0.05);
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8); g.stroke();
      }
      // everyone's stop points sweep out during the reveal
      if (state === 'reveal' || state === 'show' || state === 'done') {
        const f = state === 'reveal' ? 1 - Math.pow(1 - U.clamp((ctx.time - revealT0) / 1.2, 0, 1), 3) : 1;
        times.forEach((tt, i) => {
          if (tt == null) return;
          const a = ang(Math.min(tt, SPAN) * f);
          const r = R * (0.5 + 0.1 * i);
          g.strokeStyle = U.alpha(ctx.players[i].color, 0.5);
          g.lineWidth = 4;
          g.beginPath(); g.arc(0, 0, r, -Math.PI / 2, a); g.stroke();
          g.fillStyle = ctx.players[i].color;
          g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, Math.max(7, R * 0.07), 0, Math.PI * 2); g.fill();
        });
      }
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(0, 0, Math.max(6, R * 0.06), 0, Math.PI * 2); g.fill();
      // crown button
      g.fillStyle = final() ? '#ffd84a' : '#3a4270';
      g.fillRect(-R * 0.1, -R * 1.17, R * 0.2, R * 0.14);
      g.restore();
    }

    renderInfo();
    zones.forEach(zb => { zb.disp.textContent = '—'; zb.res.textContent = 'приготовься…'; });
    ctx.after(0, newRound);
  },
});
