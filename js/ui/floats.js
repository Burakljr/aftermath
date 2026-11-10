// Feedback layer: "+coins" floats, coins flying to the HUD, short toasts.
// Everything animates with transform/opacity only (WAAPI) and cleans itself up.
import { el, icon, setText } from './dom.js';

const MAX_FLOATS = 14;
const MAX_COINS = 10;

export function createFloats(ctx) {
  const layer = ctx.layers.floats;
  let floats = 0;
  let coins = 0;
  let toastEl = null;
  let toastT = 0;

  function anim(e, frames, opts, done) {
    let a = null;
    try { a = e.animate(frames, opts); } catch { a = null; }
    if (a) a.onfinish = () => { e.remove(); if (done) done(); };
    else setTimeout(() => { e.remove(); if (done) done(); }, opts.duration || 600);
  }

  function floatText(x, y, text, { big = false, coin = true, pay = false, rich = false } = {}) {
    if (floats >= MAX_FLOATS) return;
    floats++;
    const e = el('div', 'float' + (big ? ' big' : '') + (pay ? ' pay' : '') + (rich ? ' rich' : ''), null, [coin ? icon('coin') : null, el('span', null, { text })]);
    layer.appendChild(e);
    const w = big ? 70 : 50;
    x = Math.max(w, Math.min(window.innerWidth - w, x));
    anim(e, [
      { transform: `translate(${x}px, ${y}px) translate(-50%, -50%) scale(.6)`, opacity: 0 },
      { transform: `translate(${x}px, ${y - 14}px) translate(-50%, -50%) scale(1.08)`, opacity: 1, offset: 0.18 },
      { transform: `translate(${x}px, ${y - 30}px) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.7 },
      { transform: `translate(${x}px, ${y - 44}px) translate(-50%, -50%) scale(1)`, opacity: 0 },
    ], { duration: big ? 1300 : 1000, easing: 'ease-out' }, () => { floats--; });
  }

  function coinFlight(x, y, n = 1, pay = false) {
    const target = ctx.coinTarget();
    for (let i = 0; i < n; i++) {
      if (coins >= MAX_COINS) return;
      coins++;
      const e = el('div', 'flycoin' + (pay ? ' pay' : ''), null, [icon('coin')]);
      e.firstChild.style.width = '100%';
      e.firstChild.style.height = '100%';
      layer.appendChild(e);
      const sx = x + (n > 1 ? (Math.random() - 0.5) * 50 : 0);
      const sy = y + (n > 1 ? (Math.random() - 0.5) * 24 : 0);
      // a gentle arc that stays on screen (the HUD is at the very top)
      const mx = (sx + target.x) / 2 + (sx < target.x ? -40 : 40);
      const my = Math.max(target.y + 24, (sy + target.y) / 2 - 50);
      anim(e, [
        { transform: `translate(${sx}px, ${sy}px) scale(.9)` },
        { transform: `translate(${mx}px, ${my}px) scale(1.1)`, offset: 0.45 },
        { transform: `translate(${target.x}px, ${target.y}px) scale(.7)` },
      ], { duration: 650 + i * 70, delay: i * 50, easing: 'cubic-bezier(.45,.05,.55,1)' }, () => {
        coins--;
        ctx.hudBump();
        ctx.sfx('coin');
      });
    }
  }

  // b: distance from the bottom (px), null = under the HUD, 'sheet' = banner above a sheet
  function placeToast(e, b) {
    const top = b === null;
    const sheet = b === 'sheet';
    if (e.classList.contains('at-top') !== top) e.classList.toggle('at-top', top);
    if (e.classList.contains('at-sheet') !== sheet) e.classList.toggle('at-sheet', sheet);
    if (!top && !sheet) {
      const v = Math.round(b) + 'px';
      if (e._b !== v) { e._b = v; e.style.setProperty('--toast-b', v); }
    }
  }

  function toast(text, iconName) {
    if (ctx.blockingModal && ctx.blockingModal()) return; // not over Welcome back / complete / settings
    if (toastEl) toastEl.remove();
    toastEl = el('div', 'toast', null, [iconName ? icon(iconName) : null, el('span', null, { text })]);
    // just above the bottom UI (goal pill / card), clear of the stations and most tables
    placeToast(toastEl, ctx.toastBottom());
    ctx.layers.floats.appendChild(toastEl);
    toastT = 2.2;
  }

  return {
    floatText,
    coinFlight,
    toast,
    update(dt) {
      if (toastEl && ctx.blockingModal && ctx.blockingModal()) { toastEl.remove(); toastEl = null; }
      // keep the toast above the bottom UI if a card opens or closes meanwhile, and move it
      // under the HUD while a menu sheet covers the bottom (and back when it closes)
      if (toastEl) placeToast(toastEl, ctx.toastBottom());
      if (toastEl && toastT > 0) {
        toastT -= dt;
        if (toastT <= 0) {
          const t = toastEl;
          toastEl = null;
          t.classList.add('out');
          setTimeout(() => t.remove(), 260);
        }
      }
    },
    toastText: () => (toastEl ? toastEl.textContent : ''),
    count: () => floats,
    setText,
  };
}
