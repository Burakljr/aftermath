// Economy maths: prices, costs, cooking times, milestones, walking speed and the
// steady income estimate. Pure functions over (location config, state).
import { RULES } from './config.js';

const MS = RULES.milestones;

export function milestonesReached(level) {
  let n = 0;
  for (let i = 0; i < MS.length; i++) if (level >= MS[i]) n++;
  return n;
}

export function isMilestone(level) {
  return MS.indexOf(level) !== -1;
}

// { prev, next, ratio, reached } for the milestone bar. next = null after the last.
export function milestoneInfo(level) {
  let prev = 1;
  let next = null;
  for (let i = 0; i < MS.length; i++) {
    if (level >= MS[i]) prev = MS[i];
    else { next = MS[i]; break; }
  }
  const ratio = next === null ? 1 : (level - prev) / (next - prev);
  return { prev, next, ratio, reached: milestonesReached(level) };
}

export function speedMult(level) {
  return Math.pow(2, milestonesReached(level));
}

export function cookTime(sc, level) {
  return sc.cookTime / speedMult(level);
}

// Smooth price per dish (unrounded) and the rounded coins a customer pays.
export function priceRaw(sc, level) {
  return sc.basePrice * (1 + RULES.priceStep * (level - 1)) * Math.pow(RULES.priceGrowth, level - 1);
}
export function price(sc, level) {
  return Math.round(priceRaw(sc, level));
}

export function upgradeCost(sc, level) {
  return Math.round(sc.baseCost * Math.pow(RULES.costGrowth, level - 1));
}

export function tableCost(cfg, owned) {
  const c = cfg.tables.costs;
  return owned < c.length ? c[owned] : Infinity;
}

export function cookCost(cfg, count) {
  const c = cfg.cooks.costs;
  return count < cfg.cooks.max && count < c.length ? c[count] : Infinity;
}

export function cookSpeedCost(cfg, level) {
  if (level >= RULES.cookSpeedMax) return Infinity;
  return Math.round(cfg.cookSpeed.baseCost * Math.pow(cfg.cookSpeed.growth, level - 1));
}

export function cookSpeedMult(level) {
  return 1 + RULES.cookSpeedStep * (level - 1);
}

export function cookWalkSpeed(layout, level) {
  return layout.speeds.cook * cookSpeedMult(level);
}

export function ownedTables(state) {
  let n = 0;
  for (let i = 0; i < state.tables.length; i++) if (state.tables[i].owned) n++;
  return n;
}

export function newestOpenIndex(state) {
  let last = -1;
  for (let i = 0; i < state.stations.length; i++) if (state.stations[i].open) last = i;
  return last;
}

// Order weight of station i (0 when closed): the newest open station is ordered more often.
export function orderWeight(state, i) {
  const s = state.stations[i];
  if (!s || !s.open) return 0;
  return i === newestOpenIndex(state) && i > 0 ? RULES.newestWeight : 1;
}

// Average coins per order with the current mix.
export function avgPrice(cfg, state) {
  let w = 0;
  let v = 0;
  for (let i = 0; i < state.stations.length; i++) {
    const k = orderWeight(state, i);
    if (!k) continue;
    w += k;
    v += k * price(cfg.stations[i], state.stations[i].level);
  }
  return w ? v / w : 0;
}

