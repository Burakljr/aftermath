// KALKAN-07: original municipal civil-defence machine (~50 m). Polish round (review F11, owner: "boxy, toy-like"):
// rebuilt in the spirit of municipal heavy machinery, not anime mecha.
//   - silhouette: broad armoured pauldrons, a tapered V chest, a narrow waist on a hydraulic spine, heavy legs
//     with chrome pistons running from the knee to the ankle, wide track-shoe boots;
//   - head: an operator cab nestled between the shoulders, one lit visor slit, a roof light bar with two
//     amber beacons;
//   - punch arm (right): an oversized hydraulic ram forearm with yellow/black hazard chevrons; the fist sits on
//     a chrome rod that shoots out of the housing at the strike (`ram` pose value). Left: a demolition grapple;
//   - livery: deep petrol blue, safety-orange "vest" straps in a V down the chest crossed by a white reflective
//     band, orange knee caps, white "07" on the pauldrons, a shield emblem (KALKAN = shield) on the chest;
//   - worn paint: bevels and plate edges are lighter (vertex colour), a bottom-up gradient per plate, a few
//     dark panel seams.
// ONE skinned mesh on rigid bones (one draw call + one shadow draw), decals in the same mesh through a small
// atlas (alpha test), the visor / beacons / lamps through a per-vertex emissive channel. The lift-jet glow is
// one extra additive mesh on the torso bone, drawn only while thrusting. The material carries the cinematic
// key / rim light uniforms (shared with Magmadon, set by attack.js): no scene lights are added, so no program
// recompiles mid-attack.
// Pose API unchanged for attack.js: pose(p) with p.arm*/leg* arrays, punchPoseR(k), afterPoseR(), standPoseR();
// new: p.ramR (0..1 piston extension of the punch arm), fistLocal (strike point in the handR bone frame).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { smooth, lerp, rng } from '../util.js';

const BLUE = 0x2a6489, BLUE2 = 0x1f4d6b, FRAME = 0x2a2d32, DARK = 0x15171a, STEEL = 0xb9c0c6, ORANGE = 0xff6a16,
  YEL = 0xffc01e, WHITE = 0xeef1f2, WEAR = 0x9aa3aa, TREAD = 0x1d1f22;
const EM_NONE = [0, 0], EM_STEADY = (k) => [k, 0], EM_BLINK = (k) => [k, 1];
const _c = new THREE.Color(), _w = new THREE.Color(), _n = new THREE.Vector3();

// uniforms shared by the robot and Magmadon materials (attack.js drives them during the cinematic)
export function cineUniforms() {
  return {
    uKeyCol: { value: new THREE.Color(0, 0, 0) }, uKeyDir: { value: new THREE.Vector3(0.4, 0.6, 0.7).normalize() },
    uRimCol: { value: new THREE.Color(0, 0, 0) },
  };
}

