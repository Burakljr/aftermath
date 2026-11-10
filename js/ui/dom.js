// Small DOM helpers and the inline SVG icon set (our own simple drawings: flat shapes,
// soft shading, no heavy outlines, so they sit well next to the KayKit models).

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
export function setVar(e, name, v) {
  const key = '_v_' + name;
  if (e[key] !== v) { e[key] = v; e.style.setProperty(name, v); }
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

// Hold-to-repeat for buy buttons. press(first) returns true while repeating makes sense.
// Timing runs on the UI's dt (call update(dt) every frame), so tests can drive it.
// The repeat speeds up the longer the button is held.
export function makeHold(btn, press, { delay = 380, every = 140, fastest = 60 } = {}) {
  let holding = false;
  let wait = 0;
  let next = 0;
  let gap = every;
  btn.addEventListener('pointerdown', (ev) => {
    if (ev.button !== undefined && ev.button > 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    holding = !!press(true);
    wait = delay;
    next = 0;
    gap = every;
  });
  const stop = () => { holding = false; };
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointercancel', stop);
  btn.addEventListener('pointerleave', stop);
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  return {
    update(dt) {
      if (!holding) return;
      wait -= dt * 1000;
      if (wait > 0) return;
      next -= dt * 1000;
      if (next <= 0) {
        next = gap;
        gap = Math.max(fastest, gap * 0.9);
        if (!press(false)) holding = false;
      }
    },
    stop,
    get holding() { return holding; },
  };
}

export function icon(name, cls = '') {
  return el('span', 'ico ' + (cls || ''), { html: ICONS[name] || '' });
}

// ---------------------------------------------------------------- icons
const svg = (vb, body) => `<svg viewBox="0 0 ${vb} ${vb}" aria-hidden="true">${body}</svg>`;
const STAR = (cx, cy, r) => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.52 : r;
    d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(2) + ' ' + (cy + Math.sin(a) * rr).toFixed(2);
  }
  return d + 'Z';
};
const gearTeeth = Array.from({ length: 8 }, (_, k) =>
  `<rect x="10.4" y="1.4" width="3.2" height="5" rx="1.2" transform="rotate(${k * 45} 12 12)"/>`).join('');

// a mug (juice / cocoa): body colour, drink colour
const mug = (body, rim, drink, extra = '') => svg(32,
  `<ellipse cx="16" cy="28.4" rx="10" ry="2" fill="#000" opacity=".12"/>` +
  `<path d="M22.6 11.6h2.2a4.4 4.4 0 0 1 0 8.8h-2.2" fill="none" stroke="${rim}" stroke-width="2.8"/>` +
  `<path d="M7 9.4h16v14.8a3.8 3.8 0 0 1-3.8 3.8h-8.4A3.8 3.8 0 0 1 7 24.2z" fill="${body}"/>` +
  `<path d="M7 9.4h3.2v18.4A3.8 3.8 0 0 1 7 24.2z" fill="#fff" opacity=".28"/>` +
  `<rect x="6.2" y="7.6" width="17.6" height="3.6" rx="1.8" fill="${rim}"/>` +
  `<ellipse cx="15" cy="9.4" rx="7.2" ry="1.4" fill="${drink}"/>` + extra);
// a bowl: bowl colour, food colour, toppings
const bowl = (body, food, top) => svg(32,
  `<ellipse cx="16" cy="28.2" rx="11" ry="2" fill="#000" opacity=".12"/>` +
  `<ellipse cx="16" cy="14.6" rx="12.6" ry="3.8" fill="${food}"/>` + top +
  `<path d="M3.4 14.6h25.2c0 7-5.6 12.4-12.6 12.4S3.4 21.6 3.4 14.6z" fill="${body}"/>` +
  `<path d="M6.6 17.4c1.2 3.6 4 6 7.4 6.8" stroke="#fff" stroke-opacity=".35" stroke-width="2" stroke-linecap="round" fill="none"/>`);
