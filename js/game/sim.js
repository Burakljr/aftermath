// Aftermath v2: the simulation (ARCH §2.2-2.3, §3.3, §4.6). Pure logic: no DOM, no Date.now().
import { emit as busEmit } from '../bus.js';
import {
  DISTRICTS, CREWS, CREW_TYPES, ITEMS, ITEM_KEYS, RAW, RECIPES, MONSTERS, BAL, ATTACK, SCRIPTS, SHARES, SEGS,
  CHAINS2, CHAINS3, YARD_ROW, BUYERS, neighbours, recipeById,
} from './data.js';
import { rand, randRange, randInt, pick, shuffle } from './rng.js';
import { FTUE_COPY, FLOAT, TOAST, NEWS, NPC, TENDER } from './copy.js';
import { estimate, contractValue, baseDeadlineFor, recommendedCell, rivalTendency } from './tender.js';
import { ftueAdvance } from './ftue.js';
import { checkGoals } from './goals.js';

/* ---------------- Events ---------------- */

let mute = 0;
/** Runs fn with all bus events suppressed (dry-runs). */
export function silently(fn) {
  mute++;
  try {
    return fn();
  } finally {
    mute--;
  }
}
export function emit(type, payload) {
  if (!mute) busEmit(type, payload);
}
export const sfx = (name, arg) => emit('sfx', { name, arg });
export const toast = (text, kind = '') => emit('toast', { text, kind });
export const float = (sector, text, kind) => emit('float', { sector, text, kind });

export function headline(s, text, kind = '') {
  s.news.current = { text, kind, until: s.clock + BAL.headlineTime };
  s.news.archive.unshift(text);
  if (s.news.archive.length > 30) s.news.archive.length = 30;
  emit('headline', { text, kind });
}

/** NPC card line (UI shows it while clock < until). */
export function say(s, who, text, dur = BAL.npcTime) {
  s.npc = { who, name: NPC[who].name, text, until: s.clock + dur };
  emit('npc', { who, text });
}

export function setPhase(s, to) {
  const from = s.phase;
  if (from === to) return;
  s.phase = to;
  emit('phase', { from, to });
}

export function pushNotice(s, kind, data = {}) {
  s.notices.push({ kind, data });
  emit('notice', { kind });
}

/* ---------------- Helpers ---------------- */

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const round10 = (n) => Math.round(n / 10) * 10;
export const speedMult = (s) => 1 + BAL.speedStep * s.upgrades.speed;
export const rateOf = (s, type) => CREWS[type].rate * speedMult(s);
export const owned = (s, type) => s.fleet.reduce((n, v) => n + (v.type === type ? 1 : 0), 0);
export const vehicleCost = (s, type) => round10(CREWS[type].base * Math.pow(BAL.vehicleMult, owned(s, type)));
export const isFree = (v) => v.state === 'yard' || v.state === 'returning';
export const workKey = (type) => CREWS[type].work;
export const isClean = (sec) => sec.fire <= 0 && sec.rubble <= 0 && sec.corpse <= 0;
export const ftueDone = (s) => s.progress.ftue === 'done';

const rowOf = (n) => (n === 'yard' ? YARD_ROW : DISTRICTS[n].row);

/** Travel time between nodes ('yard' or a district id), ARCH §3.3. */
export function travel(from, to) {
  if (from === to) return from === 'yard' ? 0 : BAL.travelSame;
  const dr = Math.abs(rowOf(from) - rowOf(to));
  const dc = from === 'yard' || to === 'yard' ? 0 : Math.abs(DISTRICTS[from].col - DISTRICTS[to].col);
  return BAL.travelBase + BAL.travelRow * dr + BAL.travelCol * dc;
}

/** Time for vehicle v to reach `target` from where it is now, and the node its new leg starts from. */
export function legFrom(v, target) {
  if (v.state === 'yard') return { from: 'yard', eta: travel('yard', target) };
  if (v.state === 'working') return { from: v.sector, eta: travel(v.sector, target) };
  // moving: interpolate between the leg ends by progress
  const end = v.state === 'returning' ? 'yard' : v.sector;
  const p = v.eta0 > 0 ? clamp(1 - v.eta / v.eta0, 0, 1) : 1;
  const a = travel(v.from, target);
  const b = travel(end, target);
  const eta = Math.max(BAL.travelSame, a + (b - a) * p);
  return { from: p < 0.5 ? v.from : end, eta };
}

export function rebuildCrews(s) {
  for (const sec of s.sectors) {
    const c = sec.crews;
    c.fire = 0;
    c.debris = 0;
    c.carve = 0;
  }
  for (const v of s.fleet) if (v.state === 'working' && v.sector != null) s.sectors[v.sector].crews[v.type] += 1;
}

/** Districts the player works on now. */
export function jobSectors(s) {
  if (s.phase === 'cleanup' && s.contract) return s.contract.sectors;
  if (s.phase === 'rival' && s.rival.tail != null) return [s.rival.tail];
  return [];
}

/**
 * Rule check for sending `type` to sector `sec` (hard sequence, DESIGN §6.1). Returns a reason key or null.
 * Order follows DESIGN §3 step 2: carving shows "Önce yol açılmalı" while fire and rubble remain.
 */
export function blockReason(sec, type) {
  if (type === 'fire') return sec.fire > 0 ? null : 'noFire';
  if (type === 'debris') {
    if (sec.rubble <= 0) return 'noRubble';
    return sec.fire > 0 ? 'fireFirst' : null;
  }
  if (sec.corpse <= 0) return 'noCorpse';
  if (sec.rubble > 0) return 'roadFirst';
  return sec.fire > 0 ? 'fireFirst' : null;
}

/** Count of vehicles of `type` assigned (enroute or working) to sector id. */
export function assigned(s, id, type) {
  let n = 0;
  for (const v of s.fleet) if (v.sector === id && v.type === type && (v.state === 'enroute' || v.state === 'working')) n++;
  return n;
}

