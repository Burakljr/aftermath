// Aftermath v2 UI: bottom panel by phase (DESIGN §5.7).
// calm: radar card + one suggestion card (+ "Sıradaki işe geç" after G4) · call: call card · contract: fleet strip +
// contract line · rival: "Kuyruk sende" card + fleet strip · attack / tender sheet / any open sheet: hidden.
import { h, icon, T, C, S, show, button, tap, keyed, bar, setBar, clear } from './dom.js';
import { createFleetStrip } from './fleet-strip.js';
import { createCall } from './call.js';

const ITEM_ICON = { scale: 'g-scale', blood: 'g-magma', bone: 'g-bone', eye: 'g-eye', armor: 'g-armor', cell: 'g-cell', concrete: 'g-bonecrete', relic: 'g-relic', dna: 't-dna' };
export { ITEM_ICON };

export function createPanel(ctx) {
  const { game } = ctx;
  const root = h('div.panel');
  ctx.L.panel.appendChild(root);

  // ---- calm dock ----
  const blip = h('i.radar__blip');
  const nextName = h('div.next__name');
  const nextLine = h('div.next__meta');
  const loot = h('div.next__loot', h('span', { text: 'Çıkacak' }));
  const skip = button({ cls: 'ghost sm', icon: 't-skip', iconSize: 18, onTap: (e, b) => ctx.act('skipRadar', null, b) });
  const next = h('div.card.next.glass',
    h('div.radar', blip),
    h('div.next__body', h('div.kicker', { text: 'Sıradaki iş' }), nextName, nextLine, loot),
    skip);
  const taskTitle = h('div.task__title');
  const taskText = h('div.task__text');
  const taskBtn = button({ onTap: (e, b) => runSuggestion(b) });
  taskBtn.classList.add('sm');
  const task = h('div.card.task.glass', h('div.task__body', taskTitle, taskText), taskBtn);
  const dock = h('div.dock', next, task);
  let lootKey = '';
  let sugg = null;

  function runSuggestion(b) {
    if (!sugg) return;
    const a = sugg.action;
    if (a.id === 'openTab') {
      ctx.openTab(a.arg.tab);
      return;
    }
    const r = ctx.act(a.id, a.arg, b);
    if (r.ok && (a.id === 'sellAll' || a.id === 'buyVehicle')) ctx.fx.coinsFrom(b, a.id === 'sellAll' ? 'in' : 'out');
  }

  // ---- call ----
  const call = createCall(ctx);

  // ---- contract ----
  const strip = createFleetStrip(ctx);
  const cLine = h('span.cline__text');
  const cHint = h('span.cline__hint', icon('t-hand', 16), h('span', { text: 'Gönderilecek bölgeye dokun' }));
  const cancel = h('button.cline__cancel', { type: 'button' }, icon('t-close', 16), 'Vazgeç');
  tap(cancel, () => ctx.setAccept(null));
  const contract = h('div.contract', strip.el, h('div.cline', icon('g-lira', 18, 'c-sinyal'), cLine, cHint, cancel));

  // ---- rival ----
  const rv = {};
  const rival = h('div.card.rivalcard.glass');
  keyed(rival, 'r', (box) => {
    rv.tail = h('span.rivalcard__tail');
    rv.bar = bar('carve');
    rv.ton = h('span.num');
    rv.rbar = bar();
    rv.rbar.classList.add('rakip');
    rv.release = button({ cls: 'ghost sm', onTap: (e, b) => ctx.act('releaseTail', null, b) });
    box.append(
      h('div.rivalcard__head', icon('g-carcass', 22, 'c-kesim'), h('div', h('div.rivalcard__title', { text: 'Kuyruk sende' }), h('div.kicker', { text: 'Ücret yok, parçalar senin.' }))),
      h('div.rivalcard__row', rv.tail, rv.ton), rv.bar,
      h('div.rivalcard__row.rival-line', h('span', icon('g-broom', 16, 'c-rakip'), 'Süpürge Holding'), h('span.kicker', { text: 'çalışıyor' })), rv.rbar,
      rv.release);
  });

  root.append(dock, call.el, contract, rival);
  let mode = null;

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    show(dock, m === 'calm');
    show(call.el, m === 'call');
    show(contract, m === 'contract' || m === 'rival');
    show(rival, m === 'rival');
    C(root, 'off', !m);
    root.dataset.mode = m;
    if (m) {
      root.classList.remove('enter');
      void root.offsetWidth;
      root.classList.add('enter');
    }
  }

  return {
    el: root,
    update(s) {
      let m = '';
      const sheetOpen = !!ctx.activeSheet;
      if (!sheetOpen && !ctx.view.title) {
        if (s.phase === 'calm' && !s.result) m = 'calm';
        else if (s.phase === 'tender' && s.tender && s.tender.kind === 'call') m = 'call';
        else if (s.phase === 'cleanup') m = 'contract';
        else if (s.phase === 'rival') m = 'rival';
      }
      setMode(m);
      if (m === 'calm') {
        const n = game.nextCard(s);
        T(nextName, n.monster);
        T(nextLine, n.line);
        C(next, 'mutant', n.mutant);
        const k = n.loot.join(',');
        if (k !== lootKey) {
          lootKey = k;
          while (loot.children.length > 1) loot.lastChild.remove();
          for (const it of n.loot) loot.appendChild(icon(ITEM_ICON[it], 16));
        }
        const prog = s.timerMax > 0 ? Math.max(0, Math.min(1, 1 - s.timer / s.timerMax)) : 0;
        S(blip, '--p', prog.toFixed(3));
        C(next, 'idle', !n.etaText);
        show(skip, !!n.skip);
        if (n.skip) skip.set({ label: n.skip.label, key: 'skipRadar' });
        sugg = game.suggestion(s);
        show(task, !!sugg);
        if (sugg) {
          T(taskTitle, sugg.title);
          T(taskText, sugg.text);
          const key = sugg.action.id === 'openTab' ? `tab:${sugg.action.arg.tab}` : sugg.action.id;
          taskBtn.set({ label: sugg.button, primary: ctx.primaryOK(), key });
        }
      } else if (m === 'call') {
        call.update(s);
      } else if (m === 'contract' || m === 'rival') {
        strip.update(s);
        const cl = game.contractLine(s);
        T(cLine, cl ? cl.text : '');
        show(cLine, !!cl && !ctx.view.accept);
        show(cLine.parentElement, !!cl || !!ctx.view.accept);
        show(cHint, !!ctx.view.accept);
        show(cancel, !!ctx.view.accept);
        if (m === 'rival') {
          const r = game.rivalCard(s);
          if (r) {
            T(rv.tail, r.tailName || '');
            T(rv.ton, r.text || '');
            setBar(rv.bar, r.bar);
            setBar(rv.rbar, r.rival.bar);
            show(rv.release, !!r.release);
            if (r.release) rv.release.set({ label: r.release.label, key: 'releaseTail' });
          }
        }
      }
      void clear;
    },
  };
}
