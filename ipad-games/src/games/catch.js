registerGame({
  id: 'catch',
  title: 'Лови фрукты',
  emoji: '🍎',
  desc: 'Лови фрукты и бонусы, уворачивайся от бомб',
  rules: 'Из центра вылетают фрукты и летят к игрокам. Водите пальцем по своей полосе: корзина едет за пальцем.\nФрукт +1, звезда ⭐ +3, бомба 💣 −3. 5 фруктов подряд: 🔥 серия +2.\nБонусы в пузырях:\n🧲 Магнит: фрукты сами летят в корзину, бомбы отталкиваются\n↔️ Широкая корзина  ✖️2 Двойные очки\n❄️ Заморозка: корзины соперников замерзают\n🌫️ Туман над полосами соперников\n🦹 Воришка: −2 очка лидеру, +2 тебе  🎁 Сюрприз\nСобытия: 🍉 фруктовый дождь, 🌠 звездопад, 🌀 вихрь, 💣 бомбы делятся. Последние 10 секунд всё ×2.\nОтстающему помогает 🆘 подмога. Раунд 60 секунд.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const DUR = 60;
    const n = ctx.n;
    const FRUITS = ['🍎', '🍌', '🍇', '🍓', '🍊', '🍐', '🍒', '🍉', '🍑', '🍍', '🥝', '🍋'];
    const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    const POWER = {
      magnet: { icon: '🧲', name: 'Магнит!', dur: 5, col: '#ff5a8a' },
      wide: { icon: '↔️', name: 'Широкая корзина!', dur: 7, col: '#3ddc97' },
      double: { icon: '✖️2', name: 'Двойные очки!', dur: 7, col: '#ffd84a' },
      freeze: { icon: '❄️', name: 'Заморозка соперников!', dur: 2.5, col: '#8fe3ff' },
      fog: { icon: '🌫️', name: 'Туман соперникам!', dur: 4, col: '#aab' },
      steal: { icon: '🦹', name: 'Воришка!', dur: 0, col: '#c58bff' },
      mystery: { icon: '🎁', name: 'Сюрприз', dur: 0, col: '#ff8c42' },
    };
    const EVENTS = [
      { id: 'rain', text: '🍉 Фруктовый дождь!', dur: 3.5 },
      { id: 'stars', text: '🌠 Звездопад!', dur: 3 },
      { id: 'whirl', text: '🌀 Вихрь: фрукты петляют!', dur: 7 },
      { id: 'split', text: '💣 Бомбы делятся!', dur: 8 },
    ];
    const score = ctx.players.map(() => 0);
    const streak = ctx.players.map(() => 0);
    // effect timers per player (seconds left)
    const eff = ctx.players.map(() => ({ magnet: 0, wide: 0, double: 0, freeze: 0, fog: 0 }));
    let over = false;
    let event = null, eventLeft = 0, finalPhase = false;

    ctx.root.classList.add('g-catch');
    ctx.root.append(U.h('style', null, `
      .g-catch .cz{position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;
        padding:0 18px;border-top:4px solid var(--pc);pointer-events:none;gap:10px}
      .g-catch .cz .sc{display:flex;flex-direction:column;align-items:center;min-width:70px;line-height:1}
      .g-catch .cz .sc b{font-size:46px;font-weight:900;color:var(--pc);font-variant-numeric:tabular-nums}
      .g-catch .cz .sc span{font-size:14px;color:var(--muted);margin-top:4px;font-weight:700}
      .g-catch .cz .mid{flex:1;display:flex;justify-content:center;align-items:center;gap:8px;min-width:0;overflow:hidden}
      .g-catch .cz .hint{font-size:16px;color:var(--muted);opacity:.7;font-weight:700;white-space:nowrap}
      .g-catch .cz .bd{display:flex;align-items:center;gap:3px;background:rgba(255,255,255,.12);border-radius:12px;
        padding:4px 9px;font-weight:900;font-size:20px;white-space:nowrap;font-variant-numeric:tabular-nums}
      .g-catch .cz .bd.bad{background:rgba(143,227,255,.25)}
      .g-catch .cz .tm{font-size:28px;font-weight:900;font-variant-numeric:tabular-nums;min-width:70px;text-align:center}
      .g-catch .cz .tm.low{color:#ff4d6d}
      .g-catch .cz.shake{animation:gcShake .45s linear}
      @keyframes gcShake{0%,100%{transform:translateX(0)}15%{transform:translateX(-12px)}30%{transform:translateX(11px)}
        45%{transform:translateX(-9px)}60%{transform:translateX(7px)}75%{transform:translateX(-4px)}90%{transform:translateX(2px)}}
      .g-catch .say{position:absolute;left:50%;bottom:calc(100% + 64px);transform:translateX(-50%);background:rgba(0,0,0,.75);
        border:3px solid var(--sc,#fff);color:#fff;font-weight:900;font-size:24px;border-radius:16px;padding:8px 16px;
        white-space:nowrap;pointer-events:none;animation:gcSay .25s ease-out;z-index:3}
      @keyframes gcSay{from{transform:translateX(-50%) scale(.6);opacity:0}to{transform:translateX(-50%) scale(1);opacity:1}}
    `));

    const { g } = ctx.canvas();

    const pads = ctx.players.map(() => ({ s: null, target: null, shake: 0, flash: 0, flashColor: '#fff' }));

    const zones = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: 0.15 });
      const box = U.h('div', { class: 'cz' });
      z.el.style.background = `linear-gradient(to bottom, ${U.alpha(p.color, 0.22)}, ${U.alpha(p.color, 0.06)})`;
      const sc = U.h('b', null, '0');
      const tm = U.h('div', { class: 'tm' }, '1:00');
      const hint = U.h('div', { class: 'hint' }, '◀ води пальцем ▶');
      const mid = U.h('div', { class: 'mid' }, hint);
      box.append(U.h('div', { class: 'sc' }, sc, U.h('span', null, 'очки')), mid, tm);
      z.el.append(box);
      const ids = new Set();
      const set = (x, y) => { pads[p.i].target = (p.side === 'bottom' || p.side === 'top') ? x : y; };
      ctx.pointer(z.outer, {
        down: (id, x, y) => { ids.add(id); set(x, y); },
        move: (id, x, y) => { if (ids.has(id)) set(x, y); },
        up: (id) => { ids.delete(id); },
      });
      return { z, box, sc, tm, hint, mid, sayEl: null, badgeKey: '' };
    });

    // per-player announcement facing the player, just above their strip
    function say(i, text, color = '#fff', ms = 1400) {
      const zz = zones[i];
      if (zz.sayEl) zz.sayEl.remove();
      const el = U.h('div', { class: 'say', style: { '--sc': color } }, text);
      el.style.setProperty('--sc', color);
      zz.z.el.append(el);
      zz.sayEl = el;
      ctx.after(ms, () => { if (zz.sayEl === el) { el.remove(); zz.sayEl = null; } });
    }

    /* ---------- geometry ---------- */
    function field() {
      let x0 = 0, y0 = 0, x1 = ctx.W, y1 = ctx.H;
      ctx.players.forEach((p, i) => {
        const r = zones[i].z.rect;
        if (p.side === 'left') x0 = r.x + r.w;
        if (p.side === 'right') x1 = r.x;
        if (p.side === 'top') y0 = r.y + r.h;
        if (p.side === 'bottom') y1 = r.y;
      });
      return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
    }
    function line(i, F) {
      const side = ctx.players[i].side;
      if (side === 'bottom') return { s0: F.x0, s1: F.x1, pt: s => [s, F.y1] };
      if (side === 'top') return { s0: F.x0, s1: F.x1, pt: s => [s, F.y0] };
      if (side === 'left') return { s0: F.y0, s1: F.y1, pt: s => [F.x0, s] };
      return { s0: F.y0, s1: F.y1, pt: s => [F.x1, s] };
    }
    const padHalf = (i, L) => U.clamp((L.s1 - L.s0) * 0.11, 46, 100) * (eff[i].wide > 0 ? 1.7 : 1);
    const itemSize = () => U.clamp(Math.min(ctx.W, ctx.H) * 0.07, 40, 62);

    /* ---------- items ---------- */
    let items = [], floats = [], parts = [];
    let bag = [], bagKind = 'fruit';
    let acc = 0.6, powerAcc = 4;

    function nextPlayer() {
      if (!bag.length) {
        bag = U.shuffle(ctx.players.map(p => p.i));
        const r = Math.random();
        // same kind for everyone in a round -> fair share of stars and bombs
        bagKind = r < 0.17 ? 'bomb' : r < 0.25 ? 'star' : 'fruit';
        if (event && event.id === 'rain') bagKind = 'fruit';
        if (event && event.id === 'stars') bagKind = Math.random() < 0.75 ? 'star' : 'fruit';
      }
      return bag.pop();
    }

    function spawn(prog, p = nextPlayer(), kind = bagKind, power = null) {
      const it = {
        p, kind, power,
        emoji: kind === 'bomb' ? '💣' : kind === 'star' ? '⭐' : kind === 'power' ? POWER[power].icon : U.pick(FRUITS),
        frac: U.rand(0.08, 0.92),
        ox: U.rand(-14, 14), oy: U.rand(-14, 14),
        T: U.lerp(2.5, 1.25, prog) * U.rand(0.92, 1.08) * (kind === 'power' ? 1.15 : 1),
        age: 0, state: 'fly', alpha: 1, ph: Math.random() * 6.28, split: false,
      };
      items.push(it);
      return it;
    }

    // power-ups go preferably to whoever is behind (comeback help)
    function spawnPower(prog) {
      const max = Math.max(...score);
      const w = ctx.players.map(p => 1 + Math.max(0, max - score[p.i]) * 0.35);
      let r = Math.random() * w.reduce((a, b) => a + b, 0), p = 0;
      for (; p < n - 1; p++) { r -= w[p]; if (r <= 0) break; }
      const kinds = ['magnet', 'wide', 'double', 'freeze', 'fog', 'steal', 'mystery'];
      spawn(prog, p, 'power', U.pick(kinds));
    }

    function itemPos(it, F) {
      const L = line(it.p, F);
      const [tx, ty] = L.pt(L.s0 + it.frac * (L.s1 - L.s0));
      const ox = F.cx + it.ox, oy = F.cy + it.oy;
      const f = it.age / it.T;
      let x = ox + (tx - ox) * f, y = oy + (ty - oy) * f;
      if (it.whirl) {
        // sideways loops that vanish at the catch line
        const v = ctx.inward(it.p), side = { x: -v.y, y: v.x };
        const a = Math.sin(it.age * 5 + it.ph) * Math.max(0, f * (1 - f)) * 4 * 70;
        x += side.x * a; y += side.y * a;
      }
      return { x, y, f, L, dist: Math.hypot(tx - ox, ty - oy) };
    }

    function addFloat(p, x, y, text, color) { floats.push({ p, x, y, text, color, life: 1 }); }
    function burst(x, y, color, count, speed = 300) {
      for (let k = 0; k < count; k++) {
        const a = Math.random() * 6.283, sp = U.rand(speed * 0.3, speed);
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: color, r: U.rand(2.5, 6) });
      }
    }

    function updateScore(i) { zones[i].sc.textContent = score[i]; }

    const gen = (name) => name.replace(/ый$/, 'ого').replace(/ий$/, 'его');
    const ochk = (k) => k === 1 ? 'очко' : k >= 2 && k <= 4 ? 'очка' : 'очков';
    function applyPower(i, kind, px, py) {
      const P = POWER[kind];
      if (kind === 'mystery') {
        const k = U.pick(['magnet', 'wide', 'double', 'freeze', 'fog', 'steal']);
        say(i, `🎁 → ${POWER[k].icon} ${POWER[k].name}`, POWER[k].col);
        return applyPower(i, k, px, py, true);
      }
      burst(px, py, P.col, 30, 380);
      if (kind === 'steal') {
        // take from the leader among the others
        const others = ctx.players.map(p => p.i).filter(k => k !== i);
        const victim = others.reduce((a, b) => score[b] > score[a] ? b : a, others[0]);
        const amt = Math.min(2, Math.max(0, score[victim]));
        score[victim] -= amt; score[i] += amt;
        updateScore(i); updateScore(victim);
        if (arguments.length < 5) say(i, `🦹 Украл ${amt} ${ochk(amt)} у ${gen(ctx.players[victim].name)}!`, P.col);
        say(victim, `🦹 ${ctx.players[i].name} украл ${amt} ${ochk(amt)}!`, '#ff4d6d');
        return;
      }
      if (kind === 'freeze' || kind === 'fog') {
        ctx.players.forEach(p => {
          if (p.i === i) return;
          eff[p.i][kind] = Math.max(eff[p.i][kind], P.dur);
          say(p.i, kind === 'freeze' ? `❄️ Корзина заморожена!` : `🌫️ Туман от ${gen(ctx.players[i].name)}!`, P.col);
        });
        if (arguments.length < 5) say(i, `${P.icon} ${P.name}`, P.col);
        return;
      }
      eff[i][kind] = P.dur;
      if (arguments.length < 5) say(i, `${P.icon} ${P.name}`, P.col);
    }

    function resolve(it, pos) {
      const i = it.p, pad = pads[i], L = pos.L;
      const s = L.s0 + it.frac * (L.s1 - L.s0);
      const hw = padHalf(i, L);
      const caught = pad.s != null && Math.abs(s - pad.s) <= hw + itemSize() * 0.35;
      if (!caught) {
        it.state = 'miss';
        if (it.kind === 'fruit' || it.kind === 'star') streak[i] = 0;
        return;
      }
      it.state = 'done';
      const v = ctx.inward(i);
      const [bx, by] = L.pt(pad.s);
      const fx = bx + v.x * 50, fy = by + v.y * 50;
      const mul = (eff[i].double > 0 ? 2 : 1) * (finalPhase ? 2 : 1);
      if (it.kind === 'bomb') {
        score[i] -= 3;
        streak[i] = 0;
        pad.shake = 0.45; pad.flash = 0.5; pad.flashColor = '#ff4d6d';
        addFloat(i, fx, fy, '💥 −3', '#ff4d6d');
        burst(bx + v.x * 20, by + v.y * 20, '#ff8c42', 26, 420);
        burst(bx + v.x * 20, by + v.y * 20, '#ff4d6d', 14, 300);
        const box = zones[i].box;
        box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
      } else if (it.kind === 'power') {
        pad.flash = 0.6; pad.flashColor = POWER[it.power].col;
        applyPower(i, it.power, bx + v.x * 20, by + v.y * 20);
      } else {
        const base = it.kind === 'star' ? 3 : 1;
        score[i] += base * mul;
        pad.flash = 0.35; pad.flashColor = it.kind === 'star' ? '#ffd84a' : '#3ddc97';
        addFloat(i, fx, fy, `+${base * mul}`, it.kind === 'star' ? '#ffd84a' : '#3ddc97');
        burst(bx + v.x * 20, by + v.y * 20, it.kind === 'star' ? '#ffd84a' : ctx.players[i].color, it.kind === 'star' ? 22 : 10, 260);
        streak[i]++;
        if (streak[i] >= 5) {
          streak[i] = 0;
          score[i] += 2;
          say(i, '🔥 Серия! +2', '#ff8c42');
          burst(bx + v.x * 20, by + v.y * 20, '#ff8c42', 30, 420);
        }
      }
      updateScore(i);
    }

    function startEvent(ev) {
      event = ev; eventLeft = ev.dur;
      ctx.toast(ev.text, { ms: 1600, color: '#283057' });
      if (ev.id === 'rain' || ev.id === 'stars') bag = [];
    }
    // three random events at fixed moments, then the final double phase
    const evOrder = U.shuffle(EVENTS).slice(0, 3);
    [13, 27, 41].forEach((t, k) => ctx.after(t * 1000, () => { if (!over) startEvent(evOrder[k]); }));
    ctx.after(50 * 1000, () => {
      finalPhase = true;
      ctx.toast('🔥 Финал: все очки ×2!', { ms: 1700, color: '#ff8c42', fg: '#111' });
    });
    // comeback help every 10s for a player far behind
    ctx.every(10000, () => {
      if (over || ctx.time > 52) return;
      const max = Math.max(...score), min = Math.min(...score);
      if (max - min < 6) return;
      const i = score.indexOf(min);
      eff[i].wide = Math.max(eff[i].wide, 6);
      say(i, '🆘 Подмога: широкая корзина!', '#3ddc97', 1800);
    });

    function finish() {
      if (over) return;
      over = true;
      ctx.after(900, () => {
        const max = Math.max(...score);
        let winners = ctx.players.map(p => p.i).filter(i => score[i] === max);
        if (winners.length === n) winners = [];
        ctx.end({ winners, scores: score.slice() });
      });
    }

    let lastSec = -1, warned = false;

    function drawFog(i, F, t) {
      const L = line(i, F), v = ctx.inward(i);
      const len = L.s1 - L.s0;
      const depth = (ctx.players[i].side === 'bottom' || ctx.players[i].side === 'top') ? (F.y1 - F.y0) / 2 : (F.x1 - F.x0) / 2;
      const a = Math.min(1, eff[i].fog * 2);
      for (let k = 0; k < 9; k++) {
        const s = L.s0 + len * (k + 0.5) / 9 + Math.sin(t / 700 + k) * 20;
        const [x, y] = L.pt(s);
        for (let j = 0; j < 2; j++) {
          const d = depth * (0.22 + j * 0.3) + Math.cos(t / 500 + k * 2) * 12;
          const cx = x + v.x * d, cy = y + v.y * d;
          const r = len / 9 * 1.3 + depth * 0.16;
          const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
          grd.addColorStop(0, `rgba(120,128,160,${0.95 * a})`);
          grd.addColorStop(0.6, `rgba(90,96,130,${0.8 * a})`);
          grd.addColorStop(1, 'rgba(60,64,90,0)');
          g.fillStyle = grd;
          g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.fill();
        }
      }
    }

    function updateBadges() {
      zones.forEach((zz, i) => {
        const e = eff[i];
        const list = [];
        for (const k of ['magnet', 'wide', 'double', 'freeze', 'fog']) if (e[k] > 0) list.push([k, Math.ceil(e[k])]);
        if (streak[i] >= 2) list.push(['streak', streak[i]]);
        const key = list.map(x => x.join(':')).join(',');
        if (key === zz.badgeKey) return;
        zz.badgeKey = key;
        if (!list.length) { zz.mid.replaceChildren(zz.hint); return; }
        zz.mid.replaceChildren(...list.map(([k, v]) => {
          if (k === 'streak') return U.h('span', { class: 'bd' }, '🔥', `${v}/5`);
          return U.h('span', { class: 'bd' + (k === 'freeze' || k === 'fog' ? ' bad' : '') }, POWER[k].icon, String(v));
        }));
      });
    }

    /* ---------- loop ---------- */
    ctx.loop((dt, t) => {
      const W = ctx.W, H = ctx.H;
      const F = field();
      const remain = Math.max(0, DUR - ctx.time);
      const prog = U.clamp(ctx.time / DUR, 0, 1);

      ctx.players.forEach(p => {
        const L = line(p.i, F), hw = padHalf(p.i, L), pad = pads[p.i];
        if (pad.s == null) pad.s = (L.s0 + L.s1) / 2;
        if (pad.target != null && eff[p.i].freeze <= 0) pad.s = pad.target;
        pad.s = U.clamp(pad.s, L.s0 + hw, L.s1 - hw);
        pad.shake = Math.max(0, pad.shake - dt);
        pad.flash = Math.max(0, pad.flash - dt);
        for (const k in eff[p.i]) eff[p.i][k] = Math.max(0, eff[p.i][k] - dt);
      });
      if (dt > 0 && event) { eventLeft -= dt; if (eventLeft <= 0) event = null; }

      if (!over && dt > 0) {
        acc -= dt;
        if (acc <= 0) {
          const it = spawn(prog);
          if (event && event.id === 'whirl') it.whirl = true;
          let gap = U.lerp(1.35, 0.5, prog) / n * U.rand(0.7, 1.3);
          if (event && (event.id === 'rain' || event.id === 'stars')) gap *= 0.3;
          acc += gap;
        }
        powerAcc -= dt;
        if (powerAcc <= 0 && remain > 3) { spawnPower(prog); powerAcc = U.rand(4.5, 7) / Math.sqrt(n / 2); }
        if (remain <= 10 && !warned) { warned = true; }
        if (remain <= 0) finish();
      }

      const sec = Math.ceil(remain);
      if (sec !== lastSec) {
        lastSec = sec;
        zones.forEach(zz => {
          zz.tm.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
          zz.tm.classList.toggle('low', sec <= 10);
        });
      }
      updateBadges();

      /* ----- draw ----- */
      g.clearRect(0, 0, W, H);
      g.fillStyle = finalPhase ? '#1a1224' : '#0f1220';
      g.fillRect(0, 0, W, H);

      // spawn portal + round timer ring
      const R = U.clamp(Math.min(W, H) * 0.06, 34, 54);
      g.beginPath(); g.arc(F.cx, F.cy, R, 0, Math.PI * 2);
      g.fillStyle = event ? 'rgba(255,200,120,0.12)' : 'rgba(255,255,255,0.05)'; g.fill();
      g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.10)'; g.stroke();
      g.beginPath();
      g.arc(F.cx, F.cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (remain / DUR));
      g.strokeStyle = remain <= 10 ? '#ff4d6d' : 'rgba(255,255,255,0.65)';
      g.lineCap = 'round'; g.stroke(); g.lineCap = 'butt';
      if (event) {
        g.save(); g.translate(F.cx, F.cy); g.rotate(t / 300);
        g.strokeStyle = 'rgba(255,200,120,0.6)'; g.lineWidth = 3; g.setLineDash([8, 10]);
        g.beginPath(); g.arc(0, 0, R + 12, 0, 6.283); g.stroke(); g.setLineDash([]);
        g.restore();
      }

      // catch lines (track)
      ctx.players.forEach(p => {
        const L = line(p.i, F);
        const [ax, ay] = L.pt(L.s0), [bx, by] = L.pt(L.s1);
        g.strokeStyle = U.alpha(p.color, 0.35); g.lineWidth = 2;
        g.setLineDash([10, 10]);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        g.setLineDash([]);
      });

      // magnets pull fruit (and push bombs) along the line
      if (dt > 0) for (const it of items) {
        if (it.state !== 'fly' || eff[it.p].magnet <= 0) continue;
        const L = line(it.p, F), len = L.s1 - L.s0;
        const pf = (pads[it.p].s - L.s0) / len;
        const f = it.age / it.T;
        if (it.kind === 'bomb') it.frac += Math.sign(it.frac - pf || 1) * dt * 0.25 * f;
        else it.frac += (pf - it.frac) * Math.min(1, dt * 4 * f);
        it.frac = U.clamp(it.frac, 0.02, 0.98);
      }

      // items
      const sz = itemSize();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const born = [];
      for (const it of items) {
        if (dt > 0) it.age += dt;
        const pos = itemPos(it, F);
        if (event && event.id === 'split' && it.kind === 'bomb' && !it.split && pos.f > 0.42 && it.state === 'fly') {
          it.split = true;
          const twin = Object.assign({}, it, { frac: U.clamp(it.frac + (it.frac > 0.5 ? -0.22 : 0.22), 0.05, 0.95) });
          born.push(twin);
          burst(pos.x, pos.y, '#ff8c42', 12, 200);
        }
        if (it.state === 'fly' && pos.f >= 1 - (sz * 0.45) / Math.max(1, pos.dist)) resolve(it, pos);
        if (it.state === 'miss') it.alpha = Math.max(0, it.alpha - dt * 2.2);
        if (it.state === 'done' || it.alpha <= 0 || pos.f > 1.6) { it.dead = true; continue; }
        const scale = U.lerp(0.5, 1, Math.min(1, pos.f)) * (it.kind === 'power' ? 1.05 : 1);
        g.save();
        g.globalAlpha = it.alpha;
        ctx.facing(g, it.p, pos.x, pos.y);
        const s = sz * scale;
        if (it.kind === 'power') {
          // rainbow bubble
          const col = POWER[it.power].col;
          g.beginPath(); g.arc(0, 0, s * 0.72, 0, 6.283);
          g.fillStyle = U.alpha(col, 0.25); g.fill();
          g.lineWidth = 4; g.strokeStyle = `hsl(${(t / 4) % 360},90%,65%)`; g.stroke();
          g.shadowColor = col; g.shadowBlur = 18;
          if (it.power === 'double') {
            g.font = `900 ${Math.round(s * 0.55)}px ${FONT}`; g.fillStyle = '#ffd84a'; g.fillText('×2', 0, 2);
          } else {
            g.font = `${Math.round(s * 0.7)}px ${EMOJI_FONT}`; g.fillStyle = '#fff'; g.fillText(it.emoji, 0, s * 0.04);
          }
          g.restore();
          continue;
        }
        g.rotate(Math.sin(it.age * 4 + it.ph) * 0.22);
        if (it.kind === 'bomb' || it.kind === 'star') {
          const grd = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.85);
          grd.addColorStop(0, it.kind === 'bomb' ? 'rgba(255,60,80,0.55)' : 'rgba(255,220,80,0.6)');
          grd.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = grd; g.beginPath(); g.arc(0, 0, s * 0.85, 0, Math.PI * 2); g.fill();
        }
        g.font = `${Math.round(s)}px ${EMOJI_FONT}`;
        g.fillStyle = '#fff';
        g.fillText(it.emoji, 0, s * 0.05);
        g.restore();
      }
      items = items.filter(it => !it.dead).concat(born);

      // fog over players hit by it
      ctx.players.forEach(p => { if (eff[p.i].fog > 0) drawFog(p.i, F, t); });

      // baskets
      ctx.players.forEach(p => {
        const L = line(p.i, F), hw = padHalf(p.i, L), pad = pads[p.i], e = eff[p.i];
        const [x, y] = L.pt(pad.s);
        g.save();
        ctx.facing(g, p.i, x, y);
        if (pad.shake > 0) g.translate(Math.sin(t / 18) * 9 * (pad.shake / 0.45), 0);
        const hgt = 30;
        if (e.magnet > 0) {
          // magnetic field arcs
          g.strokeStyle = `rgba(255,90,138,${0.35 + 0.25 * Math.sin(t / 90)})`; g.lineWidth = 3;
          for (let k = 1; k <= 3; k++) {
            const rr = hw * 0.6 + k * 22 + ((t / 12) % 22);
            g.beginPath(); g.arc(0, 0, rr, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
          }
        }
        if (pad.flash > 0) { g.shadowColor = pad.flashColor; g.shadowBlur = 30 * (pad.flash / 0.5); }
        else if (e.double > 0) { g.shadowColor = '#ffd84a'; g.shadowBlur = 16 + 8 * Math.sin(t / 120); }
        g.beginPath();
        g.moveTo(-hw, -hgt);
        g.lineTo(hw, -hgt);
        g.lineTo(hw * 0.82, -2);
        g.quadraticCurveTo(hw * 0.8, 0, hw * 0.76, 0);
        g.lineTo(-hw * 0.76, 0);
        g.quadraticCurveTo(-hw * 0.8, 0, -hw * 0.82, -2);
        g.closePath();
        g.fillStyle = e.freeze > 0 ? '#9fdcff' : p.color; g.fill();
        g.shadowBlur = 0;
        g.save(); g.clip();
        g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 3;
        for (let k = -hw; k < hw; k += 14) { g.beginPath(); g.moveTo(k, -hgt); g.lineTo(k + 10, 0); g.stroke(); }
        g.beginPath(); g.moveTo(-hw, -hgt / 2); g.lineTo(hw, -hgt / 2); g.stroke();
        g.restore();
        g.fillStyle = e.double > 0 ? '#ffd84a' : '#fff';
        g.beginPath();
        if (g.roundRect) g.roundRect(-hw - 4, -hgt - 6, hw * 2 + 8, 8, 4); else g.rect(-hw - 4, -hgt - 6, hw * 2 + 8, 8);
        g.fill();
        if (e.freeze > 0) {
          g.font = `26px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('❄️', -hw * 0.5, -hgt / 2); g.fillText('❄️', hw * 0.5, -hgt / 2);
          g.strokeStyle = 'rgba(220,245,255,0.9)'; g.lineWidth = 3;
          g.strokeRect(-hw - 6, -hgt - 8, hw * 2 + 12, hgt + 10);
        }
        g.restore();
      });

      // particles
      for (const q of parts) {
        if (dt > 0) { q.life -= dt * 1.6; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.95; q.vy *= 0.95; }
        if (q.life <= 0) continue;
        g.globalAlpha = Math.min(1, q.life * 1.5);
        g.fillStyle = q.c;
        g.beginPath(); g.arc(q.x, q.y, q.r, 0, 6.283); g.fill();
      }
      g.globalAlpha = 1;
      parts = parts.filter(q => q.life > 0);

      // floating score texts
      g.font = `900 30px ${FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const f of floats) {
        if (dt > 0) f.life -= dt * 1.3;
        if (f.life <= 0) continue;
        const v = ctx.inward(f.p), k = (1 - f.life) * 50;
        g.save();
        g.globalAlpha = Math.min(1, f.life * 1.5);
        ctx.facing(g, f.p, f.x + v.x * k, f.y + v.y * k);
        g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,0.6)';
        g.strokeText(f.text, 0, 0);
        g.fillStyle = f.color; g.fillText(f.text, 0, 0);
        g.restore();
      }
      floats = floats.filter(f => f.life > 0);
    });

    const fit = () => zones.forEach(zz => { zz.hint.style.display = zz.z.w < 470 ? 'none' : ''; });
    fit();
    ctx.onResize(fit);
  },
});
