// Gameplay camera rig (W1). One locked camera: 52 deg elevation, 26 deg visible FOV, fixed azimuth
// (0.14 rad), pan + two zoom stops only (Şehir / Bölge = 1.6x). A view offset keeps framed targets inside
// the HUD band (insets top/bottom in CSS px). frame() eases (cubic in-out); shake() adds trauma; override()
// hands the camera to the attack director (actors) and gives it back.
import * as THREE from 'three';
import { DISTRICTS, YARD, MAP } from './layout.js';
import { easeInOut, noise2 } from './util.js';

export const GAME_CAM = { elev: THREE.MathUtils.degToRad(52), azim: 0.14, fov: 26 };
const ZOOM_K = 1.6;
const PAN = { x0: -80, x1: 80, z0: -150, z1: 215 };

export function createCameraRig(camera) {
  const fwd = new THREE.Vector3(-Math.sin(GAME_CAM.azim) * Math.cos(GAME_CAM.elev), -Math.sin(GAME_CAM.elev), -Math.cos(GAME_CAM.azim) * Math.cos(GAME_CAM.elev));
  const rig = {
    camera, band: { top: 96, bottom: 260 }, w: 390, h: 844, visFov: GAME_CAM.fov,
    zoom: 'city', target: new THREE.Vector3(0, 0, 20), dist: 700,
    from: { t: new THREE.Vector3(), d: 0 }, to: { t: new THREE.Vector3(), d: 0 }, anim: null,
    trauma: 0, time: 0, overrideFn: null, cityDist: 700, cityTarget: new THREE.Vector3(0, 0, 20), fwd,
    lastFrame: 'city',
  };
  const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _t = new THREE.Vector3();

  function applyViewOffset() {
    const b = rig.band, H = rig.h, W = rig.w;
    const top = b.top, bottom = H - b.bottom;
    const centre = (top + bottom) / 2;
    const shift = H / 2 - centre;
    const full = H + 2 * Math.abs(shift);
    const bandH = Math.max(40, bottom - top);
    camera.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(rig.visFov / 2)) * full / bandH));
    camera.aspect = W / H;
    camera.setViewOffset(W, full, 0, shift > 0 ? 2 * shift : 0, W, H);
    camera.updateProjectionMatrix();
  }
  function place(target, dist) {
    camera.position.copy(target).addScaledVector(fwd, -dist);
    camera.up.set(0, 1, 0);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }
  // fit points (THREE.Vector3[]) into the band: returns { target, dist }
  function fit(pts, fill = 0.92, maxH = 0.94) {
    const target = new THREE.Vector3();
    for (const p of pts) target.add(p);
    target.multiplyScalar(1 / pts.length);
    let dist = 600;
    const b = rig.band, W = rig.w, H = rig.h;
    const top = b.top, bottom = H - b.bottom, bandH = Math.max(40, bottom - top);
    for (let it = 0; it < 30; it++) {
      place(target, dist);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) {
        _v.copy(p).project(camera);
        const sx = (_v.x * 0.5 + 0.5) * W, sy = (1 - (_v.y * 0.5 + 0.5)) * H;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      const k = Math.max(((x1 - x0) / W) / fill, ((y1 - y0) / bandH) / maxH);
      dist *= Math.pow(k, 0.8);
      const ex = ((x0 + x1) / 2 - W / 2) / W, ey = ((y0 + y1) / 2 - (top + bottom) / 2) / H;
      _r.setFromMatrixColumn(camera.matrixWorld, 0); _u.setFromMatrixColumn(camera.matrixWorld, 1);
      const scale = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      target.addScaledVector(_r, ex * scale * (W / H)).addScaledVector(_u, -ey * scale);
      target.y = 0;
    }
    return { target, dist };
  }
  const boxPts = (x0, x1, z0, z1, h = 0) => [new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 0, z0), new THREE.Vector3(x0, 0, z1), new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x0, h, z0), new THREE.Vector3(x1, h, z0)];
  function boundsFor(target, chainIds) {
    if (target === 'city') return boxPts(MAP.x0 + 2, MAP.x1 - 2, -180, YARD.z1 - 4, 10);
    if (target === 'yard') return boxPts(YARD.x0 - 8, YARD.x1 + 8, YARD.z0 - 10, YARD.z1 + 4, 6);
    if (target === 'chain' && chainIds && chainIds.length) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const id of chainIds) { const D = DISTRICTS[id]; x0 = Math.min(x0, D.x0); x1 = Math.max(x1, D.x1); z0 = Math.min(z0, D.z0); z1 = Math.max(z1, D.z1); }
      return boxPts(x0 - 6, x1 + 6, z0 - 6, z1 + 6, 20);
    }
    const m = /^district:(\d)(\+yard)?$/.exec(target || '');
    if (m) {
      const D = DISTRICTS[+m[1]];
      if (m[2]) return boxPts(Math.min(D.x0, YARD.x0) - 4, Math.max(D.x1, YARD.x1) + 4, D.z0 - 6, YARD.z1, 20);
      return boxPts(D.x0 - 8, D.x1 + 8, D.z0 - 8, D.z1 + 8, 22);
    }
    return boxPts(MAP.x0, MAP.x1, -180, YARD.z1, 10);
  }
  function computeCity() {
    applyViewOffset();
    const r = fit(boundsFor('city'), 0.99, 0.97);
    rig.cityDist = r.dist; rig.cityTarget.copy(r.target);
  }
  const clampPan = (t) => { t.x = Math.max(PAN.x0, Math.min(PAN.x1, t.x)); t.z = Math.max(PAN.z0, Math.min(PAN.z1, t.z)); return t; };

  rig.setBand = (band) => { rig.band = { top: band.top ?? rig.band.top, bottom: band.bottom ?? rig.band.bottom }; computeCity(); if (rig.lastFrame) rig.frame(rig.lastFrame, { zoom: rig.zoom, instant: true, chain: rig.lastChain }); };
  rig.resize = (w, h) => { rig.w = w; rig.h = h; computeCity(); if (rig.lastFrame) rig.frame(rig.lastFrame, { zoom: rig.zoom, instant: true, chain: rig.lastChain }); };
  rig.frame = (target, { zoom, duration = 0.7, instant = false, chain } = {}) => {
    applyViewOffset();
    rig.lastFrame = target; rig.lastChain = chain;
    let T, d;
    const z = zoom ?? (target === 'city' ? 'city' : rig.zoom);
    if (target === 'city') { T = rig.cityTarget.clone(); d = rig.cityDist; }
    else {
      const r = fit(boundsFor(target, chain), 0.94, 0.94);
      T = r.target; d = Math.min(r.dist, rig.cityDist);
      if (z === 'district' && /^district:\d$/.test(target)) d = rig.cityDist / ZOOM_K;
    }
    rig.zoom = target === 'city' ? 'city' : z;
    if (rig.zoom === 'district') clampPan(T);
    place(rig.target, rig.dist);   // restore the live pose after fitting
    if (instant) { rig.target.copy(T); rig.dist = d; rig.anim = null; return; }
    rig.from.t.copy(rig.target); rig.from.d = rig.dist;
    rig.to.t.copy(T); rig.to.d = d;
    rig.anim = { t: 0, dur: Math.max(0.05, duration) };
  };
  rig.zoomTo = (stop) => {
    if (stop === 'city') return rig.frame('city', { zoom: 'city' });
    applyViewOffset();
    rig.from.t.copy(rig.target); rig.from.d = rig.dist;
    rig.to.t.copy(clampPan(_t.copy(rig.target))); rig.to.d = rig.cityDist / ZOOM_K;
    rig.zoom = 'district'; rig.lastFrame = null;
    rig.anim = { t: 0, dur: 0.6 };
  };
  rig.panBy = (dx, dy) => {
    if (rig.zoom !== 'district') return;
    const mPerPx = 2 * rig.dist * Math.tan(THREE.MathUtils.degToRad(rig.visFov / 2)) / Math.max(40, rig.h - rig.band.top - rig.band.bottom);
    _r.set(Math.cos(GAME_CAM.azim), 0, -Math.sin(GAME_CAM.azim));
    _u.set(-Math.sin(GAME_CAM.azim), 0, -Math.cos(GAME_CAM.azim));
    rig.anim = null; rig.lastFrame = null;
    rig.target.addScaledVector(_r, -dx * mPerPx).addScaledVector(_u, dy * mPerPx / Math.sin(GAME_CAM.elev));
    clampPan(rig.target);
  };
  rig.shake = (a) => { rig.trauma = Math.min(1, rig.trauma + a); };
  rig.override = (fn) => { rig.overrideFn = fn || null; if (!fn) { rig.visFov = GAME_CAM.fov; applyViewOffset(); } };
  rig.setVisFov = (f) => { rig.visFov = f; applyViewOffset(); };
  rig.update = (dt, t) => {
    rig.time = t;
    if (rig.anim) {
      rig.anim.t += dt;
      const k = easeInOut(Math.min(1, rig.anim.t / rig.anim.dur));
      rig.target.lerpVectors(rig.from.t, rig.to.t, k);
      rig.dist = rig.from.d + (rig.to.d - rig.from.d) * k;
      if (rig.anim.t >= rig.anim.dur) rig.anim = null;
    }
    if (rig.overrideFn) { rig.overrideFn(camera, t, rig); camera.updateMatrixWorld(); }
    else { applyViewOffsetIfNeeded(); place(rig.target, rig.dist); }
    if (rig.trauma > 0) {
      const s = rig.trauma * rig.trauma;
      const amp = (rig.overrideFn ? 40 : rig.dist) * 0.012 * s;
      _r.setFromMatrixColumn(camera.matrixWorld, 0); _u.setFromMatrixColumn(camera.matrixWorld, 1);
      camera.position.addScaledVector(_r, (noise2(t * 17, 1.3) - 0.5) * 2 * amp).addScaledVector(_u, (noise2(t * 17, 7.9) - 0.5) * 2 * amp);
      camera.updateMatrixWorld();
      rig.trauma = Math.max(0, rig.trauma - dt * 1.4);
    }
  };
  let lastFov = -1;
  function applyViewOffsetIfNeeded() { if (lastFov !== rig.visFov) { lastFov = rig.visFov; applyViewOffset(); } }
  rig.isAnimating = () => !!rig.anim;
  rig.metresPerPx = () => 2 * rig.dist * Math.tan(THREE.MathUtils.degToRad(rig.visFov / 2)) / Math.max(40, rig.h - rig.band.top - rig.band.bottom);
  rig.init = (w, h, band) => { rig.w = w; rig.h = h; if (band) rig.band = { ...band }; computeCity(); rig.target.copy(rig.cityTarget); rig.dist = rig.cityDist; place(rig.target, rig.dist); };
  return rig;
}
