import { test, assert, eq } from './harness.mjs';
import { createGame, EVENTS } from '../../js/game/index.js';
import { FACTORIES } from '../../js/game/config.js';
import { upgradeCost } from '../../js/game/sim.js';

function newGame() {
  let ms = 1e6;
  const g = createGame({ now: () => ms, lang: 'en' });
  const events = [];
  for (const ev of EVENTS) g.on(ev, (p) => events.push([ev, p]));
  return { g, events, adv: (s) => { for (let i = 0; i < s * 10; i++) { g.tick(0.1); ms += 100; } } };
}

test('fresh game: stations 1-2 open, 3-4 locked, first upgrade affordable', () => {
  const { g } = newGame();
  eq(g.state.factory.stations.map((s) => s.open), [true, true, false, false]);
  assert(g.select.canAfford({ type: 'upgrade', station: 'saw' }), 'first upgrade affordable at start');
  eq(g.state.tutorial, 0);
  eq(g.select.goalViews().length, 3);
});

test('upgrade costs grow about x1.15 per level', () => {
  const sc = FACTORIES[0].stations[2];
  const r = upgradeCost(sc, 11) / upgradeCost(sc, 10);
  assert(Math.abs(r - 1.15) < 0.01, `ratio ${r}`);
});

test('upgrade: spends money, raises level, emits event, advances tutorial', () => {
  const { g, events } = newGame();
  const cost = g.select.stationView('saw').cost;
  const m = g.state.money;
  eq(g.act({ type: 'upgrade', station: 'saw' }), { ok: true });
  eq(g.state.money, m - cost);
  eq(g.state.factory.stations[0].level, 2);
  assert(events.some(([e, p]) => e === 'upgrade' && p.station === 'saw' && p.level === 2 && p.milestone === false));
  eq(g.state.tutorial, 1);
  g.state.money = 0;
  eq(g.act({ type: 'upgrade', station: 'saw' }), { ok: false, reason: 'money' });
  eq(g.act({ type: 'upgrade', station: 'paint' }), { ok: false, reason: 'locked' });
  eq(g.act({ type: 'upgrade', station: 'nope' }), { ok: false, reason: 'unknown' });
});

test('milestone at level 10 doubles speed and is flagged', () => {
  const { g, events } = newGame();
  g.state.money = 1e9;
  const t1 = g.select.stationView('assembly').time;
  for (let i = 0; i < 9; i++) g.act({ type: 'upgrade', station: 'assembly' });
  eq(g.state.factory.stations[1].level, 10);
  const t10 = g.select.stationView('assembly').time;
  assert(Math.abs(t1 / t10 - 2) < 1e-9, `speed ratio ${t1 / t10}`);
  assert(events.some(([e, p]) => e === 'upgrade' && p.level === 10 && p.milestone === true));
  const v = g.select.stationView('assembly');
  eq([v.milestone.prev, v.milestone.next, v.milestone.reached], [10, 25, 1]);
});

test('open: in order only, costs money, emits open', () => {
  const { g, events } = newGame();
  g.state.money = 1e9;
  eq(g.act({ type: 'open', station: 'wrap' }), { ok: false, reason: 'order' });
  eq(g.act({ type: 'open', station: 'paint' }), { ok: true });
  eq(g.act({ type: 'open', station: 'paint' }), { ok: false, reason: 'open' });
  assert(events.some(([e, p]) => e === 'open' && p.station === 'paint'));
  eq(g.act({ type: 'open', station: 3 }), { ok: true });
});

test('opening a station raises income when bought at the expected time', () => {
  const { g } = newGame();
  g.state.money = 1e9;
  for (let i = 0; i < 5; i++) g.act({ type: 'upgrade', station: 'saw' });
  for (let i = 0; i < 8; i++) g.act({ type: 'upgrade', station: 'assembly' });
  const before = g.select.incomePerSec();
  g.act({ type: 'open', station: 'paint' });
  assert(g.select.incomePerSec() > before * 1.2, 'paint should raise income');
  for (let i = 0; i < 15; i++) g.act({ type: 'upgrade', station: 'paint' });
  for (let i = 0; i < 12; i++) g.act({ type: 'upgrade', station: 'saw' });
  for (let i = 0; i < 12; i++) g.act({ type: 'upgrade', station: 'assembly' });
  const b2 = g.select.incomePerSec();
  g.act({ type: 'open', station: 'wrap' });
  assert(g.select.incomePerSec() > b2 * 1.1, `wrap should raise income (${b2} -> ${g.select.incomePerSec()})`);
});

