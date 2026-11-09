// Aftermath yard (W2): garage with 8 bay doors, painted bays, fence + swinging gate, crate stacks driven by
// state.inv, factory shed with a progress glow (state.jobs + clock), door flash and a crate slide on
// 'factory-done', and the company sign (canvas texture, re-drawn once the UI fonts are ready).
import * as THREE from 'three';
import { Builder } from './util.js';
import { YARD } from './layout.js';
import { EXTRAS } from './city.js';

const TEAL = 0x1f5654, YEL = 0xf5b400;
export const ITEM_COLORS = { scale: 0x3e6e78, blood: 0xd0581c, bone: 0xe4ddc8, eye: 0xd8a830, armor: 0x4a525a, cell: 0x4a8a4a, concrete: 0x9a9690, relic: 0x7a4a9a };
const ITEM_ORDER = ['scale', 'blood', 'bone', 'eye', 'armor', 'cell', 'concrete', 'relic'];
const PER_CRATE = { scale: 2, blood: 2, bone: 2, eye: 1, armor: 1, cell: 1, concrete: 1, relic: 1 };

function signTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const draw = () => {
    const c = cv.getContext('2d');
    c.fillStyle = '#12302f'; c.fillRect(0, 0, 512, 128);
    c.save(); c.beginPath(); c.rect(10, 12, 104, 104); c.clip();
    c.fillStyle = '#f5b400'; c.fillRect(10, 12, 104, 104);
    c.fillStyle = '#111'; for (let i = -6; i < 8; i++) { c.beginPath(); c.moveTo(10 + i * 26, 116); c.lineTo(36 + i * 26, 116); c.lineTo(88 + i * 26, 12); c.lineTo(62 + i * 26, 12); c.fill(); }
    c.restore();
    c.fillStyle = '#f5b400';
    c.font = '800 84px "Big Shoulders Stencil Display", "Big Shoulders Display", "Arial Narrow", sans-serif';
    c.textBaseline = 'middle'; c.fillText('AFTERMATH', 130, 58, 370);
    c.fillStyle = '#e6efe9'; c.font = '700 26px "Archivo", "Arial Narrow", sans-serif'; c.fillText('TEMİZLİK  ·  SAHA 1', 134, 106, 360);
    t.needsUpdate = true;
  };
  draw();
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(draw).catch(() => {});
  return t;
}

