// Aftermath v2 UI: district action sheet (DESIGN §5.4, UI-SPEC 4-cleanup). Street-plate title, stage stepper, three
// dispatch buttons with visible reasons, status + "Geri çağır (n)". Stays 150 ms after a dispatch, then closes.
import { h, icon, T, C, A, S, show, tap, keyed, bar, setBar, pulseClass, clear } from './dom.js';

const STAGES = [
  { kind: 'fire', name: 'Yangın', icon: 'g-flame', tone: 'c-yangin', bar: 'fire', type: 'fire' },
  { kind: 'rubble', name: 'Enkaz', icon: 'g-rubble', tone: 'c-enkaz', bar: 'rubble', type: 'debris' },
  { kind: 'carve', name: 'Kesim', icon: 'g-carcass', tone: 'c-kesim', bar: 'carve', type: 'carve' },
];
const CREW_ICON = { fire: 'g-firetruck', debris: 'g-excavator', carve: 'g-cleaver' };
const ORDER = ['fire', 'debris', 'carve'];
const HINT = 'Sıra hep aynı: yangın, enkaz, kesim.';

function splitVal(text) {
  // '%62' stays whole; '48 ton' -> ['48', 'ton']
  const m = /^([\d.,]+)\s+(.+)$/.exec(text || '');
  return m ? [m[1], m[2]] : [text || '', ''];
}

function dispatchButton(ctx, type, id) {
  const label = h('span.dispatch__label');
  const sub = h('span.dispatch__sub');
  const subIcon = icon('t-lock', 14);
  const subText = h('span');
  sub.append(subIcon, subText);
  const pips = h('span.pips');
  const count = h('span.num');
  const el = h('button.btn.dispatch', { type: 'button' },
    h('span.dispatch__icon', icon(CREW_ICON[type], 26)),
    h('span.dispatch__txt', label, sub),
    h('span.dispatch__count', pips, count));
  let model = null;
  let n = -1;
  tap(el, () => {
    if (!model) return;
    if (!model.enabled) {
      ctx.refuse(el, model.reason, false);
      return;
    }
    ctx.act('dispatch', { type, sector: id }, el);
  });
  return {
    el,
    set(m, primaryOK) {
      model = m;
      T(label, m.label);
      // one count only (playtest m8): the pips + "N hazır" carry it; the sub line is just the refusal reason
      T(subText, m.enabled ? '' : m.reason || m.sub || '');
      show(sub, !m.enabled);
      show(subIcon, !m.enabled);
      C(sub, 'reason', !m.enabled);
      A(el, 'aria-disabled', m.enabled ? null : 'true');
      C(el, 'primary', !!m.primary && m.enabled && primaryOK);
      A(el, 'data-key', `dispatch:${type}:${id}`);
      if (n !== m.total) {
        n = m.total;
        clear(pips);
        for (let i = 0; i < Math.min(8, m.total); i++) pips.appendChild(h('b'));
      }
      let i = 0;
      for (const p of pips.children) C(p, 'on', i++ < m.ready);
      T(count, `${m.ready} hazır`);
    },
  };
}

