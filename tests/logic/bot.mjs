// A greedy headless player for pacing and goal-chain checks (used by tests and tools/balance.mjs).
import { on } from '../../js/bus.js';
import { newState } from '../../js/game/state.js';
import { tick, greedyDispatch, jobSectors, HOOKS, vehicleCost, owned, canStartJob, assigned, blockReason, isFree } from '../../js/game/sim.js';
import { act, upkeepBlock, upgradeBlock, upgradeCost } from '../../js/game/actions.js';
import { driveFtue } from '../../js/game/ftue.js';
import { chance, cellTerms, isHatched } from '../../js/game/tender.js';
import { RECIPES, ITEMS, CREW_TYPES } from '../../js/game/data.js';
import { setSeed } from '../../js/game/rng.js';

/** Best expected value cell that keeps the promise (not hatched). */
function pickCell(s) {
  const t = s.tender;
  let best = null;
  for (let si = 0; si < 3; si++) {
    if (isHatched(t, si)) continue;
    for (let pi = 0; pi < 3; pi++) {
      const c = cellTerms(t, pi, si);
      const ev = chance(s, c.bid, c.speed) * c.pay;
      if (!best || ev > best.ev) best = { pi, si, ev };
    }
  }
  return best || { pi: 1, si: 2 };
}

function economy(s, o) {
  const u = s.progress.unlocked;
  // factory first: keep lines busy with the best margin recipe
  if (u.factory) {
    for (const r of RECIPES) if (s.progress.recipes[r.id] && canStartJob(s, r.id).ok) act(s, 'startJob', { rid: r.id });
    if (u.autoRepeat) for (const r of RECIPES) if (s.progress.recipes[r.id] && !s.autoJobs[r.id]) act(s, 'toggleAuto', { rid: r.id });
  }
  // offers for stock
  for (const of of s.offers.slice()) if (s.inv[of.item] > 0) act(s, 'acceptOffer', { offerId: of.id });
  // Rıza: keep factory inputs, sell the rest once there is a pile (or always before the factory)
  const keep = { bone: u.factory ? 6 : 0, scale: s.progress.recipes.armor ? 10 : 0, blood: s.progress.recipes.cell ? 8 : 0, eye: s.progress.recipes.relic ? 1 : 0 };
  if (!u.offers || o.sellRiza) {
    for (const k of Object.keys(ITEMS)) {
      const extra = s.inv[k] - (keep[k] || 0);
      if (extra > 0 && !(u.offers && ITEMS[k].product)) act(s, 'sell', { item: k, qty: extra });
    }
  }
  const reserve = o.reserve;
  // upkeep: cheapest tier first (after G6)
  if (u.upkeep && s.phase === 'calm') {
    const ids = [0, 1, 2, 3, 4, 5].sort((a, b) => s.sectors[a].upkeep - s.sectors[b].upkeep);
    for (const id of ids) if (!upkeepBlock(s, id) && s.money - 350 * Math.pow(1.85, s.sectors[id].upkeep) >= reserve) act(s, 'signUpkeep', { sector: id });
  }
  // upgrades
  for (const key of ['foreman', 'speed', 'lines']) if (!upgradeBlock(s, key) && s.money - upgradeCost(s, key) >= reserve * 2) act(s, 'buyUpgrade', { key });
  // vehicles: scarcest type first (fire capped at 3 until carving is strong)
  if (u.company) {
    const order = CREW_TYPES.slice().sort((a, b) => owned(s, a) - owned(s, b) || vehicleCost(s, a) - vehicleCost(s, b));
    for (const type of order) {
      if (type === 'fire' && owned(s, 'fire') >= 3 && owned(s, 'carve') < 4) continue;
      if (s.money - vehicleCost(s, type) >= reserve) {
        act(s, 'buyVehicle', { type });
        break;
      }
    }
  }
}

