// Damage (W3, ARCH 6.3). Deterministic per (district, corpse placement, seed): the same inputs rebuild
// the same picture after a reload (prime). Buildings are never rebuilt: the tier of every building is
// written into the district mesh's aDmg / aBite attributes (staged arrays, swapped in at the hit), and
// the facade shader cuts bites / stumps. Extra geometry (exposed floor slabs, rebar, broken balconies,
// crater rim slabs, chunk scatter) is built time-sliced into per-district props meshes.
// Tiers by distance d from the corpse capsules (or a seeded impact point for non-chain districts):
//   d < 4 hidden (crushed) · d < 12 tier c (stump) · d < 30 tier b (corner bite) · tier a (soot + blown
//   windows) for buildings that own fire spots · rest intact. The Saat Kulesi is exempt.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { Builder, rng, capsDist, clamp } from './util.js';
import { GF, FH, EXTRAS, balconyGeo, CONCRETE } from './city.js';
import { DISTRICTS, impactPoint } from './layout.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color(), _dark = new THREE.Color(0x1d1a18);

let CHUNKS = null;
export function chunkProtos() {
  if (CHUNKS) return CHUNKS;
  const r = rng(77);
  CHUNKS = [];
  for (let k = 0; k < 10; k++) {
    const pts = [];
    const n = 7 + Math.floor(r() * 3);
    const sx = 0.7 + r() * 0.6, sy = 0.35 + r() * 0.5, sz = 0.7 + r() * 0.6;
    for (let i = 0; i < n; i++) pts.push(new THREE.Vector3((r() - 0.5) * sx, (r() - 0.5) * sy, (r() - 0.5) * sz));
    let g = new ConvexGeometry(pts);
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(new THREE.Vector3());
    g.translate(-c.x, -c.y, -c.z);
    CHUNKS.push(g);
  }
  for (let k = 0; k < 4; k++) {
    const pts = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.4, rad = 0.5 + r() * 0.5;
      pts.push(new THREE.Vector3(Math.cos(a) * rad, 0.06, Math.sin(a) * rad * 0.8), new THREE.Vector3(Math.cos(a) * rad, -0.06, Math.sin(a) * rad * 0.8));
    }
    let g = new ConvexGeometry(pts);
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    CHUNKS.push(g);
  }
  return CHUNKS;
}

// ---------------------------------------------------------------------------------------- planning
// sources: capsules [{ax,az,bx,bz,r}] that hurt this district (corpse inside the cell, or impact point)
function sourcesFor(did, placement, seed, mode) {
  if (mode === 'soot') { const p = impactPoint(did, seed + 3); return { caps: [{ ax: p.x, az: p.z, bx: p.x, bz: p.z, r: 0 }], soot: true }; }
  if (placement && placement.parts.some((p) => p.districtId === did)) return { caps: placement.capsules, soot: false };
  const p = impactPoint(did, seed);
  return { caps: [{ ax: p.x, az: p.z, bx: p.x, bz: p.z, r: 3 }], soot: false };
}
function rectCaps(b, caps) {
  let best = 1e9, bx = b.x, bz = b.z;
  for (const sx of [-0.5, 0, 0.5]) for (const sz of [-0.5, 0, 0.5]) {
    const x = b.x + sx * b.w, z = b.z + sz * b.d;
    const d = capsDist(x, z, caps);
    if (d < best) { best = d; bx = x; bz = z; }
  }
  return { d: best, x: bx, z: bz };
}

