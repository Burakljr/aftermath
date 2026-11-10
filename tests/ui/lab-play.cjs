// Interaction test of the DOM UI in the UI lab (fake scene, real game).
//   timeout 600 node tests/ui/lab-play.cjs
// Starts tools/serve.mjs on PORT (default 5301), emulates an iPhone 13 (390 x 844, 1x) and checks:
// station card (tap, upgrade, hold to repeat, not enough coins, close), next-goal pill collect,
// Open sign -> Open, settings (language, sound, quality, FPS), Upgrades list (buy, hold, open),
// Goals panel (collect, Go hint), Factories panel, offline card, factory complete -> next
// factory, touch target sizes, bottom bar height and safe-area padding.
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
    const open = async (q, c = ctx) => {
      const page = await c.newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`http://localhost:${PORT}/ui-lab.html?paused=1&${q}`);
      await page.waitForFunction(() => window.toy && document.fonts && document.fonts.status === 'loaded');
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
    const holdSel = async (page, sel, seconds) => {
      const b = await page.locator(sel).first().boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.evaluate((s) => window.toy.step(s), seconds);
      await page.mouse.up();
    };
    const S = (page, fn, arg) => page.evaluate(fn, arg);
    const vis = async (page, sel) => (await page.locator(sel).count()) > 0 && page.locator(sel).first().isVisible();

    // ------------------------------------------------------------ fresh game: tap the saw, upgrade, hold, close
    let page = await open('state=fresh&lang=en');
    check(await page.locator('.tut:not(.is-hidden)').count() === 1, 'tutorial hand visible on a fresh start');
    check(/Tap the Saw/.test(await page.locator('.tut-bubble').textContent()), 'tutorial says "Tap the Saw"');
    // HUD pieces
    check(await vis(page, '.hud-coins') && await vis(page, '.hud-inc') && await vis(page, '.hud-badge') && await vis(page, '.hud-gear'), 'HUD: coin pill, income chip, factory badge, gear');
    check(await page.locator('.hud-star').count() === 3, 'factory badge has a 3-star goal bar');
    check(await page.locator('.mbtn').count() === 3, 'menu bar has 3 buttons');
    check(/Upgrade the Saw/.test(await page.locator('.ngp-text').textContent()), 'next-goal pill shows the first goal');
    // sizes: touch targets >= 44 px, bottom bar + pill <= 22% of the screen, nothing off screen
    const sizes = await S(page, () => {
      const out = [];
      for (const sel of ['.hud-gear', '.hud-badge', '.mbtn', '.ngp']) {
        for (const e of document.querySelectorAll(sel)) { const r = e.getBoundingClientRect(); out.push({ sel, w: r.width, h: r.height, l: r.left, r: r.right }); }
      }
      const b = document.querySelector('.bottom').getBoundingClientRect();
      return { out, bottomShare: (innerHeight - b.top) / innerHeight };
    });
    const small = sizes.out.filter((x) => x.w < 44 || x.h < 44);
    check(small.length === 0, 'HUD and menu touch targets are at least 44 px' + (small.length ? ': ' + JSON.stringify(small) : ''));
    const off = sizes.out.filter((x) => x.l < 0 || x.r > 390);
    check(off.length === 0, 'HUD and menu stay inside the screen');
    check(sizes.bottomShare <= 0.22, `bottom bar + goal pill use ${(sizes.bottomShare * 100).toFixed(1)}% of the screen height (<= 22%)`);

    const saw = await S(page, () => { const a = window.toy.scene.anchor('saw'); return { x: a.x, y: a.y + 46 }; });
    await tapAt(page, saw.x, saw.y);
    check(await page.locator('.card:not(.is-hidden)').count() === 1, 'tapping the saw opens its card');
    check(await S(page, () => window.toy.game.state.factory.stations[0].boostT > 0), 'tapping the saw boosts it');
    check(/Saw/.test(await page.locator('.card-title').textContent()), 'card ribbon shows the station name');
    check(await S(page, () => document.querySelector('.ui-root').classList.contains('card-open')), 'menu bar slides away while the card is open');
    check(await page.locator('.card .cbtn.is-ready').count() === 1, 'affordable Upgrade button pulses (is-ready)');
    const m0 = await S(page, () => window.toy.game.state.money);
    await tapSel(page, '.card .cbtn');
    check(await S(page, () => window.toy.game.state.factory.stations[0].level) === 2, 'Upgrade button raises the level');
    check(await S(page, () => window.toy.game.state.money) < m0, 'Upgrade costs coins');
    check(await S(page, () => window.toy.game.state.tutorial) === 1, 'tutorial moves on after the first upgrade');
    // hold to repeat
    await S(page, () => { window.toy.game.state.money = 5000; });
    await holdSel(page, '.card .cbtn', 1.2);
    const lvl = await S(page, () => window.toy.game.state.factory.stations[0].level);
    check(lvl >= 6, `holding Upgrade repeats (level ${lvl})`);
    check(await page.locator('.card-stars .star').count() === 4, 'card shows 4 milestone stars');
    // unaffordable
    await S(page, () => { window.toy.game.state.money = 0; window.toy.step(0.05); });
    check(await page.locator('.card .cbtn.is-disabled').count() === 1, 'button is disabled (grey) when unaffordable');
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
    await wait(300);

    // goals: complete w1 and collect it from the next-goal pill
    await S(page, () => { const g = window.toy.game; g.state.money = 1e5; for (let i = 0; i < 6; i++) g.act({ type: 'upgrade', station: 'saw' }); window.toy.step(0.2); });
    check(await page.locator('.goal.is-done').count() === 1, 'a finished goal turns the pill into Collect');
    check(await page.locator('.ngp-dot.is-on').count() === 1 && await page.locator('.mbtn[data-menu="goals"] .mbtn-dot.is-on').count() === 1, 'red notification dots on the pill and the Goals button');
    const before = await S(page, () => window.toy.game.state.money);
    await tapSel(page, '.goal.is-done');
    check(await S(page, () => window.toy.game.state.goals[0].claimed), 'tapping Collect claims the goal');
    check(await S(page, () => window.toy.game.state.money) > before, 'goal reward is paid');

    // locked station: open via sign
    await S(page, () => { window.toy.game.state.money = 1000; window.toy.step(0.2); });
    const sign = await page.locator('.mark.is-next .mark-sign').boundingBox();
    await tapAt(page, sign.x + sign.width / 2, sign.y + sign.height / 2);
    check(await page.locator('.card.is-locked:not(.is-hidden)').count() === 1, 'tapping the Open sign shows the station card');
    check(await page.locator('.card .cbtn.is-open-btn').count() === 1, 'locked card has a yellow Open button');
    await tapSel(page, '.card .cbtn');
    check(await S(page, () => window.toy.game.state.factory.stations[2].open), 'Open button opens the station');
    await S(page, () => window.toy.step(0.3));
    await wait(300);

    // ------------------------------------------------------------ Upgrades list
    await S(page, () => { window.toy.game.state.money = 3000; window.toy.step(0.3); });
    check(await page.locator('.mbtn[data-menu="upgrades"] .mbtn-dot.is-on').count() === 1, 'Upgrades button shows how many upgrades are ready');
    await tapSel(page, '.mbtn[data-menu="upgrades"]');
    check(await vis(page, '.up-card'), 'Upgrades button opens the Upgrades list');
    check(await page.locator('.up-row').count() === 4, 'Upgrades list has every station');
    check(await vis(page, '.hud-coins') && await S(page, () => getComputedStyle(document.querySelector('.hud')).zIndex === '6'), 'coins stay visible above the dimmed screen');
    let l0 = await S(page, () => window.toy.game.state.factory.stations[1].level);
    await tapSel(page, '.up-btn[data-station="assembly"]');
    check(await S(page, () => window.toy.game.state.factory.stations[1].level) === l0 + 1, 'list button buys one Assembly level');
    l0 = await S(page, () => window.toy.game.state.factory.stations[2].level);
    await S(page, () => { window.toy.game.state.money = 1e5; window.toy.step(0.15); });
    await holdSel(page, '.up-btn[data-station="paint"]', 1.2);
    const l1 = await S(page, () => window.toy.game.state.factory.stations[2].level);
    check(l1 >= l0 + 5, `holding a list button repeats (Paint ${l0} -> ${l1})`);
    check(/Lv \d+/.test(await page.locator('.up-row[data-station="paint"] .up-lv').textContent()), 'list rows show the level');
    check(/\+\d[^ ]*\s*per toy/.test(await page.locator('.up-row[data-station="paint"] .up-gain').textContent()), 'list rows show the gain per toy');
    await S(page, () => { window.toy.game.state.money = 100; window.toy.step(0.15); });
    check(await page.locator('.up-btn[data-station="wrap"].is-disabled').count() === 1, 'Gift Wrap row: Open button is grey until affordable');
    await S(page, () => { window.toy.game.state.money = 1e6; window.toy.step(0.15); });
    await tapSel(page, '.up-btn[data-station="wrap"]');
    check(await S(page, () => window.toy.game.state.factory.stations[3].open), 'Open from the Upgrades list opens Gift Wrap');
    await S(page, () => window.toy.step(0.3));
    await wait(250);
    check(!(await vis(page, '.up-card')), 'the list closes so the new machine can be seen');
    await tapSel(page, '.mbtn[data-menu="upgrades"]');
    await tapSel(page, '.up-card .modal-x');
    await wait(250);
    check(!(await vis(page, '.up-card')), 'red X closes the Upgrades list');

    // ------------------------------------------------------------ Goals panel
    await S(page, () => { window.toy.game.state.money = 300; window.toy.step(0.3); });
    await tapSel(page, '.mbtn[data-menu="goals"]');
    check(await vis(page, '.gp-card'), 'Goals button opens the Goals panel');
    check(await page.locator('.gp-row:not(.is-hidden)').count() === 3, 'Goals panel lists 3 goals');
    check(/Wooden Toys/.test(await page.locator('.goals-name').textContent()), 'Goals panel shows the factory name');
    check(/\d+\/15/.test(await page.locator('.gp-count').textContent()), 'Goals panel shows collected/total');
    let done = await page.locator('.gp-row.is-done').count();
    check(done >= 1, `finished goals show Collect in the panel (${done})`);
    const cl0 = await S(page, () => window.toy.game.state.goals.filter((g) => g.claimed).length);
    await tapSel(page, '.gp-row.is-done .gp-btn');
    await S(page, () => window.toy.step(0.2));
    check(await S(page, () => window.toy.game.state.goals.filter((g) => g.claimed).length) === cl0 + 1, 'Collect in the Goals panel claims the goal');
    // Go on an unfinished goal closes the panel and points at the station
    while (await page.locator('.gp-row.is-done').count()) { await tapSel(page, '.gp-row.is-done .gp-btn'); await S(page, () => window.toy.step(0.2)); }
    await tapSel(page, '.gp-row:not(.is-done) .gp-btn');
    await wait(250);
    check(!(await vis(page, '.gp-card')), 'Go closes the Goals panel');
    check(await page.locator('.tut:not(.is-hidden)').count() === 1, 'Go points at the place to work on');
    await S(page, () => window.toy.step(2.5));
    // tapping the pill when its goal is not done opens the panel
    await S(page, () => window.toy.step(0.2));
    if (await page.locator('.goal.is-done').count() === 0) {
      await tapSel(page, '.ngp');
      check(await vis(page, '.gp-card'), 'tapping an unfinished goal pill opens the Goals panel');
      await tapAt(page, 195, 60); // backdrop
      await wait(250);
      check(!(await vis(page, '.gp-card')), 'tapping outside closes the Goals panel');
    }

    // ------------------------------------------------------------ Factories panel
    await tapSel(page, '.mbtn[data-menu="factories"]');
    check(await vis(page, '.fp-card'), 'Factories button opens the Factories panel');
    check(await page.locator('.fp-node').count() === 4, 'Factories map has 2 factories and 2 coming-soon spots');
    check(await page.locator('.fp-node.is-here').count() === 1 && await page.locator('.fp-node.is-locked').count() === 1 && await page.locator('.fp-node.is-soon').count() === 2, 'current, locked and coming-soon factories are marked');
    await tapSel(page, '.fp-card .modal-x');
    await wait(250);
    check(!(await vis(page, '.fp-card')), 'red X closes the Factories panel');
    await tapSel(page, '.hud-badge');
    check(await vis(page, '.fp-card'), 'the factory badge also opens the Factories panel');
    await tapSel(page, '.fp-card .modal-x');
    await wait(250);

    // ------------------------------------------------------------ settings
    await S(page, () => window.toy.step(0.3));
    await tapSel(page, '.hud-gear');
    check(await page.locator('.set-card').isVisible(), 'gear opens settings');
    await tapSel(page, '.set-row[data-key="lang"] .seg-btn[data-value="tr"]');
    check(await S(page, () => document.documentElement.lang) === 'tr', 'language switches to Turkish');
    check((await page.locator('.set-card .modal-title').textContent()) === 'Ayarlar', 'settings title is Turkish');
    await tapSel(page, '.set-row[data-key="sound"] .seg-btn[data-value="false"]');
    check(await S(page, () => window.toy.game.state.settings.sound) === false, 'sound can be turned off');
    await tapSel(page, '.set-row[data-key="quality"] .seg-btn[data-value="low"]');
    check(await S(page, () => window.toy.scene.stats().quality) === 'low', 'quality setting reaches the scene');
    await tapSel(page, '.set-row[data-key="fps"] .seg-btn[data-value="true"]');
    await S(page, () => window.toy.step(0.6));
    check(await page.locator('.hud-fps:not(.is-hidden)').count() === 1, 'FPS meter shows');
    const segSmall = await S(page, () => [...document.querySelectorAll('.seg-btn, .set-card .cbtn, .set-card .modal-x')].map((e) => e.getBoundingClientRect()).filter((r) => r.width < 44 || r.height < 44).length);
    check(segSmall === 0, 'settings buttons are at least 44 px');
    await tapSel(page, '.set-card .cbtn');
    await S(page, () => window.toy.step(0.3));
    await wait(250);
    check(await page.locator('.set-card').isVisible() === false, 'Done closes settings');
    check(/Ahşap/.test(await page.locator('.goals-name').textContent()), 'factory name in Turkish');
    check(/^Sv\. \d+$/.test(await page.locator('.mark.is-open .mark-lvl').first().textContent()), 'Turkish level badge reads "Sv. N"');
    check(/Yükselt/.test(await page.locator('.mbtn[data-menu="upgrades"] .mbtn-label').textContent()), 'menu labels in Turkish');
    await page.close();

    // ------------------------------------------------------------ offline card
    page = await open('state=offline&lang=en');
    check(await page.locator('.off-card').isVisible(), 'offline card shows on return');
    const offAmt = await S(page, () => window.toy.game.select.offline().amount);
    const m1 = await S(page, () => window.toy.game.state.money);
    await tapAt(page, 195, 60); // backdrop does not close it
    check(await page.locator('.off-card').isVisible(), 'offline card stays until collected');
    await tapSel(page, '.off-card .cbtn');
    check(Math.abs((await S(page, () => window.toy.game.state.money)) - (m1 + offAmt)) < 1, 'Collect adds the offline coins');
    await page.close();

    // ------------------------------------------------------------ factory complete -> next factory
    page = await open('state=complete&lang=en');
    await S(page, () => window.toy.step(0.2));
    check(await page.locator('.cmp-card').isVisible(), 'factory complete screen shows');
    check(/Factory complete/.test(await page.locator('.cmp-title').textContent()), 'complete screen ribbon title');
    check(await page.locator('.cmp-star').count() === 3 && await page.locator('.cmp-confetti i').count() > 20, 'complete screen has 3 stars and confetti');
    await tapSel(page, '.cmp-card .cbtn');
    await S(page, () => window.toy.step(0.3));
    check(await S(page, () => window.toy.game.state.factory.id) === 'teddy', 'Next factory starts the Teddy Bears factory');
    check(await page.locator('.mark').count() === 4, 'station marks rebuilt for the new factory');
    await wait(300);
    await tapSel(page, '.mbtn[data-menu="factories"]');
    check(await page.locator('.fp-node.is-done').count() === 1 && await page.locator('.fp-node.is-here .fp-name').textContent().then((t) => /Teddy/.test(t)), 'Factories map: Wooden Toys done, Teddy Bears current');
    await page.close();

    // ------------------------------------------------------------ safe areas (notch + home bar)
    page = await open('state=fresh&lang=en');
    await page.addStyleTag({ content: ':root { --safe-t: 47px; --safe-b: 34px; }' });
    await S(page, () => window.toy.step(0.1));
    const safe = await S(page, () => ({
      hud: document.querySelector('.hud').getBoundingClientRect().top,
      bottom: innerHeight - document.querySelector('.bottom').getBoundingClientRect().bottom,
      share: (innerHeight - document.querySelector('.bottom').getBoundingClientRect().top) / innerHeight,
    }));
    check(safe.hud >= 47 && safe.bottom >= 34, `HUD and menu respect safe areas (top ${safe.hud}, bottom gap ${safe.bottom})`);
    check(safe.share <= 0.22, `with a home bar the bottom UI uses ${(safe.share * 100).toFixed(1)}% (<= 22%)`);
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