/** Nearest free vehicle of a type for a target, or null. */
export function nearestFree(s, type, target) {
  let best = null;
  let bestT = Infinity;
  for (const v of s.fleet) {
    if (v.type !== type || !isFree(v)) continue;
    const t = legFrom(v, target).eta;
    if (t < bestT - 1e-9) {
      bestT = t;
      best = v;
    }
  }
  return best;
}

export function sendTo(s, v, sectorId, H) {
  const { from, eta } = legFrom(v, sectorId);
  v.from = from;
  v.state = 'enroute';
  v.sector = sectorId;
  v.eta = eta;
  v.eta0 = eta;
  v.seq += 1;
  if (H) H.dispatch(s, v);
}

export function sendHome(s, v, H) {
  const sectorId = v.sector;
  const { from, eta } = legFrom(v, 'yard');
  v.from = from;
  v.state = 'returning';
  v.sector = null;
  v.eta = eta;
  v.eta0 = eta;
  v.seq += 1;
  if (H) H.ret(s, v, sectorId);
}

/* ---------------- Shared work step (real game and dry-run) ---------------- */

const cnt = { fire: 0, debris: 0, carve: 0 };

/** Advances travel and work by dt. H = hooks (null in dry-runs). */
export function workStep(s, dt, H) {
  for (const v of s.fleet) {
    if (v.state !== 'enroute' && v.state !== 'returning') continue;
    v.eta -= dt;
    if (v.eta > 0) continue;
    v.eta = 0;
    if (v.state === 'returning') {
      v.state = 'yard';
      v.sector = null;
      v.from = 'yard';
      if (H) H.park(s, v);
    } else {
      const sec = s.sectors[v.sector];
      if (sec[workKey(v.type)] > 0 && !sec.rival) {
        v.state = 'working';
        v.from = v.sector;
        if (H) H.arrive(s, v);
      } else {
        sendHome(s, v, H);
      }
    }
  }
  for (const sec of s.sectors) {
    if (sec.fire <= 0 && sec.rubble <= 0 && sec.corpse <= 0) continue;
    cnt.fire = 0;
    cnt.debris = 0;
    cnt.carve = 0;
    for (const v of s.fleet) if (v.state === 'working' && v.sector === sec.id) cnt[v.type]++;
    if (cnt.fire && sec.fire > 0) {
      sec.fire -= rateOf(s, 'fire') * cnt.fire * dt;
      if (sec.fire <= 1e-6) {
        sec.fire = 0;
        stageEnd(s, sec, 'fire', H);
      }
    }
    if (sec.fire > 0) continue; // hard rule: nobody else works while it burns (paused)
    if (cnt.debris && sec.rubble > 0) {
      const before = sec.rubble;
      sec.rubble -= rateOf(s, 'debris') * cnt.debris * dt;
      if (sec.rubble <= 1e-6) sec.rubble = 0;
      if (H) H.rubbled(s, sec, before, sec.rubble);
      if (sec.rubble === 0) stageEnd(s, sec, 'rubble', H);
    }
    if (sec.rubble > 0) continue;
    if (cnt.carve && sec.corpse > 0) {
      const amt = Math.min(sec.corpse, rateOf(s, 'carve') * cnt.carve * dt);
      sec.corpse -= amt;
      if (sec.corpse <= 1e-6) sec.corpse = 0;
      if (H) H.carved(s, sec, amt);
      if (sec.corpse === 0) stageEnd(s, sec, 'carve', H);
    }
  }
}

const STAGE_TYPE = { fire: 'fire', rubble: 'debris', carve: 'carve' };

function stageEnd(s, sec, stage, H) {
  const type = STAGE_TYPE[stage];
  for (const v of s.fleet) {
    if (v.sector === sec.id && v.type === type && (v.state === 'working' || v.state === 'enroute')) sendHome(s, v, H);
  }
  if (H) H.stage(s, sec, stage);
}

/**
 * Greedy dispatcher (v1 autoAssign adapted to the hard sequence): used by the estimate dry-run and
 * Vardiya şefi. Sends every free vehicle that has a legal job. Returns the number sent.
 */
export function greedyDispatch(s, sectors, H) {
  let moved = 0;
  for (const type of CREW_TYPES) {
    const key = workKey(type);
    for (;;) {
      let best = -1;
      let bestScore = 0;
      for (const id of sectors) {
        const sec = s.sectors[id];
        if (sec.rival || blockReason(sec, type)) continue;
        let score = sec[key] / (assigned(s, id, type) + 1);
        if (type === 'carve' && sec.seg === 'head') score *= 1.3;
        if (score > bestScore + 1e-9) {
          bestScore = score;
          best = id;
        }
      }
      if (best < 0) break;
      const v = nearestFree(s, type, best);
      if (!v) break;
      sendTo(s, v, best, H);
      moved++;
    }
  }
  return moved;
}

/* ---------------- Real-game hooks ---------------- */

export const HOOKS = {
  dispatch(s, v) {
    emit('dispatch', { vehicleId: v.id, type: v.type, sectorId: v.sector, from: v.from, eta: v.eta });
    sfx('dispatch', v.type);
  },
  arrive(s, v) {
    emit('arrive', { vehicleId: v.id, type: v.type, sectorId: v.sector });
    if (s.progress.ftue === 'fire' && v.type === 'fire') say(s, 'nevin', FTUE_COPY.fire.npc);
  },
  ret(s, v, sectorId) {
    emit('return', { vehicleId: v.id, sectorId });
  },
  park(s, v) {
    emit('park', { vehicleId: v.id });
  },
  rubbled(s, sec, before, after) {
    if (!sec.rubbleMax) return;
    const a = before / sec.rubbleMax;
    const b = after / sec.rubbleMax;
    if ((a > 2 / 3 && b <= 2 / 3) || (a > 1 / 3 && b <= 1 / 3)) sfx('thud');
  },
  carved(s, sec, amt) {
    yieldParts(s, sec, amt);
  },
  stage(s, sec, stage) {
    emit('stage-done', { sectorId: sec.id, stage });
    if (stage === 'fire') {
      sfx('hiss');
      sfx('done');
      float(sec.id, FLOAT.fireOut, 'stage');
    } else if (stage === 'rubble') {
      sfx('done');
      float(sec.id, FLOAT.roadOpen, 'stage');
    } else {
      if (sec.seg === 'head') headDone(s, sec);
    }
  },
};

