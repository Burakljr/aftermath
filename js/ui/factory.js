// Aftermath v2 UI: Fabrika (DESIGN §9.4 factory row, ARCH §7.3). Lines with running jobs and progress, recipe cards
// "5 pul → 1 zırh plakası · 20 sn" / "Ham satarsan 210 bin ₺, işlersen 330 bin ₺", Üret with reasons, auto toggle (after G11).
import { h, icon, T, C, A, show, tap, keyed, button, bar, setBar } from './dom.js';
import { ITEM_ICON } from './panel-city.js';

const OUT = { concrete: 'concrete', armor: 'armor', cell: 'cell', relic: 'relic' };
const IN = { concrete: 'bone', armor: 'scale', cell: 'blood', relic: 'eye' };

export function createFactory(ctx) {
  const { game } = ctx;
  const el = h('div.sheet-slot.page.page-factory.off');
  const box = h('div.page-box');
  el.appendChild(box);
  ctx.L.sheet.appendChild(el);
  const cap = h('b.num');
  const jobsEl = h('div.jobs');
  const recEl = h('div.recipes');
  const locked = h('p.grey-note');
  box.append(
    h('div.p-head', h('div', h('div.title', { text: 'Fabrika' }), h('div.subtitle', { text: 'Ham parçayı işle, daha iyi fiyata sat.' })), h('div.cap', h('span', { text: 'Hatlar' }), cap)),
    h('div.page-scroll.scroll', h('div.sec-h', { text: 'Üretim hatları' }), jobsEl, h('div.sec-h', { text: 'Tarifler' }), recEl, locked));

  return {
    el,
    update(s) {
      const f = game.factory(s);
      T(cap, f.linesText);
      // lines: one row per line, busy or idle
      const lines = [];
      for (let i = 0; i < f.lines; i++) lines.push(f.jobs.find((j) => j.line === i) || null);
      const jr = keyed(jobsEl, lines.map((j, i) => (j ? `${i}:${j.id}` : `${i}:-`)).join(','), () => lines.map((j, i) => {
        const b = bar('gold');
        const left = h('span.num');
        const row = h(`div.line${j ? '.busy' : '.idle'}`,
          h('span.line__no.num', { text: String(i + 1) }),
          h('div.line__body', h('div.line__name', { text: j ? j.name : 'Boş hat' }), j ? b : h('div.kicker', { text: 'Bir tarif seç' })),
          left);
        jobsEl.appendChild(row);
        return { b, left, j };
      }));
      lines.forEach((j, i) => {
        if (!j || !jr[i]) return;
        setBar(jr[i].b, j.progress);
        T(jr[i].left, j.leftText);
      });
      let primaryGiven = !ctx.primaryOK();
      const rr = keyed(recEl, f.recipes.map((r) => r.id).join(','), () => {
        const refs = {};
        for (const r of f.recipes) {
          const raw = h('div.recipe__raw');
          const have = h('span.recipe__have.num');
          const btn = button({ label: 'Üret', onTap: (e, b) => ctx.act('startJob', { rid: r.id }, b) });
          btn.classList.add('sm');
          const sw = h('button.switch', { type: 'button', role: 'switch', 'aria-label': r.autoLabel });
          tap(sw, () => ctx.act('toggleAuto', { rid: r.id }, sw));
          const auto = h('label.recipe__auto', h('span', { text: r.autoLabel }), sw);
          recEl.appendChild(h('div.recipe.card',
            h('div.recipe__flow', h('span.tile', icon(ITEM_ICON[IN[r.id]] || 'g-crate', 22)), icon('t-chevron', 18, 'c-beton'), h('span.tile', icon(ITEM_ICON[OUT[r.id]] || 'g-crate', 22, 'c-sinyal'))),
            h('div.recipe__body', h('div.recipe__name', { text: r.name }), h('div.recipe__in.num', { text: r.inText })),
            raw, have, h('div.recipe__side', btn), auto));
          refs[r.id] = { raw, have, btn, sw, auto };
        }
        return refs;
      });
      for (const r of f.recipes) {
        const x = rr[r.id];
        if (!x) continue;
        T(x.raw, r.rawText);
        T(x.have, `Depoda ${r.have} / ${r.need} gerekli`);
        const prim = r.canStart && !primaryGiven;
        if (prim) primaryGiven = true;
        x.btn.set({ primary: prim, enabled: r.canStart, reason: r.reason, key: `startJob:${r.id}` });
        show(x.auto, r.autoAvailable);
        A(x.sw, 'aria-checked', r.auto ? 'true' : 'false');
      }
      T(locked, f.locked ? `${f.locked} tarif daha ileride açılır.` : '');
      show(locked, !!f.locked);
      void C;
    },
  };
}
