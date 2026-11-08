// ui-lab driver: ?screen=<name> loads a fixture; ?live=1 ("Canlı") runs game.tick on rAF so the whole FTUE is playable
// without 3D (?screen=new starts a fresh game). ?safe=0 drops the fake iPhone insets, ?rm=1 forces reduced motion.
import * as game from '../../game/index.js';
import { on } from '../../bus.js';
import { createUI } from '../index.js';
import { createFakeScene } from './fake-scene.js';
import { FIXTURES, SCREENS } from './fixtures.js';

const q = new URLSearchParams(location.search);
const stage = document.getElementById('stage');
const uiRoot = document.getElementById('ui');
if (q.get('safe') !== '0') document.documentElement.classList.add('lab-safe');
if (q.get('rm') === '1') document.documentElement.classList.add('reduce-motion');

let s = null;
const prefsVal = { sfx: true, music: true, quality: q.get('q') === 'low' ? 'low' : 'high', downgraded: q.get('down') === '1' };
const scene = createFakeScene(stage, () => s);
const ui = createUI(uiRoot, {
  scene,
  getState: () => s,
  prefs: { get: () => prefsVal, set: (k, v) => { prefsVal[k] = v; if (k === 'quality') prefsVal.downgraded = false; } },
  reset: () => { load('new'); },
});
if (q.get('rm') === '1') ui.setReducedMotion(true);
ui.loading.set(1);
ui.loading.hide();

let live = q.get('live') === '1';
let screen = q.get('screen') || 'calm';

function load(name) {
  screen = name;
  const f = FIXTURES[name];
  if (name === 'new' || !f) {
    s = game.newState();
    live = true;
  } else s = f.state();
  Object.assign(ui.view, { tab: 'city', sel: null, settings: false, news: false, accept: null });
  const v = (f && f.ui) || {};
  ui.render(s, performance.now());
  if (v.tab) ui.openTab(v.tab);
  if (v.sel != null) ui.selectDistrict(v.sel);
  if (v.settings) ui.view.settings = true;
  if (v.news) ui.view.news = true;
  if (v.accept) ui.ctx.setAccept(v.accept);
  if (v.title) ui.ctx.titleApi.show(performance.now(), 1e9);
  ui.ctx.dirty = true;
  ui.render(s, performance.now());
  if (v.confirm) {
    const cell = document.querySelector('[data-key="selectTenderCell:2:2"]');
    if (cell) cell.click();
    const cta = document.querySelector('[data-key="submitTender"]');
    if (cta) cta.click();
  }
  if (v.reset) {
    const b = [...document.querySelectorAll('.sheet-settings .btn.danger')][0];
    if (b) b.click();
  }
  document.title = `ui-lab · ${name}`;
  window.lab.state = s;
}

// taps on the backdrop = taps on the 3D city
stage.addEventListener('click', (e) => {
  if (!s) return;
  if (s.phase === 'attack') {
    game.act(s, 'skipAttack');
    return;
  }
  const p = scene.pick(e.clientX, e.clientY);
  if (p && p.type === 'district') ui.selectDistrict(p.id);
  else ui.closeSheet();
});

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (live && s) game.tick(s, dt);
  scene.tick(s);
  ui.render(s, now);
  if (rafOn) requestAnimationFrame(loop);
}
// ?raf=0: no render loop (tests drive time with lab.step, which renders once)
const rafOn = q.get('raf') !== '0';

window.lab = {
  ui, scene, screens: SCREENS, game,
  get state() { return s; },
  set state(v) { s = v; },
  load,
  live(onOff) { live = !!onOff; },
  step(sec = 1) {
    for (let t = 0; t < sec - 1e-9; t += 0.05) game.tick(s, 0.05);
    ui.ctx.dirty = true;
    scene.tick(s);
    ui.render(s, performance.now());
  },
  events: [],
};
for (const ev of ['toast', 'sfx', 'action', 'dispatch', 'payment', 'sale']) on(ev, (p) => window.lab.events.push([ev, p]));

// optional toolbar (wide windows, or ?bar=1)
if (q.get('bar') === '1' || (q.get('bar') !== '0' && innerWidth > 640)) {
  const bar = document.getElementById('labbar');
  bar.hidden = false;
  const sel = bar.querySelector('select');
  for (const n of ['new', ...SCREENS]) {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = n;
    sel.appendChild(o);
  }
  sel.value = screen;
  sel.addEventListener('change', () => {
    history.replaceState(null, '', `?screen=${sel.value}${live ? '&live=1' : ''}`);
    load(sel.value);
  });
  const cb = bar.querySelector('input');
  cb.checked = live;
  cb.addEventListener('change', () => { live = cb.checked; });
}

load(screen);
requestAnimationFrame(loop);
if (!rafOn) setInterval(() => { scene.tick(s); ui.render(s, performance.now()); }, 100);
