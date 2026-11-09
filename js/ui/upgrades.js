// Upgrades panel: every station in one list with its level, the gain of the next
// level and a buy button (hold to repeat), so upgrading is fast.
import { el, icon, otext, setText, toggle, onTap, pulse, setVar, makeHold, ICONS, GLYPH, STATION_COLORS } from './dom.js';
import { createModalPanel } from './panel.js';

export function createUpgrades(ctx) {
  const mp = createModalPanel(ctx, { cls: 'up-card', kind: 'green', menu: true });
  const incNum = otext('up-inc-num num');
  const head = el('div', 'up-head', null, [el('span', 'up-inc', null, [icon('coin', 'up-inc-coin'), incNum]), el('span', 'up-tip')]);
  const list = el('div', 'up-list');
  mp.body.append(head, list);
  const tip = head.lastChild;

  let rows = [];
  let builtFor = null;

  function build() {
    list.innerHTML = '';
    rows = [];
    const cfg = ctx.game.config();
    builtFor = cfg.id;
    cfg.stations.forEach((sc, i) => {
      const tile = el('span', 'up-tile', { html: ICONS[GLYPH[sc.id]] || ICONS.star });
      setVar(tile, '--glyph', STATION_COLORS[i % STATION_COLORS.length]);
      const lv = otext('up-lv num');
      const name = el('span', 'up-name');
      const slow = el('span', 'up-slow');
      const gainNum = otext('up-gain-num num');
      const gain = el('span', 'up-gain', null, [icon('coin', 'up-gain-coin'), gainNum]);
      const sub = el('span', 'up-sub');
      const stars = el('span', 'up-stars');
      for (let k = 0; k < 4; k++) stars.appendChild(el('span', 'star', { html: ICONS.star }));
      const btnTop = otext('up-btn-top');
      const btnCost = otext('up-btn-cost num');
      const btn = el('button', 'up-btn b3 b3-green', { type: 'button', 'data-station': sc.id }, [
        el('span', 'up-btn-row', null, [icon('up', 'up-btn-up'), icon('lock', 'up-btn-lock'), btnTop]),
        el('span', 'up-btn-row up-btn-price', null, [icon('coin', 'up-btn-coin'), btnCost]),
      ]);
      const row = el('div', 'up-row', { 'data-station': sc.id }, [
        el('span', 'up-tilewrap', null, [tile, lv]),
        el('div', 'up-mid', null, [el('div', 'up-namerow', null, [name, slow]), el('div', 'up-subrow', null, [gain, sub, stars])]),
        btn,
      ]);
      list.appendChild(row);
      const r = { id: sc.id, row, tile, lv, name, slow, gain, gainNum, sub, stars, btn, btnTop, btnCost, level: -1, reached: -1 };
      const press = () => {
        const v = ctx.game.select.stationView(r.id);
        if (!v) return false;
        if (v.open) {
          const res = ctx.game.act({ type: 'upgrade', station: v.id });
          if (res.ok) { pulse(btn, 'press'); return true; }
          ctx.sfx('nope'); pulse(btn, 'shake');
          return false;
        }
        if (v.canOpen) {
          const res = ctx.game.act({ type: 'open', station: v.id });
          if (res.ok) mp.hide(); // let the player watch the new machine pop in
          else { ctx.sfx('nope'); pulse(btn, 'shake'); }
          return false;
        }
        ctx.sfx('nope'); pulse(btn, 'shake');
        return false;
      };
      r.hold = makeHold(btn, press);
      onTap(tile, () => { ctx.sfx('tap'); mp.hide(); ctx.openCard(r.id); });
      rows.push(r);
    });
    refresh(true);
  }

  function refresh(force) {
    const g = ctx.game;
    setText(incNum, ctx.tx('hud.perSec', { n: ctx.num(g.select.incomePerSec()) }));
    for (const r of rows) {
      const v = g.select.stationView(r.id);
      if (!v) continue;
      setText(r.name, ctx.tx(v.nameKey));
      toggle(r.row, 'is-locked', !v.open);
      toggle(r.slow, 'is-hidden', !v.bottleneck);
      setText(r.slow, ctx.tx('upgrades.slowest'));
      if (v.open) {
        if (v.level !== r.level) {
          if (r.level > 0 && !force) pulse(r.lv, 'pop');
          r.level = v.level;
        }
        setText(r.lv, ctx.tx('mark.level', { n: v.level }));
        setText(r.gainNum, ctx.tx('upgrades.gain', { n: ctx.num(v.nextValue - v.value) }));
        toggle(r.gain, 'is-hidden', false);
        toggle(r.sub, 'is-hidden', true);
        toggle(r.stars, 'is-hidden', false);
        if (v.milestone.reached !== r.reached) {
          r.reached = v.milestone.reached;
          const kids = r.stars.children;
          for (let k = 0; k < 4; k++) toggle(kids[k], 'on', k < v.milestone.reached);
        }
        setText(r.btnTop, ctx.tx('upgrades.buy'));
        setText(r.btnCost, ctx.num(v.cost));
      } else {
        r.level = -1;
        setText(r.lv, '');
        toggle(r.gain, 'is-hidden', true);
        toggle(r.stars, 'is-hidden', true);
        toggle(r.sub, 'is-hidden', false);
        if (v.locked) {
          const prev = g.config().stations[v.index - 1];
          setText(r.sub, ctx.tx('card.lockedFirst', { station: ctx.tx(prev.nameKey + '.acc') }));
          setText(r.btnTop, ctx.tx('sign.locked'));
        } else {
          setText(r.sub, ctx.tx('card.newStation'));
          setText(r.btnTop, ctx.tx('card.open'));
        }
        setText(r.btnCost, ctx.num(v.openCost));
      }
      const can = v.open ? v.canAfford : v.canOpen && v.canAfford;
      toggle(r.btn, 'is-disabled', !can);
      toggle(r.btn, 'is-ready', can);
      toggle(r.btn, 'is-open-btn', !v.open && v.canOpen);
      toggle(r.btn, 'is-locked-btn', v.locked);
      toggle(r.btn, 'b3-yellow', !v.open);
      toggle(r.btn, 'b3-green', v.open);
    }
  }

  let t = 0;
  function update(dt = 0) {
    if (!mp.isOpen()) return;
    if (builtFor !== ctx.game.state.factory.id) build();
    for (const r of rows) r.hold.update(dt);
    t -= dt;
    if (t <= 0) { t = 0.1; refresh(false); }
  }

  function relabel() {
    mp.ribbon.set(ctx.tx('upgrades.title'));
    mp.closeBtn.setAttribute('aria-label', ctx.tx('card.close'));
    setText(tip, ctx.tx('upgrades.tip'));
    for (const r of rows) for (const k of ['name', 'slow', 'gainNum', 'sub', 'btnTop', 'lv']) r[k]._t = null;
    if (mp.isOpen()) refresh(true);
  }

  function open() {
    if (builtFor !== ctx.game.state.factory.id) build();
    else refresh(true);
    mp.open();
  }

  return { open, close: () => mp.hide(), isOpen: () => mp.isOpen(), update, relabel, panel: mp, rowButton: (id) => { const r = rows.find((x) => x.id === id); return r ? r.btn : null; } };
}