/* ---------------- Yields ---------------- */

function givePart(s, sec, item, n = 1) {
  s.inv[item] += n;
  s.stats.parts += n;
  if (s.contract) s.contract.parts[item] = (s.contract.parts[item] || 0) + n;
  let vid = null;
  for (const v of s.fleet) if (v.state === 'working' && v.sector === sec.id && v.type === 'carve') vid = v.id;
  for (let i = 0; i < n; i++) emit('part', { sectorId: sec.id, vehicleId: vid, item });
  if (s.clock - s.acc.partSfx >= 0.12) {
    s.acc.partSfx = s.clock;
    sfx('part');
  }
  float(sec.id, FLOAT.part(item, n), 'part');
  if (s.progress.ftue === 'carve' && !s.acc.firstCrate) {
    s.acc.firstCrate = 1;
    say(s, 'nevin', FTUE_COPY.carve.npc);
  }
}

export function yieldParts(s, sec, amt) {
  const a = s.attack;
  if (a && a.script === 'c1' && s.phase === 'cleanup') {
    // scripted FTUE yields: Pul 3, Magma özü 2, Kemik 2 spread evenly over the carve, Göz at the end
    const list = BAL.ftueYields;
    const f = sec.corpseMax > 0 ? 1 - sec.corpse / sec.corpseMax : 1;
    const due = Math.min(list.length, Math.floor(f * (list.length + 1) + 1e-6));
    while ((a.ftueYield || 0) < due) {
      givePart(s, sec, list[a.ftueYield || 0]);
      a.ftueYield = (a.ftueYield || 0) + 1;
    }
    return;
  }
  const mult = a && a.mutant ? BAL.mutantYield : 1;
  for (const k of RAW) {
    s.yieldAcc[k] += amt * BAL.yields[k] * mult;
    if (s.yieldAcc[k] >= 1) {
      const n = Math.floor(s.yieldAcc[k]);
      s.yieldAcc[k] -= n;
      givePart(s, sec, k, n);
    }
  }
}

function headDone(s, sec) {
  const a = s.attack;
  if (a && a.script === 'c1') {
    while ((a.ftueYield || 0) < BAL.ftueYields.length) {
      givePart(s, sec, BAL.ftueYields[a.ftueYield || 0]);
      a.ftueYield = (a.ftueYield || 0) + 1;
    }
  }
  const eyes = a && a.mutant ? 2 : 1;
  givePart(s, sec, 'eye', eyes);
  emit('rare', { sectorId: sec.id, item: 'eye' });
  sfx('rare');
  // DNA: first guaranteed from contract #7, then 25 % per head once G13 is done (DESIGN §6.1)
  const n = a ? a.n : 0;
  let dna = false;
  if (!s.flags.dnaGuarantee && n >= BAL.dnaFromContract) dna = true;
  else if (s.progress.unlocked.dna && rand() < BAL.dnaChance) dna = true;
  if (dna) {
    s.flags.dnaGuarantee = true;
    s.dna += 1;
    if (s.contract) s.contract.parts.dna = (s.contract.parts.dna || 0) + 1;
    emit('rare', { sectorId: sec.id, item: 'dna' });
    sfx('mystery');
    toast(TOAST.dna, 'good');
  }
}

/* ---------------- Calm / radar ---------------- */

export function calmLength(s) {
  const u = s.progress.unlocked;
  if (u.upkeep && u.offers) return BAL.calmFull;
  return s.progress.contractNo + 1 <= 4 ? BAL.calmEarly : BAL.calmLate;
}

export function startCalm(s, len = calmLength(s)) {
  setPhase(s, 'calm');
  s.timer = len;
  s.timerMax = len;
  s.news.fillerT = Math.min(s.news.fillerT, BAL.fillerEvery);
  if (s.dna > 0 && !s.notices.some((n) => n.kind === 'buyer')) {
    s.flags.buyerAt = s.clock + len * 0.3;
    s.flags.buyerOffer = Math.round((2400 + 260 * Math.max(7, s.progress.contractNo)) / 50) * 50;
  }
}

export function radarRuns(s) {
  if (s.phase !== 'calm' || s.result) return false;
  const f = s.progress.ftue;
  if (f !== 'cold' && f !== 'done') return false;
  for (const n of s.notices) if (n.kind === 'buyer' || n.kind === 'chapter') return false;
  return true;
}

function calmStep(s, dt) {
  if (s.flags.buyerAt != null && s.clock >= s.flags.buyerAt && !s.result) {
    s.flags.buyerAt = null;
    if (s.dna > 0 && !s.notices.some((n) => n.kind === 'buyer')) {
      pushNotice(s, 'buyer', { offer: s.flags.buyerOffer });
      sfx('mystery');
    }
  }
  if (!radarRuns(s)) return;
  s.timer -= dt;
  if (s.timer <= 0) {
    s.timer = 0;
    startAttack(s);
  }
}

/* ---------------- Attack ---------------- */

function randomChain(len) {
  if (len === 1) return [randInt(0, 5)];
  return (len === 3 ? pick(CHAINS3) : pick(CHAINS2)).slice();
}

