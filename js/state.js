import { SECTORS, ITEMS, RECIPES, BAL, START_CREWS, START_LEVELS } from './data.js';

const SAVE_KEY = 'aftermath.save.v1';
export const game = { s: null };

export function newState() {
  const market = {};
  for (const k in ITEMS) market[k] = { m: 1, hist: Array(24).fill(1) };
  return {
    v: 1,
    money: BAL.startMoney,
    rep: 50,
    attackLevel: 0,
    phase: 'calm',
    timer: BAL.firstCalm,
    sectors: SECTORS.map((x, i) => ({
      id: x.id,
      level: START_LEVELS[i],
      rubble: 0, rubbleMax: 0,
      fire: 0,
      corpse: 0, corpseMax: 0,
      role: null,
      crews: { fire: 0, debris: 0, carve: 0 },
    })),
    crews: { ...START_CREWS },
    inv: Object.fromEntries(Object.keys(ITEMS).map((k) => [k, 0])),
    dna: 0,
    yieldAcc: { scale: 0, blood: 0, bone: 0 },
    market,
    boom: null,
    upgrades: { speed: 0, storage: 0, factory: 0 },
    jobs: [],
    autoJobs: Object.fromEntries(RECIPES.map((r) => [r.id, false])),
    attack: null,
    tender: null,
    contract: null,
    rival: { rep: 45 },
    rivalT: 0,
    flags: { mutantNext: false, lossStreak: 0, introSeen: false, buyerAt: null, buyerOffer: 0 },
    news: [],
    stats: { contracts: 0, lost: 0, parts: 0, earned: 0 },
    lastSave: Date.now(),
  };
}

function merge(base, saved) {
  for (const k in saved) {
    const b = base[k];
    const v = saved[k];
    if (b && v && typeof b === 'object' && typeof v === 'object' && !Array.isArray(b) && !Array.isArray(v)) {
      base[k] = merge(b, v);
    } else {
      base[k] = v;
    }
  }
  return base;
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (saved.v !== 1) return null;
    return merge(newState(), saved);
  } catch {
    return null;
  }
}

export function save() {
  if (!game.s) return;
  game.s.lastSave = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.s));
  } catch {
    /* depolama dolu ya da kapalı */
  }
}

export function wipe() {
  localStorage.removeItem(SAVE_KEY);
  game.s = newState();
}
