// Fast scene smoke test (no screenshots): loads scene-lab.html for both factories,
// runs the real-time loop briefly, fires every fx event, taps a station, checks
// pick/anchor, budgets and that there are no console errors.
// usage: timeout 300 node tests/scene/lab-smoke.cjs
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 5302);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(data);
  });
});

const fail = [];
const check = (cond, msg) => { if (!cond) fail.push(msg); };

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  for (const factory of ['wood', 'teddy']) {
    await page.goto(`http://localhost:${PORT}/scene-lab.html?factory=${factory}&open=1100&auto=0`);
    await page.waitForFunction(() => window.labReady === true, null, { timeout: 60000 });
    await page.waitForTimeout(1500); // real-time loop
    const r = await page.evaluate(() => {
      const s = lab.scene;
      const ids = lab.cfg().stations.map((x) => x.id);
      // open everything, every event, a few levels
      lab.state.factory.stations.forEach((st, i) => { if (!st.open) { st.open = true; s.fx('open', { station: st.id }); } });
      for (const ev of ['cycle', 'pass', 'sold', 'upgrade', 'boost', 'goal', 'claim', 'factoryComplete', 'factoryStart', 'money', 'offline', 'tutorial', 'unknown']) {
        s.fx(ev, { station: ids[1], from: ids[0], to: ids[1], level: 10, milestone: true, value: 5 });
      }
      for (const L of [10, 25, 50, 100]) { lab.state.factory.stations[0].level = L; lab.step(0.05); }
      for (let i = 0; i < 60; i++) lab.step(1 / 30);
      s.setQuality('low'); lab.step(0.05);
      const low = s.stats();
      s.setQuality('high'); lab.step(0.05);
      const anchors = ids.map((id) => s.anchor(id));
      const picks = anchors.map((a) => { const h = s.pick(a.x, a.y + 35); return h && h.id; });
      return {
        ids, anchors, picks, low, high: s.stats(),
        truck: s.anchor('truck'), coins: s.anchor('coins'), byIndex: s.anchor(2), bad: s.anchor('nope'),
        none: s.pick(2, 2),
      };
    });
    check(r.anchors.every((a) => a.visible && a.x > 0 && a.y > 0), `${factory}: station anchors visible`);
    check(r.picks.join() === r.ids.join(), `${factory}: pick at each anchor returns that station (${r.picks})`);
    check(r.truck.visible, `${factory}: truck anchor visible`);
    check(r.coins.visible, `${factory}: coins anchor`);
    check(Math.abs(r.byIndex.x - r.anchors[2].x) < 0.5, `${factory}: anchor by index`);
    check(r.bad.visible === false, `${factory}: unknown anchor is not visible`);
    check(r.none === null, `${factory}: empty corner picks nothing`);
    check(r.low.quality === 'low' && r.high.quality === 'high', `${factory}: setQuality`);
    check(r.high.calls <= 60 && r.high.tris <= 100000, `${factory}: budget ${r.high.calls} calls ${r.high.tris} tris`);
    // a real tap on the canvas boosts the station in the lab
    const a = r.anchors[0];
    await page.mouse.click(a.x, a.y + 35);
    const tapped = await page.evaluate(() => window.lastPick);
    check(tapped && tapped.id === r.ids[0], `${factory}: canvas tap picks station 1`);
    console.log(factory, JSON.stringify({ high: r.high, low: r.low }));
  }
  await browser.close();
  server.close();
  const bad = errors.filter((e) => !/GPU stall|software WebGL|ReadPixels/.test(e));
  if (bad.length) fail.push('console errors:\n' + bad.join('\n'));
  if (fail.length) { console.log('FAIL\n' + fail.join('\n')); process.exitCode = 1; } else console.log('scene smoke: OK');
})().catch((e) => { console.error(e); process.exitCode = 1; try { server.close(); } catch (_) {} });
