// Screenshots of the UI lab states (fake scene, real game + UI).
//   timeout 600 node tests/ui/lab-shots.cjs [outDir]
// Starts tools/serve.mjs on PORT (default 5301), kills it at the end.
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '../..');
const PORT = Number(process.env.PORT) || 5301;
const OUT = path.resolve(process.argv[2] || path.join(require('os').tmpdir(), 'toy-ui-shots'));
fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
  ['fresh', 'en'], ['fresh', 'tr'],
  ['card', 'en'], ['card', 'tr'],
  ['poor', 'en'], ['locked', 'en'], ['locked', 'tr'],
  ['goals', 'en'], ['goals', 'tr'], ['tut1', 'en'], ['milestone', 'en'],
  ['upgrades', 'en'], ['upgrades', 'tr'],
  ['goalspanel', 'en'], ['goalspanel', 'tr'],
  ['factories', 'en'], ['factories', 'tr'], ['teddyfac', 'en'],
  ['complete', 'en'], ['complete', 'tr'],
  ['offline', 'en'], ['offline', 'tr'],
  ['settings', 'en'], ['settings', 'tr'],
  ['teddy', 'en'], ['sales', 'en'], ['late', 'en'], ['late', 'tr'],
];
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  let failed = 0;
  try {
    await wait(400);
    const browser = await chromium.launch();
    const base = devices['iPhone 13'];
    const sizes = [{ w: 390, h: 844, tag: '' }, { w: 390, h: 664, tag: '-short' }];
    for (const size of sizes) {
      const context = await browser.newContext({ ...base, deviceScaleFactor: 1, viewport: { width: size.w, height: size.h } });
      for (const [state, lang] of SHOTS) {
        if (size.tag && !['fresh', 'card', 'goals', 'upgrades'].includes(state)) continue;
        if (ONLY && !ONLY.includes(state) && !ONLY.includes(`${state}-${lang}`)) continue;
        if (process.env.SHORT === '0' && size.tag) continue;
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        await page.goto(`http://localhost:${PORT}/ui-lab.html?state=${state}&lang=${lang}&paused=1`);
        await page.waitForFunction(() => window.toy && document.fonts && document.fonts.status === 'loaded');
        await page.evaluate(() => window.toy.step(0.5));
        if (state === 'sales') {
          // catch floating coins mid-flight
          await page.evaluate(() => window.toy.step(0.35));
          await wait(180);
        } else await wait(650);
        const file = path.join(OUT, `${state}-${lang}${size.tag}.png`);
        await page.screenshot({ path: file });
        if (errors.length) { failed++; console.log('ERRORS in', state, lang, errors); }
        else console.log('shot', path.relative(ROOT, file));
        await page.close();
      }
      await context.close();
    }
    await browser.close();
  } finally {
    server.kill();
  }
  if (failed) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
