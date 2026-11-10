// createUI(): the whole DOM UI on top of the 3D restaurant.
// createUI({ root, game, scene, audio, canvas }) -> { update(dt), openCard(id), closeCard(),
//   openSettings(), openMenu('upgrades'|'goals'|'places'), tapStation(id), relabel(),
//   setScene(scene), destroy() }
// The scene only needs anchor(kind, id) and pick(x, y) (see docs/ARCH.md); stats() for the
// FPS meter and setQuality(q) for the settings are optional.
import { el, toggle, ICONS, dishIcon } from './dom.js';
import { t as translate } from '../game/i18n.js';
import { formatNumber } from '../game/format.js';
import { DISHES } from '../game/config.js';
import { createHUD } from './hud.js';
import { createMarks } from './marks.js';
import { createBubbles } from './bubbles.js';
import { createCard } from './card.js';
import { createGoals } from './goals.js';
import { createMenu } from './menu.js';
import { createUpgrades } from './upgrades.js';
import { createPlaces } from './places.js';
import { createTutorial } from './tutorial.js';
import { createSettings } from './settings.js';
import { createComplete } from './complete.js';
import { createOffline } from './offline.js';
import { createFloats } from './floats.js';

export function createUI({ root, game, scene, audio, canvas } = {}) {
  if (!root) throw new Error('createUI needs a root element');
  root.classList.add('ui-root');
  const layers = {};
  for (const k of ['marks', 'bubbles', 'panels', 'top', 'overlays', 'floats']) {
    layers[k] = el('div', 'layer layer-' + k);
    root.appendChild(layers[k]);
  }

  const lang = () => game.state.settings.lang;
  const unsubs = [];
  let hintCache = {};
  let hintT = 0;

  const ctx = {
    game, scene, audio, root, layers, lang,
    icons: ICONS,
    dishIcon,
    tx: (key, params) => translate(lang(), key, params),
    num: (n) => formatNumber(n, lang()),
    sfx: (name) => { try { if (audio && game.state.settings.sound) audio.play(name); } catch { /* audio is optional */ } },
    anchor(kind, id) {
      let a = null;
      try { a = ctx.scene && ctx.scene.anchor ? ctx.scene.anchor(kind, id) : null; } catch { a = null; }
      return a && Number.isFinite(a.x) && Number.isFinite(a.y) ? a : null;
    },
    upgradeHints: () => hintCache,
  };

  ctx.openMenu = (id) => openMenu(id);
  ctx.openSettings = () => { closeCard(); closePanels(); settings.open(); };
  ctx.openCard = (id) => openCard(id);
  ctx.closeCard = () => closeCard();
  ctx.closePanels = () => closePanels();

  const hud = createHUD(ctx);
  const marks = createMarks(ctx);
  const bubbles = createBubbles(ctx);
  const goals = createGoals(ctx);
  const menu = createMenu(ctx, goals.pill);
  const card = createCard(ctx);
  const floats = createFloats(ctx);
  const upgrades = createUpgrades(ctx);
  const places = createPlaces(ctx);
  const settings = createSettings(ctx);
  const offline = createOffline(ctx);
  const complete = createComplete(ctx);
  const tutorial = createTutorial(ctx);
  const menus = { upgrades, goals, places };

  ctx.coinTarget = () => hud.coinTarget();
  // distance of the toast from the screen bottom: above the card or the goal pill
  ctx.toastBottom = () => {
    if (panelOpen()) return 'sheet'; // a menu sheet covers the bottom: a slim banner at the top
    if (tutorial.bubbleShown()) return null; // never over a tutorial bubble: under the HUD
    const h = window.innerHeight;
    const top = card.isOpen() ? card.root.offsetTop : menu.root.offsetTop;
    return Math.max(80, h - top + 12);
  };
  ctx.hudBump = () => hud.bump();
  ctx.goalsCollectable = () => goals.collectable();
  ctx.cardStation = () => card.station();
  ctx.cardButton = () => card.button();
  const panelOpen = () => upgrades.isOpen() || goals.isOpen() || places.isOpen();
  const modals = { offline, settings, complete };
  ctx.modalOpen = () => offline.isOpen() || settings.isOpen() || complete.isOpen() || panelOpen();
  ctx.blockingModal = () => offline.isOpen() || settings.isOpen() || complete.isOpen();
  ctx.otherModalOpen = (name) => {
    for (const k in modals) if (k !== name && modals[k].isOpen()) return true;
    return false;
  };
  ctx.coinBurst = (x, y, value, n) => {
    floats.floatText(x, y - 16, '+' + ctx.num(value), { big: true });
    floats.coinFlight(x, y, n);
    ctx.sfx('claim');
  };
  ctx.hintGoal = (v) => {
    let id = v.station;
    if (!id) {
      // tables / cooks / speed live in the Upgrades panel; served: the newest station
      if (v.type === 'tables' || v.type === 'cooks' || v.type === 'cookSpeed') { openMenu('upgrades'); return; }
      const open = game.state.stations.filter((s) => s.open);
      id = open.length ? open[open.length - 1].id : null;
    }
    if (id) tutorial.pointAtStation(id);
  };

  function openCard(id) {
    if (ctx.modalOpen()) return;
    card.show(id);
    toggle(root, 'card-open', true);
  }
  function closeCard() {
    card.hide();
    toggle(root, 'card-open', false);
  }
  function closePanels() {
    for (const k in menus) if (menus[k].isOpen()) menus[k].close();
  }
  function openMenu(id) {
    const m = menus[id];
    if (!m) return;
    if (offline.isOpen() || complete.isOpen() || settings.isOpen()) return;
    closeCard();
    for (const k in menus) if (k !== id && menus[k].isOpen()) menus[k].close();
    if (!m.isOpen()) ctx.sfx('swish');
    m.open();
  }

  function tapStation(id) {
    if (ctx.modalOpen()) return;
    const s = game.state.stations.find((x) => x.id === id);
    if (!s) return;
    if (s.open) {
      const r = game.act({ type: 'boost', station: id });
      ctx.sfx(r.ok ? 'boost' : 'tap');
    } else ctx.sfx('tap');
    openCard(id);
  }

  // --- taps on the 3D restaurant
  function onCanvasDown(ev) {
    if (ev.button !== undefined && ev.button > 0) return;
    if (ctx.modalOpen()) return;
    let hit = null;
    try { hit = ctx.scene && ctx.scene.pick ? ctx.scene.pick(ev.clientX, ev.clientY) : null; } catch { hit = null; }
    if (hit && hit.type === 'station') { tapStation(hit.id); return; }
    closeCard();
    if (!hit) return;
    if (hit.type === 'table') {
      const owned = game.state.tables.find((t) => t.id === hit.id);
      if (owned && !owned.owned) {
        // the next table to buy: buy it at once when affordable, otherwise show the price list
        const tv = game.select.tableView();
        if (tv.next === hit.id && tv.canAfford && game.act({ type: 'buyTable' }).ok) return;
        ctx.sfx('tap');
        openMenu('upgrades');
        return;
      }
      floats.toast(ctx.tx('info.table'), 'table');
    } else if (hit.type === 'customer') {
      const c = game.state.customers.find((x) => x.id === hit.id);
      if (c && c.dish && DISHES[c.dish]) floats.toast(ctx.tx('info.guest', { dish: ctx.tx(DISHES[c.dish].nameKey) }), dishIcon(c.dish));
    } else if (hit.type === 'cook') floats.toast(ctx.tx('info.cook'), 'chef');
    ctx.sfx('tap');
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
  const on = (ev, fn) => unsubs.push(game.on(ev, fn));
  const stationName = (id) => {
    const sc = game.config().stations.find((s) => s.id === id);
    return sc ? ctx.tx(sc.nameKey) : id;
  };
  let flyT = 0;
  let serveT = 0;
  on('pay', (p) => {
    const a = ctx.anchor('customer', p.customer);
    if (a && a.visible !== false && !ctx.modalOpen()) {
      // the newest (most valuable) dish pays a bigger "+coins"
      const st = game.state.stations;
      let newest = null;
      for (let i = 0; i < st.length; i++) if (st[i].open) newest = st[i].id;
      floats.floatText(a.x, a.y - 20, '+' + ctx.num(p.value), { pay: true, rich: p.station === newest && st.length > 1 && st[1].open });
      if (flyT <= 0) { flyT = 0.3; floats.coinFlight(a.x, a.y - 20, 1, true); }
      else ctx.sfx('coin');
    } else ctx.sfx('coin');
  });
  on('serve', () => { if (serveT <= 0) { serveT = 0.25; ctx.sfx('serve'); } });
  on('upgrade', (p) => {
    hintT = 0;
    if (p.milestone) {
      ctx.sfx('milestone');
      floats.toast(ctx.tx('toast.milestone', { station: stationName(p.station) }), 'bolt');
    } else ctx.sfx('upgrade');
  });
  on('open', (p) => {
    hintT = 0;
    ctx.sfx('open');
    floats.toast(ctx.tx('toast.open', { station: stationName(p.station) }), dishIcon(game.config().stations.find((s) => s.id === p.station).dish));
  });
  on('buyTable', () => { hintT = 0; ctx.sfx('upgrade'); floats.toast(ctx.tx('toast.table'), 'table'); });
  on('hire', () => { hintT = 0; ctx.sfx('open'); floats.toast(ctx.tx('toast.hire'), 'chef'); });
  on('cookSpeed', () => { hintT = 0; ctx.sfx('upgrade'); floats.toast(ctx.tx('toast.speed'), 'boot'); });
  on('goal', (p) => {
    if (game.select.goalViews().some((v) => v.id === p.id)) {
      ctx.sfx('goal');
      floats.toast(ctx.tx('toast.goal'), 'star');
    }
  });
  on('locationStart', () => {
    closeCard();
    closePanels();
    marks.rebuild();
    bubbles.clear();
    upgrades.rebuild();
    hintT = 0;
    relabel();
    floats.toast(ctx.tx(game.select.location().nameKey), 'places');
  });
  on('setting', (p) => {
    if (p.key === 'lang') relabel();
    if (p.key === 'sound' && audio && audio.setEnabled) audio.setEnabled(p.value);
    if (p.key === 'quality' && ctx.scene && ctx.scene.setQuality) { try { ctx.scene.setQuality(p.value); } catch { /* ignore */ } }
  });

  function relabel() {
    try {
      document.documentElement.lang = lang();
      document.title = ctx.tx('app.title');
    } catch { /* ignore */ }
    hud.relabel(); marks.relabel(); goals.relabel(); menu.relabel(); card.relabel();
    upgrades.relabel(); places.relabel(); settings.relabel(); offline.relabel(); complete.relabel();
  }

  // --- optional: tell the scene how much of the screen the UI covers (top / bottom)
  const safeProbe = el('div', 'safe-probe');
  root.appendChild(safeProbe);
  let insetsT = 0;
  let lastInsets = '';
  function syncInsets() {
    if (!ctx.scene || !ctx.scene.setInsets) return;
    const cs = getComputedStyle(safeProbe);
    const safeTop = parseFloat(cs.paddingTop) || 0;
    const safeBottom = parseFloat(cs.paddingBottom) || 0;
    const top = Math.round(hud.bottom() + 6 - safeTop);
    const bottom = Math.round(window.innerHeight - menu.root.offsetTop + 6 - safeBottom);
    const key = top + ',' + bottom;
    if (key === lastInsets) return;
    lastInsets = key;
    try { ctx.scene.setInsets({ top, bottom, left: 4, right: 4 }); } catch { /* ignore */ }
  }

  function update(dt) {
    if (!(dt >= 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    insetsT -= dt;
    if (insetsT <= 0) { insetsT = 1; syncInsets(); }
    hintT -= dt;
    if (hintT <= 0) { hintT = 0.25; hintCache = game.select.hints(); }
    flyT -= dt;
    serveT -= dt;
    hud.update(dt);
    marks.update(dt);
    bubbles.update(dt);
    goals.update(dt);
    menu.update(dt);
    card.update(dt);
    upgrades.update(dt);
    places.update(dt);
    floats.update(dt);
    offline.update(dt);
    complete.update(dt);
    settings.update(dt);
    tutorial.update(dt);
    toggle(root, 'has-modal', ctx.modalOpen());
    toggle(root, 'has-menu', panelOpen());
  }

  relabel();
  update(0);

  return {
    update,
    openCard,
    closeCard,
    openSettings: () => ctx.openSettings(),
    openMenu,
    tapStation,
    relabel,
    setScene(s) { ctx.scene = s; lastInsets = ''; },
    // for tests and the lab
    debug: { ctx, hud, marks, bubbles, goals, menu, card, upgrades, places, settings, offline, complete, tutorial, floats },
    destroy() {
      for (const u of unsubs) { try { u(); } catch { /* ignore */ } }
      root.innerHTML = '';
    },
  };
}
