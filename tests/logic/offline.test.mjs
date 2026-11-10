import { test, assert, near } from './harness.mjs';
import { createGame } from '../../js/game/index.js';
import { RULES } from '../../js/game/config.js';

function midGame() {
  let ms = 5e6;
  const g = createGame({ now: () => ms, lang: 'en' });
  g.state.money = 1e6;
  for (let i = 0; i < 20; i++) g.act({ type: 'upgrade', station: i % 2 });
  g.act({ type: 'open', station: 'paint' });
  return { g, clock: () => ms, set: (v) => (ms = v) };
}

test('offline earnings are capped at 2 hours', () => {
  const { g, clock } = midGame();
  const save = g.save();
  const income = g.select.incomePerSec();
  const later = clock() + 5 * 3600 * 1000;
  const g2 = createGame({ save, now: () => later });
  const off = g2.select.offline();
  assert(off, 'expected offline earnings');
  assert(off.seconds === RULES.offlineCap && RULES.offlineCap === 7200, `seconds ${off.seconds}`);
  near(off.amount, Math.floor(income * 7200), 1, 'amount = income x 2 h');
  const before = g2.state.money;
  assert(g2.act({ type: 'claimOffline' }).ok, 'claim works');
  near(g2.state.money, before + off.amount, 1e-6, 'money added');
  assert(g2.select.offline() === null, 'claimed once');
  assert(!g2.act({ type: 'claimOffline' }).ok, 'cannot claim twice');
});

test('short absences (under a minute) give nothing; 30 minutes gives 30 minutes', () => {
  const { g, clock } = midGame();
  const save = g.save();
  const income = g.select.incomePerSec();
  const g2 = createGame({ save, now: () => clock() + 30 * 1000 });
  assert(g2.select.offline() === null, 'no offline for 30 s');
  const g3 = createGame({ save, now: () => clock() + 30 * 60 * 1000 });
  near(g3.select.offline().amount, Math.floor(income * 1800), 1, '30 min');
});

test('a long pause while running (page hidden) also becomes offline earnings, capped', () => {
  const { g, clock, set } = midGame();
  g.tick(0.016);
  set(clock() + 3 * 3600 * 1000);
  g.tick(0.016);
  const off = g.select.offline();
  assert(off && off.seconds === 7200, 'capped pause earnings');
});

test('unclaimed offline earnings survive a save and do not exceed the cap', () => {
  const { g, clock } = midGame();
  const s1 = g.save();
  const t2 = clock() + 90 * 60 * 1000;
  const g2 = createGame({ save: s1, now: () => t2 });
  const s2 = g2.save();
  const g3 = createGame({ save: s2, now: () => t2 + 90 * 60 * 1000 });
  assert(g3.select.offline().seconds === 7200, `seconds ${g3.select.offline().seconds}`);
});
