// Shared shells: bottom sheet (menu panels) and centred modal card, both with a dimmed
// backdrop. Tapping the backdrop or the X closes them (when closable).
import { el, icon, onTap, toggle, setText } from './dom.js';

export function closeButton(cls = '') {
  return el('button', 'close-btn ' + cls, { type: 'button', 'aria-label': 'close' }, [icon('close')]);
}

function shell(ctx, wrapCls, box, { closable = true, onClose } = {}) {
  const wrap = el('div', wrapCls, null, [box]);
  ctx.layers.overlays.appendChild(wrap);
  let open = false;
  const api = {
    root: wrap,
    box,
    isOpen: () => open,
    open() {
      if (open) return;
      open = true;
      toggle(wrap, 'open', true);
    },
    hide() {
      if (!open) return;
      open = false;
      toggle(wrap, 'open', false);
    },
    close() {
      if (!open) return;
      ctx.sfx('tap');
      api.hide();
      if (onClose) onClose();
    },
  };
  wrap.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.target === wrap && closable) api.close();
  });
  return api;
}

// Bottom sheet with a title row (title, optional count text, X) and a scrolling body.
export function createSheet(ctx, { cls = '', onClose } = {}) {
  const title = el('h2');
  const count = el('span', 'count');
  const x = closeButton();
  const body = el('div', 'sheet-body');
  const box = el('div', 'sheet ' + cls, { role: 'dialog' }, [el('div', 'sheet-head', null, [title, count, x]), body]);
  const api = shell(ctx, 'sheet-wrap', box, { onClose });
  onTap(x, () => api.close());
  api.title = title;
  api.count = count;
  api.body = body;
  api.setTitle = (s) => setText(title, s);
  api.setCount = (s) => setText(count, s);
  return api;
}

// Centred modal card. closable = false hides the X and ignores backdrop taps.
export function createModal(ctx, { cls = '', closable = true, onClose } = {}) {
  const x = closeButton('x');
  const body = el('div', 'modal-body');
  const box = el('div', 'modal-card ' + cls, { role: 'dialog' }, [x, body]);
  const api = shell(ctx, 'modal', box, { closable, onClose });
  if (closable) onTap(x, () => api.close());
  else x.classList.add('is-hidden');
  api.body = body;
  return api;
}

// Coin + amount (text node updated with setText).
export function amount(cls = '') {
  const val = el('span', 'v');
  const root = el('span', 'amount ' + cls, null, [icon('coin'), val]);
  return { root, set: (s) => setText(val, s) };
}

// Primary button with label + price. setPrice(null) hides the price.
export function priceButton(cls = 'btn btn-primary') {
  const lbl = el('span', 'lbl');
  const val = el('span', 'v');
  const price = el('span', 'price', null, [icon('coin'), val]);
  const root = el('button', cls, { type: 'button' }, [lbl, price]);
  return {
    root,
    setLabel: (s) => { setText(lbl, s); toggle(lbl, 'is-hidden', !s); },
    setPrice: (s) => { if (s === null) toggle(price, 'is-hidden', true); else { toggle(price, 'is-hidden', false); setText(val, s); } },
    setOff: (off) => toggle(root, 'is-off', off),
    setReady: (on) => toggle(root, 'ready', on),
  };
}
