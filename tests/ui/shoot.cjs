// UI lab screenshots + DOM rules (ARCH §9.2 rules 3-7 on every ui-lab screen).
// Usage: PORT=5193 node tools/serve.mjs &  then  node tests/ui/shoot.cjs [filter] [--port 5193] [--out dir]
// Viewport: iPhone 13 profile at the PWA standalone height (390 x 844, DPR 3, insets 47 / 34 faked by the lab).
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const PORT = opt('--port', process.env.PORT || '5193');
const OUT = opt('--out', '/tmp/claude-0/-home-user-aftermath/a2b2bb86-d226-5b76-8c09-c4a191c5ba8d/scratchpad/v2/ui');
const filter = args.find((a, k) => !a.startsWith('--') && args[k - 1] !== '--port' && args[k - 1] !== '--out');
const NO_SHOTS = args.includes('--no-shots');
const RM = args.includes('--rm') ? '&rm=1' : ''; // reduced motion: every state must be final without waiting
const WAIT = { 'tender-reveal': 2400, receipt: 1500, 'receipt-ftue': 1500, title: 1200, 'attack-first': 700 };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${PORT}/ui-lab.html?screen=calm&bar=0`);
  await page.waitForFunction(() => window.lab && document.fonts.status === 'loaded');
  const screens = (await page.evaluate(() => window.lab.screens)).filter((s) => !filter || s.includes(filter));
  const report = [];
  let hard = 0;
  for (const name of screens) {
    errors.length = 0;
    await page.goto(`http://localhost:${PORT}/ui-lab.html?screen=${name}&bar=0${RM}`);
    await page.waitForFunction(() => window.lab && document.fonts.status === 'loaded');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(RM ? 150 : WAIT[name] || 650);
    const r = await page.evaluate(() => {
      const root = document.getElementById('ui');
      const W = innerWidth;
      const vis = (el) => el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && el.getClientRects().length > 0 : !!el.offsetParent;
      const texts = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (!n.nodeValue.trim()) continue;
        if (!vis(n.parentElement)) continue;
        texts.push(n.nodeValue.trim());
      }
      const all = texts.join(' | ');
      const emoji = texts.filter((t) => /\p{Extended_Pictographic}/u.test(t));
      const bang = texts.filter((t) => t.includes('!'));
      const primaries = [...root.querySelectorAll('.btn.primary')].filter(vis).map((b) => b.textContent.trim().slice(0, 40));
      const noReason = [...root.querySelectorAll('.btn[aria-disabled="true"]')].filter(vis).filter((b) => {
        const rs = b.querySelector('.reason');
        return !rs || !rs.textContent.trim();
      }).map((b) => b.textContent.trim().slice(0, 40));
      const hudText = ['hud', 'objective'].map((id) => {
        const el = document.getElementById(id);
        const out = [];
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) if (w.currentNode.nodeValue.trim() && vis(w.currentNode.parentElement)) out.push(w.currentNode.nodeValue);
        return out.join(' ');
      }).join(' ');
      const tokens = hudText.match(/\d+(?:[.,:/]\d+)*/g) || [];
      // overflow / truncation warnings
      const warn = [];
      for (const el of root.querySelectorAll('*')) {
        if (!(el instanceof HTMLElement) || !vis(el)) continue;
        if (el.closest('.wanchor, .vtag, .bc-track, .float, .lab-hl')) continue;
        const r = el.getBoundingClientRect();
        if (r.width && (r.right > W + 1 || r.left < -1) && !el.closest('.sheet-slot.off')) warn.push(`outside ${el.className || el.tagName}: ${Math.round(r.left)}..${Math.round(r.right)}`);
        const cs = getComputedStyle(el);
        if (el.childNodes.length && [...el.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim()) && el.scrollWidth > el.clientWidth + 1 && (cs.overflow === 'hidden' || cs.textOverflow === 'ellipsis')) {
          warn.push(`truncated ${el.className}: "${el.textContent.trim().slice(0, 50)}"`);
        }
      }
      const glyphs = 'İĞŞÇÖÜığşçöü₺';
      const fonts = {
        archivo: [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Archivo' && f.status === 'loaded'),
        shoulders: [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Big Shoulders Display' && f.status === 'loaded'),
        checkA: document.fonts.check(`600 16px Archivo`, glyphs),
        checkB: document.fonts.check(`800 16px "Big Shoulders Display"`, glyphs),
      };
      return { emoji, bang, primaries, noReason, tokens, hudText: hudText.trim().slice(0, 120), warn: warn.slice(0, 12), fonts, chars: all.length };
    });
    const fails = [];
    if (r.emoji.length) fails.push(`emoji: ${r.emoji.join(' / ')}`);
    if (r.bang.length) fails.push(`"!": ${r.bang.join(' / ')}`);
    if (r.primaries.length > 1) fails.push(`primary x${r.primaries.length}: ${r.primaries.join(' / ')}`);
    if (r.noReason.length) fails.push(`disabled without reason: ${r.noReason.join(' / ')}`);
    if (r.tokens.length > 3) fails.push(`HUD numbers ${r.tokens.length}: ${r.tokens.join(' ')}`);
    if (errors.length) fails.push(`console: ${errors.slice(0, 3).join(' / ')}`);
    if (!r.fonts.checkA || !r.fonts.checkB) fails.push(`fonts: ${JSON.stringify(r.fonts)}`);
    hard += fails.length;
    if (!NO_SHOTS) await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    report.push({ name, fails, warn: r.warn, hud: r.hudText, primaries: r.primaries });
    console.log(`${fails.length ? 'FAIL' : 'ok  '} ${name.padEnd(16)} primary=${r.primaries.length} hudNums=${r.tokens.length}${fails.length ? `\n     ${fails.join('\n     ')}` : ''}${r.warn.length ? `\n     warn: ${r.warn.join('\n     warn: ')}` : ''}`);
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  await browser.close();
  console.log(`\n${screens.length} screens, ${hard} hard failures. Shots in ${OUT}`);
  process.exit(hard ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
