// DESIGN §12 item 9: the fleet estimate range contains the auto-dispatch completion time in ≥ 80 % of 500 contracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setSeed, rand } from '../../js/game/rng.js';
import { newState, newVehicle } from '../../js/game/state.js';
import { tick, startContract, greedyDispatch, jobSectors, HOOKS, owned, silently } from '../../js/game/sim.js';

const PROFILES = {
  3: [[2, 2, 1], [2, 2, 2]],
  4: [[2, 2, 2], [2, 3, 2]],
  5: [[2, 3, 2], [3, 3, 2], [2, 3, 3]],
  6: [[3, 3, 3], [3, 3, 2]],
  7: [[3, 3, 3], [3, 4, 3]],
  8: [[3, 4, 3], [3, 4, 4], [4, 4, 4]],
};

function setup(i) {
  setSeed(5000 + i);
  const n = 3 + (i % 6);
  const s = newState();
  s.progress.ftue = 'done';
  s.progress.unlocked.tender = true;
  s.progress.contractNo = n - 1;
  s.stats.won = 1;
  const prof = PROFILES[n][Math.floor(rand() * PROFILES[n].length)];
  ['fire', 'debris', 'carve'].forEach((type, k) => {
    while (owned(s, type) < prof[k]) s.fleet.push(newVehicle('v' + s.nextId++, type, s.fleet.length));
  });
  if (n >= 6) s.upgrades.speed = Math.floor(rand() * 2);
  if (n >= 4 && rand() < 0.15) s.flags.mutantNext = true;
  s.timer = 0;
  return { s, n, prof };
}

test('estimate [lo, hi] contains greedy completion (0.05 s ticks, spread on) in ≥ 80 % of 500 contracts', () => {
  let inside = 0;
  let below = 0;
  let above = 0;
  const N = 500;
  const errs = [];
  silently(() => {
    for (let i = 0; i < N; i++) {
      const { s } = setup(i);
      for (let k = 0; k < 200 && s.phase !== 'tender'; k++) tick(s, 0.05);
      const est = s.tender.estimate;
      startContract(s, 'bid', s.tender.value, s.tender.baseDeadline);
      for (let k = 0; k < 40000 && !s.result; k++) {
        greedyDispatch(s, jobSectors(s), HOOKS);
        tick(s, 0.05);
      }
      const t = s.result.elapsed;
      if (t < est.lo) below++;
      else if (t > est.hi) above++;
      else inside++;
      errs.push(t / est.mid - 1);
    }
  });
  errs.sort((a, b) => a - b);
  const pct = (q) => (errs[Math.floor(q * (errs.length - 1))] * 100).toFixed(1);
  console.log(`  inside ${inside}/${N} (${(inside / N * 100).toFixed(1)} %), faster ${below}, slower ${above}; error p10 ${pct(0.1)} % p50 ${pct(0.5)} % p90 ${pct(0.9)} %`);
  assert.ok(inside / N >= 0.8, `only ${inside}/${N} inside`);
});
