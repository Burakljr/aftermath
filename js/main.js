// Toy Factory: integration. Creates the game (from the saved state), the 3D scene and the
// DOM UI, runs the frame loop, routes game events, saves, and exposes window.toy for tests.
//
// URL options (all optional, for development and tests):
//   ?manual=1   no frame loop: time only moves through window.toy.step(dt)
//   ?autoq=0    never drop to Low quality automatically
//   ?lang=tr    language for a NEW game (otherwise the phone language)
//   ?reset=1    start over (deletes the save)
import { createGame, EVENTS } from './game/index.js';
import { t as translate } from './game/i18n.js';
import { createUI } from './ui/index.js';
import { createAudio } from './audio.js';
import { createScene } from './scene/scene.js';
import { SCREEN } from './scene/layout.js';

const SAVE_KEY = 'toyfactory.save.v1';
const SAVE_EVERY = 4; // seconds
const STEP = 1 / 30; // window.toy.step() sub-step

// ------------------------------------------------------------------ storage (guarded)
const storage = {
  load() { try { return window.localStorage.getItem(SAVE_KEY); } catch { return null; } },
  store(s) { try { window.localStorage.setItem(SAVE_KEY, s); return true; } catch { return false; } },
  clear() { try { window.localStorage.removeItem(SAVE_KEY); } catch { /* sandboxed */ } },
};

let params;
try { params = new URLSearchParams(window.location.search); } catch { params = new URLSearchParams(''); }
const manual = params.get('manual') === '1';
if (params.get('reset') === '1') storage.clear();
const langParam = params.get('lang');

// ------------------------------------------------------------------ game
let game;
try {
  game = createGame({ save: storage.load(), lang: langParam === 'en' || langParam === 'tr' ? langParam : undefined });
} catch (e) {
  console.error(e);
  game = createGame({ save: null });
}

const tx = (key, p) => translate(game.state.settings.lang, key, p);

// ------------------------------------------------------------------ scene
const canvas = document.getElementById('scene');
let autoChange = false; // true while the scene itself lowers the quality
let scene;
try {
  scene = createScene(canvas, {
    quality: game.state.settings.quality,
    factory: game.config(),
    autoQuality: params.get('autoq') !== '0' && game.state.settings.quality === 'high',
    onAutoQuality(q) {
      autoChange = true;
      try { game.act({ type: 'setting', key: 'quality', value: q }); } finally { autoChange = false; }
    },
  });
} catch (e) {
  console.error(e);
  scene = createFallbackScene();
  const box = document.getElementById('fatal');
  if (box) { box.textContent = tx('error.webgl'); box.hidden = false; }
}

// ------------------------------------------------------------------ audio + UI
const audio = createAudio();
const ui = createUI({ root: document.getElementById('ui'), game, scene, audio, canvas });

// game events -> scene effects (the UI and the sounds subscribe to the game by themselves)
for (const ev of EVENTS) game.on(ev, (p) => { try { scene.fx(ev, p); } catch (e) { reportOnce(e); } });
game.on('factoryStart', () => { scene.setFactory(game.config()); saveNow(); });
game.on('setting', (p) => {
  // a quality the player picked by hand wins over the automatic drop for this session
  if (p.key === 'quality' && !autoChange && scene.setAutoQuality) scene.setAutoQuality(false);
  saveNow();
});
game.on('open', () => saveNow());
game.on('factoryComplete', () => saveNow());

// ------------------------------------------------------------------ saving
let saveT = SAVE_EVERY;
function saveNow() {
  saveT = SAVE_EVERY;
  try { return storage.store(game.save()); } catch (e) { reportOnce(e); return false; }
}
document.addEventListener('visibilitychange', () => {
  // back in front: the next frame's dt covers the pause (caught up below, or offline if long)
  if (document.visibilityState === 'hidden') saveNow();
});
window.addEventListener('pagehide', saveNow);

// ------------------------------------------------------------------ frame loop
let reported = false;
function reportOnce(e) {
  if (reported) return;
  reported = true;
  console.error(e);
}

function frame(dt, render) {
  game.tick(dt);
  scene.update(game.state, dt, render);
  ui.update(dt);
  saveT -= dt;
  if (saveT <= 0) saveNow();
}

let lastT = 0;
let firstFrame = true;
function loop(t) {
  requestAnimationFrame(loop);
  let dt = lastT ? (t - lastT) / 1000 : 1 / 60;
  lastT = t;
  if (!(dt > 0)) dt = 1 / 60;
  try {
    if (dt > 0.25 && dt <= 60) {
      // a short hitch or pause: catch the production line up (the game clamps 1 s per tick)
      let left = dt - 0.1;
      while (left > 0) { const h = Math.min(1, left); game.tick(h); left -= h; }
      dt = 0.1;
    } else if (dt > 60) {
      dt = 1 / 60; // long absence: tick() turns the wall-clock gap into offline earnings
    }
    frame(dt, true);
  } catch (e) {
    reportOnce(e);
  }
  if (firstFrame) { firstFrame = false; ready(); }
}

function ready() {
  const loader = document.getElementById('loader');
  if (loader) {
    loader.classList.add('is-done');
    setTimeout(() => { if (loader.parentNode) loader.parentNode.removeChild(loader); }, 450);
  }
  window.toy.ready = true;
}

// ------------------------------------------------------------------ test hook
// step(dt, h, render): advance game, scene and UI deterministically by dt seconds in
// sub-steps of h seconds (default 1/30), then draw one frame (unless render === false).
function step(dt, h = STEP, render = true) {
  let left = Math.max(0, Number(dt) || 0);
  h = Math.max(1 / 240, Math.min(0.25, Number(h) || STEP));
  while (left > 1e-9) {
    const d = Math.min(left, h);
    frame(d, false);
    left -= d;
  }
  if (render !== false) scene.update(game.state, 0, true);
}

window.toy = {
  game,
  scene,
  ui,
  audio,
  step,
  save: saveNow,
  saveKey: SAVE_KEY,
  manual,
  ready: false,
};

if (manual) {
  step(1 / 60);
  ready();
} else {
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ no WebGL: keep the UI usable
function createFallbackScene() {
  let ids = game.config().stations.map((s) => s.id);
  const W = () => window.innerWidth;
  const H = () => window.innerHeight;
  const pos = (i) => ({ x: SCREEN.stations[i].x * W(), y: SCREEN.stations[i].y * H() });
  return {
    setFactory(c) { ids = c.stations.map((s) => s.id); },
    update() {},
    fx() {},
    pick(x, y) {
      let best = null;
      let bd = 70 * 70;
      ids.forEach((id, i) => {
        const p = pos(i);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bd) { bd = d; best = { type: 'station', id }; }
      });
      return best;
    },
    anchor(id) {
      if (id === 'truck') return { x: SCREEN.truck.x * W(), y: SCREEN.truck.y * H(), visible: true };
      if (id === 'coins') return { x: SCREEN.coins.x * W(), y: SCREEN.coins.y * H(), visible: true };
      const i = typeof id === 'number' ? id : ids.indexOf(id);
      if (i < 0 || !SCREEN.stations[i]) return null;
      const p = pos(i);
      return { x: p.x, y: p.y - 40, visible: true };
    },
    setQuality() {},
    setInsets() {},
    setAutoQuality() {},
    stats() { return { fps: 0, calls: 0, tris: 0, quality: 'low' }; },
    resize() {},
  };
}