// Plan a district's damage: per building tier + staged attribute arrays + fire spots + rubble seeds.
// mode: 'hit' (chain or extra) | 'soot' (spread warning target: soot + window fires only)
export function planDamage(cd, placement, seed, mode = 'hit') {
  const { did, buildings } = cd;
  const geo = cd.mesh.geometry;
  const N = geo.attributes.position.count;
  const R = rng(seed * 131 + did * 7 + (mode === 'soot' ? 999 : 0));
  const src = sourcesFor(did, placement, seed, mode);
  const caps = src.caps;
  const plan = { did, mode, caps, tiers: [], fires: [], rubble: [], aDmg: new Float32Array(N * 4), aBite: new Float32Array(N * 2), applied: false };
  const D = DISTRICTS[did];
  const inCell = (x, z) => x > D.x0 - 8 && x < D.x1 + 8 && z > D.z0 - 8 && z < D.z1 + 8;
  for (const b of buildings) {
    const rc = rectCaps(b, caps);
    const d = rc.d;
    let t = null;
    if (src.soot) { if (d < 40 && R() < 0.75) t = { tier: 'a', soot: 0.5 + R() * 0.4 }; }
    else if (d < 4) t = { tier: 'x' };
    else if (d < 12) t = { tier: 'c', breakY: GF + (R() < 0.5 ? 0 : FH) - 1 + R() * 2 };
    else if (d < 30) {
      const sx = Math.sign(rc.x - b.x) || 1, sz = Math.sign(rc.z - b.z) || 1;
      const corner = [b.x + sx * b.w / 2, b.z + sz * b.d / 2];
      const y0 = GF + Math.max(0, Math.floor(b.floors * (0.15 + R() * 0.35))) * FH;
      const Rb = Math.min(b.w, b.d) * (0.75 + R() * 0.35) * (1.3 - d / 30 * 0.5);
      t = { tier: 'b', y0, corner, R: Rb, soot: 0.8, sx, sz };
    } else if (d < 55 && R() < 0.45) t = { tier: 'a', soot: 0.55 + R() * 0.45 };
    if (b.kind === 'warehouse' && t && t.tier === 'b') t = { tier: 'a', soot: 0.9 };
    if (!t) continue;
    t.b = b; t.d = d;
    plan.tiers.push(t);
  }
  // fire spots (closest first): stumps, bites, windows; up to 5
  const cand = [];
  for (const t of plan.tiers) {
    const b = t.b;
    if (t.tier === 'c') cand.push({ x: b.x + (R() - 0.5) * 4, y: 2.5, z: b.z + (R() - 0.5) * 4, s: 1.05 + R() * 0.4, d: t.d, kind: 'rubble' });
    else if (t.tier === 'b') cand.push({ x: t.corner[0] - t.sx * 3, y: t.y0 + 1.5, z: t.corner[1] - t.sz * 3, s: 1.0 + R() * 0.45, d: t.d, kind: 'building' });
    else if (t.tier === 'a') cand.push({ x: b.x, y: GF + Math.floor(b.floors * 0.5) * FH, z: b.z + b.row * b.d * 0.42, s: 0.62 + R() * 0.3, d: t.d + 10, kind: 'window' });
  }
  if (!src.soot && caps[0].r > 3) {   // the corpse itself smoulders where it lies in this district
    for (let k = 0; k < 3; k++) {
      const c = caps[Math.floor(R() * Math.min(3, caps.length))];
      const u = R();
      const x = c.ax + (c.bx - c.ax) * u, z = c.az + (c.bz - c.az) * u;
      if (inCell(x, z) && x > D.x0 && x < D.x1 && z > D.z0 && z < D.z1) cand.push({ x: x + (R() - 0.5) * 8, y: 3, z: z + (R() - 0.5) * 8, s: 1.2 + R() * 0.3, d: 5 + k, kind: 'corpse' });
    }
  }
  cand.sort((a, b) => a.d - b.d);
  // keep spots apart (>= 9 m) so each reads as its own fire
  for (const c of cand) { if (plan.fires.length >= 5) break; if (plan.fires.every((f) => Math.hypot(f.x - c.x, f.z - c.z) > 9)) plan.fires.push(c); }
  // rubble seeds for the gameplay piles: stumps (mounds), bite spills, street piles near the source
  if (!src.soot) {
    for (const t of plan.tiers) {
      const b = t.b;
      if (t.tier === 'c' || t.tier === 'x') plan.rubble.push({ x: b.x, z: b.z, radius: Math.min(10, Math.max(b.w, b.d) * 0.45), height: 4 + Math.min(6, b.floors * 0.7), count: 34 + b.floors * 4, sx: 1, sz: 1, color: b.color, d: t.d });
      else if (t.tier === 'b') plan.rubble.push({ x: t.corner[0] + t.sx * 3, z: t.corner[1] + t.sz * 3, radius: 4.5 + b.floors * 0.4, height: 3 + b.floors * 0.4, count: 16 + b.floors * 2, sx: 1, sz: 1, color: b.color, d: t.d });
    }
    // mounds under the corpse would be hidden: push them out of the capsules (+ a margin)
    for (const r of plan.rubble) {
      for (let it = 0; it < 12; it++) {
        const d0 = capsDist(r.x, r.z, caps);
        if (d0 >= r.radius * 0.55 + 1) break;
        const e = 1.5, gx = capsDist(r.x + e, r.z, caps) - capsDist(r.x - e, r.z, caps), gz = capsDist(r.x, r.z + e, caps) - capsDist(r.x, r.z - e, caps);
        const gl = Math.hypot(gx, gz) || 1;
        r.x += (gx / gl) * 3; r.z += (gz / gl) * 3;
      }
      r.x = Math.max(D.x0 + 2, Math.min(D.x1 - 2, r.x)); r.z = Math.max(D.z0 + 2, Math.min(D.z1 - 2, r.z));
    }
    plan.rubble.sort((a, b) => a.d - b.d);
    plan.rubble = plan.rubble.slice(0, 7);
  }
  return plan;
}

