// Aftermath v2 UI: tiny DOM helpers (no framework). Writes are guarded so 10 Hz updates touch the DOM only on change.

const SVGNS = 'http://www.w3.org/2000/svg';

/** h('div.card.glass', { text, style, on:{click}, data:{id}, ...attrs }, ...children) */
export function h(sel, props, ...kids) {
  const parts = sel.split('.');
  const el = document.createElement(parts[0] || 'div');
  if (parts.length > 1) el.className = parts.slice(1).join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    kids.unshift(props);
    props = null;
  }
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = v;
      else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style') {
        if (typeof v === 'string') el.style.cssText = v;
        else for (const sk in v) el.style.setProperty(sk, v[sk]);
      } else if (k === 'on') for (const ev in v) el.addEventListener(ev, v[ev]);
      else if (k === 'data') for (const dk in v) el.dataset[dk] = v[dk];
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

/** <svg class="i i-20"><use href="#g-flame"/></svg> */
export function icon(id, size = 24, extra = '') {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', `i${size !== 24 ? ` i-${size}` : ''}${extra ? ` ${extra}` : ''}`);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVGNS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.appendChild(use);
  return svg;
}
export function setIcon(svg, id) {
  const use = svg.firstChild;
  if (use.getAttribute('href') !== `#${id}`) use.setAttribute('href', `#${id}`);
}

export function svgEl(tag, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

/** guarded writes */
export function T(el, v) {
  const s = v == null ? '' : String(v);
  if (el.__t !== s) {
    el.__t = s;
    el.textContent = s;
  }
}
export function C(el, name, on) {
  if (el.classList.contains(name) !== !!on) el.classList.toggle(name, !!on);
}
export function A(el, name, v) {
  if (v == null || v === false) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else {
    const s = v === true ? '' : String(v);
    if (el.getAttribute(name) !== s) el.setAttribute(name, s);
  }
}
export function S(el, prop, v) {
  if (el.__s === undefined) el.__s = {};
  if (el.__s[prop] !== v) {
    el.__s[prop] = v;
    el.style.setProperty(prop, v);
  }
}
export function show(el, on) {
  if (el.hidden === !!on) el.hidden = !on;
}

/** bar: <span class="bar fire"><i></i></span>; value 0..1 drives scaleX */
export function bar(kind = '') {
  return h(`span.bar${kind ? `.${kind}` : ''}`, h('i'));
}
export function setBar(el, v, kind) {
  const x = Math.max(0, Math.min(1, Number(v) || 0));
  S(el.firstChild, 'transform', `scaleX(${x.toFixed(3)})`);
  if (kind !== undefined && el.__k !== kind) {
    if (el.__k) el.classList.remove(el.__k);
    if (kind) el.classList.add(kind);
    el.__k = kind;
  }
}

/** restartable class animation (shake, flash, pop) */
export function pulseClass(el, name, ms = 400) {
  if (!el) return;
  el.classList.remove(name);
  void el.offsetWidth;
  el.classList.add(name);
  clearTimeout(el[`__${name}`]);
  el[`__${name}`] = setTimeout(() => el.classList.remove(name), ms);
}

export function shake(el) {
  pulseClass(el, 'shake', 220);
}

/** tap: click (keyboard + pointer), stops propagation so the canvas never sees UI taps */
export function tap(el, fn) {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    fn(e);
  });
  return el;
}

/**
 * Button with a stable shape: label, optional sub line, optional icon, primary / disabled-with-reason.
 * btn.set({ label, sub, primary, enabled, reason, key }) updates in place.
 */
export function button(opts = {}) {
  const el = h(`button.btn${opts.cls ? `.${opts.cls.split(' ').join('.')}` : ''}`, { type: 'button' });
  if (opts.icon) el.appendChild(icon(opts.icon, opts.iconSize || 20));
  const lbl = h('span.lbl');
  const main = h('span.main');
  const sub = h('small');
  const reason = h('span.reason');
  const rIcon = icon('t-lock', 14);
  const rText = h('span');
  reason.append(rIcon, rText);
  lbl.append(main, sub, reason);
  el.appendChild(lbl);
  el.__parts = { main, sub, reason, rText };
  el.set = (m) => setButton(el, m);
  if (opts.onTap) tap(el, (e) => opts.onTap(e, el));
  setButton(el, opts);
  return el;
}

export function setButton(el, m) {
  const p = el.__parts;
  if (m.label !== undefined) T(p.main, m.label);
  show(p.sub, !!m.sub);
  if (m.sub !== undefined) T(p.sub, m.sub || '');
  const enabled = m.enabled !== false;
  C(el, 'primary', !!m.primary && enabled);
  A(el, 'aria-disabled', enabled ? null : 'true');
  show(p.reason, !enabled);
  T(p.rText, enabled ? '' : m.reason || '');
  if (m.key !== undefined) A(el, 'data-key', m.key);
  el.__enabled = enabled;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** keyed rebuild: rebuilds the subtree only when the structural key changes */
export function keyed(container, key, build) {
  if (container.__key !== key) {
    container.__key = key;
    clear(container);
    container.__refs = build(container) || {};
  }
  return container.__refs;
}
