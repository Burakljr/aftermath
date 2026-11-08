// Aftermath v2 · main: boot, frame loop, input routing, save cadence, offline time, quality and test hooks (ARCH §8).
// Game rules live in js/game, the 3D city in js/scene, the DOM in js/ui; this file only joins them.
import * as game from './game/index.js';
import { on } from './bus.js';
import { initAudio, updateAudio, setPref, prefs as audioPrefs } from './audio.js';
import { createUI } from './ui/index.js';

const Q = new URLSearchParams(location.search);
// ?manual=1 (tests): no rAF loop, time moves only through aftermath.step(); ?q=high|low forces the preset;
// ?seed=<n> seeds the game rng before a fresh state; ?autostart=1 skips the first-launch tap prompt.
const MANUAL = Q.get('manual') === '1';
const GFX_KEY = 'aftermath.gfx.v1';
const STEP = 0.05;
const AWAY_MIN = 60; // s away before offline time counts
const SAVE_EVERY = 5; // s
const SAVE_EVENTS = ['contract-done', 'payment', 'purchase', 'sale', 'ftue', 'unlock', 'goal'];
// bus events the scene turns into one-shot visuals (ARCH 4.6 / 5.4); unknown types are ignored by the scene
const SCENE_EVENTS = ['attack-start', 'hit', 'phase', 'call', 'tender-open', 'tender-result', 'contract-start', 'dispatch', 'arrive',
  'return', 'park', 'recall', 'stage-done', 'part', 'rare', 'clean', 'spread-warn', 'spread-cancel', 'spread', 'deadline-zone',
  'contract-done', 'payment', 'sale', 'offer', 'offer-expired', 'purchase', 'factory-start', 'factory-done', 'unlock', 'goal', 'ftue',
  'rival-start', 'rival-done', 'upkeep', 'income', 'notice'];

if (Q.has('seed')) game.setSeed(Number(Q.get('seed')) || 1);

// ---------------------------------------------------------------- state
let s = game.load();
const fresh = !s;
if (!s) s = game.newState();
let resetting = false;
let booted = false;
let started = false;

// v1 players get one notice, after the cold open and before the call (ARCH 8.1)
let v1Pending = game.hasV1Save() && !s.flags.v1Notice && !s.notices.some((n) => n.kind === 'v1');
function pushV1() {
  if (!v1Pending) return;
  v1Pending = false;
  game.pushNotice(s, 'v1');
}
if (v1Pending && s.progress.ftue !== 'cold') pushV1();
on('phase', ({ from }) => { if (from === 'attack') pushV1(); });

// ---------------------------------------------------------------- graphics prefs (aftermath.gfx.v1)
const gfx = { quality: 'auto', downgraded: false };
try { Object.assign(gfx, JSON.parse(localStorage.getItem(GFX_KEY)) || {}); } catch { /* bozuk ayar: varsayılan */ }
if (!['auto', 'high', 'low'].includes(gfx.quality)) gfx.quality = 'auto';
const forcedQ = Q.get('q') === 'low' || Q.get('q') === 'high' ? Q.get('q') : null;
function saveGfx() {
  try { localStorage.setItem(GFX_KEY, JSON.stringify(gfx)); } catch { /* depolama kapalı */ }
}
function effectiveQuality() {
  if (forcedQ) return forcedQ;
  if (gfx.quality === 'low' || (gfx.quality === 'auto' && gfx.downgraded)) return 'low';
  return 'high';
}
const prefs = {
  get: () => ({ sfx: audioPrefs.sfx, music: audioPrefs.music, quality: effectiveQuality(), downgraded: gfx.quality === 'auto' && gfx.downgraded }),
  set(key, value) {
    if (key === 'sfx' || key === 'music') setPref(key, !!value);
    else if (key === 'quality') {
      gfx.quality = value === 'low' ? 'low' : 'high';
      gfx.downgraded = false;
      saveGfx();
      if (scene) scene.setQuality(effectiveQuality());
    }
  },
};
// auto downgrade: the scene reports when the frame-time EMA stays under 28 fps for 5 s (first 10 s and the attack ignored)
function onSceneEvent(type) {
  // (?manual=1 drives time by hand on a software GPU: its frame times say nothing about the device)
  if (type !== 'quality-hint' || MANUAL || forcedQ || gfx.quality !== 'auto' || gfx.downgraded) return;
  gfx.downgraded = true;
  saveGfx();
  if (scene) scene.setQuality('low');
  ui.refresh();
}

// ---------------------------------------------------------------- UI + audio
const reducedMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
const uiRoot = document.getElementById('ui');
const canvas = document.getElementById('scene');
const ui = createUI(uiRoot, {
  scene: null,
  prefs,
  getState: () => s,
  reset() {
    resetting = true;
    game.wipe(localStorage);
    location.reload();
  },
});
document.getElementById('boot')?.remove();
ui.loading.set(0.15);
initAudio(() => s);
ui.render(s, performance.now()); // measure the band before the camera is built