// ---------------------------------------------------------------------------------------- staging
// Writes the planned tiers into the staged attribute arrays. Generator: yields per building.
export function* stageAttributes(plan) {
  for (const t of plan.tiers) {
    const b = t.b;
    let dm = [0, 0, 0, 0], bt = [0, 0];
    if (t.tier === 'x') dm = [0.05, 0.9, 0, 0];   // breakLine at ground level: building gone
    else if (t.tier === 'c') dm = [t.breakY, 0.9, 0, 0];
    else if (t.tier === 'b') { dm = [t.y0, t.soot, t.corner[0] + 0.001, t.corner[1] + 0.001]; bt = [t.R, b.H]; }
    else dm = [0, t.soot, 0, 0];
    const A = plan.aDmg, Bt = plan.aBite;
    for (let v = b.v0, e = b.v0 + b.vN; v < e; v++) {
      A[v * 4] = dm[0]; A[v * 4 + 1] = dm[1]; A[v * 4 + 2] = dm[2]; A[v * 4 + 3] = dm[3];
      Bt[v * 2] = bt[0]; Bt[v * 2 + 1] = bt[1];
    }
    yield;
  }
}

function rubbleSpill(B, P, R, { x, z, radius, height, count, sx = 1, sz = 1, accents = [], rebar = 3 }) {
  for (let i = 0; i < count; i++) {
    const a = R() * Math.PI * 2, dd = Math.pow(R(), 0.7);
    const px = x + Math.cos(a) * dd * radius * sx, pz = z + Math.sin(a) * dd * radius * sz;
    const mound = height * Math.pow(Math.max(0, 1 - dd * dd), 0.9);
    const size = (0.8 + R() * 1.9) * (1 - dd * 0.4) * Math.min(1.7, radius / 4.5);
    const slab = R() < 0.16;
    const proto = slab ? P[10 + Math.floor(R() * 4)] : P[Math.floor(R() * 10)];
    _e.set((R() - 0.5) * (slab ? 1.4 : 3), R() * 6.28, (R() - 0.5) * (slab ? 1.4 : 3)); _q.setFromEuler(_e);
    const s = size * (slab ? 2.6 : 1.6);
    _s.set(s * (0.8 + R() * 0.5), s * (0.7 + R() * 0.5), s * (0.8 + R() * 0.5));
    _p.set(px, 0.2 + mound * (0.5 + R() * 0.5) + s * 0.1, pz);
    _m.compose(_p, _q, _s);
    let col = CONCRETE[Math.floor(R() * CONCRETE.length)];
    if (accents.length && R() < 0.3) col = accents[Math.floor(R() * accents.length)];
    B.geo(proto, col, _m, { jitter: 0.3 });
  }
  for (let i = 0; i < rebar; i++) {
    const a = R() * Math.PI * 2, dd = R() * 0.6;
    const len = 2 + R() * 3.5;
    const g = new THREE.CylinderGeometry(0.06, 0.06, len, 3, 1); g.translate(0, len / 2, 0);
    _e.set((R() - 0.5) * 1.8, R() * 6.28, (R() - 0.5) * 1.8); _q.setFromEuler(_e); _s.set(1, 1, 1);
    _p.set(x + Math.cos(a) * radius * dd * sx, 0.2 + height * (1 - dd) * 0.5, z + Math.sin(a) * radius * dd * sz);
    _m.compose(_p, _q, _s);
    B.geo(g, 0x3a2c25, _m, { jitter: 0.2 });
  }
}

