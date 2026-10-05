registerGame({
  id: 'draw',
  title: 'Рисуй и угадывай',
  emoji: '✏️',
  desc: 'Рисуй с заданиями, угадывай быстрее всех',
  rules: 'Ходят по очереди: один рисует, остальные угадывают. Каждый рисует 2 раза.\nХудожник удерживает «Показать слово» и рисует пальцем в центре. Буквы писать нельзя!\nУгадывающие выбирают из 6 вариантов. Ошибся: ждёшь следующего хода.\nЧем быстрее угадал, тем больше очков: +3, +2 или +1. Художнику +1, с заданием +2.\n💡 Подсказки: на середине и в конце хода пропадает по неверному варианту. Можно купить подсказку за 1 очко: −2 неверных варианта.\nЗадания художнику:\n〰️ Одной линией · 📏 Только прямые · ⭕ Только кружочки\n👻 Исчезающие чернила · 🌀 Лист крутится · ⏱️ Блиц: 25 секунд, очки ×2\n🔥 Последний круг: все очки ×2.',
  minPlayers: 2, maxPlayers: 3,
  start(ctx) {
    const TURN = 60;
    const WORDS = {
      'животные': ['кошка', 'собака', 'корова', 'лошадь', 'свинья', 'курица', 'утка', 'кролик', 'мышь', 'слон', 'жираф', 'лев',
        'тигр', 'медведь', 'заяц', 'лиса', 'змея', 'черепаха', 'рыба', 'акула', 'кит', 'осьминог', 'краб', 'улитка',
        'бабочка', 'пчела', 'паук', 'сова', 'пингвин', 'верблюд', 'крокодил', 'ёжик', 'белка', 'обезьяна', 'лягушка', 'зебра'],
      'еда': ['яблоко', 'банан', 'груша', 'арбуз', 'виноград', 'клубника', 'вишня', 'лимон', 'морковь', 'помидор', 'огурец',
        'гриб', 'хлеб', 'сыр', 'яйцо', 'торт', 'мороженое', 'пицца', 'бургер', 'сосиска', 'конфета', 'пончик', 'суп',
        'ананас', 'кукуруза', 'леденец', 'блины', 'макароны'],
      'предметы': ['стул', 'стол', 'кровать', 'лампа', 'часы', 'телефон', 'ключ', 'зонт', 'очки', 'книга', 'ножницы', 'чашка',
        'ложка', 'вилка', 'чайник', 'утюг', 'телевизор', 'гитара', 'барабан', 'мяч', 'шарик', 'подарок', 'свеча', 'лестница',
        'молоток', 'карандаш', 'рюкзак', 'шапка', 'ботинок', 'носок', 'корона', 'зеркало', 'дверь', 'колокольчик', 'ведро',
        'якорь', 'фонарик', 'магнит', 'пылесос'],
      'транспорт': ['машина', 'автобус', 'поезд', 'самолёт', 'вертолёт', 'корабль', 'лодка', 'велосипед', 'мотоцикл', 'трактор',
        'ракета', 'самокат', 'трамвай', 'грузовик', 'парашют', 'танк', 'экскаватор', 'санки', 'скейт', 'подводная лодка'],
      'природа': ['солнце', 'луна', 'звезда', 'облако', 'дождь', 'снег', 'радуга', 'молния', 'гора', 'вулкан', 'река', 'море',
        'остров', 'дерево', 'цветок', 'кактус', 'лист', 'трава', 'камень', 'огонь', 'волна', 'пальма', 'ёлка', 'снеговик',
        'ракушка', 'водопад', 'торнадо', 'капля'],
      'места': ['дом', 'замок', 'мост', 'башня', 'палатка', 'маяк', 'пирамида', 'забор', 'колодец', 'качели', 'горка',
        'больница', 'школа', 'церковь', 'стадион'],
      'люди': ['врач', 'повар', 'пожарный', 'полицейский', 'художник', 'космонавт', 'пират', 'рыбак', 'клоун', 'фокусник',
        'балерина', 'футболист', 'король', 'принцесса', 'робот', 'призрак', 'ниндзя', 'водолаз', 'ковбой', 'вампир'],
      'действия': ['плавать', 'спать', 'бегать', 'прыгать', 'танцевать', 'петь', 'читать', 'плакать', 'смеяться', 'летать',
        'готовить', 'фотографировать', 'кататься', 'чихать', 'зевать', 'копать', 'стрелять', 'ловить', 'мыться', 'звонить'],
    };
    const ALL = [];
    for (const cat in WORDS) for (const w of WORDS[cat]) ALL.push({ w, cat });

    const FONT = '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif';
    const n = ctx.n;
    const score = ctx.players.map(() => 0);
    const TURNS = n * 2;
    const CHALLENGES = [
      { id: 'line', icon: '〰️', name: 'Одной линией', tip: 'не отрывай палец' },
      { id: 'straight', icon: '📏', name: 'Только прямые', tip: 'линии сами выпрямляются' },
      { id: 'circle', icon: '⭕', name: 'Только кружочки', tip: 'каждый штрих станет кругом' },
      { id: 'fade', icon: '👻', name: 'Исчезающие чернила', tip: 'линии тают через 4 с' },
      { id: 'spin', icon: '🌀', name: 'Лист крутится', tip: 'рисунок вращается' },
      { id: 'blitz', icon: '⏱️', name: 'Блиц ×2', tip: '25 секунд, очки ×2' },
    ];
    let turn = -1, artist = 0, word = null, options = [], phase = 'idle'; // idle | draw | reveal
    let turnEnd = 0, turnStart = 0, turnLen = TURN, locked = new Set(), challenge = null, lineDone = false;
    let hintsGiven = 0;
    const removed = ctx.players.map(() => new Set());
    const bought = ctx.players.map(() => false);
    let chalBag = [];
    const used = new Set();
    let strokes = []; // {c, pts:[[u,v],...], circle?, tEnd?} normalized to the paper (unit = min side, origin = center)
    let dirty = true;
    let parts = [];

    ctx.root.classList.add('g-draw');
    ctx.root.append(U.h('style', null, `
      .g-draw .dz{position:absolute;inset:0;display:flex;flex-direction:column;padding:8px 10px 0;
        border-top:4px solid var(--pc)}
      .g-draw .dz.shake{animation:gdShake .4s linear}
      @keyframes gdShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-10px)}40%{transform:translateX(9px)}
        60%{transform:translateX(-6px)}80%{transform:translateX(3px)}}
      .g-draw .main{flex:1;min-height:0;display:flex;gap:8px;justify-content:center}
      .g-draw .info{height:44px;flex:none;display:flex;align-items:center;justify-content:center;gap:12px;
        font-weight:800;font-size:18px;white-space:nowrap;color:var(--muted)}
      .g-draw .info .role{color:var(--fg);overflow:hidden;text-overflow:ellipsis;min-width:0}
      .g-draw .info b{color:var(--pc);font-size:22px;font-variant-numeric:tabular-nums}
      .g-draw .info .pts{color:#3ddc97}
      .g-draw .info .tm{font-variant-numeric:tabular-nums;min-width:48px;text-align:center}
      .g-draw .info .tm.low{color:#ff4d6d;animation:gdBlink .5s infinite alternate}
      @keyframes gdBlink{to{opacity:.4}}
      .g-draw .buy{background:#ffd84a;color:#111;border-radius:12px;padding:0 12px;height:36px;display:flex;align-items:center;font-size:17px}
      .g-draw .buy.off{opacity:.25}
      .g-draw .grid{flex:1;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr;gap:8px;
        max-width:760px;margin:0 auto;width:100%}
      .g-draw .op{border-radius:14px;background:var(--card2);display:flex;align-items:center;justify-content:center;
        text-align:center;font-weight:800;font-size:19px;line-height:1.05;padding:2px 4px;min-height:0;overflow:hidden;
        transition:background .1s, opacity .3s, transform .3s;overflow-wrap:anywhere}
      .g-draw .op.sm{font-size:16px}
      .g-draw .op.xs{font-size:13px}
      .g-draw .op.wrong{background:#ff4d6d;color:#111}
      .g-draw .op.right{background:#3ddc97;color:#111;transform:scale(1.06)}
      .g-draw .op.gone{opacity:.1;transform:scale(.85)}
      .g-draw .grid.locked .op:not(.wrong):not(.right){opacity:.3}
      .g-draw .grid.off .op:not(.right):not(.wrong){opacity:.35}
      .g-draw .show{flex:2;max-width:480px;border-radius:16px;background:var(--pc);color:#111;font-weight:900;font-size:20px;
        display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.1;padding:4px 10px}
      .g-draw .show.held{background:#fff;font-size:30px;flex-direction:column}
      .g-draw .show .cat{display:block;font-size:14px;font-weight:700;opacity:.6;margin-top:3px}
      .g-draw .clr{flex:1;max-width:200px;border-radius:16px;background:var(--card2);font-weight:800;font-size:19px;
        display:flex;align-items:center;justify-content:center}
      .g-draw .clr:active{background:#3a4374}
      .g-draw .ban{position:absolute;left:50%;bottom:calc(100% + 18px);transform:translateX(-50%);background:rgba(0,0,0,.8);
        border:3px solid var(--pc);color:#fff;font-weight:900;font-size:24px;border-radius:16px;padding:10px 18px;
        text-align:center;pointer-events:none;width:max-content;max-width:calc(100% - 20px);line-height:1.2;z-index:5;
        animation:gdIn .25s ease-out}
      .g-draw .ban small{display:block;font-size:17px;color:#cfd3ef;font-weight:700;margin-top:2px}
      @keyframes gdIn{from{transform:translateX(-50%) scale(.6);opacity:0}to{transform:translateX(-50%) scale(1);opacity:1}}
    `));

    const { cv, g } = ctx.canvas();
    const fxc = ctx.canvas({ z: 4 });
    fxc.cv.style.pointerEvents = 'none';

    const zones = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: 0.24 });
      z.el.style.background = `linear-gradient(to bottom, ${U.alpha(p.color, 0.16)}, ${U.alpha(p.color, 0.05)})`;
      const box = U.h('div', { class: 'dz' });
      const main = U.h('div', { class: 'main' });
      const role = U.h('span', { class: 'role' }, '');
      const sc = U.h('b', null, '0');
      const pts = U.h('span', { class: 'pts' }, '');
      const buy = U.h('div', { class: 'buy' }, '💡 −1');
      ctx.tap(buy, () => buyHint(p.i));
      const tm = U.h('span', { class: 'tm' }, '1:00');
      box.append(main, U.h('div', { class: 'info' }, role, U.h('span', null, 'очки ', sc), pts, buy, tm));
      z.el.append(box);
      return { z, box, main, role, sc, pts, buy, tm, ban: null, grid: null };
    });

    function banner(i, html, sub, ms) {
      const zz = zones[i];
      if (zz.ban) zz.ban.remove();
      const b = U.h('div', { class: 'ban' }, html, sub ? U.h('small', null, sub) : null);
      zz.z.el.append(b);
      zz.ban = b;
      ctx.after(ms, () => { if (zz.ban === b) { b.remove(); zz.ban = null; } });
    }
    function shakeZone(i) { const b = zones[i].box; b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }

    function optClass(w) { return w.length > 11 ? 'op xs' : w.length > 8 ? 'op sm' : 'op'; }
    const isFinal = () => turn >= TURNS - n;
    const mult = () => (challenge && challenge.id === 'blitz' ? 2 : 1) * (isFinal() ? 2 : 1);
    // guesser points by speed: first third of the turn +3, second +2, last +1
    function guessPts() {
      const frac = (ctx.time - turnStart) / turnLen;
      return (frac < 1 / 3 ? 3 : frac < 2 / 3 ? 2 : 1) * mult();
    }
    const artistPts = () => (challenge ? 2 : 1) * mult();

    function buildZones() {
      ctx.players.forEach(p => {
        const zz = zones[p.i];
        zz.main.replaceChildren();
        zz.sc.textContent = score[p.i];
        if (p.i === artist) {
          zz.role.textContent = challenge ? `${challenge.icon} ${challenge.name}` : 'Ты рисуешь';
          zz.buy.style.display = 'none';
          zz.pts.textContent = '';
          const show = U.h('div', { class: 'show' }, 'Показать слово (удерживай)');
          let held = 0;
          const on = () => {
            show.classList.add('held');
            show.replaceChildren(word.w, U.h('span', { class: 'cat' }, word.cat));
          };
          const off = () => { show.classList.remove('held'); show.textContent = 'Показать слово (удерживай)'; };
          ctx.pointer(show, {
            down: () => { held++; on(); },
            up: () => { held = Math.max(0, held - 1); if (!held) off(); },
          });
          const clr = U.h('div', { class: 'clr' }, '🧽 Очистить');
          ctx.tap(clr, () => { if (phase === 'draw') { strokes = []; active.clear(); lineDone = false; dirty = true; } });
          zz.main.append(show, clr);
          zz.grid = null;
        } else {
          zz.role.textContent = 'Угадай!';
          zz.buy.style.display = '';
          zz.buy.classList.toggle('off', score[p.i] < 1);
          const grid = U.h('div', { class: 'grid' });
          U.shuffle(options).forEach(w => {
            const b = U.h('div', { class: optClass(w) }, w);
            b.dataset.w = w;
            ctx.tap(b, () => guess(p.i, w, b));
            grid.append(b);
          });
          zz.main.append(grid);
          zz.grid = grid;
        }
      });
    }

    function pickWord() {
      let cands = ALL.filter(x => !used.has(x.w));
      if (!cands.length) { used.clear(); cands = ALL; }
      const wd = U.pick(cands);
      used.add(wd.w);
      return wd;
    }

    function nextTurn() {
      turn++;
      if (turn >= TURNS) return finish();
      artist = turn % n;
      word = pickWord();
      const same = U.shuffle(WORDS[word.cat].filter(w => w !== word.w)).slice(0, 5);
      while (same.length < 5) {
        const o = U.pick(ALL).w;
        if (o !== word.w && !same.includes(o)) same.push(o);
      }
      options = [word.w, ...same];
      // first turn plain, then a random artist challenge every turn
      if (turn === 0) challenge = null;
      else {
        if (!chalBag.length) chalBag = U.shuffle(CHALLENGES);
        challenge = chalBag.pop();
      }
      strokes = []; active.clear(); dirty = true; lineDone = false;
      locked = new Set(); hintsGiven = 0;
      removed.forEach(s => s.clear());
      bought.fill(false);
      phase = 'draw';
      turnLen = challenge && challenge.id === 'blitz' ? 25 : TURN;
      turnStart = ctx.time;
      turnEnd = ctx.time + turnLen;
      buildZones();
      const head = `Ход ${turn + 1}/${TURNS}`;
      const fin = isFinal() ? ' · 🔥 очки ×2' : '';
      if (isFinal() && turn === TURNS - n) ctx.toast('🔥 Последний круг: все очки ×2!', { ms: 1800, color: '#ff8c42', fg: '#111' });
      ctx.players.forEach(p => {
        const ch = challenge ? `${challenge.icon} ${challenge.name}: ${challenge.tip}` : '';
        if (p.i === artist) banner(p.i, `${head}: ты рисуешь! 🎨${fin}`, ch || 'Удерживай кнопку, чтобы увидеть слово', 2600);
        else banner(p.i, `${head}: рисует ${ctx.players[artist].name}${fin}`, ch || 'Чем быстрее угадаешь, тем больше очков', 2600);
      });
    }

    function removeWrong(i, k) {
      const zz = zones[i];
      if (!zz.grid) return 0;
      const cands = [...zz.grid.querySelectorAll('.op')].filter(o => o.dataset.w !== word.w && !removed[i].has(o.dataset.w) && !o.classList.contains('wrong'));
      let c = 0;
      U.shuffle(cands).slice(0, k).forEach(o => { removed[i].add(o.dataset.w); o.classList.add('gone'); c++; });
      return c;
    }

    function buyHint(i) {
      if (phase !== 'draw' || i === artist || locked.has(i) || bought[i] || score[i] < 1) return;
      if (!removeWrong(i, 2)) return;
      bought[i] = true;
      score[i] -= 1;
      zones[i].sc.textContent = score[i];
      zones[i].buy.classList.add('off');
      banner(i, '💡 −1 очко: убрал 2 варианта', null, 1300);
    }

    function guess(i, w, b) {
      if (phase !== 'draw' || i === artist || locked.has(i) || removed[i].has(w)) return;
      if (w === word.w) {
        const gp = guessPts(), ap = artistPts();
        score[i] += gp;
        score[artist] += ap;
        b.classList.add('right');
        confetti(i);
        endTurn(i, gp, ap);
      } else {
        b.classList.add('wrong');
        shakeZone(i);
        locked.add(i);
        zones[i].grid.classList.add('locked');
        zones[i].role.textContent = 'Мимо, жди';
        zones[i].pts.textContent = '';
        if (locked.size >= n - 1) endTurn(null);
      }
    }

    function endTurn(winner, gp, ap) {
      if (phase !== 'draw') return;
      phase = 'reveal';
      active.clear();
      ctx.players.forEach(p => {
        const zz = zones[p.i];
        zz.sc.textContent = score[p.i];
        zz.pts.textContent = '';
        zz.buy.classList.add('off');
        if (zz.grid) {
          zz.grid.classList.add('off');
          zz.grid.querySelectorAll('.op').forEach(o => { if (o.dataset.w === word.w) { o.classList.remove('gone'); o.classList.add('right'); } });
        }
        let head;
        if (winner == null) head = (locked.size >= n - 1 ? 'Никто не угадал' : '⏰ Время вышло');
        else if (winner === p.i) head = `🎉 Угадал! +${gp}`;
        else if (p.i === artist) head = `${ctx.players[winner].name} угадал! Тебе +${ap}`;
        else head = `${ctx.players[winner].name} угадал первым`;
        banner(p.i, head, `Слово: «${word.w}»`, 2200);
      });
      ctx.after(2200, nextTurn);
    }

    function finish() {
      phase = 'idle';
      const max = Math.max(...score);
      let winners = ctx.players.map(p => p.i).filter(i => score[i] === max);
      if (winners.length === n) winners = [];
      ctx.end({ winners, scores: score.slice() });
    }

    /* ---------- paper geometry ---------- */
    function paper() {
      let x0 = 0, y0 = 0, x1 = ctx.W, y1 = ctx.H;
      ctx.players.forEach((p, i) => {
        const r = zones[i].z.rect;
        if (p.side === 'left') x0 = r.x + r.w;
        if (p.side === 'right') x1 = r.x;
        if (p.side === 'top') y0 = r.y + r.h;
        if (p.side === 'bottom') y1 = r.y;
      });
      const m = 8;
      x0 += m; y0 += m; x1 -= m; y1 -= m;
      // keep clear of the exit button (2p: middle of the left edge, 3p: middle of the top edge)
      if (n === 2) { x0 += 44; x1 -= 44; } else y0 += 44;
      return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, unit: Math.min(x1 - x0, y1 - y0) };
    }
    const angle = () => (challenge && challenge.id === 'spin' && phase !== 'idle') ? (ctx.time - turnStart) * 0.3 : 0;
    // screen -> normalized paper coords (undoing the paper rotation)
    function toN(P, x, y) {
      const u = (x - P.cx) / P.unit, v = (y - P.cy) / P.unit, a = -angle();
      return [u * Math.cos(a) - v * Math.sin(a), u * Math.sin(a) + v * Math.cos(a)];
    }

    /* ---------- drawing input ---------- */
    const active = new Map(); // pointerId -> stroke
    ctx.pointer(cv, {
      down(id, x, y) {
        if (phase !== 'draw' || ctx.paused) return;
        const P = paper();
        if (x < P.x0 || x > P.x1 || y < P.y0 || y > P.y1) return;
        if (challenge && challenge.id === 'line' && (lineDone || active.size)) {
          banner(artist, '〰️ Только одна линия! Очисти, чтобы начать заново', null, 1400);
          return;
        }
        const s = { c: ctx.players[artist].color, pts: [toN(P, x, y)], circle: challenge && challenge.id === 'circle', tEnd: null };
        strokes.push(s); active.set(id, s); dirty = true;
      },
      move(id, x, y) {
        const s = active.get(id);
        if (!s || phase !== 'draw') return;
        const P = paper();
        const q = toN(P, U.clamp(x, P.x0, P.x1), U.clamp(y, P.y0, P.y1));
        if (challenge && challenge.id === 'straight') { s.pts[1] = q; dirty = true; return; }
        const l = s.pts[s.pts.length - 1];
        if (Math.hypot(q[0] - l[0], q[1] - l[1]) * P.unit < 2.5) return;
        s.pts.push(q); dirty = true;
      },
      up(id) {
        const s = active.get(id);
        if (!s) return;
        active.delete(id);
        s.tEnd = ctx.time;
        if (challenge && challenge.id === 'line' && s.pts.length > 1) lineDone = true;
        dirty = true;
      },
    });
    ctx.onResize(() => { dirty = true; });

    function fitCircle(pts) {
      let cx = 0, cy = 0;
      pts.forEach(p => { cx += p[0]; cy += p[1]; });
      cx /= pts.length; cy /= pts.length;
      let r = 0;
      pts.forEach(p => { r += Math.hypot(p[0] - cx, p[1] - cy); });
      return [cx, cy, Math.max(0.01, r / pts.length)];
    }

    function render() {
      const W = ctx.W, H = ctx.H, P = paper();
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#0f1220';
      g.fillRect(0, 0, W, H);
      g.fillStyle = '#f4f1e8';
      g.beginPath();
      if (g.roundRect) g.roundRect(P.x0, P.y0, P.w, P.h, 18); else g.rect(P.x0, P.y0, P.w, P.h);
      g.fill();
      g.save();
      g.clip();
      if (phase !== 'idle') {
        g.strokeStyle = U.alpha(ctx.players[artist].color, 0.9);
        g.lineWidth = 6;
        g.stroke();
      }
      // time bar along the inner side of the artist's edge
      if (phase === 'draw') {
        const frac = U.clamp((turnEnd - ctx.time) / turnLen, 0, 1);
        g.fillStyle = frac < 0.17 ? '#ff4d6d' : U.alpha(ctx.players[artist].color, 0.5);
        g.fillRect(P.x0, P.y0, P.w * frac, 6);
      }
      g.save();
      g.translate(P.cx, P.cy);
      g.rotate(angle());
      if (challenge && challenge.id === 'spin') {
        // faint grid so the rotation is visible
        g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 2;
        for (let k = -6; k <= 6; k++) {
          g.beginPath(); g.moveTo(k * P.unit * 0.12, -P.unit); g.lineTo(k * P.unit * 0.12, P.unit); g.stroke();
          g.beginPath(); g.moveTo(-P.unit, k * P.unit * 0.12); g.lineTo(P.unit, k * P.unit * 0.12); g.stroke();
        }
      }
      const U1 = P.unit;
      const lw = Math.max(5, U1 * 0.014);
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const s of strokes) {
        let alpha = 1;
        if (challenge && challenge.id === 'fade' && s.tEnd != null) alpha = U.clamp(1 - (ctx.time - s.tEnd - 3) / 1.2, 0, 1);
        if (alpha <= 0) continue;
        g.globalAlpha = alpha;
        g.strokeStyle = s.c; g.fillStyle = s.c; g.lineWidth = lw;
        const pts = s.pts.map(([u, v]) => [u * U1, v * U1]);
        if (s.circle && pts.length > 2) {
          const [cx, cy, r] = fitCircle(pts);
          if (active.has && [...active.values()].includes(s)) {
            g.globalAlpha = alpha * 0.35;
            g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); pts.forEach(p => g.lineTo(p[0], p[1])); g.stroke();
            g.globalAlpha = alpha;
          }
          g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
          continue;
        }
        if (pts.length === 1) {
          g.beginPath(); g.arc(pts[0][0], pts[0][1], lw / 2, 0, Math.PI * 2); g.fill();
          continue;
        }
        g.beginPath();
        g.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length - 1; k++) {
          const mx = (pts[k][0] + pts[k + 1][0]) / 2, my = (pts[k][1] + pts[k + 1][1]) / 2;
          g.quadraticCurveTo(pts[k][0], pts[k][1], mx, my);
        }
        const L = pts[pts.length - 1];
        g.lineTo(L[0], L[1]);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.restore();
      if (phase === 'draw' && !strokes.length) {
        const v = ctx.inward(artist);
        const d = (Math.abs(v.x) ? P.w : P.h) * 0.3;
        g.save();
        ctx.facing(g, artist, P.cx - v.x * d, P.cy - v.y * d);
        g.fillStyle = 'rgba(40,40,60,0.35)';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `800 ${Math.round(U.clamp(P.unit * 0.05, 18, 30))}px ${FONT}`;
        g.fillText(challenge ? `${challenge.icon} ${challenge.name}` : 'Рисуй здесь пальцем ✏️', 0, 0);
        g.restore();
      }
      g.restore();
    }

    /* ---------- confetti ---------- */
    function confetti(i) {
      const r = zones[i].z.rect, v = ctx.inward(i);
      const x = r.x + r.w / 2 + v.x * r.d * 0.5, y = r.y + r.h / 2 + v.y * r.d * 0.5;
      const cols = ['#ff5a5f', '#3b9cff', '#ffc93c', '#3ddc97', '#c58bff', '#ffffff'];
      for (let k = 0; k < 70; k++) {
        const a = Math.atan2(v.y, v.x) + U.rand(-1.1, 1.1), sp = U.rand(250, 750);
        parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, c: U.pick(cols), w: U.rand(5, 10), h: U.rand(3, 6), rot: Math.random() * 6, vr: U.rand(-10, 10) });
      }
    }
    function drawParts(dt) {
      const G = fxc.g;
      G.clearRect(0, 0, ctx.W, ctx.H);
      for (const q of parts) {
        if (dt > 0) { q.life -= dt * 0.9; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.95; q.vy *= 0.95; q.rot += q.vr * dt; }
        if (q.life <= 0) continue;
        G.save();
        G.globalAlpha = Math.min(1, q.life * 2);
        G.translate(q.x, q.y); G.rotate(q.rot);
        G.fillStyle = q.c; G.fillRect(-q.w / 2, -q.h / 2, q.w, q.h);
        G.restore();
      }
      parts = parts.filter(q => q.life > 0);
    }

    let lastSec = -1, lastPhase = '', lastPts = '';
    ctx.loop((dt) => {
      if (phase === 'draw') {
        const el = (ctx.time - turnStart) / turnLen;
        // automatic hints at 50% and 75% of the turn
        if ((hintsGiven === 0 && el >= 0.5) || (hintsGiven === 1 && el >= 0.75)) {
          hintsGiven++;
          ctx.players.forEach(p => {
            if (p.i === artist || locked.has(p.i)) return;
            if (removeWrong(p.i, 1)) banner(p.i, '💡 Подсказка: −1 вариант', null, 1200);
          });
        }
        if (ctx.time >= turnEnd) endTurn(null);
      }
      const sec = phase === 'draw' ? Math.max(0, Math.ceil(turnEnd - ctx.time)) : phase === 'reveal' ? 0 : TURN;
      if (sec !== lastSec || phase !== lastPhase) {
        lastSec = sec; lastPhase = phase;
        zones.forEach(zz => {
          zz.tm.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
          zz.tm.classList.toggle('low', phase === 'draw' && sec <= 10);
        });
        dirty = true;
      }
      if (phase === 'draw') {
        const pts = '+' + guessPts();
        if (pts !== lastPts) {
          lastPts = pts;
          ctx.players.forEach(p => {
            if (p.i !== artist && !locked.has(p.i)) zones[p.i].pts.textContent = pts;
          });
          zones.forEach((zz, i) => { if (i !== artist) zz.buy.classList.toggle('off', bought[i] || locked.has(i) || score[i] < 1); });
        }
      } else lastPts = '';
      if (phase === 'draw' && challenge && (challenge.id === 'spin' || challenge.id === 'fade')) dirty = true;
      if (phase === 'draw' && dt > 0) dirty = true; // time bar
      if (dirty) { dirty = false; render(); }
      drawParts(dt);
    });

    nextTurn();
  },
});
