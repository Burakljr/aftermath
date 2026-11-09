// Small toolkit for the toy scene: cached primitive geometries, a part
// builder that merges many coloured primitives into ONE geometry (vertex
// colours, one draw call) with a baked ink outline hull, the shared toon
// material (3-step cel shading, warm key / cool shade) and canvas textures.
//
// Outlines: every part added to a Builder (unless { ol: 0 }) is appended a
// second time with reversed winding and smoothed normals and an `ol`
// attribute > 0. The toon shader pushes those vertices outward in view space
// (constant pixel width in the orthographic view) and paints them ink: the
// classic inverted-hull outline, but in the SAME draw call as the fill.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _n3 = new THREE.Matrix3();

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

/** Shared style palette (see the style spec): ink outline + game colours. */
export const PAL = {
  ink: 0x2a1e3b,
  cream: 0xfff4dc, creamDark: 0xf6dfaf,
  yellow: 0xffc82e, orange: 0xff8b1f,
  green: 0x36c657, greenDark: 0x1e9a3e,
  blue: 0x34a3ff, blueDark: 0x1c6fd1,
  pink: 0xff4f7e, purple: 0x8a5cf6,
  gold: 0xffb800, goldHi: 0xffe27a,
  red: 0xff4747,
  white: 0xffffff,
};

// ---------------------------------------------------------------- geometry
const geoCache = new Map();
function cached(key, make, noOutline = false) {
  let g = geoCache.get(key);
  if (!g) { g = make(); if (noOutline) g.userData.noOutline = true; geoCache.set(key, g); }
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

function heartShape(s) {
  const sh = new THREE.Shape();
  sh.moveTo(0, -0.5 * s);
  sh.bezierCurveTo(-0.15 * s, -0.32 * s, -0.55 * s, -0.12 * s, -0.5 * s, 0.14 * s);
  sh.bezierCurveTo(-0.45 * s, 0.42 * s, -0.08 * s, 0.46 * s, 0, 0.2 * s);
  sh.bezierCurveTo(0.08 * s, 0.46 * s, 0.45 * s, 0.42 * s, 0.5 * s, 0.14 * s);
  sh.bezierCurveTo(0.55 * s, -0.12 * s, 0.15 * s, -0.32 * s, 0, -0.5 * s);
  return sh;
}

function extrude(shape, depth, bevel, curveSegments = 1) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1, curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Cached primitives. Unit-ish sizes; scale them through Builder.add options. */
export const G = {
  // rounded box; small radii get fewer segments (a chamfer reads the same at phone size)
  box: (w, h, d, r = 0.08, seg = r >= 0.2 ? 2 : 1) => cached(`box${w}|${h}|${d}|${r}|${seg}`, () =>
    r > 0.03 ? new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d)),
  sphere: (ws = 12, hs = 8) => cached(`sph${ws}|${hs}`, () => new THREE.SphereGeometry(1, ws, hs)),
  hemi: (ws = 12, hs = 5) => cached(`hemi${ws}|${hs}`, () => new THREE.SphereGeometry(1, ws, hs, 0, TAU, 0, Math.PI / 2)),
  cyl: (rt = 1, rb = 1, h = 1, seg = 14) => cached(`cyl${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)),
  torus: (R = 1, r = 0.2, rs = 6, ts = 16, arc = TAU) => cached(`tor${R}|${r}|${rs}|${ts}|${arc}`, () => new THREE.TorusGeometry(R, r, rs, ts, arc)),
  cone: (r = 1, h = 1, seg = 12) => cached(`cone${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg)),
  disc: (r = 1, seg = 24) => cached(`disc${r}|${seg}`, () => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2), true),
  ring: (ri = 0.8, ro = 1, seg = 32) => cached(`ring${ri}|${ro}|${seg}`, () => new THREE.RingGeometry(ri, ro, seg).rotateX(-Math.PI / 2), true),
  plane: (w = 1, d = 1) => cached(`pl${w}|${d}`, () => new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), true),
  /** vertical plane facing +Z */
  vplane: (w = 1, h = 1) => cached(`vpl${w}|${h}`, () => new THREE.PlaneGeometry(w, h), true),
  star: (outer = 0.5, inner = 0.22, depth = 0.12, points = 5, bevel = true) => cached(`star${outer}|${inner}|${depth}|${points}|${bevel}`, () =>
    extrude(starShape(points, outer, inner), depth, bevel ? depth * 0.35 : 0)),
  heart: (s = 0.5, depth = 0.12) => cached(`heart${s}|${depth}`, () => extrude(heartShape(s), depth, depth * 0.3, 4)),
  octa: (r = 1) => cached(`oct${r}`, () => new THREE.OctahedronGeometry(r, 0)),
  ico: (r = 1, d = 0) => cached(`ico${r}|${d}`, () => new THREE.IcosahedronGeometry(r, d)),
};