/** Human-like dispatch: one vehicle per decision, same greedy scoring as the game's own dispatcher. */
function dispatchOne(s) {
  const ids = jobSectors(s);
  for (const type of CREW_TYPES) {
    if (!s.fleet.some((v) => v.type === type && isFree(v))) continue;
    const key = type === 'fire' ? 'fire' : type === 'debris' ? 'rubble' : 'corpse';
    let best = -1;
    let bs = 0;
    for (const id of ids) {
      const sec = s.sectors[id];
      if (sec.rival || blockReason(sec, type)) continue;
      const sc = (sec[key] / (assigned(s, id, type) + 1)) * (type === 'carve' && sec.seg === 'head' ? 1.3 : 1);
      if (sc > bs) {
        bs = sc;
        best = id;
      }
    }
    if (best >= 0) return act(s, 'dispatch', { type, sector: best });
  }
  return null;
}

/**
 * Plays until `until(s)` or maxT game seconds. Returns { s, log, goals, contracts }.
 * opts: seed, react (s between decisions), skipRadar, skipAttack, sellDna, reserve.
 */
export function playBot(opts = {}) {
  const o = { seed: 1, react: 1, skipRadar: false, skipAttack: true, sellDna: true, reserve: 400, sellRiza: true, maxT: 3600, until: null, human: false, ...opts };
  if (o.human) Object.assign(o, { react: 1.5, skipAttack: false, think: { call: 4, bid: 8, reveal: 3, result: 3 }, ...opts });
  setSeed(o.seed);
  const s = o.state || newState();
  const goals = [];
  const contracts = [];
  const unlocks = [];
  const offs = [];
  const handlers = {
    goal: (p) => goals.push({ id: p.id, t: s.clock, money: s.money }),
    unlock: (p) => unlocks.push({ key: p.key, t: s.clock }),
    'contract-done': (p) => contracts.push({ ...p, t: s.clock }),
  };
  let active = true;
  for (const k in handlers) on(k, (p) => active && handlers[k](p));
  let next = 0;
  let offered = {};
  let mode = '';
  let modeT = 0;
  const think = (m) => {
    if (m !== mode) {
      mode = m;
      modeT = s.clock + ((o.think && o.think[m]) || 0);
    }
    return s.clock >= modeT;
  };
  const offerLog = (n, kind) => { if (!offered[n]) offered[n] = { no: n, kind, t: s.clock }; };
  while (s.clock < o.maxT && !(o.until && o.until(s))) {
    if (s.clock >= next) {
      next = s.clock + o.react;
      if (s.notices.length) {
        const n = s.notices[0];
        if (n.kind === 'buyer') act(s, 'decideBuyer', { sell: o.sellDna });
        else act(s, 'ackNotice');
      }
      if (s.progress.ftue !== 'done') {
        driveFtue(s);
      } else if (s.phase === 'attack') {
        if (o.skipAttack) act(s, 'skipAttack');
      } else if (s.phase === 'tender') {
        const t = s.tender;
        if (!think(t.kind === 'call' ? 'call' : t.reveal ? 'reveal' : 'bid')) { tick(s, 0.1); continue; }
        if (t.kind === 'call') {
          offerLog(t.no, 'call');
          act(s, 'acceptCall');
        } else if (!t.reveal) {
          offerLog(t.no, 'bid');
          const c = pickCell(s);
          act(s, 'selectTenderCell', { price: c.pi, speed: c.si });
          const r = act(s, 'submitTender');
          if (!r.ok && r.code === 'confirm') act(s, 'confirmRed');
        } else if (t.reveal.win) act(s, 'startWork');
        else act(s, 'takeTail');
      } else if (s.phase === 'cleanup' || s.phase === 'rival') {
        if (o.human) dispatchOne(s);
        else greedyDispatch(s, jobSectors(s), HOOKS);
      } else if (s.phase === 'calm') {
        if (s.result) {
          if (!think('result')) { tick(s, 0.1); continue; }
          act(s, 'collectPayment');
        }
        economy(s, o);
        if (o.skipRadar) act(s, 'skipRadar');
      }
    }
    tick(s, 0.1);
  }
  active = false;
  return { s, goals, contracts, unlocks, offered: Object.values(offered) };
}
