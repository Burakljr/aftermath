// A bot that plays like an attentive human: collects goals, opens the next
// station when it can (saving up for it when it is close), upgrades the most
// useful station it can afford (usually the bottleneck or a goal's station),
// and taps a boost now and then. Prints a timeline when run directly:
//   node tests/logic/bot.mjs [--lazy] [--factory=2] [--quiet]
import { createGame } from '../../js/game/index.js';
import { incomePerSec } from '../../js/game/sim.js';
import { t } from '../../js/game/i18n.js';
import { formatNumber } from '../../js/game/format.js';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// Income if station i had one more level (to rank upgrades).
function incomeAfterUpgrade(game, i) {
  const f = game.state.factory;
  const s = f.stations[i];
  s.level++;
  const v = incomePerSec(game.config(), f);
  s.level--;
  return v;
}

export function runBot(opts = {}) {
  const {
    maxTime = 3600,
    dt = 0.1,
    think = 1.0,          // seconds between decisions (jittered)
    actionsPerThink = 3,
    boostEvery = 7,       // seconds between boost bursts (0 = never)
    lazy = false,
    seed = 7,
    startFactory = 0,     // play from this factory (skips earlier ones via fast play)
    stopAfterFactory = 0, // stop when this factory index is complete
    save = null,
  } = opts;
  const rand = rng(seed);
  let simMs = 1_000_000;
  const game = createGame({ save, now: () => simMs, lang: 'en' });
  const timeline = [];
  const rewards = [];
  const marks = {};
  let time = 0;
  const log = (kind, text) => timeline.push({ t: time, kind, text });
  const reward = (kind) => rewards.push({ t: time, kind });

  game.on('upgrade', (p) => {
    reward(p.milestone ? 'milestone' : 'upgrade');
    if (marks.firstUpgrade === undefined) marks.firstUpgrade = time;
    if (p.milestone) log('milestone', `${p.station} reached level ${p.level} (speed x2)`);
  });
  game.on('open', (p) => {
    reward('open');
    marks['open:' + p.station] = time;
    log('open', `opened ${p.station}`);
  });
  game.on('goal', (p) => { reward('goal'); log('goal', `goal ${p.id} done`); });
  game.on('claim', (p) => { reward('claim'); log('claim', `collected ${p.id} (+${p.reward})`); });
  game.on('factoryComplete', (p) => {
    reward('complete');
    marks['complete:' + p.id] = time;
    log('complete', `factory ${p.id} complete`);
  });

  let nextThink = 0.4;
  let nextBoost = boostEvery || Infinity;
  let upgrades = 0;
  const factoryStartTime = { [game.state.factory.id]: 0 };
  const trace = [];
  const opens = [];
  let nextTrace = 0;

  while (time < maxTime) {
    if (time >= nextThink) {
      nextThink = time + think * (0.6 + 0.8 * rand());
      const f = game.state.factory;
      const cfg = game.config();
      for (let a = 0; a < actionsPerThink; a++) {
        // 1. collect goals
        const done = game.select.goalViews().find((g) => g.done && !g.claimed);
        if (done) { game.act({ type: 'claimGoal', id: done.id }); continue; }
        // 2. factory complete -> next factory (or stop)
        if (f !== game.state.factory) break;
        if (game.state.factory.complete) {
          if (game.state.factoryIndex >= stopAfterFactory) break;
          game.act({ type: 'nextFactory' });
          factoryStartTime[game.state.factory.id] = time;
          log('factory', `started ${game.state.factory.id}`);
          break;
        }
        // 3. open the next station
        const nextLocked = f.stations.findIndex((s) => !s.open);
        let reserve = 0;
        if (nextLocked >= 0) {
          const cost = cfg.stations[nextLocked].openCost;
          if (game.state.money >= cost) {
            const before = incomePerSec(cfg, f);
            game.act({ type: 'open', station: nextLocked });
            opens.push({ t: time, station: f.stations[nextLocked].id, before, after: incomePerSec(cfg, f) });
            continue;
          }
          const inc = incomePerSec(cfg, f);
          if (!lazy && cost <= game.state.money + inc * 12) reserve = cost;
        }
        // 4. best affordable upgrade
        const money = game.state.money - reserve;
        const base = incomePerSec(cfg, f);
        const goalStations = new Set();
        let wantAll = false;
        for (const g of game.select.goalViews()) {
          if (g.done) continue;
          if (g.type === 'level' && g.station) goalStations.add(g.station);
          if (g.type === 'allLevel') wantAll = true;
        }
        let minLevel = Infinity;
        for (const s of f.stations) if (s.open) minLevel = Math.min(minLevel, s.level);
        let best = -1;
        let bestScore = -1;
        let top = -1;
        let topScore = -1;
        let cheap = -1; // costs under 6 s of income: a human just buys it
        let cheapCost = Infinity;
        for (let i = 0; i < f.stations.length; i++) {
          const v = game.select.stationView(i);
          if (!v.open) continue;
          let score;
          if (lazy) score = 1 / v.cost; // cheapest first
          else {
            score = (incomeAfterUpgrade(game, i) - base + 1e-6) / v.cost;
            if (goalStations.has(v.id)) score *= 3;
            if (wantAll && v.level === minLevel) score *= 3;
            if (v.nextIsMilestone) score *= 1.5;
          }
          if (score > topScore) { topScore = score; top = i; }
          if (v.cost <= money && score > bestScore) { bestScore = score; best = i; }
          if (v.cost <= money && v.cost < base * 6 && (cheap < 0 || v.cost < cheapCost)) { cheap = i; cheapCost = v.cost; }
        }
        // an attentive player saves a little for a much better upgrade
        if (!lazy && top >= 0 && top !== best) {
          const tv = game.select.stationView(top);
          const wait = (tv.cost - money) / Math.max(1e-6, base);
          if (wait < 12 && topScore > 2 * bestScore) best = -1;
          // and does not waste coins on upgrades that barely help
          else if (bestScore < 0.2 * topScore) best = cheap;
        }
        if (best >= 0) {
          game.act({ type: 'upgrade', station: best });
          upgrades++;
          continue;
        }
        break;
      }
    }
    if (!lazy && boostEvery && time >= nextBoost) {
      nextBoost = time + boostEvery * (0.7 + 0.6 * rand());
      const b = game.select.bottleneck();
      if (b) for (let k = 0; k < 3; k++) game.act({ type: 'boost', station: b });
    }
    if (time >= nextTrace) {
      nextTrace += 15;
      trace.push({ t: time, income: game.select.incomePerSec(), money: game.state.money, toy: game.select.toyValue(),
        levels: game.state.factory.stations.map((s) => (s.open ? s.level : 0)).join('/'), b: game.select.bottleneck() });
    }
    game.tick(dt);
    simMs += dt * 1000;
    time = Math.round((time + dt) * 1000) / 1000;
    if (game.state.factory.complete && game.state.factoryIndex >= stopAfterFactory) {
      // let the bot notice it, then stop
      if (marks['complete:' + game.state.factory.id] !== undefined) break;
    }
  }

  // largest gap between reward moments
  let maxGap = 0;
  let gapAt = 0;
  let prev = 0;
  for (const r of rewards) {
    if (r.t - prev > maxGap) { maxGap = r.t - prev; gapAt = prev; }
    prev = r.t;
  }
  return { game, timeline, rewards, marks, time, maxGap, gapAt, upgrades, factoryStartTime, trace, opens };
}

