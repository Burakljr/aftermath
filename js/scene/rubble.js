// Gameplay rubble (W3): per-district piles that shrink in 3 discrete steps (66 / 33 / 0 % of
// rubble / rubbleMax) with a dust thud per step, plus traffic cones and barriers that stay while
// rubble > 0 and pop out one by one (80 ms stagger) when the road opens ("Yol açık").
// Piles are one merged geometry per district with chunks sorted bottom-up, so a step is just a
// smaller drawRange (no rebuild, no allocation).
import * as THREE from 'three';
import { Builder, rng, capsDist } from './util.js';
import { chunkProtos } from './damage.js';
import { CONCRETE } from './city.js';
import { DISTRICTS, XR, ZR } from './layout.js';

const LIGHT = [0xcac2b2, 0xb8b0a0, 0xd8cfbd, 0xa8a090, 0xe0d6c2, 0x9a9282];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

function coneGeo() {
  const B = new Builder(182);
  B.cyl(0.05, 0.22, 0.75, 0, 0.42, 0, 0xf0601c, { seg: 6 });
  B.cyl(0.12, 0.15, 0.12, 0, 0.45, 0, 0xf4f4f4, { seg: 6 });
  B.box(0.5, 0.05, 0.5, 0, 0.03, 0, 0x1a1a1a);
  const g = B.build(); g.scale(3.4, 3.4, 3.4); return g;
}
function barrierGeo() {
  const B = new Builder(181);
  B.box(0.18, 1.0, 0.18, -1.6, 0.5, 0, 0x3a3a3a); B.box(0.18, 1.0, 0.18, 1.6, 0.5, 0, 0x3a3a3a);
  for (let k = 0; k < 5; k++) B.box(0.7, 0.42, 0.12, -1.4 + k * 0.7, 0.85, 0, k % 2 ? 0xf2f0ea : 0xd0281c, { jitter: 0 });
  const g = B.build(); g.scale(2.4, 2.4, 2.4); return g;
}

// a visible road point on the district's perimeter near (x, z), outside the corpse capsules
function streetPileSpot(did, x, z, caps) {
  const D = DISTRICTS[did];
  const xw = D.col === 0 ? XR.W : XR.A, xe = D.col === 0 ? XR.A : XR.E;
  const zn = [ZR.P, ZR.S1, ZR.S2][D.row], zs = [ZR.S1, ZR.S2, ZR.R][D.row];
  let best = null, bd = 1e9;
  for (let k = 0; k <= 8; k++) {
    const fz = D.z0 + 10 + (D.z1 - D.z0 - 20) * k / 8, fx = D.x0 + 10 + (D.x1 - D.x0 - 20) * k / 8;
    for (const c of [{ x: xw, z: fz, axis: 'z' }, { x: xe, z: fz, axis: 'z' }, { x: fx, z: zn, axis: 'x' }, { x: fx, z: zs, axis: 'x' }]) {
      if (caps && capsDist(c.x, c.z, caps) < 12) continue;
      // prefer the near side (+z) and side roads: the gameplay camera sees them
      const d = Math.hypot(c.x - x, c.z - z) - (c.z === zs ? 14 : 0) + (c.z === zn ? 12 : 0);
      if (d < bd) { bd = d; best = c; }
    }
  }
  return best || { x: xe, z: D.cz, axis: 'z' };
}

