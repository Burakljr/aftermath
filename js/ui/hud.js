// Top HUD: factory badge with a 3-star goal bar (left), the big coin pill with
// the income chip under it (middle), settings gear (right), FPS meter.
import { el, icon, otext, setText, onTap, pulse, toggle, setStyle, setHTML, ICONS, FACTORY_GLYPH } from './dom.js';

export function createHUD(ctx) {
  // factory badge (tap: Factories panel)
  const medalIco = el('span', 'ico hud-medal-ico');
  const medalNum = otext('hud-medal-num num');
  const medal = el('span', 'hud-medal', null, [medalIco, medalNum]);
  const barFill = el('span', 'hud-sbar-fill');
  const stars = [0, 1, 2].map((i) => el('span', 'hud-star s' + i, { html: ICONS.star }));
  const bar = el('span', 'hud-sbar', null, [barFill, el('span', 'hud-sbar-div d1'), el('span', 'hud-sbar-div d2')]);
  const badge = el('button', 'hud-badge', { type: 'button' }, [bar, ...stars, medal]);

  // coins + income
  const coinIco = icon('coin', 'hud-coin-ico');
  const coinNum = otext('hud-coin-num num', '0');
  const coins = el('div', 'hud-coins', { role: 'status' }, [coinIco, coinNum]);
  const incNum = otext('hud-inc-num num');
  const inc = el('div', 'hud-inc', null, [icon('up', 'hud-inc-ico'), incNum]);
  const mid = el('div', 'hud-mid', null, [coins, inc]);

  const gear = el('button', 'hud-gear b3 b3-blue', { type: 'button' }, [icon('gear')]);
  const fps = el('div', 'hud-fps is-hidden');
  const root = el('div', 'hud', null, [badge, mid, gear, fps]);
  ctx.layers.top.appendChild(root);

  onTap(gear, () => { ctx.sfx('tap'); ctx.openSettings(); });
  onTap(badge, () => ctx.openMenu('factories'));

  let shown = ctx.game.state.money;
  let lastInc = -1;
  let fpsT = 0;
  let lastClaimed = -1;
  let lastFactory = null;

  function relabel() {
    gear.setAttribute('aria-label', ctx.tx('hud.settings'));
    coins.setAttribute('aria-label', ctx.tx('hud.coins'));
    inc.setAttribute('aria-label', ctx.tx('hud.income'));
    badge.setAttribute('aria-label', ctx.tx('menu.factories'));
    lastInc = -1;
    coinNum._t = null;
  }

  function update(dt) {
    const g = ctx.game;
    const target = g.state.money;
    if (target < shown) shown = target; // spending: snap down
    else if (target > shown) {
      // roll up quickly, a little slower for big jumps so it is visible
      const k = 1 - Math.exp(-dt * 9);
      shown += (target - shown) * k;
      if (target - shown < 0.5) shown = target;
    }
    setText(coinNum, ctx.num(shown));
    const ips = g.select.incomePerSec();
    if (ips !== lastInc) {
      lastInc = ips;
      setText(incNum, ctx.tx('hud.perSec', { n: ctx.num(ips) }));
    }
    // factory badge: medal + goal stars (one star per third of the goals collected)
    const f = g.state.factory;
    if (f.id !== lastFactory) {
      lastFactory = f.id;
      setHTML(medalIco, ICONS[FACTORY_GLYPH[f.id] || 'factory']);
      setText(medalNum, String(g.state.factoryIndex + 1));
      lastClaimed = -1;
    }
    let claimed = 0;
    for (const x of g.state.goals) if (x.claimed) claimed++;
    if (claimed !== lastClaimed) {
      const total = g.state.goals.length || 1;
      const earned = Math.floor((claimed / total) * 3 + 1e-9);
      const animate = lastClaimed >= 0;
      lastClaimed = claimed;
      setStyle(barFill, 'transform', `scaleX(${(claimed / total).toFixed(3)})`);
      for (let i = 0; i < 3; i++) {
        const on = i < earned;
        if (animate && on && !stars[i]._on) pulse(stars[i], 'star-pop');
        stars[i]._on = on;
        toggle(stars[i], 'on', on);
      }
    }
    const st = g.state.settings;
    toggle(fps, 'is-hidden', !st.fps);
    if (st.fps) {
      fpsT -= dt;
      if (fpsT <= 0) {
        fpsT = 0.5;
        const s = (ctx.scene && ctx.scene.stats && ctx.scene.stats()) || { fps: 0, calls: 0, tris: 0 };
        setText(fps, ctx.tx('fps.text', {
          fps: Math.round(s.fps || 0),
          calls: s.calls || 0,
          tris: Math.round((s.tris || 0) / 100) / 10,
        }));
      }
    }
  }

  function coinTarget() {
    const r = coinIco.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function bump() { pulse(coins, 'bump'); }

  relabel();
  return {
    root, update, relabel, coinTarget, bump,
    bottom: () => Math.max(mid.getBoundingClientRect().bottom, badge.getBoundingClientRect().bottom),
  };
}
