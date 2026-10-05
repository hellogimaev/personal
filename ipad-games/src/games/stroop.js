registerGame({
  id: 'stroop',
  title: 'Цвет или слово',
  emoji: '🎨',
  desc: 'Совпадает ли слово с цветом, которым оно написано?',
  rules: 'В центре появляется название цвета, написанное каким-то цветом.\nЕсли слово и цвет букв совпадают, жми «СОВПАДАЕТ», иначе «НЕТ».\nПервый правильный ответ: +1 очко.\nОшибка: −1 очко, и до следующего слова ты пропускаешь.\nИгра идёт до 8 очков.',
  start(ctx) {
    const TARGET = 8;
    const INKS = [
      { word: 'КРАСНЫЙ', color: '#ff2d2d' },
      { word: 'СИНИЙ', color: '#2f6dff' },
      { word: 'ЗЕЛЁНЫЙ', color: '#1fd15a' },
      { word: 'ЖЁЛТЫЙ', color: '#ffe414' },
      { word: 'ФИОЛЕТОВЫЙ', color: '#b44dff' },
      { word: 'БЕЛЫЙ', color: '#ffffff' },
    ];
    const score = ctx.players.map(() => 0);
    let locked = new Set();
    let state = 'gap'; // gap | ask | done
    let card = null;   // {word, ink, match}
    let lastWord = -1;

    ctx.root.classList.add('g-stroop');
    ctx.root.append(U.h('style', null, `
      .g-stroop .wd{position:absolute;left:0;top:0;display:flex;align-items:center;justify-content:center;
        border-radius:22px;background:#2a2f44;box-shadow:0 6px 24px rgba(0,0,0,.35);
        font-weight:900;letter-spacing:1px;white-space:nowrap;transition:background .2s}
      .g-stroop .wd.empty{background:#1b1f31}
      .g-stroop .wd .q{color:#596086}
      .g-stroop .zi{position:absolute;inset:8px;display:flex;gap:10px;align-items:stretch}
      .g-stroop .sc{flex:0 0 86px;border-radius:20px;border:4px solid var(--pc);color:var(--pc);display:flex;flex-direction:column;
        align-items:center;justify-content:center;font-weight:900;background:#151a2c}
      .g-stroop .sc .n{font-size:44px;line-height:1}
      .g-stroop .sc .t{font-size:14px;opacity:.75;margin-top:2px}
      .g-stroop .bt{flex:1;border-radius:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-weight:900;color:#141726;background:#e9ecf6;transition:transform .06s, opacity .15s;min-width:0}
      .g-stroop .bt .i{font-size:34px;line-height:1}
      .g-stroop .bt .l{font-size:22px;margin-top:4px}
      .g-stroop .bt.no{background:#9aa1c4}
      .g-stroop .bt:active{transform:scale(.96)}
      .g-stroop .bt.good{outline:6px solid #fff;background:#3ddc97}
      .g-stroop .bt.wrong{background:#ff4d6d;color:#fff}
      .g-stroop .zi.locked .bt{opacity:.25}
      .g-stroop .zi.locked .bt.wrong{opacity:.6}
    `));

    /* ---------- word copies: one per player, in the center area, facing them ---------- */
    const words = ctx.players.map(() => {
      const el = U.h('div', { class: 'wd empty' });
      ctx.root.append(el);
      return el;
    });

    /* ---------- zones ---------- */
    const exitEnd = (i) => {
      const side = ctx.players[i].side;
      if (side === 'top') return 'right';
      if (side === 'left') return 'left';
      return null;
    };
    const seats = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: 0.2 });
      const inner = U.h('div', { class: 'zi' });
      const scN = U.h('div', { class: 'n' }, '0');
      const sc = U.h('div', { class: 'sc' }, scN, U.h('div', { class: 't' }, 'из ' + TARGET));
      const yes = U.h('div', { class: 'bt yes' }, U.h('div', { class: 'i' }, '✓'), U.h('div', { class: 'l' }, 'СОВПАДАЕТ'));
      const no = U.h('div', { class: 'bt no' }, U.h('div', { class: 'i' }, '✗'), U.h('div', { class: 'l' }, 'НЕТ'));
      ctx.tap(yes, () => answer(p.i, true, yes));
      ctx.tap(no, () => answer(p.i, false, no));
      const end = exitEnd(p.i);
      if (end === 'right') { inner.style.right = '56px'; inner.append(yes, no, sc); } else {
        if (end === 'left') inner.style.left = '56px';
        inner.append(sc, yes, no);
      }
      z.el.append(inner);
      return { z, inner, scN, yes, no };
    });

    /* ---------- layout ---------- */
    const meas = document.createElement('canvas').getContext('2d');
    function textW(txt, fs) {
      meas.font = `900 ${fs}px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`;
      return meas.measureText(txt).width + txt.length * 1; // + letter-spacing
    }
    const LONGEST = INKS.reduce((a, b) => a.word.length > b.word.length ? a : b).word;

    // Slot for each player's copy: rect in screen px (axis-aligned) + its length along the player's edge.
    function slots() {
      const W = ctx.W, H = ctx.H, d = seats[0].z.h, g = 12;
      if (ctx.n === 2) {
        const h = (H - 2 * d - 3 * g) / 2;
        return [
          { x: g, y: H - d - g - h, w: W - 2 * g, h },
          { x: g, y: d + g, w: W - 2 * g, h },
        ];
      }
      const x0 = d + g, w = W - 2 * d - 2 * g, y0 = g, h = H - d - 2 * g;
      const bh = Math.min(h * 0.32, Math.max(110, w * 0.3));
      const sideH = h - bh - g;
      const sw = (w - g) / 2;
      return [
        { x: x0, y: y0 + sideH + g, w, h: bh },
        { x: x0, y: y0, w: sw, h: sideH },
        { x: x0 + sw + g, y: y0, w: sw, h: sideH },
      ];
    }

    function layout() {
      const sl = slots();
      ctx.players.forEach(p => {
        const r = sl[p.i];
        const vertical = p.side === 'left' || p.side === 'right';
        const len = vertical ? r.h : r.w, dep = vertical ? r.w : r.h;
        const bw = Math.min(len, 760), bh = Math.min(dep, 230);
        const el = words[p.i];
        // font that fits the longest word into the box
        let fs = Math.min(bh * 0.55, 110);
        const tw = textW(LONGEST, fs);
        if (tw > bw * 0.9) fs *= bw * 0.9 / tw;
        el.style.width = bw + 'px';
        el.style.height = bh + 'px';
        el.style.fontSize = fs + 'px';
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        el.style.transform = `translate(${cx - bw / 2}px,${cy - bh / 2}px) rotate(${p.rot}deg)`;
      });
      // zone labels: shrink text if the buttons are narrow
      seats.forEach(s => {
        const bw = s.yes.clientWidth;
        const fs = U.clamp(bw / 7.5, 13, 24);
        s.yes.querySelector('.l').style.fontSize = fs + 'px';
        s.no.querySelector('.l').style.fontSize = fs + 'px';
      });
    }
    layout();
    ctx.onResize(layout);

    /* ---------- game ---------- */
    function render() {
      seats.forEach((s, i) => {
        s.scN.textContent = score[i];
        s.inner.classList.toggle('locked', locked.has(i));
      });
    }

    function showWord() {
      words.forEach(el => {
        el.classList.toggle('empty', !card);
        if (!card) { el.replaceChildren(U.h('span', { class: 'q' }, '• • •')); return; }
        el.replaceChildren(U.h('span', { style: { color: INKS[card.ink].color } }, INKS[card.word].word));
      });
    }

    function newCard() {
      if (state === 'done') return;
      locked = new Set();
      seats.forEach(s => { s.yes.classList.remove('good', 'wrong'); s.no.classList.remove('good', 'wrong'); });
      let w;
      do { w = U.randInt(0, INKS.length - 1); } while (w === lastWord);
      lastWord = w;
      const match = Math.random() < 0.4;
      let ink = w;
      if (!match) { do { ink = U.randInt(0, INKS.length - 1); } while (ink === w); }
      card = { word: w, ink, match };
      state = 'ask';
      showWord();
      render();
    }

    function gap(ms) {
      state = 'gap';
      ctx.after(ms, () => {
        card = null;
        showWord();
        ctx.after(450, newCard);
      });
    }

    function answer(i, saysMatch, btn) {
      if (state !== 'ask' || locked.has(i)) return;
      if (saysMatch === card.match) {
        score[i]++;
        btn.classList.add('good');
        state = 'gap';
        render();
        if (score[i] >= TARGET) {
          state = 'done';
          ctx.toast(`${ctx.players[i].name}: +1`, { color: ctx.players[i].color, fg: '#111', ms: 1000 });
          ctx.after(1000, () => ctx.end({ winner: i, scores: score.slice() }));
        } else {
          ctx.toast(`+1 ${ctx.players[i].name}`, { color: ctx.players[i].color, fg: '#111', ms: 800 });
          gap(800);
        }
      } else {
        score[i] = Math.max(0, score[i] - 1);
        locked.add(i);
        btn.classList.add('wrong');
        render();
        if (locked.size === ctx.n) {
          ctx.toast(card.match ? 'Совпадало!' : 'Не совпадало!', { ms: 1000 });
          gap(1100);
        }
      }
    }

    card = null;
    showWord();
    render();
    // first word appears right after the countdown
    ctx.after(300, newCard);
  },
});
