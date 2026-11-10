// Checks the preview build (tools/build-preview.mjs) on a plain static server, from a sub-path.
//   node tools/build-preview.mjs out/preview && timeout 300 node tests/preview.cjs out/preview
// Serves the PARENT of the preview folder with `python3 -m http.server` on PORT (default 5403)
// and opens /<folder>/ on an emulated iPhone 13. Every .glb request is blocked (the models must
// come from js/embed/*.js). Checks: only allowed file types in the folder, no request outside
// the folder, the game starts (3D view drawn, guests served), no console errors.
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { wait, LAUNCH, ROOT } = require('./helpers.cjs');

const PORT = Number(process.env.PORT) || 5403;
const DIR = path.resolve(process.argv[2] || path.join(ROOT, 'out/preview'));
const SHOT = process.argv[3] ? path.resolve(process.argv[3]) : null;
const ALLOWED = new Set(['.html', '.js', '.css', '.json', '.png', '.jpg', '.svg', '.woff2', '.txt', '.md']);
let failures = 0;
function check(cond, msg) {
  if (cond) console.log('ok  ', msg);
  else { failures++; console.log('FAIL', msg); }
}

function listFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(p, out); else out.push(p);
  }
  return out;
}

(async () => {
  const files = listFiles(DIR);
  const bad = files.filter((f) => !ALLOWED.has(path.extname(f).toLowerCase()));
  check(files.length > 0 && bad.length === 0, `${files.length} files, only allowed types ${bad.length ? JSON.stringify(bad.map((f) => path.relative(DIR, f))) : ''}`);
  const total = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  console.log(`     preview size ${(total / 1048576).toFixed(2)} MB`);

  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', path.dirname(DIR)], { stdio: 'ignore' });
  let browser;
  try {
    await wait(800);
    browser = await chromium.launch(LAUNCH);
    const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const errors = [];
    const outside = [];
    const base = `http://127.0.0.1:${PORT}/${path.basename(DIR)}/`;
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) outside.push(r.url()); });
    let glb = 0;
    await page.route('**/*.glb', (route) => { glb++; route.abort(); });
    await page.goto(base + '?manual=1');
    await page.waitForFunction(() => window.diner && window.diner.ready, null, { timeout: 120000 });
    check(glb === 0, 'no .glb request (models come from js/embed/*.js)');
    check(await page.evaluate(() => Object.keys(window.__EMBED || {}).sort().join(',')) === 'anims,barbarian,knight,mage,props,rogue_hooded', 'window.__EMBED holds the 6 models');
    const r = await page.evaluate(() => { window.diner.step(40); return { served: window.diner.game.state.served, stats: window.diner.scene.stats() }; });
    check(r.stats.calls > 0 && r.stats.tris > 0, `3D view drawn (${r.stats.calls} draw calls, ${Math.round(r.stats.tris / 1000)}k triangles)`);
    check(r.served > 0, `the restaurant works (${r.served} guests served in 40 s)`);
    check(await page.locator('#fatal').isHidden(), 'no "could not start the 3D view" message');
    check(outside.length === 0, 'every request stays inside the preview folder ' + (outside.length ? JSON.stringify(outside.slice(0, 5)) : ''));
    if (SHOT) { await wait(500); await page.screenshot({ path: SHOT }); }
    check(errors.length === 0, 'no console errors' + (errors.length ? ':\n  ' + errors.slice(0, 6).join('\n  ') : ''));
  } finally {
    if (browser) await browser.close().catch(() => {});
    srv.kill();
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
