// Magmadon: original procedural kaiju, a volcanic tortoise-boar (~110 m snout to tail, 42 m tall).
// One big idea: a boar's head and elephant-like legs carrying a domed carapace made of seven huge
// basalt plates (plus a ring of marginal scutes). Molten rock glows in the seams between the plates,
// in the mouth and in the eyes. When it dies the seams cool to a dull red and steam; carving lifts a
// plate off and exposes a flesh cross-section with pale ribs and the glowing magma gland (the prize).
//
// Everything is generated here: no model files. All parts share ONE material (vertex colour + a
// per-vertex heat channel), so the baked corpse is a single draw call.
// v2 (scene-actors): ported from proto-B. New head (critic-B): a heavy basalt beak hooked like a
// snapping turtle's, a frowning brow ridge, glowing eye slits, small slit nostrils, swept-back horn
// spikes and the boar tusks; no disc snout, no ears. Every plate carries its id and every vertex gets
// its position u along the body when the corpse is baked (aCarve), so the carving shader can lift
// plates and cut the body away district by district in ONE draw call (back faces show the flesh).
import * as THREE from 'three';
import { rng, noise3, clamp, lerp, smooth } from '../util.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;
const _c = new THREE.Color(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _v = new THREE.Vector3();

export const PAL = {
  basalt: 0x2c2826, basaltHi: 0x6a645e, basaltLo: 0x121012, sulfur: 0x9a8448, crust: 0x1a0b07,
  hideDark: 0x3c312a, hide: 0x6a5545, hideMid: 0x8a6e55, belly: 0xb99b74, bellyFold: 0x987b5b,
  snout: 0x553834, nostril: 0x1a0e0c, ivory: 0xe6d8ba, ivoryBase: 0x8f7d60, nail: 0xd0c2a2,
  mouth: 0x3c100c, gum: 0x6e2c27, tongue: 0x8a4446, tooth: 0xd8ccb0,
  // the inside under the plates reads volcanic (basalt layers, pale mineral, magma veins), never as red meat (DESIGN §8/§13)
  flesh: 0x4e4038, fleshLight: 0x7a6656, fleshDeep: 0x231b18, fat: 0xb8a68a, bone: 0xdccfb2, gland: 0xff8a2a,
};
// heat channel (aHeat.y): 0 magma (cools on death), 1 eyes (off when dead), 2 gland (always hot), 3 wet flesh
const CH_MAGMA = 0, CH_EYE = 1, CH_GLAND = 2, CH_WET = 3;

// ------------------------------------------------------------------------------------ material
const CARVE_PARS = /* glsl */`
uniform vec4 uPart[3]; uniform float uPlateGone[20]; uniform float uCarveOn, uCutScale;
varying vec2 vCarve; varying vec3 vLPc;
float gCut = 1000.0;
float carveHash(vec3 p) { return fract(sin(dot(floor(p), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
bool carved() {
  if (uCarveOn < 0.5) return false;
  int pid = int(vCarve.y + 0.5);
  for (int i = 1; i < 20; i++) if (i == pid && uPlateGone[i] > 0.5) return true;
  float u = vCarve.x + (carveHash(vLPc * 0.35) - 0.5) * 0.008;
  for (int k = 0; k < 3; k++) {
    vec4 P = uPart[k];
    if (P.y <= P.x) continue;
    if (u >= P.x && u < P.y + 0.0001) {
      float span = P.y - P.x;
      float d = P.z < 0.5 ? (u - P.x) / span : (P.y - u) / span;
      if (d < P.w) return true;
      if (P.w > 0.0005) gCut = min(gCut, (d - P.w) * span * uCutScale);
    }
  }
  return false;
}`;
export function magmaMaterial(U, C) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0, flatShading: true, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, C);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aHeat; attribute vec2 aCarve; varying vec2 vHeat; varying vec3 vLP; varying vec2 vCarve; varying vec3 vLPc;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeat = aHeat; vLP = position; vCarve = aCarve; vLPc = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uHeat, uEye, uGland, uTime, uPulseAmt, uMutant; uniform vec3 uHotCol, uEyeCol, uGlandCol, uKeyCol, uKeyDir, uRimCol, uSkyCol;
varying vec2 vHeat; varying vec3 vLP;
${CARVE_PARS}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (carved()) discard;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.78, 0.86, 0.92) + vec3(0.015, 0.03, 0.035), uMutant);
  if (!gl_FrontFacing && uCarveOn > 0.5) {
    // inside of the body seen through a cut (review 2 F5: it read as a flat tan slab): dark volcanic tissue (brown, never
    // red meat: DESIGN §13 age rule) with pale mineral marbling, a pale layer under the hide and bone-pale rib bands
    float mn = carveHash(vLPc * 0.55) * 0.6 + carveHash(vLPc * 1.7) * 0.4;
    float marb = smoothstep(0.62, 0.8, mn + 0.25 * sin(vLPc.y * 0.9 + vLPc.x * 0.7));
    float rib = smoothstep(0.82, 0.96, 0.5 + 0.5 * sin(vLPc.z * 0.42));
    float fat = smoothstep(0.0, 0.25, 1.0 - clamp(gCut * 0.35, 0.0, 1.0));
    vec3 fl = mix(vec3(0.15, 0.11, 0.09), vec3(0.24, 0.17, 0.13), carveHash(vLPc * 0.25));
    fl = mix(fl, vec3(0.58, 0.47, 0.36), marb * 0.75);
    fl = mix(fl, vec3(0.66, 0.60, 0.50), rib * 0.8);
    fl = mix(fl, vec3(0.52, 0.42, 0.30), fat * 0.5);
    diffuseColor.rgb = mix(fl, fl * vec3(0.7, 1.05, 0.85), uMutant);
  }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  if (vHeat.y > 2.5 || !gl_FrontFacing) roughnessFactor = 0.38;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float ch = floor(vHeat.y + 0.5);
    float h = vHeat.x;
    vec3 e = vec3(0.0);
    if (!gl_FrontFacing) {
      float vn = carveHash(vLPc * 0.45 + vec3(3.1, 0.0, 1.7));
      float vein = smoothstep(0.86, 0.97, vn) * (0.6 + 0.4 * sin(uTime * 1.3 + vLPc.z * 0.2));
      e = uGlandCol * (0.035 * exp(-gCut * 1.2) + 0.22 * vein);
    } else if (ch < 0.5) {
      float pulse = mix(1.0, 0.7 + 0.3 * sin(uTime * 1.7 - vLP.z * 0.05), uPulseAmt);
      float smoulder = 0.75 + 0.25 * sin(uTime * 0.6 + vLP.x * 0.21 + vLP.z * 0.13);
      e = uHotCol * h * h * uHeat * mix(smoulder, pulse, uPulseAmt);
      diffuseColor.rgb *= 1.0 - 0.55 * h;
    } else if (ch < 1.5) {
      e = uEyeCol * h * uEye;
      diffuseColor.rgb *= 1.0 - 0.8 * uEye;
    } else if (ch < 2.5) {
      float gp = 0.82 + 0.18 * sin(uTime * 2.6);
      e = uGlandCol * h * uGland * gp;
    } else {
      e = uHotCol * h * h * uHeat * 0.5;
    }
    // review 2 F5: the silhouette separates from the scorched ground: a cool sky lift on up-facing plates and a thin
    // cool rim at grazing angles (front faces only, small values so nothing glows)
    if (gl_FrontFacing) {
      vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
      float upk = max(0.0, dot(normal, upV));
      float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
      // polish: sky lift / rim / warm key are uniforms (attack.js lights the cinematic, corpse.js the gameplay view)
      vec3 kd = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz);
      e += uSkyCol * upk * upk + uRimCol * fr + diffuseColor.rgb * uKeyCol * max(dot(normal, kd), 0.0);
    }
    // cut edge: a broken, noisy ember line rather than a hard outline (review V6)
    if (gl_FrontFacing && gCut < 1.2 && uCarveOn > 0.5) { float en = carveHash(vLPc * 0.8); e += uGlandCol * 0.07 * (1.0 - gCut / 1.2) * smoothstep(0.45, 0.9, en); diffuseColor.rgb *= 0.8; }
    totalEmissiveRadiance += e;
  }`);
  };
  m.customProgramCacheKey = () => 'magmadon-v3a';
  return m;
}
// shadow depth with the same cut (a carved part casts no shadow)
export function magmaDepthMaterial(C) {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, C);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCarve; varying vec2 vCarve; varying vec3 vLPc;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCarve = aCarve; vLPc = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${CARVE_PARS}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  if (carved()) discard;');
  };
  m.customProgramCacheKey = () => 'magmadon-depth-v2a';
  return m;
}
export function carveUniforms() {
  return { uPart: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uPlateGone: { value: new Float32Array(20) }, uCarveOn: { value: 0 }, uCutScale: { value: 120 } };
}

// ------------------------------------------------------------------------------------ geometry accumulation
// Acc gathers triangles with colour and heat, outputs one non-indexed geometry (flat normals).
class Acc {
  constructor(seed = 1) { this.pos = []; this.col = []; this.heat = []; this.carve = []; this.plate = 0; this.r = rng(seed); }
  tri(a, b, c, ca, cb, cc, ha, hb, hc, jitter = 0.05) {
    const j = 1 + (this.r() - 0.5) * jitter;
    this.pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    this.carve.push(0, this.plate, 0, this.plate, 0, this.plate);
    for (const cl of [ca, cb, cc]) this.col.push(cl.r * j, cl.g * j, cl.b * j);
    this.heat.push(ha[0], ha[1], hb[0], hb[1], hc[0], hc[1]);
  }
  // indexed or non-indexed geometry with 'color' (Float) and optional 'aHeat'
  geo(g, { matrix = null, color = null, heat = null, jitter = 0.06 } = {}) {
    if (matrix) { g = g.clone(); g.applyMatrix4(matrix); }
    const p = g.attributes.position, cA = g.attributes.color, hA = g.attributes.aHeat, kA = g.attributes.aCarve;
    const idx = g.index ? g.index.array : null;
    const n = idx ? idx.length : p.count;
    const fixedC = color != null ? new THREE.Color(color) : null;
    for (let f = 0; f < n; f += 3) {
      const jit = 1 + (this.r() - 0.5) * jitter;
      for (let k = 0; k < 3; k++) {
        const i = idx ? idx[f + k] : f + k;
        this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
        if (fixedC) this.col.push(fixedC.r * jit, fixedC.g * jit, fixedC.b * jit);
        else if (cA) this.col.push(cA.getX(i) * jit, cA.getY(i) * jit, cA.getZ(i) * jit);
        else this.col.push(0.5, 0.5, 0.5);
        if (heat) this.heat.push(heat[0], heat[1]);
        else if (hA) this.heat.push(hA.getX(i), hA.getY(i));
        else this.heat.push(0, 0);
        this.carve.push(0, kA ? kA.getY(i) : this.plate);
      }
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aHeat', new THREE.Float32BufferAttribute(this.heat, 2));
    g.setAttribute('aCarve', new THREE.Float32BufferAttribute(this.carve, 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// Loft rings into an indexed geometry with per-vertex colour and heat callbacks.
// ring: { c: Vector3 centre, d: axis direction, u: lateral axis, w, h | top/bot, ex, dy, nk }
// frame per ring: v = d x u, so (u, v, d) is right-handed and the faces point outward.
function loft(rings, nv, { color, heat = null, noise = 0, nfreq = 0.25, seed = 0, caps = [true, true] }) {
  const pos = [], col = [], hh = [];
  const P = new THREE.Vector3(), R = new THREE.Vector3(), Vv = new THREE.Vector3();
  const nr = rings.length;
  rings.forEach((r, i) => {
    const t = nr > 1 ? i / (nr - 1) : 0;
    Vv.crossVectors(r.d, r.u).normalize();
    for (let j = 0; j < nv; j++) {
      const a = (j / nv) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const ex = r.ex ?? 2.2;
      const x = Math.sign(ca) * Math.pow(Math.abs(ca), 2 / ex) * r.w;
      const y = Math.sign(sa) * Math.pow(Math.abs(sa), 2 / ex) * (sa > 0 ? (r.top ?? r.h) : (r.bot ?? r.h)) + (r.dy ?? 0);
      P.copy(r.c).addScaledVector(r.u, x).addScaledVector(Vv, y);
      if (noise) {
        R.copy(r.u).multiplyScalar(ca).addScaledVector(Vv, sa);
        const n = (noise3(P.x * nfreq + seed, P.y * nfreq, P.z * nfreq) - 0.5) + (noise3(P.x * nfreq * 2.7, P.y * nfreq * 2.7 + seed, P.z * nfreq * 2.7) - 0.5) * 0.4;
        P.addScaledVector(R, n * noise * 2 * (r.nk ?? 1));
      }
      pos.push(P.x, P.y, P.z);
      const c = color(t, a, P, i, j); col.push(c.r, c.g, c.b);
      const h = heat ? heat(t, a, P, i, j) : [0, 0]; hh.push(h[0], h[1]);
    }
  });
  const idx = [];
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nv; j++) {
    const a = i * nv + j, b = i * nv + (j + 1) % nv, c = (i + 1) * nv + j, d = (i + 1) * nv + (j + 1) % nv;
    idx.push(a, b, c, b, d, c);
  }
  const addCap = (ri, start) => {
    const r = rings[ri];
    const ci = pos.length / 3;
    const cc = r.c.clone().addScaledVector(Vv.crossVectors(r.d, r.u).normalize(), r.dy ?? 0);
    pos.push(cc.x, cc.y, cc.z);
    const c = color(start ? 0 : 1, -Math.PI / 2, cc, ri, 0); col.push(c.r, c.g, c.b);
    const h = heat ? heat(start ? 0 : 1, -Math.PI / 2, cc, ri, 0) : [0, 0]; hh.push(h[0], h[1]);
    for (let j = 0; j < nv; j++) {
      const a = ri * nv + j, b = ri * nv + (j + 1) % nv;
      if (start) idx.push(ci, b, a); else idx.push(ci, a, b);
    }
  };
  if (caps[0]) addCap(0, true);
  if (caps[1]) addCap(nr - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aHeat', new THREE.Float32BufferAttribute(hh, 2));
  g.setIndex(idx);
  return g;
}

// ellipsoid as a loft along an axis (indexed), centred at c
function ellipsoid(c, rx, ry, rz, { nr = 10, nv = 12, color, heat, noise = 0, seed = 0, axis = 'z' } = {}) {
  const rings = [];
  for (let i = 0; i <= nr; i++) {
    const t = -1 + (2 * i) / nr;
    const s = Math.sqrt(Math.max(0, 1 - t * t));
    if (axis === 'z') rings.push({ c: V3(c.x, c.y, c.z + t * rz), d: V3(0, 0, 1), u: V3(1, 0, 0), w: Math.max(0.01, rx * s), h: Math.max(0.01, ry * s), ex: 2 });
    else rings.push({ c: V3(c.x, c.y - t * ry, c.z), d: V3(0, -1, 0), u: V3(1, 0, 0), w: Math.max(0.01, rx * s), h: Math.max(0.01, rz * s), ex: 2 });
  }
  return loft(rings, nv, { color: color || (() => _c.set(0x888888)), heat, noise, seed, caps: [false, false] });
}

// tapered tube along a curve (indexed), radius per control point
function tube(pts, radii, seg, color, heat = null) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const n = Math.max(4, pts.length * 3);
  const frames = curve.computeFrenetFrames(n, false);
  const rings = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const rf = t * (radii.length - 1);
    const r = lerp(radii[Math.floor(rf)], radii[Math.min(radii.length - 1, Math.floor(rf) + 1)], rf - Math.floor(rf));
    rings.push({ c: curve.getPointAt(t), d: frames.tangents[i].clone(), u: frames.normals[i].clone(), w: r, h: r, ex: 2 });
  }
  return loft(rings, seg, { color: typeof color === 'function' ? color : () => _c.set(color), heat: heat ? (typeof heat === 'function' ? heat : () => heat) : null });
}

const C = Object.fromEntries(Object.entries(PAL).map(([k, v]) => [k, new THREE.Color(v)]));
const mix = (a, b, t, out = new THREE.Color()) => out.copy(a).lerp(b, clamp(t, 0, 1));

// ------------------------------------------------------------------------------------ carapace
// Base: upper part of an ellipsoid on a lat-long grid. Plates are noisy-Voronoi regions on it; each
// plate is a raised slab (domed top, growth terraces, vertical rim walls); a dark crust layer under
// the seams carries the magma glow. Carved plates are replaced by a flesh bowl with ribs and gland.
const SH = { C: V3(0, 19, -1), AX: 18.5, AY: 23, AZ: 34, PHIMAX: 99 * D2R, NI: 32, NJ: 96, GAP: 1.9 };
const SEEDS = [[0, 0], [40, 90], [44, -90], [67, 30], [70, -34], [67, 150], [70, -146]];
const NBIG = SEEDS.length;
for (let k = 0; k < 12; k++) SEEDS.push([94, k * 30 + 15]);
export const PLATE = { CROWN: 0, FRONT: 1, REAR: 2, LF: 3, LR: 4, RF: 5, RR: 6, COUNT: SEEDS.length };

function shellData() {
  const { C: SC, AX, AY, AZ, PHIMAX, NI, NJ } = SH;
  const dirOf = (phi, th, o = new THREE.Vector3()) => o.set(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th));
  const surf = (d, o = new THREE.Vector3()) => o.set(SC.x + d.x * AX, SC.y + d.y * AY, SC.z + d.z * AZ);
  const nrm = (d, o = new THREE.Vector3()) => o.set(d.x / AX, d.y / AY, d.z / AZ).normalize();
  const seedDir = SEEDS.map(([p, t]) => dirOf(p * D2R, t * D2R));
  const seedPt = seedDir.map((d) => surf(d));
  const q = new THREE.Vector3();
  function classify(d) {
    surf(d, q);
    let d1 = 1e9, d2 = 1e9, k1 = -1;
    for (let k = 0; k < SEEDS.length; k++) {
      let dist = q.distanceTo(seedPt[k]) + (k >= NBIG ? 1.5 : 0);
      dist += (noise3(q.x * 0.085 + k * 3.1, q.y * 0.085, q.z * 0.085) - 0.5) * 7.5;
      if (dist < d1) { d2 = d1; d1 = dist; k1 = k; } else if (dist < d2) d2 = dist;
    }
    return [k1, d2 - d1];
  }
  const nV = (NI + 1) * NJ;
  const dirs = [], K = new Int16Array(nV), B = new Float32Array(nV);
  for (let i = 0; i <= NI; i++) for (let j = 0; j < NJ; j++) {
    const d = dirOf((i / NI) * PHIMAX, (j / NJ) * Math.PI * 2);
    dirs.push(d);
    const [k, b] = classify(d);
    K[i * NJ + j] = k; B[i * NJ + j] = b;
  }
  const tris = [];
  for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++) {
    const a = i * NJ + j, b = (i + 1) * NJ + j, c = (i + 1) * NJ + (j + 1) % NJ, d = i * NJ + (j + 1) % NJ;
    if (i > 0) tris.push([a, d, c]);
    tris.push([a, c, b]);
  }
  return { dirs, K, B, tris, surf, nrm, classify, seedDir, seedPt, dirOf };
}

function buildShell(acc, data) {
  const S = data;
  const { GAP, NJ, NI, PHIMAX } = SH;
  const half = GAP / 2;
  const plateTris = Array.from({ length: SEEDS.length }, () => []);
  for (const t of S.tris) {
    const k = S.K[t[0]];
    if (S.K[t[1]] !== k || S.K[t[2]] !== k) continue;
    if (S.B[t[0]] <= half || S.B[t[1]] <= half || S.B[t[2]] <= half) continue;
    plateTris[k].push(t);
  }
  // per-plate boundary (directed edges without a reverse twin)
  const plateInfo = [];
  for (let k = 0; k < SEEDS.length; k++) {
    const dir = new Set();
    for (const t of plateTris[k]) for (let e = 0; e < 3; e++) dir.add(t[e] * 100000 + t[(e + 1) % 3]);
    const bnd = [];
    for (const t of plateTris[k]) for (let e = 0; e < 3; e++) {
      const a = t[e], b = t[(e + 1) % 3];
      if (!dir.has(b * 100000 + a)) bnd.push([a, b]);
    }
    plateInfo.push({ bnd });
  }
  // snap boundary vertices outward onto the iso-line b = GAP/2 (smooth noisy seams instead of steps)
  const snapped = new Map();
  const tmp = new THREE.Vector3(), u = new THREE.Vector3();
  for (let k = 0; k < SEEDS.length; k++) {
    const s = S.seedDir[k];
    for (const [a] of plateInfo[k].bnd) {
      if (snapped.has(a)) continue;
      const v = S.dirs[a];
      if (S.B[a] > half + 3.5) { snapped.set(a, v); continue; }
      const cosv = clamp(s.dot(v), -1, 1);
      const th0 = Math.acos(cosv);
      u.copy(v).addScaledVector(s, -cosv);
      if (u.lengthSq() < 1e-8) { snapped.set(a, v); continue; }
      u.normalize();
      const at = (th) => tmp.copy(s).multiplyScalar(Math.cos(th)).addScaledVector(u, Math.sin(th)).clone();
      let lo = th0, hi = th0 + 0.2;
      const bHi = S.classify(at(hi));
      if (bHi[0] === k && bHi[1] > half) { snapped.set(a, v); continue; }
      for (let it = 0; it < 10; it++) {
        const mid = (lo + hi) / 2;
        const [kk, bb] = S.classify(at(mid));
        if (kk === k && bb > half) lo = mid; else hi = mid;
      }
      const d = at(lo);
      if (Math.acos(clamp(d.y, -1, 1)) > PHIMAX) { snapped.set(a, v); continue; }
      snapped.set(a, d);
    }
  }
  const dirFor = (i) => snapped.get(i) || S.dirs[i];
  const isBottom = (i) => Math.floor(i / NJ) === NI;
  const outer = new Map(), inner = new Map(), colr = new Map(), heat = new Map();
  function plateVertex(i, k) {
    if (outer.has(i)) return;
    const d = dirFor(i);
    const base = S.surf(d, new THREE.Vector3()), n = S.nrm(d, new THREE.Vector3());
    const bb = snapped.has(i) ? half : S.B[i];
    const big = k < NBIG;
    const inn = smooth(half, half + (big ? 8 : 3.2), bb);
    const thick = big ? 1.5 + 2.8 * inn : 1.0 + 1.3 * inn;
    const terr = 0.22 * smooth(0.4, 0.6, (bb / 3.2) % 1) * inn * (big ? 1 : 0.5);
    const rough = (noise3(base.x * 0.2, base.y * 0.2 + k, base.z * 0.2) - 0.5) * 2.0 + (noise3(base.x * 0.55 + 9, base.y * 0.55, base.z * 0.55) - 0.5) * 1.5;
    outer.set(i, base.clone().addScaledVector(n, thick + terr + rough * (0.25 + 0.6 * inn)));
    inner.set(i, base.clone().addScaledVector(n, -0.45));
    const wN = noise3(base.x * 0.07 + 4, base.y * 0.07, base.z * 0.07);
    // plate centres lighter than the seams so the shell pattern reads from the gameplay camera (playtest m16)
    const cl = mix(C.basalt, C.basaltHi, Math.min(1, 0.3 + (wN - 0.35) * 1.4) * inn);
    cl.lerp(C.basaltLo, (1 - inn) * 0.55);
    if (inn < 0.6 && noise3(base.x * 0.16 + 20, base.y * 0.16, base.z * 0.16) > 0.66) cl.lerp(C.sulfur, 0.55 * (1 - inn));
    if (terr > 0.2) cl.multiplyScalar(1.12);
    colr.set(i, cl);
    const cr = big ? 1 - smooth(0.0, 0.028, Math.abs(noise3(base.x * 0.055 + k * 1.7, base.y * 0.055, base.z * 0.055) - 0.5)) : 0;
    heat.set(i, [cr * smooth(0.25, 0.6, inn) * 0.75, CH_MAGMA]);
  }
  // plates: each carries its id (1..19) so the carving shader can lift it off
  for (let k = 0; k < SEEDS.length; k++) {
    acc.plate = k + 1;
    for (const t of plateTris[k]) for (const i of t) plateVertex(i, k);
    for (const t of plateTris[k]) acc.tri(outer.get(t[0]), outer.get(t[1]), outer.get(t[2]), colr.get(t[0]), colr.get(t[1]), colr.get(t[2]), heat.get(t[0]), heat.get(t[1]), heat.get(t[2]), 0.1);
    for (const [a, b] of plateInfo[k].bnd) {
      const Ao = outer.get(a), Bo = outer.get(b), Ai = inner.get(a), Bi = inner.get(b);
      const rim = isBottom(a) && isBottom(b);
      const top = rim ? C.ivoryBase : mix(C.basaltLo, C.basalt, 0.4), bot = rim ? C.hideDark : C.crust; // pale shell rim: the outline reads from above
      const hT = [0, 0], hB = rim ? [0, 0] : [0.95, CH_MAGMA];
      acc.tri(Ao, Ai, Bi, top, bot, bot, hT, hB, hB, 0.12);
      acc.tri(Ao, Bi, Bo, top, bot, top, hT, hB, hT, 0.12);
    }
    // underside: the plate reads as a solid slab when its neighbour is lifted
    for (const t of plateTris[k]) acc.tri(inner.get(t[0]), inner.get(t[2]), inner.get(t[1]), C.fleshDeep, C.fleshDeep, C.fleshDeep, [0, 0], [0, 0], [0, 0], 0.15);
  }
  acc.plate = 0;
  // magma crust layer under the seams
  const glowN = (p) => 0.8 + 0.4 * noise3(p.x * 0.12, p.y * 0.12, p.z * 0.12 + 5);
  for (const t of S.tris) {
    const minB = Math.min(S.B[t[0]], S.B[t[1]], S.B[t[2]]);
    if (minB > GAP * 1.25) continue;
    const P = t.map((i) => { const d = S.dirs[i]; return S.surf(d, new THREE.Vector3()).addScaledVector(S.nrm(d, new THREE.Vector3()), -0.3); });
    const H = t.map((i) => [clamp(1.05 - S.B[i] / (GAP * 0.95), 0, 1) * glowN(P[0]), CH_MAGMA]);
    acc.tri(P[0], P[1], P[2], C.crust, C.crust, C.crust, H[0], H[1], H[2], 0.1);
  }
  // flesh under EVERY plate (hidden until the plate is lifted): bowl, fat rim, marbling; the big plates
  // also show pale ribs and the glowing magma gland (the prize)
  const glands = [];
  for (let k = 0; k < SEEDS.length; k++) {
    const vs = new Set();
    const regionTris = S.tris.filter((t) => S.K[t[0]] === k && S.K[t[1]] === k && S.K[t[2]] === k);
    let deepest = null, bMax = 0;
    for (const t of regionTris) for (const i of t) { vs.add(i); if (S.B[i] > bMax) { bMax = S.B[i]; deepest = i; } }
    if (!regionTris.length) continue;
    const big = k < NBIG;
    const depthOf = (b) => (big ? 5.2 : 2.6) * Math.pow(smooth(0.0, Math.max(6, bMax * 0.8), b), 0.7);
    const fleshP = new Map(), fleshC = new Map();
    for (const i of vs) {
      const d = S.dirs[i], b = S.B[i];
      const dep = depthOf(b);
      const base = S.surf(d, new THREE.Vector3()), n = S.nrm(d, new THREE.Vector3());
      const nn = noise3(base.x * 0.3, base.y * 0.3 + 7, base.z * 0.3);
      const n2 = noise3(base.x * 0.9, base.y * 0.9, base.z * 0.9 + 3);
      fleshP.set(i, base.clone().addScaledVector(n, -0.3 - dep + (nn - 0.5) * 1.4 * smooth(0, 1.5, dep)));
      let cl;
      if (dep < 0.55) cl = mix(C.fat, C.fleshLight, dep / 0.55);
      else cl = mix(C.fleshLight, C.flesh, (dep - 0.55) / 1.2).lerp(C.fleshDeep, smooth(2.5, 5.5, dep) * 0.6);
      if (n2 > 0.64 && dep > 0.6) cl.lerp(C.fat, 0.5);
      cl.multiplyScalar(0.85 + nn * 0.3);
      fleshC.set(i, cl);
    }
    for (const t of regionTris) acc.tri(fleshP.get(t[0]), fleshP.get(t[1]), fleshP.get(t[2]), fleshC.get(t[0]), fleshC.get(t[1]), fleshC.get(t[2]), [0, CH_WET], [0, CH_WET], [0, CH_WET], 0.12);
    if (!big) continue;
    const sd = S.seedDir[k];
    const phiS = Math.acos(clamp(sd.y, -1, 1)), thS = Math.atan2(sd.z, sd.x);
    for (let r = -2; r <= 2; r++) {
      const pts = [];
      for (let st = -12; st <= 12; st += 2) {
        const d = S.dirOf(phiS + st * 0.03, thS + r * 0.13);
        const [kk, b] = S.classify(d);
        if (kk !== k || b < 1.2) continue;
        const dep = depthOf(b);
        pts.push(S.surf(d, new THREE.Vector3()).addScaledVector(S.nrm(d, new THREE.Vector3()), -dep * 0.45 - 0.3));
      }
      if (pts.length < 4) continue;
      const rr = pts.map((_, i) => 1.15 * (0.55 + 0.45 * Math.sin((i / (pts.length - 1)) * Math.PI)));
      acc.geo(tube(pts, rr, 5, C.bone));
    }
    const gd = S.dirs[deepest];
    const gp = S.surf(gd, new THREE.Vector3()).addScaledVector(S.nrm(gd, new THREE.Vector3()), -depthOf(bMax) + 1.6);
    acc.geo(ellipsoid(gp, 3.8, 3.2, 4.4, { nr: 6, nv: 10, color: () => _c.set(PAL.gland), heat: () => [1, CH_GLAND], noise: 0.5 }));
    glands.push({ k, p: gp.clone() });
  }
  return { glands };
}

// ------------------------------------------------------------------------------------ build
export function createMagmadon() {
  const U = {
    uHeat: { value: 1 }, uEye: { value: 1 }, uGland: { value: 1 }, uTime: { value: 0 }, uPulseAmt: { value: 1 }, uMutant: { value: 0 },
    uHotCol: { value: new THREE.Color(1.0, 0.36, 0.06).multiplyScalar(4.6) },
    uEyeCol: { value: new THREE.Color(1.0, 0.42, 0.08).multiplyScalar(3.4) },
    uGlandCol: { value: new THREE.Color(1.0, 0.24, 0.03).multiplyScalar(2.4) },
    // shared with KALKAN-07's material (robot.js cineUniforms shape)
    uKeyCol: { value: new THREE.Color(0, 0, 0) }, uKeyDir: { value: new THREE.Vector3(0.3, 0.8, 0.5).normalize() },
    uRimCol: { value: new THREE.Color(0.07, 0.09, 0.12) }, uSkyCol: { value: new THREE.Color(0.045, 0.05, 0.06) },
  };
  const CU = carveUniforms();               // the articulated (alive) model never carves
  const mat = magmaMaterial(U, CU);
  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);
  const shellD = shellData();
  const mk = (geo, parent, pivot) => {
    if (pivot) geo.translate(-pivot.x, -pivot.y, -pivot.z);
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };

  // pivots in rest space (ground y = 0, +z forward)
  const BODY = V3(0, 19, 0), NECK = V3(0, 22, 27), HEAD = V3(0, 23.5, 39), TAIL = V3(0, 15, -30);
  const LEGS = [
    { name: 'FL', side: 1, front: true, p: V3(13.6, 15.5, 18.5) }, { name: 'FR', side: -1, front: true, p: V3(-13.6, 15.5, 18.5) },
    { name: 'HL', side: 1, front: false, p: V3(13.0, 15.5, -17) }, { name: 'HR', side: -1, front: false, p: V3(-13.0, 15.5, -17) },
  ];

  const body = new THREE.Group(); body.position.copy(BODY); root.add(body);
  let glands = [];
  {
    const acc = new Acc(3);
    // belly hide: warm, lighter underneath, transverse folds
    const rings = [];
    for (let i = 0; i <= 18; i++) {
      const z = -31 + (62 * i) / 18;
      const s = Math.pow(Math.max(0, 1 - Math.pow(z / 32.5, 2)), 0.62);
      const fold = i % 2 ? 0.965 : 1.0;
      rings.push({ c: V3(0, 19.5, z), d: V3(0, 0, 1), u: V3(1, 0, 0), w: 16.8 * s * fold, top: 9 * s, bot: 10.5 * s * fold, ex: 2.3 });
    }
    acc.geo(loft(rings, 18, {
      color: (t, a, P, i) => { const sa = Math.sin(a); const c = sa < -0.35 ? mix(C.hideMid, C.belly, (-sa - 0.35) * 2) : mix(C.hideMid, C.hide, sa + 0.35); if (i % 2) c.lerp(C.bellyFold, 0.35); return c.multiplyScalar(0.9 + noise3(P.x * 0.3, P.y * 0.3, P.z * 0.3) * 0.2); },
      noise: 0.45, nfreq: 0.18, seed: 2,
    }));
    // underside skirt closing the gap between the shell rim and the belly
    const { C: SC, AX, AY, AZ, PHIMAX } = SH;
    const NJ2 = 48;
    for (let j = 0; j < NJ2; j++) {
      const ring = (jj, rr) => { const th = (jj / NJ2) * Math.PI * 2; const d = V3(Math.sin(PHIMAX) * Math.cos(th), Math.cos(PHIMAX), Math.sin(PHIMAX) * Math.sin(th)); return V3(SC.x + d.x * AX * rr, SC.y + d.y * AY + (rr < 1 ? 1.5 : 0), SC.z + d.z * AZ * rr); };
      const a = ring(j, 1), b = ring(j + 1, 1), c = ring(j, 0.8), d = ring(j + 1, 0.8);
      acc.tri(a, c, d, C.hideDark, C.hideDark, C.hideDark, [0, 0], [0, 0], [0, 0]);
      acc.tri(a, d, b, C.hideDark, C.hideDark, C.hideDark, [0, 0], [0, 0], [0, 0]);
    }
    // inside the body (seen only through a carving cut): spine, rib hoops, three magma glands
    const spine = [V3(0, 25, -34), V3(0, 27, -12), V3(0, 27.5, 10), V3(0, 25, 28)];
    acc.geo(tube(spine, [2.0, 2.6, 2.6, 2.0], 7, C.bone));
    for (let r = 0; r < 9; r++) {
      const z = -26 + r * 6.4;
      const s = Math.pow(Math.max(0, 1 - Math.pow(z / 33, 2)), 0.6);
      const pts = [];
      for (let k = 0; k <= 10; k++) { const a = -0.15 * Math.PI + (k / 10) * 1.3 * Math.PI; pts.push(V3(Math.cos(a) * 13.5 * s, 21 + Math.sin(a) * 12 * s, z)); }
      acc.geo(tube(pts, pts.map(() => 0.9), 5, C.bone));
    }
    for (const z of [-14, 2, 16]) acc.geo(ellipsoid(V3(0, 20, z), 5.2, 4.4, 6.0, { nr: 6, nv: 10, color: () => _c.set(PAL.gland), heat: () => [1, CH_GLAND], noise: 0.6 }));
    glands = buildShell(acc, shellD).glands;
    mk(acc.build(), body, BODY);
  }

  // ---------------- neck: thick folded hide from under the shell front
  const neck = new THREE.Group(); neck.position.copy(NECK).sub(BODY); body.add(neck);
  {
    const acc = new Acc(5);
    const rings = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const z = lerp(18, 41, t), y = lerp(21, 23.8, t) + Math.sin(t * Math.PI) * 1.2;
      const r = lerp(10.5, 8.6, t) * (i % 2 ? 0.95 : 1.0);
      rings.push({ c: V3(0, y, z), d: V3(0, 0.12, 1).normalize(), u: V3(1, 0, 0), w: r * 1.05, top: r, bot: r * 0.92, ex: 2.1 });
    }
    acc.geo(loft(rings, 16, {
      color: (t, a, P, i) => { const sa = Math.sin(a); const c = sa < -0.3 ? mix(C.hide, C.belly, (-sa - 0.3) * 1.6) : mix(C.hide, C.hideDark, sa); if (i % 2) c.multiplyScalar(0.82); return c.multiplyScalar(0.9 + noise3(P.x * 0.4, P.y * 0.4, P.z * 0.4) * 0.2); },
      noise: 0.5, nfreq: 0.22, seed: 5,
    }));
    // basalt scutes along the top of the neck (the carapace continues)
    for (let k = 0; k < 4; k++) {
      const sc = new THREE.DodecahedronGeometry(3.2 - k * 0.35, 0); sc.scale(1.5, 0.7, 1.2);
      sc.translate(0, 31.5 - k * 0.3 + Math.sin(k) * 0.3, 22 + k * 5.2);
      acc.geo(sc, { color: PAL.basalt });
    }
    mk(acc.build(), neck, NECK);
  }

  // ---------------- head: hooked basalt beak, frowning brow, eye slits, horn spikes, tusks (no snout disc)
  const head = new THREE.Group(); head.position.copy(HEAD).sub(NECK); neck.add(head);
  const jaw = new THREE.Group(); jaw.position.set(0, -2.2, 2.0); head.add(jaw);
  {
    const acc = new Acc(7);
    const sk = [
      { z: -4, w: 8.8, top: 7.2, bot: 6.2, dy: 0.0 },
      { z: 0, w: 10.2, top: 8.2, bot: 5.4, dy: 0.3 },
      { z: 5, w: 9.4, top: 7.4, bot: 4.2, dy: 0.2 },
      { z: 10, w: 7.6, top: 5.8, bot: 3.0, dy: -0.4 },
      { z: 15, w: 5.8, top: 4.6, bot: 2.4, dy: -1.0 },
      { z: 19.5, w: 4.3, top: 3.6, bot: 2.0, dy: -1.6 },
      { z: 23, w: 2.9, top: 2.8, bot: 2.1, dy: -2.7 },
      { z: 25.2, w: 1.5, top: 1.3, bot: 2.6, dy: -4.3 },
    ].map((r) => ({ ...r, c: V3(0, 0, r.z), d: V3(0, 0, 1), u: V3(1, 0, 0), ex: 2.7 }));
    acc.geo(loft(sk, 16, {
      // hide at the back of the skull, dark polished basalt over the brow and the whole beak
      color: (t, a, P) => {
        const sa = Math.sin(a);
        const beak = smooth(5, 13, P.z);
        const up = sa > -0.25;
        let c = sa < -0.2 ? mix(C.hide, C.hideMid, -sa) : mix(C.hide, C.hideDark, sa * 0.9);
        if (up) c = mix(c, mix(C.basalt, C.basaltHi, noise3(P.x * 0.7, P.y * 0.7, P.z * 0.7) * 0.6), Math.max(beak, smooth(4, 7, P.y)));
        else c = mix(c, C.basaltLo, beak * 0.7);
        return c.multiplyScalar(0.9 + noise3(P.x * 0.5, P.y * 0.5, P.z * 0.5) * 0.2);
      },
      noise: 0.3, nfreq: 0.35, seed: 7,
    }));
    // beak edge: a serrated basalt ridge along the upper jaw line + the hook tip
    for (const s of [-1, 1]) {
      const pts = [V3(s * 7.6, -1.6, 6), V3(s * 6.4, -2.0, 12), V3(s * 4.6, -2.4, 18), V3(s * 2.4, -3.4, 23), V3(s * 0.6, -5.6, 25.2)];
      acc.geo(tube(pts, [1.0, 0.95, 0.85, 0.7, 0.35], 5, C.basaltLo));
      for (let k = 0; k < 6; k++) { const p = new THREE.CatmullRomCurve3(pts).getPointAt(0.08 + k * 0.15); const tg = new THREE.ConeGeometry(0.75, 2.2, 4); tg.rotateX(Math.PI); tg.translate(p.x - s * 0.4, p.y - 1.2, p.z); acc.geo(tg, { color: PAL.tooth }); }
    }
    // slit nostrils high on the beak (small, angled, dark)
    for (const s of [-1, 1]) { const ns = new THREE.BoxGeometry(0.45, 0.4, 2.0); ns.rotateY(s * 0.35); ns.translate(s * 1.1, 1.85, 20.2); acc.geo(ns, { color: PAL.nostril }); }
    // one heavy frowning brow ridge: low in the middle, flaring up into swept-back horn spikes
    {
      const rings = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, x = lerp(-10.2, 10.2, t), c = Math.abs(t - 0.5) * 2;
        rings.push({ c: V3(x, 5.6 + 2.6 * c * c, 9.6 - 2.2 * c), d: V3(1, 0, 0), u: V3(0, 0, 1), w: 2.8 - 0.6 * c, top: 1.9, bot: 1.4, ex: 1.5 });
      }
      acc.geo(loft(rings, 6, { color: (t, a, P) => mix(C.basalt, C.basaltHi, noise3(P.x * 0.6, P.y * 0.6, P.z * 0.6) * 0.7), noise: 0.3, nfreq: 0.5, seed: 4 }));
    }
    for (const s of [-1, 1]) {
      acc.geo(tube([V3(s * 9.4, 7.4, 6.4), V3(s * 11.6, 9.4, 1.0), V3(s * 12.4, 11.2, -5.0), V3(s * 12.0, 12.4, -9.0)], [2.0, 1.5, 0.9, 0.15], 6, (t) => mix(C.basalt, C.basaltHi, t * 0.8)));
      acc.geo(tube([V3(s * 5.0, 8.6, -1.0), V3(s * 6.2, 10.6, -5.0), V3(s * 6.4, 11.6, -8.4)], [1.3, 0.8, 0.12], 5, C.basalt));
      // cheek scutes
      for (let k = 0; k < 3; k++) { const sc = new THREE.DodecahedronGeometry(1.7 - k * 0.3, 0); sc.scale(0.6, 1.0, 1.3); sc.translate(s * (9.6 - k * 0.8), 1.6 - k * 0.4, 2.0 + k * 3.0); acc.geo(sc, { color: PAL.basalt }); }
      // deep socket under the brow and a narrow glowing slit, inner corner low (angry)
      const sock = new THREE.SphereGeometry(1.6, 8, 6); sock.scale(1.5, 0.7, 0.9); sock.rotateZ(s * 0.35); sock.translate(s * 6.6, 4.6, 10.2);
      acc.geo(sock, { color: 0x0e0806 });
      const eye = new THREE.SphereGeometry(1, 8, 4); eye.scale(1.9, 0.32, 0.5); eye.rotateZ(s * 0.35); eye.translate(s * 6.8, 4.65, 10.75);
      acc.geo(eye, { color: 0x1a0d08, heat: [1, CH_EYE] });
    }
    // basalt helmet plate on the forehead with a glowing seam + a short crest of spikes
    acc.geo(ellipsoid(V3(0, 8.2, 2.6), 6.4, 2.4, 7.4, { nr: 8, nv: 12, color: (t, a, P) => mix(C.basalt, C.basaltHi, noise3(P.x * 0.4, P.y * 0.4, P.z * 0.4) * 0.8), noise: 0.35, seed: 9 }));
    acc.geo(ellipsoid(V3(0, 7.5, 2.6), 6.9, 1.6, 7.9, { nr: 6, nv: 12, color: () => C.crust, heat: () => [0.9, CH_MAGMA] }));
    for (let k = 0; k < 3; k++) { const sp = new THREE.ConeGeometry(1.5 - k * 0.3, 4.2 - k * 0.8, 5); sp.rotateX(-0.9); sp.translate(0, 10.0 - k * 0.6, -1.0 - k * 2.6); acc.geo(sp, { color: PAL.basaltHi }); }
    // mouth roof + glowing throat
    const roof = new THREE.PlaneGeometry(11, 21); roof.rotateX(Math.PI / 2); roof.translate(0, -1.9, 11.5);
    acc.geo(roof, { color: PAL.mouth, heat: [0.85, CH_WET] });
    const throat = new THREE.CircleGeometry(5.2, 10); throat.translate(0, -3.4, 0.5);
    acc.geo(throat, { color: PAL.mouth, heat: [1.0, CH_MAGMA] });
    mk(acc.build(), head, null);
  }
  {
    // lower jaw: heavy mandible ending in a basalt hook that meets the beak; boar tusks outside the beak
    const acc = new Acc(11);
    const jr = [
      { z: -2, w: 8.0, top: 1.0, bot: 5.0 }, { z: 3, w: 8.6, top: 1.0, bot: 5.2 }, { z: 9, w: 7.4, top: 1.0, bot: 4.0 },
      { z: 14, w: 5.8, top: 0.9, bot: 3.2 }, { z: 19, w: 4.2, top: 0.9, bot: 2.6 }, { z: 22.4, w: 2.4, top: 1.4, bot: 2.0, ex: 2.2 },
    ].map((r) => ({ ...r, c: V3(0, 0, r.z), d: V3(0, 0, 1), u: V3(1, 0, 0), ex: r.ex ?? 2.6 }));
    acc.geo(loft(jr, 14, {
      color: (t, a, P) => { const sa = Math.sin(a); const c = mix(C.hideMid, C.belly, -sa * 0.8); return mix(c, C.basaltLo, smooth(12, 20, P.z) * 0.85).multiplyScalar(0.88 + noise3(P.x * 0.5, P.y * 0.5, P.z * 0.5) * 0.24); },
      noise: 0.3, nfreq: 0.3, seed: 11,
    }));
    const floor = new THREE.PlaneGeometry(10, 20); floor.rotateX(-Math.PI / 2); floor.translate(0, 0.95, 10.5);
    acc.geo(floor, { color: PAL.mouth, heat: [0.85, CH_WET] });
    acc.geo(ellipsoid(V3(0, 1.4, 9.5), 3.4, 0.9, 7.6, { nr: 6, nv: 8, color: () => C.tongue, heat: () => [0.25, CH_WET] }));
    for (let k = 0; k < 5; k++) for (const s of [-1, 1]) {
      const tg = new THREE.ConeGeometry(0.6, 1.9, 4); tg.translate(s * lerp(6.6, 3.4, k / 4), 1.9, 6 + k * 3.0);
      acc.geo(tg, { color: PAL.tooth });
    }
    for (const s of [-1, 1]) {
      acc.geo(tube([V3(s * 6.0, 0.6, 15.0), V3(s * 7.8, 4.6, 16.6), V3(s * 10.0, 9.0, 15.2), V3(s * 11.0, 12.0, 11.0), V3(s * 10.4, 13.2, 7.4)], [1.7, 1.45, 1.05, 0.6, 0.1], 7, (t) => mix(C.ivoryBase, C.ivory, t * 3)));
    }
    mk(acc.build(), jaw, null);
  }

  // ---------------- legs: shoulder/hip mass, upper column, knee, lower column, elephant foot with nails
  const legs = [];
  for (const L of LEGS) {
    const hip = new THREE.Group(); hip.position.copy(L.p).sub(BODY); body.add(hip);
    const upLen = 9.0, loLen = 16.5 - upLen;
    const accU = new Acc(20 + L.side), accL = new Acc(30 + L.side);
    const hideCol = (t, a, P) => mix(C.hide, C.hideDark, 0.25 + 0.4 * t).multiplyScalar(0.86 + noise3(P.x * 0.35, P.y * 0.35, P.z * 0.35) * 0.28);
    accU.geo(ellipsoid(V3(-L.side * 0.6, 2.8, 0), 6.4, 7.6, 7.0, { nr: 8, nv: 12, color: hideCol, noise: 0.6, seed: L.side * 3 + (L.front ? 1 : 0) }));
    const ur = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5; const r = lerp(6.2, 4.8, t) * (1 + 0.06 * Math.sin(t * Math.PI));
      ur.push({ c: V3(0, -t * upLen, 0), d: V3(0, -1, 0), u: V3(1, 0, 0), w: r, h: r * 1.05, ex: 2 });
    }
    accU.geo(loft(ur, 12, { color: hideCol, noise: 0.45, nfreq: 0.3, seed: 4 + L.side }));
    const lr = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6; const r = lerp(4.9, 4.4, t) + Math.pow(t, 6) * 1.3;
      lr.push({ c: V3(0, 0.5 - t * (loLen - 1.4), 0), d: V3(0, -1, 0), u: V3(1, 0, 0), w: r, h: r, ex: 2, nk: 1 - t * 0.5 });
    }
    accL.geo(loft(lr, 12, { color: (t, a, P) => { const c = hideCol(t, a, P); if (Math.abs(Math.sin(t * 22)) < 0.25) c.multiplyScalar(0.8); return c; }, noise: 0.4, nfreq: 0.35, seed: 6 + L.side }));
    // a domed, uneven sole (review 2 F5: the flat cylinder pad read as a round "pig snout" disc on the lying corpse)
    accL.geo(ellipsoid(V3(0, -loLen + 1.3, 0.5), 5.5, 2.0, 6.0, { nr: 8, nv: 10, color: (t, a, P) => mix(C.hideDark, C.basaltLo, 0.5).multiplyScalar(0.8 + noise3(P.x * 0.6, P.y * 0.6, P.z * 0.6) * 0.4), noise: 0.9, seed: 9 + L.side }));
    for (let k = 0; k < 5; k++) {
      const a = (k - 2) * 0.42 + Math.PI / 2;
      const nail = new THREE.ConeGeometry(1.1, 2.2, 5); nail.rotateX(Math.PI / 2 + 0.3);
      nail.translate(Math.cos(a) * 5.6, -loLen + 1.1, Math.sin(a) * 5.6 + 0.6);
      accL.geo(nail, { color: PAL.nail });
    }
    if (L.front) for (let k = 0; k < 4; k++) {
      const sc = new THREE.DodecahedronGeometry(1.8 - k * 0.15, 0); sc.scale(1.3, 1.0, 0.6);
      sc.translate((k % 2 - 0.5) * 2.2, -1.5 - k * 1.7, 4.4 - k * 0.1);
      accL.geo(sc, { color: PAL.basalt });
    }
    const upper = mk(accU.build(), hip, null);
    const knee = new THREE.Group(); knee.position.y = -upLen; hip.add(knee);
    const lower = mk(accL.build(), knee, null);
    legs.push({ ...L, hip, knee, upper, lower, loLen });
  }

  // ---------------- tail: short and thick, a few basalt scutes
  const tail = new THREE.Group(); tail.position.copy(TAIL).sub(BODY); body.add(tail);
  {
    const acc = new Acc(13);
    const pts = [V3(0, 15.5, -27), V3(0, 13.5, -37), V3(0, 10.5, -45), V3(0, 7.5, -52)];
    acc.geo(tube(pts, [5.6, 4.4, 2.7, 0.5], 10, (t) => mix(C.hide, C.hideDark, t)));
    for (let k = 0; k < 5; k++) {
      const p = new THREE.CatmullRomCurve3(pts).getPointAt(0.1 + k * 0.17);
      const sc = new THREE.DodecahedronGeometry(2.3 - k * 0.38, 0); sc.scale(1.2, 0.7, 1.4); sc.translate(p.x, p.y + 3.9 - k * 0.75, p.z);
      acc.geo(sc, { color: PAL.basalt });
    }
    mk(acc.build(), tail, TAIL);
  }

  // ------------------------------------------------------------------------------------ pose
  function setPose(p) {
    body.position.set(0, BODY.y + (p.y ?? 0), p.z ?? 0);
    body.rotation.set(p.pitch ?? 0, p.yaw ?? 0, p.roll ?? 0, 'YXZ');
    const b = p.breath ?? 0;
    body.scale.set(1 + 0.008 * b, 1 + 0.014 * b, 1);
    const n = p.neck || [0, 0, 0], h = p.head || [0, 0, 0];
    neck.rotation.set(n[0], n[1], n[2], 'YXZ');
    head.rotation.set(h[0], h[1], h[2], 'YXZ');
    jaw.rotation.x = p.jaw ?? 0.05;
    for (const L of legs) {
      const a = (p.legs && p.legs[L.name]) || [0, 0, 0];
      L.hip.rotation.set(a[0], 0, a[1] * L.side, 'ZXY');
      L.knee.rotation.set(a[2], 0, 0);
    }
    const t = p.tail || [0, 0];
    tail.rotation.set(t[0], t[1], 0);
  }
  // the cooled corpse keeps bright seams so the shell plates read from the gameplay camera (review V6)
  const HOT = new THREE.Color(1.0, 0.36, 0.06).multiplyScalar(4.6), COOL = new THREE.Color(0.95, 0.27, 0.05).multiplyScalar(2.9);
  const HOT_M = new THREE.Color(0.35, 1.0, 0.42).multiplyScalar(4.0), COOL_M = new THREE.Color(0.12, 0.55, 0.22).multiplyScalar(2.0);
  // heat: 1 alive, 0 cooled corpse; mutant: green magma
  function setHeat(alive, k, mutant) {
    U.uEye.value = alive ? 1 : 0; U.uPulseAmt.value = alive ? 1 : 0; U.uMutant.value = mutant ? 1 : 0;
    U.uHotCol.value.copy(mutant ? COOL_M : COOL).lerp(mutant ? HOT_M : HOT, k);
    U.uGlandCol.value.setRGB(mutant ? 0.3 : 1.0, mutant ? 1.0 : 0.24, mutant ? 0.35 : 0.03).multiplyScalar(2.4);
    U.uEyeCol.value.setRGB(mutant ? 0.5 : 1.0, mutant ? 1.0 : 0.42, mutant ? 0.4 : 0.08).multiplyScalar(3.4);
  }

  // ------------------------------------------------------------------------------------ queries
  function worldPoint(name, out = new THREE.Vector3()) {
    group.updateMatrixWorld(true);
    if (name === 'head') return head.localToWorld(out.set(0, 3, 10));
    if (name === 'snout') return head.localToWorld(out.set(0, -2, 24.5));
    if (name === 'mouth') return head.localToWorld(out.set(0, -3.0, 15));
    if (name === 'jawTip') return jaw.localToWorld(out.set(0, -1, 21));
    if (name === 'eye') return head.localToWorld(out.set(6.8, 4.6, 10.8));
    if (name === 'brow') return head.localToWorld(out.set(0, 8, 6));
    if (name === 'shellTop') return body.localToWorld(out.set(0, 42 - BODY.y, -1));
    return out;
  }
  function hullPoints(stride = 9) {
    group.updateMatrixWorld(true);
    const out = [];
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const p = o.geometry.attributes.position;
      for (let i = 0; i < p.count; i += stride) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
    });
    return out;
  }
  // bake the current pose into one geometry in GROUP space (group must be at identity); fills aCarve.x = u
  // (0 at the snout tip .. 1 at the tail tip along local z) and returns { geo, zMin, zMax, ... }
  function bakeGeometry() {
    group.position.set(0, 0, 0); group.rotation.set(0, 0, 0); group.scale.set(1, 1, 1);
    group.updateMatrixWorld(true);
    const acc = new Acc(99);
    const ginv = new THREE.Matrix4().copy(group.matrixWorld).invert();
    root.traverse((o) => { if (o.isMesh) acc.geo(o.geometry, { matrix: new THREE.Matrix4().multiplyMatrices(ginv, o.matrixWorld), jitter: 0 }); });
    const geo = acc.build();
    const p = geo.attributes.position, k = geo.attributes.aCarve;
    let zMin = 1e9, zMax = -1e9, xMin = 1e9, xMax = -1e9, yMin = 1e9, yMax = -1e9;
    for (let i = 0; i < p.count; i++) { const z = p.getZ(i), x = p.getX(i), y = p.getY(i); if (z < zMin) zMin = z; if (z > zMax) zMax = z; if (x < xMin) xMin = x; if (x > xMax) xMax = x; if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
    for (let i = 0; i < p.count; i++) k.setX(i, (zMax - p.getZ(i)) / (zMax - zMin));
    geo.computeBoundingSphere();
    return { geo, zMin, zMax, xMin, xMax, yMin, yMax, glands: glands.map((g) => body.localToWorld(g.p.clone().sub(BODY)).applyMatrix4(ginv)) };
  }

  setPose(standPose(0));
  return {
    group, root, body, neck, head, jaw, legs, tail, U, CU, mat, BODY,
    setPose, setHeat, worldPoint, hullPoints, bakeGeometry,
    plateCentre(k, out = new THREE.Vector3()) { return body.localToWorld(out.copy(shellD.seedPt[k]).sub(BODY)); },
    plateCount: SEEDS.length,
  };
}

// ------------------------------------------------------------------------------------ poses
// Walking / fighting pose. phase radians; lunge 0..1 pushes head forward; roar opens the jaw.
// snap: head knocked sideways by a punch (0..1), stagger: body reels away (0..1).
export function standPose(phase = 0, { lunge = 0, roar = 0, snap = 0, stagger = 0, breath = null, turn = 0 } = {}) {
  const s1 = Math.sin(phase), s2 = Math.sin(phase + Math.PI);
  const br = breath ?? Math.sin(phase * 0.5);
  const st = stagger;
  return {
    y: -0.6 * Math.abs(s1) * 0.5 - st * 1.4, z: 0,
    pitch: -0.02 + lunge * 0.05 + st * 0.03, roll: Math.sin(phase) * 0.015 - st * 0.07, yaw: turn * 0.1 - st * 0.06,
    breath: br,
    neck: [0.06 + lunge * 0.12 - roar * 0.08 + st * 0.05, turn * 0.25 - snap * 0.32, -snap * 0.14],
    head: [0.02 + lunge * 0.06 - roar * 0.22 - snap * 0.1, turn * 0.15 - snap * 0.55, -snap * 0.42],
    jaw: 0.06 + 0.55 * roar + 0.25 * snap,
    legs: {
      FL: [s1 * 0.22 - lunge * 0.18, 0.04 + st * 0.12, Math.max(0, -s1) * 0.35],
      FR: [s2 * 0.22 - lunge * 0.06 + st * 0.15, 0.04, Math.max(0, -s2) * 0.35],
      HL: [s2 * 0.18, 0.03, -Math.max(0, s2) * 0.3],
      HR: [s1 * 0.18, 0.03 + st * 0.1, -Math.max(0, s1) * 0.3],
    },
    tail: [0.05 + Math.sin(phase * 0.5) * 0.05, Math.sin(phase * 0.7) * 0.12 + st * 0.2],
  };
}

// Dead on its side. The caller rolls the root by `roll` (left side up). Legs stay roughly parallel
// and stick out horizontally (stiff), front legs reaching forward and hind legs back; the lower pair is
// pressed along the ground. The neck turns the face toward `look` and the jaw hangs open.
export function corpsePose({ roll = 1.25, neck = [0.0, 0.0, 0.0], head = [0, 0, -0.5], jaw = 0.62, side = 1 } = {}) {
  // side = +1: rolled onto its right side (left legs up); side = -1: mirrored
  const up = 1.85 - roll, low = roll - 1.5;
  const U = { F: [-0.95, up - 0.12, 0.15], H: [0.85, up - 0.1, -0.2] }, D = { F: [-0.6, low, 0.45], H: [0.55, low, -0.45] };
  const m = (a) => [a[0], side * a[1], side * a[2]];
  return {
    y: 0, pitch: 0, roll: 0, yaw: 0, breath: 0,
    neck: m(neck), head: m(head), jaw,
    legs: side > 0 ? { FL: U.F, HL: U.H, FR: D.F, HR: D.H } : { FR: U.F, HR: U.H, FL: D.F, HL: D.H },
    tail: [-0.1, 0.25 * side],
  };
}
