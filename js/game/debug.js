// Aftermath v2: consistent debug states for tests, ui-lab and aftermath.scenario (ARCH §4.1).
import { BAL, CREW_TYPES, RECIPES, DISTRICTS } from './data.js';
import { setSeed, setRandom } from './rng.js';
import { newState, newVehicle } from './state.js';
import {
  silently, tick, greedyDispatch, jobSectors, HOOKS, owned, startAttack, startCalm, spawnOffer, startJobNow,
  rebuildCrews, calmLength,
} from './sim.js';
import { act } from './actions.js';
import { debugFtue } from './ftue.js';
import { GOALS, unlock } from './goals.js';

export const SCENARIOS = ['calm', 'call', 'ftue-fire', 'cleanup', 'spread', 'attack', 'impact', 'tender', 'tender-reveal',
  'result', 'rival', 'depot', 'depot-offers', 'factory', 'company', 'late'];

function run(s, cond, maxT = 900, auto = true) {
  for (let t = 0; t < maxT; t += 0.1) {
    if (cond(s)) return true;
    if (auto) {
      const ids = jobSectors(s);
      if (ids.length) greedyDispatch(s, ids, HOOKS);
    }
    tick(s, 0.1);
  }
  return cond(s);
}

function addVehicles(s, type, upTo) {
  while (owned(s, type) < upTo) {
    const used = new Set(s.fleet.map((v) => v.bay));
    let b = 0;
    while (used.has(b)) b++;
    s.fleet.push(newVehicle('v' + s.nextId++, type, b));
  }
}

/** Completes goals G1..G(upTo) with their unlocks (no money rewards), FTUE done. */
function completeGoals(s, upTo) {
  s.progress.ftue = 'done';
  const last = GOALS.findIndex((g) => g.id === upTo);
  for (let i = 0; i <= last; i++) {
    const g = GOALS[i];
    if (s.progress.goalsDone.includes(g.id)) continue;
    s.progress.goalsDone.push(g.id);
    for (const k of g.unlock) unlock(s, k);
  }
  s.progress.goal = GOALS[last + 1] ? GOALS[last + 1].id : 'end';
}

/** G1..G14 done with unlocks, FTUE done, fleet 3/3/3, money 50 000 (ARCH §4.1). */
export function debugUnlockAll(s) {
  silently(() => {
    completeGoals(s, 'G14');
    for (const t of CREW_TYPES) addVehicles(s, t, 3);
    s.money = Math.max(s.money, 50000);
    s.stats.contracts = Math.max(s.stats.contracts, 8);
    s.stats.won = Math.max(s.stats.won, 1);
    s.stats.made = Math.max(s.stats.made, 1);
    s.stats.sold = Math.max(s.stats.sold, 10);
    s.stats.offerSold = Math.max(s.stats.offerSold, 5);
    s.progress.contractNo = Math.max(s.progress.contractNo, 8);
    s.trust = Math.max(s.trust, 80);
    s.flags.dnaGuarantee = true;
    s.flags.buyerDecided = true;
    s.stats.gold = Math.max(s.stats.gold, 1);
    for (const k in s.progress.seen) s.progress.seen[k] = true;
    if (s.phase === 'calm' && !s.result) {
      s.timer = calmLength(s);
      s.timerMax = s.timer;
    }
    rebuildCrews(s);
  });
  return s;
}

/** Post-FTUE calm (contract #1 done, 2 fire trucks). */
function afterFtue(s) {
  debugFtue(s, 'done');
  return s;
}

function toCallNo2(s) {
  afterFtue(s);
  silently(() => {
    s.timer = 0;
    run(s, (x) => x.phase === 'tender', 30, false);
  });
}

/** A mid-game state where tenders are unlocked (G1..G5), contract #2 delivered. */
function midGame(s) {
  silently(() => {
    completeGoals(s, 'G5');
    addVehicles(s, 'fire', 2);
    s.stats.contracts = 2;
    s.stats.sold = 8;
    s.stats.made = 1;
    s.progress.contractNo = 2;
    s.money = 2600;
    s.inv.scale = 13;
    s.inv.blood = 10;
    s.inv.bone = 4;
    s.inv.eye = 1;
    s.inv.concrete = 1;
    startCalm(s, 30);
  });
}

