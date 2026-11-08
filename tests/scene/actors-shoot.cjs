// scene-actors review set on the iPhone 13 profile (390 x 844 CSS, DPR 3) + motion frame sequences +
// budget report. Usage: PORT=5192 node tests/scene/actors-shoot.cjs [outDir] [filter]
// Starts tools/serve.mjs on PORT unless SERVE=0. Time is driven deterministically (__setTime, lab.sim.step +
// scene.update with fixed dt, render only for the captured frame). Exit code 1 on console errors or budget.
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.PORT || 5192);
const OUT = process.argv[2] || '/tmp/claude-0/-home-user-aftermath/a2b2bb86-d226-5b76-8c09-c4a191c5ba8d/scratchpad/v2/scene-actors';
const FILTER = process.argv[3] || '';
const ROOT = path.join(__dirname, '..', '..');
const BUDGET = { calls: 150, tris: 400000 };

// helpers evaluated in the page
const PAGE_HELPERS = `
window.__adv = (secs, dt = 1 / 30, sim = true) => { const n = Math.round(secs / dt); for (let i = 0; i < n; i++) { if (sim) lab.sim.step(lab.state, dt); lab.scene.update(lab.state, dt, { render: false }); } lab.scene.render(); return lab.scene.stats(); };
window.__closeup = (tx, ty, tz, fx, fy, fz, fov = 30) => { const w = lab.scene.world; w.cam.setVisFov(fov); w.cam.override((cam) => { cam.position.set(fx, fy, fz); cam.up.set(0, 1, 0); cam.lookAt(tx, ty, tz); }); lab.scene.render(); return lab.scene.stats(); };
window.__allCrews = async (q) => { const m = await import('./js/scene/lab/actor-cases.js'); await lab.setState(m.allCrews(lab), { juice: false }); lab.scene.frame('city', { instant: true }); };
`;
// [name, query, setTime|null, script]
const CASES = [
  ['attack-wade', 'phase=attack&chain=1,2&extra=5&first=1', -0.9, ''],
  ['attack-landing', 'phase=attack&chain=1,2&extra=5&first=1', 0.7, ''],
  ['attack-windup', 'phase=attack&chain=1,2&extra=5&first=1', 1.3, ''],
  ['attack-hit', 'phase=attack&chain=1,2&extra=5&first=1', 1.5, '__adv(0.12, 1/50)'],
  ['attack-stagger', 'phase=attack&chain=1,2&extra=5&first=1', 1.5, '__adv(0.3, 1/50)'],
  ['attack-topple', 'phase=attack&chain=1,2&extra=5&first=1', 2.3, ''],
  ['attack-impact', 'phase=attack&chain=1,2&extra=5&first=1', 2.45, '__adv(0.45, 1/30)'],
  ['attack-repeat-mutant', 'phase=attack&chain=3,1,2&mutant=1', 1.3, ''],
  ['cleanup-crews', 'phase=cleanup&chain=1,2&extra=5', null, 'await __allCrews(); __adv(5.5, 1/30, false)'],
  ['cleanup-crews-zoom', 'phase=cleanup&chain=1,2&extra=5', null, 'await __allCrews(); lab.scene.frame("district:1", { zoom: "district", instant: true }); __adv(5.0, 1/30, false)'],
  ['cleanup-crews-low', 'phase=cleanup&chain=1,2&extra=5&q=low', null, 'await __allCrews(); __adv(5.0, 1/30, false)'],
  ['carve-step0', 'phase=cleanup&chain=5,1&stage=carve&carve=1&frame=chain&fleet=fire:1,debris:1,carve:2', 6, '__adv(2.5, 1/30, false)'],
  ['carve-step1', 'phase=cleanup&chain=5,1&stage=carve&carve=0.74&frame=chain&fleet=fire:1,debris:1,carve:2', 6, '__adv(2.5, 1/30, false)'],
  ['carve-step2', 'phase=cleanup&chain=5,1&stage=carve&carve=0.49&frame=chain&fleet=fire:1,debris:1,carve:2', 6, '__adv(2.5, 1/30, false)'],
  ['carve-step3', 'phase=cleanup&chain=5,1&stage=carve&carve=0.24&frame=chain&fleet=fire:1,debris:1,carve:2', 6, '__adv(2.5, 1/30, false)'],
  ['carve-step4', 'phase=cleanup&chain=5,1&stage=carve&carve=0&frame=chain&fleet=fire:1,debris:1,carve:2', 6, ''],
  ['carve-close', 'phase=cleanup&chain=1,2&stage=carve&carve=0.45&fleet=fire:1,debris:1,carve:2', 6, '__adv(3.2, 1/30, false); __closeup(70, 8, 50, 150, 70, 150, 32)'],
  ['corpse-head', 'phase=cleanup&chain=5,1&stage=carve&carve=1&hud=0', 6, 'const v = new (lab.scene._debug.camera.position.constructor)(); lab.scene.world.actors.anchor("corpse:head", v); __closeup(v.x, v.y, v.z, v.x + 40, v.y + 45, v.z + 95, 30)'],
  ['corpse-c1', 'phase=cleanup&chain=1&first=1&stage=fire', 6, ''],
  ['corpse-col-mutant', 'phase=cleanup&chain=3,1,2&mutant=1&stage=carve&carve=0.6', 6, ''],
  ['fleet-dispatch', 'phase=cleanup&chain=1,2&extra=5&stage=rubble&fleet=fire:2,debris:2,carve:1&frame=city', 6, 'lab.sim.dispatch(lab.state, "fire", 2); lab.sim.dispatch(lab.state, "debris", 5); lab.sim.dispatch(lab.state, "carve", 1); __adv(1.4)'],
  ['yard-parked', 'phase=calm&inv=1&job=0.6&frame=yard&fleet=fire:2,debris:3,carve:2', 0, '__adv(0.5, 1/30, false)'],
  ['yard-buyer', 'phase=calm&inv=1&frame=yard&fleet=fire:2,debris:2,carve:1', 0, 'lab.emit("sale", { buyer: "riza", item: "all", qty: 6, total: 400 }); __adv(6.0, 1/30, false)'],
  ['rival', 'phase=rival&chain=4,2', 6, 'lab.state.rival.fleet.push({ id: "r2", type: "fire", state: "working", sector: 4, from: 4, eta: 0, eta0: 0, bay: 0, seq: 0 }, { id: "r3", type: "carve", state: "enroute", sector: 4, from: "rival", eta: 1.5, eta0: 3, bay: 0, seq: 1 }); __adv(2.5, 1/30, false)'],
];
// frame sequences: [name, query, setTime, setup script, frames: [[advanceSecs, label], ...]]
const SEQS = [
  ['seq-hit', 'phase=attack&chain=1,2&extra=5&first=1', 1.3, '', [[0.1, '1.40'], [0.1, '1.50'], [0.06, '1.56'], [0.04, '1.60'], [0.04, '1.64'], [0.06, '1.70'], [0.1, '1.80'], [0.15, '1.95'], [0.35, '2.30'], [0.4, '2.70']]],
  ['seq-dispatch', 'phase=cleanup&chain=1&first=1&stage=fire&fleet=fire:2,debris:2,carve:1&frame=district:1%2Byard', 6,
    'const v = lab.state.fleet.find((q) => q.id === "v2"); v.state = "yard"; v.sector = null; for (const s of lab.state.sectors) s.crews = { fire: 0, debris: 0, carve: 0 }; lab.scene.update(lab.state, 0); lab.sim.dispatch(lab.state, "fire", 1);',
    [[0.05, '0.0'], [0.4, '0.4'], [0.4, '0.8'], [0.4, '1.2'], [0.4, '1.6'], [0.4, '2.0'], [0.4, '2.4'], [0.45, '2.9'], [0.3, 'arrive+0.2'], [1.2, 'work+1.4']]],
];