export function startAttack(s) {
  s.progress.contractNo += 1;
  const n = s.progress.contractNo;
  const script = n === 1 ? 'c1' : n === 2 ? 'c2' : n === 3 ? 'c3' : null;
  const L = Math.max(1, n - 1);
  const mutant = !script && !!s.flags.mutantNext;
  s.flags.mutantNext = false;
  const mon = MONSTERS.magmadon;
  let chain;
  let extra;
  if (script === 'c1' || script === 'c2') {
    chain = SCRIPTS[script].chain.slice();
    extra = SCRIPTS[script].extra.slice();
  } else {
    chain = randomChain(L >= 3 || mutant ? 3 : 2);
    const others = shuffle(DISTRICTS.map((d) => d.id).filter((i) => !chain.includes(i)));
    extra = others.slice(0, script === 'c3' ? 1 : L >= 2 ? 2 : 1);
  }
  const size = (1 + 0.35 * (L - 1)) * (mutant ? 1.45 : 1);
  const segments = {};
  chain.forEach((id, k) => { segments[id] = SEGS[k]; });
  const first = n === 1;
  const pre = first ? ATTACK.preFirst : ATTACK.pre;
  s.attack = {
    n, L, t: -pre, hit: false, first, pre, end: first ? ATTACK.endFirst : ATTACK.end,
    monster: 'magmadon', mutant, chain, segments, sectors: [...chain, ...extra],
    corpseTotal: script === 'c1' ? SCRIPTS.c1.corpse : script === 'c2' ? SCRIPTS.c2.corpse
      : script === 'c3' ? SCRIPTS.c3.corpse : mon.corpse * size,
    rubbleTotal: script === 'c1' ? 14 : script === 'c2' ? 70 : script === 'c3' ? SCRIPTS.c3.rubble : mon.rubble * size,
    script, skip: false, ftueYield: 0, spreadScripted: false,
  };
  s.stats.attacks += 1;
  setPhase(s, 'attack');
  emit('attack-start', { n, monster: 'magmadon', mutant, chain, segments, sectors: s.attack.sectors, first });
  headline(s, mutant ? NEWS.mutant : NEWS.attack, 'attack');
}

export function applyHit(s) {
  const a = s.attack;
  a.hit = true;
  const sc = a.script && SCRIPTS[a.script];
  const inChain = new Set(a.chain);
  // rubble
  if (a.script === 'c1' || a.script === 'c2') {
    for (const id of a.sectors) setRubble(s.sectors[id], sc.rubble[id] || 0);
  } else {
    const w = a.sectors.map((id) => (inChain.has(id) ? 2 : 1) * randRange(0.85, 1.15));
    const sum = w.reduce((x, y) => x + y, 0);
    a.sectors.forEach((id, k) => setRubble(s.sectors[id], a.rubbleTotal * (w[k] / sum)));
  }
  // carcass
  const shares = SHARES[a.chain.length];
  a.chain.forEach((id, k) => {
    const sec = s.sectors[id];
    sec.corpse = a.corpseTotal * shares[k];
    sec.corpseMax = sec.corpse;
    sec.seg = SEGS[k];
    sec.stages.carve = sec.corpse > 0;
  });
  // fires
  if (a.script === 'c1' || a.script === 'c2') {
    for (const id in sc.fires) setFire(s.sectors[id], sc.fires[id]);
  } else if (a.script === 'c3') {
    for (const id of a.chain) setFire(s.sectors[id], SCRIPTS.c3.fires);
  } else {
    const nf = Math.min(a.sectors.length, (a.L >= 2 ? 2 : 1) + (a.mutant ? 1 : 0) + (a.L >= 5 ? 1 : 0));
    for (const id of shuffle(a.sectors.slice()).slice(0, nf)) setFire(s.sectors[id], randRange(60, 100));
  }
  for (const id of a.sectors) s.sectors[id].damaged = true;
  emit('hit', { chain: a.chain, sectors: a.sectors });
}

function setRubble(sec, t) {
  sec.rubble = t;
  sec.rubbleMax = t;
  sec.stages.rubble = t > 0;
}

function setFire(sec, f) {
  sec.fire = f;
  sec.fire0 = f;
  sec.stages.fire = f > 0;
}

function resetSectorJob(sec) {
  sec.fire = 0;
  sec.fire0 = 0;
  sec.rubble = 0;
  sec.rubbleMax = 0;
  sec.corpse = 0;
  sec.corpseMax = 0;
  sec.seg = null;
  sec.stages.fire = false;
  sec.stages.rubble = false;
  sec.stages.carve = false;
  sec.spreadT = 0;
  sec.warnT = 0;
  sec.warnTo = null;
  sec.paused = false;
  sec.rival = false;
}

function attackStep(s, dt) {
  const a = s.attack;
  const wasHit = a.hit;
  a.t += dt;
  if (!a.hit && a.t >= ATTACK.hit) {
    for (const sec of s.sectors) resetSectorJob(sec);
    applyHit(s);
  }
  if (a.skip && wasHit) a.t = Math.max(a.t, a.end);
  if (a.hit && a.t >= a.end) openOffer(s);
}

/** After the attack: a direct call or a tender (ARCH §2.2, §3.3). */
export function openOffer(s) {
  const a = s.attack;
  const n = a.n;
  const est = estimate(s);
  const value = contractValue(s);
  const tend = rivalTendency(s);
  const t = {
    kind: 'call', no: n, value, baseDeadline: baseDeadlineFor(s, est),
    estimate: est, rivalBias: tend, sel: { price: 1, speed: 1 }, rec: null, call: null, reveal: null,
  };
  if (n >= 3 && s.progress.unlocked.tender) {
    t.kind = 'bid';
    const rec = recommendedCell(s, t);
    if (rec) {
      t.rec = rec;
      t.sel = { price: rec.price, speed: rec.speed };
    }
  } else if (a.script === 'c1' || a.script === 'c2') {
    t.call = { pay: SCRIPTS[a.script].pay, deadline: SCRIPTS[a.script].deadline };
  } else {
    t.call = { pay: value, deadline: Math.round(est.mid * 1.3) };
  }
  s.tender = t;
  setPhase(s, 'tender');
  if (t.kind === 'call') {
    emit('call', { no: n });
    sfx('radar');
  } else {
    emit('tender-open', { no: n });
    sfx('radar');
  }
}

