// Aftermath v2 UI: progressive tab bar (DESIGN §5.8). Şehir, then Depo, Fabrika, Şirket drop in as they unlock.
// Hidden tabs keep their slot so part icons can fly to the future Depo slot. At most one red dot (selector rule).
import { h, icon, T, C, A, tap, pulseClass } from './dom.js';
import { dropIn, createUnlockCard } from './unlock.js';

const DEF = [
  { id: 'city', label: 'Şehir', icon: 't-map' },
  { id: 'depot', label: 'Depo', icon: 't-warehouse' },
  { id: 'factory', label: 'Fabrika', icon: 't-factory' },
  { id: 'company', label: 'Şirket', icon: 't-company' },
];

export function createTabs(ctx) {
  const items = {};
  const bar = h('nav.tabs', { 'aria-label': 'Sekmeler' });
  for (const d of DEF) {
    const dot = h('i.tab__dot');
    const pill = h('span.tab__new.tag.new', { text: 'Yeni' });
    const badge = h('span.tab__count.num');
    const el = h('button.tab', { type: 'button', 'data-key': `tab:${d.id}`, 'data-dim': '' }, icon(d.icon, 24), h('span.tab__label', { text: d.label }), dot, pill, badge);
    tap(el, () => {
      if (!ctx.openTab(d.id)) {
        if (ctx.allows(`tab:${d.id}`)) ctx.refuse(el, null, false);
      }
    });
    items[d.id] = { el, dot, pill, badge, vis: null };
    bar.appendChild(el);
  }
  ctx.L.tabs.appendChild(bar);
  createUnlockCard(ctx);

  return {
    el: bar,
    slot(id) {
      return items[id] ? items[id].el : null;
    },
    bump(id) {
      const it = items[id];
      if (it) pulseClass(it.el, 'bump', 200);
    },
    update(s) {
      const list = ctx.game.tabs(s);
      for (const t of list) {
        const it = items[t.id];
        if (it.vis !== t.visible) {
          const first = it.vis === null;
          it.vis = t.visible;
          C(it.el, 'is-hidden', !t.visible);
          A(it.el, 'aria-hidden', t.visible ? null : 'true');
          if (t.visible && !first) dropIn(it.el);
        }
        C(it.el, 'on', ctx.view.tab === t.id && !ctx.view.settings);
        C(it.dot, 'show', t.dot && ctx.view.tab !== t.id);
        C(it.pill, 'show', t.isNew);
        C(it.el, 'is-dim', !ctx.allows(`tab:${t.id}`) && t.visible);
      }
      const n = Object.values(s.inv).reduce((a, b) => a + b, 0);
      T(items.depot.badge, n > 0 ? String(n) : '');
      C(items.depot.badge, 'show', n > 0 && !items.depot.pill.classList.contains('show'));
    },
  };
}
