// Orthographic 3/4 iso camera framed for a portrait phone screen.
import * as THREE from 'three';
import { CAMERA } from './layout.js';
import { DEG } from './kit.js';

const _v = new THREE.Vector3();

export function createCamera() {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 200);
  const yaw = CAMERA.yaw * DEG, pitch = CAMERA.pitch * DEG;
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const target = new THREE.Vector3();

  function aim(t) {
    target.copy(t);
    camera.position.copy(t).addScaledVector(dir, 60);
    camera.up.set(0, 1, 0);
    camera.lookAt(t);
    camera.updateMatrixWorld(true);
  }
  aim(target);

  /**
   * Fit the given world points inside the viewport minus the insets (CSS px).
   * points: array of Vector3. zoom > 1 frames closer (points may overflow).
   */
  function fit(width, height, insets, points, zoom = 1) {
    camera.updateMatrixWorld(true);
    const inv = camera.matrixWorldInverse;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) {
      _v.copy(p).applyMatrix4(inv);
      if (_v.x < x0) x0 = _v.x; if (_v.x > x1) x1 = _v.x;
      if (_v.y < y0) y0 = _v.y; if (_v.y > y1) y1 = _v.y;
    }
    const availW = Math.max(60, width - insets.left - insets.right);
    const availH = Math.max(60, height - insets.top - insets.bottom);
    const s = Math.max((x1 - x0) / availW, (y1 - y0) / availH) / zoom; // world units per px
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const ax = insets.left + availW / 2, ay = insets.top + availH / 2;
    camera.left = cx - ax * s;
    camera.right = camera.left + width * s;
    camera.top = cy + ay * s;
    camera.bottom = camera.top - height * s;
    camera.updateProjectionMatrix();
    return s;
  }

  return { camera, dir, target, aim, fit };
}
