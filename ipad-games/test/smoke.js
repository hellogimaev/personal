// Usage: node test/smoke.js [gameId ...]   (run `python3 build.py` first)
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }
const path = require('path');
const fs = require('fs');
const url = 'file://' + path.resolve(process.env.OUT || path.join(__dirname, '../dist'), 'index.html');
const outDir = process.env.SHOTS || path.resolve(__dirname, 'shots');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const browser = await pw.chromium.launch();
  const sizes = [{ name: 'land', width: 1180, height: 820 }, { name: 'port', width: 820, height: 1180 }];
  let ids = process.argv.slice(2);
  let failures = 0;
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, hasTouch: true, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url);
    await page.waitForTimeout(300);
    if (size.name === 'land') await page.screenshot({ path: `${outDir}/_menu.png` });
    if (!ids.length) ids = await page.evaluate(() => App.games.map(g => g.id));
    for (const id of ids) {
      for (const n of [2, 3]) {
        errors.length = 0;
        const ok = await page.evaluate(([id, n]) => {
          const g = App.games.find(x => x.id === id);
          if (!g || n < g.minPlayers || n > g.maxPlayers) return false;
          window.__start(id, n); return true;
        }, [id, n]);
        if (!ok) continue;
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${outDir}/${id}-${n}p-${size.name}-a.png` });
        // random multi-touch for ~3s
        await page.evaluate(async () => {
          const W = innerWidth, H = innerHeight;
          const fire = (type, id, x, y) => {
            const el = document.elementFromPoint(x, y);
            if (!el || el.classList.contains('exit')) return;
            el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: id === 1 }));
          };
          for (let k = 0; k < 60; k++) {
            const id = 1 + (k % 4);
            const x = 60 + Math.random() * (W - 120), y = 60 + Math.random() * (H - 120);
            fire('pointerdown', id, x, y);
            await new Promise(r => setTimeout(r, 20));
            fire('pointermove', id, x + 20, y + 10);
            await new Promise(r => setTimeout(r, 20));
            fire('pointerup', id, x + 20, y + 10);
            await new Promise(r => setTimeout(r, 10));
          }
        });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: `${outDir}/${id}-${n}p-${size.name}-b.png` });
        // resize check
        await page.setViewportSize({ width: size.height, height: size.width });
        await page.waitForTimeout(300);
        await page.setViewportSize({ width: size.width, height: size.height });
        await page.waitForTimeout(300);
        const state = await page.evaluate(() => ({ alive: !!(App.ctx && App.ctx.alive), result: !!document.querySelector('.result-seat') }));
        const status = errors.length ? 'FAIL' : 'ok';
        if (errors.length) failures++;
        console.log(`${status} ${id} ${n}p ${size.name} alive=${state.alive} ended=${state.result}${errors.length ? '\n   ' + [...new Set(errors)].slice(0, 5).join('\n   ') : ''}`);
        await page.evaluate(() => { if (App.ctx) App.ctx._destroy(); showMenu(); });
      }
    }
    await page.close();
  }
  await browser.close();
  console.log(failures ? `${failures} failing runs` : 'all ok');
  process.exit(failures ? 1 : 0);
})();
