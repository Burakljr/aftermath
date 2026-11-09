// Magmadon corpse (A3): placed from world.placement() (layout.corpsePlacement is the single source of
// truth), lying on its side with the belly and the open jaw toward the camera and the flank plates to
// the sky. ONE baked mesh for every chain shape (scaled to the placement; mirrored when the belly must
// face the other way) and ONE draw call whatever the carving state:
//   - each district owns the body between its [u0, u1) and loses it in 4 visible steps (25/50/75/100 %)
//     cut from its tail-side end toward the head (the head goes last, so 'corpse:head' stays valid);
//   - plates ahead of the cut are lifted off (flesh, ribs and the glowing magma gland show underneath);
//   - back faces seen through the cut render as raw flesh with a hot rim (no blood, no gore).
// Fissures cool from the impact heat to a dull red over ~10 s, three steam vents puff while it lies there.
import * as THREE from 'three';
import { createMagmadon, corpsePose, standPose, magmaMaterial, magmaDepthMaterial, carveUniforms } from './magmadon.js';

const ROLL = 1.3, SINK = 2.6;
const CAM_DIR = { x: Math.sin(0.14), z: Math.cos(0.14) };
const LOOK = { neck: [0.6, 0, 0], head: [0.45, 0, -0.2] };

export function createCorpse(world) {
  const model = createMagmadon();
  model.group.visible = false;
  world.scene.add(model.group);
  // ---- bake the corpse pose once (no hitch at the hit)
  const t0 = performance.now();
  model.root.rotation.set(0, 0, ROLL);
  model.setPose(corpsePose({ roll: ROLL, side: 1, neck: LOOK.neck, head: LOOK.head, jaw: 0.66 }));
  model.group.updateMatrixWorld(true);
  let minY = 1e9; for (const p of model.hullPoints(5)) minY = Math.min(minY, p.y);
  model.root.position.y = -minY;
  const LIFT = -minY;
  const headW = model.worldPoint('head').clone(), eyeW = model.worldPoint('eye').clone();
  const plateW = []; for (let k = 0; k < model.plateCount; k++) plateW.push(model.plateCentre(k).clone());
  const bake = model.bakeGeometry();
  model.root.position.set(0, 0, 0); model.root.rotation.set(0, 0, 0);
  model.setPose(standPose(0));
  const bakeMs = performance.now() - t0;
  const Z0 = bake.zMin, Z1 = bake.zMax, LEN0 = Z1 - Z0, WID0 = bake.xMax - bake.xMin, XC = (bake.xMax + bake.xMin) / 2;
  const uOf = (p) => (Z1 - p.z) / LEN0;
  const plateU = plateW.map(uOf);

  const CU = carveUniforms(); CU.uCarveOn.value = 1; CU.uCutScale.value = LEN0;
  const mat = magmaMaterial(model.U, CU);
  const mesh = new THREE.Mesh(bake.geo, mat);
  mesh.customDepthMaterial = magmaDepthMaterial(CU);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.visible = false; mesh.name = 'corpse';
  const holder = new THREE.Group(); holder.add(mesh); world.scene.add(holder);

  // ---- rare glint (eye / dna): an additive star sprite
  const glintMat = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,240,200,0.6)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.beginPath(); c.moveTo(64, 0); c.lineTo(70, 58); c.lineTo(128, 64); c.lineTo(70, 70); c.lineTo(64, 128); c.lineTo(58, 70); c.lineTo(0, 64); c.lineTo(58, 58); c.closePath(); c.fill();
    const t = new THREE.CanvasTexture(cv);
    return new THREE.SpriteMaterial({ map: t, color: new THREE.Color(5, 4.2, 2.6), transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
  })();
  const glint = new THREE.Sprite(glintMat); glint.visible = false; glint.renderOrder = 30; world.scene.add(glint);
  let glintT = -99, glintPos = new THREE.Vector3(), glintGreen = false;

  // ---- per placement (layout.corpsePlacement is pure: cache it per attack object)
  let key = '', P = null, fit = null;
  const plCache = { a: null, n: -1, chain: '', mutant: false, pl: null }, fitCache = { pl: null, fit: null };
  function placementFor(a) {
    if (!a || !a.chain || !a.chain.length) return null;
    if (plCache.a === a && plCache.n === a.n && plCache.mutant === !!a.mutant && plCache.len === a.chain.length && plCache.c0 === a.chain[0]) return plCache.pl;
    plCache.a = a; plCache.n = a.n; plCache.mutant = !!a.mutant; plCache.len = a.chain.length; plCache.c0 = a.chain[0];
    plCache.pl = world.corpsePlacement(a);
    return plCache.pl;
  }
  const parts = [];                      // { id, u0, u1, f (shown front), step, started, tStep }
  const vents = [];
  let tHit = -99, shown = false, mutant = false;
  const _v = new THREE.Vector3(), _m = new THREE.Matrix4();

  function computeFit(pl, mut) {
    const s = pl.length / LEN0;
    const kw = Math.max(0.7, Math.min(1.05, pl.width / (WID0 * s)));
    const lx = { x: Math.cos(pl.yaw), z: -Math.sin(pl.yaw) };            // local +x in world
    const side = lx.x * CAM_DIR.x + lx.z * CAM_DIR.z >= 0 ? 1 : -1;
    // nose of the baked mesh at local z = Z1 sits on pl.nose; lateral centre on the axis
    const xs = -XC * kw * s * side;
    const pos = new THREE.Vector3(pl.nose.x - pl.dir.x * Z1 * s + lx.x * xs, -SINK, pl.nose.z - pl.dir.z * Z1 * s + lx.z * xs);
    const ky = Math.min(1, kw * 1.4);                                    // bulkier than the footprint allows
    return { s, kw, ky, side, yaw: pl.yaw, pos, lx, mutant: !!mut, height: bake.yMax * ky * s - SINK };
  }
  function place(pl, attack) {
    P = pl; fit = computeFit(pl, attack && attack.mutant);
    mutant = !!(attack && attack.mutant);
    holder.position.copy(fit.pos); holder.rotation.set(0, fit.yaw, 0); holder.scale.set(fit.side * fit.kw * fit.s, fit.ky * fit.s, fit.s);
    holder.updateMatrixWorld(true);
    parts.length = 0;
    for (const p of pl.parts) parts.push({ id: p.districtId, u0: p.u0, u1: p.u1, f: 0, target: 0, step: 0, started: false, tStep: -99 });
    // steam vents: three glands / big plate centres along the shell
    vents.length = 0;
    for (const k of [0, 3, 4]) { const w = plateW[k].clone().applyMatrix4(holder.matrixWorld); vents.push({ p: w, u: plateU[k], t: k * 0.47 }); }
  }
  function partOf(id) { for (const p of parts) if (p.id === id) return p; return null; }
  // carve progress -> uniforms
  function applyCarve() {
    const UP = CU.uPart.value, G = CU.uPlateGone.value;
    for (let k = 0; k < 3; k++) UP[k].set(0, 0, 1, 0);
    G.fill(0);
    parts.forEach((p, k) => {
      if (k >= 3) return;
      UP[k].set(p.u0, p.u1, 1, Math.min(1.001, p.f >= 0.999 ? 1.01 : p.f));
      if (!p.started) return;
      const ahead = p.f >= 0.999 ? 2 : p.f + (p.step === 0 ? 0.22 : 0.32);
      for (let i = 0; i < plateU.length; i++) {
        const u = plateU[i];
        if (u < p.u0 || u >= p.u1) continue;
        const d = (p.u1 - u) / (p.u1 - p.u0);
        if (d < ahead) G[i + 1] = 1;
      }
    });
  }
  // gameplay light on the carcass (attack.js drives the same uniforms with the cinematic key during the attack)
  function gameLight() {
    const U = model.U;
    U.uKeyCol.value.setRGB(0, 0, 0);
    U.uRimCol.value.setRGB(0.07, 0.09, 0.12); U.uSkyCol.value.setRGB(0.045, 0.05, 0.06);
  }
  function axisPoint(u, out) { return out.set(P.nose.x - P.dir.x * u * P.length, 0, P.nose.z - P.dir.z * u * P.length); }

  const api = {
    model, bakeMs,
    get fit() { return fit; },
    get placement() { return P; },
    placementOf: placementFor,
    fitFor(attack) { const pl = placementFor(attack); if (!pl) return null; if (fitCache.pl !== pl) { fitCache.pl = pl; fitCache.fit = computeFit(pl, attack.mutant); } return fitCache.fit; },
    bakeXC: () => XC, bakeLift: () => LIFT,
    update(state, t, dt) {
      const a = state && state.attack;
      const pl = a ? placementFor(a) : null;
      if (pl !== key) { key = pl; if (pl) place(pl, a); else P = null; tHit = -99; }
      let show = false;
      if (P && a && (a.hit || (state.phase !== 'attack'))) {
        for (const p of parts) {
          const sec = state.sectors && state.sectors[p.id];
          let c;
          if (!sec || !sec.damaged) c = 1;
          else c = sec.corpseMax > 0 ? 1 - sec.corpse / sec.corpseMax : 0;
          const step = c >= 0.999 ? 4 : Math.min(3, Math.floor(c * 4 + 1e-6));
          p.started = c > 0.02;
          if (step !== p.step) {
            if (step > p.step && dt > 0 && shown) {
              // juice: dust + steam along the new cut
              const uc = p.u1 - (p.u1 - p.u0) * (step / 4);
              axisPoint(Math.max(p.u0, Math.min(p.u1, uc)), _v);
              world.fx.dust(_v.x, 4, _v.z, 6, { size: 12, spread: 10, rise: 4, life: 2.6 });
              world.fx.steam(_v.x, fit.height * 0.5, _v.z, 4, { size: 10, life: 2 });
            }
            p.step = step; p.tStep = t;
          }
          p.target = step / 4;
          // the front eases to its step over 0.5 s (snaps when time is not running)
          p.f = dt > 0 ? p.f + (p.target - p.f) * Math.min(1, dt * 7) : p.target;
          if (Math.abs(p.f - p.target) < 0.002) p.f = p.target;
          if (p.f < 0.999) show = true;
        }
      }
      if (show && !shown && a && a.hit && state.phase === 'attack') tHit = t;
      shown = show;
      mesh.visible = show;
      if (!show) { glint.visible = false; return; }
      applyCarve();
      // heat: hot right after the impact, cooled to dull red after ~10 s (reload: cool at once)
      const since = t - tHit;
      const heat = tHit > -90 && since >= 0 ? Math.max(0, 1 - since / 10) * 0.75 : 0;
      model.setHeat(false, heat, mutant);
      if (state.phase !== 'attack') gameLight();
      model.U.uTime.value = t;
      // steam vents
      for (const v of vents) {
        let p = null;
        for (const q of parts) if (v.u >= q.u0 && v.u < q.u1 + 1e-4) p = q;
        if (p && (p.f >= 0.999 || (p.u1 - v.u) / (p.u1 - p.u0) < p.f + 0.1)) continue;
        if (dt > 0 && t - v.t > 1.5) { v.t = t + Math.random() * 0.3; world.fx.steam(v.p.x, v.p.y, v.p.z, 2, { size: 9 * fit.kw * fit.s, life: 2.4, spread: 2 }); }
      }
      // rare glint
      const gt = t - glintT;
      if (gt >= 0 && gt < 1.4) {
        glint.visible = true;
        const k2 = gt < 0.25 ? gt / 0.25 : Math.max(0, 1 - (gt - 0.25) / 1.15);
        glint.position.copy(glintPos);
        // smaller and warmer than before: it bloomed into a white star over the whole cleaned block (review 2 F3)
        glint.scale.setScalar((10 + 18 * k2) * Math.max(0.6, fit.s * 0.6));
        glint.material.rotation = gt * 1.2;
        glintMat.color.setRGB(glintGreen ? 1.2 : 2.4, glintGreen ? 2.4 : 1.9, glintGreen ? 1.6 : 1.0).multiplyScalar(k2);
      } else glint.visible = false;
    },
    event(type, p, t) {
      if (type === 'rare' && P && fit) {
        glintGreen = p.item === 'dna';
        if (glintGreen) { const g = bake.glands[0] || headW; glintPos.copy(g).applyMatrix4(holder.matrixWorld); }
        else glintPos.copy(eyeW).applyMatrix4(holder.matrixWorld);
        glintT = t;
        world.fx.sparks(glintPos.x, glintPos.y, glintPos.z, 10, { speed: 8, size: 0.7 });
      }
    },
    // a point on the corpse near the cut front of `sector`'s part, on the side of (x, z)
    liftPoint(sector, x, z, cyc = 0) {
      if (!P || !fit || !mesh.visible) return null;
      const p = partOf(sector);
      if (!p) return null;
      const span = p.u1 - p.u0;
      const u = Math.max(p.u0 + 0.02, p.u1 - span * Math.min(0.95, p.f + 0.06 + 0.06 * (cyc % 3)));
      axisPoint(u, _v);
      const dx = x - _v.x, dz = z - _v.z;
      const lat = dx * fit.lx.x + dz * fit.lx.z;                           // signed lateral distance
      const off = Math.max(-1, Math.min(1, lat / (P.width * 0.5))) * P.width * 0.28;
      const h = Math.max(4, fit.height * (0.75 - 0.35 * Math.abs(off) / (P.width * 0.5)));
      return { x: _v.x + fit.lx.x * off, y: h, z: _v.z + fit.lx.z * off };
    },
    pulled() {},
    anchor(name, out) {
      if (!P || !fit || !mesh.visible) return null;
      if (name === 'head') return out.copy(headW).applyMatrix4(holder.matrixWorld);
      return null;
    },
    visible: () => mesh.visible,
    setQuality(q) { mesh.castShadow = q !== 'low'; },
    dispose() { world.scene.remove(holder); world.scene.remove(glint); world.scene.remove(model.group); bake.geo.dispose(); mat.dispose(); mesh.customDepthMaterial.dispose(); glintMat.map.dispose(); glintMat.dispose(); },
    _debug: { mesh, holder, CU, parts, plateU },
  };
  return api;
}