export function createDistrictSheet(ctx) {
  const el = h('div.sheet-slot.sheet-district.off');
  const box = h('div.sheet-box');
  el.appendChild(box);
  ctx.L.sheet.appendChild(el);
  let refs = null;

  function build(id) {
    return keyed(box, `d${id}`, () => {
      const plate = h('span.plate-sign.plate-sign--title', h('span', h('b.name')));
      const close = h('button.close', { type: 'button', 'aria-label': 'Kapat', 'data-key': 'closeSheet' }, h('span', icon('t-close', 18)));
      tap(close, () => ctx.closeSheet());
      const sub = h('div.subtitle');
      const stages = h('div.stages');
      const st = {};
      for (const d of STAGES) {
        const val = h('b.num');
        const unit = h('small');
        const note = h('span.stage__note');
        const b = bar(d.bar);
        const card = h('div.stage', h('div.stage__top', icon(d.icon, 18, d.tone), h('span', { text: d.name })), h('div.stage__val', val, unit), note, b);
        st[d.kind] = { card, val, unit, note, b };
        stages.appendChild(card);
      }
      const btns = {};
      const stack = h('div.stack');
      for (const type of ORDER) {
        btns[type] = dispatchButton(ctx, type, id);
        stack.appendChild(btns[type].el);
      }
      const status = h('span.sheet-status');
      const recall = h('button.btn.ghost.sm.recall', { type: 'button' }, icon('t-recall', 18), h('span'));
      tap(recall, () => ctx.act('recall', { sector: id }, recall));
      const warn = h('div.sheet-warn');
      box.append(h('div.grabber'), h('div.sheet-head', h('div', plate, sub), close), warn, stages, stack, h('div.sheet-foot', status, recall));
      return { plate, name: plate.querySelector('.name'), sub, st, btns, status, recall, warn };
    });
  }

  return {
    el,
    flash() {
      if (!refs) return;
      for (const t of ORDER) if (refs.btns[t].el.classList.contains('primary')) pulseClass(refs.btns[t].el, 'flash', 260);
    },
    update(s) {
      const id = ctx.view.sel;
      if (id == null) return;
      refs = build(id);
      const d = ctx.game.districtStatus(s, id);
      T(refs.name, d.name);
      T(refs.sub, d.loot || (d.rival ? d.status : HINT));
      for (const def of STAGES) {
        const r = refs.st[def.kind];
        const dot = d.dots.find((x) => x.kind === def.kind);
        const state = dot ? dot.state : 'absent';
        C(r.card, 'now', state === 'now');
        C(r.card, 'wait', state === 'pending');
        C(r.card, 'done', state === 'done');
        C(r.card, 'absent', state === 'absent');
        if (state === 'absent') {
          T(r.val, 'Yok');
          T(r.unit, '');
          T(r.note, '');
          setBar(r.b, 0);
        } else if (state === 'done') {
          T(r.val, 'Bitti');
          T(r.unit, '');
          T(r.note, '');
          setBar(r.b, 0);
        } else {
          const [v, u] = splitVal(d.values[def.kind]);
          T(r.val, v);
          T(r.unit, def.kind === 'fire' ? 'yanıyor' : u);
          T(r.note, def.kind === 'carve' && d.segNote ? d.segNote : '');
          const sec = s.sectors[id];
          const frac = def.kind === 'fire' ? (sec.fire0 > 0 ? sec.fire / sec.fire0 : 1)
            : def.kind === 'rubble' ? (sec.rubbleMax > 0 ? sec.rubble / sec.rubbleMax : 1)
              : (sec.corpseMax > 0 ? sec.corpse / sec.corpseMax : 1);
          setBar(r.b, frac);
          C(r.b, 'striped', def.kind !== 'fire' && d.paused);
        }
      }
      const ok = ctx.primaryOK();
      for (const t of ORDER) refs.btns[t].set(d.buttons[t], ok);
      T(refs.status, d.status || '');
      C(refs.status, 'live', d.workers > 0);
      show(refs.recall, !!d.recall);
      if (d.recall) T(refs.recall.lastChild, d.recall.label);
      // review 2 M4: the countdown belongs to the burning source (where the fire truck helps); the target shows the risk
      const w = d.spreading ? `${d.spreading.text} · ${Math.max(1, Math.ceil(d.spreading.t))} sn`
        : d.threatened ? `${d.threatened.risk} · ${Math.max(1, Math.ceil(d.threatened.t))} sn` : d.paused ? 'Yangın sıçradı, ekipler durdu' : '';
      T(refs.warn, w);
      show(refs.warn, !!w);
      S(el, '--x', '0');
    },
    onHide() {},
  };
}
