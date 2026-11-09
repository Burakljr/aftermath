// Balance sanity: a greedy player through contracts #1-#8 (DESIGN §6.3, §4 pacing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { playBot } from './bot.mjs';
import { fmtTime, fmtMoney } from '../../js/game/format.js';
import { GOAL_IDS } from '../../js/game/data.js';

function report(label, r) {
  const lines = [];
  let prev = 0;
  let worst = { d: 0, id: '' };
  for (const g of r.goals) {
    const d = g.t - prev;
    if (d > worst.d) worst = { d, id: g.id };
    prev = g.t;
  }
  lines.push(`  ${label}: chain done ${fmtTime(r.goals.length ? r.goals[r.goals.length - 1].t : 0)}, slowest goal ${worst.id} ${Math.round(worst.d)} s`);
  lines.push('  ' + r.goals.map((g) => `${g.id} ${fmtTime(g.t)}`).join(' · '));
  for (const c of r.contracts) lines.push(`    #${c.no} ${c.grade.padEnd(6)} ${fmtTime(c.elapsed)} / ${fmtTime(c.deadline)}  done at ${fmtTime(c.t)}`);
  console.log(lines.join('\n'));
  return worst;
}

test('FTUE money check (DESIGN 6.3): 1500 + 900 + 225 + 472 - 680 = 2417', () => {
  const r = playBot({ seed: 1, until: (s) => s.progress.ftue === 'done' });
  assert.equal(r.s.money, 2417);
});

test('greedy player: every goal reachable, none takes more than 6 minutes, contracts #1-#8', () => {
  for (const seed of [1, 2, 3, 4]) {
    const r = playBot({ seed, maxT: 3600, until: (s) => s.progress.goal === 'end' && s.progress.contractNo >= 8 && s.phase === 'calm' });
    assert.deepEqual(r.goals.map((g) => g.id), GOAL_IDS, `seed ${seed}: chain complete`);
    const w = report(`greedy seed ${seed}, money ${fmtMoney(r.s.money)}`, r);
    assert.ok(w.d <= 360, `seed ${seed}: ${w.id} took ${Math.round(w.d)} s`);
    assert.ok(r.s.progress.contractNo >= 8);
  }
});

test('human-paced player (1.5 s per dispatch, reading pauses): every goal within 6 minutes', () => {
  for (const seed of [1, 2]) {
    const r = playBot({ seed, human: true, maxT: 3600, until: (s) => s.progress.goal === 'end' });
    assert.deepEqual(r.goals.map((g) => g.id), GOAL_IDS);
    const w = report(`human seed ${seed}`, r);
    assert.ok(w.d <= 360, `seed ${seed}: ${w.id} took ${Math.round(w.d)} s`);
  }
});
