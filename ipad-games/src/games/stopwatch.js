registerGame({
  id: 'stopwatch',
  title: 'Секундомер',
  emoji: '⏱️',
  desc: 'Останови таймер ровно в цель',
  rules: 'В каждом раунде задаётся цель, например 7.50 секунды.\nПосле отсчёта секундомер стартует сам, первые полторы секунды видно время, потом оно прячется.\nЖми СТОП, когда думаешь, что прошло ровно столько.\nКто ближе всех к цели, получает очко. 5 раундов.',
  start(ctx) {
    const N = ctx.n;
    // 3p: push the toast copies further apart so the rotated copies don't overlap
    const say = (text, o = {}) => ctx.toast(text, Object.assign({ offset: N === 3 ? Math.max(90, text.length * 7.5 + 30) : 70 }, o));
    const ROUNDS = 5;
    const DEPTH = 0.3;
    const SHOW = 1.5;     // seconds the running time is visible
    const GRACE = 5;      // seconds after the target before the round auto-finishes
    const TARGETS = [3, 4, 5, 6.5, 7.5, 10];
    const score = ctx.players.map(() => 0);
    let round = 0, target = 5, lastTarget = 0;
    let state = 'idle'; // idle | count | run | show | done
    let t0 = 0, times = [];
    let count = 0;
    // precise timing between frames
    let frameT = performance.now(), frameGT = 0;

    ctx.root.classList.add('g-sw');
    ctx.root.append(U.h('style', null, `
      .g-sw .sz{display:flex;padding:10px 12px 12px;gap:12px}
      .g-sw .sz.row{flex-direction:row}
      .g-sw .sz.col{flex-direction:column;gap:6px}
      .g-sw .inf{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
        background:rgba(255,255,255,.05);border-radius:18px;padding:4px 8px}
      .g-sw .top{display:flex;gap:10px;align-items:baseline;justify-content:center;white-space:nowrap;font-weight:800}
      .g-sw .tg{color:#fff}
      .g-sw .tg b{color:var(--pc)}
      .g-sw .sc{color:#c3c8e8}
      .g-sw .disp{font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap;line-height:1.1;color:#fff}
      .g-sw .disp.hid{color:var(--muted)}
      .g-sw .disp.mine{color:var(--pc)}
      .g-sw .res{font-weight:800;white-space:nowrap;color:var(--muted);min-height:1.2em}
      .g-sw .res.win{color:var(--ok)}
      .g-sw .stop{flex:none;border-radius:22px;background:var(--pc);color:#111;font-weight:900;display:flex;align-items:center;
        justify-content:center;letter-spacing:2px;box-shadow:inset 0 -7px 0 rgba(0,0,0,.2);transition:opacity .15s}
      .g-sw .stop.off{opacity:.3}
      .g-sw .stop.done{background:#2a3150;color:var(--pc);box-shadow:0 0 0 3px var(--pc) inset}
      .g-sw .stop.hit{animation:swHit .16s ease-out}
      .g-sw .sz.won .inf{box-shadow:0 0 0 4px var(--ok) inset}
      @keyframes swHit{0%{transform:scale(.92)}100%{transform:scale(1)}}
    `));

    const { g } = ctx.canvas();

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

    // Which bottom corner of zone z (in the player's own view) sits under the exit button, if any.
    function exitCorner(z) {
      const r = z.rect;
      for (const [name, lx] of [['left', 0], ['right', z.w]]) {
        const v = ctx.toScreen(z.i, lx - z.w / 2, z.h / 2);
        if (r.x + r.w / 2 + v.x < 70 && r.y + r.h / 2 + v.y < 70) return name;
      }
      return null;
    }

    function layout() {
      for (const zb of zones) {
        const w = zb.z.w - 24, h = zb.z.h - 22;
        const row = w / h > 1.7;
        zb.z.el.classList.toggle('row', row);
        zb.z.el.classList.toggle('col', !row);
        // keep the STOP button away from the exit button
        zb.z.el.style.flexDirection = row && exitCorner(zb.z) === 'right' ? 'row-reverse' : '';
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
        const small = Math.round(U.clamp(Math.min(infH * 0.15, infW / 16), 13, 22));
        zb.tg.parentNode.style.fontSize = small + 'px';
        zb.res.style.fontSize = small + 'px';
        zb.disp.style.fontSize = Math.round(U.clamp(Math.min(infH * 0.42, infW / 5.2), 22, 72)) + 'px';
      }
    }
    layout();
    ctx.onResize(layout);

    const fmt = (s) => s.toFixed(2);
    function renderInfo() {
      zones.forEach((zb, i) => {
        zb.tg.innerHTML = '';
        zb.tg.append('Цель ', U.h('b', null, fmt(target) + ' с'));
        zb.sc.textContent = `· раунд ${Math.max(1, round)}/${ROUNDS} · очки ${score[i]}`;
      });
    }

    function elapsed() {
      // game time at the last frame plus real time since then (finer than one frame)
      return frameGT - t0 + (ctx.paused ? 0 : Math.min(0.05, (performance.now() - frameT) / 1000));
    }

    function newRound() {
      round++;
      do { target = U.pick(TARGETS); } while (target === lastTarget);
      lastTarget = target;
      times = ctx.players.map(() => null);
      state = 'count';
      count = 3;
      renderInfo();
      zones.forEach(zb => {
        zb.z.el.classList.remove('won');
        zb.disp.className = 'disp';
        zb.disp.textContent = fmt(target);
        zb.res.className = 'res';
        zb.res.textContent = 'приготовься…';
        zb.stop.className = 'stop off';
        zb.stop.textContent = 'СТОП';
      });
      const step = () => {
        if (count > 0) {
          zones.forEach(zb => { zb.disp.textContent = String(count); zb.res.textContent = 'старт через…'; });
          count--;
          ctx.after(650, step);
        } else go();
      };
      ctx.after(1100, step);
    }

    function go() {
      state = 'run';
      t0 = ctx.time;
      frameGT = ctx.time; frameT = performance.now();
      zones.forEach(zb => {
        zb.stop.className = 'stop';
        zb.res.textContent = 'считай про себя!';
      });
    }

    function press(i) {
      const zb = zones[i];
      if (state === 'count') {
        zb.res.textContent = 'ещё рано!';
        return;
      }
      if (state !== 'run' || times[i] != null) return;
      times[i] = elapsed();
      zb.stop.classList.remove('hit'); void zb.stop.offsetWidth; zb.stop.classList.add('hit');
      zb.stop.classList.add('done');
      zb.stop.textContent = '✓';
      zb.disp.className = 'disp mine';
      zb.disp.textContent = 'стоп!';
      zb.res.textContent = times.every(t => t != null) ? '' : 'ждём остальных…';
      if (times.every(t => t != null)) finish();
    }

    function finish() {
      state = 'show';
      const diffs = times.map(t => t == null ? Infinity : Math.abs(t - target));
      const best = Math.min(...diffs);
      const winners = best === Infinity ? [] : diffs.map((d, i) => d - best < 0.005 ? i : -1).filter(i => i >= 0);
      winners.forEach(i => score[i]++);
      renderInfo();
      zones.forEach((zb, i) => {
        zb.stop.className = 'stop off';
        zb.stop.textContent = 'СТОП';
        zb.disp.className = 'disp mine';
        if (times[i] == null) {
          zb.disp.textContent = '—';
          zb.res.textContent = 'не нажал';
        } else {
          zb.disp.textContent = fmt(times[i]) + ' с';
          const d = times[i] - target;
          zb.res.textContent = (d >= 0 ? '+' : '−') + fmt(Math.abs(d)) + ' с' + (winners.includes(i) ? '  +1 🏆' : '');
        }
        if (winners.includes(i)) { zb.res.className = 'res win'; zb.z.el.classList.add('won'); }
      });
      if (winners.length) {
        const txt = winners.length === 1 ? `+1 ${ctx.players[winners[0]].name}` : '+1 ' + winners.map(i => ctx.players[i].name).join(' и ');
        say(txt, { color: winners.length === 1 ? ctx.players[winners[0]].color : undefined, fg: winners.length === 1 ? '#111' : undefined, ms: 1500 });
      } else {
        say('Никто не нажал', { ms: 1500 });
      }
      if (round >= ROUNDS) {
        state = 'done';
        const max = Math.max(...score);
        const ws = score.map((s, i) => s === max ? i : -1).filter(i => i >= 0);
        ctx.after(2600, () => ctx.end({ winners: ws, scores: score.slice() }));
      } else {
        ctx.after(3000, newRound);
      }
    }

    ctx.loop((dt, t) => {
      if (dt > 0) { frameT = t; frameGT = ctx.time; }
      if (state === 'run') {
        const e = ctx.time - t0;
        const shown = e < SHOW;
        zones.forEach((zb, i) => {
          if (times[i] != null) return;
          zb.disp.className = shown ? 'disp' : 'disp hid';
          zb.disp.textContent = shown ? fmt(e) : '???';
        });
        if (dt > 0 && e > target + GRACE) finish();
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
      g.save();
      g.translate(cx, cy);
      // dial
      g.fillStyle = '#1b2038';
      g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
      g.lineWidth = Math.max(4, R * 0.06);
      g.strokeStyle = '#3a4270';
      g.stroke();
      // ticks
      for (let k = 0; k < SPAN; k++) {
        const a = -Math.PI / 2 + k / SPAN * Math.PI * 2;
        g.strokeStyle = 'rgba(255,255,255,.35)';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78);
        g.lineTo(Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9);
        g.stroke();
      }
      // target marker
      if (state !== 'idle') {
        const a = -Math.PI / 2 + target / SPAN * Math.PI * 2;
        g.strokeStyle = '#3ddc97';
        g.lineWidth = Math.max(6, R * 0.08);
        g.lineCap = 'round';
        g.beginPath(); g.arc(0, 0, R * 0.95, a - 0.06, a + 0.06); g.stroke();
      }
      const e = state === 'run' ? ctx.time - t0 : 0;
      if (state === 'run' && e >= SHOW) {
        // hidden: fog over the dial
        g.fillStyle = `rgba(15,18,32,${0.75 + 0.1 * Math.sin(T * 3)})`;
        g.beginPath(); g.arc(0, 0, R * 0.88, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.12)';
        g.lineWidth = 2;
        for (let k = -3; k <= 3; k++) {
          g.beginPath(); g.arc(0, 0, R * (0.3 + 0.08 * (k + 3)), T * (k % 2 ? 1.2 : -0.9), T * (k % 2 ? 1.2 : -0.9) + 1.6); g.stroke();
        }
      } else {
        // hand
        const a = -Math.PI / 2 + (state === 'show' || state === 'done' ? 0 : e / SPAN) * Math.PI * 2;
        g.strokeStyle = '#fff';
        g.lineWidth = Math.max(4, R * 0.05);
        g.lineCap = 'round';
        g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8); g.stroke();
      }
      // stopped markers after reveal
      if (state === 'show' || state === 'done') {
        times.forEach((tt, i) => {
          if (tt == null) return;
          const a = -Math.PI / 2 + Math.min(tt, SPAN) / SPAN * Math.PI * 2;
          g.fillStyle = ctx.players[i].color;
          g.beginPath(); g.arc(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66, Math.max(7, R * 0.07), 0, Math.PI * 2); g.fill();
        });
      }
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(0, 0, Math.max(6, R * 0.06), 0, Math.PI * 2); g.fill();
      // crown button
      g.fillStyle = '#3a4270';
      g.fillRect(-R * 0.1, -R * 1.17, R * 0.2, R * 0.14);
      g.restore();
    }

    renderInfo();
    zones.forEach(zb => { zb.disp.textContent = '—'; zb.res.textContent = 'приготовься…'; });
    ctx.after(0, newRound);
  },
});
