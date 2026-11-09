// Particle effects: coins, stars, confetti, puffs, sparkles, chips and floor
// rings. One instanced mesh per kind; fixed pools, no allocations per frame.
import * as THREE from 'three';
import { G, Builder, toyMaterial, tintMaskShader, TAU, rng, clamp } from './kit.js';

const PI = Math.PI;

function coinGeo() {
  const b = new Builder();
  b.add(G.cyl(0.14, 0.14, 0.045, 18), 0xf5b400, 0, 0, 0, { rx: PI / 2 });
  b.add(G.cyl(0.105, 0.105, 0.05, 18), 0xffdf5a, 0, 0, 0, { rx: PI / 2 });
  b.add(G.star(0.07, 0.032, 0.02), 0xfff3b0, 0, 0, 0.022);
  b.add(G.star(0.07, 0.032, 0.02), 0xfff3b0, 0, 0, -0.022, { ry: PI });
  return b.build();
}
function starGeo() { const b = new Builder(); b.add(G.star(0.2, 0.09, 0.07), 0xffffff, 0, 0, 0, { tint: 1 }); return b.build(); }
function sparkleGeo() { const b = new Builder(); b.add(G.star(0.16, 0.035, 0.015, 4), 0xffffff, 0, 0, 0, { tint: 1 }); return b.build(); }
function confettiGeo() { const b = new Builder(); b.add(G.box(0.13, 0.02, 0.075, 0), 0xffffff, 0, 0, 0, { tint: 1 }); return b.build(); }
function puffGeo() { const b = new Builder(); b.add(G.ico(0.14, 1), 0xffffff, 0, 0, 0, { tint: 1 }); return b.build(); }
function chipGeo() { const b = new Builder(); b.add(G.box(0.08, 0.05, 0.06, 0.015), 0xffffff, 0, 0, 0, { tint: 1 }); return b.build(); }
function ringGeo() { const b = new Builder(); b.add(G.torus(1, 0.035, 4, 40), 0xffffff, 0, 0, 0, { rx: PI / 2, tint: 1 }); return b.build(); }

