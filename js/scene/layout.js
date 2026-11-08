// World layout (ARCH section 6): district cells, roads, yard, road graph, path finding and corpse
// placement. Pure data + math (no three.js, no DOM) so tests can import it in Node.
// Units: metres. x right, z toward the camera (near), y up. The sea is at -z.

export const CELL = { W: 110, D: 100 };
export const COLS = [{ x0: -118, x1: -8, cx: -63 }, { x0: 8, x1: 118, cx: 63 }];
export const ROWS = [{ z0: -162, z1: -62, cz: -112 }, { z0: -50, z1: 50, cz: 0 }, { z0: 62, z1: 162, cz: 112 }];

// district ids at (col,row): row 0 is the far edge by the sea, row 2 is next to the yard
export const GRID = [[0, 3], [5, 1], [4, 2]];          // GRID[row][col] -> id
export const KEYS = ['kordon', 'konak', 'alsancak', 'liman', 'kulturpark', 'kemeralti'];

export const DISTRICTS = [];
for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
  const id = GRID[row][col];
  const C = COLS[col], R = ROWS[row];
  DISTRICTS[id] = { id, key: KEYS[id], col, row, x0: C.x0, x1: C.x1, z0: R.z0, z1: R.z1, cx: C.cx, cz: R.cz };
}

// main roads (centre line, width)
export const XR = { W: -124, A: 0, E: 124 };
export const ZR = { P: -168, S1: -56, S2: 56, R: 168 };
export const ROADS = {
  v: [{ x: XR.W, w: 12 }, { x: XR.A, w: 16 }, { x: XR.E, w: 12 }],          // run along z
  h: [{ z: ZR.P, w: 12 }, { z: ZR.S1, w: 12 }, { z: ZR.S2, w: 12 }, { z: ZR.R, w: 12 }],
  lane: 8,                                                                   // inner lanes split each cell 2x2
  laneX: [-63, 63], laneZ: [-112, 0, 112],
};
export const COAST = { promenade0: -186, promenade1: -174, quay: -186 };
export const MAP = { x0: -130, x1: 130, z0: -190, z1: 236 };                // pan clamp / map bounds

// Aftermath yard (near edge)
export const YARD = {
  x0: -70, x1: 70, z0: 176, z1: 232,
  gate: { x: 0, z: 176 }, interior: { x: 0, z: 188 },
  bays: Array.from({ length: 8 }, (_, k) => ({ x: -42 + 12 * k, z: 210, yaw: Math.PI })),   // nose toward -z
  garage: { x0: -46, x1: 46, z0: 218, z1: 232 },
  crates: { x0: -68, x1: -50, z0: 184, z1: 214 },
  shed: { x0: 48, x1: 70, z0: 182, z1: 214 },
  load: { x: -44, z: 192 },
};

// Saat Kulesi: Konak's NW corner by the avenue and S1. Never covered by the corpse.
export const TOWER = { x: 18, z: -42 };

// landing point for a single-district fall (c1 and any 1-chain): centre offset + diagonal yaw
export const LAND = [
  { x: -60, z: -108, yaw: 0.52 },  // 0 Kordon
  { x: 72, z: 10, yaw: 0.52 },     // 1 Konak (south-east of the centre, away from the tower)
  { x: 63, z: 110, yaw: -0.52 },   // 2 Alsancak
  { x: 66, z: -110, yaw: -0.52 },  // 3 Liman
  { x: -63, z: 112, yaw: 0.52 },   // 4 Kultürpark
  { x: -62, z: 2, yaw: -0.52 },    // 5 Kemeralti
];

export const colRowOf = (id) => [DISTRICTS[id].col, DISTRICTS[id].row];
export function neighbours(id) {
  const d = DISTRICTS[id], out = [];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const c = d.col + dc, r = d.row + dr;
    if (c >= 0 && c < 2 && r >= 0 && r < 3) out.push(GRID[r][c]);
  }
  return out;
}

