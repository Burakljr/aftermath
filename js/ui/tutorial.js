// Three short tutorial steps with a pointing hand. Never blocks input
// (pointer-events: none); the game logic advances the steps:
// 0 upgrade a station -> 1 open the next station -> 2 collect a goal -> done.
import { el, icon, setText, toggle, setStyle } from './dom.js';

export function createTutorial(ctx) {
  const hand = el('div', 'tut-hand', null, [icon('hand')]);
  const ringEl = el('div', 'tut-ring');
  const bubble = el('div', 'tut-bubble');
  const root = el('div', 'tut is-hidden', { 'aria-live': 'polite' }, [ringEl, hand, bubble]);
  ctx.layers.overlays.appendChild(root);

  let goalsShownFor = 0;
  let hintT = 0;
  let hintTarget = null;
  let visible = false;

  // Big buttons: point at the empty right part so the label and price stay readable.
  function buttonPoint(e) {
    if (!e) return null;
    const r = e.getBoundingClientRect();
    if (r.width === 0) return null;
    // the bubble goes above the card so it never covers the card's numbers
    return { x: r.left + r.width * 0.86, y: r.top + r.height * 0.62, h: 8, ring: { x: r.left + r.width * 0.86, y: r.top + r.height / 2 }, bubbleAbove: ctx.panelTop() - 24 }; // clear the card's ribbon
  }

  // Temporary pointer used when a goal tile is tapped ("where do I do this?").
  function pointAt(target, seconds = 2.2) {
    hintTarget = target;
    hintT = seconds;
  }

  let bubbleText = '';
  let bubbleW = 0;
  let bubbleH = 0;
  function place(p, text) {
    if (!p) { setVisible(false); return; }
    setVisible(true);
    const W = window.innerWidth;
    const H = window.innerHeight;
    const ring = p.ring || p;
    setStyle(hand, 'transform', `translate3d(${Math.round(p.x)}px, ${Math.round(p.y)}px, 0)`);
    setStyle(ringEl, 'transform', `translate3d(${Math.round(ring.x)}px, ${Math.round(ring.y)}px, 0)`);
    toggle(bubble, 'is-hidden', !text);
    if (!text) return;
    if (text !== bubbleText) {
      bubbleText = text;
      setText(bubble, text);
      bubbleW = bubble.offsetWidth; // measured once per text
      bubbleH = bubble.offsetHeight;
    }
    let x;
    let y;
    const gap = 46;
    const roomRight = W - 12 - (p.x + gap);
    const roomLeft = p.x - gap - 12;
    if (p.bubbleAbove > 0) {
      x = W / 2 - bubbleW / 2;
      y = p.bubbleAbove - 14 - bubbleH;
    } else if (p.y < H * 0.62 && (roomRight >= bubbleW || roomLeft >= bubbleW)) {
      // beside the hand
      x = roomRight >= bubbleW ? p.x + gap : p.x - gap - bubbleW;
      y = (p.bubbleY ?? ring.y) - bubbleH / 2;
    } else if (p.preferBelow && p.y + 70 + bubbleH < ctx.panelTop() - 12) {
      // under the hand (an Open sign sits above the target, so "above" would cover it)
      x = p.x - bubbleW / 2;
      y = p.y + 70;
    } else if (p.y > H * 0.5) {
      // above the target
      x = p.x - bubbleW / 2;
      y = ring.y - (p.ring ? 40 : (p.h || 0) / 2) - 18 - bubbleH;
    } else {
      x = p.x - bubbleW / 2;
      y = p.y + 88;
    }
    x = Math.max(12, Math.min(W - 12 - bubbleW, x));
    y = Math.max(8, Math.min(H - 8 - bubbleH, y));
    setStyle(bubble, 'transform', `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`);
    bubbleTop = y;
  }
  let bubbleTop = -1;
  let hushT = 0;
  /** where the bubble is (null when hidden), so a toast can avoid it */
  function bubbleRect() {
    if (!visible || hushT > 0 || bubble.classList.contains('is-hidden') || bubbleTop < 0) return null;
    return { top: bubbleTop, bottom: bubbleTop + bubbleH };
  }
  /** fade the bubble out for a moment (a toast needs its spot) */
  function hush(seconds) {
    hushT = Math.max(hushT, seconds);
    toggle(bubble, 'is-hushed', true);
  }

  function setVisible(on) {
    if (on !== visible) { visible = on; toggle(root, 'is-hidden', !on); }
  }

  function update(dt) {
    if (hushT > 0) { hushT -= dt; if (hushT <= 0) toggle(bubble, 'is-hushed', false); }
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
      if (ctx.cardOpen()) place(buttonPoint(ctx.cardButton()), ctx.tx('tut.tapUpgrade'));
      else {
        // ring on the machine itself (under its level badge), bubble beside the badge
        const b = ctx.stationPoint(st[0].id);
        place(b && b.ring ? { x: b.ring.x + 6, y: b.y + 44, h: 8, ring: { x: b.ring.x, y: b.y + 38 }, bubbleY: b.ring.y } : b, ctx.tx('tut.tapSaw'));
      }
      return;
    }
    if (step === 1) {
      const v = g.select.stationView(2);
      if (!v || !v.canOpen || !v.canAfford) { setVisible(false); return; }
      if (ctx.cardOpen() && ctx.cardStation() === v.id) place(buttonPoint(ctx.cardButton()), ctx.tx('tut.tapOpen'));
      else place(ctx.stationPoint(v.id), ctx.tx('tut.canOpen'));
      return;
    }
    if (step === 2) {
      if (ctx.cardOpen()) { setVisible(false); return; }
      const tile = ctx.firstDoneGoal();
      if (tile) {
        const r = tile.getBoundingClientRect();
        // point at the right part of the pill (Collect + reward), bubble above it
        const px = r.left + r.width * 0.78;
        place({ x: px, y: r.top + r.height * 0.55, h: 8, ring: { x: px, y: r.top + r.height / 2 }, bubbleAbove: r.top - 6 }, ctx.tx('tut.collect'));
        return;
      }
      goalsShownFor += dt;
      if (goalsShownFor > 6) { g.act({ type: 'tutorial', step: 'done' }); setVisible(false); return; }
      // point at the goal icon on the left so the goal text stays readable
      const pr = ctx.goalsRoot() ? ctx.goalsRoot().getBoundingClientRect() : null;
      place(pr && pr.width > 0 ? { x: pr.left + 30, y: pr.top + pr.height * 0.6, h: 8, ring: { x: pr.left + 28, y: pr.top + pr.height / 2 }, bubbleAbove: pr.top - 6 } : null, ctx.tx('tut.goals'));
    }
  }

  return { update, pointAt, root, bubbleRect, hush };
}