const KINDS = {
  coin: { geo: coinGeo, max: 48, lit: true, bill: false, bounce: true },
  star: { geo: starGeo, max: 72, lit: true, bill: true },
  sparkle: { geo: sparkleGeo, max: 90, lit: false, bill: true },
  confetti: { geo: confettiGeo, max: 140, lit: false, bill: false, bounce: true },
  puff: { geo: puffGeo, max: 80, lit: true, bill: false, grow: true },
  chip: { geo: chipGeo, max: 70, lit: true, bill: false, bounce: true },
  ring: { geo: ringGeo, max: 8, lit: false, bill: false, ring: true },
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _z = new THREE.Vector3(0, 0, 1);

export const CONFETTI = [0xff5a5f, 0xffcc29, 0x3fa9f5, 0x4fd18b, 0xff8ad8, 0x9b6bff, 0xff9f1c];

export function createFx(preset) {
  const group = new THREE.Group();
  group.name = 'fx';
  const rand = rng(99);
  const litMat = toyMaterial();
  const flatMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  flatMat.onBeforeCompile = tintMaskShader;
  flatMat.customProgramCacheKey = () => 'flat-tint';
  let mult = preset.particles;

  const sys = {};
  for (const [name, k] of Object.entries(KINDS)) {
    const n = k.max;
    const mesh = new THREE.InstancedMesh(k.geo(), k.lit ? litMat : flatMat, n);
    mesh.name = 'fx-' + name;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.setColorAt(0, _c.set(0xffffff));
    mesh.visible = false;
    mesh.renderOrder = 3;
    group.add(mesh);
    sys[name] = {
      k, mesh, n: 0,
      p: new Float32Array(n * 3), v: new Float32Array(n * 3), r: new Float32Array(n * 3), w: new Float32Array(n * 3),
      life: new Float32Array(n), max: new Float32Array(n), size: new Float32Array(n), grav: new Float32Array(n), drag: new Float32Array(n),
      col: new Float32Array(n * 3),
    };
  }

  function spawn(name, x, y, z, vx, vy, vz, o) {
    const S = sys[name];
    if (!S) return;
    let i = S.n;
    if (i >= S.k.max) {
      // recycle the oldest-ish particle
      i = Math.floor(rand() * S.k.max);
    } else S.n++;
    const i3 = i * 3;
    S.p[i3] = x; S.p[i3 + 1] = y; S.p[i3 + 2] = z;
    S.v[i3] = vx; S.v[i3 + 1] = vy; S.v[i3 + 2] = vz;
    S.r[i3] = rand() * TAU; S.r[i3 + 1] = rand() * TAU; S.r[i3 + 2] = rand() * TAU;
    const spin = o.spin ?? 6;
    S.w[i3] = (rand() - 0.5) * spin; S.w[i3 + 1] = (rand() - 0.5) * spin; S.w[i3 + 2] = (rand() - 0.5) * spin;
    const life = (o.life ?? 1) * (0.8 + rand() * 0.4);
    S.life[i] = life; S.max[i] = life;
    S.size[i] = (o.size ?? 1) * (0.8 + rand() * 0.4);
    S.grav[i] = o.grav ?? 9;
    S.drag[i] = o.drag ?? 0.5;
    const cols = o.colors;
    _c.set(cols ? cols[Math.floor(rand() * cols.length)] : 0xffffff);
    S.col[i3] = _c.r; S.col[i3 + 1] = _c.g; S.col[i3 + 2] = _c.b;
    S.mesh.visible = true;
  }

  const n = (count) => Math.max(1, Math.round(count * mult));
  const list = Object.values(sys);

  const api = {
    group,
    setPreset(p) { mult = p.particles; },
    /** radial burst: kind, centre, count, { speed, up, spread, size, life, grav, drag, colors, spin } */
    burst(kind, pos, count, o = {}) {
      const c = n(count);
      const speed = o.speed ?? 3, up = o.up ?? 3, spread = o.spread ?? 1;
      for (let i = 0; i < c; i++) {
        const a = rand() * TAU, r = (0.4 + rand() * 0.6) * speed;
        spawn(kind, pos.x + (rand() - 0.5) * 0.2 * spread, pos.y + (rand() - 0.5) * 0.15, pos.z + (rand() - 0.5) * 0.2 * spread,
          Math.cos(a) * r * spread, up * (0.6 + rand() * 0.6), Math.sin(a) * r * spread, o);
      }
    },
    /** gentle emission (one particle) for machine work */
    emit(kind, pos, o = {}) {
      if (!o.always && rand() > mult + 0.15) return;
      const a = rand() * TAU, r = (o.speed ?? 1) * (0.3 + rand() * 0.7);
      spawn(kind, pos.x, pos.y, pos.z, Math.cos(a) * r, (o.up ?? 1.5) * (0.5 + rand()), Math.sin(a) * r, o);
    },
    /** confetti rain over an area centred at pos */
    rain(pos, count, radius = 4, o = {}) {
      const c = n(count);
      for (let i = 0; i < c; i++) {
        spawn('confetti', pos.x + (rand() - 0.5) * radius * 2, pos.y + rand() * 2.5, pos.z + (rand() - 0.5) * radius * 2,
          (rand() - 0.5) * 1.2, -0.3 - rand() * 0.8, (rand() - 0.5) * 1.2,
          { life: 2.6, size: 1.2, grav: 0.6, drag: 1.4, spin: 10, colors: CONFETTI, ...o });
      }
    },
    ring(pos, color = 0xffd23c, size = 1.6) {
      spawn('ring', pos.x, pos.y, pos.z, 0, 0, 0, { life: 0.45, size, grav: 0, drag: 0, spin: 0, colors: [color] });
    },
    clear() { for (const S of Object.values(sys)) { S.n = 0; S.mesh.count = 0; S.mesh.visible = false; } },
    count() { let c = 0; for (const S of list) c += S.n; return c; },

    update(dt, camera) {
      const camQ = camera.quaternion;
      for (let si = 0; si < list.length; si++) {
        const S = list[si];
        if (!S.n) { if (S.mesh.visible) { S.mesh.visible = false; S.mesh.count = 0; } continue; }
        const k = S.k;
        let i = 0;
        while (i < S.n) {
          S.life[i] -= dt;
          if (S.life[i] <= 0) {
            // swap-remove
            const last = S.n - 1;
            if (i !== last) {
              const a = i * 3, b = last * 3;
              for (let j = 0; j < 3; j++) { S.p[a + j] = S.p[b + j]; S.v[a + j] = S.v[b + j]; S.r[a + j] = S.r[b + j]; S.w[a + j] = S.w[b + j]; S.col[a + j] = S.col[b + j]; }
              S.life[i] = S.life[last]; S.max[i] = S.max[last]; S.size[i] = S.size[last]; S.grav[i] = S.grav[last]; S.drag[i] = S.drag[last];
            }
            S.n--;
            continue;
          }
          const i3 = i * 3;
          const drag = Math.max(0, 1 - S.drag[i] * dt);
          S.v[i3 + 1] -= S.grav[i] * dt;
          S.v[i3] *= drag; S.v[i3 + 1] *= drag; S.v[i3 + 2] *= drag;
          S.p[i3] += S.v[i3] * dt; S.p[i3 + 1] += S.v[i3 + 1] * dt; S.p[i3 + 2] += S.v[i3 + 2] * dt;
          if (k.bounce && S.p[i3 + 1] < 0.04) { S.p[i3 + 1] = 0.04; S.v[i3 + 1] *= -0.3; S.v[i3] *= 0.5; S.v[i3 + 2] *= 0.5; S.w[i3] *= 0.5; S.w[i3 + 2] *= 0.5; }
          S.r[i3] += S.w[i3] * dt; S.r[i3 + 1] += S.w[i3 + 1] * dt; S.r[i3 + 2] += S.w[i3 + 2] * dt;
          const t = 1 - S.life[i] / S.max[i]; // 0 -> 1
          let sc;
          if (k.ring) sc = S.size[i] * (0.3 + 0.9 * Math.sqrt(t)) * (t > 0.6 ? 1 - (t - 0.6) * 0.5 : 1);
          else if (k.grow) sc = S.size[i] * (t < 0.25 ? 0.4 + 2.4 * t : 1 - Math.max(0, (t - 0.45) / 0.55) * 0.95);
          else sc = S.size[i] * (t < 0.1 ? t / 0.1 : t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1);
          if (sc < 0.001) sc = 0.001;
          _p.set(S.p[i3], S.p[i3 + 1], S.p[i3 + 2]);
          if (k.bill) {
            _q2.setFromAxisAngle(_z, S.r[i3 + 2]);
            _q.copy(camQ).multiply(_q2);
          } else if (k.ring) {
            _q.identity();
          } else {
            _e.set(S.r[i3], S.r[i3 + 1], S.r[i3 + 2]);
            _q.setFromEuler(_e);
          }
          if (k.ring) _s.set(sc, 1, sc);
          else _s.set(sc, sc, sc);
          _m.compose(_p, _q, _s);
          S.mesh.setMatrixAt(i, _m);
          _c.setRGB(S.col[i3], S.col[i3 + 1], S.col[i3 + 2]);
          S.mesh.setColorAt(i, _c);
          i++;
        }
        S.mesh.count = S.n;
        S.mesh.visible = S.n > 0;
        S.mesh.instanceMatrix.needsUpdate = true;
        if (S.mesh.instanceColor) S.mesh.instanceColor.needsUpdate = true;
      }
    },
    dispose() { for (const S of Object.values(sys)) S.mesh.geometry.dispose(); flatMat.dispose(); },
  };
  return api;
}
