// Station card: a bottom sheet with one big button (Upgrade or Open).
import { el, icon, setText, toggle, onTap, pulse, setStyle } from './dom.js';
import { formatSeconds } from '../game/format.js';

const HOLD_DELAY = 380;   // ms before hold-to-repeat starts
const HOLD_EVERY = 110;   // ms between repeated upgrades

export function createCard(ctx) {
  const glyph = el('div', 'card-glyph');
  const title = el('div', 'card-title');
  const sub = el('div', 'card-sub');
  const stars = el('div', 'card-stars');
  const close = el('button', 'card-close btn-round', { type: 'button' }, [icon('close')]);

  const desc = el('div', 'card-desc');

  const valLabel = el('div', 'stat-label');
  const valNum = el('span', 'stat-num num');
  const valGain = el('span', 'stat-gain num');
  const statVal = el('div', 'stat', null, [valLabel, el('div', 'stat-row', null, [icon('coin', 'stat-coin'), valNum, valGain])]);
  const timeLabel = el('div', 'stat-label');
  const timeNum = el('span', 'stat-num num');
  const timeGain = el('span', 'stat-gain num');
  const statTime = el('div', 'stat', null, [timeLabel, el('div', 'stat-row', null, [icon('bolt', 'stat-bolt'), timeNum, timeGain])]);
  const stats = el('div', 'card-stats', null, [statVal, statTime]);

  const msText = el('span', 'ms-text');
  const msFill = el('div', 'ms-fill');
  const msBar = el('div', 'ms-bar', null, [msFill]);
  const ms = el('div', 'card-ms', null, [el('div', 'ms-head', null, [icon('star', 'ms-star'), msText]), msBar]);

  const hint = el('div', 'card-hint');

  const btnLabel = el('span', 'cbtn-label');
  const btnCost = el('span', 'cbtn-cost num');
  const btnPrice = el('span', 'cbtn-price', null, [icon('coin', 'cbtn-coin'), btnCost]);
  const btn = el('button', 'cbtn', { type: 'button' }, [btnLabel, btnPrice]);
  const need = el('div', 'card-need');

  const head = el('div', 'card-head', null, [glyph, el('div', 'card-titles', null, [title, el('div', 'card-subrow', null, [sub, stars])]), close]);
  const body = el('div', 'card-body', null, [head, desc, stats, ms, hint, btn, need]);
  const root = el('div', 'card sheet is-hidden', { role: 'dialog' }, [body]);
  ctx.layers.panels.appendChild(root);

  let station = null;   // id of the station shown
  let open = false;
  let holdTimer = 0;
  let holdNext = 0;
  let holding = false;
  let lastLevel = -1;

  function view() { return station ? ctx.game.select.stationView(station) : null; }

  function press() {
    const v = view();
    if (!v) return false;
    if (v.open) {
      const r = ctx.game.act({ type: 'upgrade', station: v.id });
      if (r.ok) { pulse(btn, 'press'); return true; }
      ctx.sfx('nope');
      pulse(need, 'shake');
      return false;
    }
    if (v.canOpen) {
      const r = ctx.game.act({ type: 'open', station: v.id });
      if (r.ok) { ctx.closeCard(); return false; }
      ctx.sfx('nope');
      pulse(need, 'shake');
    }
    return false;
  }

  btn.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (btn.classList.contains('is-gone')) return;
    holding = press();
    holdTimer = HOLD_DELAY;
    holdNext = 0;
  });
  const stopHold = () => { holding = false; };
  btn.addEventListener('pointerup', stopHold);
  btn.addEventListener('pointercancel', stopHold);
  btn.addEventListener('pointerleave', stopHold);
  btn.addEventListener('click', (e) => e.preventDefault());

  onTap(close, () => { ctx.sfx('tap'); ctx.closeCard(); });
  root.addEventListener('pointerdown', (e) => e.stopPropagation());

  function relabel() {
    valLabel.textContent = ctx.tx('card.perToy');
    timeLabel.textContent = ctx.tx('card.time');
    close.setAttribute('aria-label', ctx.tx('card.close'));
    lastLevel = -1;
    for (const e of [title, sub, desc, msText, hint, btnLabel, need, valNum, valGain, timeNum, timeGain, btnCost]) e._t = null;
  }

  function show(id) {
    station = id;
    lastLevel = -1;
    const cfg = ctx.game.config();
    const sc = cfg.stations.find((s) => s.id === id);
    glyph.innerHTML = '';
    glyph.appendChild(icon(id in GLYPH ? GLYPH[id] : 'star'));
    glyph.style.setProperty('--glyph', STATION_COLORS[cfg.stations.indexOf(sc) % STATION_COLORS.length]);
    if (!open) {
      open = true;
      toggle(root, 'is-hidden', false);
      root.classList.remove('is-closing');
      pulse(root, 'is-opening');
    }
    update(0);
  }

  function hide() {
    if (!open) return;
    open = false;
    holding = false;
    station = null;
    root.classList.add('is-closing');
    setTimeout(() => { if (!open) toggle(root, 'is-hidden', true); }, 180);
  }

  function update(dt) {
    if (!open) return;
    const v = view();
    if (!v) { hide(); return; }
    // hold-to-repeat
    if (holding) {
      holdTimer -= dt * 1000;
      if (holdTimer <= 0) {
        holdNext -= dt * 1000;
        if (holdNext <= 0) {
          holdNext = HOLD_EVERY;
          if (!press()) holding = false;
        }
      }
    }
    const lang = ctx.lang();
    setText(title, ctx.tx(v.nameKey));
    toggle(root, 'is-locked', !v.open);
    if (v.open) {
      setText(sub, ctx.tx('card.level', { n: v.level }));
      if (v.level !== lastLevel) {
        if (lastLevel > 0) pulse(sub, 'pop');
        lastLevel = v.level;
        let html = '';
        for (let i = 0; i < 4; i++) html += `<span class="star${i < v.milestone.reached ? ' on' : ''}">${STAR}</span>`;
        stars.innerHTML = html;
      }
      toggle(desc, 'is-hidden', true);
      setText(valNum, ctx.num(v.value));
      setText(valGain, '+' + ctx.num(v.nextValue - v.value));
      setText(timeNum, formatSeconds(v.time, lang));
      setText(timeGain, v.nextIsMilestone ? formatSeconds(v.nextTime, lang) : '');
      toggle(timeGain, 'is-hidden', !v.nextIsMilestone);
      toggle(ms, 'is-hidden', false);
      if (v.milestone.next) {
        setText(msText, ctx.tx('card.milestone', { n: v.milestone.next }));
        setStyle(msFill, 'transform', `scaleX(${Math.max(0.04, v.milestone.ratio).toFixed(3)})`);
      } else {
        setText(msText, ctx.tx('card.milestoneTop'));
        setStyle(msFill, 'transform', 'scaleX(1)');
      }
      setText(hint, ctx.tx('card.bottleneck'));
      toggle(hint, 'is-hidden', !v.bottleneck);
      setText(btnLabel, ctx.tx('card.upgrade'));
      setText(btnCost, ctx.num(v.cost));
      toggle(btn, 'is-gone', false);
    } else {
      setText(sub, ctx.tx('card.newStep'));
      stars.innerHTML = '';
      lastLevel = -1;
      setText(desc, ctx.tx(v.nameKey + '.desc'));
      toggle(desc, 'is-hidden', false);
      setText(valNum, ctx.num(v.value));
      setText(valGain, '');
      setText(timeNum, formatSeconds(v.time, lang));
      toggle(timeGain, 'is-hidden', true);
      toggle(ms, 'is-hidden', true);
      if (v.locked) {
        const prev = ctx.game.config().stations[v.index - 1];
        setText(hint, ctx.tx('card.lockedFirst', { station: ctx.tx(prev.nameKey + '.acc') }));
        toggle(hint, 'is-hidden', false);
        toggle(btn, 'is-gone', true);
      } else {
        toggle(hint, 'is-hidden', true);
        toggle(btn, 'is-gone', false);
        setText(btnLabel, ctx.tx('card.open'));
        setText(btnCost, ctx.num(v.openCost));
      }
    }
    const canPress = v.open ? v.canAfford : v.canOpen && v.canAfford;
    toggle(btn, 'is-disabled', !canPress);
    toggle(btn, 'is-open-btn', !v.open);
    const showNeed = !canPress && !(v.locked && !v.open);
    toggle(need, 'is-hidden', !showNeed);
    if (showNeed) setText(need, ctx.tx('card.need', { n: ctx.num(Math.ceil(v.missing)) }));
  }

  return {
    root, show, hide, update, relabel,
    isOpen: () => open,
    station: () => station,
    button: () => btn,
  };
}

const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.2l3 6.2 6.8.9-5 4.7 1.3 6.7L12 17.5l-6.1 3.2 1.3-6.7-5-4.7 6.8-.9z"/></svg>';

export const GLYPH = {
  saw: 'saw', assembly: 'assembly', paint: 'paint', wrap: 'wrap',
  cutter: 'cutter', stuffing: 'stuffing', stitching: 'stitching', ribbon: 'ribbon',
};
export const STATION_COLORS = ['#ff8a3d', '#4cb8ff', '#ff5fa2', '#8b6cff'];
