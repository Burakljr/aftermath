// Game state: creation, loading (with validation / migration) and serialising.
import { FACTORIES, factoryByIndex } from './config.js';

export const STATE_VERSION = 1;
export const LANGS = ['en', 'tr'];
export const QUALITIES = ['high', 'low'];

export function freshFactory(index) {
  const cfg = factoryByIndex(index);
  return {
    id: cfg.id,
    stations: cfg.stations.map((s, i) => ({
      id: s.id,
      open: i < 2,
      level: 1,
      progress: 0,
      tray: 0,
      boostT: 0,
    })),
    sold: 0,
    complete: false,
  };
}

export function freshGoals(index) {
  return factoryByIndex(index).goals.map((g) => ({ id: g.id, done: false, progress: 0, claimed: false }));
}

export function freshState({ lang = 'en', now = 0 } = {}) {
  return {
    v: STATE_VERSION,
    money: FACTORIES[0].startMoney,
    lifetimeMoney: 0,
    factoryIndex: 0,
    factory: freshFactory(0),
    goals: freshGoals(0),
    settings: { lang: LANGS.includes(lang) ? lang : 'en', sound: true, quality: 'high', fps: false },
    tutorial: 0,
    lastSeen: now,
    offline: null,
  };
}

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Turn a saved string/object into a valid state. Unknown or broken saves -> null.
export function loadState(save) {
  let data = save;
  if (typeof save === 'string') {
    try { data = JSON.parse(save); } catch { return null; }
  }
  if (!data || typeof data !== 'object' || data.v !== STATE_VERSION) return null;
  const index = clamp(Math.floor(num(data.factoryIndex)), 0, FACTORIES.length - 1);
  const cfg = FACTORIES[index];
  const base = freshState({ lang: data.settings && data.settings.lang });
  const s = base;
  s.money = Math.max(0, num(data.money, cfg.startMoney));
  s.lifetimeMoney = Math.max(0, num(data.lifetimeMoney));
  s.factoryIndex = index;
  s.factory = freshFactory(index);
  const f = data.factory && typeof data.factory === 'object' ? data.factory : {};
  if (f.id === cfg.id) {
    s.factory.sold = Math.max(0, Math.floor(num(f.sold)));
    s.factory.complete = !!f.complete;
    const saved = Array.isArray(f.stations) ? f.stations : [];
    s.factory.stations.forEach((st, i) => {
      const o = saved.find((x) => x && x.id === st.id) || saved[i];
      if (!o || o.id !== st.id) return;
      st.open = i < 2 ? true : !!o.open;
      st.level = clamp(Math.floor(num(o.level, 1)), 1, 1000);
      st.progress = clamp(num(o.progress), 0, 1);
      st.tray = i === 0 ? 0 : clamp(Math.floor(num(o.tray)), 0, 3);
      st.boostT = clamp(num(o.boostT), 0, 60);
    });
    // stations open in order: close any gap
    for (let i = 1; i < s.factory.stations.length; i++) {
      if (!s.factory.stations[i - 1].open) s.factory.stations[i].open = false;
    }
  }
  s.goals = freshGoals(index);
  const goals = Array.isArray(data.goals) ? data.goals : [];
  for (const g of s.goals) {
    const o = goals.find((x) => x && x.id === g.id);
    if (!o) continue;
    g.done = !!o.done;
    g.claimed = !!o.claimed && g.done;
    g.progress = clamp(num(o.progress), 0, 1);
  }
  const st = data.settings || {};
  s.settings = {
    lang: LANGS.includes(st.lang) ? st.lang : base.settings.lang,
    sound: typeof st.sound === 'boolean' ? st.sound : true,
    quality: QUALITIES.includes(st.quality) ? st.quality : 'high',
    fps: !!st.fps,
  };
  s.tutorial = data.tutorial === 'done' || [0, 1, 2].includes(data.tutorial) ? data.tutorial : 0;
  s.lastSeen = num(data.lastSeen);
  if (data.offline && typeof data.offline === 'object') {
    const sec = Math.max(0, num(data.offline.seconds));
    const amt = Math.max(0, num(data.offline.amount));
    s.offline = amt > 0 ? { seconds: sec, amount: amt } : null;
  }
  return s;
}

export function serialize(state) {
  return JSON.stringify(state);
}
