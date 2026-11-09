// Goal strip at the bottom: factory name + progress, and 3 goal tiles.
import { el, icon, setText, toggle, onTap, pulse, setStyle } from './dom.js';

const TYPE_ICON = { open: 'key', level: 'up', sold: 'box', income: 'rate', allLevel: 'stars' };
const TYPE_COLOR = { open: '#8b6cff', level: '#35c46a', sold: '#4cb8ff', income: '#ff9a3c', allLevel: '#ff5fa2' };

export function createGoals(ctx) {
  const fname = el('span', 'goals-name');
  const fprog = el('div', 'goals-prog', null, [el('div', 'goals-prog-fill')]);
  const tab = el('div', 'goals-tab', null, [fname, fprog]);
  const row = el('div', 'goals-row');
  const root = el('div', 'goals', null, [tab, row]);
  ctx.layers.panels.appendChild(root);

  const tiles = [];
  for (let i = 0; i < 3; i++) {
    const ico = el('span', 'goal-ico');
    const text = el('div', 'goal-text');
    const fill = el('div', 'goal-fill');
    const bar = el('div', 'goal-bar', null, [fill]);
    const count = el('div', 'goal-count num');
    const collectLabel = el('span', 'goal-collect-label');
    const collectAmt = el('span', 'goal-collect-amt num');
    const collect = el('div', 'goal-collect', null, [collectLabel, el('span', 'goal-collect-row', null, [icon('coin', 'goal-coin'), collectAmt])]);
    const tile = el('button', 'goal', { type: 'button' }, [ico, text, el('div', 'goal-foot', null, [bar, count]), collect]);
    row.appendChild(tile);
    const t = { tile, ico, text, fill, count, collect, collectLabel, collectAmt, id: null, done: null, type: null };
    onTap(tile, () => tapTile(t));
    tiles.push(t);
  }

  function tapTile(t) {
    if (!t.id) return;
    const v = ctx.game.select.goalViews().find((g) => g.id === t.id);
    if (!v) return;
    if (v.done && !v.claimed) {
      const r = t.tile.getBoundingClientRect();
      const res = ctx.game.act({ type: 'claimGoal', id: v.id });
      if (res.ok) ctx.coinBurst(r.left + r.width / 2, r.top + r.height / 2, v.reward, 6);
      return;
    }
    ctx.sfx('tap');
    pulse(t.tile, 'wiggle');
    ctx.hintGoal(v);
  }

  function goalText(v) {
    const p = { n: ctx.num(v.params.n) };
    if (v.type === 'level' || v.type === 'allLevel') p.n = v.params.n;
    if (v.params.stationKey) p.station = ctx.tx(v.params.stationKey + '.acc');
    return ctx.tx(v.textKey, p);
  }

  let lastDoneCount = -1;
  let refreshT = 0;
  let lastClaimed = -1;
  function update(dt = 0) {
    const g = ctx.game;
    // refresh 10x a second, or at once when a goal was collected
    refreshT -= dt;
    let nClaimed = 0;
    for (const x of g.state.goals) if (x.claimed) nClaimed++;
    if (refreshT > 0 && nClaimed === lastClaimed) return;
    refreshT = 0.1;
    lastClaimed = nClaimed;
    const f = g.select.factory();
    setText(fname, ctx.tx(f.nameKey));
    const goals = g.state.goals;
    let claimed = 0;
    for (const x of goals) if (x.claimed) claimed++;
    if (claimed !== lastDoneCount) {
      lastDoneCount = claimed;
      setStyle(fprog.firstChild, 'transform', `scaleX(${(claimed / goals.length).toFixed(3)})`);
    }
    const views = g.select.goalViews();
    for (let i = 0; i < 3; i++) {
      const t = tiles[i];
      const v = views[i];
      toggle(t.tile, 'is-empty', !v);
      if (!v) { t.id = null; continue; }
      if (t.id !== v.id) {
        if (t.id) pulse(t.tile, 'slide-in');
        t.id = v.id;
        t.done = null;
        t.text._t = null;
      }
      if (t.type !== v.type) {
        t.type = v.type;
        t.ico.innerHTML = '';
        t.ico.appendChild(icon(TYPE_ICON[v.type] || 'star'));
        t.ico.style.setProperty('--gc', TYPE_COLOR[v.type] || '#35c46a');
      }
      setText(t.text, goalText(v));
      setStyle(t.fill, 'transform', `scaleX(${Math.max(0.02, v.progress).toFixed(3)})`);
      const cur = v.type === 'open' ? (v.done ? 1 : 0) : v.cur;
      setText(t.count, ctx.tx('goal.progress', { cur: v.type === 'level' || v.type === 'allLevel' ? Math.floor(cur) : ctx.num(cur), target: v.type === 'level' || v.type === 'allLevel' ? v.target : ctx.num(v.target) }));
      if (t.done !== v.done) {
        if (v.done && t.done === false) pulse(t.tile, 'pop');
        t.done = v.done;
        toggle(t.tile, 'is-done', v.done);
      }
      setText(t.collectLabel, ctx.tx('goal.collect'));
      setText(t.collectAmt, '+' + ctx.num(v.reward));
    }
  }

  function relabel() {
    refreshT = 0;
    fname._t = null;
    for (const t of tiles) { t.text._t = null; t.count._t = null; t.collectLabel._t = null; t.collectAmt._t = null; }
  }

  function tileFor(id) {
    const t = tiles.find((x) => x.id === id);
    return t ? t.tile : null;
  }
  function firstDoneTile() {
    const t = tiles.find((x) => x.id && x.done);
    return t ? t.tile : null;
  }

  return { root, update, relabel, tileFor, firstDoneTile, top: () => root.getBoundingClientRect().top };
}