/* ---------------- Contract ---------------- */

export function startContract(s, kind, pay, deadline) {
  const a = s.attack;
  s.contract = {
    no: a.n, kind, pay, deadline, elapsed: 0, zone: 'gold', sectors: a.sectors.slice(), parts: {},
    w90: false, tickT: 0, idleT: 0,
  };
  s.tender = null;
  setPhase(s, 'cleanup');
  emit('contract-start', { no: a.n, kind, pay, deadline, sectors: s.contract.sectors.slice() });
}

function spreadStep(s, dt) {
  const job = s.contract.sectors;
  for (const id of job) {
    const sec = s.sectors[id];
    if (sec.fire < BAL.spreadFire) {
      if (sec.warnTo != null) cancelWarn(s, sec);
      sec.spreadT = 0;
      continue;
    }
    if (assigned(s, id, 'fire') > 0) {
      if (sec.warnTo != null) cancelWarn(s, sec);
      sec.spreadT = 0;
      continue;
    }
    if (sec.warnTo == null) {
      sec.spreadT += dt;
      if (sec.spreadT >= BAL.spreadUnattended) {
        const to = spreadTarget(s, sec);
        if (to != null) {
          sec.warnTo = to;
          sec.warnT = BAL.spreadWarn;
          emit('spread-warn', { from: id, to, t: BAL.spreadWarn });
          sfx('tick');
          if (!s.progress.tips.spread) {
            s.progress.tips.spread = true;
            say(s, 'nevin', `${DISTRICTS[id].locAdj} yangın ${DISTRICTS[to].dat} sıçramak üzere.`);
          }
        }
      }
    } else {
      const before = sec.warnT;
      sec.warnT -= dt;
      if (Math.ceil(sec.warnT) < Math.ceil(before) && sec.warnT > 0) sfx('tick');
      if (sec.warnT <= 0) doSpread(s, sec);
    }
  }
}

function spreadTarget(s, sec) {
  const a = s.attack;
  const sc = a && a.script ? SCRIPTS[a.script] : null;
  if (sc && sc.spreadTo != null && !a.spreadScripted && neighbours(sec.id).includes(sc.spreadTo)) {
    const t = s.sectors[sc.spreadTo];
    if (t.fire <= 0 && !t.rival) return sc.spreadTo;
  }
  const cands = neighbours(sec.id).filter((id) => s.sectors[id].fire <= 0 && !s.sectors[id].rival);
  if (!cands.length) return null;
  const withWork = cands.filter((id) => s.sectors[id].rubble > 0 || s.sectors[id].corpse > 0);
  const list = withWork.length ? withWork : cands;
  return list[Math.floor(rand() * list.length)];
}

function cancelWarn(s, sec) {
  emit('spread-cancel', { from: sec.id, to: sec.warnTo });
  sec.warnTo = null;
  sec.warnT = 0;
}

function doSpread(s, sec) {
  const to = sec.warnTo;
  const t = s.sectors[to];
  sec.warnTo = null;
  sec.warnT = 0;
  sec.spreadT = 0;
  if (s.attack) s.attack.spreadScripted = true;
  if (t.fire > 0) return;
  t.fire = BAL.spreadNew;
  t.fire0 = BAL.spreadNew;
  t.stages.fire = true;
  t.damaged = true;
  if (!s.contract.sectors.includes(to)) s.contract.sectors.push(to);
  emit('spread', { from: sec.id, to });
  sfx('fireSpread');
  float(to, FLOAT.spread, 'spread');
  headline(s, NEWS.spread(sec.id, to), 'spread');
}

function zoneStep(s, dt) {
  const c = s.contract;
  const r = c.elapsed / c.deadline;
  const zone = r <= BAL.earlyRatio ? 'gold' : r <= 1 ? 'white' : 'late';
  if (zone !== c.zone) {
    if (c.zone === 'gold') emit('deadline-zone', { zone: 'gold-end' });
    if (zone === 'late') {
      emit('deadline-zone', { zone: 'late' });
      sfx('late');
    }
    c.zone = zone;
  }
  if (!c.w90 && r >= 0.9) {
    c.w90 = true;
    c.tickT = 0;
    emit('deadline-zone', { zone: 'warn90' });
  }
  if (c.w90 && r <= 1) {
    c.tickT -= dt;
    if (c.tickT <= 0) {
      c.tickT = 2;
      sfx('tick');
    }
  }
}

function cleanCheck(s, ids) {
  for (const id of ids) {
    const sec = s.sectors[id];
    if (!sec.damaged || !isClean(sec)) continue;
    sec.damaged = false;
    sec.seg = null;
    sec.spreadT = 0;
    sec.paused = false;
    if (sec.warnTo != null) cancelWarn(s, sec);
    emit('clean', { sectorId: id });
    sfx('done');
    float(id, FLOAT.clean, 'clean');
  }
}

function updatePaused(s) {
  for (const sec of s.sectors) {
    let p = false;
    if (sec.fire > 0) {
      for (const v of s.fleet) {
        if (v.sector === sec.id && v.type !== 'fire' && (v.state === 'working' || v.state === 'enroute')) {
          p = true;
          break;
        }
      }
    }
    sec.paused = p;
  }
}

function cleanupStep(s, dt) {
  const c = s.contract;
  c.elapsed += dt;
  c.idleT += dt;
  spreadStep(s, dt);
  workStep(s, dt, HOOKS);
  cleanCheck(s, c.sectors);
  zoneStep(s, dt);
  for (const id of c.sectors) if (!isClean(s.sectors[id])) return;
  finishContract(s);
}

