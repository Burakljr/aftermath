// Goal progress and completion. Goal definitions live in config.js (per location).
import { ownedTables } from './sim.js';

export const VISIBLE_GOALS = 3;

// Current value and target for a goal definition.
export function goalMeasure(def, cfg, state) {
  switch (def.type) {
    case 'open': {
      const s = state.stations.find((x) => x.id === def.station);
      return { cur: s && s.open ? 1 : 0, target: 1 };
    }
    case 'level': {
      const s = state.stations.find((x) => x.id === def.station);
      return { cur: s && s.open ? s.level : 0, target: def.target };
    }
    case 'served':
      return { cur: state.served, target: def.target };
    case 'tables':
      return { cur: ownedTables(state), target: def.target };
    case 'cooks':
      return { cur: state.cooks.length, target: def.target };
    case 'cookSpeed':
      return { cur: state.cookSpeed, target: def.target };
    default:
      return { cur: 0, target: 1 };
  }
}

function stationById(state, id) {
  const st = state.stations;
  for (let i = 0; i < st.length; i++) if (st[i].id === id) return st[i];
  return null;
}

// Current value of a goal without allocating (runs every tick).
export function goalValue(def, state) {
  switch (def.type) {
    case 'open': { const s = stationById(state, def.station); return s && s.open ? 1 : 0; }
    case 'level': { const s = stationById(state, def.station); return s && s.open ? s.level : 0; }
    case 'served': return state.served;
    case 'tables': return ownedTables(state);
    case 'cooks': return state.cooks.length;
    case 'cookSpeed': return state.cookSpeed;
    default: return 0;
  }
}

// Mark goals done (sticky). Calls onDone(id) for goals that just became done.
export function updateGoals(cfg, state, onDone) {
  const defs = cfg.goals;
  for (let i = 0; i < defs.length; i++) {
    const g = state.goals[i];
    if (!g || g.done) continue;
    if (goalValue(defs[i], state) >= (defs[i].target || 1)) {
      g.done = true;
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

export function claimedCount(state) {
  let n = 0;
  for (const g of state.goals) if (g.claimed) n++;
  return n;
}

export const GOAL_TEXT_KEYS = {
  open: 'goal.open',
  level: 'goal.level',
  served: 'goal.served',
  tables: 'goal.tables',
  cooks: 'goal.cooks',
  cookSpeed: 'goal.cookSpeed',
};
