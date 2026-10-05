'use strict';
// Menu order. Games not listed here go to the end.
const ORDER = ['reaction', 'tug', 'math', 'potato', 'spot', 'stopwatch', 'stroop',
  'airhockey', 'pong', 'snakes', 'paint', 'catch', 'sumo', 'tanks', 'rhythm',
  'memory', 'connect', 'draw'];
App.games.sort((a, b) => {
  const ia = ORDER.indexOf(a.id), ib = ORDER.indexOf(b.id);
  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
});
App.el = document.getElementById('app');
load();
showMenu();

// iOS: block pinch-zoom and double-tap zoom gestures.
['gesturestart', 'gesturechange', 'dblclick'].forEach(ev =>
  document.addEventListener(ev, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => {
  if (!e.target.closest || !e.target.closest('.menu')) e.preventDefault();
}, { passive: false });

// Offline support when served from a website (ignored elsewhere).
if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude|anthropic/.test(location.hostname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
