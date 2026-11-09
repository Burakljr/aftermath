// Toys on the line. Five stages per factory (raw -> after station 1 -> ... ->
// finished), one instanced mesh per stage. Items are driven by the game state
// (progress and tray counts) plus 'pass' / 'sold' events, which launch an item
// from a turntable along the belt to the next station's tray or to the truck.
import * as THREE from 'three';
import { G, Builder, toyMaterial, shade, ease, clamp, rng } from './kit.js';
import { BELT_Y } from './factory.js';

const PI = Math.PI;
const MAX = 72;
const SLOT0 = 0.68, SLOT_GAP = 0.52;
const ITEM_SCALE = 1.15;
const M_QUEUE = 1, M_WORK = 2, M_FLIGHT = 3, M_HOP = 4, M_CARGO = 5, M_DOCK = 6;

// ------------------------------------------------------------- geometries
function woodStages(th) {
  const out = [];
  // 0: log
  let b = new Builder();
  b.add(G.cyl(0.14, 0.14, 0.46, 12), th.woodDark, 0, 0.14, 0, { rx: PI / 2 });
  b.add(G.cyl(0.115, 0.115, 0.47, 12), th.wood, 0, 0.14, 0, { rx: PI / 2 });
  b.add(G.cyl(0.05, 0.05, 0.48, 8), th.woodDark, 0, 0.14, 0, { rx: PI / 2 });
  b.add(G.cyl(0.06, 0.06, 0.08, 6), th.woodDark, 0.1, 0.24, 0.05, { rz: 0.6 });
  out.push(b.build());
  // 1: cut blocks
  b = new Builder();
  b.add(G.box(0.2, 0.2, 0.2, 0.04), th.wood, -0.11, 0.1, 0.02);
  b.add(G.box(0.2, 0.2, 0.2, 0.04), shade(th.wood, 0.12), 0.11, 0.1, -0.02);
  b.add(G.box(0.2, 0.2, 0.2, 0.04), shade(th.wood, -0.08), 0, 0.3, 0, { ry: 0.3 });
  out.push(b.build());
  // 2: car body (unpainted wood)
  out.push(carGeo(th, false));
  // 3: painted car (tinted body)
  out.push(carGeo(th, true));
  // 4: gift box
  out.push(giftGeo(th.ribbon));
  return out;
}

function carGeo(th, painted) {
  const b = new Builder();
  const body = painted ? 0xffffff : th.wood;
  const t = painted ? 1 : 0;
  b.add(G.box(0.3, 0.15, 0.48, 0.065), body, 0, 0.15, 0, { tint: t });
  b.add(G.box(0.26, 0.15, 0.24, 0.07), body, 0, 0.28, -0.04, { tint: t });
  const wheel = painted ? 0x2f3247 : th.woodDark;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add(G.cyl(0.08, 0.08, 0.06, 12), wheel, sx * 0.15, 0.08, sz * 0.15, { rz: PI / 2 });
    if (painted) b.add(G.cyl(0.035, 0.035, 0.065, 8), 0xffffff, sx * 0.155, 0.08, sz * 0.15, { rz: PI / 2 });
  }
  if (painted) {
    b.add(G.box(0.27, 0.09, 0.18, 0.04), 0xcdf3ff, 0, 0.29, -0.04);
    b.add(G.box(0.2, 0.09, 0.25, 0.04), 0xcdf3ff, 0, 0.29, -0.04);
    for (const sx of [-1, 1]) b.add(G.sphere(7, 5), 0xfff2a8, sx * 0.09, 0.17, 0.24, { s: 0.035 });
    b.add(G.box(0.04, 0.012, 0.42, 0.006), 0xffffff, 0, 0.226, 0.0);
  } else {
    b.add(G.box(0.2, 0.02, 0.1, 0.01), shade(th.wood, -0.2), 0, 0.36, -0.04);
  }
  return b.build();
}

