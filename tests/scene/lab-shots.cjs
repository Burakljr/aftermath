// Scene lab smoke test + screenshots. Self-contained: starts its own static
// server, drives scene-lab.html deterministically (manual=1 + lab.setTime),
// fails on console errors, prints stats() per shot.
// usage: timeout 600 node tests/scene/lab-shots.cjs [outDir] [only=name,name]
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 5302);
const OUT = process.argv[2] && !process.argv[2].startsWith('only=') ? process.argv[2] : path.join(os.tmpdir(), 'toy-scene-shots');
const ONLY = (process.argv.find((a) => a.startsWith('only=')) || '').slice(5).split(',').filter(Boolean);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain', '.md': 'text/plain' };

const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(data);
  });
});

const SHOTS = [
  { name: '01-wood-fresh', q: 'factory=wood&open=1100&levels=1,1,1,1', t: 6 },
  { name: '02-wood-allopen', q: 'factory=wood&open=1111&levels=12,9,6,3', t: 14 },
  { name: '03-wood-boost', q: 'factory=wood&open=1111&levels=12,9,6,3&boost=0100', t: 12.3 },
  { name: '04-wood-upgrade', q: 'factory=wood&open=1111&levels=24,9,6,3', t: 10, after: (p) => p.evaluate(() => { const s = lab.state.factory.stations[0]; s.level = 25; lab.fx('upgrade', { station: 'saw', level: 25, milestone: true }); lab.step(0.1); lab.step(0.1); lab.step(0.05); }) },
  { name: '05-teddy', q: 'factory=teddy&open=1111&levels=10,26,8,2', t: 14 },
  { name: '06-wood-low', q: 'factory=wood&open=1111&levels=12,9,6,3&quality=low', t: 14 },
  { name: '07-wood-tiers', q: 'factory=wood&open=1111&levels=10,25,50,100', t: 9 },
  { name: '08-teddy-fresh', q: 'factory=teddy&open=1100&levels=1,1,1,1', t: 6 },
  { name: '09-open-anim', q: 'factory=wood&open=1100&levels=8,8,1,1', t: 6, after: (p) => p.evaluate(() => { const s = lab.state.factory.stations[2]; s.open = true; lab.fx('open', { station: 'paint' }); lab.step(0.1); lab.step(0.1); lab.step(0.1); }) },
  { name: '11-web-fresh', ctx: 'web', q: 'factory=wood&open=1100&levels=1,1,1,1', t: 6 },
  { name: '12-web-allopen', ctx: 'web', q: 'factory=teddy&open=1111&levels=12,9,6,3', t: 12 },
  { name: '10-confetti', q: 'factory=teddy&open=1111&levels=10,26,8,2&hud=0&labels=0', t: 8, after: (p) => p.evaluate(() => { lab.fx('factoryComplete', {}); lab.step(0.1); lab.step(0.1); lab.step(0.2); lab.step(0.2); }) },
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  // 'app': iPhone 18 Pro-like full screen (Capacitor) with emulated safe areas; 'web': iPhone 13 Safari
  const ctxApp = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 402, height: 874 }, screen: { width: 402, height: 874 }, deviceScaleFactor: 2 });
  const ctxWeb = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
  const errors = [];
  const pages = {};
  for (const [k, c] of [['app', ctxApp], ['web', ctxWeb]]) {
    const pg = await c.newPage();
    pg.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    pg.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    pages[k] = pg;
  }
  let page = pages.app;
  const results = [];
  for (const s of SHOTS) {
    if (ONLY.length && !ONLY.includes(s.name)) continue;
    const t0 = Date.now();
    page = pages[s.ctx || 'app'];
    const safe = (s.ctx || 'app') === 'app' ? '&safe=62,34' : '';
    await page.goto(`http://localhost:${PORT}/scene-lab.html?manual=1&auto=0${safe}&${s.q}&t=${s.t}`);
    await page.waitForFunction(() => window.labReady === true, null, { timeout: 120000 });
    if (s.after) await s.after(page);
    await page.evaluate(() => lab.step(0));
    const stats = await page.evaluate(() => lab.scene.stats());
    const file = path.join(OUT, s.name + '.png');
    await page.screenshot({ path: file, scale: 'css' });
    results.push({ name: s.name, ms: Date.now() - t0, calls: stats.calls, tris: stats.tris, quality: stats.quality, particles: stats.particles });
    console.log(s.name, JSON.stringify(stats), (Date.now() - t0) + 'ms');
  }
  // pick + anchor sanity
  page = pages.app;
  await page.goto(`http://localhost:${PORT}/scene-lab.html?manual=1&auto=0&factory=wood&open=1100&t=1`);
  await page.waitForFunction(() => window.labReady === true, null, { timeout: 120000 });
  const pickCheck = await page.evaluate(() => {
    const out = [];
    for (const id of ['saw', 'assembly', 'paint', 'wrap', 'truck']) {
      const a = lab.scene.anchor(id);
      const hit = lab.scene.pick(a.x, a.y + 30);
      out.push({ id, a: [Math.round(a.x), Math.round(a.y), a.visible], hit: hit && (hit.id || hit.type) });
    }
    out.push({ id: 'index2', a: lab.scene.anchor(2) });
    out.push({ id: 'empty', hit: lab.scene.pick(5, 5) });
    return out;
  });
  console.log('pick/anchor', JSON.stringify(pickCheck));
  await browser.close();
  server.close();
  const bad = errors.filter((e) => !/GPU stall|Automatic fallback to software WebGL|ReadPixels/.test(e));
  if (bad.length) { console.log('CONSOLE ERRORS:\n' + bad.join('\n')); process.exitCode = 1; }
  else console.log('no console errors');
  const over = results.filter((r) => r.calls > 60 || r.tris > 100000);
  if (over.length) { console.log('BUDGET EXCEEDED', JSON.stringify(over)); process.exitCode = 1; }
})().catch((e) => { console.error(e); process.exitCode = 1; try { server.close(); } catch (_) {} });
