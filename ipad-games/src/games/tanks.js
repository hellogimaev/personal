registerGame({
  id: 'tanks',
  title: 'Танчики',
  emoji: '🛡️',
  desc: 'Стреляй рикошетом, выживи последним',
  rules: 'Танк едет вперёд сам. ◀ и ▶ поворачивают, ОГОНЬ стреляет (можно держать).\nСнаряды отскакивают от стен дважды. Осторожно: после рикошета свой снаряд тоже ранит!\nУ каждого танка 3 жизни. Последний уцелевший выигрывает раунд.\nДо 2 побед.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const WIN = 2;
    const HP = 3;
    const DEPTH = 0.2;
    const BG = '#0f1220';
    const ARW_L = '◀︎', ARW_R = '▶︎';
    const RELOAD = 0.6, MAXB = 3, BOUNCES = 2;

    ctx.root.classList.add('g-tanks');
    ctx.root.append(U.h('style', null, `
      .g-tanks .zone-inner{display:flex;align-items:stretch;gap:1.4vmin;padding:1.5vmin}
      .g-tanks .cb{flex:1 1 0;max-width:24vmin;border-radius:3vmin;border:.5vmin solid var(--pc);color:var(--pc);
        background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;
        font-size:8vmin;font-weight:900;touch-action:none;transition:transform .07s,background .07s,box-shadow .07s}
      .g-tanks .cb.on{background:var(--pc);color:#0f1220;transform:scale(.95);box-shadow:0 0 3.5vmin var(--pc)}
      .g-tanks .mid{flex:1.5 1 0;min-width:0;display:flex;flex-direction:column;gap:1vmin}
      .g-tanks .info{display:flex;align-items:center;justify-content:space-between;gap:1vmin;color:var(--pc);
        font-weight:900;pointer-events:none;padding:0 .6vmin;height:4.6vmin}
      .g-tanks .hearts{font-size:3.8vmin;line-height:1;white-space:nowrap;letter-spacing:.3vmin}
      .g-tanks .hearts .off{opacity:.22;filter:grayscale(1)}
      .g-tanks .wins{font-size:4.4vmin;line-height:1;white-space:nowrap}
      .g-tanks .fire{flex:1 1 auto;max-width:none;font-size:4.6vmin;letter-spacing:.3vmin;position:relative;overflow:hidden}
      .g-tanks .fire .rl{position:absolute;left:0;bottom:0;height:.9vmin;background:var(--pc);opacity:.7}
      .g-tanks .fire.on .rl{background:#0f1220}
      .g-tanks .zone-inner.dead{opacity:.45}
    `));

    const C = ctx.canvas();

    /* ---------- controls ---------- */
    const allBtns = [];
    function btn(label, cls) {
      const b = U.h('div', { class: 'cb' + (cls ? ' ' + cls : '') }, label);
      const ids = new Set();
      b.ids = ids;
      ctx.pointer(b, {
        down: (id) => { ids.add(id); b.classList.add('on'); },
        up: (id) => { ids.delete(id); if (!ids.size) b.classList.remove('on'); },
      });
      allBtns.push(b);
      return b;
    }
    const releaseAll = (e) => allBtns.forEach(b => { if (b.ids.delete(e.pointerId) && !b.ids.size) b.classList.remove('on'); });
    window.addEventListener('pointerup', releaseAll);
    window.addEventListener('pointercancel', releaseAll);
    ctx.onCleanup(() => {
      window.removeEventListener('pointerup', releaseAll);
      window.removeEventListener('pointercancel', releaseAll);
    });

    const ui = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: DEPTH });
      z.el.style.background = `linear-gradient(0deg, ${U.alpha(p.color, .2)}, ${U.alpha(p.color, .05)})`;
      z.el.style.borderTop = `2px solid ${U.alpha(p.color, .6)}`;
      const L = btn(ARW_L), R = btn(ARW_R);
      const rl = U.h('div', { class: 'rl' });
      const F = btn('ОГОНЬ', 'fire');
      F.append(rl);
      const hearts = U.h('div', { class: 'hearts' });
      const winsEl = U.h('div', { class: 'wins' });
      const mid = U.h('div', { class: 'mid' }, U.h('div', { class: 'info' }, hearts, winsEl), F);
      z.el.append(L, mid, R);
      return { z, L, R, F, rl, hearts, winsEl, last: '' };
    });

    /* ---------- field geometry ---------- */
    function say(text, o) {
      const fr = fieldRect();
      return ctx.toast(text, Object.assign({ offset: Math.max(70, Math.min(fr.w, fr.h) * 0.27) }, o || {}));
    }
    function fieldRect() {
      const d = Math.round(DEPTH * Math.min(ctx.W, ctx.H));
      const sides = ctx.players.map(p => p.side);
      const l = sides.includes('left') ? d : 0, r = sides.includes('right') ? d : 0;
      const t = sides.includes('top') ? d : 0, b = sides.includes('bottom') ? d : 0;
      const m = 8;
      return { x: l + m, y: t + m, w: Math.max(120, ctx.W - l - r - 2 * m), h: Math.max(120, ctx.H - t - b - 2 * m) };
    }
    let FW = 600, FH = 400, S = 500;
    let view = { s: 1, ox: 0, oy: 0 };
    function updView() {
      const fr = fieldRect();
      const s = Math.min(fr.w / FW, fr.h / FH);
      view = { s, ox: fr.x + (fr.w - FW * s) / 2, oy: fr.y + (fr.h - FH * s) / 2 };
    }
    ctx.onResize(updView);

    /* ---------- state ---------- */
    const wins = ctx.players.map(() => 0);
    let round = 0;
    let state = 'play';
    let roundT = 0;
    let RT = 20, SPEED = 50, TURN = 2.4, BSPEED = 320, BR = 4;
    let tanks = [], bullets = [], walls = [], parts = [], rings = [];

    function rectsOverlap(a, b, gap) {
      return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
    }
    function circleRectDist(cx, cy, r) {
      const nx = U.clamp(cx, r.x, r.x + r.w), ny = U.clamp(cy, r.y, r.y + r.h);
      return Math.hypot(cx - nx, cy - ny);
    }

    function genWalls(spawns) {
      const M = Math.min(FW, FH);
      const gap = RT * 3.2;
      const thick = Math.max(RT * 0.9, M * 0.045);
      const res = [];
      const mirror = (r) => ctx.n === 2
        ? { x: FW - r.x - r.w, y: FH - r.y - r.h, w: r.w, h: r.h }
        : { x: FW - r.x - r.w, y: r.y, w: r.w, h: r.h };
      const ok = (r) => {
        if (r.x < gap || r.y < gap || r.x + r.w > FW - gap || r.y + r.h > FH - gap) return false;
        for (const s of spawns) if (circleRectDist(s.x, s.y, r) < RT * 4) return false;
        for (const o of res) if (rectsOverlap(r, o, gap)) return false;
        return true;
      };
      // center piece
      if (Math.random() < 0.75) {
        const cw = U.pick([thick, M * 0.12, M * 0.22]), ch = cw === thick ? M * 0.22 : (cw > M * 0.15 ? thick : M * 0.12);
        const vertical = ctx.n === 3 ? true : Math.random() < 0.5;
        const w = vertical ? Math.min(cw, ch) : Math.max(cw, ch), h = vertical ? Math.max(cw, ch) : Math.min(cw, ch);
        const r = { x: (FW - w) / 2, y: (FH - h) / 2, w, h };
        if (ok(r)) res.push(r);
      }
      let pairs = 0;
      for (let t = 0; t < 300 && pairs < 3; t++) {
        const long = U.rand(0.14, 0.3) * M;
        const horiz = Math.random() < 0.5;
        const w = horiz ? long : thick, h = horiz ? thick : long;
        const r = { x: U.rand(0, FW - w), y: U.rand(0, FH - h), w, h };
        const m = mirror(r);
        if (!ok(r)) continue;
        if (rectsOverlap(r, m, gap) && !(Math.abs(r.x - m.x) < 1 && Math.abs(r.y - m.y) < 1)) continue;
        res.push(r);
        if (ok(m)) res.push(m); else { res.pop(); continue; }
        pairs++;
      }
      return res;
    }

    function newRound() {
      round++;
      const fr = fieldRect();
      FW = Math.round(fr.w); FH = Math.round(fr.h);
      S = Math.sqrt(FW * FH);
      updView();
      RT = Math.max(14, S * 0.033);
      SPEED = S * 0.08;
      TURN = 2.5;
      BSPEED = S * 0.46;
      BR = Math.max(3, S * 0.0062);
      bullets = []; parts = []; rings = [];
      roundT = 0;
      const sp = Math.max(RT * 2.4, Math.min(FW, FH) * 0.11);
      const spawns = ctx.players.map(p => {
        if (p.side === 'bottom') return { x: FW / 2, y: FH - sp };
        if (p.side === 'top') return { x: FW / 2, y: sp };
        if (p.side === 'left') return { x: sp, y: FH / 2 };
        return { x: FW - sp, y: FH / 2 };
      });
      if (ctx.n === 2) { spawns[0].x -= FW * 0.15; spawns[1].x += FW * 0.15; }
      walls = genWalls(spawns);
      tanks = ctx.players.map((p, k) => {
        const v = ctx.inward(p.i);
        return {
          i: p.i, color: p.color, x: spawns[k].x, y: spawns[k].y, a: Math.atan2(v.y, v.x),
          hp: HP, alive: true, cd: 0, flash: 0, inv: 0, recoil: 0, tread: 0,
        };
      });
      ui.forEach(u => u.z.el.classList.remove('dead'));
      if (round > 1) {
        state = 'ready';
        say(`Раунд ${round}`, { ms: 1100, size: 30 });
        ctx.after(1300, () => { state = 'play'; say('В бой!', { ms: 700, color: '#3ddc97', fg: '#0f1220' }); });
      } else state = 'play';
    }

    function renderUI() {
      ui.forEach((u, i) => {
        const t = tanks[i];
        const key = (t ? t.hp : HP) + '|' + wins[i];
        if (key !== u.last) {
          u.last = key;
          u.hearts.replaceChildren(...Array.from({ length: HP }, (_, k) =>
            U.h('span', { class: t && k < t.hp ? '' : 'off' }, '❤️')));
          let w = '';
          for (let k = 0; k < WIN; k++) w += k < wins[i] ? '★' : '☆';
          u.winsEl.textContent = w;
        }
        const cdFrac = t ? Math.max(0, t.cd) / RELOAD : 0;
        u.rl.style.width = ((1 - cdFrac) * 100).toFixed(0) + '%';
      });
    }

    function collideTank(t) {
      // field borders
      t.x = U.clamp(t.x, RT, FW - RT);
      t.y = U.clamp(t.y, RT, FH - RT);
      for (const r of walls) {
        const nx = U.clamp(t.x, r.x, r.x + r.w), ny = U.clamp(t.y, r.y, r.y + r.h);
        let dx = t.x - nx, dy = t.y - ny;
        const d = Math.hypot(dx, dy);
        if (d >= RT) continue;
        if (d < 0.001) { // center inside rect: push out along shortest axis
          const l = t.x - r.x, rr = r.x + r.w - t.x, tp = t.y - r.y, b = r.y + r.h - t.y;
          const m = Math.min(l, rr, tp, b);
          if (m === l) t.x = r.x - RT; else if (m === rr) t.x = r.x + r.w + RT;
          else if (m === tp) t.y = r.y - RT; else t.y = r.y + r.h + RT;
          continue;
        }
        t.x = nx + dx / d * RT; t.y = ny + dy / d * RT;
      }
    }

    function fire(t) {
      if (t.cd > 0 || bullets.filter(b => b.owner === t.i).length >= MAXB) return;
      t.cd = RELOAD;
      t.recoil = 1;
      const ca = Math.cos(t.a), sa = Math.sin(t.a);
      let bx = t.x + ca * RT * 1.45, by = t.y + sa * RT * 1.45;
      const b = { owner: t.i, color: t.color, x: bx, y: by, vx: ca * BSPEED, vy: sa * BSPEED, bounces: 0, t: 0, trail: [] };
      // muzzle inside a wall: bounce it immediately
      for (const r of walls) {
        if (bx > r.x && bx < r.x + r.w && by > r.y && by < r.y + r.h) { b.x = t.x; b.y = t.y; b.vx *= -1; b.vy *= -1; b.bounces = 1; }
      }
      bullets.push(b);
      for (let k = 0; k < 6; k++) {
        const a = t.a + U.rand(-0.5, 0.5), v = U.rand(40, 120) * S / 700;
        parts.push({ x: bx, y: by, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(.15, .3), t: 0, c: '#ffe8a0', r: BR * 0.8 });
      }
    }

    function hitTank(t, b) {
      t.hp--;
      t.flash = 0.6;
      t.inv = 0.6;
      rings.push({ x: t.x, y: t.y, t: 0, c: '#ffffff' });
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * Math.PI * 2, v = U.rand(40, 140) * S / 700;
        parts.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(.25, .5), t: 0, c: b.color, r: BR });
      }
      if (t.hp <= 0) {
        t.alive = false;
        ui[t.i].z.el.classList.add('dead');
        rings.push({ x: t.x, y: t.y, t: 0, c: t.color, big: true });
        for (let k = 0; k < 40; k++) {
          const a = Math.random() * Math.PI * 2, v = U.rand(30, 220) * S / 700;
          parts.push({ x: t.x, y: t.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(.5, 1.2), t: 0, c: U.pick([t.color, '#ffb347', '#fff']), r: BR * 1.3 });
        }
        if (t.i !== b.owner) say(`${ctx.players[t.i].name} подбит!`, { ms: 900 });
      }
    }

    function endRound() {
      state = 'over';
      const alive = tanks.filter(t => t.alive);
      if (alive.length === 1) {
        const w = alive[0].i, p = ctx.players[w];
        wins[w]++;
        renderUI();
        if (wins[w] >= WIN) {
          say(`${p.name} побеждает!`, { color: p.color, fg: '#111', ms: 1500 });
          ctx.after(1600, () => ctx.end({ winner: w, scores: wins.slice() }));
          return;
        }
        say(`Раунд: ${p.name}`, { color: p.color, fg: '#111', ms: 1500 });
      } else say('Ничья в раунде', { ms: 1500 });
      ctx.after(2000, newRound);
    }

    function update(dt) {
      roundT += dt;
      for (const t of tanks) {
        if (!t.alive) continue;
        const u = ui[t.i];
        const turn = (u.R.ids.size ? 1 : 0) - (u.L.ids.size ? 1 : 0);
        t.cd = Math.max(0, t.cd - dt);
        t.flash = Math.max(0, t.flash - dt);
        t.inv = Math.max(0, t.inv - dt);
        t.recoil = Math.max(0, t.recoil - dt * 6);
        t.a += turn * TURN * dt * (state === 'ready' ? 0.7 : 1);
        if (state !== 'play') continue;
        t.x += Math.cos(t.a) * SPEED * dt;
        t.y += Math.sin(t.a) * SPEED * dt;
        t.tread += SPEED * dt;
        collideTank(t);
        if (u.F.ids.size) fire(t);
      }
      // tank-tank separation
      for (let i = 0; i < tanks.length; i++) for (let j = i + 1; j < tanks.length; j++) {
        const a = tanks[i], b = tanks[j];
        if (!a.alive || !b.alive) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d < RT * 2 && d > 0.001) {
          const o = (RT * 2 - d) / 2;
          a.x -= dx / d * o; a.y -= dy / d * o; b.x += dx / d * o; b.y += dy / d * o;
          collideTank(a); collideTank(b);
        }
      }
      if (state !== 'play') return;
      // bullets
      for (const b of bullets) {
        b.t += dt;
        const dist = Math.hypot(b.vx, b.vy) * dt;
        const steps = Math.max(1, Math.ceil(dist / (BR * 0.8)));
        for (let k = 0; k < steps && !b.dead; k++) {
          const px = b.x, py = b.y;
          b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
          let bounced = false;
          if (b.x < BR) { b.x = 2 * BR - b.x; b.vx = Math.abs(b.vx); bounced = true; }
          if (b.x > FW - BR) { b.x = 2 * (FW - BR) - b.x; b.vx = -Math.abs(b.vx); bounced = true; }
          if (b.y < BR) { b.y = 2 * BR - b.y; b.vy = Math.abs(b.vy); bounced = true; }
          if (b.y > FH - BR) { b.y = 2 * (FH - BR) - b.y; b.vy = -Math.abs(b.vy); bounced = true; }
          if (!bounced) for (const r of walls) {
            if (b.x > r.x - BR && b.x < r.x + r.w + BR && b.y > r.y - BR && b.y < r.y + r.h + BR) {
              const wasInX = px > r.x - BR && px < r.x + r.w + BR;
              const wasInY = py > r.y - BR && py < r.y + r.h + BR;
              if (!wasInX) b.vx = -b.vx;
              if (!wasInY) b.vy = -b.vy;
              if (wasInX && wasInY) { b.vx = -b.vx; b.vy = -b.vy; }
              b.x = px; b.y = py;
              bounced = true;
              break;
            }
          }
          if (bounced) {
            b.bounces++;
            if (b.bounces > BOUNCES) { b.dead = true; sparks(b.x, b.y, b.color, 6); break; }
            sparks(b.x, b.y, '#ffffff', 3);
          }
          for (const t of tanks) {
            if (!t.alive) continue;
            if (t.i === b.owner && b.bounces === 0) continue;
            if ((t.x - b.x) ** 2 + (t.y - b.y) ** 2 < (RT * 0.95 + BR) ** 2) {
              b.dead = true;
              if (t.inv > 0) sparks(b.x, b.y, '#ffffff', 6); else hitTank(t, b);
              break;
            }
          }
        }
        b.trail.push(b.x, b.y);
        if (b.trail.length > 12) b.trail.splice(0, 2);
        if (b.t > 6) b.dead = true;
      }
      // bullet vs bullet
      for (let i = 0; i < bullets.length; i++) for (let j = i + 1; j < bullets.length; j++) {
        const a = bullets[i], c = bullets[j];
        if (a.dead || c.dead) continue;
        if ((a.x - c.x) ** 2 + (a.y - c.y) ** 2 < (BR * 2.2) ** 2) {
          a.dead = c.dead = true;
          sparks((a.x + c.x) / 2, (a.y + c.y) / 2, '#ffffff', 10);
        }
      }
      bullets = bullets.filter(b => !b.dead);
      if (tanks.filter(t => t.alive).length <= 1) endRound();
    }

    function sparks(x, y, c, n) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, v = U.rand(30, 110) * S / 700;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(.15, .35), t: 0, c, r: BR * 0.6 });
      }
    }

    ctx.loop((dt) => {
      if (dt > 0) {
        if (state !== 'over') update(dt);
        else for (const t of tanks) { t.flash = Math.max(0, t.flash - dt); }
        for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.95; p.vy *= 0.95; }
        parts = parts.filter(p => p.t < p.life);
        for (const r of rings) r.t += dt;
        rings = rings.filter(r => r.t < (r.big ? 0.7 : 0.35));
      }
      renderUI();
      draw();
    });

    function roundRect(g, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    }

    function drawTank(g, t, now) {
      g.save();
      g.translate(t.x, t.y);
      g.rotate(t.a);
      const r = RT;
      const white = t.flash > 0 && Math.floor(t.flash * 20) % 2 === 0;
      const col = white ? '#ffffff' : t.color;
      // treads
      g.fillStyle = '#20263f';
      roundRect(g, -r * 0.95, -r * 0.95, r * 1.9, r * 0.5, r * 0.15); g.fill();
      roundRect(g, -r * 0.95, r * 0.45, r * 1.9, r * 0.5, r * 0.15); g.fill();
      g.strokeStyle = U.alpha(t.color, 0.6);
      g.lineWidth = Math.max(1, r * 0.07);
      const ph = (t.tread % (r * 0.38));
      for (let x = -r * 0.95 + ph; x < r * 0.95; x += r * 0.38) {
        g.beginPath(); g.moveTo(x, -r * 0.93); g.lineTo(x, -r * 0.47); g.moveTo(x, r * 0.47); g.lineTo(x, r * 0.93); g.stroke();
      }
      // hull
      g.shadowColor = col; g.shadowBlur = 16;
      g.fillStyle = col;
      roundRect(g, -r * 0.8, -r * 0.55, r * 1.6, r * 1.1, r * 0.25); g.fill();
      g.shadowBlur = 0;
      // barrel
      const rc = t.recoil * r * 0.25;
      g.fillStyle = white ? '#fff' : '#e8ebff';
      roundRect(g, r * 0.1 - rc, -r * 0.13, r * 1.25, r * 0.26, r * 0.08); g.fill();
      // turret
      g.fillStyle = 'rgba(15,18,32,.35)';
      g.beginPath(); g.arc(0, 0, r * 0.42, 0, Math.PI * 2); g.fill();
      g.fillStyle = white ? '#fff' : '#ffffff';
      g.beginPath(); g.arc(0, 0, r * 0.26, 0, Math.PI * 2); g.fill();
      g.restore();
      if (state !== 'play' || ctx.paused || roundT < 1) {
        const pulse = 0.5 + 0.5 * Math.sin(now * 6);
        g.save();
        g.strokeStyle = U.alpha(t.color, 0.4 + 0.4 * pulse);
        g.lineWidth = r * 0.12;
        g.beginPath(); g.arc(t.x, t.y, r * (1.5 + 0.25 * pulse), 0, Math.PI * 2); g.stroke();
        g.restore();
      }
    }

    function draw() {
      const g = C.g, dpr = C.dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = BG;
      g.fillRect(0, 0, ctx.W, ctx.H);
      const { s, ox, oy } = view;
      g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
      g.fillStyle = '#141832';
      g.fillRect(0, 0, FW, FH);
      // floor grid
      g.strokeStyle = 'rgba(255,255,255,.035)';
      g.lineWidth = 1;
      g.beginPath();
      const step = S / 14;
      for (let x = step; x < FW; x += step) { g.moveTo(x, 0); g.lineTo(x, FH); }
      for (let y = step; y < FH; y += step) { g.moveTo(0, y); g.lineTo(FW, y); }
      g.stroke();
      // border
      g.save();
      g.strokeStyle = '#4a57a0';
      g.lineWidth = 3;
      g.shadowColor = '#6c7cff';
      g.shadowBlur = 10;
      g.strokeRect(-1.5, -1.5, FW + 3, FH + 3);
      g.restore();
      // walls
      g.save();
      for (const r of walls) {
        g.shadowColor = '#6c7cff'; g.shadowBlur = 14;
        g.fillStyle = '#2a3263';
        roundRect(g, r.x, r.y, r.w, r.h, Math.min(r.w, r.h) * 0.25); g.fill();
        g.shadowBlur = 0;
        g.strokeStyle = '#7f8cff';
        g.lineWidth = 2;
        g.stroke();
      }
      g.restore();
      const now = performance.now() / 1000;
      // dead tanks (wreck)
      for (const t of tanks) if (!t.alive) {
        g.save();
        g.translate(t.x, t.y); g.rotate(t.a);
        g.globalAlpha = 0.35;
        g.fillStyle = '#555c7a';
        roundRect(g, -RT * 0.8, -RT * 0.55, RT * 1.6, RT * 1.1, RT * 0.25); g.fill();
        g.restore();
      }
      for (const t of tanks) if (t.alive) drawTank(g, t, now);
      // bullets
      for (const b of bullets) {
        g.save();
        g.strokeStyle = U.alpha(b.color, 0.45);
        g.lineWidth = BR * 1.2;
        g.lineCap = 'round';
        g.beginPath();
        for (let k = 0; k < b.trail.length; k += 2) { if (k === 0) g.moveTo(b.trail[k], b.trail[k + 1]); else g.lineTo(b.trail[k], b.trail[k + 1]); }
        g.stroke();
        g.shadowColor = b.color; g.shadowBlur = 12;
        g.fillStyle = b.color;
        g.beginPath(); g.arc(b.x, b.y, BR * 1.25, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(b.x, b.y, BR * 0.6, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      // rings
      for (const r of rings) {
        const life = r.big ? 0.7 : 0.35, k = r.t / life;
        g.strokeStyle = U.alpha(r.c, 1 - k);
        g.lineWidth = RT * 0.15;
        g.beginPath(); g.arc(r.x, r.y, RT * (1 + k * (r.big ? 3 : 1.2)), 0, Math.PI * 2); g.stroke();
      }
      for (const p of parts) {
        const k = 1 - p.t / p.life;
        g.globalAlpha = k;
        g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, p.r * (0.4 + k), 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    }

    newRound();
  },
});