function giftGeo(ribbon, inner = null) {
  const b = new Builder();
  b.add(G.box(0.4, 0.32, 0.4, 0.06), 0xffffff, 0, 0.16, 0, { tint: 1 });
  b.add(G.box(0.41, 0.06, 0.41, 0.03), 0xffffff, 0, 0.31, 0, { tint: 1 });
  b.add(G.box(0.42, 0.33, 0.08, 0.02), ribbon, 0, 0.165, 0);
  b.add(G.box(0.08, 0.33, 0.42, 0.02), ribbon, 0, 0.165, 0);
  if (inner) inner(b);
  else {
    b.add(G.sphere(7, 5), ribbon, -0.08, 0.38, 0, { sx: 0.1, sy: 0.07, sz: 0.05, rz: 0.5 });
    b.add(G.sphere(7, 5), ribbon, 0.08, 0.38, 0, { sx: 0.1, sy: 0.07, sz: 0.05, rz: -0.5 });
    b.add(G.sphere(7, 5), shade(ribbon, -0.15), 0, 0.36, 0, { s: 0.045 });
  }
  return b.build();
}

function teddyHead(b, fur, x, y, z, s, face = true, tint = 0) {
  b.add(G.sphere(7, 5), fur, x, y, z, { s: 0.13 * s, tint });
  for (const sx of [-1, 1]) {
    b.add(G.sphere(7, 5), fur, x + sx * 0.1 * s, y + 0.09 * s, z - 0.01 * s, { s: 0.055 * s, tint });
    if (face) b.add(G.sphere(7, 5), 0xffc9d8, x + sx * 0.1 * s, y + 0.09 * s, z + 0.03 * s, { s: 0.03 * s });
  }
  if (face) {
    b.add(G.sphere(7, 5), 0xfff1e0, x, y - 0.03 * s, z + 0.1 * s, { sx: 0.06 * s, sy: 0.045 * s, sz: 0.045 * s });
    b.add(G.sphere(7, 5), 0x2a2238, x, y - 0.015 * s, z + 0.145 * s, { s: 0.02 * s });
    for (const sx of [-1, 1]) b.add(G.sphere(7, 5), 0x2a2238, x + sx * 0.05 * s, y + 0.03 * s, z + 0.115 * s, { s: 0.018 * s });
  }
}

function teddyStages(th) {
  const out = [];
  const fab = th.fabric, pink = th.fabricPink;
  // 0: fabric roll
  let b = new Builder();
  b.add(G.cyl(0.14, 0.14, 0.44, 14), fab, 0, 0.14, 0, { rx: PI / 2 });
  b.add(G.cyl(0.145, 0.145, 0.08, 14), pink, 0, 0.14, 0.1, { rx: PI / 2 });
  b.add(G.cyl(0.145, 0.145, 0.08, 14), pink, 0, 0.14, -0.1, { rx: PI / 2 });
  b.add(G.cyl(0.04, 0.04, 0.46, 8), 0xffffff, 0, 0.14, 0, { rx: PI / 2 });
  out.push(b.build());
  // 1: cut fabric pieces (flat bear shapes, two layers)
  b = new Builder();
  const piece = (y, c, ox) => {
    b.add(G.cyl(0.15, 0.15, 0.035, 14), c, ox, y, -0.05);
    b.add(G.cyl(0.11, 0.11, 0.035, 14), c, ox, y, 0.15);
    b.add(G.cyl(0.045, 0.045, 0.035, 8), c, ox - 0.08, y, 0.24);
    b.add(G.cyl(0.045, 0.045, 0.035, 8), c, ox + 0.08, y, 0.24);
  };
  piece(0.02, fab, 0);
  piece(0.06, shade(fab, 0.15), 0.03);
  out.push(b.build());
  // 2: stuffed blank body (no face yet)
  b = new Builder();
  const blank = shade(fab, 0.25);
  b.add(G.sphere(7, 5), blank, 0, 0.15, 0, { sx: 0.17, sy: 0.15, sz: 0.15 });
  b.add(G.sphere(7, 5), blank, 0, 0.36, 0.0, { s: 0.12 });
  for (const sx of [-1, 1]) b.add(G.sphere(7, 5), blank, sx * 0.09, 0.45, 0, { s: 0.045 });
  b.add(G.torus(0.15, 0.01, 4, 16), shade(fab, -0.1), 0, 0.15, 0, { rx: PI / 2 });
  out.push(b.build());
  // 3: teddy bear (tinted fur)
  b = new Builder();
  b.add(G.sphere(7, 5), 0xffffff, 0, 0.16, 0, { sx: 0.16, sy: 0.15, sz: 0.14, tint: 1 });
  b.add(G.sphere(7, 5), 0xfff1e0, 0, 0.15, 0.1, { sx: 0.09, sy: 0.09, sz: 0.05 });
  for (const sx of [-1, 1]) {
    b.add(G.sphere(7, 5), 0xffffff, sx * 0.15, 0.2, 0.04, { s: 0.06, tint: 1 });   // arms
    b.add(G.sphere(7, 5), 0xffffff, sx * 0.09, 0.05, 0.1, { s: 0.065, tint: 1 }); // legs
    b.add(G.sphere(7, 5), 0xfff1e0, sx * 0.09, 0.05, 0.155, { sx: 0.04, sy: 0.04, sz: 0.02 });
  }
  teddyHead(b, 0xffffff, 0, 0.38, 0.01, 1.05, true, 1);
  b.add(G.sphere(7, 5), th.ribbon, 0, 0.27, 0.11, { sx: 0.05, sy: 0.03, sz: 0.03 });
  out.push(b.build());
  // 4: ribbon box with a teddy peeking out
  out.push(giftGeo(th.ribbon, (bb) => {
    teddyHead(bb, fab, 0, 0.4, 0.02, 0.85, true, 0);
    bb.add(G.sphere(7, 5), th.ribbon, 0.15, 0.34, 0.15, { sx: 0.09, sy: 0.06, sz: 0.05, rz: 0.5, ry: -0.8 });
    bb.add(G.sphere(7, 5), th.ribbon, 0.2, 0.34, 0.08, { sx: 0.09, sy: 0.06, sz: 0.05, rz: -0.5, ry: -0.8 });
  }));
  return out;
}

