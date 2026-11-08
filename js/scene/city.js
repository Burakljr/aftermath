// Static city (W2): six district identities on the Kordon layout (layout.js), ground with roads and the
// promenade, sea, far shore, landmarks (Saat Kulesi, port cranes, Kültürpark tower, ferry), vegetation,
// street lamps, parked cars, pedestrians and low far-city filler.
// Each district is ONE merged mesh (one draw call). Every building keeps its vertex range so damage.js
// can write damage tiers into the aDmg / aBite attributes at attack time without rebuilding geometry.
import * as THREE from 'three';
import { Builder, rng, mergeNonIndexed, clamp, fbm2, capsDist } from './util.js';
import { facadeMaterial, groundMaterial, seaMaterial, cityUniforms } from './materials.js';
import { DISTRICTS, ROADS, XR, ZR, COAST, YARD, TOWER } from './layout.js';

export const GF = 4.0, FH = 3.0;
export const EXTRAS = { uv: 2, aFac: 4, aDmg: 4, aBite: 2, aDist: 1 };
const PLASTER = [0xf2efe8, 0xf0ece4, 0xe2d6bd, 0xd9c08a, 0xd4ae96, 0xc4cbcc, 0xe0d39a, 0xb8a58c, 0xb3c0c6, 0xeeeae2, 0xa9a49c, 0xc99a82, 0xe6dccb, 0xbfc8b4, 0xf3f1ec, 0x9fa7ab, 0xd8c3b0, 0xcfd6d8];
const PASTEL = [0xe8d2b8, 0xd8b8a0, 0xc8d0c0, 0xe6dcc0, 0xd0c4d8, 0xf0e2c8, 0xc0ccd4, 0xe2c8a8];
const STONE = [0xd8cdb5, 0xcfc4ae, 0xe2dacb, 0xbdb4a2];
const BAZAAR = [0xd9b48a, 0xc89a72, 0xe0c49a, 0xb88a64, 0xd4a878, 0xe6d0aa, 0xa87a58];
const ROOF_FLAT = [0x8f8b84, 0x9a948a, 0x85817a, 0xa29a8e];
const TERRACOTTA = [0x9a5a44, 0x8f523f, 0xa3624b, 0x87503f];
export const CONCRETE = [0x8d8a86, 0x7a7774, 0x9b9893, 0x6a6764, 0xa6a39d, 0x86827c];
export const CAR_COLS = [0xe8e6e0, 0xe8e6e0, 0xdcdad4, 0xb8bbbe, 0x8a8d90, 0x3c3f44, 0x23262b, 0x8a2a24, 0x2a3d5e, 0xd8d2c0, 0x4a5a48, 0xc8a238, 0x5a7a9a];

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

// ------------------------------------------------------------------------------------------ geometry helpers
export function balconyGeo(width, depth = 1.35) {
  const slab = new THREE.BoxGeometry(width, 0.2, depth); slab.translate(0, -0.1, depth / 2);
  const front = new THREE.BoxGeometry(width, 1.0, 0.12); front.translate(0, 0.5, depth - 0.06);
  return mergeNonIndexed([slab.toNonIndexed(), front.toNonIndexed()]);
}
function wallPlane(width, y0, y1, bays, v0, v1) {
  const g = new THREE.PlaneGeometry(width, y1 - y0);
  g.translate(0, (y0 + y1) / 2, 0);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * bays, v0 + uv.getY(i) * (v1 - v0));
  return g;
}
function hipRoof(w, d, h, over = 0.55) {
  const x = w / 2 + over, z = d / 2 + over;
  const long = w >= d;
  const rl = long ? Math.max(0, x - z) : Math.max(0, z - x);
  const A = [-x, 0, -z], B = [x, 0, -z], Cc = [x, 0, z], D = [-x, 0, z];
  const R1 = long ? [-rl, h, 0] : [0, h, -rl], R2 = long ? [rl, h, 0] : [0, h, rl];
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  if (long) { tri(D, Cc, R2); tri(D, R2, R1); tri(B, A, R1); tri(B, R1, R2); tri(A, D, R1); tri(Cc, B, R2); }
  else { tri(Cc, B, R1); tri(Cc, R1, R2); tri(A, D, R2); tri(A, R2, R1); tri(D, Cc, R2); tri(B, A, R1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2));
  return g;
}
function gableRoof(w, d, h, over = 0.4) {
  // ridge along x
  const x = w / 2 + over, z = d / 2 + over;
  const A = [-x, 0, -z], B = [x, 0, -z], Cc = [x, 0, z], D = [-x, 0, z], R1 = [-x, h, 0], R2 = [x, h, 0];
  const pos = [...D, ...Cc, ...R2, ...D, ...R2, ...R1, ...B, ...A, ...R1, ...B, ...R1, ...R2, ...A, ...D, ...R1, ...Cc, ...B, ...R2];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2));
  return g;
}

