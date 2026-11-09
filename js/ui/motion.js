// Aftermath v2 UI: motion helpers (DESIGN §8). Easing, roll-ups, arcs; respects prefers-reduced-motion.

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
let forced = false;

export function setReducedMotion(on) {
  forced = !!on;
}
export function reduced() {
  return forced || !!(mq && mq.matches);
}
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Number roll-up: set(target, now) then value(now). 600-800 ms ease-out (DESIGN §8). */
export function roller(initial = 0, dur = 700) {
  let from = initial;
  let to = initial;
  let t0 = 0;
  return {
    set(target, now) {
      if (target === to) return 0;
      const cur = this.value(now);
      const dir = Math.sign(target - to);
      from = cur;
      to = target;
      t0 = now;
      if (reduced()) from = to;
      return dir;
    },
    jump(v) {
      from = to = v;
    },
    value(now) {
      const k = Math.min(1, Math.max(0, (now - t0) / dur));
      return k >= 1 ? to : from + (to - from) * easeOut(k);
    },
    busy(now) {
      return now - t0 < dur && from !== to;
    },
    get target() {
      return to;
    },
  };
}

/**
 * Fly an element from point a to point b along a quadratic arc (Web Animations).
 * a, b: {x, y} in CSS px (element centre). Returns the Animation or null.
 */
export function flyArc(el, a, b, { duration = 700, lift = 90, scaleTo = 0.6, delay = 0, easing = 'cubic-bezier(.45,0,.55,1)' } = {}) {
  const cx = (a.x + b.x) / 2;
  const cy = Math.min(a.y, b.y) - lift;
  const frames = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * cx + t * t * b.x;
    const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * cy + t * t * b.y;
    const s = 1 + (scaleTo - 1) * t;
    frames.push({ transform: `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${s.toFixed(3)})`, opacity: i === N ? 0.2 : 1 });
  }
  if (reduced() || !el.animate) {
    el.remove();
    return null;
  }
  const anim = el.animate(frames, { duration, easing, delay, fill: 'both' });
  anim.onfinish = () => el.remove();
  anim.oncancel = () => el.remove();
  return anim;
}

/** centre of an element's box in CSS px, or null */
export function centre(el) {
  if (!el || !el.getBoundingClientRect) return null;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
