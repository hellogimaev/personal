registerGame({
  id: 'reaction',
  title: 'Реакция',
  emoji: '⚡',
  desc: 'Жми первым, но читай правило раунда',
  rules: 'Перед каждым раундом объявляется его правило:\n🟢 Классика: жми, когда круг стал зелёным.\n🪤 Ловушка: круг мигает обманными цветами, жми только на зелёный.\n🎨 Цвет: жми только на названный цвет.\n✌️ Двойной: на зелёный нажми дважды, быстрее всех.\n🙃 Наоборот: на зелёный жмут все, последний теряет очко.\n⭐ Золотой: победа даёт +2.\nНажал раньше времени: −1. Быстрее 280 мс: ⚡ бонус +1.\nУ лидера кнопка уменьшается. Игра до 6 очков.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const TARGET = 6;
    const n = ctx.n;
    const score = ctx.players.map(() => 0);
    let state = 'intro'; // intro | wait | go | done
    let blocked = new Set();
    let round = 0, variant = null, goAt = 0, timers = [];
    let taps = ctx.players.map(() => 0);
    let pressed = [];
    let target = null;

    const COLS = [
      { name: 'фиолетовый', c: '#b06bff' }, { name: 'оранжевый', c: '#ff8c42' },
      { name: 'розовый', c: '#ff6bd6' }, { name: 'голубой', c: '#4de3ff' }, { name: 'белый', c: '#ffffff' },
    ];
    const VARIANTS = [
      { id: 'classic', icon: '🟢', name: 'Классика', hint: 'жми на зелёный', w: 2 },
      { id: 'trap', icon: '🪤', name: 'Ловушка', hint: 'только зелёный!', w: 2.2 },
      { id: 'color', icon: '🎨', name: 'Цвет', hint: '', w: 2 },
      { id: 'double', icon: '✌️', name: 'Двойной', hint: 'на зелёный: 2 нажатия', w: 1.4 },
      { id: 'reverse', icon: '🙃', name: 'Наоборот', hint: 'последний теряет очко', w: 1.1 },
      { id: 'gold', icon: '⭐', name: 'Золотой раунд', hint: 'победа +2', w: 1 },
    ];

    ctx.root.classList.add('g-reaction');
    ctx.root.append(U.h('style', null, `
      .g-reaction .rb{position:absolute;inset:10px;border-radius:24px;background:var(--pc);opacity:.92;
        display:flex;flex-direction:column;align-items:center;justify-content:center;color:#111;font-weight:900;
        transition:inset .4s, opacity .2s, box-shadow .2s}
      .g-reaction .rb .s{font-size:44px;line-height:1}
      .g-reaction .rb .v{font-size:21px;margin-bottom:4px;background:rgba(0,0,0,.18);border-radius:12px;padding:2px 12px;white-space:nowrap}
      .g-reaction .rb .v:empty{display:none}
      .g-reaction .rb .l{font-size:18px;opacity:.85;margin-top:6px;text-align:center;padding:0 10px;line-height:1.15}
      .g-reaction .rb .sw{display:inline-block;width:18px;height:18px;border-radius:50%;border:2px solid #111;vertical-align:-3px;margin-left:6px}
      .g-reaction .rb .dots{display:flex;gap:8px;margin-top:6px;height:14px}
      .g-reaction .rb .dots i{width:14px;height:14px;border-radius:50%;background:rgba(0,0,0,.25)}
      .g-reaction .rb .dots i.on{background:#111}
      .g-reaction .rb.blocked{opacity:.25}
      .g-reaction .rb.won{box-shadow:0 0 0 6px #fff, 0 0 40px 10px rgba(255,255,255,.6)}
      .g-reaction .rb.lost{box-shadow:0 0 0 6px #ff4d6d}
      .g-reaction .rb.shake{animation:grShake .4s linear}
      .g-reaction .rb .crown{position:absolute;top:6px;right:12px;font-size:22px}
      @keyframes grShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-12px)}40%{transform:translateX(10px)}
        60%{transform:translateX(-7px)}80%{transform:translateX(4px)}}
      .g-reaction .sig{position:absolute;left:50%;top:50%;border-radius:50%;transform:translate(-50%,-50%);
        background:#3a405f;box-shadow:0 0 0 10px rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;
        font-size:64px;z-index:2;transition:transform .12s}
      .g-reaction .sig.pop{transform:translate(-50%,-50%) scale(1.08)}
    `));

    const { g } = ctx.canvas({ z: 3 });
    g.canvas.style.pointerEvents = 'none';
    const parts = [];

    const sig = U.h('div', { class: 'sig' });
    ctx.root.append(sig);
    const sizeSig = () => {
      const s = Math.min(ctx.W, ctx.H) * 0.3;
      sig.style.width = sig.style.height = s + 'px';
    };
    sizeSig();
    ctx.onResize(sizeSig);
    function setSig(color, glow, text) {
      sig.style.background = color;
      sig.style.boxShadow = glow ? `0 0 70px 16px ${U.alpha(color.length === 7 ? color : '#ffffff', 0.55)}` : '0 0 0 10px rgba(255,255,255,.04)';
      sig.textContent = text || '';
      sig.classList.remove('pop'); void sig.offsetWidth; if (glow) sig.classList.add('pop');
    }

    const zones = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: 0.24 });
      const s = U.h('div', { class: 's' }, '0');
      const l = U.h('div', { class: 'l' }, '');
      const v = U.h('div', { class: 'v' }, '');
      const dots = U.h('div', { class: 'dots' });
      const crown = U.h('div', { class: 'crown' }, '');
      const b = U.h('div', { class: 'rb' }, crown, v, s, l, dots);
      z.el.append(b);
      ctx.tap(b, () => press(p.i));
      return { z, b, s, l, v, dots, crown };
    });

    function burst(i, color, count = 26) {
      const r = zones[i].z.rect, v = ctx.inward(i);
      const x = r.x + r.w / 2 + v.x * r.d * 0.5, y = r.y + r.h / 2 + v.y * r.d * 0.5;
      for (let k = 0; k < count; k++) {
        const a = Math.atan2(v.y, v.x) + U.rand(-1.3, 1.3), sp = U.rand(150, 520);
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: color, r: U.rand(3, 7) });
      }
    }
    function centerBurst(color) {
      for (let k = 0; k < 40; k++) {
        const a = Math.random() * 6.283, sp = U.rand(120, 480);
        parts.push({ x: ctx.W / 2, y: ctx.H / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: color, r: U.rand(3, 8) });
      }
    }
    ctx.loop((dt) => {
      g.clearRect(0, 0, ctx.W, ctx.H);
      for (const p of parts) {
        if (dt > 0) { p.life -= dt * 1.4; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
        if (p.life <= 0) continue;
        g.globalAlpha = Math.min(1, p.life * 1.5);
        g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
      }
      g.globalAlpha = 1;
      for (let k = parts.length - 1; k >= 0; k--) if (parts[k].life <= 0) parts.splice(k, 1);
    });

    function render() {
      const sorted = score.slice().sort((a, b) => b - a);
      zones.forEach((zz, i) => {
        zz.s.textContent = score[i];
        zz.b.classList.toggle('blocked', blocked.has(i));
        // comeback: the leader's button shrinks a bit
        const lead = score[i] === sorted[0] ? score[i] - sorted[1] : 0;
        const inset = 10 + Math.min(20, Math.max(0, lead) * 7);
        zz.b.style.inset = inset + 'px';
        zz.crown.textContent = lead > 0 ? '👑' : '';
        zz.dots.replaceChildren();
        if (variant && variant.id === 'double' && state !== 'intro') {
          for (let k = 0; k < 2; k++) zz.dots.append(U.h('i', { class: taps[i] > k ? 'on' : '' }));
        }
      });
    }
    function label(text, sw) {
      zones.forEach(zz => {
        zz.l.replaceChildren(text);
        if (sw) zz.l.append(U.h('span', { class: 'sw', style: { background: sw } }));
        zz.v.textContent = variant ? `${variant.icon} ${variant.name}` : '';
      });
    }
    function later(ms, fn) { const id = ctx.after(ms, fn); timers.push(id); return id; }
    function clearTimers() { timers.forEach(id => ctx.cancel(id)); timers = []; }

    function pickVariant() {
      if (round === 1) return VARIANTS[0];
      let tot = 0; VARIANTS.forEach(v => { tot += (v === variant ? v.w * 0.3 : v.w); });
      let r = Math.random() * tot;
      for (const v of VARIANTS) { r -= (v === variant ? v.w * 0.3 : v.w); if (r <= 0) return v; }
      return VARIANTS[0];
    }

    function newRound() {
      clearTimers();
      round++;
      state = 'intro';
      blocked = new Set();
      taps = ctx.players.map(() => 0);
      pressed = [];
      zones.forEach(zz => zz.b.classList.remove('won', 'lost'));
      variant = pickVariant();
      target = variant.id === 'color' ? U.pick(COLS) : null;
      const hint = variant.id === 'color' ? `жми только на ${target.name.toUpperCase()}` : variant.hint;
      setSig('#3a405f', false, variant.icon);
      if (target) { sig.style.boxShadow = `0 0 0 10px ${target.c}`; }
      ctx.toast(`${variant.icon} ${variant.name}: ${hint}`, { ms: 1500, color: variant.id === 'gold' ? '#ffd84a' : undefined, fg: variant.id === 'gold' ? '#111' : undefined });
      label(hint, target && target.c);
      render();
      // waits get shorter as the game goes on
      const speed = Math.max(0.6, 1 - round * 0.04);
      later(1500, () => {
        state = 'wait';
        setSig('#3a405f', false, '');
        if (target) sig.style.boxShadow = `0 0 0 10px ${target.c}`;
        render();
        const wait = U.rand(1300, 3800) * speed;
        if (variant.id === 'trap') {
          // 1-3 fake flashes before the real green
          const k = U.randInt(1, 3);
          for (let j = 0; j < k; j++) {
            const at = wait * (j + 1) / (k + 1);
            const fake = U.pick(['#ff4d6d', '#ff8c42', '#b06bff', '#4de3ff', '#ffd84a']);
            later(at, () => { if (state === 'wait') setSig(fake, true, U.pick(['❗', '', '⚠️'])); });
            later(at + 380, () => { if (state === 'wait') setSig('#3a405f', false, ''); });
          }
        }
        if (variant.id === 'color') {
          const fakes = U.randInt(2, 4);
          const others = COLS.filter(c => c !== target).concat([{ c: '#3ddc97' }, { c: '#ff4d6d' }]);
          let at = 500;
          for (let j = 0; j <= fakes; j++) {
            const real = j === fakes;
            const col = real ? target.c : U.pick(others).c;
            const t0 = at;
            later(t0, () => {
              if (state !== 'wait') return;
              setSig(col, true, '');
              if (real) { state = 'go'; goAt = ctx.time; }
            });
            if (!real) later(t0 + 550, () => { if (state === 'wait') setSig('#3a405f', false, ''); });
            at += U.rand(800, 1300) * speed;
          }
          later(at + 1500, () => { if (state === 'go') { state = 'done'; label('никто не успел'); later(800, newRound); } });
          return;
        }
        later(wait, go);
      });
    }

    function go() {
      if (state !== 'wait') return;
      state = 'go';
      goAt = ctx.time;
      if (variant.id === 'gold') setSig('#ffd84a', true, '⭐');
      else setSig('#3ddc97', true, variant.id === 'double' ? '✌️' : variant.id === 'reverse' ? '🙃' : '');
      if (variant.id === 'reverse') {
        // anybody who did not press within 2.2s loses too
        later(2200, () => {
          if (state !== 'go') return;
          const losers = ctx.players.map(p => p.i).filter(i => !pressed.includes(i) && !blocked.has(i));
          finishReverse(losers);
        });
      }
    }

    function falseStart(i) {
      score[i] = Math.max(0, score[i] - 1);
      blocked.add(i);
      const zz = zones[i];
      zz.b.classList.remove('shake'); void zz.b.offsetWidth; zz.b.classList.add('shake');
      burst(i, '#ff4d6d', 14);
      ctx.toast(`${ctx.players[i].name}: фальстарт! −1`, { color: ctx.players[i].color, fg: '#111' });
      render();
      if (blocked.size >= n || (variant.id === 'reverse' && blocked.size >= n - 1 && state === 'wait')) {
        clearTimers(); state = 'done'; setSig('#3a405f', false, '😬'); later(1000, newRound);
      }
    }

    function press(i) {
      if (state === 'done' || state === 'intro' || blocked.has(i)) return;
      if (state === 'wait') return falseStart(i);
      // state === 'go'
      if (variant.id === 'reverse') {
        if (pressed.includes(i)) return;
        pressed.push(i);
        zones[i].b.classList.add('won');
        burst(i, '#3ddc97', 12);
        const left = ctx.players.map(p => p.i).filter(k => !pressed.includes(k) && !blocked.has(k));
        if (left.length <= 1) finishReverse(left);
        return;
      }
      if (variant.id === 'double') {
        taps[i]++;
        render();
        if (taps[i] < 2) { burst(i, '#ffffff', 6); return; }
      }
      win(i);
    }

    function finishReverse(losers) {
      if (state !== 'go') return;
      state = 'done';
      clearTimers();
      setSig('#3a405f', false, '🙃');
      losers.forEach(i => {
        score[i] = Math.max(0, score[i] - 1);
        zones[i].b.classList.add('lost');
        burst(i, '#ff4d6d', 20);
      });
      ctx.toast(losers.length ? `🙃 ${losers.map(i => ctx.players[i].name).join(', ')}: −1` : '🙃 Все успели!', { ms: 1300 });
      render();
      later(1500, newRound);
    }

    function win(i) {
      state = 'done';
      clearTimers();
      const ms = Math.round((ctx.time - goAt) * 1000);
      let pts = variant.id === 'gold' ? 2 : 1;
      const fast = ms < 280;
      if (fast) pts++;
      score[i] += pts;
      zones[i].b.classList.add('won');
      burst(i, ctx.players[i].color, 30);
      burst(i, '#ffffff', 12);
      centerBurst(variant.id === 'gold' ? '#ffd84a' : '#3ddc97');
      setSig('#3a405f', false, '');
      render();
      if (score[i] >= TARGET) {
        later(900, () => ctx.end({ winner: i, scores: score.slice() }));
      } else {
        ctx.toast(`${fast ? '⚡ Молния! ' : ''}${ctx.players[i].name} +${pts} · ${ms} мс`, { color: ctx.players[i].color, fg: '#111', ms: 1300 });
        later(1500, newRound);
      }
    }

    newRound();
  },
});
