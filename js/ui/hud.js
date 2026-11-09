// Top HUD: coins (rolling counter), income per second, settings button.
import { el, icon, setText, onTap, pulse } from './dom.js';

export function createHUD(ctx) {
  const coinIco = icon('coin', 'hud-coin-ico');
  const coinNum = el('span', 'hud-coin-num num', { text: '0' });
  const coins = el('div', 'hud-coins', { role: 'status' }, [coinIco, coinNum]);
  const incNum = el('span', 'hud-inc-num num');
  const inc = el('div', 'hud-inc', null, [icon('up', 'hud-inc-ico'), incNum]);
  const gear = el('button', 'hud-gear btn-round', { type: 'button' }, [icon('gear')]);
  const fps = el('div', 'hud-fps is-hidden');
  const center = el('div', 'hud-center', null, [coins, inc]);
  const root = el('div', 'hud', null, [center, gear, fps]);
  ctx.layers.top.appendChild(root);

  onTap(gear, () => { ctx.sfx('tap'); ctx.openSettings(); });

  let shown = ctx.game.state.money;
  let lastInc = -1;
  let fpsT = 0;

  function relabel() {
    gear.setAttribute('aria-label', ctx.tx('hud.settings'));
    coins.setAttribute('aria-label', ctx.tx('hud.coins'));
    inc.setAttribute('aria-label', ctx.tx('hud.income'));
    lastInc = -1;
    coinNum._t = null;
  }

  function update(dt) {
    const target = ctx.game.state.money;
    if (target < shown) shown = target; // spending: snap down
    else if (target > shown) {
      // roll up quickly, a little slower for big jumps so it is visible
      const k = 1 - Math.exp(-dt * 9);
      shown += (target - shown) * k;
      if (target - shown < 0.5) shown = target;
    }
    setText(coinNum, ctx.num(shown));
    const ips = ctx.game.select.incomePerSec();
    if (ips !== lastInc) {
      lastInc = ips;
      setText(incNum, ctx.tx('hud.perSec', { n: ctx.num(ips) }));
    }
    const st = ctx.game.state.settings;
    fps.classList.toggle('is-hidden', !st.fps);
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
  return { root, update, relabel, coinTarget, bump, bottom: () => root.getBoundingClientRect().bottom };
}
