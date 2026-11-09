// Review screenshot set (ARCH 9.3): the real game (3D + UI + logic) on the iPhone 13 profile, 390 x 844 at DPR 2.
// Shots 01-10 come from actually playing the first session by taps (time driven with aftermath.step); the rest load
// debug scenarios through aftermath.scenario(). Names are NN-name.png in play order.
// Usage: node tests/shots.cjs [filter]   (OUT=<dir>, PORT=5173, SERVE=0 to reuse a running server, DPR=2)
const path = require('path');
const fs = require('fs');
const L = require('./e2e/lib.cjs');

const OUT = process.env.OUT || '/tmp/claude-0/-home-user-aftermath/a2b2bb86-d226-5b76-8c09-c4a191c5ba8d/scratchpad/v2/integrated';
const FILTER = process.argv[2] || '';
const DPR = Number(process.env.DPR || 2);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await L.startServer();
  const browser = await L.newBrowser();
  const { page, errors } = await L.newPage(browser, { dpr: DPR });
  const done = [];
  const problems = [];
  const st = () => page.evaluate(() => { const s = window.aftermath.state(); return { phase: s.phase, ftue: s.progress.ftue, clock: s.clock, t: s.attack && s.attack.t, fleet: s.fleet.map((v) => v.state), konak: s.sectors[1] }; });
  async function shot(name, settle = 300) {
    if (FILTER && !name.includes(FILTER)) return;
    await page.waitForTimeout(settle);
    await page.evaluate(() => window.aftermath.draw());
    await page.waitForTimeout(60);
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    const sample = await L.sample(page);
    problems.push(...L.ruleProblems(sample, name));
    done.push(name);
    console.log('shot', name, JSON.stringify(await st()).slice(0, 120));
  }
  async function stepUntil(cond, max = 120, dt = 0.5) {
    for (let i = 0; i < max; i++) {
      if (await page.evaluate(cond)) return true;
      await L.step(page, dt);
    }
    return false;
  }
  async function tap(key) {
    const ok = await L.tapKey(page, key, { timeout: 3000 });
    if (!ok) problems.push(`could not tap ${key}`);
    await page.waitForTimeout(260);
    await L.step(page, 0.1);
    return ok;
  }

  try {
    await L.openGame(page, 'manual=1&seed=7');
    await page.click('#loading .loading');
    // ---------- 01 cold open: TV shot, KALKAN-07 has landed ----------
    await L.step(page, 0.5);
    await stepUntil(() => window.aftermath.state().phase === 'attack', 20, 0.25);
    await stepUntil(() => window.aftermath.state().attack.t >= 1.25, 40, 0.25);
    await shot('01-cold-open');
    // let the cinematic play out, then the title card
    await stepUntil(() => window.aftermath.state().phase !== 'attack', 40, 0.25);
    await L.step(page, 0.2);
    if (await page.evaluate(() => !!document.querySelector('.title-wrap.on'))) await page.click('.title-wrap');
    await L.step(page, 0.4);
    // ---------- 02 call card ----------
    await shot('02-call-card', 400);
    await tap('acceptCall');
    await L.step(page, 1.0); // camera frames Konak + the yard
    // ---------- 03 FTUE fire: district sheet open ----------
    await tap('select:1');
    await L.step(page, 0.2);
    await shot('03-ftue-fire-dispatch', 450);
    await tap('dispatch:fire:1');
    await L.step(page, 1.0);
    // ---------- 04 fire truck on the road ----------
    await shot('04-fire-truck-driving');
    await stepUntil(() => window.aftermath.state().fleet.some((v) => v.type === 'fire' && v.state === 'working'), 30, 0.25);
    await L.step(page, 2.5);
    // ---------- 05 extinguishing ----------
    await shot('05-extinguishing');
    await stepUntil(() => window.aftermath.state().progress.ftue === 'rubble', 60, 0.5);
    await L.step(page, 0.6);
    await tap('select:1');
    await tap('dispatch:debris:1');
    await stepUntil(() => window.aftermath.state().fleet.some((v) => v.type === 'debris' && v.state === 'working'), 30, 0.25);
    await L.step(page, 3.0);
    // ---------- 06 rubble work ----------
    await shot('06-rubble-work');
    await stepUntil(() => window.aftermath.state().progress.ftue === 'carve', 60, 0.5);
    await L.step(page, 0.6);
    await tap('select:1');
    await tap('dispatch:carve:1');
    await stepUntil(() => window.aftermath.state().fleet.some((v) => v.type === 'carve' && v.state === 'working'), 30, 0.25);
    await stepUntil(() => { const k = window.aftermath.state().sectors[1]; return k.corpse <= k.corpseMax * 0.55; }, 60, 0.5);
    // ---------- 07 carving ----------
    await shot('07-carving');
    await stepUntil(() => !!window.aftermath.state().result, 80, 0.5);
    await L.step(page, 0.6);
    // ---------- 07b result moment: the last district's clean before the receipt (held ~2 s) ----------
    await shot('07b-temiz', 200);
    await L.step(page, 2.0);
    // ---------- 08 receipt ----------
    await shot('08-receipt', 1600);
    await tap('collectPayment');
    await L.step(page, 1.0);
    await tap('tab:depot');
    // ---------- 09 Depo with Rıza ----------
    await shot('09-depo-riza', 500);
    await tap('sellAll:riza');
    await L.step(page, 1.5);
    await tap('tab:company');
    // ---------- 10 Şirket ----------
    await shot('10-sirket', 500);
    await tap('buyVehicle:fire');
    await L.step(page, 1.0);

    // ---------- scenarios ----------
    const scenario = async (name) => { await page.evaluate((n) => window.aftermath.scenario(n), name); await L.step(page, 0.3); };
    await scenario('calm');
    const hasTask = await page.evaluate(() => !!window.aftermath.game.suggestion(window.aftermath.state()));
    if (!hasTask) problems.push('calm scenario has no suggestion card');
    await L.step(page, 1.0);
    await shot('11-calm-suggestion', 500);
    await scenario('attack');
    await L.step(page, 0.4);
    await shot('12-attack-broadcast', 400);
    // polish: the settle frame (t 3.05: KALKAN-07 standing back beside the head, tusks and fires; the broadcast has
    // just opened) before it lifts off at 3.06
    await page.evaluate(() => window.aftermath.scenario('impact'));
    await L.step(page, 0.25);
    await shot('13-impact', 900);
    // multi-district contract: job framing keeps every chip in the band, compact chips leave the work visible
    await scenario('cleanup');
    await L.step(page, 3.0);
    await shot('13b-contract-chips', 500);
    await scenario('tender');
    await shot('14-tender-sheet', 600);
    await scenario('tender-reveal');
    await L.step(page, 0.2); await L.step(page, 0.8); await L.step(page, 0.8); await L.step(page, 0.6);
    await shot('15-tender-reveal', 400);
    await scenario('rival');
    await L.step(page, 2.0);
    await shot('16-rival-kuyruk-sende', 500);
    await scenario('factory');
    await page.evaluate(() => window.aftermath.ui.openTab('factory'));
    await L.step(page, 0.2);
    await shot('17-fabrika', 500);
    await scenario('calm');
    await tap('settings');
    await shot('18-settings', 500);
  } catch (e) {
    problems.push(`crash: ${e.stack || e.message}`);
  }
  problems.push(...errors.slice(0, 5));
  const ok = L.report(`shots (${done.length} in ${OUT})`, problems);
  await browser.close();
  server.stop();
  process.exit(ok ? 0 : 1);
})();
