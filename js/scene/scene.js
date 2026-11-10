// createScene(canvas, opts) -> Promise<scene API>: the three.js view of the diner.
// A pure view: it reads the game state every frame and plays effects on fx().
// See docs/ARCH.md ("Scene") for the API.
import * as THREE from 'three';
import { getLayout } from '../game/layout.js';
import { loadModels } from './assets.js';
import { createKit, clamp } from './kit.js';
import { createCamera } from './camera.js';
import { buildRoom, themeFor, backdropTexture } from './room.js';
import { createStations } from './stations.js';
import { createTables } from './tables.js';
import { createHeroLib, HERO_MODELS } from './heroes.js';
import { createCrowd, makeCarryClips } from './crowd.js';
import { createDishes, createBlobs } from './dishes.js';
import { createFx } from './fx.js';
import { presetFor, createPerfMonitor } from './quality.js';
import { UI_INSETS, SCREEN } from './layout.js';

const MODELS = ['props', 'anims', ...HERO_MODELS];
// diagonal (iso) diorama camera: looks at the room from its open front corner
export const CAM = { elevation: 35, yaw: 45, zoom: 1 };
const _v = new THREE.Vector3();
const _box = { x0: 0, y0: 0, x1: 0, y1: 0 };
const _o = { x: 0, y: 0, visible: false };
const _tc = [0, 0];
// centre of a table group: the table and its chairs (seats may sit on any sides)
function tableCentre(t, out) {
  let x = t.pos[0] * 2, z = t.pos[1] * 2;
  for (const s of t.seats) { x += s.chair.pos[0]; z += s.chair.pos[1]; }
  const n = 2 + t.seats.length;
  out[0] = x / n; out[1] = z / n;
  return out;
}

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
  const cam = createCamera({ elevation: opts.elevation ?? CAM.elevation, yaw: opts.yaw ?? CAM.yaw });
  const camera = cam.camera;
  scene.add(camera);

  // warm, bright light: sky/ground hemisphere + one sun from the upper left front
  const hemi = new THREE.HemisphereLight(0xfff4e2, 0x8a6a52, 1.65);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.7);
  // from the camera's right: the dining wall (facing +x) is sunlit, the kitchen wall in soft shade
  sun.position.set(8, 12, 3.5);
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
    renderer.setClearColor(new THREE.Color(th.background), 1);
    scene.background = th.backdrop ? backdropTexture(th.backdrop) : new THREE.Color(th.background);
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
      // a diamond around (x, z) for the diagonal camera, plus a head-height point at the back
      const pts = [new THREE.Vector3(x - r, 0, z + r * 0.4), new THREE.Vector3(x + r * 0.4, 0, z - r),
        new THREE.Vector3(x - r * 0.5, 2.8, z - r * 0.5), new THREE.Vector3(x + r * 0.5, 0, z + r * 0.5)];
      pxPerUnit = cam.fit(view.width, view.height, { top: 0, bottom: 0, left: 0, right: 0 }, pts);
      return;
    }
    const ins = {
      top: insets.top + safe.top, bottom: insets.bottom + safe.bottom,
      left: (insets.left || 0) + safe.left, right: (insets.right || 0) + safe.right,
    };
    pxPerUnit = cam.fit(view.width, view.height, ins, room.focus, { align: 0.5, zoom: CAM.zoom });
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
    // soft shadow under each owned table group (table + the two chairs on its far side)
    if (tables) for (const v of tables.views) if (v.owned) { tableCentre(v.t, _tc); blobs.add(_tc[0], _tc[1], 2.9, 2.9); }
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
        fx.steam(_p3.set(ls.pos[0] - 0.1, v.kind === 'oven' ? 1.5 : 1.45, ls.pos[1] + 0.1));
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
  // a point in front of a station: `d` units toward the room along its facing
  function stationFront(v, d, y, out) {
    const f = v.ls.facing || 0;
    return out.set(v.ls.pos[0] + Math.sin(f) * d, y, v.ls.pos[1] + Math.cos(f) * d);
  }
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
      // open: above the station and the cook behind it (clear of his head); closed: the Open
      // sign stands on the counter
      if (!v.open) return project(stationFront(v, 0.6, 1.25, _p3), out);
      return project(stationFront(v, -0.2, 3.15, _p3), out);
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
  // the camera ray through a tap (CSS px), and a test against a square footprint between y0 / y1
  const _ro = new THREE.Vector3(), _rd = new THREE.Vector3();
  function tapRay(x, y) {
    const nx = x / view.width * 2 - 1, ny = 1 - y / view.height * 2;
    _ro.set(nx, ny, -1).unproject(camera);
    _rd.set(nx, ny, 1).unproject(camera).sub(_ro).normalize();
  }
  // does the tap ray pass within `r` of (cx, cz) (round) or inside the square of half size `r`
  // somewhere between the heights y0 and y1?
  function rayHits(cx, cz, r, y0, y1, round) {
    if (Math.abs(_rd.y) < 1e-6) return false;
    for (let k = 0; k <= 6; k++) {
      const yy = y0 + (y1 - y0) * k / 6;
      const s = (yy - _ro.y) / _rd.y;
      const dx = _ro.x + _rd.x * s - cx, dz = _ro.z + _rd.z * s - cz;
      if (round ? dx * dx + dz * dz <= r * r : Math.abs(dx) <= r && Math.abs(dz) <= r) return true;
    }
    return false;
  }
  // a table group: the table top / pedestal and its chairs
  function rayHitsTable(t) {
    if (rayHits(t.pos[0], t.pos[1], 0.95, 0, 1.05, true)) return true;
    for (const st of t.seats) if (rayHits(st.chair.pos[0], st.chair.pos[1], 0.5, 0, 1.25, false)) return true;
    return false;
  }
  function pick(clientX, clientY) {
    if (!layout) return null;
    const r = canvas.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    const hit = (b, pad = 0) => x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad;
    // stations first (the main tap target). Seen from the diagonal the screen boxes of two
    // neighbouring stations overlap near the corner, so the nearest box centre wins.
    let sBest = null, sD = Infinity;
    for (const v of stations.views) {
      // the counter and the lane behind it (where its cook stands)
      const side = Math.abs(Math.sin(v.ls.facing || 0)) > 0.7; // along the x = const wall
      stationFront(v, -0.35, 0, _p3);
      screenBox(_p3.x, _p3.z, side ? 1.45 : 1.0, side ? 1.0 : 1.45, 0, v.open ? 2.3 : 1.2, _box);
      if (!hit(_box, 2)) continue;
      const c = project(stationFront(v, 0.5, v.open ? 1.0 : 0.6, _p3), _o);
      const d = Math.hypot(x - c.x, y - c.y);
      if (d < sD) { sD = d; sBest = v; }
    }
    if (sBest) return { type: 'station', id: sBest.id };
    let best = null, bestD = Infinity, bestMoving = false;
    const consider = (type, id, b, moving) => {
      if (!hit(b, 4)) return;
      const d = Math.hypot(x - (b.x0 + b.x1) / 2, y - (b.y0 + b.y1) / 2);
      if (d < bestD) { bestD = d; best = { type, id }; bestMoving = moving; }
    };
    const st = lastState;
    for (const [id, v] of crowd.customers) consider('customer', id, screenBox(v.x, v.z, 0.45, 0.45, 0, v.seated ? 2.1 : 2.5, _box), !v.seated);
    for (const [id, v] of crowd.cooks) consider('cook', id, screenBox(v.x, v.z, 0.45, 0.45, 0, 2.5, _box), v.st !== 'cooking');
    // seen from the diagonal, cooks and guests walk right past the tables: a faded (not yet
    // bought) table wins over someone just walking by, so tapping it to buy stays reliable
    // tables: the tap ray must cross the table group's footprint (table + chairs) somewhere
    // between the floor and the table top; a screen box of a turned square is far too loose
    tapRay(x, y);
    let tableHit = null;
    for (let i = 0; i < layout.tables.length; i++) {
      const t = layout.tables[i];
      if (!rayHitsTable(t)) continue;
      const owned = !!(st && st.tables && st.tables[i] && st.tables[i].owned);
      if (!owned && (!best || bestMoving)) return { type: 'table', id: t.id };
      if (!tableHit) tableHit = { type: 'table', id: t.id };
    }
    return best || tableHit;
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
        fx.sparkle(stationFront(v, 0.6, 1.6, _p3), p.milestone ? 2 : 1);
        if (p.milestone) fx.ring(stationFront(v, 0.8, 0.05, _p3));
        break;
      }
      case 'open': {
        const v = stationView(p.station);
        if (!v) break;
        fx.burst(stationFront(v, 0.6, 1.2, _p3));
        fx.ring(stationFront(v, 0.8, 0.05, _p3));
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
        if (v) fx.sparkle(stationFront(v, 0.8, 1.4, _p3), 0.6);
        break;
      }
      case 'serve': {
        const v = crowd.customers.get(p.customer);
        if (v) fx.sparkle(_p3.set(v.x, 1.4, v.z), 0.35);
        break;
      }
      case 'cookStart': {
        const v = stationView(p.station);
        if (v) fx.steam(stationFront(v, 0.2, 1.5, _p3));
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
      ray(x, y) { tapRay(x, y); return [_ro.toArray(), _rd.toArray()]; },
      project(x, y, z) { return project(new THREE.Vector3(x, y, z), { x: 0, y: 0, visible: false }); },
      renderer, scene, camera, cam, kit, heroLib, crowd, fx, perf,
      get layout() { return layout; }, get stations() { return stations; }, get tables() { return tables; },
      get pxPerUnit() { return pxPerUnit; }, get view() { return view; }, get state() { return lastState; }, SCREEN,
    },
  };
}
