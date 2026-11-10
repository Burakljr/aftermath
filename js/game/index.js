// createGame(): the whole game model. No DOM; safe to run in node tests.
import { LOCATIONS, RULES, DISHES, COMING_SOON, locationByIndex } from './config.js';
import { getLayout } from './layout.js';
import { freshState, freshLocation, loadState, serialize, LANGS, QUALITIES } from './state.js';
import {
  upgradeCost, price, priceRaw, cookTime, milestoneInfo, isMilestone, tableCost, cookCost,
  cookSpeedCost, cookSpeedMult, ownedTables, incomeEstimate,
} from './sim.js';
import { step as stepWorld, addCook, freeSeats, seatFirstGuest } from './world.js';
import { updateGoals, visibleGoalIndices, allClaimed, claimedCount, goalMeasure, GOAL_TEXT_KEYS } from './goals.js';
import { detectLang } from './i18n.js';

export { LOCATIONS, RULES, DISHES };

export const EVENTS = [
  // contract
  'arrive', 'order', 'cookStart', 'serve', 'pay', 'leave', 'upgrade', 'open', 'buyTable', 'hire',
  'goal', 'locationComplete', 'locationStart',
  // additions
  'cookDone', 'boost', 'cookSpeed', 'claim', 'money', 'offline', 'setting', 'tutorial',
];

