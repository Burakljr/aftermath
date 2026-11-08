// Aftermath v2 UI: settings sheet: Efektler, Müzik, Kalite (Yüksek / Düşük, "Akıcılık için düşürüldü." when auto),
// Haber arşivi, Oyunu sıfırla -> "Şirketi kapat? Tüm ilerleme silinir, geri alınamaz." [Vazgeç] [Sil].
import { h, icon, T, A, show, tap, button } from './dom.js';
import { renderNews } from './news.js';

const DEFAULT_PREFS = { sfx: true, music: true, quality: 'high', downgraded: false };

export function createSettings(ctx) {
  const prefs = ctx.deps.prefs || { get: () => DEFAULT_PREFS, set() {} };
  const el = h('div.sheet-slot.sheet-settings.off');
  const box = h('div.sheet-box');
  el.appendChild(box);
  ctx.L.sheet.appendChild(el);

  const head = h('div.title', { text: 'Ayarlar' });
  const back = h('button.close.back', { type: 'button', 'aria-label': 'Geri' }, h('span', icon('t-chevron', 18)));
  const close = h('button.close', { type: 'button', 'aria-label': 'Kapat', 'data-key': 'settings' }, h('span', icon('t-close', 18)));
  const swSfx = h('button.switch', { type: 'button', role: 'switch', 'aria-label': 'Efektler' });
  const swMusic = h('button.switch', { type: 'button', role: 'switch', 'aria-label': 'Müzik' });
  const qHigh = h('button', { type: 'button', text: 'Yüksek' });
  const qLow = h('button', { type: 'button', text: 'Düşük' });
  const qNote = h('div.set-note');
  const newsRow = h('button.set-row.link', { type: 'button' }, icon('t-news', 20, 'c-beton'), h('span.set-row__l', { text: 'Haber arşivi' }), icon('t-chevron', 18, 'c-beton'));
  const reset = button({ cls: 'danger', icon: 't-trash', iconSize: 18, label: 'Oyunu sıfırla' });
  reset.classList.add('block');
  const main = h('div.set-list',
    h('div.set-row', icon('t-sound', 20, 'c-beton'), h('span.set-row__l', { text: 'Efektler' }), swSfx),
    h('div.set-row', icon('t-music', 20, 'c-beton'), h('span.set-row__l', { text: 'Müzik' }), swMusic),
    h('div.set-row.col', h('div.set-row__top', icon('t-gauge', 20, 'c-beton'), h('span.set-row__l', { text: 'Görüntü kalitesi' }), h('div.seg', qHigh, qLow)), qNote),
    newsRow,
    h('div.set-gap'),
    reset,
    h('p.set-ver', { text: 'Aftermath 2.0 · Körfezkent' }));
  const newsList = h('div.news-list.scroll');
  const confirmBox = h('div.confirm');
  box.append(h('div.grabber'), h('div.sheet-head', h('div.set-head', back, head), close), main, newsList, confirmBox);
  let confirm = false;

  function setPref(k, v) {
    prefs.set(k, v);
    ctx.sfx('click');
    ctx.dirty = true;
  }
  tap(swSfx, () => setPref('sfx', !prefs.get().sfx));
  tap(swMusic, () => setPref('music', !prefs.get().music));
  tap(qHigh, () => setPref('quality', 'high'));
  tap(qLow, () => setPref('quality', 'low'));
  tap(newsRow, () => {
    ctx.view.news = true;
    ctx.sfx('click');
    ctx.dirty = true;
  });
  tap(back, () => {
    ctx.view.news = false;
    ctx.dirty = true;
  });
  tap(close, () => {
    ctx.view.settings = false;
    ctx.view.news = false;
    confirm = false;
    ctx.sfx('click');
    ctx.dirty = true;
  });
  tap(reset, () => {
    confirm = true;
    ctx.dirty = true;
  });
  const no = button({ label: 'Vazgeç', onTap: () => { confirm = false; ctx.dirty = true; } });
  const yes = button({ cls: 'danger', label: 'Sil', icon: 't-trash', iconSize: 18, onTap: () => {
    confirm = false;
    ctx.view.settings = false;
    if (ctx.deps.reset) ctx.deps.reset();
    else {
      ctx.game.wipe(localStorage);
      location.reload();
    }
  } });
  confirmBox.append(h('div.confirm__card.glass',
    h('div.confirm__head', icon('t-alert', 22, 'c-yangin'), h('div.confirm__title', { text: 'Şirketi kapat?' })),
    h('p.confirm__text', { text: 'Tüm ilerleme silinir, geri alınamaz.' }),
    h('div.confirm__btns', no, yes)));

  return {
    el,
    confirmOpen: () => confirm && ctx.view.settings,
    update(s) {
      const p = { ...DEFAULT_PREFS, ...prefs.get() };
      A(swSfx, 'aria-checked', p.sfx ? 'true' : 'false');
      A(swMusic, 'aria-checked', p.music ? 'true' : 'false');
      const q = p.quality === 'low' ? 'low' : 'high';
      A(qHigh, 'aria-pressed', q === 'high' ? 'true' : 'false');
      A(qLow, 'aria-pressed', q === 'low' ? 'true' : 'false');
      T(qNote, p.downgraded ? 'Akıcılık için düşürüldü.' : 'Düşük kalite pili korur, eski telefonlarda akıcıdır.');
      const news = !!ctx.view.news;
      T(head, news ? 'Haber arşivi' : 'Ayarlar');
      show(back, news);
      show(main, !news);
      show(newsList, news);
      if (news) renderNews(newsList, ctx.game.newsArchive(s));
      confirmBox.classList.toggle('on', confirm);
      void s;
    },
  };
}
