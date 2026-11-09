// Shared scene helpers (ported from proto-B): seeded randomness, value noise, a geometry builder
// that bakes many small vertex-coloured parts into one non-indexed BufferGeometry (one draw call),
// capsule distance and the smoke puff atlas.
import * as THREE from 'three';

// mulberry32: deterministic layouts and particle seeds
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// smooth value noise in 2D / 3D (cheap, good enough for vertex jitter and colour variation)
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function noise3(x, y, z) {
  const zi = Math.floor(z), zf = z - zi, w = zf * zf * (3 - 2 * zf);
  return noise2(x + zi * 17.13, y - zi * 9.71) * (1 - w) + noise2(x + (zi + 1) * 17.13, y - (zi + 1) * 9.71) * w;
}
export function fbm2(x, y, oct = 4) {
  let v = 0, a = 0.5;
  for (let i = 0; i < oct; i++) { v += a * noise2(x, y); x = x * 2.03 + 5.1; y = y * 2.03 + 1.7; a *= 0.5; }
  return v;
}

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// distance from (x, z) to a list of capsules {ax, az, bx, bz, r}; negative inside
export function capsDist(x, z, caps) {
  let best = 1e9;
  if (!caps) return best;
  for (let i = 0; i < caps.length; i++) {
    const c = caps[i];
    const bx = c.bx - c.ax, bz = c.bz - c.az;
    const t = clamp(((x - c.ax) * bx + (z - c.az) * bz) / (bx * bx + bz * bz || 1), 0, 1);
    const d = Math.hypot(x - c.ax - bx * t, z - c.az - bz * t) - c.r;
    if (d < best) best = d;
  }
  return best;
}
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const _c = new THREE.Color();

// Builder: push primitives with a colour (and optional per-vertex extra attributes), get one geometry.
// Every primitive is converted to non-indexed triangles; normals are face normals (flat look).
export class Builder {
  constructor(seed = 1, extras = {}) {
    this.r = rng(seed);
    this.parts = [];
    this.extras = extras; // name -> itemSize; default value set per push via opts[name]
  }
  push(g, color, opts = {}) {
    g = g.index ? g.toNonIndexed() : g;
    const n = g.attributes.position.count;
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position);
    const jitter = opts.jitter ?? 0.05;
    const col = new Float32Array(n * 3);
    _c.set(color);
    const grad = opts.grad; // optional function(x,y,z) -> multiplier
    const pos = g.attributes.position;
    for (let f = 0; f < n; f += 3) {
      const j = 1 + (this.r() - 0.5) * jitter;
      for (let v = 0; v < 3; v++) {
        let m = j;
        if (grad) m *= grad(pos.getX(f + v), pos.getY(f + v), pos.getZ(f + v));
        col[(f + v) * 3] = _c.r * m; col[(f + v) * 3 + 1] = _c.g * m; col[(f + v) * 3 + 2] = _c.b * m;
      }
    }
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (this.extras.uv !== undefined) {
      if (opts.uv && g.attributes.uv) out.setAttribute('uv', g.attributes.uv);
      else out.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    for (const [name, size] of Object.entries(this.extras)) {
      if (name === 'uv') continue;
      const val = opts[name] ?? new Array(size).fill(0);
      const arr = new Float32Array(n * size);
      for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) arr[i * size + k] = val[k];
      out.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    this.parts.push(out);
    return out;
  }
  // axis-aligned box centred at (x,y,z) with optional rotation (applied before translation)
  box(w, h, d, x, y, z, color, opts = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (opts.rx) g.rotateX(opts.rx);
    if (opts.rz) g.rotateZ(opts.rz);
    if (opts.ry) g.rotateY(opts.ry);
    g.translate(x, y, z);
    return this.push(g, color, opts);
  }
  cyl(rt, rb, h, x, y, z, color, opts = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, opts.seg ?? 8, 1, opts.open ?? false);
    if (opts.rx) g.rotateX(opts.rx);
    if (opts.rz) g.rotateZ(opts.rz);
    if (opts.ry) g.rotateY(opts.ry);
    g.translate(x, y, z);
    return this.push(g, color, opts);
  }
  geo(g, color, matrix, opts = {}) {
    g = g.clone();
    if (matrix) g.applyMatrix4(matrix);
    return this.push(g, color, opts);
  }
  build() {
    const g = mergeNonIndexed(this.parts);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export function mergeNonIndexed(list) {
  const out = new THREE.BufferGeometry();
  if (!list.length) return out;
  const names = Object.keys(list[0].attributes);
  let total = 0;
  for (const g of list) total += g.attributes.position.count;
  for (const name of names) {
    const size = list[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const g of list) {
      const a = g.attributes[name];
      const cnt = g.attributes.position.count;
      if (a) {
        if (a.isInterleavedBufferAttribute || a.array.length !== cnt * size) {
          for (let i = 0; i < cnt; i++) for (let k = 0; k < size; k++) arr[off + i * size + k] = a.getComponent(i, k);
        } else arr.set(a.array, off);
      }
      off += cnt * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}

// smoke puff atlas (2x2), white with alpha; generated at runtime so no texture file is shipped
export function smokeAtlas(size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * 2;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size * 2, size * 2);
  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * size, oy = Math.floor(q / 2) * size;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * 2 - 1, v = (y / size) * 2 - 1;
        const r = Math.sqrt(u * u + v * v);
        const f = fbm2(x / size * 3.2 + q * 9.3, y / size * 3.2 + q * 3.1, 5);
        const edge = 0.6 + (f - 0.5) * 0.6;
        let a = 1 - smooth(edge - 0.38, edge, r);
        a *= 0.5 + f * 0.8;
        const shade = clamp(0.72 + (-u * 0.16 - v * 0.34) + (f - 0.5) * 0.7, 0, 1);
        const i = ((oy + y) * size * 2 + ox + x) * 4;
        const c = Math.round(255 * shade);
        img.data[i] = c; img.data[i + 1] = c; img.data[i + 2] = c;
        img.data[i + 3] = Math.round(255 * clamp(a, 0, 1));
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}
