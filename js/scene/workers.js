// One cute chibi worker per open station. Bodies are one instanced mesh,
// arms another (2 draw calls for all workers). Animation is synced to the
// station: idle sway, working arm swings on the machine beat, cheer jump on
// upgrades, pop-in when a station opens.
import * as THREE from 'three';
import { G, Builder, toyMaterial, shade, ease, clamp } from './kit.js';

const PI = Math.PI;
const SKIN = [0xffd2b0, 0xf2b98f, 0xc98d64, 0xffe0c7, 0x9c6a48];
const SHOULDER_Y = 0.55, SHOULDER_X = 0.235;

function buildBody(th) {
  const w = th.worker;
  const b = new Builder();
  // boots and legs
  for (const sx of [-1, 1]) {
    b.add(G.box(0.15, 0.1, 0.21, 0.045), w.boots, sx * 0.095, 0.05, 0.02);
    b.add(G.cyl(0.07, 0.075, 0.16, 10), w.suit, sx * 0.095, 0.16, 0);
  }
  // overalls body (bean) + shirt
  b.add(G.box(0.44, 0.34, 0.34, 0.15), w.suit, 0, 0.37, 0);
  b.add(G.box(0.42, 0.18, 0.32, 0.09), w.shirt, 0, 0.55, 0);
  // bib, straps, buttons, pocket
  b.add(G.box(0.26, 0.17, 0.05, 0.03), w.suit, 0, 0.49, 0.155);
  for (const sx of [-1, 1]) {
    b.add(G.box(0.055, 0.17, 0.04, 0.02), w.suit, sx * 0.1, 0.59, 0.155);
    b.add(G.sphere(8, 6), 0xffd23c, sx * 0.1, 0.545, 0.18, { s: 0.028 });
  }
  b.add(G.box(0.12, 0.06, 0.03, 0.015), shade(w.suit, 0.2), 0, 0.46, 0.18);
  // head (tinted: skin tone per worker)
  b.add(G.sphere(14, 11), 0xffffff, 0, 0.86, 0, { s: 0.275, tint: 1 });
  b.add(G.sphere(8, 6), 0xffffff, 0, 0.82, 0.255, { s: 0.04, tint: 1 }); // nose
  // hair below the hat
  b.add(G.sphere(8, 6), w.hair, 0, 0.9, -0.04, { sx: 0.285, sy: 0.24, sz: 0.27 });
  for (const sx of [-1, 1]) b.add(G.sphere(8, 6), w.hair, sx * 0.2, 0.86, 0.13, { sx: 0.07, sy: 0.09, sz: 0.06 });
  // face
  for (const sx of [-1, 1]) {
    b.add(G.sphere(8, 6), 0x2a2238, sx * 0.095, 0.875, 0.235, { sx: 0.036, sy: 0.052, sz: 0.03 });
    b.add(G.sphere(6, 4), 0xffffff, sx * 0.095 + 0.012, 0.893, 0.258, { s: 0.012 });
    b.add(G.sphere(8, 6), 0xff8fa3, sx * 0.165, 0.8, 0.205, { sx: 0.05, sy: 0.03, sz: 0.02 });
  }
  b.add(G.torus(0.045, 0.012, 5, 10, PI), 0x2a2238, 0, 0.785, 0.255, { rz: PI });
  // hat
  if (th.key === 'teddy') {
    b.add(G.hemi(16, 8), w.hat, 0, 0.95, -0.01, { sx: 0.29, sy: 0.24, sz: 0.29 });
    b.add(G.box(0.3, 0.03, 0.2, 0.015), w.hat, 0, 0.965, 0.25, { rx: -0.12 });
    b.add(G.sphere(8, 6), w.hatBand, 0, 1.19, -0.01, { s: 0.07 });
    b.add(G.torus(0.27, 0.025, 5, 22), w.hatBand, 0, 0.965, -0.01, { rx: PI / 2 });
  } else {
    b.add(G.hemi(16, 8), w.hat, 0, 0.96, -0.01, { sx: 0.3, sy: 0.27, sz: 0.3 });
    b.add(G.cyl(0.33, 0.34, 0.04, 20), w.hat, 0, 0.965, 0.02, { sz: 1.08 });
    b.add(G.torus(0.2, 0.035, 5, 16, PI), w.hatBand, 0, 0.98, -0.01, { ry: PI / 2 });
    b.add(G.box(0.12, 0.08, 0.04, 0.02), 0xffffff, 0, 1.08, 0.275, { rx: -0.45 });
  }
  return b.build();
}

function buildArm(th) {
  const b = new Builder();
  b.add(G.sphere(8, 6), th.worker.shirt, 0, 0, 0, { s: 0.075 });
  b.add(G.cyl(0.062, 0.058, 0.2, 10), th.worker.shirt, 0, -0.1, 0);
  b.add(G.sphere(8, 6), 0xffffff, 0, -0.23, 0, { s: 0.072, tint: 1 });
  return b.build();
}

const _m = new THREE.Matrix4();
const _a = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _spot = new THREE.Vector3();

