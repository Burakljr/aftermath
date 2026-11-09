// Interaction test of the DOM UI in the UI lab (fake scene, real game).
//   timeout 600 node tests/ui/lab-play.cjs
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const PORT = Number(process.env.PORT) || 5301;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('ok  ', msg);
  else { failures++; console.log('FAIL', msg); }
}

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  try {
    await wait(400);
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
    const errors = [];
    const open = async (q) => {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`http://localhost:${PORT}/ui-lab.html?paused=1&${q}`);
      await page.waitForFunction(() => window.toy);
      await page.evaluate(() => window.toy.step(0.1));
      return page;
    };
    // taps wait for CSS slide-in animations (they run on wall-clock time) to settle
    const tapAt = async (page, x, y) => { await page.touchscreen.tap(x, y); await page.evaluate(() => window.toy.step(0.05)); await wait(320); };
    const tapSel = async (page, sel) => {
      const b = await page.locator(sel).first().boundingBox();
      if (!b) throw new Error('no element ' + sel);
      await tapAt(page, b.x + b.width / 2, b.y + b.height / 2);
    };
    const S = (page, fn) => page.evaluate(fn);

    // --- fresh game: tap the saw, upgrade, hold, close
    let page = await open('state=fresh&lang=en');
    check(await page.locator('.tut:not(.is-hidden)').count() === 1, 'tutorial hand visible on a fresh start');
    const saw = await S(page, () => { const a = window.toy.scene.anchor('saw'); return { x: a.x, y: a.y + 46 }; });
    await tapAt(page, saw.x, saw.y);
    check(await page.locator('.card:not(.is-hidden)').count() === 1, 'tapping the saw opens its card');
    check(await S(page, () => window.toy.game.state.factory.stations[0].boostT > 0), 'tapping the saw boosts it');
    const m0 = await S(page, () => window.toy.game.state.money);
    await tapSel(page, '.cbtn');
    check(await S(page, () => window.toy.game.state.factory.stations[0].level) === 2, 'Upgrade button raises the level');
    check(await S(page, () => window.toy.game.state.money) < m0, 'Upgrade costs coins');
    check(await S(page, () => window.toy.game.state.tutorial) === 1, 'tutorial moves on after the first upgrade');
    // hold to repeat
    await S(page, () => { window.toy.game.state.money = 5000; });
    const btn = await page.locator('.cbtn').first().boundingBox();
    await page.mouse.move(btn.x + 40, btn.y + btn.height / 2);
    await page.mouse.down();
    await S(page, () => window.toy.step(1.2));
    await page.mouse.up();
    const lvl = await S(page, () => window.toy.game.state.factory.stations[0].level);
    check(lvl >= 6, `holding Upgrade repeats (level ${lvl})`);
    // unaffordable
    await S(page, () => { window.toy.game.state.money = 0; window.toy.step(0.05); });
    check(await page.locator('.cbtn.is-disabled').count() === 1, 'button is disabled when unaffordable');
    check(await page.locator('.card-need:not(.is-hidden)').count() === 1, 'card says how many coins are missing');
    const needText = await page.locator('.card-need').textContent();
    check(/Need .+ more coins/.test(needText), `missing text: "${needText}"`);
    await tapSel(page, '.card-close');
    await S(page, () => window.toy.step(0.3));
    check(await page.locator('.card:not(.is-hidden)').count() === 0, 'close button hides the card');
    // tap empty space closes the card
    await tapAt(page, saw.x, saw.y);
    await tapAt(page, 360, 420);
    await S(page, () => window.toy.step(0.3));
    check(await page.locator('.card:not(.is-hidden)').count() === 0, 'tapping empty space closes the card');

    // goals: complete w1 and collect it
    await S(page, () => { const g = window.toy.game; g.state.money = 1e5; for (let i = 0; i < 6; i++) g.act({ type: 'upgrade', station: 'saw' }); window.toy.step(0.1); });
    check(await page.locator('.goal.is-done').count() >= 1, 'a finished goal shows Collect');
    const before = await S(page, () => window.toy.game.state.money);
    await tapSel(page, '.goal.is-done');
    check(await S(page, () => window.toy.game.state.goals[0].claimed), 'tapping Collect claims the goal');
    check(await S(page, () => window.toy.game.state.money) > before, 'goal reward is paid');

    // locked station: open via sign
    await S(page, () => { window.toy.game.state.money = 1000; window.toy.step(0.1); });
    const sign = await page.locator('.mark.is-next .mark-sign').boundingBox();
    await tapAt(page, sign.x + sign.width / 2, sign.y + sign.height / 2);
    check(await page.locator('.card.is-locked:not(.is-hidden)').count() === 1, 'tapping the Open sign shows the station card');
    await tapSel(page, '.cbtn');
    check(await S(page, () => window.toy.game.state.factory.stations[2].open), 'Open button opens the station');

    // settings
    await S(page, () => window.toy.step(0.3));
    await tapSel(page, '.hud-gear');
    check(await page.locator('.set-card').isVisible(), 'gear opens settings');
    await tapSel(page, '.set-row[data-key="lang"] .seg-btn[data-value="tr"]');
    check(await S(page, () => document.documentElement.lang) === 'tr', 'language switches to Turkish');
    check((await page.locator('.modal-title').first().textContent()) === 'Ayarlar', 'settings title is Turkish');
    await tapSel(page, '.set-row[data-key="sound"] .seg-btn[data-value="false"]');
    check(await S(page, () => window.toy.game.state.settings.sound) === false, 'sound can be turned off');
    await tapSel(page, '.set-row[data-key="quality"] .seg-btn[data-value="low"]');
    check(await S(page, () => window.toy.scene.stats().quality) === 'low', 'quality setting reaches the scene');
    await tapSel(page, '.set-row[data-key="fps"] .seg-btn[data-value="true"]');
    await S(page, () => window.toy.step(0.6));
    check(await page.locator('.hud-fps:not(.is-hidden)').count() === 1, 'FPS meter shows');
    await tapSel(page, '.set-card .cbtn');
    await S(page, () => window.toy.step(0.3));
    await wait(250);
    check(await page.locator('.set-card').isVisible() === false, 'Done closes settings');
    check(/Ahşap/.test(await page.locator('.goals-name').textContent()), 'goal strip in Turkish');
    await page.close();

    // offline card
    page = await open('state=offline&lang=en');
    check(await page.locator('.off-card').isVisible(), 'offline card shows on return');
    const offAmt = await S(page, () => window.toy.game.select.offline().amount);
    const m1 = await S(page, () => window.toy.game.state.money);
    await tapSel(page, '.off-card .cbtn');
    check(Math.abs((await S(page, () => window.toy.game.state.money)) - (m1 + offAmt)) < 1, 'Collect adds the offline coins');
    await page.close();

    // factory complete -> next factory
    page = await open('state=complete&lang=en');
    await S(page, () => window.toy.step(0.2));
    check(await page.locator('.cmp-card').isVisible(), 'factory complete screen shows');
    await tapSel(page, '.cmp-card .cbtn');
    await S(page, () => window.toy.step(0.3));
    check(await S(page, () => window.toy.game.state.factory.id) === 'teddy', 'Next factory starts the Teddy Bears factory');
    check(await page.locator('.mark').count() === 4, 'station marks rebuilt for the new factory');
    await page.close();

    check(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await browser.close();
  } finally {
    server.kill();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nall UI checks passed');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
