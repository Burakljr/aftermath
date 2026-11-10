// "Restaurant complete" screen: stars, guests served, Next place (or "more coming soon").
import { el, icon, onTap, setText, toggle } from './dom.js';
import { createModal } from './panel.js';

export function createComplete(ctx) {
  const { game } = ctx;
  let dismissed = false;
  const modal = createModal(ctx, { cls: 'complete', onClose: () => { dismissed = true; } });
  const title = el('h2');
  const starsEl = el('div', 'stars-big', null, [icon('star'), icon('star'), icon('star')]);
  const servedK = el('span', 'k');
  const servedV = el('span', 'v');
  const kv = el('div', 'kv', null, [servedK, servedV]);
  const nextName = el('p');
  const btn = el('button', 'btn btn-primary btn-wide ready', { type: 'button' });
  modal.body.append(starsEl, title, kv, nextName, btn);
  onTap(btn, () => {
    const loc = game.select.location();
    if (loc.isLast) { modal.close(); return; }
    const r = game.act({ type: 'nextLocation' });
    if (!r.ok) { ctx.sfx('nope'); return; }
    modal.hide();
  });
  game.on('locationComplete', () => { dismissed = false; ctx.sfx('complete'); });
  game.on('locationStart', () => { dismissed = false; });

  function refresh() {
    const loc = game.select.location();
    setText(title, loc.isLast ? ctx.tx('complete.lastTitle') : ctx.tx('complete.title'));
    setText(servedK, ctx.tx('complete.served'));
    setText(servedV, ctx.num(loc.served));
    const next = game.select.locations()[loc.index + 1];
    setText(nextName, loc.isLast ? ctx.tx('complete.soon') : ctx.tx('complete.nextName', { name: ctx.tx(next.nameKey) }));
    setText(btn, loc.isLast ? ctx.tx('complete.keep') : ctx.tx('complete.next'));
    toggle(kv, 'is-hidden', false);
  }
  return {
    isOpen: () => modal.isOpen(),
    update() {
      const want = game.state.complete && !dismissed && !ctx.otherModalOpen('complete');
      if (want && !modal.isOpen()) { ctx.closeCard(); ctx.closePanels(); refresh(); modal.open(); }
      else if (!game.state.complete && modal.isOpen()) modal.hide();
    },
    show() { dismissed = false; },
    dismiss() { dismissed = true; modal.hide(); },
    relabel: refresh,
    button: () => btn,
  };
}