// picking: whole cell incl. half the surrounding roads; yard below the ring road
export function districtAt(x, z) {
  if (x < -136 || x > 136) return null;
  if (z > ZR.R) return z < 250 && x > -100 && x < 100 ? 'yard' : null;
  if (z < ZR.P - 6) return null;
  const col = x < 0 ? 0 : 1;
  const row = z < ZR.S1 ? 0 : z < ZR.S2 ? 1 : 2;
  return GRID[row][col];
}

// ---------------------------------------------------------------------------------------- road graph
// Node ids: lattice 'I.<W|A|E>.<P|S1|S2|R>', edge midpoints 'V.<W|A|E>.<row>' and 'H.<col>.<P|S1|S2|R>',
// yard 'G' (gate), 'Y' (interior), 'BAY.0'..'BAY.7', 'LOAD' (buyer spot), off-map 'RIVAL', 'BUYER',
// 'DUMP.W', 'DUMP.E'.
const NODES = new Map();
const EDGES = [];        // [aIndex, bIndex]
const NODE_LIST = [];
function addNode(id, x, z) { const n = { id, x, z, i: NODE_LIST.length }; NODES.set(id, n); NODE_LIST.push(n); return n; }
function addEdge(a, b) { EDGES.push([NODES.get(a).i, NODES.get(b).i]); }
{
  const xs = ['W', 'A', 'E'], zs = ['P', 'S1', 'S2', 'R'];
  for (const xk of xs) for (const zk of zs) addNode(`I.${xk}.${zk}`, XR[xk], ZR[zk]);
  for (const xk of xs) for (let r = 0; r < 3; r++) addNode(`V.${xk}.${r}`, XR[xk], ROWS[r].cz);
  for (let c = 0; c < 2; c++) for (const zk of zs) addNode(`H.${c}.${zk}`, COLS[c].cx, ZR[zk]);
  // vertical lines: I.x.P - V.x.0 - I.x.S1 - V.x.1 - I.x.S2 - V.x.2 - I.x.R
  for (const xk of xs) {
    const seq = [`I.${xk}.P`, `V.${xk}.0`, `I.${xk}.S1`, `V.${xk}.1`, `I.${xk}.S2`, `V.${xk}.2`, `I.${xk}.R`];
    for (let k = 0; k < seq.length - 1; k++) addEdge(seq[k], seq[k + 1]);
  }
  // horizontal lines: I.W.z - H.0.z - I.A.z - H.1.z - I.E.z
  for (const zk of zs) {
    const seq = [`I.W.${zk}`, `H.0.${zk}`, `I.A.${zk}`, `H.1.${zk}`, `I.E.${zk}`];
    for (let k = 0; k < seq.length - 1; k++) addEdge(seq[k], seq[k + 1]);
  }
  addNode('G', YARD.gate.x, YARD.gate.z); addEdge('G', 'I.A.R');
  addNode('Y', YARD.interior.x, YARD.interior.z); addEdge('Y', 'G');
  YARD.bays.forEach((b, k) => { addNode(`BAY.${k}`, b.x, b.z - 6); addEdge('Y', `BAY.${k}`); });
  addNode('LOAD', YARD.load.x, YARD.load.z); addEdge('Y', 'LOAD');
  addNode('RIVAL', -170, ZR.S2); addEdge('RIVAL', 'I.W.S2');
  addNode('BUYER', 170, ZR.R); addEdge('BUYER', 'I.E.R');
  addNode('DUMP.W', -170, ZR.S1); addEdge('DUMP.W', 'I.W.S1');
  addNode('DUMP.E', 170, ZR.S1); addEdge('DUMP.E', 'I.E.S1');
}
export const ROAD = { nodes: NODES, list: NODE_LIST, edges: EDGES };

