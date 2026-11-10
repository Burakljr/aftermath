// The restaurant service: customers arrive, sit, order, cooks cook and serve, customers
// eat, pay and leave. Deterministic (seeded random in state.rng), no allocations in the
// steady state except new entities. step() is called in small sub-steps by tick().
//
// Walking entities carry { from, to, t, dur }: dur = layout.pathLength(from, to) / speed,
// t runs 0..dur; the scene places them at t / dur along layout.path(from, to).
import { RULES, CUSTOMER_CHARS, CUSTOMER_TINTS } from './config.js';
import { cookTime, price, cookWalkSpeed, orderWeight, ownedTables } from './sim.js';
import { freshCook } from './state.js';

// mulberry32 on state.rng
export function random(state) {
  let a = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

export function seatTaken(state, seatId) {
  const cs = state.customers;
  for (let i = 0; i < cs.length; i++) if (cs[i].seat === seatId && cs[i].state !== 'leaving') return true;
  return false;
}

export function freeSeats(state, layout) {
  let n = 0;
  for (let i = 0; i < layout.tables.length; i++) {
    if (!state.tables[i] || !state.tables[i].owned) continue;
    const seats = layout.tables[i].seats;
    for (let k = 0; k < seats.length; k++) if (!seatTaken(state, seats[k].id)) n++;
  }
  return n;
}

function pickSeat(state, layout, free) {
  let k = Math.floor(random(state) * free);
  for (let i = 0; i < layout.tables.length; i++) {
    if (!state.tables[i] || !state.tables[i].owned) continue;
    const t = layout.tables[i];
    for (let j = 0; j < t.seats.length; j++) {
      if (seatTaken(state, t.seats[j].id)) continue;
      if (k-- === 0) return { table: t, seat: t.seats[j] };
    }
  }
  return null;
}

function pickStation(state) {
  let total = 0;
  for (let i = 0; i < state.stations.length; i++) total += orderWeight(state, i);
  let r = random(state) * total;
  for (let i = 0; i < state.stations.length; i++) {
    const w = orderWeight(state, i);
    if (!w) continue;
    if (r < w) return i;
    r -= w;
  }
  return 0;
}

function walk(e, layout, from, to, speed) {
  e.from = from;
  e.to = to;
  e.t = 0;
  e.dur = from === to ? 0 : layout.pathLength(from, to) / speed;
}
function stay(e, node, dur = 0) {
  e.from = node;
  e.to = node;
  e.t = 0;
  e.dur = dur;
}

export function arriveDelay(free) {
  return Math.max(RULES.arriveMin, RULES.arriveBase / Math.max(1, free));
}

function findById(list, id) {
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}

function stationBusy(state, stationId, except) {
  const cs = state.cooks;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (c !== except && c.station === stationId && (c.state === 'toStation' || c.state === 'cooking')) return true;
  }
  return false;
}

// ctx = { cfg, layout, emit(ev, payload), addMoney(value) }
export function step(state, ctx, dt) {
  const { cfg, layout } = ctx;
  // boosts run down
  for (let i = 0; i < state.stations.length; i++) {
    const s = state.stations[i];
    if (s.boostT > 0) s.boostT = Math.max(0, s.boostT - dt);
  }
  spawn(state, ctx, dt);
  // customers
  const cs = state.customers;
  for (let i = 0; i < cs.length; i++) {
    stepCustomer(state, ctx, cs[i], dt);
  }
  for (let i = cs.length - 1; i >= 0; i--) {
    if (cs[i].gone) cs.splice(i, 1);
  }
  // cooks
  const speed = cookWalkSpeed(layout, state.cookSpeed);
  for (let i = 0; i < state.cooks.length; i++) stepCook(state, ctx, state.cooks[i], dt, speed);
  dispatch(state, ctx, speed);
  // free cooks that found no work walk back to the kitchen
  for (let i = 0; i < state.cooks.length; i++) {
    const c = state.cooks[i];
    if (c.state === 'free') {
      c.state = 'return';
      walk(c, layout, c.to, c.home, speed);
      if (c.dur === 0) c.state = 'idle';
    }
  }
  void cfg;
}

function spawn(state, ctx, dt) {
  const { layout } = ctx;
  const free = freeSeats(state, layout);
  if (free <= 0) return;
  state.spawnT -= dt;
  if (state.spawnT > 0) return;
  const pick = pickSeat(state, layout, free);
  if (!pick) return;
  const c = {
    id: 'g' + state.seq++,
    look: {
      char: CUSTOMER_CHARS[Math.floor(random(state) * CUSTOMER_CHARS.length)],
      tint: Math.floor(random(state) * CUSTOMER_TINTS),
    },
    state: 'enter',
    seat: pick.seat.id,
    table: pick.table.id,
    dish: null,
    station: null,
    from: layout.door.outside,
    to: layout.door.node,
    t: 0,
    dur: 0,
  };
  walk(c, layout, layout.door.outside, layout.door.node, layout.speeds.customer);
  state.customers.push(c);
  state.spawnT = arriveDelay(free - 1);
  ctx.emit('arrive', { customer: c.id });
}

