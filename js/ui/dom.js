// Small DOM helpers and the inline SVG icon set (all drawn for this game).

export function el(tag, cls, attrs, children) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'html') e.innerHTML = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  if (children) for (const c of children) if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}

// Only touch the DOM when the value really changes.
export function setText(e, s) {
  if (e._t !== s) { e._t = s; e.textContent = s; }
}
export function setHTML(e, s) {
  if (e._h !== s) { e._h = s; e.innerHTML = s; }
}
export function toggle(e, cls, on) {
  on = !!on;
  const key = '_c_' + cls;
  if (e[key] !== on) { e[key] = on; e.classList.toggle(cls, on); }
}
export function setStyle(e, prop, v) {
  const key = '_s_' + prop;
  if (e[key] !== v) { e[key] = v; e.style[prop] = v; }
}
export function show(e, on) { toggle(e, 'is-hidden', !on); }

// Restart a CSS animation class (for "pop" effects).
export function pulse(e, cls = 'pop') {
  e.classList.remove(cls);
  void e.offsetWidth; // eslint-disable-line no-void
  e.classList.add(cls);
}

// Fast button feedback for touch: pointerdown triggers, not click (no 300 ms delay).
export function onTap(e, fn) {
  e.addEventListener('pointerdown', (ev) => {
    if (ev.button !== undefined && ev.button > 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    fn(ev);
  });
  e.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
}

const gearTeeth = Array.from({ length: 8 }, (_, k) =>
  `<rect x="10.2" y="0.8" width="3.6" height="6" rx="1.4" transform="rotate(${k * 45} 12 12)"/>`).join('');

export const ICONS = {
  coin: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16.6" r="14.6" fill="#d98a00"/><circle cx="16" cy="15" r="14" fill="#ffc93c"/><circle cx="16" cy="15" r="10" fill="#ffb81c"/><path d="M16 8.6l1.9 3.9 4.3.6-3.1 3 .7 4.2L16 18.3l-3.8 2 .7-4.2-3.1-3 4.3-.6z" fill="#fff4c9"/><path d="M7.5 9.5a10 10 0 0 1 5-4" stroke="#fff6d8" stroke-width="2.2" stroke-linecap="round" fill="none"/></svg>',
  gear: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor">${gearTeeth}<circle cx="12" cy="12" r="7.6"/></g><circle cx="12" cy="12" r="3.2" fill="#fff"/></svg>`,
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2l3 6.2 6.8.9-5 4.7 1.3 6.7L12 17.5l-6.1 3.2 1.3-6.7-5-4.7 6.8-.9z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><rect x="4.5" y="10" width="15" height="11" rx="3.4" fill="currentColor"/><circle cx="12" cy="15.5" r="1.8" fill="#fff"/></svg>',
  up: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l7.5 8.2h-4.6v8.8H9.1v-8.8H4.5z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2L5 13.5h6L10 22l9-12.5h-6z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="currentColor"/><path d="M12 6.5V12l3.6 2.4" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 3.2a8.8 8.8 0 1 0 5.3 13.6A7.4 7.4 0 0 1 15.5 3.2z" fill="currentColor"/><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor"/><circle cx="20.5" cy="10.5" r="0.8" fill="currentColor"/></svg>',
  trophy: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 6h20v12a10 10 0 0 1-20 0z" fill="#ffc93c"/><path d="M14 9H7.5a1.5 1.5 0 0 0-1.5 1.6C6.6 17 10 20 15 20M34 9h6.5a1.5 1.5 0 0 1 1.5 1.6C41.4 17 38 20 33 20" fill="none" stroke="#ffb01c" stroke-width="3.2" stroke-linecap="round"/><rect x="21" y="27" width="6" height="7" fill="#f2a200"/><rect x="14" y="33" width="20" height="8" rx="3" fill="#8b6cff"/><path d="M18 10.5c0 4 1 7 3.5 9" stroke="#fff3c4" stroke-width="2.6" stroke-linecap="round" fill="none"/><path d="M24 11.2l1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5z" fill="#fff"/></svg>',
  box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8.5L12 4.5l8.5 4v9L12 21.5l-8.5-4z" fill="currentColor"/><path d="M3.5 8.5L12 12.5l8.5-4M12 12.5v9" stroke="#fff" stroke-width="1.6" fill="none" stroke-linejoin="round"/></svg>',
  rate: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="14" r="6.5" fill="currentColor"/><path d="M9 10.8v6.4M7 12.4h3.2a1.4 1.4 0 0 1 0 2.8H7.8a1.4 1.4 0 0 0 0 2.8H11" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/><path d="M14.5 7.5l3-3 3 3M17.5 4.8V12" stroke="currentColor" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  stars: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7.5l1.6 3.2 3.5.5-2.5 2.4.6 3.5L7 15.5l-3.2 1.6.6-3.5-2.5-2.4 3.5-.5zM17 5l1.6 3.2 3.5.5-2.5 2.4.6 3.5-3.2-1.6-3.2 1.6.6-3.5-2.5-2.4 3.5-.5zM14 14l1.3 2.6 2.9.4-2.1 2 .5 2.9-2.6-1.4-2.6 1.4.5-2.9-2.1-2 2.9-.4z" fill="currentColor"/></svg>',
  key: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M12.5 12h9M18 12v4M21 12v3" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  hand: '<svg viewBox="0 0 64 76" aria-hidden="true"><g fill="#fff" stroke="#2a2350" stroke-width="3.2" stroke-linejoin="round"><rect x="21" y="2" width="13" height="40" rx="6.5"/><rect x="32" y="25" width="12" height="20" rx="6"/><rect x="42" y="29" width="11" height="18" rx="5.5"/><path d="M15 36c0-5 3-8 7-8h26c5 0 8 3 8 8v12c0 14-9 24-22 24h-4c-10 0-15-7-17-15z"/><rect x="5" y="36" width="13" height="23" rx="6.5" transform="rotate(-28 11.5 47.5)"/></g><path d="M25 8v8" stroke="#ffd7e5" stroke-width="3" stroke-linecap="round"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5c.8 5.6 3.9 8.7 9.5 10.5-5.6 1.8-8.7 4.9-9.5 10.5-.8-5.6-3.9-8.7-9.5-10.5C8.1 10.2 11.2 7.1 12 1.5z" fill="currentColor"/></svg>',
  // station glyphs
  saw: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l2 2.6 3.2-.7.6 3.2 3 1.4-1.4 3 1.4 3-3 1.4-.6 3.2-3.2-.7-2 2.6-2-2.6-3.2.7-.6-3.2-3-1.4 1.4-3-1.4-3 3-1.4.6-3.2 3.2.7z" fill="currentColor"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg>',
  assembly: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15.5V12l2.5-4.5h9L18 11h2.5a1.5 1.5 0 0 1 1.5 1.5v3z" fill="currentColor"/><circle cx="7.5" cy="16.5" r="2.8" fill="currentColor" stroke="#fff" stroke-width="1.6"/><circle cx="17" cy="16.5" r="2.8" fill="currentColor" stroke="#fff" stroke-width="1.6"/><path d="M7 11l1.2-2.2h3.3V11z" fill="#fff"/></svg>',
  paint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c3.5 4.6 6.5 8.3 6.5 12a6.5 6.5 0 0 1-13 0c0-3.7 3-7.4 6.5-12z" fill="currentColor"/><path d="M9 15.5a3 3 0 0 0 2.5 3" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none"/></svg>',
  wrap: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="9" width="17" height="12" rx="2" fill="currentColor"/><rect x="2.5" y="7" width="19" height="4.5" rx="1.6" fill="currentColor" stroke="#fff" stroke-width="1.4"/><path d="M12 7v14" stroke="#fff" stroke-width="2.4"/><path d="M12 7C9 2.5 5.5 4.5 7.5 7M12 7c3-4.5 6.5-2.5 4.5 0" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>',
  cutter: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6.5" cy="17.5" r="3.2" fill="none" stroke="currentColor" stroke-width="2.6"/><circle cx="17.5" cy="17.5" r="3.2" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M8.6 15L18 3.5M15.4 15L6 3.5" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>',
  stuffing: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 19a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5-1.4A5.2 5.2 0 0 1 17.5 19z" fill="currentColor"/></svg>',
  stitching: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20L19 5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="19.5" cy="4.5" rx="1.6" ry="2.4" transform="rotate(45 19.5 4.5)" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19 5c-4 1-2 6-6 7s-3 6-8 6" stroke="currentColor" stroke-width="1.6" fill="none" stroke-dasharray="2.5 2"/></svg>',
  ribbon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 11C8 5 2.5 6 3.5 10.5S10 13 12 11zM12 11c4-6 9.5-5 8.5-.5S14 13 12 11z" fill="currentColor"/><path d="M11 11.5l-4 9 2.6-.8 1.5 2.3L12 13M13 11.5l4 9-2.6-.8-1.5 2.3L12 13" fill="currentColor"/><circle cx="12" cy="11.2" r="2.2" fill="currentColor" stroke="#fff" stroke-width="1.4"/></svg>',
};

export function icon(name, cls = '') {
  return el('span', 'ico ' + cls, { html: ICONS[name] || '' });
}

// A pool of reusable elements for floats/coins so we never create DOM per frame.
export function makePool(parent, cls, size) {
  const items = [];
  for (let i = 0; i < size; i++) {
    const e = el('div', cls);
    e.style.visibility = 'hidden';
    parent.appendChild(e);
    items.push({ e, busy: false, anim: null });
  }
  let next = 0;
  return {
    get() {
      for (let k = 0; k < items.length; k++) {
        const it = items[(next + k) % items.length];
        if (!it.busy) { next = (next + k + 1) % items.length; it.busy = true; it.e.style.visibility = 'visible'; return it; }
      }
      return null;
    },
    release(it) {
      it.busy = false;
      it.e.style.visibility = 'hidden';
      if (it.anim) { it.anim.cancel(); it.anim = null; }
    },
  };
}
