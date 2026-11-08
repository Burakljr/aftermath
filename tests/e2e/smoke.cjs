// E2E smoke (ARCH 9.2 "plus" list): boot without console errors on the real rAF loop; contracts #2 (direct call) and
// #3 (first tender) played by taps + aftermath.step(); save + reload mid-contract resumes; settings toggles reach audio
// prefs and the graphics key; the low quality preset works; draw calls / triangles stay inside the ARCH 5.5 budget in
// cleanup. Every sample also checks DESIGN §12 items 2-7.
// Usage: node tests/e2e/smoke.cjs   (PORT=5173 default; SERVE=0 reuses a running server; TRACE=1 prints the bot)
const L = require('./lib.cjs');

const BUDGET = { calls: 150, tris: 400000 };

/** in page: what the bot should do next (taps only; `canvas` = tap the 3D city) */
function planInPage() {
  const a = window.aftermath;
  const s = a.state();
  const g = a.game;
  const vis = (el) => !!el && el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && el.getClientRects().length > 0;
  const key = (k) => document.querySelector(`[data-key="${k}"]`);
  if (vis(document.querySelector('.title-wrap.on'))) return { click: '.title-wrap', why: 'title' };
  const nb = document.querySelector('.notice.on .notice-card .btn');
  if (vis(nb)) return { click: '.notice.on .notice-card .btn', why: 'notice' };
  if (s.phase === 'attack') return { canvas: [195, 330], why: 'skip attack' };
  if (s.phase === 'tender' && s.tender) {
    const t = s.tender;
    if (t.kind === 'call') return { key: 'acceptCall' };
    if (t.reveal) return { key: t.reveal.win ? 'startWork' : 'takeTail' };
    const bub = document.querySelector('.tbubble.on');
    if (vis(bub)) return { click: '.tbubble.on', why: 'tender bubble' };
    const conf = document.querySelector('.confirm .btn.primary');
    if (vis(conf)) return { click: '.confirm .btn.primary', why: 'confirm' };
    const grid = g.tenderGrid(s);
    let best = null;
    grid.rows.forEach((row, si) => row.cells.forEach((c, pi) => {
      const score = (c.recommended ? 10 : 0) + c.chance - (c.hatched ? 1 : 0);
      if (!best || score > best.score) best = { score, pi, si, selected: c.selected };
    }));
    if (best && !best.selected) return { key: `selectTenderCell:${best.pi}:${best.si}` };
    return { key: 'submitTender' };
  }
  if (s.phase === 'calm') {
    if (s.result) return { key: 'collectPayment' };
    // follow the calm task card when it starts a factory job or sells parts (G5 "first Kemik beton" opens the tenders)
    const task = [...document.querySelectorAll('#panel .btn.primary')].find((b) => vis(b) && /^(startJob|sellAll)/.test(b.dataset.key || ''));
    if (task && a.ui.view.tab === 'city') return { key: task.dataset.key, why: 'calm task' };
    return { wait: 1, why: 'radar' };
  }
  if (s.phase === 'cleanup' || s.phase === 'rival') {
    const ui = document.getElementById('ui');
    const sel = a.ui.view.sel;
    for (const id of g.jobSectors(s)) {
      const st = g.districtStatus(s, id);
      for (const type of ['fire', 'debris', 'carve']) {
        const b = st.buttons && st.buttons[type];
        if (!b || !b.enabled) continue;
        if (sel === id && ui.dataset.sheet === 'district') return { key: `dispatch:${type}:${id}` };
        if (sel != null && sel !== id) return { key: 'closeSheet' };
        if (vis(key(`select:${id}`))) return { key: `select:${id}` };
        const p = a.scene.project(`district:${id}`);
        return { canvas: [p.x, p.y + 24], why: `district ${id} by canvas` };
      }
    }
    if (sel != null && ui.dataset.sheet === 'district') return { key: 'closeSheet' };
    return { wait: 1, why: 'crews working' };
  }
  return { wait: 1, why: s.phase };
}

