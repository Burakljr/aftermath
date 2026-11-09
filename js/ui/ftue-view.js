// Aftermath v2 UI: FTUE presentation (DESIGN §3). One highlighted action: the target gets data-ftue-target and the
// single ready pulse; non-allowed UI dims to 40 % and ignores taps; a pointer bubble (<= 12 words) sits over the
// district (scene.project) or the tab; a spotlight veil darkens the city around the highlighted district.
// Also: the one-shot HUD tip "Altın bölgede bitirirsen %25 prim." and the idle pointer of contracts #2+.
import { h, icon, T, C, S, tap } from './dom.js';
import { centre } from './motion.js';
import { on } from '../bus.js';

export function createFtueView(ctx) {
  const { game } = ctx;
  const txt = h('span');
  const bubble = h('div.pbubble', icon('t-hand', 18), txt);
  ctx.L.bubble.appendChild(bubble);
  const veil = h('div.spot');
  ctx.L.ftuedim.appendChild(veil);
  const tipTxt = h('span');
  const tip = h('button.hudtip', { type: 'button' }, tipTxt, icon('t-close', 14));
  ctx.L.bubble.appendChild(tip);
  tap(tip, () => ctx.act('tip', { key: 'zones' }, tip));
  // one-shot (DESIGN §3): the tip is acknowledged after 4 s on screen or at the first dispatch, so it never returns
  let tipSince = -1;
  const ackTip = () => {
    if (tipSince >= 0 && ctx.s && !ctx.s.progress.tips.zones) ctx.act('tip', { key: 'zones' }, null);
    tipSince = -1;
  };
  on('dispatch', ackTip);

  const P = { x: 0, y: 0, visible: false };
  let pulseRef = null;
  let anchor = null; // { kind:'district', id } | { kind:'el', el }
  let spot = false;

  function setPulse(id) {
    if (id === pulseRef) return;
    pulseRef = id;
    ctx.scene.setHighlight(id == null ? null : id, 'pulse');
  }

  function mark(keys) {
    for (const el of ctx.root.querySelectorAll('[data-ftue-target]')) {
      if (!keys.includes(el.dataset.key)) {
        el.removeAttribute('data-ftue-target');
        el.classList.remove('pulse');
      }
    }
    for (const k of keys) {
      for (const el of ctx.root.querySelectorAll(`[data-key="${k}"]`)) {
        if (!el.offsetParent) continue;
        el.setAttribute('data-ftue-target', '');
        el.classList.add('pulse');
      }
    }
  }

  return {
    update(s) {
      const fv = s.phase === 'attack' || ctx.view.title ? null : game.ftueView(s);
      const sheet = ctx.activeSheet;
      let text = '';
      anchor = null;
      const keys = [];
      let pulseId = null;
      if (fv && fv.highlight && fv.highlight.type !== 'none') {
        const hl = fv.highlight;
        if (hl.type === 'district') {
          pulseId = hl.ref;
          if (sheet === 'district' && ctx.view.sel === hl.ref) {
            if (hl.inner) keys.push(hl.inner.ref);
          } else if (!sheet) {
            keys.push(`select:${hl.ref}`);
            if (fv.bubble) {
              text = fv.bubble.text;
              anchor = { kind: 'district', id: hl.ref };
            }
          }
        } else if (hl.type === 'tab') {
          if (ctx.view.tab === hl.ref) {
            if (hl.inner) keys.push(hl.inner.ref);
          } else {
            keys.push(`tab:${hl.ref}`);
            const slot = ctx.tabsApi.slot(hl.ref);
            if (fv.bubble && slot) {
              text = fv.bubble.text;
              anchor = { kind: 'el', el: slot };
            }
          }
        } else if (hl.type === 'button') keys.push(hl.ref);
      } else if (!fv && s.phase === 'cleanup' && !sheet) {
        const o = game.objective(s);
        if (o.pointer) {
          text = o.pointer.text;
          anchor = { kind: 'district', id: o.pointer.district };
          pulseId = o.pointer.district;
        }
      }
      setPulse(pulseId);
      mark(keys);
      T(txt, text);
      C(bubble, 'on', !!text && !ctx.modal);
      const dim = !!(fv && fv.dim) && !ctx.modal;
      C(ctx.root, 'ftue-dim', dim);
      spot = dim && !!anchor && anchor.kind === 'district';
      C(veil, 'on', dim);
      C(veil, 'hole', spot);
      // dimmable chrome: everything the step does not allow
      for (const el of ctx.root.querySelectorAll('[data-dim]')) {
        const k = el.dataset.key;
        const allowed = !fv || keys.includes(k) || (k && k.startsWith('tab:') && game.ftueAllows(s, k) && !keys.length);
        C(el, 'is-dim', !!fv && fv.dim && !allowed);
      }
      const ht = s.phase === 'cleanup' && !sheet ? game.hud(s).tip : null;
      const tipOn = !!ht && !ctx.modal && !fv;
      if (tipOn && tipSince < 0) tipSince = s.clock;
      else if (tipOn && s.clock - tipSince >= 4) ackTip();
      T(tipTxt, ht ? ht.text : '');
      C(tip, 'on', tipOn);
    },
    frame() {
      if (!anchor || !bubble.classList.contains('on')) return;
      let x;
      let y;
      let side = '';
      if (anchor.kind === 'district') {
        ctx.project(`district:${anchor.id}`, P);
        if (!P.visible) return;
        x = P.x;
        y = P.y - 86;
        // above the district's chip and its flag, never over them (review 2 F10)
        const ct = ctx.chipTop ? ctx.chipTop(anchor.id) : null;
        if (ct) { x = ct.x; y = Math.min(y, ct.y - 6); }
        if (spot) {
          S(veil, '--sx', `${P.x.toFixed(0)}px`);
          S(veil, '--sy', `${(P.y + 30).toFixed(0)}px`);
        }
      } else {
        // review 2 F15b: a tab bubble sits beside its tab, inside the tab bar's row, with the tail pointing at it, so it
        // never covers the panel card above the tabs
        const c = centre(anchor.el);
        if (!c) return;
        const W0 = ctx.root.clientWidth || 390;
        side = c.x > W0 / 2 ? 'l' : 'r';
        x = side === 'l' ? c.x - 30 : c.x + 30;
        y = c.y - 4;
      }
      if (side !== bubble.dataset.side) { bubble.dataset.side = side; C(bubble, 'side-l', side === 'l'); C(bubble, 'side-r', side === 'r'); }
      const W = ctx.root.clientWidth || 390;
      const bw = bubble.offsetWidth || 160;
      if (side) {
        const sx = side === 'l' ? Math.max(bw + 8, x) : Math.min(W - bw - 8, x);
        S(bubble, 'transform', `translate3d(${sx.toFixed(1)}px,${y.toFixed(1)}px,0)`);
        return;
      }
      const cx = Math.max(bw / 2 + 8, Math.min(W - bw / 2 - 8, x));
      S(bubble, 'transform', `translate3d(${cx.toFixed(1)}px,${y.toFixed(1)}px,0)`);
      S(bubble, '--ax', `${(x - cx).toFixed(1)}px`);
    },
  };
}
