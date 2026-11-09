// Economy maths and the production line step. Pure functions over state + config.
import { RULES } from './config.js';

const MS = RULES.milestones;

export function milestonesReached(level) {
  let n = 0;
  for (let i = 0; i < MS.length; i++) if (level >= MS[i]) n++;
  return n;
}

export function isMilestone(level) {
  return MS.indexOf(level) !== -1;
}

// { prev, next, ratio, reached } for the milestone bar. next = null after the last.
export function milestoneInfo(level) {
  let prev = 1;
  let next = null;
  for (let i = 0; i < MS.length; i++) {
    if (level >= MS[i]) prev = MS[i];
    else { next = MS[i]; break; }
  }
  const ratio = next === null ? 1 : (level - prev) / (next - prev);
  return { prev, next, ratio, reached: milestonesReached(level) };
}

export function speedMult(level) {
  return (1 + RULES.speedPerLevel * (level - 1)) * Math.pow(2, milestonesReached(level));
}

export function cycleTime(sc, level) {
  return sc.baseTime / speedMult(level);
}

export function stationValue(sc, level) {
  const g = RULES.valueGrowth || 1;
  return Math.round(sc.baseValue * level * Math.pow(g, level - 1));
}

/** Smooth (unrounded) value gain of the next level, for display: it never drops from one
 * level to the next, while the rounded per-level gain can jitter (+2, +1, +2). */
export function stationGain(sc, level) {
  const g = RULES.valueGrowth || 1;
  return sc.baseValue * ((level + 1) * Math.pow(g, level) - level * Math.pow(g, level - 1));
}

export function upgradeCost(sc, level) {
  return Math.round(sc.baseCost * Math.pow(RULES.costGrowth, level - 1));
}

export function toyValue(cfg, factory) {
  let v = 0;
  const st = factory.stations;
  for (let i = 0; i < st.length; i++) if (st[i].open) v += stationValue(cfg.stations[i], st[i].level);
  return v;
}

export function lastOpenIndex(factory) {
  let last = -1;
  const st = factory.stations;
  for (let i = 0; i < st.length; i++) if (st[i].open) last = i;
  return last;
}

// Index of the slowest open station (ignores boosts).
export function bottleneckIndex(cfg, factory) {
  let worst = -1;
  let worstT = -1;
  const st = factory.stations;
  for (let i = 0; i < st.length; i++) {
    if (!st[i].open) continue;
    const t = cycleTime(cfg.stations[i], st[i].level);
    if (t > worstT + 1e-9) { worstT = t; worst = i; }
  }
  return worst;
}

// Steady income per second without boosts: bottleneck rate x toy value.
export function incomePerSec(cfg, factory) {
  const b = bottleneckIndex(cfg, factory);
  if (b < 0) return 0;
  return toyValue(cfg, factory) / cycleTime(cfg.stations[b], factory.stations[b].level);
}

// Advance the line by dt seconds (dt should be small; see RULES.maxStep).
// emit(name, payload) is called for cycle/pass/sold. Returns coins earned.
export function stepLine(cfg, factory, dt, emit) {
  const st = factory.stations;
  const last = lastOpenIndex(factory);
  let earned = 0;
  for (let i = last; i >= 0; i--) {
    const s = st[i];
    if (!s.open) continue;
    const sc = cfg.stations[i];
    const boosted = s.boostT > 0;
    if (boosted) s.boostT = Math.max(0, s.boostT - dt);
    const ct = cycleTime(sc, s.level) / (boosted ? RULES.boostMult : 1);
    let t = dt;
    let guard = 0;
    while (guard++ < 64) {
      if (s.progress >= 1) {
        // finished item: hand it on
        if (i === last) {
          const value = toyValue(cfg, factory);
          earned += value;
          factory.sold++;
          s.progress = 0;
          emit('sold', { value });
        } else {
          const n = st[i + 1];
          if (n.tray < RULES.trayMax) {
            n.tray++;
            s.progress = 0;
            emit('pass', { from: s.id, to: n.id });
          } else break; // blocked
        }
      }
      if (t <= 0) break;
      if (s.progress === 0) {
        if (i > 0) {
          if (s.tray > 0) s.tray--;
          else break; // idle, waiting for input
        }
      }
      const need = (1 - s.progress) * ct;
      if (t >= need) {
        t -= need;
        s.progress = 1;
        emit('cycle', { station: s.id });
      } else {
        s.progress += t / ct;
        if (s.progress <= 0) s.progress = 1e-6;
        t = 0;
      }
    }
  }
  return earned;
}
