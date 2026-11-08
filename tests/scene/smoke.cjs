// scene-world smoke test (W1/W3/W6 checks): every lab phase loads without console errors, pick() returns the
// right district for 12 taps + the yard, project() round-trips through pick(), the damage swap at the hit
// stays under 50 ms of CPU per step, prime() reproduces the same damage, and draw calls / triangles stay
// inside the ARCH 5.5 budgets at high and low quality.
// Usage: PORT=5191 node tests/scene/smoke.cjs   (SERVE=0 to reuse a running server)
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const PORT = Number(process.env.PORT || 5191);
const ROOT = path.join(__dirname, '..', '..');
const BUDGET = { calls: 150, tris: 400000 };
let fails = 0;
const ok = (c, msg) => { console.log((c ? 'ok   ' : 'FAIL ') + msg); if (!c) fails++; };

async function waitServer(url, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) { /* retry */ } await new Promise((r) => setTimeout(r, 200)); }
  return false;
}
async function open(ctx, base, q) {
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  await page.goto(`${base}?${q}&ui=0`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  return { page, errs };
}

(async () => {
  let server = null;
  if (process.env.SERVE !== '0') server = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  const base = `http://localhost:${PORT}/scene-lab.html`;
  if (!(await waitServer(base))) { console.error('server not reachable'); process.exit(1); }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  const perf = {};

  // 1. phases + budgets (high and low)
  for (const q of ['high', 'low']) for (const [ph, extra, t] of [['calm', '', 0], ['attack', '&chain=1,2&extra=5', 1.2], ['impact', '&chain=1,2&extra=5', 3.3], ['cleanup', '&chain=1,2&extra=5&sel=2', 6], ['tender', '&chain=0,3', 6], ['rival', '&chain=4,2', 6]]) {
    const { page, errs } = await open(ctx, base, `phase=${ph === 'impact' ? 'attack' : ph}${extra}&q=${q}`);
    const st = await page.evaluate((tt) => window.__setTime(tt), t);
    perf[`${ph}-${q}`] = { calls: st.drawCalls, tris: st.triangles };
    ok(errs.length === 0, `${ph} (${q}) loads without console errors${errs.length ? ': ' + errs[0] : ''}`);
    ok(st.drawCalls <= BUDGET.calls && st.triangles <= BUDGET.tris, `${ph} (${q}) budget: ${st.drawCalls} calls, ${Math.round(st.triangles / 1000)}k tris`);
    await page.close();
  }

  // 2. picking + projection round trip (calm, city framing)
  {
    const { page } = await open(ctx, base, 'phase=calm');
    const res = await page.evaluate(() => {
      const sc = window.lab.scene, L = sc._debug.layout, out = [];
      const rect = document.getElementById('scene').getBoundingClientRect();
      for (let id = 0; id < 6; id++) {
        const D = L.DISTRICTS[id];
        const a = sc.project('district:' + id);
        const p1 = sc.pick(rect.left + a.x, rect.top + a.y);
        out.push({ id, how: 'anchor', got: p1 && p1.id, visible: a.visible });
        const g = sc._debug.projectXYZ(D.x0 + 18, 6, D.z1 - 16);
        const p2 = sc.pick(rect.left + g.x, rect.top + g.y);
        out.push({ id, how: 'corner', got: p2 && p2.id, visible: true });
      }
      const y = sc.project('yard');
      const py = sc.pick(rect.left + y.x, rect.top + y.y);
      out.push({ id: 'yard', how: 'anchor', got: py && py.type, visible: y.visible });
      return out;
    });
    const good = res.filter((r) => r.got === r.id || (r.id === 'yard' && r.got === 'yard')).length;
    ok(good === res.length, `pick: ${good}/${res.length} taps hit the right target` + (good < res.length ? ' ' + JSON.stringify(res.filter((r) => r.got !== r.id && r.got !== 'yard')) : ''));
    ok(res.every((r) => r.visible), 'project: every district anchor and the yard are visible in the city framing');
    await page.close();
  }

  // 3. hit swap timing + prime reproducibility
  {
    const { page, errs } = await open(ctx, base, 'phase=attack&chain=1,2&extra=5&t=0&seed=4');
    const r = await page.evaluate(() => {
      const lab = window.lab; let max = 0, at = 0;
      for (let t = 0; t < 3.7; t += 0.05) {
        const t0 = performance.now();
        lab.sim.step(lab.state, 0.05);
        lab.scene.update(lab.state, 0.05, { render: false });
        const dt = performance.now() - t0;
        if (dt > max) { max = dt; at = lab.state.attack.t; }
      }
      lab.scene.render();
      return { max, at, hash: lab.scene._debug.damageHash(), phase: lab.state.phase };
    });
    ok(r.max < 50, `damage swap: worst CPU step ${r.max.toFixed(1)} ms (attack t ${r.at.toFixed(2)})`);
    ok(errs.length === 0, 'attack run without console errors');
    const { page: p2 } = await open(ctx, base, 'phase=cleanup&chain=1,2&extra=5&seed=4');
    const h2 = await p2.evaluate(() => window.lab.scene._debug.damageHash());
    ok(h2 === r.hash && r.hash !== 0, `prime reproduces the same damage (hash ${r.hash} vs ${h2})`);
    perf.hitStepMs = +r.max.toFixed(1);
    await page.close(); await p2.close();
  }
  console.log('PERF ' + JSON.stringify(perf));
  await browser.close();
  if (server) server.kill();
  process.exit(fails ? 1 : 0);
})();
