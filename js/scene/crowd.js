// Customers and cooks: maps the logic entities (state.customers / state.cooks) to pooled hero
// instances every frame. Walkers are placed at progress t / dur along layout.path(from, to)
// (the same walk graph the logic times), seated guests sit on their chair facing the table,
// cooks work at the station's cook spot and carry the dish to the table in both hands.
import * as THREE from 'three';
import { dishInfo, emptyScale } from './dishes.js';
import { CHAR_MODEL } from './heroes.js';
import { clamp, easeOutBack } from './kit.js';

// Walking_A covers about this many units per second at timeScale 1 (measured from the feet).
export const WALK_STRIDE = 2.05;
// seated pose: the root moves this far back toward the chair (and up) while sitting down
const SIT = { back: 0.22, y: 0.0 };
const TURN_RATE = 14;
const ARM_BONES = /^(upperarm|lowerarm|wrist|hand)[lr]?$/;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function angleDamp(a, b, k, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-k * dt));
}

/** Build 'Walk_Carry' and 'Carry_Idle': legs from the walk / idle clips, arms held forward. */
export function makeCarryClips(clips) {
  const THREE_ = THREE;
  const src = clips.Interact;
  const walk = clips.Walking_A;
  const idle = clips.Idle;
  if (!src || !walk || !idle) return;
  const at = 0.42; // Interact: both hands reach forward here
  const arms = [];
  for (const tr of src.tracks) {
    const bone = tr.name.split('.')[0];
    if (!ARM_BONES.test(bone)) continue;
    const v = tr.createInterpolant().evaluate(at).slice();
    arms.push({ name: tr.name, v, type: tr.ValueTypeName });
  }
  const armNames = new Set(arms.map((a) => a.name));
  function combine(name, base) {
    const tracks = base.tracks.filter((t) => !armNames.has(t.name)).map((t) => t.clone());
    for (const a of arms) {
      const T = a.type === 'quaternion' ? THREE_.QuaternionKeyframeTrack : THREE_.VectorKeyframeTrack;
      tracks.push(new T(a.name, [0, base.duration], [...a.v, ...a.v]));
    }
    return new THREE_.AnimationClip(name, base.duration, tracks);
  }
  clips.Walk_Carry = combine('Walk_Carry', walk);
  clips.Carry_Idle = combine('Carry_Idle', idle);
}

