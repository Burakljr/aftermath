// Aftermath v2 UI: upkeep sheet (calm tap after G6, DESIGN §5.4). Same gesture as the district sheet, different content.
// Review 2 (M2): signing and upgrading are two different buttons in two different places. After a signature or an
// upgrade the sheet shows "Kademe N imzalandı" for ~1 s and closes, so a double tap can never buy the next tier.
import { h, icon, T, C, show, tap, keyed, button } from './dom.js';

const CONFIRM_MS = 1100;

export function createUpkeepSheet(ctx) {
  const el = h('div.sheet-slot.sheet-upkeep.off');
  const box = h('div.sheet-box');
  el.appendChild(box);
  ctx.L.sheet.appendChild(el);
  let done = null; // { id, tier, until } after a successful signature / upgrade
  let closeTimer = 0;

  function signed(id, b) {
    const s = ctx.s;
    const tier = s ? s.sectors[id].upkeep : 0;
    done = { id, tier, until: performance.now() + CONFIRM_MS };
    ctx.fx.coinsFrom(b, 'out');
    ctx.markDirty();
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      if (done && ctx.view.sel === id) ctx.closeSheet();
      done = null;
      ctx.markDirty();
    }, CONFIRM_MS);
  }

  function build(id) {
    return keyed(box, `u${id}`, () => {
      const name = h('b.name');
      const close = h('button.close', { type: 'button', 'aria-label': 'Kapat' }, h('span', icon('t-close', 18)));
      tap(close, () => ctx.closeSheet());
      const tiers = h('div.tiers');
      const rate = h('b.num');
      const next = h('div.upkeep__next');
      const paused = h('div.sheet-warn');
      const ok = h('div.upkeep__ok', icon('t-check', 18), h('span'));
      const busy = () => done && done.id === id;
      const btn = button({ onTap: (e, b) => {
        if (busy()) return;
        const r = ctx.act('signUpkeep', { sector: id }, b);
        if (r.ok) signed(id, b);
      } });
      btn.classList.add('block');
      // the upgrade is a secondary action that sits up with the tier info, never where the sign button was
      const up = button({ cls: 'ghost upkeep__up', onTap: (e, b) => {
        if (busy()) return;
        const r = ctx.act('signUpkeep', { sector: id }, b);
        if (r.ok) signed(id, b);
      } });
      box.append(
        h('div.grabber'),
        h('div.sheet-head', h('div', h('span.plate-sign.plate-sign--title', h('span', name)), h('div.subtitle', { text: 'Bakım sözleşmesi' })), close),
        h('div.upkeep__grid',
          h('div', h('div.kicker', { text: 'Kademe' }), tiers),
          h('div.upkeep__rate', h('div.kicker', { text: 'Gelir' }), rate)),
        next, up,
        h('p.upkeep__note', { text: 'Temiz bölge belediyeden dakikada ödeme getirir. Bölge hasar alınca bakım durur.' }),
        paused, ok, btn);
      return { name, tiers, rate, next, paused, btn, up, ok };
    });
  }

  return {
    el,
    onHide() { done = null; clearTimeout(closeTimer); },
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
      const confirming = !!done && done.id === id;
      const sign = u.tier === 0 && !!u.nextCostText && !confirming;
      const upgrade = u.tier > 0 && !!u.nextCostText && !confirming;
      T(r.next, u.nextCostText || 'Son kademede');
      show(r.next, !confirming && !upgrade); // the upgrade button's sub line carries the cost
      T(r.paused, u.pausedText || '');
      show(r.paused, !!u.pausedText && !confirming);
      T(r.ok.lastChild, confirming ? `Kademe ${done.tier} imzalandı.` : '');
      show(r.ok, confirming);
      show(r.btn, sign);
      show(r.up, upgrade);
      if (sign) r.btn.set({ label: u.button, primary: u.enabled && ctx.primaryOK(), enabled: u.enabled, reason: u.reason, key: `signUpkeep:${id}` });
      if (upgrade) r.up.set({ label: u.button, sub: u.nextCostText, primary: false, enabled: u.enabled, reason: u.reason, key: `signUpkeep:${id}` });
    },
  };
}
