// The restaurant service follows the shared contract (docs/ARCH.md).
import { test, assert, eq, near } from './harness.mjs';
import { createGame } from '../../js/game/index.js';
import { RULES } from '../../js/game/config.js';
import { cookWalkSpeed } from '../../js/game/sim.js';
import { runBot } from './bot.mjs';

function busyGame(seed = 5) {
  let ms = 1_000_000;
  const g = createGame({ now: () => ms, lang: 'en', seed });
  const s = g.state;
  s.money = 1e15;
  for (let i = 0; i < 4; i++) g.act({ type: 'open', station: i });
  for (let i = 0; i < 4; i++) g.act({ type: 'buyTable' });
  while (s.cooks.length < 4) g.act({ type: 'hire' });
  g.step = (sec, fn) => { const n = Math.round(sec / 0.05); for (let i = 0; i < n; i++) { ms += 50; g.tick(0.05); if (fn) fn(); } };
  return g;
}

test('guests go enter -> toSeat -> waiting -> eating -> paying -> leaving, in order', () => {
  const g = busyGame();
  const seen = {};
  const NEXT = { enter: ['toSeat'], toSeat: ['waiting'], waiting: ['eating'], eating: ['paying'], paying: ['leaving'], leaving: [] };
  g.step(240, () => {
    for (const c of g.state.customers) {
      const prev = seen[c.id];
      if (prev && prev !== c.state) assert(NEXT[prev].includes(c.state), `${c.id}: ${prev} -> ${c.state}`);
      seen[c.id] = c.state;
    }
  });
  assert(Object.keys(seen).length > 30, 'many guests');
});

test('cooks go idle -> toStation -> cooking -> toTable -> serving -> (toStation | return) -> idle', () => {
  const g = busyGame();
  const NEXT = {
    idle: ['toStation'], toStation: ['cooking'], cooking: ['toTable'], toTable: ['serving'],
    serving: ['toStation', 'return', 'idle'], return: ['idle', 'toStation'], // return -> idle -> toStation can happen in one tick
  };
  const seen = {};
  g.step(240, () => {
    for (const c of g.state.cooks) {
      assert(c.state !== 'free', 'free is internal only');
      const prev = seen[c.id];
      if (prev && prev !== c.state) assert(NEXT[prev].includes(c.state), `${c.id}: ${prev} -> ${c.state}`);
      seen[c.id] = c.state;
    }
  });
});

test('walk durations are pathLength / speed (scene and logic agree)', () => {
  const g = busyGame();
  const L = g.layout();
  let checked = 0;
  g.step(60, () => {
    const vc = L.speeds.customer;
    const vk = cookWalkSpeed(L, g.state.cookSpeed);
    for (const c of g.state.customers) {
      if (c.from !== c.to && c.state !== 'waiting') { near(c.dur, L.pathLength(c.from, c.to) / vc, 1e-9, c.id); checked++; }
    }
    for (const k of g.state.cooks) {
      if (['toStation', 'toTable', 'return'].includes(k.state)) { near(k.dur, L.pathLength(k.from, k.to) / vk, 1e-6, k.id); checked++; }
      assert(k.t <= k.dur + 1e-9, 't <= dur');
    }
  });
  assert(checked > 100, 'checked ' + checked);
});

test('at most two cooks per station (main + helper spot), one guest per seat, no guest waits forever', () => {
  const g = busyGame();
  const L = g.layout();
  const waitingSince = {};
  let maxOnScreen = 0;
  let helped = 0;
  g.step(300, () => {
    const s = g.state;
    const at = {};
    for (const k of s.cooks) {
      if (k.state === 'toStation' || k.state === 'cooking') {
        const key = k.station + ':' + k.slot;
        assert(!at[key], 'two cooks on the same spot of ' + k.station);
        at[key] = k.id;
        const ls = L.stations.find((x) => x.id === k.station);
        eq(k.to, k.slot ? ls.helperNode : ls.node, 'cook walks to his spot');
        if (k.slot) helped++;
      }
    }
    const seats = {};
    for (const c of s.customers) {
      if (c.state === 'leaving') continue;
      assert(!seats[c.seat], 'two guests on ' + c.seat);
      seats[c.seat] = c.id;
      if (c.state === 'waiting') {
        if (waitingSince[c.id] === undefined) waitingSince[c.id] = s.playTime;
        assert(s.playTime - waitingSince[c.id] < 120, c.id + ' waits too long');
      }
    }
    let seated = 0;
    for (const c of s.customers) if (c.state !== 'leaving') seated++;
    assert(seated <= 12, 'never more guests than seats');
    maxOnScreen = Math.max(maxOnScreen, s.customers.length);
  });
  assert(helped > 0, 'a second cook helps at a busy station');
});

test('guests wait about 10 s for their food in normal play, never very long', () => {
  for (const seed of [3, 7]) {
    const r = runBot({ seed, maxTime: 700 });
    const ws = r.waits.map((x) => x.w).sort((a, b) => a - b);
    const median = ws[ws.length >> 1];
    assert(median < 15, 'median wait ' + median.toFixed(1));
    assert(ws[ws.length - 1] < 45, 'longest wait ' + ws[ws.length - 1].toFixed(1));
  }
});

test('events carry the contract payloads and coins come from pay', () => {
  const g = busyGame();
  const log = [];
  for (const e of ['arrive', 'order', 'cookStart', 'cookDone', 'serve', 'pay', 'leave']) g.on(e, (p) => log.push([e, p]));
  const m0 = g.state.money;
  let paid = 0;
  g.on('pay', (p) => { paid += p.value; });
  g.step(60);
  const kinds = new Set(log.map((x) => x[0]));
  for (const e of ['arrive', 'order', 'cookStart', 'cookDone', 'serve', 'pay', 'leave']) assert(kinds.has(e), 'saw ' + e);
  for (const [e, p] of log) {
    if (e === 'order') assert(p.customer && p.dish, 'order payload');
    if (e === 'cookStart') assert(p.cook && p.station, 'cookStart payload');
    if (e === 'serve') assert(p.customer && p.dish, 'serve payload');
    if (e === 'pay') assert(p.customer && p.value > 0, 'pay payload');
  }
  near(g.state.money - m0, paid, 1e-6);
});

test('the newest station is ordered most often', () => {
  const g = busyGame(8);
  const n = {};
  g.on('order', (p) => { n[p.dish] = (n[p.dish] || 0) + 1; });
  g.step(400);
  assert(n.dinner > n.juice && n.dinner > n.burger && n.dinner > n.stew, JSON.stringify(n));
});

test('a station boost makes cooking there twice as fast', () => {
  let ms = 0;
  const g = createGame({ now: () => ms, lang: 'en', seed: 1 });
  let start = null;
  let done = null;
  g.on('cookStart', () => { start = g.state.playTime; g.act({ type: 'boost', station: 'juice' }); g.act({ type: 'boost', station: 'juice' }); });
  g.on('cookDone', () => { if (done === null) done = g.state.playTime; });
  for (let i = 0; i < 400 && done === null; i++) { ms += 50; g.tick(0.05); }
  near(done - start, 2.0 / RULES.boostMult, 0.06);
});