export function createYard(scene, { matI, fx }) {
  const group = new THREE.Group(); group.name = 'yard';
  scene.add(group);
  const B = new Builder(31, EXTRAS);
  const ex = { aFac: [0, 0, 0, 0], jitter: 0.02 };
  const G = YARD.garage;
  const gw = G.x1 - G.x0, gd = G.z1 - G.z0, gh = 5.5, gx = (G.x0 + G.x1) / 2, gz = (G.z0 + G.z1) / 2;
  B.box(gw, gh, gd, gx, gh / 2, gz, TEAL, { ...ex, aFac: [6, 0, 0, 0] });
  B.box(gw + 1, 0.5, gd + 1, gx, gh + 0.25, gz, 0x4a5a58, ex);
  for (let k = 0; k < 6; k++) B.box(10, 0.3, 3, gx - 38 + k * 15.2, gh + 0.6, gz, 0x9ab4c0, { ...ex, aFac: [3, 0, 0, 0] });
  B.box(gw + 1.2, 0.9, 0.4, gx, gh - 0.2, G.z1 + 0.5, YEL, ex);
  YARD.bays.forEach((b) => {
    B.box(8.6, 4.4, 0.2, b.x, 2.2, G.z0 - 0.1, 0xb9bdbf, { ...ex, aFac: [6, 0, 0, 0] });
    for (const dx of [-5.6, 5.6]) { const pg = new THREE.PlaneGeometry(0.7, 15); pg.rotateX(-Math.PI / 2); pg.translate(b.x + dx, 0.14, b.z); B.push(pg, YEL, { ...ex, jitter: 0 }); }
    const pf = new THREE.PlaneGeometry(11.9, 0.7); pf.rotateX(-Math.PI / 2); pf.translate(b.x, 0.14, b.z - 7.5); B.push(pf, YEL, { ...ex, jitter: 0 });
  });
  // hazard threshold at the gate and a teal walkway to the office
  for (let k = 0; k < 8; k++) { const pg = new THREE.PlaneGeometry(1.8, 3); pg.rotateX(-Math.PI / 2); pg.rotateY(0.6); pg.translate(-7 + k * 2, 0.15, YARD.z0 + 3); B.push(pg, k % 2 ? 0x1a1a1a : YEL, { ...ex, jitter: 0 }); }
  { const pg = new THREE.PlaneGeometry(120, 3); pg.rotateX(-Math.PI / 2); pg.translate(0, 0.13, 199); B.push(pg, 0x1f6a66, { ...ex, jitter: 0 }); }
  // office block at the west end of the garage, with windows
  B.box(14, 8, 12, G.x0 - 9, 4, gz + 1, 0xe9e5dc, ex);
  B.box(14.4, 0.4, 12.4, G.x0 - 9, 8.2, gz + 1, TEAL, ex);
  for (let f = 0; f < 2; f++) for (let k = 0; k < 4; k++) B.box(2.0, 1.4, 0.1, G.x0 - 14 + k * 3.3, 2.2 + f * 3.4, gz + 1 - 6.05, 0x1a2a33, { ...ex, aFac: [3, 0, 0, 0] });
  // factory shed
  const S = YARD.shed, sw = S.x1 - S.x0, sd = S.z1 - S.z0, sx = (S.x0 + S.x1) / 2, sz = (S.z0 + S.z1) / 2, sh = 10;
  B.box(sw, sh, sd, sx, sh / 2, sz, 0x7a8288, { ...ex, aFac: [6, 0, 0, 0] });
  { const g = new THREE.CylinderGeometry(sd / 2 + 0.4, sd / 2 + 0.4, sw + 0.6, 12, 1, false, 0, Math.PI); g.rotateZ(Math.PI / 2); g.rotateX(Math.PI / 2); g.scale(1, 0.28, 1); g.translate(sx, sh, sz); B.push(g, 0x5a646a, ex); }
  B.box(0.3, 7, 10, S.x0 - 0.1, 3.5, sz, 0x2e3438, ex);                       // door (faces the yard, -x)
  B.box(12, 6.5, 0.3, sx, 3.25, S.z1 + 0.1, 0x2e3438, ex);                     // camera-side door
  B.cyl(0.9, 0.9, 6, sx + 5, sh + 4, sz - 8, 0x8a8e90, { ...ex, seg: 8 });      // stack
  B.cyl(1.0, 1.0, 0.6, sx + 5, sh + 7.2, sz - 8, 0xb8382c, { ...ex, seg: 8 });
  // fuel tank, light tower posts
  B.cyl(1.6, 1.6, 6, YARD.x1 - 30, 1.8, YARD.z1 - 6, 0xd8d4ca, { ...ex, rz: Math.PI / 2, seg: 10 });
  for (const [x, z] of [[YARD.x0 + 3, YARD.z0 + 4], [YARD.x1 - 3, YARD.z0 + 4]]) { B.cyl(0.18, 0.22, 12, x, 6, z, 0x55595c, { ...ex, seg: 5 }); B.box(2.4, 0.9, 0.5, x, 12.2, z, 0x2a2c30, ex); }
  // fence (posts + mesh panels) with the gate gap
  const fence = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 3);
    for (let k = 0; k <= n; k++) { const t = k / n; B.box(0.18, 2.4, 0.18, ax + (bx - ax) * t, 1.3, az + (bz - az) * t, 0x55595c, ex); }
    const p = new THREE.BoxGeometry(len, 1.9, 0.05); p.rotateY(-Math.atan2(bz - az, bx - ax)); p.translate((ax + bx) / 2, 1.25, (az + bz) / 2);
    B.push(p, 0x8a9094, { ...ex, aFac: [3, 0, 0, 0], jitter: 0 });
  };
  const gxg = YARD.gate.x;
  fence(YARD.x0, YARD.z0, gxg - 8, YARD.z0); fence(gxg + 8, YARD.z0, YARD.x1, YARD.z0);
  fence(YARD.x0, YARD.z0, YARD.x0, YARD.z1); fence(YARD.x1, YARD.z0, YARD.x1, YARD.z1);
  const mesh = new THREE.Mesh(B.build(), matI); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'yardStatic';
  group.add(mesh);

  // gate leaves (pivot at the posts)
  const leafG = new THREE.BoxGeometry(7.6, 2.2, 0.15); leafG.translate(3.8, 1.3, 0);
  const leafM = new THREE.MeshStandardMaterial({ color: 0xd8a018, roughness: 0.6, metalness: 0.3 });
  const leafL = new THREE.Mesh(leafG, leafM), leafR = new THREE.Mesh(leafG, leafM);
  leafL.position.set(gxg - 8, 0, YARD.z0); leafR.position.set(gxg + 8, 0, YARD.z0); leafR.rotation.y = Math.PI;
  group.add(leafL, leafR);
  const gate = { open: 0, target: 0, holdUntil: -1 };

  // company sign on the garage roof
  const tex = signTexture();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(30, 7.5), new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color(1, 1, 1), emissiveMap: tex, emissiveIntensity: 0.6, roughness: 0.6 }));
  sign.rotation.set(-0.45, 0, 0); sign.position.set(gx, gh + 5.4, G.z0 + 4.0); sign.name = 'yardSign';
  const post = new THREE.Mesh(new THREE.BoxGeometry(26, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  post.position.set(gx, gh + 1.6, G.z0 + 4.6);
  group.add(sign, post);

  // shed progress glow: a light strip above the door that fills with the job progress + door flash
  const glowU = { uProg: { value: 0 }, uFlash: { value: 0 }, uOn: { value: 0 }, uTime: { value: 0 } };
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.2), new THREE.ShaderMaterial({
    uniforms: glowU, transparent: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uProg, uFlash, uOn, uTime; varying vec2 vUv;
      void main(){ float fill = step(vUv.x, uProg) * uOn; vec3 c = mix(vec3(0.06, 0.07, 0.08), vec3(1.0, 0.62, 0.15) * 4.0, fill);
        c += vec3(1.0, 0.85, 0.6) * uFlash * 6.0; c *= 0.85 + 0.15 * sin(uTime * 6.0) * fill;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  strip.rotation.x = -Math.PI / 2 + 0.25; strip.scale.set(1.9, 2.6, 1); strip.position.set(sx, sh + 3.6, S.z1 - 5); strip.name = 'shedGlow';
  group.add(strip);
  const doorLight = new THREE.Mesh(new THREE.PlaneGeometry(9, 6.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.35), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  doorLight.position.set(sx, 3.3, S.z1 + 0.35); doorLight.scale.set(1.3, 1, 1); doorLight.renderOrder = 5;
  group.add(doorLight);
  const slide = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 2.4), new THREE.MeshStandardMaterial({ color: ITEM_COLORS.concrete, roughness: 0.8 }));
  slide.visible = false; slide.castShadow = true; group.add(slide);
  const slideState = { t: -1 };

  // crate stacks (instanced)
  const CAP = 81;
  const crateG = (() => { const b = new Builder(5); b.box(2.6, 1.9, 2.6, 0, 0.95, 0, 0xffffff, { jitter: 0.05 }); b.box(2.66, 0.2, 2.66, 0, 1.1, 0, 0xcccccc, { jitter: 0 }); b.box(0.22, 1.92, 2.64, 0, 0.96, 0, 0xbbbbbb, { jitter: 0 }); return b.build(); })();
  const crates = new THREE.InstancedMesh(crateG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), CAP);
  crates.castShadow = true; crates.receiveShadow = true; crates.name = 'crates'; crates.count = 0; crates.frustumCulled = false;
  group.add(crates);
  const slots = [];
  for (let row = 0; row < 9; row++) for (let col = 0; col < 3; col++) slots.push({ x: YARD.crates.x0 + 2 + col * 2.8, z: YARD.crates.z0 + 2 + row * 3.1 });
  const crateState = { key: '', n: 0, pop: new Float32Array(CAP).fill(1), items: [] };
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _c = new THREE.Color();
  function layoutCrates() {
    const list = crateState.items;
    for (let i = 0; i < list.length; i++) {
      const slot = slots[Math.floor(i / 3) % slots.length], h = i % 3;
      const k = crateState.pop[i];
      const s = k < 1 ? (k < 0.6 ? k / 0.6 * 1.1 : 1.1 - (k - 0.6) / 0.4 * 0.1) : 1;
      _p.set(slot.x, 0.14 + h * 1.98, slot.z); _q.identity(); _s.setScalar(Math.max(0.001, s));
      _m.compose(_p, _q, _s); crates.setMatrixAt(i, _m);
    }
    crates.count = list.length;
    crates.instanceMatrix.needsUpdate = true;
  }
  function setInventory(inv) {
    if (!inv) return;
    let key = '';
    for (const it of ITEM_ORDER) key += (inv[it] | 0) + ',';
    if (key === crateState.key) return;
    crateState.key = key;
    const list = [];
    for (const it of ITEM_ORDER) { const n = Math.ceil((inv[it] || 0) / PER_CRATE[it]); for (let k = 0; k < n && list.length < CAP; k++) list.push(it); }
    const prevN = crateState.items.length;
    crateState.items = list;
    for (let i = 0; i < list.length; i++) { crates.setColorAt(i, _c.set(ITEM_COLORS[list[i]])); if (i >= prevN && crateState.primed) crateState.pop[i] = 0; else crateState.pop[i] = Math.max(crateState.pop[i], i < prevN ? 1 : crateState.pop[i]); }
    if (crates.instanceColor) crates.instanceColor.needsUpdate = true;
    crateState.primed = true;
    layoutCrates();
  }

  return {
    group,
    bays: YARD.bays,
    setInventory,
    // jobs: state.jobs, clock: state.clock
    setJobs(jobs, clock) {
      if (!jobs || !jobs.length) { glowU.uOn.value = 0; glowU.uProg.value = 0; return; }
      let best = 0;
      for (const j of jobs) best = Math.max(best, Math.min(1, Math.max(0, (clock - j.start) / Math.max(0.01, j.end - j.start))));
      glowU.uOn.value = 1; glowU.uProg.value = best;
    },
    openGate(hold = 2.5, now = 0) { gate.target = 1; gate.holdUntil = now + hold; },
    factoryDone(rid) {
      glowU.uFlash.value = 1; slideState.t = 0; slide.visible = true;
      slide.material.color.set(ITEM_COLORS[rid] ?? ITEM_COLORS.concrete);
    },
    update(dt, now) {
      glowU.uTime.value = now;
      if (gate.target > 0 && now > gate.holdUntil) gate.target = 0;
      gate.open += (gate.target - gate.open) * Math.min(1, dt * 5);
      leafL.rotation.y = -gate.open * 1.5; leafR.rotation.y = Math.PI + gate.open * 1.5;
      if (glowU.uFlash.value > 0) glowU.uFlash.value = Math.max(0, glowU.uFlash.value - dt / 0.6);
      doorLight.material.opacity = glowU.uFlash.value * 0.8 + glowU.uOn.value * 0.15;
      if (slideState.t >= 0) {
        slideState.t += dt;
        const k = Math.min(1, slideState.t / 0.6);
        slide.position.set(sx, 0.95, S.z1 + 1.5 + k * 9);
        if (slideState.t > 1.4) { slide.visible = false; slideState.t = -1; }
      }
      let popping = false;
      for (let i = 0; i < crateState.items.length; i++) if (crateState.pop[i] < 1) { crateState.pop[i] = Math.min(1, crateState.pop[i] + dt / 0.18); popping = true; }
      if (popping) layoutCrates();
    },
    stats: () => ({ crates: crateState.items.length }),
  };
}
