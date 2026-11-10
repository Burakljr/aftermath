import { test, assert, eq } from './harness.mjs';
import { createGame, EVENTS } from '../../js/game/index.js';
import { LOCATIONS, RULES } from '../../js/game/config.js';
import { upgradeCost } from '../../js/game/sim.js';

function game(opts) {
  let ms = 1_000_000;
  const g = createGame(Object.assign({ now: () => ms, lang: 'en', seed: 2 }, opts));
  g.advance = (sec) => { const n = Math.round(sec / 0.05); for (let i = 0; i < n; i++) { ms += 50; g.tick(0.05); } };
  return g;
}
const rich = (g) => { g.state.money = 1e15; };

test('fresh game: Village Inn, juice bar open, 2 tables, 1 cook, a first guest ordering', () => {
  const g = game();
  const s = g.state;
  eq(s.location, 'inn');
  eq(s.stations.map((x) => x.open), [true, false, false, false]);
  eq(s.tables.filter((t) => t.owned).length, 2);
  eq(s.cooks.length, 1);
  eq(s.customers.length, 1);
  eq(s.customers[0].state, 'waiting');
  eq(s.orders.length, 1);
  eq(s.money, LOCATIONS[0].startMoney);
});

test('upgrade: reasons unknown / locked / money, then ok and the cost grows x1.15', () => {
  const g = game();
  eq(g.act({ type: 'upgrade', station: 'nope' }).reason, 'unknown');
  eq(g.act({ type: 'upgrade', station: 'grill' }).reason, 'locked');
  eq(g.act({ type: 'upgrade', station: 9 }).reason, 'unknown');
  const c1 = g.select.stationView('juice').cost;
  eq(c1, LOCATIONS[0].stations[0].baseCost);
  eq(g.act({ type: 'upgrade', station: 'juice' }).ok, true);
  eq(g.state.stations[0].level, 2);
  eq(g.select.stationView('juice').cost, Math.round(c1 * RULES.costGrowth));
  g.state.money = 0;
  eq(g.act({ type: 'upgrade', station: 0 }).reason, 'money');
});

test('upgrade raises the price per dish; milestones double the cooking speed', () => {
  const g = game();
  rich(g);
  const v1 = g.select.stationView('juice');
  g.act({ type: 'upgrade', station: 'juice' });
  const v2 = g.select.stationView('juice');
  assert(v2.price > v1.price, 'price grows');
  const ms = [];
  g.on('upgrade', (p) => { if (p.milestone) ms.push(p.level); });
  while (g.state.stations[0].level < 25) g.act({ type: 'upgrade', station: 'juice' });
  eq(ms, [10, 25]);
  const v = g.select.stationView('juice');
  eq(v.time, LOCATIONS[0].stations[0].cookTime / 4);
  eq(v.milestone.next, 50);
});

test('open: in order, with money; tutorial ends', () => {
  const g = game();
  eq(g.act({ type: 'open', station: 'stew' }).reason, 'order');
  eq(g.act({ type: 'open', station: 'juice' }).reason, 'open');
  eq(g.act({ type: 'open', station: 'grill' }).reason, 'money');
  rich(g);
  eq(g.act({ type: 'open', station: 'grill' }).ok, true);
  eq(g.state.stations[1].open, true);
  eq(g.state.tutorial, 'done');
  eq(g.act({ type: 'open', station: 'stew' }).ok, true);
});

test('buy table / hire cook / cook speed: in order, capped, with money', () => {
  const g = game();
  eq(g.act({ type: 'buyTable' }).reason, 'money');
  eq(g.act({ type: 'hire' }).reason, 'money');
  rich(g);
  const tb = [];
  g.on('buyTable', (p) => tb.push(p.table));
  for (let i = 0; i < 4; i++) eq(g.act({ type: 'buyTable' }).ok, true);
  eq(tb, ['t3', 't4', 't5', 't6']);
  eq(g.act({ type: 'buyTable' }).reason, 'max');
  while (g.state.cooks.length < 4) eq(g.act({ type: 'hire' }).ok, true);
  eq(g.act({ type: 'hire' }).reason, 'max');
  eq(g.state.cooks.map((c) => c.id), ['c1', 'c2', 'c3', 'c4']);
  eq(new Set(g.state.cooks.map((c) => c.home)).size, 4, 'every cook has his own spot');
  for (let i = 1; i < RULES.cookSpeedMax; i++) eq(g.act({ type: 'cookSpeed' }).ok, true);
  eq(g.act({ type: 'cookSpeed' }).reason, 'max');
  eq(g.select.cookSpeedView().full, true);
});

