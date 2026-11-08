// Aftermath v2 UI: Depo (UI-SPEC 6-depot, DESIGN step 6 + §8 Sale). Stock rows with icon tiles, sparkline, unit price;
// hold-to-sell ticks the quantity up (accelerating) while Rıza's unit price visibly ticks down: the preview is a silent
// dry run of the real 'sell' action on a copy of the state, so the UI never re-implements the elasticity rule.
// Offers (after G8) with countdown rings; Rıza header + permanent grey note; "Hepsini Rıza'ya sat" footer.
import { h, icon, setIcon, T, C, S, A, show, tap, keyed, button, svgEl } from './dom.js';
import { silently } from '../game/sim.js';
import { ITEM_ICON } from './panel-city.js';

const TREND = { up: ['t-up', 'artıyor'], down: ['t-down', 'düşüyor'], flat: [null, 'sabit'] };

function sparkPath(hist, w = 62, hgt = 22) {
  if (!hist || hist.length < 2) return '';
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of hist) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = Math.max(0.05, hi - lo);
  let d = '';
  hist.forEach((v, i) => {
    const x = (i / (hist.length - 1)) * (w - 4) + 2;
    const y = hgt - 3 - ((v - lo) / span) * (hgt - 6);
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  return d;
}

export function createDepot(ctx) {
  const { game } = ctx;
  const el = h('div.sheet-slot.page.page-depot.off');
  const box = h('div.page-box');
  el.appendChild(box);
  ctx.L.sheet.appendChild(el);

  const count = h('b.num');
  const offersEl = h('div.offers');
  const rowsEl = h('div.rows');
  const rizaLine = h('div.buyer__note');
  const note = h('p.grey-note');
  const dna = h('div.dna-line', icon('t-dna', 18, 'c-sinyal'), h('span'));
  const all = button({ icon: 'g-lira', iconSize: 20, onTap: (e, b) => {
    const r = ctx.act('sellAll', { buyer: 'riza' }, b);
    if (r.ok) ctx.fx.coinsFrom(b, 'in');
  } });
  all.classList.add('block');
  box.append(
    h('div.p-head', h('div', h('div.title', { text: 'Depo' }), h('div.subtitle', { text: 'Parçalar burada bekler, bozulmaz.' })), h('div.cap', h('span', { text: 'Stok' }), count)),
    h('div.page-scroll.scroll', offersEl,
      h('div.buyer', h('div.avatar.riza', { text: 'R' }), h('div', h('div.buyer__name', { text: 'Hurdacı Rıza alıyor' }), rizaLine)),
      rowsEl, dna, note),
    h('div.page-foot', all));

  const rowRefs = {};
  let hold = null;

  function startHold(k, btn, ev) {
    const s = ctx.s;
    if (!s || s.inv[k] <= 0) {
      ctx.refuse(btn, 'Depoda yok', true);
      return;
    }
    if (!ctx.allows(`sell:${k}`)) return;
    ev.preventDefault();
    try { btn.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
    const clone = structuredClone(s);
    const first = game.rizaUnit(clone, k);
    silently(() => game.act(clone, 'sell', { item: k, qty: 1 }));
    hold = { k, btn, clone, qty: 1, total: first, unit: game.rizaUnit(clone, k), next: performance.now() + 380, step: 260, max: s.inv[k] };
    btn.classList.add('holding');
    paintHold();
  }
  function paintHold() {
    const r = rowRefs[hold.k];
    T(r.sellMain, `${hold.qty} adet`);
    T(r.sellSub, game.fmtMoney(hold.unit));
  }
  function tickHold(now) {
    if (!hold || now < hold.next || hold.qty >= hold.max) return;
    const u = game.rizaUnit(hold.clone, hold.k);
    silently(() => game.act(hold.clone, 'sell', { item: hold.k, qty: 1 }));
    hold.qty++;
    hold.total += u;
    hold.unit = game.rizaUnit(hold.clone, hold.k);
    hold.step = Math.max(55, hold.step * 0.8);
    hold.next = now + hold.step;
    ctx.sfx('tick');
    paintHold();
  }
  function endHold(cancel) {
    if (!hold) return;
    const h0 = hold;
    hold = null;
    h0.btn.classList.remove('holding');
    if (cancel) return;
    const r = ctx.act('sell', { item: h0.k, qty: h0.qty }, h0.btn);
    if (r.ok) ctx.fx.coinsFrom(h0.btn, 'in', Math.min(6, 2 + h0.qty));
    ctx.dirty = true;
  }

  function buildRows(items) {
    return keyed(rowsEl, items.map((i) => i.key).join(','), () => {
      for (const it of items) {
        const name = h('div.row__name');
        const stock = h('div.row__stock');
        const path = svgEl('path', { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
        const spark = svgEl('svg', { width: 62, height: 22, viewBox: '0 0 62 22', class: 'spark__svg' });
        spark.appendChild(path);
        const dIcon = icon('t-up', 12);
        const dText = h('span');
        const delta = h('span.delta', dIcon, dText);
        const sellMain = h('b.num');
        const sellSub = h('span');
        const sell = h('button.sell', { type: 'button', 'data-key': `sell:${it.key}`, 'data-dim': '' }, sellMain, sellSub);
        sell.addEventListener('pointerdown', (e) => startHold(it.key, sell, e));
        sell.addEventListener('pointerup', (e) => { e.stopPropagation(); endHold(false); });
        sell.addEventListener('pointercancel', () => endHold(true));
        sell.addEventListener('click', (e) => e.stopPropagation());
        sell.addEventListener('contextmenu', (e) => e.preventDefault());
        const tile = h(`div.tile${it.rare ? '.rare' : ''}`, icon(ITEM_ICON[it.key] || 'g-crate', 24, `item-${it.key}`), it.rare ? h('span.tag.gold.rare-tag', { text: 'Nadir' }) : null);
        rowsEl.appendChild(h('div.row', tile, h('div', name, stock), h('div.spark', spark, delta), sell));
        rowRefs[it.key] = { name, stock, path, spark, delta, dIcon, dText, sell, sellMain, sellSub, histKey: '' };
      }
      return {};
    });
  }

  return {
    el,
    frame(s, now) {
      tickHold(now);
    },
    onHide() {
      endHold(true);
    },
    update(s) {
      const d = game.depot(s);
      T(count, d.countText);
      buildRows(d.items);
      for (const it of d.items) {
        const r = rowRefs[it.key];
        if (!r) continue;
        T(r.name, it.name);
        T(r.stock, it.countText);
        const hist = s.market[it.key] ? s.market[it.key].hist : null;
        const hk = hist ? `${hist.length}|${hist[hist.length - 1]}` : '';
        if (hk !== r.histKey) {
          r.histKey = hk;
          A(r.path, 'd', sparkPath(hist));
          // no price history yet: no flat placeholder line (playtest m21)
          const moved = !!hist && hist.length > 1 && hist.some((v) => Math.abs(v - hist[0]) > 1e-6);
          S(r.spark, 'visibility', moved ? '' : 'hidden');
          S(r.delta, 'visibility', moved ? '' : 'hidden');
        }
        const [ic, word] = TREND[it.trend] || TREND.flat;
        show(r.dIcon, !!ic);
        if (ic) setIcon(r.dIcon, ic);
        T(r.dText, word);
        C(r.delta, 'up', it.trend === 'up');
        C(r.delta, 'down', it.trend === 'down');
        C(r.sell, 'empty', it.count <= 0);
        if (!hold || hold.k !== it.key) {
          T(r.sellMain, it.unitText);
          T(r.sellSub, it.count > 0 ? 'tanesi, basılı tut' : 'stok yok');
        }
      }
      // offers
      const offers = d.offersOn ? d.offers : [];
      const ok = keyed(offersEl, offers.map((o) => o.id).join(','), () => {
        const refs = {};
        for (const o of offers) {
          const ring = svgEl('circle', { cx: 22, cy: 22, r: 19, fill: 'none', stroke: 'currentColor', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': '119.4' });
          const rsvg = svgEl('svg', { width: 44, height: 44, viewBox: '0 0 44 44' });
          rsvg.appendChild(svgEl('circle', { cx: 22, cy: 22, r: 19, fill: 'none', stroke: 'rgba(255,255,255,.1)', 'stroke-width': 3 }));
          rsvg.appendChild(ring);
          const left = h('span.num');
          const what = h('div.offer__what');
          const sub = h('div.offer__sub');
          const btn = button({ cls: 'outline sm', label: 'Sat', onTap: (e, b) => {
            const cur = game.depot(ctx.s).offers.find((x) => x.id === o.id);
            if (!cur) return;
            if (!cur.canSell) {
              ctx.refuse(b, cur.reason, true);
              return;
            }
            const r = ctx.act('acceptOffer', { offerId: o.id, qty: Math.min(cur.have, cur.qty) }, b);
            if (r.ok) ctx.fx.coinsFrom(b, 'in');
          } });
          offersEl.appendChild(h(`div.offer${o.boom ? '.boom' : ''}`,
            h('div.tile', icon(ITEM_ICON[o.item] || 'g-crate', 24)),
            h('div.offer__body', h('div.offer__who', { text: `${o.buyer} teklifi` }), what, sub),
            h('div.offer__side', h('div.ring', rsvg, left), btn)));
          refs[o.id] = { ring, left, what, sub, btn };
        }
        return refs;
      });
      for (const o of offers) {
        const r = ok[o.id];
        if (!r) continue;
        T(r.what, `${o.qtyText}, tanesi ${o.unitText}`);
        T(r.sub, `${o.deltaText}. Elinde ${o.have} adet var.`);
        T(r.left, game.fmtTime(o.untilT));
        A(r.ring, 'stroke-dashoffset', (119.4 * (1 - Math.max(0, Math.min(1, o.untilT / o.life)))).toFixed(1));
        r.btn.set({ enabled: o.canSell, reason: o.reason, key: `acceptOffer:${o.id}` });
      }
      T(rizaLine, d.riza.sub);
      T(note, d.riza.note);
      show(dna, !!d.dnaText);
      if (d.dnaText) T(dna.lastChild, d.dnaText);
      all.set({ label: d.riza.allText, primary: d.riza.enabled && ctx.primaryOK(), enabled: d.riza.enabled, reason: d.riza.reason, key: 'sellAll:riza' });
      void S;
    },
  };
}
