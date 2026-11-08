// E2E 1 (DESIGN §12 item 1, ARCH 9.2): in the real game (3D scene + UI + logic), a bot that only taps the currently
// highlighted element ([data-ftue-target], or the canvas to skip the cold open) completes the FTUE. Game time moves
// only through aftermath.step(). Every sample also checks DESIGN §12 items 2-7. Mid-FTUE the page is saved and
// reloaded; the same step and the half-done district must come back, and the bot finishes on the reloaded page.
// Usage: node tests/e2e/ftue.cjs   (PORT=5173 default; SERVE=0 reuses a running server; TRACE=1 prints every sample)
const L = require('./lib.cjs');

(async () => {
  const server = await L.startServer();
  const browser = await L.newBrowser();
  const { page, errors } = await L.newPage(browser);
  const problems = [];
  const steps = [];
  let taps = 0;
  let reloaded = false;
  let firstDispatch = null;
  let firstSale = null;
  let samples = 0;
  try {
    await L.openGame(page, 'manual=1&seed=7');
    // first launch: the boot veil asks for one tap (audio opens with the cold open)
    const gate = await page.evaluate(() => !!document.querySelector('#loading .loading.prompt'));
    if (!gate) problems.push('first launch shows no tap-to-start prompt');
    await page.click('#loading .loading');
    for (let n = 0; n < 500; n++) {
      const st = await L.sample(page);
      samples++;
      problems.push(...L.ruleProblems(st, `${st.ftue}/${st.phase} t=${st.clock.toFixed(1)}`));
      if (process.env.TRACE) console.log(n, st.ftue, st.phase, st.clock.toFixed(1), st.target, st.sheet, st.title ? 'title' : '', st.objective);
      if (steps[steps.length - 1] !== st.ftue) steps.push(st.ftue);
      if (firstDispatch === null) firstDispatch = await page.evaluate(() => { const e = window.__ev.find((x) => x[0] === 'dispatch'); return e ? e[2] : null; });
      if (firstSale === null) firstSale = await page.evaluate(() => { const e = window.__ev.find((x) => x[0] === 'sale'); return e ? e[2] : null; });
      if (st.ftue === 'done') break;

      // resume check: once the carve step is under way, save + reload and compare
      if (!reloaded && st.ftue === 'carve' && st.phase === 'cleanup') {
        const before = await page.evaluate(() => {
          const s = window.aftermath.state();
          return { working: s.fleet.some((v) => v.type === 'carve' && v.state !== 'yard') };
        });
        if (before.working) {
          await L.step(page, 2);
          const snap = await page.evaluate(() => {
            const s = window.aftermath.state();
            window.aftermath.save();
            return { ftue: s.progress.ftue, corpse: s.sectors[1].corpse, rubble: s.sectors[1].rubble, fire: s.sectors[1].fire, elapsed: s.contract.elapsed, money: s.money };
          });
          await page.reload();
          await L.afterLoad(page);
          const after = await page.evaluate(() => {
            const s = window.aftermath.state();
            return { ftue: s.progress.ftue, corpse: s.sectors[1].corpse, rubble: s.sectors[1].rubble, fire: s.sectors[1].fire, elapsed: s.contract && s.contract.elapsed, money: s.money, started: window.aftermath.started, prompt: !!document.querySelector('#loading .loading.prompt') };
          });
          if (after.ftue !== snap.ftue) problems.push(`reload: step ${after.ftue} != ${snap.ftue}`);
          if (Math.abs(after.corpse - snap.corpse) > 0.01 || after.rubble !== snap.rubble || after.fire !== snap.fire) problems.push(`reload: Konak changed ${JSON.stringify(snap)} -> ${JSON.stringify(after)}`);
          if (after.prompt || !after.started) problems.push('reload: tap-to-start prompt shown on a resumed game');
          reloaded = true;
          steps.push('(reload)');
          continue;
        }
      }

      if (st.phase === 'attack') {
        await L.tapCanvas(page); // DESIGN step 0: a tap anywhere skips the cold open
        await L.step(page, 0.5);
        continue;
      }
      if (st.title) {
        await page.click('.title-wrap');
        continue;
      }
      if (st.target) {
        const ok = await L.tapKey(page, st.target, { ftue: true, timeout: 2500 });
        if (ok) {
          taps++;
          await page.waitForTimeout(260); // sheets slide in for 220 ms
          await L.step(page, 0.3);
        } else {
          problems.push(`could not tap ${st.target} at ${st.ftue}`);
          await L.step(page, 0.5);
        }
        continue;
      }
      await L.step(page, 0.5);
    }
    const fin = await page.evaluate(() => {
      const s = window.aftermath.state();
      return { ftue: s.progress.ftue, money: s.money, phase: s.phase, timer: s.timer, timerMax: s.timerMax, goal: s.progress.goal, objective: (document.querySelector('#objective .text') || {}).textContent };
    });
    if (fin.ftue !== 'done') problems.push(`FTUE stuck at ${fin.ftue}`);
    else {
      if (Math.round(fin.money) !== 2417) problems.push(`money ${fin.money} != 2417`);
      if (fin.phase !== 'calm' || fin.timerMax !== 15) problems.push(`radar not 15 s after FTUE: ${fin.phase} ${fin.timerMax}`);
      if (!/Sıradaki saldırıya hazırlan/.test(fin.objective || '')) problems.push(`objective after FTUE: "${fin.objective}"`);
    }
    if (!reloaded) problems.push('reload check did not run');
    if (firstDispatch === null || firstDispatch > 15) problems.push(`[12.1] first dispatch at game time ${firstDispatch} s (> 15 s)`);
    if (firstSale === null || firstSale > 90) problems.push(`[12.1] first sale at game time ${firstSale} s (> 90 s)`);
  } catch (e) {
    problems.push(`crash: ${e.message}`);
  }
  problems.push(...errors.slice(0, 5));
  const ok = L.report('e2e ftue', problems, `steps: ${steps.join(' > ')}\ntaps: ${taps}, samples: ${samples}, first dispatch at ${firstDispatch} s, first sale at ${firstSale} s (game clock)`);
  await browser.close();
  server.stop();
  process.exit(ok ? 0 : 1);
})();