test('boost: locked / ok / max', () => {
  const g = game();
  eq(g.act({ type: 'boost', station: 'grill' }).reason, 'locked');
  for (let i = 0; i < Math.ceil(RULES.boostMax / RULES.boostPerTap); i++) eq(g.act({ type: 'boost', station: 'juice' }).ok, true);
  eq(g.state.stations[0].boostT, RULES.boostMax);
  eq(g.act({ type: 'boost', station: 'juice' }).reason, 'max');
  g.advance(RULES.boostMax + 0.1);
  eq(g.state.stations[0].boostT, 0);
});

test('goals: collect only when done, once; all collected -> location complete -> next location', () => {
  const g = game();
  const first = g.select.goalViews()[0];
  eq(g.act({ type: 'claimGoal', id: first.id }).reason, 'notDone');
  eq(g.act({ type: 'claimGoal', id: 'zzz' }).reason, 'unknown');
  eq(g.act({ type: 'nextLocation' }).reason, 'notComplete');
  rich(g);
  // satisfy every goal
  for (let i = 0; i < 4; i++) g.act({ type: 'open', station: i });
  for (let i = 0; i < 4; i++) while (g.state.stations[i].level < 30) g.act({ type: 'upgrade', station: i });
  for (let i = 0; i < 4; i++) g.act({ type: 'buyTable' });
  while (g.state.cooks.length < 4) g.act({ type: 'hire' });
  for (let i = 0; i < 4; i++) g.act({ type: 'cookSpeed' });
  g.state.served = 1000;
  g.advance(0.1);
  let done = null;
  g.on('locationComplete', (p) => { done = p.id; });
  const claimed = [];
  for (let guard = 0; guard < 100 && !g.state.complete; guard++) {
    const v = g.select.goalViews().find((x) => x.done && !x.claimed);
    assert(v, 'a done goal is visible');
    const r = g.act({ type: 'claimGoal', id: v.id });
    eq(r.ok, true);
    claimed.push(v.id);
    eq(g.act({ type: 'claimGoal', id: v.id }).reason, 'claimed');
  }
  eq(claimed.length, LOCATIONS[0].goals.length);
  eq(done, 'inn');
  eq(g.select.location().stars, 3);
  let started = null;
  g.on('locationStart', (p) => { started = p.id; });
  eq(g.act({ type: 'nextLocation' }).ok, true);
  eq(started, 'harbor');
  const s = g.state;
  eq(s.location, 'harbor');
  eq(s.money, LOCATIONS[1].startMoney);
  eq(s.stations.map((x) => x.id), ['cocoa', 'veggie', 'soup', 'roast']);
  eq(s.customers.length, 1);
  eq(g.select.stationView('cocoa').price, LOCATIONS[0].stations[0].basePrice * 10);
  eq(g.select.locations().map((l) => l.status), ['done', 'current', 'soon', 'soon']);
});

test('settings / tutorial validation', () => {
  const g = game();
  eq(g.act({ type: 'setting', key: 'lang', value: 'de' }).reason, 'invalid');
  eq(g.act({ type: 'setting', key: 'sound', value: 'yes' }).reason, 'invalid');
  eq(g.act({ type: 'setting', key: 'quality', value: 'ultra' }).reason, 'invalid');
  eq(g.act({ type: 'setting', key: 'volume', value: 1 }).reason, 'invalid');
  eq(g.act({ type: 'setting', key: 'quality', value: 'low' }).ok, true);
  eq(g.act({ type: 'tutorial', step: 5 }).reason, 'invalid');
  eq(g.act({ type: 'tutorial', step: 1 }).ok, true);
  eq(g.act({ type: 'upgrade', station: 'juice' }).ok, true);
  eq(g.state.tutorial, 2, 'an upgrade moves the tutorial to "open the Grill"');
  eq(g.act(null).reason, 'unknown');
  eq(g.act({ type: 'dance' }).reason, 'unknown');
});

test('EVENTS lists the contract events', () => {
  for (const e of ['arrive', 'order', 'cookStart', 'serve', 'pay', 'leave', 'upgrade', 'open', 'buyTable', 'hire', 'goal', 'locationComplete', 'locationStart']) {
    assert(EVENTS.includes(e), e);
  }
});

test('select helpers: views are consistent with the state', () => {
  const g = game();
  const v = g.select.stationView('grill');
  eq(v.canOpen, true);
  eq(v.locked, false);
  eq(g.select.stationView('stew').locked, true);
  eq(v.openCost, LOCATIONS[0].stations[1].openCost);
  eq(g.select.tableView().owned, 2);
  eq(g.select.cookView().count, 1);
  eq(g.select.goalViews().length, 3);
  const o = g.select.orderView(g.state.customers[0].id);
  eq(o.dish, 'juice');
  assert(['waiting', 'cooking', 'coming'].includes(o.phase));
  eq(upgradeCost(LOCATIONS[0].stations[0], 1), LOCATIONS[0].stations[0].baseCost);
  const h = g.select.hints();
  assert(typeof h === 'object');
});