// a burger: patty colour
const burger = (patty, leaf) => svg(32,
  `<ellipse cx="16" cy="28.4" rx="11.4" ry="2" fill="#000" opacity=".12"/>` +
  `<path d="M4.6 22.6h22.8v1.6a3.4 3.4 0 0 1-3.4 3.4H8a3.4 3.4 0 0 1-3.4-3.4z" fill="#E4A04E"/>` +
  `<rect x="4" y="18.4" width="24" height="4.6" rx="2.3" fill="${patty}"/>` +
  `<path d="M3.6 17.2c2-.2 2.6 1.6 4.4 1.6s2.4-1.6 4.2-1.6 2.4 1.6 4.2 1.6 2.4-1.6 4.2-1.6 2.4 1.6 4.2 1.6 2.2-1.4 3.6-1.6v-1.4H3.6z" fill="${leaf}"/>` +
  `<path d="M4.4 15.6C4.4 9 9.6 4.8 16 4.8S27.6 9 27.6 15.6z" fill="#F0AE55"/>` +
  `<path d="M7.6 12.4c.8-2.8 3.2-4.8 6.2-5.4" stroke="#FFD89A" stroke-width="2" stroke-linecap="round" fill="none"/>` +
  `<g fill="#FFF3D6"><ellipse cx="12" cy="10.4" rx="1" ry=".6"/><ellipse cx="17.6" cy="8.8" rx="1" ry=".6"/><ellipse cx="21.4" cy="11.6" rx="1" ry=".6"/><ellipse cx="15.6" cy="12.6" rx="1" ry=".6"/></g>`);

