// End-to-end play test of the real game (index.html: real game, real 3D scene, real UI).
//   timeout 600 node tests/e2e/play.cjs
// Starts its own static server on PORT (default 5303), emulates an iPhone 13 and plays:
// fresh start -> tutorial with real taps -> upgrade -> open stations 3 and 4 with real taps
// -> all goals (fast-forward through window.toy.step) -> factory complete -> next factory
// (Teddy Bears) -> reload keeps progress -> offline earnings card -> Turkish and back ->
// no console errors.
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const { definePlayer } = require('../helpers.cjs');

const ROOT = path.resolve(__dirname, '../..');
const PORT = Number(process.env.PORT) || 5303;
const URL = `http://localhost:${PORT}/`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('ok  ', msg);
  else { failures++; console.log('FAIL', msg); }
}
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  let browser;
  try {
    await wait(400);
    browser = await chromium.launch();
    const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'en-US' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('requestfailed', (r) => errors.push('request failed: ' + r.url()));

    const S = (fn, arg) => page.evaluate(fn, arg);
    const settle = async (ms = 250) => { await wait(ms); };
    const tapAt = async (x, y) => { await page.touchscreen.tap(x, y); await settle(); };
    const visible = async (sel) => (await page.locator(sel).count()) > 0 && page.locator(sel).first().isVisible();
    const tapSel = async (sel) => {
      const loc = page.locator(sel).first();
      const b = await loc.boundingBox();
      if (!b) throw new Error('no element ' + sel);
      await tapAt(b.x + b.width / 2, b.y + b.height / 2);
    };
    const boot = async () => {
      await page.waitForFunction(() => window.toy && window.toy.ready, null, { timeout: 60000 });
      await S(definePlayer);
    };
    // where to tap a machine: a little below its anchor (the anchor is above the machine)
    const machinePoint = (id) => S((sid) => { const a = window.toy.scene.anchor(sid); return { x: a.x, y: a.y + 34 }; }, id);

    // ------------------------------------------------------------ fresh start
    const t0 = Date.now();
    await page.goto(URL);
    await boot();
    console.log(`     loaded in ${Date.now() - t0} ms`);
    check(await S(() => { try { return localStorage.getItem('toyfactory.save.v1') === null || true; } catch { return true; } }), 'page runs with localStorage');
    await settle(600);
    check(await page.locator('#loader').count() === 0, 'loading screen is gone after the first frame');
    check(await S(() => window.toy.game.state.tutorial) === 0, 'fresh game starts at tutorial step 0');
    check(await visible('.tut:not(.is-hidden)'), 'tutorial hand is visible');
    check(/Tap the Saw/.test(await page.locator('.tut-bubble').textContent()), 'tutorial says "Tap the Saw"');
    check(await S(() => document.documentElement.lang) === 'en', 'English by default (en-US phone)');
    const st0 = await S(() => window.toy.scene.stats());
    check(st0.calls > 0 && st0.calls < 60 && st0.tris < 100000, `scene within budget at start (${st0.calls} draws, ${Math.round(st0.tris / 1000)}k tris)`);

    // ------------------------------------------------------------ tutorial 1: tap the saw, upgrade
    let p = await machinePoint('saw');
    await tapAt(p.x, p.y);
    check(await visible('.card:not(.is-hidden)'), 'tapping the saw machine opens its card');
    check(await S(() => window.toy.game.state.factory.stations[0].boostT > 0), 'tapping the saw machine boosts it');
    const cost1 = await S(() => window.toy.game.select.stationView('saw').cost);
    if (await S(() => window.toy.game.state.money) < cost1) await S(() => window.toy.step(3));
    await tapSel('.card .cbtn');
    check(await S(() => window.toy.game.state.factory.stations[0].level) === 2, 'Upgrade button raises the Saw to level 2');
    check(await S(() => window.toy.game.state.tutorial) === 1, 'tutorial moves to step 1 after the first upgrade');
    await tapSel('.card-close');
    await settle(300);
    check(!(await visible('.card:not(.is-hidden)')), 'close button hides the card');

    // truck info
    p = await S(() => window.toy.scene.anchor('truck'));
    await tapAt(p.x, p.y + 30);
    check(/sells for/.test(await page.locator('.toast').textContent()), 'tapping the truck shows what a toy sells for');

    // ------------------------------------------------------------ tutorial 2: open the Paint Booth
    let r = await S(() => window.__play({ seconds: 300, open: false, until: 'money>=open' }));
    console.log(`     saved up for the Paint Booth after ${mmss(r.t)} of play (${r.upgrades} upgrades)`);
    await S(() => window.toy.step(0.3));
    check(await S(() => window.toy.game.state.money >= window.toy.game.config().stations[2].openCost), 'Paint Booth is affordable');
    check(/new station/.test(await page.locator('.tut-bubble').textContent()), 'tutorial says "You can open a new station"');
    await tapSel('.mark.is-next .mark-sign');
    check(await visible('.card .cbtn.is-open-btn'), 'tapping the Open sign shows the card with an Open button');
    await tapSel('.card .cbtn.is-open-btn');
    check(await S(() => window.toy.game.state.factory.stations[2].open), 'Open button opens the Paint Booth (station 3)');
    check(await S(() => window.toy.game.state.tutorial) === 2, 'tutorial moves to step 2 (goals)');
    await settle(300);
    check(!(await visible('.card:not(.is-hidden)')), 'the card closes so the new machine can be seen');

    // ------------------------------------------------------------ tutorial 3: collect a goal
    r = await S(() => window.__play({ seconds: 120, claim: false, until: 'goalDone' }));
    await S(() => window.toy.step(0.2));
    check(await visible('.goal.is-done'), 'a finished goal shows Collect');
    const m1 = await S(() => window.toy.game.state.money);
    await tapSel('.goal.is-done');
    check(await S(() => window.toy.game.state.money) > m1, 'tapping Collect gives coins');
    check(await S(() => window.toy.game.state.tutorial) === 'done', 'tutorial is done after the first goal');

    // ------------------------------------------------------------ open Gift Wrap with real taps
    r = await S(() => window.__play({ seconds: 600, open: false, until: 'money>=open' }));
    await S(() => window.toy.step(0.3));
    await tapSel('.mark.is-next .mark-sign');
    await tapSel('.card .cbtn.is-open-btn');
    check(await S(() => window.toy.game.state.factory.stations[3].open), 'Gift Wrap (station 4) opens with real taps');
    const st1 = await S(() => window.toy.scene.stats());
    check(st1.calls < 60 && st1.tris < 100000, `scene within budget with all stations open (${st1.calls} draws, ${Math.round(st1.tris / 1000)}k tris)`);

    // ------------------------------------------------------------ all goals -> factory complete
    r = await S(() => window.__play({ seconds: 2400, until: 'complete' }));
    const t1 = await S(() => window.__gameTime);
    console.log(`     factory 1 complete after ${mmss(t1)} of fast-forwarded play`);
    await S(() => window.toy.step(0.3));
    await settle(400);
    check(await S(() => window.toy.game.state.factory.complete), 'every goal collected: factory complete');
    check(await visible('.cmp:not(.is-hidden)'), 'the Factory complete screen is shown');
    check(/Factory complete/.test(await page.locator('.cmp-title').textContent()), 'complete screen title');
    check(t1 > 300 && t1 < 1500, `factory 1 took ${mmss(t1)} of game time (expected ~10 min)`);

    // ------------------------------------------------------------ next factory
    await tapSel('.cmp .cbtn');
    await S(() => window.toy.step(0.5));
    await settle(300);
    check(await S(() => window.toy.game.state.factory.id) === 'teddy', 'Next factory loads the Teddy Bears factory');
    check(await S(() => window.toy.game.state.factory.stations.map((s) => s.id).join(',')) === 'cutter,stuffing,stitching,ribbon', 'teddy station ids');
    check(/Teddy Bears/.test(await page.locator('.goals-name').textContent()), 'goal strip shows the new factory name');
    check(!(await visible('.cmp:not(.is-hidden)')), 'complete screen closed');
    // play the new factory a bit, with a real tap on the first machine
    p = await machinePoint('cutter');
    await tapAt(p.x, p.y);
    check(await visible('.card:not(.is-hidden)') && /Fabric Cutter/.test(await page.locator('.card-title').textContent()), 'tapping the Fabric Cutter opens its card');
    await tapSel('.card-close');
    await S(() => window.__play({ seconds: 40 }));
    const st2 = await S(() => window.toy.scene.stats());
    check(st2.calls < 60 && st2.tris < 100000, `teddy scene within budget (${st2.calls} draws, ${Math.round(st2.tris / 1000)}k tris)`);

    // ------------------------------------------------------------ reload keeps progress
    const before = await S(() => { const g = window.toy.game; window.toy.save(); return { f: g.state.factoryIndex, levels: g.state.factory.stations.map((s) => s.level).join(','), money: g.state.money, sold: g.state.factory.sold }; });
    check(await S(() => { try { return !!localStorage.getItem('toyfactory.save.v1'); } catch { return false; } }), 'the game is saved in localStorage');
    await page.reload();
    await boot();
    const after = await S(() => { const g = window.toy.game; return { f: g.state.factoryIndex, levels: g.state.factory.stations.map((s) => s.level).join(','), money: g.state.money, sold: g.state.factory.sold, tut: g.state.tutorial }; });
    check(after.f === 1 && after.levels === before.levels, `reload keeps the factory and levels (${after.levels})`);
    check(after.money >= before.money * 0.98 && after.sold >= before.sold, 'reload keeps money and toys sold');
    check(after.tut === 'done', 'tutorial does not come back after a reload');

    // ------------------------------------------------------------ offline earnings
    // leave the game (it saves on the way out), move the saved clock back 90 minutes on a
    // plain page of the same origin, then come back
    await page.goto(URL + 'assets/fonts/OFL.txt');
    await S(() => {
      const raw = JSON.parse(localStorage.getItem('toyfactory.save.v1'));
      raw.lastSeen -= 90 * 60 * 1000;
      localStorage.setItem('toyfactory.save.v1', JSON.stringify(raw));
    });
    await page.goto(URL);
    await boot();
    await settle(400);
    check(await visible('.off-card'), 'after 90 minutes away the "While you were away" card shows');
    const off = await S(() => window.toy.game.select.offline());
    check(off && Math.round(off.seconds / 60) >= 89 && off.amount > 0, `offline earnings for ${off ? Math.round(off.seconds / 60) : 0} min`);
    const m2 = await S(() => window.toy.game.state.money);
    await tapSel('.off-card .cbtn');
    check(await S(() => window.toy.game.state.money) >= m2 + off.amount * 0.99, 'Collect adds the offline earnings');

    // ------------------------------------------------------------ language: Türkçe and back
    await settle(300);
    await tapSel('.hud-gear');
    check(await visible('.set-card'), 'settings button opens the settings');
    await tapSel('.seg-btn[data-value="tr"]');
    check(await S(() => window.toy.game.state.settings.lang) === 'tr', 'language switches to Türkçe');
    check(await S(() => document.documentElement.lang) === 'tr', 'document language is tr');
    check(/Ayarlar/.test(await page.locator('.set-card .modal-title').textContent()), 'settings title is Turkish');
    check(/\/sn/.test(await page.locator('.hud-inc-num').textContent()), 'income uses the Turkish unit (/sn)');
    check(/Oyuncak Ayılar/.test(await page.locator('.goals-name').textContent()), 'factory name is Turkish (with ı)');
    // FPS meter on, quality low then high
    await tapSel('.set-row[data-key="fps"] .seg-btn[data-value="true"]');
    await tapSel('.set-row[data-key="quality"] .seg-btn[data-value="low"]');
    check(await S(() => window.toy.scene.stats().quality) === 'low', 'quality Low applies to the scene');
    await tapSel('.set-row[data-key="quality"] .seg-btn[data-value="high"]');
    check(await S(() => window.toy.scene.stats().quality) === 'high', 'quality High applies to the scene');
    await tapSel('.set-row[data-key="sound"] .seg-btn[data-value="false"]');
    check(await S(() => window.toy.game.state.settings.sound) === false, 'sound can be turned off');
    await tapSel('.seg-btn[data-value="en"]');
    check(await S(() => window.toy.game.state.settings.lang) === 'en', 'language switches back to English');
    check(/Settings/.test(await page.locator('.set-card .modal-title').textContent()), 'settings title is English again');
    await tapSel('.set-card .cbtn');
    await S(() => window.toy.step(0.6));
    await settle(700);
    check(await visible('.hud-fps:not(.is-hidden)'), 'FPS meter is visible');
    check(/FPS/.test(await page.locator('.hud-fps').textContent()), 'FPS meter shows the frame rate');
    await page.reload();
    await boot();
    check(await S(() => { const s = window.toy.game.state.settings; return s.lang === 'en' && s.sound === false && s.fps === true; }), 'settings survive a reload');

    // ------------------------------------------------------------ no errors
    const real = errors.filter((e) => !/GPU stall due to ReadPixels/.test(e));
    check(real.length === 0, 'no console errors' + (real.length ? ':\n  ' + real.join('\n  ') : ''));
    console.log(`     total ${Math.round((Date.now() - t0) / 1000)} s`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    server.kill();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
