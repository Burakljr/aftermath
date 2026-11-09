// Work loops (A2): what a vehicle does on its work spot. Pure functions of the time since it started
// working, so a deterministic __setTime frame shows a valid pose.
//   fire   : turntable swings to the nearest flame, ladder raises, water arc (world.fx.water) with
//            steam puffs where it lands; off once the district's fire is out
//   debris : wheeled excavator dig -> swing -> dump loop with a dust puff per scoop; the tipper parks
//            behind it and shuttles to the map edge (DUMP.W / DUMP.E) and back, bed raised off-map
//   carve  : outriggers out, crane swings to the corpse's cut front, hook down, saw sparks, the piece is
//            lifted onto the bed and becomes a crate (4 slots); tarp screens beside the cut (no blood)
import * as THREE from 'three';
import { Path, lerpAngle } from './fleet.js';
import { smooth } from '../util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _p = { x: 0, z: 0, dx: 0, dz: 1 };
const DUMP_SPEED = 18;

export function createWork(world) {
  let corpse = null;
  const tarps = createTarps(world);
  const active = new Set();

  // model-space point -> world, for a body at (x, y, z, yaw)
  function toWorld(B, mx, my, mz, out) {
    const c = Math.cos(B.yaw), s = Math.sin(B.yaw);
    const y0 = world.groundY(B.x, B.z) + B.y;
    return out.set(B.x + mx * c + mz * s, y0 + my, B.z - mx * s + mz * c);
  }
  function rel(B, x, z) { return Math.atan2(x - B.x, z - B.z) - B.yaw; }

  function rest(u) {
    const J = u.main.J;
    for (const k in J) { const b = J[k]; if (b.userData.rest) b.position.copy(b.userData.rest); b.rotation.set(0, 0, 0); b.scale.set(1, 1, 1); }
    if (u.type === 'debris') { J.scoop.scale.setScalar(0.001); const A = u.aux.J; for (const k in A) { A[k].rotation.set(0, 0, 0); A[k].scale.set(1, 1, 1); } A.load.scale.setScalar(0.001); }
    if (u.type === 'carve') { J.load.scale.setScalar(0.001); for (let k = 0; k < 4; k++) J['crate' + k].scale.setScalar(0.001); }
  }

  // ---------------------------------------------------------------- fire
  function fire(u, e, t) {
    const M = u.main, J = M.J, W = u.w;
    const tw = t - u.tWork;
    const sec = stateRef && stateRef.sectors ? stateRef.sectors[e.sector] : null;
    const burning = sec ? sec.fire > 0.01 : true;
    if (!W.target || t - (W.tPick || -99) > 3) {
      const list = world.fireTargets(e.sector);
      let best = null, bd = 1e9;
      for (const f of list) { const d = Math.hypot(f.x - M.x, f.z - M.z); if (d < bd) { bd = d; best = f; } }
      W.target = best || { x: M.x + Math.sin(M.yaw) * 30, y: 8, z: M.z + Math.cos(M.yaw) * 30 };
      W.tPick = t;
    }
    const T = W.target;
    const raise = smooth(0, 1.2, tw) * (burning ? 1 : Math.max(0, 1 - (t - (W.tOut ?? t)) / 1.2));
    if (!burning && W.tOut === undefined) W.tOut = t;
    // turntable: the ladder rests pointing forward (+z); aim it at the flame
    const yawT = rel(M, T.x, T.z);
    J.turn.rotation.y = lerpAngle(0, yawT, raise);
    const dist = Math.hypot(T.x - M.x, T.z - M.z);
    const pitch = Math.min(0.75, Math.max(0.28, Math.atan2(Math.max(4, T.y + 10 - 8), dist) + 0.18));
    J.ladder.rotation.x = -pitch * raise;
    // nozzle world position (ladder tip)
    const ca = Math.cos(-pitch * raise), sa = Math.sin(-pitch * raise);
    const ly = 0.6 * ca - 15.2 * sa, lz = 0.6 * sa + 15.2 * ca;           // rotate (0,0.6,15.2) about x
    const ry = J.turn.rotation.y, cy = Math.cos(ry), sy = Math.sin(ry);
    const mx = lz * sy, mz = -6 + lz * cy, my = 8.0 + ly;
    toWorld(M, mx, my, mz, _v);
    if (!W.jet) W.jet = world.fx.water();
    const on = burning && tw > 0.9;
    _w.set(T.x, T.y, T.z);
    W.jet.set(_v, _w, on);
    if (on && t - (W.tSteam || -9) > 0.55) { W.tSteam = t; world.fx.steam(T.x + (Math.random() - 0.5) * 4, T.y, T.z + (Math.random() - 0.5) * 4, 2, { size: 6, life: 1.4, spread: 3 }); }
  }

  // ---------------------------------------------------------------- debris: excavator + tipper
  function debris(u, e, t) {
    const M = u.main, J = M.J, A = u.aux, W = u.w;
    const tw = t - u.tWork;
    const sec = stateRef && stateRef.sectors ? stateRef.sectors[e.sector] : null;
    const busy = sec ? sec.rubble > 0.01 && !sec.paused : true;
    // tipper shuttle path (park -> nearest dump exit)
    if (!W.shuttleSet && W.parkSet) {
      const S = u.shuttle; S.clear();
      S.push(W.px, W.pz);
      S.route(world, { x: W.px, z: W.pz }, W.px < 0 ? 'DUMP.W' : 'DUMP.E');
      W.shuttleSet = true;
      W.period = 4.0 + 2 * S.len / DUMP_SPEED + 2.4;
    }
    // excavator cycle (4.2 s): reach+dig, curl, raise+swing to the tipper, dump, swing back
    const P = 4.2, k = busy ? ((tw % P) + P) % P : 0;
    const swingTo = W.parkSet ? Math.max(-1.7, Math.min(1.7, lerpAngle(0, rel(M, W.px, W.pz), 1))) : 1.2;
    let yawH = 0, boom = 0, stick = 0, bucket = 0, held = false;
    if (k < 1.2) { const a = smooth(0, 1.2, k); boom = 0.05 + 0.28 * a; stick = 0.15 + 0.35 * a; bucket = -0.3 * a; }
    else if (k < 1.8) { const a = smooth(1.2, 1.8, k); boom = 0.33 - 0.1 * a; stick = 0.5 - 0.2 * a; bucket = -0.3 + 1.4 * a; held = a > 0.4; }
    else if (k < 2.6) { const a = smooth(1.8, 2.6, k); boom = 0.23 - 0.55 * a; stick = 0.3 - 0.25 * a; bucket = 1.1; yawH = swingTo * a; held = true; }
    else if (k < 3.2) { const a = smooth(2.6, 3.2, k); boom = -0.32; stick = 0.05 - 0.3 * a; bucket = 1.1 - 1.7 * a; yawH = swingTo; held = a < 0.5; }
    else { const a = smooth(3.2, 4.2, k); boom = -0.32 + 0.37 * a; stick = -0.25 + 0.4 * a; bucket = -0.6 + 0.6 * a; yawH = swingTo * (1 - a); }
    const ramp = smooth(0, 0.8, tw);
    J.house.rotation.y = yawH * ramp; J.boom.rotation.x = boom * ramp; J.stick.rotation.x = stick * ramp; J.bucket.rotation.x = bucket * ramp;
    J.scoop.scale.setScalar(held && busy ? 1 : 0.001);
    const cyc = Math.floor(tw / P);
    if (busy && k > 1.3 && W.dustCyc !== cyc) {
      W.dustCyc = cyc;
      toWorld(M, 0.9 + Math.sin(yawH) * 12, 1, Math.cos(yawH) * 13, _v);
      world.fx.dust(_v.x, 1.5, _v.z, 3, { size: 7, spread: 4, rise: 2.5, life: 2.2 });
    }
    if (busy && k > 2.7 && W.dumpCyc !== cyc) {
      W.dumpCyc = cyc;
      toWorld(M, 0.9 + Math.sin(yawH) * 11, 4, Math.cos(yawH) * 11, _v);
      world.fx.dust(_v.x, 3, _v.z, 2, { size: 6, spread: 3, rise: 1, life: 1.8 });
    }
    // tipper: load at the park spot, drive out to the map edge, tip, come back
    if (!A || !W.parkSet) return;
    const S = u.shuttle, T = W.period || 12, kt = busy || W.away ? ((tw - 0.5) % T + T) % T : 0;
    const drive = S.len / DUMP_SPEED;
    A.J.bed.rotation.x = 0; A.J.load.scale.setScalar(0.001);
    if (tw < 0.5 || kt < 4.0 || S.n < 2) {
      A.x = W.px; A.z = W.pz; A.yaw = W.pyaw; A.visible = true;
      A.J.load.scale.setScalar(kt > 1.5 && tw >= 0.5 ? smooth(1.5, 3.5, kt) + 0.001 : 0.001);
      W.away = false;
    } else if (kt < 4.0 + drive) {
      const s = smooth(0, 1, (kt - 4.0) / drive) * S.len;
      S.at(s, _p); A.x = _p.x - _p.dz * 3; A.z = _p.z + _p.dx * 3; A.yaw = Math.atan2(_p.dx, _p.dz); A.visible = true;
      A.J.load.scale.setScalar(1); W.away = true;
    } else if (kt < 4.0 + drive + 2.4) {
      S.last(_p); A.x = _p.x; A.z = _p.z; A.visible = true; W.away = true;
      const a = (kt - 4.0 - drive) / 2.4;
      A.J.bed.rotation.x = -0.75 * Math.sin(a * Math.PI);
      A.J.load.scale.setScalar(a < 0.5 ? 1 : 0.001);
    } else {
      const s = (1 - smooth(0, 1, (kt - 6.4 - drive) / drive)) * S.len;
      S.at(s, _p); A.x = _p.x + _p.dz * 3; A.z = _p.z - _p.dx * 3; A.yaw = Math.atan2(-_p.dx, -_p.dz); A.visible = true; W.away = true;
      if (s < 2) A.yaw = W.pyaw;
    }
  }

  // ---------------------------------------------------------------- carve: crane truck
  function carve(u, e, t) {
    const M = u.main, J = M.J, W = u.w;
    const tw = t - u.tWork;
    const sec = stateRef && stateRef.sectors ? stateRef.sectors[e.sector] : null;
    const busy = sec ? sec.corpse > 0.01 && !sec.paused : true;
    const out = smooth(0, 0.7, tw);
    J.outL.position.x = J.outL.userData.rest.x - 2.0 * out; J.outR.position.x = J.outR.userData.rest.x + 2.0 * out;
    M.y = 0.35 * out;                                                      // lifted on the outriggers
    // lift point on the corpse near the truck (refreshed per cycle)
    const P = 5.6, cyc = Math.floor(Math.max(0, tw - 0.7) / P), k = busy ? (Math.max(0, tw - 0.7) % P) : 0;
    if (W.cyc !== cyc || !W.lift) {
      W.cyc = cyc;
      const lp = corpse ? corpse.liftPoint(e.sector, M.x, M.z, cyc) : null;
      W.lift = lp || { x: M.x + Math.sin(M.yaw) * 20, y: 6, z: M.z + Math.cos(M.yaw) * 20 };
      if (busy && cyc > 0) W.crates = Math.min(4, (W.crates || 0) + 1);
      tarps.place(u.id, W.lift, M);
    }
    const L = W.lift;
    // turret pivot in world
    const turret = toWorld(M, 0, 5.0 + M.y, 4.0, _w);
    const dx = L.x - turret.x, dz = L.z - turret.z, d = Math.hypot(dx, dz);
    const yawLift = Math.atan2(dx, dz) - M.yaw - Math.PI;
    const BL = 21;
    const pLift = Math.acos(Math.max(0.2, Math.min(0.97, d / BL)));
    // bed slot target (turret yaw 0 = boom over the bed)
    const slot = Math.min(3, W.crates || 0);
    const pBed = Math.acos(Math.min(0.95, (5.0 + slot * 2.6) / BL));
    let yaw = 0, pitch = 0.12, rope = 2, load = false;
    const hookAt = (y) => Math.max(1.2, turret.y + BL * Math.sin(pitch) - y - 3.6);
    if (!busy) { yaw = 0; pitch = 0.12 + 0.2 * out; rope = 2; }
    else if (k < 1.2) { const a = smooth(0, 1.2, k); yaw = lerpAngle(0, yawLift, a); pitch = 0.32 + (pLift - 0.32) * a; rope = 2 + (hookAt(L.y) - 2) * smooth(0.4, 1, a); }
    else if (k < 1.9) { yaw = yawLift; pitch = pLift; rope = hookAt(L.y); if (t - (W.tSpark || -9) > 0.09) { W.tSpark = t; world.fx.sparks(L.x, L.y + 1, L.z, 3, { speed: 10, size: 0.5 }); } }
    else if (k < 2.6) { const a = smooth(1.9, 2.6, k); yaw = yawLift; pitch = pLift; rope = hookAt(L.y) * (1 - a) + 3 * a; load = true; }
    else if (k < 3.9) { const a = smooth(2.6, 3.9, k); yaw = lerpAngle(yawLift, 0, a); pitch = pLift + (pBed - pLift) * a; rope = 3; load = true; }
    else if (k < 4.5) { const a = smooth(3.9, 4.5, k); yaw = 0; pitch = pBed; rope = 3 + (hookAt(4.2) - 3) * a; load = true; }
    else { const a = smooth(4.5, 5.6, k); yaw = 0; pitch = pBed + (0.32 - pBed) * a; rope = hookAt(4.2) * (1 - a) + 2 * a; }
    J.turret.rotation.y = yaw * out;
    J.boom.rotation.x = pitch * out;
    J.tip.rotation.x = -pitch * out;
    J.rope.scale.y = Math.max(0.5, rope);
    J.hook.position.y = J.hook.userData.rest.y + 1.0 - Math.max(0.5, rope);
    J.load.scale.setScalar(load ? 1 : 0.001);
    const nc = Math.min(4, W.crates || 0);
    for (let c = 0; c < 4; c++) J['crate' + c].scale.setScalar(c < nc ? 1 : 0.001);
    if (load && k > 1.9 && W.pullCyc !== cyc) { W.pullCyc = cyc; if (corpse) corpse.pulled(e.sector, L); world.fx.dust(L.x, L.y, L.z, 2, { size: 5, spread: 3, rise: 2, life: 1.6 }); }
  }

  let stateRef = null;
  return {
    setCorpse(c) { corpse = c; },
    setState(s) { stateRef = s; },
    start(u, e) {
      if (u.pk) u.pk.on = false;
      u.w = {}; rest(u); active.add(u);
    },
    stop(u) {
      if (u.pk) u.pk.on = false;
      if (u.w && u.w.jet) { u.w.jet.set(_v.set(0, -50, 0), _w.set(0, -50, 0), false); u.w.jet.dispose(); u.w.jet = null; }
      tarps.remove(u.id);
      active.delete(u);
      if (u.main && u.main.J) rest(u);
      if (u.w) u.w = {};
    },
    idle(u) { if (active.has(u)) this.stop(u); },
    // polish A4: a vehicle leaving its work spot packs up on the spot (boom / ladder / arm fold back, outriggers in)
    // during the first part of its return leg instead of snapping to rest; the crane keeps its loaded crates on the
    // bed all the way home. pack() captures the joints, packStep(u, k) eases them to rest (k 0..1, pure function).
    pack(u) {
      if (u.w && u.w.jet) { u.w.jet.set(_v.set(0, -50, 0), _w.set(0, -50, 0), false); u.w.jet.dispose(); u.w.jet = null; }
      tarps.remove(u.id);
      active.delete(u);
      const J = u.main.J;
      if (!u.pk) u.pk = { bones: [], rot: [], pos: [], scl: [], crates: 0, y: 0, on: false };
      const P = u.pk;
      let i = 0;
      for (const k in J) {
        const b = J[k];
        P.bones[i] = b;
        P.rot[i] = P.rot[i] || new THREE.Vector3(); P.rot[i].set(b.rotation.x, b.rotation.y, b.rotation.z);
        P.pos[i] = P.pos[i] || new THREE.Vector3(); P.pos[i].copy(b.position);
        P.scl[i] = P.scl[i] || new THREE.Vector3(); P.scl[i].copy(b.scale);
        i++;
      }
      P.n = i; P.y = u.main.y; P.crates = u.type === 'carve' ? Math.min(4, (u.w && u.w.crates) || 0) : 0; P.on = true;
      if (u.w) u.w = {};
    },
    packStep(u, k) {
      const P = u.pk;
      if (!P || !P.on) return 0;
      const e = smooth(0, 1, k);
      for (let i = 0; i < P.n; i++) {
        const b = P.bones[i], r = b.userData.rest;
        const name = b.name;
        b.rotation.set(P.rot[i].x * (1 - e), P.rot[i].y * (1 - e), P.rot[i].z * (1 - e));
        if (r) b.position.lerpVectors(P.pos[i], r, e);
        const crate = name.startsWith('crate'), hidden = name === 'load' || name === 'scoop' || crate;
        if (crate) { const c = +name.slice(5); b.scale.setScalar(c < P.crates ? 1 : 0.001); }
        else if (hidden) b.scale.setScalar(0.001);
        else b.scale.lerpVectors(P.scl[i], _one, e);
      }
      u.main.y = P.y * (1 - e);
      return P.crates;
    },
    unpack(u) { if (u.pk && u.pk.on) { u.pk.on = false; rest(u); } },
    update(u, e, t) {
      if (u.type === 'fire') fire(u, e, t);
      else if (u.type === 'debris') debris(u, e, t);
      else carve(u, e, t);
    },
    tick() {},
    dispose() { tarps.dispose(); },
  };
}

