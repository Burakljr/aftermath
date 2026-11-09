// Aftermath v2 UI: incoming call card (direct award). Slides up over the panel; the city stays visible above it.
import { h, icon, T, button, keyed } from './dom.js';

export function createCall(ctx) {
  const el = h('div.call.glass');
  return {
    el,
    update(s) {
      const c = ctx.game.callCard(s);
      if (!c) return false;
      const r = keyed(el, `call${s.tender.no}`, (box) => {
        const lines = h('div.call__lines');
        const btn = button({ icon: 't-check', onTap: (e, b) => ctx.act('acceptCall', null, b) });
        btn.classList.add('block', 'call__btn');
        const pay = h('b.num');
        const dl = h('b.num');
        box.append(
          h('div.call__top',
            h('span.call__live', h('i'), 'Gelen çağrı'),
            h('span.call__line', icon('t-phone', 16), 'Belediye hattı')),
          h('div.call__who', h('div.avatar.lg', { text: c.initials }),
            h('div', h('div.call__name', { text: c.name }), h('div.call__role', { text: c.role }))),
          lines,
          h('div.call__terms', h('div', h('span', { text: 'Ödeme' }), pay), h('div', h('span', { text: 'Süre' }), dl)),
          btn);
        for (const t of c.lines) lines.appendChild(h('p', { text: t }));
        return { btn, pay, dl };
      });
      T(r.pay, c.payText);
      T(r.dl, c.deadlineText);
      r.btn.set({ label: c.button, primary: ctx.primaryOK(), key: 'acceptCall' });
      return true;
    },
  };
}