export function gradeFor(c) {
  const ratio = c.elapsed / c.deadline;
  let pay = c.pay;
  let bonus = 0;
  let trustD;
  let grade;
  if (ratio <= BAL.earlyRatio) {
    grade = 'early';
    bonus = Math.round(pay * BAL.earlyBonus);
    trustD = BAL.trustEarly;
  } else if (ratio <= 1) {
    grade = 'ontime';
    trustD = BAL.trustOnTime;
  } else {
    grade = 'late';
    pay = Math.round(pay * Math.max(BAL.lateFloor, 1 - (c.elapsed - c.deadline) / c.deadline));
    trustD = BAL.trustLate;
  }
  return { grade, pay, bonus, cut: c.pay - pay, trustD, ratio };
}

export function finishContract(s) {
  const c = s.contract;
  const g = gradeFor(c);
  s.trust = clamp(s.trust + g.trustD, 0, 100);
  s.stats.contracts += 1;
  if (g.grade === 'early') {
    s.stats.early += 1;
    if (c.no > 1) s.stats.gold += 1;
  }
  s.stats.fastest = s.stats.fastest ? Math.min(s.stats.fastest, c.elapsed) : c.elapsed;
  s.result = {
    no: c.no, grade: g.grade, elapsed: c.elapsed, deadline: c.deadline, pay: g.pay, bonus: g.bonus, cut: g.cut,
    trustD: g.trustD, parts: { ...c.parts }, districts: c.sectors.slice(), kind: c.kind,
  };
  const last = c.sectors[c.sectors.length - 1];
  headline(s, g.grade === 'early' ? NEWS.early(c.elapsed) : g.grade === 'ontime' ? NEWS.ontime(last) : NEWS.late, g.grade);
  emit('contract-done', { no: c.no, grade: g.grade, elapsed: c.elapsed, deadline: c.deadline });
  sfx(g.grade === 'early' ? 'record' : g.grade === 'ontime' ? 'win' : 'late');
  for (const v of s.fleet) if (v.state === 'working' || v.state === 'enroute') sendHome(s, v, HOOKS);
  s.contract = null;
  s.timer = calmLength(s);
  s.timerMax = s.timer;
  setPhase(s, 'calm');
}

/* ---------------- Rival phase ("Kuyruk sende") ---------------- */

export function startRival(s, takeTail) {
  const a = s.attack;
  const tail = takeTail && a.chain.length > 1 ? a.chain[a.chain.length - 1] : null;
  s.rival.t = 0;
  s.rival.T = BAL.rivalTime;
  s.rival.tail = tail;
  s.rival.init = {};
  s.rival.fleet = [];
  let rn = 1;
  for (const id of a.sectors) {
    const sec = s.sectors[id];
    if (id === tail) {
      // Süpürge clears the access; the carcass is yours
      if (sec.fire > 0) {
        sec.fire = 0;
        emit('stage-done', { sectorId: id, stage: 'fire' });
      }
      if (sec.rubble > 0) {
        sec.rubble = 0;
        emit('stage-done', { sectorId: id, stage: 'rubble' });
      }
      continue;
    }
    sec.rival = true;
    s.rival.init[id] = [sec.fire, sec.rubble, sec.corpse];
    for (const type of CREW_TYPES) {
      if (sec[workKey(type)] <= 0) continue;
      const eta = 3 + 0.5 * DISTRICTS[id].row;
      s.rival.fleet.push({ id: 'r' + rn++, type, state: 'enroute', sector: id, from: 'rival', eta, eta0: eta, bay: 0, seq: 1 });
    }
  }
  s.tender = null;
  setPhase(s, 'rival');
  emit('rival-start', { tail });
}

export function releaseTailNow(s) {
  const tail = s.rival.tail;
  if (tail == null) return;
  const sec = s.sectors[tail];
  for (const v of s.fleet) if (v.sector === tail && (v.state === 'working' || v.state === 'enroute')) sendHome(s, v, HOOKS);
  s.rival.tail = null;
  if (sec.corpse > 0) {
    const p = clamp(s.rival.t / s.rival.T, 0, 0.999);
    sec.rival = true;
    s.rival.init[tail] = [0, 0, sec.corpse / (1 - p)];
    const eta = 3;
    s.rival.fleet.push({ id: 'r' + (s.rival.fleet.length + 1), type: 'carve', state: 'enroute', sector: tail, from: 'rival', eta, eta0: eta, bay: 0, seq: 1 });
  }
}

function rivalStep(s, dt) {
  const r = s.rival;
  const wasDone = r.t >= r.T;
  r.t = Math.min(r.T, r.t + dt);
  const p = r.t / r.T;
  for (const rv of r.fleet) {
    if (rv.state === 'enroute' || rv.state === 'returning') {
      rv.eta -= dt;
      if (rv.eta <= 0) {
        rv.eta = 0;
        rv.state = rv.state === 'enroute' ? 'working' : 'gone';
      }
    }
  }
  if (!wasDone) {
    for (const id in r.init) {
      const sec = s.sectors[id];
      const [f, rb, c] = r.init[id];
      sec.fire = f * (1 - p);
      sec.rubble = rb * (1 - p);
      sec.corpse = c * (1 - p);
    }
    if (p >= 1) rivalDone(s);
  }
  for (const v of r.fleet) {
    if (v.state === 'gone') {
      r.fleet = r.fleet.filter((x) => x.state !== 'gone');
      break;
    }
  }
  if (r.tail != null) {
    workStep(s, dt, HOOKS);
    cleanCheck(s, [r.tail]);
    if (isClean(s.sectors[r.tail])) r.tail = null;
  } else {
    workStep(s, dt, HOOKS);
  }
  if (r.t >= r.T && r.tail == null) endRival(s);
}

