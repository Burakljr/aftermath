// Magmadon: original procedural kaiju, a banded lava bull (~125 m prow to tail, 40 m tall at the vents).
// One big idea: a long, low, bull-shouldered quadruped whose back is armoured with eight overlapping, arched basalt
// bands (pale worn rear lips, rust on the low flanks) with molten rock glowing in the seams BETWEEN them; a low row of
// stubby vent chimneys runs along the spine. The head is a heavy wedge snout that ends in a blunt basalt ram plate (a
// battering prow), small glowing eyes deep under a frowning brow ridge, a jaw seam that glows from inside, and a pair
// of thick ridged horns that sweep BACKWARD from behind the brow along the neck. Thick legs wear cooled lava sleeves;
// the tail is thick, banded and simply tapers. No shell dome, no tusks, no dorsal plates or spikes.
// When it dies the seams cool to a dull red and steam; carving lifts a band off and exposes a volcanic flesh bowl with
// a pale rib arch and, under some bands, the glowing magma gland (the prize).
//
// Everything is generated here: no model files. All parts share ONE material (vertex colour + a
// per-vertex heat channel), so the baked corpse is a single draw call.
// Every band carries its plate id and every vertex gets its position u along the body when the corpse is baked
// (aCarve), so the carving shader can lift bands and cut the body away district by district in ONE draw call (back
// faces show the flesh). v3 (monster redesign): the domed carapace, the hooked beak and the boar tusks are gone.
import * as THREE from 'three';
import { rng, noise3, clamp, lerp, smooth } from '../util.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;
const _c = new THREE.Color();

export const PAL = {
  // dark basalt greys with warm rust and pale ash highlights; magma in the seams (no turtle brown anywhere)
  basalt: 0x3f3b39, basaltHi: 0x8a837c, basaltLo: 0x211e1c, ash: 0xcac1b4, rust: 0x8e4b2c, rustDark: 0x5a3326,
  sulfur: 0xa08a4a, crust: 0x1a0b07,
  hideDark: 0x382d2a, hide: 0x4f403b, hideMid: 0x67514a, belly: 0x7e6a61, bellyFold: 0x5f4d45,
  horn: 0xd6ccbb, hornDark: 0x4c4440, toe: 0xc0b6a8, nostril: 0x140c0a,
  mouth: 0x3c100c, gum: 0x6e2c27, tongue: 0x8a4446, tooth: 0xd2c6ae,
  // the inside under the bands reads volcanic (basalt layers, pale mineral, magma veins), never as red meat (DESIGN §8/§13)
  flesh: 0x4e4038, fleshLight: 0x7a6656, fleshDeep: 0x231b18, fat: 0xb8a68a, bone: 0xdccfb2, gland: 0xff8a2a,
};
// heat channel (aHeat.y): 0 magma (cools on death), 1 eyes (off when dead), 2 gland (always hot), 3 wet flesh
const CH_MAGMA = 0, CH_EYE = 1, CH_GLAND = 2, CH_WET = 3;

