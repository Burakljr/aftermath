// Goals: the compact next-goal pill above the menu bar (tap: collect, or open the Goals
// panel) and the Goals panel (location progress + the 3 visible goals with Collect / Go).
import { el, icon, onTap, setText, toggle, setVar, setHTML } from './dom.js';
import { createSheet, amount } from './panel.js';

export function goalText(ctx, v) {
  const p = Object.assign({}, v.params);
  if (p.stationKey) p.station = ctx.tx(p.stationKey + '.acc');
  p.n = ctx.num(p.n);
  return ctx.tx(v.textKey, p);
}

export function goalIcon(ctx, v) {
  const game = ctx.game;
  if (v.station) {
    const sc = game.config().stations.find((s) => s.id === v.station);
    return sc ? ctx.dishIcon(sc.dish) : 'goals';
  }
  return { tables: 'table', cooks: 'chef', cookSpeed: 'boot', served: 'coin' }[v.type] || 'goals';
}

export function createGoals(ctx) {
  const { game } = ctx;

  // ---------------------------------------------------------------- pill
  const gi = icon('check', 'gi');
  const pillText = el('span', 't');
  const pillFill = el('i');
  const pillReward = amount('rw');
  const pillBtn = el('button', 'btn btn-primary is-hidden', { type: 'button' });
  const pill = el('div', 'goal-pill', { role: 'button' }, [
    gi, el('div', 'txt', null, [pillText, el('div', 'pbar', null, [pillFill])]), pillReward.root, pillBtn,
  ]);
  let pillGoal = null;
  onTap(pill, () => {
    if (pillGoal && pillGoal.done && !pillGoal.claimed) collect(pillGoal, pillBtn);
    else { ctx.sfx('tap'); ctx.openMenu('goals'); }
  });

  function collect(v, from) {
    const r = game.act({ type: 'claimGoal', id: v.id });
    if (!r.ok) { ctx.sfx('nope'); return; }
    const rect = from && from.getBoundingClientRect ? from.getBoundingClientRect() : null;
    if (rect && rect.width) ctx.coinBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, v.reward, 5);
    else ctx.sfx('claim');
  }

  // ---------------------------------------------------------------- panel
  const sheet = createSheet(ctx, { cls: 'goals-sheet' });
  const progFill = el('i');
  const progStars = el('span', 'stars');
  const list = el('div', 'list');
  const note = el('div', 'note');
  sheet.body.append(el('div', 'gprog', null, [el('div', 'track', null, [progFill]), progStars]), list, note);
  const rows = [];
  for (let i = 0; i < 3; i++) {
    const ti = icon('goals');
    const tx = el('span', 'n');
    const fill = el('i');
    const prog = el('span', 'pg');
    const rw = amount('rw');
    const btn = el('button', 'btn btn-primary', { type: 'button' });
    const row = el('div', 'row goal', null, [
      el('div', 'tile', null, [ti]),
      el('div', 'info', null, [el('div', 'nm', null, [tx]), el('div', 'ds', null, [prog, el('span', 's', { text: ' ' }), rw.root]), el('div', 'pbar', null, [fill])]),
      btn,
    ]);
    list.appendChild(row);
    const r = { row, ti, tx, fill, prog, rw, btn, v: null, key: '' };
    onTap(btn, () => {
      if (!r.v) return;
      if (r.v.done) collect(r.v, btn);
      else { ctx.sfx('tap'); sheet.hide(); ctx.hintGoal(r.v); }
    });
    rows.push(r);
  }

  function rowKey(v) { return [v.id, v.done, v.claimed, Math.floor(v.cur), ctx.lang()].join('|'); }

  let pillKey = '';
  let t = 0;
  // goal views allocate a little: refresh 5 times a second (and at once when something changes)
  for (const ev of ['goal', 'claim', 'upgrade', 'open', 'buyTable', 'hire', 'cookSpeed', 'pay', 'locationStart']) game.on(ev, () => { t = 0; });
  function update(dt = 0) {
    t -= dt;
    if (t > 0) return;
    t = 0.2;
    const views = game.select.goalViews();
    const first = views.find((v) => v.done && !v.claimed) || views[0] || null;
    pillGoal = first;
    toggle(pill, 'is-hidden', !first);
    if (first) {
      const k = rowKey(first);
      if (k !== pillKey) {
        pillKey = k;
        setText(pillText, goalText(ctx, first));
        setVar(pillFill, '--p', first.progress.toFixed(3));
        pillReward.set(ctx.num(first.reward));
        toggle(pill, 'done', first.done);
        toggle(pillBtn, 'is-hidden', !first.done);
        toggle(pillReward.root, 'is-hidden', first.done);
        setText(pillBtn, ctx.tx('goals.collect'));
        gi.innerHTML = ctx.icons[first.done ? 'star' : goalIcon(ctx, first)];
      }
    }
    if (!sheet.isOpen()) return;
    const loc = game.select.location();
    setVar(progFill, '--p', (loc.goalsDone / loc.goalsTotal).toFixed(3));
    sheet.setCount(ctx.tx('goals.count', { n: loc.goalsDone, total: loc.goalsTotal }));
    let sh = '';
    for (let i = 0; i < 3; i++) sh += ctx.icons[i < loc.stars ? 'star' : 'starEmpty'];
    if (progStars._sh !== sh) { progStars._sh = sh; progStars.innerHTML = sh.replace(/<svg/g, '<span class="ico"><svg').replace(/<\/svg>/g, '</svg></span>'); }
    for (let i = 0; i < 3; i++) {
      const r = rows[i];
      const v = views[i] || null;
      r.v = v;
      toggle(r.row, 'is-hidden', !v);
      if (!v) continue;
      const k = rowKey(v);
      if (k === r.key) continue;
      r.key = k;
      setHTML(r.ti, ctx.icons[goalIcon(ctx, v)]);
      setText(r.tx, goalText(ctx, v));
      setText(r.prog, ctx.tx('goal.progress', { cur: ctx.num(v.cur), target: ctx.num(v.target) }));
      r.rw.set(ctx.num(v.reward));
      setVar(r.fill, '--p', v.progress.toFixed(3));
      toggle(r.row, 'done', v.done);
      setText(r.btn, v.done ? ctx.tx('goals.collect') : ctx.tx('goals.go'));
      r.btn.className = v.done ? 'btn btn-primary ready' : 'btn btn-secondary';
    }
    setText(note, views.length ? ctx.tx('goals.note') : ctx.tx('goals.allDone'));
  }

  function relabel() {
    sheet.setTitle(ctx.tx('goals.title'));
    pillKey = '';
    t = 0;
    for (const r of rows) r.key = '';
  }

  return {
    pill,
    sheet,
    update,
    relabel,
    open() { sheet.open(); pillKey = ''; for (const r of rows) r.key = ''; t = 0; update(); },
    close() { sheet.hide(); },
    isOpen: () => sheet.isOpen(),
    collectable() { return game.select.goalViews().filter((v) => v.done && !v.claimed).length; },
    firstDoneButton() {
      if (sheet.isOpen()) { const r = rows.find((x) => x.v && x.v.done); return r ? r.btn : null; }
      return pillGoal && pillGoal.done ? pillBtn : null;
    },
  };
}
