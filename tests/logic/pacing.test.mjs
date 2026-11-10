// The attentive-player bot must hit the pacing targets of the design (see docs/ARCH.md).
import { test, assert } from './harness.mjs';
import { runBot } from './bot.mjs';

const SEEDS = [3, 7, 11, 19];
const runs = SEEDS.map((seed) => runBot({ seed, maxTime: 1800 }));
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const within = (v, lo, hi, what) => assert(v !== undefined && v >= lo && v <= hi, `${what}: ${v === undefined ? 'never' : fmt(v)} not in ${fmt(lo)}..${fmt(hi)}`);

test('first upgrade within 5 s, first coins within 12 s', () => {
  for (const r of runs) {
    within(r.marks.firstUpgrade, 0, 5, 'first upgrade');
    within(r.marks.firstPay, 0, 12, 'first pay');
  }
});

test('Grill opens about 1 min, Stew about 3 min, Oven about 6 min', () => {
  for (const r of runs) {
    within(r.marks['open:grill'], 40, 90, 'grill');
    within(r.marks['open:stew'], 150, 240, 'stew');
    within(r.marks['open:oven'], 290, 450, 'oven');
  }
});

test('Village Inn is complete in about 10-12 min', () => {
  for (const r of runs) within(r.marks['complete:inn'], 9 * 60, 13 * 60, 'complete');
});

test('a reward moment (purchase or goal) every 10-20 s; never a long wait', () => {
  for (const r of runs) {
    const end = r.marks['complete:inn'];
    const gaps = [];
    let prev = 0;
    for (const e of r.rewards) { if (e.t > end) break; gaps.push(e.t - prev); prev = e.t; }
    gaps.sort((a, b) => a - b);
    const p90 = gaps[Math.floor(gaps.length * 0.9)];
    assert(p90 <= 20, `90 % of gaps should be <= 20 s, got ${p90.toFixed(1)}`);
    assert(r.maxGap <= 30, `longest gap ${r.maxGap.toFixed(1)} s at ${fmt(r.gapAt)}`);
  }
});

test('every purchase type is used: 4 cooks, 6 tables, cook speed', () => {
  for (const r of runs) {
    const s = r.game.state;
    assert(s.cooks.length === 4, 'cooks ' + s.cooks.length);
    assert(s.tables.every((t) => t.owned), 'tables');
    assert(s.cookSpeed >= 3, 'cook speed ' + s.cookSpeed);
  }
});