async function waitServer(url, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) { /* retry */ } await new Promise((r) => setTimeout(r, 200)); }
  return false;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let server = null;
  if (process.env.SERVE !== '0') server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  const base = `http://localhost:${PORT}/scene-lab.html`;
  if (!(await waitServer(base))) { console.error('server not reachable'); process.exit(1); }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  const report = [];
  let failed = 0;
  async function open(q) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await page.goto(`${base}?${q}&ui=0`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    await page.evaluate(PAGE_HELPERS);
    return { page, errs };
  }
  function note(name, st, errs) {
    const over = st.drawCalls > BUDGET.calls || st.triangles > BUDGET.tris;
    report.push({ name, calls: st.drawCalls, tris: st.triangles, vehicles: st.vehicles, particles: st.particles, quality: st.quality, errors: errs.length, over });
    if (errs.length || over) { failed++; console.log(name, over ? 'OVER BUDGET' : '', errs.slice(0, 3)); }
  }
  for (const [name, q, t, js] of CASES) {
    if (FILTER && !name.includes(FILTER)) continue;
    const { page, errs } = await open(q);
    if (t !== null) await page.evaluate((tt) => window.__setTime(tt), t);
    if (js) await page.evaluate(`(async () => { ${js} })()`);
    const st = await page.evaluate(() => { lab.scene.render(); return lab.scene.stats(); });
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    note(name, st, errs);
    await page.close();
  }
  for (const [name, q, t, js, frames] of SEQS) {
    if (FILTER && !name.includes(FILTER)) continue;
    const { page, errs } = await open(q);
    if (t !== null) await page.evaluate((tt) => window.__setTime(tt), t);
    if (js) await page.evaluate(`(async () => { ${js} })()`);
    const shots = [];
    let st = null;
    for (let i = 0; i < frames.length; i++) {
      const [adv, label] = frames[i];
      st = await page.evaluate((a) => window.__adv(a, 1 / 50), adv);
      const file = path.join(OUT, `${name}-${String(i).padStart(2, '0')}.png`);
      await page.screenshot({ path: file });
      shots.push([file, label]);
    }
    note(name, st, errs);
    // contact sheet (2 rows) through the page itself (no extra deps)
    const imgs = shots.map(([f, l]) => [fs.readFileSync(f).toString('base64'), l]);
    const sheet = await page.evaluate(async (list) => {
      const cols = Math.ceil(list.length / 2), W = 260, H = 563;
      const cv = document.createElement('canvas'); cv.width = cols * W; cv.height = 2 * H;
      const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < list.length; i++) {
        const im = new Image(); im.src = 'data:image/png;base64,' + list[i][0]; await im.decode();
        const x = (i % cols) * W, y = Math.floor(i / cols) * H;
        c.drawImage(im, x, y, W, H);
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x, y, 110, 22); c.fillStyle = '#fff'; c.font = '14px monospace'; c.fillText(list[i][1], x + 6, y + 16);
      }
      return cv.toDataURL('image/jpeg', 0.85).split(',')[1];
    }, imgs);
    fs.writeFileSync(path.join(OUT, `${name}-sheet.jpg`), Buffer.from(sheet, 'base64'));
    await page.close();
  }
  await browser.close();
  if (server) server.kill();
  console.table(report);
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log(failed ? `FAILED ${failed}` : 'ALL OK');
  process.exit(failed ? 1 : 0);
})();
