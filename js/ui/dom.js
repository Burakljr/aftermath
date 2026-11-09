// Small DOM helpers and the inline SVG icon set (all drawn for this game:
// chunky flat shapes with a dark ink outline).

export const INK = '#2A1E3B';

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
export function makeHold(btn, press, { delay = 380, every = 110 } = {}) {
  let holding = false;
  let wait = 0;
  let next = 0;
  btn.addEventListener('pointerdown', (ev) => {
    if (ev.button !== undefined && ev.button > 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (btn.classList.contains('is-gone')) return;
    holding = !!press(true);
    wait = delay;
    next = 0;
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
        next = every;
        if (!press(false)) holding = false;
      }
    },
    stop,
    get holding() { return holding; },
  };
}

// ---------------------------------------------------------------- icons
// outlined(): every part is drawn twice, first as a fat ink silhouette, then filled,
// so overlapping parts share one clean outline.
function outlined(vb, parts, details = '', sw = 3.4) {
  const shapes = parts.map((p) => p[1]).join('');
  const fills = parts.map(([f, s]) => `<g fill="${f}">${s}</g>`).join('');
  return `<svg viewBox="0 0 ${vb} ${vb}" aria-hidden="true"><g fill="${INK}" stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round">${shapes}</g>${fills}${details}</svg>`;
}
const STAR_PATH = (cx, cy, r) => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.5 : r;
    d += (i ? 'L' : 'M') + (cx + Math.cos(a) * rr).toFixed(2) + ' ' + (cy + Math.sin(a) * rr).toFixed(2);
  }
  return d + 'Z';
};
export const STAR_D = STAR_PATH;
const gearTeeth = Array.from({ length: 8 }, (_, k) =>
  `<rect x="13.6" y="1.6" width="4.8" height="7.4" rx="1.6" transform="rotate(${k * 45} 16 16)"/>`).join('');
const sawTeeth = (() => {
  let d = '';
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = a0 + ((Math.PI * 2) / n) * 0.62;
    d += (i ? 'L' : 'M') + (12 + Math.cos(a0) * 7.4).toFixed(2) + ' ' + (12 + Math.sin(a0) * 7.4).toFixed(2);
    d += 'L' + (12 + Math.cos(a1) * 10.6).toFixed(2) + ' ' + (12 + Math.sin(a1) * 10.6).toFixed(2);
  }
  return d + 'Z';
})();
const CAR_BODY = '<path d="M2.6 16.4V12.6l2.6-5h9.2l3.6 4h2.4a1.6 1.6 0 0 1 1.6 1.6v3.2z"/>';
const CAR_WHEELS = '<circle cx="7.4" cy="17" r="2.9"/><circle cx="16.8" cy="17" r="2.9"/>';
const CAR_DETAIL = (glass) => `<path d="M7 11.4l1.3-2.3h3.6v2.3z" fill="${glass}"/><circle cx="7.4" cy="17" r="1.1" fill="#DDE2EE"/><circle cx="16.8" cy="17" r="1.1" fill="#DDE2EE"/>`;