/** drive the bot until cond(state) holds in page; returns the number of taps */
async function drive(page, problems, label, condSrc, { maxIter = 700, onSample } = {}) {
  let taps = 0;
  for (let n = 0; n < maxIter; n++) {
    const done = await page.evaluate(condSrc);
    if (done) return taps;
    const st = await L.sample(page);
    problems.push(...L.ruleProblems(st, `${label} ${st.phase} t=${st.clock.toFixed(1)}`));
    if (onSample && (await onSample(st))) continue;
    const plan = await page.evaluate(planInPage);
    if (process.env.TRACE) console.log(label, n, st.phase, st.clock.toFixed(1), JSON.stringify(plan));
    if (plan.wait) {
      await L.step(page, plan.wait);
      continue;
    }
    if (plan.canvas) {
      await page.mouse.click(plan.canvas[0], plan.canvas[1]);
      taps++;
      await L.step(page, 0.3);
      continue;
    }
    const ok = plan.click ? await page.click(plan.click, { timeout: 2000 }).then(() => true, () => false) : await L.tapKey(page, plan.key);
    if (!ok) {
      problems.push(`${label}: could not tap ${plan.key || plan.click} (${st.phase})`);
      await L.step(page, 0.5);
      continue;
    }
    taps++;
    await page.waitForTimeout(240);
    await L.step(page, 0.2);
  }
  problems.push(`${label}: did not finish in ${maxIter} iterations`);
  return taps;
}

