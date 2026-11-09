import test from 'node:test';
import assert from 'node:assert/strict';
import { newState, load, save, wipe, hasV1Save, normalize, SAVE_KEY, V1_KEY } from '../../js/game/state.js';
import { tick } from '../../js/game/sim.js';
import { setSeed } from '../../js/game/rng.js';
import { debugFtue } from '../../js/game/ftue.js';
import { debugScenario } from '../../js/game/debug.js';
import { act } from '../../js/game/actions.js';
import { memStorage } from './helpers.mjs';


test('roundtrip deep-equal after ticks (mid-FTUE and mid-contract)', () => {
  setSeed(3);
  for (const s of [debugFtue(newState(), 'rubble'), debugScenario('cleanup'), debugScenario('late')]) {
    for (let i = 0; i < 30; i++) tick(s, 0.1);
    const st = memStorage();
    assert.equal(save(s, st), true);
    assert.ok(s.lastSave > 0);
    const back = load(st);
    assert.deepEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(s)));
  }
});

test('v1 and audio keys untouched; wipe removes only v2', () => {
  const v1 = JSON.stringify({ v: 1, money: 99 });
  const audio = JSON.stringify({ sfx: true, music: false });
  const st = memStorage({ [V1_KEY]: v1, 'aftermath.audio.v1': audio });
  assert.equal(hasV1Save(st), true);
  assert.equal(load(st), null, 'v1 is never loaded');
  const s = newState();
  save(s, st);
  assert.equal(st.getItem(V1_KEY), v1);
  assert.equal(st.getItem('aftermath.audio.v1'), audio);
  const fresh = wipe(st);
  assert.equal(st.getItem(SAVE_KEY), null);
  assert.equal(st.getItem(V1_KEY), v1);
  assert.equal(st.getItem('aftermath.audio.v1'), audio);
  assert.equal(fresh.v, 2);
  assert.equal(hasV1Save(memStorage()), false);
});

test('v1 notice flag set on ack', () => {
  const s = newState();
  s.notices.push({ kind: 'v1', data: {} });
  for (let i = 0; i < 10; i++) tick(s, 0.1); // cold open
  const r = act(s, 'ackNotice');
  assert.equal(r.ok, true);
  assert.equal(s.flags.v1Notice, true);
});

test('corrupt JSON, wrong version, missing storage -> null; save never throws', () => {
  assert.equal(load(memStorage({ [SAVE_KEY]: '{not json' })), null);
  assert.equal(load(memStorage({ [SAVE_KEY]: JSON.stringify({ v: 1 }) })), null);
  assert.equal(load(null), null);
  const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('quota'); }, removeItem() {} };
  assert.equal(save(newState(), bad), false);
  assert.equal(load(bad), null);
});

test('mid-attack save resumes at the impact (or the end once hit)', () => {
  const s = debugScenario('attack');
  assert.equal(s.phase, 'attack');
  const st = memStorage();
  save(s, st);
  const b = load(st);
  assert.ok(b.attack.t >= 2.6);
  tick(b, 0.05);
  assert.equal(b.attack.hit, true);
  const s2 = debugScenario('impact');
  save(s2, st);
  const b2 = load(st);
  assert.ok(b2.attack.t >= b2.attack.end);
  tick(b2, 0.05);
  assert.equal(b2.phase, 'tender');
});

test('partial old v2 save gets new fields by deep merge', () => {
  const st = memStorage({ [SAVE_KEY]: JSON.stringify({ v: 2, money: 777, progress: { ftue: 'done' } }) });
  const s = load(st);
  assert.equal(s.money, 777);
  assert.equal(s.progress.ftue, 'done');
  assert.equal(s.sectors.length, 6);
  assert.equal(typeof s.progress.unlocked.depot, 'boolean');
  assert.ok(Array.isArray(s.fleet) && s.fleet.length === 4);
  normalize(s);
});
