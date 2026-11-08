// Aftermath v2 UI: boot veil "Saha hazırlanıyor" (visible from createUI until main hides it).
import { h, S } from './dom.js';

export function createLoading(ctx) {
  const fill = h('i');
  const line = h('div.loading__line', { text: 'Saha hazırlanıyor' });
  const box = h('div.loading',
    h('div.loading__brand', { text: 'AFTERMATH' }),
    h('div.loading__sub', { text: 'Enkaz ve leş kaldırma' }),
    h('div.loading__bar', fill),
    line);
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
    /** main: replace the status line (boot error, or the first-launch "tap to start" so audio can open with the cold open) */
    line(text, kind = '') {
      line.textContent = text;
      line.className = `loading__line${kind ? ` ${kind}` : ''}`;
    },
    /** main: the whole veil becomes one tap target; resolves on the first tap */
    prompt(text) {
      this.line(text, 'tap');
      box.classList.add('prompt');
      box.setAttribute('data-key', 'start');
      return new Promise((resolve) => {
        box.addEventListener('click', function go(e) {
          e.stopPropagation();
          box.removeEventListener('click', go);
          box.classList.remove('prompt');
          box.removeAttribute('data-key');
          resolve();
        });
      });
    },
  };
}