// Build one building (intact) into builder B (world space). Returns { H }.
export function addBuilding(B, b) {
  const H = GF + b.floors * FH;
  const mtx = new THREE.Matrix4().makeRotationY(b.rot);
  mtx.setPosition(b.x, 0, b.z);
  const lit = b.lit;
  const dist = [b.did + 1];
  const facW = (style, wallType) => style + wallType * 4;
  const push = (g, color, fac, extra = {}) => {
    g.applyMatrix4(mtx);
    B.push(g, color, { uv: true, aFac: fac, aDist: dist, jitter: extra.jitter ?? 0.04 });
  };
  const w = b.w, d = b.d;
  if (b.kind === 'warehouse') {
    for (const [len, ry, ox, oz] of [[w, 0, 0, d / 2], [w, Math.PI, 0, -d / 2], [d, Math.PI / 2, w / 2, 0], [d, -Math.PI / 2, -w / 2, 0]]) {
      const g = wallPlane(len, 0, H, 1, 0, 1); g.rotateY(ry); g.translate(ox, 0, oz); push(g, b.color, [6, 0, 0, 0]);
    }
    const roof = gableRoof(w, d, Math.min(4, d * 0.18)); roof.translate(0, H, 0); push(roof, 0x6f7a80, [3, 0, 0, 0], { jitter: 0.06 });
    for (let k = 0; k < Math.floor(w / 10); k++) { const g = new THREE.BoxGeometry(5, 5.5, 0.3); g.translate(-w / 2 + 6 + k * 10, 2.75, d / 2 + 0.1); push(g, 0x3a3f44, [3, 0, 0, 0]); }
    const strip = new THREE.BoxGeometry(w + 0.2, 0.8, d + 0.2); strip.translate(0, H - 1.2, 0); push(strip, 0xd8d0c0, [0, 0, 0, 0]);
    return { H };
  }
  const nb = Math.max(2, Math.round(w / 3.1)), ns = Math.max(2, Math.round(d / 3.4));
  const walls = [
    { len: w, rotY: 0, off: [0, d / 2], bays: nb, type: b.balcony ? 1 : 0, shop: b.shop ? 1 : 0 },
    { len: w, rotY: Math.PI, off: [0, -d / 2], bays: nb, type: b.backBalcony ? 1 : 0, shop: b.shopBack ? 1 : 0 },
    { len: d, rotY: Math.PI / 2, off: [w / 2, 0], bays: ns, type: 2, shop: 0 },
    { len: d, rotY: -Math.PI / 2, off: [-w / 2, 0], bays: ns, type: 2, shop: 0 },
  ];
  const wallTop = b.penthouse ? H - FH : H;
  for (const wl of walls) {
    const place = (g) => { g.rotateY(wl.rotY); g.translate(wl.off[0], 0, wl.off[1]); return g; };
    const gTop = Math.min(GF, wallTop);
    const ws = (b.iseed ?? 0) + Math.round(wl.rotY * 2) * 13 + 7;
    push(place(wallPlane(wl.len, 0, gTop, wl.bays, 0, gTop / GF)), b.color, [1, ws, facW(b.style, wl.type), wl.shop + lit]);
    if (wallTop > GF) push(place(wallPlane(wl.len, GF, wallTop, wl.bays, 1, 1 + (wallTop - GF) / FH)), b.color, [1, ws, facW(b.style, wl.type), lit]);
  }
  const r = rng(Math.floor(b.seed * 1e6));
  const floorsUp = Math.floor((wallTop - GF) / FH + 0.01);
  for (const [side, on] of [[1, b.balcony], [-1, b.backBalcony]]) {
    if (!on || b.far) continue;
    const bw = side === 1 ? w * (r() < 0.5 ? 0.92 : 0.62) : w * 0.45;
    const bx = side === 1 ? 0 : (r() - 0.5) * (w - bw);
    const railCol = b.style === 2 ? 0x8a9599 : (r() < 0.5 ? b.color : 0xe8e2d6);
    for (let k = 1; k <= floorsUp; k++) {
      const g = balconyGeo(bw);
      if (side === -1) g.rotateY(Math.PI);
      g.translate(bx, GF + (k - 1) * FH, side * d / 2);
      push(g, railCol, [b.style === 2 ? 3 : 0, 0, 0, 0], { jitter: 0.02 });
    }
  }
  if (b.shop && !b.far && r() < (b.awning ?? 0.6)) {
    const aw = new THREE.BoxGeometry(w * 0.86, 0.1, 1.9);
    aw.translate(0, 0, 0.95); aw.rotateX(0.32); aw.translate(0, GF - 0.45, d / 2);
    const awC = [0x8a2a26, 0x2c5a55, 0x9a7a34, 0x34405a, 0x8a8170, 0x6a3a5a][Math.floor(r() * 6)];
    push(aw, awC, [b.striped ? 7 : 0, 0, 0, 0]);
  }
  if (b.roof === 'hip') {
    const g = hipRoof(w, d, Math.min(w, d) * 0.24);
    g.translate(0, H, 0);
    push(g, TERRACOTTA[Math.floor(r() * TERRACOTTA.length)], [0, 0, 0, 0], { jitter: 0.14 });
    const fas = new THREE.BoxGeometry(w + 1.1, 0.3, d + 1.1); fas.translate(0, H - 0.1, 0);
    push(fas, 0xd8d0c2, [0, 0, 0, 0]);
  } else {
    const roofH = b.penthouse ? H - FH : H;
    const roofC = ROOF_FLAT[Math.floor(r() * ROOF_FLAT.length)];
    const rp = new THREE.PlaneGeometry(w, d); rp.rotateX(-Math.PI / 2); rp.translate(0, roofH + 0.05, 0);
    push(rp, roofC, [0, 0, 0, 0]);
    const pt = 0.25, ph = 0.9;
    for (const [a, bb, c, x, z] of [[w, ph, pt, 0, d / 2 - pt / 2], [w, ph, pt, 0, -d / 2 + pt / 2], [pt, ph, d, w / 2 - pt / 2, 0], [pt, ph, d, -w / 2 + pt / 2, 0]]) {
      const g = new THREE.BoxGeometry(a, bb, c); g.translate(x, roofH + bb / 2, z); push(g, b.color, [0, 0, 0, 0]);
    }
    if (b.penthouse) {
      const pw = w * 0.62, pd = d * 0.6, px = (r() - 0.5) * (w - pw) * 0.6;
      const ws = (b.iseed ?? 0) + 51;
      for (const [len, ry, ox, oz] of [[pw, 0, 0, pd / 2], [pw, Math.PI, 0, -pd / 2], [pd, Math.PI / 2, pw / 2, 0], [pd, -Math.PI / 2, -pw / 2, 0]]) {
        const g = wallPlane(len, roofH, H, Math.max(2, Math.round(len / 3.1)), 1, 2); g.rotateY(ry); g.translate(px + ox, 0, oz); push(g, b.color, [1, ws, facW(2, 0), lit]);
      }
      const pr = new THREE.BoxGeometry(pw + 0.6, 0.3, pd + 0.6); pr.translate(px, H + 0.15, 0); push(pr, 0xcfc8bc, [0, 0, 0, 0]);
      const per = new THREE.BoxGeometry(w * 0.3, 0.15, d * 0.8); per.translate(px > 0 ? -w * 0.3 : w * 0.3, roofH + 2.4, 0); push(per, 0x6a5240, [0, 0, 0, 0]);
    }
    if (!b.far) {
      if (!b.penthouse && r() < 0.7) { const sx = (r() - 0.5) * (w - 4), sz = (r() - 0.5) * (d - 4); const g = new THREE.BoxGeometry(2.8, 2.5, 3.2); g.translate(sx, roofH + 1.25, sz); push(g, b.color, [0, 0, 0, 0]); }
      const nSol = Math.floor(r() * 3.2);
      for (let s = 0; s < nSol; s++) {
        const sx = -w / 2 + 2 + r() * (w - 4), sz = -d / 2 + 2 + r() * (d - 4);
        const p = new THREE.BoxGeometry(1.9, 0.07, 1.2); p.rotateX(-0.6); p.translate(sx, roofH + 0.75, sz); push(p, 0x1e2a3a, [3, 0, 0, 0]);
        const t = new THREE.CylinderGeometry(0.3, 0.3, 1.9, 6); t.rotateZ(Math.PI / 2); t.translate(sx, roofH + 1.32, sz - 0.55); push(t, 0xdedbd2, [0, 0, 0, 0]);
      }
      if (r() < 0.45) { for (let k = 0; k < 4; k++) { const pl = new THREE.IcosahedronGeometry(0.55 + r() * 0.3, 0); pl.translate(-w / 2 + 1 + r() * (w - 2), roofH + 0.5, d / 2 - 1.0); push(pl, 0x41592c, [0, 0, 0, 0], { jitter: 0.25 }); } }
    }
  }
  return { H };
}

