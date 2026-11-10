// Settings: language, sound, graphics quality, FPS meter.
import { el, icon, onTap, setText, toggle } from './dom.js';
import { createModal } from './panel.js';
import { LANG_NAMES } from '../game/i18n.js';

export function createSettings(ctx) {
  const { game } = ctx;
  const modal = createModal(ctx, { cls: 'settings' });
  const title = el('h2');
  const rows = el('div', 'set-rows');
  const credits = el('div', 'credits');
  const done = el('button', 'btn btn-primary btn-wide', { type: 'button' });
  modal.body.append(title, rows, credits, done);
  onTap(done, () => modal.close());

  const segs = [];
  function row(key, ico, options) {
    const k = el('span', 'k');
    const seg = el('div', 'seg', { 'data-setting': key });
    const btns = options.map((o) => {
      const b = el('button', '', { type: 'button', 'data-value': String(o.value) });
      onTap(b, () => {
        if (game.state.settings[key] === o.value) return;
        game.act({ type: 'setting', key, value: o.value });
        ctx.sfx('tap');
        refresh();
      });
      seg.appendChild(b);
      return { b, o };
    });
    rows.appendChild(el('div', 'set-row', null, [icon(ico), k, seg]));
    segs.push({ key, k, btns });
  }
  row('lang', 'globe', Object.keys(LANG_NAMES).map((code) => ({ value: code, label: () => LANG_NAMES[code] })));
  row('sound', 'sound', [{ value: true, label: () => ctx.tx('settings.on') }, { value: false, label: () => ctx.tx('settings.off') }]);
  row('quality', 'monitor', [{ value: 'high', label: () => ctx.tx('settings.high') }, { value: 'low', label: () => ctx.tx('settings.low') }]);
  row('fps', 'gauge', [{ value: true, label: () => ctx.tx('settings.on') }, { value: false, label: () => ctx.tx('settings.off') }]);

  const KEYS = { lang: 'settings.language', sound: 'settings.sound', quality: 'settings.quality', fps: 'settings.fps' };
  function refresh() {
    for (const s of segs) {
      setText(s.k, ctx.tx(KEYS[s.key]));
      for (const { b, o } of s.btns) {
        setText(b, o.label());
        toggle(b, 'on', game.state.settings[s.key] === o.value);
      }
    }
  }
  function relabel() {
    setText(title, ctx.tx('settings.title'));
    setText(credits, ctx.tx('settings.credits'));
    setText(done, ctx.tx('settings.done'));
    refresh();
  }
  return {
    open() { refresh(); modal.open(); },
    close: () => modal.hide(),
    isOpen: () => modal.isOpen(),
    update() {},
    relabel,
  };
}
