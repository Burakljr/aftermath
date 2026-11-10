// Station card (bottom panel): dish, name, level, price per dish now -> next, cooking time,
// progress to the next speed milestone and one big button (Upgrade, hold to repeat; or Open
// for the next station). Closes with the X or a tap on empty floor.
import { el, icon, onTap, makeHold, setText, toggle, setVar, setHTML, pulse } from './dom.js';
import { closeButton, priceButton } from './panel.js';
import { formatSeconds } from '../game/format.js';

export function createCard(ctx) {
  const { game } = ctx;
  const tileIco = icon('juice');
  const name = el('div', 'name');
  const sub = el('div', 'sub');
  const x = closeButton('x');

  const priceK = el('span', 'k');
  const priceNow = el('span');
  const priceNext = el('span', 'next');
  const priceArrow = icon('arrow', 'arrow');
  const priceRow = el('div', 'stat', null, [priceK, el('span', 'v', null, [icon('coin'), priceNow, priceArrow, priceNext])]);
  const timeK = el('span', 'k');
  const timeV = el('span');
  const timeRow = el('div', 'stat', null, [timeK, el('span', 'v', null, [timeV])]);
  const dishK = el('span', 'k');
  const dishIco = el('span', 'ico');
  const dishRow = el('div', 'stat dish', null, [dishK, el('span', 'v', null, [dishIco])]);
  const stats = el('div', 'card-stats', null, [priceRow, timeRow, dishRow]);

  const msFill = el('i');
  const msLab = el('span');
  const ms = el('div', 'ms', null, [el('div', 'track', null, [msFill]), el('span', 'lab', null, [icon('bolt'), msLab])]);
  const desc = el('div', 'desc');
  const btn = priceButton('btn btn-primary big');
  const need = el('div', 'need');

  const root = el('div', 'card', { role: 'dialog' }, [
    el('div', 'card-head', null, [el('div', 'tile', null, [tileIco]), el('div', 'ti', null, [name, sub])]),
    x, stats, ms, desc, btn.root, need,
  ]);
  ctx.layers.panels.appendChild(root);

  let station = null;
  let open = false;
  let lastKey = '';
  let refreshT = 0;
  // the card re-reads the station 10 times a second, and at once after a purchase
  for (const ev of ['upgrade', 'open', 'money']) game.on(ev, (p) => { if (ev !== 'money' || p.delta < 0) refreshT = 0; });

  onTap(x, () => { ctx.sfx('tap'); ctx.closeCard(); });
  root.addEventListener('pointerdown', (e) => e.stopPropagation());

  function press(first) {
    if (!station) return false;
    const v = game.select.stationView(station);
    if (!v) return false;
    if (!v.open) {
      if (!first) return false;
      const r = game.act({ type: 'open', station });
      if (!r.ok) { ctx.sfx('nope'); return false; }
      pulse(btn.root, 'press');
      return false;
    }
    const r = game.act({ type: 'upgrade', station });
    if (!r.ok) { if (first) ctx.sfx('nope'); return false; }
    return true;
  }
  const hold = makeHold(btn.root, press);

  function show(id) {
    station = id;
    open = true;
    lastKey = '';
    toggle(root, 'open', true);
    refresh(true);
  }
  function hide() {
    open = false;
    hold.stop();
    toggle(root, 'open', false);
  }

  function refresh(force) {
    if (!station) return;
    const v = game.select.stationView(station);
    if (!v) return;
    const key = [v.id, v.open, v.level, v.canAfford, v.canOpen, v.locked, v.max, game.state.settings.lang].join('|');
    if (!force && key === lastKey) {
      // only the "need N more" text depends on money every frame
      if (!v.canAfford && !v.locked && !v.max) setText(need, ctx.tx('card.need', { n: ctx.num(v.missing) }));
      return;
    }
    lastKey = key;
    const dishName = ctx.tx(v.dishKey);
    const dishSvg = ctx.icons[ctx.dishIcon(v.dish)];
    tileIco.innerHTML = dishSvg;
    setText(name, ctx.tx(v.nameKey));
    setText(timeK, ctx.tx('card.time'));
    setText(timeV, formatSeconds(v.time, ctx.lang()));
    setText(dishK, dishName);
    setHTML(dishIco, dishSvg);
    if (v.open) {
      setText(sub, ctx.tx('card.level', { n: v.level }));
      setText(priceK, ctx.tx('card.price'));
      setText(priceNow, ctx.num(v.price));
      toggle(priceArrow, 'is-hidden', v.max);
      toggle(priceNext, 'is-hidden', v.max);
      setText(priceNext, ctx.num(v.nextPrice));
      const m = v.milestone;
      setVar(msFill, '--p', String(m.next === null ? 1 : m.ratio));
      setText(msLab, m.next === null ? ctx.tx('card.milestoneTop') : ctx.tx('card.milestone', { n: m.next }));
      btn.setLabel(v.max ? ctx.tx('card.max') : ctx.tx('card.upgrade'));
      btn.setPrice(v.max ? null : ctx.num(v.cost));
      btn.setOff(!v.canAfford);
      btn.setReady(false);
    } else {
      setText(sub, ctx.tx('card.newDish', { dish: dishName }));
      const prev = game.config().stations[v.index - 1];
      if (v.locked && prev) setText(desc, ctx.tx('card.lockedFirst', { station: ctx.tx(prev.nameKey + '.acc') }));
      btn.setLabel(ctx.tx('card.open'));
      btn.setPrice(ctx.num(v.openCost));
      btn.setOff(!v.canAfford);
      btn.setReady(v.canOpen && v.canAfford);
    }
    // open: price + time rows, milestone bar; next: dish + time rows; locked: a short note
    toggle(stats, 'is-hidden', v.locked);
    toggle(priceRow, 'is-hidden', !v.open);
    toggle(dishRow, 'is-hidden', v.open);
    toggle(ms, 'is-hidden', !v.open);
    toggle(desc, 'is-hidden', !v.locked);
    toggle(btn.root, 'is-hidden', v.locked);
    setText(need, v.canAfford || v.locked || v.max ? '' : ctx.tx('card.need', { n: ctx.num(v.missing) }));
  }

  return {
    root,
    show,
    hide,
    isOpen: () => open,
    station: () => (open ? station : null),
    button: () => btn.root,
    update(dt) {
      hold.update(dt);
      refreshT -= dt;
      if (open && refreshT <= 0) { refreshT = 0.1; refresh(false); }
    },
    relabel() { lastKey = ''; if (open) refresh(true); },
  };
}
