import test from 'node:test';
import assert from 'node:assert/strict';
import { on } from '../../js/bus.js';
import { GOALS, checkGoals } from '../../js/game/goals.js';
import { GOAL_IDS } from '../../js/game/data.js';
import { debugScenario, debugUnlockAll } from '../../js/game/debug.js';
import { newState } from '../../js/game/state.js';
import { objective } from '../../js/game/select.js';
import { playBot } from './bot.mjs';

test('scripted play reaches G1 -> G15 in order; each unlock fires once', () => {
  const unlocks = [];
  let rec = true;
  on('unlock', (p) => rec && unlocks.push(p.key));
  const r = playBot({ seed: 11, maxT: 3600, until: (s) => s.progress.goal === 'end' });
  rec = false;
  assert.deepEqual(r.goals.map((g) => g.id), GOAL_IDS);
  assert.deepEqual(r.s.progress.goalsDone, GOAL_IDS);
  assert.equal(r.s.progress.goal, 'end');
  const dup = unlocks.filter((k, i) => unlocks.indexOf(k) !== i);
  assert.deepEqual(dup, [], 'no unlock twice');
  for (const k of ['depot', 'company', 'factory', 'recipe:concrete', 'tender', 'upkeep', 'offline', 'offers', 'recipe:armor',
    'recipe:cell', 'equipment', 'line2', 'foreman', 'autoRepeat', 'recipe:relic', 'dna', 'tierCap4', 'chapter']) {
    assert.ok(unlocks.includes(k), `unlock ${k}`);
  }
  assert.equal(r.s.flags.chapterEnd, true);
  // unlock moments after the FTUE are at least 12 s apart
  for (let i = 4; i < r.goals.length; i++) assert.ok(r.goals[i].t - r.goals[i - 1].t >= 11.9, r.goals[i].id);
});

test('G4 gives Fabrika, Kemik beton and 200 bin ₺', () => {
  const s = debugScenario('result'); // contract #2 receipt pending; G4 counts the delivery
  const m0 = s.money;
  assert.ok(s.progress.goalsDone.includes('G4'));
  assert.ok(s.progress.unlocked.factory && s.progress.recipes.concrete);
  assert.ok(m0 >= 2417 + 200 - 1);
});

test('fallbacks: G10 after 6 contracts, G11 after 8 contracts', () => {
  const s = newState();
  s.progress.ftue = 'done';
  s.progress.goalsDone = GOAL_IDS.slice(0, 9);
  s.progress.goal = 'G10';
  s.clock = 100;
  s.stats.contracts = 5;
  checkGoals(s);
  assert.equal(s.progress.goal, 'G10');
  s.stats.contracts = 6;
  checkGoals(s);
  assert.equal(s.progress.goal, 'G11');
  s.clock += 20;
  s.stats.contracts = 7;
  checkGoals(s);
  assert.equal(s.progress.goal, 'G11', 'only 1 carver');
  s.stats.contracts = 8;
  checkGoals(s);
  assert.equal(s.progress.goal, 'G12');
});

test('G9 and G10 count from the moment they become current', () => {
  const s = newState();
  s.progress.ftue = 'done';
  s.progress.goalsDone = GOAL_IDS.slice(0, 8);
  s.progress.goal = 'G9';
  s.stats.offerSold = 9;
  s.stats.gold = 2;
  s.progress.goalBase = { offerSold: 9, gold: 2 };
  s.clock = 100;
  checkGoals(s);
  assert.equal(s.progress.goal, 'G9');
  assert.equal(objective(s).progress.text, '0/5 parça');
  s.stats.offerSold = 14;
  checkGoals(s);
  assert.equal(s.progress.goal, 'G10');
  s.clock += 20;
  checkGoals(s);
  assert.equal(s.progress.goal, 'G10', 'old gold finishes do not count');
  s.stats.gold = 3;
  checkGoals(s);
  assert.equal(s.progress.goal, 'G11');
});

test('goal table matches DESIGN §4 copy and order', () => {
  assert.deepEqual(GOALS.map((g) => g.id), GOAL_IDS);
  assert.equal(GOALS[1].text, 'Parçaları sat');
  assert.equal(GOALS[5].text, "Süpürge Holding'i bir ihalede yen");
  assert.equal(GOALS[13].text, "Güveni 80'e çıkar");
  const s = debugUnlockAll(newState());
  assert.equal(s.progress.goal, 'G15');
  assert.ok(Object.values(s.progress.unlocked).every(Boolean));
  assert.equal(objective(s).text, 'Altı bölgenin bakımını da üstlen');
});
