// Tiny rule mimic for scene-lab: attack clock, travel eta countdown, value drain with the hard sequence
// (fire -> rubble -> carve), district clean, and the matching bus-like events. Not the game rules.
import { ATTACK } from './fake-state.js';

const RATE = { fire: 5, debris: 2.2, carve: 1.4 };
export function createFakeSim(emit) {
  const sim = {
    running: false,
    dispatch(s, type, sector) {
      const v = s.fleet.find((q) => q.type === type && (q.state === 'yard' || q.state === 'returning'));
      if (!v) return false;
      const from = v.state === 'yard' ? 'yard' : v.sector;
      v.state = 'enroute'; v.from = from; v.sector = sector; v.eta0 = v.eta = 3; v.seq++;
      emit('dispatch', { vehicleId: v.id, type, sectorId: sector, from, eta: 3 });
      return true;
    },
    step(s, dt) {
      if (s.phase === 'attack' && s.attack) {
        const a = s.attack;
        const prev = a.t;
        a.t += dt;
        if (!a.hit && a.t >= ATTACK.hit) {
          a.hit = true;
          for (const id of a.sectors) {
            const sec = s.sectors[id], inChain = a.chain.includes(id);
            sec.damaged = true; sec.fire0 = inChain ? 60 : 0; sec.fire = sec.fire0; sec.rubbleMax = sec.rubble = inChain ? 40 : 30;
            sec.corpseMax = sec.corpse = inChain ? 40 : 0; sec.seg = inChain ? a.segments[id] : null;
          }
          emit('hit', { chain: a.chain, sectors: a.sectors });
        }
        if (prev < a.end && a.t >= a.end) { s.phase = 'cleanup'; emit('phase', { from: 'attack', to: 'cleanup' }); }
        return;
      }
      for (const sec of s.sectors) sec.crews.fire = sec.crews.debris = sec.crews.carve = 0;
      for (const v of s.fleet) {
        if (v.state === 'enroute' || v.state === 'returning') {
          v.eta -= dt;
          if (v.eta <= 0) {
            if (v.state === 'enroute') { v.state = 'working'; v.eta = 0; emit('arrive', { vehicleId: v.id, type: v.type, sectorId: v.sector }); }
            else { v.state = 'yard'; v.eta = 0; v.sector = null; v.from = 'yard'; emit('park', { vehicleId: v.id }); }
          }
        }
        if (v.state === 'working') s.sectors[v.sector].crews[v.type]++;
      }
      for (const sec of s.sectors) {
        if (!sec.damaged) continue;
        const c = sec.crews;
        if (sec.fire > 0 && c.fire) { sec.fire = Math.max(0, sec.fire - RATE.fire * c.fire * dt); if (sec.fire === 0) { emit('stage-done', { sectorId: sec.id, stage: 'fire' }); release(s, sec.id, 'fire'); } }
        else if (sec.fire <= 0 && sec.rubble > 0 && c.debris) {
          const before = sec.rubble; sec.rubble = Math.max(0, sec.rubble - RATE.debris * c.debris * dt);
          if (Math.floor(before / sec.rubbleMax * 3) !== Math.floor(sec.rubble / sec.rubbleMax * 3)) emit('sfx', { name: 'thud' });
          if (sec.rubble === 0) { emit('stage-done', { sectorId: sec.id, stage: 'rubble' }); release(s, sec.id, 'debris'); }
        } else if (sec.fire <= 0 && sec.rubble <= 0 && sec.corpse > 0 && c.carve) {
          const before = sec.corpse; sec.corpse = Math.max(0, sec.corpse - RATE.carve * c.carve * dt);
          if (Math.floor(before) !== Math.floor(sec.corpse)) emit('part', { sectorId: sec.id, vehicleId: null, item: 'scale' });
          if (sec.corpse === 0) { emit('stage-done', { sectorId: sec.id, stage: 'carve' }); release(s, sec.id, 'carve'); }
        }
        if (sec.fire <= 0 && sec.rubble <= 0 && sec.corpse <= 0) { sec.damaged = false; emit('clean', { sectorId: sec.id }); release(s, sec.id, null); }
      }
      s.clock = (s.clock || 0) + dt;
    },
  };
  function release(s, sector, type) {
    for (const v of s.fleet) if (v.state === 'working' && v.sector === sector && (!type || v.type === type)) {
      v.state = 'returning'; v.from = sector; v.eta0 = v.eta = 3; v.seq++;
      emit('return', { vehicleId: v.id, sectorId: sector });
    }
  }
  return sim;
}
