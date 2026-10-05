# Game API

All games live in `src/games/<id>.js`, are plain browser JS (no modules, no imports, no network),
and register themselves with `registerGame({...})`. `python3 build.py` inlines everything into
`dist/index.html`. UI text is Russian. No sound.

## Setup assumptions

- One iPad lies flat on a table. Players sit at the edges.
- 2 players: seats `bottom` (player 0) and `top` (player 1).
- 3 players: seats `bottom` (0), `left` (1), `right` (2). The top edge is free.
- Screen can be portrait or landscape (iPad ~820x1180 CSS px). Handle both, and resize.
- Everything a player must read should be rotated to face them (use `ctx.zone`, `ctx.facing`, `ctx.toast`).
- Touch input in shared areas cannot tell who touched. Give each player controls inside their own
  zone, or use `ctx.seatAt(x, y)` (the player whose edge is nearest to the touch).
- Multi-touch: all players touch at the same time. Use `ctx.pointer` / `ctx.tap` (pointer events,
  per-pointer ids). Never use `click` in games (300ms delay, single touch).

## Registration

```js
registerGame({
  id: 'reaction',            // must match file name
  title: 'Реакция',
  emoji: '⚡',
  desc: 'Жми первым, когда загорится',          // short, for the menu card
  rules: 'Многострочные правила...\nВторая строка', // shown before start
  minPlayers: 2, maxPlayers: 3,
  start(ctx) { /* build the game; may return a cleanup fn */ },
});
```

`start` is called once; a 3-2-1 countdown then runs with `ctx.paused = true`.
Game clock and `ctx.after/every` timers do not advance while paused, so scheduling in `start` is safe.
Optional `ctx.onStart = () => {}` is called when the countdown ends.

## ctx

| member | meaning |
|---|---|
| `ctx.n` | 2 or 3 |
| `ctx.W`, `ctx.H` | current size in CSS px (updated on resize) |
| `ctx.root` | full-screen container div (append your DOM here) |
| `ctx.players[i]` | `{i, side, rot, color, name}`; `rot` degrees: bottom 0, top 180, left 90, right -90 |
| `ctx.colors` | player colors array |
| `ctx.time` | game seconds (stops while paused) |
| `ctx.paused` | true during countdown and exit dialog |
| `ctx.loop(fn(dt, t))` | called every frame; `dt` seconds, **0 while paused** (still draw!) |
| `ctx.after(ms, fn)` / `ctx.every(ms, fn)` / `ctx.cancel(id)` | game-time timers, auto-cleared |
| `ctx.onResize(fn(W,H))`, `ctx.onCleanup(fn)` | hooks |
| `ctx.canvas({z})` | full-screen canvas, DPR handled, auto-resized; returns `{cv, g}`; draw in CSS px |
| `ctx.zone(i, {depth, className})` | DOM strip along player i's edge, rotated to face them. `depth` <=1 is a fraction of min(W,H), else px (default .25). Returns `{el, w, h, outer, rect}`; `el` is the upright inner box of size `w` (along the edge) x `h` (depth), put your buttons in it. Zones re-layout on resize (read `z.w`/`z.h` again). `rect` = `{x,y,w,h}` screen rect of the strip. CSS var `--pc` on `el` = player color. |
| `ctx.pointer(el, {down, move, up})` | `(id, x, y, e)`; x,y are screen px relative to root; pointer capture on |
| `ctx.tap(el, fn)` | instant tap handler (pointerdown), ignored while paused |
| `ctx.seatAt(x, y)` | player index whose edge is nearest |
| `ctx.facing(g, i, x, y)` | canvas: translate+rotate so text drawn at 0,0 is upright for player i (wrap in save/restore) |
| `ctx.toScreen(i, vx, vy)` / `ctx.toLocal(i, vx, vy)` | rotate vectors between player-local frame and screen frame |
| `ctx.inward(i)` | unit vector from player i's edge toward the center |
| `ctx.toast(text, {ms, color, fg, size, offset})` | short message near center, one copy per player facing them |
| `ctx.end({winner} or {winners:[..]} or {}, scores?, msg?)` | finish: shows result screen with per-seat labels, "Ещё раз", "Меню". Empty winners = draw |

Globals: `U.rand(a,b)`, `U.randInt(a,b)`, `U.pick(arr)`, `U.shuffle(arr)`, `U.clamp`, `U.lerp`, `U.dist`,
`U.alpha(hex, a)`, `U.h(tag, attrs, ...children)` (DOM helper; `class`, `style` object, `onX` listeners),
`COLORS`, `NAMES`.

Keep everything scoped inside `start` (or an IIFE) — files share one global scope.
CSS for a game: inject a `<style>` element inside `ctx.root`, prefix selectors with a game class
(e.g. `.g-reaction ...`). The exit button (40px) sits on a free edge: 2p → middle of the left edge, 3p → middle of the top edge. Keep that small spot free of important controls.

Design: dark background (`#0f1220`), player colors bright, big touch targets (>= 60px),
big readable text. Show each player's score/lives in their own zone. Rounds should be short;
a whole game ~1-3 minutes. Call `ctx.end` with the winner.

## Testing

Several people may build at once: use your own output dirs, e.g.
`OUT=/tmp/me/dist python3 build.py && OUT=/tmp/me/dist SHOTS=/tmp/me/shots node test/smoke.js mygame`.


`node test/smoke.js [gameId ...]` — builds nothing; run `python3 build.py` first. Loads
`dist/index.html` in Chromium at iPad sizes (portrait and landscape), starts each game with
2 and 3 players, fires random touches for a few seconds, reports console errors, and saves
screenshots to `test/shots/`. Look at the screenshots.
