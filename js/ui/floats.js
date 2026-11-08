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

  // floats born together over the same spot stack upward instead of printing on top of each other
  const stack = { t: -1e9, x: 0, y: 0, n: 0 };
  function addFloat(text, pt, kind) {
    if (!pt) return;
    while (live.length >= MAX_FLOATS) live.shift().remove();
    const now = performance.now();
    stack.n = now - stack.t < 450 && Math.abs(pt.x - stack.x) < 60 && Math.abs(pt.y - stack.y) < 60 ? (stack.n + 1) % MAX_FLOATS : 0;
    stack.t = now; stack.x = pt.x; stack.y = pt.y;
    const el = h(`div.float${KIND_CLASS[kind] ? `.${KIND_CLASS[kind]}` : ''}`, { text });
    el.style.transform = `translate3d(${pt.x.toFixed(1)}px,${(pt.y - 78 - stack.n * 24).toFixed(1)}px,0)`;
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
    addFloat(text, at(sector), kind);
  });
  on('part', ({ sectorId, item }) => {
    queue.push({ item, from: at(sectorId) });
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
    setTimeout(() => {
      if (reduced()) {
        card.remove();
        return;
      }
      flyArc(card, { x, y }, depotTarget(), { duration: 700, lift: 40, scaleTo: 0.25 });
    }, 1500);
  }

  return {
    coinsFrom,
    flyItem,
    frame(s, now) {
      if (queue.length && now - lastPart >= 120) {
        lastPart = now;
        const q = queue.shift();
        flyItem(q.item, q.from);
      }
      if (queue.length > 12) queue.splice(0, queue.length - 12);
    },
  };
}
