'use strict';
// Menu order. Games not listed here go to the end.
const ORDER = ['reaction', 'nerves', 'tug', 'twister', 'math', 'potato', 'spot', 'stopwatch', 'stroop', 'balloon',
  'airhockey', 'pong', 'curling', 'snakes', 'paint', 'catch', 'sumo', 'blobs', 'tanks', 'racing', 'rhythm',
  'memory', 'connect', 'chain', 'dots', 'draw'];
App.games.sort((a, b) => {
  const ia = ORDER.indexOf(a.id), ib = ORDER.indexOf(b.id);
  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
});
App.sections = [
  { title: '⚡ Кто быстрее', ids: ['reaction', 'tug', 'math', 'spot', 'stroop', 'stopwatch'] },
  { title: '🎲 Нервы и риск', ids: ['nerves', 'balloon', 'potato', 'twister'] },
  { title: '🕹️ Аркады', ids: ['airhockey', 'pong', 'curling', 'snakes', 'paint', 'catch', 'sumo', 'blobs', 'tanks', 'racing', 'rhythm'] },
  { title: '🧠 По очереди', ids: ['memory', 'connect', 'chain', 'dots', 'draw'] },
];
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
