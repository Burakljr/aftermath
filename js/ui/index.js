// Aftermath v2 UI entry (ARCH §7.1): createUI(root, deps). DOM only; rules come from js/game, 3D from deps.scene.
import * as game from '../game/index.js';
import { on, emit } from '../bus.js';
import { SPRITE } from './sprite.js';
import { buildLayers, measureBand } from './layout.js';
import { shake, pulseClass, C } from './dom.js';
import { reduced, setReducedMotion } from './motion.js';
import { buzz } from './haptics.js';
import { createToasts } from './toasts.js';
import { createLoading } from './loading.js';
import { createHud } from './hud.js';
import { createObjective } from './objective.js';
import { createTabs } from './tabs.js';
import { createPanel } from './panel-city.js';
import { createDistrictSheet } from './district-sheet.js';
import { createUpkeepSheet } from './upkeep-sheet.js';
import { createTenderSheet } from './tender.js';
import { createReceipt } from './receipt.js';
import { createDepot } from './depot.js';
import { createFactory } from './factory.js';
import { createCompany } from './company.js';
import { createSettings } from './settings.js';
import { createNotices } from './notices.js';
import { createNpc } from './npc.js';
import { createWorld } from './world.js';
import { createFloats } from './floats.js';
import { createBroadcast } from './broadcast.js';
import { createTitle } from './title.js';
import { createFtueView } from './ftue-view.js';

const PANEL_MS = 100; // panels <= 10 Hz
const WORLD_MS = 33; // chips <= 30 Hz

function injectSprite() {
  if (document.getElementById('t-settings')) return;
  const holder = document.createElement('div');
  holder.innerHTML = SPRITE;
  const svg = holder.firstElementChild;
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  document.body.insertBefore(svg, document.body.firstChild);
}

const NO_SCENE = {
  project: (a, out) => {
    const o = out || {};
    o.x = 0; o.y = 0; o.visible = false;
    return o;
  },
  setHighlight() {}, frame() {}, setBand() {}, shake() {},
};