// ---------------------------------------------------------------- save cadence
let saveTimer = 0;
function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (resetting || !booted) return;
  game.save(s);
}
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 400);
}
on('action', (p) => { if (p && p.ok) saveSoon(); });
for (const ev of SAVE_EVENTS) on(ev, saveSoon);

// ---------------------------------------------------------------- scene
let scene = null;
for (const ev of SCENE_EVENTS) on(ev, (p) => { if (scene && booted) scene.event(ev, p); });

// camera director (ARCH 8.3): the UI frames on select / close, the attack director owns the camera during the attack
// a contract frames its job districts (review V1 / playtest M6): chips fit in the band, the work is big enough to follow
on('contract-start', () => { if (scene) scene.frame('job', { duration: 0.9 }); });
on('rival-start', () => { if (scene) scene.frame('job', { duration: 0.9 }); });
// contract-done: the scene holds on the last cleaned district, then pulls out to the city itself (scene.js result framing)

// the UI frames 'city' when a sheet closes; while a job runs the home shot is the job framing instead (the job districts,
// and during the guided contract the truck on its way), so the work stays big enough to follow on a phone
function sceneForUI(sc) {
  return Object.assign(Object.create(sc), {
    frame(target, o) {
      if (target === 'city' && (s.phase === 'cleanup' || s.phase === 'rival') && !s.result) return sc.frame('job', { ...o, zoom: undefined });
      return sc.frame(target, o);
    },
  });
}

// rare part: game time runs at 0.35 for 0.4 s (the scene slows its own visual clock on the same event)
let slowUntil = 0;
on('rare', () => { slowUntil = performance.now() + 400; });

async function boot() {
  let mod;
  try {
    mod = await import('./scene/scene.js');
  } catch (err) {
    fail('Oyun dosyaları yüklenemedi. Bağlantını kontrol edip yeniden aç.', err);
    return;
  }
  ui.loading.set(0.45);
  try {
    scene = mod.createScene(canvas, { quality: effectiveQuality(), band: ui.band(), onEvent: onSceneEvent, reducedMotion });
  } catch (err) {
    fail('Bu cihazda 3B görüntü açılamadı. Tarayıcını güncelleyip yeniden dene.', err);
    return;
  }
  await scene.ready;
  ui.loading.set(0.8);
  ui.setScene(sceneForUI(scene));
  ui.render(s, performance.now());
  await scene.prime(s);
  frameJobIfWorking(true);
  ui.loading.set(1);
  if (!fresh && s.lastSave) {
    const away = (Date.now() - s.lastSave) / 1000;
    if (away > AWAY_MIN) game.applyOffline(s, away);
  }
  booted = true;
  ui.render(s, performance.now());
}

function fail(text, err) {
  console.warn('[aftermath] boot failed:', err);
  ui.loading.line(text, 'err');
}

// first launch: one tap opens audio before the cold open plays (browsers start sound only after a gesture)
async function gate() {
  const coldOpen = s.progress.ftue === 'cold' && !s.attack && s.clock < 1;
  if (coldOpen && Q.get('autostart') !== '1') await ui.loading.prompt('Başlamak için dokun');
  ui.loading.hide();
  started = true;
  last = performance.now();
}

// ---------------------------------------------------------------- frame loop (ARCH 8.2)
let last = performance.now();
let saveAcc = 0;
let errCount = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) {
    last = now;
    return;
  }
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  try {
    if (started) game.tick(s, now < slowUntil ? dt * 0.35 : dt);
    scene.update(s, dt);
    ui.render(s, now);
    updateAudio(s, dt);
  } catch (err) {
    if (errCount++ < 3) console.error(err);
  }
  if (started) {
    saveAcc += dt;
    if (saveAcc >= SAVE_EVERY) {
      saveAcc = 0;
      saveNow();
    }
  }
}

// ---------------------------------------------------------------- input (ARCH 8.3)
const TAP_PX = 10;
const TAP_MS = 300;
const pointers = new Map();
let gesture = null; // { x, y, t, moved, multi, pinch0 }