// smoothed normals (averaged by position) for the outline hull, cached per geometry
const smoothCache = new WeakMap();
function smoothNormals(g) {
  let out = smoothCache.get(g);
  if (out) return out;
  const pa = g.attributes.position, na = g.attributes.normal;
  out = new Float32Array(pa.count * 3);
  const map = new Map();
  const keys = new Array(pa.count);
  for (let i = 0; i < pa.count; i++) {
    const k = keys[i] = `${Math.round(pa.getX(i) * 1e4)}|${Math.round(pa.getY(i) * 1e4)}|${Math.round(pa.getZ(i) * 1e4)}`;
    let acc = map.get(k);
    if (!acc) { acc = [0, 0, 0]; map.set(k, acc); }
    if (na) { acc[0] += na.getX(i); acc[1] += na.getY(i); acc[2] += na.getZ(i); }
  }
  for (let i = 0; i < pa.count; i++) {
    const a = map.get(keys[i]);
    _v.set(a[0], a[1], a[2]);
    if (_v.lengthSq() < 1e-8) _v.set(pa.getX(i), pa.getY(i), pa.getZ(i));
    _v.normalize();
    out[i * 3] = _v.x; out[i * 3 + 1] = _v.y; out[i * 3 + 2] = _v.z;
  }
  smoothCache.set(g, out);
  return out;
}

// ----------------------------------------------------------------- builder
const _col = new THREE.Color();

/**
 * Collects coloured primitives and merges them into one indexed geometry with
 * position, normal, color, tint (0..1: how much the per-instance colour
 * applies) and ol (0 = fill, > 0 = outline hull with that width factor).
 * new Builder({ ol }) sets the default outline width factor (0 = none).
 */
