// Aftermath v2 UI: float texts (max 3, 900 ms, rise 24 px), part icons flying to the Depo tab slot (700 ms bezier,
// throttle 120 ms; before the tab exists they fly to its future slot), coin fly to the cash plate, the rare-part card,
// and the upkeep income pill under the HUD (outside #hud / #objective, so it never counts as a HUD number).
import { h, icon } from './dom.js';
import { on } from '../bus.js';
import { flyArc, centre, reduced } from './motion.js';
import { ITEM_ICON } from './panel-city.js';

const MAX_FLOATS = 3;
const KIND_CLASS = { part: 'part', stage: 'stage', clean: 'clean', spread: 'spread', income: 'income' };

export function createFloats(ctx) {
  const world = ctx.L.world;
  const fly = ctx.L.fly;
  const P = { x: 0, y: 0, visible: false };
  const live = [];
  let lastPart = 0;
  const queue = [];

  function at(sector) {
    if (sector == null) return null;
    ctx.project(`district:${sector}`, P);
    return P.visible ? { x: P.x, y: P.y } : null;
  }
  /** float origin: 8 px above the district chip when one is shown (review V4), else above the anchor */
  function floatAt(sector) {
    const c = sector != null && ctx.chipTop ? ctx.chipTop(sector) : null;
    if (c) return { x: c.x, y: c.y - 8, chip: true };
    const p = at(sector);
    return p ? { x: p.x, y: p.y - 40, chip: false } : null;
  }

  // each district has its own lane: floats born together over one chip stack upward instead of overprinting
  const lanes = new Map();
  function addFloat(text, pt, kind, sector) {
    if (!pt) return;
    while (live.length >= MAX_FLOATS) live.shift().remove();
    const now = performance.now();
    const key = sector == null ? -1 : sector;
    const lane = lanes.get(key) || { t: -1e9, n: 0 };
    lane.n = now - lane.t < 700 ? (lane.n + 1) % MAX_FLOATS : 0;
    lane.t = now;
    lanes.set(key, lane);
    const el = h(`div.float${KIND_CLASS[kind] ? `.${KIND_CLASS[kind]}` : ''}`, { text });
    el.style.transform = `translate3d(${pt.x.toFixed(1)}px,${(pt.y - 22 - lane.n * 22).toFixed(1)}px,0)`;
    world.appendChild(el);
    live.push(el);
    setTimeout(() => {
      el.remove();
      const i = live.indexOf(el);
      if (i >= 0) live.splice(i, 1);
    }, 950);
  }

  function income(text) {
    const el = h('div.income-pill', icon('t-up', 14), h('span', { text }));
    ctx.L.fly.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function depotTarget() {
    const slot = ctx.tabsApi && ctx.tabsApi.slot('depot');
    return centre(slot) || { x: 390 * 0.375, y: (ctx.root.clientHeight || 844) - 40 };
  }

  function flyItem(item, from) {
    if (!from || reduced()) return;
    const el = h('div.flyer', icon(ITEM_ICON[item] || 'g-crate', 22));
    fly.appendChild(el);
    const anim = flyArc(el, from, depotTarget(), { duration: 700, lift: 70, scaleTo: 0.7 });
    if (anim) anim.addEventListener('finish', () => ctx.tabsApi && ctx.tabsApi.bump('depot'));
  }

  on('float', ({ sector, text, kind }) => {
    if (kind === 'income') {
      income(text);
      return;
    }
    addFloat(text, floatAt(sector), kind, sector);
  });
  on('part', ({ sectorId, item }) => {
    const f = floatAt(sectorId);
    queue.push({ item, from: f ? { x: f.x, y: f.y - 24 } : null }); // the icon starts above the chip, not on its name
  });
  on('rare', ({ sectorId, item }) => rareCard(item, at(sectorId)));
  /** coins arc between a button and the cash plate. dir 'in' (earn) or 'out' (spend) */
  function coinsFrom(el, dir = 'in', n = 5) {
    if (reduced()) return;
    const cash = centre(ctx.hud && ctx.hud.cashEl);
    if (!cash) return;
    const src = centre(el) || { x: (ctx.root.clientWidth || 390) / 2, y: (ctx.root.clientHeight || 844) * 0.7 };
    for (let i = 0; i < n; i++) {
      const c = h('div.fly-coin', icon('g-lira', 20));
      fly.appendChild(c);
      const jitter = { x: src.x + (i - n / 2) * 9, y: src.y + (i % 2) * 6 };
      const a = dir === 'in' ? jitter : cash;
      const b = dir === 'in' ? cash : jitter;
      flyArc(c, a, b, { duration: 620, lift: 60 + i * 12, scaleTo: 0.75, delay: i * 55 });
    }
  }

  // the rare card holds 1.5 s of game time, then flies to the Depo slot (review 2 m5: it ran on the wall clock and could
  // cross the receipt); a full-screen sheet removes it and any part icon still in flight
  let rare = null;
  function rareCard(item, pt) {
    const names = { eye: 'Göz', dna: 'Etiketsiz tüp' };
    const W = ctx.root.clientWidth || 390;
    const p = pt || { x: W / 2, y: ctx.band.top + 120 };
    const card = h('div.rare-card', h('span.rare-card__glow'), h('span.tile.rare', icon(ITEM_ICON[item] || 't-dna', 28, 'c-sinyal')),
      h('div', h('div.rare-card__k', { text: 'Nadir parça' }), h('div.rare-card__n', { text: names[item] || 'Nadir parça' })));
    const x = Math.max(110, Math.min(W - 110, p.x));
    const y = Math.max(ctx.band.top + 60, p.y - 90);
    card.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
    fly.appendChild(card);
    if (rare) rare.card.remove();
    const st = ctx.s;
    rare = { card, x, y, t0: st ? st.clock : null, w0: performance.now(), flown: false };
  }
  function rareStep(s) {
    if (!rare) return;
    const age = rare.t0 != null && s ? s.clock - rare.t0 : (performance.now() - rare.w0) / 1000;
    if (!rare.flown && age >= 1.5) {
      rare.flown = true;
      if (reduced()) { rare.card.remove(); rare = null; return; }
      const anim = flyArc(rare.card, { x: rare.x, y: rare.y }, depotTarget(), { duration: 700, lift: 40, scaleTo: 0.25 });
      const c = rare.card;
      if (anim) anim.addEventListener('finish', () => { c.remove(); if (rare && rare.card === c) rare = null; });
      else { c.remove(); rare = null; }
    }
  }
  function clearFlights() {
    if (rare) { rare.card.remove(); rare = null; }
    for (const el of fly.querySelectorAll('.flyer, .rare-card')) el.remove();
  }

  return {
    coinsFrom,
    flyItem,
    frame(s, now) {
      // part icons never fly across a full-screen sheet (the receipt): pending flights are dropped (playtest M9)
      if (ctx.activeSheet && ctx.activeSheet !== 'district' && ctx.activeSheet !== 'upkeep') {
        queue.length = 0;
        if (rare || fly.querySelector('.flyer')) clearFlights();
      }
      rareStep(s);
      if (queue.length && now - lastPart >= 120) {
        lastPart = now;
        const q = queue.shift();
        flyItem(q.item, q.from);
      }
      if (queue.length > 12) queue.splice(0, queue.length - 12);
    },
  };
}