function dist2(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) gesture = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: performance.now(), moved: false, multi: false, pinch0: 0 };
  else if (gesture && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gesture.multi = true;
    gesture.pinch0 = dist2(a, b);
  }
  try { canvas.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p || !gesture) return;
  p.x = e.clientX;
  p.y = e.clientY;
  if (pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = dist2(a, b);
    if (gesture.pinch0 > 0 && scene && booted) {
      if (d / gesture.pinch0 > 1.18) { scene.zoomTo('district'); gesture.pinch0 = d; }
      else if (d / gesture.pinch0 < 0.85) { scene.zoomTo('city'); gesture.pinch0 = d; }
    }
    return;
  }
  if (!gesture.moved && Math.hypot(e.clientX - gesture.x, e.clientY - gesture.y) > TAP_PX) gesture.moved = true;
  if (gesture.moved && !gesture.multi && scene && booted && s.phase !== 'attack') scene.panBy(e.clientX - gesture.lx, e.clientY - gesture.ly);
  gesture.lx = e.clientX;
  gesture.ly = e.clientY;
});
function endPointer(e, cancelled) {
  pointers.delete(e.pointerId);
  if (!gesture || pointers.size > 0) return;
  const g = gesture;
  gesture = null;
  if (cancelled || g.multi || g.moved || performance.now() - g.t > TAP_MS) return;
  tapAt(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function tapAt(x, y) {
  if (!booted || !started || !scene) return;
  if (s.phase === 'attack') {
    game.act(s, 'skipAttack'); // the FTUE allows it on the cold open; the UI ignores canvas taps here
    return;
  }
  const hit = scene.pick(x, y);
  if (!hit) {
    ui.closeSheet();
    return;
  }
  if (hit.type === 'district') ui.selectDistrict(hit.id);
  else if (hit.type === 'vehicle') {
    const v = s.fleet.find((f) => f.id === hit.id);
    if (v && v.sector != null) ui.selectDistrict(v.sector);
  } else if (hit.type === 'yard') {
    if (!(s.progress.unlocked.depot && ui.openTab('depot'))) ui.closeSheet();
  }
}

// ---------------------------------------------------------------- visibility, offline, resize
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    saveNow();
    return;
  }
  if (hiddenAt && booted) {
    const away = (Date.now() - hiddenAt) / 1000;
    if (away > AWAY_MIN) game.applyOffline(s, away);
  }
  hiddenAt = 0;
  last = performance.now();
});
window.addEventListener('pagehide', saveNow);
let resizeRaf = 0;
function onResize() {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    if (scene) scene.resize();
    ui.refresh();
  });
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

// ---------------------------------------------------------------- test hooks (ARCH 8.5)
function resetView() {
  Object.assign(ui.view, { tab: 'city', sel: null, settings: false, news: false, accept: null });
  if (ui.ctx.titleApi) ui.ctx.titleApi.hide();
  if (scene) {
    scene.setHighlight(null, 'select');
    scene.setHighlight(null, 'accept');
    scene.frame('city', { zoom: 'city', instant: true });
  }
}
function frameJobIfWorking(instant) {
  if (scene && (s.phase === 'cleanup' || s.phase === 'rival') && !s.result) scene.frame('job', { instant, duration: 0.9 });
}
async function useState(next) {
  s = next;
  resetView();
  if (scene) await scene.prime(s);
  frameJobIfWorking(true);
  ui.refresh();
  ui.render(s, performance.now());
  return s;
}
const ready = boot().then(() => {
  if (!scene || !booted) return false;
  // tests (?manual=1): game time and the 3D view move only in aftermath.step(); the DOM keeps its own timers at 10 Hz
  if (MANUAL) setInterval(() => ui.render(s, performance.now()), 100);
  else requestAnimationFrame(frame);
  gate();
  return true;
});

window.aftermath = {
  ready,
  /** advance game time deterministically: 0.05 s substeps (tick + scene update without rendering), one render at the end */
  step(sec = 1) {
    if (!booted) return s.phase;
    for (let t = 0; t < sec - 1e-9; t += STEP) {
      game.tick(s, STEP);
      scene.update(s, STEP, { render: false });
    }
    ui.refresh();
    scene.render();
    ui.render(s, performance.now());
    return s.phase;
  },
  /** render one frame (UI + 3D) without moving time */
  draw() {
    if (!booted) return;
    scene.render();
    ui.refresh();
    ui.render(s, performance.now());
  },
  start() {
    if (started) return;
    ui.loading.hide();
    started = true;
  },
  state: () => s,
  game,
  get scene() { return scene; },
  ui,
  act: (id, arg) => game.act(s, id, arg),
  ftue(stepId) {
    const n = game.newState();
    game.debugFtue(n, stepId);
    return useState(n);
  },
  unlockAll() {
    game.debugUnlockAll(s);
    ui.refresh();
    return s;
  },
  scenario(name) { return useState(game.debugScenario(name)); },
  load(state) { return useState(state); },
  seed(n) { game.setSeed(n); },
  quality(q) {
    if (q) prefs.set('quality', q);
    return scene ? scene.quality() : effectiveQuality();
  },
  prefs: () => ({ ...prefs.get(), gfx: { ...gfx } }),
  stats: () => (scene ? scene.stats() : null),
  save: () => game.save(s),
  get started() { return started; },
  get booted() { return booted; },
};

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