export function createGame({ save = null, now = Date.now, lang, seed } = {}) {
  const clock = typeof now === 'function' ? now : () => now;
  let state = save ? loadState(save) : null;
  const fresh = !state;
  if (!state) state = freshState({ lang: lang || detectLang(), now: clock(), seed: seed || ((clock() % 2147483647) >>> 0) || 7 });

  const listeners = {};
  function on(ev, fn) {
    (listeners[ev] || (listeners[ev] = [])).push(fn);
    return () => {
      const a = listeners[ev];
      const i = a ? a.indexOf(fn) : -1;
      if (i >= 0) a.splice(i, 1);
    };
  }
  function emit(ev, payload) {
    const a = listeners[ev];
    if (!a) return;
    for (let i = 0; i < a.length; i++) {
      try { a[i](payload); } catch (e) { if (typeof console !== 'undefined') console.error(e); }
    }
  }

  const cfg = () => locationByIndex(state.locationIndex);
  const layout = () => getLayout(cfg().id);

  function stationIndex(ref) {
    const st = state.stations;
    if (typeof ref === 'number') return ref >= 0 && ref < st.length ? ref | 0 : -1;
    for (let i = 0; i < st.length; i++) if (st[i].id === ref) return i;
    return -1;
  }

  // money earned inside a tick is batched into one 'money' event
  let tickEarned = 0;
  let inTick = false;
  function addMoney(delta) {
    if (!delta) return;
    state.money = Math.max(0, state.money + delta);
    if (delta > 0) state.lifetimeMoney += delta;
    if (inTick) { tickEarned += delta; return; }
    emit('money', { value: state.money, delta });
  }
  const worldCtx = {
    get cfg() { return cfg(); },
    get layout() { return layout(); },
    emit,
    addMoney(v) { state.earned += v; addMoney(v); },
  };

  function refreshGoals() {
    if (state.complete) return;
    updateGoals(cfg(), state, (id) => emit('goal', { id }));
  }

  // Offline earnings for an absence of `seconds` (average income x time, capped).
  function noteAway(seconds) {
    if (!(seconds >= RULES.offlineMin)) return;
    const prev = state.offline ? state.offline.seconds : 0;
    const sec = Math.min(RULES.offlineCap, prev + seconds);
    const amount = Math.floor(incomeEstimate(cfg(), layout(), state) * sec * RULES.offlineRate);
    if (amount <= 0) return;
    state.offline = { seconds: sec, amount };
    emit('offline', { seconds: sec, amount });
  }

  function checkAway() {
    const t = clock();
    if (state.lastSeen > 0 && t > state.lastSeen) noteAway((t - state.lastSeen) / 1000);
    state.lastSeen = t;
  }

  if (!fresh) checkAway();
  else {
    state.lastSeen = clock();
    state.spawnT = RULES.firstArrive;
    seatFirstGuest(state, worldCtx);
  }
  refreshGoals();

  function tick(dt) {
    if (!(dt > 0)) return;
    // time away while the page was hidden (rAF paused): turn it into offline earnings
    const t = clock();
    if (state.lastSeen > 0 && t - state.lastSeen > RULES.offlineMin * 1000) {
      noteAway((t - state.lastSeen) / 1000);
    }
    state.lastSeen = t;
    dt = Math.min(dt, 1);
    state.playTime += dt;
    inTick = true;
    tickEarned = 0;
    try {
      while (dt > 1e-9) {
        const h = Math.min(dt, RULES.maxStep);
        stepWorld(state, worldCtx, h);
        dt -= h;
      }
    } finally {
      inTick = false;
    }
    if (tickEarned) emit('money', { value: state.money, delta: tickEarned });
    refreshGoals();
  }

  function setTutorial(step) {
    if (state.tutorial === step) return;
    state.tutorial = step;
    emit('tutorial', { step });
  }

  const fail = (reason) => ({ ok: false, reason });
  const OK = { ok: true };

  function act(a) {
    if (!a || typeof a !== 'object') return fail('unknown');
    const c = cfg();
    switch (a.type) {
      case 'upgrade': {
        const i = stationIndex(a.station);
        if (i < 0) return fail('unknown');
        const s = state.stations[i];
        if (!s.open) return fail('locked');
        if (s.level >= RULES.maxLevel) return fail('max');
        const cost = upgradeCost(c.stations[i], s.level);
        if (state.money < cost) return fail('money');
        addMoney(-cost);
        s.level++;
        emit('upgrade', { station: s.id, level: s.level, milestone: isMilestone(s.level) });
        if (state.tutorial === 0 || state.tutorial === 1) setTutorial(2);
        refreshGoals();
        return OK;
      }
      case 'open': {
        const i = stationIndex(a.station);
        if (i < 0) return fail('unknown');
        const s = state.stations[i];
        if (s.open) return fail('open');
        if (i > 0 && !state.stations[i - 1].open) return fail('order');
        const cost = c.stations[i].openCost;
        if (state.money < cost) return fail('money');
        addMoney(-cost);
        s.open = true;
        s.level = 1;
        s.boostT = 0;
        emit('open', { station: s.id });
        if (state.tutorial !== 'done') setTutorial('done');
        refreshGoals();
        return OK;
      }
      case 'boost': {
        const i = stationIndex(a.station);
        if (i < 0) return fail('unknown');
        const s = state.stations[i];
        if (!s.open) return fail('locked');
        if (s.boostT >= RULES.boostMax - 1e-6) return fail('max');
        s.boostT = Math.min(RULES.boostMax, s.boostT + RULES.boostPerTap);
        emit('boost', { station: s.id });
        return OK;
      }
      case 'buyTable': {
        const owned = ownedTables(state);
        if (owned >= state.tables.length) return fail('max');
        const cost = tableCost(c, owned);
        if (state.money < cost) return fail('money');
        addMoney(-cost);
        const tb = state.tables[owned];
        tb.owned = true;
        // the next customer comes quickly to the new seats
        state.spawnT = Math.min(state.spawnT, 0.3);
        emit('buyTable', { table: tb.id });
        refreshGoals();
        return OK;
      }
      case 'hire': {
        const n = state.cooks.length;
        if (n >= c.cooks.max) return fail('max');
        const cost = cookCost(c, n);
        if (state.money < cost) return fail('money');
        addMoney(-cost);
        const cook = addCook(state, layout());
        emit('hire', { cook: cook.id });
        refreshGoals();
        return OK;
      }
      case 'cookSpeed': {
        if (state.cookSpeed >= RULES.cookSpeedMax) return fail('max');
        const cost = cookSpeedCost(c, state.cookSpeed);
        if (state.money < cost) return fail('money');
        addMoney(-cost);
        state.cookSpeed++;
        emit('cookSpeed', { level: state.cookSpeed });
        refreshGoals();
        return OK;
      }
      case 'claimGoal': {
        const i = state.goals.findIndex((g) => g.id === a.id);
        if (i < 0) return fail('unknown');
        const g = state.goals[i];
        if (g.claimed) return fail('claimed');
        if (!g.done) return fail('notDone');
        g.claimed = true;
        const reward = c.goals[i].reward || 0;
        addMoney(reward);
        emit('claim', { id: g.id, reward });
        refreshGoals();
        if (allClaimed(state) && !state.complete) {
          state.complete = true;
          emit('locationComplete', { id: state.location });
        }
        return OK;
      }
      case 'nextLocation': {
        if (!state.complete) return fail('notComplete');
        if (state.locationIndex >= LOCATIONS.length - 1) return fail('last');
        const bonus = c.completeReward || 0;
        const before = state.money;
        Object.assign(state, freshLocation(state.locationIndex + 1));
        state.money += bonus;
        state.spawnT = RULES.firstArrive;
        emit('locationStart', { id: state.location });
        seatFirstGuest(state, worldCtx);
        emit('money', { value: state.money, delta: state.money - before });
        refreshGoals();
        return OK;
      }
      case 'claimOffline': {
        if (!state.offline) return fail('none');
        const amount = state.offline.amount;
        state.offline = null;
        addMoney(amount);
        return OK;
      }
      case 'setting': {
        const { key, value } = a;
        const ok =
          (key === 'lang' && LANGS.includes(value)) ||
          (key === 'sound' && typeof value === 'boolean') ||
          (key === 'quality' && QUALITIES.includes(value)) ||
          (key === 'fps' && typeof value === 'boolean');
        if (!ok) return fail('invalid');
        state.settings[key] = value;
        emit('setting', { key, value });
        return OK;
      }
      case 'tutorial': {
        if (![0, 1, 2, 'done'].includes(a.step)) return fail('invalid');
        setTutorial(a.step);
        return OK;
      }
      default:
        return fail('unknown');
    }
  }

  // ---------------------------------------------------------------- read helpers (UI)
  function stationView(ref) {
    const i = stationIndex(ref);
    if (i < 0) return null;
    const c = cfg();
    const sc = c.stations[i];
    const s = state.stations[i];
    const cost = upgradeCost(sc, s.level);
    const prevOpen = i === 0 || state.stations[i - 1].open;
    const max = s.level >= RULES.maxLevel;
    const priceNow = s.open ? cost : sc.openCost;
    return {
      id: s.id,
      index: i,
      nameKey: sc.nameKey,
      dish: sc.dish,
      dishKey: DISHES[sc.dish] ? DISHES[sc.dish].nameKey : sc.nameKey,
      kind: sc.kind,
      open: s.open,
      level: s.level,
      price: price(sc, s.level),
      nextPrice: price(sc, s.level + 1),
      gain: priceRaw(sc, s.level + 1) - priceRaw(sc, s.level),
      time: cookTime(sc, s.level),
      nextTime: cookTime(sc, s.level + 1),
      cost,
      openCost: sc.openCost,
      canAfford: !max && state.money >= priceNow,
      missing: Math.max(0, priceNow - state.money),
      canOpen: !s.open && prevOpen,
      locked: !s.open && !prevOpen,
      milestone: milestoneInfo(s.level),
      nextIsMilestone: isMilestone(s.level + 1),
      boostT: s.boostT,
      max,
    };
  }

  function tableView() {
    const owned = ownedTables(state);
    const total = state.tables.length;
    const cost = tableCost(cfg(), owned);
    return {
      owned, max: total, full: owned >= total, cost: owned >= total ? 0 : cost,
      next: owned < total ? state.tables[owned].id : null,
      canAfford: owned < total && state.money >= cost,
      seats: owned * 2, freeSeats: freeSeats(state, layout()),
    };
  }

  function cookView() {
    const c = cfg();
    const n = state.cooks.length;
    const full = n >= c.cooks.max;
    const cost = full ? 0 : cookCost(c, n);
    return { count: n, max: c.cooks.max, full, cost, canAfford: !full && state.money >= cost };
  }

  function cookSpeedView() {
    const L = state.cookSpeed;
    const full = L >= RULES.cookSpeedMax;
    const cost = full ? 0 : cookSpeedCost(cfg(), L);
    return {
      level: L, max: RULES.cookSpeedMax, full, cost, canAfford: !full && state.money >= cost,
      mult: cookSpeedMult(L), nextMult: cookSpeedMult(Math.min(L + 1, RULES.cookSpeedMax)),
    };
  }

  function goalViews() {
    const c = cfg();
    return visibleGoalIndices(state).map((i) => goalView(c, i));
  }
  function goalView(c, i) {
    const def = c.goals[i];
    const g = state.goals[i];
    const m = goalMeasure(def, c, state);
    const sc = def.station ? c.stations.find((s) => s.id === def.station) : null;
    return {
      id: def.id,
      type: def.type,
      textKey: GOAL_TEXT_KEYS[def.type],
      params: { n: def.target || 1, stationKey: sc ? sc.nameKey : null },
      cur: g.done ? m.target : Math.min(m.cur, m.target),
      target: m.target,
      progress: g.done ? 1 : Math.max(0, Math.min(1, m.cur / m.target)),
      done: g.done,
      claimed: g.claimed,
      reward: def.reward || 0,
      station: def.station || null,
    };
  }

  function canAfford(x) {
    if (typeof x === 'number') return state.money >= x;
    if (!x || typeof x !== 'object') return false;
    if (x.type === 'buyTable') return tableView().canAfford;
    if (x.type === 'hire') return cookView().canAfford;
    if (x.type === 'cookSpeed') return cookSpeedView().canAfford;
    const v = stationView(x.station);
    if (!v) return false;
    if (x.type === 'open') return v.canOpen && state.money >= v.openCost;
    return v.open && !v.max && state.money >= v.cost;
  }

  // Which affordable purchases are worth it right now (for the UI arrows / dots):
  // { [stationId | 'table' | 'cook' | 'cookSpeed']: 'best' | 'good' }.
  function hints() {
    const c = cfg();
    const L = layout();
    const base = incomeEstimate(c, L, state);
    const list = [];
    let top = 0;
    const consider = (id, cost, apply, undo) => {
      if (!(cost < Infinity)) return;
      apply();
      const gain = incomeEstimate(c, L, state) - base;
      undo();
      const score = Math.max(0, gain) / Math.max(1, cost);
      if (score > top) top = score;
      list.push({ id, cost, score });
    };
    state.stations.forEach((s, i) => {
      if (!s.open || s.level >= RULES.maxLevel) return;
      consider(s.id, upgradeCost(c.stations[i], s.level), () => { s.level++; }, () => { s.level--; });
    });
    const owned = ownedTables(state);
    if (owned < state.tables.length) {
      const tb = state.tables[owned];
      consider('table', tableCost(c, owned), () => { tb.owned = true; }, () => { tb.owned = false; });
    }
    if (state.cooks.length < c.cooks.max) {
      const fake = { id: '_', state: 'idle' };
      consider('cook', cookCost(c, state.cooks.length), () => { state.cooks.push(fake); }, () => { state.cooks.pop(); });
    }
    if (state.cookSpeed < RULES.cookSpeedMax) {
      consider('cookSpeed', cookSpeedCost(c, state.cookSpeed), () => { state.cookSpeed++; }, () => { state.cookSpeed--; });
    }
    const out = {};
    let best = null;
    for (const x of list) {
      if (state.money < x.cost) continue;
      if (x.score >= 0.25 * top || x.cost < base * 5) {
        out[x.id] = 'good';
        if (!best || x.score > best.score) best = x;
      }
    }
    if (best) out[best.id] = 'best';
    return out;
  }

  // Order bubble data for a customer: { dish, phase, progress } or null.
  // phase 'waiting' (no cook yet), 'cooking' (progress 0..1), 'coming' (cook carries it).
  function orderView(customerId) {
    const cu = state.customers.find((x) => x.id === customerId);
    if (!cu || cu.state !== 'waiting') return null;
    for (const k of state.cooks) {
      if (!k.order || k.order.customer !== customerId) continue;
      if (k.state === 'cooking') return { dish: cu.dish, phase: 'cooking', progress: k.dur > 0 ? Math.min(1, k.t / k.dur) : 1 };
      if (k.state === 'toTable' || k.state === 'serving') return { dish: cu.dish, phase: 'coming', progress: 1 };
      return { dish: cu.dish, phase: 'waiting', progress: 0 };
    }
    return { dish: cu.dish, phase: 'waiting', progress: 0 };
  }

  function locationInfo() {
    const c = cfg();
    const done = claimedCount(state);
    const total = state.goals.length;
    return {
      id: c.id,
      index: state.locationIndex,
      nameKey: c.nameKey,
      isLast: state.locationIndex >= LOCATIONS.length - 1,
      complete: state.complete,
      served: state.served,
      goalsDone: done,
      goalsTotal: total,
      stars: Math.floor((done / Math.max(1, total)) * 3 + 1e-9),
    };
  }

  function locations() {
    const out = LOCATIONS.map((l, i) => ({
      id: l.id,
      nameKey: l.nameKey,
      status: i < state.locationIndex ? 'done' : i === state.locationIndex ? (state.complete ? 'complete' : 'current') : 'locked',
      canGo: i === state.locationIndex + 1 && state.complete,
    }));
    for (const k of COMING_SOON) out.push({ id: k, nameKey: k, status: 'soon', canGo: false });
    return out;
  }

  const select = {
    incomePerSec: () => incomeEstimate(cfg(), layout(), state),
    stationView,
    tableView,
    cookView,
    cookSpeedView,
    goalViews,
    canAfford,
    hints,
    orderView,
    location: locationInfo,
    locations,
    offline: () => (state.offline ? { seconds: state.offline.seconds, amount: state.offline.amount } : null),
  };

  function saveFn() {
    state.lastSeen = clock();
    return serialize(state);
  }

  return {
    get state() { return state; },
    tick,
    act,
    on,
    save: saveFn,
    select,
    config: cfg,
    layout,
    checkAway,
  };
}
