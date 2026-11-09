// Pacing of active play, measured with the attentive-player bot.
import { test, assert } from './harness.mjs';
import { runBot } from './bot.mjs';

const SEEDS = [1, 2, 3, 4];
const runs = SEEDS.map((seed) => runBot({ seed, maxTime: 3600 }));
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

test('first upgrade within 5 s', () => {
  for (const r of runs) assert(r.marks.firstUpgrade !== undefined && r.marks.firstUpgrade <= 5, `first upgrade at ${r.marks.firstUpgrade}`);
});

test('station 3 (Paint) opens near 1 minute (40-90 s)', () => {
  for (const r of runs) {
    const t = r.marks['open:paint'];
    assert(t >= 40 && t <= 90, `paint opened at ${fmt(t)}`);
  }
});

test('station 4 (Gift Wrap) opens near 3 minutes (140-230 s)', () => {
  for (const r of runs) {
    const t = r.marks['open:wrap'];
    assert(t >= 140 && t <= 230, `wrap opened at ${fmt(t)}`);
  }
});

test('factory 1 completes in 8-12 minutes of active play', () => {
  for (const r of runs) {
    const t = r.marks['complete:wood'];
    assert(t !== undefined, 'factory 1 never completed');
    assert(t >= 480 && t <= 720, `factory 1 complete at ${fmt(t)}`);
  }
});

test('opening a station always raises income clearly (x1.15 or more)', () => {
  for (const r of runs) {
    for (const o of r.opens) assert(o.after >= o.before * 1.15, `${o.station} at ${fmt(o.t)}: ${o.before.toFixed(1)} -> ${o.after.toFixed(1)}/s`);
  }
});

test('a reward moment (upgrade, open, goal, milestone) at least every 20 s', () => {
  for (const r of runs) assert(r.maxGap <= 20, `gap of ${r.maxGap.toFixed(1)} s at ${fmt(r.gapAt)}`);
});

test('factory 2 (Teddy Bears) is reachable and completes in 6-15 minutes', () => {
  const r = runBot({ seed: 5, maxTime: 3600, stopAfterFactory: 1 });
  const a = r.marks['complete:wood'];
  const b = r.marks['complete:teddy'];
  assert(a !== undefined && b !== undefined, 'factory 2 never completed');
  assert(b - a >= 360 && b - a <= 900, `factory 2 took ${fmt(b - a)}`);
  assert(r.maxGap <= 20, `gap of ${r.maxGap.toFixed(1)} s at ${fmt(r.gapAt)}`);
});
