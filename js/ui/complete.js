// "Factory complete" screen: sunburst, confetti from the screen edges, a big
// ribbon banner, three stars, the reward and the "Next factory" button.
import { el, icon, otext, setText, toggle, onTap, ICONS } from './dom.js';
import { ribbon } from './panel.js';
import { formatInt } from '../game/format.js';
import { FACTORIES } from '../game/config.js';

const CONFETTI_COLORS = ['#FF4F7E', '#FFC82E', '#34A3FF', '#36C657', '#8A5CF6', '#FF8B1F'];

export function createComplete(ctx) {
  const rays = el('div', 'cmp-rays');
  // confetti shoots in from both screen edges
  const confetti = el('div', 'cmp-confetti');
  for (let i = 0; i < 36; i++) {
    const left = i % 2 === 0;
    const c = el('i', left ? 'from-l' : 'from-r');
    c.style.top = `${20 + ((i * 23) % 55)}%`;
    c.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    c.style.setProperty('--dx', `${(left ? 1 : -1) * (90 + ((i * 37) % 160))}px`);
    c.style.setProperty('--dy', `${-120 - ((i * 53) % 160)}px`);
    c.style.setProperty('--rot', `${(i * 97) % 720 - 360}deg`);
    c.style.animationDelay = `${(i % 9) * 0.07 + (i > 17 ? 1.4 : 0)}s`;
    if (i % 3 === 0) c.classList.add('round');
    confetti.appendChild(c);
  }
  const stars = el('div', 'cmp-stars', null, [0, 1, 2].map((i) => el('span', 'cmp-star s' + i, { html: ICONS.star })));
  const rb = ribbon('berry', 'cmp-title');
  const trophy = el('div', 'cmp-trophy', null, [icon('trophy')]);
  const name = el('div', 'cmp-name');
  const soldLabel = el('span', 'cmp-stat-label');
  const soldNum = otext('cmp-stat-num num');
  const rewardLabel = el('span', 'cmp-stat-label');
  const rewardNum = otext('cmp-stat-num num');
  const stats = el('div', 'cmp-stats', null, [
    el('div', 'cmp-stat', null, [soldLabel, el('span', 'cmp-stat-row', null, [icon('box', 'cmp-box'), soldNum])]),
    el('div', 'cmp-stat cmp-reward', null, [rewardLabel, el('span', 'cmp-stat-row', null, [icon('coin', 'cmp-coin'), rewardNum])]),
  ]);
  const next = el('div', 'cmp-next');
  const btnLabel = otext('cbtn-label');
  const btn = el('button', 'cbtn cbtn-big b3 b3-green is-ready', { type: 'button' }, [btnLabel]);
  const card = el('div', 'modal-card cmp-card panel', { role: 'dialog' }, [trophy, name, stats, next, btn]);
  const wrap = el('div', 'cmp-wrap', null, [stars, rb.root, card]);
  const root = el('div', 'modal cmp is-hidden', null, [rays, confetti, wrap]);
  ctx.layers.overlays.appendChild(root);
  root.addEventListener('pointerdown', (e) => e.stopPropagation());

  let isOpen = false;
  let dismissed = false;

  onTap(btn, () => {
    const f = ctx.game.select.factory();
    if (!f.isLast) {
      const r = ctx.game.act({ type: 'nextFactory' });
      if (r.ok) { ctx.sfx('open'); close(); }
    } else {
      ctx.sfx('tap');
      close();
      dismissed = true;
    }
  });

  function render() {
    const f = ctx.game.select.factory();
    const lang = ctx.lang();
    const last = f.isLast;
    rb.set(ctx.tx(last ? 'complete.lastTitle' : 'complete.title'));
    setText(name, ctx.tx(f.nameKey));
    setText(soldLabel, ctx.tx('complete.sold'));
    setText(soldNum, formatInt(f.sold, lang));
    setText(rewardLabel, ctx.tx('complete.reward'));
    setText(rewardNum, '+' + ctx.num(f.reward));
    toggle(stats.lastChild, 'is-hidden', last);
    toggle(stats, 'is-single', last);
    if (last) setText(next, ctx.tx('complete.soon'));
    else setText(next, ctx.tx('complete.nextName', { name: ctx.tx(FACTORIES[f.index + 1].nameKey) }));
    setText(btnLabel, ctx.tx(last ? 'complete.keep' : 'complete.next'));
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    ctx.closePanels();
    render();
    toggle(root, 'is-hidden', false);
    root.classList.remove('is-out');
    ctx.sfx('complete');
  }
  function close() {
    isOpen = false;
    root.classList.add('is-out');
    setTimeout(() => { if (!isOpen) toggle(root, 'is-hidden', true); }, 200);
  }

  function update() {
    const f = ctx.game.select.factory();
    if (f.complete && !isOpen && !dismissed && !ctx.blockingModal()) open();
    if (!f.complete) dismissed = false;
  }

  return { open, close, update, relabel: () => { if (isOpen) render(); }, isOpen: () => isOpen, root };
}
