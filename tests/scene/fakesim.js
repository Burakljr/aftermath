// Fake restaurant simulation for the scene lab (no economy): produces state.customers /
// state.cooks / stations / tables exactly in the shape the real game logic uses, on the same
// walk graph (js/game/layout.js), deterministic (seeded) so screenshots are repeatable.
import { getLayout } from '../../js/game/layout.js';

const CHARS = ['Knight', 'Mage', 'Rogue_Hooded'];
const DISHES = { inn: ['juice', 'burger', 'stew', 'dinner'], harbor: ['cocoa', 'veggieburger', 'soup', 'dinner'] };
const T = { eat: 2.6, pay: 1.1, serve: 0.45, cook: [2.0, 3.0, 4.0, 5.0], arrive: 1.1 };

export function createFakeSim(opts = {}) {
  const sim = { state: null, layout: null, onEvent: null, rng: 1 };
  const rnd = () => {
    let a = (sim.rng = (sim.rng + 0x6d2b79f5) >>> 0);
    a = Math.imul(a ^ (a >>> 15), a | 1);
    a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
    return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
  };
  const emit = (ev, p) => { if (sim.onEvent) sim.onEvent(ev, p); };

  function setup({ location = 'inn', open = 1, tables = 2, cooks = 1, levels = [1, 1, 1, 1], seed = 7, maxCustomers = 99, spawn = true } = {}) {
    const L = getLayout(location);
    sim.layout = L;
    sim.rng = seed;
    sim.maxCustomers = maxCustomers;
    sim.spawn = spawn;
    sim.state = {
      location: L.id,
      stations: L.stations.map((s, i) => ({ id: s.id, open: i < open, level: levels[i] || 1, boostT: 0 })),
      tables: L.tables.map((t, i) => ({ id: t.id, owned: i < tables })),
      cooks: [],
      customers: [],
      orders: [],
      spawnT: 0.2,
      seq: 1,
      money: 0,
    };
    for (let i = 0; i < cooks; i++) addCook();
    return sim.state;
  }

  function addCook() {
    const L = sim.layout, s = sim.state;
    const n = s.cooks.length;
    const home = L.cookHomes[n % L.cookHomes.length];
    const c = { id: 'c' + (n + 1), state: 'idle', station: null, order: null, from: home, to: home, t: 0, dur: 0, home };
    s.cooks.push(c);
    return c;
  }

  function walk(e, from, to, speed) {
    e.from = from; e.to = to; e.t = 0;
    e.dur = from === to ? 0 : sim.layout.pathLength(from, to) / speed;
  }
  function stay(e, node, dur = 0) { e.from = node; e.to = node; e.t = 0; e.dur = dur; }
  const taken = (id) => sim.state.customers.some((c) => c.seat === id && c.state !== 'leaving');

  function freeSeats() {
    const out = [];
    sim.layout.tables.forEach((t, i) => {
      if (!sim.state.tables[i].owned) return;
      for (const st of t.seats) if (!taken(st.id)) out.push({ t, st });
    });
    return out;
  }

  function spawnOne(seatPick) {
    const L = sim.layout, s = sim.state;
    const free = freeSeats();
    if (!free.length) return null;
    const pick = seatPick ? free.find((f) => f.st.id === seatPick) || free[0] : free[Math.floor(rnd() * free.length)];
    const c = {
      id: 'g' + s.seq++, look: { char: CHARS[Math.floor(rnd() * CHARS.length)], tint: Math.floor(rnd() * 4) },
      state: 'enter', seat: pick.st.id, table: pick.t.id, dish: null, station: null, from: L.door.outside, to: L.door.node, t: 0, dur: 0,
    };
    walk(c, L.door.outside, L.door.node, L.speeds.customer);
    s.customers.push(c);
    emit('arrive', { customer: c.id });
    return c;
  }

  function order(c) {
    const s = sim.state;
    const open = s.stations.map((x, i) => (x.open ? i : -1)).filter((i) => i >= 0);
    let si = open[Math.floor(rnd() * open.length)];
    if (rnd() < 0.4) si = open[open.length - 1];
    c.station = s.stations[si].id;
    c.dish = DISHES[s.location][si];
    s.orders.push({ id: 'o' + s.seq++, customer: c.id, station: c.station, dish: c.dish });
    emit('order', { customer: c.id, dish: c.dish });
  }

  function step(dt) {
    const s = sim.state, L = sim.layout;
    for (const st of s.stations) if (st.boostT > 0) st.boostT = Math.max(0, st.boostT - dt);
    if (sim.spawn && s.customers.length < sim.maxCustomers) {
      s.spawnT -= dt;
      if (s.spawnT <= 0) { spawnOne(); s.spawnT = T.arrive + rnd() * 0.8; }
    }
    for (const c of s.customers) {
      c.t += dt;
      if (c.state === 'waiting' || c.t < c.dur) continue;
      if (c.state === 'enter') { c.state = 'toSeat'; walk(c, L.door.node, c.seat, L.speeds.customer); }
      else if (c.state === 'toSeat') { c.state = 'waiting'; stay(c, c.seat); order(c); }
      else if (c.state === 'eating') {
        c.state = 'paying'; stay(c, c.seat, T.pay);
        const v = 4 * (1 + s.stations.findIndex((x) => x.id === c.station)) ** 3;
        s.money += v;
        emit('pay', { customer: c.id, value: v, dish: c.dish });
      } else if (c.state === 'paying') { c.state = 'leaving'; walk(c, c.seat, L.door.outside, L.speeds.customer); emit('leave', { customer: c.id }); }
      else if (c.state === 'leaving') c.gone = true;
    }
    s.customers = s.customers.filter((c) => !c.gone);
    for (const k of s.cooks) {
      if (k.state === 'idle') continue;
      const rate = k.state === 'cooking' && (s.stations.find((x) => x.id === k.station) || {}).boostT > 0 ? 2 : 1;
      k.t += dt * rate;
      if (k.t < k.dur) continue;
      if (k.state === 'toStation') {
        const si = s.stations.findIndex((x) => x.id === k.station);
        k.state = 'cooking';
        stay(k, L.stations[si].node, T.cook[si] / (1 + Math.floor(s.stations[si].level / 10)));
        emit('cookStart', { cook: k.id, station: k.station });
      } else if (k.state === 'cooking') {
        const cust = s.customers.find((c) => c.id === k.order.customer);
        k.state = 'toTable';
        k.station = null;
        walk(k, k.to, cust ? L.tables.find((t) => t.id === cust.table).front : k.home, L.speeds.cook);
      } else if (k.state === 'toTable') {
        const cust = s.customers.find((c) => c.id === k.order.customer);
        k.state = 'serving';
        stay(k, k.to, T.serve);
        if (cust && cust.state === 'waiting') { cust.state = 'eating'; stay(cust, cust.seat, T.eat); emit('serve', { customer: cust.id, dish: k.order.dish }); }
      } else if (k.state === 'serving') {
        k.order = null;
        k.state = 'return';
        walk(k, k.to, k.home, L.speeds.cook);
        if (k.dur === 0) k.state = 'idle';
      } else if (k.state === 'return') { k.state = 'idle'; stay(k, k.home); }
    }
    // dispatch
    for (let i = 0; i < s.orders.length; i++) {
      const o = s.orders[i];
      if (s.cooks.some((k) => k.station === o.station && (k.state === 'toStation' || k.state === 'cooking'))) continue;
      const si = s.stations.findIndex((x) => x.id === o.station);
      const target = L.stations[si].node;
      let best = null, bd = Infinity;
      for (const k of s.cooks) {
        if (k.state !== 'idle') continue;
        const d = L.pathLength(k.to, target);
        if (d < bd) { bd = d; best = k; }
      }
      if (!best) break;
      s.orders.splice(i--, 1);
      const from = best.to;
      best.state = 'toStation';
      best.station = o.station;
      best.order = o;
      walk(best, from, target, L.speeds.cook);
      if (best.dur === 0) best.dur = 1e-6;
    }
  }
  /** Run until `n` customers are seated or eating (or t runs out). */
  function warm(seconds, h = 1 / 30) { for (let t = 0; t < seconds; t += h) step(h); }

  Object.assign(sim, { setup, step, warm, spawnOne, addCook, order });
  setup(opts);
  return sim;
}
