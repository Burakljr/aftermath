// Small, tidy effects with fixed pools (no allocations per frame): gold coins popping out of a
// table when a guest pays, sparkles on upgrades, a soft burst + floor ring when something
// opens / is bought, steam puffs at the stove and confetti when a location is complete.
// One InstancedMesh per particle kind (coins, stars, puffs, confetti) + a few ring decals.
import * as THREE from 'three';

const KINDS = ['coin', 'star', 'puff', 'confetti'];
const CONFETTI = [0xff6b6b, 0xffc93c, 0x4fc3f7, 0x7bd389, 0xb388ff, 0xff9f43];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _q3 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const _z = new THREE.Vector3(0, 0, 1);

function spriteTexture(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createFx(preset) {
  const group = new THREE.Group();
  group.name = 'fx';
  let scale = preset ? preset.particles : 1;
  const CAP = { coin: 24, star: 64, puff: 48, confetti: 160 };

  const geos = {
    coin: new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14).rotateX(Math.PI / 2),
    star: new THREE.PlaneGeometry(0.5, 0.5),
    puff: new THREE.PlaneGeometry(0.7, 0.7),
    confetti: new THREE.PlaneGeometry(0.16, 0.24),
  };
  const starTex = spriteTexture((ctx) => {
    ctx.translate(32, 32);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 7 : 30, a = (i * Math.PI) / 4;
      ctx.lineTo(Math.sin(a) * r, -Math.cos(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  });
  const puffTex = spriteTexture((ctx) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
  const mats = {
    coin: new THREE.MeshLambertMaterial({ color: 0xffc83a, emissive: 0x6b4300 }),
    star: new THREE.MeshBasicMaterial({ map: starTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    puff: new THREE.MeshBasicMaterial({ map: puffTex, transparent: true, depthWrite: false, opacity: 0.85 }),
    confetti: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  };
  const meshes = {};
  const P = {};
  for (const k of KINDS) {
    const im = new THREE.InstancedMesh(geos[k], mats[k], CAP[k]);
    im.name = 'fx:' + k;
    im.frustumCulled = false;
    im.count = 0;
    im.visible = false;
    im.renderOrder = k === 'coin' ? 4 : 5;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (k !== 'coin') im.setColorAt(0, _c.set(0xffffff));
    group.add(im);
    meshes[k] = im;
    const n = CAP[k];
    P[k] = {
      n: 0, cap: n,
      x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n),
      vx: new Float32Array(n), vy: new Float32Array(n), vz: new Float32Array(n),
      age: new Float32Array(n), life: new Float32Array(n), size: new Float32Array(n),
      rot: new Float32Array(n), spin: new Float32Array(n), grav: new Float32Array(n), drag: new Float32Array(n),
      col: new Uint32Array(n),
    };
  }

  // ring decals on the floor (expanding, fading)
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, depthWrite: false, opacity: 0.8, blending: THREE.AdditiveBlending });
  const ringGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(ringGeo, ringMat.clone());
    m.visible = false;
    m.renderOrder = 2;
    group.add(m);
    rings.push({ m, t: 0, life: 0.7 });
  }

  let seed = 1234567;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  function emit(kind, x, y, z, o) {
    const p = P[kind];
    if (p.n >= p.cap) return;
    const i = p.n++;
    p.x[i] = x; p.y[i] = y; p.z[i] = z;
    p.vx[i] = o.vx; p.vy[i] = o.vy; p.vz[i] = o.vz;
    p.age[i] = -(o.delay || 0); p.life[i] = o.life; p.size[i] = o.size;
    p.rot[i] = rnd() * Math.PI * 2; p.spin[i] = o.spin || 0; p.grav[i] = o.grav || 0; p.drag[i] = o.drag || 0;
    p.col[i] = o.color || 0xffffff;
  }
  const n = (k) => Math.max(1, Math.round(k * scale));

  const api = {
    group,
    coins(pos, value) {
      const count = n(value >= 1000 ? 5 : value >= 50 ? 4 : 3);
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2, sp = 0.6 + rnd() * 0.8;
        emit('coin', pos.x, pos.y, pos.z, { vx: Math.cos(a) * sp, vy: 4.2 + rnd() * 1.6, vz: Math.sin(a) * sp, life: 0.75 + rnd() * 0.2, size: 1, spin: 9 + rnd() * 6, grav: 11, delay: i * 0.04 });
      }
    },
    sparkle(pos, strength = 1) {
      const count = n(8 * strength);
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2, sp = 1 + rnd() * 1.6 * strength;
        emit('star', pos.x, pos.y, pos.z, {
          vx: Math.cos(a) * sp, vy: 1.6 + rnd() * 2.4, vz: Math.sin(a) * sp * 0.6, life: 0.55 + rnd() * 0.35, size: 0.6 + rnd() * 0.7,
          spin: (rnd() - 0.5) * 6, grav: 3, drag: 1.5, color: rnd() < 0.5 ? 0xffe27a : 0xffffff, delay: rnd() * 0.08,
        });
      }
    },
    burst(pos, strength = 1) {
      api.sparkle(pos, strength);
      const count = n(7 * strength);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        emit('puff', pos.x + Math.cos(a) * 0.5, 0.25, pos.z + Math.sin(a) * 0.35, {
          vx: Math.cos(a) * 1.6, vy: 0.5 + rnd() * 0.4, vz: Math.sin(a) * 1.2, life: 0.55 + rnd() * 0.2, size: 0.9 + rnd() * 0.5, drag: 3, color: 0xfff8ee,
        });
      }
      api.confettiAt(pos, n(14 * strength));
    },
    steam(pos) {
      for (let i = 0; i < n(3); i++) {
        emit('puff', pos.x + (rnd() - 0.5) * 0.5, pos.y, pos.z + (rnd() - 0.5) * 0.3, {
          vx: (rnd() - 0.5) * 0.2, vy: 0.9 + rnd() * 0.4, vz: 0, life: 0.85 + rnd() * 0.3, size: 0.42 + rnd() * 0.22, drag: 0.6, color: 0xffffff, delay: i * 0.15,
        });
      }
    },
    confettiAt(pos, count) {
      for (let i = 0; i < count; i++) {
        const a = rnd() * Math.PI * 2, sp = 1.5 + rnd() * 2;
        emit('confetti', pos.x, pos.y + 0.3, pos.z, {
          vx: Math.cos(a) * sp, vy: 3 + rnd() * 3, vz: Math.sin(a) * sp * 0.6, life: 1.2 + rnd() * 0.6, size: 1,
          spin: 6 + rnd() * 8, grav: 6, drag: 1.8, color: CONFETTI[(rnd() * CONFETTI.length) | 0],
        });
      }
    },
    confetti(pos, strength = 1) {
      // rain over the whole room
      const count = n(70 * strength);
      for (let i = 0; i < count; i++) {
        emit('confetti', (rnd() - 0.5) * 12, pos.y + rnd() * 3, -8 + rnd() * 17, {
          vx: (rnd() - 0.5) * 1.5, vy: -0.5 - rnd(), vz: (rnd() - 0.5) * 1.5, life: 2.2 + rnd() * 1.3, size: 1.2,
          spin: 5 + rnd() * 8, grav: 1.2, drag: 0.8, color: CONFETTI[(rnd() * CONFETTI.length) | 0], delay: rnd() * 0.6,
        });
      }
    },
    ring(pos) {
      const r = rings.find((x) => !x.m.visible) || rings[0];
      r.t = 0;
      r.m.visible = true;
      r.m.position.copy(pos);
    },
    update(dt, camera) {
      camera.getWorldQuaternion(_q);
      for (const k of KINDS) {
        const p = P[k];
        const im = meshes[k];
        let w = 0;
        for (let i = 0; i < p.n; i++) {
          p.age[i] += dt;
          if (p.age[i] >= p.life[i]) {
            // remove: move the last particle here
            const j = --p.n;
            p.x[i] = p.x[j]; p.y[i] = p.y[j]; p.z[i] = p.z[j]; p.vx[i] = p.vx[j]; p.vy[i] = p.vy[j]; p.vz[i] = p.vz[j];
            p.age[i] = p.age[j]; p.life[i] = p.life[j]; p.size[i] = p.size[j]; p.rot[i] = p.rot[j]; p.spin[i] = p.spin[j];
            p.grav[i] = p.grav[j]; p.drag[i] = p.drag[j]; p.col[i] = p.col[j];
            i--;
            continue;
          }
          if (p.age[i] < 0) continue;
          const dr = Math.exp(-p.drag[i] * dt);
          p.vx[i] *= dr; p.vz[i] *= dr; p.vy[i] = p.vy[i] * dr - p.grav[i] * dt;
          p.x[i] += p.vx[i] * dt; p.y[i] += p.vy[i] * dt; p.z[i] += p.vz[i] * dt;
          if (k === 'confetti' && p.y[i] < 0.02) { p.y[i] = 0.02; p.vy[i] = 0; p.vx[i] *= 0.5; p.vz[i] *= 0.5; p.spin[i] *= 0.9; }
          p.rot[i] += p.spin[i] * dt;
          const t = p.age[i] / p.life[i];
          let s = p.size[i];
          if (k === 'coin') {
            s *= t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;
            _q2.setFromEuler(_e.set(0, p.rot[i], 0));
          } else if (k === 'confetti') {
            s *= t > 0.8 ? (1 - t) / 0.2 : 1;
            _q2.setFromEuler(_e.set(p.rot[i], p.rot[i] * 0.7, p.rot[i] * 0.3));
          } else {
            s *= k === 'star' ? Math.sin(Math.min(1, t * 1.2) * Math.PI) : 0.6 + t * 0.8;
            _q2.copy(_q).multiply(_q3.setFromAxisAngle(_z, p.rot[i]));
          }
          _p.set(p.x[i], p.y[i], p.z[i]);
          _s.set(s, s, s);
          im.setMatrixAt(w, _m.compose(_p, _q2, _s));
          if (k !== 'coin') {
            if (k === 'puff') _c.set(p.col[i]).multiplyScalar(1 - t * 0.6);
            else _c.set(p.col[i]);
            im.setColorAt(w, _c);
          }
          w++;
        }
        im.count = w;
        im.visible = w > 0;
        if (w) {
          im.instanceMatrix.needsUpdate = true;
          if (im.instanceColor) im.instanceColor.needsUpdate = true;
        }
      }
      for (const r of rings) {
        if (!r.m.visible) continue;
        r.t += dt;
        const t = r.t / r.life;
        if (t >= 1) { r.m.visible = false; continue; }
        const s = 0.6 + t * 1.9;
        r.m.scale.set(s, 1, s);
        r.m.material.opacity = 0.8 * (1 - t);
      }
    },
    clear() {
      for (const k of KINDS) { P[k].n = 0; meshes[k].count = 0; meshes[k].visible = false; }
      for (const r of rings) r.m.visible = false;
    },
    setPreset(p) { scale = p ? p.particles : 1; },
    get count() { let c = 0; for (const k of KINDS) c += P[k].n; return c; },
  };
  return api;
}
