// 3-step tutorial with a pointing hand and a short bubble (never blocks input):
//   0 "Tap the Juice Bar"  -> the card opens -> step 1
//   1 "Upgrade ..."        -> the logic moves on after the first upgrade -> step 2
//   2 "Open the Grill ..." (shown once the Grill is affordable) -> opening it ends the tutorial
// Goal hints ("Go" in the Goals panel) reuse the same hand for a few seconds.
import { el, icon, setText, setStyle, toggle } from './dom.js';

export function createTutorial(ctx) {
  const { game } = ctx;
  // positioned wrappers (inline transform) around the animated pieces (CSS transform)
  const ring = el('div', 'tut-pos', null, [el('div', 'tut-ring')]);
  const hand = el('div', 'tut-pos', null, [el('div', 'tut-hand', null, [icon('hand')])]);
  const bubble = el('div', 'tut-bubble');
  const root = el('div', 'tut is-hidden', null, [ring, hand, bubble]);
  ctx.layers.overlays.appendChild(root);

  let hint = null;     // { point: () => {x, y, ring}, t }
  let shown = false;   // a tutorial bubble with text is on screen
  let hushT = 0;
  let rectT = 0;
  let btnRect = null;

  function place(p, text, bubbleAbove) {
    toggle(root, 'is-hidden', false);
    setStyle(ring, 'transform', `translate(${Math.round(p.rx)}px, ${Math.round(p.ry)}px)`);
    setStyle(hand, 'transform', `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`);
    toggle(bubble, 'is-hidden', !text);
    shown = !!text;
    if (text) {
      setText(bubble, text);
      const bx = Math.max(130, Math.min(window.innerWidth - 130, p.x));
      // above: its bottom at p.by - 10 (above the card, or above a station); else below the hand
      const by = bubbleAbove ? p.by - 10 : (p.by || p.y + 62);
      toggle(bubble, 'above', bubbleAbove);
      setStyle(bubble, 'left', Math.round(bx) + 'px');
      setStyle(bubble, 'top', Math.round(by) + 'px');
    }
  }

  // where to point for a station: its counter (open) or its sign (next station). The bubble
  // waits ABOVE the station, over the back wall (p.above): below the kitchen are the tables,
  // the next table's buy chip and the guests' order bubbles.
  function stationPoint(id) {
    const a = ctx.anchor('station', id);
    if (!a || a.visible === false) return null;
    const s = game.state.stations.find((x) => x.id === id);
    // the Open sign (38 px tall) stands on the anchor of its plot; the bubble above the ring
    // and above the level badges of the open stations (24 px tall, bottoms on their anchors)
    if (s && !s.open) {
      let by = a.y - 52;
      for (const o of game.state.stations) {
        if (!o.open) continue;
        const b = ctx.anchor('station', o.id);
        if (b && b.visible !== false && Math.abs(b.x - a.x) < 150) by = Math.min(by, b.y - 30);
      }
      return { x: a.x, y: a.y - 6, rx: a.x, ry: a.y - 19, by, above: true };
    }
    // open station: the ring pulses on the counter, the hand points up at it from below, a
    // little to the outer side (clear of the next station's Open sign near the corner); the
    // bubble sits above the level badge (24 px tall, its bottom on the anchor)
    const c = ctx.anchor('counter', id);
    if (c && c.visible !== false) {
      const side = c.x < window.innerWidth / 2 ? -1 : 1;
      return { x: c.x + side * 8, y: c.y + 16, rx: c.x, ry: c.y, by: a.y - 30, above: true };
    }
    // a stand-in scene without counters: ring on the station under the badge
    return { x: a.x + 8, y: a.y + 44, rx: a.x, ry: a.y + 26, by: a.y - 30, above: true };
  }

  // resting position of a button (offsets ignore the card's slide-in transform)
  function buttonPoint(btn) {
    if (!btn || !btn.offsetWidth) return null;
    rectT -= 1;
    if (!btnRect || rectT <= 0) {
      let x = 0;
      let y = 0;
      for (let e = btn; e && e !== ctx.root; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
      const panel = btn.closest('.card');
      btnRect = { left: x, top: y, width: btn.offsetWidth, height: btn.offsetHeight, above: panel ? panel.offsetTop : y };
      rectT = 10;
    }
    const r = btnRect;
    // the bubble sits above the whole card so it never hides the card's numbers
    return { x: r.left + r.width * 0.7, y: r.top + r.height * 0.45, rx: r.left + r.width * 0.7, ry: r.top + r.height / 2, by: r.above - 4 };
  }

  function update(dt) {
    hushT -= dt;
    const step = game.state.tutorial;
    if (ctx.modalOpen() || hushT > 0) { toggle(root, 'hush', true); }
    else toggle(root, 'hush', false);
    if (ctx.modalOpen()) { shown = false; toggle(root, 'is-hidden', true); return; }

    if (hint) {
      hint.t -= dt;
      const p = hint.t > 0 ? hint.point() : null;
      if (p) { place(p, '', false); return; }
      hint = null;
    }
    if (step === 'done' || game.state.locationIndex > 0) { shown = false; toggle(root, 'is-hidden', true); return; }
    const first = game.state.stations[0].id;
    const second = game.state.stations[1];
    const cardFor = ctx.cardStation();
    let p = null;
    let text = '';
    let above = false;
    if (step === 0 || step === 1) {
      if (step === 0 && cardFor === first) { game.act({ type: 'tutorial', step: 1 }); }
      if (cardFor === first) {
        p = buttonPoint(ctx.cardButton());
        text = ctx.tx('tut.upgrade');
        above = true;
      } else if (!cardFor) {
        btnRect = null;
        p = stationPoint(first);
        text = ctx.tx('tut.tapStation');
      }
    } else if (step === 2) {
      const cost = game.config().stations[1].openCost;
      if (!second.open && game.state.money >= cost) {
        if (cardFor === second.id) {
          p = buttonPoint(ctx.cardButton());
          text = ctx.tx('tut.openTap');
          above = true;
        } else if (!cardFor) {
          btnRect = null;
          p = stationPoint(second.id);
          text = ctx.tx('tut.open');
        }
      }
    }
    if (!p) { shown = false; toggle(root, 'is-hidden', true); return; }
    place(p, text, above || !!p.above);
  }

  return {
    update,
    // point at something for a few seconds (goal "Go" buttons)
    pointAt(point, seconds = 3.5) { hint = { point, t: seconds }; },
    pointAtStation(id, seconds = 3.5) { hint = { point: () => stationPoint(id), t: seconds }; },
    hush(sec) { hushT = sec; },
    // is the bubble shown low on the screen (over the card)? Toasts then move up under the HUD
    bubbleLow() { if (!shown) return false; const r = bubble.getBoundingClientRect(); return r.bottom > window.innerHeight * 0.5; },
    stationPoint,
    bubbleRect() { return root.classList.contains('is-hidden') ? null : bubble.getBoundingClientRect(); },
    bubbleShown: () => shown,
  };
}
