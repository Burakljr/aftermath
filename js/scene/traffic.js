// Street life (W5): civilian cars and buses on the main roads (hidden around damaged districts and the
// corpse), head/tail lights, pedestrians (promenade, Saat Kulesi square, Kültürpark paths), gulls over the
// bay, and the cars-out wave when a district is cleaned. Positions are pure functions of time
// (deterministic for setTime); per-frame work is matrix composes into preallocated objects only.
import * as THREE from 'three';
import { Builder, rng, capsDist } from './util.js';
import { carGeo, CAR_COLS } from './city.js';
import { DISTRICTS, XR, ZR, entries, ROAD } from './layout.js';

function busGeo() {
  const B = new Builder(202);
  B.box(2.5, 2.6, 12, 0, 1.75, 0, 0xffffff, { jitter: 0.02 });
  B.box(2.52, 0.9, 11.6, 0, 2.15, 0, 0x151a1f, { jitter: 0 });
  for (const z of [4.2, -3.8]) for (const x of [-1.15, 1.15]) B.cyl(0.5, 0.5, 0.4, x, 0.5, z, 0x141414, { rz: Math.PI / 2, seg: 8 });
  return B.build();
}
function gullGeo() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, -1.6, 0.35, -0.2, 0, 0, -0.4, 0, 0, 0.3, 0, 0, -0.4, 1.6, 0.35, -0.2], 3));
  g.computeVertexNormals();
  return g;
}