test('the line sells toys for the sum of open station values', () => {
  const { g, events, adv } = newGame();
  const value = g.select.toyValue();
  eq(value, 1 + 3);
  adv(10);
  const sold = events.filter(([e]) => e === 'sold');
  assert(sold.length >= 5, `sold ${sold.length}`);
  assert(sold.every(([, p]) => p.value === value));
  assert(events.some(([e, p]) => e === 'pass' && p.from === 'saw' && p.to === 'assembly'));
  assert(events.some(([e, p]) => e === 'cycle' && p.station === 'saw'));
});

test('boost: speeds up, capped, locked stations refuse', () => {
  const { g, events } = newGame();
  eq(g.act({ type: 'boost', station: 'saw' }).ok, true);
  assert(events.some(([e]) => e === 'boost'));
  for (let i = 0; i < 5; i++) g.act({ type: 'boost', station: 'saw' });
  eq(g.state.factory.stations[0].boostT, 5);
  eq(g.act({ type: 'boost', station: 'saw' }).reason, 'max');
  eq(g.act({ type: 'boost', station: 'paint' }).reason, 'locked');
});

test('goals: done -> claim reward -> next goal shows; all claimed -> factory complete -> next factory', () => {
  const { g, events } = newGame();
  g.state.money = 1e12;
  for (let i = 0; i < 4; i++) g.act({ type: 'upgrade', station: 'saw' });
  g.tick(0.01);
  const v = g.select.goalViews()[0];
  eq([v.id, v.done], ['w1', true]);
  assert(events.some(([e, p]) => e === 'goal' && p.id === 'w1'));
  eq(g.act({ type: 'claimGoal', id: 'w2' }).reason, 'notDone');
  const m = g.state.money;
  eq(g.act({ type: 'claimGoal', id: 'w1' }).ok, true);
  eq(g.state.money, m + 20);
  eq(g.act({ type: 'claimGoal', id: 'w1' }).reason, 'claimed');
  eq(g.select.goalViews().map((x) => x.id), ['w2', 'w3', 'w4']);
  eq(g.act({ type: 'nextFactory' }).reason, 'notComplete');
  // finish everything
  g.act({ type: 'open', station: 'paint' });
  g.act({ type: 'open', station: 'wrap' });
  for (let i = 0; i < 4; i++) for (let k = 0; k < 60; k++) g.act({ type: "upgrade", station: i });
  g.state.factory.sold = 10000;
  g.tick(0.01);
  for (const goal of FACTORIES[0].goals) g.act({ type: 'claimGoal', id: goal.id });
  assert(g.state.factory.complete, 'complete');
  assert(events.some(([e, p]) => e === 'factoryComplete' && p.id === 'wood'));
  eq(g.act({ type: 'nextFactory' }).ok, true);
  eq(g.state.factory.id, 'teddy');
  eq(g.state.money, FACTORIES[1].startMoney + FACTORIES[0].completeReward);
  assert(events.some(([e, p]) => e === 'factoryStart' && p.id === 'teddy'));
  eq(g.select.goalViews()[0].id, 't1');
  eq(g.select.factory().isLast, true);
});

test('settings validate keys and values', () => {
  const { g } = newGame();
  eq(g.act({ type: 'setting', key: 'lang', value: 'tr' }).ok, true);
  eq(g.act({ type: 'setting', key: 'lang', value: 'de' }).ok, false);
  eq(g.act({ type: 'setting', key: 'quality', value: 'low' }).ok, true);
  eq(g.act({ type: 'setting', key: 'sound', value: 'yes' }).ok, false);
  eq(g.act({ type: 'setting', key: 'fps', value: true }).ok, true);
  eq(g.state.settings, { lang: 'tr', sound: true, quality: 'low', fps: true });
});

test('tutorial: upgrade -> open -> collect -> done; can be skipped', () => {
  const { g } = newGame();
  g.state.money = 1e6;
  g.act({ type: 'upgrade', station: 'saw' });
  eq(g.state.tutorial, 1);
  g.act({ type: 'open', station: 'paint' });
  eq(g.state.tutorial, 2);
  g.tick(0.01);
  const done = g.select.goalViews().find((x) => x.done);
  g.act({ type: 'claimGoal', id: done.id });
  eq(g.state.tutorial, 'done');
  const { g: g2 } = newGame();
  eq(g2.act({ type: 'tutorial', step: 'done' }).ok, true);
  eq(g2.state.tutorial, 'done');
});

test('stationView has what the card needs', () => {
  const { g } = newGame();
  const v = g.select.stationView('paint');
  for (const k of ['id', 'nameKey', 'open', 'level', 'value', 'nextValue', 'time', 'cost', 'openCost', 'canAfford', 'missing', 'canOpen', 'locked', 'milestone', 'bottleneck']) assert(k in v, `missing ${k}`);
  eq([v.open, v.canOpen, v.locked], [false, true, false]);
  eq(g.select.stationView('wrap').locked, true);
  eq(g.select.stationView(0).id, 'saw');
});