// ------------------------------------------------------------------------------------------ district layouts
// rowBlock: perimeter rows along the two long sides of a sub-block (proto-B grammar), optional middle row
function rowBlock(list, did, rect, r, o) {
  const { x0, x1, z0, z1 } = rect;
  const rows = o.middle ? [1, -1, 0] : [1, -1];
  for (const row of rows) {
    const usable = (x1 - x0) - (o.margin ?? 5);
    const k = o.k[0] + Math.floor(r() * (o.k[1] - o.k[0] + 1));
    const gap = (o.gap ?? 2.6) + r() * 1.2;
    const widths = []; let tot = 0;
    for (let n = 0; n < k; n++) { const w = 0.8 + r() * 0.4; widths.push(w); tot += w; }
    const avail = usable - gap * (k - 1);
    let x = (x0 + x1) / 2 - usable / 2;
    for (let n = 0; n < k; n++) {
      const w = (widths[n] / tot) * avail;
      const d = o.depth[0] + r() * (o.depth[1] - o.depth[0]);
      const setback = (o.setback ?? 3.6) + r() * 1.2;
      const cz = (z0 + z1) / 2;
      const bz = row === 0 ? cz : (row === 1 ? z1 - setback - d / 2 : z0 + setback + d / 2);
      const facing = row === 0 ? (r() < 0.5 ? 1 : -1) : row;
      const fl = typeof o.floors === 'function' ? o.floors(x + w / 2, bz, r) : o.floors[0] + Math.floor(r() * (o.floors[1] - o.floors[0] + 1));
      const pal = o.palette ?? PLASTER;
      list.push({
        did, x: x + w / 2, z: bz, w, d, fw: w, fd: d, floors: fl, style: o.style ?? Math.floor(r() * 4),
        roof: r() < (o.hip ?? 0.4) ? 'hip' : 'flat', penthouse: false, shop: r() < (facing === o.shopSide ? (o.shopMain ?? 0.8) : (o.shop ?? 0.3)),
        color: pal[Math.floor(r() * pal.length)], seed: r(), iseed: Math.floor(r() * 997), lit: 0.22 + r() * 0.3,
        balcony: r() < (o.balcony ?? 0.85), backBalcony: r() < 0.4, rot: facing === 1 ? 0 : Math.PI, row: facing,
        awning: o.awning, striped: o.striped,
      });
      const b = list[list.length - 1];
      b.penthouse = b.roof === 'flat' && b.floors >= 5 && r() < 0.35;
      x += w + gap;
    }
  }
}
const subBlocks = (D) => {
  const L = ROADS.lane / 2;
  return {
    nw: { x0: D.x0, x1: D.cx - L, z0: D.z0, z1: D.cz - L }, ne: { x0: D.cx + L, x1: D.x1, z0: D.z0, z1: D.cz - L },
    sw: { x0: D.x0, x1: D.cx - L, z0: D.cz + L, z1: D.z1 }, se: { x0: D.cx + L, x1: D.x1, z0: D.cz + L, z1: D.z1 },
  };
};

function districtBuildings(did, r) {
  const D = DISTRICTS[did], S = subBlocks(D), out = [];
  const extras = [];   // landmark parts: { build(B), noDamage }
  const ground = [];   // { rect, kind }
  const add = (rect, kind) => ground.push({ rect, kind });
  if (did === 0) {      // Kordon: waterfront apartments
    for (const k of ['nw', 'ne']) { rowBlock(out, did, S[k], r, { k: [2, 3], floors: [6, 8], depth: [11, 13.5], hip: 0.2, shopSide: -1, shopMain: 0.85, balcony: 0.95, palette: PLASTER }); add(S[k], 1); }
    for (const k of ['sw', 'se']) { rowBlock(out, did, S[k], r, { k: [2, 3], floors: [4, 7], depth: [10.5, 13], hip: 0.35, shopSide: 1 }); add(S[k], 1); }
  } else if (did === 3) { // Liman: port apron with warehouses + containers, offices behind
    const apron = { x0: D.x0, x1: D.x1, z0: D.z0, z1: D.cz - ROADS.lane / 2 };
    add(apron, 7);
    for (const [cx, w] of [[D.x0 + 28, 44], [D.x1 - 30, 40]]) out.push({ did, kind: 'warehouse', x: cx, z: D.z0 + 18, w, d: 20, fw: w, fd: 20, floors: 2, color: [0xa8b0b4, 0xb89a7a][out.length % 2], seed: r(), iseed: 1, lit: 0, rot: 0, row: 1 });
    extras.push({ build: (B) => containers(B, D, r), noDamage: false });
    for (const k of ['sw', 'se']) { rowBlock(out, did, S[k], r, { k: [2, 2], floors: [4, 6], depth: [12, 14], hip: 0.1, style: 2, palette: STONE.concat([0xc4cbcc, 0x9fa7ab]), shop: 0.2 }); add(S[k], 1); }
  } else if (did === 5) { // Kemeraltı: low dense bazaar, awnings, narrow lanes
    for (const k of ['nw', 'ne', 'sw', 'se']) { rowBlock(out, did, S[k], r, { k: [4, 5], floors: [1, 3], depth: [8, 10], setback: 1.6, gap: 1.2, margin: 3, hip: 0.72, shop: 0.9, shopMain: 0.95, shopSide: 1, balcony: 0.25, awning: 0.9, striped: true, middle: true, palette: BAZAAR }); add(S[k], 1); }
  } else if (did === 1) { // Konak: Saat Kulesi square (NW) + civic blocks
    add(S.nw, 6);
    extras.push({ build: (B) => clockTower(B, TOWER.x, TOWER.z), noDamage: true });
    for (const k of ['ne', 'sw', 'se']) { rowBlock(out, did, S[k], r, { k: [1, 2], floors: [5, 8], depth: [13, 16], hip: 0.05, style: 2, palette: STONE.concat([0xeeeae2]), shop: 0.5, balcony: 0.3, setback: 3.2 }); add(S[k], 1); }
  } else if (did === 4) { // Kültürpark: park, pond, pavilions, tower
    add({ x0: D.x0, x1: D.x1, z0: D.z0, z1: D.z1 }, 3);
    const pav = [[D.x0 + 20, D.z0 + 16, 26, 14], [D.x1 - 20, D.z0 + 18, 22, 16], [D.x0 + 18, D.z1 - 16, 22, 14], [D.x1 - 24, D.z1 - 15, 30, 12]];
    for (const [x, z, w, d] of pav) out.push({ did, kind: 'pavilion', x, z, w, d, fw: w, fd: d, floors: 1 + (w > 25 ? 1 : 0), style: 2, roof: 'flat', penthouse: false, shop: true, color: 0xeeeae2, seed: r(), iseed: Math.floor(r() * 997), lit: 0.4, balcony: false, backBalcony: false, rot: z < D.cz ? Math.PI : 0, row: 1, far: true });
    extras.push({ build: (B) => parkTower(B, D.cx + 22, D.cz - 6), noDamage: false });
  } else {               // Alsancak: mid-rise residential, max 4 floors on the near half
    const fl = (x, z, rr) => (z > DISTRICTS[2].cz ? 2 + Math.floor(rr() * 3) : 4 + Math.floor(rr() * 3));
    for (const k of ['nw', 'ne', 'sw', 'se']) { rowBlock(out, did, S[k], r, { k: [2, 3], floors: fl, depth: [10.5, 12.5], hip: 0.4, palette: PASTEL, shopSide: 1, shopMain: 0.6, balcony: 0.9 }); add(S[k], 1); }
  }
  return { buildings: out, extras, ground };
}