function rivalDone(s) {
  const r = s.rival;
  const ids = Object.keys(r.init).map(Number);
  for (const id of ids) {
    const sec = s.sectors[id];
    sec.fire = 0;
    sec.rubble = 0;
    sec.corpse = 0;
    sec.rival = false;
  }
  cleanCheck(s, ids);
  for (const rv of r.fleet) {
    rv.state = 'returning';
    rv.from = rv.sector;
    rv.sector = null;
    rv.eta = 3;
    rv.eta0 = 3;
    rv.seq += 1;
  }
  for (const k of RAW) s.market[k].m = clamp(s.market[k].m * BAL.rivalDump, BAL.driftMin, BAL.driftMax);
  for (const o of s.offers) o.unit = Math.max(1, Math.round(o.unit * 0.9));
  headline(s, NEWS.rivalDump, 'rival');
  emit('rival-done', {});
}

function endRival(s) {
  for (const sec of s.sectors) sec.rival = false;
  for (const v of s.fleet) if (v.state === 'working' || v.state === 'enroute') sendHome(s, v, HOOKS);
  startCalm(s);
}

/* ---------------- Economy ---------------- */

export const basePrice = (s, item) => ITEMS[item].base * (ftueDone(s) ? s.market[item].m : 1);

/** Rıza's next unit price for an item (DESIGN §6.1): 60 % of base × drift × (1 − drop). */
export function rizaUnit(s, item, extraDrop = 0) {
  const drop = ftueDone(s) ? Math.min(BAL.rizaMaxDrop, s.riza.drop[item] + extraDrop) : 0;
  return ITEMS[item].base * BAL.rizaFactor * (ftueDone(s) ? s.market[item].m : 1) * (1 - drop);
}

/** Total Rıza pays for qty units (elasticity applied per unit). */
export function rizaTotal(s, item, qty) {
  let t = 0;
  for (let i = 0; i < qty; i++) t += rizaUnit(s, item, i * BAL.rizaDrop);
  return t;
}

export function rizaAll(s) {
  let total = 0;
  let qty = 0;
  for (const k of ITEM_KEYS) {
    const n = s.inv[k];
    if (n > 0) {
      total += rizaTotal(s, k, n);
      qty += n;
    }
  }
  return { total: Math.round(total), qty };
}

export function sellToRiza(s, item, qty) {
  const total = rizaTotal(s, item, qty);
  s.inv[item] -= qty;
  if (ftueDone(s)) {
    s.riza.drop[item] = Math.min(BAL.rizaMaxDrop, s.riza.drop[item] + qty * BAL.rizaDrop);
    s.riza.rec[item] = s.riza.drop[item] / BAL.rizaRecover;
  }
  return total;
}

export function credit(s, amount) {
  s.money += amount;
  s.stats.earned += amount;
}

export function upkeepRate(s) {
  let r = 0;
  for (const sec of s.sectors) if (!sec.damaged) r += sec.upkeep * BAL.upkeepRate;
  return r;
}

export const upkeepCost = (tier) => round10(BAL.upkeepBase * Math.pow(BAL.upkeepMult, tier));
export const upkeepCap = (s) => (s.progress.unlocked.tierCap4 ? BAL.upkeepCap4 : BAL.upkeepCap);
export const lineCount = (s) => 1 + s.upgrades.lines;

function marketStep(s, dt) {
  const acc = s.acc;
  for (const k of ITEM_KEYS) {
    const d = s.riza.drop[k];
    if (d > 0) {
      s.riza.drop[k] = Math.max(0, d - s.riza.rec[k] * dt);
      if (s.riza.drop[k] === 0) s.riza.rec[k] = 0;
    }
  }
  if (!ftueDone(s)) return;
  acc.market += dt;
  if (acc.market >= BAL.driftEvery) {
    acc.market -= BAL.driftEvery;
    for (const k of ITEM_KEYS) {
      const m = s.market[k];
      m.m = clamp(m.m + (1 - m.m) * 0.05 + (rand() - 0.5) * 0.03, BAL.driftMin, BAL.driftMax);
    }
  }
  acc.hist += dt;
  if (acc.hist >= BAL.histEvery) {
    acc.hist -= BAL.histEvery;
    for (const k of ITEM_KEYS) {
      const h = s.market[k].hist;
      h.push(s.market[k].m);
      if (h.length > 24) h.shift();
    }
  }
}

function offerItems(s) {
  const out = ['scale', 'blood', 'bone', 'eye'];
  for (const r of RECIPES) if (s.progress.recipes[r.id]) out.push(r.out);
  return out;
}

export function spawnOffer(s, forceItem) {
  const items = offerItems(s);
  const stocked = items.filter((k) => s.inv[k] > 0 && !s.offers.some((o) => o.item === k));
  const fresh = items.filter((k) => !s.offers.some((o) => o.item === k));
  const pool = stocked.length && rand() < 0.7 ? stocked : fresh.length ? fresh : items;
  const item = forceItem || pick(pool);
  const boom = rand() < 0.15;
  const mult = boom ? randRange(1.6, 1.8) : randRange(1.0, 1.45);
  const it = ITEMS[item];
  const qty = item === 'relic' ? 1 : item === 'eye' ? randInt(1, 2) : it.product ? randInt(2, 5) : randInt(4, 10);
  const life = boom ? BAL.offerMin : randRange(BAL.offerMin, BAL.offerMax);
  const o = {
    id: 'o' + s.nextId++, buyer: BUYERS.offer[item], item, qty,
    unit: Math.max(1, Math.round(basePrice(s, item) * mult)), until: s.clock + life, life, boom,
  };
  s.offers.push(o);
  emit('offer', { offerId: o.id });
  if (boom) headline(s, NEWS.boom[item], 'offer');
  return o;
}

function offersStep(s, dt) {
  for (let i = s.offers.length - 1; i >= 0; i--) {
    if (s.clock >= s.offers[i].until) {
      const o = s.offers[i];
      s.offers.splice(i, 1);
      emit('offer-expired', { offerId: o.id });
    }
  }
  if (!s.progress.unlocked.offers || s.phase === 'attack') return;
  s.acc.offer += dt;
  if (s.offers.length < 2 || (s.acc.offer >= BAL.offerEvery && s.offers.length < BAL.offerMaxCount)) {
    s.acc.offer = 0;
    spawnOffer(s);
  }
}

