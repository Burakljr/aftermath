// Instanced props that come and go every frame: dishes (on tables, in cooks' hands, ready on a
// station), empty plates after a meal, and the soft blob shadows under characters and tables.
// One InstancedMesh per model, filled from scratch each frame (begin / add / end), no allocations.
import * as THREE from 'three';

// dish id (game config) -> KayKit model, scale on the table, empty dish after eating
export const DISH = {
  juice: { model: 'mug_juice', s: 0.95, empty: 'mug' },
  cocoa: { model: 'mug_cocoa', s: 0.95, empty: 'mug' },
  burger: { model: 'food_burger', s: 0.6, empty: 'plate_dirty' },
  veggieburger: { model: 'food_vegetableburger', s: 0.6, empty: 'plate_dirty' },
  stew: { model: 'food_stew', s: 0.68, empty: 'bowl_dirty' },
  soup: { model: 'food_stew', s: 0.68, empty: 'bowl_dirty' },
  dinner: { model: 'food_dinner', s: 0.6, empty: 'plate_dirty' },
};
export function dishInfo(id) { return DISH[id] || DISH.burger; }
const EMPTY_SCALE = { mug: 0.95, plate_dirty: 0.62, bowl_dirty: 0.66 };
export function emptyScale(model) { return EMPTY_SCALE[model] || 0.62; }

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

export function createDishes(kit, capacity = 24) {
  const group = new THREE.Group();
  group.name = 'dishes';
  const models = new Set();
  for (const d of Object.values(DISH)) { models.add(d.model); models.add(d.empty); }
  const pools = {};
  for (const name of models) {
    if (!kit.has(name)) continue;
    const im = new THREE.InstancedMesh(kit.geo(name), kit.materials.base, capacity);
    im.name = 'dish:' + name;
    im.count = 0;
    im.frustumCulled = false;
    im.visible = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(im);
    pools[name] = im;
  }
  return {
    group,
    begin() { for (const k in pools) pools[k].count = 0; },
    add(model, x, y, z, ry = 0, s = 1) {
      const im = pools[model];
      if (!im || im.count >= capacity || s <= 0.001) return;
      _p.set(x, y, z);
      _q.setFromEuler(_e.set(0, ry, 0));
      _s.set(s, s, s);
      im.setMatrixAt(im.count++, _m.compose(_p, _q, _s));
    },
    end() {
      for (const k in pools) {
        const im = pools[k];
        im.visible = im.count > 0;
        if (im.count) im.instanceMatrix.needsUpdate = true;
      }
    },
    get instances() { let n = 0; for (const k in pools) n += pools[k].count; return n; },
  };
}

let blobTex = null;
function blobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

/** Soft round contact shadows (one draw call). add(x, z, w, d) per frame. */
export function createBlobs(capacity = 64, { color = 0x4a3020, opacity = 0.3 } = {}) {
  const mat = new THREE.MeshBasicMaterial({ color, alphaMap: blobTexture(), transparent: true, opacity, depthWrite: false });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -2;
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, capacity);
  im.name = 'blob-shadows';
  im.frustumCulled = false;
  im.renderOrder = 1;
  im.count = 0;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return {
    mesh: im,
    begin() { im.count = 0; },
    add(x, z, w, d = w, y = 0.015) {
      if (im.count >= capacity) return;
      _p.set(x, y, z);
      _q.identity();
      _s.set(w, 1, d);
      im.setMatrixAt(im.count++, _m.compose(_p, _q, _s));
    },
    end() { im.instanceMatrix.needsUpdate = true; },
    set color(c) { mat.color.set(c); },
  };
}
