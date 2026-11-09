// Settings panel: language, sound, graphics quality, FPS meter.
import { el, otext, setText, toggle, onTap, icon } from './dom.js';
import { createModalPanel } from './panel.js';
import { DICTS } from '../game/i18n.js';

const ROW_ICON = { lang: 'globe', sound: 'speaker', quality: 'sparkle', fps: 'bolt' };

export function createSettings(ctx) {
  const mp = createModalPanel(ctx, { cls: 'set-card', kind: 'purple' });
  const rows = el('div', 'set-rows');
  const doneLabel = otext('cbtn-label');
  const done = el('button', 'cbtn cbtn-small b3 b3-green', { type: 'button' }, [doneLabel]);
  const credits = el('div', 'set-credits');
  mp.body.append(rows, done, credits);

  const segs = [];
  function segRow(labelKey, key, options) {
    const label = el('div', 'set-label');
    const seg = el('div', 'seg');
    const btns = options.map((o) => {
      const t = otext('seg-text');
      const b = el('button', 'seg-btn', { type: 'button', 'data-value': String(o.value) }, [t]);
      onTap(b, () => {
        ctx.game.act({ type: 'setting', key, value: o.value });
        ctx.sfx('tap');
      });
      seg.appendChild(b);
      return { b, t, o };
    });
    rows.appendChild(el('div', 'set-row', { 'data-key': key }, [el('span', 'set-ico set-ico-' + key, null, [icon(ROW_ICON[key] || 'star')]), label, seg]));
    segs.push({ label, labelKey, key, btns });
  }

  segRow('settings.language', 'lang', Object.keys(DICTS).map((l) => ({ value: l, key: 'lang.' + l })));
  segRow('settings.sound', 'sound', [{ value: true, key: 'settings.on' }, { value: false, key: 'settings.off' }]);
  segRow('settings.quality', 'quality', [{ value: 'high', key: 'settings.high' }, { value: 'low', key: 'settings.low' }]);
  segRow('settings.fps', 'fps', [{ value: true, key: 'settings.on' }, { value: false, key: 'settings.off' }]);

  onTap(done, () => { ctx.sfx('tap'); close(); });

  function open() { mp.open(); update(); }
  function close() { mp.hide(); }

  function relabel() {
    mp.ribbon.set(ctx.tx('settings.title'));
    mp.closeBtn.setAttribute('aria-label', ctx.tx('card.close'));
    setText(doneLabel, ctx.tx('settings.done'));
    setText(credits, ctx.tx('settings.credits'));
    for (const s of segs) {
      setText(s.label, ctx.tx(s.labelKey));
      for (const { t, o } of s.btns) setText(t, ctx.tx(o.key));
    }
  }

  function update() {
    if (!mp.isOpen()) return;
    const st = ctx.game.state.settings;
    for (const s of segs) for (const { b, o } of s.btns) toggle(b, 'is-on', st[s.key] === o.value);
  }

  relabel();
  return { open, close, update, relabel, isOpen: () => mp.isOpen(), root: mp.root };
}
