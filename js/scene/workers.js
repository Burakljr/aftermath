// Chibi workers: one operator per open station plus a few carriers who walk
// the finished toys from the last open station to the truck (visual only:
// driven by 'sold' events, station progress and the truck state).
//
// Draw calls: operator bodies, carrier bodies, arms (all workers) and feet
// (all workers) = 4 instanced meshes. Heads are about as big as the bodies,
// with simple faces; ink outlines are baked into the geometry (kit.js).
import * as THREE from 'three';
import { G, Builder, PAL, toyMaterial, shade, ease, clamp } from './kit.js';
import { CORNERS } from './layout.js';

const PI = Math.PI;
const INK = PAL.ink;
const SKIN = [0xffd2b0, 0xf2b98f, 0xc98d64, 0xffe0c7, 0x9c6a48, 0xe8a87c];
const SHOULDER_Y = 0.33, SHOULDER_X = 0.215;
const FOOT_X = 0.095;
const WS = 1.16; // worker scale
const N_CARRIERS = 3;
const STACK_MAX = 3;
const WALK_SPEED = 1.75;

// carrier route (world x, z): one line from the station-2 pickup past the
// station-3 / station-4 pickups to the right side of the truck
const ROUTE = [[4.45, 0.62], [4.42, 2.95], [4.4, 4.35], [6.5, 4.6], [7.95, 4.4], [8.42, 5.92]];
const PICK_NODE = { 1: 0, 2: 2, 3: 4 }; // last open station index -> route node
const T_NODE = ROUTE.length - 1;
// waiting spots behind each pickup and drop spots beside the truck
const QUEUE = {
  0: [[4.45, 0.62], [4.64, 1.02], [5.1, 0.72]],
  2: [[4.4, 4.35], [4.92, 4.78], [5.42, 4.98]],
  4: [[7.95, 4.38], [8.6, 4.45], [9.22, 4.62]],
};
const DROP = [[8.42, 5.92], [8.5, 6.48]];

// ------------------------------------------------------------- geometry
function buildBody(c, capStyle) {
  const b = new Builder();
  // overalls body + sleeves (shoulders) + bib, straps, buttons, pocket
  b.add(G.box(0.38, 0.3, 0.3, 0.13), c.suit, 0, 0.23, 0);
  b.add(G.box(0.34, 0.09, 0.27, 0.03), c.shirt, 0, 0.38, 0, { ol: 0 });
  for (const sx of [-1, 1]) b.add(G.sphere(6, 5), c.shirt, sx * 0.2, 0.33, 0, { s: 0.08, ol: 0.8 });
  b.add(G.box(0.22, 0.13, 0.04, 0.02), c.suit, 0, 0.33, 0.135, { ol: 0 });
  for (const sx of [-1, 1]) {
    b.add(G.box(0.05, 0.08, 0.03, 0.01), c.suit, sx * 0.085, 0.4, 0.13, { ol: 0 });
    b.add(G.sphere(6, 4), PAL.yellow, sx * 0.085, 0.37, 0.158, { s: 0.026, ol: 0 });
  }
  b.add(G.box(0.12, 0.06, 0.03, 0.01), shade(c.suit, 0.25), 0, 0.27, 0.155, { ol: 0 });
  // head (tinted: skin tone per worker), ears, nose
  b.add(G.sphere(12, 9), 0xffffff, 0, 0.68, 0, { s: 0.3, tint: 1 });
  for (const sx of [-1, 1]) b.add(G.sphere(6, 4), 0xffffff, sx * 0.29, 0.66, 0.0, { s: 0.065, tint: 1, ol: 0.7 });
  b.add(G.sphere(6, 4), 0xffffff, 0, 0.645, 0.29, { s: 0.035, tint: 1, ol: 0 });
  // hair below the cap
  b.add(G.sphere(8, 6), c.hair, 0, 0.72, -0.05, { sx: 0.31, sy: 0.27, sz: 0.29, ol: 0 });
  for (const sx of [-1, 1]) b.add(G.sphere(6, 5), c.hair, sx * 0.23, 0.69, 0.14, { sx: 0.075, sy: 0.1, sz: 0.06, ol: 0 });
  // face: big eyes with sparkles, brows, cheeks, open smile
  for (const sx of [-1, 1]) {
    b.add(G.sphere(7, 5), INK, sx * 0.105, 0.685, 0.262, { sx: 0.047, sy: 0.07, sz: 0.03, ol: 0 });
    b.add(G.sphere(6, 4), 0xffffff, sx * 0.105 + 0.016, 0.708, 0.287, { s: 0.017, ol: 0 });
    b.add(G.box(0.07, 0.018, 0.012, 0), INK, sx * 0.105, 0.778, 0.262, { rz: sx * -0.18, ol: 0 });
    b.add(G.sphere(6, 4), 0xff7f9e, sx * 0.185, 0.615, 0.225, { sx: 0.055, sy: 0.032, sz: 0.02, ol: 0 });
  }
  b.add(G.hemi(8, 3), INK, 0, 0.6, 0.272, { sx: 0.06, sy: 0.045, sz: 0.03, rx: PI, ol: 0 });
  b.add(G.sphere(6, 4), 0xff6f8a, 0, 0.575, 0.288, { sx: 0.03, sy: 0.015, sz: 0.01, ol: 0 });
  // cap
  if (capStyle === 'hardhat') {
    b.add(G.hemi(12, 5), c.hat, 0, 0.77, -0.01, { sx: 0.325, sy: 0.27, sz: 0.325 });
    b.add(G.cyl(0.35, 0.36, 0.045, 14), c.hat, 0, 0.775, 0.025, { sz: 1.1 });
    b.add(G.torus(0.2, 0.04, 4, 10, PI), c.hatBand, 0, 0.79, -0.01, { ry: PI / 2, ol: 0 });
    b.add(G.star(0.075, 0.034, 0.03, 5, false), 0xffffff, 0, 0.92, 0.27, { rx: -0.5, ol: 0 });
  } else {
    b.add(G.hemi(12, 5), c.hat, 0, 0.77, -0.01, { sx: 0.315, sy: 0.25, sz: 0.315 });
    b.add(G.box(0.32, 0.04, 0.22, 0.02), c.hat, 0, 0.775, 0.3, { rx: -0.12 });
    b.add(G.sphere(6, 4), c.hatBand, 0, 1.02, -0.01, { s: 0.055, ol: 0.6 });
    b.add(G.box(0.3, 0.07, 0.02, 0.01), c.hatBand, 0, 0.86, 0.29, { rx: -0.35, ol: 0 });
  }
  return b.build();
}

