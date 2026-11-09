// Aftermath v2: FTUE director (DESIGN §3, ARCH §4.3). Resume-safe: everything derives from saved state.
import { FTUE_DISTRICT as K, BAL } from './data.js';
import { FTUE_COPY } from './copy.js';
import { emit, say, startCalm, owned, assigned, silently, tick as simTick } from './sim.js';
import { act } from './actions.js';

const conDone = (s) => s.stats.contracts >= 1;

export const FTUE_STEPS = [
  {
    id: 'cold', objective: FTUE_COPY.cold.objective, highlight: { type: 'none', ref: null }, bubble: null,
    npc: [], allow: ['skip', 'skipAttack'], dim: false,
    done: (s) => s.progress.contractNo >= 1 && (s.phase === 'tender' || s.phase === 'cleanup' || conDone(s)),
  },
  {
    id: 'call', objective: FTUE_COPY.call.objective, highlight: { type: 'button', ref: 'acceptCall' }, bubble: null,
    npc: [], allow: ['acceptCall'], dim: true,
    done: (s) => !!s.contract || conDone(s),
  },
  {
    id: 'fire', objective: FTUE_COPY.fire.objective,
    highlight: { type: 'district', ref: K, inner: { type: 'button', ref: `dispatch:fire:${K}` } },
    bubble: { text: FTUE_COPY.fire.bubble, anchor: `district:${K}` },
    npc: [{ when: 'arrive', text: FTUE_COPY.fire.npc }],
    allow: [`select:${K}`, `dispatch:fire:${K}`, 'closeSheet'], dim: true, waitType: 'fire',
    done: (s) => (s.sectors[K].fire <= 0 && !!s.attack && s.attack.hit) || conDone(s),
  },
  {
    id: 'rubble', objective: FTUE_COPY.rubble.objective,
    highlight: { type: 'district', ref: K, inner: { type: 'button', ref: `dispatch:debris:${K}` } },
    bubble: { text: FTUE_COPY.rubble.bubble, anchor: `district:${K}` },
    npc: [], allow: [`select:${K}`, `dispatch:debris:${K}`, 'closeSheet'], dim: true, waitType: 'debris',
    done: (s) => s.sectors[K].rubble <= 0 || conDone(s),
  },
  {
    id: 'carve', objective: FTUE_COPY.carve.objective,
    highlight: { type: 'district', ref: K, inner: { type: 'button', ref: `dispatch:carve:${K}` } },
    bubble: { text: FTUE_COPY.carve.bubble, anchor: `district:${K}` },
    npc: [{ when: 'part', text: FTUE_COPY.carve.npc }],
    allow: [`select:${K}`, `dispatch:carve:${K}`, 'closeSheet'], dim: true, waitType: 'carve',
    done: (s) => !!s.result || conDone(s),
  },
  {
    id: 'deliver', objective: FTUE_COPY.deliver.objective, highlight: { type: 'button', ref: 'collectPayment' }, bubble: null,
    npc: [], allow: ['collectPayment'], dim: true,
    done: (s) => conDone(s) && !s.result,
  },
  {
    id: 'sell', objective: FTUE_COPY.sell.objective,
    highlight: { type: 'tab', ref: 'depot', inner: { type: 'button', ref: 'sellAll:riza' } },
    bubble: { text: FTUE_COPY.sell.bubble, anchor: 'tab:depot' },
    npc: [], allow: ['tab:depot', 'tab:city', 'sellAll'], dim: true,
    done: (s) => s.stats.sold > 0,
  },
  {
    id: 'buy', objective: FTUE_COPY.buy.objective,
    highlight: { type: 'tab', ref: 'company', inner: { type: 'button', ref: 'buyVehicle:fire' } },
    bubble: null,
    npc: [{ when: 'start', who: 'riza', text: FTUE_COPY.buy.npc }],
    allow: ['tab:*', 'buyVehicle:fire'], dim: true,
    done: (s) => owned(s, 'fire') >= 2,
  },
];
export const FTUE_ORDER = [...FTUE_STEPS.map((x) => x.id), 'done'];
const byId = Object.fromEntries(FTUE_STEPS.map((x) => [x.id, x]));

