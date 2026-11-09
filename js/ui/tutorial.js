// Three short tutorial steps with a pointing hand. Never blocks input
// (pointer-events: none); the game logic advances the steps:
// 0 upgrade a station -> 1 open the next station -> 2 collect a goal -> done.
import { el, icon, setText, toggle, setStyle } from './dom.js';

export function createTutorial(ctx) {
  const hand = el('div', 'tut-hand', null, [icon('hand')]);
  const ring = el('div', 'tut-ring');
  const bubble = el('div', 'tut-bubble');
  const root = el('div', 'tut is-hidden', { 'aria-live': 'polite' }, [ring, hand, bubble]);
  ctx.layers.overlays.appendChild(root);

  let goalsShownFor = 0;
  let hintT = 0;
  let hintTarget = null;
  let visible = false;

  function centerOf(e) {
    if (!e) return null;
    const r = e.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, h: r.height };
  }

  // Temporary pointer used when a goal tile is tapped ("where do I do this?").
  function pointAt(target, seconds = 2.2) {
    hintTarget = target;
    hintT = seconds;
  }

  function place(p, text) {
    if (!p) { setVisible(false); return; }
    setVisible(true);
    const W = window.innerWidth;
    const H = window.innerHeight;
    setStyle(hand, 'transform', `translate3d(${Math.round(p.x)}px, ${Math.round(p.y + (p.h ? Math.min(p.h * 0.25, 14) : 0))}px, 0)`);
    setStyle(ring, 'transform', `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`);
    toggle(bubble, 'is-hidden', !text);
    if (text) {
      setText(bubble, text);
      const bw = Math.min(280, W - 24);
      const x = Math.max(12 + bw / 2, Math.min(W - 12 - bw / 2, p.x));
      const above = p.y > H * 0.5;
      const y = above ? p.y - (p.h ? p.h / 2 : 0) - 18 : p.y + 96;
      setStyle(bubble, 'width', bw + 'px');
      setStyle(bubble, 'transform', `translate3d(${Math.round(x - bw / 2)}px, ${Math.round(y)}px, 0) translateY(${above ? '-100%' : '0'})`);
      toggle(bubble, 'is-above', above);
    }
  }

  function setVisible(on) {
    if (on !== visible) { visible = on; toggle(root, 'is-hidden', !on); }
  }

  function update(dt) {
    const g = ctx.game;
    const step = g.state.tutorial;
    if (ctx.modalOpen()) { setVisible(false); return; }

    if (hintT > 0) {
      hintT -= dt;
      const p = typeof hintTarget === 'function' ? hintTarget() : hintTarget;
      place(p, null);
      return;
    }
    if (step === 'done' || g.state.factoryIndex > 0) { setVisible(false); return; }

    const st = g.state.factory.stations;
    if (step === 0) {
      if (ctx.cardOpen()) place(centerOf(ctx.cardButton()), ctx.tx('tut.tapUpgrade'));
      else place(ctx.stationPoint(st[0].id), ctx.tx('tut.tapSaw'));
      return;
    }
    if (step === 1) {
      const v = g.select.stationView(2);
      if (!v || !v.canOpen || !v.canAfford) { setVisible(false); return; }
      if (ctx.cardOpen() && ctx.cardStation() === v.id) place(centerOf(ctx.cardButton()), ctx.tx('tut.tapOpen'));
      else place(ctx.stationPoint(v.id), ctx.tx('tut.canOpen'));
      return;
    }
    if (step === 2) {
      if (ctx.cardOpen()) { setVisible(false); return; }
      const tile = ctx.firstDoneGoal();
      if (tile) { place(centerOf(tile), ctx.tx('tut.collect')); return; }
      goalsShownFor += dt;
      if (goalsShownFor > 6) { g.act({ type: 'tutorial', step: 'done' }); setVisible(false); return; }
      place(centerOf(ctx.goalsRoot()), ctx.tx('tut.goals'));
    }
  }

  return { update, pointAt, root };
}
