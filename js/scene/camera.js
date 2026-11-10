// Orthographic 3/4 camera for a portrait phone: looks at the back wall (kitchen at the top of
// the screen, door at the bottom), tilted down by `elevation` degrees, optionally turned by
// `yaw` degrees. fit() frames a set of world points inside the viewport minus UI insets.
import * as THREE from 'three';
import { DEG } from './kit.js';

const _v = new THREE.Vector3();

export function createCamera({ elevation = 50, yaw = 0 } = {}) {
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 1, 200);
  const dir = new THREE.Vector3();
  const target = new THREE.Vector3();
  let el = elevation, yw = yaw;

  function setAngles(e = el, y = yw) {
    el = e; yw = y;
    const a = el * DEG, b = yw * DEG;
    dir.set(Math.sin(b) * Math.cos(a), Math.sin(a), Math.cos(b) * Math.cos(a));
    aim(target);
  }
  function aim(t) {
    target.copy(t);
    camera.position.copy(t).addScaledVector(dir, 80);
    camera.up.set(0, 1, 0);
    camera.lookAt(t);
    camera.updateMatrixWorld(true);
  }
  setAngles(el, yw);

  /**
   * Fit world points (Vector3[]) inside width x height minus insets (CSS px).
   * `mustX` / `mustY` (optional) points that have to stay inside even if the rest overflows:
   * the frame is sized by `points` but never so big that it gets smaller than `minScale`
   * px per unit... (kept simple: size by points, then clamp px/unit to [minPx, maxPx]).
   * Returns px per world unit.
   */
  function fit(width, height, insets, points, { minPx = 0, maxPx = Infinity, align = 0.5 } = {}) {
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
    let px = Math.min(availW / (x1 - x0), availH / (y1 - y0));
    px = Math.max(minPx, Math.min(maxPx, px));
    const s = 1 / px; // world units per px
    const cx = (x0 + x1) / 2;
    // vertical: if the content is shorter than the space, place it by `align` (0 top .. 1 bottom)
    const contentH = (y1 - y0) * px;
    const ay = insets.top + Math.max(0, availH - contentH) * align + Math.min(contentH, availH) / 2;
    const cy = contentH > availH ? (y0 + y1) / 2 : (y0 + y1) / 2;
    const ax = insets.left + availW / 2;
    camera.left = cx - ax * s;
    camera.right = camera.left + width * s;
    camera.top = cy + ay * s;
    camera.bottom = camera.top - height * s;
    camera.updateProjectionMatrix();
    return px;
  }

  return { camera, dir, target, aim, fit, setAngles, get elevation() { return el; }, get yaw() { return yw; } };
}
