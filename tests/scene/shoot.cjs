// Screenshots of every scene-lab visual state on the iPhone 13 profile (390 x 844 CSS, DPR 3).
// Usage: PORT=5191 node tests/scene/shoot.cjs [outDir] [filter]
// Starts tools/serve.mjs on PORT unless SERVE=0. Time is driven by __setTime (deterministic).
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = Number(process.env.PORT || 5191);
const OUT = process.argv[2] || '/tmp/claude-0/-home-user-aftermath/a2b2bb86-d226-5b76-8c09-c4a191c5ba8d/scratchpad/v2/scene-world';
const FILTER = process.argv[3] || '';
const ROOT = path.join(__dirname, '..', '..');

const STATES = [
  ['calm', 'phase=calm', 0],
  ['calm-yard', 'phase=calm&inv=1&job=0.6&frame=yard&upkeep=0', 0],
  ['calm-upkeep', 'phase=calm&upkeep=3&sel=1', 0],
  ['attack-wade', 'phase=attack&chain=1,2&extra=5', 1.2],
  ['impact', 'phase=attack&chain=1,2&extra=5', 3.3],
  ['cleanup-c1', 'phase=cleanup&chain=1&first=1&sel=1', 6],
  ['cleanup-fire', 'phase=cleanup&chain=1,2&extra=5&sel=2', 6],
  ['cleanup-zoom', 'phase=cleanup&chain=1,2&extra=5&sel=1&zoom=district', 6],
  ['cleanup-low', 'phase=cleanup&chain=1,2&extra=5&sel=2&q=low', 6],
  ['cleanup-steam', 'phase=cleanup&chain=1,2&sel=2&fire=0.2', 6],
  ['cleanup-rubble', 'phase=cleanup&chain=1,2&stage=rubble&rubble=0.5&sel=1', 6],
  ['cleanup-carve', 'phase=cleanup&chain=1,2&stage=carve&carve=0.5', 6],
  ['cleanup-spreadwarn', 'phase=cleanup&chain=2&warn=2,4&pulse=1', 6],
  ['chain-h', 'phase=cleanup&chain=1,5', 6],
  ['chain-col', 'phase=cleanup&chain=3,1,2&mutant=1', 6],
  ['tender', 'phase=tender&chain=0,3', 6],
  ['rival', 'phase=rival&chain=4,2', 6],
  ['result-city', 'phase=calm&result=1&chain=1,2', 6],
  ['promenade-zoom', 'phase=calm&frame=district:0&zoom=district', 0],
];
// juice moments: [name, query, setTime, script run in the page (then steps of 0.05 s and one render)]
const SCRIPTED = [
  ['juice-clean-wave', 'phase=cleanup&chain=2&stage=carve&carve=0.01&frame=district:2&zoom=district', 6,
    'const s = lab.state.sectors[2]; s.corpse = 0; s.damaged = false; lab.emit("clean", { sectorId: 2 }); for (let i = 0; i < 9; i++) lab.scene.update(lab.state, 0.05);'],
  ['juice-fire-out', 'phase=cleanup&chain=2&fire=0.3&frame=district:2&zoom=district', 6,
    'lab.state.sectors[2].fire = 0; for (let i = 0; i < 14; i++) lab.scene.update(lab.state, 0.05);'],
  ['juice-spread', 'phase=cleanup&chain=2&warn=2,4', 6,
    'const t = lab.state.sectors[4]; t.damaged = true; t.fire = 35; t.fire0 = 35; lab.state.sectors[2].warnTo = null; lab.state.sectors[2].warnT = 0; lab.emit("spread", { from: 2, to: 4 }); for (let i = 0; i < 7; i++) lab.scene.update(lab.state, 0.05);'],
  ['juice-impact-0.4', 'phase=attack&chain=1,5', 2.4,
    'lab.state.attack.t = 2.6; lab.state.attack.hit = true; for (const id of lab.state.attack.sectors) { const s = lab.state.sectors[id]; s.damaged = true; s.fire0 = s.fire = 60; s.rubbleMax = s.rubble = 40; s.corpseMax = s.corpse = 40; } for (let i = 0; i < 8; i++) lab.scene.update(lab.state, 0.05);'],
];

async function waitServer(url, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let server = null;
  if (process.env.SERVE !== '0') {
    server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  }
  const base = `http://localhost:${PORT}/scene-lab.html`;
  if (!(await waitServer(base))) { console.error('server not reachable'); process.exit(1); }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  const report = [];
  let failed = 0;
  for (const [name, q, t] of STATES) {
    if (FILTER && !name.includes(FILTER)) continue;
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await page.goto(`${base}?${q}&ui=0`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    const st = await page.evaluate((tt) => window.__setTime(tt), t);
    const file = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: file });
    report.push({ name, drawCalls: st.drawCalls, triangles: st.triangles, quality: st.quality, programs: st.programs, errors: errs.length });
    if (errs.length) { failed++; console.log(name, 'ERRORS', errs.slice(0, 3)); }
    console.log(`${name.padEnd(20)} calls ${String(st.drawCalls).padStart(4)}  tris ${String(Math.round(st.triangles / 1000)).padStart(4)}k  ${st.quality}`);
    await page.close();
  }
  for (const [name, q, t, script] of SCRIPTED) {
    if (FILTER && !name.includes(FILTER)) continue;
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(`${base}?${q}&ui=0`);
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
    await page.evaluate((tt) => window.__setTime(tt), t);
    const st = await page.evaluate(`(() => { ${script} return window.lab.scene.stats(); })()`);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    report.push({ name, drawCalls: st.drawCalls, triangles: st.triangles, quality: st.quality, errors: errs.length });
    if (errs.length) { failed++; console.log(name, 'ERRORS', errs.slice(0, 3)); }
    console.log(`${name.padEnd(20)} calls ${String(st.drawCalls).padStart(4)}  tris ${String(Math.round(st.triangles / 1000)).padStart(4)}k  ${st.quality}`);
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, 'shots.json'), JSON.stringify(report, null, 1));
  await browser.close();
  if (server) server.kill();
  process.exit(failed ? 1 : 0);
})();
