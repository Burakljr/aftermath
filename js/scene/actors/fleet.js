// Fleet entities (A1): state.fleet / state.rival.fleet -> vehicle units that follow the road graph.
// A unit is 1 vehicle (fire engine, crane truck) or 2 (debris = wheeled excavator + tipper).
// Motion is a pure function of the leg: path(from -> work spot | bay) at progress 1 - eta/eta0 with ease
// at both ends; a new leg starts when `seq` or `state` changes (re-routes start from the current spot).
// Beacons are one instanced draw call (beacon shader: fire red/blue 4 Hz, others amber); every vehicle
// has a soft blob contact shadow (one instanced draw call). No allocations in update().
import * as THREE from 'three';
import { makeVehicle } from './vehicles.js';

const CAP = 128;                      // path points per leg
const GAP = 21;                       // tipper follows this far behind the excavator
const LANE = 3.0;                     // right-hand lane offset (m)
const TYPE_KIND = { fire: 'fire', debris: 'rubble', carve: 'carve' };
const ease = (p) => p * p * (3 - 2 * p);

// ------------------------------------------------------------------------------------ path
export class Path {
  constructor() { this.xz = new Float32Array(CAP * 2); this.cum = new Float32Array(CAP); this.n = 0; this.len = 0; this.seg = 0; }
  clear() { this.n = 0; this.len = 0; this.seg = 0; }
  push(x, z) {
    if (this.n >= CAP) return;
    if (this.n > 0) {
      const px = this.xz[this.n * 2 - 2], pz = this.xz[this.n * 2 - 1];
      const d = Math.hypot(x - px, z - pz);
      if (d < 0.05) return;
      this.len += d;
    }
    this.xz[this.n * 2] = x; this.xz[this.n * 2 + 1] = z; this.cum[this.n] = this.len; this.n++;
  }
  // append world.path(from, to) (skips the first point when it duplicates the last)
  route(world, from, to) {
    const tmp = Path.tmp;
    world.path(from, to, tmp);
    const n = world.pathInfo.count;
    for (let i = 0; i < n; i++) this.push(tmp[i * 2], tmp[i * 2 + 1]);
    return n;
  }
  // point at distance s: writes out {x, z, dx, dz} (dx,dz unit heading, smoothed over +-w m)
  at(s, out, w = 3) {
    if (this.n === 0) { out.x = 0; out.z = 0; out.dx = 0; out.dz = 1; return out; }
    if (this.n === 1) { out.x = this.xz[0]; out.z = this.xz[1]; out.dx = 0; out.dz = 1; return out; }
    this.pt(s, out);
    const x = out.x, z = out.z;
    this.pt(Math.min(this.len, s + w), _a); this.pt(Math.max(0, s - w), _b);
    let dx = _a.x - _b.x, dz = _a.z - _b.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-4) { const i = Math.max(0, Math.min(this.n - 2, this.seg)); dx = this.xz[i * 2 + 2] - this.xz[i * 2]; dz = this.xz[i * 2 + 3] - this.xz[i * 2 + 1]; }
    const L2 = Math.hypot(dx, dz) || 1;
    out.x = x; out.z = z; out.dx = dx / L2; out.dz = dz / L2;
    return out;
  }
  pt(s, out) {
    s = Math.max(0, Math.min(this.len, s));
    let i = Math.max(0, Math.min(this.n - 2, this.seg));
    while (i > 0 && this.cum[i] > s) i--;
    while (i < this.n - 2 && this.cum[i + 1] < s) i++;
    this.seg = i;
    const a = this.cum[i], b = this.cum[i + 1], k = b > a ? (s - a) / (b - a) : 0;
    out.x = this.xz[i * 2] + (this.xz[i * 2 + 2] - this.xz[i * 2]) * k;
    out.z = this.xz[i * 2 + 1] + (this.xz[i * 2 + 3] - this.xz[i * 2 + 1]) * k;
    return out;
  }
  last(out) { out.x = this.xz[this.n * 2 - 2]; out.z = this.xz[this.n * 2 - 1]; return out; }
}
Path.tmp = new Float32Array(CAP * 2);
const _a = { x: 0, z: 0 }, _b = { x: 0, z: 0 }, _p = { x: 0, z: 0, dx: 0, dz: 1 };

