// Aftermath v2 UI: skeleton, layers (ARCH §7.2) and the free "band" between the top chrome and the bottom panel/sheet.
import { h } from './dom.js';

// z-order low -> high. #fly (coins, part icons, rare card) is an additive layer above #tabs/#sheet.
const LAYERS = ['world', 'ftue-dim', 'hud', 'objective', 'headline', 'panel', 'tabs', 'sheet', 'broadcast', 'fly', 'notice', 'bubble', 'toasts', 'loading'];

export function buildLayers(root) {
  const L = {};
  for (const id of LAYERS) {
    let el = root.querySelector(`#${id}`);
    if (!el) {
      el = h('div', { id });
      root.appendChild(el);
    }
    el.classList.add('layer');
    L[id.replace('-', '')] = el;
  }
  return L;
}

/** offsetTop of el relative to the fixed root, ignoring transforms (final, not mid-animation, position) */
function topOf(el, root) {
  let y = 0;
  let n = el;
  while (n && n !== root) {
    y += n.offsetTop;
    n = n.offsetParent;
  }
  return y;
}

/**
 * Band in CSS px: { top, bottom } = insets from the top and bottom of the viewport.
 * top: below the objective bar (or the letterbox in the attack); bottom: above the highest visible bottom element.
 */
export function measureBand(root, L, attack) {
  const H = root.clientHeight || window.innerHeight;
  if (attack) return { top: 120, bottom: 284 };
  const ob = L.objective.firstElementChild;
  let top = 0;
  if (ob && ob.offsetParent) top = topOf(ob, root) + ob.offsetHeight + 8;
  let minTop = H;
  const cands = [L.tabs.firstElementChild, ...L.panel.children];
  // sheet slots are full-screen wrappers: measure the box inside the active one
  for (const slot of L.sheet.children) {
    if (!slot.classList.contains('on')) continue;
    for (const box of slot.children) if (box.offsetParent) cands.push(box);
  }
  for (const el of cands) {
    if (!el || !el.offsetParent || el.hidden || el.classList.contains('off')) continue;
    const t = topOf(el, root);
    if (t > top && t < minTop) minTop = t;
  }
  return { top: Math.round(top), bottom: Math.round(Math.max(0, H - minTop + 8)) };
}