export function createWorkers(theme) {
  const group = new THREE.Group();
  group.name = 'workers';
  const mat = toyMaterial();
  const bodies = new THREE.InstancedMesh(buildBody(theme), mat, 4);
  const arms = new THREE.InstancedMesh(buildArm(theme), mat, 8);
  bodies.name = 'worker-bodies';
  arms.name = 'worker-arms';
  // instance positions change (stations open later): never cull on a stale bounding sphere
  bodies.frustumCulled = false;
  arms.frustumCulled = false;
  group.add(bodies, arms);
  const skin = [0, 1, 2, 3].map((i) => new THREE.Color(SKIN[(i * 3 + (theme.key === 'teddy' ? 1 : 0)) % SKIN.length]));
  for (let i = 0; i < 4; i++) { bodies.setColorAt(i, skin[i]); arms.setColorAt(i * 2, skin[i]); arms.setColorAt(i * 2 + 1, skin[i]); }
  const W = [0, 1, 2, 3].map((i) => ({ appear: 0, wasOpen: false, jump: 0, phase: i * 1.7 }));

  return {
    group,
    /** positions for shadows: fills out[i] = {x, z, visible} */
    spots: [0, 1, 2, 3].map(() => ({ x: 0, z: 0, s: 0 })),
    update(dt, stationsApi) {
      let n = 0;
      for (let i = 0; i < 4; i++) {
        const st = stationsApi.stations[i];
        const w = W[i];
        const sp = this.spots[i];
        if (!st.open) { w.wasOpen = false; w.appear = 0; sp.s = 0; continue; }
        if (!w.wasOpen) { w.wasOpen = true; w.appear = st.openT >= 0 ? -0.35 : 1; }
        if (w.appear < 1) w.appear = Math.min(1, w.appear + dt * 2.2);
        const ap = w.appear <= 0 ? 0 : ease.outBack(w.appear, 2.2);
        if (ap <= 0.001) { sp.s = 0; continue; }
        const ry0 = stationsApi.workerSpot(i, _spot, st.work);
        const t = st.t + w.phase;
        const work = st.work;
        const boost = st.boostAmt;
        // cheer jump
        const ch = st.cheer;
        const jumpK = ch > 0 ? 1 - ch : 1;
        const jump = ch > 0 ? Math.max(0, Math.sin(Math.min(1, jumpK / 0.55) * PI)) * (0.32 + boost * 0.05) : 0;
        const beat = st.beat * PI * 4;
        const bob = Math.abs(Math.sin(beat)) * 0.035 * work + Math.sin(t * 2.2) * 0.008 + boost * Math.abs(Math.sin(t * 14)) * 0.05;
        const look = (1 - work) * Math.sin(t * 0.7) * 0.35 + work * Math.sin(beat * 0.5) * 0.05;
        const breathe = 1 + Math.sin(t * 2.2) * 0.015 * (1 - work);
        let sqY = 1, sqX = 1;
        if (ch > 0 && jumpK > 0.5 && jumpK < 0.75) { const k = (jumpK - 0.5) / 0.25; sqY = 1 - Math.sin(k * PI) * 0.14; sqX = 1 + Math.sin(k * PI) * 0.09; }
        _p.set(_spot.x, bob + jump, _spot.z);
        _e.set(0, ry0 + look, Math.sin(t * 1.1) * 0.03 * (1 - work), 'YXZ');
        _q.setFromEuler(_e);
        const ws = 1.08;
        _s.set(ap * sqX * ws, ap * sqY * breathe * ws, ap * sqX * ws);
        _m.compose(_p, _q, _s);
        bodies.setMatrixAt(n, _m);
        bodies.setColorAt(n, skin[i]);
        // arms
        for (let side = 0; side < 2; side++) {
          const sgn = side ? 1 : -1;
          let ax, az;
          if (ch > 0 && jumpK < 0.9) {
            ax = -2.7; az = sgn * 0.35;
          } else {
            const swing = Math.sin(beat + side * PI);
            const idleX = Math.sin(t * 1.6 + side * PI) * 0.12;
            const workX = -1.05 - swing * 0.45 - boost * 0.2;
            ax = idleX * (1 - work) + workX * work;
            az = sgn * (0.12 + 0.1 * work);
          }
          _e.set(ax, 0, az, 'XYZ');
          _q.setFromEuler(_e);
          _a.compose(_p.set(sgn * SHOULDER_X, SHOULDER_Y, 0), _q, _s.set(1, 1, 1));
          _a.premultiply(_m);
          arms.setMatrixAt(n * 2 + side, _a);
          arms.setColorAt(n * 2 + side, skin[i]);
        }
        sp.x = _spot.x; sp.z = _spot.z; sp.s = ap * (1 - jump * 0.8);
        n++;
      }
      bodies.count = n;
      arms.count = n * 2;
      bodies.instanceMatrix.needsUpdate = true;
      arms.instanceMatrix.needsUpdate = true;
      if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;
      if (arms.instanceColor) arms.instanceColor.needsUpdate = true;
    },
    dispose() { bodies.geometry.dispose(); arms.geometry.dispose(); },
  };
}