// district entries: the 4 side midpoints (west, east, north, south)
export function entries(id) {
  const d = DISTRICTS[id];
  const xw = d.col === 0 ? 'W' : 'A', xe = d.col === 0 ? 'A' : 'E';
  const zn = ['P', 'S1', 'S2'][d.row], zs = ['S1', 'S2', 'R'][d.row];
  return [`V.${xw}.${d.row}`, `V.${xe}.${d.row}`, `H.${d.col}.${zn}`, `H.${d.col}.${zs}`];
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)));
  return { d: Math.hypot(px - ax - dx * t, pz - az - dz * t), t };
}
// minimum distance between two segments (sampled; exact enough for blocking tests)
function segSegDist(a, b, c) {
  let best = 1e9;
  for (let k = 0; k <= 16; k++) {
    const t = k / 16;
    const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    const r = segDist(x, z, c.ax, c.az, c.bx, c.bz).d - c.r;
    if (r < best) best = r;
  }
  return best;
}

// Path finder. Blocking: edges whose segment comes within 4 m of the corpse capsules are removed
// (setBlocked); if that disconnects the endpoints, blocking is ignored.
const N0 = NODE_LIST.length, NV = N0 + 2;
const blockedEdge = new Uint8Array(EDGES.length);
const adjStart = new Int32Array(NV + 1);
const dist = new Float64Array(NV), prev = new Int32Array(NV), done = new Uint8Array(NV);
const vx = new Float64Array(NV), vz = new Float64Array(NV);
for (let i = 0; i < N0; i++) { vx[i] = NODE_LIST[i].x; vz[i] = NODE_LIST[i].z; }
const ADJ = Array.from({ length: N0 }, () => []);
EDGES.forEach(([a, b], e) => { ADJ[a].push([b, e]); ADJ[b].push([a, e]); });

export function setBlocked(capsules) {
  blockedEdge.fill(0);
  if (!capsules || !capsules.length) return 0;
  let n = 0;
  EDGES.forEach(([a, b], e) => {
    const A = NODE_LIST[a], B = NODE_LIST[b];
    for (const c of capsules) if (segSegDist(A, B, c) < 4) { blockedEdge[e] = 1; n++; break; }
  });
  return n;
}
export const isBlocked = (e) => blockedEdge[e] === 1;