// tarp screens: 2 panels per working crane, beside the lift point, one instanced mesh
function createTarps(world) {
  const MAX = 16;
  const g = new THREE.PlaneGeometry(11, 7, 4, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 0.9) * 0.5);   // folds
  g.translate(0, 3.5, 0);
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const k = 0.85 + 0.15 * Math.sin(pos.getX(i) * 2.0); col[i * 3] = 0.08 * k; col[i * 3 + 1] = 0.36 * k; col[i * 3 + 2] = 0.42 * k; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // poles
  const parts = [g];
  for (const x of [-5.5, 5.5]) { const p = new THREE.CylinderGeometry(0.2, 0.2, 8, 5); p.translate(x, 4, 0); const c = new Float32Array(p.attributes.position.count * 3).fill(0.75); p.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(p.toNonIndexed()); }
  const merged = mergeColoured(parts);
  const mesh = new THREE.InstancedMesh(merged, world.materials.tarp, MAX);
  mesh.count = 0; mesh.frustumCulled = false; mesh.name = 'tarps'; mesh.receiveShadow = true;
  world.scene.add(mesh);
  const slots = new Map();
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
  function rewrite() {
    let n = 0;
    for (const v of slots.values()) for (const m of v) { if (n < MAX) mesh.setMatrixAt(n++, m); }
    mesh.count = n; mesh.instanceMatrix.needsUpdate = true;
  }
  return {
    place(id, L, M) {
      // two panels on the ground between the truck and the lift point, flanking the line of the boom
      const dx = L.x - M.x, dz = L.z - M.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
      const arr = slots.get(id) || [new THREE.Matrix4(), new THREE.Matrix4()];
      for (let k = 0; k < 2; k++) {
        const side = k ? 1 : -1;
        const cx = M.x + ux * Math.min(d * 0.55, 14) - uz * side * 9, cz = M.z + uz * Math.min(d * 0.55, 14) + ux * side * 9;
        _e.set(0, Math.atan2(ux, uz) + side * 0.5, 0); _q.setFromEuler(_e);
        _p.set(cx, world.groundY(cx, cz), cz);
        arr[k].compose(_p, _q, _s);
      }
      slots.set(id, arr); rewrite();
    },
    remove(id) { if (slots.delete(id)) rewrite(); },
    dispose() { world.scene.remove(mesh); merged.dispose(); },
  };
}
function mergeColoured(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}
