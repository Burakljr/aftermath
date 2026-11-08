// Shared helpers for the Playwright e2e scripts (ARCH 9.2): local server, iPhone 13 page, DOM rule sampler.
// The game runs with ?manual=1: no rAF loop, time moves only through window.aftermath.step(dt) (SwiftShader is slow).
const { chromium, devices } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 5173);
const BASE = `http://localhost:${PORT}/`;

async function waitServer(url, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

/** starts tools/serve.mjs on PORT unless SERVE=0 (reuse a running server) */
async function startServer() {
  let child = null;
  if (process.env.SERVE !== '0') {
    child = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.mjs')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  }
  if (!(await waitServer(BASE))) throw new Error(`server not reachable on ${BASE}`);
  return { stop: () => { if (child) child.kill(); } };
}

async function newBrowser() {
  return chromium.launch();
}

/** iPhone 13 profile at the standalone height 390 x 844; DPR 1 for speed unless dpr is given */
async function newPage(browser, { dpr = 1 } = {}) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return { ctx, page, errors };
}

/** open the game and wait for boot (scene ready + primed); query defaults to manual time */
async function openGame(page, query = 'manual=1') {
  await page.goto(`${BASE}?${query}`);
  await afterLoad(page);
}

/** after goto / reload: wait for boot and attach the event recorder (window.__ev = [[type, payload, clock]]) */
async function afterLoad(page) {
  await page.waitForFunction(() => window.aftermath && window.aftermath.ready, null, { timeout: 60000 });
  const ok = await page.evaluate(() => window.aftermath.ready);
  if (!ok) throw new Error('boot failed');
  await page.evaluate(async () => {
    const bus = await import('/js/bus.js');
    window.__ev = [];
    for (const e of ['action', 'dispatch', 'sale', 'toast', 'sfx', 'phase', 'ftue', 'contract-done', 'tender-result', 'hit']) bus.on(e, (p) => window.__ev.push([e, p, window.aftermath.state().clock]));
  });
}

const step = (page, sec) => page.evaluate((t) => window.aftermath.step(t), sec);

/** DOM sample + DESIGN §12 rules 2-7 (in page) */
function sampleInPage() {
  // a sheet sliding out (.sheet-slot.off) is no longer the current screen state
  const vis = (el) => !!el && el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && el.getClientRects().length > 0 && !el.closest('.sheet-slot.off');
  const s = window.aftermath.state();
  const textsIn = (root) => {
    const out = [];
    if (!root) return out;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) if (w.currentNode.nodeValue.trim() && vis(w.currentNode.parentElement)) out.push(w.currentNode.nodeValue.trim());
    return out;
  };
  const all = textsIn(document.body);
  const hudTokens = [...textsIn(document.getElementById('hud')), ...textsIn(document.getElementById('objective'))].join(' ').match(/\d+(?:[.,:/]\d+)*/g) || [];
  const disabled = [...document.querySelectorAll('#ui .btn[aria-disabled="true"]')].filter(vis);
  const noReason = disabled.filter((b) => { const r = b.querySelector('.reason'); return !r || !r.textContent.trim(); }).map((b) => b.dataset.key || b.textContent.trim().slice(0, 30));
  const obj = document.querySelector('#objective .text');
  const ui = document.getElementById('ui');
  const target = [...document.querySelectorAll('[data-ftue-target]')].filter(vis).map((e) => e.dataset.key)[0] || null;
  // faded-out controls that still catch taps (opacity 0 but pointer-events on): they would swallow taps meant for what is below
  // (elements inside a running CSS animation / transition are mid-fade and skipped)
  const moving = new Set(document.getAnimations().filter((x) => x.playState === 'running' && x.effect && x.effect.target).map((x) => x.effect.target));
  const still = (el) => { for (let e = el; e && e.id !== 'ui'; e = e.parentElement) if (moving.has(e)) return false; return true; };
  const ghosts = [...document.querySelectorAll('#ui button, #ui .card, #ui .btn')].filter((el) => still(el) && el.checkVisibility({ visibilityProperty: true }) && el.getClientRects().length > 0
    && !el.checkVisibility({ opacityProperty: true }) && getComputedStyle(el).pointerEvents !== 'none' && !el.closest('.sheet-slot.off')
    && (() => { const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return top && el.contains(top); })())
    .map((el) => el.className.split(' ')[0] || el.tagName);
  return {
    ghosts,
    phase: s.phase, ftue: s.progress.ftue, clock: s.clock, money: s.money, timer: s.timer, result: !!s.result,
    contractNo: s.progress.contractNo, goal: s.progress.goal,
    title: !!document.querySelector('.title-wrap.on'),
    notice: vis(document.querySelector('.notice.on .notice-card')),
    sheet: ui.dataset.sheet || '',
    target,
    objective: obj ? obj.textContent.trim() : '',
    hudTokens,
    primaries: [...document.querySelectorAll('#ui .btn.primary')].filter(vis).map((b) => b.dataset.key || b.textContent.trim().slice(0, 24)),
    noReason,
    bang: all.filter((t) => t.includes('!')),
    emoji: all.filter((t) => /\p{Extended_Pictographic}/u.test(t)),
  };
}

/** DESIGN 12 items 2, 3, 4, 5, 6, 7 on one sample; returns problem strings */
function ruleProblems(st, where) {
  const p = [];
  if (st.phase !== 'attack' && !st.title && !st.objective) p.push(`[12.2] empty objective at ${where}`);
  if (st.emoji.length) p.push(`[12.3] emoji at ${where}: ${st.emoji.join(' / ')}`);
  if (st.bang.length) p.push(`[12.4] "!" at ${where}: ${st.bang.join(' / ')}`);
  if (st.hudTokens.length > 3) p.push(`[12.5] ${st.hudTokens.length} HUD numbers at ${where}: ${st.hudTokens.join(' ')}`);
  if (st.noReason.length) p.push(`[12.6] disabled without reason at ${where}: ${st.noReason.join(', ')}`);
  if (st.ghosts.length) p.push(`invisible controls catch taps at ${where}: ${st.ghosts.join(', ')}`);
  if (st.primaries.length > 1) p.push(`[12.7] ${st.primaries.length} primaries at ${where}: ${st.primaries.join(', ')}`);
  return p;
}

const sample = (page) => page.evaluate(sampleInPage);

/** tap the middle of the canvas area above the bottom panel (skips the attack) */
async function tapCanvas(page, x = 195, y = 330) {
  await page.mouse.click(x, y);
}

/** tap an element by data-key; returns false if it is not there / not tappable in time */
async function tapKey(page, key, { timeout = 2000, ftue = false } = {}) {
  const sel = `${ftue ? '[data-ftue-target]' : ''}[data-key="${key}"]`;
  try {
    await page.click(sel, { timeout });
    return true;
  } catch (e) {
    if (process.env.TRACE) console.log(`  tap ${key} failed: ${String(e.message).split('\n').filter((l) => /intercepts|visible|stable|waiting for/.test(l)).slice(-2).join(' | ')}`);
    return false;
  }
}

function report(name, problems, extra = '') {
  const uniq = [...new Set(problems)];
  if (extra) console.log(extra);
  console.log(uniq.length ? `${name}: FAIL\n  ${uniq.join('\n  ')}` : `${name}: ok`);
  return uniq.length === 0;
}

module.exports = { ROOT, PORT, BASE, startServer, newBrowser, newPage, openGame, afterLoad, step, sample, sampleInPage, ruleProblems, tapCanvas, tapKey, report };
