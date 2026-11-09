// "Factory complete" screen with reward and the "Next factory" button.
import { el, icon, setText, toggle, onTap } from './dom.js';
import { formatInt } from '../game/format.js';
import { FACTORIES } from '../game/config.js';

const CONFETTI_COLORS = ['#ff5f8f', '#ffc93c', '#4cb8ff', '#35c46a', '#8b6cff', '#ff9a3c'];

export function createComplete(ctx) {
  const rays = el('div', 'cmp-rays');
  const confetti = el('div', 'cmp-confetti');
  for (let i = 0; i < 28; i++) {
    const c = el('i');
    c.style.left = `${(i * 37) % 100}%`;
    c.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    c.style.animationDelay = `${(i % 7) * 0.22}s`;
    c.style.animationDuration = `${2.4 + (i % 5) * 0.35}s`;
    confetti.appendChild(c);
  }
  const trophy = el('div', 'cmp-trophy', null, [icon('trophy')]);
  const title = el('div', 'cmp-title');
  const name = el('div', 'cmp-name');
  const soldLabel = el('span', 'cmp-stat-label');
  const soldNum = el('span', 'cmp-stat-num num');
  const rewardLabel = el('span', 'cmp-stat-label');
  const rewardNum = el('span', 'cmp-stat-num num');
  const stats = el('div', 'cmp-stats', null, [
    el('div', 'cmp-stat', null, [soldLabel, el('span', 'cmp-stat-row', null, [icon('box', 'cmp-box'), soldNum])]),
    el('div', 'cmp-stat cmp-reward', null, [rewardLabel, el('span', 'cmp-stat-row', null, [icon('coin', 'cmp-coin'), rewardNum])]),
  ]);
  const next = el('div', 'cmp-next');
  const btn = el('button', 'cbtn cbtn-big', { type: 'button' }, [el('span', 'cbtn-label')]);
  const card = el('div', 'modal-card cmp-card', { role: 'dialog' }, [trophy, title, name, stats, next, btn]);
  const root = el('div', 'modal cmp is-hidden', null, [rays, confetti, card]);
  ctx.layers.overlays.appendChild(root);
  root.addEventListener('pointerdown', (e) => e.stopPropagation());

  let isOpen = false;

  onTap(btn, () => {
    const f = ctx.game.select.factory();
    if (!f.isLast) {
      const r = ctx.game.act({ type: 'nextFactory' });
      if (r.ok) { ctx.sfx('open'); close(); }
    } else {
      ctx.sfx('tap');
      close();
      dismissed = true;
    }
  });

  let dismissed = false;

  function render() {
    const f = ctx.game.select.factory();
    const lang = ctx.lang();
    const last = f.isLast;
    setText(title, ctx.tx(last ? 'complete.lastTitle' : 'complete.title'));
    setText(name, ctx.tx(f.nameKey));
    setText(soldLabel, ctx.tx('complete.sold'));
    setText(soldNum, formatInt(f.sold, lang));
    setText(rewardLabel, ctx.tx('complete.reward'));
    setText(rewardNum, '+' + ctx.num(f.reward));
    toggle(stats.lastChild, 'is-hidden', last);
    if (last) setText(next, ctx.tx('complete.soon'));
    else setText(next, ctx.tx('complete.nextName', { name: ctx.tx(FACTORIES[f.index + 1].nameKey) }));
    setText(btn.firstChild, ctx.tx(last ? 'complete.keep' : 'complete.next'));
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    render();
    toggle(root, 'is-hidden', false);
    root.classList.remove('is-out');
    ctx.sfx('complete');
  }
  function close() {
    isOpen = false;
    root.classList.add('is-out');
    setTimeout(() => { if (!isOpen) toggle(root, 'is-hidden', true); }, 200);
  }

  function update() {
    const f = ctx.game.select.factory();
    if (f.complete && !isOpen && !dismissed && !ctx.blockingModal()) open();
    if (!f.complete) dismissed = false;
  }

  return { open, close, update, relabel: () => { if (isOpen) render(); }, isOpen: () => isOpen, root };
}
