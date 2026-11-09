// createScene(canvas, opts): the three.js view of the toy factory.
// A pure view: it reads the game state every frame and plays effects on fx().
// See docs/ARCH.md ("Scene") for the API.
import * as THREE from 'three';
import { CORNERS, MACHINE_OFFSET, TRUCK, STOCK, UI_INSETS, SCREEN } from './layout.js';
import { createCamera } from './camera.js';
import { presetFor, createPerfMonitor } from './quality.js';
import { themeFor, createEnvironment, createTruck, createForklift, createPath, BELT_Y } from './factory.js';
import { createStations, WORKER_SPOT } from './stations.js';
import { createWorkers } from './workers.js';
import { createItems } from './items.js';
import { createFx, CONFETTI } from './fx.js';
import { radialTexture, clamp, rng, TOON, PAL } from './kit.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _box = new THREE.Box3();

const OUTLINE_PX = 2.2;
const EXHAUST = { speed: 0.3, up: 0.8, grav: -0.4, drag: 1.5, life: 0.7, size: 0.75, colors: [0xffffff, 0xeef0ff] };
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

  // lighting lives in the toon shader (kit.js TOON): one warm key direction, no shadow maps.
  // The camera never rotates, so the view-space light direction is set once.
  const SUN_DIR = new THREE.Vector3(-0.42, 1, 0.62);
  TOON.setLight(SUN_DIR, camera);

  // background gradient (a quad attached to the camera)
  const bgGeo = new THREE.PlaneGeometry(1, 1);
  bgGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(12), 3));
  const bg = new THREE.Mesh(bgGeo, new THREE.MeshBasicMaterial({ vertexColors: true, depthWrite: false, depthTest: false }));
  bg.renderOrder = -10;
  bg.frustumCulled = false;
  bg.position.z = -150;
  camera.add(bg);

  // blob shadows (one instanced mesh)
  const shadowMat = new THREE.MeshBasicMaterial({ color: 0x5a2f6e, map: radialTexture(), transparent: true, opacity: 0.26, depthWrite: false });
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
  let env = null, stations = null, workers = null, items = null, truck = null, forklift = null;
  let ids = ['saw', 'assembly', 'paint', 'wrap'];
  let lastState = null;
  let emitSpecs = {};
  const rand = rng(4242);
  const paintColors = [0xffffff];
  const paintOpts = { speed: 0.9, up: -0.6, grav: 0.6, drag: 2.2, life: 0.55, size: 0.55, colors: paintColors };
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
      add(mx - 0.85, 1.3, mz - 0.85); add(mx + 0.85, 0, mz + 0.85); add(mx - 0.85, 0.2, mz + 0.85); add(mx + 0.85, 0.2, mz - 0.85);
      add(cx + 0.6, 0, cz + 0.6);
      const wx = i % 2 ? WORKER_SPOT.z : WORKER_SPOT.x, wz = i % 2 ? WORKER_SPOT.x : WORKER_SPOT.z;
      add(cx + wx + (i % 2 ? 0.3 : -0.3), 1.15, cz + wz + (i % 2 ? -0.3 : 0.3));
      add(cx + wx, 0, cz + wz + 0.3);
      // the UI's level badge above the two top machines must stay below the HUD
      if (i < 2) add(mx, 2.75, mz);
    });
    const [tx, tz] = TRUCK;
    add(tx - 0.75, 1.2, tz - 1.45); add(tx + 0.75, 0, tz + 1.45); add(tx - 0.75, 0.3, tz + 1.45); add(tx + 0.75, 0.3, tz - 1.45);
  }

  const BADGE_PX = 42;
  let fitTop = 0;
  function badgeOver(h, top) {
    let over = -Infinity;
    for (let i = 0; i < 2; i++) {
      stations.anchorPoint(i, _v2);
      _v.copy(_v2).project(camera);
      over = Math.max(over, top + BADGE_PX - ((1 - _v.y) / 2) * h);
    }
    return over;
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
    // the DOM level badges (about BADGE_PX tall above the anchor) of the top two machines
    // must stay below the HUD on every screen height: grow the top inset until they do
    for (let k = 0; k < 4 && stations; k++) {
      const over = badgeOver(h, ins.top);
      if (over <= 0.5) break;
      ins.top += over + 1;
      cam.fit(w, h, ins, framePts, opts.zoom || 1);
    }
    fitTop = ins.top;
    // constant-pixel ink outlines (thinner on small screens)
    const wpp = (camera.right - camera.left) / w;
    TOON.setOutline(OUTLINE_PX * clamp(Math.min(w, h) / 390, 0.8, 1.25), wpp);
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
    if (forklift) { factoryGroup.remove(forklift.group); forklift.dispose(); }
    env = createEnvironment(theme, preset);
    stations = createStations(theme, preset);
    workers = createWorkers(theme, path);
    items = createItems(theme, path, preset);
    truck = createTruck(theme);
    forklift = createForklift(theme);
    forklift.group.visible = preset.decor;
    factoryGroup.add(env.group, stations.group, workers.group, items.group, truck.group, forklift.group);
    factoryGroup.updateMatrixWorld(true);
    emitSpecs = {};
    for (const k of Object.keys(EMIT)) {
      const spec = EMIT[k](theme);
      spec.beat = { ...spec.o, speed: 1.2, up: 1.6 };
      emitSpecs[k] = spec;
    }
    setBackground();
    fx.clear();
    monitor.rest();
    needResize = true;
  }

  // ------------------------------------------------------------ shadows
  let nShadow = 0;
  function put(x, z, r, a = 1) {
    if (nShadow >= 64 || r <= 0.01) return;
    _m.compose(_v.set(x, 0.015 + nShadow * 0.0004, z), _q.identity(), _s.set(r * a, 1, r * a));
    shadows.setMatrixAt(nShadow++, _m);
  }
  function writeShadows() {
    nShadow = 0;
    for (const [x, z, r] of env.shadows) put(x, z, r * 1.6);
    for (let i = 0; i < 4; i++) {
      const st = stations.stations[i];
      stations.center(i, _v2, 0);
      put(_v2.x + 0.15, _v2.z + 0.15, st.open ? 2.7 * st.machine.scale.x : 2.2);
    }
    for (const sp of workers.spots) if (sp.s > 0.01) put(sp.x + 0.05, sp.z + 0.05, 0.8 * sp.s);
    if (forklift.group.visible) { const f = forklift.group.position; put(f.x, f.z, 1.6); }
    const tp = truck.group.position;
    put(tp.x + 0.1, tp.z, 3.2, 1);
    put(tp.x + 0.1, tp.z + 0.9, 2.2, 1);
    shadows.count = nShadow;
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
        const spec = emitSpecs[e.kind];
        if (spec) {
          if (e.onBeat) {
            const b = Math.floor(st.beat * e.onBeat);
            if (b !== st.lastBeat && st.work > 0.5) {
              st.lastBeat = b;
              _v.y = e.y;
              fx.burst(spec.kind, _v, 3, spec.beat);
            }
          } else if (st.work > 0.3) {
            st.emitAcc += dt * e.rate * st.work * (1 + st.boostAmt);
            while (st.emitAcc >= 1) {
              st.emitAcc -= 1;
              _v2.set(corner.x, e.y, corner.z);
              let o = spec.o;
              if (e.kind === 'paint') {
                const col = items.workColor(i, _c);
                paintColors[0] = col ? col.getHex() : theme.toy[(rand() * theme.toy.length) | 0];
                o = paintOpts;
              }
              fx.emit(spec.kind, _v2, o);
            }
          }
        }
      }
      // boost: two sparkle trails swirling around the station + rising sparkles
      if (st.boostAmt > 0.3) {
        st.orbit = (st.orbit || 0) + dt * 7;
        st.boostAcc = (st.boostAcc || 0) + dt * 40 * Math.max(0.5, preset.particles);
        while (st.boostAcc >= 1) {
          st.boostAcc -= 1;
          st.orbitSide = 1 - (st.orbitSide || 0);
          stations.center(i, _v2, 0);
          const cx = _v2.x * 0.55 + corner.x * 0.45, cz = _v2.z * 0.55 + corner.z * 0.45;
          const a = st.orbit + st.orbitSide * Math.PI;
          _v2.set(cx + Math.cos(a) * 1.45, 0.5 + 0.35 * Math.sin(a * 0.5 + st.orbitSide * 2), cz + Math.sin(a) * 1.45);
          fx.emit('sparkle', _v2, { always: true, speed: 0.05, up: 0.35, grav: -0.2, drag: 2, life: 0.45, size: 1.5, spin: 3, colors: [0x2fe0ff, 0xffffff, 0x8ff3ff, 0xfff38a] });
        }
      }
    }
  }

  let exhaustAcc = 0;
  function emitTruck(dt) {
    if (truck.phase !== 'leaving' && truck.phase !== 'arriving') return;
    exhaustAcc += dt * 14;
    while (exhaustAcc >= 1) {
      exhaustAcc -= 1;
      _v2.copy(truck.group.position);
      _v2.x += 0.45; _v2.y = 0.35; _v2.z -= 1.55;
      fx.emit('puff', _v2, EXHAUST);
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
        const lo = lastOpenIndex();
        stations.corner(lo, _v2);
        if (!workers.takeSold(lo, _v2, items)) items.onSold(lo);
        const n = Math.min(4, Math.floor(coinBudget));
        if (n >= 1) {
          coinBudget -= n;
          _v.copy(truck.group.position); _v.y = 1.5; _v.z -= 0.5;
          fx.burst('coin', _v, n, { speed: 1.5, up: 5.6, grav: 11, drag: 0.4, life: 1.05, size: 1.3, spin: 12 });
          fx.burst('sparkle', _v, 3, { speed: 1.6, up: 2.2, grav: 1, life: 0.5, size: 1.2, colors: [0xffe27a, 0xffffff] });
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
        stations.center(i, _v, 1.25);
        _v.x += 0.35; _v.z += 0.35;
        fx.burst('star', _v, big ? 18 : 10, { speed: big ? 3.8 : 3.0, up: big ? 5.2 : 4.2, spread: 1.2, grav: 8, drag: 0.7, life: big ? 1.15 : 0.9, size: big ? 1.45 : 1.2, colors: [PAL.yellow, PAL.goldHi, 0xffffff, PAL.orange] });
        fx.burst('sparkle', _v, big ? 12 : 5, { speed: 2.4, up: 2.8, grav: 2, drag: 1, life: 0.7, size: 1.2, colors: [0xffffff, PAL.goldHi] });
        stations.center(i, _v2, 0.06);
        fx.ring(_v2, big ? PAL.yellow : 0xffffff, big ? 2.3 : 1.8);
        _v2.y = 0.2;
        fx.burst('puff', _v2, big ? 10 : 6, { speed: 2.2, up: 0.5, grav: 0, drag: 2.6, life: 0.6, size: 1.0, spread: 1.3, colors: [0xffffff] });
        if (big) fx.burst('confetti', _v, 30, { speed: 3, up: 5.2, grav: 5, drag: 1.2, life: 1.7, size: 1.25, colors: CONFETTI, spin: 12 });
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
        fx.ring(_v.set(_v.x, 0.06, _v.z), 0xffffff, 1.7);
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
  function update(state, dt = 1 / 60, render = true) {
    if (!stations) setFactory(config);
    dt = clamp(Number(dt) || 0, 0, 0.1);
    // cheap periodic size check (in case a resize event was missed)
    sizeCheckT -= dt;
    if (sizeCheckT <= 0) {
      sizeCheckT = 0.5;
      if ((canvas.clientWidth && canvas.clientWidth !== viewW) || (canvas.clientHeight && canvas.clientHeight !== viewH)) needResize = true;
      // a machine grew or opened (taller anchor): re-check the badge clearance
      else if (stations && badgeOver(viewH, fitTop) > 1) needResize = true;
    }
    if (needResize) resize();
    time += dt;
    lastState = state || lastState;
    coinBudget = Math.min(16, coinBudget + dt * 12);
    stations.update(state, dt);
    truck.update(dt);
    items.update(state, dt, stations, truck);
    workers.update(dt, stations, truck, items, lastOpenIndex());
    if (forklift.group.visible) forklift.update(dt, truck);
    env.update(dt);
    emitWork(dt);
    emitTruck(dt);
    fx.update(dt, camera);
    writeShadows();
    if (render !== false) {
      renderer.render(scene, camera);
      monitor.frame();
    }
  }

  function setQuality(q) {
    const next = presetFor(q);
    if (next === preset) return;
    preset = next;
    if (env) env.setPreset(preset);
    if (forklift) forklift.group.visible = preset.decor;
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
  let ro = null;
  try { window.addEventListener('resize', onWinResize); window.addEventListener('orientationchange', onWinResize); } catch (e) { /* no window */ }
  try { if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(onWinResize); ro.observe(canvas); } } catch (e) { ro = null; }
  let sizeCheckT = 0;

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
    debug: { renderer, scene, camera, get stations() { return stations; }, get items() { return items; }, get truck() { return truck; }, get workers() { return workers; }, get forklift() { return forklift; }, fxSystem: fx, project },
    dispose() {
      try { window.removeEventListener('resize', onWinResize); window.removeEventListener('orientationchange', onWinResize); } catch (e) { /* ignore */ }
      try { if (ro) ro.disconnect(); } catch (e) { /* ignore */ }
      if (env) env.dispose(); if (stations) stations.dispose(); if (workers) workers.dispose(); if (items) items.dispose(); if (truck) truck.dispose(); if (forklift) forklift.dispose();
      fx.dispose();
      if (safeProbe && safeProbe.parentNode) safeProbe.parentNode.removeChild(safeProbe);
      renderer.dispose();
    },
  };
}
