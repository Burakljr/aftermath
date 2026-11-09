// Aftermath v2 UI: boot veil "Saha hazırlanıyor" (visible from createUI until main hides it). On the first-launch tap
// prompt it becomes key art (review 2 F17): the live dusk city shows through a dark gradient, with the wordmark and the
// tagline over it and the tap pill at the bottom. No extra download: the 3D scene behind it is already built.
import { h, S } from './dom.js';

export function createLoading(ctx) {
  const fill = h('i');
  const line = h('div.loading__line', { text: 'Saha hazırlanıyor' });
  const tag = h('div.loading__tag', { text: ctx.game.TITLE.tagline });
  const box = h('div.loading',
    h('div.loading__brand', { text: 'AFTERMATH' }),
    h('div.loading__sub', { text: 'Enkaz ve leş kaldırma' }),
    tag,
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
      // main.start() (tests, resumed games) may hide the veil while the first-launch prompt is still up: the key-art
      // mode must end with it, or the whole UI stays hidden behind #ui.veil-art
      ctx.root.classList.remove('veil-art');
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
      ctx.root.classList.add('veil-art');
      box.setAttribute('data-key', 'start');
      return new Promise((resolve) => {
        box.addEventListener('click', function go(e) {
          e.stopPropagation();
          box.removeEventListener('click', go);
          box.classList.remove('prompt');
          ctx.root.classList.remove('veil-art');
          box.removeAttribute('data-key');
          resolve();
        });
      });
    },
  };
}
