registerGame({
  id: 'stroop',
  title: 'Цвет или слово',
  emoji: '🎨',
  desc: 'Слово, цвет букв и хитрые карточки-ловушки',
  rules: 'Появляется название цвета, написанное каким-то цветом. Перед словом показан тип карточки:\n✓✗ Совпадает? Слово и цвет букв совпадают: «СОВПАДАЕТ», иначе «НЕТ».\n🔄 Наоборот: отвечай противоположное.\n🎯 Цвет букв: нажми кнопку того цвета, которым написано слово.\n📖 Что написано: нажми цвет, который назван словом.\n⚡ Блиц: 2 секунды на ответ, +2.\n🦎 Хамелеон: цвет букв меняется на глазах, отвечай по текущему.\n💰 Золотая карточка: очки ×2. 🔥 Три верных подряд: +1.\nПервый верный ответ получает очки. Ошибка: −1 и пропуск карточки. Игра до 10 очков.',
  start(ctx) {
    const TARGET = 10;
    const INKS = [
      { word: 'КРАСНЫЙ', color: '#ff2d2d' },
      { word: 'СИНИЙ', color: '#2f6dff' },
      { word: 'ЗЕЛЁНЫЙ', color: '#1fd15a' },
      { word: 'ЖЁЛТЫЙ', color: '#ffe414' },
      { word: 'ФИОЛЕТОВЫЙ', color: '#b44dff' },
      { word: 'БЕЛЫЙ', color: '#ffffff' },
    ];
    const TYPES = {
      classic: { icon: '✓✗', text: 'Совпадает?', w: 30 },
      reverse: { icon: '🔄', text: 'Наоборот!', w: 14 },
      ink: { icon: '🎯', text: 'Цвет букв', w: 16 },
      word: { icon: '📖', text: 'Что написано', w: 12 },
      blitz: { icon: '⚡', text: 'Блиц: 2 сек, +2', w: 14 },
      chameleon: { icon: '🦎', text: 'Хамелеон', w: 14 },
    };
    const BLITZ = 2.0;
    const score = ctx.players.map(() => 0);
    const streak = ctx.players.map(() => 0);
    let locked = new Set();
    let state = 'gap'; // gap | ask | done
    let card = null;   // {type, word, ink, gold, opts, deadline}
    let nextType = 'classic', nextGold = false;
    let lastWord = -1, cardNo = 0;
    let chamTimer = null;

    ctx.root.classList.add('g-stroop');
    ctx.root.append(U.h('style', null, `
      .g-stroop .wd{position:absolute;left:0;top:0;display:flex;align-items:center;justify-content:center;
        border-radius:22px;background:#2a2f44;box-shadow:0 6px 24px rgba(0,0,0,.35);border:4px solid transparent;
        font-weight:900;letter-spacing:1px;white-space:nowrap;transition:background .2s,border-color .2s;overflow:hidden}
      .g-stroop .wd .w{font-size:var(--ws);transition:color .12s}
      .g-stroop .wd .tag{position:absolute;left:0;right:0;top:7%;text-align:center;font-size:var(--ts);letter-spacing:0;color:#c9cee6}
      .g-stroop .wd .res{position:absolute;left:0;right:0;bottom:7%;text-align:center;font-size:var(--ts);letter-spacing:0}
      .g-stroop .wd .big{font-size:calc(var(--ts) * 1.7);color:#e9ecf6;letter-spacing:0}
      .g-stroop .wd .bar{position:absolute;left:0;bottom:0;height:8px;background:#ffd23c;width:100%}
      .g-stroop .wd.empty{background:#1b1f31}
      .g-stroop .wd .q{color:#596086}
      .g-stroop .wd.t-reverse{border-color:#ff9d2e}
      .g-stroop .wd.t-reverse .tag{color:#ff9d2e}
      .g-stroop .wd.t-blitz{border-color:#ffd23c}
      .g-stroop .wd.t-ink,.g-stroop .wd.t-word{border-color:#7fd4ff}
      .g-stroop .wd.t-chameleon{border-color:#61e3a5}
      .g-stroop .wd.gold{background:linear-gradient(135deg,#4a3a10,#2a2f44 45%,#2a2f44 55%,#4a3a10);box-shadow:0 0 30px rgba(255,200,40,.45)}
      .g-stroop .wd.pop{animation:stPop .35s}
      @keyframes stPop{0%{transform:var(--tf) scale(.85)}60%{transform:var(--tf) scale(1.05)}100%{transform:var(--tf) scale(1)}}
      .g-stroop .zi{position:absolute;inset:8px;display:flex;gap:10px;align-items:stretch}
      .g-stroop .sc{flex:0 0 86px;border-radius:20px;border:4px solid var(--pc);color:var(--pc);display:flex;flex-direction:column;
        align-items:center;justify-content:center;font-weight:900;background:#151a2c;position:relative}
      .g-stroop .sc .n{font-size:44px;line-height:1}
      .g-stroop .sc .t{font-size:14px;opacity:.75;margin-top:2px}
      .g-stroop .sc .fl{position:absolute;top:-8px;right:-8px;font-size:20px;line-height:1}
      .g-stroop .sc.bump{animation:stBump .45s}
      @keyframes stBump{40%{transform:scale(1.2)}}
      .g-stroop .grp{flex:1;display:flex;gap:10px;min-width:0}
      .g-stroop .grp.hide{display:none}
      .g-stroop .bt{flex:1;border-radius:20px;display:flex;flex-direction:column;align-items:center;justify-content:center;
        font-weight:900;color:#141726;background:#e9ecf6;transition:transform .06s, opacity .15s;min-width:0;position:relative}
      .g-stroop .bt .i{font-size:34px;line-height:1}
      .g-stroop .bt .l{font-size:22px;margin-top:4px}
      .g-stroop .bt.no{background:#9aa1c4}
      .g-stroop .bt.sw{border:4px solid rgba(255,255,255,.25)}
      .g-stroop .bt:active{transform:scale(.96)}
      .g-stroop .bt.good{outline:6px solid #fff;background:#3ddc97}
      .g-stroop .bt.sw.good{outline:6px solid #fff}
      .g-stroop .bt.sw.good::after{content:'✓';font-size:44px;color:#111;text-shadow:0 0 6px #fff}
      .g-stroop .bt.wrong{background:#ff4d6d;color:#fff}
      .g-stroop .bt.sw.wrong::after{content:'✗';font-size:44px;color:#111}
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
    const seats = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: 0.2 });
      const inner = U.h('div', { class: 'zi' });
      const scN = U.h('div', { class: 'n' }, '0');
      const fl = U.h('div', { class: 'fl' });
      const sc = U.h('div', { class: 'sc' }, scN, U.h('div', { class: 't' }, 'из ' + TARGET), fl);
      const yes = U.h('div', { class: 'bt yes' }, U.h('div', { class: 'i' }, '✓'), U.h('div', { class: 'l' }, 'СОВПАДАЕТ'));
      const no = U.h('div', { class: 'bt no' }, U.h('div', { class: 'i' }, '✗'), U.h('div', { class: 'l' }, 'НЕТ'));
      ctx.tap(yes, () => answer(p.i, true, yes));
      ctx.tap(no, () => answer(p.i, false, no));
      const two = U.h('div', { class: 'grp' }, yes, no);
      const sws = [0, 1, 2, 3].map(k => {
        const b = U.h('div', { class: 'bt sw' });
        ctx.tap(b, () => answer(p.i, b._color, b));
        return b;
      });
      const four = U.h('div', { class: 'grp hide' }, ...sws);
      inner.append(sc, two, four);
      z.el.append(inner);
      return { z, inner, sc, scN, fl, yes, no, two, four, sws };
    });

    /* ---------- layout ---------- */
    const meas = document.createElement('canvas').getContext('2d');
    function textW(txt, fs) {
      meas.font = `900 ${fs}px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`;
      return meas.measureText(txt).width + txt.length * 1; // + letter-spacing
    }
    const LONGEST = INKS.reduce((a, b) => a.word.length > b.word.length ? a : b).word;

    // Slots stay clear of the exit button (2p: middle of the left edge, 3p: middle of the top edge).
    // Slot for each player's copy: rect in screen px (axis-aligned).
    function slots() {
      const W = ctx.W, H = ctx.H, d = seats[0].z.h, g = 12;
      if (ctx.n === 2) {
        const h = (H - 2 * d - 3 * g) / 2;
        return [
          { x: 56, y: H - d - g - h, w: W - 112, h },
          { x: 56, y: d + g, w: W - 112, h },
        ];
      }
      const x0 = d + g, w = W - 2 * d - 2 * g, y0 = 52, h = H - d - g - y0;
      const bh = Math.min(h * 0.32, Math.max(130, w * 0.3));
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
        const bw = Math.min(len, 760), bh = Math.min(dep, 240);
        const el = words[p.i];
        // font that fits the longest word into the box, leaving room for the tag and result lines
        let fs = Math.min(bh * 0.4, 110);
        const tw = textW(LONGEST, fs);
        if (tw > bw * 0.9) fs *= bw * 0.9 / tw;
        el.style.width = bw + 'px';
        el.style.height = bh + 'px';
        el.style.setProperty('--ws', fs + 'px');
        el.style.setProperty('--ts', U.clamp(bh * 0.13, 15, 28) + 'px');
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        const tf = `translate(${cx - bw / 2}px,${cy - bh / 2}px) rotate(${p.rot}deg)`;
        el.style.setProperty('--tf', tf);
        el.style.transform = tf;
      });
      // zone labels: shrink text if the buttons are narrow
      seats.forEach(s => {
        const bw = (s.z.w - 16 - 86 - 20) / 2;
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
        s.fl.textContent = streak[i] >= 2 ? '🔥'.repeat(streak[i]) : '';
        const four = card && (card.type === 'ink' || card.type === 'word');
        s.two.classList.toggle('hide', !!four);
        s.four.classList.toggle('hide', !four);
      });
    }

    function bump(i) {
      const sc = seats[i].sc;
      sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump');
    }

    // result line under the word in every copy (instead of toasts, which would cover the word)
    function showResult(text, color) {
      words.forEach(el => { el.querySelector('.res')?.remove(); el.append(U.h('div', { class: 'res', style: { color } }, text)); });
    }

    function tagText(type, gold) {
      return `${TYPES[type].icon} ${TYPES[type].text}${gold ? '  💰×2' : ''}`;
    }

    // Empty box between cards announces the type of the next card.
    function showGap() {
      words.forEach(el => {
        el.className = 'wd empty t-' + nextType + (nextGold ? ' gold' : '');
        el.replaceChildren(U.h('span', { class: nextType === 'classic' && !nextGold ? 'q' : 'big' },
          nextType === 'classic' && !nextGold ? '• • •' : tagText(nextType, nextGold)));
      });
    }

    function showWord() {
      words.forEach(el => {
        el.className = 'wd pop t-' + card.type + (card.gold ? ' gold' : '');
        const kids = [U.h('div', { class: 'tag' }, tagText(card.type, card.gold)),
          U.h('span', { class: 'w', style: { color: INKS[card.ink].color } }, INKS[card.word].word)];
        if (card.type === 'blitz') kids.push(U.h('div', { class: 'bar' }));
        el.replaceChildren(...kids);
      });
    }

    function setInk(k) {
      card.ink = k;
      words.forEach(el => { const w = el.querySelector('.w'); if (w) w.style.color = INKS[k].color; });
    }

    function pickType() {
      if (cardNo < 1) return 'classic';
      let tot = 0;
      for (const k in TYPES) tot += TYPES[k].w;
      let x = Math.random() * tot;
      for (const k in TYPES) { x -= TYPES[k].w; if (x < 0) return k; }
      return 'classic';
    }

    function newCard() {
      if (state === 'done') return;
      cardNo++;
      locked = new Set();
      seats.forEach(s => [s.yes, s.no, ...s.sws].forEach(b => b.classList.remove('good', 'wrong')));
      let w;
      do { w = U.randInt(0, INKS.length - 1); } while (w === lastWord);
      lastWord = w;
      const type = nextType;
      let ink = w;
      const differ = type === 'ink' || type === 'word' || Math.random() >= 0.4;
      if (differ) { do { ink = U.randInt(0, INKS.length - 1); } while (ink === w); }
      card = { type, word: w, ink, gold: nextGold, deadline: ctx.time + BLITZ };
      if (type === 'ink' || type === 'word') {
        const others = U.shuffle([...INKS.keys()].filter(k => k !== w && k !== ink)).slice(0, 2);
        card.opts = U.shuffle([w, ink, ...others]);
        seats.forEach(s => s.sws.forEach((b, k) => { b._color = card.opts[k]; b.style.background = INKS[card.opts[k]].color; }));
      }
      state = 'ask';
      showWord();
      render();
      if (type === 'chameleon') {
        chamTimer = ctx.every(800, () => {
          if (state !== 'ask' || card.type !== 'chameleon') return;
          let k;
          if (card.ink !== card.word && Math.random() < 0.45) k = card.word;
          else { do { k = U.randInt(0, INKS.length - 1); } while (k === card.ink || k === card.word); }
          setInk(k);
        });
      }
    }

    function endCard(ms) {
      state = 'gap';
      if (chamTimer) { ctx.cancel(chamTimer); chamTimer = null; }
      nextType = pickType();
      nextGold = cardNo >= 2 && Math.random() < 0.15;
      ctx.after(ms, () => {
        if (state === 'done') return;
        card = null;
        showGap();
        render();
        ctx.after(nextType === 'classic' && !nextGold ? 450 : 1100, newCard);
      });
    }

    function correctAnswer() {
      const match = card.ink === card.word;
      switch (card.type) {
        case 'reverse': return !match;
        case 'ink': return card.ink;
        case 'word': return card.word;
        default: return match;
      }
    }

    function answer(i, val, btn) {
      if (state !== 'ask' || locked.has(i)) return;
      if (val === correctAnswer()) {
        let pts = card.type === 'blitz' ? 2 : 1;
        if (card.gold) pts *= 2;
        streak[i]++;
        ctx.players.forEach(p => { if (p.i !== i) streak[p.i] = 0; });
        let extra = '';
        if (streak[i] >= 3) { pts++; streak[i] = 0; extra = ' 🔥 серия +1'; }
        score[i] += pts;
        btn.classList.add('good');
        bump(i);
        render();
        showResult(`${ctx.players[i].name} +${pts}${extra}`, ctx.players[i].color);
        if (score[i] >= TARGET) {
          state = 'done';
          if (chamTimer) ctx.cancel(chamTimer);
          ctx.after(1100, () => ctx.end({ winner: i, scores: score.slice() }));
        } else endCard(900);
      } else {
        score[i] = Math.max(0, score[i] - 1);
        streak[i] = 0;
        locked.add(i);
        btn.classList.add('wrong');
        render();
        if (locked.size === ctx.n) {
          const c = correctAnswer();
          const txt = typeof c === 'number' ? 'Правильно: ' + INKS[c].word.toLowerCase()
            : card.type === 'reverse' ? (c ? 'Надо было: СОВПАДАЕТ' : 'Надо было: НЕТ')
            : (c ? 'Совпадало!' : 'Не совпадало!');
          showResult(txt, '#e9ecf6');
          endCard(1200);
        }
      }
    }

    ctx.loop(() => {
      if (state === 'ask' && card && card.type === 'blitz') {
        const left = card.deadline - ctx.time;
        const frac = U.clamp(left / BLITZ, 0, 1);
        words.forEach(el => { const b = el.querySelector('.bar'); if (b) { b.style.width = frac * 100 + '%'; b.style.background = frac < 0.35 ? '#ff4d6d' : '#ffd23c'; } });
        if (left <= 0) {
          showResult('⏰ Время вышло!', '#ffd23c');
          endCard(900);
        }
      }
    });

    showGap();
    render();
    // first word appears right after the countdown
    ctx.after(400, newCard);
  },
});
