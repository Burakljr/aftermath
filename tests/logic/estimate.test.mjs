// The income estimate (HUD income, offline earnings, upgrade hints) must match the
// simulated restaurant in steady state.
import { test, assert } from './harness.mjs';
import { createGame } from '../../js/game/index.js';

const CASES = [
  { lv: [1], t: 2, c: 1, v: 1 },
  { lv: [10], t: 2, c: 2, v: 1 },
  { lv: [14, 13, 7], t: 3, c: 2, v: 3 },
  { lv: [30, 19, 18, 7], t: 4, c: 3, v: 6 },
  { lv: [30, 25, 25, 12], t: 6, c: 4, v: 6 },
  { lv: [30, 25, 25, 12], t: 2, c: 4, v: 6 },
  { lv: [30, 25, 25, 12], t: 6, c: 1, v: 6 },
];

function measure(cs, loc = 0) {
  let T = 0;
  const g = createGame({ now: () => T, lang: 'en', seed: 3 });
  const st = g.state;
  if (loc) { st.complete = true; g.act({ type: 'nextLocation' }); }
  cs.lv.forEach((L, i) => { st.stations[i].open = true; st.stations[i].level = L; });
  st.tables.forEach((t, i) => { t.owned = i < cs.t; });
  st.money = 1e15;
  while (st.cooks.length < cs.c) g.act({ type: 'hire' });
  st.cookSpeed = cs.v;
  const est = g.select.incomePerSec();
  for (let i = 0; i < 60 * 20; i++) { T += 50; g.tick(0.05); }
  const e0 = st.earned;
  const n = 240;
  for (let i = 0; i < n * 20; i++) { T += 50; g.tick(0.05); }
  return { est, meas: (st.earned - e0) / n };
}

test('estimate is within 20 % of the simulated income (Village Inn)', () => {
  for (const cs of CASES) {
    const { est, meas } = measure(cs);
    const r = meas / est;
    assert(r > 0.8 && r < 1.2, `${JSON.stringify(cs)}: est ${est.toFixed(1)} vs measured ${meas.toFixed(1)}`);
  }
});

test('estimate is within 25 % of the simulated income (Harbor Tavern)', () => {
  for (const cs of [CASES[1], CASES[3], CASES[4]]) {
    const { est, meas } = measure(cs, 1);
    const r = meas / est;
    assert(r > 0.75 && r < 1.25, `${JSON.stringify(cs)}: est ${est.toFixed(1)} vs measured ${meas.toFixed(1)}`);
  }
});
