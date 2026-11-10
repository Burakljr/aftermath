// DOM stickers placed at the scene's station anchors: level badge with the green
// "upgrade ready" arrow, and for locked plots the "Open + price" sign or a small
// "Soon" sticker.
import { el, icon, otext, setText, toggle, onTap, pulse } from './dom.js';

export function createMarks(ctx) {
  const layer = ctx.layers.marks;
  const items = [];

  function build(count) {
    for (const it of items) it.root.remove();
    items.length = 0;
    for (let i = 0; i < count; i++) {
      const lvl = otext('mark-lvl num');
      const up = el('span', 'mark-up', null, [icon('up')]);
      const badge = el('div', 'mark-badge', null, [lvl, up]);
      const signTitle = otext('sign-title');
      const signCost = el('span', 'sign-cost num');
      const sign = el('div', 'mark-sign', null, [
        el('span', 'sign-head', null, [icon('lock', 'sign-lock'), signTitle]),
        el('span', 'sign-price', null, [icon('lock', 'sign-plock'), icon('coin', 'sign-coin'), signCost]),
      ]);
      const root = el('div', 'mark', { 'data-index': i }, [badge, sign]);
      layer.appendChild(root);
      const item = { root, badge, lvl, up, sign, signTitle, signCost, x: -1, y: -1, vis: null, level: -1, full: null };
      const tap = () => {
        const id = ctx.game.state.factory.stations[i].id;
        ctx.tapStation(id, 'mark');
      };
      onTap(badge, tap);
      onTap(sign, tap);
      items.push(item);
    }
  }

  build(ctx.game.state.factory.stations.length);

  let contentT = 0;
  function update(dt = 0) {
    const g = ctx.game;
    const st = g.state.factory.stations;
    if (st.length !== items.length) build(st.length);
    // positions follow the scene every frame; contents refresh 10x a second
    contentT -= dt;
    const refresh = contentT <= 0;
    if (refresh) contentT = 0.1;
    const hints = ctx.upgradeHints();
    for (let i = 0; i < st.length; i++) {
      const it = items[i];
      const s = st[i];
      const a = ctx.anchor(s.id);
      const vis = !!(a && a.visible);
      if (vis !== it.vis) { it.vis = vis; toggle(it.root, 'is-hidden', !vis); }
      if (vis) {
        const x = Math.round(a.x);
        const y = Math.round(a.y);
        if (x !== it.x || y !== it.y) {
          it.x = x; it.y = y;
          it.root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }
      }
      if (!refresh && it.level === (s.open ? s.level : -1) && it.wasOpen === s.open) {
        toggle(it.badge, 'is-boost', s.open && s.boostT > 0);
        continue;
      }
      it.wasOpen = s.open;
      const v = g.select.stationView(i);
      toggle(it.root, 'is-open', s.open);
      toggle(it.root, 'is-next', v.canOpen);
      toggle(it.root, 'is-locked', v.locked);
      if (s.open) {
        if (s.level !== it.level) {
          if (it.level > 0) pulse(it.badge, 'pop');
          it.level = s.level;
          setText(it.lvl, ctx.tx('mark.level', { n: s.level }));
        }
        const h = hints[s.id];
        toggle(it.up, 'is-on', !!h);
        toggle(it.up, 'is-best', h === 'best');
        toggle(it.badge, 'has-up', !!h);
        toggle(it.badge, 'is-boost', s.boostT > 0);
      } else {
        it.level = -1;
        setText(it.signTitle, v.canOpen ? ctx.tx('sign.open') : ctx.tx('sign.locked'));
        setText(it.signCost, ctx.num(v.openCost));
        // the next plot shows a small price chip until the player can afford it, then the
        // big green "Open" sign pops up (it never hides the machines while it cannot be used)
        const full = v.canOpen && v.canAfford;
        toggle(it.sign, 'can-afford', full);
        toggle(it.root, 'is-chip', v.canOpen && !full);
        if (full && it.full === false) pulse(it.sign, 'sign-pop');
        it.full = full;
      }
    }
  }

  function relabel() {
    for (const it of items) { it.level = -1; it.signTitle._t = null; }
  }

  function elementFor(id) {
    const i = ctx.game.state.factory.stations.findIndex((s) => s.id === id);
    return i >= 0 ? items[i] : null;
  }

  return { update, relabel, rebuild: () => build(ctx.game.state.factory.stations.length), elementFor };
}
