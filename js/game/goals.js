// Aftermath v2: the "Hedef" chain G1..G15 (DESIGN §4, ARCH §4.3).
import { BAL, DISTRICTS } from './data.js';
import { GOAL_COPY, UNITS, NEWS } from './copy.js';
import { emit, sfx, owned, credit, pushNotice } from './sim.js';

const C = (s) => s.stats.contracts;
// counters measured from the moment the goal became current (so goals never complete in a clump)
const sinceStart = (s, key) => s.stats[key] - ((s.progress.goalBase && s.progress.goalBase[key]) || 0);
// jobs that are over (won, late or lost with the tail job finished) and collected; a lost tender never blocks G12
const jobsDone = (s) => s.progress.contractNo - (s.phase !== 'calm' || s.result ? 1 : 0);
const prog = (done, total, unit) => ({ done: Math.min(done, total), total, unit });

export const GOALS = [
  { id: 'G1', check: (s) => C(s) >= 1 && !s.result, unlock: ['depot'] },
  { id: 'G2', check: (s) => s.stats.sold > 0, unlock: ['company'] },
  { id: 'G3', check: (s) => owned(s, 'fire') >= 2, unlock: [], progress: (s) => prog(owned(s, 'fire'), 2, UNITS.vehicle) },
  { id: 'G4', check: (s) => C(s) >= 2, unlock: ['factory', 'recipe:concrete'], money: BAL.goal4Money },
  { id: 'G5', check: (s) => s.stats.made >= 1, unlock: ['tender'] },
  { id: 'G6', check: (s) => s.stats.won >= 1, unlock: ['upkeep'] },
  { id: 'G7', check: (s) => s.sectors.some((x) => x.upkeep > 0), unlock: ['offline'] },
  { id: 'G8', check: (s) => C(s) >= 4, unlock: ['offers', 'recipe:armor'], progress: (s) => prog(C(s), 4, 'iş') },
  { id: 'G9', check: (s) => sinceStart(s, 'offerSold') >= 5, unlock: ['recipe:cell'], progress: (s) => prog(sinceStart(s, 'offerSold'), 5, UNITS.part) },
  { id: 'G10', check: (s) => sinceStart(s, 'gold') >= 1, fallback: (s) => C(s) >= 6, unlock: ['equipment', 'line2'] },
  { id: 'G11', check: (s) => owned(s, 'carve') >= 3, fallback: (s) => C(s) >= 8, unlock: ['foreman', 'autoRepeat', 'recipe:relic'],
    progress: (s) => prog(owned(s, 'carve'), 3, 'kesim ekibi') },
  { id: 'G12', check: (s) => jobsDone(s) >= 7, unlock: [], progress: (s) => prog(jobsDone(s), 7, UNITS.contract) },
  { id: 'G13', check: (s) => !!s.flags.buyerDecided, unlock: ['dna'] },
  { id: 'G14', check: (s) => s.trust >= 80, unlock: ['tierCap4'], progress: (s) => prog(Math.floor(s.trust), 80, UNITS.trust) },
  { id: 'G15', check: (s) => s.sectors.every((x) => x.upkeep >= 1), unlock: ['chapter'],
    progress: (s) => prog(s.sectors.filter((x) => x.upkeep >= 1).length, DISTRICTS.length, UNITS.district) },
].map((g) => ({ ...g, text: GOAL_COPY[g.id].text, reward: GOAL_COPY[g.id].reward, fallback: g.fallback || null, progress: g.progress || null }));

const byId = Object.fromEntries(GOALS.map((g) => [g.id, g]));
export const goalById = (id) => byId[id] || null;
export const goalDone = (s, id) => s.progress.goalsDone.includes(id);

/** Applies one unlock key (sets the flag, side effects, emits 'unlock'). */
export function unlock(s, key) {
  if (key.startsWith('recipe:')) {
    const r = key.slice(7);
    if (s.progress.recipes[r]) return;
    s.progress.recipes[r] = true;
  } else if (key === 'chapter') {
    if (s.flags.chapterEnd) return;
    s.flags.chapterEnd = true;
    pushNotice(s, 'chapter', {});
  } else {
    if (s.progress.unlocked[key]) return;
    s.progress.unlocked[key] = true;
    if (key === 'line2') s.upgrades.lines = Math.max(1, s.upgrades.lines);
  }
  emit('unlock', { key });
}

function complete(s, g) {
  s.progress.goalsDone.push(g.id);
  for (const k of g.unlock) unlock(s, k);
  if (g.money) credit(s, g.money);
  const i = GOALS.indexOf(g);
  const next = GOALS[i + 1] ? GOALS[i + 1].id : 'end';
  s.progress.goal = next;
  s.progress.goalT = s.clock;
  s.progress.goalBase = { offerSold: s.stats.offerSold, gold: s.stats.gold };
  emit('goal', { id: g.id, next });
  sfx('build');
}

/** Completes the current goal (and any following ones already met). Runs inside tick. */
export function checkGoals(s) {
  for (let guard = 0; guard < GOALS.length; guard++) {
    const g = byId[s.progress.goal];
    if (!g) return;
    // unlock moments stay at least BAL.goalGap apart after the FTUE (G1-G3 must chain for the tabs)
    if (GOALS.indexOf(g) >= 3 && s.clock - (s.progress.goalT || 0) < BAL.goalGap) return;
    if (!(g.check(s) || (g.fallback && g.fallback(s)))) return;
    complete(s, g);
  }
}

export { NEWS };