// Steady income estimate (coins per second, no boosts): the smallest of the cook-, station-
// and seat-limited order rates times the average price. Used for the HUD income, offline
// earnings and the upgrade hints. Calibrated against the simulation (tests/logic).
// Guests avoid stations that already have guests waiting (world.js pickWeight), so the order
// mix is solved with a few fixed-point steps: waiting guests per station from Little's law.
const _w = [0, 0, 0, 0, 0, 0, 0, 0];   // effective order weights (no allocation per call)
const _d = [0, 0, 0, 0, 0, 0, 0, 0];   // mean station -> table distance
export function incomeEstimate(cfg, layout, state) {
  const st = state.stations;
  const tables = layout.tables;
  const v = cookWalkSpeed(layout, state.cookSpeed);
  const vc = layout.speeds.customer;
  let nt = 0;
  for (let i = 0; i < tables.length && i < state.tables.length; i++) if (state.tables[i].owned) nt++;
  if (!nt) return 0;
  const n = Math.min(st.length, _w.length);
  for (let i = 0; i < n; i++) {
    _w[i] = orderWeight(state, i);
    let d = 0;
    if (_w[i]) {
      const ls = layout.stations[i];
      for (let k = 0; k < tables.length; k++) {
        if (!state.tables[k] || !state.tables[k].owned) continue;
        d += layout.pathLength(ls.node, tables[k].front);
      }
    }
    _d[i] = d / nt;
  }
  // seats: walk in + wait (at least one lead time) + eat + pay
  let walkIn = 0;
  for (let k = 0; k < tables.length; k++) {
    if (!state.tables[k] || !state.tables[k].owned) continue;
    walkIn += layout.pathLength(layout.door.outside, tables[k].seats[0].id);
  }
  walkIn = walkIn / nt / vc;
  const seats = nt * 2;
  const cooks = state.cooks.length;
  // up to RULES.stationSlots cooks can work at one station at once
  const slots = Math.max(1, Math.min(cooks, RULES.stationSlots));
  let rate = 0;
  let avg = 0;
  for (let iter = 0; iter < 4; iter++) {
    let wSum = 0;
    let pSum = 0;
    let cookBusy = 0;     // expected cook seconds per order
    let lead = 0;         // expected order lead time (station walk + cook + carry)
    for (let i = 0; i < n; i++) {
      const w = _w[i];
      if (!w) continue;
      const ct = cookTime(cfg.stations[i], st[i].level);
      wSum += w;
      pSum += w * price(cfg.stations[i], st[i].level);
      cookBusy += w * (2 * _d[i] / v + ct + RULES.serveTime);
      lead += w * (2 * _d[i] / v + ct + RULES.serveTime);
    }
    if (!wSum) return 0;
    cookBusy /= wSum;
    lead /= wSum;
    // per-station cap: station i only gets a share w_i / wSum of the orders
    let stationRate = Infinity;
    for (let i = 0; i < n; i++) {
      const w = _w[i];
      if (!w) continue;
      const busy = 0.5 * _d[i] / v + cookTime(cfg.stations[i], st[i].level);
      stationRate = Math.min(stationRate, slots * wSum / (w * busy));
    }
    const cookRate = cooks / cookBusy;
    const seatRate = seats / (walkIn + lead + RULES.eatTime + RULES.payTime + RULES.arriveBase / 2);
    // soft minimum: the tightest limit dominates, but easing the others still helps a bit
    // (more seats keep more orders queued, so cooks wait less), like in the simulation
    const P = 6;
    rate = Math.pow(Math.pow(cookRate, -P) + Math.pow(stationRate, -P) + Math.pow(seatRate, -P), -1 / P);
    avg = pSum / wSum;
    if (iter === 3 || !RULES.queuePenalty) break;
    // next mix: waiting guests per station = arrival rate x time waiting (lead + queueing)
    for (let i = 0; i < n; i++) {
      const w0 = orderWeight(state, i);
      if (!w0) continue;
      const lam = rate * _w[i] / wSum;
      const busy = 0.5 * _d[i] / v + cookTime(cfg.stations[i], st[i].level);
      const rho = Math.min(0.9, lam * busy / slots);
      const wait = (2 * _d[i] / v + cookTime(cfg.stations[i], st[i].level)) / (1 - rho);
      _w[i] = 0.5 * _w[i] + 0.5 * w0 / (1 + RULES.queuePenalty * lam * wait);
    }
  }
  return rate * avg * EST_FACTOR;
}

// The simulation loses a little to queueing (measured in tests/logic/estimate.test.mjs).
export const EST_FACTOR = 1;