export const ICONS = {
  // ---------- dishes (32 px drawings)
  juice: mug('#E9B98A', '#C98950', '#FF9A1F', '<circle cx="19.6" cy="8.6" r="2.2" fill="#FFC23A"/><path d="M19.6 6.4v4.4" stroke="#F08A00" stroke-width=".8"/>'),
  cocoa: mug('#7FB3D9', '#4E86B4', '#7A4A2B', '<rect x="10" y="6.6" width="4" height="3.2" rx="1" fill="#fff"/><rect x="14.6" y="7" width="3.4" height="2.8" rx="1" fill="#FCEFE6"/>'),
  burger: burger('#8A4B2A', '#79C150'),
  veggieburger: burger('#7FAE45', '#A8D86A'),
  stew: bowl('#C9773F', '#9C5A2E', '<circle cx="11.6" cy="13.6" r="1.6" fill="#F28C28"/><circle cx="18.6" cy="14.4" r="1.6" fill="#F28C28"/><circle cx="15" cy="12.6" r="1.3" fill="#E8C27A"/><path d="M20.6 12.4l1.8-1.2" stroke="#6DBB4A" stroke-width="1.6" stroke-linecap="round"/>'),
  soup: bowl('#E7E2D6', '#F08442', '<circle cx="12" cy="13.8" r="1.3" fill="#FFF1C9"/><circle cx="19" cy="14" r="1.1" fill="#FFF1C9"/><path d="M14.6 12.8l2.2-.8" stroke="#6DBB4A" stroke-width="1.6" stroke-linecap="round"/>'),
  dinner: svg(32,
    '<ellipse cx="16" cy="27.6" rx="13" ry="2.2" fill="#000" opacity=".12"/>' +
    '<ellipse cx="16" cy="21.2" rx="14" ry="6" fill="#F3EEE6"/><ellipse cx="16" cy="20.6" rx="10.6" ry="4.2" fill="#E3DBCF"/>' +
    '<path d="M9.4 19.6c0-5.4 3.6-9.4 8-9.4 3.8 0 6.4 2.8 6.4 6.6 0 2.6-1.4 4.4-3.6 4.4H11.6c-1.4 0-2.2-.6-2.2-1.6z" fill="#C8743A"/>' +
    '<path d="M13 15.4c.8-2 2.4-3.4 4.4-3.8" stroke="#E6A066" stroke-width="2" stroke-linecap="round" fill="none"/>' +
    '<circle cx="23.6" cy="21.6" r="1.6" fill="#7DC352"/><circle cx="21.2" cy="22.6" r="1.4" fill="#7DC352"/><path d="M7.6 21.6l3.4-.6" stroke="#F28C28" stroke-width="2.2" stroke-linecap="round"/>'),

  // ---------- UI (24 px)
  coin: svg(24,
    '<circle cx="12" cy="12.8" r="10" fill="#E39410"/><circle cx="12" cy="11.6" r="10" fill="#FFC23A"/>' +
    '<circle cx="12" cy="11.6" r="6.8" fill="#FFD25E"/>' +
    `<path d="${STAR(12, 11.8, 3.8)}" fill="#F2A516"/>` +
    '<path d="M5.4 8.6a7.4 7.4 0 0 1 3.4-3.6" stroke="#FFF1C2" stroke-width="1.8" stroke-linecap="round" fill="none"/>'),
  star: svg(24, `<path d="${STAR(12, 12.8, 10.4)}" fill="#FFC23A"/><path d="${STAR(12, 12.8, 10.4)}" fill="none" stroke="#F0A419" stroke-width="1.4" stroke-linejoin="round"/><path d="M8.6 9.6l1.6-.4" stroke="#FFF1C2" stroke-width="1.6" stroke-linecap="round"/>`),
  starEmpty: svg(24, `<path d="${STAR(12, 12.8, 10.4)}" fill="#E6D7C1"/>`),
  gear: svg(24, `<g fill="currentColor">${gearTeeth}<circle cx="12" cy="12" r="7.4"/></g><circle cx="12" cy="12" r="3.1" fill="#fff"/>`),
  close: svg(24, '<path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>'),
  up: svg(24, '<path d="M12 4.4l7 7.4h-4.2v7.8H9.2v-7.8H5z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>'),
  lock: svg(24, '<path d="M8 10.6V8.2a4 4 0 0 1 8 0v2.4" fill="none" stroke="currentColor" stroke-width="2.4"/><rect x="5" y="10" width="14" height="11" rx="3" fill="currentColor"/><circle cx="12" cy="15.4" r="1.6" fill="#fff"/>'),
  check: svg(24, '<path d="M5 12.6l4.4 4.4L19 7.4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'),
  clock: svg(24, '<circle cx="12" cy="12" r="9" fill="currentColor"/><circle cx="12" cy="12" r="6.6" fill="#fff"/><path d="M12 8v4.2l2.8 1.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>'),
  bolt: svg(24, '<path d="M13.6 2.6L5.4 13.4h5.4l-1.2 8 8.2-10.8h-5.4z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>'),
  sound: svg(24, '<path d="M4 9.4h3.6L12.4 5v14l-4.8-4.4H4z" fill="currentColor"/><path d="M15.4 8.6a4.8 4.8 0 0 1 0 6.8M17.8 6.2a8.2 8.2 0 0 1 0 11.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>'),
  globe: svg(24, '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" stroke="currentColor" stroke-width="1.6" fill="none"/>'),
  monitor: svg(24, '<rect x="3" y="4.6" width="18" height="12" rx="2.4" fill="currentColor"/><rect x="5" y="6.6" width="14" height="8" rx="1.2" fill="#fff" opacity=".9"/><path d="M9 20h6M12 16.6V20" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
  gauge: svg(24, '<path d="M3.6 16.6a8.4 8.4 0 1 1 16.8 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M12 16.6l4.2-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="16.6" r="1.8" fill="currentColor"/>'),
  // menu
  upgrades: svg(24, '<rect x="2.6" y="2.6" width="18.8" height="18.8" rx="5.4" fill="#FFB347"/><path d="M12 6.4l5.4 5.8h-3.2v5.4H9.8v-5.4H6.6z" fill="#fff"/>'),
  goals: svg(24, '<rect x="4" y="3" width="16" height="19" rx="3.4" fill="#7CC4E8"/><rect x="8.4" y="1.6" width="7.2" height="3.6" rx="1.6" fill="#4F9DC6"/><path d="M7.6 11.4l2.2 2.2 4-4.2M7.8 17.4h8.4" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>'),
  places: svg(24, '<path d="M2.6 5.6l6-2.4 6.8 2.4 6-2.4v15.2l-6 2.4-6.8-2.4-6 2.4z" fill="#8BCB7A"/><path d="M8.6 3.2v15.2M15.4 5.6v15.2" stroke="#6AAE5B" stroke-width="1.6"/><path d="M12 7.4a3 3 0 0 1 3 3c0 2.2-3 5-3 5s-3-2.8-3-5a3 3 0 0 1 3-3z" fill="#FF7A59"/><circle cx="12" cy="10.4" r="1.1" fill="#fff"/>'),
  // restaurant purchases
  chef: svg(32, '<ellipse cx="16" cy="28.4" rx="9" ry="1.8" fill="#000" opacity=".12"/><rect x="9" y="18" width="14" height="8.4" rx="2" fill="#F1EADF"/><path d="M8.6 19.4c-3.2 0-5.2-2.4-5.2-5.2a5.2 5.2 0 0 1 6.6-5 6.4 6.4 0 0 1 12 0 5.2 5.2 0 0 1 6.6 5c0 2.8-2 5.2-5.2 5.2z" fill="#fff"/><path d="M10 23.4h12" stroke="#DCD2C4" stroke-width="1.6"/><path d="M8.6 12.6a3 3 0 0 1 2.4-2" stroke="#E9E2D8" stroke-width="1.6" stroke-linecap="round" fill="none"/>'),
  table: svg(32, '<ellipse cx="16" cy="28.6" rx="11" ry="2" fill="#000" opacity=".12"/><path d="M14.4 14h3.2v13h-3.2z" fill="#A86B3C"/><ellipse cx="16" cy="27" rx="6" ry="1.6" fill="#A86B3C"/><ellipse cx="16" cy="13.4" rx="13" ry="4.6" fill="#C98A52"/><ellipse cx="16" cy="12.4" rx="13" ry="4.6" fill="#E2A86C"/><ellipse cx="12.6" cy="11.4" rx="3.2" ry="1" fill="#F4C996"/>'),
  boot: svg(32, '<ellipse cx="16" cy="28.6" rx="11" ry="1.8" fill="#000" opacity=".12"/><path d="M9.4 3.6h9v13.2l7 3.2c1.8.8 2.6 2.2 2.6 4.2V27H5.4v-7.4c0-1.6.8-2.8 2.2-3.4l1.8-.8z" fill="#B97A45"/><path d="M5.4 24.4h22.6V27H5.4z" fill="#7C4E2A"/><path d="M9.4 7.6h9M9.4 11h9" stroke="#D69A60" stroke-width="1.8"/><path d="M28.6 10.4h-4.2M29 14.6h-3" stroke="#FFB347" stroke-width="2" stroke-linecap="round"/>'),
  // places
  inn: svg(48, '<ellipse cx="24" cy="43" rx="17" ry="2.6" fill="#000" opacity=".12"/><path d="M9 21h30v21H9z" fill="#F3DDB8"/><path d="M4.6 23L24 7.6 43.4 23z" fill="#D9643A"/><path d="M4.6 23L24 7.6 26.4 9.4 9.6 23z" fill="#E8835A"/><rect x="20" y="29" width="8" height="13" rx="4" fill="#9A6A43"/><rect x="12" y="27" width="5.6" height="5.6" rx="1.4" fill="#8FCBEA"/><rect x="30.4" y="27" width="5.6" height="5.6" rx="1.4" fill="#8FCBEA"/><rect x="31" y="9" width="4.4" height="8" fill="#B88C66"/>'),
  harbor: svg(48, '<ellipse cx="24" cy="43" rx="17" ry="2.6" fill="#000" opacity=".12"/><circle cx="24" cy="24" r="17" fill="#CFE7F2"/><circle cx="24" cy="11.6" r="3.4" fill="none" stroke="#3F6F8A" stroke-width="3"/><path d="M24 15v21M17 19.4h14M11.6 27.4c1 5.6 6 9.2 12.4 9.2s11.4-3.6 12.4-9.2" fill="none" stroke="#3F6F8A" stroke-width="3.4" stroke-linecap="round"/><path d="M9.4 26.6l2.6 2.6 2.4-3.2M38.6 26.6L36 29.2l-2.4-3.2" fill="none" stroke="#3F6F8A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'),
  forest: svg(48, '<ellipse cx="24" cy="43" rx="17" ry="2.6" fill="#000" opacity=".12"/><rect x="21.6" y="32" width="4.8" height="10" rx="1.2" fill="#9A6A43"/><path d="M24 4.6l12 15h-5.4l7.4 9.6H10l7.4-9.6H12z" fill="#6DB35E"/><path d="M24 4.6l12 15h-5.4l7.4 9.6H24z" fill="#5AA04D"/>'),
  castle: svg(48, '<ellipse cx="24" cy="43" rx="17" ry="2.6" fill="#000" opacity=".12"/><path d="M8 16h8v4h4v-4h8v4h4v-4h8v26H8z" fill="#C9C2D6"/><path d="M8 16h8v4h4v-4h3v26H8z" fill="#D9D3E4"/><rect x="20" y="30" width="8" height="12" rx="4" fill="#7C6E93"/><path d="M24 4v10" stroke="#7C6E93" stroke-width="2"/><path d="M24 4.4l7 2.6-7 2.6z" fill="#E8835A"/>'),
  // tutorial hand (64 x 76)
  hand: '<svg viewBox="0 0 64 76" aria-hidden="true"><g fill="#000" opacity=".18" transform="translate(3 5)"><rect x="21" y="2" width="13" height="40" rx="6.5"/><path d="M15 36c0-5 3-8 7-8h26c5 0 8 3 8 8v12c0 14-9 24-22 24h-4c-10 0-15-7-17-15z"/></g><g fill="#fff" stroke="#6B5644" stroke-width="2.6" stroke-linejoin="round"><rect x="21" y="2" width="13" height="40" rx="6.5"/><rect x="32" y="25" width="12" height="20" rx="6"/><rect x="42" y="29" width="11" height="18" rx="5.5"/><path d="M15 36c0-5 3-8 7-8h26c5 0 8 3 8 8v12c0 14-9 24-22 24h-4c-10 0-15-7-17-15z"/><rect x="5" y="36" width="13" height="23" rx="6.5" transform="rotate(-28 11.5 47.5)"/></g><path d="M25 8v8" stroke="#FFD9CC" stroke-width="3" stroke-linecap="round"/></svg>',
};

// dish id -> icon name (all dishes have their own drawing)
export function dishIcon(dish) {
  return ICONS[dish] ? dish : 'juice';
}