export function createCrowd({ heroes, dishes, blobs, group }) {
  let layout = null;
  const seats = new Map(); // seat id -> { seat, table }
  const stationsById = new Map();
  const tablesById = new Map();
  const cust = new Map();
  const cooks = new Map();
  const served = new Set();
  let stamp = 0;
  const pt = [0, 0];
  const prev = [0, 0];

  function setLayout(L) {
    clear();
    layout = L;
    seats.clear(); stationsById.clear(); tablesById.clear();
    for (const t of L.tables) {
      tablesById.set(t.id, t);
      for (const s of t.seats) seats.set(s.id, { seat: s, table: t });
    }
    for (const s of L.stations) stationsById.set(s.id, s);
  }
  function clear() {
    for (const v of cust.values()) heroes.release(v.hero);
    for (const v of cooks.values()) heroes.release(v.hero);
    cust.clear();
    cooks.clear();
  }

  function nodePos(id, out) {
    const n = layout.graph.nodes[id];
    if (n) { out[0] = n[0]; out[1] = n[1]; }
    return out;
  }
  // position along the entity's current walk (or its node when it stays)
  function walkPos(e, out) {
    if (e.dur > 0 && e.from !== e.to) {
      const len = layout.pathLength(e.from, e.to);
      layout.pointAt(e.from, e.to, clamp(e.t / e.dur, 0, 1) * len, out);
      return len / e.dur;
    }
    nodePos(e.to, out);
    return 0;
  }

  // ------------------------------------------------------------------ customers
  function spawnCustomer(c) {
    const look = c.look || {};
    const hero = heroes.acquire(CHAR_MODEL[look.char] || 'knight', look.tint | 0);
    group.add(hero.root);
    const v = { id: c.id, hero, st: null, prevSt: null, vt: 0, sitT: 99, x: 0, z: 0, yaw: 0, y: 0, seated: false, stamp, dish: null, emptyT: 0, standing: true };
    walkPos(c, pt);
    v.x = pt[0]; v.z = pt[1];
    const si = seats.get(c.seat);
    v.yaw = c.state === 'enter' || c.state === 'toSeat' ? Math.PI : si ? si.seat.facing : 0;
    return v;
  }

  function updCustomer(v, c, dt) {
    const h = v.hero;
    if (c.state !== v.st) {
      v.prevSt = v.st;
      v.st = c.state;
      v.vt = 0;
      if (c.state === 'waiting' || c.state === 'eating') {
        if (v.prevSt === 'toSeat' || v.prevSt === 'enter') v.sitT = 0;
        else if (!v.seated) v.sitT = 99; // loaded mid-meal: already sitting
      }
      if (c.state === 'paying') v.emptyT = 0;
    } else v.vt += dt;
    const info = seats.get(c.seat);
    const seat = info && info.seat;
    let yawT = v.yaw;
    let walking = false;
    let opacity = 1;
    if (c.state === 'enter' || c.state === 'toSeat' || c.state === 'leaving') {
      prev[0] = v.x; prev[1] = v.z;
      const speed = walkPos(c, pt);
      walking = speed > 0 && c.t < c.dur;
      v.x = pt[0]; v.z = pt[1];
      const dx = v.x - prev[0], dz = v.z - prev[1];
      if (dx * dx + dz * dz > 1e-8) yawT = Math.atan2(dx, dz);
      v.seated = false;
      v.y = 0;
      if (c.state === 'enter') opacity = clamp(v.vt / 0.4, 0, 1);
      if (c.state === 'leaving') opacity = clamp((c.dur - c.t) / 0.45, 0, 1);
      if (walking) h.play('Walking_A', { speed: clamp(speed / WALK_STRIDE, 0.6, 2.2), fade: c.state === 'leaving' && v.vt < 0.3 ? 0.3 : 0.2 });
      else h.play('Idle', { fade: 0.25 });
    } else if (seat) {
      // seated (waiting / eating) or standing up (paying)
      const fx = Math.sin(seat.facing), fz = Math.cos(seat.facing);
      yawT = seat.facing;
      if (c.state === 'paying') {
        const k = clamp(v.vt / 0.5, 0, 1);
        v.x = seat.pos[0] - fx * SIT.back * (1 - k);
        v.z = seat.pos[1] - fz * SIT.back * (1 - k);
        v.seated = v.vt < 0.45;
        if (v.vt < 0.55) h.play('Sit_Chair_StandUp', { loop: false, speed: 1.45, fade: 0.12 });
        else h.play('Cheer', { fade: 0.2, speed: 1.1 });
      } else {
        v.sitT += dt;
        const k = clamp(v.sitT / 0.6, 0, 1);
        v.x = seat.pos[0] - fx * SIT.back * k;
        v.z = seat.pos[1] - fz * SIT.back * k;
        v.seated = true;
        if (v.sitT < 0.75) h.play('Sit_Chair_Down', { loop: false, fade: 0.15 });
        else h.play('Sit_Chair_Idle', { fade: 0.3 });
      }
    }
    v.yaw = angleDamp(v.yaw, yawT, TURN_RATE, dt);
    h.setOpacity(opacity);
    h.root.position.set(v.x, v.y, v.z);
    h.root.rotation.y = v.yaw;
    h.mixer.update(dt);
    if (opacity > 0.05) blobs.add(v.x, v.z, 1.15, 1.15);

    // dish on the table
    if (seat) {
      const d = dishInfo(c.dish);
      const [px, py, pz] = seat.plate;
      if (c.state === 'eating' && !served.has(c.id)) {
        const p = c.dur > 0 ? clamp(c.t / c.dur, 0, 1) : 0;
        const bite = 1 - 0.07 * Math.abs(Math.sin(v.vt * 6));
        dishes.add(d.model, px, py, pz, seat.facing, d.s * bite * (1 - 0.18 * p));
      } else if (c.state === 'paying') {
        dishes.add(d.empty, px, py, pz, seat.facing, emptyScale(d.empty));
      } else if (c.state === 'leaving' && v.vt < 1.4) {
        const k = clamp((1.4 - v.vt) / 0.3, 0, 1);
        dishes.add(d.empty, px, py, pz, seat.facing, emptyScale(d.empty) * k);
      }
    }
  }

  // ------------------------------------------------------------------ cooks
  function spawnCook(c) {
    const hero = heroes.acquire('barbarian', 0);
    group.add(hero.root);
    walkPos(c, pt);
    return { id: c.id, hero, st: null, vt: 0, x: pt[0], z: pt[1], yaw: 0, stamp, carry: false };
  }

  function handsPos(h, out) {
    h.root.updateMatrixWorld(true);
    if (h.handL && h.handR) {
      h.handL.getWorldPosition(out);
      h.handR.getWorldPosition(_v2);
      out.add(_v2).multiplyScalar(0.5);
    } else {
      out.set(0, 1.25, 0.55).applyMatrix4(h.root.matrixWorld);
    }
    return out;
  }

  function updCook(v, c, dt) {
    const h = v.hero;
    if (c.state !== v.st) { v.st = c.state; v.vt = 0; } else v.vt += dt;
    let yawT = v.yaw;
    prev[0] = v.x; prev[1] = v.z;
    const speed = walkPos(c, pt);
    v.x = pt[0]; v.z = pt[1];
    const walking = speed > 0 && c.t < c.dur;
    const order = c.order;
    const carrying = c.state === 'toTable' || (c.state === 'serving' && v.vt < 0.32);
    if (walking) {
      const dx = v.x - prev[0], dz = v.z - prev[1];
      if (dx * dx + dz * dz > 1e-8) yawT = Math.atan2(dx, dz);
      h.play(carrying ? 'Walk_Carry' : 'Walking_A', { speed: clamp(speed / WALK_STRIDE, 0.6, 2.4), fade: 0.18 });
    } else if (c.state === 'cooking') {
      yawT = Math.PI;
      h.play('Interact', { fade: 0.2, speed: 1.2 });
    } else if (c.state === 'serving') {
      yawT = 0;
      if (carrying) h.play('Carry_Idle', { fade: 0.12 });
      else h.play('Idle', { fade: 0.25 });
    } else {
      yawT = 0;
      h.play('Idle', { fade: 0.3 });
    }
    v.yaw = angleDamp(v.yaw, yawT, TURN_RATE, dt);
    h.root.position.set(v.x, 0, v.z);
    h.root.rotation.y = v.yaw;
    h.mixer.update(dt);
    blobs.add(v.x, v.z, 1.25, 1.25);

    if (!order) return;
    const d = dishInfo(order.dish);
    if (c.state === 'cooking') {
      // the dish appears on the counter during the last part of the cooking time
      const st = stationsById.get(c.station);
      const p = c.dur > 0 ? clamp(c.t / c.dur, 0, 1) : 1;
      const k = clamp((p - 0.55) / 0.45, 0, 1);
      if (st && k > 0) dishes.add(d.model, st.dishSpot[0], st.dishSpot[1], st.dishSpot[2], 0, d.s * clamp(easeOutBack(k, 2), 0, 1.2));
    } else if (carrying || c.state === 'serving') {
      handsPos(h, _v);
      const cust = custEntity.get(order.customer);
      const info = cust && seats.get(cust.seat);
      if (c.state === 'serving' && info) {
        // put it down on the table in front of the guest
        const k = clamp(v.vt / 0.32, 0, 1);
        const [px, py, pz] = info.seat.plate;
        const arc = Math.sin(k * Math.PI) * 0.25;
        dishes.add(d.model, _v.x + (px - _v.x) * k, _v.y + (py - _v.y) * k + arc, _v.z + (pz - _v.z) * k, info.seat.facing * k, d.s);
        served.add(order.customer);
      } else if (carrying) {
        dishes.add(d.model, _v.x, _v.y - 0.08, _v.z, v.yaw, d.s * 0.92);
      }
    }
  }

  const custEntity = new Map();
  function update(state, dt) {
    if (!layout) return;
    stamp++;
    served.clear();
    custEntity.clear();
    const cs = (state && state.customers) || [];
    for (let i = 0; i < cs.length; i++) custEntity.set(cs[i].id, cs[i]);
    // cooks first (they mark guests whose dish is still on its way to the table)
    const ks = (state && state.cooks) || [];
    for (let i = 0; i < ks.length; i++) {
      const c = ks[i];
      let v = cooks.get(c.id);
      if (!v) { v = spawnCook(c); cooks.set(c.id, v); }
      v.stamp = stamp;
      updCook(v, c, dt);
    }
    for (const [id, v] of cooks) if (v.stamp !== stamp) { heroes.release(v.hero); cooks.delete(id); }
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      let v = cust.get(c.id);
      if (!v) { v = spawnCustomer(c); cust.set(c.id, v); }
      v.stamp = stamp;
      updCustomer(v, c, dt);
    }
    for (const [id, v] of cust) if (v.stamp !== stamp) { heroes.release(v.hero); cust.delete(id); }
  }

  /** World point above a customer's / cook's head (for UI bubbles), or null. */
  function headPoint(kind, id, out) {
    const v = kind === 'cook' ? cooks.get(id) : cust.get(id);
    if (!v) return null;
    const hgt = v.seated ? 2.35 : 2.75;
    return out.set(v.x, hgt, v.z);
  }

  return { setLayout, update, clear, headPoint, customers: cust, cooks, get count() { return cust.size + cooks.size; } };
}
