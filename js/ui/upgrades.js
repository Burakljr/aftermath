// Upgrades panel: every station (upgrade / open), then the restaurant: hire a cook,
// buy a table, cook speed. Buy buttons repeat while held.
import { el, icon, onTap, makeHold, setText, toggle, setHTML } from './dom.js';
import { createSheet, priceButton } from './panel.js';

export function createUpgrades(ctx) {
  const { game } = ctx;
  const sheet = createSheet(ctx, { cls: 'upgrades-sheet' });
  const secKitchen = el('div', 'sec');
  const kitchen = el('div');
  const secRest = el('div', 'sec');
  const rest = el('div');
  const tip = el('div', 'tip');
  sheet.body.append(secKitchen, kitchen, secRest, rest, tip);

  const rows = [];
  const holds = [];

  function makeRow(parent, kind, id) {
    const tileIco = icon('juice');
    const nm = el('span', 'n');
    const lv = el('span', 'lv');
    const ds = el('span', 's');
    const dsIco = icon('coin');
    const btn = priceButton('btn btn-primary');
    const row = el('div', 'row', { 'data-row': id }, [
      el('div', 'tile', null, [tileIco]),
      el('div', 'info', null, [el('div', 'nm', null, [nm]), el('div', 'ds', null, [lv, dsIco, ds])]),
      btn.root,
    ]);
    parent.appendChild(row);
    const r = { kind, id, row, tileIco, nm, lv, ds, dsIco, btn, key: '' };
    holds.push(makeHold(btn.root, (first) => buy(r, first)));
    rows.push(r);
    return r;
  }

  function buy(r, first) {
    let a;
    if (r.kind === 'station') {
      const v = game.select.stationView(r.id);
      if (!v.open) {
        if (!first) return false;
        const res = game.act({ type: 'open', station: r.id });
        if (!res.ok) ctx.sfx('nope');
        return false;
      }
      a = { type: 'upgrade', station: r.id };
    } else a = { type: r.kind };
    const res = game.act(a);
    if (!res.ok) { if (first) ctx.sfx('nope'); return false; }
    return true;
  }

  function build() {
    kitchen.innerHTML = '';
    rest.innerHTML = '';
    rows.length = 0;
    holds.length = 0;
    for (const s of game.state.stations) makeRow(kitchen, 'station', s.id);
    makeRow(rest, 'hire', 'hire');
    makeRow(rest, 'buyTable', 'table');
    makeRow(rest, 'cookSpeed', 'speed');
  }

  function refresh() {
    for (const r of rows) {
      let key;
      if (r.kind === 'station') {
        const v = game.select.stationView(r.id);
        key = [v.open, v.level, v.canAfford, v.locked, v.canOpen, ctx.lang()].join('|');
        if (key === r.key) continue;
        r.key = key;
        setHTML(r.tileIco, ctx.icons[ctx.dishIcon(v.dish)]);
        setText(r.nm, ctx.tx(v.nameKey));
        toggle(r.lv, 'is-hidden', !v.open);
        setText(r.lv, ctx.tx('mark.level', { n: v.level }));
        toggle(r.row, 'locked', v.locked);
        if (v.open) {
          setHTML(r.dsIco, ctx.icons.coin);
          setText(r.ds, ctx.tx('upgrades.perDish', { n: ctx.num(v.price) }));
          r.btn.setLabel('');
          r.btn.setPrice(v.max ? null : ctx.num(v.cost));
          if (v.max) r.btn.setLabel(ctx.tx('upgrades.max'));
          r.btn.setOff(!v.canAfford);
          toggle(r.btn.root, 'is-hidden', false);
        } else if (v.locked) {
          const prev = game.config().stations[v.index - 1];
          setHTML(r.dsIco, ctx.icons.lock);
          setText(r.ds, ctx.tx('upgrades.locked', { station: ctx.tx(prev.nameKey + '.acc') }));
          toggle(r.btn.root, 'is-hidden', true);
        } else {
          setHTML(r.dsIco, ctx.icons[ctx.dishIcon(v.dish)]);
          setText(r.ds, ctx.tx(v.dishKey));
          r.btn.setLabel(ctx.tx('upgrades.open'));
          r.btn.setPrice(ctx.num(v.openCost));
          r.btn.setOff(!v.canAfford);
          toggle(r.btn.root, 'is-hidden', false);
        }
        continue;
      }
      let v;
      let title;
      let desc;
      let ic;
      let lvText;
      if (r.kind === 'hire') {
        v = game.select.cookView();
        title = 'upgrades.hire'; desc = 'upgrades.hireDesc'; ic = 'chef';
        lvText = ctx.tx('upgrades.count', { n: v.count, max: v.max });
      } else if (r.kind === 'buyTable') {
        v = game.select.tableView();
        title = 'upgrades.table'; desc = 'upgrades.tableDesc'; ic = 'table';
        lvText = ctx.tx('upgrades.count', { n: v.owned, max: v.max });
      } else {
        v = game.select.cookSpeedView();
        title = 'upgrades.speed'; desc = 'upgrades.speedDesc'; ic = 'boot';
        lvText = ctx.tx('mark.level', { n: v.level });
      }
      key = [lvText, v.full, v.canAfford, ctx.lang()].join('|');
      if (key === r.key) continue;
      r.key = key;
      setHTML(r.tileIco, ctx.icons[ic]);
      setText(r.nm, ctx.tx(title));
      setText(r.lv, lvText);
      setHTML(r.dsIco, '');
      toggle(r.dsIco, 'is-hidden', true);
      setText(r.ds, ctx.tx(desc));
      r.btn.setLabel(v.full ? ctx.tx('upgrades.max') : '');
      r.btn.setPrice(v.full ? null : ctx.num(v.cost));
      r.btn.setOff(v.full || !v.canAfford);
    }
  }

  function relabel() {
    sheet.setTitle(ctx.tx('upgrades.title'));
    setText(secKitchen, ctx.tx('upgrades.stations'));
    setText(secRest, ctx.tx('upgrades.staff'));
    setText(tip, ctx.tx('upgrades.tip'));
    for (const r of rows) r.key = '';
  }

  build();
  return {
    sheet,
    open() { for (const r of rows) r.key = ''; sheet.open(); refresh(); },
    close() { sheet.hide(); for (const h of holds) h.stop(); },
    isOpen: () => sheet.isOpen(),
    update(dt) {
      for (const h of holds) h.update(dt);
      if (sheet.isOpen()) refresh();
    },
    relabel,
    rebuild() { build(); relabel(); },
    rowButton: (id) => { const r = rows.find((x) => x.id === id); return r ? r.btn.root : null; },
  };
}