// ------------------------------------------------------------------------------------ rigid-bone kit
class Kit {
  constructor(seed) {
    this.r = rng(seed);
    this.pos = []; this.col = []; this.uv = []; this.em = []; this.si = []; this.sw = [];
    this.bones = [{ name: 'root', parent: -1, p: new THREE.Vector3() }];
    this.cur = 0;
  }
  bone(name, parent, x, y, z) {
    this.bones.push({ name, parent: this.idx(parent), p: new THREE.Vector3(x, y, z) });
    this.cur = this.bones.length - 1;
    return this;
  }
  idx(name) { return this.bones.findIndex((b) => b.name === name); }
  on(name) { this.cur = this.idx(name); return this; }
  // push a geometry; colour per vertex: base * plate gradient, lighter on bevels (worn paint); uv into the atlas
  push(g, color, { wear = 0.38, grad = 0.22, em = EM_NONE, uv = null, jitter = 0.05 } = {}) {
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    g.computeBoundingBox();
    const bb = g.boundingBox, y0 = bb.min.y, y1 = bb.max.y;
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    _c.set(color); _w.set(WEAR);
    for (let f = 0; f < p.count; f += 3) {
      const j = 1 + (this.r() - 0.5) * jitter;
      for (let k = 0; k < 3; k++) {
        const i = f + k;
        this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
        _n.set(n.getX(i), n.getY(i), n.getZ(i));
        const axis = Math.max(Math.abs(_n.x), Math.abs(_n.y), Math.abs(_n.z));
        const bevel = wear > 0 ? smooth(0.985, 0.8, axis) : 0;
        const gk = (1 - grad) + grad * smooth(y0, y1, p.getY(i));
        const r = lerp(_c.r * gk, _w.r, bevel * wear), gg = lerp(_c.g * gk, _w.g, bevel * wear), b = lerp(_c.b * gk, _w.b, bevel * wear);
        this.col.push(r * j, gg * j, b * j);
        if (uv && u) this.uv.push(uv[0] + u.getX(i) * uv[2], uv[1] + u.getY(i) * uv[3]);
        else this.uv.push(0.5, 0.25);                       // white, opaque half of the atlas
        this.em.push(em[0], em[1]);
        this.si.push(this.cur, 0, 0, 0); this.sw.push(1, 0, 0, 0);
      }
    }
    return this;
  }
  rbox(w, h, d, x, y, z, color, o = {}) {
    const r = Math.min(o.r ?? 0.6, w / 2.2, h / 2.2, d / 2.2);
    const g = new RoundedBoxGeometry(w, h, d, o.seg ?? 2, r);
    if (o.taper) taperX(g, o.taper, h);
    if (o.taperZ) taperZ(g, o.taperZ, h);
    if (o.rx) g.rotateX(o.rx); if (o.rz) g.rotateZ(o.rz); if (o.ry) g.rotateY(o.ry);
    g.translate(x, y, z);
    return this.push(g, color, o);
  }
  box(w, h, d, x, y, z, color, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (o.shear) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + p.getY(i) * o.shear); }
    if (o.rx) g.rotateX(o.rx); if (o.rz) g.rotateZ(o.rz); if (o.ry) g.rotateY(o.ry);
    g.translate(x, y, z);
    return this.push(g, color, { wear: 0, grad: 0.1, ...o });
  }
  cyl(rt, rb, h, x, y, z, color, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 10, 1, false);
    if (o.rx) g.rotateX(o.rx); if (o.rz) g.rotateZ(o.rz); if (o.ry) g.rotateY(o.ry);
    g.translate(x, y, z);
    return this.push(g, color, { wear: 0.25, grad: 0.15, ...o });
  }
  // hydraulic piston from a to b (barrel at a, chrome rod toward b); `barrelBone` / `rodBone` let it telescope
  piston(a, b, r, o = {}) {
    const dir = new THREE.Vector3().subVectors(b, a); const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    const bar = new THREE.CylinderGeometry(r, r, len * 0.55, 10); bar.translate(0, -len * 0.22, 0); bar.applyMatrix4(m);
    this.push(bar, o.barrel ?? BLUE2, { wear: 0.3, grad: 0.1 });
    const cap = new THREE.CylinderGeometry(r * 1.18, r * 1.18, len * 0.08, 10); cap.translate(0, len * 0.05, 0); cap.applyMatrix4(m);
    this.push(cap, FRAME, { wear: 0.4, grad: 0 });
    if (o.rodBone) this.on(o.rodBone);
    const rod = new THREE.CylinderGeometry(r * 0.55, r * 0.55, len * 0.55, 8); rod.translate(0, len * 0.22, 0); rod.applyMatrix4(m);
    this.push(rod, STEEL, { wear: 0, grad: 0.3, jitter: 0.02 });
    for (const e of [a, b]) { const k = new THREE.SphereGeometry(r * 1.1, 8, 6); k.translate(e.x, e.y, e.z); this.push(k, FRAME, { wear: 0, grad: 0 }); }
    if (o.barrelBone) this.on(o.barrelBone);
    return this;
  }
  // yellow/black hazard chevrons on one face: n diagonal blocks along x in [x0, x1], height h at y, plane z (+normal)
  chevrons(x0, x1, y, h, z, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const w = (x1 - x0) / n;
      const g = new THREE.BoxGeometry(w * 1.02, h, 0.3);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) p.setX(k, p.getX(k) + (p.getY(k) > 0 ? 0.32 : -0.32) * w);
      g.translate(x0 + (i + 0.5) * w, y, 0);
      if (o.ry) g.rotateY(o.ry);
      g.translate(o.ox ?? 0, 0, z);
      if (o.ox2) g.translate(o.ox2, 0, 0);
      this.push(g, i % 2 ? DARK : YEL, { wear: 0, grad: 0.05, jitter: 0.02 });
    }
    return this;
  }
  // decal quad (atlas rect [u0, v0, du, dv]) centred at (x, y, z), facing +z rotated by ry
  decal(w, h, x, y, z, ry, rect, { rz = 0, color = 0xffffff } = {}) {
    const g = new THREE.PlaneGeometry(w, h);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    return this.push(g, color, { wear: 0, grad: 0, uv: rect, jitter: 0 });
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aEmit', new THREE.Float32BufferAttribute(this.em, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}
// scale x (or z) of a centred box by y: k(-h/2) = t[0], k(+h/2) = t[1]
function taperX(g, t, h) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * lerp(t[0], t[1], (p.getY(i) + h / 2) / h)); }
function taperZ(g, t, h) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) * lerp(t[0], t[1], (p.getY(i) + h / 2) / h)); }

