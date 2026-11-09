// Floating "+coins" texts, coin flights to the counter, star bursts and toasts.
// All elements are pooled and animated with transform/opacity only (WAAPI).
import { el, makePool, ICONS, setText, pulse } from './dom.js';

const COIN_HTML = ICONS.coin;
const STAR_HTML = ICONS.star;

export function createFloats(ctx) {
  const layer = ctx.layers.floats;
  const texts = makePool(layer, 'float-text num', 14);
  const coins = makePool(layer, 'float-coin', 24);
  const stars = makePool(layer, 'float-star', 24);
  layer.querySelectorAll('.float-coin').forEach((e) => { e.innerHTML = COIN_HTML; });
  layer.querySelectorAll('.float-star').forEach((e) => { e.innerHTML = STAR_HTML; });

  const toastEl = el('div', 'toast is-hidden');
  ctx.layers.top.appendChild(toastEl);
  let toastT = 0;

  const reduced = (() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  })();

  function floatText(x, y, text, cls = '') {
    const it = texts.get();
    if (!it) return;
    const e = it.e;
    e.className = 'float-text num ' + cls;
    e.textContent = text;
    const dx = (Math.random() - 0.5) * 16;
    it.anim = e.animate([
      { transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(0.6)`, opacity: 0 },
      { transform: `translate3d(${x + dx * 0.3}px, ${y - 18}px, 0) translate(-50%, -50%) scale(1.15)`, opacity: 1, offset: 0.18 },
      { transform: `translate3d(${x + dx}px, ${y - 64}px, 0) translate(-50%, -50%) scale(1)`, opacity: 0 },
    ], { duration: reduced ? 600 : 1100, easing: 'cubic-bezier(.2,.7,.3,1)' });
    it.anim.onfinish = () => texts.release(it);
  }

  // Coins fly from (x, y) to the HUD counter along a curve.
  function coinFlight(x, y, n = 1, onArrive) {
    const target = ctx.coinTarget();
    let arrived = 0;
    for (let i = 0; i < n; i++) {
      const it = coins.get();
      if (!it) break;
      const sx = x + (Math.random() - 0.5) * 30 * Math.min(1, n / 3);
      const sy = y + (Math.random() - 0.5) * 20 * Math.min(1, n / 3);
      const mx = (sx + target.x) / 2 + (Math.random() - 0.5) * 80;
      const my = Math.min(sy, target.y) - 40 - Math.random() * 60;
      it.anim = it.e.animate([
        { transform: `translate3d(${sx}px, ${sy}px, 0) translate(-50%, -50%) scale(0.4)`, opacity: 0 },
        { transform: `translate3d(${sx}px, ${sy - 14}px, 0) translate(-50%, -50%) scale(1.1)`, opacity: 1, offset: 0.15 },
        { transform: `translate3d(${mx}px, ${my}px, 0) translate(-50%, -50%) scale(0.95)`, opacity: 1, offset: 0.55 },
        { transform: `translate3d(${target.x}px, ${target.y}px, 0) translate(-50%, -50%) scale(0.7)`, opacity: 0.9 },
      ], { duration: 650 + i * 60, delay: i * 45, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'backwards' });
      it.anim.onfinish = () => {
        coins.release(it);
        arrived++;
        if (arrived === 1 || arrived === n) ctx.hudBump();
        if (onArrive && arrived === 1) onArrive();
      };
    }
  }

  function starBurst(x, y, count = 8, color = '#ffc93c') {
    for (let i = 0; i < count; i++) {
      const it = stars.get();
      if (!it) break;
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const r = 46 + Math.random() * 30;
      it.e.style.color = color;
      it.anim = it.e.animate([
        { transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(0.3) rotate(0deg)`, opacity: 1 },
        { transform: `translate3d(${x + Math.cos(a) * r}px, ${y + Math.sin(a) * r}px, 0) translate(-50%, -50%) scale(1) rotate(120deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate3d(${x + Math.cos(a) * r * 1.2}px, ${y + Math.sin(a) * r * 1.2 + 10}px, 0) translate(-50%, -50%) scale(0.5) rotate(200deg)`, opacity: 0 },
      ], { duration: 800, easing: 'cubic-bezier(.2,.8,.3,1)' });
      it.anim.onfinish = () => stars.release(it);
    }
  }

  function toast(text, kind = '') {
    setText(toastEl, text);
    toastEl.className = 'toast ' + kind;
    // sit just above the bottom panel (goal strip or open card), near the thumb
    const top = ctx.panelTop ? ctx.panelTop() : window.innerHeight * 0.7;
    toastEl.style.top = Math.round(top - 70) + "px";
    pulse(toastEl, 'toast-in');
    toastT = 2.0;
  }

  function update(dt) {
    if (toastT > 0) {
      toastT -= dt;
      if (toastT <= 0) toastEl.classList.add('is-hidden');
    }
  }

  return { floatText, coinFlight, starBurst, toast, update };
}
