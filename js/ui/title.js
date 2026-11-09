// Aftermath v2 UI: cold-open title card after the first attack (DESIGN §3 step 0): "AFTERMATH" stencil + tagline.
// Fades in, holds 1.2 s, fades out; tap skips. While it shows, the call card and notices wait (ctx.view.title).
import { h, tap } from './dom.js';

const HOLD = 2300;

export function createTitle(ctx) {
  const t = ctx.game.TITLE;
  const card = h('div.title-card',
    h('div.title-card__rule'),
    h('div.title-card__name', { text: t.name }),
    h('div.title-card__tag', { text: t.tagline }),
    h('div.title-card__meta', { text: 'Enkaz ve leş kaldırma' }));
  const root = h('button.title-wrap', { type: 'button', 'data-key': 'skip' }, card);
  ctx.L.broadcast.appendChild(root);
  let until = 0;
  let lastPhase = null;

  function show(now = performance.now(), hold = HOLD) {
    until = now + hold;
    ctx.view.title = true;
    root.classList.add('on');
    ctx.dirty = true;
  }
  function hide() {
    until = 0;
    ctx.view.title = false;
    root.classList.remove('on');
    ctx.dirty = true;
  }
  tap(root, () => hide());
  ctx.titleApi = { show, hide };

  return {
    update(s, now) {
      if (lastPhase === 'attack' && s.phase !== 'attack' && s.attack && s.attack.first) show(now);
      lastPhase = s.phase;
      if (until && now > until) hide();
    },
  };
}
