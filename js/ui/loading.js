// Aftermath v2 UI: boot veil "Saha hazırlanıyor" (visible from createUI until main hides it).
import { h, S } from './dom.js';

export function createLoading(ctx) {
  const fill = h('i');
  const box = h('div.loading',
    h('div.loading__brand', { text: 'AFTERMATH' }),
    h('div.loading__sub', { text: 'Enkaz ve leş kaldırma' }),
    h('div.loading__bar', fill),
    h('div.loading__line', { text: 'Saha hazırlanıyor' }));
  ctx.L.loading.appendChild(box);
  let visible = true;
  return {
    set(p) {
      S(fill, 'transform', `scaleX(${Math.max(0.04, Math.min(1, p || 0)).toFixed(3)})`);
    },
    show() {
      visible = true;
      box.classList.remove('off');
    },
    hide() {
      if (!visible) return;
      visible = false;
      box.classList.add('off');
    },
    get visible() {
      return visible;
    },
  };
}
