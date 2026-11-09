// createGame(): the whole game model. No DOM; safe to run in node tests.
import { FACTORIES, RULES, factoryByIndex } from './config.js';
import { freshState, loadState, serialize, freshFactory, freshGoals, LANGS, QUALITIES } from './state.js';
import {
  stepLine, incomePerSec, upgradeCost, stationValue, cycleTime, milestoneInfo,
  isMilestone, toyValue, bottleneckIndex,
} from './sim.js';
import { updateGoals, visibleGoalIndices, allClaimed, goalMeasure, GOAL_TEXT_KEYS } from './goals.js';
import { detectLang } from './i18n.js';

export { FACTORIES, RULES };

export const EVENTS = [
  'cycle', 'pass', 'sold', 'upgrade', 'open', 'boost', 'goal', 'claim',
  'factoryComplete', 'factoryStart', 'money', 'offline', 'setting', 'tutorial',
];

export function createGame({ save = null, now = Date.now, lang } = {}) {
  const clock = typeof now === 'function' ? now : () => now;
  let state = save ? loadState(save) : null;
  const fresh = !state;
  if (!state) state = freshState({ lang: lang || detectLang(), now: clock() });

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

  const cfg = () => factoryByIndex(state.factoryIndex);

  function stationIndex(ref) {
    const st = state.factory.stations;
    if (typeof ref === 'number') return ref >= 0 && ref < st.length ? ref | 0 : -1;
    return st.findIndex((s) => s.id === ref);
  }

  function addMoney(delta) {
    if (!delta) return;
    state.money = Math.max(0, state.money + delta);
    if (delta > 0) state.lifetimeMoney += delta;
    emit('money', { value: state.money, delta });
  }

  function refreshGoals() {
    if (state.factory.complete) return;
    updateGoals(cfg(), state, (id) => emit('goal', { id }));
  }

  // Offline earnings for an absence of `seconds`.
  function noteAway(seconds) {
    if (!(seconds >= RULES.offlineMin)) return;
    const prev = state.offline ? state.offline.seconds : 0;
    const sec = Math.min(RULES.offlineCap, prev + seconds);
    const amount = Math.floor(incomePerSec(cfg(), state.factory) * sec * RULES.offlineRate);
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
  else state.lastSeen = clock();
  refreshGoals();

  const lineEmit = (ev, p) => {
    if (ev === 'sold') addMoneyFromSale(p.value);
    emit(ev, p);
  };
  function addMoneyFromSale(v) {
    state.money += v;
    state.lifetimeMoney += v;
  }

  function tick(dt) {
    if (!(dt > 0)) return;
    // time away while the page was hidden (rAF paused): turn it into offline earnings
    const t = clock();
    if (state.lastSeen > 0 && t - state.lastSeen > RULES.offlineMin * 1000) {
      noteAway((t - state.lastSeen) / 1000);
    }
    state.lastSeen = t;
    dt = Math.min(dt, 1);
    const c = cfg();
    let moneyBefore = state.money;
    while (dt > 1e-9) {
      const h = Math.min(dt, RULES.maxStep);
      stepLine(c, state.factory, h, lineEmit);
      dt -= h;
    }
    if (state.money !== moneyBefore) emit('money', { value: state.money, delta: state.money - moneyBefore });
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
    const f = state.factory;
    switch (a.type) {
      case 'upgrade': {
        const i = stationIndex(a.station);
        if (i < 0) return fail('unknown');
        const s = f.stations[i];
        if (!s.open) return fail('locked');
        const cost = upgradeCost(c.stations[i], s.level);
        if (state.money < cost) return fail('money');
        addMoney(-cost);
        s.level++;
        const milestone = isMilestone(s.level);
        emit('upgrade', { station: s.id, level: s.level, milestone });
        if (state.tutorial === 0) setTutorial(1);
        refreshGoals();
        return OK;
      }
      case 'open': {
        const i = stationIndex(a.station);
        if (i < 0) return fail('unknown');
        const s = f.stations[i];
        if (s.open) return fail('open');
        if (i > 0 && !f.stations[i - 1].open) return fail('order');
        const cost = c.stations[i].openCost;
        if (state.money < cost) return fail('money');
        addMoney(-cost);
        s.open = true;
        s.level = 1;
        s.progress = 0;
        s.tray = 0;
        s.boostT = 0;
        emit('open', { station: s.id });
        if (state.tutorial === 0 || state.tutorial === 1) setTutorial(2);
        refreshGoals();
        return OK;
      }
      case 'boost': {
        const i = stationIndex(a.station);
        if (i < 0) return fail('unknown');
        const s = f.stations[i];
        if (!s.open) return fail('locked');
        if (s.boostT >= RULES.boostMax - 1e-6) return fail('max');
        s.boostT = Math.min(RULES.boostMax, s.boostT + RULES.boostPerTap);
        emit('boost', { station: s.id });
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
        if (state.tutorial === 2) setTutorial('done');
        refreshGoals();
        if (allClaimed(state) && !f.complete) {
          f.complete = true;
          emit('factoryComplete', { id: f.id });
        }
        return OK;
      }
      case 'nextFactory': {
        if (!f.complete) return fail('notComplete');
        if (state.factoryIndex >= FACTORIES.length - 1) return fail('last');
        const bonus = c.completeReward || 0;
        state.factoryIndex++;
        state.factory = freshFactory(state.factoryIndex);
        state.goals = freshGoals(state.factoryIndex);
        const before = state.money;
        state.money = cfg().startMoney + bonus;
        emit('factoryStart', { id: state.factory.id });
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

  function stationView(ref) {
    const i = stationIndex(ref);
    if (i < 0) return null;
    const c = cfg();
    const sc = c.stations[i];
    const s = state.factory.stations[i];
    const cost = upgradeCost(sc, s.level);
    const prevOpen = i === 0 || state.factory.stations[i - 1].open;
    const price = s.open ? cost : sc.openCost;
    const ms = milestoneInfo(s.level);
    const b = bottleneckIndex(c, state.factory);
    return {
      id: s.id,
      index: i,
      nameKey: sc.nameKey,
      open: s.open,
      level: s.level,
      value: stationValue(sc, s.level),
      nextValue: stationValue(sc, s.level + 1),
      time: cycleTime(sc, s.level),
      nextTime: cycleTime(sc, s.level + 1),
      cost,
      openCost: sc.openCost,
      canAfford: state.money >= price,
      missing: Math.max(0, price - state.money),
      canOpen: !s.open && prevOpen,
      locked: !s.open && !prevOpen,
      milestone: ms,
      nextIsMilestone: isMilestone(s.level + 1),
      bottleneck: s.open && b === i && state.factory.stations.filter((x) => x.open).length > 1,
      boostT: s.boostT,
      progress: s.progress,
      tray: s.tray,
    };
  }

  function goalViews() {
    const c = cfg();
    return visibleGoalIndices(state).map((i) => {
      const def = c.goals[i];
      const g = state.goals[i];
      const m = goalMeasure(def, c, state);
      const si = def.station ? c.stations.findIndex((s) => s.id === def.station) : -1;
      return {
        id: def.id,
        type: def.type,
        textKey: GOAL_TEXT_KEYS[def.type],
        params: { n: def.target, stationKey: si >= 0 ? c.stations[si].nameKey : null },
        cur: g.done ? m.target : Math.min(m.cur, m.target),
        target: m.target,
        progress: g.done ? 1 : Math.max(0, Math.min(1, m.cur / m.target)),
        done: g.done,
        claimed: g.claimed,
        reward: def.reward || 0,
        station: def.station || null,
      };
    });
  }

  function canAfford(x) {
    if (typeof x === 'number') return state.money >= x;
    if (x && typeof x === 'object') {
      const v = stationView(x.station);
      if (!v) return false;
      if (x.type === 'open') return v.canOpen && state.money >= v.openCost;
      return v.open && state.money >= v.cost;
    }
    return false;
  }

  const select = {
    incomePerSec: () => incomePerSec(cfg(), state.factory),
    toyValue: () => toyValue(cfg(), state.factory),
    stationView,
    goalViews,
    canAfford,
    offline: () => (state.offline ? { seconds: state.offline.seconds, amount: state.offline.amount } : null),
    factory: () => {
      const c = cfg();
      return {
        id: c.id,
        index: state.factoryIndex,
        nameKey: c.nameKey,
        toyKey: c.toyKey,
        isLast: state.factoryIndex >= FACTORIES.length - 1,
        complete: state.factory.complete,
        reward: c.completeReward || 0,
        sold: state.factory.sold,
      };
    },
    // Which affordable upgrades are worth it right now (for the UI arrows):
    // { [stationId]: 'best' | 'good' }. Good = at least 20% as useful per coin as
    // the most useful upgrade (affordable or not), or very cheap (< 6 s of income).
    hints: () => {
      const c = cfg();
      const f = state.factory;
      const base = incomePerSec(c, f);
      const list = [];
      let top = 0;
      for (let i = 0; i < f.stations.length; i++) {
        const s = f.stations[i];
        if (!s.open) continue;
        const cost = upgradeCost(c.stations[i], s.level);
        s.level++;
        const gain = incomePerSec(c, f) - base;
        s.level--;
        const score = gain / cost;
        if (score > top) top = score;
        list.push({ id: s.id, cost, score });
      }
      const out = {};
      let best = null;
      for (const x of list) {
        if (state.money < x.cost) continue;
        if (x.score >= 0.2 * top || x.cost < base * 6) {
          out[x.id] = 'good';
          if (!best || x.score > best.score) best = x;
        }
      }
      if (best) out[best.id] = 'best';
      return out;
    },
    bottleneck: () => {
      const b = bottleneckIndex(cfg(), state.factory);
      return b >= 0 ? state.factory.stations[b].id : null;
    },
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
    checkAway,
  };
}
