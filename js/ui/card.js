// Station card: a chunky bottom panel with a ribbon header, stats, the milestone
// bar and one big button (Upgrade or Open, hold to repeat).
import { el, icon, otext, setText, toggle, onTap, pulse, setStyle, setVar, makeHold, ICONS, GLYPH, STATION_COLORS } from './dom.js';
import { ribbon, closeButton } from './panel.js';
import { formatSeconds } from '../game/format.js';

const KINDS = ['orange', 'blue', 'berry', 'purple'];
const STAR = ICONS.star;

export function createCard(ctx) {
  const rb = ribbon('orange', 'card-title');
  const close = closeButton('card-close');

  const glyph = el('div', 'card-glyph');
  const lvTag = otext('card-lvtag num');
  const tile = el('div', 'card-tile', null, [glyph, lvTag]);
  const sub = el('div', 'card-sub');
  const stars = el('div', 'card-stars');
  for (let i = 0; i < 4; i++) stars.appendChild(el('span', 'star', { html: STAR }));
  const msText = el('span', 'ms-text');
  const msFill = el('div', 'ms-fill');
  const msEnd = el('span', 'ms-end', { html: STAR });
  const msBar = el('div', 'ms-bar', null, [msFill]);
  const ms = el('div', 'card-ms', null, [el('div', 'ms-track', null, [msBar, msEnd]), msText]);
  const desc = el('div', 'card-desc');
  const info = el('div', 'card-info', null, [el('div', 'card-subrow', null, [sub, stars]), ms, desc]);

  const valLabel = el('div', 'stat-label');
  const valNum = otext('stat-num num');
  const valGain = otext('stat-gain num');
  const statVal = el('div', 'stat', null, [valLabel, el('div', 'stat-row', null, [icon('coin', 'stat-coin'), valNum, valGain])]);
  const timeLabel = el('div', 'stat-label');
  const timeNum = otext('stat-num num');
  const timeGain = otext('stat-gain stat-gain-time num');
  const statTime = el('div', 'stat', null, [timeLabel, el('div', 'stat-row', null, [icon('bolt', 'stat-bolt'), timeNum, timeGain])]);
  const stats = el('div', 'card-stats', null, [statVal, statTime]);

  const hintText = el('span', 'card-hint-text');
  const hint = el('div', 'card-hint', null, [icon('clock', 'card-hint-ico'), hintText]);

  const btnLabel = otext('cbtn-label');
  const btnCost = otext('cbtn-cost num');
  const btnPrice = el('span', 'cbtn-price', null, [icon('coin', 'cbtn-coin'), btnCost]);
  const btn = el('button', 'cbtn b3 b3-green', { type: 'button' }, [btnLabel, btnPrice]);
  const need = el('div', 'card-need');

  const head = el('div', 'card-head', null, [tile, info]);
  const root = el('div', 'card sheet panel is-hidden', { role: 'dialog' }, [rb.root, close, head, stats, hint, btn, need]);
  ctx.layers.panels.appendChild(root);

  let station = null;   // id of the station shown
  let open = false;
  let lastLevel = -1;
  let lastReached = -1;

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
  const hold = makeHold(btn, press);

  onTap(close, () => { ctx.sfx('tap'); ctx.closeCard(); });
  root.addEventListener('pointerdown', (e) => e.stopPropagation());

  function relabel() {
    valLabel.textContent = ctx.tx('card.perToy');
    timeLabel.textContent = ctx.tx('card.time');
    close.setAttribute('aria-label', ctx.tx('card.close'));
    lastLevel = -1;
    for (const e of [rb.text, sub, desc, msText, hintText, btnLabel, need, valNum, valGain, timeNum, timeGain, btnCost, lvTag]) e._t = null;
  }

  function show(id) {
    station = id;
    lastLevel = -1;
    lastReached = -1;
    const cfg = ctx.game.config();
    const idx = Math.max(0, cfg.stations.findIndex((s) => s.id === id));
    glyph.innerHTML = ICONS[GLYPH[id]] || ICONS.star;
    setVar(root, '--glyph', STATION_COLORS[idx % STATION_COLORS.length]);
    rb.root.className = 'rb rb-' + KINDS[idx % KINDS.length];
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
    hold.stop();
    station = null;
    root.classList.add('is-closing');
    setTimeout(() => { if (!open) toggle(root, 'is-hidden', true); }, 180);
  }

  function update(dt) {
    if (!open) return;
    const v = view();
    if (!v) { hide(); return; }
    hold.update(dt);
    const lang = ctx.lang();
    rb.set(ctx.tx(v.nameKey));
    toggle(root, 'is-locked', !v.open);
    if (v.open) {
      setText(sub, ctx.tx('card.level', { n: v.level }));
      setText(lvTag, ctx.tx('mark.level', { n: v.level }));
      if (v.level !== lastLevel) {
        if (lastLevel > 0) { pulse(sub, 'pop'); pulse(tile, 'pop'); }
        lastLevel = v.level;
      }
      if (v.milestone.reached !== lastReached) {
        const kids = stars.children;
        for (let i = 0; i < 4; i++) {
          const on = i < v.milestone.reached;
          if (on && lastReached >= 0 && i >= lastReached) pulse(kids[i], 'star-pop');
          toggle(kids[i], 'on', on);
        }
        lastReached = v.milestone.reached;
      }
      setText(valNum, ctx.num(v.value));
      setText(valGain, '+' + ctx.num(v.nextValue - v.value));
      toggle(valGain, 'is-hidden', false);
      setText(timeNum, formatSeconds(v.time, lang));
      setText(timeGain, v.nextIsMilestone ? '→ ' + formatSeconds(v.nextTime, lang) : '');
      toggle(timeGain, 'is-hidden', !v.nextIsMilestone);
      if (v.milestone.next) {
        setText(msText, ctx.tx('card.milestone', { n: v.milestone.next }));
        setStyle(msFill, 'transform', `scaleX(${Math.max(0.04, v.milestone.ratio).toFixed(3)})`);
      } else {
        setText(msText, ctx.tx('card.milestoneTop'));
        setStyle(msFill, 'transform', 'scaleX(1)');
      }
      toggle(msEnd, 'on', !v.milestone.next);
      setText(hintText, ctx.tx('card.bottleneck'));
      toggle(hint, 'is-hidden', !v.bottleneck);
      setText(btnLabel, ctx.tx('card.upgrade'));
      setText(btnCost, ctx.num(v.cost));
      toggle(btn, 'is-gone', false);
    } else {
      lastLevel = -1;
      lastReached = -1;
      setText(sub, ctx.tx('card.newStation'));
      setText(lvTag, '');
      setText(desc, ctx.tx(v.nameKey + '.desc') + ' ' + ctx.tx('card.newStep'));
      setText(valNum, ctx.num(v.value));
      toggle(valGain, 'is-hidden', true);
      setText(timeNum, formatSeconds(v.time, lang));
      toggle(timeGain, 'is-hidden', true);
      if (v.locked) {
        const prev = ctx.game.config().stations[v.index - 1];
        setText(hintText, ctx.tx('card.lockedFirst', { station: ctx.tx(prev.nameKey + '.acc') }));
        toggle(hint, 'is-hidden', false);
        toggle(btn, 'is-gone', true);
      } else {
        toggle(hint, 'is-hidden', true);
        toggle(btn, 'is-gone', false);
        setText(btnLabel, ctx.tx('card.open'));
        setText(btnCost, ctx.num(v.openCost));
      }
    }
    toggle(hint, 'is-lock-hint', !v.open);
    const canPress = v.open ? v.canAfford : v.canOpen && v.canAfford;
    toggle(btn, 'is-disabled', !canPress);
    toggle(btn, 'is-ready', canPress);
    toggle(btn, 'is-open-btn', !v.open);
    toggle(btn, 'b3-yellow', !v.open);
    toggle(btn, 'b3-green', v.open);
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

// kept for older imports (lab pages)
export { GLYPH, STATION_COLORS };
