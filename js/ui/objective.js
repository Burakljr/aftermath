// Aftermath v2 UI: objective bar (DESIGN §5.6) + headline swap. The headline renders in #headline, laid exactly over the
// bar, so news text never counts as a HUD number (ARCH §7.2 note). Tap: reward popover, or the news archive during a headline.
import { h, T, C, show, tap, pulseClass } from './dom.js';
import { on } from '../bus.js';

const HAS_DIGIT = /\d/;

export function createObjective(ctx) {
  const { game } = ctx;
  const label = h('span.objective__label', { text: 'Hedef' });
  const text = h('span.objective__text.text');
  const count = h('span.objective__count.num');
  const bar = h('button.objective.glass', { type: 'button' }, label, text, count);
  ctx.L.objective.appendChild(bar);

  const hlText = h('span.headline__text');
  const hl = h('button.headline-bar', { type: 'button' }, h('span.headline__label', { text: 'Haber' }), hlText);
  ctx.L.headline.appendChild(hl);

  const pop = h('div.popover.glass', { role: 'status' });
  ctx.L.bubble.appendChild(pop);
  let popUntil = 0;
  let last = null;

  function openPop() {
    if (!last) return;
    const lines = [];
    if (last.reward) lines.push(h('div.popover__reward', last.reward));
    if (last.progress && HAS_DIGIT.test(last.text)) lines.push(h('div.popover__prog.num', last.progress.text));
    if (!lines.length) return;
    pop.replaceChildren(...lines);
    pop.classList.add('on');
    popUntil = performance.now() + 2600;
  }
  tap(bar, () => {
    ctx.sfx('click');
    if (pop.classList.contains('on')) {
      pop.classList.remove('on');
      return;
    }
    openPop();
  });
  tap(hl, () => {
    ctx.sfx('click');
    ctx.view.settings = true;
    ctx.view.news = true;
    ctx.dirty = true;
  });
  on('unlock', () => pulseClass(bar, 'flash', 700));
  on('goal', () => pulseClass(bar, 'flash', 700));

  let hlShown = '';
  return {
    update(s) {
      const o = game.objective(s);
      last = o;
      const attack = s.phase === 'attack';
      show(bar, !attack && !!o.text);
      T(text, o.text);
      const prog = o.progress && !HAS_DIGIT.test(o.text) ? o.progress.text : '';
      show(count, !!prog);
      T(count, prog);
      C(bar, 'has-reward', !!o.reward);
      // no headline swap while a guided step needs its objective line
      const fv = game.ftueView(s);
      // nor in the first 8 s of a contract, when the player needs to know what to do (playtest m6)
      const early = s.phase === 'cleanup' && s.contract && s.contract.elapsed < 8;
      const n = attack || early || (fv && fv.dim) ? null : game.headline(s);
      const ht = n ? n.text : '';
      if (ht !== hlShown) {
        hlShown = ht;
        if (ht) T(hlText, ht);
        C(hl, 'on', !!ht);
        C(bar, 'swapped', !!ht);
      }
      if (popUntil && performance.now() > popUntil) {
        popUntil = 0;
        pop.classList.remove('on');
      }
    },
  };
}
