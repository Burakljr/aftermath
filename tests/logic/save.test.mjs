import { test, assert, eq } from './harness.mjs';
import { createGame } from '../../js/game/index.js';
import { runBot } from './bot.mjs';

test('save/load roundtrip keeps the whole state', () => {
  const r = runBot({ seed: 3, maxTime: 200 });
  const g = r.game;
  g.act({ type: 'setting', key: 'lang', value: 'tr' });
  g.act({ type: 'setting', key: 'quality', value: 'low' });
  const s1 = g.save();
  const t = JSON.parse(s1).lastSeen;
  const g2 = createGame({ save: s1, now: () => t });
  eq(JSON.parse(g2.save()), JSON.parse(s1), 'state after reload');
  eq(g2.state.settings, { lang: 'tr', sound: true, quality: 'low', fps: false });
});

test('save is plain JSON and contains the contract fields', () => {
  const g = createGame({ now: () => 1000, lang: 'en' });
  const s = JSON.parse(g.save());
  for (const k of ['v', 'money', 'lifetimeMoney', 'factoryIndex', 'factory', 'goals', 'settings', 'tutorial', 'lastSeen']) assert(k in s, `missing ${k}`);
  for (const k of ['id', 'open', 'level', 'progress', 'tray', 'boostT']) assert(k in s.factory.stations[0], `station missing ${k}`);
  for (const k of ['id', 'done', 'progress']) assert(k in s.goals[0], `goal missing ${k}`);
  eq(s.v, 1);
});

test('broken or foreign saves start a fresh game', () => {
  for (const bad of ['{nope', '"str"', 'null', JSON.stringify({ v: 99 }), JSON.stringify({ v: 1, factoryIndex: 'x', factory: 5 })]) {
    const g = createGame({ save: bad, now: () => 1000, lang: 'en' });
    assert(g.state.factory.stations.length === 4, 'fresh factory');
    assert(Number.isFinite(g.state.money), 'money finite');
  }
});

test('a tampered save is clamped to valid values', () => {
  const g = createGame({ now: () => 1000, lang: 'en' });
  const s = JSON.parse(g.save());
  s.factory.stations[3].open = true; // gap: station 3 closed, 4 open
  s.factory.stations[1].tray = 99;
  s.factory.stations[0].progress = 7;
  s.money = -5;
  const g2 = createGame({ save: JSON.stringify(s), now: () => 1000 });
  assert(!g2.state.factory.stations[3].open, 'open order enforced');
  assert(g2.state.factory.stations[1].tray === 3, 'tray clamped');
  assert(g2.state.factory.stations[0].progress === 1, 'progress clamped');
  assert(g2.state.money === 0, 'money clamped');
});