// Builds the props (slabs, rebar, balconies, crater rim, chunk scatter) for a plan. Generator: yields per
// building; the final merge is its own slice. Result in plan.props = { facade, rubble, chunks } meshes.
export function* buildProps(plan, ctx) {
  const FB = new Builder(plan.did * 11 + 5, EXTRAS);
  const RB = new Builder(plan.did * 13 + 7);
  const R = rng(plan.did * 977 + 31 + (plan.mode === 'soot' ? 5 : 0));
  const P = chunkProtos();
  const dist = [plan.did + 1];
  for (const t of plan.tiers) {
    const b = t.b;
    if (t.tier === 'b' || t.tier === 'c') {
      let dm, bt = [0, 0];
      if (t.tier === 'c') dm = [t.breakY + 0.6, 0.9, 0, 0];
      else { dm = [t.y0 + 0.6, t.soot, t.corner[0] + 0.001, t.corner[1] + 0.001]; bt = [t.R * 0.92, b.H]; }
      const top = t.tier === 'c' ? Math.min(b.H, t.breakY + 2) : b.H;
      const yStart = t.tier === 'b' ? Math.max(GF, t.y0 - FH) : GF;
      for (let y = yStart; y <= top + 0.5; y += FH) {
        const g = new THREE.BoxGeometry(b.w - 0.3, 0.34, b.d - 0.3);
        g.rotateY(b.rot); g.translate(b.x, y - 0.17, b.z);
        FB.push(g, 0x77736d, { aFac: [5, 0, 0, 0], aDmg: dm, aBite: bt, aDist: dist, jitter: 0.04 });
      }
    }
    if (t.tier === 'b') {
      const RR = rng(b.id + 5);
      for (let y = Math.max(GF, t.y0); y < b.H; y += FH) {
        const tt = Math.pow(clamp((y - t.y0) / (b.H + 6 - t.y0), 0, 1), 1 / 1.6);
        const rad = t.R * tt * 0.78;
        for (let k = 0; k < 3; k++) {
          const a = RR() * Math.PI / 2;
          const px = t.corner[0] - t.sx * Math.cos(a) * rad, pz = t.corner[1] - t.sz * Math.sin(a) * rad;
          if (Math.abs(px - b.x) > b.w / 2 || Math.abs(pz - b.z) > b.d / 2) continue;
          const len = 1.2 + RR() * 2.6;
          const g = new THREE.CylinderGeometry(0.07, 0.07, len, 3, 1); g.translate(0, -len / 2, 0);
          _e.set((RR() - 0.5) * 0.7, 0, (RR() - 0.5) * 0.7); _q.setFromEuler(_e); _s.set(1, 1, 1); _p.set(px, y - 0.2, pz);
          _m.compose(_p, _q, _s); RB.geo(g, 0x3a2a22, _m, { jitter: 0.2 });
        }
      }
      if (b.balcony) {
        const g = balconyGeo(Math.min(5, b.w * 0.4));
        g.rotateX(0.75 + RR() * 0.3);
        _q.setFromEuler(_e.set(0, b.rot, 0)); _s.set(1, 1, 1);
        _p.set(t.corner[0] - t.sx * Math.min(5, b.w * 0.4) * 0.6, t.y0 + FH, b.z + b.row * b.d / 2);
        _m.compose(_p, _q, _s); RB.geo(g, 0xd8d2c6, _m, { jitter: 0.06 });
      }
      // small permanent spill at the bite (the big gameplay piles live in rubble.js)
      rubbleSpill(RB, P, RR, { x: t.corner[0] + t.sx * 2, z: t.corner[1] + t.sz * 2, radius: 3, height: 0.8, count: 6, accents: [b.color], rebar: 1 });
    }
    yield;
  }
  // crater rim: pushed-up asphalt slabs along the capsules, inside this district
  const D = DISTRICTS[plan.did];
  const inside = (x, z) => x > D.x0 - 6 && x < D.x1 + 6 && z > D.z0 - 6 && z < D.z1 + 6;
  if (plan.mode !== 'soot') {
    for (const c of plan.caps) {
      const len = Math.hypot(c.bx - c.ax, c.bz - c.az);
      if (len < 1) {   // impact point: a ring of slabs
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2 + R() * 0.3, rr = 7 + R() * 3;
          const x = c.ax + Math.cos(a) * rr, z = c.az + Math.sin(a) * rr;
          const g = new THREE.BoxGeometry(3 + R() * 3, 0.5, 2.5 + R() * 2.5); g.translate(0, 0, -1.5);
          _q.setFromEuler(_e.set(-(0.25 + R() * 0.5), Math.atan2(Math.cos(a), Math.sin(a)) + (R() - 0.5) * 0.6, (R() - 0.5) * 0.3, 'YXZ'));
          _p.set(x, 0.1, z); _s.set(1, 1, 1); _m.compose(_p, _q, _s); RB.geo(g, 0x4a4a4c, _m, { jitter: 0.15 });
        }
        continue;
      }
      const n = Math.max(2, Math.ceil(len / 4));
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const px = c.ax + (c.bx - c.ax) * t, pz = c.az + (c.bz - c.az) * t;
        for (const side of [-1, 1]) {
          const nx = -(c.bz - c.az) / len * side, nz = (c.bx - c.ax) / len * side;
          const x = px + nx * (c.r + 1.2 + R() * 1.5), z = pz + nz * (c.r + 1.2 + R() * 1.5);
          if (!inside(x, z) || capsDist(x, z, plan.caps) < 0.5) continue;
          const w = 3 + R() * 4, dd = 2.5 + R() * 3.5;
          const g = new THREE.BoxGeometry(w, 0.55, dd); g.translate(0, 0, -dd / 2);
          _q.setFromEuler(_e.set(-(0.25 + R() * 0.5), Math.atan2(nx, nz) + (R() - 0.5) * 0.6, (R() - 0.5) * 0.3, 'YXZ'));
          _p.set(x, 0.1, z); _s.set(1, 1, 1); _m.compose(_p, _q, _s);
          RB.geo(g, R() < 0.5 ? 0x3a3b3e : 0x6e6a64, _m, { jitter: 0.15 });
        }
      }
    }
  }
  yield;
  // chunk scatter (instanced, 3 sizes) around the sources
  const chunks = [];
  if (plan.mode !== 'soot') {
    const nTry = Math.round(500 * (ctx.particleScale ?? 1));
    for (let k = 0; k < nTry; k++) {
      const c = plan.caps[Math.floor(R() * plan.caps.length)];
      const t = R();
      const px = c.ax + (c.bx - c.ax) * t, pz = c.az + (c.bz - c.az) * t;
      const a = R() * 6.28, dist2 = c.r + Math.pow(R(), 1.8) * 46;
      const x = px + Math.cos(a) * dist2, z = pz + Math.sin(a) * dist2;
      if (!inside(x, z)) continue;
      const d = capsDist(x, z, plan.caps);
      if (d < 0.5) continue;
      const sr = R();
      const s = d < 10 ? (sr < 0.25 ? 2.8 + R() * 1.6 : sr < 0.65 ? 1.2 + R() * 0.9 : 0.45 + R() * 0.4) : (sr < 0.08 ? 1.6 + R() : 0.35 + R() * 0.55);
      chunks.push({ x, z, s, rx: R() * 6, ry: R() * 6, rz: R() * 6, col: CONCRETE[Math.floor(R() * CONCRETE.length)] });
    }
  }
  yield;
  const out = { facade: null, rubble: null, chunks: null };
  if (FB.parts.length) { out.facade = new THREE.Mesh(FB.build(), ctx.matD); out.facade.castShadow = true; out.facade.receiveShadow = true; out.facade.name = 'dmgFacade' + plan.did; }
  yield;
  if (RB.parts.length) { out.rubble = new THREE.Mesh(RB.build(), ctx.rubMat); out.rubble.castShadow = true; out.rubble.receiveShadow = true; out.rubble.name = 'dmgRubble' + plan.did; }
  if (chunks.length) {
    const cm = new THREE.InstancedMesh(ctx.chunkGeo, ctx.chunkMat, chunks.length);
    chunks.forEach((p, i) => { _q.setFromEuler(_e.set(p.rx, p.ry, p.rz)); _p.set(p.x, 0.2 + p.s * 0.25, p.z); _s.set(p.s * 1.3, p.s * 0.8, p.s); _m.compose(_p, _q, _s); cm.setMatrixAt(i, _m); cm.setColorAt(i, _c.set(p.col)); });
    cm.castShadow = true; cm.receiveShadow = true; cm.name = 'chunks' + plan.did;
    cm.computeBoundingSphere();
    out.chunks = cm;
  }
  plan.props = out;
}

