// Fleet vehicle meshes (A1). Every vehicle is ONE skinned mesh (vertex colours, shared vehicle material)
// whose moving parts (ladder, excavator house/boom/stick/bucket, tipper bed, crane turret/boom/hook,
// outriggers, crates on the bed) hang on rigid bones, so a whole working excavator is one draw call.
// Built at 2x real scale for readability (ARCH 5.5). Geometry is built once per type + livery and shared
// by every instance; each instance owns its skeleton.
// Model space: +z = nose, y up, ground at y = 0, metres.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Builder, smooth } from '../util.js';

// liveries: player (Aftermath teal + signal yellow, fire engines red with a white band), rival (Süpürge purple)
export const LIVERY = {
  player: { body: 0x10857e, body2: 0x0b6460, accent: 0xf5b400, dark: 0x1c2226, glass: 0x22384a, white: 0xeeece6, steel: 0x9aa0a4, tyre: 0x17191b,
    fire: 0xc8171d, fire2: 0x9c1015, band: 0xf4f2ec },
  rival: { body: 0x7058d8, body2: 0x523fae, accent: 0xf2f0f8, dark: 0x1e1a2a, glass: 0x2a2848, white: 0xe8e4f4, steel: 0xa09cb0, tyre: 0x18171c,
    fire: 0x7058d8, fire2: 0x523fae, band: 0xf2f0f8 },
};

// one rigid-bone kit: push primitives onto the current bone
class Kit {
  constructor(seed) {
    this.B = new Builder(seed, { skinIndex: 4, skinWeight: 4 });
    this.bones = [{ name: 'root', parent: -1, p: new THREE.Vector3() }];
    this.cur = 0;
    this.beacons = [];   // { x, y, z, col:[r,g,b], blink }
    this.meta = {};
  }
  bone(name, parent, x, y, z) {      // x,y,z = pivot in MODEL space
    this.bones.push({ name, parent: typeof parent === 'string' ? this.idx(parent) : parent, p: new THREE.Vector3(x, y, z) });
    this.cur = this.bones.length - 1;
    return this.cur;
  }
  idx(name) { return this.bones.findIndex((b) => b.name === name); }
  on(name) { this.cur = this.idx(name); return this; }
  o(extra) { return { skinIndex: [this.cur, 0, 0, 0], skinWeight: [1, 0, 0, 0], jitter: 0.04, ...extra }; }
  box(w, h, d, x, y, z, color, e = {}) { return this.B.box(w, h, d, x, y, z, color, this.o(e)); }
  rbox(w, h, d, x, y, z, color, e = {}) {
    const r = Math.min(e.r ?? 0.4, w / 2.2, h / 2.2, d / 2.2);
    const g = new RoundedBoxGeometry(w, h, d, 1, r);
    if (e.rx) g.rotateX(e.rx); if (e.rz) g.rotateZ(e.rz); if (e.ry) g.rotateY(e.ry);
    g.translate(x, y, z);
    return this.B.push(g, color, this.o({ grad: (px, py) => 0.82 + 0.18 * smooth(y - h / 2, y + h / 2, py), ...e }));
  }
  cyl(rt, rb, h, x, y, z, color, e = {}) { return this.B.cyl(rt, rb, h, x, y, z, color, this.o({ seg: 10, ...e })); }
  geo(g, color, e = {}) { return this.B.push(g, color, this.o(e)); }
  wheel(x, y, z, r, w, L) {
    this.cyl(r, r, w, x, y, z, L.tyre, { rz: Math.PI / 2, seg: 12 });
    this.cyl(r * 0.55, r * 0.55, w + 0.08, x, y, z, L.steel, { rz: Math.PI / 2, seg: 8 });
  }
  // diagonal stripes along a side panel (hi-vis chevrons): n blocks alternating a / b
  chevrons(len, h, x, y, z0, z1, a, b, side) {
    const n = Math.max(2, Math.round(Math.abs(z1 - z0) / len));
    for (let i = 0; i < n; i++) {
      const zc = z0 + (z1 - z0) * (i + 0.5) / n;
      const g = new THREE.BoxGeometry(0.12, h, Math.abs(z1 - z0) / n * 1.02);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) p.setZ(k, p.getZ(k) + (p.getY(k) > 0 ? 0.3 : -0.3) * h);
      g.translate(x + side * 0.02, y, zc);
      this.geo(g, i % 2 ? b : a, { jitter: 0.01 });
    }
  }
  beacon(x, y, z, col, blink) { this.beacons.push({ x, y, z, col, blink }); }
  build() {
    const geo = this.B.build();
    geo.computeBoundingSphere();
    geo.boundingSphere.radius *= 1.6;
    return { geo, bones: this.bones, beacons: this.beacons, meta: this.meta };
  }
}

