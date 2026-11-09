// Aftermath v2 UI: Şirket (ARCH §7.3): Filo (buy cards), Geliştirmeler (Ekipman, Fabrika hattı, Vardiya şefi), İstatistik.
import { h, icon, T, show, keyed, button, clear } from './dom.js';

const ICON = { fire: 'g-firetruck', debris: 'g-excavator', carve: 'g-cleaver' };
const TONE = { fire: 'c-yangin', debris: 'c-enkaz', carve: 'c-kesim' };
const UP_ICON = { speed: 't-gauge', lines: 't-factory', foreman: 't-route' };

export function createCompany(ctx) {
  const { game } = ctx;
  const el = h('div.sheet-slot.page.page-company.off');
  const box = h('div.page-box');
  el.appendChild(box);
  ctx.L.sheet.appendChild(el);
  const trust = h('b.num');
  const fleetEl = h('div.buy-list');
  const upHead = h('div.sec-h', { text: 'Geliştirmeler' });
  const upEl = h('div.buy-list');
  const statsEl = h('dl.stats');
  box.append(
    h('div.p-head', h('div', h('div.title', { text: 'Şirket' }), h('div.subtitle', { text: 'Aftermath Temizlik A.Ş.' })), h('div.cap', h('span', { text: 'Güven' }), trust)),
    h('div.page-scroll.scroll', h('div.sec-h', { text: 'Filo' }), fleetEl, upHead, upEl, h('div.sec-h', { text: 'İstatistik' }), statsEl));

  function buyCard(iconId, tone, onTap) {
    const name = h('div.buy__name');
    const owned = h('div.buy__owned.num');
    const desc = h('div.buy__desc');
    const price = h('b.num.buy__price');
    const btn = button({ label: 'Satın al', onTap });
    btn.classList.add('sm');
    const card = h('div.buy.card', h('div.tile', icon(iconId, 26, tone)), h('div.buy__body', h('div.buy__top', name, owned), desc, price), h('div.buy__side', btn));
    return { card, name, owned, desc, price, btn };
  }

  return {
    el,
    update(s) {
      const c = game.company(s);
      T(trust, String(c.trust));
      const fr = keyed(fleetEl, 'f', () => {
        const refs = {};
        for (const v of c.fleet) {
          const r = buyCard(ICON[v.type], TONE[v.type], (e, b) => {
            const out = ctx.act('buyVehicle', { type: v.type }, b);
            if (out.ok) ctx.fx.coinsFrom(b, 'out');
          });
          fleetEl.appendChild(r.card);
          refs[v.type] = r;
        }
        return refs;
      });
      for (const v of c.fleet) {
        const r = fr[v.type];
        T(r.name, v.name);
        T(r.owned, v.ownedText);
        T(r.desc, v.desc);
        T(r.price, v.priceText);
        r.btn.set({ primary: v.primary && ctx.primaryOK(), enabled: v.canBuy, reason: v.reason, key: `buyVehicle:${v.type}` });
      }
      show(upHead, c.upgrades.length > 0);
      const ur = keyed(upEl, c.upgrades.map((u) => u.key).join(','), () => {
        const refs = {};
        for (const u of c.upgrades) {
          const r = buyCard(UP_ICON[u.key] || 't-plus', 'c-sinyal', (e, b) => {
            const out = ctx.act('buyUpgrade', { key: u.key }, b);
            if (out.ok) ctx.fx.coinsFrom(b, 'out');
          });
          upEl.appendChild(r.card);
          refs[u.key] = r;
        }
        return refs;
      });
      for (const u of c.upgrades) {
        const r = ur[u.key];
        T(r.name, u.name);
        T(r.owned, u.levelText || (u.level ? 'Alındı' : ''));
        T(r.desc, u.desc);
        T(r.price, u.reason === 'En üst seviyede' || (u.key === 'foreman' && u.level) ? '' : u.priceText);
        r.btn.set({ primary: false, enabled: u.canBuy, reason: u.reason, key: `buyUpgrade:${u.key}` });
      }
      const sk = c.stats.map((x) => `${x.label}=${x.value}`).join('|');
      if (statsEl.__k !== sk) {
        statsEl.__k = sk;
        clear(statsEl);
        for (const st of c.stats) statsEl.appendChild(h('div', h('dt', { text: st.label }), h('dd.num', { text: st.value })));
      }
    },
  };
}
