// Aftermath v2: tender math (ARCH §4.5, DESIGN §7). Honest odds: win = rand() < shown chance.
import { BAL } from './data.js';
import { rand, randRange } from './rng.js';
import { workStep, greedyDispatch, isClean, round10, clamp } from './sim.js';

export const scoreFor = (trust, bid, speed) => trust * 0.4 + (1.3 - bid) * 60 + (1.4 - speed) * 40;

/** Süpürge Holding's declared tendency (DESIGN §7.2). */
export function rivalTendency(s) {
  const bold = s.rival.rivalLosses >= 2;
  return bold
    ? { bid: BAL.rivalBoldBid, speed: BAL.rivalBoldSpeed, bold: true }
    : { bid: BAL.rivalBid, speed: BAL.rivalSpeed, bold: false };
}

const pity = (s) => (s.rival.lossStreak >= 2 ? BAL.pity : 0);

export function rivalScore(s, tend) {
  const t = tend || (s.tender && s.tender.rivalBias) || rivalTendency(s);
  return scoreFor(s.rivalTrust, t.bid, t.speed) - pity(s);
}

/** Win probability for a cell; exactly the probability resolve() uses. */
export function chance(s, bid, speed) {
  return clamp(0.5 + (scoreFor(s.trust, bid, speed) - rivalScore(s)) / 50, 0.03, 0.97);
}

/** Terms of grid cell (price index, speed index). */
export function cellTerms(t, pi, si) {
  const bid = BAL.bids[pi];
  const speed = BAL.speeds[si];
  return { bid, speed, pay: round10(t.value * bid), deadline: Math.round(t.baseDeadline * speed) };
}

export const isHatched = (t, si) => Math.round(t.baseDeadline * BAL.speeds[si]) < t.estimate.hi;

/** Recommended cell for the first tender: highest pay with chance ≥ 0.6 and not hatched. */
export function recommendedCell(s, t) {
  if (s.stats.won + s.stats.lost > 0) return null;
  let best = null;
  for (let si = 0; si < 3; si++) {
    for (let pi = 0; pi < 3; pi++) {
      const c = cellTerms(t, pi, si);
      if (isHatched(t, si)) continue;
      if (chance(s, c.bid, c.speed) < 0.6) continue;
      if (!best || c.pay > best.pay || (c.pay === best.pay && c.deadline > best.deadline)) best = { price: pi, speed: si, pay: c.pay, deadline: c.deadline };
    }
  }
  return best ? { price: best.price, speed: best.speed } : null;
}

/**
 * Honest resolution (DESIGN §7.2): win = rand() < chance(sel). Then a rival bid/speed is sampled by rejection
 * until (playerScore ≥ rivalScore) agrees with the outcome, so the reveal explains the result.
 */
export function resolve(s) {
  const t = s.tender;
  const c = cellTerms(t, t.sel.price, t.sel.speed);
  const p = chance(s, c.bid, c.speed);
  const win = rand() < p;
  const ps = scoreFor(s.trust, c.bid, c.speed);
  const pt = pity(s);
  const agrees = (rb, rs) => (ps >= scoreFor(s.rivalTrust, rb, rs) - pt) === win;
  let rb = 1;
  let rs = 1;
  let ok = false;
  for (let i = 0; i < 200 && !ok; i++) {
    rb = randRange(0.78, 1.18);
    rs = randRange(0.8, 1.3);
    ok = agrees(rb, rs);
  }
  for (let i = 0; i < 200 && !ok; i++) {
    // rare corner (chance clamped at 3 % or 97 %): widen the rival's box
    rb = randRange(0.5, 1.4);
    rs = randRange(0.5, 1.6);
    ok = agrees(rb, rs);
  }
  if (!ok) {
    rb = win ? 1.4 : 0.5;
    rs = win ? 1.6 : 0.5;
  }
  const rsc = scoreFor(s.rivalTrust, rb, rs) - pt;
  const part = (trust, bid, speed) => ({ price: (1.3 - bid) * 60, speed: (1.4 - speed) * 40, trust: trust * 0.4 });
  t.reveal = {
    win, chance: p,
    you: { bid: c.pay, deadline: c.deadline, trust: s.trust, score: ps, mult: { bid: c.bid, speed: c.speed }, parts: part(s.trust, c.bid, c.speed) },
    rival: {
      bid: round10(t.value * rb), deadline: Math.round(t.baseDeadline * rs), trust: s.rivalTrust, score: rsc,
      mult: { bid: rb, speed: rs }, parts: part(s.rivalTrust, rb, rs), pity: pt,
    },
  };
  return t.reveal;
}

/* ---------------- Fleet estimate dry-run ---------------- */

function cloneWorld(s, damage) {
  const sectors = s.sectors.map((sec) => ({
    id: sec.id, fire: sec.fire, rubble: sec.rubble, corpse: sec.corpse, seg: sec.seg, rival: false,
  }));
  if (damage) {
    for (const d of damage) Object.assign(sectors[d.id], { fire: d.fire || 0, rubble: d.rubble || 0, corpse: d.corpse || 0, seg: d.seg || null });
  }
  const fleet = s.fleet.map((v) => ({ id: v.id, type: v.type, state: 'yard', sector: null, from: 'yard', eta: 0, eta0: 0, bay: v.bay, seq: 0 }));
  return { sectors, fleet, upgrades: s.upgrades };
}

/**
 * Deterministic dry-run of the greedy dispatcher (no spread, 0.5 s steps, every vehicle starts in the yard).
 * damage: optional [{id, fire, rubble, corpse, seg}] (defaults to the current sectors of the attack).
 * Returns seconds { lo, mid, hi } with lo = 0.9 mid, hi = 1.1 mid.
 */
export function estimate(s, damage) {
  const w = cloneWorld(s, damage);
  const ids = damage ? damage.map((d) => d.id) : s.attack ? s.attack.sectors.slice() : [];
  const done = () => ids.every((id) => isClean(w.sectors[id]));
  let t = 0;
  const STEP = 0.5;
  while (!done() && t < 3600) {
    greedyDispatch(w, ids, null);
    workStep(w, STEP, null);
    t += STEP;
  }
  const mid = Math.max(1, Math.round(t));
  return { lo: Math.round(mid * 0.9), mid, hi: Math.round(mid * 1.1) };
}

/** Tender value (v1 formula, ARCH §3.3). */
export function contractValue(s) {
  const a = s.attack;
  const up = s.sectors.reduce((n, x) => n + x.upkeep, 0);
  return round10(BAL.baseContract * (1 + BAL.chainValue * (a.L - 1)) * (1 + BAL.upkeepValue * up) * (a.mutant ? BAL.mutantValue : 1));
}

/**
 * Base deadline: max(estimate.mid × 1.15, min(v1 formula, estimate.mid × 1.6)). The v1 formula still sets the
 * deadline for a small fleet; the 1.6 cap keeps the gold zone meaningful once the fleet has grown (Logic decisions).
 */
export function baseDeadlineFor(s, est) {
  let rubble = 0;
  let corpse = 0;
  let fire = 0;
  for (const id of s.attack.sectors) {
    rubble += s.sectors[id].rubble;
    corpse += s.sectors[id].corpse;
    fire += s.sectors[id].fire;
  }
  const v1 = Math.round(30 + 0.35 * rubble + 0.55 * corpse + 0.2 * fire);
  return Math.max(Math.round(est.mid * BAL.deadlineMin), Math.min(v1, Math.round(est.mid * BAL.deadlineCap)));
}
