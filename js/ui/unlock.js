// Aftermath v2 UI: unlock moments (DESIGN §8 "Unlock"). Tabs drop in (tabs.js calls dropIn); a finished goal shows a
// short "Hedef tamamlandı" card under the objective bar with its reward, so every unlock is named once.
import { h, icon, T } from './dom.js';
import { on } from '../bus.js';
import { reduced } from './motion.js';

export function dropIn(el) {
  if (reduced() || !el.animate) return;
  el.animate(
    [{ transform: 'translateY(-24px)', opacity: 0 }, { transform: 'translateY(3px)', opacity: 1, offset: 0.75 }, { transform: 'translateY(0)', opacity: 1 }],
    { duration: 260, easing: 'cubic-bezier(.22,.61,.36,1)' },
  );
}

export function createUnlockCard(ctx) {
  const reward = h('span.unlock__reward');
  const card = h('div.unlock.glass', icon('t-check', 18, 'c-temiz'), h('div', h('div.unlock__kicker', { text: 'Hedef tamamlandı' }), reward));
  ctx.L.bubble.appendChild(card);
  let timer = 0;
  on('goal', ({ id }) => {
    const g = ctx.game.goalById(id);
    if (!g || !g.reward) return;
    T(reward, g.reward);
    card.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(() => card.classList.remove('on'), 2600);
  });
  return card;
}
