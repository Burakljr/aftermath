import { test, assert, eq } from './harness.mjs';
import { createGame } from '../../js/game/index.js';
import { loadState } from '../../js/game/state.js';
import { runBot } from './bot.mjs';

function clockGame(opts = {}) {
  let ms = 1_000_000;
  const now = () => ms;
  const game = createGame(Object.assign({ now, lang: 'en', seed: 4 }, opts));
  return { game, advance(sec) { ms += sec * 1000; }, now, setMs(v) { ms = v; } };
}

test('save -> load keeps the whole state, including guests and cooks in flight', () => {
  const r = runBot({ seed: 3, maxTime: 200 });
  const s1 = r.game.save();
  const g2 = createGame({ save: s1, now: () => JSON.parse(s1).lastSeen, lang: 'en' });
  const a = JSON.parse(s1);
  const b = JSON.parse(g2.save());
  b.lastSeen = a.lastSeen;
  eq(b, a, 'state after roundtrip');
  assert(a.customers.length > 0 && a.cooks.length > 1, 'there was service in flight');
});

test('a loaded game continues exactly like the original (deterministic)', () => {
  const r = runBot({ seed: 11, maxTime: 150 });
  const s = r.game.save();
  const t0 = JSON.parse(s).lastSeen;
  let m1 = t0;
  let m2 = t0;
  const g1 = createGame({ save: s, now: () => m1 });
  const g2 = createGame({ save: s, now: () => m2 });
  for (let i = 0; i < 600; i++) { m1 += 50; m2 += 50; g1.tick(0.05); g2.tick(0.05); }
  eq(JSON.parse(g1.save()), JSON.parse(g2.save()));
});

test('broken, foreign or old saves start a new game', () => {
  for (const bad of ['', 'nope', '{', '[]', 'null', '{"v":99}', JSON.stringify({ v: 1, location: 'moon', locationIndex: 0 })]) {
    const g = createGame({ save: bad, now: () => 5, lang: 'en' });
    eq(g.state.location, 'inn');
    eq(g.state.money, 25);
    assert(g.state.customers.length === 1, 'fresh game seats its first guest');
  }
});

test('tampered values are clamped; stations and tables keep their order', () => {
  const { game } = clockGame();
  const s = JSON.parse(game.save());
  s.money = -50;
  s.stations[0].level = 1e9;
  s.stations[1].open = false;
  s.stations[2].open = true;          // gap: stew open without grill
  s.tables[2].owned = false;
  s.tables[3].owned = true;           // gap in tables
  s.cookSpeed = 99;
  s.goals[0].claimed = true;          // claimed but not done
  s.settings = { lang: 'xx', sound: 'loud', quality: 'ultra', fps: 1 };
  s.tutorial = 7;
  const st = loadState(JSON.stringify(s));
  eq(st.money, 0);
  eq(st.stations[0].level, 1000);
  eq(st.stations[2].open, false);
  eq(st.tables[3].owned, false);
  eq(st.cookSpeed, 10);
  eq(st.goals[0].claimed, false);
  eq(st.settings, { lang: 'en', sound: true, quality: 'high', fps: true });
  eq(st.tutorial, 0);
});

test('inconsistent service in a save is reset (money and progress kept)', () => {
  const r = runBot({ seed: 7, maxTime: 120 });
  const s = JSON.parse(r.game.save());
  s.customers[0].seat = 'nowhere';
  const st = loadState(JSON.stringify(s));
  eq(st.customers, []);
  eq(st.orders, []);
  assert(st.cooks.every((c) => c.state === 'idle'), 'cooks idle');
  eq(st.money, s.money);
  eq(st.stations.map((x) => x.level), s.stations.map((x) => x.level));
  // and the game runs on from there
  let ms = s.lastSeen;
  const g = createGame({ save: JSON.stringify(Object.assign(s, { customers: [{ bad: 1 }] })), now: () => ms });
  for (let i = 0; i < 400; i++) { ms += 50; g.tick(0.05); }
  assert(g.state.served > s.served, 'serves again');
});

test('settings and tutorial survive a save', () => {
  const { game } = clockGame();
  game.act({ type: 'setting', key: 'lang', value: 'tr' });
  game.act({ type: 'setting', key: 'quality', value: 'low' });
  game.act({ type: 'setting', key: 'sound', value: false });
  game.act({ type: 'setting', key: 'fps', value: true });
  game.act({ type: 'tutorial', step: 'done' });
  const st = loadState(game.save());
  eq(st.settings, { lang: 'tr', sound: false, quality: 'low', fps: true });
  eq(st.tutorial, 'done');
});