// ------------------------------------------------------------------------------------ cab (shared)
// cab block at the front: z from zf (front) back to zf - len; returns the roof height
function cab(K, L, zf, len, w, h, color, { glassSide = true } = {}) {
  const zc = zf - len / 2;
  K.rbox(w, h, len, 0, 1.2 + h / 2, zc, color, { r: 0.5 });
  K.rbox(w - 0.6, h * 0.42, 0.25, 0, 1.2 + h * 0.66, zf + 0.02, L.glass, { r: 0.1, jitter: 0.01 });     // windscreen
  if (glassSide) for (const s of [-1, 1]) K.box(0.14, h * 0.36, len * 0.5, s * (w / 2 + 0.02), 1.2 + h * 0.68, zc + len * 0.12, L.glass, { jitter: 0.01 });
  K.box(w + 0.3, 0.7, 0.5, 0, 1.0, zf + 0.15, L.dark);                                                   // bumper
  for (const s of [-1, 1]) K.box(0.9, 0.5, 0.2, s * (w / 2 - 0.8), 1.9, zf + 0.12, 0xfff4d8, { jitter: 0 }); // headlights
  return 1.2 + h;
}
// Aftermath door logo: a signal-yellow chevron on a dark square
function doorLogo(K, L, x, y, z, side) {
  K.box(0.1, 1.5, 1.5, x + side * 0.02, y, z, L.dark, { jitter: 0 });
  const g = new THREE.BufferGeometry();
  const v = [0, 0.5, -0.55, 0, -0.1, 0, 0, 0.15, 0, 0, 0.5, -0.55, 0, 0.15, 0, 0, 0.5, -0.25,
    0, -0.1, 0, 0, 0.5, 0.55, 0, 0.5, 0.25, 0, -0.1, 0, 0, 0.5, 0.25, 0, 0.15, 0];
  for (let i = 0; i < v.length; i += 3) { v[i] = x + side * 0.08; v[i + 1] = y - 0.25 + v[i + 1]; v[i + 2] = z + v[i + 2]; }
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  K.geo(g, L.accent, { jitter: 0 });
  const g2 = g.clone(); const p = g2.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, x + side * 0.08); // both windings
  const idx = []; for (let i = 0; i < p.count; i += 3) idx.push(i, i + 2, i + 1); g2.setIndex(idx);
  K.geo(g2, L.accent, { jitter: 0 });
}

