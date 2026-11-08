// Aftermath v2 UI: NPC card (DESIGN §3 principle 2). Bottom-left above the panel, max 2 lines, auto-hides when the
// logic's npc.until passes (about 4 s) or on tap. Nevin speaks formally, Rıza casually; the copy comes from logic.
import { h, T, C, tap } from './dom.js';

export function createNpc(ctx) {
  const av = h('div.avatar');
  const who = h('div.npc__who');
  const line = h('div.npc__line');
  const card = h('button.npc.glass', { type: 'button' }, av, h('div', who, line));
  ctx.L.bubble.appendChild(card);
  let dismissed = '';
  let shown = '';
  tap(card, () => {
    dismissed = shown;
    C(card, 'on', false);
  });
  return {
    update(s) {
      const n = s.phase === 'attack' || ctx.view.title ? null : ctx.game.npcCard(s);
      const key = n ? `${n.who}|${n.text}` : '';
      const PAGES = ctx.activeSheet === 'depot' || ctx.activeSheet === 'factory' || ctx.activeSheet === 'company';
      const sheetBlocks = !!ctx.activeSheet && ctx.activeSheet !== 'district' && !PAGES;
      C(card, 'top', PAGES);
      const on = !!n && key !== dismissed && !ctx.modal && !sheetBlocks;
      if (n && key !== shown) {
        shown = key;
        T(av, n.initials);
        C(av, 'riza', n.who === 'riza');
        T(who, n.name);
        T(line, n.text);
      }
      C(card, 'on', on);
      card.style.setProperty('--npc-bottom', `${ctx.band.bottom}px`);
    },
  };
}