// ---------------------------------------------------------------------------------------- job queue
// Time-sliced builders: run(budgetMs) advances jobs until the budget is spent; finish(key) completes one.
export class JobQueue {
  constructor() { this.jobs = []; }
  add(key, gen, onDone) { this.jobs.push({ key, gen, onDone }); }
  has(key) { return this.jobs.some((j) => j.key === key); }
  cancel(key) { this.jobs = this.jobs.filter((j) => j.key !== key); }
  step(j) { const r = j.gen.next(); if (r.done) { this.jobs.splice(this.jobs.indexOf(j), 1); j.onDone && j.onDone(); return true; } return false; }
  run(budgetMs = 4) {
    const t0 = performance.now();
    while (this.jobs.length && performance.now() - t0 < budgetMs) this.step(this.jobs[0]);
  }
  finish(key) {
    for (let j = this.jobs.find((q) => q.key === key); j; j = this.jobs.find((q) => q.key === key)) {
      while (!this.step(j)) { /* run to completion */ }
    }
  }
  finishAll() { while (this.jobs.length) this.step(this.jobs[0]); }
}

// ---------------------------------------------------------------------------------------- instanced dressing
// hides / bends trees, lamps and parked cars near the sources; restore() puts them back
export function dressInstances(plan, city) {
  const touched = [];
  const D = DISTRICTS[plan.did];
  const inside = (x, z) => x > D.x0 - 8 && x < D.x1 + 8 && z > D.z0 - 8 && z < D.z1 + 8;
  const R = rng(plan.did * 41 + 3);
  const soot = plan.mode === 'soot';
  const visit = (mesh, fn) => {
    const items = mesh.userData.items;
    let changed = false;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!inside(it.x, it.z)) continue;
      const d = capsDist(it.x, it.z, plan.caps);
      if (fn(it, i, d)) { changed = true; touched.push([mesh, i]); }
    }
    if (changed) { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; }
  };
  if (soot) return touched;
  for (const v of city.vegetation) visit(v, (it, i, d) => {
    if (d < 2) { _m.makeScale(0, 0, 0); v.setMatrixAt(i, _m); return true; }
    if (d < 16) {
      _q.setFromEuler(_e.set((R() - 0.5) * 0.4 + Math.PI / 2 * 0.92, Math.atan2(it.x - plan.caps[0].ax, it.z - plan.caps[0].az) + (R() - 0.5) * 1.5, 0));
      _p.set(it.x, 0.3, it.z); _s.setScalar(it.s || 1); _m.compose(_p, _q, _s); v.setMatrixAt(i, _m); return true;
    }
    return false;
  });
  visit(city.lampMesh, (it, i, d) => {
    if (d < 1) { _m.makeScale(0, 0, 0); city.lampMesh.setMatrixAt(i, _m); return true; }
    if (d < 20) { _q.setFromEuler(_e.set(0.5 + R() * 0.6, it.ry + (R() - 0.5), (R() - 0.5) * 0.6)); _p.set(it.x, 0.2, it.z); _s.setScalar(1); _m.compose(_p, _q, _s); city.lampMesh.setMatrixAt(i, _m); return true; }
    return false;
  });
  visit(city.parkedMesh, (it, i, d) => {
    if (d < -1) { _m.makeScale(0, 0, 0); city.parkedMesh.setMatrixAt(i, _m); return true; }
    if (d < 22) {
      const flip = R() < 0.4, crush = d < 8 ? 0.45 : 1;
      _q.setFromEuler(_e.set(0, it.ry + (R() - 0.5) * 1.2, flip ? Math.PI : 0));
      _p.set(it.x, flip ? 2.1 * crush * 1.2 : 0, it.z); _s.set(1.2, 1.2 * crush, 1.2); _m.compose(_p, _q, _s);
      city.parkedMesh.setMatrixAt(i, _m);
      _c.set(it.col).lerp(_dark, 0.7); city.parkedMesh.setColorAt(i, _c);
      return true;
    }
    return false;
  });
  return touched;
}
export function restoreInstances(touched) {
  const meshes = new Set();
  for (const [mesh, i] of touched) {
    const base = mesh.userData.base;
    for (let k = 0; k < 16; k++) mesh.instanceMatrix.array[i * 16 + k] = base[i * 16 + k];
    const it = mesh.userData.items[i];
    if (mesh.instanceColor && it.col !== undefined) mesh.setColorAt(i, _c.set(it.col));
    meshes.add(mesh);
  }
  for (const m of meshes) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
}
