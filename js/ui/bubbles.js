// Order bubbles over waiting guests: the dish they ordered, a progress ring while a cook
// prepares it, a little bounce when it is on its way. Positioned with anchor('customer', id).
import { el, icon, setStyle, setVar, toggle } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';

export function createBubbles(ctx) {
  const { game } = ctx;
  const layer = ctx.layers.bubbles;
  const live = new Map();     // customer id -> bubble
  const cookFor = new Map();  // customer id -> cook (rebuilt every frame, no allocation)

  function make(c) {
    const ring = document.createElementNS(NS, 'svg');
    ring.setAttribute('class', 'ring');
    ring.setAttribute('viewBox', '0 0 44 44');
    const circle = document.createElementNS(NS, 'circle');
    circle.setAttribute('cx', '22');
    circle.setAttribute('cy', '22');
    circle.setAttribute('r', '20');
    ring.appendChild(circle);
    const inner = el('div', 'bubble-in', null, [ring, icon(ctx.dishIcon(c.dish))]);
    const root = el('div', 'bubble', null, [inner]);
    layer.appendChild(root);
    return { root, inner, ring, dish: c.dish, phase: '', seen: 0, dying: 0 };
  }

  let frame = 0;
  function update(dt) {
    frame++;
    cookFor.clear();
    const cooks = game.state.cooks;
    for (let i = 0; i < cooks.length; i++) if (cooks[i].order) cookFor.set(cooks[i].order.customer, cooks[i]);
    const hide = ctx.modalOpen();
    const cs = game.state.customers;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.state !== 'waiting' || !c.dish) continue;
      let b = live.get(c.id);
      if (!b) { b = make(c); live.set(c.id, b); }
      b.seen = frame;
      const a = ctx.anchor('customer', c.id);
      const vis = !hide && a && a.visible !== false;
      setStyle(b.root, 'display', vis ? '' : 'none');
      if (!vis) continue;
      setStyle(b.root, 'transform', `translate3d(${Math.round(a.x)}px,${Math.round(a.y)}px,0)`);
      const k = cookFor.get(c.id);
      let phase = 'waiting';
      let p = 0;
      if (k && k.state === 'cooking') { phase = 'cooking'; p = k.dur > 0 ? Math.min(1, k.t / k.dur) : 1; }
      else if (k && (k.state === 'toTable' || k.state === 'serving')) { phase = 'coming'; p = 1; }
      if (phase !== b.phase) {
        b.phase = phase;
        toggle(b.root, 'coming', phase === 'coming');
        toggle(b.ring, 'is-hidden', phase === 'waiting');
      }
      if (phase !== 'waiting') setVar(b.ring, '--p', p.toFixed(3));
    }
    // served or gone: pop out, then remove
    for (const [id, b] of live) {
      if (b.seen === frame) continue;
      if (!b.dying) { b.dying = 0.22; toggle(b.root, 'out', true); }
      b.dying -= dt;
      if (b.dying <= 0) { b.root.remove(); live.delete(id); }
    }
  }

  function clear() {
    for (const b of live.values()) b.root.remove();
    live.clear();
  }

  return { update, clear, count: () => live.size };
}
