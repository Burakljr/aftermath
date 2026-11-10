// Prop kit: templates from props.glb (KayKit Restaurant Bits), shared materials, recoloured
// atlas variants (themes) and a static batcher that merges placed props into one mesh per
// material (a whole room is a handful of draw calls).
//
// Every prop uses the same 8 x 4 gradient-swatch atlas. A theme repaints a few swatches on a
// copy of the atlas (walls, floor tiles) and the pieces that should change use that copy.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
export function easeOutBack(t, s = 1.70158) { const u = t - 1; return 1 + (s + 1) * u * u * u + s * u * u; }
export function easeOutCubic(t) { const u = 1 - t; return 1 - u * u * u; }

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/** Copy an attribute into a plain Float32 attribute (dequantizes normalized ints). */
function toFloat(attr) {
  const n = attr.count, k = attr.itemSize;
  const out = new Float32Array(n * k);
  for (let i = 0; i < n; i++) {
    out[i * k] = attr.getX(i);
    if (k > 1) out[i * k + 1] = attr.getY(i);
    if (k > 2) out[i * k + 2] = attr.getZ(i);
    if (k > 3) out[i * k + 3] = attr.getW(i);
  }
  return new THREE.BufferAttribute(out, k);
}

/** Float copy of a mesh geometry (position, normal, uv only) with a matrix baked in. */
function bakeGeometry(src, matrix) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', toFloat(src.attributes.position));
  g.setAttribute('normal', src.attributes.normal ? toFloat(src.attributes.normal) : null);
  if (!src.attributes.normal) g.deleteAttribute('normal');
  g.setAttribute('uv', toFloat(src.attributes.uv));
  g.setIndex(src.index ? Array.from(src.index.array) : null);
  if (!src.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(matrix);
  return g;
}

// ------------------------------------------------------------------ atlas swatches
// Cell [col, row] of the 8 x 4 atlas (row 0 = top). Walls use [2,1] (lower half) and [4,1] (upper half),
// floor tiles [1,0] + [4,0], wood tops [6,3], chairs / crates [6,0].
export const CELL = { wall: [2, 1], trim: [4, 1], tileDark: [1, 0], tileLight: [4, 0], wood: [6, 3], woodDark: [6, 0], metal: [3, 0], white: [5, 3] };

/** A copy of the atlas image with some swatches repainted as vertical gradients. */
export function recolorAtlas(baseTex, cells) {
  const img = baseTex.image;
  const w = img.width, h = img.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const cw = w / 8, ch = h / 4;
  for (const { cell, top, bottom } of cells) {
    const x = cell[0] * cw, y = cell[1] * ch;
    const g = ctx.createLinearGradient(0, y, 0, y + ch);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, cw, ch);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = baseTex.flipY;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

// ------------------------------------------------------------------ kit
export function createKit(propsGltf) {
  const templates = new Map(); // name -> { geometry (float, model space), box: Box3 }
  let atlas = null;
  propsGltf.scene.updateMatrixWorld(true);
  for (const group of propsGltf.scene.children) {
    const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const parts = [];
    group.traverse((o) => {
      if (!o.isMesh) return;
      if (!atlas && o.material.map) atlas = o.material.map;
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      parts.push(bakeGeometry(o.geometry, m));
    });
    if (!parts.length) continue;
    const geometry = parts.length > 1 ? mergeGeometries(parts) : parts[0];
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    templates.set(group.name, { geometry, box: geometry.boundingBox });
  }

  const materials = {};
  function lambert(map, extra = {}) {
    return new THREE.MeshLambertMaterial(Object.assign({ map }, extra));
  }
  materials.base = lambert(atlas);

  /** Material using a recoloured atlas copy (cached by key). */
  function themed(key, cells, extra) {
    if (materials[key]) return materials[key];
    materials[key] = lambert(recolorAtlas(atlas, cells), extra);
    return materials[key];
  }

  function has(name) { return templates.has(name); }
  function geo(name) {
    const t = templates.get(name);
    if (!t) throw new Error('kit: no prop ' + name);
    return t.geometry;
  }
  function box(name) { return templates.get(name).box; }

  /** Matrix for a prop placed at (x, y, z), rotated ry about y, scaled s (number or [x,y,z]). */
  function placeMatrix(x, y, z, ry = 0, s = 1, out = new THREE.Matrix4()) {
    _p.set(x, y, z);
    _q.setFromEuler(_e.set(0, ry, 0));
    if (typeof s === 'number') _s.set(s, s, s); else _s.set(s[0], s[1], s[2]);
    return out.compose(_p, _q, _s);
  }

  /** A standalone mesh of one prop (shares the template geometry). */
  function mesh(name, material = materials.base) {
    const m = new THREE.Mesh(geo(name), material);
    m.name = name;
    return m;
  }

  /**
   * Static batcher: add(name, x, y, z, ry, s, material) many times, then build() -> Group
   * with one merged mesh per material. Pass a `group` of { name, x, y, z, ry, s } too.
   */
  function batch() {
    const lists = new Map(); // material -> geometries
    let tris = 0;
    const api = {
      add(name, x = 0, y = 0, z = 0, ry = 0, s = 1, material = materials.base) {
        if (!templates.has(name)) { console.warn('kit: no prop ' + name); return api; }
        const g = geo(name).clone();
        g.applyMatrix4(placeMatrix(x, y, z, ry, s, _m));
        if (!lists.has(material)) lists.set(material, []);
        lists.get(material).push(g);
        tris += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
        return api;
      },
      /** Add an arbitrary geometry (already in world space). */
      addGeometry(g, material = materials.base) {
        if (!lists.has(material)) lists.set(material, []);
        lists.get(material).push(g);
        return api;
      },
      get tris() { return tris; },
      get empty() { return lists.size === 0; },
      build(name = 'batch') {
        const group = new THREE.Group();
        group.name = name;
        for (const [material, geos] of lists) {
          const merged = geos.length > 1 ? mergeGeometries(geos) : geos[0];
          for (const g of geos) if (g !== merged) g.dispose();
          merged.computeBoundingSphere();
          merged.computeBoundingBox();
          const m = new THREE.Mesh(merged, material);
          m.matrixAutoUpdate = false;
          group.add(m);
        }
        lists.clear();
        return group;
      },
    };
    return api;
  }

  return { templates, materials, atlas, themed, has, geo, box, mesh, batch, placeMatrix };
}

/** Dispose geometries of meshes under obj (materials are shared and kept). */
export function disposeTree(obj, { materials = false } = {}) {
  obj.traverse((o) => {
    if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (materials && o.material && !o.material.userData.shared) o.material.dispose();
  });
}
