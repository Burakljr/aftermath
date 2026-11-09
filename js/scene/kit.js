// Small toolkit for the toy scene: cached primitive geometries, a part
// builder that merges many coloured primitives into ONE geometry (vertex
// colours, one draw call), the shared toon materials and canvas textures.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _n3 = new THREE.Matrix3();

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

// ---------------------------------------------------------------- geometry
const geoCache = new Map();
function cached(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}

function starShape(points, outer, inner) {
  const sh = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / points;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
  }
  sh.closePath();
  return sh;
}

/** Cached primitives. Unit-ish sizes; scale them through Builder.add options. */
export const G = {
  box: (w, h, d, r = 0.08, seg = 2) => cached(`box${w}|${h}|${d}|${r}|${seg}`, () =>
    r > 0 ? new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d)),
  sphere: (ws = 14, hs = 10) => cached(`sph${ws}|${hs}`, () => new THREE.SphereGeometry(1, ws, hs)),
  hemi: (ws = 14, hs = 6) => cached(`hemi${ws}|${hs}`, () => new THREE.SphereGeometry(1, ws, hs, 0, TAU, 0, Math.PI / 2)),
  cyl: (rt = 1, rb = 1, h = 1, seg = 16) => cached(`cyl${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)),
  torus: (R = 1, r = 0.2, rs = 8, ts = 20, arc = TAU) => cached(`tor${R}|${r}|${rs}|${ts}|${arc}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc)),
  cone: (r = 1, h = 1, seg = 14) => cached(`cone${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  disc: (r = 1, seg = 24) => cached(`disc${r}|${seg}`, () => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2)),
  ring: (ri = 0.8, ro = 1, seg = 32) => cached(`ring${ri}|${ro}|${seg}`, () => new THREE.RingGeometry(ri, ro, seg).rotateX(-Math.PI / 2)),
  plane: (w = 1, d = 1) => cached(`pl${w}|${d}`, () => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2)),
  star: (outer = 0.5, inner = 0.22, depth = 0.12, points = 5) => cached(`star${outer}|${inner}|${depth}|${points}`, () => {
    const g = new THREE.ExtrudeGeometry(starShape(points, outer, inner), {
      depth, bevelEnabled: true, bevelThickness: depth * 0.35, bevelSize: outer * 0.08, bevelSegments: 1, curveSegments: 1,
    });
    g.translate(0, 0, -depth / 2);
    return g;
  }),
  octa: (r = 1) => cached(`oct${r}`, () => new THREE.OctahedronGeometry(r, 0)),
  ico: (r = 1, d = 0) => cached(`ico${r}|${d}`, () => new THREE.IcosahedronGeometry(r, d)),
};

// ----------------------------------------------------------------- builder
const _col = new THREE.Color();

/**
 * Collects coloured primitives and merges them into one indexed geometry with
 * position, normal, color and tint (0..1: how much the per-instance colour
 * applies) attributes.
 */
export class Builder {
  constructor() {
    this.parts = [];
    this.stack = [new THREE.Matrix4()];
  }
  top() { return this.stack[this.stack.length - 1]; }
  /** Push a local frame (translation, rotation in radians, uniform or xyz scale). */
  push(x = 0, y = 0, z = 0, o = {}) {
    const m = composeM(x, y, z, o);
    this.stack.push(this.top().clone().multiply(m));
    return this;
  }
  pushMatrix(m) { this.stack.push(this.top().clone().multiply(m)); return this; }
  pop() { if (this.stack.length > 1) this.stack.pop(); return this; }
  /** add(geometry, colour, x, y, z, { rx, ry, rz, s, sx, sy, sz, tint }) */
  add(geom, color, x = 0, y = 0, z = 0, o = {}) {
    const m = composeM(x, y, z, o).premultiply(this.top());
    _col.set(color);
    this.parts.push({ geom, m, r: _col.r, g: _col.g, b: _col.b, tint: o.tint || 0 });
    return this;
  }
  get size() { return this.parts.length; }
  build() { return mergeParts(this.parts); }
}

function composeM(x, y, z, o) {
  _e.set(o.rx || 0, o.ry || 0, o.rz || 0, o.order || 'XYZ');
  _q.setFromEuler(_e);
  const s = o.s ?? 1;
  _s.set(o.sx ?? s, o.sy ?? s, o.sz ?? s);
  _p.set(x, y, z);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export function mergeParts(parts) {
  let nv = 0, ni = 0;
  for (const p of parts) {
    const g = p.geom;
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const tin = new Float32Array(nv);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.geom;
    const pa = g.attributes.position, na = g.attributes.normal;
    _n3.getNormalMatrix(p.m);
    const flip = p.m.determinant() < 0;
    for (let i = 0; i < pa.count; i++) {
      _v.fromBufferAttribute(pa, i).applyMatrix4(p.m);
      pos[(vo + i) * 3] = _v.x; pos[(vo + i) * 3 + 1] = _v.y; pos[(vo + i) * 3 + 2] = _v.z;
      if (na) _v.fromBufferAttribute(na, i).applyMatrix3(_n3).normalize(); else _v.set(0, 1, 0);
      nor[(vo + i) * 3] = _v.x; nor[(vo + i) * 3 + 1] = _v.y; nor[(vo + i) * 3 + 2] = _v.z;
      col[(vo + i) * 3] = p.r; col[(vo + i) * 3 + 1] = p.g; col[(vo + i) * 3 + 2] = p.b;
      tin[vo + i] = p.tint;
    }
    if (g.index) {
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i += 3) {
        idx[io++] = ia[i] + vo;
        if (flip) { idx[io++] = ia[i + 2] + vo; idx[io++] = ia[i + 1] + vo; }
        else { idx[io++] = ia[i + 1] + vo; idx[io++] = ia[i + 2] + vo; }
      }
    } else {
      for (let i = 0; i < pa.count; i += 3) {
        idx[io++] = vo + i;
        if (flip) { idx[io++] = vo + i + 2; idx[io++] = vo + i + 1; }
        else { idx[io++] = vo + i + 1; idx[io++] = vo + i + 2; }
      }
    }
    vo += pa.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('tint', new THREE.BufferAttribute(tin, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// --------------------------------------------------------------- materials
let gradientTex = null;
function toonGradient() {
  if (gradientTex) return gradientTex;
  const data = new Uint8Array([168, 214, 240, 255]);
  gradientTex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradientTex.minFilter = THREE.NearestFilter;
  gradientTex.magFilter = THREE.NearestFilter;
  gradientTex.generateMipmaps = false;
  gradientTex.needsUpdate = true;
  return gradientTex;
}

const matCache = new Map();
/**
 * Shared toon material with vertex colours. With tintMask the per-instance
 * colour only applies where the geometry's `tint` attribute is 1 (so a toy car
 * can get a random body colour while its wheels stay dark).
 */
export function toyMaterial({ tintMask = true, side = THREE.FrontSide, emissive = 0 } = {}) {
  const key = `${tintMask}|${side}|${emissive}`;
  if (matCache.has(key)) return matCache.get(key);
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient(), side });
  if (emissive) { mat.emissive = new THREE.Color(0xffffff); mat.emissiveIntensity = emissive; }
  if (tintMask) {
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float tint;\n' + sh.vertexShader.replace(
        'vColor.rgb *= instanceColor.rgb;',
        'vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, tint );');
    };
    mat.customProgramCacheKey = () => 'toy-tint-mask';
  }
  matCache.set(key, mat);
  return mat;
}

/** Unlit vertex-colour material (backgrounds, glows, sparkles). */
export function flatMaterial(opts = {}) {
  return new THREE.MeshBasicMaterial({ vertexColors: true, ...opts });
}

// ---------------------------------------------------------------- textures
export function canvasTexture(w, h, draw, { repeat = false, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

export function hex(c) {
  return '#' + new THREE.Color(c).getHexString(THREE.SRGBColorSpace);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

let radialTex = null;
/** White radial blob, alpha falls to 0 at the edge (shadows, glows). */
export function radialTexture() {
  if (radialTex) return radialTex;
  radialTex = canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: false });
  return radialTex;
}

/** Mix two colours (hex numbers), returns a hex number. */
export function mix(a, b, t) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return ca.lerp(cb, t).getHex();
}
export function shade(c, k) {
  // k < 0 darker, k > 0 lighter
  return k < 0 ? mix(c, 0x1b1530, -k) : mix(c, 0xffffff, k);
}

/** Small deterministic random generator. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return (s >>> 0) / 4294967296;
  };
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.userData.sharedGeometry) o.geometry.dispose();
  });
}

export const ease = {
  outBack: (t, s = 1.70158) => { const u = t - 1; return u * u * ((s + 1) * u + s) + 1; },
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
};

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