export function createTraffic(scene, { city, vehicleMat }) {
  const r = rng(3);
  const lanes = [];
  for (const x of [XR.W, XR.A, XR.E]) lanes.push({ axis: 'z', c: x, a: ZR.P, b: ZR.R + 60, off: x === XR.A ? 2.6 : 1.9 });
  for (const z of [ZR.P, ZR.S1, ZR.S2, ZR.R]) lanes.push({ axis: 'x', c: z, a: -300, b: 300, off: 1.9 });
  const COUNT = 40, EXTRA = 12;
  const cars = [];
  for (let k = 0; k < COUNT; k++) {
    const lane = k < 8 ? lanes[3] : lanes[Math.floor(r() * lanes.length)];
    cars.push({ lane, dir: r() < 0.5 ? 1 : -1, off: r(), speed: 9 + r() * 5, bus: k % 9 === 4, col: CAR_COLS[Math.floor(r() * CAR_COLS.length)], low: k % 2 === 1 });
  }
  const nBus = cars.filter((c) => c.bus).length;
  const carM = new THREE.InstancedMesh(carGeo(), vehicleMat, COUNT - nBus + EXTRA);
  const busM = new THREE.InstancedMesh(busGeo(), vehicleMat, Math.max(1, nBus));
  let bc = 0, cc = 0;
  cars.forEach((c) => { c.slot = c.bus ? bc++ : cc++; });
  const extraBase = cc;
  const lq = new THREE.PlaneGeometry(0.42, 0.2);
  const NL = (COUNT + EXTRA) * 2;
  const headM = new THREE.InstancedMesh(lq, new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.4, 2.4) }), NL);
  const tailM = new THREE.InstancedMesh(lq, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.5, 0.2, 0.1) }), NL);
  for (const m of [carM, busM, headM, tailM]) { m.frustumCulled = false; scene.add(m); }
  carM.castShadow = busM.castShadow = true;
  carM.name = 'traffic'; busM.name = 'buses'; headM.name = 'headlights'; tailM.name = 'taillights';
  const c = new THREE.Color();
  cars.forEach((cr) => { if (cr.bus) busM.setColorAt(cr.slot, c.set(cr.slot % 2 ? 0x2f6aa0 : 0xe0ded8)); else carM.setColorAt(cr.slot, c.set(cr.col)); });
  for (let k = 0; k < EXTRA; k++) carM.setColorAt(extraBase + k, c.set(CAR_COLS[k % CAR_COLS.length]));

  // cars-out wave: { x, z, dx, dz, t0 }
  const wave = Array.from({ length: EXTRA }, () => ({ on: false, x: 0, z: 0, dx: 0, dz: 0, t0: 0 }));
  let waveHead = 0;

  // gulls
  const GN = 26;
  const gullM = new THREE.InstancedMesh(gullGeo(), new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.8, side: THREE.DoubleSide }), GN);
  gullM.frustumCulled = false; gullM.name = 'gulls';
  const gulls = Array.from({ length: GN }, () => ({ cx: -200 + r() * 400, cz: -230 - r() * 120, rad: 20 + r() * 50, y: 25 + r() * 30, sp: 0.2 + r() * 0.25, ph: r() * 6.28, dir: r() < 0.5 ? 1 : -1 }));
  scene.add(gullM);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s1 = new THREE.Vector3(1.2, 1.2, 1.2), s0 = new THREE.Vector3(0, 0, 0), e = new THREE.Euler();
  const lp = new THREE.Vector3(), lq2 = new THREE.Quaternion(), flipQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const damaged = new Uint8Array(6);
  let caps = null, phase = 'calm', lowQ = false;
  const blockedAt = (x, z) => {
    if (caps && capsDist(x, z, caps) < 55) return true;
    for (let d = 0; d < 6; d++) {
      if (!damaged[d]) continue;
      const D = DISTRICTS[d];
      if (x > D.x0 - 14 && x < D.x1 + 14 && z > D.z0 - 14 && z < D.z1 + 14) return true;
    }
    return false;
  };
  function writeCar(mesh, slot, li, x, z, yaw, hidden, bus) {
    p.set(x, 0, z); q.setFromEuler(e.set(0, yaw, 0));
    m4.compose(p, q, hidden ? s0 : s1); mesh.setMatrixAt(slot, m4);
    const half = (bus ? 6.02 : 2.17) * 1.2, w = (bus ? 0.9 : 0.62) * 1.2, hy = (bus ? 1.0 : 0.72) * 1.2;
    for (let k = 0; k < 2; k++) {
      const sx = k ? w : -w;
      lp.set(sx, hy, half).applyQuaternion(q).add(p);
      m4.compose(lp, q, hidden ? s0 : s1); headM.setMatrixAt(li * 2 + k, m4);
      lp.set(sx, hy, -half).applyQuaternion(q).add(p);
      lq2.copy(q).multiply(flipQ);
      m4.compose(lp, lq2, hidden ? s0 : s1); tailM.setMatrixAt(li * 2 + k, m4);
    }
  }
  const peds = city.peds, pedMesh = city.pedMesh;
  const api = {
    setPhase(ph) { phase = ph; },
    setDamaged(i, on) { damaged[i] = on ? 1 : 0; },
    setCorpse(c) { caps = c; },
    setQuality(qq) { lowQ = qq === 'low'; },
    carsOut(did, now) {
      const D = DISTRICTS[did];
      const ents = entries(did);
      const n = 3;
      for (let k = 0; k < n; k++) {
        const id = ents[k % ents.length];
        const node = ROAD.nodes.get(id);
        const w = wave[waveHead]; waveHead = (waveHead + 1) % EXTRA;
        const vertical = id.startsWith('V.');
        w.on = true; w.x = node.x; w.z = node.z; w.t0 = now + k * 0.35;
        if (vertical) { w.dx = 0; w.dz = k % 2 ? 1 : -1; } else { w.dz = 0; w.dx = node.x < D.cx ? -1 : 1; if (k % 2) w.dx = -w.dx; }
      }
    },
    update(t) {
      const night = true;
      for (let i = 0; i < cars.length; i++) {
        const cr = cars[i];
        const len = cr.lane.b - cr.lane.a;
        let u = (cr.off + (t * cr.speed) / len) % 1;
        if (cr.dir < 0) u = 1 - u;
        const along = cr.lane.a + u * len;
        const laneOff = cr.dir * cr.lane.off;
        let x, z, yaw;
        if (cr.lane.axis === 'z') { x = cr.lane.c - laneOff; z = along; yaw = cr.dir > 0 ? 0 : Math.PI; }
        else { z = cr.lane.c + laneOff; x = along; yaw = cr.dir > 0 ? Math.PI / 2 : -Math.PI / 2; }
        const hidden = phase === 'attack' || (lowQ && cr.low) || blockedAt(x, z) || (z > 170 && Math.abs(x) < 12);
        writeCar(cr.bus ? busM : carM, cr.slot, i, x, z, yaw, hidden, cr.bus);
      }
      for (let k = 0; k < EXTRA; k++) {
        const w = wave[k];
        const tt = t - w.t0;
        const on = w.on && tt >= 0 && tt < 7;
        if (w.on && tt >= 7) w.on = false;
        const x = w.x + w.dx * 11 * Math.max(0, tt), z = w.z + w.dz * 11 * Math.max(0, tt);
        writeCar(carM, extraBase + k, COUNT + k, x + (w.dz !== 0 ? -1.9 * w.dz : 0), z + (w.dx !== 0 ? 1.9 * w.dx : 0), w.dz !== 0 ? (w.dz > 0 ? 0 : Math.PI) : (w.dx > 0 ? Math.PI / 2 : -Math.PI / 2), !on, false);
      }
      for (const m of [carM, busM, headM, tailM]) m.instanceMatrix.needsUpdate = true;
      headM.visible = tailM.visible = night;
      // gulls
      for (let i = 0; i < GN; i++) {
        const g = gulls[i];
        const a = g.ph + t * g.sp * g.dir;
        p.set(g.cx + Math.cos(a) * g.rad, g.y + Math.sin(t * 0.7 + g.ph) * 2, g.cz + Math.sin(a) * g.rad * 0.6);
        q.setFromEuler(e.set(0, a + (g.dir > 0 ? Math.PI : 0), Math.sin(t * 9 + g.ph) * 0.15));
        const flap = 0.4 + 0.6 * Math.abs(Math.sin(t * 6 + g.ph * 3));
        lp.set(1.6, flap * 1.6, 1.6);
        m4.compose(p, q, lp); gullM.setMatrixAt(i, m4);
      }
      gullM.instanceMatrix.needsUpdate = true;
      // pedestrians
      for (let i = 0; i < peds.length; i++) {
        const pd = peds[i];
        let hidden = phase === 'attack' && !pd.did;
        if (pd.did !== undefined && damaged[pd.did]) hidden = true;
        if (lowQ && i % 2) hidden = true;
        const x = pd.x + (pd.sp ? (((t * pd.sp * pd.dir + pd.ph * 10) % pd.span) + pd.span) % pd.span - pd.span / 2 : 0);
        q.setFromEuler(e.set(0, pd.sp ? (pd.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : pd.ry, 0));
        p.set(x, 0.2 + (pd.sp ? Math.abs(Math.sin(t * 8 + pd.ph)) * 0.12 : 0), pd.z);
        m4.compose(p, q, hidden ? s0 : lp.setScalar(1.9));
        pedMesh.setMatrixAt(i, m4);
      }
      pedMesh.instanceMatrix.needsUpdate = true;
    },
    count: () => cars.length + peds.length + GN,
  };
  return api;
}
