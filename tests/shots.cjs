// Screenshots of the real game in play order (iPhone 13 portrait, 390 x 844, DPR 2, plus a
// 1x copy of each for review at real size).
//   timeout 600 node tests/shots.cjs [outDir] [bestDir]
// Starts its own static server on PORT (default 5403). Shots:
//   01-start-tutorial 02-station-card 03-busy-inn 04-upgrades-panel 05-goals
//   06-location-complete 07-harbor-tavern 08-settings-tr
// bestDir gets copies of the 4 most owner-facing shots. Prints the scene stats of every shot.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { wait, LAUNCH, startServer, definePlayer } = require('./helpers.cjs');

const PORT = Number(process.env.PORT) || 5403;
const URL = `http://localhost:${PORT}/`;
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'heroes-diner-shots'));
const BEST = process.argv[3] ? path.resolve(process.argv[3]) : null;
const BEST_SHOTS = ['03-busy-inn', '02-station-card', '07-harbor-tavern', '06-location-complete'];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer(PORT);
  let browser;
  const errors = [];
  try {
    browser = await chromium.launch(LAUNCH);
    const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-US' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

    const S = (fn, arg) => page.evaluate(fn, arg);
    const step = (s, h) => S(([x, y]) => window.diner.step(x, y), [s, h || 1 / 30]);
    const tapAt = async (x, y) => { await page.touchscreen.tap(x, y); await step(0.05); await wait(250); };
    const tapSel = async (sel) => {
      const b = await page.locator(sel).first().boundingBox();
      if (!b) throw new Error('no element ' + sel);
      await tapAt(b.x + b.width / 2, b.y + b.height / 2);
    };
    const stationPoint = (id) => S((sid) => { const a = window.diner.scene.anchor('station', sid); return { x: a.x, y: a.y + 30 }; }, id);
    // after a fast-forward: let the burst of "+coins" floats finish (wall clock), then run the
    // last moments close to real time so the floats on screen look like real play
    const live = async (seconds = 0.6) => {
      await wait(1400);
      for (let t = 0; t < seconds; t += 0.1) { await step(0.1); await wait(90); }
    };
    const stats = [];
    // let CSS transitions finish (they run on the wall clock), then shoot at DPR 2 and 1x
    const shot = async (name, settleMs = 700) => {
      await wait(settleMs);
      await page.screenshot({ path: path.join(OUT, name + '.png') });
      await page.screenshot({ path: path.join(OUT, name + '@1x.png'), scale: 'css' });
      const s = await S(() => window.diner.scene.stats());
      const g = await S(() => ({ guests: window.diner.game.state.customers.length, cooks: window.diner.game.state.cooks.length }));
      stats.push({ name, ...s, ...g });
      console.log(`${name.padEnd(22)} ${String(s.calls).padStart(3)} draws ${String(Math.round(s.tris / 100) / 10).padStart(6)}k tris  ${g.guests} guests ${g.cooks} cooks (${s.quality})`);
    };

    // 01: fresh start, the tutorial points at the Juice Bar
    await page.goto(URL + '?manual=1&autoq=0');
    await page.waitForFunction(() => window.diner && window.diner.ready && document.fonts.status === 'loaded', null, { timeout: 120000 });
    await S(definePlayer);
    await step(2.6);
    await shot('01-start-tutorial', 900);

    // 02: tap the Juice Bar: its card with the big Upgrade button
    let p = await stationPoint('juice');
    await tapAt(p.x, p.y);
    await step(0.8);
    await shot('02-station-card');
    await tapSel('.card .big');
    await tapSel('.card .x');

    // the Grill with real taps, then play on until the Oven is open
    await S(() => window.__play({ seconds: 300, open: false, until: 'money>=open' }));
    await step(0.3);
    await tapSel('.mark .sign.can');
    await tapSel('.card .big');
    await tapSel('.card .x');
    await S(() => window.__play({ seconds: 1200, until: 'allOpen', renderEvery: 30 }));
    await S(() => window.__play({ seconds: 70, renderEvery: 30 }));

    // 03: the busy inn: every station open, guests eating, cooks carrying
    await step(1.2);
    await live();
    await shot('03-busy-inn', 250);

    // 04: Upgrades panel
    await tapSel('.menu-btn[data-menu="upgrades"]');
    await step(0.3);
    await shot('04-upgrades-panel');
    await tapSel('.upgrades-sheet .close-btn');

    // 05: Goals panel (with a goal ready to collect if there is one)
    await S(() => window.__play({ seconds: 60, claim: false, until: 'goalDone', renderEvery: 30 }));
    await live(0.3);
    await tapSel('.menu-btn[data-menu="goals"]');
    await step(0.3);
    await shot('05-goals');
    await tapSel('.goals-sheet .close-btn');

    // 06: every goal collected: Restaurant complete
    await S(() => window.__play({ seconds: 1800, until: 'complete', renderEvery: 60 }));
    await step(0.6);
    await shot('06-location-complete', 1200);

    // 07: the Harbor Tavern after a few minutes
    await tapSel('.modal.open .btn-wide');
    await step(0.5);
    await S(() => window.__play({ seconds: 2400, until: 'allOpen', renderEvery: 60 }));
    await S(() => window.__play({ seconds: 25, claim: false, renderEvery: 30 }));
    await step(1.2);
    await live();
    await shot('07-harbor-tavern', 250);

    // 08: settings in Turkish
    await tapSel('.gear');
    await tapSel('.seg[data-setting="lang"] button[data-value="tr"]');
    await step(0.2);
    await shot('08-settings-tr');

    fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify(stats, null, 2));
    if (BEST) {
      fs.mkdirSync(BEST, { recursive: true });
      BEST_SHOTS.forEach((n, i) => {
        fs.copyFileSync(path.join(OUT, n + '.png'), path.join(BEST, `${i + 1}-${n.replace(/^\d+-/, '')}.png`));
      });
    }
    console.log(errors.length ? 'errors:\n  ' + errors.join('\n  ') : 'no console errors');
    console.log('saved to', OUT);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }
  process.exit(errors.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
