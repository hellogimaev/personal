registerGame({
  id: 'connect',
  title: '4 в ряд',
  emoji: '🔴',
  desc: 'Собери четыре фишки в линию',
  rules: 'Ходите по очереди: чей ход, у того светится край экрана.\nНажми на любой столбец: фишка упадёт вниз экрана.\nСобери 4 своих фишки подряд по горизонтали, вертикали или диагонали.\nДля двоих поле 7×6, для троих 9×7.',
  start(ctx) {
    const C = ctx.n === 2 ? 7 : 9;
    const R = ctx.n === 2 ? 6 : 7;
    const grid = Array.from({ length: R }, () => Array(C).fill(-1)); // grid[row][col], row 0 = top
    let turn = U.randInt(0, ctx.n - 1);
    let drop = null;      // {col, row, y, v, p, bounced}
    let winLine = null;   // [[r,c],...]
    let done = false;
    let flash = null;     // {col, t, bad}
    let geo = null;

    ctx.root.classList.add('g-connect');
    ctx.root.append(U.h('style', null, `
      .g-connect .zi{position:absolute;inset:6px;border-radius:18px;display:flex;align-items:center;justify-content:center;
        padding:0 18px;gap:14px;background:#1a1f35;border:3px solid transparent;transition:background .25s,box-shadow .25s;font-weight:900}
      .g-connect .zi .dc{width:34px;height:34px;border-radius:50%;background:var(--pc);flex:0 0 auto;box-shadow:inset 0 -4px 0 rgba(0,0,0,.25)}
      .g-connect .zi .tx{font-size:24px;color:#9aa1c4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .g-connect .zi .tx b{color:var(--tc)}
      .g-connect .zi.on{background:var(--pc);border-color:#fff;box-shadow:0 0 30px 6px var(--pc)}
      .g-connect .zi.on .tx{color:#111;font-size:28px}
      .g-connect .zi.on .dc{background:#fff}
      .g-connect .zi.win{background:var(--pc);border-color:#fff}
      .g-connect .zi.win .tx{color:#111}
    `));

    /* ---------- zones ---------- */
    const exitEnd = (i) => {
      const side = ctx.players[i].side;
      if (side === 'top') return 'right';
      if (side === 'left') return 'left';
      return null;
    };
    const seats = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: 78 });
      const tx = U.h('div', { class: 'tx' });
      const inner = U.h('div', { class: 'zi' }, U.h('div', { class: 'dc' }), tx);
      const end = exitEnd(p.i);
      if (end === 'right') inner.style.right = '56px';
      if (end === 'left') inner.style.left = '56px';
      z.el.append(inner);
      return { z, inner, tx };
    });

    function render(winner) {
      seats.forEach((s, i) => {
        s.inner.style.setProperty('--tc', ctx.players[turn].color);
        s.inner.classList.toggle('on', !done && i === turn);
        s.inner.classList.toggle('win', winner === i);
        if (done) s.tx.textContent = winner == null ? 'Ничья' : winner === i ? 'Победа!' : `Победил ${ctx.players[winner].name}`;
        else if (i === turn) s.tx.textContent = 'Твой ход!';
        else s.tx.replaceChildren('Ход: ', U.h('b', null, ctx.players[turn].name));
      });
    }

    /* ---------- board geometry ---------- */
    const { cv, g } = ctx.canvas();
    function layout() {
      const W = ctx.W, H = ctx.H, d = seats[0].z.h;
      const r = ctx.n === 2 ? { x: 0, y: d, w: W, h: H - 2 * d } : { x: d, y: 0, w: W - 2 * d, h: H - d };
      const pad = 12;
      const cell = Math.min((r.w - 2 * pad) / C, (r.h - 2 * pad) / (R + 0.35));
      const bw = cell * C, bh = cell * R;
      const bx = r.x + (r.w - bw) / 2;
      const by = r.y + (r.h - bh) / 2 + cell * 0.17;
      geo = { r, cell, bx, by, bw, bh };
    }
    layout();
    ctx.onResize(layout);

    /* ---------- input ---------- */
    ctx.pointer(cv, {
      down(id, x, y) {
        if (ctx.paused || done || drop || !geo) return;
        const { r, bx, bw, cell } = geo;
        if (x < bx || x > bx + bw || y < r.y || y > r.y + r.h) return;
        const col = U.clamp(Math.floor((x - bx) / cell), 0, C - 1);
        let row = -1;
        for (let k = R - 1; k >= 0; k--) if (grid[k][col] < 0) { row = k; break; }
        if (row < 0) { flash = { col, t: 0.35, bad: true }; return; }
        flash = { col, t: 0.25, bad: false };
        drop = { col, row, y: -0.9, v: 0, p: turn, bounced: false };
      },
    });

    function land() {
      const { col, row, p } = drop;
      grid[row][col] = p;
      drop = null;
      const line = findLine(row, col, p);
      if (line) {
        done = true;
        winLine = line;
        render(p);
        ctx.toast(`${ctx.players[p].name}: 4 в ряд!`, { color: ctx.players[p].color, fg: '#111', ms: 1700 });
        ctx.after(1900, () => ctx.end({ winner: p }));
        return;
      }
      if (grid[0].every(v => v >= 0)) {
        done = true;
        render(null);
        ctx.toast('Поле заполнено', { ms: 1400 });
        ctx.after(1500, () => ctx.end({}));
        return;
      }
      turn = (turn + 1) % ctx.n;
      render();
    }

    function findLine(r0, c0, p) {
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const cells = [[r0, c0]];
        for (const s of [1, -1]) {
          let r = r0 + dr * s, c = c0 + dc * s;
          while (r >= 0 && r < R && c >= 0 && c < C && grid[r][c] === p) { cells.push([r, c]); r += dr * s; c += dc * s; }
        }
        if (cells.length >= 4) return cells;
      }
      return null;
    }

    /* ---------- drawing ---------- */
    const BG = '#0f1220';
    let pulse = 0;
    function disc(x, y, rad, color, alpha = 1) {
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,.18)';
      g.beginPath(); g.arc(x, y, rad * 0.62, 0, Math.PI * 2); g.fill();
      g.fillStyle = color;
      g.beginPath(); g.arc(x, y - rad * 0.06, rad * 0.56, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }

    ctx.loop((dt) => {
      if (!geo) return;
      pulse += dt;
      // physics of the falling disc (in cell units)
      if (drop && dt > 0) {
        const G = 38;
        drop.v += G * dt;
        drop.y += drop.v * dt;
        if (drop.y >= drop.row) {
          if (!drop.bounced && drop.v > 4) { drop.y = drop.row; drop.v = -drop.v * 0.28; drop.bounced = true; }
          else land();
        }
      }
      if (flash && dt > 0) { flash.t -= dt; if (flash.t <= 0) flash = null; }

      const { cell, bx, by, bw, bh, r } = geo;
      const rad = cell * 0.4;
      g.clearRect(0, 0, ctx.W, ctx.H);
      // column flash
      if (flash) {
        g.fillStyle = flash.bad ? 'rgba(255,77,109,.35)' : U.alpha(ctx.players[turn].color, 0.22);
        g.fillRect(bx + flash.col * cell, r.y, cell, r.h);
      }
      // holes background
      g.fillStyle = '#0a0d18';
      g.fillRect(bx, by, bw, bh);
      // landed discs
      const winSet = new Set((winLine || []).map(([a, b]) => a * 100 + b));
      for (let rr = 0; rr < R; rr++) for (let cc = 0; cc < C; cc++) {
        const p = grid[rr][cc];
        if (p < 0) continue;
        const dim = winLine && !winSet.has(rr * 100 + cc) ? 0.35 : 1;
        disc(bx + (cc + 0.5) * cell, by + (rr + 0.5) * cell, rad, ctx.players[p].color, dim);
      }
      // falling disc
      if (drop) disc(bx + (drop.col + 0.5) * cell, by + (drop.y + 0.5) * cell, rad, ctx.players[drop.p].color);
      // frame with holes (drawn over the discs)
      g.fillStyle = '#2c3566';
      g.beginPath();
      const fr = cell * 0.14;
      g.roundRect ? g.roundRect(bx - fr, by - fr, bw + 2 * fr, bh + 2 * fr, fr * 1.6) : g.rect(bx - fr, by - fr, bw + 2 * fr, bh + 2 * fr);
      for (let rr = 0; rr < R; rr++) for (let cc = 0; cc < C; cc++) {
        const x = bx + (cc + 0.5) * cell, y = by + (rr + 0.5) * cell;
        g.moveTo(x + rad + 1, y);
        g.arc(x, y, rad + 1, 0, Math.PI * 2);
      }
      g.fill('evenodd');
      g.strokeStyle = 'rgba(255,255,255,.08)';
      g.lineWidth = 2;
      g.stroke();
      // winning line highlight
      if (winLine) {
        const a = 0.6 + 0.4 * Math.sin(pulse * 10);
        g.strokeStyle = `rgba(255,255,255,${a})`;
        g.lineWidth = Math.max(4, cell * 0.08);
        for (const [rr, cc] of winLine) {
          g.beginPath(); g.arc(bx + (cc + 0.5) * cell, by + (rr + 0.5) * cell, rad + 2, 0, Math.PI * 2); g.stroke();
        }
        const ends = winLine.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
        const [s, e] = [ends[0], ends[ends.length - 1]];
        g.lineCap = 'round';
        g.lineWidth = Math.max(6, cell * 0.12);
        g.strokeStyle = `rgba(255,255,255,${a * 0.9})`;
        g.beginPath();
        g.moveTo(bx + (s[1] + 0.5) * cell, by + (s[0] + 0.5) * cell);
        g.lineTo(bx + (e[1] + 0.5) * cell, by + (e[0] + 0.5) * cell);
        g.stroke();
      }
      // next-disc hint above the board (in the current player's color)
      if (!done && !drop) {
        g.globalAlpha = 0.5 + 0.2 * Math.sin(pulse * 4);
        g.fillStyle = ctx.players[turn].color;
        const hy = by - cell * 0.5 - fr;
        if (hy - cell * 0.12 > r.y) {
          for (let cc = 0; cc < C; cc++) { g.beginPath(); g.arc(bx + (cc + 0.5) * cell, hy, cell * 0.08, 0, Math.PI * 2); g.fill(); }
        }
        g.globalAlpha = 1;
      }
    });

    render();
  },
});
