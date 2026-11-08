// DESIGN §12 item 8: honest odds. 10 000 seeded resolutions per cell, 9 cells × 3 setups.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setSeed } from '../../js/game/rng.js';
import { resolve, chance, cellTerms, scoreFor } from '../../js/game/tender.js';
import { debugScenario } from '../../js/game/debug.js';
import { tenderGrid } from '../../js/game/select.js';

const SETUPS = [
  { name: 'start (Güven 50 vs 45)', trust: 50, rivalTrust: 45, lossStreak: 0, rivalLosses: 0 },
  { name: 'strong, rival bold (80 vs 45)', trust: 80, rivalTrust: 45, lossStreak: 0, rivalLosses: 2 },
  { name: 'weak with pity (30 vs 60, 2 losses)', trust: 30, rivalTrust: 60, lossStreak: 2, rivalLosses: 0 },
];

test('observed win rate within ±0.02 of the shown chance; reveal always agrees with the result', () => {
  const base = debugScenario('tender');
  const N = 10000;
  let worst = 0;
  for (const st of SETUPS) {
    const s = structuredClone(base);
    s.trust = st.trust;
    s.rivalTrust = st.rivalTrust;
    s.rival.lossStreak = st.lossStreak;
    s.rival.rivalLosses = st.rivalLosses;
    s.tender.rivalBias = st.rivalLosses >= 2 ? { bid: 0.9, speed: 0.95, bold: true } : { bid: 0.98, speed: 1.05, bold: false };
    const grid = tenderGrid(s);
    const rows = [];
    for (let si = 0; si < 3; si++) {
      for (let pi = 0; pi < 3; pi++) {
        s.tender.sel = { price: pi, speed: si };
        const c = cellTerms(s.tender, pi, si);
        const shown = grid.rows[si].cells[pi].chance;
        assert.equal(shown, chance(s, c.bid, c.speed), 'grid shows the used probability');
        setSeed(1000 + si * 3 + pi);
        let wins = 0;
        let agree = 0;
        for (let i = 0; i < N; i++) {
          s.tender.reveal = null;
          const r = resolve(s);
          if (r.win) wins++;
          if ((r.you.score >= r.rival.score) === r.win) agree++;
          assert.equal(r.chance, shown);
        }
        const obs = wins / N;
        worst = Math.max(worst, Math.abs(obs - shown));
        assert.ok(Math.abs(obs - shown) <= 0.02, `${st.name} cell ${pi},${si}: shown ${shown}, observed ${obs}`);
        assert.equal(agree, N, `${st.name} cell ${pi},${si}: reveal consistent`);
        rows.push(`${grid.rows[si].label}/${grid.cols[pi]} ${Math.round(shown * 100)}→${(obs * 100).toFixed(1)}`);
      }
    }
    console.log(`  ${st.name}: ${rows.join(' · ')}`);
  }
  console.log(`  worst deviation ${(worst * 100).toFixed(2)} points`);
});

test('score formula and chance clamp (v1)', () => {
  assert.equal(scoreFor(50, 1, 1), 20 + 18 + 16);
  const s = debugScenario('tender');
  s.trust = 100;
  assert.equal(chance(s, 0.75, 0.7), 0.97);
  s.trust = 0;
  assert.equal(chance(s, 1.25, 1.4), 0.03);
});
