// createUI(): the whole DOM UI on top of the 3D canvas.
// createUI({ root, game, scene, audio, canvas }) -> { update(dt), openCard(id), closeCard(), destroy() }
import { el, toggle } from './dom.js';
import { t as translate } from '../game/i18n.js';
import { formatNumber } from '../game/format.js';
import { SCREEN } from '../scene/layout.js';
import { createHUD } from './hud.js';
import { createMarks } from './marks.js';
import { createCard } from './card.js';
import { createGoals } from './goals.js';
import { createTutorial } from './tutorial.js';
import { createSettings } from './settings.js';
import { createComplete } from './complete.js';
import { createOffline } from './offline.js';
import { createFloats } from './floats.js';

export function createUI({ root, game, scene, audio, canvas } = {}) {
  if (!root) throw new Error('createUI needs a root element');
  root.classList.add('ui-root');
  const layers = {
    marks: el('div', 'layer layer-marks'),
    panels: el('div', 'layer layer-panels'),
    floats: el('div', 'layer layer-floats'),
    top: el('div', 'layer layer-top'),
    overlays: el('div', 'layer layer-overlays'),
  };
  for (const k of ['marks', 'panels', 'floats', 'top', 'overlays']) root.appendChild(layers[k]);

  const lang = () => game.state.settings.lang;
  const unsubs = [];

  const ctx = {
    game, scene, audio, root, layers, lang,
    tx: (key, params) => translate(lang(), key, params),
    num: (n) => formatNumber(n, lang()),
    sfx: (name) => { try { if (audio && game.state.settings.sound) audio.play(name); } catch { /* audio is optional */ } },
    anchor(id) {
      let a = null;
      try { a = scene && scene.anchor ? scene.anchor(id) : null; } catch { a = null; }
      if (a && Number.isFinite(a.x) && Number.isFinite(a.y)) return a;
      // fallback: design positions from the shared layout
      const W = window.innerWidth;
      const H = window.innerHeight;
      if (id === 'truck') return { x: SCREEN.truck.x * W, y: SCREEN.truck.y * H, visible: true };
      const i = game.state.factory.stations.findIndex((s) => s.id === id);
      const p = SCREEN.stations[i];
      return p ? { x: p.x * W, y: p.y * H - 40, visible: true } : null;
    },
  };

  // --- hints for the "upgrade ready" arrows (throttled)
  let hintCache = {};
  let hintT = 0;
  ctx.upgradeHints = () => hintCache;

  const hud = createHUD(ctx);
  const marks = createMarks(ctx);
  const goals = createGoals(ctx);
  const card = createCard(ctx);
  const floats = createFloats(ctx);
  const settings = createSettings(ctx);
  const offline = createOffline(ctx);
  const complete = createComplete(ctx);
  const tutorial = createTutorial(ctx);

  ctx.coinTarget = () => hud.coinTarget();
  ctx.hudBump = () => hud.bump();
  ctx.openSettings = () => { closeCard(); settings.open(); };
  ctx.cardOpen = () => card.isOpen();
  ctx.cardStation = () => card.station();
  ctx.cardButton = () => card.button();
  ctx.goalsRoot = () => goals.root;
  // offsetTop ignores the card's slide-in transform, so this is where the panel will be
  ctx.panelTop = () => (card.isOpen() ? card.root.offsetTop : goals.root.offsetTop);
  ctx.firstDoneGoal = () => goals.firstDoneTile();
  ctx.blockingModal = () => offline.isOpen() || settings.isOpen();
  ctx.modalOpen = () => offline.isOpen() || settings.isOpen() || complete.isOpen();
  ctx.closeCard = () => closeCard();
  ctx.stationPoint = (id) => {
    const m = marks.elementFor(id);
    if (m) {
      const target = game.state.factory.stations.find((s) => s.id === id);
      const e = target && target.open ? m.badge : m.sign;
      const r = e.getBoundingClientRect();
      // point just under the badge / at the tip of the sign's stem so the hand never hides the text
      if (r.width > 0) return { x: r.left + r.width / 2, y: r.bottom + (e === m.sign ? 10 : 2), h: 8, ring: { x: r.left + r.width / 2, y: r.top + r.height / 2 } };
    }
    const a = ctx.anchor(id);
    return a ? { x: a.x, y: a.y, h: 30 } : null;
  };
  ctx.coinBurst = (x, y, amount, n) => {
    floats.floatText(x, y - 10, '+' + ctx.num(amount), 'is-big');
    floats.coinFlight(x, y, n);
    ctx.sfx('claim');
  };
  ctx.hintGoal = (v) => {
    if (v.station) tutorial.pointAt(() => ctx.stationPoint(v.station));
    else if (v.type === 'allLevel') {
      const st = game.state.factory.stations;
      let low = null;
      for (const s of st) if (!low || (s.open ? s.level : 0) < (low.open ? low.level : 0)) low = s;
      if (low) tutorial.pointAt(() => ctx.stationPoint(low.id));
    } else if (v.type === 'sold' || v.type === 'income') {
      const b = game.select.bottleneck();
      if (b) tutorial.pointAt(() => ctx.stationPoint(b));
    }
  };
  ctx.tapStation = (id, source) => tapStation(id, source);

  function openCard(id) {
    if (ctx.modalOpen()) return;
    card.show(id);
    root.classList.add('card-open');
  }
  function closeCard() {
    card.hide();
    root.classList.remove('card-open');
  }

  function tapStation(id) {
    if (ctx.modalOpen()) return;
    const v = game.select.stationView(id);
    if (!v) return;
    if (v.open) {
      const r = game.act({ type: 'boost', station: id });
      ctx.sfx(r.ok ? 'boost' : 'tap');
    } else {
      ctx.sfx('tap');
    }
    openCard(id);
  }

  // --- taps on the 3D canvas
  function onCanvasDown(ev) {
    if (ev.button !== undefined && ev.button > 0) return;
    if (ctx.modalOpen()) return;
    let hit = null;
    try { hit = scene && scene.pick ? scene.pick(ev.clientX, ev.clientY) : null; } catch { hit = null; }
    if (hit && hit.type === 'station') tapStation(hit.id);
    else if (hit && hit.type === 'truck') { ctx.sfx('honk'); }
    else closeCard();
  }
  if (canvas) {
    canvas.addEventListener('pointerdown', onCanvasDown);
    unsubs.push(() => canvas.removeEventListener('pointerdown', onCanvasDown));
  }

  // --- first gesture unlocks audio
  const unlock = () => { try { if (audio && audio.unlock) audio.unlock(); } catch { /* ignore */ } };
  window.addEventListener('pointerdown', unlock, { capture: true });
  unsubs.push(() => window.removeEventListener('pointerdown', unlock, { capture: true }));
  if (audio && audio.setEnabled) audio.setEnabled(game.state.settings.sound);

  // --- game events -> feedback
  let saleAcc = 0;
  let saleT = 0;
  let coinT = 0;
  let tickT = 0;
  const on = (ev, fn) => unsubs.push(game.on(ev, fn));
  const stationName = (id) => {
    const sc = game.config().stations.find((s) => s.id === id);
    return sc ? ctx.tx(sc.nameKey) : id;
  };

  on('sold', (p) => {
    saleAcc += p.value;
    if (tickT <= 0) { ctx.sfx('coin'); tickT = 0.14; }
  });
  on('upgrade', (p) => {
    hintT = 0;
    if (p.milestone) {
      ctx.sfx('milestone');
      const pt = ctx.stationPoint(p.station);
      if (pt) floats.starBurst(pt.x, pt.y, 10, '#ffc93c');
      floats.toast(ctx.tx('toast.milestone', { station: stationName(p.station) }), 'is-star');
    } else ctx.sfx('upgrade');
  });
  on('open', (p) => {
    hintT = 0;
    ctx.sfx('open');
    setTimeout(() => {
      const pt = ctx.stationPoint(p.station);
      if (pt) { floats.starBurst(pt.x, pt.y, 12, '#ff5fa2'); floats.starBurst(pt.x, pt.y, 8, '#4cb8ff'); }
    }, 30);
    floats.toast(ctx.tx('toast.open', { station: stationName(p.station) }), 'is-open');
  });
  on('goal', (p) => {
    if (goals.tileFor(p.id)) {
      ctx.sfx('goal');
      floats.toast(ctx.tx('toast.goal'), 'is-goal');
    }
  });
  on('factoryStart', () => {
    closeCard();
    marks.rebuild();
    hintT = 0;
    floats.toast(ctx.tx(game.select.factory().nameKey), 'is-open');
  });
  on('setting', (p) => {
    if (p.key === 'lang') relabel();
    if (p.key === 'sound' && audio && audio.setEnabled) audio.setEnabled(p.value);
    if (p.key === 'quality' && scene && scene.setQuality) { try { scene.setQuality(p.value); } catch { /* ignore */ } }
  });

  function relabel() {
    try {
      document.documentElement.lang = lang();
      document.title = ctx.tx('app.title');
    } catch { /* ignore */ }
    hud.relabel(); marks.relabel(); goals.relabel(); card.relabel(); settings.relabel(); offline.relabel(); complete.relabel();
  }

  // --- tell the scene how much screen the UI covers
  let insetsDirty = true;
  // safe-area insets in px (the scene adds them itself, so we pass the UI part only)
  const safeProbe = el('div', 'safe-probe');
  root.appendChild(safeProbe);
  function syncInsets() {
    insetsDirty = false;
    if (!scene || !scene.setInsets) return;
    const cs = getComputedStyle(safeProbe);
    const safeTop = parseFloat(cs.paddingTop) || 0;
    const safeBottom = parseFloat(cs.paddingBottom) || 0;
    const top = Math.round(hud.bottom() + 6 - safeTop);
    const bottom = Math.round(window.innerHeight - goals.top() + 6 - safeBottom);
    try { scene.setInsets({ top, bottom, left: 4, right: 4 }); } catch { /* ignore */ }
  }
  const onResize = () => { insetsDirty = true; };
  window.addEventListener('resize', onResize);
  unsubs.push(() => window.removeEventListener('resize', onResize));

  function update(dt) {
    if (!(dt >= 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    if (insetsDirty) syncInsets();
    hintT -= dt;
    if (hintT <= 0) { hintT = 0.25; hintCache = game.select.hints(); }
    tickT -= dt;
    saleT -= dt;
    coinT -= dt;
    if (saleAcc > 0 && saleT <= 0) {
      saleT = 0.3;
      const a = ctx.anchor('truck');
      if (a && a.visible !== false) {
        floats.floatText(a.x, a.y - 30, '+' + ctx.num(saleAcc));
        if (coinT <= 0) { coinT = 0.45; floats.coinFlight(a.x, a.y - 20, 1); }
      }
      saleAcc = 0;
    }
    hud.update(dt);
    marks.update(dt);
    goals.update(dt);
    card.update(dt);
    floats.update(dt);
    offline.update(dt);
    complete.update(dt);
    settings.update(dt);
    tutorial.update(dt);
    toggle(root, 'has-modal', ctx.modalOpen());
  }

  relabel();
  update(0);

  return {
    update,
    openCard,
    closeCard,
    openSettings: () => ctx.openSettings(),
    tapStation,
    relabel,
    destroy() {
      for (const u of unsubs) { try { u(); } catch { /* ignore */ } }
      root.innerHTML = '';
    },
  };
}
