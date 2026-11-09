// Goal progress and completion. Goal definitions live in config.js.
import { incomePerSec } from './sim.js';

export const VISIBLE_GOALS = 3;

function stationIndex(cfg, id) {
  return cfg.stations.findIndex((s) => s.id === id);
}

// Current value and target for a goal definition.
export function goalMeasure(def, cfg, state) {
  const f = state.factory;
  switch (def.type) {
    case 'open': {
      const i = stationIndex(cfg, def.station);
      return { cur: i >= 0 && f.stations[i].open ? 1 : 0, target: 1 };
    }
    case 'level': {
      const i = stationIndex(cfg, def.station);
      return { cur: i >= 0 ? f.stations[i].level : 0, target: def.target };
    }
    case 'sold':
      return { cur: f.sold, target: def.target };
    case 'income':
      return { cur: incomePerSec(cfg, f), target: def.target };
    case 'allLevel': {
      // counts open stations only; a locked station counts as level 0
      let min = Infinity;
      for (const s of f.stations) min = Math.min(min, s.open ? s.level : 0);
      return { cur: min === Infinity ? 0 : min, target: def.target };
    }
    default:
      return { cur: 0, target: 1 };
  }
}

// Refresh progress/done for every goal. Calls onDone(id) for goals that just became done.
export function updateGoals(cfg, state, onDone) {
  const defs = cfg.goals;
  for (let i = 0; i < defs.length; i++) {
    const g = state.goals[i];
    if (!g || g.done) continue;
    const m = goalMeasure(defs[i], cfg, state);
    const p = Math.max(0, Math.min(1, m.cur / m.target));
    g.progress = p;
    if (m.cur >= m.target) {
      g.done = true;
      g.progress = 1;
      onDone(g.id);
    }
  }
}

// Indices (into cfg.goals / state.goals) of the visible goals: first N not yet claimed.
export function visibleGoalIndices(state, n = VISIBLE_GOALS) {
  const out = [];
  for (let i = 0; i < state.goals.length && out.length < n; i++) {
    if (!state.goals[i].claimed) out.push(i);
  }
  return out;
}

export function allClaimed(state) {
  return state.goals.length > 0 && state.goals.every((g) => g.claimed);
}

export const GOAL_TEXT_KEYS = {
  open: 'goal.open',
  level: 'goal.level',
  sold: 'goal.sold',
  income: 'goal.income',
  allLevel: 'goal.allLevel',
};
