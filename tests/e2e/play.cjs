// End-to-end play test of the real game (index.html: real game logic, real 3D scene, real UI).
//   timeout 600 node tests/e2e/play.cjs
// Starts its own static server on PORT (default 5403), emulates an iPhone 13 and plays:
// real frame loop + loading screen -> tutorial with real taps (Juice Bar, Upgrade, Open the
// Grill) -> hire a cook -> buy a table by tapping it in the restaurant -> fast-forward (attentive
// player, window.diner.step) until every goal is collected -> Restaurant complete -> Harbor
// Tavern -> reload keeps progress -> offline earnings -> Türkçe and back -> settings survive a
// reload -> sandboxed iframe (no storage) -> scene budgets -> no console errors.
const { chromium, devices } = require('playwright');
const { wait, LAUNCH, startServer, definePlayer } = require('../helpers.cjs');

const PORT = Number(process.env.PORT) || 5403;
const URL = `http://localhost:${PORT}/`;
const BUDGET = { calls: 120, tris: 150000 };
const SAVE_KEY = 'heroesdiner.save.v1';
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('ok  ', msg);
  else { failures++; console.log('FAIL', msg); }
}
const mmss = (s) => (s === undefined ? '-' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`);

async function main() {
  const server = await startServer(PORT);
  let browser;
  const t0 = Date.now();
  try {
    browser = await chromium.launch(LAUNCH);
    const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-US' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('requestfailed', (r) => errors.push('request failed: ' + r.url() + ' (' + (r.failure() && r.failure().errorText) + ', ' + Math.round((Date.now() - t0) / 1000) + ' s)'));

    const S = (fn, arg) => page.evaluate(fn, arg);
    // SwiftShader queues the frames drawn during a fast-forward; read one pixel back (waits for
    // the queue) before a reload, so the reload's 30 s navigation timeout does not include it
    const drainGpu = () => S(() => { try { const gl = window.diner.scene.debug.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); } catch { /* no WebGL */ } });
    const step = (s) => S((x) => window.diner.step(x), s);
    // taps: CSS transitions run on the wall clock, so give them a moment
    const tapAt = async (x, y) => { await page.touchscreen.tap(x, y); await step(0.05); await wait(280); };
    const visible = async (sel) => (await page.locator(sel).count()) > 0 && page.locator(sel).first().isVisible();
    const text = async (sel) => ((await page.locator(sel).first().textContent()) || '').trim();
    const tapSel = async (sel) => {
      const b = await page.locator(sel).first().boundingBox();
      if (!b) throw new Error('no element ' + sel);
      await tapAt(b.x + b.width / 2, b.y + b.height / 2);
    };
    const boot = async () => {
      await page.waitForFunction(() => window.diner && window.diner.ready, null, { timeout: 120000 });
      await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 20000 });
    };
    const cardOpen = () => S(() => document.querySelector('.card').classList.contains('open'));
    // a point on the station itself (its anchor is above the appliance)
    const stationPoint = (id) => S((sid) => { const a = window.diner.scene.anchor('station', sid); return { x: a.x, y: a.y + 30 }; }, id);
    const budget = (st, what) => check(st.calls > 0 && st.calls <= BUDGET.calls && st.tris <= BUDGET.tris,
      `${what}: ${st.calls} draw calls, ${Math.round(st.tris / 1000)}k triangles (budget ${BUDGET.calls} / ${BUDGET.tris / 1000}k)`);

    // ------------------------------------------------------------ real frame loop, loading screen
    await page.goto(URL);
    await boot();
    console.log(`     ready (models loaded, first frame) after ${Date.now() - t0} ms`);
    await wait(700);
    check(await page.locator('#loader').count() === 0, 'loading screen is removed after the first frame');
    check(await page.locator('#fatal').isHidden(), 'no "could not start the 3D view" message');
    check(await S(() => document.title) === "Heroes' Diner" && await S(() => document.documentElement.lang) === 'en', 'English title and language on an en-US phone');
    const pt0 = await S(() => window.diner.game.state.playTime);
    await wait(1500);
    const pt1 = await S(() => window.diner.game.state.playTime);
    check(pt1 > pt0 + 0.3, `the frame loop runs the restaurant (${(pt1 - pt0).toFixed(2)} s of game time in 1.5 s)`);
    check(await S(() => window.diner.game.state.customers.length) >= 1, 'a guest is already in the restaurant');
    const st0 = await S(() => window.diner.scene.stats());
    budget(st0, 'start, High');
    check(st0.quality === 'high', 'High quality by default');
    // leaving saves (pagehide); continue with a deterministic clock
    await page.goto(URL + '?manual=1');
    await boot();
    check(await S((k) => { try { return !!localStorage.getItem(k); } catch { return false; } }, SAVE_KEY), 'leaving the page saved the game');
    await S(definePlayer);

    // ------------------------------------------------------------ tutorial 1: tap the Juice Bar
    check(await S(() => window.diner.game.state.tutorial) === 0, 'tutorial starts at step 0');
    check(await visible('.tut-bubble') && /Tap the Juice Bar/.test(await text('.tut-bubble')), 'tutorial: "Tap the Juice Bar"');
    let p = await stationPoint('juice');
    await tapAt(p.x, p.y);
    check(await cardOpen(), 'tapping the Juice Bar in the 3D view opens its card');
    check(await S(() => window.diner.game.state.stations[0].boostT > 0), 'tapping the Juice Bar boosts it');
    check(await S(() => window.diner.game.state.tutorial) === 1, 'tutorial moves to step 1');
    check(/Juice Bar/.test(await text('.card .name')) && /Level 1/.test(await text('.card .sub')), 'card shows "Juice Bar, Level 1"');

    // ------------------------------------------------------------ tutorial 2: upgrade
    const cost1 = await S(() => window.diner.game.select.stationView('juice').cost);
    if (await S(() => window.diner.game.state.money) < cost1) await step(3);
    const firstUpgradeAt = await S(() => window.diner.game.state.playTime);
    await tapSel('.card .big');
    check(await S(() => window.diner.game.state.stations[0].level) === 2, 'Upgrade raises the Juice Bar to level 2');
    check(firstUpgradeAt < 5, `the first upgrade is possible after ${firstUpgradeAt.toFixed(1)} s (target: within 5 s)`);
    check(await S(() => window.diner.game.state.tutorial) === 2, 'tutorial moves to step 2');
    await tapSel('.card .x');
    check(!(await cardOpen()), 'X closes the card');

    // ------------------------------------------------------------ guest info + order bubble
    check(await page.locator('.bubble').count() >= 1, 'waiting guests show an order bubble');
    p = await S(() => {
      const c = window.diner.game.state.customers.find((x) => x.state === 'waiting');
      return c ? window.diner.scene.anchor('customer', c.id) : null;
    });
    if (p) {
      await tapAt(p.x, p.y + 35);
      check(/please/.test(await S(() => window.diner.ui.debug.floats.toastText() || '')), 'tapping a guest shows his order ("..., please")');
    }

    // ------------------------------------------------------------ tutorial 3: open the Grill
    let r = await S(() => window.__play({ seconds: 300, open: false, until: 'money>=open' }));
    await step(0.3);
    const grillReady = await S(() => window.__gameTime);
    console.log(`     saved up for the Grill after ${mmss(grillReady)} of play (${r.actions} purchases)`);
    check(/Open the Grill/.test(await text('.tut-bubble')), 'tutorial: "Open the Grill"');
    check(await visible('.mark .sign.can'), 'the Grill plot shows an Open sign');
    await tapSel('.mark .sign.can');
    check(/Grill/.test(await text('.card .name')) && /Open/.test(await text('.card .big')), 'the Open sign shows the Grill card with an Open button');
    await tapSel('.card .big');
    check(await S(() => window.diner.game.state.stations[1].open), 'Open opens the Grill');
    check(await S(() => window.diner.game.state.tutorial) === 'done', 'tutorial is done');
    check(await cardOpen() && /Grill/.test(await text('.card .name')) && /Upgrade/.test(await text('.card .big')), 'the card now offers the Grill upgrade');
    // tap an empty bit of floor to close the card: the first of a few spots away from the walk
    // paths (inner corner of the kitchen L, by the dining walls) with nothing under it
    p = await S(() => {
      const d = window.diner;
      for (const [x, z] of [[-2.75, -2.75], [-2, 5.25], [5.25, -2], [0, -3.5]]) {
        const q = d.scene.debug.project(x, 0, z);
        const el = document.elementFromPoint(q.x, q.y);
        if (!d.scene.pick(q.x, q.y) && el && el.tagName === 'CANVAS') return q;
      }
      return d.scene.debug.project(-2.75, 0, -2.75);
    });
    await tapAt(p.x, p.y);
    check(!(await cardOpen()), 'tapping the floor closes the card');
    await step(0.3);
    check(!(await visible('.tut:not(.is-hidden) .tut-bubble')), 'tutorial hand is gone');

    // ------------------------------------------------------------ hire a cook (Upgrades panel)
    if (await S(() => window.diner.game.state.cooks.length) < 2) {
      for (let i = 0; i < 40 && !(await S(() => window.diner.game.select.cookView().canAfford)); i++) await step(1);
      await tapSel('.menu-btn[data-menu="upgrades"]');
      check(await S(() => document.querySelector('.upgrades-sheet').parentElement.classList.contains('open')), 'Upgrades opens from the bottom bar');
      await tapSel('.upgrades-sheet .row[data-row="hire"] .btn');
      check(await S(() => window.diner.game.state.cooks.length) === 2, 'Hire a cook: 2 cooks');
      await tapSel('.upgrades-sheet .close-btn');
    } else check(true, 'a second cook was already hired by the player');
    await step(2);
    check(await S(() => window.diner.scene.stats().characters) >= 3, 'the new cook is in the kitchen');

    // ------------------------------------------------------------ buy a table by tapping it
    const tv = await S(() => window.diner.game.select.tableView());
    for (let i = 0; i < 80 && !(await S(() => window.diner.game.select.tableView().canAfford)); i++) await step(1);
    p = await S((id) => window.diner.scene.anchor('table', id), tv.next);
    const owned0 = tv.owned;
    await tapAt(p.x, p.y + 20);
    check(await S(() => window.diner.game.select.tableView().owned) === owned0 + 1, `tapping the faded table ${tv.next} buys it (${owned0 + 1} tables)`);

    // ------------------------------------------------------------ every goal -> Restaurant complete
    r = await S(() => window.__play({ seconds: 2400, until: 'allOpen', stats: true }));
    let maxCalls = r.maxCalls;
    let maxTris = r.maxTris;
    r = await S(() => window.__play({ seconds: 2400, until: 'complete', stats: true }));
    maxCalls = Math.max(maxCalls, r.maxCalls);
    maxTris = Math.max(maxTris, r.maxTris);
    const marks = await S(() => window.__marks);
    const tEnd = marks['complete:inn'];
    console.log(`     Grill ${mmss(marks['open:grill'])}, Stew ${mmss(marks['open:stew'])}, Oven ${mmss(marks['open:oven'])}, Village Inn complete ${mmss(tEnd)}`);
    const gaps = await S((end) => { let prev = 0, max = 0; for (const t of window.__rewards) { if (t > end) break; max = Math.max(max, t - prev); prev = t; } return max; }, tEnd || 1e9);
    console.log(`     longest gap between reward moments: ${gaps.toFixed(1)} s`);
    check(await S(() => window.diner.game.state.complete), 'every goal collected: the Village Inn is complete');
    check(tEnd > 7 * 60 && tEnd < 15 * 60, `Village Inn took ${mmss(tEnd)} of game time (target about 10-12 min)`);
    check(marks['open:stew'] > 120 && marks['open:stew'] < 300 && marks['open:oven'] > 240 && marks['open:oven'] < 480, 'Stew about 3 min, Oven about 6 min');
    check(gaps <= 30, 'a reward moment at least every 30 s');
    budget({ calls: maxCalls, tris: maxTris }, 'busiest frame of the Village Inn, High');
    await step(0.3);
    await wait(400);
    check(await visible('.modal.open .stars-big'), 'the Restaurant complete screen is shown');
    check(/Restaurant complete/.test(await text('.modal.open h2')) && /Harbor Tavern/.test(await text('.modal.open .modal-card')), 'it says "Restaurant complete" and names the Harbor Tavern');

    // ------------------------------------------------------------ Harbor Tavern
    await tapSel('.modal.open .btn-wide');
    await step(0.5);
    await wait(300);
    check(await S(() => window.diner.game.state.location) === 'harbor', 'Next place starts the Harbor Tavern');
    check(await S(() => window.diner.scene.debug.layout.id) === 'harbor', 'the scene shows the Harbor Tavern');
    check(/Harbor Tavern/.test(await text('.hud-loc .name')), 'HUD shows "Harbor Tavern"');
    check(!(await visible('.modal.open')), 'the complete screen closed');
    p = await stationPoint('cocoa');
    await tapAt(p.x, p.y);
    check(await cardOpen() && /Cocoa Stand/.test(await text('.card .name')), 'tapping the Cocoa Stand opens its card');
    await tapSel('.card .x');
    // the Harbor Tavern is the last place: stop well before its goals are all done
    await S(() => window.__play({ seconds: 2400, until: 'allOpen', renderEvery: 30 }));
    await S(() => window.__play({ seconds: 90, claim: false, renderEvery: 10 }));
    check(!(await S(() => window.diner.game.state.complete)), 'the Harbor Tavern is not complete yet');
    const hc = await S(() => ({ g: window.diner.game.state.customers.length, k: window.diner.game.state.cooks.length }));
    budget(await S(() => { window.diner.step(1 / 30); return window.diner.scene.stats(); }), `Harbor Tavern with ${hc.g} guests and ${hc.k} cooks, High`);

    // ------------------------------------------------------------ reload keeps progress
    const before = await S(() => { const g = window.diner.game; window.diner.save(); return { loc: g.state.location, levels: g.state.stations.map((s) => s.level).join(','), money: g.state.money, served: g.state.served, tables: g.select.tableView().owned, cooks: g.state.cooks.length }; });
    await drainGpu();
    await page.reload();
    await boot();
    const after = await S(() => { const g = window.diner.game; return { loc: g.state.location, levels: g.state.stations.map((s) => s.level).join(','), money: g.state.money, served: g.state.served, tables: g.select.tableView().owned, cooks: g.state.cooks.length, tut: g.state.tutorial }; });
    check(after.loc === 'harbor' && after.levels === before.levels, `reload keeps the place and the station levels (${after.levels})`);
    check(after.money >= before.money * 0.99 && after.served === before.served && after.tables === before.tables && after.cooks === before.cooks, 'reload keeps coins, guests served, tables and cooks');
    check(after.tut === 'done', 'the tutorial does not come back');
    check(await S(() => window.diner.scene.debug.layout.id) === 'harbor', 'the scene starts in the Harbor Tavern');

    // ------------------------------------------------------------ offline earnings
    await page.goto(URL + 'assets/fonts/OFL.txt');
    await S((k) => {
      const raw = JSON.parse(localStorage.getItem(k));
      raw.lastSeen -= 3 * 60 * 60 * 1000;
      localStorage.setItem(k, JSON.stringify(raw));
    }, SAVE_KEY);
    await page.goto(URL + '?manual=1');
    await boot();
    await step(0.1);
    await wait(400);
    check(await visible('.modal.open .big-amount'), 'after 3 hours away the "Welcome back" card shows');
    const off = await S(() => window.diner.game.select.offline());
    check(off && off.seconds === 7200 && off.amount > 0, `offline earnings are capped at 2 h (${off ? off.seconds : 0} s, ${off ? off.amount : 0} coins)`);
    const m2 = await S(() => window.diner.game.state.money);
    await tapSel('.modal.open .btn-wide');
    check(off && await S(() => window.diner.game.state.money) >= m2 + off.amount, 'Collect adds the offline earnings');

    // ------------------------------------------------------------ Türkçe and back
    await wait(300);
    await tapSel('.gear');
    check(await visible('.modal.open .seg'), 'the gear opens the settings');
    await tapSel('.seg[data-setting="lang"] button[data-value="tr"]');
    check(await S(() => window.diner.game.state.settings.lang) === 'tr' && await S(() => document.documentElement.lang) === 'tr', 'language switches to Türkçe');
    check(await text('.modal.open h2') === 'Ayarlar', 'settings title is "Ayarlar"');
    check(/Liman Tavernası/.test(await text('.hud-loc .name')), 'HUD shows "Liman Tavernası"');
    check(await S(() => document.title) === 'Kahramanlar Lokantası', 'page title is "Kahramanlar Lokantası"');
    check(!(await S(() => document.body.innerText)).includes('!'), 'no "!" on the Turkish screen');
    await tapSel('.seg[data-setting="fps"] button[data-value="true"]');
    await tapSel('.seg[data-setting="quality"] button[data-value="low"]');
    check(await S(() => window.diner.scene.stats().quality) === 'low', 'graphics Low applies to the scene');
    const lowStats = await S(() => { window.diner.step(1 / 30); return window.diner.scene.stats(); });
    budget(lowStats, 'Harbor Tavern, Low');
    check(await S(() => window.diner.scene.debug.renderer.getPixelRatio()) <= 1.25, 'Low caps the pixel ratio at 1.25');
    await tapSel('.seg[data-setting="quality"] button[data-value="high"]');
    check(await S(() => window.diner.scene.stats().quality) === 'high' && await S(() => window.diner.scene.debug.renderer.getPixelRatio()) <= 2, 'graphics High again (pixel ratio <= 2)');
    await tapSel('.seg[data-setting="sound"] button[data-value="false"]');
    check(await S(() => window.diner.game.state.settings.sound) === false, 'sound off');
    await tapSel('.seg[data-setting="lang"] button[data-value="en"]');
    check(await S(() => window.diner.game.state.settings.lang) === 'en' && await text('.modal.open h2') === 'Settings', 'language switches back to English');
    await tapSel('.modal.open .btn-wide');
    await step(0.6);
    await wait(300);
    check(await visible('.fps') && /FPS/.test(await text('.fps')), 'FPS meter shows the scene stats');
    await drainGpu();
    await page.reload();
    await boot();
    check(await S(() => { const s = window.diner.game.state.settings; return s.lang === 'en' && s.sound === false && s.fps === true && s.quality === 'high'; }), 'settings survive a reload');

    // ------------------------------------------------------------ automatic drop to Low is remembered
    await S(() => window.diner.scene.debug.perf.onSlow()); // what the frame-time monitor calls on a slow phone
    check(await S(() => window.diner.scene.stats().quality) === 'low' && await S(() => window.diner.game.state.settings.quality) === 'low', 'slow frames drop the graphics to Low and the setting follows');
    await drainGpu();
    await page.reload();
    await boot();
    check(await S(() => window.diner.game.state.settings.quality) === 'low' && await S(() => window.diner.scene.stats().quality) === 'low', 'the automatic Low is remembered after a reload');

    // ------------------------------------------------------------ sandboxed iframe (no storage)
    const fpage = await ctx.newPage();
    fpage.on('pageerror', (e) => errors.push('iframe pageerror: ' + String(e)));
    fpage.on('console', (m) => { if (m.type() === 'error') errors.push('iframe console: ' + m.text()); });
    await fpage.setContent(`<iframe sandbox="allow-scripts" src="${URL}?manual=1" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe>`);
    let frame = null;
    for (let i = 0; i < 100 && !frame; i++) { frame = fpage.frames().find((f) => f.url().startsWith(URL)); if (!frame) await wait(100); }
    await frame.waitForFunction(() => window.diner && window.diner.ready, null, { timeout: 120000 });
    const fr = await frame.evaluate(() => { window.diner.step(2); return { saved: window.diner.save(), calls: window.diner.scene.stats().calls }; });
    check(fr.saved === false && fr.calls > 0, 'runs inside a sandboxed iframe (no storage, 3D view drawn)');
    await fpage.close();

    // ------------------------------------------------------------ no errors
    check(errors.length === 0, 'no console errors' + (errors.length ? ':\n  ' + errors.slice(0, 8).join('\n  ') : ''));
    console.log(`     total ${Math.round((Date.now() - t0) / 1000)} s`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
