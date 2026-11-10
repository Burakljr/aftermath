// Scene smoke test (Playwright + Chromium, SwiftShader): scene-lab.html with the fake restaurant.
//   timeout 600 node tests/scene/smoke.cjs [<screenshotDir>]
// PORT env (default 5401) for its own tools/serve.mjs. Checks: no console errors, assets under
// 8 MB, draw-call / triangle budgets with 8 guests + 4 cooks (High and Low), pick() and
// anchor() agree with the 3D positions, location switch, automatic drop to Low, and the
// window.__EMBED fallback (every .glb request blocked). With <screenshotDir> it also saves
// the review screenshots (390 x 844, DPR 2, plus 1x copies for review at real size).
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const PORT = Number(process.env.PORT) || 5401;
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : null;
const BUDGET = { high: { calls: 120, tris: 150000 }, low: { calls: 120, tris: 150000 } };
const URL = (q) => `http://localhost:${PORT}/scene-lab.html?manual=1&auto=0&${q}`;

let failures = 0;
function check(ok, msg) {
  console.log((ok ? 'ok   ' : 'FAIL ') + msg);
  if (!ok) failures++;
}

(async () => {
  const srv = spawn('node', [path.join(ROOT, 'tools/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 500));
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];
  try {
    // ---- assets
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/models/manifest.json'), 'utf8'));
    check(man.total < 8 * 1024 * 1024, `assets ${(man.total / 1048576).toFixed(2)} MB < 8 MB (${Object.keys(man.files).length} files)`);
    check(fs.existsSync(path.join(ROOT, 'assets/LICENSE-KayKit.txt')), 'KayKit licence copied');

    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
    const open = async (q) => {
      await page.goto(URL(q));
      await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
    };
    const shot = async (name) => {
      if (!OUT) return;
      fs.mkdirSync(OUT, { recursive: true });
      await page.evaluate(() => lab.step(0, true));
      await page.screenshot({ path: path.join(OUT, name + '.png') });
    };
    const stats = () => page.evaluate(() => { lab.step(1 / 30, true); return lab.scene.stats(); });

    // ---- empty inn at the start
    await open('preset=start');
    let st = await stats();
    check(st.calls > 0 && st.tris > 0, `start: ${st.calls} calls, ${st.tris} tris`);
    await shot('01-start');

    // ---- busy inn: budgets, picking, anchors
    await open('preset=busy');
    const counts = await page.evaluate(() => ({ c: lab.state.customers.length, k: lab.state.cooks.length }));
    check(counts.c >= 8 && counts.k === 4, `busy: ${counts.c} guests, ${counts.k} cooks`);
    st = await stats();
    check(st.calls <= BUDGET.high.calls && st.tris <= BUDGET.high.tris, `busy High: ${st.calls} calls <= ${BUDGET.high.calls}, ${st.tris} tris <= ${BUDGET.high.tris}`);
    const highStats = st;
    const pa = await page.evaluate(() => {
      const sc = lab.scene, L = sc.debug.layout, out = { stations: [], tables: [], guests: [], coins: sc.anchor('coins') };
      const W = innerWidth, H = innerHeight;
      for (const s of L.stations) {
        const a = sc.anchor('station', s.id);
        const c = sc.debug.project(s.pos[0], 0.9, s.pos[1] + 0.6);
        const hit = sc.pick(c.x, c.y);
        out.stations.push({ id: s.id, a, inView: a.visible && a.x > 0 && a.x < W && a.y > 0 && a.y < H, above: a.y < c.y, hit });
      }
      for (const t of L.tables) {
        const a = sc.anchor('table', t.id);
        const c = sc.debug.project(t.pos[0], 0.95, t.pos[1]);
        out.tables.push({ id: t.id, a, hit: sc.pick(c.x, c.y) });
      }
      for (const c of lab.state.customers) {
        const v = sc.debug.crowd.customers.get(c.id);
        const a = sc.anchor('customer', c.id);
        const feet = sc.debug.project(v.x, 0, v.z);
        out.guests.push({ id: c.id, state: c.state, above: a.y < feet.y - 20, visible: a.visible });
      }
      out.empty = sc.pick(5, 5);
      return out;
    });
    check(pa.stations.every((s) => s.inView && s.above), 'station anchors on screen, above the station');
    check(pa.stations.every((s) => s.hit && s.hit.type === 'station' && s.hit.id === s.id), 'pick() on every station body returns that station');
    check(pa.tables.every((t) => t.a.visible && t.hit && (t.hit.type === 'table' || t.hit.type === 'customer')), 'table anchors visible, pick on a table returns the table (or a guest sitting there)');
    check(pa.guests.filter((g) => g.state !== 'leaving' && g.state !== 'enter').every((g) => g.above && g.visible), 'guest anchors above the heads');
    check(pa.coins.visible && pa.coins.y < 120, 'coins anchor at the top');
    check(pa.empty === null, 'pick() on the sky returns null');
    await shot('02-busy');

    // ---- effects: every event, no errors
    await page.evaluate(() => {
      const s = lab.state.stations[0], c = lab.state.customers[0];
      for (const [ev, p] of [['pay', { customer: c.id, value: 120 }], ['upgrade', { station: s.id, level: 25, milestone: true }],
        ['open', { station: s.id }], ['buyTable', { table: 't6' }], ['hire', { cook: 'c1' }], ['boost', { station: s.id }],
        ['serve', { customer: c.id }], ['cookStart', { station: s.id }], ['goal', { id: 'x' }], ['locationComplete', {}], ['order', {}], ['arrive', {}], ['leave', {}]]) lab.fx(ev, p);
      lab.step(0.4, true);
    });
    st = await stats();
    check(st.particles > 0 && st.calls <= BUDGET.high.calls, `effects running: ${st.particles} particles, ${st.calls} calls, ${st.tris} tris`);
    await shot('03-confetti');

    // ---- close-ups
    await open('preset=eat&bands=0&labels=0');
    const eat = await page.evaluate(() => lab.state.customers.some((c) => c.state === 'eating'));
    check(eat, 'close-up: a guest is eating');
    await shot('04-eating');
    await open('preset=carry&bands=0&labels=0');
    const carry = await page.evaluate(() => lab.state.cooks.some((c) => c.state === 'toTable'));
    check(carry, 'close-up: a cook carries a dish');
    await shot('05-carrying');

    // ---- Harbor Tavern + location switch
    await open('preset=busy');
    await page.evaluate(() => { lab.sim.setup({ location: 'harbor', open: 4, tables: 6, cooks: 4 }); lab.fx('locationStart', { id: 'harbor' }); lab.step(0.2, true); });
    const loc = await page.evaluate(() => lab.scene.debug.layout.id);
    check(loc === 'harbor', 'locationStart switches to the Harbor Tavern');
    await open('preset=harbor');
    st = await stats();
    check(st.calls <= BUDGET.high.calls && st.tris <= BUDGET.high.tris, `harbor High: ${st.calls} calls, ${st.tris} tris`);
    await shot('06-harbor');

    // ---- Low quality
    await open('preset=busy&quality=low');
    st = await stats();
    const dprLow = await page.evaluate(() => lab.scene.debug.view.dpr);
    check(st.quality === 'low' && dprLow <= 1.25, `Low: pixel ratio ${dprLow} <= 1.25`);
    check(st.calls <= highStats.calls && st.tris <= highStats.tris, `busy Low lighter: ${st.calls} calls, ${st.tris} tris (High ${highStats.calls} / ${highStats.tris})`);
    await shot('07-low');

    // ---- automatic drop to Low
    await page.goto(URL('preset=busy').replace('auto=0', 'auto=1'));
    await page.waitForFunction(() => window.__ready, null, { timeout: 180000 });
    const auto = await page.evaluate(() => { lab.scene.debug.perf.onSlow(); lab.step(0.1, true); return lab.scene.stats(); });
    check(auto.quality === 'low' && auto.autoLowered, 'slow frames drop the scene to Low');

    check(errors.length === 0, `no console errors (${errors.length})${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
    await ctx.close();

    // ---- embed fallback: every .glb blocked, the files come from window.__EMBED (base64)
    const embed = {};
    for (const f of fs.readdirSync(path.join(ROOT, 'assets/models')).filter((x) => x.endsWith('.glb'))) {
      embed[f.replace('.glb', '')] = fs.readFileSync(path.join(ROOT, 'assets/models', f)).toString('base64');
    }
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p2 = await ctx2.newPage();
    const err2 = [];
    let glbRequests = 0;
    p2.on('pageerror', (e) => err2.push(e.message));
    await p2.route('**/*.glb', (r) => { glbRequests++; r.abort(); });
    await p2.addInitScript((e) => { window.__EMBED = e; }, embed);
    await p2.goto(URL('preset=busy'));
    await p2.waitForFunction(() => window.__ready, null, { timeout: 180000 });
    const s2 = await p2.evaluate(() => { lab.step(0.1, true); return lab.scene.stats(); });
    check(glbRequests === 0 && s2.characters >= 12 && err2.length === 0, `embed fallback: scene built without fetching .glb files (${s2.characters} characters)`);
    await ctx2.close();

    if (OUT) {
      // 1x copies for review at real size
      const { execFileSync } = require('child_process');
      try {
        execFileSync('python3', ['-c', `
import sys, os
from PIL import Image
d = sys.argv[1]
for f in sorted(os.listdir(d)):
    if f.endswith('.png') and not f.endswith('@1x.png'):
        im = Image.open(os.path.join(d, f)); im.resize((im.width // 3, im.height // 3), Image.LANCZOS).save(os.path.join(d, f[:-4] + '@1x.png'))
`, OUT]);
      } catch (e) { console.log('(no 1x copies: ' + e.message + ')'); }
      fs.writeFileSync(path.join(OUT, 'stats.json'), JSON.stringify({ high: highStats, low: st }, null, 2));
    }
  } catch (e) {
    console.error(e);
    failures++;
  } finally {
    await browser.close();
    srv.kill();
  }
  console.log(failures ? `\n${failures} check(s) failed` : '\nall scene checks passed');
  process.exit(failures ? 1 : 0);
})();
