// "Welcome back" card with the offline earnings (collected with one tap).
import { el, icon, onTap, setText } from './dom.js';
import { createModal } from './panel.js';
import { formatDuration } from '../game/format.js';

export function createOffline(ctx) {
  const { game } = ctx;
  const modal = createModal(ctx, { cls: 'offline', closable: false });
  const title = el('h2');
  const body = el('p');
  const val = el('span');
  const big = el('div', 'big-amount', null, [icon('coin'), val]);
  const cap = el('div', 'small');
  const btn = el('button', 'btn btn-primary btn-wide ready', { type: 'button' });
  const hero = icon('inn');
  modal.body.append(el('div', 'hero', null, [hero]), title, body, big, cap, btn);
  onTap(btn, () => {
    const off = game.select.offline();
    const r = game.act({ type: 'claimOffline' });
    if (!r.ok) { modal.hide(); return; }
    const rect = btn.getBoundingClientRect();
    modal.hide();
    ctx.coinBurst(rect.left + rect.width / 2, rect.top, off ? off.amount : 0, 8);
  });
  let shownFor = -1;
  function refresh() {
    const off = game.select.offline();
    if (!off) return;
    hero.innerHTML = ctx.icons[game.state.location === 'harbor' ? 'harbor' : 'inn'];
    setText(title, ctx.tx('offline.title'));
    setText(body, ctx.tx('offline.body', { time: formatDuration(off.seconds, ctx.lang()) }));
    setText(val, ctx.num(off.amount));
    setText(cap, ctx.tx('offline.cap'));
    setText(btn, ctx.tx('offline.collect'));
  }
  return {
    isOpen: () => modal.isOpen(),
    update() {
      const off = game.select.offline();
      if (off && !modal.isOpen() && !ctx.otherModalOpen('offline')) {
        if (shownFor !== off.amount) { shownFor = off.amount; ctx.closeCard(); ctx.closePanels(); }
        refresh();
        modal.open();
      } else if (off && modal.isOpen() && shownFor !== off.amount) { shownFor = off.amount; refresh(); }
      else if (!off && modal.isOpen()) modal.hide();
    },
    relabel: refresh,
  };
}
