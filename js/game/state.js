// Aftermath v2: state shape, save/load (ARCH §3). v1 save is only detected, never written.
import { DISTRICTS, ITEM_KEYS, RECIPES, BAL, START_FLEET, ATTACK } from './data.js';

export const SAVE_KEY = 'aftermath.save.v2';
export const V1_KEY = 'aftermath.save.v1';

function newSector(id) {
  return {
    id,
    fire: 0, fire0: 0,
    rubble: 0, rubbleMax: 0,
    corpse: 0, corpseMax: 0,
    seg: null,
    stages: { fire: false, rubble: false, carve: false },
    damaged: false,
    spreadT: 0,
    warnT: 0, warnTo: null,
    paused: false,
    rival: false,
    upkeep: 0,
    crews: { fire: 0, debris: 0, carve: 0 },
  };
}

export function newVehicle(id, type, bay) {
  return { id, type, state: 'yard', sector: null, from: 'yard', eta: 0, eta0: 0, bay, seq: 0 };
}

export function newState() {
  const market = {};
  const drop = {};
  const rec = {};
  for (const k of ITEM_KEYS) {
    market[k] = { m: 1, hist: Array(24).fill(1) };
    drop[k] = 0;
    rec[k] = 0;
  }
  const fleet = START_FLEET.map((type, i) => newVehicle('v' + (i + 1), type, i));
  return {
    v: 2,
    clock: 0,
    money: BAL.startMoney,
    trust: BAL.startTrust,
    rivalTrust: BAL.startRivalTrust,
    phase: 'calm',
    timer: BAL.firstTimer,
    timerMax: BAL.calmFtue,
    progress: {
      ftue: 'cold',
      goal: 'G1',
      goalsDone: [],
      goalT: 0,
      goalBase: { offerSold: 0, gold: 0 },
      contractNo: 0,
      unlocked: {
        depot: false, company: false, factory: false, tender: false, upkeep: false, offline: false,
        offers: false, equipment: false, line2: false, foreman: false, autoRepeat: false,
        dna: false, tierCap4: false,
      },
      recipes: { concrete: false, armor: false, cell: false, relic: false },
      seen: { depot: false, company: false, factory: false },
      tips: { zones: false, spread: false, tenderBubble: 0, redConfirm: false },
    },
    sectors: DISTRICTS.map((d) => newSector(d.id)),
    fleet,
    nextId: fleet.length + 1,
    rival: { fleet: [], t: 0, T: BAL.rivalTime, tail: null, lossStreak: 0, rivalLosses: 0, init: {} },
    inv: Object.fromEntries(ITEM_KEYS.map((k) => [k, 0])),
    dna: 0,
    yieldAcc: { scale: 0, blood: 0, bone: 0 },
    market,
    riza: { drop, rec },
    offers: [],
    jobs: [],
    autoJobs: Object.fromEntries(RECIPES.map((r) => [r.id, false])),
    upgrades: { speed: 0, lines: 0, foreman: false },
    attack: null,
    tender: null,
    contract: null,
    result: null,
    flags: {
      mutantNext: false, buyerAt: null, buyerOffer: 0, v1Notice: false,
      dnaGuarantee: false, chapterEnd: false, dnaSold: false, buyerDecided: false,
    },
    news: { current: null, archive: [], fillerT: BAL.fillerEvery },
    npc: null,
    notices: [],
    stats: { contracts: 0, lost: 0, attacks: 0, parts: 0, earned: 0, sold: 0, offerSold: 0, early: 0, fastest: 0, won: 0, made: 0, gold: 0 },
    acc: { market: 0, hist: 0, offer: 0, income: 0, incomeAmt: 0, foreman: 0, partSfx: -1, firstCrate: 0 },
    lastSave: 0,
  };
}

function isObj(x) {
  return x && typeof x === 'object' && !Array.isArray(x);
}

/** Deep-merges `saved` onto `base` (objects merge, arrays and scalars replace). */
function merge(base, saved) {
  for (const k in saved) {
    const b = base[k];
    const v = saved[k];
    if (isObj(b) && isObj(v)) base[k] = merge(b, v);
    else base[k] = v;
  }
  return base;
}

/** Repairs a loaded state so it can resume (ARCH §3.2). */
export function normalize(s) {
  const fresh = newState();
  // sectors: always 6, each fully shaped
  if (!Array.isArray(s.sectors) || s.sectors.length !== 6) s.sectors = fresh.sectors;
  s.sectors = s.sectors.map((sec, i) => merge(newSector(i), sec || {}));
  s.sectors.forEach((sec, i) => { sec.id = i; });
  if (!Array.isArray(s.fleet)) s.fleet = fresh.fleet;
  s.fleet = s.fleet.map((v) => merge(newVehicle(v.id, v.type, v.bay || 0), v));
  if (!Array.isArray(s.rival.fleet)) s.rival.fleet = [];
  if (!Array.isArray(s.offers)) s.offers = [];
  if (!Array.isArray(s.jobs)) s.jobs = [];
  if (!Array.isArray(s.notices)) s.notices = [];
  if (!Array.isArray(s.news.archive)) s.news.archive = [];
  if (!Array.isArray(s.progress.goalsDone)) s.progress.goalsDone = [];
  // a save taken mid-attack resumes at the impact (or the end if the impact already happened)
  const a = s.attack;
  if (s.phase === 'attack') {
    if (!a) {
      s.phase = 'calm';
      s.timer = 3;
    } else if (!a.hit) {
      a.t = Math.max(a.t, ATTACK.hit);
    } else {
      a.t = Math.max(a.t, a.end);
    }
  }
  if (s.phase !== 'cleanup') s.contract = null;
  if (s.phase === 'cleanup' && !s.contract) s.phase = 'calm';
  if (s.phase === 'tender' && !s.tender) s.phase = 'calm';
  if (s.phase === 'rival' && !s.attack) s.phase = 'calm';
  // derived crews
  for (const sec of s.sectors) sec.crews = { fire: 0, debris: 0, carve: 0 };
  for (const v of s.fleet) {
    if (v.state === 'working' && v.sector != null) s.sectors[v.sector].crews[v.type] += 1;
  }
  if (!Number.isFinite(s.money) || s.money < 0) s.money = Math.max(0, Number(s.money) || 0);
  return s;
}

function store(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** Returns a v2 State or null. */
export function load(storage) {
  try {
    const st = store(storage);
    if (!st) return null;
    const raw = st.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || saved.v !== 2) return null;
    return normalize(merge(newState(), saved));
  } catch {
    return null;
  }
}

/** Writes the v2 key; sets lastSave; never throws. */
export function save(s, storage) {
  try {
    const st = store(storage);
    if (!st || !s) return false;
    s.lastSave = Date.now();
    st.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** Removes the v2 key only; returns a fresh state. */
export function wipe(storage) {
  try {
    const st = store(storage);
    if (st) st.removeItem(SAVE_KEY);
  } catch {
    /* storage unavailable */
  }
  return newState();
}

export function hasV1Save(storage) {
  try {
    const st = store(storage);
    return !!(st && st.getItem(V1_KEY));
  } catch {
    return false;
  }
}
