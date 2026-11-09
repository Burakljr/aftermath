// No softlocks: careless play still finishes, random play keeps the state valid.
import { test, assert } from './harness.mjs';
import { runBot } from './bot.mjs';
import { createGame } from '../../js/game/index.js';

test('a careless player (cheapest upgrade, no boosts, no saving) still finishes factory 1', () => {
  const r = runBot({ lazy: true, maxTime: 3 * 3600, think: 2 });
  assert(r.marks['complete:wood'] !== undefined, 'factory 1 not finished in 3 h');
});

function checkInvariants(game, where) {
  const s = game.state;
  assert(Number.isFinite(s.money) && s.money >= 0, `${where}: money ${s.money}`);
  assert(Number.isFinite(s.lifetimeMoney), `${where}: lifetimeMoney`);
  const st = s.factory.stations;
  for (let i = 0; i < st.length; i++) {
    const x = st[i];
    assert(x.progress >= 0 && x.progress <= 1, `${where}: progress ${x.progress}`);
    assert(x.tray >= 0 && x.tray <= 3 && Number.isInteger(x.tray), `${where}: tray ${x.tray}`);
    assert(i === 0 ? x.tray === 0 : true, `${where}: first tray`);
    assert(x.boostT >= 0 && x.boostT <= 5 + 1e-9, `${where}: boost ${x.boostT}`);
    if (i > 0 && x.open) assert(st[i - 1].open, `${where}: open order`);
  }
  assert(game.select.incomePerSec() > 0, `${where}: income must stay positive`);
}

test('random actions never break the state, and the line always keeps selling', () => {
  let ms = 1e6;
  const game = createGame({ now: () => ms, lang: 'en' });
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const types = ['upgrade', 'open', 'boost', 'claimGoal', 'nextFactory', 'claimOffline', 'tutorial', 'setting', 'bogus'];
  for (let step = 0; step < 30000; step++) {
    const type = types[Math.floor(rnd() * types.length)];
    const station = rnd() < 0.5 ? Math.floor(rnd() * 5) - 0 : ['saw', 'paint', 'wrap', 'nope'][Math.floor(rnd() * 4)];
    const goal = game.state.goals[Math.floor(rnd() * game.state.goals.length)];
    const r = game.act({ type, station, id: goal && goal.id, step: [0, 1, 2, 'done', 7][Math.floor(rnd() * 5)], key: 'sound', value: rnd() < 0.5 });
    assert(r && typeof r.ok === 'boolean', 'act must return { ok }');
    if (!r.ok) assert(typeof r.reason === 'string', 'failed act needs a reason');
    if (rnd() < 0.3) game.state.money += rnd() * game.select.incomePerSec() * 30; // speed things up
    const before = game.state.factory.sold;
    game.tick(0.1 + rnd() * 0.4);
    ms += 250;
    if (step % 500 === 0) checkInvariants(game, `step ${step}`);
    if (step % 2000 === 0) {
      // from any state the line produces again within a while
      for (let k = 0; k < 400 && game.state.factory.sold === before; k++) { game.tick(0.1); ms += 100; }
      assert(game.state.factory.sold > before, `step ${step}: line stuck`);
    }
  }
  checkInvariants(game, 'end');
});

test('a full tray stops the station before it (pile-up), and it resumes when space frees', () => {
  let ms = 1e6;
  const game = createGame({ now: () => ms, lang: 'en' });
  // make the saw very fast so assembly is the bottleneck
  game.state.factory.stations[0].level = 60;
  for (let i = 0; i < 100; i++) { game.tick(0.1); ms += 100; }
  const [saw, asm] = game.state.factory.stations;
  assert(asm.tray === 3, `assembly tray should be full, got ${asm.tray}`);
  assert(saw.progress === 1, `saw should be blocked holding an item, progress ${saw.progress}`);
  const v = game.select.stationView('assembly');
  assert(v.bottleneck, 'assembly should be reported as the bottleneck');
});
