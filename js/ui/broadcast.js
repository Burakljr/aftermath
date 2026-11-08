// Aftermath v2 UI: attack broadcast (UI-SPEC 2-attack, ARCH §7.3). Letterbox 120 / 284 px, "CANLI · Körfez Haber" bug and
// clock, red grade + scanlines over the TV shot, lower third with hazard stripe, KAİJU ALARMI strap, D64 MAGMADON, one
// sentence, three facts; "Tahmini düşüş" tracking label; "Geç" pill (not on the first attack). Timing from s.attack.t.
import { h, icon, T, C, S, show, tap } from './dom.js';

export function createBroadcast(ctx) {
  const { game } = ctx;
  const clock = h('span.num');
  const line = h('p.lower__line');
  const fDrop = h('dd');
  const title = h('div.lower__title', { text: 'MAGMADON' });
  const skip = h('button.bc-skip', { type: 'button', 'data-key': 'skipAttack' }, 'Geç', icon('t-skip', 16));
  tap(skip, () => ctx.act('skipAttack', null, skip));
  const track = h('div.bc-track', h('i'), h('span', { text: 'Tahmini düşüş' }), h('b'));
  const flash = h('div.bc-flash');
  const lower = h('div.lower',
    h('div.hazard'),
    h('div.lower__body',
      h('div.lower__strap', h('span.lower__kicker', icon('t-alert', 16), 'KAİJU ALARMI'), h('span.lower__src', { text: 'Körfez Haber' })),
      title, line,
      h('dl.facts',
        h('div.fact', h('dt', { text: 'Sınıf' }), h('dd', { text: game.MONSTERS.magmadon.title })),
        h('div.fact', h('dt', { text: 'Risk' }), h('dd.risk', { text: 'Yangın' })),
        h('div.fact', h('dt', { text: 'Tahmini düşüş' }), fDrop))));
  const root = h('div.bc',
    h('div.bc-grade'), h('div.bc-scan'),
    h('div.letter.letter--top', h('div.bug', h('span.bug__live', { text: 'CANLI' }), h('span.bug__ch', { text: 'Körfez Haber' })), h('div.bc-clock', icon('t-clock', 16), clock)),
    h('div.letter.letter--bot', lower, skip),
    track, flash);
  ctx.L.broadcast.appendChild(root);

  const P = { x: 0, y: 0, visible: false };
  let on = false;
  let stage = '';
  let flashed = -1;
  let dropId = null;

  function sentence(a) {
    const TL = game.ATTACK.TL;
    if (a.mutant) return 'Uzmanlar gelen canavarın rengini doğal bulmuyor.';
    if (a.t < TL.robot) return 'Magmadon Liman açıklarında. Kıyı boşaltılıyor.';
    if (a.t < TL.cut) return 'KALKAN-07 sahada. Canavarı şehrin dışına itmeye çalışıyor.';
    return 'Canavar devriliyor. Temizlik ekipleri hazırda beklesin.';
  }

  return {
    update(s) {
      const a = s.phase === 'attack' ? s.attack : null;
      const now = !!a;
      if (now !== on) {
        on = now;
        C(root, 'on', on);
        if (!on) stage = '';
      }
      if (!a) return;
      const TL = game.ATTACK.TL;
      const st = a.t < TL.cut ? 'tv' : a.t < a.end - 0.6 ? 'fall' : 'open';
      if (st !== stage) {
        stage = st;
        root.dataset.stage = st;
      }
      const base = 19 * 60 + 42 + Math.floor((s.clock || 0) / 60);
      T(clock, `${String(Math.floor(base / 60) % 24).padStart(2, '0')}:${String(base % 60).padStart(2, '0')}`);
      T(line, sentence(a));
      dropId = a.chain && a.chain.length ? a.chain[0] : null;
      T(fDrop, dropId != null ? game.DISTRICTS[dropId].name : 'Bilinmiyor');
      T(track.lastChild, dropId != null ? game.DISTRICTS[dropId].name : '');
      show(skip, !a.first);
      C(root, 'mutant', !!a.mutant);
      if (a.hit && flashed !== a.n) {
        flashed = a.n;
        flash.classList.remove('go');
        void flash.offsetWidth;
        flash.classList.add('go');
      }
    },
    frame(s) {
      if (!on || dropId == null) return;
      ctx.project(`district:${dropId}`, P);
      const vis = P.visible && stage !== 'open';
      C(track, 'show', vis);
      if (vis) S(track, 'transform', `translate3d(${P.x.toFixed(1)}px,${P.y.toFixed(1)}px,0)`);
    },
  };
}
