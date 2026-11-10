// Goals: the compact "next goal" pill above the menu bar (tap: collect when done,
// otherwise open the Goals panel) and the Goals panel (factory progress + the
// visible goals with Collect / Go buttons).
import { el, icon, otext, setText, toggle, onTap, pulse, setStyle, setVar, ICONS, FACTORY_GLYPH } from './dom.js';
import { createModalPanel } from './panel.js';

const TYPE_ICON = { open: 'key', level: 'up', sold: 'box', income: 'rate', allLevel: 'stars' };
const TYPE_COLOR = { open: '#8A5CF6', level: '#36C657', sold: '#34A3FF', income: '#FF8B1F', allLevel: '#FF4F7E' };

export function createGoals(ctx) {
  // ------------------------------------------------------------ next-goal pill
  const pIco = el('span', 'ngp-ico');
  const pText = el('span', 'ngp-text');
  const pFill = el('span', 'ngp-fill');
  const pCount = otext('ngp-count num');
  const pBar = el('span', 'ngp-bar', null, [pFill, pCount]);
  const pRewardAmt = otext('ngp-reward-amt num');
  const pReward = el('span', 'ngp-reward', null, [icon('coin', 'ngp-coin'), pRewardAmt]);
  const pCollectLabel = otext('goal-collect-label');
  const pCollectAmt = otext('goal-collect-amt num');
  const pCollect = el('span', 'goal-collect', null, [pCollectLabel, el('span', 'goal-collect-row', null, [icon('coin', 'goal-coin'), pCollectAmt])]);
  const pDot = otext('ngp-dot num');
  const pill = el('button', 'goal ngp', { type: 'button' }, [pIco, el('span', 'ngp-main', null, [pText, pBar]), pReward, pCollect, pDot]);
  const pState = { id: null, done: null, type: null };

  onTap(pill, () => {
    const views = ctx.game.select.goalViews();
    const v = views.find((g) => g.id === pState.id);
    if (v && v.done && !v.claimed) { claim(v, pill); return; }
    pulse(pill, 'wiggle');
    ctx.openMenu('goals');
  });

  function claim(v, fromEl) {
    const r = fromEl.getBoundingClientRect();
    const res = ctx.game.act({ type: 'claimGoal', id: v.id });
    if (res.ok) ctx.coinBurst(r.left + r.width / 2, r.top + r.height / 2, v.reward, 6);
    return res.ok;
  }

  // ------------------------------------------------------------ Goals panel
  const mp = createModalPanel(ctx, { cls: 'gp-card', kind: 'orange', menu: true });
  const fMedal = el('span', 'gp-medal ico');
  const fName = el('div', 'goals-name');
  const fCount = el('div', 'gp-count num');
  const fFill = el('span', 'gp-bar-fill');
  const fStars = [0, 1, 2].map((i) => el('span', 'gp-star s' + i, { html: `<span class="st-e">${ICONS.starSlot}</span><span class="st-f">${ICONS.star}</span>` }));
  const fBar = el('div', 'gp-bar', null, [fFill, el('span', 'gp-bar-div d1'), el('span', 'gp-bar-div d2'), ...fStars]);
  const head = el('div', 'gp-head', null, [fMedal, el('div', 'gp-head-main', null, [el('div', 'gp-head-row', null, [fName, fCount]), fBar])]);
  const list = el('div', 'gp-list');
  const note = el('div', 'gp-note');
  mp.body.append(head, list, note);

  const rows = [];
  for (let i = 0; i < 3; i++) {
    const ico = el('span', 'gp-ico');
    const text = el('div', 'gp-text');
    const fill = el('span', 'gp-fill');
    const count = otext('gp-cnt num');
    const bar = el('span', 'gp-pbar', null, [fill, count]);
    const rewardAmt = otext('gp-reward-amt num');
    const reward = el('span', 'gp-reward', null, [icon('coin', 'gp-coin'), rewardAmt]);
    const btnLabel = otext('gp-btn-label');
    const btn = el('button', 'gp-btn b3 b3-blue', { type: 'button' }, [btnLabel]);
    const row = el('div', 'gp-row', null, [ico, el('div', 'gp-mid', null, [text, el('div', 'gp-foot', null, [bar, reward])]), btn]);
    list.appendChild(row);
    const r = { row, ico, text, fill, count, rewardAmt, btn, btnLabel, id: null, type: null, done: null };
    onTap(btn, () => {
      const v = ctx.game.select.goalViews().find((g) => g.id === r.id);
      if (!v) return;
      if (v.done && !v.claimed) { claim(v, btn); return; }
      ctx.sfx('tap');
      mp.hide();
      ctx.hintGoal(v);
    });
    rows.push(r);
  }

  function goalText(v) {
    const p = { n: ctx.num(v.params.n) };
    if (v.type === 'level' || v.type === 'allLevel') p.n = v.params.n;
    if (v.params.stationKey) p.station = ctx.tx(v.params.stationKey + '.acc');
    return ctx.tx(v.textKey, p);
  }
  function countText(v) {
    const lv = v.type === 'level' || v.type === 'allLevel';
    const cur = v.type === 'open' ? (v.done ? 1 : 0) : v.cur;
    return ctx.tx('goal.progress', { cur: lv ? Math.floor(cur) : ctx.num(cur), target: lv ? v.target : ctx.num(v.target) });
  }
  function setIcon(elm, type) {
    elm.innerHTML = ICONS[TYPE_ICON[type] || 'star'];
    setVar(elm, '--gc', TYPE_COLOR[type] || '#36C657');
  }

  let refreshT = 0;
  let lastClaimed = -1;
  let lastFactory = null;
  let doneCount = 0;
  function update(dt = 0) {
    const g = ctx.game;
    // refresh 10x a second, or at once when a goal was collected
    refreshT -= dt;
    let nClaimed = 0;
    for (const x of g.state.goals) if (x.claimed) nClaimed++;
    if (refreshT > 0 && nClaimed === lastClaimed) return;
    refreshT = 0.1;
    const claimedChanged = nClaimed !== lastClaimed;
    lastClaimed = nClaimed;
    const views = g.select.goalViews();
    doneCount = 0;
    for (const v of views) if (v.done && !v.claimed) doneCount++;

    // pill: the first collectable goal, else the first open one
    const pv = views.find((v) => v.done && !v.claimed) || views[0] || null;
    toggle(pill, 'is-empty', !pv);
    if (pv) {
      if (pState.id !== pv.id) {
        if (pState.id) pulse(pill, 'slide-in');
        pState.id = pv.id;
        pState.done = null;
        pText._t = null;
      }
      if (pState.type !== pv.type) { pState.type = pv.type; setIcon(pIco, pv.type); }
      setText(pText, goalText(pv));
      setStyle(pFill, 'transform', `scaleX(${Math.max(0.03, pv.progress).toFixed(3)})`);
      setText(pCount, countText(pv));
      setText(pRewardAmt, '+' + ctx.num(pv.reward));
      if (pState.done !== pv.done) {
        if (pv.done && pState.done === false) pulse(pill, 'pop');
        pState.done = pv.done;
        toggle(pill, 'is-done', pv.done);
      }
      setText(pCollectLabel, ctx.tx('goal.collect'));
      setText(pCollectAmt, '+' + ctx.num(pv.reward));
    } else pState.id = null;
    const others = doneCount - (pv && pv.done ? 1 : 0);
    toggle(pDot, 'is-on', doneCount > 0);
    setText(pDot, String(Math.max(1, doneCount)));
    toggle(pDot, 'is-quiet', others <= 0);

    // panel (only while it is open, plus the factory name for tests and relabel)
    const f = g.select.factory();
    setText(fName, ctx.tx(f.nameKey));
    if (f.id !== lastFactory) { lastFactory = f.id; fMedal.innerHTML = ICONS[FACTORY_GLYPH[f.id] || 'factory']; }
    if (!mp.isOpen() && !claimedChanged) return;
    const total = g.state.goals.length || 1;
    setText(fCount, ctx.tx('goals.count', { n: nClaimed, total }));
    setStyle(fFill, 'transform', `scaleX(${(nClaimed / total).toFixed(3)})`);
    const earned = Math.floor((nClaimed / total) * 3 + 1e-9);
    for (let i = 0; i < 3; i++) toggle(fStars[i], 'on', i < earned);
    setText(note, ctx.tx('goals.note'));
    for (let i = 0; i < 3; i++) {
      const r = rows[i];
      const v = views[i];
      toggle(r.row, 'is-hidden', !v);
      if (!v) { r.id = null; continue; }
      if (r.id !== v.id) { if (r.id && mp.isOpen()) pulse(r.row, 'slide-in'); r.id = v.id; r.text._t = null; r.done = null; }
      if (r.type !== v.type) { r.type = v.type; setIcon(r.ico, v.type); }
      setText(r.text, goalText(v));
      setStyle(r.fill, 'transform', `scaleX(${Math.max(0.03, v.progress).toFixed(3)})`);
      setText(r.count, countText(v));
      setText(r.rewardAmt, '+' + ctx.num(v.reward));
      if (r.done !== v.done) {
        r.done = v.done;
        toggle(r.row, 'is-done', v.done);
        toggle(r.btn, 'b3-green', v.done);
        toggle(r.btn, 'b3-blue', !v.done);
        toggle(r.btn, 'is-ready', v.done);
      }
      setText(r.btnLabel, ctx.tx(v.done ? 'goal.collect' : 'goals.go'));
    }
  }

  function relabel() {
    refreshT = 0;
    lastClaimed = -1;
    mp.ribbon.set(ctx.tx('goals.title'));
    mp.closeBtn.setAttribute('aria-label', ctx.tx('card.close'));
    pill.setAttribute('aria-label', ctx.tx('goals.title'));
    for (const e of [fName, pText, pCount, pCollectLabel, pCollectAmt, note, fCount]) e._t = null;
    for (const r of rows) { r.text._t = null; r.count._t = null; r.btnLabel._t = null; }
  }

  function open() {
    mp.open();
    refreshT = 0;
    lastClaimed = -1;
    update(0);
  }

  function tileFor(id) {
    return ctx.game.select.goalViews().some((v) => v.id === id) ? pill : null;
  }
  function firstDoneTile() {
    return pState.id && pState.done ? pill : null;
  }

  return {
    pill, panel: mp, update, relabel, open, close: () => mp.hide(), isOpen: () => mp.isOpen(),
    tileFor, firstDoneTile, doneCount: () => doneCount,
  };
}
