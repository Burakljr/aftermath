// Aftermath v2 UI: notice cards (v1 notice, "Sen yokken...", the unmarked car, chapter end). Shows notice(s) = notices[0].
// Not during the attack or the title card. Buttons run the selector's actions.
import { h, icon, keyed, button } from './dom.js';

const KIND_ICON = { v1: 't-info', offline: 'g-lira', buyer: 't-door', chapter: 'g-municipal' };

/** blank Turkish plate: blue TR strip, no characters (the car has no plate number) */
function blankPlate() {
  return h('div.tplate', h('span.tplate__tr', { text: 'TR' }), h('span.tplate__blank', h('i'), h('i'), h('i')));
}

export function createNotices(ctx) {
  const veil = h('div.notice-veil');
  const card = h('div.notice-card');
  const wrap = h('div.notice', veil, card);
  ctx.L.notice.appendChild(wrap);
  let open = false;

  function eligible(s) {
    return s.phase !== 'attack' && !ctx.view.title && !!s.notices.length;
  }

  return {
    isOpen: (s) => eligible(s),
    update(s) {
      const n = eligible(s) ? ctx.game.notice(s) : null;
      const now = !!n;
      if (now !== open) {
        open = now;
        wrap.classList.toggle('on', now);
      }
      if (!n) return;
      const key = `${n.kind}|${n.title}|${n.body.join('|')}`;
      const r = keyed(card, key, (box) => {
        box.className = `notice-card notice-card--${n.kind}`;
        const btns = n.buttons.map((b) => {
          const el = button({ label: b.label, onTap: (e, me) => {
            const res = ctx.act(b.action.id, b.action.arg, me);
            if (res.ok && n.kind === 'offline') ctx.fx.coinsFrom(me, 'in');
          } });
          el.classList.add('block');
          el.__primary = !!b.primary;
          el.dataset.key = b.action.id;
          return el;
        });
        const head = h('div.notice__head', h('span.notice__icon', icon(KIND_ICON[n.kind] || 't-info', 22)), h('div.notice__title', { text: n.title }));
        const body = h('div.notice__body');
        if (n.kind === 'buyer') body.appendChild(blankPlate());
        n.body.forEach((t, i) => body.appendChild(h(i === 0 && n.kind === 'offline' ? 'p.notice__lead' : 'p', { text: t })));
        if (n.note) body.appendChild(h('p.notice__note', { text: n.note }));
        box.append(head, body, h(`div.notice__btns${btns.length > 1 ? '.two' : ''}`, btns));
        return { btns };
      });
      for (const b of r.btns) b.set({ primary: b.__primary });
    },
  };
}
