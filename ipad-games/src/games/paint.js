registerGame({
  id: 'paint',
  title: 'Покраска',
  emoji: '🖌️',
  desc: 'Закрась своим цветом больше всех',
  rules: 'Твой валик катится сам и красит поле своим цветом.\nДержи ◀ или ▶ в своей зоне, чтобы поворачивать.\nЧужую краску можно закрашивать.\nБонусы: 🖌️ широкая кисть, ⚡ скорость, 💣 клякса.\nЧерез 60 секунд побеждает тот, у кого больше процентов поля.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const DUR = 60;
    const DEPTH = 0.2;
    const BG = '#0f1220';
    const ARW_L = '◀︎', ARW_R = '▶︎';

    ctx.root.classList.add('g-paint');
    ctx.root.append(U.h('style', null, `
      .g-paint .zone-inner{display:flex;align-items:stretch;gap:1.6vmin;padding:1.5vmin}
      .g-paint .cb{flex:1 1 0;max-width:27vmin;border-radius:3vmin;border:.5vmin solid var(--pc);color:var(--pc);
        background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;
        font-size:8vmin;font-weight:900;touch-action:none;transition:transform .07s,background .07s,box-shadow .07s}
      .g-paint .cb.on{background:var(--pc);color:#0f1220;transform:scale(.95);box-shadow:0 0 3.5vmin var(--pc)}
      .g-paint .info{flex:1.1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
        color:var(--pc);font-weight:900;text-align:center;pointer-events:none}
      .g-paint .pct{font-size:7vmin;line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums}
      .g-paint .pct.lead::after{content:' 👑';font-size:3.6vmin;vertical-align:middle}
      .g-paint .sub{font-size:2.8vmin;margin-top:1vmin;white-space:nowrap;color:#e8ebff;opacity:.9;font-variant-numeric:tabular-nums}
      .g-paint .sub.hot{color:#ff6b6b;opacity:1}
      .g-paint .bar{width:90%;height:1vmin;border-radius:1vmin;background:rgba(255,255,255,.1);margin-top:1vmin;overflow:hidden}
      .g-paint .bar i{display:block;height:100%;background:#e8ebff;opacity:.8;width:100%}
    `));

    const C = ctx.canvas();

    /* ---------- controls ---------- */
    const allBtns = [];
    function btn(label) {
      const b = U.h('div', { class: 'cb' }, label);
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
      const pct = U.h('div', { class: 'pct' }, '0%');
      const sub = U.h('div', { class: 'sub' }, '1:00');
      const barI = U.h('i');
      z.el.append(L, U.h('div', { class: 'info' }, pct, sub, U.h('div', { class: 'bar' }, barI)), R);
      return { z, L, R, pct, sub, barI, last: '' };
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
      // keep the core exit button (2p: middle of left edge, 3p: middle of top edge) off the field
      const ex = 46;
      const exL = ctx.n === 2 ? ex : 0, exT = ctx.n === 2 ? 0 : ex;
      return { x: l + m + exL, y: t + m + exT, w: Math.max(120, ctx.W - l - r - 2 * m - exL), h: Math.max(120, ctx.H - t - b - 2 * m - exT) };
    }
    const fr0 = fieldRect();
    const S = Math.sqrt(fr0.w * fr0.h);
    const CS = Math.max(8, Math.round(S / 62)); // cell size
    const gw = Math.max(10, Math.floor(fr0.w / CS)), gh = Math.max(10, Math.floor(fr0.h / CS));
    const FW = gw * CS, FH = gh * CS;
    const TOTAL = gw * gh;
    let view = { s: 1, ox: 0, oy: 0 };
    function updView() {
      const fr = fieldRect();
      const s = Math.min(fr.w / FW, fr.h / FH);
      view = { s, ox: fr.x + (fr.w - FW * s) / 2, oy: fr.y + (fr.h - FH * s) / 2 };
    }
    updView();
    ctx.onResize(updView);

    /* ---------- paint grid ---------- */
    const owner = new Int8Array(TOTAL).fill(-1);
    const counts = ctx.players.map(() => 0);
    const off = document.createElement('canvas');
    off.width = gw; off.height = gh;
    const og = off.getContext('2d');
    // pre-made 1x1 colors
    function paintCircle(x, y, r, who) {
      const x0 = Math.max(0, Math.floor((x - r) / CS)), x1 = Math.min(gw - 1, Math.floor((x + r) / CS));
      const y0 = Math.max(0, Math.floor((y - r) / CS)), y1 = Math.min(gh - 1, Math.floor((y + r) / CS));
      const r2 = r * r;
      og.fillStyle = ctx.players[who].color;
      for (let cy = y0; cy <= y1; cy++) {
        const dy = (cy + .5) * CS - y;
        for (let cx = x0; cx <= x1; cx++) {
          const dx = (cx + .5) * CS - x;
          if (dx * dx + dy * dy > r2) continue;
          const k = cy * gw + cx;
          const o = owner[k];
          if (o === who) continue;
          if (o >= 0) counts[o]--;
          owner[k] = who;
          counts[who]++;
          og.fillRect(cx, cy, 1, 1);
        }
      }
    }

    /* ---------- blobs ---------- */
    const R0 = CS * 2.3;
    const SPEED = S * 0.21;
    const TURN = 3.3;
    const edge = Math.max(R0 * 2.5, Math.min(FW, FH) * 0.12);
    const blobs = ctx.players.map(p => {
      const v = ctx.inward(p.i);
      let x, y;
      if (p.side === 'bottom') { x = FW / 2; y = FH - edge; }
      else if (p.side === 'top') { x = FW / 2; y = edge; }
      else if (p.side === 'left') { x = edge; y = FH / 2; }
      else { x = FW - edge; y = FH / 2; }
      if (ctx.n === 2) x += (p.side === 'bottom' ? -1 : 1) * FW * 0.12;
      const b = { i: p.i, color: p.color, x, y, a: Math.atan2(v.y, v.x), big: 0, fast: 0, bump: 0, roll: 0 };
      paintCircle(x, y, R0 * 1.3, p.i);
      return b;
    });

    /* ---------- power-ups ---------- */
    const PU = {
      big: { em: '🖌️', label: 'Широкая кисть!', col: '#c58bff' },
      fast: { em: '⚡', label: 'Скорость!', col: '#3ddc97' },
      bomb: { em: '💣', label: 'Клякса!', col: '#ff9f43' },
    };
    let pups = [];
    let floaters = [];
    let parts = [];
    function spawnPU() {
      if (state !== 'play' || pups.length >= 2) return;
      const pr = CS * 1.6;
      for (let tries = 0; tries < 30; tries++) {
        const x = U.rand(pr * 2, FW - pr * 2), y = U.rand(pr * 2, FH - pr * 2);
        if (blobs.some(b => U.dist(b.x, b.y, x, y) < S * 0.18)) continue;
        if (pups.some(q => U.dist(q.x, q.y, x, y) < S * 0.15)) continue;
        pups.push({ x, y, r: pr, type: U.pick(['big', 'fast', 'bomb', 'big', 'fast']), t: 0, life: 10 });
        return;
      }
    }

    let state = 'play';
    let elapsed = 0;
    let lastTick = -1;
    let nextPU = 4;

    function fmt(t) {
      t = Math.max(0, Math.ceil(t));
      return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    }
    function renderUI() {
      const left = DUR - elapsed;
      const best = Math.max(...counts);
      ui.forEach((u, i) => {
        const pc = Math.round(counts[i] / TOTAL * 100);
        const b = blobs[i];
        let eff = '';
        if (b.big > 0) eff += ' 🖌️' + Math.ceil(b.big);
        if (b.fast > 0) eff += ' ⚡' + Math.ceil(b.fast);
        const key = pc + '|' + fmt(left) + eff + (counts[i] === best && best > 0);
        if (key === u.last) return;
        u.last = key;
        u.pct.textContent = pc + '%';
        u.pct.classList.toggle('lead', counts[i] === best && best > 0 && counts.filter(c => c === best).length === 1);
        u.sub.textContent = '⏱ ' + fmt(left) + eff;
        u.sub.classList.toggle('hot', left <= 10);
        u.barI.style.width = (Math.max(0, left) / DUR * 100).toFixed(1) + '%';
      });
    }

    function finish() {
      state = 'over';
      let pcs = counts.map(c => Math.round(c / TOTAL * 100));
      if (new Set(pcs).size < pcs.length) pcs = counts.map(c => Math.round(c / TOTAL * 1000) / 10);
      const best = Math.max(...counts);
      const winners = counts.map((c, i) => c === best ? i : -1).filter(i => i >= 0);
      const msg = ctx.players.map(p => `${p.name} ${pcs[p.i]}%`).join(' · ');
      if (winners.length === 1) {
        const p = ctx.players[winners[0]];
        say(`${p.name}: ${pcs[p.i]}%!`, { color: p.color, fg: '#111', ms: 1800 });
      } else say('Ничья!', { ms: 1800 });
      ctx.after(1900, () => ctx.end({ winners, scores: pcs, msg }));
    }

    ctx.onStart = () => say('Крась!', { ms: 800, color: '#3ddc97', fg: '#0f1220' });

    ctx.loop((dt) => {
      if (dt > 0 && state === 'play') update(dt);
      if (dt > 0) {
        for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        parts = parts.filter(p => p.t < p.life);
        for (const f of floaters) f.t += dt;
        floaters = floaters.filter(f => f.t < 1.4);
      }
      renderUI();
      draw();
    });

    function update(dt) {
      elapsed += dt;
      const left = DUR - elapsed;
      if (left <= 3.999 && Math.ceil(left) !== lastTick && left > 0) {
        lastTick = Math.ceil(left);
        say(String(lastTick), { ms: 700, size: 40 });
      }
      if (elapsed >= nextPU) { spawnPU(); nextPU = elapsed + U.rand(4.5, 7.5); }
      for (const b of blobs) {
        const u = ui[b.i];
        const turn = (u.R.ids.size ? 1 : 0) - (u.L.ids.size ? 1 : 0);
        b.a += turn * TURN * dt;
        b.big = Math.max(0, b.big - dt);
        b.fast = Math.max(0, b.fast - dt);
        b.bump = Math.max(0, b.bump - dt);
        const sp = SPEED * (b.fast > 0 ? 1.65 : 1);
        const R = R0 * (b.big > 0 ? 1.8 : 1);
        b.r = R;
        const dist = sp * dt;
        const steps = Math.max(1, Math.ceil(dist / (CS * 0.5)));
        for (let k = 0; k < steps; k++) {
          b.x += Math.cos(b.a) * dist / steps;
          b.y += Math.sin(b.a) * dist / steps;
          const rr = R0 * 0.9; // body radius for bouncing
          if (b.x < rr) { b.x = rr; b.a = Math.PI - b.a; }
          if (b.x > FW - rr) { b.x = FW - rr; b.a = Math.PI - b.a; }
          if (b.y < rr) { b.y = rr; b.a = -b.a; }
          if (b.y > FH - rr) { b.y = FH - rr; b.a = -b.a; }
          paintCircle(b.x, b.y, R, b.i);
        }
        b.roll += dist / (R0 * 0.5);
      }
      // blob-blob bumps
      for (let i = 0; i < blobs.length; i++) for (let j = i + 1; j < blobs.length; j++) {
        const a = blobs[i], b = blobs[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), md = R0 * 1.8;
        if (d >= md || d < 0.001) continue;
        const nx = dx / d, ny = dy / d, ov = (md - d) / 2;
        a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
        const reflect = (o, mx, my) => {
          const vx = Math.cos(o.a), vy = Math.sin(o.a), dot = vx * mx + vy * my;
          if (dot > 0) o.a = Math.atan2(vy - 2 * dot * my, vx - 2 * dot * mx);
        };
        reflect(a, nx, ny); reflect(b, -nx, -ny);
        if (a.bump <= 0) burst((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffffff', 10);
        a.bump = b.bump = 0.25;
      }
      // power-ups
      for (const q of pups) q.t += dt;
      pups = pups.filter(q => {
        if (q.t > q.life) return false;
        for (const b of blobs) {
          if (U.dist(b.x, b.y, q.x, q.y) < R0 + q.r) {
            const def = PU[q.type];
            if (q.type === 'big') b.big = 5;
            else if (q.type === 'fast') b.fast = 5;
            else paintCircle(q.x, q.y, CS * 6, b.i);
            burst(q.x, q.y, q.type === 'bomb' ? b.color : def.col, q.type === 'bomb' ? 40 : 18);
            floaters.push({ x: b.x, y: b.y, text: def.label, i: b.i, t: 0, col: b.color });
            return false;
          }
        }
        return true;
      });
      if (elapsed >= DUR) finish();
    }

    function burst(x, y, c, n) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2, v = U.rand(30, 160) * S / 700;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(.35, .8), t: 0, c });
      }
    }

    function draw() {
      const g = C.g, dpr = C.dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = BG;
      g.fillRect(0, 0, ctx.W, ctx.H);
      const { s, ox, oy } = view;
      g.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
      g.fillStyle = '#151a35';
      g.fillRect(0, 0, FW, FH);
      // painted cells
      g.imageSmoothingEnabled = false;
      g.globalAlpha = 0.82;
      g.drawImage(off, 0, 0, FW, FH);
      g.globalAlpha = 1;
      g.imageSmoothingEnabled = true;
      // cell grid
      g.strokeStyle = 'rgba(15,18,32,.55)';
      g.lineWidth = Math.max(1, 1.2 / s);
      g.beginPath();
      for (let x = CS; x < FW; x += CS) { g.moveTo(x, 0); g.lineTo(x, FH); }
      for (let y = CS; y < FH; y += CS) { g.moveTo(0, y); g.lineTo(FW, y); }
      g.stroke();
      // border
      g.save();
      g.strokeStyle = '#3a4580';
      g.lineWidth = 3;
      g.shadowColor = '#6c7cff';
      g.shadowBlur = 10;
      g.strokeRect(-1.5, -1.5, FW + 3, FH + 3);
      g.restore();

      const now = performance.now() / 1000;
      // power-ups
      for (const q of pups) {
        const blink = q.life - q.t < 2 && Math.floor(now * 8) % 2 === 0;
        if (blink) continue;
        const pop = Math.min(1, q.t * 4);
        const r = q.r * pop * (1 + 0.08 * Math.sin(now * 6));
        const col = PU[q.type].col;
        g.save();
        g.shadowColor = col; g.shadowBlur = 18;
        g.fillStyle = 'rgba(15,18,32,.85)';
        g.strokeStyle = col; g.lineWidth = CS * 0.3;
        g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.fill(); g.stroke();
        g.restore();
        g.font = `${Math.round(r * 1.15)}px sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(PU[q.type].em, q.x, q.y + r * 0.06);
      }
      // blobs
      for (const b of blobs) {
        const R = b.r || R0;
        g.save();
        g.shadowColor = b.color; g.shadowBlur = 22;
        g.fillStyle = b.color;
        g.beginPath(); g.arc(b.x, b.y, R0, 0, Math.PI * 2); g.fill();
        g.shadowBlur = 0;
        if (R > R0 * 1.01) {
          g.strokeStyle = U.alpha('#ffffff', 0.55);
          g.setLineDash([CS * 0.6, CS * 0.5]);
          g.lineWidth = CS * 0.2;
          g.beginPath(); g.arc(b.x, b.y, R, now * 2, now * 2 + Math.PI * 2); g.stroke();
          g.setLineDash([]);
        }
        // roller stripes (rotating)
        g.translate(b.x, b.y);
        g.rotate(b.a);
        g.fillStyle = 'rgba(255,255,255,.9)';
        g.beginPath(); g.arc(R0 * 0.35, 0, R0 * 0.32, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(15,18,32,.45)';
        g.lineWidth = R0 * 0.12;
        const ph = (b.roll % 1) * R0 * 0.6;
        for (let k = -2; k <= 2; k++) {
          const xx = k * R0 * 0.6 - ph + R0 * 0.3;
          if (Math.abs(xx) > R0 * 0.85) continue;
          const hh = Math.sqrt(R0 * R0 - xx * xx) * 0.85;
          g.beginPath(); g.moveTo(xx, -hh); g.lineTo(xx, hh); g.stroke();
        }
        g.restore();
        if (b.fast > 0) {
          g.save();
          g.strokeStyle = U.alpha('#3ddc97', 0.7);
          g.lineWidth = CS * 0.25;
          const ca = Math.cos(b.a), sa = Math.sin(b.a);
          for (let k = -1; k <= 1; k++) {
            const px = b.x - ca * R0 * 1.3 - sa * k * R0 * 0.5, py = b.y - sa * R0 * 1.3 + ca * k * R0 * 0.5;
            g.beginPath(); g.moveTo(px, py); g.lineTo(px - ca * R0 * 0.9, py - sa * R0 * 0.9); g.stroke();
          }
          g.restore();
        }
        if (ctx.paused || elapsed < 1.2) {
          const ca = Math.cos(b.a), sa = Math.sin(b.a), L = R0 * 2.6;
          const pulse = 0.5 + 0.5 * Math.sin(now * 6);
          g.save();
          g.strokeStyle = g.fillStyle = U.alpha(b.color, 0.55 + 0.4 * pulse);
          g.lineWidth = CS * 0.35;
          const tx = b.x + ca * L, ty = b.y + sa * L;
          g.beginPath(); g.moveTo(b.x + ca * R0 * 1.4, b.y + sa * R0 * 1.4); g.lineTo(tx, ty); g.stroke();
          g.beginPath();
          g.moveTo(tx + ca * CS, ty + sa * CS);
          g.lineTo(tx - sa * CS * 0.7, ty + ca * CS * 0.7);
          g.lineTo(tx + sa * CS * 0.7, ty - ca * CS * 0.7);
          g.closePath(); g.fill();
          g.restore();
        }
      }
      // particles
      for (const p of parts) {
        const k = 1 - p.t / p.life;
        g.globalAlpha = k;
        g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, CS * 0.3 * (0.4 + k), 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
      // floating labels, facing their owner
      for (const f of floaters) {
        const k = f.t / 1.4;
        g.save();
        ctx.facing(g, f.i, f.x, f.y);
        g.globalAlpha = 1 - k * k;
        g.font = `900 ${Math.round(CS * 1.7)}px -apple-system, sans-serif`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.lineWidth = CS * 0.4;
        g.strokeStyle = '#0f1220';
        const yy = -R0 * 1.8 - k * CS * 3;
        g.strokeText(f.text, 0, yy);
        g.fillStyle = '#fff';
        g.fillText(f.text, 0, yy);
        g.restore();
      }
    }
  },
});