export function startJobNow(s, rid) {
  const r = recipeById(rid);
  const used = new Set(s.jobs.map((j) => j.line));
  let line = 0;
  while (used.has(line)) line++;
  for (const k in r.in) s.inv[k] -= r.in[k];
  const j = { id: 'j' + s.nextId++, rid, line, start: s.clock, end: s.clock + r.time };
  s.jobs.push(j);
  emit('factory-start', { jobId: j.id, rid, line });
  return j;
}

export function canStartJob(s, rid) {
  const r = recipeById(rid);
  if (!r) return { ok: false, code: 'locked' };
  if (!s.progress.unlocked.factory || !s.progress.recipes[rid]) return { ok: false, code: 'locked' };
  if (s.jobs.length >= lineCount(s)) return { ok: false, code: 'linesFull' };
  for (const k in r.in) if (s.inv[k] < r.in[k]) return { ok: false, code: 'material', n: r.in[k] - s.inv[k], item: k };
  return { ok: true };
}

function jobsStep(s) {
  for (let i = s.jobs.length - 1; i >= 0; i--) {
    const j = s.jobs[i];
    if (s.clock < j.end) continue;
    const r = recipeById(j.rid);
    s.jobs.splice(i, 1);
    s.inv[r.out] += 1;
    s.stats.made += 1;
    emit('factory-done', { jobId: j.id, rid: j.rid, line: j.line });
    sfx('factory');
    toast(TOAST.factoryDone(r.out), 'good');
    if (s.autoJobs[r.id] && s.progress.unlocked.autoRepeat && canStartJob(s, r.id).ok) startJobNow(s, r.id);
  }
}

function upkeepStep(s, dt) {
  const r = upkeepRate(s);
  if (r <= 0) return;
  const amt = r * dt;
  credit(s, amt);
  s.acc.incomeAmt += amt;
  s.acc.income += dt;
  if (s.acc.income >= BAL.incomeEvery) {
    s.acc.income -= BAL.incomeEvery;
    const a = s.acc.incomeAmt;
    s.acc.incomeAmt = 0;
    emit('income', { amount: a });
    float(null, FLOAT.income(a), 'income');
  }
}

function newsStep(s, dt) {
  if (s.news.current && s.clock >= s.news.current.until) s.news.current = null;
  if (s.npc && s.clock >= s.npc.until) s.npc = null;
  if (s.phase !== 'calm' || !ftueDone(s) || s.result) return;
  s.news.fillerT -= dt;
  if (s.news.fillerT <= 0) {
    s.news.fillerT = BAL.fillerEvery;
    const list = NEWS.filler.slice();
    if (s.flags.dnaSold) list.push(NEWS.fillerMutant);
    const recent = s.news.archive.slice(0, 4);
    const pool = list.filter((x) => !recent.includes(x));
    headline(s, pick(pool.length ? pool : list), 'filler');
  }
}

function foremanStep(s, dt) {
  if (!s.upgrades.foreman) return;
  const ids = jobSectors(s);
  if (!ids.length) return;
  s.acc.foreman += dt;
  if (s.acc.foreman < BAL.foremanEvery) return;
  s.acc.foreman = 0;
  const n = greedyDispatch(s, ids, HOOKS);
  if (n > 0 && s.contract && !s.contract.foremanToast) {
    s.contract.foremanToast = true;
    toast(TOAST.foreman(n), 'good');
  }
}

/* ---------------- Tick ---------------- */

function step(s, dt) {
  s.clock += dt;
  marketStep(s, dt);
  offersStep(s, dt);
  jobsStep(s);
  upkeepStep(s, dt);
  newsStep(s, dt);
  switch (s.phase) {
    case 'calm':
      workStep(s, dt, HOOKS); // vehicles still driving home
      calmStep(s, dt);
      break;
    case 'attack':
      workStep(s, dt, HOOKS);
      attackStep(s, dt);
      break;
    case 'tender':
      workStep(s, dt, HOOKS);
      break;
    case 'cleanup':
      cleanupStep(s, dt);
      break;
    case 'rival':
      rivalStep(s, dt);
      break;
    default:
      break;
  }
  foremanStep(s, dt);
  updatePaused(s);
  rebuildCrews(s);
  post(s);
}

/** FTUE and goal bookkeeping (also run after every action). */
export function post(s) {
  ftueAdvance(s);
  checkGoals(s);
}

/** Advances the game: clamps dt to 0.1 s and substeps at ≤ 0.05 s. */
export function tick(s, dt) {
  let d = Math.min(0.1, Math.max(0, Number(dt) || 0));
  if (d <= 0) return;
  const n = Math.ceil(d / 0.05 - 1e-9);
  const h = d / n;
  for (let i = 0; i < n; i++) step(s, h);
}

/** Offline time (ARCH §4.1): queues an 'offline' notice after G7; shortens the radar; never advances a contract. */
export function applyOffline(s, seconds) {
  const sec = Math.max(0, Number(seconds) || 0);
  if (sec <= 0) return 0;
  if (s.phase === 'calm' && radarRuns(s)) s.timer = Math.max(BAL.offlineMinTimer, s.timer - sec);
  if (!s.progress.unlocked.offline) return 0;
  const t = Math.min(sec, BAL.offlineCap);
  const amount = Math.round(upkeepRate(s) * t * BAL.offlineRate);
  if (amount <= 0) return 0;
  const prev = s.notices.find((n) => n.kind === 'offline');
  if (prev) {
    prev.data.amount += amount;
    prev.data.seconds += sec;
  } else {
    pushNotice(s, 'offline', { amount, seconds: sec });
  }
  return amount;
}

export { TENDER };