export class Builder {
  constructor(o = {}) {
    this.parts = [];
    this.stack = [new THREE.Matrix4()];
    this.ol = o.ol ?? 1;
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
  /** add(geometry, colour, x, y, z, { rx, ry, rz, s, sx, sy, sz, tint, ol, fill }); fill: false = outline only */
  add(geom, color, x = 0, y = 0, z = 0, o = {}) {
    const m = composeM(x, y, z, o).premultiply(this.top());
    _col.set(color);
    const ol = geom.userData.noOutline ? 0 : (o.ol ?? this.ol);
    this.parts.push({ geom, m, r: _col.r, g: _col.g, b: _col.b, tint: o.tint || 0, ol, fill: o.fill !== false });
    return this;
  }
  /** cylinder rod between two points a, b ([x,y,z] arrays) */
  rod(a, b2, r, color, seg = 6, o = {}) {
    const dx = b2[0] - a[0], dy = b2[1] - a[1], dz = b2[2] - a[2];
    const len = Math.hypot(dx, dy, dz) || 1e-4;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    const m = new THREE.Matrix4().compose(new THREE.Vector3((a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2, (a[2] + b2[2]) / 2), q, new THREE.Vector3(1, len, 1));
    m.premultiply(this.top());
    _col.set(color);
    this.parts.push({ geom: G.cyl(r, r, 1, seg), m, r: _col.r, g: _col.g, b: _col.b, tint: 0, ol: o.ol ?? this.ol, fill: true });
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
    const c = g.attributes.position.count, k = g.index ? g.index.count : c;
    const copies = (p.ol > 0 ? 1 : 0) + (p.fill !== false ? 1 : 0);
    nv += c * copies; ni += k * copies;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const tin = new Float32Array(nv);
  const ola = new Float32Array(nv);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  function put(p, hull) {
    const g = p.geom;
    const pa = g.attributes.position, na = g.attributes.normal;
    const sn = hull ? smoothNormals(g) : null;
    _n3.getNormalMatrix(p.m);
    const flip = (p.m.determinant() < 0) !== hull; // the hull uses reversed winding
    for (let i = 0; i < pa.count; i++) {
      const o3 = (vo + i) * 3;
      _v.fromBufferAttribute(pa, i).applyMatrix4(p.m);
      pos[o3] = _v.x; pos[o3 + 1] = _v.y; pos[o3 + 2] = _v.z;
      if (hull) _v.set(sn[i * 3], sn[i * 3 + 1], sn[i * 3 + 2]).applyMatrix3(_n3).normalize();
      else if (na) _v.fromBufferAttribute(na, i).applyMatrix3(_n3).normalize();
      else _v.set(0, 1, 0);
      nor[o3] = _v.x; nor[o3 + 1] = _v.y; nor[o3 + 2] = _v.z;
      col[o3] = p.r; col[o3 + 1] = p.g; col[o3 + 2] = p.b;
      tin[vo + i] = p.tint;
      ola[vo + i] = hull ? p.ol : 0;
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
  // fills first, then hulls
  for (const p of parts) if (p.fill !== false) put(p, false);
  for (const p of parts) if (p.ol > 0) put(p, true);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('tint', new THREE.BufferAttribute(tin, 1));
  out.setAttribute('ol', new THREE.BufferAttribute(ola, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  if (out.boundingSphere) out.boundingSphere.radius += 0.1;
  out.computeBoundingBox();
  return out;
}

// --------------------------------------------------------------- materials
/**
 * Uniforms shared by every toon material (one object, so the scene updates
 * the light direction and the outline width in one place).
 */
export const TOON = {
  uniforms: {
    uLightDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() }, // view space
    uLit: { value: new THREE.Color(1.0, 0.985, 0.94) },
    uMid: { value: new THREE.Color(0.80, 0.77, 0.90) },
    uShade: { value: new THREE.Color(0.56, 0.52, 0.80) },
    uInk: { value: new THREE.Color(PAL.ink) },
    uOutline: { value: 0.05 }, // view-space units
    uSteps: { value: new THREE.Vector2(0.42, -0.08) },
  },
  /** set the key light direction from a world-space vector and the camera */
  setLight(worldDir, camera) {
    camera.updateMatrixWorld(true);
    const v = TOON.uniforms.uLightDir.value.copy(worldDir).normalize();
    v.transformDirection(camera.matrixWorldInverse);
  },
  /** outline width: px CSS pixels at worldPerPx world units per CSS px */
  setOutline(px, worldPerPx) { TOON.uniforms.uOutline.value = px * worldPerPx; },
};

const VERT = /* glsl */`
#include <common>
#include <color_pars_vertex>
attribute float tint;
attribute float ol;
uniform float uOutline;
varying vec3 vN;
varying float vOl;
void main() {
  #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
    vColor = vec4( 1.0 );
  #endif
  #ifdef USE_COLOR
    vColor.rgb *= color;
  #endif
  #ifdef USE_INSTANCING_COLOR
    #ifdef TINT_MASK
      vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, tint );
    #else
      vColor.rgb *= instanceColor.rgb;
    #endif
  #endif
  #include <beginnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <project_vertex>
  vN = normalize( transformedNormal );
  vOl = ol;
  if ( ol > 0.0 ) {
    float sc = length( modelViewMatrix[ 0 ].xyz );
    #ifdef USE_INSTANCING
      sc *= length( instanceMatrix[ 0 ].xyz );
    #endif
    float w = uOutline * ol * clamp( sc, 0.0, 1.0 );
    mvPosition.xy += vN.xy * w;
    mvPosition.z -= w * 0.8;
    gl_Position = projectionMatrix * mvPosition;
  }
}`;

const FRAG = /* glsl */`
#include <common>
#include <color_pars_fragment>
uniform vec3 uLightDir;
uniform vec3 uLit;
uniform vec3 uMid;
uniform vec3 uShade;
uniform vec3 uInk;
uniform vec2 uSteps;
varying vec3 vN;
varying float vOl;
void main() {
  vec3 base = vec3( 1.0 );
  #if defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
    base = vColor.rgb;
  #endif
  vec3 col;
  if ( vOl > 0.001 ) {
    col = uInk;
  } else {
    #ifdef UNLIT
      col = base;
    #else
      vec3 n = normalize( vN );
      float d = dot( n, uLightDir );
      float aa = max( fwidth( d ) * 0.7, 0.002 );
      float s1 = smoothstep( uSteps.x - aa, uSteps.x + aa, d );
      float s2 = smoothstep( uSteps.y - aa, uSteps.y + aa, d );
      vec3 band = mix( uShade, mix( uMid, uLit, s1 ), s2 );
      col = base * band;
    #endif
  }
  gl_FragColor = vec4( col, 1.0 );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const matCache = new Map();
/**
 * Shared toon material with vertex colours and baked outline hulls. With
 * tintMask the per-instance colour only applies where the geometry's `tint`
 * attribute is 1 (so a toy car can get a random body colour while its wheels
 * stay dark). unlit: no shading (screens, glows), outlines still drawn.
 */
export function toyMaterial({ tintMask = true, unlit = false, side = THREE.FrontSide } = {}) {
  const key = `${tintMask}|${unlit}|${side}`;
  if (matCache.has(key)) return matCache.get(key);
  const defines = {};
  if (tintMask) defines.TINT_MASK = '';
  if (unlit) defines.UNLIT = '';
  const mat = new THREE.ShaderMaterial({
    uniforms: TOON.uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    vertexColors: true,
    defines,
    side,
  });
  mat.name = 'toon' + (tintMask ? '-tint' : '') + (unlit ? '-unlit' : '');
  matCache.set(key, mat);
  return mat;
}

/** onBeforeCompile hook for built-in materials: per-instance colour only where `tint` is 1 */
export function tintMaskShader(sh) {
  const chunk = THREE.ShaderChunk.color_vertex.replace(
    'vColor.rgb *= instanceColor.rgb;',
    'vColor.rgb *= mix( vec3( 1.0 ), instanceColor.rgb, tint );');
  sh.vertexShader = 'attribute float tint;\n' + sh.vertexShader.replace('#include <color_vertex>', chunk);
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
    g.addColorStop(0.55, 'rgba(255,255,255,0.8)');
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
  // k < 0 darker (toward the ink plum), k > 0 lighter
  return k < 0 ? mix(c, PAL.ink, -k) : mix(c, 0xffffff, k);
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