// ------------------------------------------------------------------------------------ fire engine
function fireEngine(L) {
  const K = new Kit(11);
  const W = 5.0;
  // chassis + wheels
  K.box(W - 0.6, 1.2, 17, 0, 1.0, 0, L.dark);
  for (const z of [5.8, -3.2, -6.4]) for (const s of [-1, 1]) K.wheel(s * (W / 2 - 0.35), 1.15, z, 1.15, 0.9, L);
  // cab (crew cab)
  const roof = cab(K, L, 9, 5.2, W, 4.4, L.fire, {});
  K.box(W + 0.04, 0.55, 5.2, 0, 2.6, 6.4, L.band, { jitter: 0.01 });                         // white band on the cab
  // body with roller-shutter lockers
  K.rbox(W, 4.6, 12.6, 0, 1.2 + 2.3, -2.6, L.fire, { r: 0.35 });
  K.box(W + 0.04, 0.6, 12.6, 0, 2.6, -2.6, L.band, { jitter: 0.01 });                        // white band (body)
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) K.box(0.08, 2.0, 2.0, s * (W / 2 + 0.03), 4.3, 2.2 - k * 2.45, L.fire2, { jitter: 0.02 });
    K.box(0.1, 0.3, 12.6, s * (W / 2 + 0.03), 5.6, -2.6, L.steel, { jitter: 0.01 });
  }
  K.box(W - 0.4, 0.5, 12.0, 0, 5.95, -2.6, L.steel);                                         // roof deck
  K.box(W + 0.2, 0.6, 0.5, 0, 1.0, -9.0, L.dark);                                            // rear step
  K.box(1.6, 0.9, 1.6, 0, 6.6, 6.2, L.dark);                                                 // light bar base
  K.beacon(-1.25, roof + 0.55, 6.6, [1.0, 0.08, 0.05], 1);
  K.beacon(1.25, roof + 0.55, 6.6, [0.1, 0.25, 1.0], 2);
  K.beacon(-1.9, 5.9, -8.9, [1.0, 0.08, 0.05], 2);
  K.beacon(1.9, 5.9, -8.9, [0.1, 0.25, 1.0], 1);
  // turntable + ladder (bones): ladder rests forward over the cab, raises and swings to aim the monitor
  K.bone('turn', 'root', 0, 6.3, -6.0);
  K.cyl(1.8, 2.0, 0.9, 0, 6.65, -6.0, L.steel, { seg: 12 });
  K.box(2.6, 1.6, 2.4, 0, 7.6, -6.0, L.fire, { jitter: 0.02 });
  K.bone('ladder', 'turn', 0, 8.0, -6.0);
  for (const s of [-1, 1]) K.box(0.28, 0.5, 15, s * 0.95, 8.15, 1.0, L.steel, { jitter: 0.01 });
  for (let k = 0; k < 12; k++) K.box(1.9, 0.14, 0.18, 0, 8.05, -5.5 + k * 1.2, L.white, { jitter: 0 });
  K.box(1.2, 1.0, 1.0, 0, 8.4, 8.6, L.dark);                                                 // monitor nozzle
  K.meta.nozzle = { bone: 'ladder', p: new THREE.Vector3(0, 8.6, 9.2) };
  K.meta.len = 18; K.meta.wid = W; K.meta.h = 6.4;
  return K.build();
}

// ------------------------------------------------------------------------------------ wheeled excavator
function excavator(L) {
  const K = new Kit(12);
  const W = 5.0;
  K.box(W - 0.4, 1.4, 9.4, 0, 1.6, 0, L.dark);
  for (const z of [3.1, -3.1]) for (const s of [-1, 1]) { K.wheel(s * (W / 2 - 0.5), 1.25, z - 0.4, 1.25, 1.0, L); K.wheel(s * (W / 2 - 1.5), 1.25, z - 0.4, 1.25, 0.9, L); }
  K.box(W + 0.4, 1.0, 0.7, 0, 1.0, 5.1, L.accent);                                           // dozer blade
  K.chevrons(0.9, 0.6, 0, 1.0, -2.6, 2.6, L.accent, L.dark, 1);
  K.cyl(1.9, 1.9, 0.6, 0, 2.55, 0, L.steel, { seg: 14 });                                    // slew ring
  // house (yaw bone)
  K.bone('house', 'root', 0, 2.8, 0);
  K.rbox(W - 0.2, 2.6, 6.6, 0, 4.1, -0.9, L.body, { r: 0.4 });
  K.rbox(W, 2.2, 1.8, 0, 3.9, -4.4, L.body2, { r: 0.6 });                                    // counterweight
  for (let k = 0; k < 5; k++) K.box(0.9, 1.1, 0.08, -2 + k, 3.9, -5.32, k % 2 ? L.dark : L.accent, { jitter: 0 });
  K.rbox(2.3, 3.0, 2.8, -1.25, 6.4, 1.2, L.body, { r: 0.35 });                               // cab (front left)
  K.box(2.0, 1.5, 0.12, -1.25, 6.7, 2.62, L.glass, { jitter: 0.01 });
  K.box(0.12, 1.4, 2.0, -2.42, 6.7, 1.2, L.glass, { jitter: 0.01 });
  doorLogo(K, L, -2.4, 5.3, 1.3, -1);
  doorLogo(K, L, 2.45, 4.2, -1.4, 1);
  K.box(1.2, 0.8, 1.6, 1.2, 5.8, -2.2, L.dark);                                              // engine hood vent
  K.cyl(0.18, 0.18, 1.4, 1.6, 6.5, -2.6, L.dark, { seg: 6 });
  K.beacon(-1.25, 8.15, 0.6, [1.0, 0.55, 0.05], 3);
  // boom (pitch bone at the house front), stick, bucket
  K.bone('boom', 'house', 0.9, 4.6, 2.0);
  K.rbox(1.3, 1.6, 6.4, 0.9, 6.6, 4.6, L.accent, { r: 0.3, rx: -0.62 });
  K.rbox(1.25, 1.5, 5.4, 0.9, 7.9, 9.8, L.accent, { r: 0.3, rx: 0.32 });
  K.cyl(0.32, 0.32, 5.0, 0.9, 5.6, 5.2, L.steel, { rx: -0.9 });                               // ram
  K.bone('stick', 'boom', 0.9, 7.1, 12.3);
  K.rbox(1.0, 1.2, 6.2, 0.9, 4.4, 13.4, L.accent, { r: 0.25, rx: 1.18 });
  K.box(0.9, 0.2, 5.0, 0.9, 5.0, 13.0, L.dark, { rx: 1.18 });
  K.bone('bucket', 'stick', 0.9, 1.6, 14.6);
  K.rbox(2.4, 1.6, 1.4, 0.9, 1.0, 15.2, L.dark, { r: 0.3 });
  for (let k = 0; k < 4; k++) K.box(0.25, 0.6, 0.5, 0.15 + k * 0.5, 0.1, 15.6, L.steel, { jitter: 0 });
  K.bone('scoop', 'bucket', 0.9, 1.0, 15.2);                                                  // dirt in the bucket (scale 0/1)
  K.geo(new THREE.DodecahedronGeometry(1.0, 0).scale(1.1, 0.6, 0.6).translate(0.9, 1.7, 15.2), 0x6e6458, { jitter: 0.15 });
  K.meta.len = 14; K.meta.wid = W; K.meta.h = 8.2; K.meta.reach = 16;
  return K.build();
}

