// Shared chunky pieces: ribbon banner, red round close button, and a modal panel
// shell (dimmed backdrop + cream panel with ribbon header) used by the menu panels,
// settings and the offline card.
import { el, icon, otext, onTap, toggle, setText } from './dom.js';

const TAIL_L = '<svg viewBox="0 0 26 40" aria-hidden="true"><path d="M24 3H3l7 17-7 17h21z" style="fill:var(--rb-dark)" stroke="#2A1E3B" stroke-width="3.6" stroke-linejoin="round"/></svg>';
const TAIL_R = '<svg viewBox="0 0 26 40" aria-hidden="true"><path d="M2 3h21l-7 17 7 17H2z" style="fill:var(--rb-dark)" stroke="#2A1E3B" stroke-width="3.6" stroke-linejoin="round"/></svg>';

// Ribbon banner with outlined white text. kind: berry | blue | green | orange | purple | gold
export function ribbon(kind = 'berry', textCls = '') {
  const text = otext('rb-text ' + textCls);
  const root = el('div', 'rb rb-' + kind, null, [
    el('span', 'rb-tail rb-tail-l', { html: TAIL_L }),
    el('span', 'rb-band', null, [text]),
    el('span', 'rb-tail rb-tail-r', { html: TAIL_R }),
  ]);
  // long titles get a smaller font so they never need an ellipsis
  const set = (s) => {
    setText(text, s);
    const n = s ? s.length : 0;
    toggle(root, 'rb-long', n > 15 && n <= 21);
    toggle(root, 'rb-xlong', n > 21);
  };
  return { root, text, set };
}

export function closeButton(cls = '') {
  return el('button', 'xbtn ' + cls, { type: 'button' }, [icon('close')]);
}

// Modal panel shell. Returns { root, panel, body, title, close, open(), hide(), isOpen() }.
// onClose is called when the player closes it (X, backdrop tap).
export function createModalPanel(ctx, { cls = '', kind = 'berry', titleCls = 'modal-title', dim = true, closable = true, menu = false, onClose } = {}) {
  const rb = ribbon(kind, titleCls);
  const x = closeButton('modal-x');
  const body = el('div', 'mp-body');
  const panel = el('div', 'modal-card mp ' + cls, { role: 'dialog' }, [rb.root, x, body]);
  const root = el('div', 'modal is-hidden' + (dim ? '' : ' modal-clear') + (menu ? ' is-menu' : ''), null, [panel]);
  ctx.layers.overlays.appendChild(root);

  let open = false;
  const api = {
    root, panel, body, ribbon: rb, title: rb.text, closeBtn: x,
    isOpen: () => open,
    open() {
      if (open) return;
      open = true;
      toggle(root, 'is-hidden', false);
      root.classList.remove('is-out');
      panel.classList.remove('pop-in');
      void panel.offsetWidth; // eslint-disable-line no-void
      panel.classList.add('pop-in');
    },
    hide() {
      if (!open) return;
      open = false;
      root.classList.add('is-out');
      setTimeout(() => { if (!open) toggle(root, 'is-hidden', true); }, 170);
    },
  };
  const userClose = () => { ctx.sfx('tap'); api.hide(); if (onClose) onClose(); };
  if (closable) onTap(x, userClose);
  else x.classList.add('is-hidden');
  root.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.target === root && closable) userClose();
  });
  return api;
}