function fmtT(s) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const lazy = process.argv.includes('--lazy');
  const quiet = process.argv.includes('--quiet');
  const two = process.argv.includes('--factory=2');
  const r = runBot({ lazy, stopAfterFactory: two ? 1 : 0, maxTime: lazy ? 7200 : 3600 });
  if (!quiet) {
    for (const e of r.timeline) {
      if (e.kind === 'milestone' || e.kind === 'open' || e.kind === 'claim' || e.kind === 'complete' || e.kind === 'factory') {
        console.log(fmtT(e.t), e.kind.padEnd(9), e.text);
      }
    }
  }
  const g = r.game;
  console.log('---');
  console.log('first upgrade at', r.marks.firstUpgrade, 's');
  for (const k of Object.keys(r.marks)) if (k !== 'firstUpgrade') console.log(k.padEnd(20), fmtT(r.marks[k]), `(${r.marks[k].toFixed(1)} s)`);
  console.log('max gap between rewards', r.maxGap.toFixed(1), 's at', fmtT(r.gapAt));
  console.log('upgrades bought', r.upgrades, 'rewards', r.rewards.length);
  console.log('levels', g.state.factory.stations.map((s) => `${s.id}:${s.level}`).join(' '));
  console.log('income', formatNumber(g.select.incomePerSec(), 'en') + '/s', 'money', formatNumber(g.state.money, 'en'));
  console.log('sold', g.state.factory.sold, t('en', 'app.title'));
}