function containers(B, D, r) {
  const cols = [0x2f6a9a, 0xb8432e, 0x3e7a4a, 0xd0a03a, 0x6a6e72, 0x8a3a6a, 0xe0e0d8];
  const x0 = D.x0 + 8, z0 = D.z0 + 34;
  for (let i = 0; i < 9; i++) for (let j = 0; j < 2; j++) {
    const n = 1 + Math.floor(r() * 3);
    for (let h = 0; h < n; h++) B.box(12, 2.6, 2.5, x0 + i * 10.6 + (j ? 3 : 0), 1.5 + h * 2.62, z0 + j * 3.2, cols[Math.floor(r() * cols.length)], { aFac: [6, 0, 0, 0], aDist: [D.id + 1], jitter: 0.05 });
  }
}
// port gantry cranes on the quay (landmark, never damaged)
function gantry(B, x, z, did) {
  const ex = { aFac: [0, 0, 0, 0], aDist: [did + 1], jitter: 0.03 };
  const red = 0xb8382c, white = 0xe8e4dc;
  for (const [dx, dz] of [[-7, -4], [7, -4], [-7, 4], [7, 4]]) B.box(1.4, 30, 1.4, x + dx, 15, z + dz, red, ex);
  B.box(16, 2.4, 2, x, 29, z - 4, white, ex); B.box(16, 2.4, 2, x, 29, z + 4, white, ex);
  B.box(3, 2.2, 52, x, 31.5, z - 14, red, ex);                       // boom reaching over the water
  B.box(5, 5, 6, x, 34, z + 6, white, ex);                           // machinery house
  B.box(3.2, 2.4, 3, x, 28.5, z - 18, 0x2a2e33, ex);                 // trolley
  B.cyl(0.12, 0.12, 14, x, 21, z - 18, 0x222222, { ...ex, seg: 3 });
}
function clockTower(B, x, z) {
  const ex = { aFac: [0, 0, 0, 0], aDist: [2], jitter: 0.03 };
  const st = 0xe4dccb, st2 = 0xcfc4ae, accent = 0x9a5a44, blue = 0x3e6a8a;
  const oct = (r0, r1, h, y, col, opts = {}) => { const g = new THREE.CylinderGeometry(r1, r0, h, 8, 1); g.rotateY(Math.PI / 8); g.translate(x, y + h / 2, z); B.push(g, col, { ...ex, ...opts }); };
  oct(5.6, 5.6, 1.2, 0, st2); oct(4.4, 4.4, 1.0, 1.2, st); oct(3.4, 3.4, 7.0, 2.2, st);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; const g = new THREE.BoxGeometry(0.5, 7, 0.5); g.translate(x + Math.cos(a) * 3.55, 5.7, z + Math.sin(a) * 3.55); B.push(g, st2, ex); }
  oct(3.8, 3.8, 0.7, 9.2, accent); oct(2.7, 2.7, 6.0, 9.9, st);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + Math.PI / 4; const g = new THREE.CircleGeometry(1.25, 14); g.rotateY(-a + Math.PI / 2); g.translate(x + Math.cos(a) * 2.62, 13.6, z + Math.sin(a) * 2.62); B.push(g, 0xf4f0e2, { ...ex, aFac: [2, 0, 0, 0] }); }
  oct(3.1, 3.1, 0.6, 15.9, accent); oct(2.0, 2.0, 3.0, 16.5, st); oct(2.5, 2.5, 0.5, 19.5, blue);
  const dome = new THREE.SphereGeometry(1.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); dome.translate(x, 20.0, z); B.push(dome, blue, ex);
  const fin = new THREE.ConeGeometry(0.25, 2.4, 6); fin.translate(x, 22.9, z); B.push(fin, 0xc8a24a, ex);
  for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; const g = new THREE.CylinderGeometry(1.4, 1.6, 0.8, 10); g.translate(x + Math.cos(a) * 8.5, 0.6, z + Math.sin(a) * 8.5); B.push(g, st2, ex); }
}
// Kültürpark lattice tower: four legs converging to a platform and a crown ring
function parkTower(B, x, z) {
  const ex = { aFac: [0, 0, 0, 0], aDist: [5], jitter: 0.02 };
  const H = 38, red = 0xc04a36, white = 0xe8e4dc;
  for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const g = new THREE.CylinderGeometry(0.35, 0.5, H, 5, 1); g.translate(0, H / 2, 0);
    g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(dz, 0, -dx).normalize(), -0.085));
    g.translate(x + dx * 3.4, 0, z + dz * 3.4); B.push(g, white, ex);
  }
  for (let k = 1; k < 6; k++) { const y = k * H / 6, w = 7 - k * 0.9; B.box(w, 0.4, w, x, y, z, k % 2 ? red : white, ex); }
  B.cyl(4.2, 4.2, 1.2, x, H + 0.6, z, red, { ...ex, seg: 12 });
  B.cyl(0.25, 0.25, 6, x, H + 4, z, white, { ...ex, seg: 4 });
}

