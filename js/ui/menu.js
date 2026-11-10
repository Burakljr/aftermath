// Bottom bar under the next-goal pill: Upgrades, Goals, Places (+ small count badges).
import { el, icon, onTap, setText, toggle } from './dom.js';

export function createMenu(ctx, goalPill) {
  const defs = [
    { id: 'upgrades', icon: 'upgrades', key: 'menu.upgrades' },
    { id: 'goals', icon: 'goals', key: 'menu.goals' },
    { id: 'places', icon: 'places', key: 'menu.places' },
  ];
  const btns = {};
  const bar = el('div', 'menu');
  for (const d of defs) {
    const label = el('span', 'l');
    const dot = el('span', 'dot is-hidden');
    const b = el('button', 'menu-btn', { type: 'button', 'data-menu': d.id }, [icon(d.icon), label, dot]);
    onTap(b, () => ctx.openMenu(d.id));
    bar.appendChild(b);
    btns[d.id] = { b, label, dot, key: d.key };
  }
  const root = el('div', 'bottom', null, [goalPill, bar]);
  ctx.layers.panels.appendChild(root);

  let t = 0;
  return {
    root,
    bar,
    update(dt) {
      t -= dt;
      if (t > 0) return;
      t = 0.25;
      // count of purchases worth making now (shown when there is a clear best one)
      const hints = ctx.upgradeHints();
      let best = false;
      let count = 0;
      for (const k in hints) { count++; if (hints[k] === 'best') best = true; }
      const g = ctx.game;
      const nextOpen = g.state.stations.findIndex((s, i) => !s.open && (i === 0 || g.state.stations[i - 1].open));
      if (nextOpen >= 0 && g.state.money >= g.config().stations[nextOpen].openCost) { best = true; count++; }
      toggle(btns.upgrades.dot, 'is-hidden', !best);
      setText(btns.upgrades.dot, String(count));
      const n = ctx.goalsCollectable();
      toggle(btns.goals.dot, 'is-hidden', !n);
      setText(btns.goals.dot, String(n));
      const done = g.state.complete;
      toggle(btns.places.dot, 'is-hidden', !done);
      setText(btns.places.dot, '1');
    },
    relabel() { for (const k in btns) setText(btns[k].label, ctx.tx(btns[k].key)); },
    button: (id) => (btns[id] ? btns[id].b : null),
  };
}
