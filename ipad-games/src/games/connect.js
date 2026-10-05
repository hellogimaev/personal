registerGame({
  id: 'connect',
  title: '4 в ряд',
  emoji: '🔴',
  desc: 'Четыре в ряд с бомбами, переворотами и землетрясениями',
  rules: 'Ходите по очереди: чей ход, у того светится край экрана. Нажми на столбец, и фишка упадёт.\nСобери 4 своих фишки подряд по горизонтали, вертикали или диагонали.\nУ каждого по одному разу за игру (кнопки у твоего края):\n💣 Бомба: следующая фишка взрывается и сносит всё вокруг.\n✌️ Две фишки: ходишь дважды подряд.\n🙃 Переворот: гравитация меняется, все фишки падают в другую сторону.\n✨ Каждые 5 ходов случается событие: 🌪️ Сдвиг ряда, 🪨 Камень, 🙃 Переворот или 💥 Землетрясение.\n⏳ На ход 12 секунд, потом фишка падает сама.\nДля двоих поле 7×6, для троих 9×7.',
  start(ctx) {
    const C = ctx.n === 2 ? 7 : 9;
    const R = ctx.n === 2 ? 6 : 7;
    const TURN = 12;
    const EVENT_EVERY = 5;
    const STONE = '#8a8fa3';
    const grid = Array.from({ length: R }, () => Array(C).fill(null)); // grid[row][col] = disc | null
    let gdir = 1;                // 1: discs fall toward the bottom of the screen, -1: toward the top
    let turn = U.randInt(0, ctx.n - 1);
    let phase = 'idle';          // idle | anim | done
    let moves = 0;
    let extraDrops = 0;
    let armed = null;            // 'bomb' when the next disc is a bomb
    let deadline = TURN;
    let winLines = null;
    let flash = null;            // {col, t, bad}
    let onSettled = null;
    let shake = 0;
    const parts = [];            // explosion particles
    const rings = [];
    const used = ctx.players.map(() => ({ bomb: false, dbl: false, flip: false }));
    let geo = null;

    ctx.root.classList.add('g-connect');
    ctx.root.append(U.h('style', null, `
      .g-connect .zi{position:absolute;inset:6px;border-radius:18px;display:flex;align-items:center;justify-content:flex-start;
        padding:0 10px 0 16px;gap:12px;background:#1a1f35;border:3px solid transparent;transition:background .25s,box-shadow .25s;font-weight:900;overflow:hidden}
      .g-connect .zi .dc{width:30px;height:30px;border-radius:50%;background:var(--pc);flex:0 0 auto;box-shadow:inset 0 -4px 0 rgba(0,0,0,.25)}
      .g-connect .zi .tx{flex:1;font-size:24px;color:#9aa1c4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
      .g-connect .zi .tx b{color:var(--tc)}
      .g-connect .zi.on{background:var(--pc);border-color:#fff;box-shadow:0 0 30px 6px var(--pc)}
      .g-connect .zi.on .tx{color:#111;font-size:27px}
      .g-connect .zi.on .dc{background:#fff}
      .g-connect .zi.win{background:var(--pc);border-color:#fff}
      .g-connect .zi.win .tx{color:#111}
      .g-connect .pws{display:flex;gap:8px;flex:0 0 auto}
      .g-connect .pw{width:64px;height:64px;border-radius:16px;background:rgba(255,255,255,.12);display:flex;align-items:center;
        justify-content:center;font-size:34px;line-height:1;transition:opacity .2s,transform .08s;opacity:.45;position:relative}
      .g-connect .zi.on .pw{background:rgba(255,255,255,.85);opacity:1}
      .g-connect .pw:active{transform:scale(.92)}
      .g-connect .pw.used{opacity:.15 !important;filter:grayscale(1)}
      .g-connect .pw.used::after{content:'';position:absolute;left:8px;right:8px;top:50%;height:4px;background:#111;transform:rotate(-35deg);border-radius:2px}
      .g-connect .pw.armed{background:#fff;box-shadow:0 0 0 4px #111,0 0 18px 6px #fff;animation:c4Pulse .7s infinite alternate}
      @keyframes c4Pulse{to{transform:scale(1.1)}}
      .g-connect .zi .tm{position:absolute;left:0;bottom:0;height:7px;background:rgba(0,0,0,.45);display:none}
      .g-connect .zi.on .tm{display:block}
      .g-connect .zi .tm.low{background:#fff}
    `));

    /* ---------- zones ---------- */
    const POWERS = [['bomb', '💣'], ['dbl', '✌️'], ['flip', '🙃']];
    const seats = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: 92 });
      const tx = U.h('div', { class: 'tx' });
      const pw = {};
      const pws = U.h('div', { class: 'pws' });
      POWERS.forEach(([k, ic]) => {
        const b = U.h('div', { class: 'pw' }, ic);
        ctx.tap(b, () => usePower(p.i, k));
        pw[k] = b;
        pws.append(b);
      });
      const tm = U.h('div', { class: 'tm' });
      const inner = U.h('div', { class: 'zi' }, U.h('div', { class: 'dc' }), tx, pws, tm);
      z.el.append(inner);
      return { z, inner, tx, pw, tm };
    });

    function render(winners) {
      seats.forEach((s, i) => {
        s.inner.style.setProperty('--tc', ctx.players[turn].color);
        s.inner.classList.toggle('on', phase !== 'done' && i === turn);
        s.inner.classList.toggle('win', !!winners && winners.includes(i));
        if (phase === 'done') s.tx.textContent = !winners || !winners.length ? 'Ничья' : winners.includes(i) ? 'Победа!' : `Победил ${winners.map(w => ctx.players[w].name).join(' и ')}`;
        else if (i === turn) s.tx.textContent = extraDrops > 0 ? 'Твой ход! ✌️ ещё' : armed === 'bomb' ? 'Бомба готова!' : 'Твой ход!';
        else s.tx.replaceChildren('Ход: ', U.h('b', null, ctx.players[turn].name));
        for (const [k] of POWERS) {
          s.pw[k].classList.toggle('used', used[i][k]);
          s.pw[k].classList.toggle('armed', k === 'bomb' && armed === 'bomb' && i === turn);
        }
      });
    }
    const say = (text, color, fg) => ctx.toast(text, { color: color || '#2b3157', fg: fg || '#fff', ms: 1400, size: 26 });

    /* ---------- board geometry ---------- */
    const { cv, g } = ctx.canvas();
    function layout() {
      const W = ctx.W, H = ctx.H, d = seats[0].z.h;
      // keep clear of the exit button (2p: middle of the left edge, 3p: middle of the top edge)
      const r = ctx.n === 2 ? { x: 50, y: d, w: W - 100, h: H - 2 * d } : { x: d, y: 50, w: W - 2 * d, h: H - d - 50 };
      const pad = 10;
      const cell = Math.min((r.w - 2 * pad) / (C + 0.3), (r.h - 2 * pad) / (R + 0.8));
      const bw = cell * C, bh = cell * R;
      const bx = r.x + (r.w - bw) / 2;
      const by = r.y + (r.h - bh) / 2;
      geo = { r, cell, bx, by, bw, bh };
    }
    layout();
    ctx.onResize(layout);

    /* ---------- board helpers ---------- */
    const full = () => grid.every(row => row.every(v => v));
    function targetRow(col) {
      if (gdir > 0) { for (let k = R - 1; k >= 0; k--) if (!grid[k][col]) return k; }
      else { for (let k = 0; k < R; k++) if (!grid[k][col]) return k; }
      return -1;
    }
    function collapse() {
      for (let c = 0; c < C; c++) {
        const list = [];
        const order = gdir > 0 ? [...Array(R).keys()].reverse() : [...Array(R).keys()];
        for (const r of order) if (grid[r][c]) list.push(grid[r][c]);
        for (let r = 0; r < R; r++) grid[r][c] = null;
        list.forEach((dsc, k) => { grid[order[k]][c] = dsc; dsc.v = 0; });
      }
    }
    function settle(cb) { phase = 'anim'; onSettled = cb; }

    function findLines() {
      const lines = [];
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const d0 = grid[r][c];
        if (!d0 || d0.p < 0) continue;
        for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
          const pr = r - dr, pc = c - dc;
          if (pr >= 0 && pr < R && pc >= 0 && pc < C && grid[pr][pc] && grid[pr][pc].p === d0.p) continue; // not a run start
          const cells = [];
          let rr = r, cc = c;
          while (rr >= 0 && rr < R && cc >= 0 && cc < C && grid[rr][cc] && grid[rr][cc].p === d0.p) { cells.push([rr, cc]); rr += dr; cc += dc; }
          if (cells.length >= 4) lines.push({ p: d0.p, cells });
        }
      }
      return lines;
    }

    // After any settle: game over? Returns true if the game ended.
    function checkEnd() {
      const lines = findLines();
      if (lines.length) {
        phase = 'done';
        winLines = lines;
        const winners = [...new Set(lines.map(l => l.p))];
        render(winners);
        ctx.after(2000, () => ctx.end(winners.length === 1 ? { winner: winners[0] } : { winners }));
        return true;
      }
      if (full()) {
        phase = 'done';
        render([]);
        ctx.after(1500, () => ctx.end({}));
        return true;
      }
      return false;
    }

    function ready() {
      phase = 'idle';
      deadline = ctx.time + TURN;
      render();
    }

    /* ---------- moves ---------- */
    function drop(col) {
      const row = targetRow(col);
      if (row < 0) { flash = { col, t: 0.35, bad: true }; return false; }
      flash = { col, t: 0.25, bad: false };
      const kind = armed === 'bomb' ? 'bomb' : 'n';
      if (armed === 'bomb') { armed = null; used[turn].bomb = true; }
      grid[row][col] = { p: turn, kind, x: col, y: gdir > 0 ? -1 : R, v: 0 };
      render();
      settle(() => afterDrop(row, col));
      return true;
    }

    function afterDrop(row, col) {
      const dsc = grid[row][col];
      if (dsc && dsc.kind === 'bomb') {
        explode(row, col);
        collapse();
        phase = 'anim';
        ctx.after(350, () => settle(finishAction));
        return;
      }
      finishAction();
    }

    function explode(row, col) {
      const { cell, bx, by } = geo;
      const cx = bx + (col + 0.5) * cell, cy = by + (row + 0.5) * cell;
      for (let r = row - 1; r <= row + 1; r++) for (let c = col - 1; c <= col + 1; c++) {
        if (r < 0 || r >= R || c < 0 || c >= C || !grid[r][c]) continue;
        const dsc = grid[r][c];
        const color = dsc.p >= 0 ? ctx.players[dsc.p].color : STONE;
        for (let k = 0; k < 7; k++) {
          const a = Math.random() * Math.PI * 2, s = U.rand(2, 9) * cell;
          parts.push({ x: bx + (c + 0.5) * cell, y: by + (r + 0.5) * cell, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.5, 0.9), color, r: U.rand(0.06, 0.14) * cell });
        }
        grid[r][c] = null;
      }
      rings.push({ x: cx, y: cy, t: 0 });
      shake = 0.4;
      say('💥 БУМ!', '#ff7a1a', '#111');
    }

    function finishAction() {
      if (checkEnd()) return;
      if (extraDrops > 0) { extraDrops--; ready(); return; }
      moves++;
      turn = (turn + 1) % ctx.n;
      if (moves % EVENT_EVERY === 0) runEvent(() => { if (!checkEnd()) ready(); });
      else ready();
    }

    /* ---------- powers ---------- */
    function usePower(i, k) {
      if (phase !== 'idle' || i !== turn || used[i][k]) return;
      if (k === 'bomb') {
        armed = armed === 'bomb' ? null : 'bomb';
        if (armed) say(`💣 ${ctx.players[i].name}: следующая фишка взорвётся`, ctx.players[i].color, '#111');
        render();
      } else if (k === 'dbl') {
        used[i].dbl = true;
        extraDrops++;
        say(`✌️ ${ctx.players[i].name} ходит дважды`, ctx.players[i].color, '#111');
        render();
      } else if (k === 'flip') {
        used[i].flip = true;
        say('🙃 Переворот гравитации!', ctx.players[i].color, '#111');
        gdir = -gdir;
        collapse();
        render();
        settle(() => { if (!checkEnd()) ready(); });
      }
    }

    /* ---------- random events ---------- */
    function runEvent(cb) {
      phase = 'anim';
      const discs = [];
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (grid[r][c]) discs.push([r, c]);
      const rowsWith = [...Array(R).keys()].filter(r => grid[r].filter(Boolean).length >= 2);
      const opts = ['stone', 'flip'];
      if (rowsWith.length) opts.push('shift');
      if (discs.length >= C) opts.push('quake');
      const ev = U.pick(opts);
      const NAMES_EV = { shift: '🌪️ Сдвиг ряда!', stone: '🪨 Камень!', flip: '🙃 Переворот!', quake: '💥 Землетрясение!' };
      say('✨ ' + NAMES_EV[ev], '#8a4dff');
      ctx.after(1000, () => {
        if (ev === 'shift') {
          const r = U.pick(rowsWith);
          const dir = Math.random() < 0.5 ? 1 : -1;
          const row = grid[r].slice();
          for (let c = 0; c < C; c++) grid[r][(c + dir + C) % C] = row[c];
          collapse();
          settle(cb);
        } else if (ev === 'stone') {
          const cols = [...Array(C).keys()].filter(c => targetRow(c) >= 0);
          if (!cols.length) { cb(); return; }
          const col = U.pick(cols), row = targetRow(col);
          grid[row][col] = { p: -1, kind: 'stone', x: col, y: gdir > 0 ? -1 : R, v: 0 };
          settle(cb);
        } else if (ev === 'flip') {
          gdir = -gdir;
          collapse();
          settle(cb);
        } else {
          const r = gdir > 0 ? R - 1 : 0;
          for (let c = 0; c < C; c++) if (grid[r][c]) {
            const dsc = grid[r][c];
            const { cell, bx, by } = geo;
            for (let k = 0; k < 4; k++) {
              const a = Math.random() * Math.PI * 2, s = U.rand(1, 5) * cell;
              parts.push({ x: bx + (c + 0.5) * cell, y: by + (r + 0.5) * cell, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: U.rand(0.4, 0.8), color: dsc.p >= 0 ? ctx.players[dsc.p].color : STONE, r: 0.1 * cell });
            }
            grid[r][c] = null;
          }
          shake = 0.6;
          collapse();
          ctx.after(300, () => settle(cb));
        }
      });
    }

    /* ---------- input ---------- */
    ctx.pointer(cv, {
      down(id, x, y) {
        if (ctx.paused || phase !== 'idle' || !geo) return;
        const { r, bx, bw, cell } = geo;
        if (x < bx || x > bx + bw || y < r.y || y > r.y + r.h) return;
        drop(U.clamp(Math.floor((x - bx) / cell), 0, C - 1));
      },
    });

    /* ---------- animation + drawing ---------- */
    let pulse = 0;
    function drawDisc(x, y, rad, dsc, alpha = 1) {
      g.globalAlpha = alpha;
      const color = dsc.p >= 0 ? ctx.players[dsc.p].color : STONE;
      g.fillStyle = color;
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      if (dsc.kind === 'stone') {
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = Math.max(2, rad * 0.08);
        g.beginPath(); g.moveTo(x - rad * 0.5, y - rad * 0.3); g.lineTo(x - rad * 0.05, y + rad * 0.05); g.lineTo(x + rad * 0.4, y - rad * 0.15);
        g.moveTo(x - rad * 0.05, y + rad * 0.05); g.lineTo(x + rad * 0.1, y + rad * 0.55); g.stroke();
      } else {
        g.fillStyle = 'rgba(0,0,0,.18)';
        g.beginPath(); g.arc(x, y, rad * 0.62, 0, Math.PI * 2); g.fill();
        g.fillStyle = color;
        g.beginPath(); g.arc(x, y - rad * 0.06, rad * 0.56, 0, Math.PI * 2); g.fill();
      }
      if (dsc.kind === 'bomb') {
        g.font = `${rad * 1.1}px sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText('💣', x, y + rad * 0.05);
      }
      g.globalAlpha = 1;
    }

    ctx.loop((dt) => {
      if (!geo) return;
      pulse += dt;
      // move discs toward their cells
      if (dt > 0) {
        let moving = false;
        const G = 70;
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
          const dsc = grid[r][c];
          if (!dsc) continue;
          if (dsc.x !== c) {
            const s = Math.sign(c - dsc.x) * 7 * dt;
            dsc.x = Math.abs(c - dsc.x) <= Math.abs(s) ? c : dsc.x + s;
            moving = true;
          }
          if (dsc.y !== r) {
            dsc.v += G * dt;
            const s = Math.sign(r - dsc.y) * dsc.v * dt;
            dsc.y = Math.abs(r - dsc.y) <= Math.abs(s) ? r : dsc.y + s;
            if (dsc.y === r) dsc.v = 0;
            moving = true;
          }
        }
        if (!moving && phase === 'anim' && onSettled) { const f = onSettled; onSettled = null; f(); }
        if (flash) { flash.t -= dt; if (flash.t <= 0) flash = null; }
        if (shake > 0) shake = Math.max(0, shake - dt);
        for (let k = parts.length - 1; k >= 0; k--) {
          const q = parts[k];
          q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92;
          if (q.life <= 0) parts.splice(k, 1);
        }
        for (let k = rings.length - 1; k >= 0; k--) { rings[k].t += dt; if (rings[k].t > 0.5) rings.splice(k, 1); }
        // turn timer
        if (phase === 'idle' && ctx.time > deadline) {
          const cols = [...Array(C).keys()].filter(c => targetRow(c) >= 0);
          if (cols.length) { say('⏳ Время! Фишка падает сама', '#9aa1c4', '#111'); drop(U.pick(cols)); }
        }
      }
      const s = seats[turn];
      const left = phase === 'idle' ? U.clamp(deadline - ctx.time, 0, TURN) : TURN;
      s.tm.style.width = (left / TURN) * 100 + '%';
      s.tm.classList.toggle('low', left < 4);

      const { cell, bx, by, bw, bh, r } = geo;
      const rad = cell * 0.4;
      g.clearRect(0, 0, ctx.W, ctx.H);
      g.save();
      if (shake > 0) g.translate(U.rand(-1, 1) * cell * 0.12 * shake / 0.4, U.rand(-1, 1) * cell * 0.12 * shake / 0.4);
      if (flash) {
        g.fillStyle = flash.bad ? 'rgba(255,77,109,.35)' : U.alpha(ctx.players[turn].color, 0.22);
        g.fillRect(bx + flash.col * cell, r.y, cell, r.h);
      }
      g.fillStyle = '#0a0d18';
      g.fillRect(bx, by, bw, bh);
      const winSet = new Set((winLines || []).flatMap(l => l.cells.map(([a, b]) => a * 100 + b)));
      for (let rr = 0; rr < R; rr++) for (let cc = 0; cc < C; cc++) {
        const dsc = grid[rr][cc];
        if (!dsc) continue;
        const dim = winLines && !winSet.has(rr * 100 + cc) ? 0.35 : 1;
        drawDisc(bx + (dsc.x + 0.5) * cell, by + (dsc.y + 0.5) * cell, rad, dsc, dim);
      }
      // frame with holes (drawn over the discs)
      g.fillStyle = gdir > 0 ? '#2c3566' : '#4a2c66';
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
      // explosion
      for (const q of parts) {
        g.globalAlpha = U.clamp(q.life * 1.5, 0, 1);
        g.fillStyle = q.color;
        g.beginPath(); g.arc(q.x, q.y, q.r, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      for (const q of rings) {
        g.strokeStyle = `rgba(255,200,80,${1 - q.t / 0.5})`;
        g.lineWidth = cell * 0.15;
        g.beginPath(); g.arc(q.x, q.y, cell * (0.3 + q.t * 4), 0, Math.PI * 2); g.stroke();
      }
      // winning lines
      if (winLines) {
        const a = 0.6 + 0.4 * Math.sin(pulse * 10);
        for (const l of winLines) {
          g.strokeStyle = `rgba(255,255,255,${a})`;
          g.lineWidth = Math.max(4, cell * 0.08);
          for (const [rr, cc] of l.cells) { g.beginPath(); g.arc(bx + (cc + 0.5) * cell, by + (rr + 0.5) * cell, rad + 2, 0, Math.PI * 2); g.stroke(); }
          const [s0, e0] = [l.cells[0], l.cells[l.cells.length - 1]];
          g.lineCap = 'round';
          g.lineWidth = Math.max(6, cell * 0.12);
          g.beginPath();
          g.moveTo(bx + (s0[1] + 0.5) * cell, by + (s0[0] + 0.5) * cell);
          g.lineTo(bx + (e0[1] + 0.5) * cell, by + (e0[0] + 0.5) * cell);
          g.stroke();
        }
      }
      // gravity chevrons on the entry side, in the current player's color
      if (phase !== 'done') {
        const hy = gdir > 0 ? by - fr - cell * 0.28 : by + bh + fr + cell * 0.28;
        if (hy - cell * 0.15 > r.y && hy + cell * 0.15 < r.y + r.h) {
          g.globalAlpha = 0.55 + 0.3 * Math.sin(pulse * 5);
          g.fillStyle = armed === 'bomb' ? '#fff' : ctx.players[turn].color;
          const w = cell * 0.16, hgt = cell * 0.12 * gdir;
          for (let cc = 0; cc < C; cc++) {
            const x = bx + (cc + 0.5) * cell;
            g.beginPath(); g.moveTo(x - w, hy - hgt); g.lineTo(x + w, hy - hgt); g.lineTo(x, hy + hgt); g.closePath(); g.fill();
          }
          g.globalAlpha = 1;
        }
      }
      g.restore();
    });

    render();
  },
});
