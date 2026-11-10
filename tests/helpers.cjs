// Shared helpers for the Playwright scripts (tests/e2e/play.cjs, tests/shots.cjs).

// definePlayer runs INSIDE the page (page.evaluate(definePlayer)). It installs:
//   window.__gameTime   seconds of game time since the page loaded (counts every game.tick)
//   window.__play(opts) a fast-forward player that plays like an attentive person:
//     collects goals, opens the next station, buys the most useful upgrade (goal stations
//     and milestones first), saves up a little for a new station, boosts the slowest
//     station every ~7 s. Time moves through window.toy.step (deterministic).
//     opts: { seconds, until: 'money>=open' | 'goalDone' | 'complete' | null,
//             open (default true), claim (default true), h (step, default 0.1) }
//     returns { t, upgrades }.
function definePlayer() {
  const toy = window.toy;
  const g = toy.game;
  if (!window.__tickHooked) {
    window.__tickHooked = true;
    window.__gameTime = 0;
    const orig = g.tick;
    g.tick = (dt) => { if (dt > 0) window.__gameTime += Math.min(dt, 1); return orig(dt); };
  }
  window.__play = function play({ seconds = 60, until = null, open = true, claim = true, h = 0.1, renderEvery = 5 } = {}) {
    let t = 0;
    let think = 0;
    let boost = 3;
    let upgrades = 0;
    let renderT = 0;
    const stop = () => {
      const f = g.state.factory;
      if (until === 'money>=open') {
        const i = f.stations.findIndex((s) => !s.open);
        return i >= 0 && g.state.money >= g.config().stations[i].openCost;
      }
      if (until === 'goalDone') return g.select.goalViews().some((v) => v.done && !v.claimed);
      if (until === 'complete') return f.complete;
      return false;
    };
    const incomeAfter = (i) => {
      const s = g.state.factory.stations[i];
      s.level++;
      const v = g.select.incomePerSec();
      s.level--;
      return v;
    };
    while (t < seconds && !stop()) {
      if (t >= think) {
        think = t + 1;
        for (let a = 0; a < 3; a++) {
          const f = g.state.factory;
          const cfg = g.config();
          if (f.complete) break;
          if (claim) {
            const d = g.select.goalViews().find((v) => v.done && !v.claimed);
            if (d) { g.act({ type: 'claimGoal', id: d.id }); continue; }
          }
          const nl = f.stations.findIndex((s) => !s.open);
          let reserve = 0;
          if (nl >= 0) {
            const cost = cfg.stations[nl].openCost;
            if (g.state.money >= cost) {
              if (open) { g.act({ type: 'open', station: nl }); continue; }
              reserve = cost;
            } else if (cost <= g.state.money + g.select.incomePerSec() * 12) reserve = cost;
          }
          const money = g.state.money - reserve;
          const base = g.select.incomePerSec();
          const goalStations = new Set();
          let wantAll = false;
          for (const v of g.select.goalViews()) {
            if (v.done) continue;
            if (v.type === 'level' && v.station) goalStations.add(v.station);
            if (v.type === 'allLevel') wantAll = true;
          }
          let minLevel = Infinity;
          for (const s of f.stations) if (s.open) minLevel = Math.min(minLevel, s.level);
          let best = -1, bestScore = -1, top = -1, topScore = -1, cheap = -1, cheapCost = Infinity;
          for (let i = 0; i < f.stations.length; i++) {
            const v = g.select.stationView(i);
            if (!v.open) continue;
            let score = (incomeAfter(i) - base + 1e-6) / v.cost;
            if (goalStations.has(v.id)) score *= 3;
            if (wantAll && v.level === minLevel) score *= 3;
            if (v.nextIsMilestone) score *= 1.5;
            if (score > topScore) { topScore = score; top = i; }
            if (v.cost <= money && score > bestScore) { bestScore = score; best = i; }
            if (v.cost <= money && v.cost < base * 6 && (cheap < 0 || v.cost < cheapCost)) { cheap = i; cheapCost = v.cost; }
          }
          if (top >= 0 && top !== best) {
            const tv = g.select.stationView(top);
            const waitS = (tv.cost - money) / Math.max(1e-6, base);
            if (waitS < 12 && topScore > 2 * bestScore) best = -1;
            else if (bestScore < 0.2 * topScore) best = cheap;
          }
          if (best >= 0) { g.act({ type: 'upgrade', station: best }); upgrades++; continue; }
          break;
        }
      }
      if (t >= boost) {
        boost = t + 7;
        const b = g.select.bottleneck();
        if (b) for (let k = 0; k < 3; k++) g.act({ type: 'boost', station: b });
      }
      toy.step(h, h, false);
      t += h;
      renderT += h;
      if (renderT >= renderEvery) { renderT = 0; toy.scene.update(g.state, 0, true); }
    }
    toy.scene.update(g.state, 0, true);
    return { t, upgrades };
  };
  return true;
}

module.exports = { definePlayer };