// ------------------------------------------------------------------------------------ one drivable body
class Body {
  constructor(kind, livery, mat, scene) {
    this.v = makeVehicle(kind, livery, mat);
    this.mesh = this.v.mesh; this.J = this.v.J; this.kit = this.v.kit; this.kind = kind;
    this.x = 0; this.z = 0; this.yaw = 0; this.pitch = 0; this.y = 0; this.roll = 0;
    this.visible = false; this.beaconOn = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  place(world) {
    const m = this.mesh;
    m.visible = this.visible;
    if (!this.visible) return;
    m.position.set(this.x, world.groundY(this.x, this.z) + this.y, this.z);
    m.rotation.set(this.pitch, this.yaw, this.roll, 'YXZ');
    m.updateMatrix();
  }
}

// ------------------------------------------------------------------------------------ fleet
export function createFleet(world, { work, route }) {
  const { scene, materials } = world;
  const units = new Map();                 // id -> unit
  const pool = { player: { fire: [], debris: [], carve: [] }, rival: { fire: [], debris: [], carve: [] } };
  const order = [];                        // stable iteration list (units)
  let tNow = 0;

  // ---- beacons: one instanced mesh, per-instance colour + blink
  const MAXB = 64;
  const bGeo = new THREE.BoxGeometry(0.75, 0.55, 0.75);
  const bCol = new THREE.InstancedBufferAttribute(new Float32Array(MAXB * 3), 3);
  const bBlink = new THREE.InstancedBufferAttribute(new Float32Array(MAXB), 1);
  bGeo.setAttribute('color', bCol); bGeo.setAttribute('aBlink', bBlink);
  const beacons = new THREE.InstancedMesh(bGeo, materials.beacon, MAXB);
  beacons.count = 0; beacons.frustumCulled = false; beacons.name = 'beacons';
  scene.add(beacons);
  // ---- blob shadows: one instanced quad with a soft rectangle
  const MAXS = 48;
  const sGeo = new THREE.PlaneGeometry(1, 1); sGeo.rotateX(-Math.PI / 2);
  const sMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; void main(){ vec2 p = abs(vUv - 0.5) * 2.0;
      float a = (1.0 - smoothstep(0.55, 1.0, p.x)) * (1.0 - smoothstep(0.7, 1.0, p.y));
      gl_FragColor = vec4(0.0, 0.0, 0.0, a * 0.55); }`,
  });
  const blobs = new THREE.InstancedMesh(sGeo, sMat, MAXS);
  blobs.count = 0; blobs.frustumCulled = false; blobs.renderOrder = 2; blobs.name = 'vehicleBlobs';
  scene.add(blobs);

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

  function makeUnit(id, type, rival) {
    const liv = rival ? 'rival' : 'player';
    let u = pool[liv][type].pop();
    if (!u) {
      const mat = materials.vehicle;
      const main = new Body(type === 'fire' ? 'fire' : type === 'debris' ? 'excavator' : 'crane', liv, mat, scene);
      const aux = type === 'debris' ? new Body('tipper', liv, mat, scene) : null;
      u = { type, rival, liv, main, aux, legMain: new Path(), legAux: new Path(), shuttle: new Path(), w: {} };
    }
    Object.assign(u, {
      id, state: null, seq: -1, sector: null, bay: 0, spot: null, slot: 0, leg: null, legStart: 0, tArrive: -99, tWork: -99, progress: 0,
      auxLen0: 0, auxS0: 0, seen: false, alive: true, home: null,
    });
    u.w = {};
    units.set(id, u); order.push(u);
    return u;
  }
  function freeUnit(u) {
    units.delete(u.id);
    const i = order.indexOf(u); if (i >= 0) order.splice(i, 1);
    u.main.visible = false; u.main.mesh.visible = false;
    if (u.aux) { u.aux.visible = false; u.aux.mesh.visible = false; }
    work.stop(u);
    route.clear(u.id);
    pool[u.liv][u.type].push(u);
  }

  // ---- spots and legs
  function slotFor(u, list, e) {
    let k = 0;
    for (const o of list) {
      if (o === e) break;
      if (o.type === e.type && o.sector === e.sector && (o.state === 'enroute' || o.state === 'working')) k++;
    }
    return k;
  }
  function spotFor(u, sector, slot) {
    const spots = world.workSpots(sector, TYPE_KIND[u.type]);
    if (!spots || !spots.length) { const c = world.districtCenter(sector); return { x: c.x, z: c.z, yaw: 0, aim: { x: c.x, y: 4, z: c.z } }; }
    const s = spots[slot % spots.length];
    if (slot < spots.length) return s;
    const off = 9 * Math.floor(slot / spots.length);
    return { x: s.x + Math.cos(s.yaw) * off, z: s.z - Math.sin(s.yaw) * off, yaw: s.yaw, aim: s.aim };
  }
  function homeNode(u) { return u.rival ? 'RIVAL' : 'BAY.' + Math.min(7, u.bay); }
  function bayPos(u) { const b = world.yard.bays[Math.min(7, u.bay)]; return b; }
  const GARAGE_Z = 226;

  function startLeg(u, e) {
    const P = u.legMain; P.clear();
    const fromYard = e.from === 'yard' && !u.rival && (u.state === 'yard' || u.state === null || !u.seen);
    const fromRival = e.from === 'rival';
    // start point
    if (fromYard) { const b = bayPos(u); P.push(b.x, b.z); }
    else if (fromRival && !u.seen) { /* off-map node */ }
    else if (u.seen && u.main.visible) P.push(u.main.x, u.main.z);
    else if (typeof e.from === 'number') { const sp = spotFor(u, e.from, 0); P.push(sp.x, sp.z); }
    const startNode = P.n ? { x: P.xz[P.n * 2 - 2], z: P.xz[P.n * 2 - 1] } : (fromRival ? 'RIVAL' : homeNode(u));
    if (e.state === 'enroute') {
      u.slot = slotFor(u, currentList, e);
      u.spot = spotFor(u, e.sector, u.slot);
      if (fromYard) P.route(world, homeNode(u), u.spot);
      else P.route(world, startNode, u.spot);
      u.leg = 'go';
    } else {
      // returning home
      if (u.rival) P.route(world, startNode, 'RIVAL');
      else { P.route(world, startNode, homeNode(u)); const b = bayPos(u); P.push(b.x, b.z); }
      u.leg = 'home';
    }
    // tipper: its own path to the same destination, from wherever it is now
    if (u.aux) {
      const A = u.legAux; A.clear();
      if (fromYard) { const b = bayPos(u); A.push(b.x, GARAGE_Z); A.push(b.x, b.z); A.route(world, homeNode(u), u.spot); }
      else {
        const sx = u.aux.visible ? u.aux.x : (P.n ? P.xz[0] : 0), sz = u.aux.visible ? u.aux.z : (P.n ? P.xz[1] : 0);
        if (u.aux.visible || P.n) A.push(sx, sz);
        if (e.state === 'enroute') A.route(world, A.n ? { x: sx, z: sz } : startNode, u.spot);
        else if (u.rival) A.route(world, A.n ? { x: sx, z: sz } : startNode, 'RIVAL');
        else { A.route(world, A.n ? { x: sx, z: sz } : startNode, homeNode(u)); const b = bayPos(u); A.push(b.x, b.z); A.push(b.x, GARAGE_Z); }
      }
    }
    route.set(u.id, e.state === 'enroute' && !u.rival ? P : null);
  }

  // place a body along a path at distance s; reverse = backing in (last segment into a bay)
  function follow(body, P, s, laneOn, reverseTail) {
    P.at(s, _p);
    let x = _p.x, z = _p.z;
    if (laneOn) {
      const k = Math.min(1, Math.min(s, P.len - s) / 10);
      x += -_p.dz * LANE * k; z += _p.dx * LANE * k;
    }
    let yaw = Math.atan2(_p.dx, _p.dz);
    if (reverseTail !== null && reverseTail !== undefined && P.len > 16) {
      // back into the bay: over the last 16 m turn toward the bay heading (nose out)
      const k = Math.max(0, Math.min(1, (s - (P.len - 16)) / 12));
      yaw = lerpAngle(yaw, reverseTail, k * k * (3 - 2 * k));
    }
    body.x = x; body.z = z; body.yaw = yaw;
    body.visible = true;
  }

  let currentList = [];
  const pendingIn = new Map();
  function sync(list, rival, t, dt) {
    currentList = list;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      let u = units.get(e.id);
      if (!u) u = makeUnit(e.id, e.type, rival);
      u.alive = true;
      u.bay = e.bay || 0;
      const changed = e.seq !== u.seq || e.state !== u.state;
      if (changed) {
        const prev = u.state;
        if (e.state === 'enroute' || e.state === 'returning') startLeg(u, e);
        if (e.state === 'working') {
          if (prev === 'enroute') u.tArrive = t;
          if (prev !== 'enroute' || !u.spot) { u.slot = slotFor(u, list, e); u.spot = spotFor(u, e.sector, u.slot); }
          u.tWork = t; route.set(u.id, null);
          work.start(u, e);
        } else if (prev === 'working') work.stop(u);
        if (e.state === 'yard') { route.set(u.id, null); u.leg = null; }
        u.state = e.state; u.seq = e.seq; u.sector = e.sector;
      }
      drive(u, e, t, dt);
      u.seen = true;
    }
  }

  function drive(u, e, t, dt) {
    const M = u.main, A = u.aux;
    M.pitch = 0; M.roll = 0; M.y = 0;
    if (A) { A.pitch = 0; A.roll = 0; A.y = 0; }
    if (e.state === 'yard') {
      work.idle(u);
      if (u.rival || u.bay >= 8) { M.visible = false; if (A) A.visible = false; M.beaconOn = false; return; }
      const pend = pendingIn.get(u.id);
      if (pend !== undefined) { pendingIn.delete(u.id); u.inT = pend; const P = u.legMain; P.clear(); P.route(world, 'BUYER', homeNode(u)); const b0 = bayPos(u); P.push(b0.x, b0.z); }
      if (u.inT !== undefined && t - u.inT < 5.5 && t >= u.inT) {
        const k = (t - u.inT) / 5.5, P = u.legMain;
        follow(M, P, k * k * (3 - 2 * k) * P.len, true, bayPos(u).yaw);
        M.beaconOn = true; if (A) A.visible = false;
        return;
      }
      const b = bayPos(u);
      M.x = b.x; M.z = b.z; M.yaw = b.yaw; M.visible = true; M.beaconOn = false;
      if (A) A.visible = false;
      return;
    }
    if (e.state === 'enroute' || e.state === 'returning') {
      work.idle(u);
      const p = e.eta0 > 0 ? Math.max(0, Math.min(1, 1 - e.eta / e.eta0)) : 1;
      u.progress = p;
      const P = u.legMain;
      const s = ease(p) * P.len;
      follow(M, P, s, true, u.leg === 'home' && !u.rival ? bayPos(u).yaw : null);
      M.beaconOn = true;
      // gentle braking pitch near the end of the leg
      if (p > 0.82) M.pitch = 0.05 * Math.sin((p - 0.82) / 0.18 * Math.PI);
      if (u.rival && u.leg === 'home' && p > 0.97) M.visible = false;
      if (A) {
        const L = u.legAux;
        let sa;
        if (u.leg === 'go') sa = Math.max(0, ease(Math.max(0, p - 0.04) / 0.96) * Math.max(0, L.len - GAP));
        else sa = ease(Math.max(0, p - 0.06) / 0.94) * L.len;
        follow(A, L, sa, true, null);
        A.beaconOn = true;
        if (!u.rival && u.leg === 'home' && sa > L.len - 8) A.visible = false;     // into the garage
        if (u.leg === 'go' && sa <= 0.01 && !u.rival && e.from === 'yard') A.visible = p > 0.02;
        if (u.rival && u.leg === 'home' && p > 0.97) A.visible = false;
      }
      route.progress(u.id, s);
      return;
    }
    if (e.state === 'working') {
      const sp = u.spot || spotFor(u, e.sector, 0);
      M.x = sp.x; M.z = sp.z; M.yaw = sp.yaw; M.visible = true; M.beaconOn = true;
      const ta = t - u.tArrive;
      if (ta >= 0 && ta < 0.75) M.pitch = 0.09 * Math.sin(Math.min(1, ta / 0.32) * Math.PI) * (1 - ta / 0.75) + 0.02 * Math.sin(ta * 30) * (1 - ta / 0.75);
      if (A) {
        if (!u.w.parkSet) {
          // park the tipper where its leg ended (or behind the excavator on the road)
          const L = u.legAux;
          if (L.n >= 2 && u.seen) { L.at(Math.max(0, L.len - GAP), _p); u.w.px = _p.x - _p.dz * LANE; u.w.pz = _p.z + _p.dx * LANE; u.w.pyaw = Math.atan2(_p.dx, _p.dz); }
          else { u.w.px = sp.x - Math.sin(sp.yaw + 1.2) * 16; u.w.pz = sp.z - Math.cos(sp.yaw + 1.2) * 16; u.w.pyaw = sp.yaw + Math.PI / 2; }
          u.w.parkSet = true;
        }
        A.beaconOn = true;
      }
      work.update(u, e, t, dt);
    }
  }

  function writeInstances(t) {
    let nb = 0, ns = 0;
    for (const u of order) {
      for (let bi = 0; bi < 2; bi++) {
        const B = bi === 0 ? u.main : u.aux;
        if (!B) continue;
        B.place(world);
        if (!B.visible) continue;
        const m = B.mesh;
        // blob shadow
        if (ns < MAXS) {
          const meta = B.kit.meta;
          _e.set(0, B.yaw, 0); _q.setFromEuler(_e);
          _s.set(meta.wid + 2.2, 1, meta.len + 2.4);
          _v.set(B.x, m.position.y + 0.18, B.z);
          _m.compose(_v, _q, _s); blobs.setMatrixAt(ns++, _m);
        }
        // beacons
        const list = B.kit.beacons;
        for (let k = 0; k < list.length && nb < MAXB; k++) {
          const bc = list[k];
          _w.set(bc.x, bc.y, bc.z).applyMatrix4(m.matrix);
          _m.makeRotationFromEuler(m.rotation); _m.setPosition(_w);
          beacons.setMatrixAt(nb, _m);
          const on = B.beaconOn ? 1 : 0.06;
          bCol.array[nb * 3] = bc.col[0] * on; bCol.array[nb * 3 + 1] = bc.col[1] * on; bCol.array[nb * 3 + 2] = bc.col[2] * on;
          bBlink.array[nb] = B.beaconOn ? bc.blink : 0;
          nb++;
        }
      }
    }
    beacons.count = nb; blobs.count = ns;
    beacons.instanceMatrix.needsUpdate = true; blobs.instanceMatrix.needsUpdate = true;
    bCol.needsUpdate = true; bBlink.needsUpdate = true;
  }

  return {
    units,
    update(state, t, dt) {
      tNow = t;
      for (const u of order) u.alive = false;
      if (state) {
        sync(state.fleet || [], false, t, dt);
        sync((state.rival && state.rival.fleet) || [], true, t, dt);
      }
      for (let i = order.length - 1; i >= 0; i--) if (!order[i].alive) freeUnit(order[i]);
      work.tick(t, dt);
      writeInstances(t);
    },
    // world position of a unit (roof height) for anchors / picking
    anchor(id, out) {
      const u = units.get(id);
      if (!u || !u.main.visible) return null;
      return out.set(u.main.x, u.main.mesh.position.y + u.main.kit.meta.h + 2, u.main.z);
    },
    each(fn) { for (const u of order) fn(u); },
    driveIn(id, t) { pendingIn.set(id, t); const u = units.get(id); if (u) u.inT = undefined; },
    count() { let n = 0; for (const u of order) { if (u.main.visible) n++; if (u.aux && u.aux.visible) n++; } return n; },
    dispose() {
      for (const u of [...order]) freeUnit(u);
      for (const liv of Object.values(pool)) for (const arr of Object.values(liv)) for (const u of arr) { scene.remove(u.main.mesh); if (u.aux) scene.remove(u.aux.mesh); }
      scene.remove(beacons); scene.remove(blobs); bGeo.dispose(); sGeo.dispose(); sMat.dispose();
    },
  };
}

export function lerpAngle(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