// keys any FTUE step lets through (UI chrome and notices)
const ALWAYS = ['settings', 'ackNotice', 'tip', 'markSeen'];

function enter(s, id) {
  if (id === 'buy') say(s, 'riza', FTUE_COPY.buy.npc);
  if (id === 'done') {
    startCalm(s, BAL.calmFtue);
    say(s, 'nevin', FTUE_COPY.done.npc);
  }
}

/** Moves the FTUE forward while the current step is done (runs inside tick and after every action). */
export function ftueAdvance(s) {
  for (let guard = 0; guard < 10; guard++) {
    const cur = s.progress.ftue;
    const st = byId[cur];
    if (!st || !st.done(s)) return;
    const next = FTUE_ORDER[FTUE_ORDER.indexOf(cur) + 1];
    s.progress.ftue = next;
    emit('ftue', { step: next, prev: cur });
    enter(s, next);
  }
}

function partMatch(allow, key) {
  if (allow === key) return true;
  const a = allow.split(':');
  const k = key.split(':');
  if (k.length < a.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== '*' && a[i] !== k[i]) return false;
  return true;
}

/** Is a UI or action key allowed by the current FTUE step? (always true once done) */
export function ftueAllows(s, key) {
  const st = byId[s.progress.ftue];
  if (!st) return true;
  const head = String(key).split(':')[0];
  if (ALWAYS.includes(head)) return true;
  for (const a of st.allow) if (partMatch(a, String(key))) return true;
  return false;
}

/** View model for the FTUE overlay; null once done. */
export function ftueView(s) {
  const st = byId[s.progress.ftue];
  if (!st) return null;
  let bubble = st.bubble;
  let highlight = st.highlight;
  // the pointer only shows while the step's vehicle still has to be sent
  if (st.waitType && assigned(s, K, st.waitType) > 0) {
    bubble = null;
    highlight = { type: 'none', ref: null };
  }
  if (st.id === 'call' && s.notices.length) highlight = { type: 'none', ref: null };
  const npc = s.npc && s.clock < s.npc.until ? { who: s.npc.who, name: s.npc.name, text: s.npc.text } : null;
  return {
    step: st.id, objective: st.objective, highlight, bubble, npc, allow: st.allow.slice(),
    dim: st.dim && highlight.type !== 'none',
  };
}

/**
 * Mutates a fresh state into a consistent state at the start of `stepId` by silently playing the FTUE
 * with its own allowed actions (tests, ui-lab, aftermath.ftue()).
 */
export function debugFtue(s, stepId) {
  const target = FTUE_ORDER.indexOf(stepId);
  if (target < 0) return s;
  silently(() => {
    for (let guard = 0; guard < 4000; guard++) {
      const i = FTUE_ORDER.indexOf(s.progress.ftue);
      if (i >= target) break;
      driveFtue(s);
      simTick(s, 0.1);
    }
  });
  return s;
}

/** One scripted FTUE action for the current step (used by debugFtue and tests). */
export function driveFtue(s) {
  switch (s.progress.ftue) {
    case 'cold':
      if (s.phase === 'attack') return act(s, 'skipAttack');
      return null;
    case 'call':
      return act(s, 'acceptCall');
    case 'fire':
      if (assigned(s, K, 'fire') === 0) return act(s, 'dispatch', { type: 'fire', sector: K });
      return null;
    case 'rubble':
      if (s.sectors[K].fire <= 0 && assigned(s, K, 'debris') < 2) return act(s, 'dispatch', { type: 'debris', sector: K });
      return null;
    case 'carve':
      if (s.sectors[K].rubble <= 0 && assigned(s, K, 'carve') === 0) return act(s, 'dispatch', { type: 'carve', sector: K });
      return null;
    case 'deliver':
      return act(s, 'collectPayment');
    case 'sell':
      return act(s, 'sellAll', { buyer: 'riza' });
    case 'buy':
      return act(s, 'buyVehicle', { type: 'fire' });
    default:
      return null;
  }
}
