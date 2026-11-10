// Heroes' Diner (Kahramanlar Lokantası): integration.
// Creates the game from the save, loads the 3D scene (async: the models load first, with a
// progress bar), builds the DOM UI, runs the frame loop, routes game events to the scene,
// saves, and exposes window.diner for tests.
//
// URL options (all optional, for development and tests):
//   ?manual=1   no frame loop and a virtual clock: time only moves through window.diner.step(dt)
//   ?autoq=0    never drop to Low quality automatically
//   ?lang=tr    language for a NEW game (otherwise the phone language)
//   ?reset=1    start over (deletes the save)
import { createGame, EVENTS } from './game/index.js';
import { t as translate, detectLang } from './game/i18n.js';
import { createStorage } from './game/storage.js';
import { createUI } from './ui/index.js';
import { createAudio } from './audio.js';
import { SCREEN } from './scene/layout.js';

const SAVE_EVERY = 4; // seconds
const STEP = 1 / 30; // default sub-step of window.diner.step()

let params;
try { params = new URLSearchParams(window.location.search); } catch { params = new URLSearchParams(''); }
const manual = params.get('manual') === '1';
const langParam = params.get('lang');

// ------------------------------------------------------------------ storage (guarded) + game
const storage = createStorage();
if (params.get('reset') === '1') storage.clear();

// manual mode: a virtual clock that only moves with step(), so slow test machines never look
// like the player was away (offline earnings are tested by editing the save's lastSeen)
let virtualMs = Date.now();
const clock = manual ? () => virtualMs : Date.now;

let game;
try {
  game = createGame({ save: storage.load(), now: clock, lang: langParam === 'en' || langParam === 'tr' ? langParam : undefined });
} catch (e) {
  console.error(e);
  game = createGame({ save: null, now: clock, lang: detectLang() });
}
const tx = (key, p) => translate(game.state.settings.lang, key, p);

// ------------------------------------------------------------------ loading screen
const loader = document.getElementById('loader');
const loaderFill = loader && loader.querySelector('.fill');
const loaderName = loader && loader.querySelector('.name');
try {
  document.documentElement.lang = game.state.settings.lang;
  document.title = tx('app.title');
  if (loaderName) loaderName.textContent = tx('app.title');
} catch { /* ignore */ }
function progress(f) {
  if (!loaderFill) return;
  loaderFill.style.width = Math.round(Math.max(0.06, Math.min(1, f)) * 100) + '%';
}
progress(0.12);

// ------------------------------------------------------------------ scene (async)
const canvas = document.getElementById('scene');
let autoChange = false; // true while the scene itself lowers the quality
let scene = null;
try {
  const { createScene } = await import('./scene/scene.js');
  progress(0.22);
  scene = await createScene(canvas, {
    quality: game.state.settings.quality,
    location: game.state.location,
    autoQuality: params.get('autoq') !== '0' && game.state.settings.quality === 'high',
    onAutoQuality(q) {
      autoChange = true;
      try { game.act({ type: 'setting', key: 'quality', value: q }); } finally { autoChange = false; }
    },
    onProgress(done, total) { progress(0.22 + 0.74 * (done / Math.max(1, total))); },
  });
} catch (e) {
  console.error(e);
  scene = createFallbackScene();
  const box = document.getElementById('fatal');
  if (box) { box.textContent = tx('error.webgl'); box.hidden = false; }
}
progress(1);

// ------------------------------------------------------------------ audio + UI
const audio = createAudio();
const ui = createUI({ root: document.getElementById('ui'), game, scene, audio, canvas });

// game events -> scene effects (the UI and the sounds subscribe to the game by themselves).
// scene.fx('locationStart') switches the restaurant; update() would also do it by itself.
for (const ev of EVENTS) game.on(ev, (p) => { try { scene.fx(ev, p); } catch (e) { reportOnce(e); } });
game.on('setting', (p) => {
  // a quality the player picked by hand wins over the automatic drop for this session
  if (p.key === 'quality' && !autoChange && scene.setAutoQuality) scene.setAutoQuality(false);
  saveNow();
});
for (const ev of ['open', 'buyTable', 'hire', 'claim', 'locationComplete', 'locationStart']) game.on(ev, () => saveNow());

// ------------------------------------------------------------------ saving
let saveT = SAVE_EVERY;
function saveNow() {
  saveT = SAVE_EVERY;
  try { return storage.save(game.save()); } catch (e) { reportOnce(e); return false; }
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

// one simulation step of dt seconds (game, scene state, UI), drawn only if render is true
function frame(dt, render) {
  if (manual) virtualMs += dt * 1000;
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
      // a short hitch or pause (tab hidden): the restaurant keeps working, catch it up
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
  if (loader) {
    loader.classList.add('is-done');
    loader.setAttribute('aria-busy', 'false');
    setTimeout(() => { if (loader.parentNode) loader.parentNode.removeChild(loader); }, 450);
  }
  window.diner.ready = true;
}

// ------------------------------------------------------------------ test hook
// step(dt, h, render): advance game, scene and UI deterministically by dt seconds in sub-steps
// of h seconds (default 1/30), then draw one frame (unless render === false).
function step(dt, h = STEP, render = true) {
  let left = Math.max(0, Number(dt) || 0);
  h = Math.max(1 / 240, Math.min(1, Number(h) || STEP));
  try {
    while (left > 1e-9) {
      const d = Math.min(left, h);
      frame(d, false);
      left -= d;
    }
    if (render !== false) scene.update(game.state, 0, true);
  } finally {
    lastT = 0; // the frame loop must not count the time spent in here as a pause
  }
}

window.diner = {
  game,
  scene,
  ui,
  audio,
  storage,
  step,
  save: saveNow,
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
  const ids = () => game.state.stations.map((s) => s.id);
  const W = () => window.innerWidth;
  const H = () => window.innerHeight;
  const at = (p, dy = 0) => ({ x: p.x * W(), y: p.y * H() + dy, visible: true });
  return {
    setLocation() {},
    update() {},
    draw() {},
    fx() {},
    pick(x, y) {
      let best = null;
      let bd = 60 * 60;
      ids().forEach((id, i) => {
        const p = at(SCREEN.stations[i] || SCREEN.stations[0]);
        const d = (p.x - x) ** 2 + (p.y + 30 - y) ** 2;
        if (d < bd) { bd = d; best = { type: 'station', id }; }
      });
      return best;
    },
    anchor(kind, id) {
      if (id === undefined) { id = kind; kind = 'station'; }
      if (kind === 'coins') return at(SCREEN.coins);
      if (kind === 'station') {
        const i = typeof id === 'number' ? id : ids().indexOf(id);
        return SCREEN.stations[i] ? at(SCREEN.stations[i]) : null;
      }
      if (kind === 'table') {
        const i = game.state.tables.findIndex((t) => t.id === id);
        return SCREEN.tables[i] ? at(SCREEN.tables[i]) : null;
      }
      return null;
    },
    setQuality() {},
    setInsets() {},
    setAutoQuality() {},
    stats() { return { fps: 0, frameMs: 0, calls: 0, tris: 0, quality: 'low' }; },
    resize() {},
  };
}
