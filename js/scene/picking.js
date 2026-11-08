// Picking (W1): vehicles first (screen distance via actors, <= 28 CSS px), then districts (whole cell incl.
// half the surrounding roads), then the yard (below the ring road). The tap ray is intersected with a plane
// at mid-building height (6 m), which keeps roof taps inside their own cell at the 52 deg camera.
import * as THREE from 'three';
import { districtAt } from './layout.js';

export function createPicker(camera, getRect) {
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -6);
  const hit = new THREE.Vector3();
  return {
    // ground point under a CSS-pixel position (relative to the canvas), or null
    ground(x, y, out = hit, h = 6) {
      const r = getRect();
      ndc.set((x / r.width) * 2 - 1, -(y / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      plane.constant = -h;
      return ray.ray.intersectPlane(plane, out);
    },
    pick(clientX, clientY, actors) {
      const r = getRect();
      const x = clientX - r.left, y = clientY - r.top;
      const vid = actors && actors.pickVehicle ? actors.pickVehicle(x, y) : null;
      if (vid) return { type: 'vehicle', id: vid };
      const p = this.ground(x, y);
      if (!p) return null;
      const d = districtAt(p.x, p.z);
      if (d === 'yard') return { type: 'yard' };
      if (d === null || d === undefined) return null;
      return { type: 'district', id: d };
    },
  };
}
