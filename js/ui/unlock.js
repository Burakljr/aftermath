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
  // review 2 m5: goal cards queue, wait while the receipt / tender sheet is open, and push the toasts below them
  const pending = [];
  let until = 0;
  on('goal', ({ id }) => {
    const g = ctx.game.goalById(id);
    if (!g || !g.reward) return;
    pending.push(g.reward);
  });
  return {
    card,
    update() {
      const t = performance.now();
      const sh = ctx.activeSheet;
      const blocked = sh === 'receipt' || sh === 'tender' || sh === 'depot' || sh === 'factory' || sh === 'company' || sh === 'settings' || ctx.modal;
      const on_ = card.classList.contains('on');
      // a sheet that opens over a showing card sends it back to the queue (it is shown again after the sheet)
      if (on_ && blocked && until - t > 900) { pending.unshift(reward.textContent); card.classList.remove('on'); }
      else if (on_ && t >= until) card.classList.remove('on');
      if (!card.classList.contains('on') && pending.length && !blocked) {
        T(reward, pending.shift());
        card.classList.add('on');
        until = t + 2600;
      }
      ctx.root.classList.toggle('goal-on', card.classList.contains('on'));
    },
  };
}