function buildArm() {
  const b = new Builder();
  b.add(G.cyl(0.052, 0.048, 0.15, 6), 0xffffff, 0, -0.065, 0, { tint: 1 });
  b.add(G.sphere(6, 5), 0xffffff, 0, -0.16, 0, { s: 0.066, tint: 1 });
  return b.build();
}

function buildFoot(c) {
  const b = new Builder();
  b.add(G.sphere(8, 4), c.boots, 0, 0.045, 0.025, { sx: 0.075, sy: 0.06, sz: 0.105 });
  return b.build();
}

// ------------------------------------------------------------- helpers
const _m = new THREE.Matrix4();
const _a = new THREE.Matrix4();
const _f = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _spot = new THREE.Vector3();
const _one = new THREE.Vector3(1, 1, 1);

function angleTo(from, to) {
  let d = to - from;
  while (d > PI) d -= 2 * PI;
  while (d < -PI) d += 2 * PI;
  return d;
}

export function createWorkers(theme, path) {
  const group = new THREE.Group();
  group.name = 'workers';
  const mat = toyMaterial();
  const capOp = theme.key === 'teddy' ? 'cap' : 'hardhat';
  const NW = 4 + N_CARRIERS;
  const opBodies = new THREE.InstancedMesh(buildBody(theme.worker, capOp), mat, 4);
  const caBodies = new THREE.InstancedMesh(buildBody(theme.carrier, 'cap'), mat, N_CARRIERS);
  const arms = new THREE.InstancedMesh(buildArm(), mat, NW * 2);
  const feet = new THREE.InstancedMesh(buildFoot(theme.worker), mat, NW * 2);
  opBodies.name = 'worker-bodies';
  caBodies.name = 'carrier-bodies';
  arms.name = 'worker-arms';
  feet.name = 'worker-feet';
  for (const m of [opBodies, caBodies, arms, feet]) { m.frustumCulled = false; group.add(m); }
  const skin = [];
  for (let i = 0; i < NW; i++) skin.push(new THREE.Color(SKIN[(i * 3 + (theme.key === 'teddy' ? 1 : 0)) % SKIN.length]));
  for (let i = 0; i < 4; i++) opBodies.setColorAt(i, skin[i]);
  for (let i = 0; i < N_CARRIERS; i++) caBodies.setColorAt(i, skin[4 + i]);
  for (let i = 0; i < NW * 2; i++) arms.setColorAt(i, skin[i >> 1]);
  const W = [0, 1, 2, 3].map((i) => ({ appear: 0, wasOpen: false, phase: i * 1.7 }));

  // carriers
  const C = [];
  for (let k = 0; k < N_CARRIERS; k++) {
    C.push({
      k, state: 'init', x: 0, z: 0, ry: 0, y: 0,
      path: [], pi: 0, node: 0, walk: 0, moving: 0, speed: WALK_SPEED * (0.95 + k * 0.05),
      stack: [], firstT: 0, wait: 0, throwT: 0, flick: 0, t: k * 1.3, drop: 0, look: 0,
    });
  }
  const queue = []; // carrier indices waiting (or walking back) at the pickup, in order
  let pick = -1; // route node of the current pickup (-1: no pickup)
  let pickStation = -1;
  const spots = [];
  for (let i = 0; i < NW; i++) spots.push({ x: 0, z: 0, s: 0 });

  function hopY(x, z) {
    const d = path.dist(x, z);
    return d < 0.66 ? 0.46 * Math.sqrt(1 - (d / 0.66) * (d / 0.66)) : 0;
  }
  function queueSpot(k, out) {
    const list = QUEUE[pick < 0 ? 0 : pick] || QUEUE[0];
    const p = list[Math.min(k, list.length - 1)];
    out.set(p[0], 0, p[1]);
    return out;
  }
  /** route node list from node a to node b along the line */
  function routeNodes(a, b) {
    const out = [];
    const st = a <= b ? 1 : -1;
    for (let n = a; n !== b + st; n += st) out.push([ROUTE[n][0], ROUTE[n][1]]);
    return out;
  }
  function nearestNode(x, z) {
    let best = 0, bd = Infinity;
    for (let n = 0; n < ROUTE.length; n++) { const d = Math.hypot(ROUTE[n][0] - x, ROUTE[n][1] - z); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  function joinQueue(c) {
    if (!queue.includes(c.k)) queue.push(c.k);
  }
  function leaveQueue(c) {
    const i = queue.indexOf(c.k);
    if (i >= 0) queue.splice(i, 1);
  }
  function placeAtQueue(c) {
    joinQueue(c);
    queueSpot(queue.indexOf(c.k), _v);
    c.x = _v.x; c.z = _v.z; c.state = 'wait'; c.node = pick < 0 ? 0 : pick; c.path.length = 0;
  }
  function goBack(c, fromNode) {
    // walk from fromNode back to the current pickup, then to the queue spot
    const target = pick < 0 ? 0 : pick;
    c.path = routeNodes(fromNode, target);
    c.pi = 0;
    c.node = target;
    c.state = 'return';
    joinQueue(c);
  }

  /** a stack entry: { stage, tint, t (0..1 arrival), fx, fy, fz (start) } */
  function pushStack(c, stage, tint, from) {
    c.stack.push({ stage, tint, t: 0, fx: from.x, fy: from.y, fz: from.z });
    if (c.stack.length === 1) c.firstT = 0;
  }

  const api = {
    group,
    spots,
    /** a toy finished at station j (last open): returns true if a carrier takes it */
    takeSold(j, from, items) {
      if (j !== pickStation || !queue.length) return false;
      const c = C[queue[0]];
      if (c.state !== 'wait' || c.stack.length >= STACK_MAX) return false;
      queueSpot(0, _v);
      if (Math.abs(c.x - _v.x) + Math.abs(c.z - _v.z) > 0.15) return false;
      const it = items.takeWork(j);
      pushStack(c, it.stage, it.tint, from);
      return true;
    },

    update(dt, stationsApi, truck, items, lastOpen) {
      // ---------------------------------------------------- operators
      let n = 0;
      for (let i = 0; i < 4; i++) {
        const st = stationsApi.stations[i];
        const w = W[i];
        const sp = spots[i];
        if (!st.open) { w.wasOpen = false; w.appear = 0; sp.s = 0; continue; }
        if (!w.wasOpen) { w.wasOpen = true; w.appear = st.openT >= 0 ? -0.35 : 1; }
        if (w.appear < 1) w.appear = Math.min(1, w.appear + dt * 2.2);
        const ap = w.appear <= 0 ? 0 : ease.outBack(w.appear, 2.2);
        if (ap <= 0.001) { sp.s = 0; continue; }
        const ry0 = stationsApi.workerSpot(i, _spot, st.work);
        const t = st.t + w.phase;
        const work = st.work;
        const boost = st.boostAmt;
        // cheer jump on upgrades
        const ch = st.cheer;
        const jumpK = ch > 0 ? 1 - ch : 1;
        const jump = ch > 0 ? Math.max(0, Math.sin(Math.min(1, jumpK / 0.5) * PI)) * (0.42 + boost * 0.05) : 0;
        const beat = st.beat * PI * 4;
        const bounce = Math.abs(Math.sin(beat));
        const bob = bounce * 0.05 * work + boost * Math.abs(Math.sin(t * 14)) * 0.05;
        const look = (1 - work) * Math.sin(t * 0.7) * 0.4 + work * Math.sin(beat * 0.5) * 0.06;
        let sqY = 1 + Math.sin(t * 2.4) * 0.025 * (1 - work) + (bounce - 0.5) * 0.08 * work, sqX = 2 - sqY;
        if (ch > 0 && jumpK < 0.5) { const k = jumpK / 0.5; sqY = 1 + Math.sin(k * PI) * 0.12; sqX = 1 - Math.sin(k * PI) * 0.07; }
        else if (ch > 0 && jumpK < 0.72) { const k = (jumpK - 0.5) / 0.22; sqY = 1 - Math.sin(k * PI) * 0.18; sqX = 1 + Math.sin(k * PI) * 0.12; }
        const ry = ry0 + look;
        _p.set(_spot.x, bob + jump, _spot.z);
        _e.set(0, ry, Math.sin(t * 1.1) * 0.04 * (1 - work), 'YXZ');
        _q.setFromEuler(_e);
        _s.set(ap * sqX * WS, ap * sqY * WS, ap * sqX * WS);
        _m.compose(_p, _q, _s);
        opBodies.setMatrixAt(n, _m);
        opBodies.setColorAt(n, skin[i]);
        // arms
        for (let side = 0; side < 2; side++) {
          const sgn = side ? 1 : -1;
          let ax, az;
          if (ch > 0 && jumpK < 0.9) { ax = -2.75; az = sgn * 0.4; }
          else {
            const swing = Math.sin(beat + side * PI);
            const idleX = Math.sin(t * 1.6 + side * PI) * 0.14;
            const workX = -1.1 - swing * 0.5 - boost * 0.2;
            ax = idleX * (1 - work) + workX * work;
            az = sgn * (0.16 + 0.1 * work);
          }
          _e.set(ax, 0, az, 'XYZ');
          _q.setFromEuler(_e);
          _a.compose(_p.set(sgn * SHOULDER_X, SHOULDER_Y, 0), _q, _one);
          _a.premultiply(_m);
          arms.setMatrixAt(n * 2 + side, _a);
          arms.setColorAt(n * 2 + side, skin[i]);
          // feet: planted, little taps on the beat, lifted in the jump
          const lift = Math.max(0, Math.sin(beat + side * PI)) * 0.035 * work;
          _q.setFromAxisAngle(_v.set(0, 1, 0), ry);
          _w.set(sgn * FOOT_X * WS * ap, 0, 0).applyQuaternion(_q);
          _f.compose(_p.set(_spot.x + _w.x, jump * 0.9 + lift, _spot.z + _w.z), _q, _s.set(WS * ap, WS * ap, WS * ap));
          feet.setMatrixAt(n * 2 + side, _f);
        }
        sp.x = _spot.x; sp.z = _spot.z; sp.s = ap * (1 - jump * 0.8);
        n++;
      }
      opBodies.count = n;
      const nOpLimbs = n * 2;

      // ---------------------------------------------------- carriers
      const newPick = PICK_NODE[lastOpen] ?? -1;
      pickStation = newPick >= 0 ? lastOpen : -1;
      if (C[0].state === 'init') {
        pick = newPick;
        for (const c of C) placeAtQueue(c);
      } else if (newPick !== pick) {
        const old = pick;
        pick = newPick;
        // waiting carriers walk over to the new pickup (keeping what they hold)
        for (const c of C) {
          if (c.state === 'wait' || c.state === 'return') { leaveQueue(c); goBack(c, nearestNode(c.x, c.z)); c.path.unshift([c.x, c.z]); }
        }
      }
      let nl = nOpLimbs;
      let nc = 0;
      for (const c of C) {
        c.t += dt;
        let moved = 0;
        // decide
        if (c.state === 'wait') {
          const qi = queue.indexOf(c.k);
          queueSpot(qi < 0 ? 0 : qi, _v);
          const dx = _v.x - c.x, dz = _v.z - c.z, d = Math.hypot(dx, dz);
          if (d > 0.02) {
            const step = Math.min(d, c.speed * 0.8 * dt);
            c.x += (dx / d) * step; c.z += (dz / d) * step; moved = step;
            c.ry += angleTo(c.ry, Math.atan2(dx, dz)) * Math.min(1, dt * 10);
          } else {
            // face the viewer, glance at the station when a toy arrives
            const j = pickStation >= 0 ? pickStation : 1;
            let want = PI / 4 + Math.sin(c.t * 0.6 + c.k) * 0.35;
            const fresh = c.stack.length && c.stack[c.stack.length - 1].t < 1;
            if (fresh) want = Math.atan2(CORNERS[j][0] - c.x, CORNERS[j][1] - c.z);
            c.ry += angleTo(c.ry, want) * Math.min(1, dt * 6);
          }
          if (c.stack.length) {
            c.firstT += dt;
            const full = c.stack.length >= STACK_MAX && c.stack[c.stack.length - 1].t >= 1;
            if (qi === 0 && (full || c.firstT > 2.4) && d < 0.05) {
              leaveQueue(c);
              c.state = 'deliver';
              c.path = routeNodes(pick < 0 ? 0 : pick, T_NODE);
              c.path.unshift([c.x, c.z]);
              // pick a free drop spot beside the truck
              let di = 0;
              for (; di < DROP.length; di++) if (!C.some((o) => o !== c && o.state !== 'wait' && o.state !== 'return' && o.drop === di)) break;
              c.drop = Math.min(di, DROP.length - 1);
              c.path.push(DROP[c.drop]);
              c.pi = 0;
            }
          }
        }
        if (c.state === 'deliver' || c.state === 'return') {
          // follow the path
          let left = c.speed * dt;
          while (left > 0 && c.pi < c.path.length) {
            const p = c.path[c.pi];
            const tx = c.state === 'return' && c.pi === c.path.length - 1 ? queueSpot(Math.max(0, queue.indexOf(c.k)), _v).x : p[0];
            const tz = c.state === 'return' && c.pi === c.path.length - 1 ? _v.z : p[1];
            const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
            if (d < 1e-4) { c.pi++; continue; }
            const step = Math.min(d, left);
            c.x += (dx / d) * step; c.z += (dz / d) * step;
            left -= step; moved += step;
            c.ry += angleTo(c.ry, Math.atan2(dx, dz)) * Math.min(1, dt * 9);
            if (step >= d - 1e-6) c.pi++;
          }
          if (c.pi >= c.path.length) {
            if (c.state === 'deliver') { c.state = 'drop'; c.throwT = 0.25; c.wait = 0; }
            else { c.state = 'wait'; c.path.length = 0; }
          }
        }
        if (c.state === 'drop') {
          // face the truck, throw the toys in one by one when there is room
          const tx = truck.group.position.x - c.x;
          c.ry += angleTo(c.ry, Math.atan2(tx, 0.3)) * Math.min(1, dt * 8);
          c.throwT -= dt;
          c.wait += dt;
          if (c.stack.length && c.throwT <= 0) {
            const top = c.stack[c.stack.length - 1];
            api.handPos(c, c.stack.length - 1, _v);
            if (items.hopFrom(_v, top.stage, top.tint, truck)) {
              c.stack.pop();
              c.flick = 1;
              c.throwT = 0.2;
            } else c.throwT = 0.15;
          }
          if (!c.stack.length && c.throwT <= 0.05) { goBack(c, T_NODE); c.path.unshift([c.x, c.z]); }
        }
        // stack arrival animation
        for (const it of c.stack) if (it.t < 1) it.t = Math.min(1, it.t + dt / 0.32);
        c.flick = Math.max(0, c.flick - dt * 5);
        // animate
        c.moving += ((moved > 1e-5 ? 1 : 0) - c.moving) * Math.min(1, dt * 12);
        c.walk += moved / 0.3 * PI;
        const ph = c.walk;
        c.y = hopY(c.x, c.z);
        const mv = c.moving;
        const bob = Math.abs(Math.sin(ph)) * 0.065 * mv;
        const sway = Math.sin(ph) * 0.08 * mv;
        const breathe = Math.sin(c.t * 2.3) * 0.025 * (1 - mv);
        const sqY = 1 + breathe + (Math.abs(Math.sin(ph)) - 0.5) * 0.07 * mv;
        const sqX = 2 - sqY;
        _p.set(c.x, c.y + bob, c.z);
        _e.set(0.06 * mv, c.ry, sway, 'YXZ');
        _q.setFromEuler(_e);
        _s.set(sqX * WS, sqY * WS, sqX * WS);
        _m.compose(_p, _q, _s);
        caBodies.setMatrixAt(nc, _m);
        const carrying = c.stack.length > 0;
        for (let side = 0; side < 2; side++) {
          const sgn = side ? 1 : -1;
          let ax, az;
          if (carrying) { ax = -1.45 - c.flick * 0.9; az = sgn * 0.32; }
          else if (c.flick > 0) { ax = -2.4 * c.flick; az = sgn * 0.3; }
          else { ax = Math.sin(ph + side * PI) * 0.7 * mv + Math.sin(c.t * 1.5 + side * PI) * 0.1 * (1 - mv); az = sgn * 0.14; }
          _e.set(ax, 0, az, 'XYZ');
          _q.setFromEuler(_e);
          _a.compose(_p.set(sgn * SHOULDER_X, SHOULDER_Y, 0), _q, _one);
          _a.premultiply(_m);
          arms.setMatrixAt(nl, _a);
          arms.setColorAt(nl, skin[4 + c.k]);
          // feet: alternate steps
          const fph = ph + side * PI;
          const fwd = Math.sin(fph) * 0.12 * mv;
          const lift = Math.max(0, Math.cos(fph)) * 0.07 * mv;
          _q.setFromAxisAngle(_v.set(0, 1, 0), c.ry);
          _w.set(sgn * FOOT_X * WS, 0, fwd).applyQuaternion(_q);
          _f.compose(_p.set(c.x + _w.x, c.y + lift, c.z + _w.z), _q, _s.set(WS, WS, WS));
          feet.setMatrixAt(nl, _f);
          nl++;
        }
        // carried toys in front of the chest
        for (let k = 0; k < c.stack.length; k++) {
          const it = c.stack[k];
          api.handPos(c, k, _v);
          let sc = 0.92;
          if (it.t < 1) {
            const e = ease.outCubic(it.t);
            _v.set(it.fx + (_v.x - it.fx) * e, it.fy + (_v.y - it.fy) * e + Math.sin(it.t * PI) * 0.5, it.fz + (_v.z - it.fz) * e);
            sc *= 0.8 + 0.2 * ease.outBack(it.t, 3);
          }
          _q.setFromAxisAngle(_w.set(0, 1, 0), c.ry + PI / 2 + (k % 2 ? 0.12 : -0.08));
          _f.compose(_v, _q, _s.set(sc, sc, sc));
          items.pushInstance(it.stage, _f, it.tint);
        }
        const sp = spots[4 + c.k];
        sp.x = c.x; sp.z = c.z; sp.s = 1 - Math.min(0.6, c.y);
        nc++;
      }
      caBodies.count = nc;
      arms.count = nl;
      feet.count = nl;
      for (const m of [opBodies, caBodies, arms, feet]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }
    },

    /** world position of stack slot k in front of carrier c */
    handPos(c, k, out) {
      const s = Math.sin(c.ry), co = Math.cos(c.ry);
      const fwd = 0.34;
      out.set(c.x + s * fwd, c.y + 0.24 * WS + k * 0.31 + Math.abs(Math.sin(c.walk)) * 0.065 * c.moving, c.z + co * fwd);
      return out;
    },

    dispose() { opBodies.geometry.dispose(); caBodies.geometry.dispose(); arms.geometry.dispose(); feet.geometry.dispose(); },
  };
  return api;
}
