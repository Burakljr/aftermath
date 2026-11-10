// Screenshots of the UI lab presets at 390 x 844 (and one short screen), 1x.
//   timeout 600 node tests/ui/lab-shots.cjs <outDir> [en|tr|both] [preset,preset]
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const PORT = Number(process.env.PORT) || 5402;
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'shots-ui'));
const LANGS = (process.argv[3] || 'both') === 'both' ? ['en', 'tr'] : [process.argv[3]];
const ONLY = process.argv[4] ? process.argv[4].split(',') : null;
const PRESETS = ['fresh', 'tut1', 'card', 'poor', 'milestone', 'open', 'opencard', 'busy', 'collect', 'upgrades', 'goals', 'places', 'complete', 'placesdone', 'harbor', 'offline', 'settings'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  let browser;
  try {
    await wait(400);
    browser = await chromium.launch();
    for (const lang of LANGS) {
      for (const [vw, vh, tag] of [[390, 844, ''], [390, 664, '-short']]) {
        const ctx = await browser.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1, viewport: { width: vw, height: vh } });
        const list = tag ? ['fresh', 'card', 'upgrades'] : PRESETS;
        for (const p of list) {
          if (ONLY && !ONLY.includes(p)) continue;
          const page = await ctx.newPage();
          const errs = [];
          page.on('pageerror', (e) => errs.push(String(e)));
          page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
          await page.goto(`http://localhost:${PORT}/ui-lab.html?paused=1&lang=${lang}&state=${p}`);
          await page.waitForFunction(() => window.diner && window.diner.ready && document.fonts.status === 'loaded');
          await page.evaluate(() => window.diner.step(0.2));
          await wait(450); // CSS transitions (wall clock)
          const file = path.join(OUT, `${lang}-${p}${tag}.png`);
          await page.screenshot({ path: file });
          console.log(file, errs.length ? 'ERRORS: ' + errs.join(' | ') : '');
          await page.close();
        }
        await ctx.close();
      }
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
})().catch((e) => { console.error(e); process.exit(1); });
