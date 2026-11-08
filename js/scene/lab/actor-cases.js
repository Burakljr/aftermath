// Extra scene-lab buttons for scene-actors (ARCH 5.6). Entry shape: { label, run(lab) }  (lab = window.lab).
// Labels are lab-only (not game copy).
const step = (lab, secs, dt = 1 / 30) => { for (let t = 0; t < secs; t += dt) lab.step(dt); };

// a cleanup state where all three crew types work at once: fire in Alsancak, rubble in Kemeraltı, carving in Konak
export function allCrews(lab) {
  const s = lab.fakeState({ phase: 'cleanup', chain: [1, 2], extra: [5], stage: 'fire', fleet: { fire: 2, debris: 2, carve: 2 } });
  const S = s.sectors;
  S[2].fire = S[2].fire0; S[2].rubble = S[2].rubbleMax; S[2].corpse = S[2].corpseMax;
  S[5].fire = 0; S[5].rubble = S[5].rubbleMax;
  S[1].fire = 0; S[1].rubble = 0; S[1].corpse = S[1].corpseMax * 0.8;
  const plan = { v1: [2, 'working'], v2: [2, 'working'], v3: [5, 'working'], v4: [5, 'working'], v5: [1, 'working'], v6: [1, 'working'] };
  for (const v of s.fleet) { const p = plan[v.id]; if (p) { v.sector = p[0]; v.from = p[0]; v.state = p[1]; } }
  for (const sec of S) sec.crews = { fire: 0, debris: 0, carve: 0 };
  for (const v of s.fleet) if (v.state === 'working') S[v.sector].crews[v.type]++;
  return s;
}

export default [
  { label: 'saldırı (ilk)', run(lab) { lab.rebuild({ phase: 'attack', t: -2.4, first: true }); setTimeout(() => { lab.state.attack.t = -2.4; lab.live(true); }, 50); } },
  { label: 'saldırı (tekrar)', run(lab) { lab.rebuild({ phase: 'attack', t: 0, first: false }); setTimeout(() => { lab.state.attack.t = 0; lab.live(true); }, 50); } },
  { label: 'önizleme', run(lab) { lab.scene.playAttack({ chain: lab.opts.chain, first: true, mutant: lab.opts.mutant }); } },
  { label: 'üç ekip', run(lab) { lab.setState(allCrews(lab), { juice: false }); } },
  { label: 'sevk x3', run(lab) { lab.sim.dispatch(lab.state, 'fire', 2); lab.sim.dispatch(lab.state, 'debris', 5); lab.sim.dispatch(lab.state, 'carve', 1); } },
  { label: 'oyma +%25', run(lab) { for (const s of lab.state.sectors) if (s.corpseMax > 0 && s.corpse > 0) { s.fire = 0; s.rubble = 0; s.corpse = Math.max(0, s.corpse - s.corpseMax * 0.25); } } },
  { label: 'nadir göz', run(lab) { const id = (lab.state.attack && lab.state.attack.chain[0]) ?? 1; lab.emit('rare', { sectorId: id, item: 'eye' }); } },
  { label: 'yeni araç', run(lab) { const n = lab.state.fleet.length + 1; const bay = lab.state.fleet.length; lab.state.fleet.push({ id: 'v' + n, type: 'fire', state: 'yard', sector: null, from: 'yard', eta: 0, eta0: 0, bay, seq: 0 }); lab.scene.update(lab.state, 0); lab.emit('purchase', { kind: 'vehicle', type: 'fire', vehicleId: 'v' + n }); } },
  { label: '2 sn', run(lab) { step(lab, 2); } },
];
export const actorCases = [];
