// createScene(canvas, opts): the three.js view of the toy factory.
// A pure view: it reads the game state every frame and plays effects on fx().
// See docs/ARCH.md ("Scene") for the API.
import * as THREE from 'three';
import { CORNERS, MACHINE_OFFSET, TRUCK, STOCK, UI_INSETS, SCREEN } from './layout.js';
import { createCamera } from './camera.js';
import { presetFor, createPerfMonitor } from './quality.js';
import { themeFor, createEnvironment, createTruck, createPath, BELT_Y } from './factory.js';
import { createStations, WORKER_SPOT } from './stations.js';
import { createWorkers } from './workers.js';
import { createItems } from './items.js';
import { createFx, CONFETTI } from './fx.js';
import { radialTexture, clamp, shade } from './kit.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _box = new THREE.Box3();

const EMIT = {
  chip: (th) => ({ kind: 'chip', o: { speed: 1.7, up: 2.4, grav: 8, life: 0.75, size: 1, colors: [th.wood, th.woodDark, 0xf6d29a] } }),
  paint: () => ({ kind: 'puff', o: { speed: 0.9, up: -0.6, grav: 0.6, drag: 2.2, life: 0.55, size: 0.55 } }),
  scrap: (th) => ({ kind: 'confetti', o: { speed: 1.3, up: 2, grav: 4, drag: 1.5, life: 0.8, size: 0.7, colors: [th.fabric || 0xd9a066, th.fabricPink || 0xff9fc2, 0xffffff] } }),
  cotton: () => ({ kind: 'puff', o: { speed: 0.8, up: -0.4, grav: 0.5, drag: 2, life: 0.7, size: 0.7, colors: [0xffffff, 0xfff6fb] } }),
  thread: (th) => ({ kind: 'sparkle', o: { speed: 0.9, up: 1.4, grav: 2, drag: 1, life: 0.5, size: 0.6, colors: [th.ribbon, 0xffffff, th.machineColor[3]] } }),
  spark: () => ({ kind: 'sparkle', o: { speed: 1.4, up: 1.8, grav: 4, drag: 1, life: 0.4, size: 0.7, colors: [0xffe14d, 0xffffff, 0xffb02e] } }),
};

