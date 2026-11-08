// Scene facade (ARCH 5.1). The 3D view only reads the plain state object (ARCH 5.2) and bus events
// forwarded by main; it never imports game rules or UI. scene-actors plugs in through createActors(world).
import * as THREE from 'three';
import { createEnv } from './env.js';
import { Post } from './post.js';
import { cityUniforms, sharedMaterials, sharedUniforms } from './materials.js';
import { buildCity } from './city.js';
import { planDamage, stageAttributes, buildProps, JobQueue, dressInstances, restoreInstances, chunkProtos } from './damage.js';
import { createRubble } from './rubble.js';
import { createFx, fxUniforms } from './fx.js';
import { createCameraRig, GAME_CAM } from './camera.js';
import { createPicker } from './picking.js';
import { createAnchors } from './anchors.js';
import { createYard } from './yard.js';
import { createTraffic } from './traffic.js';
import { createDistricts } from './districts.js';
import { qualityPreset, dprFor, createFpsMeter } from './quality.js';
import * as layout from './layout.js';
import { capsDist } from './util.js';
import { createActors } from './actors/index.js';

const nextFrame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? setTimeout(r, 0) : r()));
const HIT_T = 2.6, CUT_T = 2.0;

export function createScene(canvas, opts = {}) {
  let quality = opts.quality === 'low' ? 'low' : 'high';
  const onEvent = opts.onEvent || (() => {});
  const reducedMotion = !!opts.reducedMotion;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = qualityPreset(quality).shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setPixelRatio(dprFor(quality));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(GAME_CAM.fov, 1, 3, 5000);
  const env = createEnv(scene);
  const post = new Post(renderer);
  post.setQuality(quality);
  const rig = createCameraRig(camera);
  const size = { w: 1, h: 1 };
  const getSize = () => size;
  const getRect = () => canvas.getBoundingClientRect();
  const picker = createPicker(camera, getRect);
  const shared = sharedMaterials();
  const fogU = { color: { value: scene.fog.color }, density: { value: scene.fog.density } };
  const jobs = new JobQueue();
  const fps = createFpsMeter();

  let city = null, fx = null, rubble = null, yard = null, traffic = null, districts = null, actors = null, anchors = null;
  let ctx = null, intact = [];
  let vt = 0, timeScale = 1, slowUntil = -1, readyFlag = false;
  let attackN = null, placement = null, hitApplied = false, lastPhase = null, lastResult = null, lastAttackT = -99;
  let lastState = null, corpseCleared = false;
  const dmg = Array.from({ length: 6 }, () => ({ plan: null, ready: false, applied: false, touched: [], props: null }));
  const stat = { drawCalls: 0, triangles: 0 };

  function resize() {
    const w = Math.max(1, canvas.clientWidth || canvas.width || 1), h = Math.max(1, canvas.clientHeight || canvas.height || 1);
    size.w = w; size.h = h;
    renderer.setPixelRatio(dprFor(quality));
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio();
    post.setSize(Math.round(w * pr), Math.round(h * pr));
    rig.resize(w, h);
  }

  // ---------------------------------------------------------------- world (actors hook)
  const spotCache = new Map();
  let spotVersion = 0;
  const world = {
    THREE, scene, renderer, camera, layout,
    path: (from, to, out) => layout.findPath(from, to, out),
    pathInfo: layout.pathInfo,
    districtCenter: (id) => ({ x: layout.DISTRICTS[id].cx, z: layout.DISTRICTS[id].cz }),
    districtBounds: (id) => { const D = layout.DISTRICTS[id]; return { x0: D.x0, x1: D.x1, z0: D.z0, z1: D.z1 }; },
    groundY: (x, z) => {
      for (const v of layout.ROADS.v) if (Math.abs(x - v.x) < v.w / 2) return 0;
      for (const h of layout.ROADS.h) if (Math.abs(z - h.z) < h.w / 2) return 0;
      for (const lx of layout.ROADS.laneX) if (Math.abs(x - lx) < layout.ROADS.lane / 2 && z > -162 && z < 162) return 0;
      for (const lz of layout.ROADS.laneZ) if (Math.abs(z - lz) < layout.ROADS.lane / 2 && Math.abs(x) < 118) return 0;
      if (z > layout.YARD.z0 && z < layout.YARD.z1 && x > layout.YARD.x0 && x < layout.YARD.x1) return 0.12;
      return 0.2;
    },
    workSpots: (id, kind) => workSpots(id, kind),
    fireTargets: (id) => (fx ? fx.spots(id).map((s) => ({ x: s.x, y: s.y + 2, z: s.z })) : []),
    corpsePlacement: (attack) => layout.corpsePlacement(attack),
    placement: () => placement,
    chainIds: () => (lastState && lastState.attack ? lastState.attack.chain : []),
    roofHeight: (id) => (city ? city.districts[id].roof : 22),
    fx: null,
    materials: shared,
    cam: { override: (fn) => rig.override(fn), shake: (a) => { if (!reducedMotion) rig.shake(a); }, frame: (t, o) => frame(t, o), band: rig.band, camera, setVisFov: (f) => rig.setVisFov(f), rig },
    timeScale: 1,
    quality,
    yard: { bays: layout.YARD.bays },
  };

  // ---------------------------------------------------------------- work spots (visible road spots)
  const _ray = new THREE.Ray(), _box = new THREE.Box3(), _hit = new THREE.Vector3(), _cp = new THREE.Vector3();
  function occluded(x, z) {
    _cp.copy(rig.cityTarget).addScaledVector(rig.fwd, -rig.cityDist);
    _ray.origin.copy(_cp); _ray.direction.set(x - _cp.x, 2 - _cp.y, z - _cp.z);
    const L = _ray.direction.length(); _ray.direction.multiplyScalar(1 / L);
    let n = 0;
    for (const cd of city.districts) for (const b of cd.buildings) {
      if (Math.abs(b.x - x) > 80 || b.z < z - 5 || b.z > z + 90) continue;
      const st = dmg[cd.did].plan && dmg[cd.did].applied ? dmg[cd.did].plan.tiers.find((t) => t.b === b) : null;
      const H = st ? (st.tier === 'x' ? 0 : st.tier === 'c' ? 5 : b.H) : b.H + 2;
      if (H <= 0) continue;
      _box.min.set(b.x - b.w / 2, 0, b.z - b.d / 2); _box.max.set(b.x + b.w / 2, H, b.z + b.d / 2);
      if (_ray.intersectBox(_box, _hit) && _hit.distanceTo(_ray.origin) < L - 1) n++;
    }
    return n;
  }
  function workSpots(id, kind) {
    const key = id + ':' + kind + ':' + spotVersion;
    if (spotCache.has(key)) return spotCache.get(key);
    const D = layout.DISTRICTS[id];
    const cand = [];
    const xw = D.col === 0 ? layout.XR.W : layout.XR.A, xe = D.col === 0 ? layout.XR.A : layout.XR.E;
    const zn = [layout.ZR.P, layout.ZR.S1, layout.ZR.S2][D.row], zs = [layout.ZR.S1, layout.ZR.S2, layout.ZR.R][D.row];
    for (let z = D.z0 + 8; z <= D.z1 - 8; z += 6) { cand.push({ x: xw + 3, z, yaw: Math.PI }); cand.push({ x: xe - 3, z, yaw: 0 }); if (id !== 4) cand.push({ x: D.cx + 2, z, yaw: Math.PI }); }
    for (let x = D.x0 + 8; x <= D.x1 - 8; x += 6) { cand.push({ x, z: zn + 3, yaw: Math.PI / 2 }); cand.push({ x, z: zs - 3, yaw: -Math.PI / 2 }); if (id !== 4) cand.push({ x, z: D.cz + 2, yaw: Math.PI / 2 }); }
    let targets = [];
    if (kind === 'fire') targets = fx ? fx.spots(id).map((s) => ({ x: s.x, y: s.y + 2, z: s.z })) : [];
    else if (kind === 'rubble') targets = rubble ? rubble.centers(id).map(([x, z]) => ({ x, y: 1, z })) : [];
    else if (kind === 'carve' && placement) {
      const part = placement.parts.find((p) => p.districtId === id);
      if (part) for (let k = 0; k < 4; k++) { const u = part.u0 + (part.u1 - part.u0) * (k + 0.5) / 4; targets.push({ x: placement.nose.x - placement.dir.x * u * placement.length, y: 6, z: placement.nose.z - placement.dir.z * u * placement.length }); }
    }
    if (!targets.length) targets = [{ x: D.cx, y: 4, z: D.cz }];
    const want = kind === 'fire' ? [12, 30] : kind === 'rubble' ? [9, 22] : [0, 0];
    const sp = rubble ? rubble.streetPile(id) : null;
    const caps = placement ? placement.capsules : null;
    const scored = [];
    for (const c of cand) {
      if (caps && capsDist(c.x, c.z, caps) < 7) continue;
      if (sp && Math.hypot(c.x - sp.x, c.z - sp.z) < 11) continue;
      let best = 1e9, aim = targets[0];
      for (const t of targets) {
        let dd = Math.hypot(t.x - c.x, t.z - c.z);
        if (kind === 'carve' && caps) dd = Math.max(0, capsDist(c.x, c.z, caps)) + Math.hypot(t.x - c.x, t.z - c.z) * 0.15;
        if (dd < best) { best = dd; aim = t; }
      }
      let score = kind === 'carve' ? best : (best < want[0] ? (want[0] - best) * 2 : best > want[1] ? best - want[1] : 0);
      score += occluded(c.x, c.z) * 25;
      scored.push({ c, aim, score });
    }
    scored.sort((a, b) => a.score - b.score);
    const out = [];
    for (const s of scored) {
      if (out.length >= 4) break;
      if (out.some((o) => Math.hypot(o.x - s.c.x, o.z - s.c.z) < 18)) continue;
      out.push({ x: s.c.x, z: s.c.z, yaw: Math.atan2(s.aim.x - s.c.x, s.aim.z - s.c.z), aim: { x: s.aim.x, y: s.aim.y, z: s.aim.z } });
    }
    for (const s of scored) { if (out.length >= 3) break; if (!out.some((o) => o.x === s.c.x && o.z === s.c.z)) out.push({ x: s.c.x, z: s.c.z, yaw: Math.atan2(s.aim.x - s.c.x, s.aim.z - s.c.z), aim: { ...s.aim } }); }
    spotCache.set(key, out);
    return out;
  }

  // ---------------------------------------------------------------- damage lifecycle
  function updateGroundCaps() {
    const A = cityUniforms.uSegA.value, Rr = cityUniforms.uSegR.value;
    for (let i = 0; i < 8; i++) { A[i].set(0, 0, 0, 0); Rr[i] = 0; }
    let k = 0;
    const anyChain = placement && placement.parts.some((p) => dmg[p.districtId].applied);
    if (anyChain) for (const c of placement.capsules) { if (k >= 8) break; A[k].set(c.ax, c.az, c.bx, c.bz); Rr[k] = c.r; k++; }
    for (let d = 0; d < 6; d++) {
      const p = dmg[d].plan;
      if (!dmg[d].applied || !p || p.mode === 'soot' || p.caps === (placement && placement.capsules) || k >= 8) continue;
      const c = p.caps[0]; A[k].set(c.ax, c.az, c.bx, c.bz); Rr[k] = Math.max(6, c.r); k++;
    }
    cityUniforms.uDust.value = 0;
    spotVersion++; spotCache.clear();
  }
  function queueDistrict(did, mode, seed) {
    const d = dmg[did];
    if (d.applied) return;
    jobs.cancel('d' + did);
    if (d.props) disposeProps(d.props);
    const plan = planDamage(city.districts[did], placement, seed, mode);
    d.plan = plan; d.ready = false; d.props = null;
    const gen = (function* () { yield* stageAttributes(plan); yield* buildProps(plan, ctx); yield* rubble.build(did, plan, seed); })();
    jobs.add('d' + did, gen, () => { d.ready = true; d.props = plan.props; });
  }
  function disposeProps(p) {
    for (const k of ['facade', 'rubble', 'chunks']) { const m = p[k]; if (!m) continue; scene.remove(m); m.geometry.dispose(); if (k === 'chunks') m.dispose(); }
  }
  function applyDistrict(did, juice) {
    const d = dmg[did];
    if (d.applied || !d.plan) return;
    jobs.finish('d' + did);
    const cd = city.districts[did], geo = cd.mesh.geometry;
    geo.setAttribute('aDmg', new THREE.BufferAttribute(d.plan.aDmg, 4));
    geo.setAttribute('aBite', new THREE.BufferAttribute(d.plan.aBite, 2));
    cd.mesh.material = city.matD;
    d.props = d.plan.props;
    if (d.props) for (const k of ['facade', 'rubble', 'chunks']) if (d.props[k]) scene.add(d.props[k]);
    d.touched = dressInstances(d.plan, city);
    fx.setSpots(did, d.plan.fires);
    districts.setFireOn(did, true);
    rubble.show(did, true);
    districts.setPower(did, true);
    districts.setDust(did, d.plan.mode === 'soot' ? 0.25 : 1, !juice);
    traffic.setDamaged(did, true);
    d.applied = true;
    updateGroundCaps();
  }
  function cleanDistrict(did, juice) {
    const d = dmg[did];
    jobs.cancel('d' + did);
    if (!d.applied && !d.plan) return;
    const cd = city.districts[did], geo = cd.mesh.geometry;
    geo.setAttribute('aDmg', intact[did].dmg); geo.setAttribute('aBite', intact[did].bite);
    cd.mesh.material = city.matI;
    if (d.props) disposeProps(d.props);
    restoreInstances(d.touched); d.touched = [];
    fx.setSpots(did, []);
    districts.setFireOn(did, false);
    rubble.clear(did);
    districts.setDust(did, 0, !juice);
    districts.setPower(did, false);
    traffic.setDamaged(did, false);
    const wasApplied = d.applied;
    d.plan = null; d.applied = false; d.props = null; d.ready = false;
    if (juice && wasApplied) {
      districts.lightsWave(did);
      traffic.carsOut(did, vt);
      const D = layout.DISTRICTS[did];
      for (let k = 0; k < 4; k++) fx.dust(D.cx + (k % 2 ? 30 : -30), 1, D.cz + (k < 2 ? 25 : -25), 4, { size: 6, spread: 8, rise: 2 });
    }
    updateGroundCaps();
  }
  function startAttack(a) {
    attackN = a.n; hitApplied = !!a.hit; corpseCleared = false;
    placement = layout.corpsePlacement(a);
    layout.setBlocked(placement ? placement.capsules : null);
    traffic.setCorpse(placement ? placement.capsules : null);
    spotVersion++; spotCache.clear();
    if (!a.hit) for (const did of a.sectors || a.chain || []) if (!dmg[did].applied) queueDistrict(did, 'hit', a.n || 1);
  }
  function impactJuice(a) {
    if (!placement) return;
    const n = placement.nose, c = { x: placement.x, z: placement.z };
    fx.ring(c.x, c.z, placement.length * 0.35 + 30, 24);
    fx.ring(n.x, n.z, 40, 16);
    for (const did of a.sectors || []) if (!a.chain.includes(did)) { const p = dmg[did].plan; if (p) fx.ring(p.caps[0].ax, p.caps[0].az, 30, 12); }
    if (!reducedMotion) { rig.shake(0.85); fx.flash(c.x, 30, c.z, 90, 0.45); }
    fx.debris([{ x: n.x, z: n.z, dx: placement.dir.x, dz: placement.dir.z }, { x: c.x, z: c.z, dx: -placement.dir.z, dz: placement.dir.x }, { x: c.x, z: c.z, dx: placement.dir.z, dz: -placement.dir.x }]);
  }

  // ---------------------------------------------------------------- state sync
  function lookFor(s) {
    if (s.phase === 'calm') return 'golden';
    if (s.phase === 'attack') return s.attack && (s.attack.hit || s.attack.t >= HIT_T) ? 'blue' : 'dusk';
    return 'work';
  }
  function syncState(s, dt, juice) {
    lastState = s;
    env.setLook(lookFor(s), !juice);
    traffic.setPhase(s.phase);
    const a = s.attack;
    if (a && a.n !== attackN) startAttack(a);
    if (a && s.phase === 'attack') {
      if (lastAttackT < CUT_T && a.t >= CUT_T) onEvent('attack:cut', {});
      lastAttackT = a.t;
    }
    if (a && a.hit && !hitApplied) {
      hitApplied = true;
      for (const did of a.sectors || a.chain) { if (!dmg[did].plan) queueDistrict(did, 'hit', a.n || 1); applyDistrict(did, juice); }
      if (juice) impactJuice(a);
      onEvent('attack:impact', {});
    }
    if (lastPhase === 'attack' && s.phase !== 'attack') onEvent('attack:end', {});
    if (s.result && !lastResult && juice && lastPhase !== null) rig.frame('city', { duration: 1.2 });
    lastResult = s.result; lastPhase = s.phase;
    const secs = s.sectors || [];
    for (let did = 0; did < 6; did++) {
      const sec = secs[did];
      if (!sec) continue;
      const d = dmg[did];
      if (sec.damaged && !d.applied) {
        const inAttack = a && (a.sectors || a.chain || []).includes(did) && (a.hit || s.phase !== 'attack');
        if (s.phase === 'attack' && !(a && a.hit)) continue;
        const mode = inAttack ? 'hit' : 'soot';
        if (!d.plan || d.plan.mode !== mode) queueDistrict(did, mode, (a && a.n) || 1);
        applyDistrict(did, juice);
      } else if (!sec.damaged && d.applied) cleanDistrict(did, juice);
      if (d.applied) {
        const frac = sec.rubbleMax > 0 ? sec.rubble / sec.rubbleMax : 0;
        rubble.setFrac(did, frac, juice);
        rubble.setCones(did, sec.rubbleMax > 0 && sec.rubble > 0, juice);
      }
    }
    // the carcass is gone once every chain district is clean: reopen the roads and the traffic
    if (placement && hitApplied && placement.parts.every((p) => !dmg[p.districtId].applied && !(secs[p.districtId] && secs[p.districtId].damaged))) {
      if (!corpseCleared) { corpseCleared = true; layout.setBlocked(null); traffic.setCorpse(null); spotVersion++; spotCache.clear(); }
    } else if (placement && hitApplied && corpseCleared) { corpseCleared = false; layout.setBlocked(placement.capsules); traffic.setCorpse(placement.capsules); }
    districts.sync(secs, dt, vt, { juice, upkeepOn: !!(s.progress && s.progress.unlocked && s.progress.unlocked.upkeep) });
    if (s.inv) yard.setInventory(s.inv);
    yard.setJobs(s.jobs, s.clock || 0);
  }

  // ---------------------------------------------------------------- per-frame uniforms
  const _c = new THREE.Color(), _v = new THREE.Vector3();
  let shadowKey = '';
  function applyLook() {
    cityUniforms.uNight.value = env.get('night');
    cityUniforms.uLamps.value = env.get('lamps');
    cityUniforms.uDesat.value = env.get('desat');
    cityUniforms.uFire.value = env.get('fireK');
    fxUniforms.uFogDensity.value = scene.fog.density;
    fxUniforms.uFogColor.value.copy(scene.fog.color);
    env.color('sunCol', fxUniforms.uSunCol.value).multiplyScalar(Math.min(1, env.get('sunI') / 5) * 0.9 + 0.1);
    fxUniforms.uSunDir.value.copy(env.sunDir);
    env.color('hemiSky', fxUniforms.uShadowCol.value).multiplyScalar(0.45 * env.get('hemiI'));
    fogU.density.value = scene.fog.density;
    const sm = city.seaMat.uniforms;
    env.color('seaDeep', sm.uDeep.value); env.color('seaShallow', sm.uShallow.value); env.color('seaSkyLo', sm.uSkyLo.value); env.color('seaSkyHi', sm.uSkyHi.value); env.color('glow', sm.uGlow.value);
    sm.uSunPath.value.copy(env.sunDir); sm.uSunPathI.value = env.get('sunPathI');
    const g = post.grade;
    g.uExposure.value = env.get('exposure');
    env.vec3('shadowTint', _v); g.uShadowTint.value.setRGB(_v.x, _v.y, _v.z);
    env.vec3('highTint', _v); g.uHighTint.value.setRGB(_v.x, _v.y, _v.z);
    g.uSat.value = env.get('sat'); g.uAlert.value = env.get('alert'); g.uContrast.value = env.get('contrast');
    g.uBloom.value = post.bloomOn ? env.get('bloom') : 0;
    g.uFlash.value = reducedMotion ? 0 : fx.flashLevel() * 0.12;
    shared.glow.uniforms.uGain.value = 3.5 + env.get('night') * 2.5;
    // shadow frustum follows the view
    const k = Math.round(rig.target.x / 12) + ':' + Math.round(rig.target.z / 12) + ':' + Math.round(rig.dist / 40);
    if (k !== shadowKey) {
      shadowKey = k;
      const half = Math.min(240, rig.dist * 0.36);
      env.fitShadow(rig.target.x, rig.target.z - half * 0.15, half * 0.9, half * 1.25, 40);
    }
  }
  function applyKeep() {
    const K = fxUniforms.uKeep.value;
    const sel = districts.selected();
    if (placement && hitApplied) { K[0].set(placement.nose.x, 8, placement.nose.z, 28); K[2].set(placement.x, 6, placement.z, placement.width * 0.75); }
    else { K[0].set(0, 0, 0, 0); K[2].set(0, 0, 0, 0); }
    if (sel !== null) { const D = layout.DISTRICTS[sel]; K[1].set(D.cx, 8, D.cz, 40); } else K[1].set(0, 0, 0, 0);
    const working = lastState && lastState.phase !== 'calm' && lastState.phase !== 'attack';
    if (sel !== null && working) { const D = layout.DISTRICTS[sel]; cityUniforms.uCutA.value.set(D.cx, 4, D.cz + 16, 30); }
    else cityUniforms.uCutA.value.set(0, 0, 0, 0);
    // facade fire light: the 8 strongest burning spots
    const F = cityUniforms.uFires.value;
    let n = 0;
    for (let d = 0; d < 6 && n < 8; d++) {
      const lv = fxUniforms.uLvl.value[d];
      if (lv <= 0.01) continue;
      const sp = fx.spots(d);
      for (let i = 0; i < sp.length && n < 8; i++) F[n++].set(sp[i].x, sp[i].y + 2, sp[i].z, lv * sp[i].s);
    }
    for (; n < 8; n++) F[n].set(0, 0, 0, 0);
  }

  function setVisualTime(t) {
    vt = t;
    cityUniforms.uTime.value = t;
    sharedUniforms.uTime.value = t;
    fx.setTime(t);
  }
  function renderFrame() {
    if (!readyFlag) return;
    renderer.info.reset();
    post.render(scene, camera);
    stat.drawCalls = renderer.info.render.calls;
    stat.triangles = renderer.info.render.triangles;
  }

  // ---------------------------------------------------------------- build (async)
  const ready = (async () => {
    resize();
    rig.init(size.w, size.h, opts.band || { top: 96, bottom: 260 });
    await nextFrame();
    city = buildCity(scene, { fogU });
    for (const cd of city.districts) {
      intact[cd.did] = { dmg: cd.mesh.geometry.attributes.aDmg, bite: cd.mesh.geometry.attributes.aBite };
      cd.roof = cd.buildings.length ? cd.buildings.reduce((a, b) => a + b.H, 0) / cd.buildings.length : 12;
    }
    await nextFrame();
    fx = createFx(scene, renderer);
    world.fx = { dust: fx.dust, steam: fx.steam, sparks: fx.sparks, embers: fx.embers, debris: fx.debris, flash: fx.flash, ring: fx.ring, water: fx.water };
    const chunkGeo = chunkProtos()[3].clone(); chunkGeo.computeVertexNormals();
    const rubMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, emissive: new THREE.Color(0x15130f) });
    ctx = { matD: city.matD, rubMat, chunkGeo, chunkMat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true, emissive: new THREE.Color(0x15130f) }), particleScale: 1 };
    rubble = createRubble(scene, { fx, quality });
    yard = createYard(scene, { matI: city.matI, fx });
    traffic = createTraffic(scene, { city, vehicleMat: shared.vehicle });
    districts = createDistricts(scene, { fx, rubble, traffic });
    anchors = createAnchors(camera, getSize, world);
    await nextFrame();
    actors = createActors(world);
    world.actors = actors;
    setVisualTime(0);
    applyLook();
    applyQuality(quality, true);
    // compile the damaged facade program up front (no hitch at the first hit)
    const probe = city.districts[0].mesh;
    probe.material = city.matD; renderer.compile(scene, camera); probe.material = city.matI;
    readyFlag = true;
    rig.frame('city', { instant: true });
    rig.update(0, 0);
    renderFrame();
  })();

  function applyQuality(q, force = false) {
    if (q !== 'low') q = 'high';
    if (q === quality && !force) return;
    const prevShadows = renderer.shadowMap.enabled;
    quality = q; world.quality = q;
    const P = qualityPreset(q);
    renderer.shadowMap.enabled = P.shadows;
    env.sun.castShadow = P.shadows;
    post.setQuality(q);
    if (fx) fx.setQuality(q);
    if (traffic) traffic.setQuality(q);
    if (actors && actors.setQuality) actors.setQuality(q);
    if (ctx) ctx.particleScale = P.particles;
    if (prevShadows !== P.shadows) scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    resize();
  }

  function frame(target, o = {}) {
    rig.frame(target, { ...o, chain: lastState && lastState.attack ? lastState.attack.chain : undefined });
  }

  // ---------------------------------------------------------------- facade
  const api = {
    ready,
    world,
    async prime(state) {
      await ready;
      if (!state) return;
      syncState(state, 0, false);
      jobs.finishAll();
      for (let did = 0; did < 6; did++) { const sec = state.sectors && state.sectors[did]; if (sec && sec.damaged && !dmg[did].applied && dmg[did].plan) applyDistrict(did, false); }
      syncState(state, 0, false);
      env.setLook(lookFor(state), true);
      applyLook();
      if (actors) actors.update(state, 0, vt);
      renderFrame();
    },
    update(state, dt, { render = true } = {}) {
      if (!readyFlag) return;
      const realNow = typeof performance !== 'undefined' ? performance.now() : 0;
      fps.tick(realNow, state && state.phase === 'attack');
      if (fps.hint()) onEvent('quality-hint', { fps: Math.round(fps.fps()) });
      if (slowUntil > 0 && vt > slowUntil) { timeScale = 1; slowUntil = -1; }
      world.timeScale = timeScale;
      const vdt = dt * timeScale;
      setVisualTime(vt + vdt);
      if (state) syncState(state, vdt, true);
      jobs.run(4);
      env.update(vdt);
      applyLook();
      applyKeep();
      rubble.update(vdt);
      yard.update(vdt, vt);
      traffic.update(vt);
      fx.update();
      if (actors) actors.update(state, vdt, vt);
      rig.update(dt, vt);
      if (render) renderFrame();
    },
    render() { if (readyFlag) { applyKeep(); rig.update(0, vt); renderFrame(); } },
    event(type, p = {}) {
      if (!readyFlag) return;
      switch (type) {
        case 'attack-start': if (p && p.chain) startAttack({ n: p.n, chain: p.chain, segments: p.segments, sectors: p.sectors, mutant: p.mutant, hit: false }); break;
        case 'spread-warn': if (p && p.to !== undefined && !dmg[p.to].applied) queueDistrict(p.to, 'soot', (attackN || 1)); break;
        case 'spread': {
          if (!p || p.from === undefined) break;
          const sp = fx.spots(p.from); const D = layout.DISTRICTS[p.to];
          const from = sp && sp.length ? { x: sp[0].x, y: sp[0].y + 4, z: sp[0].z } : { x: layout.DISTRICTS[p.from].cx, y: 10, z: layout.DISTRICTS[p.from].cz };
          fx.embers(from, { x: D.cx, y: 6, z: D.cz }, 8);
          break;
        }
        case 'dispatch': if (!p || p.from === 'yard' || p.from === undefined) yard.openGate(2.5, vt); break;
        case 'purchase': yard.openGate(3.5, vt); break;
        case 'return': yard.openGate(5.0, vt); break;
        case 'factory-done': yard.factoryDone(p && p.rid); break;
        case 'rare': timeScale = 0.35; slowUntil = vt + 0.4 * 0.35; break;
        default: break;
      }
      if (actors && actors.event) actors.event(type, p);
    },
    setBand(b) { rig.setBand(b); world.cam.band = rig.band; },
    setQuality(q) { applyQuality(q); },
    quality: () => quality,
    frame,
    zoomTo(stop) { rig.zoomTo(stop); },
    panBy(dx, dy) { rig.panBy(dx, dy); },
    shake(a) { if (!reducedMotion) rig.shake(a); },
    pick(clientX, clientY) { if (!readyFlag) return null; return picker.pick(clientX, clientY, actors); },
    project(anchor, out) { return anchors ? anchors.project(anchor, out) : (out || { x: 0, y: 0, visible: false }); },
    setHighlight(ids, kind = 'select') { if (districts) districts.setHighlight(ids, kind); },
    playAttack(desc) { return actors && actors.previewAttack ? actors.previewAttack(desc) : { t: 0, skip() {}, done: Promise.resolve() }; },
    setTime(t) {
      if (!readyFlag) return;
      setVisualTime(t);
      env.t = 1;
      applyLook(); applyKeep();
      yard.update(0, vt); traffic.update(vt); fx.update();
      if (actors) actors.update(lastState, 0, vt);
      rig.update(0, vt);
      renderFrame();
    },
    time: () => vt,
    stats() {
      const a = actors && actors.stats ? actors.stats() : { vehicles: 0, particles: 0 };
      return {
        drawCalls: stat.drawCalls, triangles: stat.triangles,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs ? renderer.info.programs.length : 0,
        fps: Math.round(fps.fps()), quality, vehicles: a.vehicles || 0, particles: (fx ? fx.count() : 0) + (a.particles || 0),
        jobs: jobs.jobs.length,
      };
    },
    resize,
    dispose() {
      if (actors && actors.dispose) actors.dispose();
      if (fx) fx.dispose();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
      post.dispose();
      renderer.dispose();
    },
    // debugging / tests
    _debug: { scene, camera, rig, env, dmg, jobs,
      projectXYZ(x, y, z) { const v = new THREE.Vector3(x, y, z).project(camera); return { x: (v.x * 0.5 + 0.5) * size.w, y: (1 - (v.y * 0.5 + 0.5)) * size.h }; },
      damageHash() { let h = 0; for (const cd of city.districts) { const a = cd.mesh.geometry.attributes.aDmg.array; for (let i = 0; i < a.length; i += 7) h = (h * 31 + Math.round(a[i] * 100)) | 0; } return h; }, get city() { return city; }, get fx() { return fx; }, get rubble() { return rubble; }, get districts() { return districts; }, layout },
  };
  return api;
}
