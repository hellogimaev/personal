registerGame({
  id: 'catch',
  title: 'Лови фрукты',
  emoji: '🍎',
  desc: 'Лови фрукты корзиной, уворачивайся от бомб',
  rules: 'Из центра вылетают фрукты и летят к игрокам.\nВодите пальцем по своей полосе у края: корзина едет за пальцем.\nФрукт +1, звезда ⭐ +3, бомба 💣 −3.\nРаунд 60 секунд, к концу всё быстрее и чаще.\nУ кого больше очков, тот победил.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const DUR = 60;
    const FRUITS = ['🍎', '🍌', '🍇', '🍓', '🍊', '🍐', '🍒', '🍉', '🍑', '🍍', '🥝', '🍋'];
    const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    const score = ctx.players.map(() => 0);
    let over = false;

    ctx.root.classList.add('g-catch');
    ctx.root.append(U.h('style', null, `
      .g-catch .cz{position:absolute;inset:0;display:flex;align-items:center;justify-content:space-between;
        padding:0 18px;border-top:4px solid var(--pc);pointer-events:none;gap:10px}
      .g-catch .cz.pad-r{padding-right:64px}
      .g-catch .cz.pad-l{padding-left:64px}
      .g-catch .cz .sc{display:flex;flex-direction:column;align-items:center;min-width:70px;line-height:1}
      .g-catch .cz .sc b{font-size:46px;font-weight:900;color:var(--pc);font-variant-numeric:tabular-nums}
      .g-catch .cz .sc span{font-size:14px;color:var(--muted);margin-top:4px;font-weight:700}
      .g-catch .cz .hint{font-size:16px;color:var(--muted);opacity:.7;font-weight:700;white-space:nowrap;overflow:hidden}
      .g-catch .cz .tm{font-size:28px;font-weight:900;font-variant-numeric:tabular-nums;min-width:70px;text-align:center}
      .g-catch .cz .tm.low{color:#ff4d6d}
      .g-catch .cz.shake{animation:gcShake .45s linear}
      @keyframes gcShake{0%,100%{transform:translateX(0)}15%{transform:translateX(-12px)}30%{transform:translateX(11px)}
        45%{transform:translateX(-9px)}60%{transform:translateX(7px)}75%{transform:translateX(-4px)}90%{transform:translateX(2px)}}
    `));

    const { g } = ctx.canvas();

    // paddle state: s = center position along the edge (screen px), null until laid out
    const pads = ctx.players.map(() => ({ s: null, target: null, shake: 0, flash: 0, flashColor: '#fff' }));

    const zones = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: 0.15 });
      const box = U.h('div', { class: 'cz' });
      if (ctx.n === 2 && p.side === 'top') box.classList.add('pad-r');
      if (ctx.n === 3 && p.side === 'left') box.classList.add('pad-l');
      z.el.style.background = `linear-gradient(to bottom, ${U.alpha(p.color, 0.22)}, ${U.alpha(p.color, 0.06)})`;
      const sc = U.h('b', null, '0');
      const tm = U.h('div', { class: 'tm' }, '1:00');
      const hint = U.h('div', { class: 'hint' }, '◀ води пальцем ▶');
      box.append(U.h('div', { class: 'sc' }, sc, U.h('span', null, 'очки')), hint, tm);
      z.el.append(box);
      const ids = new Set();
      const set = (x, y) => { pads[p.i].target = (p.side === 'bottom' || p.side === 'top') ? x : y; };
      ctx.pointer(z.outer, {
        down: (id, x, y) => { ids.add(id); set(x, y); },
        move: (id, x, y) => { if (ids.has(id)) set(x, y); },
        up: (id) => { ids.delete(id); },
      });
      return { z, box, sc, tm, hint };
    });

    /* ---------- geometry ---------- */
    // Free field = screen minus the player zones.
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
    // Catch line of player i: the inner edge of their zone.
    function line(i, F) {
      const side = ctx.players[i].side;
      if (side === 'bottom') return { s0: F.x0, s1: F.x1, pt: s => [s, F.y1] };
      if (side === 'top') return { s0: F.x0, s1: F.x1, pt: s => [s, F.y0] };
      if (side === 'left') return { s0: F.y0, s1: F.y1, pt: s => [F.x0, s] };
      return { s0: F.y0, s1: F.y1, pt: s => [F.x1, s] };
    }
    const padHalf = (L) => U.clamp((L.s1 - L.s0) * 0.11, 46, 100);
    const itemSize = () => U.clamp(Math.min(ctx.W, ctx.H) * 0.07, 40, 62);

    /* ---------- items ---------- */
    // Items are stored parametrically (fraction of flight), so they survive resize.
    let items = [];
    let floats = [];
    let bag = [], bagKind = 'fruit';
    let acc = 0.6;

    function nextPlayer() {
      if (!bag.length) {
        bag = U.shuffle(ctx.players.map(p => p.i));
        const r = Math.random();
        // same kind for everyone in a round -> fair share of stars and bombs
        bagKind = r < 0.17 ? 'bomb' : r < 0.25 ? 'star' : 'fruit';
      }
      return bag.pop();
    }

    function spawn(prog) {
      const p = nextPlayer();
      const kind = bagKind;
      items.push({
        p, kind,
        emoji: kind === 'bomb' ? '💣' : kind === 'star' ? '⭐' : U.pick(FRUITS),
        frac: U.rand(0.08, 0.92), // target position along the player's line
        ox: U.rand(-14, 14), oy: U.rand(-14, 14),
        T: U.lerp(2.5, 1.25, prog) * U.rand(0.92, 1.08),
        age: 0, state: 'fly', alpha: 1, ph: Math.random() * 6.28,
      });
    }

    function itemPos(it, F) {
      const L = line(it.p, F);
      const [tx, ty] = L.pt(L.s0 + it.frac * (L.s1 - L.s0));
      const ox = F.cx + it.ox, oy = F.cy + it.oy;
      const f = it.age / it.T;
      return { x: ox + (tx - ox) * f, y: oy + (ty - oy) * f, f, L, tx, ty, dist: Math.hypot(tx - ox, ty - oy) };
    }

    function addFloat(p, x, y, text, color) {
      floats.push({ p, x, y, text, color, life: 1 });
    }

    function resolve(it, pos) {
      const pad = pads[it.p];
      const L = pos.L;
      const s = L.s0 + it.frac * (L.s1 - L.s0);
      const hw = padHalf(L);
      const caught = pad.s != null && Math.abs(s - pad.s) <= hw + itemSize() * 0.35;
      if (!caught) { it.state = 'miss'; return; }
      it.state = 'done';
      const v = ctx.inward(it.p);
      const [bx, by] = L.pt(pad.s);
      const fx = bx + v.x * 50, fy = by + v.y * 50;
      if (it.kind === 'bomb') {
        score[it.p] -= 3;
        pad.shake = 0.45; pad.flash = 0.5; pad.flashColor = '#ff4d6d';
        addFloat(it.p, fx, fy, '💥 −3', '#ff4d6d');
        const box = zones[it.p].box;
        box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
      } else if (it.kind === 'star') {
        score[it.p] += 3;
        pad.flash = 0.5; pad.flashColor = '#ffd84a';
        addFloat(it.p, fx, fy, '+3', '#ffd84a');
      } else {
        score[it.p] += 1;
        pad.flash = 0.3; pad.flashColor = '#3ddc97';
        addFloat(it.p, fx, fy, '+1', '#3ddc97');
      }
      zones[it.p].sc.textContent = score[it.p];
    }

    function finish() {
      if (over) return;
      over = true;
      ctx.after(900, () => {
        const max = Math.max(...score);
        let winners = ctx.players.map(p => p.i).filter(i => score[i] === max);
        if (winners.length === ctx.n) winners = [];
        ctx.end({ winners, scores: score.slice() });
      });
    }

    let lastSec = -1, warned = false;

    /* ---------- loop ---------- */
    ctx.loop((dt, t) => {
      const W = ctx.W, H = ctx.H;
      const F = field();
      const remain = Math.max(0, DUR - ctx.time);
      const prog = U.clamp(ctx.time / DUR, 0, 1);

      // paddles follow finger instantly, clamped to their line
      ctx.players.forEach(p => {
        const L = line(p.i, F), hw = padHalf(L), pad = pads[p.i];
        if (pad.s == null) pad.s = (L.s0 + L.s1) / 2;
        if (pad.target != null) pad.s = pad.target;
        pad.s = U.clamp(pad.s, L.s0 + hw, L.s1 - hw);
        pad.shake = Math.max(0, pad.shake - dt);
        pad.flash = Math.max(0, pad.flash - dt);
      });

      if (!over && dt > 0) {
        acc -= dt;
        if (acc <= 0) {
          spawn(prog);
          // per-player interval 1.35s -> 0.5s, divided among players
          acc += U.lerp(1.35, 0.5, prog) / ctx.n * U.rand(0.7, 1.3);
        }
        if (remain <= 10 && !warned) { warned = true; ctx.toast('10 секунд!', { ms: 1000, offset: 120 }); }
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

      /* ----- draw ----- */
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#0f1220';
      g.fillRect(0, 0, W, H);

      // spawn portal + round timer ring
      const R = U.clamp(Math.min(W, H) * 0.06, 34, 54);
      g.beginPath(); g.arc(F.cx, F.cy, R, 0, Math.PI * 2);
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fill();
      g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,0.10)'; g.stroke();
      g.beginPath();
      g.arc(F.cx, F.cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (remain / DUR));
      g.strokeStyle = remain <= 10 ? '#ff4d6d' : 'rgba(255,255,255,0.65)';
      g.lineCap = 'round'; g.stroke(); g.lineCap = 'butt';

      // catch lines (track)
      ctx.players.forEach(p => {
        const L = line(p.i, F);
        const [ax, ay] = L.pt(L.s0), [bx, by] = L.pt(L.s1);
        g.strokeStyle = U.alpha(p.color, 0.35); g.lineWidth = 2;
        g.setLineDash([10, 10]);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
        g.setLineDash([]);
      });

      // items
      const sz = itemSize();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const it of items) {
        if (dt > 0) it.age += dt;
        const pos = itemPos(it, F);
        if (it.state === 'fly' && pos.f >= 1 - (sz * 0.45) / Math.max(1, pos.dist)) resolve(it, pos);
        if (it.state === 'miss') it.alpha = Math.max(0, it.alpha - dt * 2.2);
        if (it.state === 'done' || it.alpha <= 0 || pos.f > 1.6) { it.dead = true; continue; }
        const scale = U.lerp(0.5, 1, Math.min(1, pos.f));
        g.save();
        g.globalAlpha = it.alpha;
        ctx.facing(g, it.p, pos.x, pos.y);
        g.rotate(Math.sin(it.age * 4 + it.ph) * 0.22);
        const s = sz * scale;
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
      items = items.filter(it => !it.dead);

      // baskets
      ctx.players.forEach(p => {
        const L = line(p.i, F), hw = padHalf(L), pad = pads[p.i];
        const [x, y] = L.pt(pad.s);
        g.save();
        ctx.facing(g, p.i, x, y);
        if (pad.shake > 0) g.translate(Math.sin(t / 18) * 9 * (pad.shake / 0.45), 0);
        const hgt = 30;
        if (pad.flash > 0) {
          g.shadowColor = pad.flashColor; g.shadowBlur = 30 * (pad.flash / 0.5);
        }
        // bowl
        g.beginPath();
        g.moveTo(-hw, -hgt);
        g.lineTo(hw, -hgt);
        g.lineTo(hw * 0.82, -2);
        g.quadraticCurveTo(hw * 0.8, 0, hw * 0.76, 0);
        g.lineTo(-hw * 0.76, 0);
        g.quadraticCurveTo(-hw * 0.8, 0, -hw * 0.82, -2);
        g.closePath();
        g.fillStyle = p.color; g.fill();
        g.shadowBlur = 0;
        // weave
        g.save(); g.clip();
        g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 3;
        for (let k = -hw; k < hw; k += 14) { g.beginPath(); g.moveTo(k, -hgt); g.lineTo(k + 10, 0); g.stroke(); }
        g.beginPath(); g.moveTo(-hw, -hgt / 2); g.lineTo(hw, -hgt / 2); g.stroke();
        g.restore();
        // rim
        g.fillStyle = '#fff';
        g.beginPath();
        if (g.roundRect) g.roundRect(-hw - 4, -hgt - 6, hw * 2 + 8, 8, 4); else g.rect(-hw - 4, -hgt - 6, hw * 2 + 8, 8);
        g.fill();
        g.restore();
      });

      // floating score texts
      g.font = '900 30px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
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

    // hide the hint once the strip gets short
    const fit = () => zones.forEach(zz => { zz.hint.style.display = zz.z.w < 470 ? 'none' : ''; });
    fit();
    ctx.onResize(fit);
  },
});
