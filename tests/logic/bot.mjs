// Bots that play the real game logic in fast time (no DOM).
//   attentive: collects goals at once, opens the next station when it can (saving up for it
//     when it is close), otherwise buys the most useful thing it can afford (or saves a few
//     seconds for a clearly better one), taps the busy station for a boost now and then.
//   careless (--lazy): always buys the cheapest thing, opens stations late, collects goals
//     late, never boosts, never saves.
// Prints a timeline when run directly:
//   node tests/logic/bot.mjs [--lazy] [--location=2] [--seed=N] [--quiet]
import { createGame } from '../../js/game/index.js';
import { incomeEstimate, upgradeCost, tableCost, cookCost, cookSpeedCost, ownedTables } from '../../js/game/sim.js';
import { RULES } from '../../js/game/config.js';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

// every purchase the player could make now: { act, cost, gain (income per second) }
export function options(game) {
  const st = game.state;
  const c = game.config();
  const L = game.layout();
  const base = incomeEstimate(c, L, st);
  const out = [];
  const add = (act, cost, apply, undo) => {
    if (!(cost < Infinity)) return;
    apply();
    const gain = incomeEstimate(c, L, st) - base;
    undo();
    out.push({ act, cost, gain: Math.max(0, gain) });
  };
  st.stations.forEach((s, i) => {
    if (s.open) {
      if (s.level < RULES.maxLevel) add({ type: 'upgrade', station: s.id }, upgradeCost(c.stations[i], s.level), () => { s.level++; }, () => { s.level--; });
    } else if (i === 0 || st.stations[i - 1].open) {
      add({ type: 'open', station: s.id }, c.stations[i].openCost, () => { s.open = true; }, () => { s.open = false; });
    }
  });
  const owned = ownedTables(st);
  if (owned < st.tables.length) {
    const tb = st.tables[owned];
    add({ type: 'buyTable' }, tableCost(c, owned), () => { tb.owned = true; }, () => { tb.owned = false; });
  }
  if (st.cooks.length < c.cooks.max) {
    add({ type: 'hire' }, cookCost(c, st.cooks.length), () => { st.cooks.push({ id: '_', state: 'idle' }); }, () => { st.cooks.pop(); });
  }
  if (st.cookSpeed < RULES.cookSpeedMax) {
    add({ type: 'cookSpeed' }, cookSpeedCost(c, st.cookSpeed), () => { st.cookSpeed++; }, () => { st.cookSpeed--; });
  }
  return { base, list: out };
}

// does this purchase make progress on a visible goal?
function helpsGoal(game, act) {
  for (const g of game.select.goalViews()) {
    if (g.done) continue;
    if (act.type === 'upgrade' && g.type === 'level' && g.station === act.station) return true;
    if (act.type === 'open' && g.type === 'open' && g.station === act.station) return true;
    if (act.type === 'buyTable' && g.type === 'tables') return true;
    if (act.type === 'hire' && g.type === 'cooks') return true;
    if (act.type === 'cookSpeed' && g.type === 'cookSpeed') return true;
  }
  return false;
}

