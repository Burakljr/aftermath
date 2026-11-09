// Screenshots of the real game in play order (iPhone 13 portrait, 390x844, DPR 2).
//   timeout 600 node tests/shots.cjs [outDir]
// Starts its own static server on PORT (default 5303). Shots:
//   01-start-tutorial 02-station-card 03-mid-flow 04-all-open 05-goals
//   06-factory-complete 07-teddy-factory 08-settings-tr 09-offline-card
// Prints the scene stats (draw calls, triangles) for every shot, at High and Low.
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { definePlayer } = require('./helpers.cjs');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 5303;
const URL = `http://localhost:${PORT}/`;
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'toy-factory-shots'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  let browser;
  const errors = [];
  let lowWood = null;
  try {
    await wait(400);
    browser = await chromium.launch();
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-US' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    const S = (fn, arg) => page.evaluate(fn, arg);
    const tapAt = async (x, y) => { await page.touchscreen.tap(x, y); await wait(200); };
    const tapSel = async (sel) => {
      const b = await page.locator(sel).first().boundingBox();
      if (!b) throw new Error('no element ' + sel);
      await tapAt(b.x + b.width / 2, b.y + b.height / 2);
    };
    const boot = async () => {
      await page.waitForFunction(() => window.toy && window.toy.ready, null, { timeout: 60000 });
      await S(definePlayer);
    };
    const machinePoint = (id) => S((sid) => { const a = window.toy.scene.anchor(sid); return { x: a.x, y: a.y + 34 }; }, id);
    const stats = [];
    // let CSS transitions finish (they run on wall-clock time), then shoot
    const shot = async (name, settleMs = 650) => {
      await wait(settleMs);
      await page.screenshot({ path: path.join(OUT, name + '.png') });
      const s = await S(() => window.toy.scene.stats());
      stats.push({ name, calls: s.calls, tris: s.tris, quality: s.quality });
      console.log(`${name.padEnd(20)} ${String(s.calls).padStart(3)} draws ${String(Math.round(s.tris / 100) / 10).padStart(5)}k tris (${s.quality})`);
    };

    // 01: fresh start, the tutorial hand points at the Saw
    await page.goto(URL + '?autoq=0');
    await boot();
    await S(() => window.toy.step(2.2));
    await shot('01-start-tutorial', 900);

    // 02: tap the Saw: its card with the big Upgrade button
    let p = await machinePoint('saw');
    await tapAt(p.x, p.y);
    await S(() => window.toy.step(0.4));
    await shot('02-station-card');
    await tapSel('.card .cbtn');
    await tapSel('.card-close');

    // 03: the line running, saved up for the Paint Booth: the hand points at the Open sign
    await S(() => window.__play({ seconds: 300, open: false, until: 'money>=open' }));
    await S(() => { window.toy.game.act({ type: 'boost', station: window.toy.game.select.bottleneck() }); window.toy.step(0.7); });
    await shot('03-mid-flow');
    await tapSel('.mark.is-next .mark-sign');
    await tapSel('.card .cbtn.is-open-btn');

    // 04: all four stations open, toys flowing, the slowest station boosted
    await S(() => window.__play({ seconds: 600, open: false, until: 'money>=open' }));
    await tapSel('.mark.is-next .mark-sign');
    await tapSel('.card .cbtn.is-open-btn');
    await S(() => window.__play({ seconds: 20 }));
    await S(() => { const g = window.toy.game; for (const s of g.state.factory.stations) g.act({ type: 'boost', station: s.id }); window.toy.step(1.2); });
    await shot('04-all-open');
    lowWood = await S(() => { const g = window.toy.game; g.act({ type: 'setting', key: 'quality', value: 'low' }); window.toy.step(0.1); const s = window.toy.scene.stats(); g.act({ type: 'setting', key: 'quality', value: 'high' }); window.toy.step(0.1); return s; });
    console.log(`wood all open at Low   ${lowWood.calls} draws ${Math.round(lowWood.tris / 100) / 10}k tris (${lowWood.quality})`);

    // 05: goals: a finished goal shows a glowing Collect button
    await S(() => window.__play({ seconds: 300, claim: false, until: 'goalDone' }));
    await S(() => window.toy.step(0.5));
    await shot('05-goals');
    await tapSel('.goal.is-done');

    // 06: every goal collected: Factory complete
    await S(() => window.__play({ seconds: 2400, until: 'complete' }));
    const t1 = await S(() => window.__gameTime);
    console.log(`factory 1 complete after ${Math.floor(t1 / 60)}:${String(Math.floor(t1 % 60)).padStart(2, '0')} of game time`);
    await S(() => window.toy.step(0.6));
    await shot('06-factory-complete', 900);

    // 07: next factory: Teddy Bears, a minute in
    await tapSel('.cmp .cbtn');
    await S(() => window.__play({ seconds: 75 }));
    await S(() => { const g = window.toy.game; const b = g.select.bottleneck(); g.act({ type: 'boost', station: b }); window.toy.step(0.8); });
    await shot('07-teddy-factory');

    // 08: settings in Turkish
    await tapSel('.hud-gear');
    await tapSel('.seg-btn[data-value="tr"]');
    await shot('08-settings-tr');
    await tapSel('.set-card .cbtn');

    // low quality numbers for the same view
    await S(() => { window.toy.game.act({ type: 'setting', key: 'quality', value: 'low' }); window.toy.step(0.2); });
    const low = await S(() => window.toy.scene.stats());
    console.log(`teddy at Low           ${low.calls} draws ${Math.round(low.tris / 100) / 10}k tris (${low.quality})`);
    await S(() => { window.toy.game.act({ type: 'setting', key: 'quality', value: 'high' }); window.toy.step(0.2); });

    // 09: back after 90 minutes away: offline earnings (Turkish)
    await page.goto(URL + 'assets/fonts/OFL.txt');
    await S(() => {
      const raw = JSON.parse(localStorage.getItem('toyfactory.save.v1'));
      raw.lastSeen -= 90 * 60 * 1000;
      localStorage.setItem('toyfactory.save.v1', JSON.stringify(raw));
    });
    await page.goto(URL + '?autoq=0');
    await boot();
    await S(() => window.toy.step(0.5));
    await shot('09-offline-card', 900);

    fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify({ shots: stats, woodLow: { calls: lowWood.calls, tris: lowWood.tris }, teddyLow: { calls: low.calls, tris: low.tris } }, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }
  const real = errors.filter((e) => !/GPU stall due to ReadPixels/.test(e));
  if (real.length) { console.log('console errors:\n  ' + real.join('\n  ')); process.exit(1); }
  console.log('shots in', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
