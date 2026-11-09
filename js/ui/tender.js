// Aftermath v2 UI: tender sheet (DESIGN §7, UI-SPEC 3-tender). Document line, job tiles, fleet-estimate axis (hatched band +
// deadline ticks), 3x3 price x deadline grid (tone fill, number always, hatching, "Önerilen", selection ring), outcome
// meter, rival line, CTA. First tender: 3 bubbles (tap to advance). Red cell: one confirm. Reveal: two envelopes, three
// rows filling 300 ms apart, totals, stamp KAZANDIN / SÜPÜRGE HOLDİNG, the deciding factor, next action.
import { h, icon, T, C, S, A, show, tap, keyed, button } from './dom.js';

const TONE = { green: 'c-hi', amber: 'c-mid', red: 'c-lo' };

export function createTenderSheet(ctx) {
  const { game } = ctx;
  const el = h('div.sheet-slot.sheet-tender.off');
  const box = h('div.sheet-box.tender');
  el.appendChild(box);
  ctx.L.sheet.appendChild(el);
  let confirm = null;
  let confirmFor = '';

  function closeConfirm() {
    if (confirm) confirm.remove();
    confirm = null;
    confirmFor = '';
    ctx.dirty = true;
  }

  function openConfirm(text) {
    closeConfirm();
    const send = button({ label: 'Gönder', icon: 't-gavel', primary: true, onTap: (e, b) => {
      closeConfirm();
      ctx.act('confirmRed', null, b);
    } });
    const no = button({ label: 'Vazgeç', onTap: () => closeConfirm() });
    confirm = h('div.confirm', h('div.confirm__card.glass',
      h('div.confirm__head', icon('t-alert', 22, 'c-yangin'), h('div.confirm__title', { text: 'Riskli teklif' })),
      h('p.confirm__text', { text }),
      h('div.confirm__btns', no, send)));
    el.appendChild(confirm);
    confirmFor = text;
    ctx.dirty = true;
  }

  function buildBid(no) {
    const sub = h('div.subtitle');
    const jf = h('b.num');
    const jr = h('b.num');
    const jc = h('b.num');
    const estRange = h('b.num');
    const band = h('i.axis__band');
    const ticks = [0, 1, 2].map(() => h('span.tick', h('i'), h('span.num')));
    const axis = h('div.axis', h('i.axis__rail'), band, ...ticks);
    const est = h('div.est', h('div.est__head', h('span', { text: 'Filonla tahmini süre' }), estRange), axis);
    const colHeads = [0, 1, 2].map(() => h('div.gh', h('b'), h('span.num')));
    const grid = h('div.tgrid', h('div.gh.gh--corner', { text: 'Söz verdiğin süre' }), ...colHeads);
    const rows = [];
    for (let si = 0; si < 3; si++) {
      const lab = h('b');
      const tm = h('span.num');
      grid.appendChild(h('div.rh', lab, tm));
      const cells = [];
      for (let pi = 0; pi < 3; pi++) {
        const val = h('span.num');
        const tag = h('span.tag.green.cell__tag', { text: 'Önerilen' });
        const cell = h('button.cell', { type: 'button', 'data-key': `selectTenderCell:${pi}:${si}` }, val, tag);
        tap(cell, () => {
          ctx.sfx('click');
          ctx.act('selectTenderCell', { price: pi, speed: si }, cell);
        });
        grid.appendChild(cell);
        cells.push({ cell, val, tag });
      }
      rows.push({ lab, tm, cells });
    }
    const legend = h('div.legend', h('span', h('i.sw.sw--hatch'), h('span.legend__t')));
    const chance = h('div.chance.num');
    const meterFill = h('i');
    const meter = h('div.meter', meterFill);
    const oline = h('div.outcome__line');
    const outcome = h('div.outcome', chance, meter, oline);
    const habit = h('span');
    const tYou = h('b.num');
    const tRiv = h('b.num.c-rakip');
    const rival = h('div.rival-row',
      h('span.rival__logo', icon('g-broom', 20)),
      h('div.rival__txt', h('b', { text: 'Süpürge Holding' }), habit),
      h('div.trust', h('span.trust__row', 'Senin güvenin ', tYou), h('span.trust__row', 'Onların ', tRiv)));
    const cta = button({ icon: 't-gavel', onTap: (e, b) => {
      const r = ctx.act('submitTender', null, b);
      if (!r.ok && r.code === 'confirm') openConfirm(r.reason);
    } });
    cta.classList.add('block');
    const bub = h('button.tbubble', { type: 'button' }, h('span.tbubble__n.num'), h('span.tbubble__t'), h('span.tbubble__more', { text: 'Devam' }));
    tap(bub, () => ctx.act('tip', { key: 'tenderBubble' }, bub));
    const content = h('div.tender__scroll.scroll',
      h('div.docline', h('span.doc-org', icon('g-municipal', 16), 'Körfezkent Belediyesi'), h('span', 'İhale ', h('b.num', { text: `2026/${String(no).padStart(2, '0')}` }))),
      h('div.title.tender__title', { text: 'Temizlik ihalesi' }), sub,
      h('div.job',
        h('div.job__item', icon('g-flame', 22, 'c-yangin'), h('div', jf, h('span', { text: 'yangın' }))),
        h('div.job__item', icon('g-rubble', 22, 'c-enkaz'), h('div', jr, h('span', { text: 'enkaz' }))),
        h('div.job__item', icon('g-carcass', 22, 'c-kesim'), h('div', jc, h('span', { text: 'canavar' })))),
      est, grid, legend, outcome, rival, bub);
    box.append(h('div.grabber'), content, h('div.tender__cta', cta));
    return { sub, jf, jr, jc, estRange, band, ticks, colHeads, rows, legend, chance, meterFill, oline, habit, tYou, tRiv, cta, bub, est, grid, rival, content };
  }

  function updateBid(s, r, g) {
    T(r.sub, g.sub);
    T(r.jf, String(g.summary.fires));
    T(r.jr, g.summary.rubble);
    T(r.jc, g.summary.corpse);
    T(r.estRange, `${game.fmtTime(g.estimate.lo)}–${game.fmtTime(g.estimate.hi)}`);
    const dls = g.rows.map((x) => x.deadline);
    const lo = Math.min(g.estimate.lo, ...dls) * 0.88;
    const hi = Math.max(g.estimate.hi, ...dls) * 1.06;
    const pos = (v) => `${(((v - lo) / (hi - lo)) * 100).toFixed(2)}%`;
    S(r.band, 'left', pos(g.estimate.lo));
    S(r.band, 'width', `${(((g.estimate.hi - g.estimate.lo) / (hi - lo)) * 100).toFixed(2)}%`);
    let selRow = 0;
    g.rows.forEach((row, si) => {
      const tk = r.ticks[si];
      S(tk, 'left', pos(row.deadline));
      T(tk.lastChild, row.time);
      const selected = row.cells.some((c) => c.selected);
      if (selected) selRow = si;
      C(tk, 'on', selected);
      C(tk, 'risk', row.cells[0].hatched);
      T(r.rows[si].lab, row.label);
      T(r.rows[si].tm, row.time);
      row.cells.forEach((c, pi) => {
        const ref = r.rows[si].cells[pi];
        T(ref.val, c.chanceText);
        for (const k of Object.values(TONE)) C(ref.cell, k, TONE[c.tone] === k);
        C(ref.cell, 'risk', c.hatched);
        C(ref.cell, 'on', c.selected);
        A(ref.cell, 'aria-pressed', c.selected ? 'true' : 'false');
        show(ref.tag, c.recommended);
      });
    });
    void selRow;
    g.cols.forEach((name, pi) => {
      T(r.colHeads[pi].firstChild, name);
      T(r.colHeads[pi].lastChild, g.rows[0].cells[pi].priceText);
    });
    T(r.legend.querySelector('.legend__t'), g.legend);
    T(r.chance, g.outcome.chanceText);
    S(r.meterFill, 'width', `${(g.outcome.chance * 100).toFixed(1)}%`);
    T(r.oline, g.outcome.line);
    C(r.chance, 'lo', g.outcome.chance < 0.4);
    C(r.chance, 'hi', g.outcome.chance >= 0.7);
    T(r.habit, ` ${g.rival.habit}`);
    T(r.tYou, String(g.trust));
    T(r.tRiv, String(g.rival.trust));
    r.cta.set({ label: g.button, primary: ctx.primaryOK(), key: 'submitTender' });
    // first-tender bubbles
    const b = g.bubble;
    C(r.bub, 'on', !!b && !confirm);
    if (b) {
      T(r.bub.querySelector('.tbubble__n'), `${b.index + 1}/3`);
      T(r.bub.querySelector('.tbubble__t'), b.text);
      const anchor = b.anchor === 'grid' ? r.grid : b.anchor === 'estimate' ? r.est : r.rival;
      const top = anchor.offsetTop + (b.anchor === 'rival' ? -6 : anchor.offsetHeight + 4);
      S(r.bub, 'top', `${top}px`);
      C(r.bub, 'up', b.anchor === 'rival');
    }
  }

  function buildReveal(rv) {
    const rowsEl = h('div.env-rows');
    rv.rows.forEach((row, i) => {
      const max = Math.max(1, Math.abs(row.youScore), Math.abs(row.rivalScore));
      const yw = Math.max(0.04, row.youScore / max);
      const rw = Math.max(0.04, row.rivalScore / max);
      rowsEl.appendChild(h(`div.env-row${row.better === 'you' ? '.you-better' : '.riv-better'}`, { style: `--i:${i}` },
        h('div.env-row__label', { text: row.label }),
        h('div.env-side.you', h('span.num', { text: row.you }), h('span.ebar', h('i', { style: `--w:${yw.toFixed(3)}` }))),
        h('div.env-side.riv', h('span.num', { text: row.rival }), h('span.ebar', h('i', { style: `--w:${rw.toFixed(3)}` })))));
    });
    const tmax = Math.max(1, rv.total.you, rv.total.rival);
    // review 2 F8: the totals stay blank until the three rows are done, then count up with their bars
    const youTot = h('span.num', { text: '' });
    const rivTot = h('span.num', { text: '' });
    const total = h('div.env-row.env-total', { style: '--i:3' },
      h('div.env-row__label', { text: rv.total.label }),
      h('div.env-side.you', youTot, h('span.ebar', h('i', { style: `--w:${Math.max(0.04, rv.total.you / tmax).toFixed(3)}` }))),
      h('div.env-side.riv', rivTot, h('span.ebar', h('i', { style: `--w:${Math.max(0.04, rv.total.rival / tmax).toFixed(3)}` }))));
    const stamp = h(`div.reveal-stamp.${rv.stampKind}`, h('span', { text: rv.stamp }));
    const main = button({ icon: rv.win ? 't-check' : 'g-carcass', onTap: (e, b) => ctx.act(rv.button.action.id, null, b) });
    main.classList.add('block');
    const sec = rv.secondary ? button({ cls: 'ghost', label: rv.secondary.label, onTap: (e, b) => ctx.act(rv.secondary.action.id, null, b) }) : null;
    // the next actions sit right under the reason and appear ~300 ms after the stamp has landed (review 2 F8)
    const cta = h('div.tender__cta.reveal-cta', main, sec);
    const scrollEl = h('div.tender__scroll.scroll.reveal',
      h('div.docline', h('span.doc-org', icon('g-municipal', 16), 'Körfezkent Belediyesi'), h('span', { text: 'Zarflar açıldı' })),
      h('div.title.tender__title', { text: 'İhale sonucu' }),
      h('div.subtitle', { text: `Kazanma şansın ${rv.chanceText} idi.` }),
      h('div.envelopes',
        h('div.env.you', icon('g-crate', 18), h('b', { text: rv.names.you })),
        h('div.env.riv', icon('g-broom', 18), h('b', { text: rv.names.rival }))),
      rowsEl, total,
      h('div.reveal-foot', stamp, h('div.reveal-why', h('b', { text: rv.why }), rv.line ? h('p', { text: rv.line }) : null)),
      cta);
    box.append(h('div.grabber'), scrollEl);
    return { main, cta, youTot, rivTot, scrollEl, t0: null, calls: 0, tot: rv.total };
  }
  const T_TOTAL = 1.3;
  const T_CTA = 1.85;
  /** counts an integer total up over 300 ms; non-integer texts just appear */
  function countText(text, value, k) {
    if (k <= 0) return '';
    if (k >= 1 || !/^\d+$/.test(String(text))) return text;
    return String(Math.round(value * k));
  }
  function revealStep(r, st) {
    // review 2 F8: the reveal runs on the game clock. Its CSS animations stay paused and are scrubbed from here, so a
    // slow first paint or a stepped capture shows the same sequence as a phone at 60 fps
    const now = st ? st.clock : performance.now() / 1000;
    if (r.t0 == null) {
      if (++r.calls < 2) { T(r.youTot, ''); T(r.rivTot, ''); C(r.cta, 'on', false); return; }
      r.t0 = now;
      r.anims = r.scrollEl.getAnimations ? r.scrollEl.getAnimations({ subtree: true }) : null;
      if (!r.anims) C(r.scrollEl, 'go', true);
    }
    const e = Math.max(0, now - r.t0);
    if (r.anims) for (const a of r.anims) { try { a.pause(); a.currentTime = e * 1000; } catch { /* finished or removed */ } }
    const k = Math.max(0, Math.min(1, (e - T_TOTAL) / 0.3));
    T(r.youTot, countText(r.tot.youText, r.tot.you, e < T_TOTAL ? 0 : k));
    T(r.rivTot, countText(r.tot.rivalText, r.tot.rival, e < T_TOTAL ? 0 : k));
    const kc = Math.max(0, Math.min(1, (e - T_CTA) / 0.26));
    C(r.cta, 'on', e >= T_CTA);
    S(r.cta, 'opacity', kc.toFixed(2));
    S(r.cta, 'transform', `translateY(${(12 * (1 - kc) * (1 - kc)).toFixed(1)}px)`);
  }

  return {
    el,
    confirmOpen: () => !!confirm,
    update(s) {
      const t = s.tender;
      if (!t) return;
      if (t.reveal) {
        if (confirm) closeConfirm();
        const rv = game.reveal(s);
        if (!rv) return;
        const r = keyed(box, `rev${t.no}`, () => buildReveal(rv));
        r.main.set({ label: rv.button.label, primary: ctx.primaryOK(), key: rv.button.action.id });
        el.classList.add('revealing');
        revealStep(r, s);
        return;
      }
      el.classList.remove('revealing');
      const g = game.tenderGrid(s);
      if (!g) return;
      const r = keyed(box, `bid${t.no}`, () => buildBid(t.no));
      updateBid(s, r, g);
      if (confirm && confirmFor && !g.needsConfirm && g.outcome.chance >= 0.4) closeConfirm();
    },
    onHide() {
      closeConfirm();
    },
    frame(s) {
      if (s.tender && s.tender.reveal && box.__refs && box.__refs.cta) revealStep(box.__refs, s);
    },
  };
}
