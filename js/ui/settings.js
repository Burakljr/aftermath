// Settings sheet: language, sound, graphics quality, FPS meter.
import { el, setText, toggle, onTap } from './dom.js';
import { DICTS } from '../game/i18n.js';

export function createSettings(ctx) {
  const title = el('div', 'modal-title');
  const rows = el('div', 'set-rows');
  const done = el('button', 'cbtn cbtn-small', { type: 'button' }, [el('span', 'cbtn-label')]);
  const credits = el('div', 'set-credits');
  const panel = el('div', 'modal-card set-card', { role: 'dialog' }, [title, rows, done, credits]);
  const root = el('div', 'modal is-hidden', null, [panel]);
  ctx.layers.overlays.appendChild(root);

  const segs = [];
  function segRow(labelKey, key, options) {
    const label = el('div', 'set-label');
    const seg = el('div', 'seg');
    const btns = options.map((o) => {
      const b = el('button', 'seg-btn', { type: 'button', 'data-value': String(o.value) });
      onTap(b, () => {
        ctx.game.act({ type: 'setting', key, value: o.value });
        ctx.sfx('tap');
      });
      seg.appendChild(b);
      return { b, o };
    });
    rows.appendChild(el('div', 'set-row', { 'data-key': key }, [label, seg]));
    segs.push({ label, labelKey, key, btns });
  }

  segRow('settings.language', 'lang', Object.keys(DICTS).map((l) => ({ value: l, key: 'lang.' + l })));
  segRow('settings.sound', 'sound', [{ value: true, key: 'settings.on' }, { value: false, key: 'settings.off' }]);
  segRow('settings.quality', 'quality', [{ value: 'high', key: 'settings.high' }, { value: 'low', key: 'settings.low' }]);
  segRow('settings.fps', 'fps', [{ value: true, key: 'settings.on' }, { value: false, key: 'settings.off' }]);

  onTap(done, () => { ctx.sfx('tap'); close(); });
  root.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.target === root) close();
  });

  let isOpen = false;
  function open() { isOpen = true; toggle(root, 'is-hidden', false); root.classList.remove('is-out'); update(); }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    root.classList.add('is-out');
    setTimeout(() => { if (!isOpen) toggle(root, 'is-hidden', true); }, 160);
  }

  function relabel() {
    setText(title, ctx.tx('settings.title'));
    setText(done.firstChild, ctx.tx('settings.done'));
    setText(credits, ctx.tx('settings.credits'));
    for (const s of segs) {
      setText(s.label, ctx.tx(s.labelKey));
      for (const { b, o } of s.btns) setText(b, ctx.tx(o.key));
    }
  }

  function update() {
    if (!isOpen) return;
    const st = ctx.game.state.settings;
    for (const s of segs) for (const { b, o } of s.btns) toggle(b, 'is-on', st[s.key] === o.value);
  }

  relabel();
  return { open, close, update, relabel, isOpen: () => isOpen, root };
}
