// Places panel: the restaurants in order (complete / here / locked / coming soon) and the
// way to the next one once the current one is complete.
import { el, icon, onTap, setText, toggle, setHTML } from './dom.js';
import { createSheet } from './panel.js';

const PLACE_ICONS = { inn: 'inn', harbor: 'harbor', 'loc.forest': 'forest', 'loc.castle': 'castle' };

export function createPlaces(ctx) {
  const { game } = ctx;
  const sheet = createSheet(ctx, { cls: 'places-sheet' });
  const list = el('div');
  sheet.body.appendChild(list);
  let rows = [];
  let key = '';

  function build() {
    list.innerHTML = '';
    rows = game.select.locations().map((l, i) => {
      const nm = el('span', 'n');
      const ds = el('span', 's');
      const tag = el('span', 'tag');
      const go = el('button', 'btn btn-primary ready is-hidden', { type: 'button' });
      const row = el('div', 'row place', { 'data-place': l.id }, [
        el('div', 'tile', null, [icon(PLACE_ICONS[l.id] || 'inn')]),
        el('div', 'info', null, [el('div', 'nm', null, [nm]), el('div', 'ds', null, [ds])]),
        tag, go,
      ]);
      onTap(go, () => {
        const r = game.act({ type: 'nextLocation' });
        if (!r.ok) { ctx.sfx('nope'); return; }
        sheet.hide();
      });
      list.appendChild(row);
      return { row, nm, ds, tag, go, i };
    });
  }

  function refresh() {
    const ls = game.select.locations();
    const loc = game.select.location();
    const k = ls.map((l) => l.status + l.canGo).join(',') + loc.goalsDone + ctx.lang();
    if (k === key) return;
    key = k;
    if (rows.length !== ls.length) build();
    ls.forEach((l, i) => {
      const r = rows[i];
      r.row.className = 'row place ' + (l.canGo ? 'next' : l.status);
      setText(r.nm, ctx.tx(l.nameKey));
      let ds = '';
      let tag = '';
      if (l.status === 'done') { ds = ctx.tx('places.n', { n: i + 1 }); tag = ctx.tx('places.done'); }
      else if (l.status === 'current' || l.status === 'complete') {
        ds = ctx.tx('places.progress', { n: loc.goalsDone, total: loc.goalsTotal });
        tag = l.status === 'complete' ? ctx.tx('places.done') : ctx.tx('places.here');
      } else if (l.status === 'locked') { ds = l.canGo ? ctx.tx('places.n', { n: i + 1 }) : ctx.tx('places.locked'); tag = ''; }
      else { ds = ctx.tx('places.n', { n: i + 1 }); tag = ctx.tx('places.soon'); }
      setText(r.ds, ds);
      setText(r.tag, tag);
      toggle(r.tag, 'is-hidden', !tag || l.canGo);
      toggle(r.go, 'is-hidden', !l.canGo);
      setText(r.go, ctx.tx('places.go'));
    });
  }

  build();
  return {
    sheet,
    open() { key = ''; sheet.open(); refresh(); },
    close() { sheet.hide(); },
    isOpen: () => sheet.isOpen(),
    update() { if (sheet.isOpen()) refresh(); },
    relabel() { sheet.setTitle(ctx.tx('places.title')); key = ''; },
    goButton: () => { const r = rows.find((x) => !x.go.classList.contains('is-hidden')); return r ? r.go : null; },
  };
}
