// Anchor projection (W1): world anchor names -> CSS px inside the canvas. Allocation-free when `out`
// is passed. visible = in front of the camera and inside the canvas.
import * as THREE from 'three';
import { DISTRICTS, YARD } from './layout.js';

export function createAnchors(camera, getSize, world) {
  const v = new THREE.Vector3(), cam = new THREE.Vector3();
  const tmp = { x: 0, y: 0, visible: false };
  function worldPoint(name, outV) {
    if (name.startsWith('district:')) {
      const D = DISTRICTS[+name.slice(9)];
      if (!D) return null;
      const H = world.roofHeight ? world.roofHeight(D.id) : 22;
      return outV.set(D.cx, H + 4, D.cz);
    }
    if (name === 'yard') return outV.set(0, 10, (YARD.z0 + YARD.z1) / 2);
    if (name === 'shed') return outV.set((YARD.shed.x0 + YARD.shed.x1) / 2, 12, (YARD.shed.z0 + YARD.shed.z1) / 2);
    if (name === 'gate') return outV.set(YARD.gate.x, 6, YARD.gate.z);
    if (name === 'chain') {
      const ids = world.chainIds ? world.chainIds() : [];
      if (!ids.length) return null;
      outV.set(0, 20, 0);
      for (const id of ids) { outV.x += DISTRICTS[id].cx; outV.z += DISTRICTS[id].cz; }
      outV.x /= ids.length; outV.z /= ids.length;
      return outV;
    }
    if (world.actors && world.actors.anchor) { const p = world.actors.anchor(name, outV); if (p) return p; }
    if (name === 'corpse:head' && world.placement && world.placement()) { const P = world.placement(); return outV.set(P.nose.x, 8, P.nose.z); }
    return null;
  }
  function project(name, out = tmp) {
    const p = worldPoint(name, v);
    out.visible = false;
    if (!p) { out.x = 0; out.y = 0; return out; }
    const { w, h } = getSize();
    cam.copy(p).applyMatrix4(camera.matrixWorldInverse);
    p.project(camera);
    out.x = (p.x * 0.5 + 0.5) * w;
    out.y = (1 - (p.y * 0.5 + 0.5)) * h;
    out.visible = cam.z < 0 && out.x >= 0 && out.x <= w && out.y >= 0 && out.y <= h;
    return out;
  }
  return { project, worldPoint };
}
