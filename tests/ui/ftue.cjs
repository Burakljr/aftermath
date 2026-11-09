// Plays the whole FTUE in ui-lab with real taps on the highlighted element only (ARCH §11 U2 check).
// Time is driven with lab.step() (no real clock). Checks per sample: objective text present outside the attack,
// at most one visible primary button, no "!" / emoji in the DOM. Ends with ftue 'done' and money 2417 (ARCH §3.3).
// Usage: PORT=5193 node tools/serve.mjs &  then  node tests/ui/ftue.cjs [--port 5193]
const { chromium, devices } = require('playwright');

const i = process.argv.indexOf('--port');
const PORT = i >= 0 ? process.argv[i + 1] : process.env.PORT || '5193';
const START = process.env.START || 'new';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/ui-lab.html?screen=${START}&bar=0&raf=0`);
  await page.waitForFunction(() => window.lab && window.lab.state);
  await page.evaluate(() => window.lab.live(false));
  const problems = [];
  const steps = [];
  let taps = 0;
  const MAXN = Number(process.env.MAXN || 600);
  for (let n = 0; n < MAXN; n++) {
    const st = await page.evaluate(() => {
      const s = window.lab.state;
      const vis = (el) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && el.getClientRects().length > 0;
      const texts = [];
      const w = document.createTreeWalker(document.getElementById('ui'), NodeFilter.SHOW_TEXT);
      while (w.nextNode()) if (w.currentNode.nodeValue.trim() && vis(w.currentNode.parentElement)) texts.push(w.currentNode.nodeValue);
      const obj = document.querySelector('#objective .text');
      return {
        ftue: s.progress.ftue, phase: s.phase, money: s.money, clock: s.clock,
        title: !!document.querySelector('.title-wrap.on'),
        target: [...document.querySelectorAll('[data-ftue-target]')].filter(vis).map((e) => e.dataset.key)[0] || null,
        objective: obj ? obj.textContent : '', // ARCH 9.2 #2: non-empty text (the receipt / tender sheets cover the bar on purpose)
        headline: !!document.querySelector('.headline-bar.on'),
        diag: (() => {
          const ui = document.getElementById('ui');
          const k = s.progress.ftue === 'deliver' ? 'collectPayment' : s.progress.ftue === 'carve' ? 'dispatch:carve:1' : null;
          const b = k && document.querySelector(`[data-key="${k}"]`);
          const ev = window.lab.events.filter((e) => e[0] === 'action').slice(-1)[0];
          const sub = b && b.querySelector('.dispatch__sub');
          return `sub=${sub ? sub.textContent : ''} dis=${b ? b.getAttribute('aria-disabled') : ''} last=${ev ? JSON.stringify(ev[1]) : ''} sheet=${ui.dataset.sheet} modal=${ui.classList.contains('modal-open')} notices=${s.notices.length} btn=${!!b}${b ? ` vis=${vis(b)} tgt=${b.hasAttribute('data-ftue-target')} why=${(() => { for (let e = b; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.opacity !== '1' || cs.visibility !== 'visible' || cs.display === 'none') return `${e.className}:${cs.opacity}/${cs.visibility}/${cs.display}`; } return '-'; })()}` : ''}`;
        })(),
        primaries: [...document.querySelectorAll('#ui .btn.primary')].filter(vis).length,
        bang: texts.filter((t) => t.includes('!')),
        emoji: texts.filter((t) => /\p{Extended_Pictographic}/u.test(t)),
      };
    });
    if (st.ftue === 'done') {
      steps.push(`done at clock ${st.clock.toFixed(1)} s, money ${st.money}`);
      if (Math.round(st.money) !== 2417) problems.push(`money ${st.money} != 2417`);
      break;
    }
    if (st.phase !== 'attack' && !st.objective && !st.headline && !st.title) problems.push(`no objective at ${st.ftue} t=${st.clock.toFixed(1)}`);
    if (st.primaries > 1) problems.push(`${st.primaries} primaries at ${st.ftue}`);
    if (st.bang.length || st.emoji.length) problems.push(`copy at ${st.ftue}: ${st.bang.concat(st.emoji).join(' / ')}`);
    if (steps[steps.length - 1] !== st.ftue) steps.push(st.ftue);
    if (process.env.TRACE) console.log(n, st.ftue, st.phase, st.clock.toFixed(1), st.target, st.title, st.diag);
    if (st.title) {
      await page.click('.title-wrap');
      continue;
    }
    if (st.target) {
      const sel = `[data-ftue-target][data-key="${st.target}"]`;
      try {
        await page.click(sel, { timeout: 1500 });
        taps++;
        await page.waitForTimeout(280); // sheets slide in for 220 ms
        await page.evaluate(() => window.lab.step(0.3));
      } catch (e) {
        problems.push(`could not tap ${st.target} at ${st.ftue}: ${String(e.message).split('\n').slice(0, process.env.TRACE ? 12 : 1).join(' | ')}`);
        await page.evaluate(() => window.lab.step(0.5));
      }
      continue;
    }
    await page.evaluate(() => window.lab.step(1));
  }
  const fin = await page.evaluate(() => window.lab.state.progress.ftue);
  if (fin !== 'done') problems.push(`FTUE stuck at ${fin}`);
  if (errors.length) problems.push(...errors.slice(0, 5).map((e) => `console: ${e}`));
  console.log(`steps: ${steps.join(' > ')}\ntaps: ${taps}`);
  const uniq = [...new Set(problems)];
  console.log(uniq.length ? `PROBLEMS:\n  ${uniq.join('\n  ')}` : 'FTUE playable by taps only: ok');
  await browser.close();
  process.exit(uniq.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
