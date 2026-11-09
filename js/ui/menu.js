// Bottom of the screen: the next-goal pill and the menu bar with three big
// square buttons (Upgrades, Goals, Factories) with notification badges.
import { el, icon, otext, setText, toggle, onTap, pulse } from './dom.js';

const BUTTONS = [
  { id: 'upgrades', icon: 'wrench', color: 'green', label: 'menu.upgrades' },
  { id: 'goals', icon: 'target', color: 'orange', label: 'menu.goals' },
  { id: 'factories', icon: 'factory', color: 'blue', label: 'menu.factories' },
];

export function createMenu(ctx, pill) {
  const bar = el('div', 'menu');
  const btns = {};
  for (const b of BUTTONS) {
    const label = otext('mbtn-label');
    const dot = otext('mbtn-dot num');
    const btn = el('button', `mbtn b3 b3-${b.color}`, { type: 'button', 'data-menu': b.id }, [icon(b.icon, 'mbtn-ico'), label, dot]);
    onTap(btn, () => { pulse(btn, 'press'); ctx.openMenu(b.id); });
    bar.appendChild(btn);
    btns[b.id] = { btn, label, dot, key: b.label, n: -1 };
  }
  const root = el('div', 'bottom', null, [pill, bar]);
  ctx.layers.panels.appendChild(root);
  root.addEventListener('pointerdown', (e) => { if (e.target === root) return; e.stopPropagation(); });

  let t = 0;
  function update(dt = 0) {
    t -= dt;
    if (t > 0) return;
    t = 0.2;
    const g = ctx.game;
    // upgrades: how many stations can be upgraded right now (green badge)
    const hints = ctx.upgradeHints();
    let nUp = 0;
    for (const k in hints) if (hints[k]) nUp++;
    for (let i = 0; i < g.state.factory.stations.length; i++) {
      const v = g.select.stationView(i);
      if (v && v.canOpen && v.canAfford) nUp++;
    }
    setDot(btns.upgrades, nUp);
    setDot(btns.goals, ctx.goalsDone());
    const f = g.select.factory();
    setDot(btns.factories, f.complete && !f.isLast ? 1 : 0);
  }
  function setDot(b, n) {
    if (b.n === n) return;
    if (n > b.n && n > 0) pulse(b.dot, 'pop');
    b.n = n;
    toggle(b.dot, 'is-on', n > 0);
    setText(b.dot, String(n));
  }

  function relabel() {
    for (const k in btns) {
      setText(btns[k].label, ctx.tx(btns[k].key));
      btns[k].btn.setAttribute('aria-label', ctx.tx(btns[k].key));
    }
  }

  return {
    root, update, relabel,
    top: () => root.getBoundingClientRect().top,
    button: (id) => (btns[id] ? btns[id].btn : null),
  };
}
