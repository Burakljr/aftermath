import { test, assert, eq, near } from './harness.mjs';
import { createGame } from '../../js/game/index.js';
import { RULES } from '../../js/game/config.js';
import { runBot } from './bot.mjs';

function midGame() {
  const r = runBot({ seed: 3, maxTime: 240 });
  return r.game.save();
}

test('offline earnings = average income x time away', () => {
  const s = midGame();
  const t0 = JSON.parse(s).lastSeen;
  const probe = createGame({ save: s, now: () => t0 });
  const rate = probe.select.incomePerSec();
  assert(rate > 10, 'mid game income ' + rate);
  const g = createGame({ save: s, now: () => t0 + 30 * 60 * 1000 });
  const off = g.select.offline();
  assert(off, 'offline pending');
  near(off.seconds, 1800, 1);
  near(off.amount, Math.floor(rate * 1800), 2);
  const before = g.state.money;
  eq(g.act({ type: 'claimOffline' }).ok, true);
  near(g.state.money, before + off.amount, 1e-6);
  eq(g.select.offline(), null);
  eq(g.act({ type: 'claimOffline' }).reason, 'none');
});

test('offline earnings are capped at 2 hours', () => {
  const s = midGame();
  const t0 = JSON.parse(s).lastSeen;
  const rate = createGame({ save: s, now: () => t0 }).select.incomePerSec();
  const g = createGame({ save: s, now: () => t0 + 9 * 3600 * 1000 });
  eq(g.select.offline().seconds, RULES.offlineCap);
  near(g.select.offline().amount, Math.floor(rate * RULES.offlineCap), 2);
});

test('short absences (< 60 s) give nothing; unclaimed time adds up to the cap', () => {
  const s = midGame();
  const t0 = JSON.parse(s).lastSeen;
  eq(createGame({ save: s, now: () => t0 + 30 * 1000 }).select.offline(), null);
  let ms = t0 + 3600 * 1000;
  const g = createGame({ save: s, now: () => ms });
  eq(Math.round(g.select.offline().seconds), 3600);
  const s2 = g.save(); // not collected
  ms += 3 * 3600 * 1000;
  const g2 = createGame({ save: s2, now: () => ms });
  eq(g2.select.offline().seconds, RULES.offlineCap);
});

test('a long pause while running (hidden tab) becomes offline earnings too', () => {
  const s = midGame();
  let ms = JSON.parse(s).lastSeen;
  const g = createGame({ save: s, now: () => ms });
  let got = null;
  g.on('offline', (p) => { got = p; });
  g.tick(0.05);
  ms += 10 * 60 * 1000;
  g.tick(0.05);
  assert(got && Math.round(got.seconds) === 600, 'offline event');
});
