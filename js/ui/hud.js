// HUD: location badge (name + 3 goal stars, opens Places), coin pill with a rolling
// counter and the income per second, gear button, optional FPS meter.
import { el, icon, onTap, setText, toggle, pulse } from './dom.js';

export function createHUD(ctx) {
  const { game } = ctx;
  const locName = el('span', 'name');
  const stars = [icon('starEmpty'), icon('starEmpty'), icon('starEmpty')];
  const loc = el('button', 'hud-loc', { type: 'button' }, [locName, el('span', 'stars', null, stars)]);
  const coinVal = el('span', 'val');
  const coinIco = icon('coin');
  const pill = el('div', 'coin-pill', null, [coinIco, coinVal]);
  const income = el('div', 'income');
  const gear = el('button', 'btn btn-round gear', { type: 'button', 'aria-label': 'settings' }, [icon('gear')]);
  const fps = el('div', 'fps is-hidden');
  const root = el('div', 'hud', null, [
    loc,
    el('div', 'hud-coins', null, [pill, income]),
    el('div', 'hud-right', null, [gear, fps]),
  ]);
  ctx.layers.top.appendChild(root);

  onTap(gear, () => { ctx.sfx('tap'); ctx.openSettings(); });
  onTap(loc, () => { ctx.sfx('tap'); ctx.openMenu('places'); });

  let shown = game.state.money;
  let starN = -1;
  let incT = 0;
  let fpsT = 0;

  function update(dt) {
    const m = game.state.money;
    // rolling counter: catches up quickly, never overshoots
    if (shown !== m) {
      const d = m - shown;
      if (Math.abs(d) < 1 || d < 0) shown = m;
      else shown += Math.max(1, d * Math.min(1, dt * 10));
      if (shown > m) shown = m;
    }
    setText(coinVal, ctx.num(shown));
    incT -= dt;
    if (incT <= 0) {
      incT = 0.5;
      setText(income, ctx.tx('hud.perSec', { n: '+' + ctx.num(game.select.incomePerSec()) }));
      const s = game.select.location().stars;
      if (s !== starN) {
        for (let i = 0; i < 3; i++) {
          const on = i < s;
          const was = i < starN;
          if (on !== was || starN < 0) {
            stars[i].innerHTML = on ? ctx.icons.star : ctx.icons.starEmpty;
            if (on && starN >= 0) pulse(stars[i]);
          }
        }
        starN = s;
      }
    }
    const showFps = !!game.state.settings.fps;
    toggle(fps, 'is-hidden', !showFps);
    if (showFps) {
      fpsT -= dt;
      if (fpsT <= 0) {
        fpsT = 0.5;
        let st = null;
        try { st = ctx.scene && ctx.scene.stats ? ctx.scene.stats() : null; } catch { st = null; }
        if (st) setText(fps, ctx.tx('fps.text', { fps: Math.round(st.fps || 0), calls: st.calls || 0, tris: Math.round((st.tris || 0) / 100) / 10 }));
      }
    }
  }

  function relabel() {
    setText(locName, ctx.tx(game.select.location().nameKey));
    incT = 0;
  }

  return {
    root,
    update,
    relabel,
    bump() { pulse(pill, 'bump'); },
    coinTarget() {
      const r = coinIco.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    bottom() { return root.getBoundingClientRect().bottom; },
  };
}