export function createRubble(scene, { fx, quality }) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, emissive: new THREE.Color(0x2c2822) });   // dusty heaps stay readable at blue hour
  const P = chunkProtos();
  const piles = [];            // per district: { mesh, steps:[v1,v2,v3], level, centers }
  const CONES_PER = 10, BARR_PER = 4;
  const cones = new THREE.InstancedMesh(coneGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), 6 * CONES_PER);
  const barriers = new THREE.InstancedMesh(barrierGeo(), cones.material, 6 * BARR_PER);
  for (const m of [cones, barriers]) { m.frustumCulled = false; m.castShadow = false; m.receiveShadow = true; _m.makeScale(0, 0, 0); for (let i = 0; i < m.count; i++) m.setMatrixAt(i, _m); scene.add(m); }
  cones.name = 'cones'; barriers.name = 'barriers';
  const coneState = Array.from({ length: 6 }, () => ({ items: [], on: false, t: 0, popping: false }));

  function* build(did, plan, seed) {
    clear(did);
    if (!plan.rubble.length) return;
    const R = rng(seed * 17 + did * 3 + 1);
    const items = [];
    const addPile = ({ x, z, radius, height, count, sx = 1, sz = 1, color, light = 0.8 }, layer) => {
      for (let i = 0; i < count; i++) {
        const a = R() * Math.PI * 2, dd = Math.pow(R(), 0.7);
        const px = x + Math.cos(a) * dd * radius * sx, pz = z + Math.sin(a) * dd * radius * sz;
        const mound = height * Math.pow(Math.max(0, 1 - dd * dd), 0.9);
        const size = (0.7 + R() * 1.5) * (1 - dd * 0.4) * Math.min(1.25, radius / 6);
        const slab = R() < 0.07;
        const proto = slab ? P[10 + Math.floor(R() * 4)] : P[Math.floor(R() * 10)];
        const s = size * (slab ? 2.6 : 1.6);
        const y = 0.2 + mound * (0.5 + R() * 0.5) + s * 0.1;
        let col = LIGHT[Math.floor(R() * LIGHT.length)];
        if (R() > light) col = color; // mostly light concrete: the heaps read apart from the dark carcass (review V6)
        items.push({ proto, x: px, y, z: pz, rx: (R() - 0.5) * (slab ? 1.4 : 3), ry: R() * 6.28, rz: (R() - 0.5) * (slab ? 1.4 : 3), sx: s * (0.8 + R() * 0.5), sy: s * (0.7 + R() * 0.5), sz: s * (0.8 + R() * 0.5), col, h: mound, layer });
      }
    };
    // collapsed-building piles inside the block: thirds by height (the tallest go first)
    const inner = plan.rubble.slice().sort((a, b) => a.height - b.height);
    inner.forEach((sd, i) => addPile(sd, Math.min(2, Math.floor((i / Math.max(1, inner.length)) * 3))));
    // review 2 F4: three big pale heaps on the street in front of the block, one per third of the job. Each step
    // removes a whole heap (with a dust puff), and the barriers go when the last one is gone ("Yol açık")
    const src = plan.caps[0];
    const sp = streetPileSpot(did, (src.ax + src.bx) / 2, (src.az + src.bz) / 2, plan.caps[0].r > 3 ? plan.caps : null);
    const al = sp.axis === 'z' ? [0, 1] : [1, 0];
    const heaps = [];
    for (let k = 0; k < 3; k++) {
      const o = (k - 1) * 30;
      let hx = sp.x + al[0] * o, hz = sp.z + al[1] * o;
      const D = DISTRICTS[did];
      hx = Math.max(D.x0 - 4, Math.min(D.x1 + 4, hx)); hz = Math.max(D.z0 - 4, Math.min(D.z1 + 4, hz));
      if (plan.caps[0].r > 3 && capsDist(hx, hz, plan.caps) < 10) continue;
      heaps.push({ x: hx, z: hz });
    }
    if (!heaps.length) heaps.push({ x: sp.x, z: sp.z });
    // the heap nearest the spot stays until the end (layer 0); the outer ones go first
    heaps.sort((a, b) => Math.hypot(a.x - sp.x, a.z - sp.z) - Math.hypot(b.x - sp.x, b.z - sp.z));
    const heapC = [[], [], []];
    heaps.forEach((hp, k) => {
      const layer = heaps.length === 1 ? 0 : heaps.length === 2 ? k * 2 : k;
      addPile({ x: hp.x, z: hp.z, radius: 13, height: 7.5, count: 64, sx: sp.axis === 'z' ? 0.75 : 1.25, sz: sp.axis === 'z' ? 1.25 : 0.75, color: 0x9a9284, light: 0.92 }, layer);
      heapC[layer].push([hp.x, hp.z]);
    });
    yield;
    items.sort((a, b) => a.layer - b.layer || a.h - b.h);
    const B = new Builder(did * 7 + 9);
    const steps = [0, 0, 0];
    let v = 0;
    items.forEach((it) => {
      _e.set(it.rx, it.ry, it.rz); _q.setFromEuler(_e); _s.set(it.sx, it.sy, it.sz); _p.set(it.x, it.y, it.z);
      _m.compose(_p, _q, _s);
      B.geo(it.proto, it.col, _m, { jitter: 0.3 });
      v += it.proto.attributes.position.count;
      for (let L = it.layer; L < 3; L++) steps[L] = v;
    });
    yield;
    const mesh = new THREE.Mesh(B.build(), mat);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'pile' + did; mesh.visible = false;
    scene.add(mesh);
    // cones across the road beyond both ends of the heaps, barriers in front of them
    const cs = coneState[did];
    cs.items = [];
    const along = al, across = sp.axis === 'z' ? [1, 0] : [0, 1];
    const hw = sp.axis === 'z' && sp.x === XR.A ? 7 : 5;
    const reach = heaps.reduce((m, hp) => Math.max(m, Math.abs((hp.x - sp.x) * al[0] + (hp.z - sp.z) * al[1])), 0) + 22;
    for (const side of [-1, 1]) {
      const cx = sp.x + along[0] * side * reach, cz = sp.z + along[1] * side * reach;
      for (let k = 0; k < CONES_PER / 2; k++) { const o = -hw + (2 * hw * k) / (CONES_PER / 2 - 1); cs.items.push({ kind: 0, x: cx + across[0] * o, z: cz + across[1] * o, ry: 0 }); }
      for (let k = 0; k < BARR_PER / 2; k++) { const o = (k - 0.5) * hw; cs.items.push({ kind: 1, x: cx + along[0] * side * 2.2 + across[0] * o, z: cz + along[1] * side * 2.2 + across[1] * o, ry: sp.axis === 'z' ? 0 : Math.PI / 2 }); }
    }
    piles[did] = { mesh, steps, level: 3, sp, heapC, centers: plan.rubble.slice(0, 4).map((r) => [r.x, r.z]).concat(heaps.map((hp) => [hp.x, hp.z])) };
    setLevelRaw(did, 3);
  }
  function setLevelRaw(did, L) {
    const p = piles[did];
    if (!p) return;
    p.level = L;
    p.mesh.geometry.setDrawRange(0, L === 0 ? 0 : p.steps[L - 1]);
    p.mesh.visible = L > 0 && p.shown !== false;
  }
  function placeCones(did, scale) {
    const cs = coneState[did];
    let ci = did * CONES_PER, bi = did * BARR_PER;
    cs.items.forEach((it, k) => {
      let s = scale;
      if (cs.popping) { const tk = cs.t - k * 0.08; s = tk <= 0 ? 1 : tk < 0.18 ? 1 + 0.25 * Math.sin(tk / 0.18 * Math.PI) * (1 - tk / 0.18) - tk / 0.18 : 0; s = Math.max(0, s); }
      _q.setFromEuler(_e.set(0, it.ry, 0)); _p.set(it.x, 0.02, it.z); _s.setScalar(s); _m.compose(_p, _q, _s);
      if (it.kind === 0) cones.setMatrixAt(ci++, _m); else barriers.setMatrixAt(bi++, _m);
    });
    cones.instanceMatrix.needsUpdate = true; barriers.instanceMatrix.needsUpdate = true;
  }
  function clear(did) {
    const p = piles[did];
    if (p) { scene.remove(p.mesh); p.mesh.geometry.dispose(); piles[did] = null; }
    const cs = coneState[did];
    cs.on = false; cs.popping = false; placeCones(did, 0); cs.items = [];
  }
  const api = {
    build,
    clear,
    has: (did) => !!piles[did],
    // show piles (after the hit)
    show(did, on) { const p = piles[did]; if (p) { p.shown = on; p.mesh.visible = on && p.level > 0; } },
    // frac = rubble / rubbleMax; returns true on a step change
    setFrac(did, frac, juice = true) {
      const p = piles[did];
      if (!p) return false;
      const L = frac > 0.66 ? 3 : frac > 0.33 ? 2 : frac > 0.0001 ? 1 : 0;
      if (L === p.level) return false;
      const down = L < p.level;
      const was = p.level;
      setLevelRaw(did, L);
      // the removed heap goes up in a dust puff (review 2 F4)
      if (down && juice && fx) {
        for (let k = L; k < was && k < 3; k++) for (const [x, z] of p.heapC[k]) fx.dust(x, 1.5, z, 10, { size: 11, spread: 9, rise: 6 });
        for (const [x, z] of p.centers.slice(0, 2)) fx.dust(x, 1.2, z, 4, { size: 6, spread: 5, rise: 4 });
      }
      return true;
    },
    setCones(did, on, juice = true) {
      const cs = coneState[did];
      if (on === cs.on && !cs.popping) return;
      cs.on = on;
      if (on) { cs.popping = false; placeCones(did, 1); }
      else if (juice) { cs.popping = true; cs.t = 0; }
      else { cs.popping = false; placeCones(did, 0); }
    },
    update(dt) {
      for (let did = 0; did < 6; did++) {
        const cs = coneState[did];
        if (!cs.popping) continue;
        cs.t += dt;
        placeCones(did, 1);
        if (cs.t > cs.items.length * 0.08 + 0.3) { cs.popping = false; placeCones(did, 0); }
      }
    },
    level: (did) => (piles[did] ? piles[did].level : 0),
    streetPile: (did) => (piles[did] ? piles[did].sp : null),
    heaps: (did) => (piles[did] ? piles[did].heapC.flat() : []),
    centers: (did) => (piles[did] ? piles[did].centers : []),
    meshes: () => piles.filter(Boolean).map((p) => p.mesh),
  };
  void quality;
  return api;
}