// ----------------------------------------------------------------- system
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const counts = new Int32Array(5);

export function createItems(theme, path, preset) {
  const group = new THREE.Group();
  group.name = 'items';
  const mat = toyMaterial();
  const geos = theme.key === 'teddy' ? teddyStages(theme) : woodStages(theme);
  const meshes = geos.map((g, k) => {
    const m = new THREE.InstancedMesh(g, mat, MAX);
    m.name = `items-stage${k}`;
    m.count = 0;
    m.setColorAt(0, new THREE.Color(0xffffff));
    m.frustumCulled = false;
    group.add(m);
    return m;
  });
  const palettes = [null, null, null, theme.toy.map((c) => new THREE.Color(c)), theme.box.map((c) => new THREE.Color(c))];
  const white = new THREE.Color(0xffffff);
  const rand = rng(1234);

  // pool
  const act = new Uint8Array(MAX), stage = new Int8Array(MAX), tint = new Uint8Array(MAX), mode = new Uint8Array(MAX);
  const stn = new Int8Array(MAX), sArr = new Float32Array(MAX), s0 = new Float32Array(MAX), s1 = new Float32Array(MAX);
  const tt = new Float32Array(MAX), dur = new Float32Array(MAX), appear = new Float32Array(MAX), slot = new Int8Array(MAX);
  const hx = new Float32Array(MAX * 3), hy = new Float32Array(MAX * 3); // hop start / end
  const spinOff = new Float32Array(MAX);
  let free = [];
  for (let i = MAX - 1; i >= 0; i--) free.push(i);
  const alloc = () => {
    const id = free.pop();
    if (id === undefined) return -1;
    act[id] = 1; appear[id] = 1; tt[id] = 0; slot[id] = -1; spinOff[id] = rand() * PI * 2;
    return id;
  };
  const release = (id) => { if (id >= 0 && act[id]) { act[id] = 0; free.push(id); } };

  const Q = [0, 1, 2, 3].map(() => ({ ids: new Int16Array(3), n: 0 }));
  const work = new Int16Array([-1, -1, -1, -1]);
  const inflight = new Uint8Array(4);
  const lastP = new Float32Array(4);
  let truckFlights = 0;
  let truckHops = 0;
  let dockN = 0;
  let feedShift = 0;
  let lastOpen = 1;
  const stOpen = [true, true, false, false];

  const qPush = (j, id) => { const q = Q[j]; if (q.n >= 3) { release(id); return; } q.ids[q.n++] = id; mode[id] = M_QUEUE; stn[id] = j; };
  const qShift = (j) => { const q = Q[j]; if (!q.n) return -1; const id = q.ids[0]; for (let k = 1; k < q.n; k++) q.ids[k - 1] = q.ids[k]; q.n--; return id; };
  const slotS = (j, k) => path.corner(j) - SLOT0 - SLOT_GAP * k;
  const randTint = (st) => (palettes[st] ? Math.floor(rand() * palettes[st].length) : 0);

  function nextOpen(j) {
    for (let k = j + 1; k < 4; k++) if (stOpen[k]) return k;
    return -1;
  }

  /** launch the finished item of station j toward station `to` (index) or the truck (-1) */
  function launch(j, to) {
    let id = work[j];
    if (id >= 0) { work[j] = -1; }
    if (to >= 0) {
      if (inflight[to] >= 3) { release(id); return; }
    } else if (truckFlights >= 6) { release(id); return; }
    if (id < 0) { id = alloc(); if (id < 0) return; stage[id] = Math.min(4, j + 1); tint[id] = randTint(stage[id]); }
    const out = Math.min(4, j + 1);
    if (stage[id] !== out) {
      // keep the paint colour chosen at the start of the cycle for the painted stage
      if (!(out === 3 && palettes[3])) tint[id] = randTint(out);
      stage[id] = out;
    }
    mode[id] = M_FLIGHT;
    stn[id] = to;
    s0[id] = path.corner(j);
    if (to >= 0) {
      const k = Math.min(2, Q[to].n + inflight[to]);
      s1[id] = slotS(to, k);
      inflight[to]++;
    } else {
      s1[id] = path.total;
      truckFlights++;
    }
    tt[id] = 0;
    dur[id] = clamp((s1[id] - s0[id]) / 3.4, 0.45, 1.25);
    appear[id] = Math.min(appear[id], 1);
  }

  function truckRoom(truck) { return truck.phase === 'parked' && truck.load + truckHops < truck.capacity; }

  function startHop(id, truck) {
    // from the belt end into the truck bed, or onto the dock if the truck is away
    path.at(path.total, _v);
    hx[id * 3] = _v.x; hx[id * 3 + 1] = _v.y; hx[id * 3 + 2] = _v.z;
    if (truckRoom(truck)) {
      slot[id] = truck.load + truckHops;
      truckHops++;
      truck.slot(slot[id], _w);
      stn[id] = -1;
    } else if (truck.phase === 'parked') {
      // truck is full and about to leave: hop onto the pile and disappear inside
      slot[id] = truck.capacity - 1;
      truck.slot(slot[id], _w);
      _w.y += 0.3;
      stn[id] = -3;
    } else {
      if (dockN >= 3) { release(id); return; }
      slot[id] = dockN;
      dockPos(dockN, _w);
      dockN++;
      stn[id] = -2;
    }
    mode[id] = M_HOP;
    hy[id * 3] = _w.x; hy[id * 3 + 1] = _w.y; hy[id * 3 + 2] = _w.z;
    tt[id] = 0;
    dur[id] = 0.38;
  }

  function dockPos(k, out) {
    path.at(path.total, out);
    out.x += -0.45 + k * 0.45;
    out.z += 0.42;
    out.y = 0.02;
    return out;
  }

  const api = {
    group,
    meshes,
    /** colour of the toy being made at station j (paint puffs etc.) */
    workColor(j, out) {
      const id = work[j];
      if (id >= 0 && palettes[3] && j === 2) return out.copy(palettes[3][tint[id] % palettes[3].length]);
      return null;
    },
    hasWork(j) { return work[j] >= 0; },
    onPass(from, to) { launch(from, to); },
    onSold(from) { launch(from, -1); },
    reset() {
      for (let i = 0; i < MAX; i++) release(i);
      for (const q of Q) q.n = 0;
      work.fill(-1); inflight.fill(0); truckFlights = 0; truckHops = 0; dockN = 0;
    },

    update(state, dt, stations, truck) {
      const ss = (state && state.factory && state.factory.stations) || [];
      for (let j = 0; j < 4; j++) stOpen[j] = !!(ss[j] && ss[j].open);
      lastOpen = 0;
      for (let j = 0; j < 4; j++) if (stOpen[j]) lastOpen = j;

      // ---- reconcile stations with the state
      for (let j = 0; j < 4; j++) {
        const s = ss[j];
        if (!s || !s.open) {
          while (Q[j].n) release(qShift(j));
          if (work[j] >= 0) { release(work[j]); work[j] = -1; }
          continue;
        }
        const p = s.progress || 0;
        const hasWork = p > 0;
        const newCycle = p > 0 && p < lastP[j] - 0.001 || (lastP[j] === 0 && p > 0);
        lastP[j] = p;
        if (j > 0) {
          const desired = Math.max(0, Math.min(3, s.tray | 0) - inflight[j]);
          while (Q[j].n > desired) {
            const id = qShift(j);
            if (hasWork && work[j] < 0) { work[j] = id; mode[id] = M_WORK; stn[id] = j; tt[id] = 0; s0[id] = sArr[id]; }
            else release(id);
          }
          while (Q[j].n < desired) {
            const id = alloc();
            if (id < 0) break;
            stage[id] = j; tint[id] = randTint(j);
            sArr[id] = slotS(j, Q[j].n); appear[id] = 0;
            qPush(j, id);
          }
        } else if (newCycle) {
          feedShift = 1;
        }
        if (hasWork && work[j] < 0) {
          const id = alloc();
          if (id >= 0) {
            stage[id] = j; tint[id] = randTint(j);
            mode[id] = M_WORK; stn[id] = j; tt[id] = 0;
            s0[id] = slotS(j, 0); sArr[id] = s0[id];
            appear[id] = j === 0 ? 1 : 0;
            work[j] = id;
          }
        } else if (!hasWork && work[j] >= 0) {
          release(work[j]); work[j] = -1;
        }
        if (work[j] >= 0) {
          const id = work[j];
          // paint colour is decided when the paint cycle starts
          if (j === 2 && palettes[3] && newCycle) tint[id] = randTint(3);
          const fin = p >= 1;
          stage[id] = fin ? Math.min(4, j + 1) : j;
          if (fin && j + 1 === 4 && palettes[4] && tint[id] >= palettes[4].length) tint[id] = 0;
        }
      }
      feedShift = Math.max(0, feedShift - dt * 4);

      // ---- truck: unload when it left, move dock items in when it is back
      if (truck.phase === 'away') {
        for (let i = 0; i < MAX; i++) if (act[i] && mode[i] === M_CARGO) release(i);
      }
      if (dockN > 0 && truckRoom(truck)) {
        for (let i = 0; i < MAX; i++) {
          if (act[i] && mode[i] === M_DOCK) {
            hx[i * 3] = hy[i * 3]; hx[i * 3 + 1] = hy[i * 3 + 1]; hx[i * 3 + 2] = hy[i * 3 + 2];
            slot[i] = truck.load + truckHops;
            truckHops++;
            truck.slot(slot[i], _w);
            hy[i * 3] = _w.x; hy[i * 3 + 1] = _w.y; hy[i * 3 + 2] = _w.z;
            mode[i] = M_HOP; stn[i] = -1; tt[i] = 0; dur[i] = 0.4;
            dockN--;
            // keep the remaining dock items packed
            for (let k = 0; k < MAX; k++) if (act[k] && mode[k] === M_DOCK && slot[k] > 0) { slot[k]--; dockPos(slot[k], _v); hy[k * 3] = _v.x; hy[k * 3 + 1] = _v.y; hy[k * 3 + 2] = _v.z; }
            break; // one per frame
          }
        }
      }

      // ---- move and draw
      counts.fill(0);
      for (let id = 0; id < MAX; id++) {
        if (!act[id]) continue;
        const md = mode[id];
        let heading = 0, y = 0, sc = 1, extraY = 0;
        if (appear[id] < 1) appear[id] = Math.min(1, appear[id] + dt * 4);
        sc = appear[id] >= 1 ? 1 : ease.outBack(appear[id], 2.5);
        if (md === M_QUEUE) {
          const j = stn[id];
          const q = Q[j];
          let k = 0;
          for (; k < q.n; k++) if (q.ids[k] === id) break;
          const target = slotS(j, k);
          const d = target - sArr[id];
          sArr[id] += Math.sign(d) * Math.min(Math.abs(d), dt * 2.6);
          heading = path.at(sArr[id], _p);
        } else if (md === M_WORK) {
          const j = stn[id];
          tt[id] += dt;
          const k = clamp(tt[id] / 0.22, 0, 1);
          const sNow = s0[id] + (path.corner(j) - s0[id]) * ease.outCubic(k);
          heading = path.at(sNow, _p);
          if (k >= 1) {
            const st = stations.stations[j];
            heading = stations.turntableAngle(j) + spinOff[id];
            extraY = Math.abs(Math.sin(st.beat * PI * 2)) * 0.04 * st.work;
          }
        } else if (md === M_FLIGHT) {
          tt[id] += dt;
          const k = clamp(tt[id] / dur[id], 0, 1);
          const e = ease.inOut(k);
          sArr[id] = s0[id] + (s1[id] - s0[id]) * e;
          heading = path.at(sArr[id], _p);
          extraY = Math.sin(clamp(k * 4, 0, 1) * PI) * 0.12;
          if (k >= 1) {
            const to = stn[id];
            if (to >= 0) { inflight[to] = Math.max(0, inflight[to] - 1); qPush(to, id); if (!act[id]) continue; }
            else { truckFlights = Math.max(0, truckFlights - 1); startHop(id, truck); if (!act[id]) continue; }
          }
        } else if (md === M_HOP) {
          tt[id] += dt;
          const k = clamp(tt[id] / dur[id], 0, 1);
          // the truck may move: re-aim at the slot
          if ((stn[id] === -1 || stn[id] === -3) && slot[id] >= 0 && slot[id] < 6) { truck.slot(slot[id], _w); if (stn[id] === -3) _w.y += 0.3; hy[id * 3] = _w.x; hy[id * 3 + 1] = _w.y; hy[id * 3 + 2] = _w.z; }
          _p.set(hx[id * 3] + (hy[id * 3] - hx[id * 3]) * k, hx[id * 3 + 1] + (hy[id * 3 + 1] - hx[id * 3 + 1]) * k + Math.sin(k * PI) * 0.7, hx[id * 3 + 2] + (hy[id * 3 + 2] - hx[id * 3 + 2]) * k);
          heading = k * PI * 0.5;
          if (k >= 1) {
            if (stn[id] === -3) { truck.bounce = 1; release(id); continue; }
            if (stn[id] === -1) {
              truckHops = Math.max(0, truckHops - 1);
              if (truck.phase === 'parked' && slot[id] < truck.capacity) { mode[id] = M_CARGO; truck.addLoad(); }
              else { release(id); continue; }
            } else { mode[id] = M_DOCK; }
          }
          y = 0;
        } else if (md === M_CARGO) {
          if (slot[id] < 0 || slot[id] > 5) { release(id); continue; }
          truck.slot(slot[id], _p);
          heading = (slot[id] % 2) * 0.4 - 0.2 + PI;
        } else if (md === M_DOCK) {
          _p.set(hy[id * 3], hy[id * 3 + 1], hy[id * 3 + 2]);
          heading = 0.3;
        }
        if (md === M_QUEUE || md === M_WORK || md === M_FLIGHT) _p.y = BELT_Y + (md === M_WORK ? 0.02 : 0);
        _p.y += y + extraY;
        // raw feed items shuffle forward when station 1 starts a cycle
        const stg = stage[id];
        _q.setFromAxisAngle(_up, heading);
        sc *= md === M_CARGO || (md === M_HOP && stn[id] !== -2) ? 1 : ITEM_SCALE;
        _s.set(sc, sc, sc);
        _m.compose(_p, _q, _s);
        const mesh = meshes[stg];
        const n = counts[stg]++;
        if (n >= MAX) continue;
        mesh.setMatrixAt(n, _m);
        const pal = palettes[stg];
        mesh.setColorAt(n, pal ? pal[tint[id] % pal.length] : white);
      }
      // raw material waiting on the feed belt for station 1 (always there)
      if (stOpen[0]) {
        for (let k = 0; k < 3; k++) {
          const s = slotS(0, k) - feedShift * SLOT_GAP;
          const heading = path.at(s, _p);
          _p.y = BELT_Y;
          _q.setFromAxisAngle(_up, heading);
          const sc = (k === 2 ? 1 - feedShift : 1) * ITEM_SCALE;
          _s.set(sc, sc, sc);
          _m.compose(_p, _q, _s);
          const n = counts[0]++;
          meshes[0].setMatrixAt(n, _m);
          meshes[0].setColorAt(n, white);
        }
      }
      for (let k = 0; k < 5; k++) {
        const m = meshes[k];
        m.count = counts[k];
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    },

    dispose() { for (const g of geos) g.dispose(); },
  };
  return api;
}