function toTender(s) {
  midGame(s);
  silently(() => {
    startAttack(s);
    run(s, (x) => x.phase === 'tender', 30, false);
  });
}

export function debugScenario(name) {
  setSeed(20261108);
  const s = newState();
  silently(() => {
    switch (name) {
      case 'calm':
        afterFtue(s);
        tick(s, 0.1);
        s.timer = 28;
        break;
      case 'call':
        toCallNo2(s);
        break;
      case 'ftue-fire':
        debugFtue(s, 'fire');
        break;
      case 'cleanup':
        toCallNo2(s);
        act(s, 'acceptCall');
        act(s, 'dispatch', { type: 'fire', sector: 2 });
        act(s, 'dispatch', { type: 'fire', sector: 1 });
        act(s, 'dispatch', { type: 'debris', sector: 5 });
        run(s, (x) => x.contract.elapsed >= 9, 30, false);
        break;
      case 'spread':
        toCallNo2(s);
        act(s, 'acceptCall');
        act(s, 'dispatch', { type: 'fire', sector: 1 });
        act(s, 'dispatch', { type: 'debris', sector: 5 });
        run(s, (x) => x.sectors[2].warnTo != null && x.sectors[2].warnT <= 3.5, 40, false);
        break;
      case 'attack':
        afterFtue(s);
        startAttack(s);
        s.attack.t = 0.5;
        break;
      case 'impact':
        afterFtue(s);
        startAttack(s);
        s.attack.t = BAL.attackHit - 0.01;
        tick(s, 0.05);
        s.attack.t = BAL.attackHit + 0.2;
        break;
      case 'tender':
        toTender(s);
        break;
      case 'tender-reveal':
        toTender(s);
        act(s, 'submitTender');
        if (!s.tender.reveal) act(s, 'confirmRed');
        break;
      case 'result':
        toCallNo2(s);
        act(s, 'acceptCall');
        run(s, (x) => !!x.result, 400, true);
        break;
      case 'rival':
        toTender(s);
        setRandom(() => 0.999);
        act(s, 'confirmRed');
        setSeed(7);
        act(s, 'takeTail');
        tick(s, 0.1);
        act(s, 'dispatch', { type: 'carve', sector: s.rival.tail });
        run(s, (x) => x.rival.t >= 6, 20, false);
        break;
      case 'depot':
        toCallNo2(s);
        act(s, 'acceptCall');
        run(s, (x) => !!x.result, 400, true);
        act(s, 'collectPayment');
        s.progress.seen.depot = true;
        break;
      case 'depot-offers':
        debugUnlockAll(s);
        Object.assign(s.inv, { scale: 14, blood: 9, bone: 6, eye: 2, armor: 2, cell: 1, concrete: 3 });
        s.offers.length = 0;
        spawnOffer(s, 'armor');
        spawnOffer(s, 'scale');
        spawnOffer(s, 'eye');
        break;
      case 'factory':
        midGame(s);
        unlock(s, 'recipe:armor');
        unlock(s, 'line2');
        s.inv.bone = 7;
        startJobNow(s, 'concrete');
        startJobNow(s, 'armor');
        tick(s, 0.1);
        for (let i = 0; i < 40; i++) tick(s, 0.1);
        break;
      case 'company':
        debugUnlockAll(s);
        s.progress.seen.company = true;
        break;
      case 'late':
        debugUnlockAll(s);
        s.sectors.forEach((sec, i) => { sec.upkeep = [2, 3, 1, 2, 0, 1][i]; });
        for (const r of RECIPES) s.progress.recipes[r.id] = true;
        Object.assign(s.inv, { scale: 22, blood: 15, bone: 9, eye: 1, armor: 1, concrete: 2 });
        startCalm(s, 50);
        tick(s, 0.1);
        break;
      default:
        break;
    }
    rebuildCrews(s);
  });
  setSeed(Math.floor(s.clock * 1000) + 1);
  return s;
}

export { DISTRICTS };