// ------------------------------------------------------------------------------------ tipper truck
function tipper(L) {
  const K = new Kit(13);
  const W = 5.0;
  K.box(W - 0.6, 1.2, 15.4, 0, 1.0, -0.2, L.dark);
  for (const z of [5.4, -3.4, -6.0]) for (const s of [-1, 1]) K.wheel(s * (W / 2 - 0.35), 1.15, z, 1.15, 0.95, L);
  const roof = cab(K, L, 8.0, 4.0, W, 3.8, L.body, {});
  doorLogo(K, L, -W / 2 - 0.02, 3.4, 6.3, -1); doorLogo(K, L, W / 2 + 0.02, 3.4, 6.3, 1);
  K.box(W + 0.05, 0.4, 4.0, 0, 2.2, 6.0, L.accent, { jitter: 0 });
  K.beacon(0, roof + 0.4, 6.4, [1.0, 0.55, 0.05], 3);
  K.box(0.5, 4.2, 0.5, -1.5, 4.0, 3.6, L.dark);                                                // exhaust stack
  // dump bed on a rear hinge
  K.bone('bed', 'root', 0, 2.0, -7.6);
  K.rbox(W, 0.5, 10.6, 0, 2.3, -2.5, L.accent, { r: 0.15 });
  for (const s of [-1, 1]) { K.rbox(0.35, 3.0, 10.6, s * (W / 2 - 0.17), 3.9, -2.5, L.accent, { r: 0.12 }); K.box(0.1, 0.6, 10.2, s * (W / 2 + 0.03), 4.5, -2.5, L.body, { jitter: 0 }); }
  K.rbox(W, 3.4, 0.4, 0, 4.0, 2.75, L.accent, { r: 0.12 });
  K.rbox(W - 0.4, 0.4, 3.0, 0, 5.8, 3.6, L.accent, { r: 0.1 });                                // cab guard
  K.box(W - 0.4, 2.9, 0.3, 0, 3.8, -7.75, L.body2);                                           // tailgate
  K.chevrons(0.8, 0.9, -W / 2 - 0.05, 3.0, -7.5, 2.4, L.accent, L.dark, -1);
  K.bone('load', 'bed', 0, 2.6, -2.5);
  { const g = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(2.1, 1.7, 4.8); g.translate(0, 2.5, -2.5); K.geo(g, 0x77695a, { jitter: 0.2 }); }
  K.meta.len = 16; K.meta.wid = W; K.meta.h = 6.0;
  return K.build();
}