export function runBot(opts = {}) {
  const {
    maxTime = 3600,
    dt = 0.1,
    think = 1.0,          // seconds between decisions (jittered)
    actionsPerThink = 3,
    boostEvery = 6,       // seconds between boost taps (0 = never)
    lazy = false,
    seed = 7,
    stopAfterLocation = -1, // stop when this location index is complete
    save = null,
    playLocations = 1,    // how many locations to play (moves on after each complete)
  } = opts;
  const rand = rng(seed);
  let simMs = 1_000_000;
  const game = createGame({ save, now: () => simMs, lang: 'en', seed });
  const timeline = [];
  const rewards = [];
  const marks = {};
  let time = 0;
  let locStart = 0;
  const log = (kind, text) => timeline.push({ t: time, kind, text });
  const reward = (kind) => rewards.push({ t: time, kind });

  game.on('upgrade', (p) => {
    reward(p.milestone ? 'milestone' : 'upgrade');
    if (marks.firstUpgrade === undefined) marks.firstUpgrade = time;
    if (p.milestone) log('milestone', `${p.station} level ${p.level} (speed x2)`);
  });
  game.on('open', (p) => { reward('open'); marks['open:' + p.station] = time - locStart; log('open', `opened ${p.station}`); });
  game.on('buyTable', (p) => { reward('table'); log('buy', `table ${p.table}`); marks['table:' + p.table] = time - locStart; });
  game.on('hire', (p) => { reward('hire'); log('buy', `hired cook ${p.cook}`); marks['hire:' + p.cook] = time - locStart; });
  game.on('cookSpeed', (p) => { reward('cookSpeed'); log('buy', `cook speed ${p.level}`); });
  game.on('goal', (p) => log('goal', `goal ${p.id} done`));
  game.on('claim', (p) => { reward('claim'); log('claim', `collected ${p.id} (+${p.reward})`); });
  game.on('pay', () => { if (marks.firstPay === undefined) marks.firstPay = time; });
  // how long guests wait for their food (order -> serve)
  const orderAt = {};
  const waits = [];
  game.on('order', (p) => { orderAt[p.customer] = time; });
  game.on('serve', (p) => { if (orderAt[p.customer] !== undefined) { waits.push({ t: time, w: time - orderAt[p.customer] }); delete orderAt[p.customer]; } });
  game.on('locationComplete', (p) => {
    reward('complete');
    marks['complete:' + p.id] = time - locStart;
    marks['completeAt:' + p.id] = time;
    log('complete', `location ${p.id} complete`);
  });

  let nextThink = 0.6;
  let nextBoost = boostEvery || Infinity;
  let played = 0;
  const trace = [];
  let nextTrace = 0;
  let pendingClaim = null; // careless: collects a goal a while after it is done

  while (time < maxTime) {
    if (time >= nextThink) {
      nextThink = time + think * (0.6 + 0.8 * rand());
      const st = game.state;
      if (st.complete) {
        played++;
        if (played >= playLocations || stopAfterLocation === st.locationIndex) break;
        const r = game.act({ type: 'nextLocation' });
        if (!r.ok) break;
        locStart = time;
        log('location', `start ${game.state.location}`);
        continue;
      }
      // goals
      for (const g of game.select.goalViews()) {
        if (!g.done || g.claimed) continue;
        if (lazy) {
          if (pendingClaim === null) pendingClaim = time + 20;
          if (time < pendingClaim) continue;
          pendingClaim = null;
        }
        game.act({ type: 'claimGoal', id: g.id });
      }
      for (let n = 0; n < actionsPerThink; n++) {
        const { base, list } = options(game);
        if (!list.length) break;
        const money = game.state.money;
        let pick = null;
        if (lazy) {
          // cheapest thing; a new station only once it costs under 40 % of the money
          const cand = list.filter((o) => o.act.type !== 'open' || o.cost <= money * 0.4 || o.cost <= 30);
          cand.sort((a, b) => a.cost - b.cost);
          if (cand.length && cand[0].cost <= money) pick = cand[0];
        } else {
          const open = list.find((o) => o.act.type === 'open');
          const rate = Math.max(base, 0.01);
          const tut = game.state.tutorial !== 'done' && time < 12 ? list.find((o) => o.act.type === 'upgrade' && o.cost <= money) : null;
          if (tut) pick = tut; // the tutorial: tap the first station, upgrade it
          else if (open && open.cost <= money) pick = open;
          else if (open && (open.cost - money) / rate < 18) {
            // saving up for the new station: only small buys (under 4 s of income)
            let cheap = null;
            for (const o of list) if (o !== open && o.cost <= money && o.cost < rate * 4 && o.gain > 0 && (!cheap || o.gain / o.cost > cheap.gain / cheap.cost)) cheap = o;
            pick = cheap;
          } else {
            // value per coin, goals count a bit extra
            const score = (o) => (o.gain / o.cost) * (helpsGoal(game, o.act) ? 1.6 : 1);
            let best = null;
            for (const o of list) if (!best || score(o) > score(best)) best = o;
            let bestAff = null;
            for (const o of list) if (o.cost <= money && (!bestAff || score(o) > score(bestAff))) bestAff = o;
            if (best && best.cost > money && (best.cost - money) / rate < 20) pick = null; // save a little
            else pick = bestAff;
          }
        }
        if (!pick) break;
        const r = game.act(pick.act);
        if (!r.ok) break;
      }
    }
    if (!lazy && boostEvery && time >= nextBoost) {
      nextBoost = time + boostEvery * (0.7 + 0.6 * rand());
      const busy = game.state.cooks.find((c) => c.state === 'cooking');
      if (busy) game.act({ type: 'boost', station: busy.station });
    }
    game.tick(dt);
    simMs += dt * 1000;
    time += dt;
    if (time >= nextTrace) {
      nextTrace += 30;
      const st = game.state;
      trace.push({
        t: time, money: st.money, income: game.select.incomePerSec(), served: st.served, loc: st.location,
        measured: (st.earned - (trace.length ? trace[trace.length - 1].earned : 0)) / 30, earned: st.earned,
        what: st.stations.map((s) => (s.open ? s.level : '-')).join('/') + ' t' + ownedTables(st) + ' c' + st.cooks.length + ' v' + st.cookSpeed,
      });
    }
  }
  // longest gap between reward moments (purchases, goal collections) in the first location
  const end = marks['complete:inn'] !== undefined ? marks['complete:inn'] : time;
  let maxGap = 0;
  let gapAt = 0;
  let prev = 0;
  for (const r of rewards) {
    if (r.t > end) break;
    if (r.t - prev > maxGap) { maxGap = r.t - prev; gapAt = prev; }
    prev = r.t;
  }
  return { game, time, timeline, rewards, marks, maxGap, gapAt, trace, waits };
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const lazy = args.includes('--lazy');
  const quiet = args.includes('--quiet');
  const seedArg = args.find((a) => a.startsWith('--seed='));
  const locArg = args.find((a) => a.startsWith('--location='));
  const playLocations = locArg ? Number(locArg.split('=')[1]) : 1;
  const r = runBot({ lazy, seed: seedArg ? Number(seedArg.split('=')[1]) : 7, playLocations, maxTime: lazy ? 7200 : 3600 });
  if (!quiet) for (const e of r.timeline) if (e.kind !== 'goal') console.log(fmt(e.t).padStart(6), e.kind.padEnd(9), e.text);
  console.log('\nmarks:', Object.fromEntries(Object.entries(r.marks).map(([k, v]) => [k, fmt(v)])));
  console.log('max gap between rewards:', r.maxGap.toFixed(1), 's at', fmt(r.gapAt));
  for (const p of r.trace) console.log(fmt(p.t).padStart(6), p.loc, 'money', Math.round(p.money), 'est/s', p.income.toFixed(1), 'measured/s', p.measured.toFixed(1), 'served', p.served, p.what);
}
