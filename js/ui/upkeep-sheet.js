// Aftermath v2 UI: upkeep sheet (calm tap after G6, DESIGN §5.4). Same gesture as the district sheet, different content.
import { h, icon, T, C, show, tap, keyed, button } from './dom.js';

export function createUpkeepSheet(ctx) {
  const el = h('div.sheet-slot.sheet-upkeep.off');
  const box = h('div.sheet-box');
  el.appendChild(box);
  ctx.L.sheet.appendChild(el);

  function build(id) {
    return keyed(box, `u${id}`, () => {
      const name = h('b.name');
      const close = h('button.close', { type: 'button', 'aria-label': 'Kapat' }, h('span', icon('t-close', 18)));
      tap(close, () => ctx.closeSheet());
      const tiers = h('div.tiers');
      const rate = h('b.num');
      const next = h('div.upkeep__next');
      const paused = h('div.sheet-warn');
      const btn = button({ onTap: (e, b) => {
        const r = ctx.act('signUpkeep', { sector: id }, b);
        if (r.ok) ctx.fx.coinsFrom(b, 'out');
      } });
      btn.classList.add('block');
      box.append(
        h('div.grabber'),
        h('div.sheet-head', h('div', h('span.plate-sign.plate-sign--title', h('span', name)), h('div.subtitle', { text: 'Bakım sözleşmesi' })), close),
        h('div.upkeep__grid',
          h('div', h('div.kicker', { text: 'Kademe' }), tiers),
          h('div.upkeep__rate', h('div.kicker', { text: 'Gelir' }), rate)),
        h('p.upkeep__note', { text: 'Temiz bölge belediyeden dakikada ödeme getirir. Bölge hasar alınca bakım durur.' }),
        paused, next, btn);
      return { name, tiers, rate, next, paused, btn };
    });
  }

  return {
    el,
    update(s) {
      const id = ctx.view.sel;
      if (id == null) return;
      const d = ctx.game.districtStatus(s, id);
      const u = d.upkeep;
      if (!u) return;
      const r = build(id);
      T(r.name, d.name);
      if (r.tiers.childElementCount !== u.cap) {
        r.tiers.replaceChildren();
        for (let i = 0; i < u.cap; i++) r.tiers.appendChild(h('i'));
      }
      let i = 0;
      for (const t of r.tiers.children) C(t, 'on', i++ < u.tier);
      T(r.rate, u.rateText);
      T(r.next, u.nextCostText || 'Son kademede');
      T(r.paused, u.pausedText || '');
      show(r.paused, !!u.pausedText);
      show(r.btn, !!u.nextCostText);
      r.btn.set({ label: u.button, primary: u.enabled && ctx.primaryOK(), enabled: u.enabled, reason: u.reason, key: `signUpkeep:${id}` });
    },
  };
}