// ------------------------------------------------------------------------------------ material
const CARVE_PARS = /* glsl */`
uniform vec4 uPart[3]; uniform float uPlateGone[20]; uniform float uCarveOn, uCutScale;
varying vec2 vCarve; varying vec3 vLPc;
float gCut = 1000.0, gPartW = 0.0;
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
      gPartW = P.w;
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
      // the seams of a district's part cool down as it is carved (polish A3)
      e = uHotCol * h * h * uHeat * mix(smoulder, pulse, uPulseAmt) * (1.0 - 0.7 * min(gPartW, 1.0));
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
  m.customProgramCacheKey = () => 'magmadon-v3b';
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
  m.customProgramCacheKey = () => 'magmadon-depth-v3a';
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

// mouth roof / floor: a trapezoid from z0 (half width w0) to z1 (half width w1) at height y, its middle line offset by
// sag (a trough or a vault), faces toward +y (up = 1) or -y (up = -1); 3 x 4 vertices, 12 triangles
function mouthPlate(y, z0, z1, w0, w1, sag, up) {
  const pos = [], idx = [];
  for (let r = 0; r < 4; r++) {
    const t = r / 3, z = lerp(z0, z1, t), w = lerp(w0, w1, t);
    pos.push(-w, y, z, 0, y + sag * Math.sin(Math.PI * Math.min(1, t * 1.25 + 0.1)), z, w, y, z);
  }
  for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
    const a = r * 3 + c, b = a + 1, d = a + 3, e = a + 4;
    if (up > 0) idx.push(a, d, b, b, d, e); else idx.push(a, b, d, b, e, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
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


// ------------------------------------------------------------------------------------ sections
// A body part is lofted from a section table: rows [z, topY, botY, halfWidth] in rest space, Catmull-Rom between the
// rows. The section at z is a superellipse (exponent ex) around a centre line cy = botY + (topY - botY) * mid.
// phi is the angle around the section: 0 = +x flank, 90 deg = top (spine), 180 deg = -x flank, 270 deg = belly.
function crInterp(rows, col, z) {
  const n = rows.length;
  if (z <= rows[0][0]) return rows[0][col];
  if (z >= rows[n - 1][0]) return rows[n - 1][col];
  let i = 0;
  while (i < n - 2 && z > rows[i + 1][0]) i++;
  const t = (z - rows[i][0]) / (rows[i + 1][0] - rows[i][0]), t2 = t * t, t3 = t2 * t;
  const p0 = rows[Math.max(0, i - 1)][col], p1 = rows[i][col], p2 = rows[i + 1][col], p3 = rows[Math.min(n - 1, i + 2)][col];
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
function makeSec(rows, ex = 2.4, mid = 0.45) {
  rows = rows.slice().sort((a, b) => a[0] - b[0]);
  const s = { cy: 0, hw: 0, top: 0, bot: 0, ex };
  return (z) => {
    const T = crInterp(rows, 1, z), B = crInterp(rows, 2, z);
    s.cy = B + (T - B) * mid; s.top = T - s.cy; s.bot = s.cy - B; s.hw = Math.max(0.05, crInterp(rows, 3, z));
    return s;
  };
}
function secPt(sec, phi, z, o) {
  const s = sec(z), ca = Math.cos(phi), sa = Math.sin(phi), e = 2 / s.ex;
  return o.set(Math.sign(ca) * Math.pow(Math.abs(ca), e) * s.hw, s.cy + Math.sign(sa) * Math.pow(Math.abs(sa), e) * (sa > 0 ? s.top : s.bot), z);
}
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sc = new THREE.Vector3(), _sd = new THREE.Vector3();
// outward normal: d/dphi x d/dz
function secNrm(sec, phi, z, o) {
  secPt(sec, phi + 0.01, z, _sa); secPt(sec, phi - 0.01, z, _sb); _sa.sub(_sb);
  secPt(sec, phi, z + 0.05, _sc); secPt(sec, phi, z - 0.05, _sd); _sc.sub(_sd);
  return o.crossVectors(_sa, _sc).normalize();
}

// quad a-b-c-d (b = next phi, d = next row) emitted so its face points along `hint` (front faces carry the glow)
const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _fn = new THREE.Vector3();
const Z2 = [0, 0];
function quad(acc, a, b, c, d, ca, cb, cc, cd, ha, hb, hc, hd, hint, jit = 0.08) {
  _e1.subVectors(b, a); _e2.subVectors(c, a); _fn.crossVectors(_e1, _e2);
  if (_fn.dot(hint) >= 0) { acc.tri(a, b, c, ca, cb, cc, ha, hb, hc, jit); acc.tri(a, c, d, ca, cc, cd, ha, hc, hd, jit); }
  else { acc.tri(a, c, b, ca, cc, cb, ha, hc, hb, jit); acc.tri(a, d, c, ca, cd, cc, ha, hd, hc, jit); }
}
function triO(acc, a, b, c, ca, cb, cc, ha, hb, hc, hint, jit = 0.08) {
  _e1.subVectors(b, a); _e2.subVectors(c, a); _fn.crossVectors(_e1, _e2);
  if (_fn.dot(hint) >= 0) acc.tri(a, b, c, ca, cb, cc, ha, hb, hc, jit); else acc.tri(a, c, b, ca, cc, cb, ha, hc, hb, jit);
}
// phi in the band arc [phiA, phiB] (phiA may be negative)?
const inArc = (phi, A, B) => { const p = phi > Math.PI * 1.5 ? phi - Math.PI * 2 : phi; return p > A + 1e-4 && p < B - 1e-4; };

// Hide: a closed ring grid on a section from zs[0] to zs[last] (np quads around), skipping the quads `skip(phi, z)`
// covers (the banded part), with optional end caps.
function buildHide(acc, sec, zs, np, { color, heat = null, skip = null, noise = 0.8, nfreq = 0.2, fold = 0, caps = [true, true], jit = 0.08 }) {
  const P = [], N = [], Cl = [], H = [];
  zs.forEach((z, k) => {
    for (let i = 0; i < np; i++) {
      const phi = (i / np) * Math.PI * 2;
      const p = secPt(sec, phi, z, V3()), n = secNrm(sec, phi, z, V3());
      if (noise) p.addScaledVector(n, (noise3(p.x * nfreq, p.y * nfreq, p.z * nfreq) - 0.5) * noise * 2);
      if (fold && k % 2) p.addScaledVector(n, -fold);
      P.push(p); N.push(n); Cl.push(color(phi, z, p, k).clone()); H.push(heat ? heat(phi, z, p, k) : Z2);
    }
  });
  const at = (k, i) => k * np + (i % np);
  for (let k = 0; k < zs.length - 1; k++) for (let i = 0; i < np; i++) {
    if (skip && skip(((i + 0.5) / np) * Math.PI * 2, (zs[k] + zs[k + 1]) / 2)) continue;
    const a = at(k, i), b = at(k, i + 1), c = at(k + 1, i + 1), d = at(k + 1, i);
    quad(acc, P[a], P[b], P[c], P[d], Cl[a], Cl[b], Cl[c], Cl[d], H[a], H[b], H[c], H[d], N[a], jit);
  }
  for (const [k, sgn] of [[0, -1], [zs.length - 1, 1]]) {
    if (!caps[k === 0 ? 0 : 1]) continue;
    const s = sec(zs[k]), ctr = V3(0, s.cy, zs[k]), hint = V3(0, 0, sgn), cc = color(Math.PI * 1.5, zs[k], ctr, k).clone();
    for (let i = 0; i < np; i++) triO(acc, ctr, P[at(k, i)], P[at(k, i + 1)], cc, Cl[at(k, i)], Cl[at(k, i + 1)], Z2, Z2, Z2, hint);
  }
}

// Armour bands on a section. Each band {zA, zB, id, chim, gland} covers [zA, zB] along z and the arc [phiA, phiB]
// around the back; it is a raised slab: thin, rusty front edge tucked low, a bulging crest, a thicker pale worn rear
// lip that overhangs the seam behind it (o.ovh), walls down into the body whose foot glows (the magma seam), rounded
// band ends low on the flanks. Each band carries its plate id (the carving shader lifts it off).
const HOT_FOOT = [0.95, CH_MAGMA];
const LIP = mix(C.basaltHi, C.ash, 0.5);        // worn band lip: paler than basalt, darker than the horns
function buildBands(acc, sec, list, o, out) {
  const NP = o.NP, NW = o.NW, AT = (j, i) => j * (NP + 1) + i;
  const phiAt = (i) => o.phiA + (o.phiB - o.phiA) * (i / NP);
  const inner = (phi, z) => { const n = secNrm(sec, phi, z, V3()); return secPt(sec, phi, z, V3()).addScaledVector(n, -0.4); };
  for (const b of list) {
    acc.plate = b.id;
    const O = [], N = [], Cl = [], Ht = [], hk = b.hk ?? 1;
    for (let j = 0; j <= NW; j++) {
      const w = j / NW;
      for (let i = 0; i <= NP; i++) {
        const u = i / NP, phi = phiAt(i);
        // ragged band edges: the front and rear edges wander along the arc (broken rock, not a turned ring)
        const wobF = (noise3(phi * 2.2 + b.id * 7.3, b.id * 1.9, 0.5) - 0.5) * 2 * (o.wob ?? 0);
        const wobR = (noise3(phi * 2.2 + b.id * 3.1, b.id * 5.3, 2.5) - 0.5) * 2 * (o.wob ?? 0);
        const z = b.zB - w * (b.zB - b.zA), zo = z - o.ovh * w * w * w + (1 - w) * wobF + w * wobR;
        const p = secPt(sec, phi, zo, V3()), n = secNrm(sec, phi, zo, V3());
        const sp = Math.sin(phi), endK = smooth(0, 0.12, Math.min(u, 1 - u));
        // a flat-topped slab with chamfered edges, thicker at the overlapping rear lip, a raised keel along the spine
        const plate = smooth(0, 0.24, w) * smooth(1, 0.78, w);
        const prof = o.tf + (o.tr - o.tf) * Math.pow(w, 1.5) + o.crown * (b.crownK ?? 1) * (0.55 * plate + 0.45 * Math.pow(Math.sin(Math.PI * w), 0.8));
        const keel = (o.keel ?? 0) * Math.exp(-Math.pow((phi - Math.PI / 2) / 0.3, 2)) * (0.45 + 0.55 * plate);
        const rough = (noise3(p.x * 0.33 + b.id * 3.1, p.y * 0.33, p.z * 0.33) - 0.5) * 1.6 + (noise3(p.x * 0.9, p.y * 0.9 + b.id, p.z * 0.9) - 0.5) * 0.6;
        const t = prof * (0.76 + 0.24 * Math.max(0, sp)) * (0.8 + 0.2 * endK) + keel + rough * o.rough * (0.4 + 0.6 * endK);
        // colour: dark basalt, a little lighter on the crest and the keel, pale worn rear lip, dark rusty front edge,
        // warm rust low on the flanks. hk (per band) scales the contrast: the shoulder bands carry it, the rump and tail
        // bands are darker with narrower lips, so the head end reads first and the horns stay the palest element (F5);
        // darker crests also stay basalt grey under the warm TV key instead of turning tan (F6)
        const crest = plate * (0.4 + 0.6 * Math.max(0, sp));
        const pn = noise3(p.x * 0.11 + 4, p.y * 0.11, p.z * 0.11);
        const c = mix(C.basalt, C.basaltHi, clamp(crest * 0.32 * hk + (pn - 0.45) * 0.85 * (0.6 + 0.4 * hk) + keel * 0.1, 0, 1));
        c.lerp(LIP, smooth(1 - 0.24 * (0.5 + 0.5 * hk), 1.0, w) * (0.5 + 0.2 * hk));
        c.lerp(C.rustDark, (1 - smooth(0, 0.18, w)) * 0.5);
        c.lerp(C.rust, (1 - endK) * 0.45 + clamp((0.1 - sp) * 1.2, 0, 0.2));
        if (o.sulfur && Math.abs(phi - Math.PI / 2) < 0.35 && noise3(p.x * 0.3 + 20, p.y * 0.3, p.z * 0.3) > 0.66) c.lerp(C.sulfur, 0.5);
        let h = 0;
        if (o.cracks) {
          const cr = 1 - smooth(0.0, 0.03, Math.abs(noise3(p.x * 0.07 + b.id * 1.7, p.y * 0.07, p.z * 0.07) - 0.5));
          h = cr * smooth(0.14, 0.36, Math.min(w, 1 - w)) * endK * o.cracks;
        }
        O.push(p.addScaledVector(n, t)); N.push(n); Cl.push(c); Ht.push([h, CH_MAGMA]);
      }
    }
    for (let j = 0; j < NW; j++) for (let i = 0; i < NP; i++) {
      const a = AT(j, i), q = AT(j, i + 1), c = AT(j + 1, i + 1), d = AT(j + 1, i);
      quad(acc, O[a], O[q], O[c], O[d], Cl[a], Cl[q], Cl[c], Cl[d], Ht[a], Ht[q], Ht[c], Ht[d], N[a], 0.1);
    }
    // front (j = 0) and rear (j = NW) walls: their foot glows (the seam), the rear lip top is pale
    const topF = mix(C.basalt, C.rustDark, 0.45), topR = mix(C.basalt, LIP, 0.62 * (0.5 + 0.5 * hk));
    for (const [j, z, top, hz] of [[0, b.zB, topF, 1], [NW, b.zA, topR, -1]]) {
      const IN = []; for (let i = 0; i <= NP; i++) IN.push(inner(phiAt(i), z));
      const hint = V3(0, 0, hz);
      for (let i = 0; i < NP; i++) quad(acc, O[AT(j, i)], O[AT(j, i + 1)], IN[i + 1], IN[i], top, top, C.crust, C.crust, Z2, Z2, HOT_FOOT, HOT_FOOT, hint, 0.12);
    }
    // band ends low on the flanks
    for (const i of [0, NP]) {
      const zm = (b.zA + b.zB) / 2, phi = phiAt(i);
      const hint = secPt(sec, phi + (i === 0 ? -0.25 : 0.25), zm, V3()).sub(secPt(sec, phi, zm, _sa));
      const IN = []; for (let j = 0; j <= NW; j++) IN.push(inner(phi, b.zB - (j / NW) * (b.zB - b.zA)));
      for (let j = 0; j < NW; j++) quad(acc, O[AT(j, i)], O[AT(j + 1, i)], IN[j + 1], IN[j], C.basalt, C.basalt, C.hideDark, C.hideDark, Z2, Z2, Z2, Z2, hint, 0.12);
    }
    // underside: the band reads as a solid slab through a cut
    const NU = Math.max(2, NP >> 2), U0 = [], U1 = [];
    for (let k = 0; k <= NU; k++) { const phi = o.phiA + (o.phiB - o.phiA) * (k / NU); U0.push(inner(phi, b.zB)); U1.push(inner(phi, b.zA)); }
    for (let k = 0; k < NU; k++) {
      const hint = secNrm(sec, o.phiA + (o.phiB - o.phiA) * ((k + 0.5) / NU), (b.zA + b.zB) / 2, V3()).negate();
      quad(acc, U0[k], U0[k + 1], U1[k + 1], U1[k], C.fleshDeep, C.fleshDeep, C.fleshDeep, C.fleshDeep, Z2, Z2, Z2, Z2, hint, 0.15);
    }
    const centre = O[AT(NW >> 1, NP >> 1)].clone();
    out.plates.push({ id: b.id, owner: out.owner, p: centre });
    for (let i = 0; i <= NP; i++) for (let j = 0; j <= NW; j++) if (O[AT(j, i)].y > out.top.y) out.top.copy(O[AT(j, i)]);
    // a stubby vent chimney on the spine: truncated, wide, open, glowing inside (a vent, not a spike)
    if (b.chim) {
      const k = AT(Math.round(NW * 0.4), NP >> 1), p0 = O[k];
      const d = N[k].clone().add(V3(0, 0, -0.14)).normalize(), u = V3(1, 0, 0);
      const { h, rb } = b.chim, rt = rb * 0.62;
      const R = [[-1.2, rb * 1.18, 0.5], [h * 0.35, rb * 0.86, 1.0], [h * 0.8, rt * 1.12, 0.8], [h, rt, 0.4], [h - 0.35, rt * 0.6, 0.2], [h - 1.4, rt * 0.3, 0]];
      acc.geo(loft(R.map(([y, r, nk]) => ({ c: p0.clone().addScaledVector(d, y), d, u, w: r, h: r, ex: 2, nk })), 8, {
        color: (t, a, P, i) => (i >= 4 ? C.crust : i === 3 ? mix(C.ash, C.sulfur, 0.45) : mix(C.basalt, C.basaltHi, 0.12 + i * 0.12 + noise3(P.x * 0.5, P.y * 0.5, P.z * 0.5) * 0.3)),
        heat: (t, a, P, i) => (i >= 4 ? [1.0, CH_MAGMA] : i === 3 ? [0.3, CH_MAGMA] : Z2),
        noise: 0.35, nfreq: 0.5, seed: b.id, caps: [false, true],
      }));
      out.chimneys.push({ owner: out.owner, p: p0.clone().addScaledVector(d, h + 0.6), id: b.id });
    }
  }
  acc.plate = 0;
}

// Glowing magma seams: a crust strip under each gap between bands. ranges [zLo, zHi, idLo, idHi] overlap under the band
// edges; the tail-side half of a strip carries idLo and the head-side half idHi (the plate ids of the bands on either
// side), so a lifted band takes its half of each seam with it and the bowl under it shows from seam middle to seam middle
// (monster fix F1: lit seams framed every opened bowl with two bright crescents)
function buildSeams(acc, sec, ranges, o) {
  const NP = o.NP, glowN = (p) => 0.8 + 0.4 * noise3(p.x * 0.12, p.y * 0.12, p.z * 0.12 + 5);
  for (const [zLo, zHi, idLo = 0, idHi = idLo] of ranges) {
    const zs = [zLo, (zLo + zHi) / 2, zHi], P = [], N = [], H = [];
    zs.forEach((z, r) => {
      for (let i = 0; i <= NP; i++) {
        const phi = o.phiA + (o.phiB - o.phiA) * (i / NP), n = secNrm(sec, phi, z, V3());
        const p = secPt(sec, phi, z, V3()).addScaledVector(n, -0.25);
        P.push(p); N.push(n); H.push([(r === 1 ? 1.0 : 0.75) * glowN(p), CH_MAGMA]);
      }
    });
    const AT = (r, i) => r * (NP + 1) + i;
    for (let r = 0; r < 2; r++) {
      acc.plate = r === 0 ? idLo : idHi;
      for (let i = 0; i < NP; i++) {
        const a = AT(r, i), b = AT(r, i + 1), c = AT(r + 1, i + 1), d = AT(r + 1, i);
        quad(acc, P[a], P[b], P[c], P[d], C.crust, C.crust, C.crust, C.crust, H[a], H[b], H[c], H[d], N[a], 0.1);
      }
    }
  }
  acc.plate = 0;
}

// Under every band (hidden until it is lifted): a volcanic flesh bowl from seam middle to seam middle ([b.lo, b.hi]),
// a pale rib arch across its tail-side half and, for bands with b.gland, the glowing magma gland (the prize) on the
// head-side half. The gland sits on the flank at o.gPhi (monster fix F1: at the spine, phi 90 deg, it faced away from
// the gameplay camera on the rolled carcass; at ~18 deg it faces the sky and the camera), its top kept under the band.
function buildUnder(acc, sec, list, o, glands) {
  acc.plate = 0;
  const NPf = o.NPf, NWf = o.NWf, AT = (j, i) => j * (NPf + 1) + i;
  const phiAt = (u) => o.phiA + (o.phiB - o.phiA) * u;
  const depAt = (u, v) => o.depth * Math.pow(Math.sin(Math.PI * u), 0.5) * Math.pow(Math.sin(Math.PI * v), 0.6);
  for (const b of list) {
    const zLo = b.lo ?? b.zA, zHi = b.hi ?? b.zB, len = zHi - zLo;
    const F = [], Fc = [], N = [];
    for (let j = 0; j <= NWf; j++) {
      const v = j / NWf, z = zHi - v * len;
      for (let i = 0; i <= NPf; i++) {
        const u = i / NPf, phi = phiAt(u), n = secNrm(sec, phi, z, V3()), base = secPt(sec, phi, z, V3());
        const dep = depAt(u, v);
        const nn = noise3(base.x * 0.3, base.y * 0.3 + 7, base.z * 0.3), n2 = noise3(base.x * 0.9, base.y * 0.9, base.z * 0.9 + 3);
        F.push(base.addScaledVector(n, -0.35 - dep + (nn - 0.5) * 1.2 * smooth(0, 1.5, dep))); N.push(n);
        const cl = dep < 0.55 ? mix(C.fat, C.fleshLight, dep / 0.55) : mix(C.fleshLight, C.flesh, (dep - 0.55) / 1.2).lerp(C.fleshDeep, smooth(2.5, 5.0, dep) * 0.6);
        if (n2 > 0.64 && dep > 0.6) cl.lerp(C.fat, 0.5);
        Fc.push(cl.multiplyScalar(0.85 + nn * 0.3));
      }
    }
    const WET = [0, CH_WET];
    for (let j = 0; j < NWf; j++) for (let i = 0; i < NPf; i++) {
      const a = AT(j, i), q = AT(j, i + 1), c = AT(j + 1, i + 1), d = AT(j + 1, i);
      quad(acc, F[a], F[q], F[c], F[d], Fc[a], Fc[q], Fc[c], Fc[d], WET, WET, WET, WET, N[a], 0.12);
    }
    const zr = b.gland ? zLo + len * 0.24 : (zLo + zHi) / 2, vr = (zHi - zr) / len, pts = [];
    for (let k = 0; k <= 6; k++) {
      const u = 0.1 + 0.8 * (k / 6), phi = phiAt(u);
      pts.push(secPt(sec, phi, zr, V3()).addScaledVector(secNrm(sec, phi, zr, V3()), -0.35 - depAt(u, vr) * 0.55));
    }
    acc.geo(tube(pts, pts.map((_, k) => o.rib * (0.6 + 0.4 * Math.sin((k / 6) * Math.PI))), 5, C.bone));
    if (b.gland) {
      const gz = zLo + len * 0.6, gu = (o.gPhi - o.phiA) / (o.phiB - o.phiA), gk = b.gland;
      const gp = secPt(sec, o.gPhi, gz, V3()).addScaledVector(secNrm(sec, o.gPhi, gz, V3()), -0.35 - depAt(gu, 0.4) + o.gLift * gk);
      acc.geo(ellipsoid(gp, 3.4 * gk, 3.6 * gk, Math.min(3.0, len * 0.3) * gk, { nr: 6, nv: 8, color: () => _c.set(PAL.gland), heat: () => [1, CH_GLAND], noise: 0.3 }));
      glands.push(gp.clone());
    }
  }
}

// ------------------------------------------------------------------------------------ shape tables (rest space)
// LY lifts the whole body onto longer legs (a bull's stance, not a crawling reptile's)
const LY = 4;
const up = (rows) => rows.map(([z, t, b, w]) => [z, t + LY, b + LY, w]);
// trunk: long and low-slung, a deep chest and a bull's shoulder hump over the front legs, a tucked belly, sloping to the rump
const TRUNK = makeSec(up([
  [-47, 20.0, 16.0, 3.5], [-44, 23.5, 14.4, 9.0], [-39, 26.5, 13.4, 12.6], [-31, 28.6, 13.0, 15.0], [-20, 30.4, 13.2, 16.2],
  [-8, 32.6, 12.8, 17.0], [3, 36.4, 11.6, 17.8], [13, 39.6, 10.2, 18.4], [21, 38.8, 10.0, 17.6], [28, 35.2, 11.4, 15.4],
  [34, 30.8, 13.6, 12.0], [38.5, 26.5, 16.2, 7.4], [41, 23.5, 18.5, 3.0],
]), 2.4, 0.45);
const NECKS = makeSec(up([[20, 34.0, 11.0, 11.4], [28, 33.6, 11.6, 10.8], [34, 32.8, 12.6, 10.0], [40, 31.6, 14.0, 9.2], [44, 30.4, 15.0, 8.6]]), 2.2, 0.5);
const TAILS = makeSec(up([
  [-33, 24.0, 11.0, 8.6], [-38, 23.0, 11.4, 8.3], [-43, 21.2, 11.2, 7.3], [-48, 18.8, 10.4, 6.0], [-52, 16.4, 9.6, 4.7],
  [-55.5, 14.2, 8.8, 3.4], [-58.5, 12.2, 8.2, 2.2], [-60.5, 10.6, 8.0, 1.0],
]), 2.2, 0.45);
// head-local skull: a long, low wedge, broad at the jaw muscles, descending to a blunt snout under the ram plate
const SKULL = makeSec([
  [-6, 11.8, -6.8, 8.6], [-1, 13.0, -7.0, 10.2], [4, 11.8, -5.6, 10.6], [9, 9.0, -4.0, 9.6], [14, 6.8, -3.2, 8.2],
  [18, 5.8, -2.9, 6.8], [21.5, 5.2, -2.8, 5.6], [23, 4.4, -2.6, 4.8],
], 3.0, 0.5);

// eight back bands between the boundaries ZB (seam middles); chimneys on the six middle bands; a magma gland under every
// band (a big one under every second band, a small one between), so each carve step that lifts a band opens onto one
// (monster fix F1)
const ZB = [-40, -32.5, -24.5, -16, -7, 2.5, 12.5, 22.5, 32], GAP = 2.6;
const CHIM = [null, { h: 2.6, rb: 2.8 }, { h: 2.9, rb: 3.0 }, { h: 3.2, rb: 3.2 }, { h: 3.4, rb: 3.4 }, { h: 3.4, rb: 3.4 }, { h: 3.0, rb: 3.1 }, null];
const BACK = ZB.slice(0, -1).map((z, i) => ({ zA: z + GAP / 2, zB: ZB[i + 1] - GAP / 2, lo: z, hi: ZB[i + 1], id: i + 1, chim: CHIM[i], gland: i % 2 === 1 ? 1.12 : 0.62, crownK: 0.75 + 0.5 * Math.sin((i / 7) * Math.PI * 0.8), hk: 0.45 + 0.55 * (i / 7) }));
const BACK_ARC = { phiA: -20 * D2R, phiB: 200 * D2R };
const COLLAR = [{ zA: 31.5, zB: 37.5, id: 9, hk: 0.75 }];
const COLLAR_ARC = { phiA: -5 * D2R, phiB: 185 * D2R };   // O3: ends above the shoulders (no glowing arch around the head)
const TAILB = [[-38.6, -42.6], [-43.3, -46.9], [-47.6, -50.8], [-51.5, -54.2], [-54.9, -57.2]].map(([zB, zA], k) => ({ zA, zB, id: 10 + k, hk: 0.3 }));
TAILB.forEach((b, k) => { b.hi = k === 0 ? b.zB : (TAILB[k - 1].zA + b.zB) / 2; b.lo = k === TAILB.length - 1 ? b.zA : (b.zA + TAILB[k + 1].zB) / 2; });
const TAIL_ARC = { phiA: -30 * D2R, phiB: 210 * D2R };
export const BANDS = { back: BACK.length, collar: COLLAR.length, tail: TAILB.length, count: BACK.length + COLLAR.length + TAILB.length };

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
  const mk = (geo, parent, pivot) => {
    if (pivot) geo.translate(-pivot.x, -pivot.y, -pivot.z);
    const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };

  // pivots in rest space (ground y = 0, +z forward)
  const BODY = V3(0, 19 + LY, 0), NECK = V3(0, 21.5 + LY, 27), HEAD = V3(0, 22.5 + LY, 38), TAIL = V3(0, 16.5 + LY, -37);
  const HIPY = 15.5 + LY, LEGLEN = HIPY + 1;
  const LEGS = [
    { name: 'FL', side: 1, front: true, p: V3(14.2, HIPY, 19) }, { name: 'FR', side: -1, front: true, p: V3(-14.2, HIPY, 19) },
    { name: 'HL', side: 1, front: false, p: V3(13.6, HIPY, -21) }, { name: 'HR', side: -1, front: false, p: V3(-13.6, HIPY, -21) },
  ];
  const glands = [];
  const info = { plates: [], chimneys: [], top: V3(0, -1e9, 0), owner: null };
  const bandSkip = (arc, z0, z1) => (phi, z) => z > z0 && z < z1 && inArc(phi, arc.phiA, arc.phiB);
  const hideCol = (phi, z, P, k) => {
    const sa = Math.sin(phi);
    const c = sa < -0.3 ? mix(C.hideMid, C.belly, (-sa - 0.3) * 1.6) : mix(C.hideMid, C.hide, (sa + 0.3) * 1.2);
    if (k % 2) c.lerp(C.bellyFold, 0.35);
    return c.multiplyScalar(0.9 + noise3(P.x * 0.3, P.y * 0.3, P.z * 0.3) * 0.2);
  };

  // ---------------- trunk: belly hide, the eight back bands, magma seams, flesh under the bands, the inside
  const body = new THREE.Group(); body.position.copy(BODY); root.add(body);
  {
    const acc = new Acc(3);
    info.owner = body;
    const zs = [-47, -45.4, -43.2, -41.4, -40];
    for (let z = -36; z <= 32; z += 4) zs.push(z);
    zs.push(34.5, 37, 39.2, 41);
    buildHide(acc, TRUNK, zs, 36, { color: hideCol, skip: bandSkip(BACK_ARC, ZB[0], ZB[8]), noise: 0.45, nfreq: 0.18, fold: 0.35 });
    const PB = { ...BACK_ARC, NP: 26, NW: 6, tf: 0.6, tr: 2.8, crown: 1.5, ovh: 0.35, keel: 1.5, wob: 0.9, rough: 1.2, cracks: 0.7, sulfur: true };
    buildBands(acc, TRUNK, BACK, PB, info);
    const BL = BACK[BACK.length - 1], seams = [[ZB[0], BACK[0].zA + 0.6, BACK[0].id, BACK[0].id]];
    for (let i = 0; i < BACK.length - 1; i++) seams.push([BACK[i].zB - 0.6, BACK[i + 1].zA + 0.6, BACK[i].id, BACK[i + 1].id]);
    seams.push([BL.zB - 0.6, ZB[8], BL.id, BL.id]);
    buildSeams(acc, TRUNK, seams, PB);
    buildUnder(acc, TRUNK, BACK, { ...BACK_ARC, NPf: 18, NWf: 4, depth: 4.2, rib: 1.05, gPhi: 18 * D2R, gLift: 0.7 }, glands);
    // inside the body (seen only through a carving cut): spine, rib hoops, three magma glands
    acc.geo(tube([V3(0, 27 + LY, -42), V3(0, 29.5 + LY, -20), V3(0, 31.5 + LY, 2), V3(0, 31 + LY, 22), V3(0, 27 + LY, 34)], [2.0, 2.6, 2.6, 2.6, 2.0], 7, C.bone));
    for (const z of [-32, -22, -12, -2, 8, 18, 27]) {
      const pts = [];
      for (let k = 0; k <= 5; k++) { const s = TRUNK(z), phi = (-25 + (k / 5) * 230) * D2R; const p = secPt(TRUNK, phi, z, V3()); pts.push(V3(p.x * 0.8, s.cy + (p.y - s.cy) * 0.8, z)); }
      acc.geo(tube(pts, pts.map(() => 0.9), 4, C.bone));
    }
    for (const z of [-18, -2, 14]) acc.geo(ellipsoid(V3(0, TRUNK(z).cy - 1, z), 5.2, 4.4, 6.0, { nr: 6, nv: 10, color: () => _c.set(PAL.gland), heat: () => [1, CH_GLAND], noise: 0.6 }));
    mk(acc.build(), body, BODY);
  }

  // ---------------- neck: folded hide from under the shoulders with one collar band
  const neck = new THREE.Group(); neck.position.copy(NECK).sub(BODY); body.add(neck);
  {
    const acc = new Acc(5);
    info.owner = neck;
    buildHide(acc, NECKS, [20, 24, 28, 31.5, 34.5, 37.5, 41, 44], 24, { color: hideCol, skip: bandSkip(COLLAR_ARC, 31.5, 37.5), noise: 0.5, nfreq: 0.22, fold: 0.4, caps: [false, false] });
    const PC = { ...COLLAR_ARC, NP: 18, NW: 5, tf: 0.6, tr: 2.4, crown: 1.2, ovh: 0.8, keel: 1.0, wob: 0.6, rough: 0.9, cracks: 0.5 };
    buildBands(acc, NECKS, COLLAR, PC, info);
    buildSeams(acc, NECKS, [[31.5, 32.4, 9], [36.6, 37.5, 9]], PC);
    buildUnder(acc, NECKS, COLLAR, { ...COLLAR_ARC, NPf: 12, NWf: 3, depth: 2.4, rib: 0.8 }, glands);
    mk(acc.build(), neck, NECK);
  }

  // ---------------- head: wedge snout + ram prow, brow ridge, deep-set eyes, backward-swept horns, glowing jaw seam
  const head = new THREE.Group(); head.position.copy(HEAD).sub(NECK); neck.add(head);
  const jaw = new THREE.Group(); jaw.position.set(0, -2.4, 2.0); head.add(jaw);
  {
    const acc = new Acc(7);
    // skull: rust-grey hide low on the cheeks, dark basalt over the top of the wedge
    buildHide(acc, SKULL, [-6, -3, 0, 3.5, 7, 10, 13, 16, 18.5, 21, 23], 18, {
      color: (phi, z, P) => {
        const sa = Math.sin(phi);
        let c = sa < -0.2 ? mix(C.hide, C.hideMid, -sa) : mix(C.rustDark, C.basalt, smooth(-0.2, 0.45, sa));
        c = mix(c, mix(C.basalt, C.basaltHi, noise3(P.x * 0.6, P.y * 0.6, P.z * 0.6) * 0.5), smooth(0.35, 0.9, sa));
        return c.multiplyScalar(0.9 + noise3(P.x * 0.5, P.y * 0.5, P.z * 0.5) * 0.2);
      },
      noise: 0.3, nfreq: 0.35,
    });
    // rough basalt scales along the snout ridge, stepping down from the brow to the ram
    [[11.0, 3.2, 7.7], [15.0, 2.7, 6.5], [18.6, 2.2, 5.6]].forEach(([z, r, y], k) => {
      const sc = new THREE.DodecahedronGeometry(r, 0); sc.scale(1.45, 0.42, 1.05); sc.rotateX(-0.22); sc.translate(0, y, z);
      acc.geo(sc, { color: mix(C.basalt, C.basaltHi, 0.14 + k * 0.08).getHex() });
    });
    // the ram plate: a dark basalt battering prow capping the snout tip, faceted like an axe head: two flat cheeks meeting
    // in a vertical keel (a blunt V seen from above, the top raked back), narrower at the bottom so the front reads as a
    // wedge. Monster fix F2: it was larger and pale (a tan box under the warm TV key); now dark and a little smaller.
    // It stays on the upper snout (the lower jaw carries no slab).
    {
      const B = [V3(4.9, 4.8, 20.4), V3(5.2, 0.8, 20.4), V3(4.2, -2.7, 20.4)];          // back ring, +x side (top, mid, bottom)
      const M = [V3(5.3, 5.0, 22.5), V3(5.7, 0.8, 22.5), V3(4.3, -3.0, 22.5)];          // widest ring
      const K = [V3(0, 4.4, 24.8), V3(0, 0.8, 26.0), V3(0, -2.9, 25.2)];                // keel: top, mid, bottom
      const mir = (v) => V3(-v.x, v.y, v.z), ctr = V3(0, 0.8, 23);
      const cB = mix(C.basaltLo, C.basalt, 0.5), cM = C.basalt.clone(), cK = mix(C.basalt, C.basaltHi, 0.35);
      const q4 = (a, b, c, d, ca, cb, cc, cd) => { const h = a.clone().add(b).add(c).add(d).multiplyScalar(0.25).sub(ctr); quad(acc, a, b, c, d, ca, cb, cc, cd, Z2, Z2, Z2, Z2, h, 0.06); };
      const t3 = (a, b, c, ca, cb, cc) => { const h = a.clone().add(b).add(c).multiplyScalar(1 / 3).sub(ctr); triO(acc, a, b, c, ca, cb, cc, Z2, Z2, Z2, h, 0.06); };
      for (const s of [1, -1]) {
        const f = s > 0 ? (v) => v : mir, b = B.map(f), m = M.map(f);
        q4(b[0], b[1], m[1], m[0], cB, cB, cM, cM); q4(b[1], b[2], m[2], m[1], cB, cB, cM, cM);
        q4(m[0], m[1], K[1], K[0], cM, cM, cK, cK); q4(m[1], m[2], K[2], K[1], cM, cM, cK, cK);
      }
      const bL = B.map(mir), mL = M.map(mir);
      q4(B[0], bL[0], mL[0], M[0], cB, cB, cM, cM); t3(M[0], mL[0], K[0], cM, cM, cK);          // top
      q4(B[2], bL[2], mL[2], M[2], cB, cB, cM, cM); t3(M[2], mL[2], K[2], cM, cM, cK);          // bottom
    }
    // nostrils just behind the prow: dark slits with an ember glow
    for (const s of [-1, 1]) { const ns = new THREE.BoxGeometry(0.55, 0.45, 1.7); ns.rotateY(s * 0.3); ns.translate(s * 2.3, 5.5, 19.6); acc.geo(ns, { color: PAL.nostril, heat: [0.5, CH_MAGMA] }); }
    // one heavy frowning brow ridge across the skull, low in the middle, overhanging the eyes
    {
      const rings = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8, x = lerp(-10.4, 10.4, t), c = Math.abs(t - 0.5) * 2;
        rings.push({ c: V3(x * 1.04, 8.9 + 1.4 * Math.pow(c, 1.2), 9.4 - 1.4 * c), d: V3(1, 0, 0), u: V3(0, 0, 1), w: 2.8 - 0.5 * c, top: 2.1, bot: 1.8, ex: 1.6 });
      }
      acc.geo(loft(rings, 6, { color: (t, a, P) => mix(C.basalt, C.basaltHi, noise3(P.x * 0.6, P.y * 0.6, P.z * 0.6) * 0.35 + (Math.sin(a) > 0.6 ? 0.2 : 0)), noise: 0.3, nfreq: 0.5, seed: 4 }));
    }
    for (const s of [-1, 1]) {
      // thick ridged horns from behind the brow: out and a little up first, then sweeping back along the neck, so from
      // the TV camera they spread past the head and frame the face (monster fix F2: they hid behind the brow)
      const hp = [V3(s * 7.6, 11.0, 5.2), V3(s * 11.6, 14.0, 3.4), V3(s * 15.6, 15.6, 0.0), V3(s * 18.4, 15.2, -4.6), V3(s * 19.6, 13.6, -9.4)];
      acc.geo(tube(hp, [4.0, 3.4, 2.6, 1.6, 0.5], 7, (t, a, P, i) => {
        const c = mix(C.rustDark, C.horn, smooth(0.0, 0.3, t)).lerp(C.hornDark, smooth(0.7, 1.0, t) * 0.8);
        return i % 3 === 0 ? c.multiplyScalar(0.72) : c;      // growth ridges
      }));
      { const bo = new THREE.DodecahedronGeometry(2.7, 0); bo.scale(1.0, 0.8, 1.15); bo.translate(s * 7.6, 10.8, 5.0); acc.geo(bo, { color: PAL.basalt }); }
      // cheek plates over the jaw muscles
      { const sc = new THREE.DodecahedronGeometry(2.2, 0); sc.scale(0.55, 1.0, 1.4); sc.translate(s * 10.2, -2.6, 0.2); acc.geo(sc, { color: mix(C.basalt, C.rust, 0.3).getHex() }); }
      { const sc = new THREE.DodecahedronGeometry(1.8, 0); sc.scale(0.55, 0.9, 1.4); sc.translate(s * 9.8, -3.6, 4.8); acc.geo(sc, { color: PAL.basalt }); }
      // deep-set eye on the front face under the brow: a dark socket and a glowing slit, inner corner low (angry); larger
      // than before so it reads at phone size (monster fix F2)
      const sock = new THREE.SphereGeometry(1.4, 8, 6); sock.scale(1.55, 0.8, 0.8); sock.rotateZ(s * 0.3); sock.translate(s * 7.6, 6.3, 10.3);
      acc.geo(sock, { color: 0x0e0806 });
      const eye = new THREE.SphereGeometry(1, 8, 4); eye.scale(2.3, 0.62, 0.9); eye.rotateZ(s * 0.3); eye.translate(s * 8.0, 6.3, 11.0);
      acc.geo(eye, { color: 0x1a0d08, heat: [1, CH_EYE] });
      // the mouth seam glows from inside along the upper lip
      const lip = [];
      for (const z of [5, 8.5, 12, 15, 17.5]) { const ph = s > 0 ? -28 * D2R : 208 * D2R; lip.push(secPt(SKULL, ph, z, V3()).addScaledVector(secNrm(SKULL, ph, z, V3()), 0.1)); }
      acc.geo(tube(lip, [0.42, 0.42, 0.38, 0.32, 0.2], 5, C.crust, [0.6, CH_MAGMA]));
    }
    // forehead plate between the horn roots with a thin glowing seam
    acc.geo(ellipsoid(V3(0, 12.5, 2.0), 5.2, 1.8, 4.4, { nr: 6, nv: 10, color: (t, a, P) => mix(C.basalt, C.basaltHi, noise3(P.x * 0.4, P.y * 0.4, P.z * 0.4) * 0.8), noise: 0.3, seed: 9 }));
    acc.geo(ellipsoid(V3(0, 12.1, 2.0), 5.6, 1.1, 4.8, { nr: 4, nv: 10, color: () => C.crust, heat: () => [0.75, CH_MAGMA] }));
    // mouth roof + glowing throat
    acc.geo(mouthPlate(-2.0, 1.0, 20.0, 7.2, 4.4, 0.4, -1), { color: PAL.mouth, heat: [0.32, CH_WET] });
    const throat = new THREE.CircleGeometry(5.4, 10); throat.translate(0, -3.2, 0.0);
    acc.geo(throat, { color: PAL.mouth, heat: [1.0, CH_MAGMA] });
    mk(acc.build(), head, null);
  }
  {
    // lower jaw: a heavy mandible tucked under the prow (no tusks, no chin club), blunt teeth, glowing lip seam
    const acc = new Acc(11);
    const jr = [
      { z: -2, w: 9.0, top: 0.9, bot: 5.4 }, { z: 4, w: 9.2, top: 0.9, bot: 5.2 }, { z: 10, w: 8.2, top: 0.9, bot: 4.2 },
      { z: 15, w: 6.8, top: 0.9, bot: 3.5 }, { z: 19, w: 5.4, top: 0.9, bot: 3.1 }, { z: 20.6, w: 4.4, top: 0.9, bot: 2.6 },
    ].map((r) => ({ ...r, c: V3(0, 0, r.z), d: V3(0, 0, 1), u: V3(1, 0, 0), ex: 2.7 }));
    acc.geo(loft(jr, 14, {
      color: (t, a, P) => { const sa = Math.sin(a); const c = sa < 0 ? mix(C.hideMid, C.belly, -sa * 0.9) : mix(C.hide, C.rustDark, 0.3); return mix(c, C.basalt, smooth(14, 22, P.z) * 0.6).multiplyScalar(0.88 + noise3(P.x * 0.5, P.y * 0.5, P.z * 0.5) * 0.24); },
      noise: 0.3, nfreq: 0.3, seed: 11,
    }));
    // the mouth floor follows the jaw (narrower at the front) and dips in the middle, dimmer: not a bright flat tray (O4)
    acc.geo(mouthPlate(0.95, 0.0, 19.4, 7.8, 4.0, -0.7, 1), { color: PAL.mouth, heat: [0.28, CH_WET] });
    acc.geo(ellipsoid(V3(0, 1.4, 8.5), 3.6, 0.9, 6.6, { nr: 6, nv: 8, color: () => C.tongue, heat: () => [0.25, CH_WET] }));
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
      const tg = new THREE.CylinderGeometry(0.35, 0.75, 1.4, 5); tg.translate(s * lerp(7.2, 4.4, k / 3), 1.5, 5 + k * 4.0);
      acc.geo(tg, { color: PAL.tooth });
    }
    for (const s of [-1, 1]) acc.geo(tube([V3(s * 8.3, 0.6, 1.5), V3(s * 8.4, 0.6, 5), V3(s * 7.6, 0.6, 10), V3(s * 6.3, 0.6, 14.5), V3(s * 5.0, 0.6, 18)], [0.35, 0.38, 0.38, 0.32, 0.24], 5, C.crust, [0.55, CH_MAGMA]));
    mk(acc.build(), jaw, null);
  }

  // ---------------- legs: thick columns of dark hide wearing cooled lava sleeves; heavy feet with pale toe plates
  const legs = [];
  for (const L of LEGS) {
    const hip = new THREE.Group(); hip.position.copy(L.p).sub(BODY); body.add(hip);
    const upLen = 10.8, loLen = LEGLEN - upLen, fr = L.front ? 1.06 : 1, sd = L.side * 3 + (L.front ? 1 : 0);
    const accU = new Acc(20 + sd), accL = new Acc(40 + sd);
    const skin = (t, a, P) => mix(C.hide, C.hideDark, 0.3 + 0.4 * t).multiplyScalar(0.86 + noise3(P.x * 0.35, P.y * 0.35, P.z * 0.35) * 0.28);
    // pale worn rim only where a sleeve ends in the open (the upper sleeve's shoulder, the lower sleeve's ankle)
    const crustC = (rim) => (t, a, P, i) => {
      const c = mix(C.basalt, C.basaltHi, noise3(P.x * 0.3 + 5, P.y * 0.3, P.z * 0.3) * 0.8);
      c.lerp(C.rust, smooth(0.55, 0.8, noise3(P.x * 0.18, P.y * 0.18 + 9, P.z * 0.18)) * 0.55);
      if (i === rim) c.lerp(C.ash, 0.22);
      return c;
    };
    const crustH = (t, a, P) => [(1 - smooth(0, 0.03, Math.abs(noise3(P.x * 0.12 + sd, P.y * 0.12, P.z * 0.12) - 0.5))) * 0.32, CH_MAGMA];
    const ring = (y, r, nk = 1) => ({ c: V3(0, y, 0), d: V3(0, -1, 0), u: V3(1, 0, 0), w: r, h: r, ex: 2, nk });
    accU.geo(ellipsoid(V3(-L.side * 0.8, 2.6, 0), 7.0 * fr, 7.8 * fr, 7.6 * fr, { nr: 8, nv: 12, color: skin, noise: 0.6, seed: sd }));
    const ur = []; for (let i = 0; i <= 4; i++) { const t = i / 4; ur.push(ring(-t * upLen, lerp(6.4, 5.5, t) * fr)); }
    accU.geo(loft(ur, 12, { color: skin, noise: 0.4, nfreq: 0.3, seed: 4 + sd }));
    // long sleeves (shoulder to knee, knee to ankle). Monster fix F4: they overlap at the knee: the upper sleeve tucks in
    // just past the knee pivot and the lower one starts inside it and flares out (no dark slot, no pale ring at the knee)
    const us = [[-0.5, 7.8], [-3.6, 7.5], [-7.0, 7.0], [-10.2, 6.4], [-11.1, 5.7]].map(([y, r]) => ring(y, r * fr, 1.3));
    accU.geo(loft(us, 12, { color: crustC(0), heat: crustH, noise: 1.0, nfreq: 0.3, seed: 7 + sd, caps: [false, false] }));
    const lr = []; for (let i = 0; i <= 4; i++) { const t = i / 4; lr.push(ring(0.6 - t * (loLen - 1.2), lerp(5.4, 5.0, t) * fr)); }
    accL.geo(loft(lr, 12, { color: skin, noise: 0.4, nfreq: 0.35, seed: 6 + sd }));
    const ls = [[0.7, 5.6], [-0.6, 6.8], [-3.8, 6.5], [-7.0, 6.8]].map(([y, r]) => ring(y, r * fr, 1.3));
    accL.geo(loft(ls, 12, { color: crustC(ls.length - 1), heat: crustH, noise: 1.0, nfreq: 0.34, seed: 9 + sd, caps: [false, false] }));
    // a domed, uneven sole (review 2 F5: a flat pad read as a round "pig snout" disc on the lying corpse)
    accL.geo(ellipsoid(V3(0, -loLen + 1.4, 0.6), 6.5 * fr, 2.2, 6.9 * fr, { nr: 8, nv: 10, color: (t, a, P) => mix(C.hideDark, C.basaltLo, 0.5).multiplyScalar(0.8 + noise3(P.x * 0.6, P.y * 0.6, P.z * 0.6) * 0.4), noise: 0.9, seed: 9 + sd }));
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (k - 1) * 0.55;
      const toe = new THREE.DodecahedronGeometry(1.75, 0); toe.scale(1.0, 0.7, 1.3);
      toe.translate(Math.cos(a) * 6.0 * fr, -loLen + 1.2, Math.sin(a) * 6.0 * fr + 0.8);
      accL.geo(toe, { color: PAL.toe });
    }
    const upper = mk(accU.build(), hip, null);
    const knee = new THREE.Group(); knee.position.y = -upLen; hip.add(knee);
    const lower = mk(accL.build(), knee, null);
    legs.push({ ...L, hip, knee, upper, lower, loLen });
  }

  // ---------------- tail: thick, banded, simply tapering (no club, no spikes)
  const tail = new THREE.Group(); tail.position.copy(TAIL).sub(BODY); body.add(tail);
  {
    const acc = new Acc(13);
    info.owner = tail;
    const zs = [-33, -36, -38.6, -42.6, -46.9, -50.8, -54.2, -57.2, -59, -60.5];
    buildHide(acc, TAILS, zs, 24, { color: hideCol, skip: bandSkip(TAIL_ARC, -57.2, -38.6), noise: 0.4, nfreq: 0.25, caps: [false, true] });
    const PT = { ...TAIL_ARC, NP: 16, NW: 4, tf: 0.4, tr: 1.9, crown: 0.9, ovh: 0.8, keel: 0.8, wob: 0.4, rough: 0.7, cracks: 0.4 };
    buildBands(acc, TAILS, TAILB, PT, info);
    const seams = [];
    for (let i = 0; i < TAILB.length - 1; i++) seams.push([TAILB[i + 1].zB - 0.5, TAILB[i].zA + 0.5, TAILB[i + 1].id, TAILB[i].id]);
    buildSeams(acc, TAILS, seams, PT);
    buildUnder(acc, TAILS, TAILB, { ...TAIL_ARC, NPf: 10, NWf: 3, depth: 1.8, rib: 0.6 }, glands);
    mk(acc.build(), tail, TAIL);
  }
  const plates = info.plates.slice().sort((a, b) => a.id - b.id);
  const chims = info.chimneys;
  const backTop = info.top.clone();
  const pivotOf = (o) => (o === body ? BODY : o === neck ? NECK : o === tail ? TAIL : null);
  const restToWorld = (owner, p, out) => owner.localToWorld(out.copy(p).sub(pivotOf(owner)));

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
  // the cooled corpse keeps bright seams so the bands read from the gameplay camera (review V6)
  const HOT = new THREE.Color(1.0, 0.36, 0.06).multiplyScalar(4.6), COOL = new THREE.Color(0.95, 0.3, 0.06).multiplyScalar(2.3);
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
    if (name === 'head') return head.localToWorld(out.set(0, 3.5, 9));
    if (name === 'snout') return head.localToWorld(out.set(0, -0.8, 26));
    if (name === 'mouth') return head.localToWorld(out.set(0, -2.4, 13.5));
    if (name === 'jawTip') return jaw.localToWorld(out.set(0, -1, 18.5));
    if (name === 'eye') return head.localToWorld(out.set(8.0, 6.3, 11.0));
    if (name === 'brow') return head.localToWorld(out.set(0, 9.6, 9));
    if (name === 'hornTip') return head.localToWorld(out.set(19.6, 13.6, -9.4));
    if (name === 'backTop') return restToWorld(body, backTop, out);
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
    return { geo, zMin, zMax, xMin, xMax, yMin, yMax, glands: glands.slice(0, BACK.length).map((g) => restToWorld(body, g, new THREE.Vector3()).applyMatrix4(ginv)) };
  }

  setPose(standPose(0));
  return {
    group, root, body, neck, head, jaw, legs, tail, U, CU, mat, BODY,
    setPose, setHeat, worldPoint, hullPoints, bakeGeometry,
    // plate k (0-based) carries the shader plate id k + 1: 0..7 the back bands (rump to shoulders), 8 the collar, 9..13 the tail
    plateCentre(k, out = new THREE.Vector3()) { group.updateMatrixWorld(true); const q = plates[k]; return restToWorld(q.owner, q.p, out); },
    plateCount: plates.length,
    // vent chimneys on the spine (rump to shoulders): the top of the vent and its band's plate index
    chimneyCount: chims.length,
    chimneyTop(i, out = new THREE.Vector3()) { group.updateMatrixWorld(true); const q = chims[i]; return restToWorld(q.owner, q.p, out); },
    chimneyPlate(i) { return chims[i].id - 1; },
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
    head: [0.02 + lunge * 0.06 - roar * 0.22 - snap * 0.1, turn * 0.15 - snap * 0.4, -snap * 0.42],   // F3: the face stays toward the lens
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
    tail: [-0.1, 0.3 * side],
  };
}