// ------------------------------------------------------------------------------------------ vegetation
function palmGeometry(seed) {
  // curved trunk, drooping folded fronds, a date cluster
  const B = new Builder(seed);
  const r = rng(seed);
  const h = 10 + r() * 3;
  const lean = (r() - 0.5) * 0.3 + 0.08;
  const segs = 5;
  const cx = (t) => lean * h * t * t;
  for (let s = 0; s < segs; s++) {
    const t0 = s / segs, t1 = (s + 1) / segs;
    const x0 = cx(t0), x1 = cx(t1), y0 = h * t0, y1 = h * t1;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const g = new THREE.CylinderGeometry(0.24 - t1 * 0.07, 0.3 - t0 * 0.07, len, 6, 1, true);
    g.rotateZ(-Math.atan2(x1 - x0, y1 - y0));
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, 0);
    B.push(g, s % 2 ? 0x6e5c48 : 0x5e5040, { jitter: 0.05 });
  }
  const topX = cx(1), topY = h;
  const nF = 11;
  for (let f = 0; f < nF; f++) {
    const a = (f / nF) * Math.PI * 2 + r() * 0.3;
    const len = 4.2 + r() * 1.3;
    const droop = 0.7 + r() * 0.6;
    const up = f % 3 === 0 ? 0.5 : 0;
    const pos = [];
    const pts = [];
    const NS = 4;
    for (let k = 0; k <= NS; k++) {
      const t = k / NS;
      const dist = t * len;
      const y = topY + Math.sin(t * Math.PI * 0.55) * (0.9 + up) - t * t * droop * 2.8;
      const wdt = Math.sin(Math.min(1, t * 1.6 + 0.15) * Math.PI * 0.95) * 0.7 + 0.05;
      pts.push({ c: [topX + Math.cos(a) * dist, y, Math.sin(a) * dist], w: wdt });
    }
    const px = -Math.sin(a), pz = Math.cos(a);
    for (let k = 0; k < NS; k++) {
      const A = pts[k], Cc = pts[k + 1];
      const fold = 0.35;
      const aL = [A.c[0] + px * A.w, A.c[1] - fold * A.w, A.c[2] + pz * A.w], aR = [A.c[0] - px * A.w, A.c[1] - fold * A.w, A.c[2] - pz * A.w];
      const cL = [Cc.c[0] + px * Cc.w, Cc.c[1] - fold * Cc.w, Cc.c[2] + pz * Cc.w], cR = [Cc.c[0] - px * Cc.w, Cc.c[1] - fold * Cc.w, Cc.c[2] - pz * Cc.w];
      pos.push(...aL, ...A.c, ...Cc.c, ...aL, ...Cc.c, ...cL, ...A.c, ...aR, ...cR, ...A.c, ...cR, ...Cc.c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    B.push(g, f % 2 ? 0x56662e : 0x46582a, { jitter: 0.12 });
  }
  for (let k = 0; k < 3; k++) { const nut = new THREE.IcosahedronGeometry(0.42, 0); nut.translate(topX + Math.cos(k * 2.1) * 0.5, topY - 0.5, Math.sin(k * 2.1) * 0.5); B.push(nut, 0x8a6a2a); }
  return B.build();
}
function broadTreeGeometry(seed, big = 1) {
  const B = new Builder(seed);
  const r = rng(seed);
  const h = (3.2 + r() * 1.5) * big;
  B.cyl(0.18 * big, 0.26 * big, h, 0, h / 2, 0, 0x4a3b2e, { seg: 5 });
  const n = 3 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry((1.7 + r() * 1.0) * big, 0);
    g.scale(1, 0.8, 1);
    g.translate((r() - 0.5) * 2.2 * big, h + (0.6 + r() * 1.2) * big, (r() - 0.5) * 2.2 * big);
    B.push(g, [0x3d4a26, 0x46532b, 0x37431f][i % 3], { jitter: 0.18 });
  }
  return B.build();
}
function pineGeometry(seed) {
  const B = new Builder(seed);
  const r = rng(seed);
  const h = 9 + r() * 3;
  const g0 = new THREE.CylinderGeometry(0.22, 0.34, h, 5); g0.rotateZ((r() - 0.5) * 0.2); g0.translate(0, h / 2, 0);
  B.push(g0, 0x5a4636);
  for (let i = 0; i < 4; i++) {
    const g = new THREE.IcosahedronGeometry(2.6 + r() * 1.2, 0);
    g.scale(1.3, 0.42, 1.3);
    g.translate((r() - 0.5) * 3.5, h + 0.4 + r() * 0.8, (r() - 0.5) * 3.5);
    B.push(g, i % 2 ? 0x2f3f22 : 0x36472a, { jitter: 0.15 });
  }
  return B.build();
}
function lampGeometry() {
  const B = new Builder(5, { aFac: 4, uv: 2 });
  B.cyl(0.1, 0.13, 7.5, 0, 3.75, 0, 0x3a3c40, { seg: 4, open: true, aFac: [0, 0, 0, 0] });
  B.box(0.3, 0.16, 1.9, 0, 7.4, 0.85, 0x2a2c30, { aFac: [0, 0, 0, 0] });
  const lens = new THREE.PlaneGeometry(0.26, 0.6); lens.rotateX(Math.PI / 2); lens.translate(0, 7.31, 1.45);
  B.push(lens, 0xffc890, { aFac: [2, 0, 0, 0] });
  return B.build();
}
export function carGeo() {
  const B = new Builder(201);
  B.box(1.8, 0.62, 4.3, 0, 0.6, 0, 0xffffff, { jitter: 0.02 });
  B.box(1.55, 0.52, 2.2, 0, 1.17, -0.25, 0x23282e, { jitter: 0.0 });
  B.box(1.57, 0.08, 2.0, 0, 1.46, -0.25, 0xffffff, { jitter: 0.02 });
  for (const x of [-0.84, 0.84]) for (const z of [1.35, -1.35]) B.box(0.24, 0.62, 0.62, x, 0.31, z, 0x141414);
  return B.build();
}
function personGeo() {
  const B = new Builder(211);
  B.box(0.5, 0.9, 0.32, 0, 0.45, 0, 0x2a3040, { jitter: 0 });
  B.box(0.62, 0.75, 0.38, 0, 1.25, 0, 0xffffff, { jitter: 0 });
  B.box(0.3, 0.3, 0.3, 0, 1.8, 0, 0xc8a080, { jitter: 0 });
  return B.build();
}
function ferryGeometry() {
  const B = new Builder(11, { aFac: 4, uv: 2 });
  const len = 52, beam = 11;
  const hs = new THREE.Shape();
  hs.moveTo(-len / 2, -beam / 2); hs.lineTo(len / 2 - 8, -beam / 2);
  hs.quadraticCurveTo(len / 2, -beam / 2, len / 2, 0); hs.quadraticCurveTo(len / 2, beam / 2, len / 2 - 8, beam / 2);
  hs.lineTo(-len / 2, beam / 2); hs.quadraticCurveTo(-len / 2 - 3, 0, -len / 2, -beam / 2);
  const hull = new THREE.ExtrudeGeometry(hs, { depth: 3.2, bevelEnabled: false, curveSegments: 4 });
  hull.rotateX(-Math.PI / 2); hull.translate(0, -1.6, 0);
  B.push(hull, 0x1f2a33, { aFac: [0, 0, 0, 0] });
  const belt = new THREE.ExtrudeGeometry(hs, { depth: 0.5, bevelEnabled: false, curveSegments: 4 });
  belt.rotateX(-Math.PI / 2); belt.translate(0, 1.6, 0);
  B.push(belt, 0x8a2a22, { aFac: [0, 0, 0, 0] });
  const deck = (w, d, y, h, seed) => {
    for (const [l, ry, off] of [[w, 0, d / 2], [w, Math.PI, -d / 2], [d, Math.PI / 2, w / 2], [d, -Math.PI / 2, -w / 2]]) {
      const g = new THREE.PlaneGeometry(l, h); g.translate(0, y + h / 2, 0);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.round(l / 2.2), 1 + uv.getY(i) * 0.999);
      g.rotateY(ry);
      if (Math.abs(ry) === Math.PI / 2) g.translate(off, 0, 0); else g.translate(0, 0, off);
      B.push(g, 0xe9e7e1, { uv: true, aFac: [1, Math.round(seed * 900), 2, 0.75] });
    }
    const roof = new THREE.BoxGeometry(w + 0.6, 0.35, d + 0.6); roof.translate(0, y + h + 0.17, 0);
    B.push(roof, 0xd8d6d0, { aFac: [0, 0, 0, 0] });
  };
  deck(len - 10, beam - 1.2, 2.1, 2.6, 0.3);
  deck(len - 22, beam - 2.6, 5.05, 2.4, 0.7);
  B.box(4, 2.0, 5, 6, 8.5, 0, 0xe9e7e1, { aFac: [0, 0, 0, 0] });
  B.cyl(1.1, 1.3, 4.2, -4, 9.5, 0, 0xd8d6d0, { seg: 10, aFac: [0, 0, 0, 0] });
  B.cyl(1.12, 1.12, 1.0, -4, 11.2, 0, 0x1b1b1d, { seg: 10, aFac: [0, 0, 0, 0] });
  return B.build();
}
function hillsGeometry(fogCol) {
  const B = new Builder(21);
  const layer = (cz, width, hgt, seed, col, haze) => {
    const c = new THREE.Color(col).lerp(fogCol, haze);
    const segs = 40; const pos = []; let prev = null;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, x = (t - 0.5) * width;
      const ridge = Math.pow(fbm2(t * 9 + seed, seed * 3.1, 5), 1.6) * 2.2;
      const y = hgt * (0.2 + 0.8 * Math.pow(Math.sin(t * Math.PI), 0.5)) * (0.25 + ridge);
      if (prev) pos.push(prev[0], -5, cz, x, -5, cz, x, y, cz, prev[0], -5, cz, x, y, cz, prev[0], prev[1], cz);
      prev = [x, y];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    B.push(g, c.getHex(), { jitter: 0.0 });
  };
  layer(-1500, 4200, 210, 7, 0x3a3650, 0.6);
  layer(-1150, 3400, 130, 3, 0x2c2a40, 0.45);
  layer(-880, 2600, 60, 11, 0x272434, 0.32);
  return B.build();
}
function hillLights(n = 600) {
  const r = rng(31);
  const pos = [], col = [];
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 2400, z = -872 - r() * 4;
    const y = -1 + Math.pow(r(), 2.0) * 40 * (0.5 + 0.5 * Math.sin((x / 2600 + 0.5) * Math.PI));
    pos.push(x, y, z);
    const w = r(); col.push(1, 0.6 + w * 0.25, 0.3 + w * 0.25);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: cityUniforms.uTime, uNight: cityUniforms.uNight },
    vertexShader: `attribute vec3 color; varying vec3 vC; uniform float uTime, uNight;
      void main(){ vC = color * (0.75 + 0.25 * sin(uTime * 2.0 + position.x * 0.37)) * smoothstep(0.3, 0.9, uNight); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = 3.0; }`,
    fragmentShader: `varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.0); gl_FragColor = vec4(vC * a * 0.55, 1.0); }`,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

