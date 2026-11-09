// "While you were away" panel with the offline earnings.
import { el, icon, otext, setText, onTap } from './dom.js';
import { createModalPanel } from './panel.js';
import { formatDuration } from '../game/format.js';

export function createOffline(ctx) {
  const mp = createModalPanel(ctx, { cls: 'off-card', kind: 'purple', closable: false });
  const moon = el('div', 'off-ico', null, [icon('moon')]);
  const body = el('div', 'off-body');
  const amt = otext('off-amt num');
  const amount = el('div', 'off-amount', null, [icon('coin', 'off-coin'), amt]);
  const cap = el('div', 'off-cap', null, [icon('clock', 'off-cap-ico'), el('span')]);
  const btnLabel = otext('cbtn-label');
  const btn = el('button', 'cbtn cbtn-big b3 b3-green is-ready', { type: 'button' }, [btnLabel]);
  mp.body.append(moon, body, amount, cap, btn);

  onTap(btn, () => {
    const off = ctx.game.select.offline();
    const r = amount.getBoundingClientRect();
    if (ctx.game.act({ type: 'claimOffline' }).ok && off) {
      ctx.coinBurst(r.left + r.width / 2, r.top + r.height / 2, off.amount, 10);
    }
    mp.hide();
  });

  function render() {
    const off = ctx.game.select.offline();
    if (!off) return;
    mp.ribbon.set(ctx.tx('offline.title'));
    setText(body, ctx.tx('offline.body', { time: formatDuration(off.seconds, ctx.lang()) }));
    setText(amt, '+' + ctx.num(off.amount));
    setText(cap.lastChild, ctx.tx('offline.cap'));
    setText(btnLabel, ctx.tx('offline.collect'));
  }

  function open() {
    if (mp.isOpen()) return;
    render();
    mp.open();
  }

  function update() {
    const off = ctx.game.select.offline();
    if (off && !mp.isOpen()) open();
    else if (mp.isOpen()) render();
  }

  return { open, close: () => mp.hide(), update, relabel: render, isOpen: () => mp.isOpen(), root: mp.root };
}