function stepCustomer(state, ctx, c, dt) {
  const { cfg, layout } = ctx;
  let left = dt;
  for (let guard = 0; guard < 8 && left > 0; guard++) {
    if (c.state === 'waiting') { c.t += left; return; }
    const need = c.dur - c.t;
    if (left < need) { c.t += left; return; }
    left -= Math.max(0, need);
    c.t = c.dur;
    switch (c.state) {
      case 'enter':
        c.state = 'toSeat';
        walk(c, layout, layout.door.node, c.seat, layout.speeds.customer);
        break;
      case 'toSeat': {
        c.state = 'waiting';
        stay(c, c.seat);
        const si = pickStation(state);
        c.station = state.stations[si].id;
        c.dish = cfg.stations[si].dish;
        state.orders.push({ id: 'o' + state.seq++, customer: c.id, station: c.station, dish: c.dish });
        ctx.emit('order', { customer: c.id, dish: c.dish, station: c.station });
        return;
      }
      case 'eating': {
        const si = state.stations.findIndex((s) => s.id === c.station);
        const value = si >= 0 ? price(cfg.stations[si], state.stations[si].level) : 0;
        c.state = 'paying';
        stay(c, c.seat, RULES.payTime);
        state.served++;
        ctx.addMoney(value);
        ctx.emit('pay', { customer: c.id, value, dish: c.dish, station: c.station });
        break;
      }
      case 'paying':
        c.state = 'leaving';
        walk(c, layout, c.seat, layout.door.outside, layout.speeds.customer);
        ctx.emit('leave', { customer: c.id });
        break;
      case 'leaving':
        c.gone = true;
        return;
      default:
        return;
    }
  }
}

function stepCook(state, ctx, c, dt, speed) {
  const { cfg, layout } = ctx;
  let left = dt;
  for (let guard = 0; guard < 8 && left > 0; guard++) {
    if (c.state === 'idle' || c.state === 'free') return;
    let rate = 1;
    if (c.state === 'cooking') {
      const s = findById(state.stations, c.station);
      if (s && s.boostT > 0) rate = RULES.boostMult;
    }
    const need = (c.dur - c.t) / rate;
    if (left < need) { c.t += left * rate; return; }
    left -= Math.max(0, need);
    c.t = c.dur;
    switch (c.state) {
      case 'toStation': {
        const si = state.stations.findIndex((s) => s.id === c.station);
        c.state = 'cooking';
        stay(c, layout.stations[si].node, cookTime(cfg.stations[si], state.stations[si].level));
        ctx.emit('cookStart', { cook: c.id, station: c.station, customer: c.order.customer, dish: c.order.dish });
        break;
      }
      case 'cooking': {
        const cust = findById(state.customers, c.order.customer);
        ctx.emit('cookDone', { cook: c.id, station: c.station, customer: c.order.customer, dish: c.order.dish });
        c.state = 'toTable';
        c.station = null;
        const front = cust ? layout.tables.find((t) => t.id === cust.table).front : c.home;
        walk(c, layout, c.to, front, speed);
        break;
      }
      case 'toTable': {
        const cust = findById(state.customers, c.order.customer);
        c.state = 'serving';
        stay(c, c.to, RULES.serveTime);
        if (cust && cust.state === 'waiting') {
          cust.state = 'eating';
          stay(cust, cust.seat, RULES.eatTime);
          ctx.emit('serve', { customer: cust.id, dish: c.order.dish, cook: c.id });
        }
        break;
      }
      case 'serving':
        c.state = 'free';
        c.order = null;
        stay(c, c.to);
        return;
      case 'return':
        c.state = 'idle';
        stay(c, c.home);
        return;
      default:
        return;
    }
  }
}

// FIFO orders; each takes the nearest free cook, if its station is not in use.
function dispatch(state, ctx, speed) {
  const { layout } = ctx;
  const orders = state.orders;
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    if (stationBusy(state, o.station, null)) continue;
    const si = state.stations.findIndex((s) => s.id === o.station);
    if (si < 0) continue;
    const target = layout.stations[si].node;
    let best = null;
    let bestD = Infinity;
    for (let k = 0; k < state.cooks.length; k++) {
      const c = state.cooks[k];
      if (c.state !== 'idle' && c.state !== 'free') continue;
      const d = layout.pathLength(c.to, target);
      if (d < bestD - 1e-9) { bestD = d; best = c; }
    }
    if (!best) return; // nobody free: later orders wait too
    orders.splice(i, 1);
    i--;
    best.state = 'toStation';
    best.station = o.station;
    best.order = o;
    walk(best, layout, best.to, target, speed);
    if (best.dur === 0) best.dur = 1e-6;
  }
}

// New cook (hire): joins at his kitchen spot.
export function addCook(state, layout) {
  const c = freshCook(layout, state.cooks.length);
  state.cooks.push(c);
  return c;
}

export function seatsTotal(state) {
  return ownedTables(state) * 2;
}

// A fresh location opens with one guest already seated and ordering, so the first coins
// come within seconds (the rest walk in from the door as usual).
export function seatFirstGuest(state, ctx) {
  const { cfg, layout } = ctx;
  if (state.customers.length) return;
  const t = layout.tables[0];
  const seat = t.seats[0];
  const c = {
    id: 'g' + state.seq++,
    look: { char: CUSTOMER_CHARS[0], tint: 0 },
    state: 'waiting',
    seat: seat.id,
    table: t.id,
    dish: cfg.stations[0].dish,
    station: state.stations[0].id,
    from: seat.id,
    to: seat.id,
    t: 0,
    dur: 0,
  };
  state.customers.push(c);
  state.orders.push({ id: 'o' + state.seq++, customer: c.id, station: c.station, dish: c.dish });
  ctx.emit('arrive', { customer: c.id });
  ctx.emit('order', { customer: c.id, dish: c.dish, station: c.station });
}
