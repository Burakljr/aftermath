// Factories panel: a little map with every factory on a road (done, current,
// locked) and "coming soon" spots after the last one.
import { el, icon, otext, setText, toggle, onTap, setVar, ICONS, FACTORY_GLYPH, FACTORY_COLORS } from './dom.js';
import { createModalPanel } from './panel.js';
import { FACTORIES } from '../game/config.js';

const SOON_SPOTS = 2;

export function createFactories(ctx) {
  const mp = createModalPanel(ctx, { cls: 'fp-card', kind: 'blue', menu: true });
  const map = el('div', 'fp-map');
  mp.body.append(map);

  const nodes = [];
  const count = FACTORIES.length + SOON_SPOTS;
  for (let i = 0; i < count; i++) {
    const f = FACTORIES[i] || null;
    const medal = el('span', 'fp-medal', { html: f ? ICONS[FACTORY_GLYPH[f.id] || 'factory'] : ICONS.question });
    if (f) setVar(medal, '--fc', FACTORY_COLORS[f.id] || '#FFC82E');
    const num = otext('fp-num num', String(i + 1));
    const lock = icon('lock', 'fp-lock');
    const label = el('div', 'fp-label');
    const name = el('div', 'fp-name');
    const status = el('div', 'fp-status');
    const stars = el('div', 'fp-stars');
    for (let k = 0; k < 3; k++) stars.appendChild(el('span', 'star', { html: ICONS.star }));
    const tagText = otext('fp-tag-text');
    const tag = el('span', 'fp-tag', null, [icon('check', 'fp-tag-check'), tagText]);
    const goText = otext('fp-go-text');
    const go = el('button', 'fp-go b3 b3-green is-ready', { type: 'button' }, [goText]);
    const node = el('div', 'fp-node' + (i % 2 ? ' is-right' : ''), null, [
      el('span', 'fp-medalwrap', null, [medal, num, lock]),
      el('div', 'fp-info', null, [label, name, status, stars]),
      tag, go,
    ]);
    map.appendChild(node);
    onTap(go, () => {
      const r = ctx.game.act({ type: 'nextFactory' });
      if (r.ok) { ctx.sfx('open'); mp.hide(); }
    });
    nodes.push({ i, f, node, medal, label, name, status, stars, tag, tagText, go, goText });
  }

  function refresh() {
    const g = ctx.game;
    const cur = g.state.factoryIndex;
    const curF = g.select.factory();
    let claimed = 0;
    for (const x of g.state.goals) if (x.claimed) claimed++;
    const total = g.state.goals.length || 1;
    for (const n of nodes) {
      const done = n.f && (n.i < cur || (n.i === cur && curF.complete));
      const here = n.i === cur;
      const locked = n.f && n.i > cur;
      const soon = !n.f;
      toggle(n.node, 'is-done', !!done);
      toggle(n.node, 'is-here', here);
      toggle(n.node, 'is-locked', !!locked);
      toggle(n.node, 'is-soon', soon);
      setText(n.label, ctx.tx('factories.n', { n: n.i + 1 }));
      setText(n.name, soon ? ctx.tx('factories.soon') : ctx.tx(n.f.nameKey));
      let earned = 0;
      if (done) earned = 3;
      else if (here) earned = Math.floor((claimed / total) * 3 + 1e-9);
      for (let k = 0; k < 3; k++) toggle(n.stars.children[k], 'on', k < earned);
      toggle(n.stars, 'is-hidden', !!(locked || soon));
      let st = '';
      if (soon) st = ctx.tx('complete.soon');
      else if (locked) st = ctx.tx('factories.locked', { name: ctx.tx(FACTORIES[n.i - 1].nameKey) });
      else if (here && !done) st = ctx.tx('factories.progress', { n: claimed, total });
      else st = ctx.tx('factories.doneText');
      setText(n.status, st);
      const canGo = here && curF.complete && !curF.isLast;
      toggle(n.go, 'is-hidden', !canGo);
      setText(n.goText, ctx.tx('complete.next'));
      toggle(n.tag, 'is-hidden', canGo || !!soon);
      setText(n.tagText, done ? ctx.tx('factories.done') : here ? ctx.tx('factories.here') : ctx.tx('factories.lockedTag'));
    }
  }

  let t = 0;
  function update(dt = 0) {
    if (!mp.isOpen()) return;
    t -= dt;
    if (t <= 0) { t = 0.25; refresh(); }
  }

  function relabel() {
    mp.ribbon.set(ctx.tx('factories.title'));
    mp.closeBtn.setAttribute('aria-label', ctx.tx('card.close'));
    for (const n of nodes) for (const k of ['label', 'name', 'status', 'tagText', 'goText']) n[k]._t = null;
    if (mp.isOpen()) refresh();
  }

  function open() { refresh(); mp.open(); }

  return { open, close: () => mp.hide(), isOpen: () => mp.isOpen(), update, relabel, panel: mp };
}
