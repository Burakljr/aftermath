// Aftermath v2 UI: HUD (DESIGN §5.6, UI-SPEC §4). Max three numbers: cash, the phase timer, the objective progress.
import { h, icon, setIcon, T, C, S, tap, pulseClass, show } from './dom.js';
import { roller } from './motion.js';
import { on } from '../bus.js';

const CHIP_ICON = {
  radar: 't-radar', alarm: 't-alert', cagri: 't-phone', ihale: 't-gavel', teslim: 't-clock', gecikme: 't-hourglass', rival: 'g-broom', edildi: 't-check',
};

const NOTE = { ihale: 'Teklifini seç', cagri: 'Belediye arıyor' };

function splitMoney(text) {
  const m = /^(-?[\d.,]+)\s*(.*)$/.exec(text || '');
  return m ? [m[1], m[2]] : [text || '', ''];
}

export function createHud(ctx) {
  const { game } = ctx;
  const cashNum = h('span.cash__n.num');
  const cashUnit = h('small');
  const cash = h('div.plate.plate--cash.chamfer.chamfer-sm', icon('g-lira', 24, 'coin'), h('span.cash', cashNum, cashUnit));
  const tag = h('span.phase__tag');
  const pIcon = icon('t-radar', 18, 'phase__icon');
  const time = h('span.phase__time.num');
  const fill = h('i.zone__fill');
  const mark = h('i.zone__mark');
  const goldZ = h('i.zone.zone--gold');
  const okZ = h('i.zone.zone--ok');
  const pbar = h('span.phase__bar', goldZ, okZ, fill, mark);
  const chip = h('div.phase.chamfer.chamfer-sm', tag, pIcon, time, pbar);
  const gear = h('button.iconbtn.chamfer.chamfer-sm', { type: 'button', 'aria-label': 'Ayarlar', 'data-key': 'settings' }, icon('t-settings', 22));
  const root = h('div.hud', h('div.hud__wrap', cash), h('div.hud__wrap.hud__wrap--grow', chip), h('div.hud__wrap', gear));
  ctx.L.hud.appendChild(root);

  tap(gear, () => {
    ctx.view.settings = !ctx.view.settings;
    if (!ctx.view.settings) ctx.view.news = false;
    ctx.sfx('click');
    ctx.dirty = true;
  });

  const roll = roller(0, 700);
  let init = false;
  let shown = null;
  let kind = '';

  on('deadline-zone', ({ zone }) => {
    if (zone === 'gold-end') pulseClass(pbar, 'sparkle', 900);
  });

  function setCash(v) {
    const [n, u] = splitMoney(game.fmtMoney(v, true));
    T(cashNum, n);
    T(cashUnit, u);
  }

  return {
    el: root,
    cashEl: cash,
    update(s) {
      const v = game.hud(s);
      if (!init) {
        roll.jump(v.cash);
        setCash(v.cash);
        shown = v.cash;
        init = true;
      } else {
        const dir = roll.set(v.cash, ctx.now);
        if (dir) pulseClass(cash, dir > 0 ? 'gain' : 'spend', 700);
      }
      const c = v.chip;
      if (c.kind !== kind) {
        if (kind) chip.classList.remove(`phase--${kind}`);
        chip.classList.add(`phase--${c.kind}`);
        kind = c.kind;
        setIcon(pIcon, CHIP_ICON[c.kind] || 't-clock');
      }
      T(tag, c.label);
      const note = NOTE[c.kind] || (c.kind === 'radar' && !c.time ? 'Sinyal yok' : '');
      show(time, !!(c.time || note));
      T(time, c.time || note);
      C(time, 'phase__note', !c.time && !!note);
      show(pbar, c.kind !== 'ihale' && c.kind !== 'cagri' && c.kind !== 'alarm');
      const zones = c.gold != null;
      C(chip, 'phase--deadline', zones);
      show(goldZ, zones);
      show(okZ, zones);
      show(mark, zones);
      C(chip, 'warn', !!c.warn && (c.kind === 'teslim'));
      S(fill, 'width', `${(Math.max(0, Math.min(1, c.bar)) * 100).toFixed(1)}%`);
      if (zones) {
        S(goldZ, 'flex', String(c.gold * 100));
        S(okZ, 'flex', String((1 - c.gold) * 100));
        S(mark, 'left', `calc(${(Math.min(1, c.bar) * 100).toFixed(1)}% - 1px)`);
      }
      C(gear, 'is-dim', false);
    },
    frame(s, now) {
      if (!init) return;
      const v = roll.value(now);
      if (v !== shown) {
        shown = v;
        setCash(roll.busy(now) ? Math.round(v) : roll.target);
      }
    },
  };
}
