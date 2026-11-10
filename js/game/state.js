// Game state: creation, loading (with validation / migration) and serialising.
import { LOCATIONS, locationByIndex, CUSTOMER_CHARS, CUSTOMER_TINTS } from './config.js';
import { getLayout } from './layout.js';

export const STATE_VERSION = 1;
export const LANGS = ['en', 'tr'];
export const QUALITIES = ['high', 'low'];

const CUSTOMER_STATES = ['enter', 'toSeat', 'waiting', 'eating', 'paying', 'leaving'];
const COOK_STATES = ['idle', 'toStation', 'cooking', 'toTable', 'serving', 'return'];

export function freshCook(layout, n) {
  const home = layout.cookHomes[n % layout.cookHomes.length];
  return { id: 'c' + (n + 1), state: 'idle', station: null, order: null, from: home, to: home, t: 0, dur: 0, home };
}

// Location-specific part of the state (stations, tables, cooks, customers ...).
export function freshLocation(index) {
  const cfg = locationByIndex(index);
  const layout = getLayout(cfg.id);
  const cooks = [];
  for (let n = 0; n < cfg.cooks.start; n++) cooks.push(freshCook(layout, n));
  return {
    location: cfg.id,
    locationIndex: LOCATIONS.indexOf(cfg),
    money: cfg.startMoney,
    earned: 0,
    served: 0,
    complete: false,
    stations: cfg.stations.map((s, i) => ({ id: s.id, open: i === 0, level: 1, boostT: 0 })),
    tables: layout.tables.map((t, i) => ({ id: t.id, owned: i < cfg.tables.start })),
    cookSpeed: 1,
    cooks,
    customers: [],
    orders: [],
    spawnT: 0,
    seq: 1,
    goals: cfg.goals.map((g) => ({ id: g.id, done: false, claimed: false })),
  };
}

export function freshState({ lang = 'en', now = 0, seed = 12345 } = {}) {
  return Object.assign(
    { v: STATE_VERSION, lifetimeMoney: 0 },
    freshLocation(0),
    {
      settings: { lang: LANGS.includes(lang) ? lang : 'en', sound: true, quality: 'high', fps: false },
      tutorial: 0,
      lastSeen: now,
      offline: null,
      rng: seed >>> 0 || 1,
      playTime: 0,
    },
  );
}

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Turn a saved string/object into a valid state. Unknown or broken saves -> null.
// Customers / cooks in flight are kept when they are consistent, else the restaurant
// simply restarts its service (empty room, idle cooks): money and progress are never lost.
export function loadState(save) {
  let data = save;
  if (typeof save === 'string') {
    try { data = JSON.parse(save); } catch { return null; }
  }
  if (!isObj(data) || data.v !== STATE_VERSION) return null;
  const index = clamp(Math.floor(num(data.locationIndex)), 0, LOCATIONS.length - 1);
  const cfg = LOCATIONS[index];
  if (data.location !== cfg.id) return null;
  const layout = getLayout(cfg.id);
  const st = isObj(data.settings) ? data.settings : {};
  const s = freshState({ lang: st.lang });
  Object.assign(s, freshLocation(index));
  s.money = Math.max(0, num(data.money, cfg.startMoney));
  s.lifetimeMoney = Math.max(0, num(data.lifetimeMoney));
  s.earned = Math.max(0, num(data.earned));
  s.served = Math.max(0, Math.floor(num(data.served)));
  s.complete = !!data.complete;
  s.playTime = Math.max(0, num(data.playTime));
  s.rng = (num(data.rng, 1) >>> 0) || 1;

  const savedSt = Array.isArray(data.stations) ? data.stations : [];
  s.stations.forEach((x, i) => {
    const o = savedSt.find((y) => isObj(y) && y.id === x.id);
    if (!o) return;
    x.open = i === 0 ? true : !!o.open;
    x.level = clamp(Math.floor(num(o.level, 1)), 1, 1000);
    x.boostT = clamp(num(o.boostT), 0, 60);
  });
  // stations open in order: close any gap
  for (let i = 1; i < s.stations.length; i++) if (!s.stations[i - 1].open) s.stations[i].open = false;

  const savedT = Array.isArray(data.tables) ? data.tables : [];
  s.tables.forEach((x, i) => {
    const o = savedT.find((y) => isObj(y) && y.id === x.id);
    if (o) x.owned = i < cfg.tables.start ? true : !!o.owned;
  });
  // tables are bought in order: no gaps
  for (let i = 1; i < s.tables.length; i++) if (!s.tables[i - 1].owned) s.tables[i].owned = false;

  s.cookSpeed = clamp(Math.floor(num(data.cookSpeed, 1)), 1, 10);

  const savedG = Array.isArray(data.goals) ? data.goals : [];
  for (const g of s.goals) {
    const o = savedG.find((y) => isObj(y) && y.id === g.id);
    if (!o) continue;
    g.done = !!o.done;
    g.claimed = !!o.claimed && g.done;
  }

  // service in progress
  const cookN = clamp(Array.isArray(data.cooks) ? data.cooks.length : cfg.cooks.start, cfg.cooks.start, cfg.cooks.max);
  s.cooks = [];
  for (let n = 0; n < cookN; n++) s.cooks.push(freshCook(layout, n));
  if (!restoreService(s, data, cfg, layout)) {
    s.customers = [];
    s.orders = [];
    for (let n = 0; n < s.cooks.length; n++) s.cooks[n] = freshCook(layout, n);
    s.spawnT = 0;
  }

  s.settings = {
    lang: LANGS.includes(st.lang) ? st.lang : s.settings.lang,
    sound: typeof st.sound === 'boolean' ? st.sound : true,
    quality: QUALITIES.includes(st.quality) ? st.quality : 'high',
    fps: !!st.fps,
  };
  s.tutorial = data.tutorial === 'done' || [0, 1, 2].includes(data.tutorial) ? data.tutorial : 0;
  s.lastSeen = num(data.lastSeen);
  if (isObj(data.offline)) {
    const sec = Math.max(0, num(data.offline.seconds));
    const amt = Math.max(0, num(data.offline.amount));
    s.offline = amt > 0 ? { seconds: sec, amount: amt } : null;
  }
  return s;
}

