// Fake state builder for scene-lab (ARCH 5.2 subset only). Every phase and visual state from URL-style
// options: { phase, t, chain:[ids], extra:[ids], first, mutant, stage, fire, rubble, carve, fleet:{fire,debris,carve},
//   sel, inv, job, upkeep, warn:[from,to], result, seed }.
export const ATTACK = { pre: 2.4, hit: 2.6, endFirst: 3.8, end: 3.6, cut: 2.0 };
const SEGS = ['head', 'body', 'tail'];
export const FIRE0 = { 0: 60, 1: 50, 2: 75, 3: 70, 4: 65, 5: 55 };

export function emptySector(id) {
  return { id, fire: 0, fire0: 0, rubble: 0, rubbleMax: 0, corpse: 0, corpseMax: 0, seg: null, stages: { fire: false, rubble: false, carve: false },
    damaged: false, spreadT: 0, warnT: 0, warnTo: null, paused: false, rival: false, upkeep: 0, crews: { fire: 0, debris: 0, carve: 0 } };
}

export function fakeState(o = {}) {
  let phase = o.phase || 'calm';
  const impact = phase === 'impact';
  if (impact) phase = 'attack';
  const chain = (o.chain && o.chain.length ? o.chain : [1]).slice(0, 3);
  const extra = (o.extra || []).filter((x) => !chain.includes(x));
  const sectorsHit = chain.concat(extra);
  const first = !!o.first;
  const s = {
    v: 2, clock: o.clock ?? 100, phase, timer: 20, timerMax: 40,
    progress: { ftue: 'done', goal: 'G6', unlocked: { upkeep: !!o.upkeep, depot: true, factory: true } },
    sectors: Array.from({ length: 6 }, (_, i) => emptySector(i)),
    fleet: [], rival: { fleet: [], tail: null },
    inv: { scale: 0, blood: 0, bone: 0, eye: 0, armor: 0, cell: 0, concrete: 0, relic: 0 },
    jobs: [], attack: null, result: null,
  };
  if (o.inv) Object.assign(s.inv, { scale: 14, blood: 9, bone: 8, eye: 2, armor: 3, concrete: 4 });
  if (o.job !== undefined && o.job !== null) s.jobs.push({ id: 'j1', rid: 'concrete', line: 0, start: s.clock - 12 * o.job, end: s.clock + 12 * (1 - o.job) });
  if (o.upkeep) for (const sec of s.sectors) sec.upkeep = Math.min(4, o.upkeep);
  const withAttack = phase !== 'calm' || o.result;
  if (withAttack) {
    const segments = {};
    chain.forEach((id, k) => { segments[id] = SEGS[k]; });
    const t = phase === 'attack' ? (o.t ?? (impact ? ATTACK.hit + 0.5 : 1.2)) : (first ? ATTACK.endFirst : ATTACK.end);
    s.attack = { n: o.seed || 3, L: chain.length, t, hit: t >= ATTACK.hit, first, pre: first ? ATTACK.pre : 0, end: first ? ATTACK.endFirst : ATTACK.end,
      monster: 'magmadon', mutant: !!o.mutant, chain, segments, sectors: sectorsHit, corpseTotal: 80 * chain.length, rubbleTotal: 100, script: null };
  }
  const afterHit = withAttack && (phase !== 'attack' || s.attack.hit) && !o.result;
  if (afterHit) {
    const stage = o.stage || 'fire';
    for (const id of sectorsHit) {
      const sec = s.sectors[id];
      const inChain = chain.includes(id);
      sec.damaged = stage !== 'clean';
      sec.fire0 = inChain ? FIRE0[id] : 0;
      sec.rubbleMax = inChain ? 40 : 30;
      sec.corpseMax = inChain ? 40 : 0;
      sec.seg = inChain ? s.attack.segments[id] : null;
      sec.stages = { fire: sec.fire0 > 0, rubble: true, carve: inChain };
      const f = o.fire ?? 1, r = o.rubble ?? 1, c = o.carve ?? 1;
      if (stage === 'fire') { sec.fire = sec.fire0 * f; sec.rubble = sec.rubbleMax; sec.corpse = sec.corpseMax; }
      else if (stage === 'rubble') { sec.fire = 0; sec.rubble = sec.rubbleMax * r; sec.corpse = sec.corpseMax; }
      else if (stage === 'carve') { sec.fire = 0; sec.rubble = 0; sec.corpse = sec.corpseMax * c; }
      else { sec.fire = 0; sec.rubble = 0; sec.corpse = 0; sec.damaged = false; }
    }
  }
  if (o.warn && o.warn.length === 2) { const [a, b] = o.warn; s.sectors[a].warnT = 3; s.sectors[a].warnTo = b; }
  if (o.result) s.result = { no: 1, grade: 'early', elapsed: 80, deadline: 120, pay: 900, bonus: 225, cut: 0, trustD: 8, parts: {}, districts: chain };
  // fleet: parked in bays, or working in the chain during cleanup
  const fl = o.fleet || { fire: 1, debris: 2, carve: 1 };
  let id = 1, bay = 0;
  for (const type of ['fire', 'debris', 'carve']) for (let k = 0; k < (fl[type] || 0); k++) {
    const v = { id: 'v' + id++, type, state: 'yard', sector: null, from: 'yard', eta: 0, eta0: 0, bay: bay++, seq: 0 };
    if (phase === 'cleanup' || phase === 'rival') {
      const site = sectorsHit[k % sectorsHit.length];
      const need = type === 'fire' ? s.sectors[site].fire > 0 : type === 'debris' ? s.sectors[site].rubble > 0 && s.sectors[site].fire <= 0 : s.sectors[site].corpse > 0 && s.sectors[site].rubble <= 0;
      if (need) { v.state = 'working'; v.sector = site; v.from = site; }
    }
    s.fleet.push(v);
  }
  if (phase === 'rival') { s.rival.tail = chain[chain.length - 1]; for (const sid of chain.slice(0, -1)) s.sectors[sid].rival = true; s.rival.fleet = [{ id: 'r1', type: 'debris', state: 'working', sector: chain[0], from: chain[0], eta: 0, eta0: 0, bay: 0, seq: 0 }]; }
  for (const v of s.fleet) if (v.state === 'working') s.sectors[v.sector].crews[v.type]++;
  return s;
}
