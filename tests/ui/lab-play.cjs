// Interaction test of the DOM UI in the UI lab (fake scene, real game logic).
//   timeout 600 node tests/ui/lab-play.cjs
// Starts tools/serve.mjs on PORT (default 5402), emulates an iPhone 13 (390 x 844, 1x).
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const PORT = Number(process.env.PORT) || 5402;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('ok  ', msg);
  else { failures++; console.log('FAIL', msg); }
}

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  let browser;
  try {
    await wait(400);
    browser = await chromium.launch();
    const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });
    const errors = [];
    const open = async (q) => {
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`http://localhost:${PORT}/ui-lab.html?paused=1&${q}`);
      await page.waitForFunction(() => window.diner && window.diner.ready && document.fonts.status === 'loaded');
      await page.evaluate(() => window.diner.step(0.1));
      await wait(350); // panels slide in with CSS transitions (wall clock)
      return page;
    };
    // taps wait for CSS transitions (wall-clock) to settle
    const tapAt = async (page, x, y) => { await page.touchscreen.tap(x, y); await page.evaluate(() => window.diner.step(0.05)); await wait(300); };
    const tapSel = async (page, sel) => {
      const loc = page.locator(sel).first();
      const b = await loc.boundingBox();
      if (!b) throw new Error('no element ' + sel);
      await tapAt(page, b.x + b.width / 2, b.y + b.height / 2);
    };
    const holdSel = async (page, sel, seconds) => {
      const b = await page.locator(sel).first().boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      await page.evaluate((s) => window.diner.step(s), seconds);
      await page.mouse.up();
    };
    const S = (page, fn, arg) => page.evaluate(fn, arg);
    const visible = async (page, sel) => (await page.locator(sel).count()) > 0 && page.locator(sel).first().isVisible();
    const text = async (page, sel) => ((await page.locator(sel).first().textContent()) || '').trim();
    const stationXY = (page, id) => S(page, (sid) => window.diner.scene.anchor('station', sid), id);

    // ------------------------------------------------------------ fresh start: HUD, tutorial, bottom bar size
    let page = await open('state=fresh&lang=en');
    check(await visible(page, '.coin-pill') && await visible(page, '.income') && await visible(page, '.hud-loc') && await visible(page, '.gear'), 'HUD: coins, income, location badge, gear');
    check(await page.locator('.hud-loc .stars .ico').count() === 3, 'location badge has 3 goal stars');
    check(/25/.test(await text(page, '.coin-pill .val')), 'coin pill shows the start money');
    check(await visible(page, '.tut-bubble') && /Tap the Juice Bar/.test(await text(page, '.tut-bubble')), 'tutorial: "Tap the Juice Bar"');
    const bottomTop = await S(page, () => document.querySelector('.bottom').getBoundingClientRect().top);
    check((844 - bottomTop) / 844 <= 0.2, `bottom UI uses ${(100 * (844 - bottomTop) / 844).toFixed(1)} % of the height (<= 20 %)`);
    const hudBottom = await S(page, () => document.querySelector('.hud').getBoundingClientRect().bottom);
    check(hudBottom <= 80, 'HUD is compact (' + Math.round(hudBottom) + ' px)');
    check(await page.locator('.bubble').count() === 1, 'the first guest shows an order bubble');
    check(await page.locator('.mark .lvl:not(.is-hidden)').count() === 1, 'one level badge (Juice Bar)');
    check(await page.locator('.mark .sign:not(.is-hidden)').count() === 1, 'one Open sign (Grill)');

    // ------------------------------------------------------------ tap the Juice Bar -> card, tutorial step 1, upgrade
    let a = await stationXY(page, 'juice');
    await tapAt(page, a.x, a.y + 20);
    check(await S(page, () => document.querySelector('.card').classList.contains('open')), 'tapping the station opens its card');
    check(await S(page, () => window.diner.game.state.stations[0].boostT > 0), 'tapping the station boosts it');
    check(await S(page, () => window.diner.game.state.tutorial) === 1, 'tutorial moves to step 1');
    check(/Upgrade/.test(await text(page, '.tut-bubble')), 'tutorial: "Upgrade ..."');
    check(/Juice Bar/.test(await text(page, '.card .name')) && /Level 1/.test(await text(page, '.card .sub')), 'card: name + level');
    check(/7/.test(await text(page, '.card .stat')) && /10/.test(await text(page, '.card .stat')), 'card: price per dish now -> next (7 -> 10)');
    let m0 = await S(page, () => window.diner.game.state.money);
    await tapSel(page, '.card .big');
    check(await S(page, () => window.diner.game.state.stations[0].level) === 2, 'Upgrade raises the level');
    check(await S(page, () => window.diner.game.state.money) === m0 - 8, 'Upgrade costs 8 coins');
    check(await S(page, () => window.diner.game.state.tutorial) === 2, 'tutorial moves to step 2 after the first upgrade');
    check(/Level 2/.test(await text(page, '.card .sub')), 'card shows level 2');
    // hold to repeat
    await S(page, () => { window.diner.game.state.money = 5000; });
    await holdSel(page, '.card .big', 2.5);
    const lvHeld = await S(page, () => window.diner.game.state.stations[0].level);
    check(lvHeld >= 10, 'holding Upgrade repeats (level ' + lvHeld + ')');
    // not enough coins
    await S(page, () => { window.diner.game.state.money = 0; window.diner.step(0.2); });
    check(await S(page, () => document.querySelector('.card .big').classList.contains('is-off')), 'Upgrade button greys out without coins');
    check(/Need/.test(await text(page, '.card .need')), 'card says how many coins are missing');
    await tapSel(page, '.card .x');
    check(!(await S(page, () => document.querySelector('.card').classList.contains('open'))), 'X closes the card');
    await tapAt(page, a.x, a.y + 20);
    await tapAt(page, 195, 480);
    check(!(await S(page, () => document.querySelector('.card').classList.contains('open'))), 'tapping the floor closes the card');

    // ------------------------------------------------------------ order bubble life cycle + pay float
    page = await open('state=fresh&lang=en');
    const bubbleId = await S(page, () => window.diner.game.state.customers[0].id);
    let sawRing = false;
    let sawFloat = false;
    let gone = false;
    for (let i = 0; i < 60 && !gone; i++) {
      await S(page, () => window.diner.step(0.25));
      if (await S(page, () => { const r = document.querySelector('.bubble svg.ring'); return !!r && !r.classList.contains('is-hidden'); })) sawRing = true;
      if (await page.locator('.float').count()) sawFloat = true;
      gone = await S(page, (id) => !window.diner.game.state.customers.some((c) => c.id === id && c.state === 'waiting'), bubbleId);
    }
    check(sawRing, 'bubble shows a progress ring while the dish cooks');
    await S(page, () => window.diner.step(0.5));
    check(await S(page, () => document.querySelectorAll('.bubble:not(.out)').length) <= await S(page, () => window.diner.game.state.customers.filter((c) => c.state === 'waiting').length), 'served guests lose their bubble');
    for (let i = 0; i < 20 && !sawFloat; i++) { await S(page, () => window.diner.step(0.25)); if (await page.locator('.float').count()) sawFloat = true; }
    check(sawFloat, 'paying guests pop a "+coins" float');

    // ------------------------------------------------------------ goal pill collect
    page = await open('state=collect&lang=en');
    check(await S(page, () => document.querySelector('.goal-pill').classList.contains('done')), 'goal pill highlights a done goal');
    m0 = await S(page, () => window.diner.game.state.money);
    await tapSel(page, '.goal-pill .btn');
    check(await S(page, () => window.diner.game.state.goals[0].claimed), 'Collect in the pill claims the goal');
    check(await S(page, () => window.diner.game.state.money) === m0 + 15, 'goal reward added (15)');

    // ------------------------------------------------------------ Open sign -> card -> Open
    page = await open('state=open&lang=en');
    check(await S(page, () => document.querySelector('.mark .sign.can') !== null), 'Open sign turns into a button when affordable');
    check(/Open the Grill/.test(await text(page, '.tut-bubble')), 'tutorial step 2 points at the Grill');
    await tapSel(page, '.mark .sign.can');
    check(/Grill/.test(await text(page, '.card .name')) && /Open/.test(await text(page, '.card .big')), 'sign opens the Grill card with an Open button');
    check(/Tap Open/.test(await text(page, '.tut-bubble')), 'tutorial: "Tap Open"');
    await tapSel(page, '.card .big');
    check(await S(page, () => window.diner.game.state.stations[1].open), 'Open button opens the Grill');
    check(await S(page, () => window.diner.game.state.tutorial) === 'done', 'tutorial done after opening the Grill');
    check(/Grill is open/.test(await S(page, () => window.diner.ui.debug.floats.toastText())), 'toast: "Grill is open"');
    await S(page, () => window.diner.step(0.2));
    check(!(await visible(page, '.tut:not(.is-hidden) .tut-bubble')), 'tutorial hand gone');

    // ------------------------------------------------------------ Upgrades panel
    page = await open('state=upgrades&lang=en');
    check(await S(page, () => document.querySelector('.upgrades-sheet').parentElement.classList.contains('open')), 'Upgrades panel opens');
    check(await page.locator('.upgrades-sheet .row').count() === 7, 'Upgrades: 4 stations + cook + table + speed');
    let lv = await S(page, () => window.diner.game.state.stations[0].level);
    await tapSel(page, '.upgrades-sheet .row[data-row="juice"] .btn');
    check(await S(page, () => window.diner.game.state.stations[0].level) === lv + 1, 'row button upgrades the Juice Bar');
    await S(page, () => { window.diner.game.state.money = 1e6; });
    await tapSel(page, '.upgrades-sheet .row[data-row="hire"] .btn');
    check(await S(page, () => window.diner.game.state.cooks.length) === 3, 'Hire a cook');
    await tapSel(page, '.upgrades-sheet .row[data-row="table"] .btn');
    check(await S(page, () => window.diner.game.state.tables.filter((t) => t.owned).length) === 4, 'Buy a table');
    await tapSel(page, '.upgrades-sheet .row[data-row="speed"] .btn');
    check(await S(page, () => window.diner.game.state.cookSpeed) === 2, 'Cook speed');
    await tapSel(page, '.upgrades-sheet .row[data-row="stew"] .btn');
    check(await S(page, () => window.diner.game.state.stations[2].open), 'Open the Stew Pot from the list');
    lv = await S(page, () => window.diner.game.state.stations[1].level);
    await holdSel(page, '.upgrades-sheet .row[data-row="grill"] .btn', 2);
    check(await S(page, () => window.diner.game.state.stations[1].level) >= lv + 5, 'holding a row button repeats');
    check(await page.locator('.upgrades-sheet .row[data-row="oven"] .btn:not(.is-hidden)').count() === 1, 'Oven row offers Open once the Stew Pot is open');
    check(/Hold/.test(await text(page, '.upgrades-sheet .tip')), 'hold tip shown');
    await tapSel(page, '.upgrades-sheet .close-btn');
    check(!(await S(page, () => document.querySelector('.upgrades-sheet').parentElement.classList.contains('open'))), 'X closes the panel');

    // ------------------------------------------------------------ Goals panel
    page = await open('state=goals&lang=en');
    check(await page.locator('.goals-sheet .row.goal:not(.is-hidden)').count() === 3, 'Goals panel lists 3 goals');
    check(/0\/18/.test(await text(page, '.goals-sheet .count')), 'Goals panel shows 0/18');
    m0 = await S(page, () => window.diner.game.state.money);
    await tapSel(page, '.goals-sheet .row.goal.done .btn');
    check(await S(page, () => window.diner.game.state.money) > m0, 'Collect in the panel pays the reward');
    check(/1\/18/.test(await text(page, '.goals-sheet .count')), 'count goes to 1/18');
    const goBtn = page.locator('.goals-sheet .row.goal:not(.done) .btn').first();
    if (await goBtn.count()) {
      await tapSel(page, '.goals-sheet .row.goal:not(.done) .btn');
      await S(page, () => window.diner.step(0.1));
      check(!(await S(page, () => document.querySelector('.goals-sheet').parentElement.classList.contains('open'))) || await S(page, () => document.querySelector('.upgrades-sheet').parentElement.classList.contains('open')), 'Go closes the Goals panel (and points at the target)');
    }

    // ------------------------------------------------------------ Places panel + complete -> next location
    page = await open('state=places&lang=en');
    check(await page.locator('.places-sheet .row.place').count() === 4, 'Places: 4 entries');
    check(await S(page, () => [...document.querySelectorAll('.places-sheet .row.place')].map((r) => r.className.split(' ').pop()).join(',')) === 'current,locked,soon,soon', 'Places: current, locked, soon, soon');
    page = await open('state=placesdone&lang=en');
    check(await visible(page, '.places-sheet .row.place .btn.ready:not(.is-hidden)'), 'Places offers "Go" once the place is complete');
    await tapSel(page, '.places-sheet .row.place .btn.ready:not(.is-hidden)');
    check(await S(page, () => window.diner.game.state.location) === 'harbor', 'Go in Places starts the next place');
    page = await open('state=complete&lang=en');
    check(await visible(page, '.modal.open .stars-big'), 'Restaurant complete screen appears');
    check(/Harbor Tavern/.test(await text(page, '.modal.open .modal-card')), 'complete screen names the next place');
    await tapSel(page, '.modal.open .btn-wide');
    check(await S(page, () => window.diner.game.state.location) === 'harbor', 'Next place starts the Harbor Tavern');
    await S(page, () => window.diner.step(0.2));
    check(/Harbor Tavern/.test(await text(page, '.hud-loc .name')), 'HUD shows the new place');
    check(await page.locator('.mark').count() === 4 && await page.locator('.mark .lvl:not(.is-hidden)').count() === 1, 'station marks rebuilt for the new place');
    check(!(await visible(page, '.modal.open')), 'complete screen closed');

    // ------------------------------------------------------------ offline card
    page = await open('state=offline&lang=en');
    check(await visible(page, '.modal.open .big-amount'), 'offline card shows the earnings');
    check(/1 h 35 min/.test(await text(page, '.modal.open p')), 'offline card: time away (1 h 35 min)');
    m0 = await S(page, () => window.diner.game.state.money);
    const off = await S(page, () => window.diner.game.select.offline().amount);
    await tapSel(page, '.modal.open .btn-wide');
    check(await S(page, () => window.diner.game.state.money) === m0 + off, 'Collect adds the offline earnings');
    check(!(await visible(page, '.modal.open')), 'offline card closes');

    // ------------------------------------------------------------ settings
    page = await open('state=fresh&lang=en');
    await tapSel(page, '.gear');
    check(await visible(page, '.modal.open .seg'), 'gear opens settings');
    await tapSel(page, '.seg[data-setting="lang"] button[data-value="tr"]');
    check(await S(page, () => window.diner.game.state.settings.lang) === 'tr', 'language -> Türkçe');
    check(await text(page, '.modal.open h2') === 'Ayarlar' && /Geliştir/.test(await text(page, '.menu')), 'texts switch to Turkish at once');
    await tapSel(page, '.seg[data-setting="sound"] button[data-value="false"]');
    check(await S(page, () => window.diner.game.state.settings.sound) === false, 'sound off');
    await tapSel(page, '.seg[data-setting="quality"] button[data-value="low"]');
    check(await S(page, () => window.diner.game.state.settings.quality) === 'low', 'graphics Low');
    await tapSel(page, '.seg[data-setting="fps"] button[data-value="true"]');
    await tapSel(page, '.modal.open .btn-wide');
    await S(page, () => window.diner.step(0.6));
    check(await visible(page, '.fps') && /FPS/.test(await text(page, '.fps')), 'FPS meter shows scene stats');
    check(!(await visible(page, '.modal.open')), 'Done closes settings');
    const visibleTr = await S(page, () => document.body.innerText);
    check(!visibleTr.includes('!'), 'no "!" in the Turkish screen');

    // ------------------------------------------------------------ touch targets and safe areas
    page = await open('state=upgrades&lang=en');
    const small = await S(page, () => [...document.querySelectorAll('button')].filter((b) => b.offsetParent && b.getBoundingClientRect().width > 0 && !b.closest('.modal:not(.open), .sheet-wrap:not(.open), .card:not(.open)')).map((b) => {
      const r = b.getBoundingClientRect();
      const hit = getComputedStyle(b, '::before').content !== 'none' ? 10 : 0; // ::before hit slop
      return { cls: b.className, w: r.width + hit, h: r.height + hit };
    }).filter((x) => x.w < 44 || x.h < 40).map((x) => x.cls + ' ' + Math.round(x.w) + 'x' + Math.round(x.h)));
    check(small.length === 0, 'touch targets are large enough ' + (small.length ? JSON.stringify(small) : ''));
    page = await open('state=fresh&lang=en');
    await S(page, () => { document.documentElement.style.setProperty('--safe-t', '47px'); document.documentElement.style.setProperty('--safe-b', '34px'); window.diner.step(0.1); });
    await wait(300);
    const hudTop = await S(page, () => document.querySelector('.coin-pill').getBoundingClientRect().top);
    const barBottom = await S(page, () => document.querySelector('.menu').getBoundingClientRect().bottom);
    check(hudTop >= 47 && 844 - barBottom >= 34, 'HUD and bottom bar respect safe areas');
    const bt2 = await S(page, () => document.querySelector('.bottom').getBoundingClientRect().top);
    check((844 - bt2 - 34) / 844 <= 0.2, 'bottom UI (without the home bar) stays under 20 %');

    // ------------------------------------------------------------ Turkish lab: no missing keys
    page = await open('state=busy&lang=tr');
    const body = await S(page, () => document.body.innerText);
    check(!/\b[a-z]+\.[a-z]+(\.[a-z]+)?\b/.test(body.replace(/\d+[.,]\d+/g, '')), 'no raw i18n keys on screen (tr)');
    check(/Görev|Geliştir/.test(body), 'Turkish UI text present');

    check(errors.length === 0, 'no console errors ' + (errors.length ? errors.slice(0, 3).join(' | ') : ''));
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
  console.log(failures ? `\n${failures} FAILED` : '\nall passed');
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