// Copy saved customers, cooks and orders if every reference checks out. Returns false
// (and the caller resets the service) when anything is inconsistent.
function restoreService(s, data, cfg, layout) {
  const nodes = layout.graph.nodes;
  const seatIds = new Set();
  const seatOwned = {};
  layout.tables.forEach((t, i) => t.seats.forEach((x) => { seatIds.add(x.id); seatOwned[x.id] = s.tables[i].owned; }));
  const stationOpen = {};
  s.stations.forEach((x) => { stationOpen[x.id] = x.open; });
  const dishOf = {};
  cfg.stations.forEach((x) => { dishOf[x.id] = x.dish; });
  const custIn = Array.isArray(data.customers) ? data.customers : [];
  const cookIn = Array.isArray(data.cooks) ? data.cooks : [];
  const ordIn = Array.isArray(data.orders) ? data.orders : [];
  if (custIn.length > 12) return false;
  const custs = [];
  const usedSeats = new Set();
  let maxId = 0;
  const idNum = (id) => { const m = /^[a-z]+(\d+)$/.exec(String(id)); return m ? Number(m[1]) : 0; };
  for (const c of custIn) {
    if (!isObj(c) || typeof c.id !== 'string' || !CUSTOMER_STATES.includes(c.state)) return false;
    if (!seatIds.has(c.seat) || !seatOwned[c.seat]) return false;
    if (c.state !== 'leaving') {
      if (usedSeats.has(c.seat)) return false;
      usedSeats.add(c.seat);
    }
    if (!nodes[c.from] || !nodes[c.to]) return false;
    const ordered = ['waiting', 'eating', 'paying'].includes(c.state);
    const dishOk = !!stationOpen[c.station] && dishOf[c.station] === c.dish;
    if (ordered && !dishOk) return false;
    const look = isObj(c.look) ? c.look : {};
    custs.push({
      id: c.id,
      look: {
        char: CUSTOMER_CHARS.includes(look.char) ? look.char : CUSTOMER_CHARS[0],
        tint: clamp(Math.floor(num(look.tint)), 0, CUSTOMER_TINTS - 1),
      },
      state: c.state,
      seat: c.seat,
      table: c.seat.replace(/[ab]$/, ''),
      dish: dishOk ? c.dish : null,
      station: dishOk ? c.station : null,
      from: c.from,
      to: c.to,
      t: clamp(num(c.t), 0, 1e6),
      dur: clamp(num(c.dur), 0, 1e3),
    });
    maxId = Math.max(maxId, idNum(c.id));
  }
  const byId = {};
  for (const c of custs) byId[c.id] = c;
  const orders = [];
  for (const o of ordIn) {
    if (!isObj(o) || !byId[o.customer] || byId[o.customer].state !== 'waiting') return false;
    orders.push({ id: String(o.id), customer: o.customer, station: byId[o.customer].station, dish: byId[o.customer].dish });
    maxId = Math.max(maxId, idNum(o.id));
  }
  if (cookIn.length && cookIn.length !== s.cooks.length) return false;
  const served = new Set(orders.map((o) => o.customer));
  for (let n = 0; n < cookIn.length; n++) {
    const c = cookIn[n];
    const base = s.cooks[n];
    if (!isObj(c) || !COOK_STATES.includes(c.state) || !nodes[c.from] || !nodes[c.to]) return false;
    const busy = ['toStation', 'cooking', 'toTable', 'serving'].includes(c.state);
    let order = null;
    if (busy) {
      const o = isObj(c.order) ? c.order : null;
      const cust = o && byId[o.customer];
      if (!cust || cust.state !== 'waiting' && !(c.state === 'serving' && cust.state === 'eating')) return false;
      if (served.has(cust.id)) return false;
      served.add(cust.id);
      order = { id: String(o.id), customer: cust.id, station: cust.station, dish: cust.dish };
    }
    Object.assign(base, {
      state: c.state,
      station: busy ? order.station : null,
      order,
      from: c.from,
      to: c.to,
      t: clamp(num(c.t), 0, 1e6),
      dur: clamp(num(c.dur), 0, 1e3),
    });
  }
  // every waiting customer needs an order somewhere (queued or with a cook)
  for (const c of custs) if (c.state === 'waiting' && !served.has(c.id)) return false;
  s.customers = custs;
  s.orders = orders;
  s.spawnT = clamp(num(data.spawnT), 0, 30);
  s.seq = Math.max(Math.floor(num(data.seq, 1)), maxId + 1);
  return true;
}

export function serialize(state) {
  return JSON.stringify(state);
}
