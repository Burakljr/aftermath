// createScene(canvas, opts) -> Promise<scene API>: the three.js view of the diner.
// A pure view: it reads the game state every frame and plays effects on fx().
// See docs/ARCH.md ("Scene") for the API.
import * as THREE from 'three';
import { getLayout } from '../game/layout.js';
import { loadModels } from './assets.js';
import { createKit, clamp } from './kit.js';
import { createCamera } from './camera.js';
import { buildRoom, themeFor } from './room.js';
import { createStations } from './stations.js';
import { createTables } from './tables.js';
import { createHeroLib, HERO_MODELS } from './heroes.js';
import { createCrowd, makeCarryClips } from './crowd.js';
import { createDishes, createBlobs } from './dishes.js';
import { createFx } from './fx.js';
import { presetFor, createPerfMonitor } from './quality.js';
import { UI_INSETS, SCREEN } from './layout.js';

const MODELS = ['props', 'anims', ...HERO_MODELS];
const _v = new THREE.Vector3();
const _box = { x0: 0, y0: 0, x1: 0, y1: 0 };

export async function createScene(canvas, opts = {}) {
  let preset = presetFor(opts.quality);
  let autoQuality = opts.autoQuality !== false;
  let autoLowered = false;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: opts.antialias !== undefined ? !!opts.antialias : true,
    alpha: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: !!opts.preserveDrawingBuffer,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.info.autoReset = false;

  const scene = new THREE.Scene();
  const cam = createCamera({ elevation: opts.elevation ?? 40, yaw: opts.yaw ?? 0 });
  const camera = cam.camera;
  scene.add(camera);

  // warm, bright light: sky/ground hemisphere + one sun from the upper left front
  const hemi = new THREE.HemisphereLight(0xfff4e2, 0x8a6a52, 1.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
  sun.position.set(-5, 12, 7);
  scene.add(sun, sun.target);

  const models = await loadModels(MODELS, opts.onProgress);
  const kit = createKit(models.props);
  const heroLib = createHeroLib(models, models.anims);
  makeCarryClips(heroLib.clips, heroLib.templates.barbarian && heroLib.templates.barbarian.scene);
  heroLib.warm();

  const world = new THREE.Group();
  scene.add(world);
  const dynamic = new THREE.Group();
  scene.add(dynamic);
  const blobs = createBlobs(64);
  scene.add(blobs.mesh);
  const dishes = createDishes(kit);
  scene.add(dishes.group);
  const crowd = createCrowd({ heroes: heroLib, dishes, blobs, group: dynamic });
  const fx = createFx(preset);
  scene.add(fx.group);

  let locId = null;
  let room = null, stations = null, tables = null;
  let layout = null;
  let lastState = null;

  const view = { width: 1, height: 1, dpr: 1 };
  const insets = Object.assign({}, UI_INSETS);
  const safe = { top: 0, bottom: 0, left: 0, right: 0 };
  let pxPerUnit = 30;

  function disposeLocation() {
    if (room) { world.remove(room.group); room.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
    if (stations) { world.remove(stations.group); stations.dispose(); }
    if (tables) { world.remove(tables.group); tables.dispose(); }
    room = stations = tables = null;
  }

  function setLocation(id) {
    const L = getLayout(id);
    disposeLocation();
    layout = L;
    locId = L.id;
    room = buildRoom(kit, L, preset.name);
    world.add(room.group);
    stations = createStations(kit, L, room.mats);
    world.add(stations.group);
    tables = createTables(kit, L, room.mats);
    world.add(tables.group);
    crowd.setLayout(L);
    fx.clear();
    const th = themeFor(L.id);
    scene.background = new THREE.Color(th.background);
    renderer.setClearColor(scene.background, 1);
    resize(true);
    perf.rest();
  }

  function readSafe() {
    // env(safe-area-inset-*) through a probe element
    if (typeof document === 'undefined') return;
    let p = document.getElementById('__diner_safe');
    if (!p) {
      p = document.createElement('div');
      p.id = '__diner_safe';
      p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
      document.body.appendChild(p);
    }
    const cs = getComputedStyle(p);
    safe.top = parseFloat(cs.paddingTop) || 0;
    safe.bottom = parseFloat(cs.paddingBottom) || 0;
    safe.left = parseFloat(cs.paddingLeft) || 0;
    safe.right = parseFloat(cs.paddingRight) || 0;
  }

  let closeUp = null; // debug: { x, z, r } frames a small area (lab close-ups)
  function frame() {
    if (!room) return;
    if (closeUp) {
      const { x, z, r } = closeUp;
      const pts = [new THREE.Vector3(x - r, 0, z - r * 0.6), new THREE.Vector3(x + r, 0, z + r * 0.6), new THREE.Vector3(x, 2.6, z - r * 0.6)];
      pxPerUnit = cam.fit(view.width, view.height, { top: 0, bottom: 0, left: 0, right: 0 }, pts);
      return;
    }
    const ins = {
      top: insets.top + safe.top, bottom: insets.bottom + safe.bottom,
      left: (insets.left || 0) + safe.left, right: (insets.right || 0) + safe.right,
    };
    pxPerUnit = cam.fit(view.width, view.height, ins, room.focus, { align: 0.5 });
  }

  function resize(force) {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, preset.maxDpr);
    if (!force && w === view.width && h === view.height && dpr === view.dpr) return;
    view.width = w; view.height = h; view.dpr = dpr;
    readSafe();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    frame();
  }
  if (typeof window !== 'undefined') window.addEventListener('resize', () => resize(false));
  let sizeCheck = 0;

  const perf = createPerfMonitor();
  perf.onSlow = () => {
    if (!autoQuality || preset.name === 'low') return;
    autoLowered = true;
    setQuality('low');
    if (opts.onAutoQuality) opts.onAutoQuality('low');
  };

  function setQuality(q) {
    const p = presetFor(q);
    if (p === preset) return;
    preset = p;
    fx.setPreset(p);
    if (locId) { const id = locId; locId = null; setLocation(id); }
    resize(true);
  }

  function update(state, dt = 1 / 60, render = true) {
    dt = clamp(dt || 0, 0, 0.1);
    lastState = state;
    const id = state && state.location;
    if (id && id !== locId) setLocation(id);
    if ((sizeCheck += dt) > 0.5) { sizeCheck = 0; resize(false); }
    if (state) {
      stations.update(state.stations, dt);
      tables.update(state.tables, dt);
    }
    blobs.begin();
    dishes.begin();
    if (tables) for (const v of tables.views) if (v.owned) blobs.add(v.t.pos[0], v.t.pos[1], 3.4, 2.0);
    crowd.update(state, dt);
    steamTick(state, dt);
    dishes.end();
    blobs.end();
    fx.update(dt, camera);
    if (render) draw();
  }

  // a soft puff of steam now and then over a stove / pot / oven that is cooking
  const steamT = [0, 0, 0, 0];
  function steamTick(state, dt) {
    if (!state || !state.cooks || !stations) return;
    for (let i = 0; i < stations.views.length; i++) {
      const v = stations.views[i];
      if (v.kind === 'drinks') continue;
      let busy = false;
      for (let k = 0; k < state.cooks.length; k++) if (state.cooks[k].state === 'cooking' && state.cooks[k].station === v.id) { busy = true; break; }
      if (!busy) { steamT[i] = 0.3; continue; }
      steamT[i] -= dt;
      if (steamT[i] <= 0) {
        steamT[i] = 1.1;
        const ls = v.ls;
        fx.steam(_p3.set(ls.pos[0] - 0.1, v.kind === 'oven' ? 2.1 : 1.45, ls.pos[1] + 0.1));
      }
    }
  }

  function draw() {
    renderer.info.reset();
    renderer.render(scene, camera);
    perf.frame();
  }

  // ------------------------------------------------------------------ anchors / picking
  function project(p, out) {
    _v.copy(p).project(camera);
    out.x = (_v.x + 1) / 2 * view.width;
    out.y = (1 - _v.y) / 2 * view.height;
    out.visible = _v.x > -1.05 && _v.x < 1.05 && _v.y > -1.05 && _v.y < 1.05;
    return out;
  }
  const _p3 = new THREE.Vector3();
  function stationView(id) {
    if (!stations) return null;
    if (typeof id === 'number') return stations.views[id] || null;
    return stations.views.find((v) => v.id === id) || null;
  }
  // anchor(kind, id, out?) -> { x, y, visible } in CSS px; pass `out` to reuse an object
  function anchor(kind, id, out = { x: 0, y: 0, visible: false }) {
    out.x = 0; out.y = 0; out.visible = false;
    if (kind === 'coins') {
      out.x = SCREEN.coins.x * view.width; out.y = SCREEN.coins.y * view.height + safe.top; out.visible = true;
      return out;
    }
    if (!layout) return out;
    if (id === undefined && kind !== 'door') { id = kind; kind = 'station'; }
    if (kind === 'station') {
      const v = stationView(id);
      if (!v) return out;
      const top = !v.open ? 1.25 : v.kind === 'oven' ? 2.5 : v.kind === 'grill' && v.tier >= 4 ? 2.4 : 2.0;
      return project(_p3.set(v.ls.pos[0], top, v.ls.pos[1] + 0.6), out);
    }
    if (kind === 'table') {
      const t = layout.tables.find((x) => x.id === id) || layout.tables[id];
      if (!t) return out;
      return project(_p3.set(t.pos[0], 1.3, t.pos[1]), out);
    }
    if (kind === 'customer' || kind === 'cook') {
      const p = crowd.headPoint(kind, id, _p3);
      if (!p) return out;
      return project(p, out);
    }
    if (kind === 'door') return project(_p3.set(layout.door.pos[0], 1.5, layout.door.pos[1]), out);
    return out;
  }

  function screenBox(cx, cz, hx, hz, y0, y1, out) {
    out.x0 = Infinity; out.y0 = Infinity; out.x1 = -Infinity; out.y1 = -Infinity;
    const o = { x: 0, y: 0, visible: false };
    for (let i = 0; i < 8; i++) {
      _p3.set(cx + (i & 1 ? hx : -hx), i & 2 ? y1 : y0, cz + (i & 4 ? hz : -hz));
      project(_p3, o);
      if (o.x < out.x0) out.x0 = o.x; if (o.x > out.x1) out.x1 = o.x;
      if (o.y < out.y0) out.y0 = o.y; if (o.y > out.y1) out.y1 = o.y;
    }
    return out;
  }
  function pick(clientX, clientY) {
    if (!layout) return null;
    const r = canvas.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    const hit = (b, pad = 0) => x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad;
    // stations first (the main tap target)
    for (const v of stations.views) {
      screenBox(v.ls.pos[0], v.ls.pos[1] + 0.3, 1.0, 1.3, 0, v.open ? 2.1 : 1.2, _box);
      if (hit(_box, 2)) return { type: 'station', id: v.id };
    }
    let best = null, bestD = Infinity;
    const consider = (type, id, b) => {
      if (!hit(b, 4)) return;
      const d = Math.hypot(x - (b.x0 + b.x1) / 2, y - (b.y0 + b.y1) / 2);
      if (d < bestD) { bestD = d; best = { type, id }; }
    };
    for (const [id, v] of crowd.customers) consider('customer', id, screenBox(v.x, v.z, 0.45, 0.45, 0, v.seated ? 2.1 : 2.5, _box));
    for (const [id, v] of crowd.cooks) consider('cook', id, screenBox(v.x, v.z, 0.45, 0.45, 0, 2.5, _box));
    if (best) return best;
    for (const t of layout.tables) {
      screenBox(t.pos[0], t.pos[1], 1.7, 0.9, 0, 1.2, _box);
      if (hit(_box, 2)) return { type: 'table', id: t.id };
    }
    return null;
  }

  // ------------------------------------------------------------------ effects
  function fxEvent(ev, p = {}) {
    if (!layout) return;
    switch (ev) {
      case 'locationStart':
        if (p.id && p.id !== locId) setLocation(p.id);
        fx.confetti(_p3.set(0, 4, 0), 1);
        break;
      case 'pay': {
        const v = crowd.customers.get(p.customer);
        if (v) fx.coins(_p3.set(v.x, 1.5, v.z), p.value);
        break;
      }
      case 'upgrade': {
        const v = stationView(p.station);
        if (!v) break;
        stations.bounce(v.id);
        fx.sparkle(_p3.set(v.ls.pos[0], 1.6, v.ls.pos[1] + 0.6), p.milestone ? 2 : 1);
        if (p.milestone) fx.ring(_p3.set(v.ls.pos[0], 0.05, v.ls.pos[1] + 0.8));
        break;
      }
      case 'open': {
        const v = stationView(p.station);
        if (!v) break;
        fx.burst(_p3.set(v.ls.pos[0], 1.2, v.ls.pos[1] + 0.6));
        fx.ring(_p3.set(v.ls.pos[0], 0.05, v.ls.pos[1] + 0.8));
        break;
      }
      case 'buyTable': {
        const t = layout.tables.find((x) => x.id === p.table);
        if (t) { fx.burst(_p3.set(t.pos[0], 0.6, t.pos[1]), 0.8); tables.pop(t.id); }
        break;
      }
      case 'hire': {
        const v = crowd.cooks.get(p.cook);
        const k = lastState && lastState.cooks && lastState.cooks.find((c) => c.id === p.cook);
        const n = v ? null : layout.graph.nodes[(k && k.home) || layout.cookHomes[0]];
        if (v) fx.burst(_p3.set(v.x, 0.8, v.z), 0.6);
        else if (n) fx.burst(_p3.set(n[0], 0.8, n[1]), 0.6);
        break;
      }
      case 'boost': {
        const v = stationView(p.station);
        if (v) fx.sparkle(_p3.set(v.ls.pos[0], 1.4, v.ls.pos[1] + 0.8), 0.6);
        break;
      }
      case 'serve': {
        const v = crowd.customers.get(p.customer);
        if (v) fx.sparkle(_p3.set(v.x, 1.4, v.z), 0.35);
        break;
      }
      case 'cookStart': {
        const st = layout.stations.find((s) => s.id === p.station);
        if (st) fx.steam(_p3.set(st.pos[0], 1.5, st.pos[1] + 0.2));
        break;
      }
      case 'locationComplete':
        fx.confetti(_p3.set(0, 5, 0), 2);
        break;
      case 'setting':
        if (p.key === 'quality') setQuality(p.value);
        break;
      default:
    }
  }

  setLocation(opts.location || 'inn');

  // compile every shader variant now (opaque + fading heroes, instanced dishes, particles), so
  // the first guest at the door or the first coin burst does not stall a frame on the phone
  try {
    const warmHero = heroLib.acquire('knight', 0);
    warmHero.setOpacity(0.5);
    dynamic.add(warmHero.root);
    dishes.begin(); dishes.add('mug_juice', 0, -5, 0); dishes.end();
    fx.sparkle(_p3.set(0, -5, 0), 0.2); fx.coins(_p3, 1); fx.confettiAt(_p3, 1); fx.steam(_p3);
    fx.update(0.016, camera);
    renderer.compile(scene, camera);
    heroLib.release(warmHero);
    fx.clear();
    dishes.begin(); dishes.end();
  } catch (e) { /* warm-up is only an optimisation */ }

  return {
    setLocation,
    update,
    draw,
    fx: fxEvent,
    pick,
    anchor,
    setQuality,
    setInsets(v) { Object.assign(insets, v); frame(); },
    setAutoQuality(on) { autoQuality = !!on; },
    stats() {
      return {
        fps: perf.fps, frameMs: +perf.avgMs.toFixed(2), calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
        quality: preset.name, autoLowered, characters: crowd.count, dishes: dishes.instances, particles: fx.count,
      };
    },
    resize: () => resize(true),
    dispose() { disposeLocation(); renderer.dispose(); },
    debug: {
      setCloseUp(v) { closeUp = v; frame(); },
      project(x, y, z) { return project(new THREE.Vector3(x, y, z), { x: 0, y: 0, visible: false }); },
      renderer, scene, camera, cam, kit, heroLib, crowd, fx, perf,
      get layout() { return layout; }, get stations() { return stations; }, get tables() { return tables; },
      get pxPerUnit() { return pxPerUnit; }, get view() { return view; }, get state() { return lastState; }, SCREEN,
    },
  };
}