export function createScene(canvas, opts = {}) {
  let preset = presetFor(opts.quality);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: preset.antialias,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
  });
  renderer.setClearColor(0xbfeaff, 1);
  renderer.info.autoReset = true;

  const scene = new THREE.Scene();
  const cam = createCamera();
  const camera = cam.camera;
  scene.add(camera);

  // lights: hemisphere fill + one warm directional sun (no shadow maps)
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd9c8ff, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff6e6, 2.25);
  sun.position.set(-3.5, 10, 7.5);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  // background gradient (a quad attached to the camera)
  const bgGeo = new THREE.PlaneGeometry(1, 1);
  bgGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  const bg = new THREE.Mesh(bgGeo, new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false, depthTest: false }));
  bg.renderOrder = -10;
  bg.frustumCulled = false;
  bg.position.z = -150;
  camera.add(bg);

  // blob shadows (one instanced mesh)
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x4a3a78, map: radialTexture(), transparent: true, opacity: 0.2, depthWrite: false });
  const shadows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shadowMat, 64);
  shadows.name = 'blob-shadows';
  shadows.renderOrder = 1;
  shadows.frustumCulled = false;
  scene.add(shadows);

  const fx = createFx(preset);
  scene.add(fx.group);
  const path = createPath();

  const factoryGroup = new THREE.Group();
  factoryGroup.name = 'factory';
  scene.add(factoryGroup);

  let config = null, theme = themeFor(null);
  let env = null, stations = null, workers = null, items = null, truck = null;
  let ids = ['saw', 'assembly', 'paint', 'wrap'];
  let lastState = null;
  let time = 0;
  let autoQuality = opts.autoQuality !== false;
  let autoLowered = false;
  const cycleT = new Float32Array(4);
  let coinBudget = 20;
  const insetOverride = {};
  let needResize = true;
  let viewW = 1, viewH = 1, rectL = 0, rectT = 0;
  const monitor = createPerfMonitor();
  monitor.onSlow = () => {
    if (autoQuality && preset.name === 'high') {
      autoLowered = true;
      setQuality('low');
      if (typeof opts.onAutoQuality === 'function') opts.onAutoQuality('low');
    }
  };

  // ------------------------------------------------------------ helpers
  function indexOf(id) {
    if (typeof id === 'number') return id >= 0 && id < 4 ? id : -1;
    const i = ids.indexOf(id);
    if (i >= 0) return i;
    const n = Number(id);
    return Number.isInteger(n) && n >= 0 && n < 4 ? n : -1;
  }
  function lastOpenIndex() {
    const ss = lastState && lastState.factory && lastState.factory.stations;
    let last = 1;
    if (ss) { last = 0; for (let i = 0; i < ss.length && i < 4; i++) if (ss[i] && ss[i].open) last = i; }
    return last;
  }

  let safeProbe = null;
  function safeInsets() {
    try {
      if (!safeProbe) {
        safeProbe = document.createElement('div');
        safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
          'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right);';
        document.body.appendChild(safeProbe);
      }
      const cs = getComputedStyle(safeProbe);
      return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0, right: parseFloat(cs.paddingRight) || 0 };
    } catch (e) { return { top: 0, bottom: 0, left: 0, right: 0 }; }
  }

  // points that must stay visible (machines up to mid height, corners, workers, truck)
  const framePts = [];
  {
    const add = (x, y, z) => framePts.push(new THREE.Vector3(x, y, z));
    CORNERS.forEach(([cx, cz], i) => {
      const mx = cx - MACHINE_OFFSET, mz = cz - MACHINE_OFFSET;
      add(mx - 0.85, 1.55, mz - 0.85); add(mx + 0.85, 0, mz + 0.85); add(mx - 0.85, 0.2, mz + 0.85); add(mx + 0.85, 0.2, mz - 0.85);
      add(cx + 0.6, 0, cz + 0.6);
      const wx = i % 2 ? WORKER_SPOT.z : WORKER_SPOT.x, wz = i % 2 ? WORKER_SPOT.x : WORKER_SPOT.z;
      add(cx + wx + (i % 2 ? 0.3 : -0.3), 1.15, cz + wz + (i % 2 ? -0.3 : 0.3));
      add(cx + wx, 0, cz + wz + 0.3);
    });
    const [tx, tz] = TRUCK;
    add(tx - 0.75, 1.2, tz - 1.45); add(tx + 0.75, 0, tz + 1.45); add(tx - 0.75, 0.3, tz + 1.45); add(tx + 0.75, 0.3, tz - 1.45);
    add(STOCK[0], 1.0, STOCK[1] + 0.5);
  }

  function resize() {
    needResize = false;
    const w = canvas.clientWidth || window.innerWidth || 390;
    const h = canvas.clientHeight || window.innerHeight || 844;
    viewW = w; viewH = h;
    try { const r = canvas.getBoundingClientRect(); rectL = r.left; rectT = r.top; } catch (e) { rectL = rectT = 0; }
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    renderer.setPixelRatio(Math.min(dpr, preset.maxDpr));
    renderer.setSize(w, h, false);
    const safe = safeInsets();
    const ins = {
      top: (insetOverride.top ?? UI_INSETS.top) + safe.top,
      bottom: (insetOverride.bottom ?? UI_INSETS.bottom) + safe.bottom,
      left: (insetOverride.left ?? UI_INSETS.left) + safe.left + 6,
      right: (insetOverride.right ?? UI_INSETS.right) + safe.right + 6,
    };
    // on wide screens keep the factory a phone-like size in the middle
    cam.fit(w, h, ins, framePts, opts.zoom || 1);
    // background quad covers the frustum
    bg.scale.set((camera.right - camera.left) * 1.02, (camera.top - camera.bottom) * 1.02, 1);
    bg.position.set((camera.left + camera.right) / 2, (camera.top + camera.bottom) / 2, -150);
    monitor.rest(1);
  }

  function setBackground() {
    const top = new THREE.Color(theme.skyTop), bot = new THREE.Color(theme.skyBottom);
    const c = bgGeo.attributes.color;
    // PlaneGeometry vertex order: top-left, top-right, bottom-left, bottom-right
    c.setXYZ(0, top.r, top.g, top.b); c.setXYZ(1, top.r, top.g, top.b);
    c.setXYZ(2, bot.r, bot.g, bot.b); c.setXYZ(3, bot.r, bot.g, bot.b);
    c.needsUpdate = true;
    renderer.setClearColor(theme.skyBottom, 1);
    hemi.groundColor.set(theme.key === 'teddy' ? 0xffd6ec : 0xd9c8ff);
  }

  // ------------------------------------------------------------ factory
  function setFactory(cfg) {
    config = cfg || null;
    theme = themeFor(cfg);
    ids = cfg && Array.isArray(cfg.stations) ? cfg.stations.map((s, i) => (s && s.id) || String(i)) : ids;
    if (env) { factoryGroup.remove(env.group); env.dispose(); }
    if (stations) { factoryGroup.remove(stations.group); stations.dispose(); }
    if (workers) { factoryGroup.remove(workers.group); workers.dispose(); }
    if (items) { factoryGroup.remove(items.group); items.dispose(); }
    if (truck) { factoryGroup.remove(truck.group); truck.dispose(); }
    env = createEnvironment(theme, preset);
    stations = createStations(theme, preset);
    workers = createWorkers(theme);
    items = createItems(theme, path, preset);
    truck = createTruck(theme);
    factoryGroup.add(env.group, stations.group, workers.group, items.group, truck.group);
    factoryGroup.updateMatrixWorld(true);
    setBackground();
    fx.clear();
    monitor.rest();
    needResize = true;
  }

  // ------------------------------------------------------------ shadows
  function writeShadows() {
    let n = 0;
    const put = (x, z, r, a = 1) => {
      if (n >= 64 || r <= 0.01) return;
      _m.compose(_v.set(x, 0.015 + n * 0.0004, z), _q.identity(), _s.set(r * a, 1, r * a));
      shadows.setMatrixAt(n++, _m);
    };
    for (const [x, z, r] of env.shadows) put(x, z, r * 1.6);
    for (let i = 0; i < 4; i++) {
      const st = stations.stations[i];
      stations.center(i, _v2, 0);
      put(_v2.x + 0.15, _v2.z + 0.15, st.open ? 2.7 * st.machine.scale.x : 2.2);
      const sp = workers.spots[i];
      if (sp.s > 0.01) put(sp.x + 0.05, sp.z + 0.05, 0.75 * sp.s);
    }
    const tp = truck.group.position;
    put(tp.x + 0.1, tp.z, 3.2, 1);
    put(tp.x + 0.1, tp.z + 0.9, 2.2, 1);
    shadows.count = n;
    shadows.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ effects
  function emitWork(dt) {
    for (let i = 0; i < 4; i++) {
      const st = stations.stations[i];
      if (!st.open || !st.built) continue;
      const e = st.built.emit;
      const corner = stations.corner(i, _v);
      if (e) {
        const spec = EMIT[e.kind] && EMIT[e.kind](theme);
        if (spec) {
          if (e.onBeat) {
            const b = Math.floor(st.beat * e.onBeat);
            if (b !== st.lastBeat && st.work > 0.5) {
              st.lastBeat = b;
              _v.y = e.y;
              fx.burst(spec.kind, _v, 3, { ...spec.o, speed: 1.2, up: 1.6 });
            }
          } else if (st.work > 0.3) {
            st.emitAcc += dt * e.rate * st.work * (1 + st.boostAmt);
            while (st.emitAcc >= 1) {
              st.emitAcc -= 1;
              _v2.set(corner.x, e.y, corner.z);
              let o = spec.o;
              if (e.kind === 'paint') {
                const col = items.workColor(i, _c);
                o = { ...o, colors: [col ? col.getHex() : theme.toy[(Math.random() * theme.toy.length) | 0]] };
              }
              fx.emit(spec.kind, _v2, o);
            }
          }
        }
      }
      // boost sparkles
      if (st.boostAmt > 0.3) {
        st.boostAcc = (st.boostAcc || 0) + dt * 12 * preset.particles;
        while (st.boostAcc >= 1) {
          st.boostAcc -= 1;
          stations.center(i, _v2, 0.3 + Math.random() * 1.6);
          const a = Math.random() * Math.PI * 2, r = 0.7 + Math.random() * 0.7;
          _v2.x += Math.cos(a) * r + 0.5; _v2.z += Math.sin(a) * r + 0.5;
          fx.emit('sparkle', _v2, { speed: 0.2, up: 1.2, grav: -0.6, drag: 1, life: 0.7, size: 0.85, colors: [0x7ff3ff, 0xffffff, 0xfff38a] });
        }
      }
    }
  }

  function fxEvent(event, p = {}) {
    if (!stations) return;
    switch (event) {
      case 'pass': {
        const f = indexOf(p.from), t = indexOf(p.to);
        if (f >= 0) items.onPass(f, t);
        break;
      }
      case 'sold': {
        items.onSold(lastOpenIndex());
        const n = Math.min(5, Math.floor(coinBudget));
        if (n >= 1) {
          coinBudget -= n;
          _v.copy(truck.group.position); _v.y = 1.5; _v.z -= 0.5;
          fx.burst('coin', _v, n, { speed: 1.4, up: 5.2, grav: 11, drag: 0.4, life: 1.0, size: 1.15, spin: 12 });
          fx.burst('sparkle', _v, 2, { speed: 1.5, up: 2, grav: 1, life: 0.5, colors: [0xfff38a, 0xffffff] });
        }
        break;
      }
      case 'cycle': {
        const i = indexOf(p.station);
        if (i < 0) break;
        stations.cyclePop(i);
        if (time - cycleT[i] > 0.35) {
          cycleT[i] = time;
          stations.corner(i, _v); _v.y = 0.55;
          fx.burst('puff', _v, 2, { speed: 0.8, up: 0.6, grav: 0, drag: 2, life: 0.45, size: 0.6, colors: [0xffffff] });
        }
        break;
      }
      case 'upgrade': {
        const i = indexOf(p.station);
        if (i < 0) break;
        const big = !!p.milestone;
        stations.pop(i, big ? 2 : 1);
        stations.anchorPoint(i, _v); _v.y -= 0.4;
        fx.burst('star', _v, big ? 16 : 7, { speed: big ? 3.4 : 2.4, up: big ? 5 : 3.6, grav: 7, drag: 0.8, life: big ? 1.1 : 0.8, size: big ? 1.3 : 1, colors: [0xffd23c, 0xffe98a, 0xffffff, 0xffb02e] });
        if (big) {
          stations.center(i, _v2, 0.05);
          fx.ring(_v2, 0xffd23c, 2.6);
          fx.burst('confetti', _v, 26, { speed: 3, up: 5, grav: 5, drag: 1.2, life: 1.6, size: 1.2, colors: CONFETTI, spin: 12 });
        }
        break;
      }
      case 'open': {
        const i = indexOf(p.station);
        if (i < 0) break;
        stations.center(i, _v, 0.2);
        fx.burst('puff', _v, 12, { speed: 2.4, up: 1.2, grav: 0, drag: 2.4, life: 0.8, size: 1.3, spread: 1.4, colors: [0xffffff, 0xf3eefc] });
        _v.y = 1.6;
        fx.burst('star', _v, 10, { speed: 3, up: 4, grav: 7, drag: 0.8, life: 1, colors: [0xffd23c, 0xffffff, 0xff8ad8] });
        fx.burst('confetti', _v, 22, { speed: 2.6, up: 4.5, grav: 5, drag: 1.2, life: 1.5, size: 1.2, colors: CONFETTI, spin: 12 });
        fx.ring(_v.set(_v.x, 0.05, _v.z), 0xffffff, 2.4);
        break;
      }
      case 'boost': {
        const i = indexOf(p.station);
        if (i < 0) break;
        stations.center(i, _v, 1.2);
        _v.x += 0.5; _v.z += 0.5;
        fx.burst('sparkle', _v, 8, { speed: 2.2, up: 2.6, grav: 3, drag: 1, life: 0.6, size: 1.1, colors: [0x7ff3ff, 0xffffff, 0xfff38a] });
        stations.cyclePop(i);
        break;
      }
      case 'goal':
      case 'claim': {
        viewCenter(_v);
        fx.rain(_v, event === 'goal' ? 40 : 18, 3.2);
        break;
      }
      case 'factoryComplete': {
        viewCenter(_v);
        fx.rain(_v, 120, 4.5);
        for (let i = 0; i < 4; i++) { stations.anchorPoint(i, _v2); fx.burst('star', _v2, 8, { speed: 3, up: 4, grav: 6, life: 1.2, colors: [0xffd23c, 0xffffff] }); }
        break;
      }
      case 'factoryStart': {
        for (const st of stations.stations) if (st.open) st.openT = 0;
        viewCenter(_v);
        fx.rain(_v, 50, 4);
        break;
      }
      case 'setting':
        if (p.key === 'quality') setQuality(p.value);
        break;
      default:
        break;
    }
  }

  function viewCenter(out) {
    // a point on the floor in the middle of the factory, raised so confetti falls through the view
    out.set((CORNERS[1][0] + CORNERS[2][0]) / 2 + 0.6, 3.2, (CORNERS[1][1] + CORNERS[2][1]) / 2 + 0.6);
    return out;
  }

  // ------------------------------------------------------------ public api
  function update(state, dt = 1 / 60) {
    if (!stations) setFactory(config);
    if (needResize) resize();
    dt = clamp(Number(dt) || 0, 0, 0.1);
    time += dt;
    lastState = state || lastState;
    coinBudget = Math.min(20, coinBudget + dt * 18);
    stations.update(state, dt);
    workers.update(dt, stations);
    truck.update(dt);
    items.update(state, dt, stations, truck);
    env.update(dt);
    emitWork(dt);
    fx.update(dt, camera);
    writeShadows();
    renderer.render(scene, camera);
    monitor.frame();
  }

  function setQuality(q) {
    const next = presetFor(q);
    if (next === preset) return;
    preset = next;
    if (env) env.setPreset(preset);
    fx.setPreset(preset);
    needResize = true;
    resize();
  }

  function project(world) {
    _v.copy(world).project(camera);
    const x = rectL + ((_v.x + 1) / 2) * viewW;
    const y = rectT + ((1 - _v.y) / 2) * viewH;
    return { x, y, visible: _v.z > -1 && _v.z < 1 && x >= rectL && x <= rectL + viewW && y >= rectT && y <= rectT + viewH };
  }

  function anchor(id) {
    if (needResize) resize();
    if (id === 'coins') return { x: rectL + SCREEN.coins.x * viewW, y: rectT + SCREEN.coins.y * viewH, visible: true };
    if (!stations) return { x: 0, y: 0, visible: false };
    if (id === 'truck') {
      _v2.copy(truck.group.position); _v2.y += 2.0; _v2.z -= 0.3;
      return project(_v2);
    }
    const i = indexOf(id);
    if (i < 0) return { x: 0, y: 0, visible: false };
    stations.anchorPoint(i, _v2);
    return project(_v2);
  }

  function pick(clientX, clientY) {
    if (!stations) return null;
    if (needResize) resize();
    _ndc.set(((clientX - rectL) / viewW) * 2 - 1, -((clientY - rectT) / viewH) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    let best = null, bestD = Infinity;
    for (let i = 0; i < 4; i++) {
      const hit = _ray.ray.intersectBox(stations.pickBox(i), _v);
      if (hit) {
        const d = hit.distanceTo(_ray.ray.origin);
        if (d < bestD) { bestD = d; best = { type: 'station', id: ids[i] }; }
      }
    }
    const tp = truck.group.position;
    _box.min.set(tp.x - 1.0, 0, tp.z - 1.7);
    _box.max.set(tp.x + 1.0, 2.2, tp.z + 1.7);
    const th = _ray.ray.intersectBox(_box, _v);
    if (th) { const d = th.distanceTo(_ray.ray.origin); if (d < bestD) { bestD = d; best = { type: 'truck' }; } }
    if (best && best.type === 'truck') truck.poke();
    return best;
  }

  function onWinResize() { needResize = true; }
  try { window.addEventListener('resize', onWinResize); window.addEventListener('orientationchange', onWinResize); } catch (e) { /* no window */ }

  setFactory(opts.factory || null);

  return {
    setFactory,
    update,
    fx: fxEvent,
    pick,
    anchor,
    setQuality,
    stats() {
      const info = renderer.info.render;
      return { fps: monitor.fps, frameMs: Math.round(monitor.avgMs * 10) / 10, calls: info.calls, tris: info.triangles, quality: preset.name, autoLowered, particles: fx.count() };
    },
    resize() { needResize = true; resize(); },
    /** extension: override the UI insets (CSS px, safe areas are added on top) */
    setInsets(ins = {}) { Object.assign(insetOverride, ins); needResize = true; },
    /** extension: enable / disable the automatic drop to Low quality */
    setAutoQuality(on) { autoQuality = !!on; monitor.enabled = !!on; },
    /** extension: internals for the scene lab and tests */
    debug: { renderer, scene, camera, get stations() { return stations; }, get items() { return items; }, get truck() { return truck; }, fxSystem: fx, project },
    dispose() {
      try { window.removeEventListener('resize', onWinResize); window.removeEventListener('orientationchange', onWinResize); } catch (e) { /* ignore */ }
      if (env) env.dispose(); if (stations) stations.dispose(); if (workers) workers.dispose(); if (items) items.dispose(); if (truck) truck.dispose();
      fx.dispose();
      if (safeProbe && safeProbe.parentNode) safeProbe.parentNode.removeChild(safeProbe);
      renderer.dispose();
    },
  };
}