// virtual endpoints: a point attaches to the nearest (unblocked if possible) edge at its projection
const virt = [null, null];
function attach(slot, p, useBlock) {
  let best = 1e9, be = -1, bt = 0;
  EDGES.forEach(([a, b], e) => {
    if (useBlock && blockedEdge[e]) return;
    const A = NODE_LIST[a], B = NODE_LIST[b];
    if (A.id.startsWith('BAY') || B.id.startsWith('BAY') || A.id === 'LOAD' || B.id === 'LOAD') return;
    const r = segDist(p.x, p.z, A.x, A.z, B.x, B.z);
    if (r.d < best) { best = r.d; be = e; bt = r.t; }
  });
  const [a, b] = EDGES[be];
  const i = N0 + slot;
  vx[i] = NODE_LIST[a].x + (NODE_LIST[b].x - NODE_LIST[a].x) * bt;
  vz[i] = NODE_LIST[a].z + (NODE_LIST[b].z - NODE_LIST[a].z) * bt;
  virt[slot] = { i, a, b, e: be, px: p.x, pz: p.z };
  return i;
}
function resolve(slot, p, useBlock) {
  if (typeof p === 'string') { const n = NODES.get(p); if (!n) throw new Error('unknown road node ' + p); virt[slot] = null; return n.i; }
  return attach(slot, p, useBlock);
}
function dijkstra(s, t, useBlock) {
  dist.fill(Infinity); prev.fill(-1); done.fill(0);
  dist[s] = 0;
  for (;;) {
    let u = -1, du = Infinity;
    for (let i = 0; i < NV; i++) if (!done[i] && dist[i] < du) { du = dist[i]; u = i; }
    if (u < 0 || u === t) break;
    done[u] = 1;
    const relax = (v, w) => { if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; } };
    if (u < N0) {
      for (const [v, e] of ADJ[u]) {
        if (useBlock && blockedEdge[e]) continue;
        // a virtual node splits its edge: do not walk the full edge past it when it is the target
        relax(v, Math.hypot(vx[u] - vx[v], vz[u] - vz[v]));
      }
    }
    for (let k = 0; k < 2; k++) {
      const V = virt[k];
      if (!V) continue;
      if (u === V.a || u === V.b) relax(V.i, Math.hypot(vx[u] - vx[V.i], vz[u] - vz[V.i]));
      if (u === V.i) { relax(V.a, Math.hypot(vx[u] - vx[V.a], vz[u] - vz[V.a])); relax(V.b, Math.hypot(vx[u] - vx[V.b], vz[u] - vz[V.b])); }
    }
    // two virtual nodes on the same edge connect directly
    if (virt[0] && virt[1] && virt[0].e === virt[1].e && (u === virt[0].i || u === virt[1].i)) {
      const o = u === virt[0].i ? virt[1].i : virt[0].i;
      relax(o, Math.hypot(vx[u] - vx[o], vz[u] - vz[o]));
    }
  }
  return dist[t] < Infinity;
}
const chain = new Int32Array(NV + 4);
export const pathInfo = { count: 0 };
// from/to: node id or {x, z}. Writes xz pairs into `out` (Float32Array), returns the length in m.
// pathInfo.count = number of points written; a NaN pair terminates the list when there is room.
export function findPath(from, to, out) {
  let ok = false, s = 0, t = 0;
  for (const useBlock of [true, false]) {
    s = resolve(0, from, useBlock); t = resolve(1, to, useBlock);
    if (dijkstra(s, t, useBlock)) { ok = true; break; }
  }
  let n = 0;
  const cap = out.length >> 1;
  const put = (x, z) => {
    if (n > 0 && Math.abs(out[n * 2 - 2] - x) < 0.01 && Math.abs(out[n * 2 - 1] - z) < 0.01) return;
    if (n < cap) { out[n * 2] = x; out[n * 2 + 1] = z; n++; }
  };
  if (!ok) { pathInfo.count = 0; return 0; }
  let m = 0;
  for (let v = t; v !== -1 && m < chain.length; v = prev[v]) chain[m++] = v;
  let len = 0, px = 0, pz = 0;
  if (typeof from !== 'string') { put(from.x, from.z); px = from.x; pz = from.z; }
  for (let k = m - 1; k >= 0; k--) {
    const v = chain[k];
    if (n > 0) len += Math.hypot(vx[v] - px, vz[v] - pz);
    put(vx[v], vz[v]); px = vx[v]; pz = vz[v];
  }
  if (typeof to !== 'string') { len += Math.hypot(to.x - px, to.z - pz); put(to.x, to.z); }
  if (n < cap) { out[n * 2] = NaN; out[n * 2 + 1] = NaN; }
  pathInfo.count = n;
  return len;
}

