// Aftermath v2 UI: fleet strip (contract + rival). Three vehicle cards "2 hazır / 3"; a card glows when it has a job.
// Tap a card -> accept mode: districts that take it glow (scene 'accept'), the next district tap dispatches.
import { h, icon, T, C, tap, clear } from './dom.js';

const ICON = { fire: 'g-firetruck', debris: 'g-excavator', carve: 'g-cleaver' };
const TONE = { fire: 'c-yangin', debris: 'c-enkaz', carve: 'c-kesim' };

export function createFleetStrip(ctx) {
  const cards = {};
  const row = h('div.fleet');
  for (const type of ['fire', 'debris', 'carve']) {
    const name = h('span.fleet__name');
    const ready = h('span.fleet__ready.num');
    const pips = h('span.pips');
    const el = h('button.fleet__card', { type: 'button', 'data-key': `fleet:${type}`, 'data-dim': '' },
      h('span.fleet__icon', icon(ICON[type], 26, TONE[type])),
      h('span.fleet__txt', name, ready), pips);
    tap(el, () => onTap(type, el));
    cards[type] = { el, name, ready, pips, n: -1, model: null };
    row.appendChild(el);
  }
  let hlKey = '';

  function onTap(type, el) {
    const m = cards[type].model;
    if (!m) return;
    if (ctx.view.accept === type) {
      ctx.setAccept(null);
      return;
    }
    if (m.ready <= 0) {
      ctx.refuse(el, 'Boşta araç yok.', true);
      return;
    }
    if (!m.accepts.length) {
      ctx.refuse(el, 'Bu araca uygun iş yok', true);
      return;
    }
    ctx.sfx('click');
    ctx.setAccept(type);
    hlKey = '';
  }

  return {
    el: row,
    update(s) {
      const list = ctx.game.fleetStrip(s);
      let acceptIds = null;
      for (const m of list) {
        const c = cards[m.type];
        c.model = m;
        T(c.name, m.name);
        T(c.ready, m.text);
        if (c.n !== m.total) {
          c.n = m.total;
          clear(c.pips);
          for (let i = 0; i < Math.min(m.total, 8); i++) c.pips.appendChild(h('b'));
        }
        let i = 0;
        for (const p of c.pips.children) C(p, 'on', i++ < m.ready);
        C(c.el, 'glow', m.glow && !ctx.view.accept);
        C(c.el, 'sel', ctx.view.accept === m.type);
        C(c.el, 'empty', m.ready === 0);
        if (ctx.view.accept === m.type) acceptIds = m.accepts;
      }
      if (ctx.view.accept) {
        if (!acceptIds || !acceptIds.length) ctx.setAccept(null);
        else {
          const k = acceptIds.join(',');
          if (k !== hlKey) {
            hlKey = k;
            ctx.scene.setHighlight(acceptIds, 'accept');
          }
        }
      } else hlKey = '';
    },
  };
}