// ------------------------------------------------------------------------------------ crane truck (carving)
function craneTruck(L) {
  const K = new Kit(14);
  const W = 5.0;
  K.box(W - 0.6, 1.2, 19.4, 0, 1.0, 0, L.dark);
  for (const z of [7.4, 1.6, -5.4, -7.8]) for (const s of [-1, 1]) K.wheel(s * (W / 2 - 0.35), 1.15, z, 1.15, 0.95, L);
  const roof = cab(K, L, 10, 4.2, W, 3.8, L.body, {});
  doorLogo(K, L, -W / 2 - 0.02, 3.4, 8.2, -1); doorLogo(K, L, W / 2 + 0.02, 3.4, 8.2, 1);
  K.box(W + 0.05, 0.4, 4.2, 0, 2.2, 7.9, L.accent, { jitter: 0 });
  K.beacon(-1.3, roof + 0.4, 8.3, [1.0, 0.55, 0.05], 3);
  K.beacon(1.3, roof + 0.4, 8.3, [1.0, 0.55, 0.05], 3);
  // flatbed with yellow rails
  K.box(W, 0.6, 11.6, 0, 2.0, -3.6, L.body2);
  for (const s of [-1, 1]) K.box(0.25, 0.7, 11.6, s * (W / 2 - 0.12), 2.65, -3.6, L.accent, { jitter: 0.01 });
  K.chevrons(0.8, 0.6, -W / 2 - 0.05, 2.0, -9.3, 2.0, L.accent, L.dark, -1);
  K.chevrons(0.8, 0.6, W / 2 + 0.05, 2.0, -9.3, 2.0, L.accent, L.dark, 1);
  // crates on the bed (4 slots, bones scaled 0/1)
  for (let k = 0; k < 4; k++) {
    const z = -1.0 - k * 2.6;
    K.bone('crate' + k, 'root', 0, 2.3, z);
    K.rbox(3.6, 2.0, 2.2, 0, 3.3, z, 0x8a6a42, { r: 0.12 });
    K.box(3.7, 0.25, 2.3, 0, 3.6, z, 0x5a4026, { jitter: 0 });
    K.box(0.1, 0.9, 0.9, 1.86, 3.3, z, L.accent, { jitter: 0 });
  }
  // outriggers (slide out sideways when working)
  for (const s of [-1, 1]) {
    K.bone(s < 0 ? 'outL' : 'outR', 'root', 0, 1.2, 0);
    for (const z of [3.2, -8.6]) { K.box(2.4, 0.6, 0.7, s * 1.6, 1.6, z, L.accent); K.box(0.5, 1.6, 0.5, s * 2.7, 0.9, z, L.steel); K.box(1.3, 0.25, 1.3, s * 2.7, 0.12, z, L.dark); }
  }
  // turret (yaw) behind the cab, telescopic box boom (pitch), hook on a rope (counter-rotated tip)
  K.bone('turret', 'root', 0, 2.6, 4.0);
  K.cyl(1.7, 1.9, 0.8, 0, 2.9, 4.0, L.steel, { seg: 12 });
  K.rbox(3.0, 2.2, 3.2, 0, 4.3, 4.0, L.body, { r: 0.35 });
  K.rbox(1.4, 1.6, 1.6, -1.0, 5.9, 3.6, L.glass, { r: 0.2 });
  K.bone('boom', 'turret', 0, 5.0, 4.0);
  K.rbox(1.5, 1.5, 12.6, 0, 5.4, 3.6 - 6.0, L.accent, { r: 0.2 });                              // base section points back over the bed (rest)
  K.rbox(1.15, 1.15, 12.0, 0, 5.4, 3.6 - 15.0, 0xe7a400, { r: 0.18 });
  K.cyl(0.35, 0.35, 5.6, 0, 4.2, 1.6, L.steel, { rx: 1.25 });
  K.box(1.6, 0.4, 2.4, 0, 6.3, -1.0, L.dark, { jitter: 0 });
  K.bone('tip', 'boom', 0, 5.4, 4.0 - 21.0);
  K.cyl(0.55, 0.55, 1.6, 0, 5.4, -17.0, L.dark, { rz: Math.PI / 2, seg: 8 });
  K.bone('rope', 'tip', 0, 5.4, -17.0);
  K.box(0.16, 1.0, 0.16, 0, 5.4 - 0.5, -17.0, 0x2a2a2a, { jitter: 0 });
  K.bone('hook', 'tip', 0, 5.4 - 1.0, -17.0);
  K.box(1.1, 1.1, 1.1, 0, 5.4 - 1.6, -17.0, L.accent, { jitter: 0 });
  K.box(0.3, 0.9, 0.3, 0, 5.4 - 2.6, -17.0, L.steel, { jitter: 0 });
  K.bone('load', 'hook', 0, 5.4 - 3.2, -17.0);
  // the lifted piece: a basalt plate with a raw flesh underside, strapped
  K.geo(new THREE.DodecahedronGeometry(1, 0).scale(2.6, 1.0, 2.2).translate(0, 5.4 - 4.6, -17.0), 0x2c2a2c, { jitter: 0.2 });
  K.geo(new THREE.DodecahedronGeometry(1, 0).scale(2.3, 0.8, 1.9).translate(0, 5.4 - 5.3, -17.0), 0xb0413c, { jitter: 0.2 });
  for (const s of [-1, 1]) K.box(0.18, 2.4, 0.18, s * 0.9, 5.4 - 3.9, -17.0, 0xf5b400, { jitter: 0, rz: s * 0.35 });
  K.meta.len = 20; K.meta.wid = W; K.meta.h = 6.0; K.meta.boomLen = 21; K.meta.boomH = 5.0;
  return K.build();
}

