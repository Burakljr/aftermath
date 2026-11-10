// A careless player still finishes; location 2 is playable after location 1.
import { test, assert } from './harness.mjs';
import { runBot } from './bot.mjs';

test('careless bot (cheapest buys, late goals, no boosts) finishes the Village Inn', () => {
  const r = runBot({ lazy: true, seed: 5, maxTime: 3600 });
  const t = r.marks['complete:inn'];
  assert(t !== undefined, 'never completed');
  assert(t < 50 * 60, 'took ' + (t / 60).toFixed(1) + ' min');
});

test('attentive bot plays on into the Harbor Tavern and completes it too', () => {
  const r = runBot({ seed: 7, maxTime: 3600, playLocations: 2 });
  assert(r.marks['complete:inn'] !== undefined, 'inn');
  assert(r.marks['complete:harbor'] !== undefined, 'harbor');
  assert(r.marks['complete:harbor'] < 16 * 60, 'harbor took ' + (r.marks['complete:harbor'] / 60).toFixed(1) + ' min');
  assert(r.marks['open:roast'] !== undefined, 'roast oven opened');
});

test('a player who never buys anything still earns (no dead start)', () => {
  const r = runBot({ seed: 9, maxTime: 120, actionsPerThink: 0, boostEvery: 0 });
  assert(r.game.state.served >= 8, 'served ' + r.game.state.served);
  assert(r.game.state.money > 25, 'money ' + r.game.state.money);
});
