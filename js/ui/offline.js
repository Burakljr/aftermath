// "While you were away" card with the offline earnings.
import { el, icon, setText, toggle, onTap } from './dom.js';
import { formatDuration } from '../game/format.js';

export function createOffline(ctx) {
  const moon = el('div', 'off-ico', null, [icon('moon')]);
  const title = el('div', 'modal-title');
  const body = el('div', 'off-body');
  const amt = el('span', 'off-amt num');
  const amount = el('div', 'off-amount', null, [icon('coin', 'off-coin'), amt]);
  const cap = el('div', 'off-cap');
  const btn = el('button', 'cbtn cbtn-big', { type: 'button' }, [el('span', 'cbtn-label')]);
  const card = el('div', 'modal-card off-card', { role: 'dialog' }, [moon, title, body, amount, cap, btn]);
  const root = el('div', 'modal is-hidden', null, [card]);
  ctx.layers.overlays.appendChild(root);
  root.addEventListener('pointerdown', (e) => e.stopPropagation());

  let isOpen = false;

  onTap(btn, () => {
    const off = ctx.game.select.offline();
    const r = amount.getBoundingClientRect();
    if (ctx.game.act({ type: 'claimOffline' }).ok && off) {
      ctx.coinBurst(r.left + r.width / 2, r.top + r.height / 2, off.amount, 10);
    }
    close();
  });

  function render() {
    const off = ctx.game.select.offline();
    if (!off) return;
    setText(title, ctx.tx('offline.title'));
    setText(body, ctx.tx('offline.body', { time: formatDuration(off.seconds, ctx.lang()) }));
    setText(amt, '+' + ctx.num(off.amount));
    setText(cap, ctx.tx('offline.cap'));
    setText(btn.firstChild, ctx.tx('offline.collect'));
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    render();
    toggle(root, 'is-hidden', false);
    root.classList.remove('is-out');
  }
  function close() {
    isOpen = false;
    root.classList.add('is-out');
    setTimeout(() => { if (!isOpen) toggle(root, 'is-hidden', true); }, 200);
  }

  function update() {
    const off = ctx.game.select.offline();
    if (off && !isOpen) open();
    else if (isOpen) render();
  }

  return { open, close, update, relabel: render, isOpen: () => isOpen, root };
}
