// Aftermath v2 UI: toasts (short status lines under the objective bar). Bus 'toast' + UI refusals.
import { h, icon } from './dom.js';
import { on } from '../bus.js';

const MAX = 2;
const LIFE = 2600;

export function createToasts(ctx) {
  const el = ctx.L.toasts;
  const items = [];

  function push(text, kind = '') {
    if (!text) return;
    // same text twice in a row: refresh instead of stacking
    const last = items[items.length - 1];
    if (last && last.text === text) {
      last.until = performance.now() + LIFE;
      return;
    }
    const node = h(`div.toast${kind ? `.${kind}` : ''}`, { role: 'status' },
      kind === 'bad' ? icon('t-alert', 18) : kind === 'good' ? icon('t-check', 18) : icon('t-info', 18),
      h('span', { text }));
    el.appendChild(node);
    items.push({ node, text, until: performance.now() + LIFE });
    while (items.length > MAX) drop(items[0]);
  }
  function drop(it) {
    const i = items.indexOf(it);
    if (i >= 0) items.splice(i, 1);
    it.node.classList.add('out');
    setTimeout(() => it.node.remove(), 200);
  }
  on('toast', ({ text, kind }) => push(text, kind));
  return {
    push,
    frame(s, now) {
      const t = performance.now();
      for (let i = items.length - 1; i >= 0; i--) if (items[i].until < t) drop(items[i]);
      void now;
    },
  };
}
