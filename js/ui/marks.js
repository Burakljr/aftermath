// DOM stickers at the station anchors: level badge (level, progress to the next speed
// milestone, an orange arrow when an upgrade is worth buying), the Open sign of the next
// station (a small price chip until it is affordable, then a compact orange "+ price" button;
// the word Open is on the card) and a tiny "Soon" chip on later plots. Signs open the station
// card. The next table gets the same orange "+ price" chip once it is affordable (tap: buy it).
import { el, icon, onTap, setText, toggle, setStyle, setVar, pulse } from './dom.js';

export function createMarks(ctx) {
  const { game } = ctx;
  const layer = ctx.layers.marks;
  let items = [];

  function build() {
    for (const it of items) it.root.remove();
    items = game.state.stations.map((s) => {
      const lvText = el('span', 'lt');
      const barFill = el('i');
      const up = el('span', 'up is-hidden', null, [icon('up')]);
      const badge = el('div', 'lvl', null, [lvText, el('span', 'bar', null, [barFill]), up]);
      const signPrice = el('span', 'v');
      const signLbl = el('span', 'lbl');
      const sign = el('button', 'sign', { type: 'button' }, [signLbl, el('span', 'pl', null, [icon('plus')]), icon('coin'), signPrice]);
      const soonTxt = el('span', 'is-hidden');
      const soon = el('div', 'mk-soon', null, [icon('lock'), soonTxt]);
      const inner = el('div', 'mark-in', null, [badge, sign, soon]);
      const root = el('div', 'mark', null, [inner]);
      layer.appendChild(root);
      onTap(sign, () => { ctx.sfx('tap'); ctx.openCard(s.id); });
      return { id: s.id, root, badge, lvText, barFill, up, sign, signPrice, signLbl, soon, soonTxt, level: -1, mode: '' };
    });
    relabel();
  }

  // the next table, once affordable: a small "+ coin price" chip on it (tap = buy)
  const tPrice = el('span', 'v');
  const tSign = el('button', 'sign can tsign', { type: 'button' }, [el('span', 'pl', null, [icon('plus')]), icon('coin'), tPrice]);
  const tRoot = el('div', 'tmark', null, [el('div', 'mark-in', null, [tSign])]);
  layer.appendChild(tRoot);
  let tShown = null;
  onTap(tSign, () => {
    const r = game.act({ type: 'buyTable' });
    if (!r.ok) { ctx.sfx('nope'); ctx.openMenu('upgrades'); }
  });
  function updateTable(hideAll) {
    const tv = game.select.tableView();
    const a = !hideAll && tv.next && tv.canAfford ? ctx.anchor('table', tv.next) : null;
    const show = !!(a && a.visible !== false);
    if (show !== tShown) { tShown = show; setStyle(tRoot, 'display', show ? '' : 'none'); }
    if (!show) return;
    setStyle(tRoot, 'transform', `translate3d(${Math.round(a.x)}px,${Math.round(a.y)}px,0)`);
    setText(tPrice, ctx.num(tv.cost));
  }

  function relabel() {
    for (const it of items) {
      it.level = -1;
      setText(it.signLbl, ctx.tx('sign.open'));
      setText(it.soonTxt, ctx.tx('sign.soon'));
    }
  }

  function update() {
    const hints = ctx.upgradeHints();
    const hideAll = ctx.modalOpen();
    updateTable(hideAll || ctx.cardStation() !== null);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const s = game.state.stations[i];
      if (!s) continue;
      const a = ctx.anchor('station', it.id);
      const visible = !hideAll && a && a.visible !== false;
      setStyle(it.root, 'display', visible ? '' : 'none');
      if (!visible) continue;
      setStyle(it.root, 'transform', `translate3d(${Math.round(a.x)}px,${Math.round(a.y)}px,0)`);
      let mode;
      if (s.open) mode = 'open';
      else if (i === 0 || game.state.stations[i - 1].open) mode = 'next';
      else mode = 'soon';
      if (mode !== it.mode) {
        it.mode = mode;
        toggle(it.badge, 'is-hidden', mode !== 'open');
        toggle(it.sign, 'is-hidden', mode !== 'next');
        toggle(it.soon, 'is-hidden', mode !== 'soon');
      }
      if (mode === 'open') {
        if (s.level !== it.level) {
          if (it.level > 0) pulse(it.badge);
          it.level = s.level;
          setText(it.lvText, ctx.tx('mark.level', { n: s.level }));
          const v = game.select.stationView(it.id);
          setVar(it.barFill, '--p', String(v.milestone.ratio));
        }
        const h = hints[it.id];
        toggle(it.up, 'is-hidden', !h);
        toggle(it.root, 'hint-best', h === 'best');
        toggle(it.root, 'boost', s.boostT > 0);
      } else if (mode === 'next') {
        const cost = game.config().stations[i].openCost;
        setText(it.signPrice, ctx.num(cost));
        toggle(it.sign, 'can', game.state.money >= cost);
      }
    }
  }

  // the element to point at (tutorial): badge for open stations, sign otherwise
  function elementFor(id) {
    const it = items.find((x) => x.id === id);
    if (!it) return null;
    if (it.mode === 'open') return it.badge;
    if (it.mode === 'next') return it.sign;
    return it.soon;
  }

  build();
  return { update, relabel, rebuild: build, elementFor };
}
