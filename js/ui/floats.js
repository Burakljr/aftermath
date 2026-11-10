// Floating outlined "+coins" numbers, coin flights to the coin pill, star bursts
// and the ribbon toast. All elements are pooled and animated with transform/opacity
// only (WAAPI).
import { el, makePool, ICONS, pulse } from './dom.js';
import { ribbon } from './panel.js';

const COIN_HTML = ICONS.coin;
const STAR_HTML = ICONS.star;
const TOAST_KIND = { 'is-star': 'gold', 'is-open': 'berry', 'is-goal': 'green', 'is-truck': 'blue' };

export function createFloats(ctx) {
  const layer = ctx.layers.floats;
  const texts = makePool(layer, 'float-text ot num', 14);
  const coins = makePool(layer, 'float-coin', 24);
  const stars = makePool(layer, 'float-star', 28);
  layer.querySelectorAll('.float-coin').forEach((e) => { e.innerHTML = COIN_HTML; });
  layer.querySelectorAll('.float-star').forEach((e) => { e.innerHTML = STAR_HTML; });

  const rb = ribbon('gold', 'toast-text');
  const toastEl = el('div', 'toast is-hidden', { role: 'status' }, [rb.root]);
  ctx.layers.top.appendChild(toastEl);
  let toastT = 0;

  const reduced = (() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  })();

  function floatText(x, y, text, cls = '') {
    const it = texts.get();
    if (!it) return;
    const e = it.e;
    e.className = 'float-text ot num ' + cls;
    e.textContent = text;
    const dx = (Math.random() - 0.5) * 16;
    it.anim = e.animate([
      { transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(0.4)`, opacity: 0 },
      { transform: `translate3d(${x + dx * 0.3}px, ${y - 16}px, 0) translate(-50%, -50%) scale(1.25, 1.1)`, opacity: 1, offset: 0.16 },
      { transform: `translate3d(${x + dx * 0.5}px, ${y - 26}px, 0) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.3 },
      { transform: `translate3d(${x + dx}px, ${y - 70}px, 0) translate(-50%, -50%) scale(0.9)`, opacity: 0 },
    ], { duration: reduced ? 600 : 1150, easing: 'cubic-bezier(.2,.7,.3,1)' });
    it.anim.onfinish = () => texts.release(it);
  }

  // Coins fly from (x, y) to the coin pill along a curve.
  function coinFlight(x, y, n = 1, onArrive) {
    const target = ctx.coinTarget();
    let arrived = 0;
    for (let i = 0; i < n; i++) {
      const it = coins.get();
      if (!it) break;
      const sx = x + (Math.random() - 0.5) * 34 * Math.min(1, n / 3);
      const sy = y + (Math.random() - 0.5) * 22 * Math.min(1, n / 3);
      const mx = (sx + target.x) / 2 + (Math.random() - 0.5) * 90;
      const my = Math.min(sy, target.y) - 30 - Math.random() * 60;
      it.anim = it.e.animate([
        { transform: `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%) scale(0.3)`, opacity: 0 },
        { transform: `translate3d(${sx}px, ${sy - 18}px, 0) translate(-50%, -50%) scale(1.2)`, opacity: 1, offset: 0.15 },
        { transform: `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate3d(${target.x}px, ${target.y}px, 0) translate(-50%, -50%) scale(0.75)`, opacity: 0.95 },
      ], { duration: 680 + i * 60, delay: i * 45, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'backwards' });
      it.anim.onfinish = () => {
        coins.release(it);
        arrived++;
        if (arrived === 1 || arrived === n) ctx.hudBump();
        if (onArrive && arrived === 1) onArrive();
      };
    }
  }

  function starBurst(x, y, count = 8, color = '#FFC82E', size = 1) {
    for (let i = 0; i < count; i++) {
      const it = stars.get();
      if (!it) break;
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const r = (40 + Math.random() * 30) * size;
      const s = size < 1 ? 0.7 : 1;
      it.e.style.color = color;
      it.anim = it.e.animate([
        { transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(0.2) rotate(0deg)`, opacity: 1 },
        { transform: `translate3d(${x + Math.cos(a) * r}px, ${y + Math.sin(a) * r}px, 0) translate(-50%, -50%) scale(${s}) rotate(140deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate3d(${x + Math.cos(a) * r * 1.2}px, ${y + Math.sin(a) * r * 1.2 + 12}px, 0) translate(-50%, -50%) scale(${s * 0.4}) rotate(220deg)`, opacity: 0 },
      ], { duration: size < 1 ? 560 : 820, easing: 'cubic-bezier(.2,.8,.3,1)' });
      it.anim.onfinish = () => stars.release(it);
    }
  }

  function toast(text, kind = '') {
    rb.set(text);
    rb.root.className = 'rb rb-' + (TOAST_KIND[kind] || 'purple');
    rb.set(text);
    toastEl.className = 'toast ' + kind;
    // sit just above the bottom panel (goal pill or open card), near the thumb
    const top = ctx.toastTop ? ctx.toastTop() : window.innerHeight * 0.6;
    toastEl._top = Math.round(top) + 'px';
    toastEl.style.top = toastEl._top;
    toastEl.style.visibility = top < 0 ? 'hidden' : '';
    toastPosT = 0.1;
    pulse(toastEl, 'toast-in');
    toastT = 2.0;
  }

  let toastPosT = 0;
  function update(dt) {
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0) toastEl.classList.add('is-hidden');
      // follow the bottom panel if it changes (card opened or closed)
      toastPosT -= dt;
      if (toastPosT <= 0 && toastT > 0 && ctx.toastTop) {
        toastPosT = 0.1;
        const y = ctx.toastTop();
        const top = Math.round(y) + 'px';
        if (toastEl._top !== top) { toastEl._top = top; toastEl.style.top = top; toastEl.style.visibility = y < 0 ? 'hidden' : ''; }
      }
    }
  }

  return { floatText, coinFlight, starBurst, toast, update, toastEl };
}