// ---------------------------------------------------------------------------------------- corpse
const PITCH = { h: 126, v: 112 };
// Returns { x, z, yaw, length, width, dir:{x,z}, nose:{x,z}, capsules, parts }.
// dir points from the tail to the nose; yaw = atan2(dir.x, dir.z) (three.js rotation.y of a model
// whose head faces local +z). u runs from the nose (0) to the tail tip (1): p(u) = nose - dir * u * length.
export function corpsePlacement(attack) {
  if (!attack || !attack.chain || !attack.chain.length) return null;
  const chainIds = attack.chain.slice();
  const segs = attack.segments || {};
  const order = ['head', 'body', 'tail'];
  chainIds.sort((a, b) => order.indexOf(segs[a] || 'body') - order.indexOf(segs[b] || 'body'));
  const n = chainIds.length;
  let cx, cz, dx, dz, length, horizontal = false;
  if (n === 1) {
    const L = LAND[chainIds[0]];
    cx = L.x; cz = L.z; dx = Math.sin(L.yaw); dz = Math.cos(L.yaw); length = 80;
  } else {
    const a = DISTRICTS[chainIds[0]], b = DISTRICTS[chainIds[n - 1]];
    cx = (a.cx + b.cx) / 2; cz = (a.cz + b.cz) / 2;
    horizontal = a.row === b.row;
    const vx0 = a.cx - b.cx, vz0 = a.cz - b.cz, l = Math.hypot(vx0, vz0) || 1;
    dx = vx0 / l; dz = vz0 / l;
    length = n * (horizontal ? PITCH.h : PITCH.v) * 0.8;
  }
  const width0 = 0.32 * (attack.mutant ? 1.1 : 1);
  const build = (cx, cz, length) => {
    const width = width0 * length;
    const nose = { x: cx + dx * length / 2, z: cz + dz * length / 2 };
    const P = (u) => ({ x: nose.x - dx * u * length, z: nose.z - dz * u * length });
    const caps = [];
    const segU = [[0.12, 0.42, 0.5], [0.42, 0.72, 0.5], [0.72, 0.97, 0.3]];
    for (const [u0, u1, rr] of segU) { const A = P(u0), B = P(u1); caps.push({ ax: A.x, az: A.z, bx: B.x, bz: B.z, r: width * rr }); }
    const H0 = P(0.0), H1 = P(0.14);
    caps.push({ ax: H0.x, az: H0.z, bx: H1.x, bz: H1.z, r: width * 0.3 });
    return { width, nose, P, caps };
  };
  const towerClear = (caps) => {
    let best = 1e9;
    for (const c of caps) best = Math.min(best, segDist(TOWER.x, TOWER.z, c.ax, c.az, c.bx, c.bz).d - c.r);
    return best;
  };
  let res = build(cx, cz, length);
  if (towerClear(res.caps) < 6) {
    // shift sideways (away from the tower) by up to 10 m, then shorten
    const nx = -dz, nz = dx;
    const side = ((TOWER.x - cx) * nx + (TOWER.z - cz) * nz) > 0 ? -1 : 1;
    let found = false;
    for (let s = 1; s <= 10 && !found; s++) {
      const r = build(cx + nx * side * s, cz + nz * side * s, length);
      if (towerClear(r.caps) >= 6) { res = r; cx += nx * side * s; cz += nz * side * s; found = true; }
    }
    if (!found) {
      cx += nx * side * 10; cz += nz * side * 10;
      const minL = 0.7 * n * (horizontal ? PITCH.h : PITCH.v) * (n === 1 ? 0 : 1) || length * 0.7;
      for (let L2 = length; L2 >= minL; L2 -= 4) { res = build(cx, cz, L2); length = L2; if (towerClear(res.caps) >= 6) break; }
    }
  }
  const { width, nose, caps } = res;
  // parts: a boundary is where the axis crosses the street centre line between consecutive cells
  const parts = [];
  if (n === 1) parts.push({ districtId: chainIds[0], seg: segs[chainIds[0]] || 'head', u0: 0, u1: 1 });
  else {
    const bounds = [0];
    for (let k = 0; k < n - 1; k++) {
      const a = DISTRICTS[chainIds[k]], b = DISTRICTS[chainIds[k + 1]];
      // street centre between the two cells
      let u;
      if (horizontal) { const xs = (a.cx + b.cx) / 2; u = Math.abs(dx) > 1e-6 ? (nose.x - xs) / (dx * length) : 0.5; }
      else { const zs = (a.cz + b.cz) / 2; u = Math.abs(dz) > 1e-6 ? (nose.z - zs) / (dz * length) : 0.5; }
      bounds.push(Math.max(0.05, Math.min(0.95, u)));
    }
    bounds.push(1);
    chainIds.forEach((id, k) => parts.push({ districtId: id, seg: segs[id] || order[k], u0: bounds[k], u1: bounds[k + 1] }));
  }
  return { x: cx, z: cz, yaw: Math.atan2(dx, dz), length, width, dir: { x: dx, z: dz }, nose, capsules: caps, parts };
}

// one seeded impact point inside a non-chain damaged district (rubble-only extras, spread targets)
export function impactPoint(id, seed = 1) {
  const d = DISTRICTS[id];
  let a = (seed * 9301 + id * 49297) % 233280; a = a / 233280;
  let b = ((seed + 7) * 7919 + id * 104729) % 233280; b = b / 233280;
  return { x: d.cx + (a - 0.5) * 50, z: d.cz + (b - 0.5) * 44 };
}