// ------------------------------------------------------------------------------------ decal atlas
// 256 x 256: top-left "07" stencil, top-right the shield emblem, bottom half pure white (all other geometry)
const UV07 = [0.0, 0.5, 0.5, 0.5], UVSH = [0.5, 0.5, 0.5, 0.5];
function atlasTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const ctx = cv.getContext('2d');
  const t = new THREE.CanvasTexture(cv);
  const draw = () => {
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 128, 256, 128);
    // "07"
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 118px "Big Shoulders Stencil Display", "Big Shoulders Display", "Arial Narrow", sans-serif';
    ctx.fillText('07', 64, 70);
    // shield emblem: white rim, orange field, white chevron and a small "07"
    const sx = 192, sy = 64;
    const shield = (s) => {
      ctx.beginPath();
      ctx.moveTo(sx - 46 * s, sy - 50 * s); ctx.lineTo(sx + 46 * s, sy - 50 * s);
      ctx.lineTo(sx + 46 * s, sy - 4 * s);
      ctx.quadraticCurveTo(sx + 44 * s, sy + 34 * s, sx, sy + 56 * s);
      ctx.quadraticCurveTo(sx - 44 * s, sy + 34 * s, sx - 46 * s, sy - 4 * s);
      ctx.closePath();
    };
    ctx.fillStyle = '#f4f6f6'; shield(1.08); ctx.fill();
    ctx.fillStyle = '#ff6a16'; shield(0.9); ctx.fill();
    ctx.fillStyle = '#163a52'; ctx.beginPath(); ctx.moveTo(sx - 30, sy - 14); ctx.lineTo(sx, sy + 8); ctx.lineTo(sx + 30, sy - 14); ctx.lineTo(sx + 30, sy - 2); ctx.lineTo(sx, sy + 20); ctx.lineTo(sx - 30, sy - 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = '800 34px "Big Shoulders Display", "Arial Narrow", sans-serif'; ctx.fillText('07', sx, sy - 30);
    t.needsUpdate = true;
  };
  draw();
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(draw).catch(() => {});
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------------------------ material
function robotMaterial(cine, U) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0.22, flatShading: true, map: atlasTexture(), alphaTest: 0.5 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, cine, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aEmit; varying vec2 vEmit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmit = aEmit;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vEmit; uniform float uBlink, uEmitK; uniform vec3 uKeyCol, uKeyDir, uRimCol;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float on = vEmit.y > 0.5 ? uBlink : 1.0;
    totalEmissiveRadiance += diffuseColor.rgb * vEmit.x * on * uEmitK;
    // cinematic key (warm, unshadowed) + rim light: attack.js sets them, zero otherwise
    vec3 kd = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz);
    float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.5);
    totalEmissiveRadiance += diffuseColor.rgb * uKeyCol * max(dot(normal, kd), 0.0) + uRimCol * fr * (vEmit.x > 0.01 ? 0.0 : 1.0);
  }`);
  };
  m.customProgramCacheKey = () => 'kalkan07-v3';
  return m;
}

// ------------------------------------------------------------------------------------ model
// joint pivots in model space (rest pose, +z forward, ground y = 0 with straight legs)
const PIV = {
  pelvis: [0, 25.8, 0], waist: [0, 28.0, 0], torso: [0, 31.2, 0], head: [0, 43.6, 0.6],
  shoulderL: [16.2, 41.6, 0.2], upperL: [16.6, 38.4, 0.2], foreL: [16.6, 29.6, 0.2], handL: [16.6, 19.8, 0.2],
  shoulderR: [-16.2, 41.6, 0.2], upperR: [-16.6, 38.4, 0.2], foreR: [-16.6, 29.6, 0.2], handR: [-16.6, 19.8, 0.2],
  hipL: [5.6, 24.6, 0], kneeL: [5.6, 14.2, 0], ankleL: [5.6, 3.0, 0],
  hipR: [-5.6, 24.6, 0], kneeR: [-5.6, 14.2, 0], ankleR: [-5.6, 3.0, 0],
};
const PARENT = {
  pelvis: 'root', waist: 'pelvis', torso: 'waist', head: 'torso',
  shoulderL: 'torso', upperL: 'shoulderL', foreL: 'upperL', handL: 'foreL',
  shoulderR: 'torso', upperR: 'shoulderR', foreR: 'upperR', handR: 'foreR',
  hipL: 'pelvis', kneeL: 'hipL', ankleL: 'kneeL', hipR: 'pelvis', kneeR: 'hipR', ankleR: 'kneeR',
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function buildKit() {
  const K = new Kit(7);
  for (const name of Object.keys(PIV)) K.bone(name, PARENT[name], ...PIV[name]);

  // ---------------- pelvis: armoured hip block, skirt plates
  K.on('pelvis');
  K.rbox(12.6, 4.0, 8.0, 0, 25.6, 0, FRAME, { r: 0.7 });
  K.rbox(10.0, 3.4, 8.8, 0, 26.0, 0.3, BLUE, { r: 0.8 });
  for (const s of [-1, 1]) K.rbox(3.8, 5.0, 8.2, s * 6.3, 24.4, 0.2, BLUE2, { r: 0.7, rz: s * 0.14 });
  K.rbox(5.0, 3.6, 1.2, 0, 24.6, 4.6, BLUE2, { r: 0.4 });                                // front codpiece plate
  K.chevrons(-2.3, 2.3, 23.4, 0.9, 5.25, 4);
  K.cyl(1.7, 1.7, 14.4, 0, 24.8, 0, STEEL, { rz: Math.PI / 2 });

  // ---------------- waist: narrow, hydraulic spine
  K.on('waist');
  K.cyl(2.3, 3.0, 4.8, 0, 28.9, 0, FRAME, { seg: 10 });
  K.rbox(4.2, 3.6, 3.0, 0, 29.4, 2.0, BLUE2, { r: 0.5 });
  for (const s of [-1, 1]) K.piston(V(s * 3.9, 26.6, -0.4), V(s * 4.3, 31.8, -0.2), 0.62);
  K.piston(V(0, 26.6, -3.0), V(0, 32.0, -3.0), 0.66);

  // ---------------- torso: tapered V chest, shoulder yoke, vest straps, emblem
  K.on('torso');
  K.rbox(11.0, 12.0, 8.6, 0, 35.6, -0.2, FRAME, { r: 0.8, taper: [0.85, 1.35] });         // inner frame
  K.rbox(22.0, 13.6, 10.6, 0, 38.0, 0.6, BLUE, { r: 1.4, seg: 3, taper: [0.56, 1.0] });   // V chest shell
  K.rbox(27.5, 4.6, 11.4, 0, 43.4, 0.0, BLUE, { r: 1.5, seg: 2 });                        // shoulder yoke
  K.rbox(25.0, 1.2, 11.8, 0, 41.0, 0.0, BLUE2, { r: 0.4 });                               // yoke under-band
  // safety-orange vest straps in a V, crossed by a white reflective band
  for (const s of [-1, 1]) K.box(2.4, 13.2, 0.5, s * 4.7, 38.4, 6.05, ORANGE, { rz: s * -0.36 });
  for (const s of [-1, 1]) K.box(2.4, 12.8, 0.5, s * 4.7, 38.4, -4.9, ORANGE, { rz: s * -0.36 });
  K.box(15.4, 1.1, 0.4, 0, 34.6, 6.1, WHITE, { jitter: 0.01 });
  K.box(15.4, 1.1, 0.4, 0, 34.6, -4.95, WHITE, { jitter: 0.01 });
  K.decal(5.6, 5.6, 0, 39.6, 6.36, 0, UVSH);                                                // shield emblem
  // panel seams and vents
  for (const s of [-1, 1]) { K.box(0.22, 8.0, 0.3, s * 8.2, 39.2, 5.95, DARK, { rz: s * -0.3 }); K.box(0.22, 4.0, 11.0, s * 10.6, 42.6, 0, DARK); }
  for (let i = 0; i < 3; i++) K.box(6.2, 0.32, 0.4, 0, 32.0 + i * 0.8, 5.2, DARK);
  K.rbox(10.0, 2.4, 7.4, 0, 45.6, -0.8, FRAME, { r: 0.8 });                                 // collar
  // back: spine plate + two lift-jet nozzles
  K.rbox(10.0, 9.0, 2.6, 0, 38.0, -5.6, BLUE2, { r: 0.8 });
  for (let i = 0; i < 4; i++) K.box(8.0, 0.45, 0.4, 0, 35.0 + i * 1.9, -7.0, DARK);
  for (const s of [-1, 1]) { K.cyl(1.5, 1.9, 2.6, s * 7.6, 40.0, -6.4, DARK, { seg: 10 }); K.cyl(1.95, 1.95, 0.5, s * 7.6, 38.6, -6.4, STEEL, { seg: 10 }); }
  // flood lamps on the yoke front
  for (const s of [-1, 1]) K.box(2.2, 0.9, 0.3, s * 9.4, 43.6, 5.8, 0xfff1d8, { em: EM_STEADY(3.2), jitter: 0 });

  // ---------------- head: operator cab between the shoulders
  K.on('head');
  K.cyl(2.5, 2.8, 2.0, 0, 44.4, 0.4, FRAME, { seg: 10 });
  K.rbox(9.6, 6.4, 8.8, 0, 47.6, 0.8, BLUE, { r: 1.1, seg: 2, taper: [1.0, 0.9], taperZ: [1.0, 0.92] }); // cab body
  K.rbox(9.9, 1.1, 9.1, 0, 45.1, 0.8, ORANGE, { r: 0.4 });                                  // hi-vis band
  K.rbox(8.6, 2.4, 1.0, 0, 47.9, 5.05, DARK, { r: 0.4 });                                   // visor recess
  K.box(7.4, 0.9, 0.3, 0, 47.9, 5.6, 0xd8f4ff, { em: EM_STEADY(3.6), jitter: 0 });          // lit visor slit
  for (const s of [-1, 1]) K.box(0.5, 2.6, 0.5, s * 2.2, 47.9, 5.75, FRAME);                // cab guard bars
  for (let i = 0; i < 3; i++) K.box(4.6, 0.3, 0.3, 0, 45.8 + i * 0.4, 5.25, DARK);           // grille
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) K.box(0.3, 0.4, 4.4, s * 4.85, 47.2 + i * 0.8, 0.0, DARK);
  K.rbox(8.6, 0.8, 7.8, 0, 50.95, 0.6, FRAME, { r: 0.3 });                                  // roof plate
  K.rbox(6.8, 0.8, 1.6, 0, 51.7, 1.8, FRAME, { r: 0.3 });                                   // light bar
  for (const s of [-1, 1]) K.rbox(1.6, 1.1, 1.3, s * 2.4, 52.5, 1.8, 0xffa126, { r: 0.35, em: EM_BLINK(5.0), wear: 0 });
  K.box(1.4, 0.7, 0.5, 0, 52.4, 2.4, 0xfff4e0, { em: EM_STEADY(2.6), jitter: 0 });          // work lamp
  K.cyl(0.18, 0.18, 4.0, -3.4, 53.0, -2.6, DARK, { seg: 5 });                               // antenna

  // ---------------- arms
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R', x = side * 16.2;
    // pauldron: big sloped armour block, orange cap stripe, white "07" on the outer face
    K.on('shoulder' + S);
    K.rbox(10.2, 8.4, 12.0, x + side * 0.9, 43.2, 0.2, BLUE, { r: 1.8, seg: 2, rz: side * -0.16 });
    K.rbox(10.4, 1.3, 12.2, x + side * 0.55, 46.6, 0.2, ORANGE, { r: 0.5, rz: side * -0.16 });
    K.rbox(10.6, 1.6, 12.4, x + side * 1.3, 39.0, 0.2, FRAME, { r: 0.5, rz: side * -0.16 });
    K.cyl(2.8, 2.8, 3.6, x, 40.6, 0.2, FRAME, { rz: Math.PI / 2 });
    K.decal(5.6, 5.6, x + side * 6.1, 42.4, 0.2, side * Math.PI / 2, UV07, { rz: side * -0.16 });
    K.box(0.22, 6.0, 0.3, x + side * 0.9, 43.0, 6.25, DARK, { rz: side * -0.16 });            // seam
    // upper arm
    K.on('upper' + S);
    const xu = side * 16.6;
    K.rbox(4.6, 9.0, 4.8, xu, 34.0, 0.2, FRAME, { r: 0.6 });
    K.rbox(6.0, 5.6, 6.0, xu, 35.2, 0.4, BLUE2, { r: 0.9 });
    K.piston(V(xu + side * 2.9, 37.4, 1.8), V(xu + side * 2.9, 30.2, 2.2), 0.62);
    K.cyl(2.3, 2.3, 5.6, xu, 29.6, 0.2, STEEL, { rz: Math.PI / 2 });
    if (side > 0) {
      // left forearm: guard + hazard band, then the demolition grapple
      K.on('foreL');
      K.rbox(5.0, 9.8, 5.2, xu, 24.8, 0.2, FRAME, { r: 0.6 });
      K.rbox(6.6, 7.8, 6.6, xu, 24.6, 0.4, BLUE, { r: 1.1, seg: 2 });
      K.chevrons(xu - 3.3, xu + 3.3, 22.0, 1.4, 3.75, 5);
      K.piston(V(xu, 28.8, -3.3), V(xu, 20.8, -3.1), 0.6);
      K.on('handL');
      K.rbox(5.2, 3.4, 5.2, xu, 18.2, 0.2, FRAME, { r: 0.6 });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5;
        const g = new RoundedBoxGeometry(1.4, 6.6, 1.8, 1, 0.35);
        g.translate(0, -3.0, 0); g.rotateX(0.32); g.rotateY(-a + Math.PI / 2);
        g.translate(xu + Math.cos(a) * 1.9, 16.8, 0.2 + Math.sin(a) * 1.9);
        K.push(g, k === 0 ? YEL : BLUE2, { wear: 0.4 });
      }
    } else {
      // right forearm: the hydraulic ram housing (much bigger than the left), hazard chevrons, hoses
      K.on('foreR');
      K.rbox(8.6, 10.8, 8.6, xu, 24.4, 0.2, BLUE, { r: 1.5, seg: 2, taper: [1.08, 0.92], taperZ: [1.08, 0.92] });
      K.rbox(8.9, 1.2, 8.9, xu, 28.6, 0.2, ORANGE, { r: 0.4 });
      K.chevrons(xu - 4.6, xu + 4.6, 21.4, 1.8, 4.75, 6);                                          // front
      K.chevrons(-4.6, 4.6, 21.4, 1.8, 0, 6, { ry: -Math.PI / 2, ox: xu - 4.62 });                 // outer face
      K.cyl(3.0, 3.0, 1.0, xu, 18.8, 0.2, STEEL, { seg: 12 });                                     // gland ring
      for (const s of [-1, 1]) K.cyl(0.55, 0.55, 9.0, xu + s * 4.9, 24.2, -2.6, DARK, { seg: 6 });  // hoses
      K.on('handR');
      K.cyl(1.55, 1.55, 9.0, xu, 22.6, 0.2, STEEL, { seg: 12, wear: 0, grad: 0.35 });             // chrome ram rod
      K.rbox(7.2, 5.6, 7.0, xu, 15.6, 0.2, FRAME, { r: 1.0 });                                     // ram head / fist
      K.rbox(7.6, 1.8, 7.4, xu, 18.0, 0.2, BLUE2, { r: 0.5 });
      for (let k = 0; k < 4; k++) K.rbox(1.55, 2.4, 2.6, xu - 2.4 + k * 1.6, 13.2, 1.6, STEEL, { r: 0.5, wear: 0.2 });
      K.rbox(1.9, 2.8, 2.2, xu + 3.6, 14.6, 2.0, STEEL, { r: 0.5, rz: -0.4, wear: 0.2 });
    }
  }

  // ---------------- legs
  for (const side of [1, -1]) {
    const S = side > 0 ? 'L' : 'R', x = side * 5.6;
    K.on('hip' + S);
    K.rbox(5.8, 10.8, 6.4, x, 19.2, 0, FRAME, { r: 0.7 });
    K.rbox(7.8, 8.4, 8.0, x + side * 0.3, 19.8, 0.4, BLUE, { r: 1.4, seg: 2, taper: [0.88, 1.08] });
    K.rbox(8.0, 1.1, 8.2, x + side * 0.3, 23.2, 0.4, BLUE2, { r: 0.4 });
    K.box(0.22, 6.0, 0.3, x + side * 1.2, 19.6, 4.45, DARK);
    K.piston(V(x + side * 4.0, 23.8, 2.6), V(x + side * 4.0, 15.0, 3.0), 0.75);
    K.piston(V(x - side * 3.6, 23.8, -2.8), V(x - side * 3.6, 15.0, -2.4), 0.7);
    K.cyl(2.7, 2.7, 6.6, x, 14.2, 0, STEEL, { rz: Math.PI / 2 });
    K.on('knee' + S);
    K.rbox(6.2, 11.2, 6.6, x, 8.6, -0.3, FRAME, { r: 0.7 });
    K.rbox(8.4, 8.8, 8.2, x, 8.0, 0.6, BLUE, { r: 1.4, seg: 2, taper: [1.14, 0.94] });       // heavy shin guard
    K.rbox(6.6, 4.6, 3.4, x, 14.4, 3.4, ORANGE, { r: 1.0 });                                  // knee cap
    K.box(0.22, 6.0, 0.3, x, 7.8, 4.75, DARK);
    // chrome pistons from the knee to the ankle on both sides (visible at both joints)
    for (const s of [-1, 1]) K.piston(V(x + s * 4.4, 13.4, -1.6), V(x + s * 4.4, 3.8, -1.2), 0.75);
    K.on('ankle' + S);
    K.rbox(9.0, 3.0, 14.0, x, 1.5, 1.8, FRAME, { r: 0.6 });                                   // boot
    K.rbox(8.0, 2.2, 9.8, x, 3.6, 0.8, BLUE2, { r: 0.7 });
    K.rbox(8.8, 1.7, 3.0, x, 2.6, 7.9, ORANGE, { r: 0.5 });                                   // toe cap
    for (let i = 0; i < 6; i++) K.box(9.2, 0.6, 1.2, x, 0.3, -4.6 + i * 2.1, TREAD);          // track-shoe tread
    K.cyl(1.9, 1.9, 6.6, x, 3.0, 0, STEEL, { rz: Math.PI / 2 });
  }
  return K;
}

let KIT_GEO = null, KIT_BONES = null;
export function createRobot(cine) {
  if (!KIT_GEO) { const K = buildKit(); KIT_GEO = K.geometry(); KIT_BONES = K.bones; }
  const U = { uBlink: { value: 1 }, uEmitK: { value: 1 } };
  const C = cine || cineUniforms();
  const mat = robotMaterial(C, U);
  const bones = KIT_BONES.map((b) => { const o = new THREE.Bone(); o.name = b.name; return o; });
  KIT_BONES.forEach((b, i) => {
    if (b.parent < 0) bones[i].position.copy(b.p);
    else { bones[i].position.copy(b.p).sub(KIT_BONES[b.parent].p); bones[b.parent].add(bones[i]); }
  });
  const group = new THREE.Group();
  const mesh = new THREE.SkinnedMesh(KIT_GEO, mat);
  mesh.add(bones[0]);
  group.add(mesh);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.frustumCulled = false; mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'kalkan07';
  const J = {};
  bones.forEach((b) => { J[b.name] = b; b.userData.rest = b.position.clone(); });
  // lift-jet glow: both cones in one additive mesh on the torso bone (drawn only while thrusting)
  const jetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.6, 4.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const cones = [];
  for (const s of [-1, 1]) { const c = new THREE.ConeGeometry(1.8, 14, 10, 1, true); c.rotateX(Math.PI); c.translate(s * 7.6, 38.6 - 7 - PIV.torso[1], -6.4); cones.push(c); }
  const jg = mergeGeos(cones);
  const jets = new THREE.Mesh(jg, jetMat); jets.name = 'jet'; jets.frustumCulled = false; J.torso.add(jets);
  const jetBase = new THREE.Vector3(0, 38.6 - PIV.torso[1], -6.4);

  const SIDES = [
    { k: 1, sh: J.shoulderL, fore: J.foreL, hand: J.handL, hip: J.hipL, knee: J.kneeL, ankle: J.ankleL, arm: 'armL', leg: 'legL' },
    { k: -1, sh: J.shoulderR, fore: J.foreR, hand: J.handR, hip: J.hipR, knee: J.kneeR, ankle: J.ankleR, arm: 'armR', leg: 'legR' },
  ];
  const Z4 = [0, 0, 0, 0, 0], L4 = [0, 0, 0, 0.04];
  function pose(p) {
    J.pelvis.position.set(p.px ?? 0, PIV.pelvis[1] + (p.drop ?? 0), p.pz ?? 0);
    J.pelvis.rotation.set(p.pelvisPitch ?? 0, p.pelvisYaw ?? 0, p.pelvisRoll ?? 0);
    J.waist.rotation.set(p.waistPitch ?? 0, p.waistYaw ?? 0, 0);
    J.torso.rotation.set(p.torsoPitch ?? 0.05, p.torsoYaw ?? 0, p.torsoRoll ?? 0);
    J.head.rotation.set(p.headPitch ?? 0, p.headYaw ?? 0, 0);
    for (let i = 0; i < 2; i++) {
      const S = SIDES[i], a = p[S.arm] || Z4, l = p[S.leg] || L4;
      S.sh.rotation.set(a[0], a[4] ?? 0, a[1] * S.k);
      S.fore.rotation.set(a[2], 0, 0);
      S.hand.rotation.set(a[3], 0, 0);
      S.hip.rotation.set(l[0], 0, (l[3] ?? 0.04) * S.k);
      S.knee.rotation.set(l[1], 0, 0);
      S.ankle.rotation.set(l[2], 0, 0);
    }
    // the punch ram: the fist rides out of the housing on its chrome rod
    J.handR.position.y = J.handR.userData.rest.y - 4.2 * (p.ramR ?? 0);
  }
  pose(standPoseR());
  function lights(on, t = 0) { U.uEmitK.value = on ? 1 : 0.08; U.uBlink.value = on ? (Math.sin(t * Math.PI * 4) > 0 ? 1 : 0.15) : 0.1; }
  function thrust(k) { jetMat.opacity = Math.min(1, k); jets.visible = k > 0.01; const sy = 0.4 + 0.8 * k; jets.scale.set(1, sy, 1); jets.position.set(0, (1 - sy) * jetBase.y, 0); }
  thrust(0);
  return { group, mesh, J, pose, lights, thrust, mat, cine: C, fistLocal: new THREE.Vector3(0, -6.5, 1.0), height: 53 };
}
function mergeGeos(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3); let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return out;
}

// ------------------------------------------------------------------------------------ poses
// Every pose function fills a reusable pose object (no per-frame garbage); without `o` it returns a new one.
export function newPoseR() {
  return { torsoPitch: 0.05, torsoYaw: 0, torsoRoll: 0, waistPitch: 0, waistYaw: 0, pelvisPitch: 0, pelvisYaw: 0, pelvisRoll: 0, drop: 0, px: 0, pz: 0,
    headPitch: 0, headYaw: 0, ramR: 0, armL: [0, 0, 0, 0, 0], armR: [0, 0, 0, 0, 0], legL: [0, 0, 0, 0.04], legR: [0, 0, 0, 0.04] };
}
function clr(o) {
  o.torsoPitch = 0.05; o.torsoYaw = 0; o.torsoRoll = 0; o.waistPitch = 0; o.waistYaw = 0; o.pelvisPitch = 0; o.pelvisYaw = 0; o.pelvisRoll = 0;
  o.drop = 0; o.px = 0; o.pz = 0; o.headPitch = 0; o.headYaw = 0; o.ramR = 0;
  return o;
}
// arm: shoulder pitch (- = forward), shoulder out, elbow (- = bend forward), wrist, shoulder yaw; leg: hip pitch, knee, ankle, hip out
export function setArm(a, p, out, el, wr, yaw = 0) { a[0] = p; a[1] = out; a[2] = el; a[3] = wr; a[4] = yaw; return a; }
export function setLeg(a, h, k, an, out = 0.04) { a[0] = h; a[1] = k; a[2] = an; a[3] = out; return a; }

export function standPoseR(o = newPoseR()) {
  clr(o);
  setArm(o.armL, 0.05, 0.12, -0.35, 0); setArm(o.armR, 0.05, 0.1, -0.4, 0);
  setLeg(o.legL, -0.1, 0.18, -0.08); setLeg(o.legR, 0.08, 0.15, -0.23);
  return o;
}

// Punch timeline, k in [0,1] over one 4 s beat:
//   0.00-0.45 wind-up (torso twists back, fist cocked by the head)
//   0.45-0.56 strike (fast, ease-in); the ram rod fires out at the end of the strike
//   0.56-0.62 contact hold (two frames frozen at full extension)
//   0.62-1.00 recoil back towards guard
function phaseOf(k) {
  if (k < 0.45) { PH.wind = smooth(0, 0.45, k); PH.strike = 0; }
  else if (k < 0.56) { const t = (k - 0.45) / 0.11; PH.wind = 1; PH.strike = t * t; }
  else if (k < 0.62) { PH.wind = 1; PH.strike = 1; }
  else { const t = smooth(0.62, 1.0, k); PH.wind = 1 - t; PH.strike = 1 - t * 0.85; }
  return PH;
}
const PH = { wind: 0, strike: 0 };
export function punchPoseR(k, o = newPoseR()) {
  const { wind, strike } = phaseOf(k);
  const w = wind * (1 - strike), s = strike;
  clr(o);
  o.ramR = k < 0.5 ? 0 : k < 0.56 ? smooth(0.5, 0.56, k) : k < 0.66 ? 1 : 1 - smooth(0.66, 0.9, k);
  o.torsoPitch = 0.06 + 0.12 * s; o.torsoYaw = -0.45 * w + 0.42 * s; o.torsoRoll = 0.04 - 0.06 * s;
  o.waistYaw = -0.15 * w + 0.16 * s; o.pelvisYaw = -0.08 * w + 0.1 * s; o.drop = -0.6 * w - 1.6 * s; o.pz = 2.2 * s;
  o.headPitch = -0.14 * s + 0.05 * w; o.headYaw = 0.55 * w - 0.5 * s;
  // right arm: cocked back and up (wind) -> straight forward (strike)
  setArm(o.armR, lerp(0.15, 0.55, w) - 1.5 * s, lerp(0.1, 0.42, w) - 0.32 * s, lerp(-0.4, -2.1, w) * (1 - s) - 0.06 * s, -0.25 * s, 0.25 * w);
  setArm(o.armL, lerp(-0.35, -0.75, w) + 0.6 * s, 0.25 + 0.1 * s, -1.25 + 0.3 * s, 0.1);
  setLeg(o.legL, -0.55 * s - 0.25 * w - 0.05, 0.6 * s + 0.35 * w + 0.12, -0.15 * s, 0.08);
  setLeg(o.legR, 0.42 * s + 0.12 * w + 0.05, 0.3 + 0.1 * w, -0.45 * s - 0.1, 0.06);
  return o;
}
// two-handed shove that tips the staggering monster over (topple shot); k 0 = full extension .. 1 = recovered
export function shovePoseR(k, o = newPoseR()) {
  const r = smooth(0, 1, k);
  clr(o);
  o.torsoPitch = lerp(0.3, 0.08, r); o.torsoYaw = lerp(0.12, 0.02, r); o.waistPitch = lerp(0.12, 0, r); o.drop = lerp(-2.4, -0.4, r); o.pz = lerp(2.6, 0, r);
  o.headPitch = lerp(-0.22, 0.04, r); o.ramR = lerp(0.8, 0, r);
  setArm(o.armR, lerp(-1.42, -0.25, r), lerp(-0.12, 0.14, r), lerp(-0.12, -0.7, r), -0.1);
  setArm(o.armL, lerp(-1.32, -0.3, r), lerp(-0.06, 0.2, r), lerp(-0.25, -0.85, r), 0);
  setLeg(o.legL, lerp(-0.7, -0.2, r), lerp(0.75, 0.26, r), lerp(-0.1, -0.06, r), 0.1);
  setLeg(o.legR, lerp(0.5, 0.15, r), lerp(0.25, 0.2, r), lerp(-0.45, -0.28, r), 0.08);
  return o;
}
// standing back after the fight: chest up, fists low, a slight list
export function afterPoseR(o = newPoseR()) {
  clr(o);
  o.torsoPitch = 0.04; o.torsoRoll = -0.04; o.headPitch = 0.1; o.drop = -0.5;
  setArm(o.armL, 0.1, 0.22, -0.7, 0); setArm(o.armR, -0.05, 0.14, -0.55, 0);
  setLeg(o.legL, -0.12, 0.22, -0.1, 0.1); setLeg(o.legR, 0.14, 0.24, -0.38, 0.08);
  return o;
}
const KEYS = ['torsoPitch', 'torsoYaw', 'torsoRoll', 'waistPitch', 'waistYaw', 'pelvisPitch', 'pelvisYaw', 'pelvisRoll', 'drop', 'px', 'pz', 'headPitch', 'headYaw', 'ramR'];
const ARRS = ['armL', 'armR', 'legL', 'legR'];
export function mixPoseR(A, B, k, o = newPoseR()) {
  for (let i = 0; i < KEYS.length; i++) { const n = KEYS[i]; o[n] = lerp(A[n], B[n], k); }
  for (let i = 0; i < ARRS.length; i++) { const a = A[ARRS[i]], b = B[ARRS[i]], c = o[ARRS[i]]; for (let j = 0; j < c.length; j++) c[j] = lerp(a[j], b[j], k); }
  return o;
}
