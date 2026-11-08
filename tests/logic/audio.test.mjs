// js/audio.js keeps getting what it reads: state fields, bus events, BAL.attackHit, MONSTERS.voice, sfx names.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { on, emit } from '../../js/bus.js';
import { BAL, MONSTERS } from '../../js/game/data.js';
import { newState } from '../../js/game/state.js';
import { tick } from '../../js/game/sim.js';
import { debugScenario } from '../../js/game/debug.js';
import { playBot } from './bot.mjs';

const SRC = readFileSync(new URL('../../js/audio.js', import.meta.url), 'utf8');
// procedural sfx the integrator adds to audio.js (ARCH §3.4)
const PLANNED = ['dispatch', 'hiss', 'tick', 'thud'];

test('data exports what audio.js imports', () => {
  assert.equal(BAL.attackHit, 2.6);
  assert.equal(MONSTERS.magmadon.voice, 90);
  assert.match(SRC, /import \{ BAL, MONSTERS \} from '\.\/(game\/)?data\.js'/);
});

test('state fields audio.js reads exist in every phase', () => {
  // static: the fields named in audio.js
  for (const f of ['s.phase', 's.attack', 's.sectors', 's.contract', 'sec.fire', 'sec.rubble', 'sec.corpse', 'sec.crews.fire',
    'sec.crews.debris', 'sec.crews.carve', 'a.t', 'a.mutant', 'a.monster', 's.attack.hit', 'c.elapsed', 'c.deadline']) {
    assert.ok(SRC.includes(f), `audio.js still reads ${f}`);
  }
  const phases = new Set(['calm', 'attack', 'tender', 'cleanup', 'rival']);
  for (const name of ['calm', 'attack', 'impact', 'cleanup', 'tender', 'rival', 'result']) {
    const s = debugScenario(name);
    assert.ok(phases.has(s.phase), name);
    for (const sec of s.sectors) {
      for (const k of ['fire', 'rubble', 'corpse']) assert.equal(typeof sec[k], 'number');
      for (const k of ['fire', 'debris', 'carve']) assert.equal(typeof sec.crews[k], 'number');
    }
    if (s.phase === 'attack') {
      assert.equal(typeof s.attack.t, 'number');
      assert.equal(typeof s.attack.hit, 'boolean');
      assert.ok(MONSTERS[s.attack.monster]);
      assert.equal(typeof s.attack.mutant, 'boolean');
    }
    if (s.phase === 'cleanup') assert.ok(s.contract.deadline > 0 && s.contract.elapsed >= 0);
  }
});

test('events audio.js listens to are emitted; every logic sfx name exists in audio.js or the planned additions', () => {
  const listened = [...SRC.matchAll(/on\('([a-z-]+)'/g)].map((m) => m[1]);
  // ARCH 3.4 edit 3: the 'float' text-sniffing handler is gone; logic emits explicit 'sfx' events instead
  assert.deepEqual(listened.sort(), ['attack-start', 'hit', 'sfx', 'toast'].sort());
  const seen = new Set();
  const sfx = new Set();
  let rec = true;
  for (const e of listened) on(e, (p) => rec && seen.add(e));
  on('sfx', (p) => rec && sfx.add(p.name));
  on('toast', (p) => { if (rec) assert.ok('kind' in p); });
  on('float', (p) => { if (rec) assert.equal(typeof p.text, 'string'); });
  playBot({ seed: 4, maxT: 1500, until: (s) => s.progress.goal === 'end' });
  // a spread and a late finish for the rarer sounds
  const sp = debugScenario('spread');
  for (let i = 0; i < 80; i++) tick(sp, 0.1);
  rec = false;
  for (const e of listened) assert.ok(seen.has(e), `event ${e} emitted`);
  const have = new Set([...SRC.matchAll(/^ {2}([a-zA-Z]+)\(/gm)].map((m) => m[1]));
  const missing = [...sfx].filter((n) => !have.has(n) && !PLANNED.includes(n));
  assert.deepEqual(missing, [], 'unknown sfx names');
  console.log(`  sfx emitted: ${[...sfx].sort().join(', ')}`);
  console.log(`  still to add in audio.js (integrator, ARCH 3.4): ${PLANNED.filter((n) => !have.has(n)).join(', ') || 'none'}`);
});

// A recursive fake for the Web Audio graph: any property is a node/param, any call returns a node.
function fakeNode() {
  const fn = function () { return fakeNode(); };
  return new Proxy(fn, {
    get(t, p) {
      if (p === 'value') return 0;
      if (p === Symbol.toPrimitive) return () => 0;
      if (p === 'then') return undefined;
      return fakeNode();
    },
    set() { return true; },
    apply() { return fakeNode(); },
  });
}

test('audio.js runs against real game states with a fake AudioContext', async () => {
  const listeners = {};
  const timers = [];
  const g = globalThis;
  const saved = { window: g.window, document: g.document, setInterval: g.setInterval };
  class FakeCtx {
    constructor() { this.state = 'running'; this.currentTime = 0; this.sampleRate = 8000; this.destination = fakeNode(); }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  }
  for (const m of ['createGain', 'createBiquadFilter', 'createOscillator', 'createBufferSource', 'createConvolver',
    'createDynamicsCompressor', 'createStereoPanner', 'createWaveShaper', 'createDelay']) FakeCtx.prototype[m] = () => fakeNode();
  g.window = { AudioContext: FakeCtx, addEventListener: (ev, f) => { listeners[ev] = f; } };
  g.document = { addEventListener() {}, hidden: false };
  g.setInterval = (f) => { timers.push(f); return 0; };
  let mod;
  try {
    mod = await import('../../js/audio.js');
  } catch (err) {
    // audio.js imports ./game/data.js since the integration (ARCH 3.4 edit 1): failing to import is a real failure
    Object.assign(g, saved);
    throw err;
  }
  try {
    let s = newState();
    mod.initAudio(() => s);
    listeners.pointerdown();
    const schedule = timers[0];
    const runFor = (state, sec) => {
      s = state;
      for (let t = 0; t < sec; t += 0.05) {
        tick(s, 0.05);
        mod.updateAudio(s, 0.05);
        if (schedule) schedule();
      }
    };
    runFor(newState(), 8); // cold open: attack with negative t, footsteps, hit
    for (const name of ['cleanup', 'spread', 'rival', 'tender', 'result', 'late', 'attack']) runFor(debugScenario(name), 4);
    emit('toast', { text: 'x', kind: 'bad' });
    emit('float', { sector: 1, text: '+1 Pul', kind: 'part' });
    assert.ok(true);
  } finally {
    Object.assign(g, saved);
  }
});
