// Scene-actors hook (ARCH 5.3): fleet + rival vehicles, route lines, work loops, Magmadon (alive in the
// attack, corpse + carving after the hit), KALKAN-07 and the attack director, buyer van / drive-ins.
// `world` is built by js/scene/scene.js. Nothing here reads game rules: only the state subset of ARCH 5.2.
import * as THREE from 'three';
import { createFleet } from './fleet.js';
import { createRoutes } from './route.js';
import { createWork } from './work.js';
import { createCorpse } from './corpse.js';
import { createAttack } from './attack.js';
import { createBuyer } from './buyer.js';

export function createActors(world) {
  const routes = createRoutes(world);
  const work = createWork(world);
  const fleet = createFleet(world, { work, route: routes });
  const corpse = createCorpse(world);
  work.setCorpse(corpse);
  const attack = createAttack(world, { corpse });
  const buyer = createBuyer(world, { fleet });
  const _v = new THREE.Vector3(), _c = new THREE.Vector3();
  let lastT = 0, lastState = null;
  // a state-shaped stand-in for scene.playAttack previews (no game state behind them)
  const pv = { phase: 'attack', attack: null, sectors: Array.from({ length: 6 }, (_, id) => ({ id, damaged: false, corpse: 0, corpseMax: 0 })) };
  function previewState(a) {
    pv.attack = a;
    for (const sec of pv.sectors) { const on = a.chain.includes(sec.id); sec.damaged = on && a.hit; sec.corpseMax = on ? 40 : 0; sec.corpse = sec.corpseMax; }
    return pv;
  }

  return {
    drawsCorpse: true,                   // the lab hides its placeholder carcass
    update(state, dt, t) {
      lastT = t; if (state) lastState = state;
      const s = state || lastState;
      work.setState(s);
      attack.update(s, t, dt);
      const pa = attack.previewState();
      corpse.update(pa ? previewState(pa) : s, t, dt);
      fleet.update(s, t, dt);
      buyer.update(s, t, dt);
    },
    event(type, p) {
      p = p || {};
      corpse.event(type, p, lastT);
      attack.event(type, p, lastT);
      buyer.event(type, p, lastT);
    },
    attackPose(a, t) { return attack.pose(a, t); },
    previewAttack(desc) { return attack.preview(desc || {}); },
    pickVehicle(x, y) {
      const cam = world.camera, el = world.renderer.domElement;
      const w = el.clientWidth || 390, h = el.clientHeight || 844;
      let best = null, bd = 28;
      fleet.each((u) => {
        if (u.rival || !u.main.visible || u.state === 'yard') return;   // parked vehicles leave the tap to the yard
        fleet.anchor(u.id, _v);
        _v.y -= 3;
        _c.copy(_v).project(cam);
        if (_c.z > 1) return;
        const sx = (_c.x * 0.5 + 0.5) * w, sy = (1 - (_c.y * 0.5 + 0.5)) * h;
        const d = Math.hypot(sx - x, sy - y);
        if (d < bd) { bd = d; best = u.id; }
      });
      return best;
    },
    anchor(name, out) {
      if (name.startsWith('vehicle:')) return fleet.anchor(name.slice(8), out);
      if (name === 'corpse:head') return corpse.anchor('head', out);
      return null;
    },
    cutSite(out) { return attack.cutSite(out); },
    setQuality(q) { corpse.setQuality(q); attack.setQuality(q); },
    stats() { return { vehicles: fleet.count() + buyer.count(), particles: attack.particles() }; },
    dispose() { fleet.dispose(); routes.dispose(); work.dispose(); corpse.dispose(); attack.dispose(); buyer.dispose(); },
    _debug: { fleet, routes, work, corpse, attack, buyer },
  };
}