export const ICONS = {
  coin: `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="17.6" r="13" fill="#E58E00" stroke="${INK}" stroke-width="2.8"/><circle cx="16" cy="15" r="13" fill="#FFB800" stroke="${INK}" stroke-width="2.8"/><circle cx="16" cy="15" r="9.2" fill="#FFC82E" stroke="#E08A00" stroke-width="1.8"/><path d="${STAR_PATH(16, 15.4, 5.6)}" fill="#FFE27A" stroke="#E08A00" stroke-width="1.2" stroke-linejoin="round"/><path d="M7.4 11.6a9.4 9.4 0 0 1 4.6-5.2" stroke="#FFF3BF" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>`,
  star: outlined(24, [['currentColor', `<path d="${STAR_PATH(12, 12.8, 10.4)}"/>`]], '<path d="M8.4 9.8l1.8-.4" stroke="#fff" stroke-opacity=".75" stroke-width="2" stroke-linecap="round"/>', 2.8),
  up: outlined(24, [['currentColor', '<path d="M12 2.6l8.6 9.2h-4.9v8.8H8.3v-8.8H3.4z"/>']], '<path d="M10.2 13.6v4.6" stroke="#fff" stroke-opacity=".55" stroke-width="1.8" stroke-linecap="round"/>', 3),
  lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.6 11V8.4a4.4 4.4 0 0 1 8.8 0V11" fill="none" stroke="${INK}" stroke-width="5.6" stroke-linecap="round"/><path d="M7.6 11V8.4a4.4 4.4 0 0 1 8.8 0V11" fill="none" stroke="#DDE2EE" stroke-width="2.2" stroke-linecap="round"/><rect x="4" y="10" width="16" height="12" rx="3.4" fill="currentColor" stroke="${INK}" stroke-width="2.6"/><path d="M12 14.2v3.4" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/><path d="M6.6 12.6h3" stroke="#fff" stroke-opacity=".6" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  gear: outlined(32, [['currentColor', `${gearTeeth}<circle cx="16" cy="16" r="10.2"/>`]], `<circle cx="16" cy="16" r="4.4" fill="#FFF4DC" stroke="${INK}" stroke-width="2.6"/><path d="M9.6 12.6a7 7 0 0 1 3-3.4" stroke="#fff" stroke-opacity=".6" stroke-width="2" stroke-linecap="round" fill="none"/>`, 3.6),
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 6.6l10.8 10.8M17.4 6.6L6.6 17.4" stroke="${INK}" stroke-width="7.4" stroke-linecap="round"/><path d="M6.6 6.6l10.8 10.8M17.4 6.6L6.6 17.4" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/></svg>`,
  bolt: outlined(24, [['currentColor', '<path d="M13.8 1.8L4.6 13.6h6.2L9.6 22.2l9.6-12.6h-6.2z"/>']], '', 2.8),
  clock: outlined(24, [['currentColor', '<circle cx="12" cy="12.4" r="10"/>'], ['#FFF4DC', '<circle cx="12" cy="12.4" r="6.8"/>']], `<path d="M12 8.4v4.2l2.8 1.8" stroke="${INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`, 2.6),
  moon: outlined(24, [['#FFE27A', '<path d="M14.6 2.6a9.4 9.4 0 1 0 6.8 14.2A7.8 7.8 0 0 1 14.6 2.6z"/>']], `<path d="${STAR_PATH(19.4, 5.4, 2.6)}" fill="#fff"/><circle cx="8.6" cy="11" r="1.3" fill="#F2C94C"/><circle cx="11.4" cy="16.4" r="1.7" fill="#F2C94C"/>`, 2.8),
  trophy: outlined(48, [
    ['#FFB800', '<path d="M12.6 10.6H6.4c-.4 7 3.4 11.6 9.6 12.4M35.4 10.6h6.2c.4 7-3.4 11.6-9.6 12.4" fill="none" stroke-width="4.4"/>'],
    ['#FFC82E', '<path d="M13 5h22v14a11 11 0 0 1-22 0z"/>'],
    ['#E89A00', '<rect x="20.4" y="29" width="7.2" height="6"/>'],
    ['#8A5CF6', '<rect x="12.6" y="34" width="22.8" height="9.4" rx="3"/>'],
  ], `<path d="M12.6 10.6H6.4c-.4 7 3.4 11.6 9.6 12.4M35.4 10.6h6.2c.4 7-3.4 11.6-9.6 12.4" fill="none" stroke="#FFB800" stroke-width="2.6" stroke-linecap="round"/><path d="${STAR_PATH(24, 15.4, 6)}" fill="#FFF3BF"/><path d="M17 8.4v8" stroke="#FFF3BF" stroke-width="2.4" stroke-linecap="round"/><rect x="16" y="37" width="16" height="3" rx="1.5" fill="#B596FF"/>`, 4),
  box: outlined(24, [['#FFB24D', '<path d="M3 8.2L12 4l9 4.2v9.6L12 22l-9-4.2z"/>']], `<path d="M12 12.4L21 8.2v9.6L12 22z" fill="#E58A1F" fill-opacity=".55"/><path d="M3 8.2L12 12.4l9-4.2M12 12.4V22" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linejoin="round"/>`, 2.8),
  rate: outlined(24, [['#FFB800', '<circle cx="9.6" cy="14.4" r="7.2"/>'], ['#36C657', '<path d="M17.6 2.2l5.2 5.6h-3v6.4h-4.4V7.8h-3z"/>']], `<path d="${STAR_PATH(9.6, 14.6, 3.6)}" fill="#FFE27A"/>`, 2.8),
  stars: outlined(24, [['#FFC82E', `<path d="${STAR_PATH(6.6, 14, 5.6)}"/><path d="${STAR_PATH(17.4, 14, 5.6)}"/>`], ['#FFE27A', `<path d="${STAR_PATH(12, 8.6, 6.6)}"/>`]], '', 2.6),
  key: outlined(24, [['#FFC82E', '<circle cx="7.6" cy="12" r="5.4"/><path d="M12 10.2h10v3.6h-2v3.4h-3.2v-3.4H12z"/>']], `<circle cx="7.6" cy="12" r="2" fill="${INK}"/>`, 2.8),
  check: outlined(24, [['currentColor', '<path d="M3.6 12.6l3.2-3.2 3.6 3.6 7-7 3.2 3.2L10.4 19.4z"/>']], '', 2.8),
  sparkle: outlined(24, [['currentColor', '<path d="M12 1.6c.9 5.2 3.6 8 9 9.6-5.4 1.6-8.1 4.4-9 9.6-.9-5.2-3.6-8-9-9.6 5.4-1.6 8.1-4.4 9-9.6z"/>']], '', 2.6),
  hand: `<svg viewBox="0 0 64 76" aria-hidden="true"><g fill="#fff" stroke="${INK}" stroke-width="4" stroke-linejoin="round"><rect x="21" y="2" width="13" height="40" rx="6.5"/><rect x="32" y="25" width="12" height="20" rx="6"/><rect x="42" y="29" width="11" height="18" rx="5.5"/><path d="M15 36c0-5 3-8 7-8h26c5 0 8 3 8 8v12c0 14-9 24-22 24h-4c-10 0-15-7-17-15z"/><rect x="5" y="36" width="13" height="23" rx="6.5" transform="rotate(-28 11.5 47.5)"/></g><path d="M25 8v8" stroke="#FFD2DD" stroke-width="3.2" stroke-linecap="round"/><path d="M22 60c3 4 7 6 12 6" stroke="#E9DCC4" stroke-width="3" stroke-linecap="round" fill="none"/></svg>`,
  // menu icons
  wrench: outlined(32, [
    ['#B7CDEB', '<g transform="rotate(45 16 16)"><path d="M18.6 2.6a7.2 7.2 0 1 1-5.2 0v6.2h5.2z"/><rect x="13.4" y="12" width="5.2" height="18" rx="2.6"/></g>'],
    ['#36C657', '<path d="M24 14.4l6.6 7h-3.8v7.2h-5.6v-7.2h-3.8z"/>'],
  ], '<path d="M8.6 7.2l2.6 2.6" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/><path d="M22.6 22.6v3.6" stroke="#fff" stroke-opacity=".6" stroke-width="1.8" stroke-linecap="round"/>', 3.6),
  target: outlined(32, [
    ['#FF4F7E', '<circle cx="14.6" cy="17.4" r="12.4"/>'],
    ['#fff', '<circle cx="14.6" cy="17.4" r="8.4"/>'],
    ['#FF4F7E', '<circle cx="14.6" cy="17.4" r="4.4"/>'],
  ], `<path d="M14.8 17.2L27 5" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/><path d="M25 3.2l1 4 4 1-3.4 3.2-4-1-1-4z" fill="#FFC82E" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M6.4 12.6a9.6 9.6 0 0 1 4-4.2" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round" fill="none"/>`, 3.4),
  factory: outlined(32, [
    ['#FFF4DC', '<path d="M3 29V15l7-4.6V15l7-4.6V15l7-4.6V29z"/>'],
    ['#FF8B1F', '<rect x="22.4" y="4" width="5.6" height="25" rx="1"/>'],
    ['#34A3FF', '<rect x="6.4" y="18.6" width="4.4" height="4.4" rx="1"/><rect x="13.6" y="18.6" width="4.4" height="4.4" rx="1"/>'],
    ['#FF4F7E', '<rect x="4" y="25.4" width="24" height="3.6" rx="1"/>'],
  ], '<path d="M23.8 7h2.8" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/>', 3.4),
  // station glyphs (white shapes with ink outlines, shown on coloured tiles)
  saw: outlined(24, [['#fff', `<path d="${sawTeeth}"/>`]], `<circle cx="12" cy="12" r="3.4" fill="#FFC82E" stroke="${INK}" stroke-width="1.8"/>`, 2.6),
  assembly: outlined(24, [['#fff', CAR_BODY], [INK, CAR_WHEELS]], CAR_DETAIL('#7CCBFF'), 2.6),
  paint: outlined(24, [['#fff', '<path d="M12 2.4c3.6 4.6 6.8 8.4 6.8 12.2a6.8 6.8 0 0 1-13.6 0c0-3.8 3.2-7.6 6.8-12.2z"/>']], '<path d="M9.2 15.4a3 3 0 0 0 2.4 3" stroke="#FF4F7E" stroke-width="2.2" stroke-linecap="round" fill="none"/>', 2.6),
  wrap: outlined(24, [['#fff', '<rect x="3.6" y="10" width="16.8" height="11" rx="1.6"/><rect x="2.4" y="7.2" width="19.2" height="4.6" rx="1.4"/><path d="M12 7.4C9 2.6 5.2 4.6 7.4 7.4zM12 7.4c3-4.8 6.8-2.8 4.6 0z"/>']], '<path d="M12 7.6v13.2" stroke="#FF4F7E" stroke-width="3"/>', 2.6),
  cutter: `<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="${INK}" stroke-width="5.4" stroke-linecap="round"><circle cx="6.6" cy="17.6" r="3.1"/><circle cx="17.4" cy="17.6" r="3.1"/><path d="M8.6 15L18 3.6M15.4 15L6 3.6"/></g><g fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="6.6" cy="17.6" r="3.1"/><circle cx="17.4" cy="17.6" r="3.1"/><path d="M8.6 15L18 3.6M15.4 15L6 3.6"/></g><circle cx="12" cy="10.4" r="1.4" fill="${INK}"/></svg>`,
  stuffing: outlined(24, [['#fff', '<path d="M6.4 19.2a4.6 4.6 0 0 1-.6-9.2 6.2 6.2 0 0 1 11.8-1.4 5.3 5.3 0 0 1 0 10.6z"/>']], '<path d="M7.6 13.4a2.4 2.4 0 0 1 2-2" stroke="#BFE4FF" stroke-width="1.8" stroke-linecap="round" fill="none"/>', 2.6),
  stitching: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20L19 5" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M4 20L19 5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="19.4" cy="4.6" rx="1.6" ry="2.6" transform="rotate(45 19.4 4.6)" fill="none" stroke="${INK}" stroke-width="1.6"/><path d="M19 5c-4 1-2 6-6 7s-3 6-8 6" stroke="#FF4F7E" stroke-width="2.2" fill="none" stroke-dasharray="2.6 2" stroke-linecap="round"/></svg>`,
  ribbon: outlined(24, [['#fff', '<path d="M12 11C8 5 2.4 6 3.4 10.6S10 13.2 12 11zM12 11c4-6 9.6-5 8.6-.4S14 13.2 12 11zM11 11.6l-4 9 2.6-.8 1.6 2.4L12 13zM13 11.6l4 9-2.6-.8-1.6 2.4L12 13z"/>'], ['#FF4F7E', '<circle cx="12" cy="11.2" r="2.4"/>']], '', 2.6),
  // factory medallions
  car: outlined(24, [['#FF4F7E', CAR_BODY], [INK, CAR_WHEELS]], CAR_DETAIL('#BFE4FF') + '<path d="M5 12.6h1.6" stroke="#fff" stroke-opacity=".7" stroke-width="1.4" stroke-linecap="round"/>', 2.6),
  bear: outlined(24, [['#C98B52', '<circle cx="5.6" cy="6.6" r="3.4"/><circle cx="18.4" cy="6.6" r="3.4"/><circle cx="12" cy="13.2" r="9"/>'], ['#FFE2BD', '<ellipse cx="12" cy="16.2" rx="4.4" ry="3.4"/>']], `<circle cx="8.6" cy="11.6" r="1.4" fill="${INK}"/><circle cx="15.4" cy="11.6" r="1.4" fill="${INK}"/><ellipse cx="12" cy="14.8" rx="1.8" ry="1.3" fill="${INK}"/><path d="M10.4 17.4q1.6 1.2 3.2 0" stroke="${INK}" stroke-width="1.2" fill="none" stroke-linecap="round"/><circle cx="5.6" cy="6.6" r="1.4" fill="#FFB3C7"/><circle cx="18.4" cy="6.6" r="1.4" fill="#FFB3C7"/>`, 2.6),
  globe: outlined(24, [['#34A3FF', '<circle cx="12" cy="12" r="9.8"/>']], `<path d="M2.6 12h18.8M12 2.4c-3.6 4.4-3.6 14.8 0 19.2M12 2.4c3.6 4.4 3.6 14.8 0 19.2M4.4 6.8h15.2M4.4 17.2h15.2" stroke="${INK}" stroke-width="1.7" fill="none"/><path d="M6 8.4a7 7 0 0 1 2.6-3" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round" fill="none"/>`, 2.6),
  speaker: outlined(24, [['#FF8B1F', '<path d="M3 9h4.4L13 4.2v15.6L7.4 15H3z"/>']], `<path d="M16 8.4a5 5 0 0 1 0 7.2M18.8 5.6a9 9 0 0 1 0 12.8" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`, 2.6),
  question: outlined(24, [['currentColor', '<circle cx="12" cy="12" r="9.6"/>']], `<path d="M9 9.4a3 3 0 1 1 4.4 2.7c-1 .5-1.4 1.1-1.4 2.1" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.6" fill="${INK}"/>`, 2.6),
};

export function icon(name, cls = '') {
  return el('span', 'ico ' + cls, { html: ICONS[name] || '' });
}

// Outlined text (white with a dark ink stroke under the fill).
export function otext(cls = '', text = '') {
  return el('span', 'ot ' + cls, { text });
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

// Station look shared by the card, the Upgrades list and the lab.
export const GLYPH = {
  saw: 'saw', assembly: 'assembly', paint: 'paint', wrap: 'wrap',
  cutter: 'cutter', stuffing: 'stuffing', stitching: 'stitching', ribbon: 'ribbon',
};
export const STATION_COLORS = ['#FF8B1F', '#34A3FF', '#FF4F7E', '#8A5CF6'];
export const FACTORY_GLYPH = { wood: 'car', teddy: 'bear' };
export const FACTORY_COLORS = { wood: '#FFC82E', teddy: '#FF9EC2' };