(async () => {
  const server = await L.startServer();
  const browser = await L.newBrowser();
  const problems = [];
  const notes = [];
  try {
    // ---------- A. boot on the real loop (rAF), first-launch prompt, no console errors ----------
    {
      const { page, errors, ctx } = await L.newPage(browser);
      const t0 = Date.now();
      await page.goto(L.BASE);
      const plateMs = Date.now() - t0;
      const plate = await page.evaluate(() => !!document.querySelector('#boot, #loading .loading'));
      if (!plate) problems.push('no loading plate on first paint');
      await page.waitForFunction(() => window.aftermath && window.aftermath.ready, null, { timeout: 60000 });
      const ok = await page.evaluate(() => window.aftermath.ready);
      if (!ok) problems.push('boot failed');
      await page.click('#loading .loading');
      await page.waitForFunction(() => window.aftermath.state().phase === 'attack', null, { timeout: 30000 }).catch(() => problems.push('real loop: no attack after the tap'));
      await page.waitForTimeout(1500);
      const st = await page.evaluate(() => ({ phase: window.aftermath.state().phase, t: window.aftermath.state().attack && window.aftermath.state().attack.t, fps: window.aftermath.stats().fps }));
      notes.push(`A boot: plate ${plateMs} ms, real loop attack t=${st.t && st.t.toFixed(2)}, fps ${st.fps}`);
      problems.push(...errors.map((e) => `A ${e}`));
      await ctx.close();
    }

    // ---------- B. contracts #2 and #3 by taps, save/reload mid-contract ----------
    const { page, errors, ctx } = await L.newPage(browser);
    await L.openGame(page, 'manual=1&seed=11');
    await page.evaluate(() => window.aftermath.start());
    await page.evaluate(() => window.aftermath.ftue('done'));
    let reloadDone = false;
    const reloadCheck = async (st) => {
      if (reloadDone || st.phase !== 'cleanup' || st.contractNo !== 2) return false;
      const busy = await page.evaluate(() => window.aftermath.state().sectors.some((x) => x.crews.debris > 0 || x.crews.carve > 0));
      if (!busy) return false;
      const snap = await page.evaluate(() => {
        const s = window.aftermath.state();
        window.aftermath.save();
        return { phase: s.phase, no: s.contract.no, elapsed: s.contract.elapsed, fleet: s.fleet.map((v) => `${v.id}:${v.state}:${v.sector}`).join(','), rubble: s.sectors.map((x) => Math.round(x.rubble)).join(','), money: s.money };
      });
      await page.reload();
      await L.afterLoad(page);
      const after = await page.evaluate(() => {
        const s = window.aftermath.state();
        return { phase: s.phase, no: s.contract && s.contract.no, elapsed: s.contract && s.contract.elapsed, fleet: s.fleet.map((v) => `${v.id}:${v.state}:${v.sector}`).join(','), rubble: s.sectors.map((x) => Math.round(x.rubble)).join(','), money: s.money, started: window.aftermath.started };
      });
      if (after.phase !== snap.phase || after.no !== snap.no || Math.abs(after.elapsed - snap.elapsed) > 0.01 || after.fleet !== snap.fleet || after.rubble !== snap.rubble || after.money !== snap.money) {
        problems.push(`B reload mid-contract changed state: ${JSON.stringify(snap)} -> ${JSON.stringify(after)}`);
      }
      if (!after.started) problems.push('B reload: game not running after reload');
      // budget check while the crews are out (high preset)
      const hi = await page.evaluate(() => { window.aftermath.draw(); return window.aftermath.stats(); });
      notes.push(`B cleanup high: ${hi.drawCalls} calls, ${Math.round(hi.triangles / 1000)}k tris, ${hi.vehicles} vehicles`);
      if (hi.drawCalls > BUDGET.calls || hi.triangles > BUDGET.tris) problems.push(`B budget (high): ${hi.drawCalls} calls, ${hi.triangles} tris`);
      reloadDone = true;
      notes.push(`B reload mid-contract #2 at t=${snap.elapsed.toFixed(1)} s: resumed`);
      return true;
    };
    const t2 = await drive(page, problems, '#2', () => { const s = window.aftermath.state(); return s.progress.contractNo >= 2 && s.phase === 'calm' && !s.result; }, { onSample: reloadCheck });
    if (!reloadDone) problems.push('B reload check did not run');
    const c2 = await page.evaluate(() => { const s = window.aftermath.state(); return { won: s.stats.contracts, money: s.money, clock: s.clock }; });
    notes.push(`B contract #2 done with ${t2} taps (stats.contracts ${c2.won}, money ${c2.money}, clock ${c2.clock.toFixed(0)} s)`);
    const t3 = await drive(page, problems, '#3', () => { const s = window.aftermath.state(); return s.progress.contractNo >= 3 && s.phase === 'calm' && !s.result; });
    const c3 = await page.evaluate(() => { const s = window.aftermath.state(); return { contracts: s.stats.contracts, lost: s.stats.lost, money: s.money, tenderSeen: window.__ev.some((e) => e[0] === 'tender-result') }; });
    if (!c3.tenderSeen) problems.push('B contract #3 had no tender result');
    notes.push(`B contract #3 (tender) done with ${t3} taps: contracts ${c3.contracts}, lost ${c3.lost}, money ${c3.money}`);

    // ---------- C. settings toggles ----------
    {
      const open = await L.tapKey(page, 'settings');
      await page.waitForTimeout(260);
      await L.step(page, 0.1);
      if (!open) problems.push('C settings button not tappable');
      const before = await page.evaluate(() => window.aftermath.prefs());
      await page.click('.sheet-settings button.switch[aria-label="Efektler"]');
      await page.click('.sheet-settings button.switch[aria-label="Müzik"]');
      await L.step(page, 0.1);
      const mid = await page.evaluate(() => ({ p: window.aftermath.prefs(), ls: JSON.parse(localStorage.getItem('aftermath.audio.v1') || '{}') }));
      if (mid.p.sfx !== !before.sfx || mid.p.music !== !before.music) problems.push(`C sound toggles did not flip: ${JSON.stringify(before)} -> ${JSON.stringify(mid.p)}`);
      if (mid.ls.sfx !== mid.p.sfx || mid.ls.music !== mid.p.music) problems.push('C audio prefs not stored in aftermath.audio.v1');
      await page.click('.sheet-settings .seg button:nth-child(2)'); // Düşük
      await L.step(page, 0.1);
      const low = await page.evaluate(() => ({ q: window.aftermath.quality(), gfx: JSON.parse(localStorage.getItem('aftermath.gfx.v1') || '{}'), st: (window.aftermath.draw(), window.aftermath.stats()) }));
      if (low.q !== 'low' || low.gfx.quality !== 'low' || low.st.quality !== 'low') problems.push(`C quality low not applied: ${JSON.stringify(low)}`);
      notes.push(`C low preset: ${low.st.drawCalls} calls, ${Math.round(low.st.triangles / 1000)}k tris`);
      await page.click('.sheet-settings .seg button:nth-child(1)'); // Yüksek
      await L.step(page, 0.1);
      const hi = await page.evaluate(() => ({ q: window.aftermath.quality(), gfx: JSON.parse(localStorage.getItem('aftermath.gfx.v1') || '{}') }));
      if (hi.q !== 'high' || hi.gfx.quality !== 'high') problems.push(`C quality high not applied: ${JSON.stringify(hi)}`);
      // restore sounds, close
      await page.click('.sheet-settings button.switch[aria-label="Efektler"]');
      await page.click('.sheet-settings button.switch[aria-label="Müzik"]');
      await page.click('.sheet-settings [data-key="settings"]');
      await page.waitForTimeout(260);
      await L.step(page, 0.1);
      const closed = await page.evaluate(() => !window.aftermath.ui.view.settings);
      if (!closed) problems.push('C settings did not close');
      const st = await L.sample(page);
      problems.push(...L.ruleProblems(st, 'C after settings'));
    }

    // ---------- D. low quality in a busy cleanup + budgets; offline notice on reload ----------
    {
      await page.evaluate(() => window.aftermath.scenario('cleanup'));
      await page.evaluate(() => { const a = window.aftermath; const s = a.state(); for (const id of a.game.jobSectors(s)) for (const t of ['fire', 'debris', 'carve']) for (let k = 0; k < 3; k++) a.act('dispatch', { type: t, sector: id }); });
      await L.step(page, 4);
      const hi = await page.evaluate(() => { window.aftermath.quality('high'); window.aftermath.draw(); return window.aftermath.stats(); });
      const lo = await page.evaluate(() => { window.aftermath.quality('low'); window.aftermath.draw(); return window.aftermath.stats(); });
      notes.push(`D busy cleanup: high ${hi.drawCalls} calls / ${Math.round(hi.triangles / 1000)}k tris / ${hi.vehicles} vehicles; low ${lo.drawCalls} calls / ${Math.round(lo.triangles / 1000)}k tris`);
      if (hi.drawCalls > BUDGET.calls || hi.triangles > BUDGET.tris) problems.push(`D budget (high): ${hi.drawCalls} calls, ${hi.triangles} tris`);
      if (lo.quality !== 'low' || lo.drawCalls >= hi.drawCalls) problems.push(`D low preset not lighter: ${lo.drawCalls} vs ${hi.drawCalls}`);
      await page.evaluate(() => window.aftermath.quality('high'));
      // offline income: unlocked company, 2 h away -> "Sen yokken" notice after reload
      await page.evaluate(() => window.aftermath.scenario('late'));
      await page.evaluate(() => window.aftermath.save());
      // the pagehide save of the old page would overwrite an edit made now, so age the save on the next load instead
      await page.addInitScript(() => {
        if (sessionStorage.getItem('aged')) return;
        sessionStorage.setItem('aged', '1');
        const raw = JSON.parse(localStorage.getItem('aftermath.save.v2'));
        raw.lastSave = Date.now() - 2 * 3600 * 1000;
        localStorage.setItem('aftermath.save.v2', JSON.stringify(raw));
      });
      await page.reload();
      await L.afterLoad(page);
      await L.step(page, 0.2);
      const off = await page.evaluate(() => ({ kinds: window.aftermath.state().notices.map((n) => n.kind), card: !!document.querySelector('.notice.on .notice-card') }));
      if (!off.kinds.includes('offline') || !off.card) problems.push(`D no offline notice after 2 h away: ${JSON.stringify(off)}`);
      else notes.push('D offline notice shown after 2 h away');
    }
    problems.push(...errors.map((e) => `B-D ${e}`));
    await ctx.close();
  } catch (e) {
    problems.push(`crash: ${e.stack || e.message}`);
  }
  const ok = L.report('e2e smoke', problems, notes.join('\n'));
  await browser.close();
  server.stop();
  process.exit(ok ? 0 : 1);
})();
