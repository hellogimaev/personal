registerGame({
  id: 'draw',
  title: 'Рисуй и угадывай',
  emoji: '✏️',
  desc: 'Один рисует, остальные угадывают слово',
  rules: 'Ходят по очереди: один игрок рисует, остальные угадывают.\nХудожник удерживает кнопку «Показать слово» и рисует пальцем в центре. Буквы и цифры писать нельзя!\nУгадывающие выбирают ответ из 6 вариантов. Ошибся: ждёшь до следующего хода.\nПервый угадавший получает +2, художник +1. На ход 60 секунд.\nКаждый рисует по 2 раза.',
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
    let turn = -1, artist = 0, word = null, options = [], phase = 'idle'; // idle | draw | reveal
    let turnEnd = 0, locked = new Set(), guessedBy = null;
    const used = new Set();
    let strokes = []; // {c, pts:[[u,v],...]} normalized to the paper (unit = min side, origin = center)
    let dirty = true;

    ctx.root.classList.add('g-draw');
    ctx.root.append(U.h('style', null, `
      .g-draw .dz{position:absolute;inset:0;display:flex;flex-direction:column;padding:8px 10px 0;
        border-top:4px solid var(--pc)}
      .g-draw .dz.pad-r{padding-right:64px}
      .g-draw .dz.pad-l{padding-left:64px}
      .g-draw .main{flex:1;min-height:0;display:flex;gap:8px;justify-content:center}
      .g-draw .info{height:34px;flex:none;display:flex;align-items:center;justify-content:center;gap:14px;
        font-weight:800;font-size:18px;white-space:nowrap;color:var(--muted)}
      .g-draw .info .role{color:var(--fg)}
      .g-draw .info b{color:var(--pc);font-size:22px;font-variant-numeric:tabular-nums}
      .g-draw .info .tm{font-variant-numeric:tabular-nums;min-width:48px;text-align:center}
      .g-draw .info .tm.low{color:#ff4d6d}
      .g-draw .grid{flex:1;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:1fr 1fr;gap:8px;
        max-width:760px;margin:0 auto;width:100%}
      .g-draw .op{border-radius:14px;background:var(--card2);display:flex;align-items:center;justify-content:center;
        text-align:center;font-weight:800;font-size:19px;line-height:1.05;padding:2px 4px;min-height:0;overflow:hidden;
        transition:background .1s, opacity .2s;overflow-wrap:anywhere}
      .g-draw .op.sm{font-size:16px}
      .g-draw .op.xs{font-size:13px}
      .g-draw .op.wrong{background:#ff4d6d;color:#111}
      .g-draw .op.right{background:#3ddc97;color:#111}
      .g-draw .grid.locked .op:not(.wrong):not(.right){opacity:.3}
      .g-draw .grid.off .op:not(.right):not(.wrong){opacity:.45}
      .g-draw .show{flex:2;max-width:480px;border-radius:16px;background:var(--pc);color:#111;font-weight:900;font-size:20px;
        display:flex;align-items:center;justify-content:center;text-align:center;line-height:1.1;padding:4px 10px}
      .g-draw .show.held{background:#fff;font-size:30px;flex-direction:column}
      .g-draw .show .cat{display:block;font-size:14px;font-weight:700;opacity:.6;margin-top:3px}
      .g-draw .clr{flex:1;max-width:200px;border-radius:16px;background:var(--card2);font-weight:800;font-size:19px;
        display:flex;align-items:center;justify-content:center}
      .g-draw .clr:active{background:#3a4374}
      .g-draw .wait{flex:1;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:var(--muted);text-align:center}
      .g-draw .ban{position:absolute;left:50%;bottom:calc(100% + 18px);transform:translateX(-50%);background:rgba(0,0,0,.78);
        border:3px solid var(--pc);color:#fff;font-weight:900;font-size:24px;border-radius:16px;padding:10px 18px;
        text-align:center;pointer-events:none;width:max-content;max-width:calc(100% - 20px);line-height:1.2;z-index:5}
      .g-draw .ban small{display:block;font-size:16px;color:var(--muted);font-weight:700}
    `));

    const { cv, g } = ctx.canvas();

    const zones = ctx.players.map(p => {
      const z = ctx.zone(p.i, { depth: 0.22 });
      z.el.style.background = `linear-gradient(to bottom, ${U.alpha(p.color, 0.16)}, ${U.alpha(p.color, 0.05)})`;
      const box = U.h('div', { class: 'dz' });
      if (n === 2 && p.side === 'top') box.classList.add('pad-r');
      if (n === 3 && p.side === 'left') box.classList.add('pad-l');
      const main = U.h('div', { class: 'main' });
      const role = U.h('span', { class: 'role' }, '');
      const sc = U.h('b', null, '0');
      const tm = U.h('span', { class: 'tm' }, '1:00');
      box.append(main, U.h('div', { class: 'info' }, role, U.h('span', null, 'очки ', sc), tm));
      z.el.append(box);
      return { z, box, main, role, sc, tm, ban: null, banTimer: 0 };
    });

    function banner(i, html, sub, ms) {
      const zz = zones[i];
      if (zz.ban) zz.ban.remove();
      const b = U.h('div', { class: 'ban' }, html, sub ? U.h('small', null, sub) : null);
      zz.z.el.append(b);
      zz.ban = b;
      ctx.after(ms, () => { if (zz.ban === b) { b.remove(); zz.ban = null; } });
    }

    function optClass(w) { return w.length > 11 ? 'op xs' : w.length > 8 ? 'op sm' : 'op'; }

    function buildZones() {
      ctx.players.forEach(p => {
        const zz = zones[p.i];
        zz.main.replaceChildren();
        zz.sc.textContent = score[p.i];
        if (p.i === artist) {
          zz.role.textContent = 'Ты рисуешь';
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
          ctx.tap(clr, () => { if (phase === 'draw') { strokes = []; active.clear(); dirty = true; } });
          zz.main.append(show, clr);
          zz.grid = null;
        } else {
          zz.role.textContent = 'Угадай!';
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
      strokes = []; active.clear(); dirty = true;
      locked = new Set(); guessedBy = null;
      phase = 'draw';
      turnEnd = ctx.time + TURN;
      buildZones();
      ctx.players.forEach(p => {
        if (p.i === artist) banner(p.i, `Ход ${turn + 1}/${TURNS}: ты рисуешь! 🎨`, 'Удерживай кнопку, чтобы увидеть слово', 2200);
        else banner(p.i, `Ход ${turn + 1}/${TURNS}: рисует ${ctx.players[artist].name}`, 'Угадай, что это', 2200);
      });
    }

    function guess(i, w, b) {
      if (phase !== 'draw' || i === artist || locked.has(i)) return;
      if (w === word.w) {
        score[i] += 2;
        score[artist] += 1;
        b.classList.add('right');
        endTurn(i);
      } else {
        b.classList.add('wrong');
        locked.add(i);
        zones[i].grid.classList.add('locked');
        zones[i].role.textContent = 'Мимо, жди';
        if (locked.size >= n - 1) endTurn(null);
      }
    }

    function endTurn(winner) {
      if (phase !== 'draw') return;
      phase = 'reveal';
      guessedBy = winner;
      active.clear();
      ctx.players.forEach(p => {
        const zz = zones[p.i];
        zz.sc.textContent = score[p.i];
        if (zz.grid) {
          zz.grid.classList.add('off');
          zz.grid.querySelectorAll('.op').forEach(o => { if (o.dataset.w === word.w) o.classList.add('right'); });
        }
        let head;
        if (winner == null) head = (locked.size >= n - 1 ? 'Никто не угадал' : 'Время вышло');
        else if (winner === p.i) head = 'Угадал! +2';
        else if (p.i === artist) head = `${ctx.players[winner].name} угадал! Тебе +1`;
        else head = `${ctx.players[winner].name} угадал первым`;
        banner(p.i, head, `Слово: «${word.w}»`, 2000);
      });
      ctx.after(2000, nextTurn);
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
      // keep clear of the exit button
      if (x0 < 60 && y0 < 60) y0 = 60;
      return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, unit: Math.min(x1 - x0, y1 - y0) };
    }
    const toN = (P, x, y) => [(x - P.cx) / P.unit, (y - P.cy) / P.unit];
    const toS = (P, u, v) => [P.cx + u * P.unit, P.cy + v * P.unit];

    /* ---------- drawing input ---------- */
    const active = new Map(); // pointerId -> stroke
    ctx.pointer(cv, {
      down(id, x, y) {
        if (phase !== 'draw' || ctx.paused) return;
        const P = paper();
        if (x < P.x0 || x > P.x1 || y < P.y0 || y > P.y1) return;
        const s = { c: ctx.players[artist].color, pts: [toN(P, x, y)] };
        strokes.push(s); active.set(id, s); dirty = true;
      },
      move(id, x, y) {
        const s = active.get(id);
        if (!s || phase !== 'draw') return;
        const P = paper();
        const q = toN(P, U.clamp(x, P.x0, P.x1), U.clamp(y, P.y0, P.y1));
        const l = s.pts[s.pts.length - 1];
        if (Math.hypot(q[0] - l[0], q[1] - l[1]) * P.unit < 2.5) return;
        s.pts.push(q); dirty = true;
      },
      up(id) { active.delete(id); },
    });
    ctx.onResize(() => { dirty = true; });

    function render() {
      const W = ctx.W, H = ctx.H, P = paper();
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#0f1220';
      g.fillRect(0, 0, W, H);
      // paper
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
      const lw = Math.max(5, P.unit * 0.014);
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (const s of strokes) {
        const pts = s.pts.map(([u, v]) => toS(P, u, v));
        g.strokeStyle = s.c; g.fillStyle = s.c; g.lineWidth = lw;
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
      // hint for the artist on an empty sheet
      if (phase === 'draw' && !strokes.length) {
        const v = ctx.inward(artist);
        const d = (Math.abs(v.x) ? P.w : P.h) * 0.3;
        g.save();
        ctx.facing(g, artist, P.cx - v.x * d, P.cy - v.y * d);
        g.fillStyle = 'rgba(40,40,60,0.35)';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `800 ${Math.round(U.clamp(P.unit * 0.05, 18, 30))}px ${FONT}`;
        g.fillText('Рисуй здесь пальцем ✏️', 0, 0);
        g.restore();
      }
      g.restore();
    }

    let lastSec = -1, lastPhase = '';
    ctx.loop(() => {
      if (phase === 'draw' && ctx.time >= turnEnd) endTurn(null);
      const sec = phase === 'draw' ? Math.max(0, Math.ceil(turnEnd - ctx.time)) : phase === 'reveal' ? 0 : TURN;
      if (sec !== lastSec || phase !== lastPhase) {
        lastSec = sec; lastPhase = phase;
        zones.forEach(zz => {
          zz.tm.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
          zz.tm.classList.toggle('low', phase === 'draw' && sec <= 10);
        });
        dirty = true;
      }
      if (dirty) { dirty = false; render(); }
    });

    nextTurn();
  },
});