export function createUI(root, deps = {}) {
  injectSprite();
  root.classList.add('ui-root');
  root.setAttribute('lang', 'tr');
  const L = buildLayers(root);
  let scene = deps.scene || NO_SCENE;

  const ctx = {
    root, L, game, deps,
    get scene() { return scene; },
    s: deps.getState ? deps.getState() : null,
    now: 0,
    dirty: true,
    modal: false,
    band: { top: 104, bottom: 300 },
    view: { tab: 'city', sel: null, settings: false, news: false, accept: null, title: false },
    sfx: (name, arg) => emit('sfx', { name, arg }),
    allows: (key) => !ctx.s || game.ftueAllows(ctx.s, key),
    primaryOK: () => !ctx.modal,
    project: (anchor, out) => scene.project(anchor, out),
    act, refuse, selectDistrict, openTab, closeSheet,
    markDirty() { ctx.dirty = true; },
  };

  /** every player action goes through here: act -> toast + shake on a rule refusal, nothing on an FTUE refusal */
  function act(id, arg, el) {
    const s = ctx.s;
    if (!s) return { ok: false, code: 'nostate' };
    const r = game.act(s, id, arg);
    ctx.dirty = true;
    if (!r.ok && r.code === 'rule') refuse(el, r.reason, true);
    return r;
  }

  /** a refused tap: shake 6 px x 3, reason brightens 600 ms, error sound; toast only when no reason is on screen */
  function refuse(el, reason, toastIt) {
    if (el) {
      shake(el);
      const rs = el.querySelector && el.querySelector('.reason');
      if (rs && rs.offsetParent) pulseClass(rs, 'lit', 600);
      else if (reason) toastIt = true;
    }
    if (toastIt && reason) toasts.push(reason, 'bad');
    ctx.sfx('error');
    buzz('error');
  }

  function selectDistrict(id) {
    const s = ctx.s;
    if (!s) return;
    if (id == null) {
      closeSheet();
      return;
    }
    if (ctx.view.accept) {
      const type = ctx.view.accept;
      setAccept(null);
      act('dispatch', { type, sector: id }, null);
      return;
    }
    if (!ctx.allows(`select:${id}`)) return;
    const work = s.phase === 'cleanup' || s.phase === 'rival';
    const calm = s.phase === 'calm' && !s.result && s.progress.unlocked.upkeep;
    if (!work && !calm) return;
    if (ctx.view.tab !== 'city') ctx.view.tab = 'city';
    if (ctx.view.sel === id) return;
    ctx.view.sel = id;
    scene.setHighlight(id, 'select');
    scene.frame(`district:${id}`, { zoom: 'district', duration: 0.7 });
    ctx.sfx('click');
    ctx.dirty = true;
  }

  function closeSheet(force) {
    if (ctx.view.sel == null) return;
    if (!force && !ctx.allows('closeSheet')) return;
    ctx.view.sel = null;
    scene.setHighlight(null, 'select');
    scene.frame('city', { zoom: 'city', duration: 0.7 });
    ctx.dirty = true;
  }

  function setAccept(type) {
    ctx.view.accept = type;
    ctx.dirty = true;
    if (!type) scene.setHighlight(null, 'accept');
  }
  ctx.setAccept = setAccept;

  function openTab(id) {
    const s = ctx.s;
    if (!s) return false;
    const t = game.tabs(s).find((x) => x.id === id);
    if (!t || !t.visible) return false;
    if (!ctx.allows(`tab:${id}`)) return false;
    if (ctx.view.tab === id) return true;
    ctx.view.tab = id;
    ctx.view.settings = false;
    if (ctx.view.sel != null) closeSheet(true);
    setAccept(null);
    if (id !== 'city' && t.isNew) game.act(s, 'markSeen', { tab: id });
    ctx.sfx('tab');
    ctx.dirty = true;
    return true;
  }

  // ---------- components ----------
  const toasts = createToasts(ctx);
  ctx.toasts = toasts;
  const loading = createLoading(ctx);
  const floats = createFloats(ctx);
  ctx.fx = floats;
  const hud = createHud(ctx);
  ctx.hud = hud;
  const objective = createObjective(ctx);
  const tabs = createTabs(ctx);
  ctx.tabsApi = tabs;
  const panel = createPanel(ctx);
  const sheets = {
    district: createDistrictSheet(ctx),
    upkeep: createUpkeepSheet(ctx),
    tender: createTenderSheet(ctx),
    receipt: createReceipt(ctx),
    depot: createDepot(ctx),
    factory: createFactory(ctx),
    company: createCompany(ctx),
    settings: createSettings(ctx),
  };
  const notices = createNotices(ctx);
  const npc = createNpc(ctx);
  const world = createWorld(ctx);
  const broadcast = createBroadcast(ctx);
  const title = createTitle(ctx);
  const ftue = createFtueView(ctx);

  let activeSheet = null;
  function pickSheet(s) {
    const v = ctx.view;
    if (v.settings) return 'settings';
    if (s.phase === 'attack' || v.title) return null;
    if (s.phase === 'calm' && s.result) return 'receipt';
    if (s.phase === 'tender' && s.tender && s.tender.kind === 'bid') return 'tender';
    if (v.tab !== 'city') return v.tab;
    if (v.sel != null) {
      if (s.phase === 'cleanup' || s.phase === 'rival') return 'district';
      if (s.phase === 'calm' && s.progress.unlocked.upkeep) return 'upkeep';
    }
    return null;
  }
  function setSheet(name) {
    if (name === activeSheet) return;
    const prev = activeSheet ? sheets[activeSheet] : null;
    activeSheet = name;
    if (prev) {
      prev.el.classList.remove('on');
      prev.el.classList.add('off');
      if (prev.onHide) prev.onHide();
    }
    const next = name ? sheets[name] : null;
    if (next) {
      next.el.classList.remove('off');
      void next.el.offsetWidth;
      next.el.classList.add('on');
      if (next.onShow) next.onShow();
    }
    ctx.activeSheet = name;
  }

  // ---------- view bookkeeping on game events ----------
  let lastPhase = null;
  let lastResult = false;
  function syncView(s) {
    const resultNow = !!s.result;
    if (s.phase !== lastPhase || resultNow !== lastResult) {
      if (lastPhase !== null) {
        if (ctx.view.sel != null) closeSheet(true);
        setAccept(null);
        if (s.phase === 'tender' || s.phase === 'attack' || resultNow) ctx.view.tab = 'city';
      }
      lastPhase = s.phase;
      lastResult = resultNow;
      ctx.dirty = true;
    }
    if (ctx.view.sel != null && s.phase !== 'cleanup' && s.phase !== 'rival' && !(s.phase === 'calm' && s.progress.unlocked.upkeep)) closeSheet(true);
    // a tab that the FTUE step no longer allows falls back to the city
    if (ctx.view.tab !== 'city' && !game.ftueAllows(s, `tab:${ctx.view.tab}`) && s.progress.ftue !== 'done') {
      const t = game.tabs(s).find((x) => x.id === ctx.view.tab);
      if (!t || !t.visible) ctx.view.tab = 'city';
    }
    const rm = reduced();
    C(root, 'reduce-motion', rm);
  }

  on('dispatch', () => {
    buzz('dispatch');
    if (activeSheet === 'district') {
      sheets.district.flash();
      setTimeout(() => closeSheet(true), 150);
    }
  });
  on('hit', () => buzz('hit'));
  on('rare', () => buzz('rare'));
  on('clean', () => buzz('clean'));
  on('spread', () => buzz('spread'));
  on('contract-done', () => buzz('contract'));
  on('tender-result', () => buzz('reveal'));
  on('sale', () => buzz('sale'));
  on('purchase', () => buzz('purchase'));
  on('unlock', () => buzz('unlock'));
  on('stage-done', ({ stage }) => buzz(stage === 'fire' ? 'fireOut' : stage === 'rubble' ? 'roadOpen' : 'clean'));
  const dirtyOn = ['phase', 'call', 'tender-open', 'tender-result', 'contract-start', 'contract-done', 'payment', 'sale', 'purchase',
    'unlock', 'goal', 'ftue', 'notice', 'stage-done', 'clean', 'spread-warn', 'spread-cancel', 'spread', 'arrive', 'return', 'park',
    'factory-start', 'factory-done', 'offer', 'offer-expired', 'rival-start', 'rival-done', 'upkeep', 'npc', 'headline', 'recall', 'action'];
  for (const ev of dirtyOn) on(ev, () => { ctx.dirty = true; });

  // ---------- band ----------
  let bandKey = '';
  function updateBand(s) {
    const b = measureBand(root, L, s && s.phase === 'attack');
    const key = `${b.top}|${b.bottom}`;
    ctx.band = b;
    if (key !== bandKey) {
      bandKey = key;
      root.style.setProperty('--band-top', `${b.top}px`);
      root.style.setProperty('--band-bottom', `${b.bottom}px`);
      scene.setBand(b);
    }
  }

  let lastPanel = -1e9;
  let lastWorld = -1e9;
  const slow = [hud, objective, tabs, panel, notices, npc];

  function render(s, now = performance.now()) {
    if (!s) return;
    ctx.s = s;
    ctx.now = now;
    syncView(s);
    if (ctx.dirty || now - lastPanel >= PANEL_MS) {
      ctx.dirty = false;
      lastPanel = now;
      ctx.modal = notices.isOpen(s) || sheets.tender.confirmOpen() || sheets.settings.confirmOpen();
      C(root, 'modal-open', ctx.modal);
      const pr = deps.prefs && deps.prefs.get ? deps.prefs.get() : null;
      C(root, 'low-gfx', !!pr && pr.quality === 'low'); // UI-SPEC §7.4: no backdrop blur on the low preset
      title.update(s, now);
      setSheet(pickSheet(s));
      C(root, 'has-sheet', !!activeSheet);
      root.dataset.sheet = activeSheet || '';
      root.dataset.phase = s.phase;
      root.dataset.tab = ctx.view.tab;
      for (const c of slow) c.update(s, now);
      if (activeSheet) sheets[activeSheet].update(s, now);
      broadcast.update(s, now);
      ftue.update(s, now);
      updateBand(s);
    }
    if (now - lastWorld >= WORLD_MS) {
      lastWorld = now;
      world.frame(s, now);
      ftue.frame(s, now);
    }
    hud.frame(s, now);
    floats.frame(s, now);
    broadcast.frame(s, now);
    toasts.frame(s, now);
    if (activeSheet && sheets[activeSheet].frame) sheets[activeSheet].frame(s, now);
  }

  return {
    render,
    selectDistrict,
    openTab,
    closeSheet: () => closeSheet(false),
    band: () => ({ ...ctx.band }),
    loading,
    setScene(sc) {
      scene = sc || NO_SCENE;
      bandKey = '';
      ctx.dirty = true;
    },
    toast: (text, kind) => toasts.push(text, kind),
    /** quality / prefs changed outside (auto downgrade) */
    refresh() { ctx.dirty = true; },
    setReducedMotion,
    /** for tests and ui-lab: UI-only view flags */
    view: ctx.view,
    ctx,
  };
}