// ------------------------------------------------------------------------------------ buyer van (Rıza)
function buyerVan(L) {
  const K = new Kit(15);
  const W = 4.4;
  K.box(W - 0.6, 1.0, 10.4, 0, 1.0, 0, L.dark);
  for (const z of [3.6, -3.4]) for (const s of [-1, 1]) K.wheel(s * (W / 2 - 0.3), 0.95, z, 0.95, 0.8, L);
  K.rbox(W, 4.0, 8.0, 0, 1.0 + 2.0 + 0.3, -1.2, 0xe8e4da, { r: 0.5 });
  K.rbox(W, 2.8, 2.6, 0, 1.0 + 1.4 + 0.3, 4.0, 0xe8e4da, { r: 0.6 });
  K.box(W - 0.6, 1.2, 0.2, 0, 3.4, 5.2, L.glass, { rx: -0.5, jitter: 0 });
  for (const s of [-1, 1]) { K.box(0.1, 1.0, 1.6, s * (W / 2 + 0.02), 3.3, 3.9, L.glass, { jitter: 0 }); K.box(0.1, 0.7, 8.0, s * (W / 2 + 0.03), 2.6, -1.2, 0x2f6b3c, { jitter: 0 }); K.box(0.1, 0.22, 8.0, s * (W / 2 + 0.03), 3.15, -1.2, 0xd9a31e, { jitter: 0 }); }
  K.box(W + 0.2, 0.5, 0.4, 0, 1.0, 5.3, L.dark);
  K.box(W - 0.8, 0.4, 5.0, 0, 5.5, -1.6, 0x8c8f90);                                              // roof rack
  K.beacon(0, 5.9, 1.2, [1.0, 0.55, 0.05], 3);
  K.meta.len = 11; K.meta.wid = W; K.meta.h = 5.4;
  return K.build();
}

const BUILDERS = { fire: fireEngine, excavator, tipper, crane: craneTruck, van: buyerVan };
const cache = new Map();
// shared geometry per kind + livery: { geo, bones, beacons, meta }
export function vehicleKit(kind, livery = 'player') {
  const key = kind + ':' + livery;
  if (!cache.has(key)) cache.set(key, BUILDERS[kind](LIVERY[livery]));
  return cache.get(key);
}

// one instance: skinned mesh + named bones. Bones are posed in their parent's space.
export function makeVehicle(kind, livery, material) {
  const kit = vehicleKit(kind, livery);
  const bones = kit.bones.map((b) => { const o = new THREE.Bone(); o.name = b.name; return o; });
  kit.bones.forEach((b, i) => {
    if (b.parent < 0) bones[i].position.copy(b.p);
    else { bones[i].position.copy(b.p).sub(kit.bones[b.parent].p); bones[b.parent].add(bones[i]); }
  });
  const mesh = new THREE.SkinnedMesh(kit.geo, material);
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.boundingSphere = kit.geo.boundingSphere.clone();
  mesh.castShadow = false; mesh.receiveShadow = true;
  const J = {};
  bones.forEach((b) => { J[b.name] = b; b.userData.rest = b.position.clone(); });
  return { mesh, J, kit, kind, livery };
}

export function disposeKits() { for (const k of cache.values()) k.geo.dispose(); cache.clear(); }
