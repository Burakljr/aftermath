// Shared helpers for the Playwright scripts of the real game (tests/e2e/play.cjs, tests/shots.cjs).
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// WebGL in headless Chromium: SwiftShader through ANGLE
const LAUNCH = { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };

// tools/serve.mjs on `port`, serving `root` (default: the repository)
async function startServer(port, root) {
  const env = { ...process.env, PORT: String(port) };
  if (root) env.SERVE_ROOT = root;
  const srv = spawn(process.execPath, [path.join(ROOT, 'tools/serve.mjs')], { env, stdio: 'ignore' });
  await wait(450);
  return srv;
}

// definePlayer runs INSIDE the page: await page.evaluate(definePlayer). It installs
//   window.__gameTime   seconds of game time since it was installed (counts every game.tick)
//   window.__rewards    game times of reward moments (upgrade, open, table, cook, speed, claim)
//   window.__marks      { 'open:<station>': t, 'complete:<location>': t, ... }
//   window.__play(opts) a fast-forward player like the attentive bot of tests/logic/bot.mjs:
//     collects goals at once, opens the next station when it can (saves up when it is close),
//     otherwise buys the most useful thing per coin (goals count extra), boosts a cooking
//     station every ~6 s. Time moves only through window.diner.step (deterministic).
//     opts: { seconds, until: 'money>=open' | 'goalDone' | 'complete' | 'allOpen' | null,
//             open (default true), claim (default true), h (step, default 0.1),
//             renderEvery (game seconds between drawn frames, default 5), stats (sample
//             scene.stats() on every drawn frame) }
//     returns { t, actions, maxCalls, maxTris }.
async function definePlayer() {
  const d = window.diner;
  const g = d.game;
  const base = new URL('js/game/', document.baseURI).href;
  const sim = await import(base + 'sim.js');
  const { RULES } = await import(base + 'config.js');
  if (!window.__tickHooked) {
    window.__tickHooked = true;
    window.__gameTime = 0;
    window.__rewards = [];
    window.__marks = {};
    const orig = g.tick;
    g.tick = (dt) => { if (dt > 0) window.__gameTime += Math.min(dt, 1); return orig(dt); };
    const reward = () => window.__rewards.push(window.__gameTime);
    for (const ev of ['upgrade', 'buyTable', 'hire', 'cookSpeed', 'claim']) g.on(ev, reward);
    g.on('open', (p) => { reward(); window.__marks['open:' + p.station] = window.__gameTime; });
    g.on('locationComplete', (p) => { window.__marks['complete:' + p.id] = window.__gameTime; });
    g.on('locationStart', (p) => { window.__marks['start:' + p.id] = window.__gameTime; });
  }
  const options = () => {
    const st = g.state;
    const c = g.config();
    const L = g.layout();
    const income = sim.incomeEstimate(c, L, st);
    const list = [];
    const add = (act, cost, apply, undo) => {
      if (!(cost < Infinity)) return;
      apply();
      const gain = sim.incomeEstimate(c, L, st) - income;
      undo();
      list.push({ act, cost, gain: Math.max(0, gain) });
    };
    st.stations.forEach((s, i) => {
      if (s.open) {
        if (s.level < RULES.maxLevel) add({ type: 'upgrade', station: s.id }, sim.upgradeCost(c.stations[i], s.level), () => { s.level++; }, () => { s.level--; });
      } else if (i === 0 || st.stations[i - 1].open) {
        add({ type: 'open', station: s.id }, c.stations[i].openCost, () => { s.open = true; }, () => { s.open = false; });
      }
    });
    const owned = sim.ownedTables(st);
    if (owned < st.tables.length) {
      const tb = st.tables[owned];
      add({ type: 'buyTable' }, sim.tableCost(c, owned), () => { tb.owned = true; }, () => { tb.owned = false; });
    }
    if (st.cooks.length < c.cooks.max) {
      add({ type: 'hire' }, sim.cookCost(c, st.cooks.length), () => { st.cooks.push({ id: '_', state: 'idle' }); }, () => { st.cooks.pop(); });
    }
    if (st.cookSpeed < RULES.cookSpeedMax) {
      add({ type: 'cookSpeed' }, sim.cookSpeedCost(c, st.cookSpeed), () => { st.cookSpeed++; }, () => { st.cookSpeed--; });
    }
    return { income, list };
  };
  const helpsGoal = (act) => {
    for (const v of g.select.goalViews()) {
      if (v.done) continue;
      if (act.type === 'upgrade' && v.type === 'level' && v.station === act.station) return true;
      if (act.type === 'open' && v.type === 'open' && v.station === act.station) return true;
      if (act.type === 'buyTable' && v.type === 'tables') return true;
      if (act.type === 'hire' && v.type === 'cooks') return true;
      if (act.type === 'cookSpeed' && v.type === 'cookSpeed') return true;
    }
    return false;
  };
  const nextClosed = () => g.state.stations.findIndex((s) => !s.open);

  window.__play = function play({ seconds = 60, until = null, open = true, claim = true, h = 0.1, renderEvery = 5, stats = false } = {}) {
    let t = 0;
    let think = 0;
    let boost = 3;
    let actions = 0;
    let renderT = 0;
    let maxCalls = 0;
    let maxTris = 0;
    const stop = () => {
      const st = g.state;
      if (until === 'money>=open') {
        const i = nextClosed();
        return i >= 0 && st.money >= g.config().stations[i].openCost;
      }
      if (until === 'goalDone') return g.select.goalViews().some((v) => v.done && !v.claimed);
      if (until === 'complete') return st.complete;
      if (until === 'allOpen') return nextClosed() < 0;
      return false;
    };
    const draw = () => {
      d.scene.update(g.state, 0, true);
      if (stats) {
        const s = d.scene.stats();
        if (s.calls > maxCalls) maxCalls = s.calls;
        if (s.tris > maxTris) maxTris = s.tris;
      }
    };
    while (t < seconds && !stop()) {
      if (t >= think) {
        think = t + 1;
        const st = g.state;
        if (st.complete) break;
        if (claim) for (const v of g.select.goalViews()) if (v.done && !v.claimed) { g.act({ type: 'claimGoal', id: v.id }); actions++; }
        for (let n = 0; n < 3; n++) {
          const { income, list } = options();
          if (!list.length) break;
          const money = g.state.money;
          const rate = Math.max(income, 0.01);
          const op = list.find((o) => o.act.type === 'open');
          let pick = null;
          if (op && op.cost <= money) pick = open ? op : null;
          if (!pick && op && (op.cost - money) / rate < 18) {
            // saving up for the new station: only small buys (under 4 s of income)
            for (const o of list) if (o !== op && o.cost <= money && o.cost < rate * 4 && o.gain > 0 && (!pick || o.gain / o.cost > pick.gain / pick.cost)) pick = o;
          } else if (!pick) {
            const score = (o) => (o.gain / o.cost) * (helpsGoal(o.act) ? 1.6 : 1);
            let best = null;
            let bestAff = null;
            for (const o of list) {
              if (o.act.type === 'open') continue;
              if (!best || score(o) > score(best)) best = o;
              if (o.cost <= money && (!bestAff || score(o) > score(bestAff))) bestAff = o;
            }
            if (best && best.cost > money && (best.cost - money) / rate < 20) pick = null; // save a little
            else pick = bestAff;
          }
          if (!pick) break;
          if (!g.act(pick.act).ok) break;
          actions++;
        }
      }
      if (t >= boost) {
        boost = t + 6;
        const busy = g.state.cooks.find((c) => c.state === 'cooking');
        if (busy) g.act({ type: 'boost', station: busy.station });
      }
      d.step(h, h, false);
      t += h;
      renderT += h;
      if (renderT >= renderEvery) { renderT = 0; draw(); }
    }
    draw();
    return { t, actions, maxCalls, maxTris };
  };
  return true;
}

module.exports = { ROOT, wait, LAUNCH, startServer, definePlayer };