// instanced set with restorable base matrices (damage hides / bends single instances)
function instancedSet(geo, mat, list, { shadow = true, name } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
  m.count = list.length;
  list.forEach((t, i) => {
    _e.set(t.rx || 0, t.ry || 0, t.rz || 0); _q.setFromEuler(_e);
    _p.set(t.x, t.y || 0, t.z); _s.setScalar(t.s || 1);
    _m.compose(_p, _q, _s); m.setMatrixAt(i, _m);
    if (t.col !== undefined) m.setColorAt(i, new THREE.Color(t.col));
  });
  m.castShadow = shadow; m.receiveShadow = true; m.name = name || 'inst';
  m.computeBoundingSphere();
  m.userData.items = list;
  m.userData.base = m.instanceMatrix.array.slice();
  return m;
}

// ------------------------------------------------------------------------------------------ main builder
export function buildCity(scene, { fogU }) {
  const r = rng(7);
  const matI = facadeMaterial();
  const matD = facadeMaterial({ damaged: true });
  const districts = [];
  const allBuildings = [];
  const groundRects = [];
  let bid = 0;
  for (let did = 0; did < 6; did++) {
    const { buildings, extras, ground } = districtBuildings(did, rng(100 + did * 17));
    groundRects.push(...ground);
    const B = new Builder(30 + did, EXTRAS);
    let vcount = 0;
    const countNew = (from) => { let n = 0; for (let k = from; k < B.parts.length; k++) n += B.parts[k].attributes.position.count; return n; };
    for (const b of buildings) {
      b.id = bid++;
      const p0 = B.parts.length;
      const { H } = addBuilding(B, b);
      b.H = H; b.v0 = vcount; b.vN = countNew(p0); vcount += b.vN;
      allBuildings.push(b);
    }
    const props = [];
    for (const ex of extras) { const p0 = B.parts.length; ex.build(B); const n = countNew(p0); props.push({ v0: vcount, vN: n, noDamage: ex.noDamage }); vcount += n; }
    if (did === 3) { const p0 = B.parts.length; gantry(B, 40, -178, 3); gantry(B, 74, -178, 3); const n = countNew(p0); props.push({ v0: vcount, vN: n, noDamage: true }); vcount += n; }
    const geo = B.build();
    const mesh = new THREE.Mesh(geo, matI);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'district' + did;
    scene.add(mesh);
    districts[did] = { did, mesh, buildings, props, D: DISTRICTS[did] };
  }

  // ---------------------------------------------------------------- far filler (outside the play area, no damage)
  {
    const B = new Builder(77, EXTRAS);
    const fr = rng(81);
    const far = [];
    for (const side of [-1, 1]) {
      for (let bx = 0; bx < 2; bx++) for (let bz = 0; bz < 8; bz++) {
        const x0 = side < 0 ? -136 - (bx + 1) * 58 : 136 + bx * 58, z0 = -160 + bz * 52;
        rowBlock(far, -1, { x0: x0 + 4, x1: x0 + 52, z0: z0 + 3, z1: z0 + 46 }, fr, { k: [2, 3], floors: [3, 7], depth: [10, 13], hip: 0.45 });
      }
    }
    for (let bx = -4; bx < 4; bx++) {   // behind the yard
      if (bx >= -2 && bx < 2) continue;
      rowBlock(far, -1, { x0: bx * 52 + 4, x1: bx * 52 + 50, z0: 182, z1: 228 }, fr, { k: [2, 3], floors: [2, 5], depth: [10, 12], hip: 0.5 });
    }
    for (let bx = -5; bx < 5; bx++) rowBlock(far, -1, { x0: bx * 52 + 4, x1: bx * 52 + 50, z0: 244, z1: 290 }, fr, { k: [2, 3], floors: [3, 6], depth: [10, 12], hip: 0.5 });
    for (const b of far) { b.far = true; b.balcony = false; b.backBalcony = false; b.did = -1; addBuilding(B, b); }
    const mesh = new THREE.Mesh(B.build(), matI); mesh.receiveShadow = true; mesh.castShadow = true; mesh.name = 'farCity';
    scene.add(mesh);
    allBuildings.push(...far.map((b) => ({ ...b, farOnly: true })));
  }

  // ---------------------------------------------------------------- ground, kerbs, promenade, quay, yard
  const gB = new Builder(9, { aKind: 1 });
  const gz0 = COAST.quay, gz1 = 320;
  { const g = new THREE.PlaneGeometry(640, gz1 - gz0 + 2); g.rotateX(-Math.PI / 2); g.translate(0, 0, (gz1 + gz0) / 2); gB.push(g, 0xffffff, { aKind: [0], jitter: 0 }); }
  const box = (x0, x1, z0, z1, kind, h = 0.2) => { const g = new THREE.BoxGeometry(x1 - x0, h, z1 - z0); g.translate((x0 + x1) / 2, h / 2, (z0 + z1) / 2); gB.push(g, 0xffffff, { aKind: [kind], jitter: 0 }); };
  for (const { rect, kind } of groundRects) {
    if (kind === 3) { box(rect.x0, rect.x1, rect.z0, rect.z1, 1); const g = new THREE.PlaneGeometry(rect.x1 - rect.x0 - 7, rect.z1 - rect.z0 - 7); g.rotateX(-Math.PI / 2); g.translate((rect.x0 + rect.x1) / 2, 0.22, (rect.z0 + rect.z1) / 2); gB.push(g, 0xffffff, { aKind: [3], jitter: 0 }); continue; }
    box(rect.x0, rect.x1, rect.z0, rect.z1, kind);
  }
  { // Kültürpark pond
    const D = DISTRICTS[4];
    const g = new THREE.CircleGeometry(1, 28); g.rotateX(-Math.PI / 2); g.scale(20, 1, 13); g.translate(D.cx - 14, 0.24, D.cz + 4);
    gB.push(g, 0xffffff, { aKind: [8], jitter: 0 });
    const rim = new THREE.RingGeometry(1, 1.08, 28); rim.rotateX(-Math.PI / 2); rim.scale(20, 1, 13); rim.translate(D.cx - 14, 0.26, D.cz + 4);
    gB.push(rim, 0xffffff, { aKind: [2], jitter: 0 });
  }
  // far blocks ground (lots), promenade, quay wall, pier, yard slab
  for (const side of [-1, 1]) for (let bx = 0; bx < 2; bx++) for (let bz = 0; bz < 8; bz++) {
    const x0 = side < 0 ? -136 - (bx + 1) * 58 : 136 + bx * 58, z0 = -160 + bz * 52;
    box(x0 + 2, x0 + 54, z0 + 1, z0 + 48, 1);
  }
  for (let bx = -5; bx < 5; bx++) box(bx * 52 + 2, bx * 52 + 52, 242, 292, 1);
  for (let bx = -4; bx < 4; bx++) if (bx < -2 || bx >= 2) box(bx * 52 + 2, bx * 52 + 52, 180, 230, 1);
  box(-320, 320, COAST.promenade0, COAST.promenade1, 2);
  { const qw = new THREE.BoxGeometry(640, 3.4, 1.2); qw.translate(0, -1.5, COAST.quay - 0.6); gB.push(qw, 0xffffff, { aKind: [4], jitter: 0 }); }
  { const pier = new THREE.BoxGeometry(16, 3.4, 52); pier.translate(104, -1.5, COAST.quay - 26); gB.push(pier, 0xffffff, { aKind: [4], jitter: 0 });
    const pt = new THREE.PlaneGeometry(15.6, 51.6); pt.rotateX(-Math.PI / 2); pt.translate(104, 0.21, COAST.quay - 26); gB.push(pt, 0xffffff, { aKind: [7], jitter: 0 }); }
  box(YARD.x0, YARD.x1, YARD.z0, YARD.z1, 5, 0.12);
  const ground = new THREE.Mesh(gB.build(), groundMaterial());
  ground.receiveShadow = true; ground.name = 'ground';
  scene.add(ground);

  const seaMat = seaMaterial(fogU);
  seaMat.uniforms.uQuayZ.value = COAST.quay;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(4000, 1800), seaMat);
  sea.rotation.x = -Math.PI / 2; sea.position.set(0, -1.1, COAST.quay - 900); sea.name = 'sea';
  scene.add(sea);
  const hills = new THREE.Mesh(hillsGeometry(new THREE.Color(0x8a8296)), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
  hills.name = 'hills';
  scene.add(hills);
  const hl = hillLights(); scene.add(hl);
  const ferry = new THREE.Mesh(ferryGeometry(), matI);
  ferry.position.set(104 - 14, -0.4, COAST.quay - 30); ferry.rotation.y = Math.PI / 2;
  ferry.castShadow = true; ferry.receiveShadow = true; ferry.name = 'ferry';
  scene.add(ferry);

  // ---------------------------------------------------------------- AO skirts around building bases
  {
    const pos = [], bx = [], off = [];
    const pad = 3.2;
    for (const b of allBuildings) {
      if (b.farOnly && (Math.abs(b.x) > 200 || b.z > 236)) continue;
      const hw = b.w / 2 + pad, hd = b.d / 2 + pad;
      for (const [x, z] of [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, -hd], [hw, hd], [-hw, hd]]) { pos.push(b.x + x, 0.23, b.z + z); off.push(x, z); bx.push(b.w / 2, b.d / 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aOff', new THREE.Float32BufferAttribute(off, 2));
    g.setAttribute('aBox', new THREE.Float32BufferAttribute(bx, 2));
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: `attribute vec2 aOff, aBox; varying vec2 vO; varying vec2 vB; void main(){ vO = aOff; vB = aBox; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `varying vec2 vO; varying vec2 vB; void main(){ vec2 q = abs(vO) - vB; float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0); float a = (1.0 - smoothstep(0.0, 3.2, d)) * step(0.0, d + 0.3); gl_FragColor = vec4(0.0, 0.0, 0.02, a * 0.42); }`,
    }));
    m.renderOrder = 1; m.name = 'aoSkirts'; m.frustumCulled = false;
    scene.add(m);
  }

  // ---------------------------------------------------------------- vegetation
  const tr = rng(55);
  const palms = [], broad = [], pines = [];
  for (let x = -300; x < 300; x += 12) {
    if (Math.abs(x - 104) < 12 || (x > 28 && x < 86)) continue;    // pier and the port cranes
    palms.push({ x: x + (tr() - 0.5) * 2, z: COAST.promenade1 - 3.0, ry: tr() * 6, s: 0.9 + tr() * 0.25 });
    if (tr() < 0.3) palms.push({ x: x + 6 + (tr() - 0.5) * 2, z: COAST.quay + 3.5, ry: tr() * 6, s: 0.85 + tr() * 0.3 });
  }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.3; palms.push({ x: TOWER.x + 14 + Math.cos(a) * 14, z: TOWER.z + 16 + Math.sin(a) * 11, ry: tr() * 6, s: 0.9 }); }
  { const D = DISTRICTS[4];
    for (let k = 0; k < 70; k++) {
      const x = D.x0 + 6 + tr() * (D.x1 - D.x0 - 12), z = D.z0 + 6 + tr() * (D.z1 - D.z0 - 12);
      if (Math.hypot((x - (D.cx - 14)) / 22, (z - (D.cz + 4)) / 15) < 1.1) continue;
      if (Math.abs(x - (D.cx + 22)) < 8 && Math.abs(z - (D.cz - 6)) < 8) continue;
      if (Math.abs(((x % 30) + 30) % 30 - 15) > 13 || Math.abs(((z % 26) + 26) % 26 - 13) > 11.4) continue;   // keep paths free
      const near = districts[4].buildings.some((b) => Math.abs(b.x - x) < b.w / 2 + 3 && Math.abs(b.z - z) < b.d / 2 + 3);
      if (near) continue;
      if (tr() < 0.3) pines.push({ x, z, ry: tr() * 6, s: 0.9 + tr() * 0.3 }); else broad.push({ x, z, ry: tr() * 6, s: 1.2 + tr() * 0.5 });
    } }
  // avenue trees along the avenue sidewalks and the Alsancak / Kordon lanes
  for (let z = -158; z < 160; z += 11) {
    if ([ZR.S1, ZR.S2, 0, -112, 112].some((zz) => Math.abs(z - zz) < 10)) continue;
    for (const s of [-1, 1]) broad.push({ x: s * 9.8, z: z + (tr() - 0.5) * 2, ry: tr() * 6, s: 0.75 + tr() * 0.25, street: true });
  }
  for (const did of [0, 2, 5]) {
    const D = DISTRICTS[did];
    for (let x = D.x0 + 6; x < D.x1 - 4; x += 10) for (const s of [-1, 1]) if (Math.abs(x - D.cx) > 8 && tr() < 0.6) broad.push({ x, z: D.cz + s * 5.4, ry: tr() * 6, s: 0.6 + tr() * 0.2, street: true });
  }
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  const vegetation = [
    instancedSet(palmGeometry(3), treeMat, palms, { name: 'palms' }),
    instancedSet(broadTreeGeometry(4), treeMat, broad, { name: 'trees' }),
    instancedSet(pineGeometry(5), treeMat, pines, { name: 'pines' }),
  ];
  for (const v of vegetation) scene.add(v);

  // ---------------------------------------------------------------- street lamps along the main roads
  const lamps = [];
  for (const v of ROADS.v) for (let z = -156; z < 168; z += 24) {
    if (ROADS.h.some((h) => Math.abs(z - h.z) < h.w / 2 + 1)) continue;
    for (const s of [-1, 1]) lamps.push({ x: v.x + s * (v.w / 2 + 0.9), z, y: 0.2, ry: s > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  for (const h of ROADS.h) for (let x = -132; x < 136; x += 24) {
    if (ROADS.v.some((v) => Math.abs(x - v.x) < v.w / 2 + 1)) continue;
    for (const s of [-1, 1]) { const z = h.z + s * (h.w / 2 + 0.9); if (z < COAST.promenade0) continue; lamps.push({ x, z, y: 0.2, ry: s > 0 ? Math.PI : 0 }); }
  }
  const lampMesh = instancedSet(lampGeometry(), matI, lamps, { shadow: false, name: 'lamps' });
  scene.add(lampMesh);

  // ---------------------------------------------------------------- parked cars along the kerbs
  const parked = [];
  const cr = rng(77);
  const nearYard = (x, z) => z > 160 && Math.abs(x) < 20;
  const tryCar = (x, z, yaw) => { if (nearYard(x, z)) return; parked.push({ x, z, ry: yaw, s: 1.2, col: CAR_COLS[Math.floor(cr() * CAR_COLS.length)] }); };
  for (const v of [...ROADS.v.map((v) => ({ x: v.x, hw: v.w / 2 })), ...ROADS.laneX.map((x) => ({ x, hw: ROADS.lane / 2, lane: true }))]) {
    for (let z = -158; z < 164; z += 7.2) {
      if (ROADS.h.some((h) => Math.abs(z - h.z) < h.w / 2 + 4) || (v.lane && ROADS.laneZ.some((lz) => Math.abs(z - lz) < 8))) continue;
      if (v.lane && v.x < 0 && z > 62) continue;       // Kültürpark has no lanes
      if (v.lane && v.x > 0 && z > -50 && z < -4) continue;   // Konak square
      for (const s of [-1, 1]) if (cr() < (v.lane ? 0.32 : 0.4)) tryCar(v.x + s * (v.hw - 1.3), z, s > 0 ? 0 : Math.PI);
    }
  }
  for (const h of [...ROADS.h.map((h) => ({ z: h.z, hw: h.w / 2 })), ...ROADS.laneZ.map((z) => ({ z, hw: ROADS.lane / 2, lane: true }))]) {
    for (let x = -126; x < 128; x += 7.2) {
      if (ROADS.v.some((v) => Math.abs(x - v.x) < v.w / 2 + 4) || (h.lane && ROADS.laneX.some((lx) => Math.abs(x - lx) < 8))) continue;
      if (h.lane && h.z > 62 && x < 0) continue;
      if (h.z === ZR.P) continue;
      for (const s of [-1, 1]) if (cr() < (h.lane ? 0.3 : 0.36)) tryCar(x, h.z + s * (h.hw - 1.3), s > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }
  const carMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2, flatShading: true });
  const parkedMesh = instancedSet(carGeo(), carMat, parked, { shadow: false, name: 'parked' });
  scene.add(parkedMesh);

  // ---------------------------------------------------------------- pedestrians (promenade, square, park)
  const pedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const PCOL = [0xf0ece0, 0x3a6a9a, 0xb83a32, 0x2a2a2a, 0xe0b040, 0x5a8a4a, 0xf4f4f4, 0xd06a2a];
  const peds = [];
  const pr = rng(91);
  for (let k = 0; k < 150; k++) peds.push({ x: -240 + pr() * 480, z: COAST.quay + 2 + pr() * 9, ry: pr() * 6.28, col: PCOL[Math.floor(pr() * PCOL.length)], ph: pr() * 6.28, sp: (pr() < 0.6 ? 1 : 0) * (0.8 + pr() * 0.8), dir: pr() < 0.5 ? 1 : -1, span: 60 });
  for (let k = 0; k < 36; k++) { const a = pr() * 6.28, rr = 7 + pr() * 14; peds.push({ x: TOWER.x + 14 + Math.cos(a) * rr, z: TOWER.z + 14 + Math.sin(a) * rr * 0.7, ry: pr() * 6.28, col: PCOL[Math.floor(pr() * PCOL.length)], ph: 0, sp: 0, dir: 1, span: 0, did: 1 }); }
  { const D = DISTRICTS[4]; for (let k = 0; k < 40; k++) peds.push({ x: D.x0 + 10 + pr() * 90, z: D.z0 + 13 + Math.floor(pr() * 3) * 26 + (pr() - 0.5), ry: pr() * 6.28, col: PCOL[Math.floor(pr() * PCOL.length)], ph: pr() * 6.28, sp: 0.6 + pr() * 0.5, dir: pr() < 0.5 ? 1 : -1, span: 26, did: 4 }); }
  const pedMesh = new THREE.InstancedMesh(personGeo(), pedMat, peds.length);
  { const c = new THREE.Color(); peds.forEach((p, i) => pedMesh.setColorAt(i, c.set(p.col))); }
  pedMesh.castShadow = false; pedMesh.frustumCulled = false; pedMesh.name = 'peds';
  scene.add(pedMesh);

  return { districts, allBuildings, matI, matD, ground, sea, seaMat, hills, hillLights: hl, ferry, vegetation, lampMesh, parkedMesh, pedMesh, peds };
}
