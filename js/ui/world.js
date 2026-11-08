// Aftermath v2 UI: in-world HTML overlays (DESIGN §5.5, UI-SPEC §4 in-world). Positions come from scene.project(anchor)
// at <= 30 Hz with translate3d only; models refresh at <= 10 Hz. Calm: street plates. Contract: job chips (one bar for the
// blocking task, 3 stage dots, worker badge, attention / spreading / paused / done). Driving vehicles: "Yolda · 3 sn".
import { h, icon, setIcon, T, C, S, show, tap, bar, setBar } from './dom.js';

const STAGE_ICON = { fire: 'g-flame', rubble: 'g-rubble', carve: 'g-carcass' };
const CREW_ICON = { fire: 'g-firetruck', debris: 'g-excavator', carve: 'g-cleaver' };
const MODEL_MS = 100;
const CLEAN_HOLD = 2200;

export function createWorld(ctx) {
  const layer = ctx.L.world;
  const P = { x: 0, y: 0, visible: false };
  const chips = [];
  for (let id = 0; id < 6; id++) chips.push(makeChip(id));
  const tags = new Map();
  const TX = new Float32Array(16);
  const TY = new Float32Array(16);
  let lastModel = -1e9;
  let tagModels = [];
  let mode = '';
  let pulseId = -1;

  function makeChip(id) {
    const name = h('span.wchip__name');
    const crewIcon = icon('g-firetruck', 14);
    const crewN = h('span.num');
    const crew = h('span.wchip__crew', crewIcon, crewN);
    const tIcon = icon('g-flame', 14);
    const tVal = h('span.num');
    const b = bar('fire');
    const dots = h('span.dots', h('b'), h('b'), h('b'));
    const flag = h('span.wchip__flag');
    const ring = h('i.wchip__ring');
    const arrow = h('i.wchip__arrow');
    const chip = h('button.wchip.compact', { type: 'button', 'data-key': `select:${id}` },
      h('span.wchip__head', name, crew),
      h('span.wchip__body', h('span.wchip__task', tIcon, tVal), b, dots),
      flag, ring, arrow);
    const tier = h('em');
    const plateName = h('span');
    const plate = h('button.wplate.plate-sign', { type: 'button', 'data-key': `select:${id}` }, h('span', plateName, tier));
    const node = h('div.wanchor', chip, plate);
    tap(chip, () => ctx.selectDistrict(id));
    tap(plate, () => ctx.selectDistrict(id));
    layer.appendChild(node);
    return { id, node, chip, plate, plateName, tier, name, crew, crewIcon, crewN, tIcon, tVal, b, dots, flag, ring, arrow, want: '', cleanAt: 0, prevStage: '', m: null,
      compact: true, x: 0, top: 0, shown: false };
  }

  function chipModel(s, c, d, now) {
    if (d.stage === 'clean' && c.prevStage && c.prevStage !== 'clean' && c.prevStage !== 'none') c.cleanAt = now;
    c.prevStage = d.stage;
    const inWork = d.stage === 'fire' || d.stage === 'rubble' || d.stage === 'carve';
    const recentlyClean = d.stage === 'clean' && now - c.cleanAt < CLEAN_HOLD;
    if (!inWork && !recentlyClean && !d.threatened) return '';
    T(c.name, d.name);
    show(c.crew, d.workers > 0 || recentlyClean);
    if (recentlyClean) {
      setIcon(c.crewIcon, 't-check');
      T(c.crewN, 'Temiz');
    } else if (d.workers > 0) {
      const sec = s.sectors[c.id];
      const t = sec.crews.fire ? 'fire' : sec.crews.debris ? 'debris' : 'carve';
      setIcon(c.crewIcon, CREW_ICON[t]);
      T(c.crewN, String(d.workers));
    }
    if (d.bar) {
      setIcon(c.tIcon, STAGE_ICON[d.bar.kind]);
      T(c.tVal, d.bar.text);
      setBar(c.b, d.bar.value, d.bar.kind);
    } else if (d.stage === 'clean') {
      setIcon(c.tIcon, 't-check');
      T(c.tVal, 'Temiz');
      setBar(c.b, 1, 'good');
    } else {
      setIcon(c.tIcon, 'g-flame');
      T(c.tVal, 'Yangın riski');
      setBar(c.b, 0, 'fire');
    }
    C(c.b, 'striped', !!d.paused);
    let i = 0;
    for (const dot of c.dots.children) {
      const st = d.dots[i++].state;
      C(dot, 'done', st === 'done');
      C(dot, 'now', st === 'now');
      C(dot, 'absent', st === 'absent');
    }
    // the clean state replaces the chip content (green head + "Temiz"); no second flag layer (review V4)
    let flag = '';
    if (recentlyClean) flag = '';
    else if (d.threatened) flag = `${d.threatened.text} · ${Math.max(1, Math.ceil(d.threatened.t))} sn`;
    else if (d.paused) flag = 'Durdu';
    else if (d.rival) flag = 'Süpürge';
    T(c.flag, flag);
    show(c.flag, !!flag);
    C(c.chip, 'done', recentlyClean);
    C(c.chip, 'spreading', !!d.threatened);
    C(c.chip, 'source', !!d.spreading);
    C(c.chip, 'paused', !!d.paused);
    C(c.chip, 'rival', !!d.rival);
    C(c.chip, 'attention', d.attention);
    C(c.chip, 'pulse-on', d.attention && c.id === pulseId);
    S(c.ring, '--p', d.threatened ? String(Math.max(0, Math.min(1, d.threatened.t / 5)).toFixed(3)) : '0');
    // compact pill (name + crew + one bar) so the 3D work stays visible (review V4, playtest M10); the full card only
    // while a spread countdown needs its numbers
    c.compact = !d.threatened && !d.spreading;
    C(c.chip, 'compact', c.compact);
    return 'chip';
  }

  function refreshModels(s, now) {
    // during the result hold the job chips stay, so the last district's "Temiz" is seen before the receipt
    const work = s.phase === 'cleanup' || s.phase === 'rival' || (!!ctx.resultHeld && ctx.resultHeld(s));
    const calm = s.phase === 'calm' && !work;
    mode = work ? 'work' : calm ? 'calm' : '';
    pulseId = -1;
    if (work && s.contract) {
      const t = ctx.game.topTask(s, s.contract.sectors);
      if (t && !t.attended) pulseId = t.id;
    } else if (s.phase === 'rival' && s.rival.tail != null) pulseId = s.rival.tail;
    const acc = ctx.view.accept ? (ctx.game.fleetStrip(s).find((f) => f.type === ctx.view.accept) || { accepts: [] }).accepts : null;
    const upk = calm && s.progress.unlocked.upkeep;
    for (const c of chips) {
      const d = ctx.game.districtStatus(s, c.id);
      let want = '';
      if (work) want = chipModel(s, c, d, now);
      else if (calm) {
        want = 'plate';
        T(c.plateName, d.name);
        const tier = s.sectors[c.id].upkeep;
        T(c.tier, upk && tier > 0 ? `Kademe ${tier}` : '');
        show(c.tier, upk && tier > 0);
        C(c.plate, 'tappable', !!upk);
        C(c.plate, 'damaged', s.sectors[c.id].damaged);
        c.prevStage = d.stage;
      } else c.prevStage = d.stage;
      if (want !== 'chip') c.compact = true;
      c.want = want;
      show(c.chip, want === 'chip');
      show(c.plate, want === 'plate');
      C(c.chip, 'sel', ctx.view.sel === c.id);
      C(c.plate, 'sel', ctx.view.sel === c.id);
      C(c.chip, 'accept', !!acc && acc.includes(c.id));
    }
    tagModels = ctx.game.vehicleTags(s);
    const seen = new Set();
    for (const t of tagModels) {
      seen.add(t.id);
      let el = tags.get(t.id);
      if (!el) {
        el = h('div.vtag', icon('t-route', 14), h('span.num'));
        layer.appendChild(el);
        tags.set(t.id, el);
      }
      T(el.lastChild, t.text);
    }
    for (const [id, el] of tags) {
      if (!seen.has(id)) {
        el.remove();
        tags.delete(id);
      }
    }
  }

  const HEAD = { x: 0, y: 0, visible: false };
  /** screen top-centre of a district's chip as last placed (floats start above it), or null */
  ctx.chipTop = (id) => {
    const c = chips[id];
    return c && c.shown ? { x: c.x, y: c.top } : null;
  };

  return {
    frame(s, now) {
      if (now - lastModel >= MODEL_MS || ctx.dirty) {
        lastModel = now;
        refreshModels(s, now);
      }
      const W = ctx.root.clientWidth || 390;
      const H = ctx.root.clientHeight || 844;
      const top = ctx.band.top;
      const bottom = H - ctx.band.bottom;
      const hideAll = !mode || !!ctx.activeSheet && ctx.activeSheet !== 'district' && ctx.activeSheet !== 'upkeep';
      // the carcass head stays visible: chips that would cover it slide sideways (review V4)
      ctx.project('corpse:head', HEAD);
      const headOn = mode === 'work' && HEAD.visible;
      for (const c of chips) {
        c.shown = false;
        if (!c.want || hideAll) {
          C(c.node, 'off', true);
          continue;
        }
        ctx.project(`district:${c.id}`, P);
        const isChip = c.want === 'chip';
        const hgt = isChip ? (c.compact ? 32 : 74) : 34;
        const halfW = isChip ? (c.compact ? 46 : 54) : 44;
        let x = P.x;
        let y = P.y;
        let edge = false;
        const inside = P.visible && y - hgt - 10 > top && y < bottom && x > halfW * 0.6 && x < W - halfW * 0.6;
        if (!inside) {
          // job chips never vanish: they clamp to the band edge with a pointer toward their district (playtest M6)
          if (isChip) {
            edge = true;
            const px = P.visible ? P.x : x;
            const py = P.visible ? P.y : (P.y < (top + bottom) / 2 ? top : bottom);
            x = Math.max(halfW + 6, Math.min(W - halfW - 6, px));
            y = Math.max(top + hgt + 14, Math.min(bottom - 6, py));
            const ang = Math.atan2(py - (y - hgt / 2 - 10), px - x);
            S(c.arrow, '--ang', `${ang.toFixed(3)}rad`);
          } else {
            C(c.node, 'off', true);
            continue;
          }
        } else if (headOn && isChip) {
          const cy0 = y - 10 - hgt - 14;
          const cy1 = y + 6;
          if (HEAD.y > cy0 && HEAD.y < cy1 && Math.abs(HEAD.x - x) < halfW + 18) {
            x = HEAD.x + (x >= HEAD.x ? 1 : -1) * (halfW + 22);
            x = Math.max(halfW + 4, Math.min(W - halfW - 4, x));
          }
        }
        C(c.node, 'off', false);
        C(c.node, 'edge', edge);
        S(c.node, 'transform', `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`);
        c.shown = true;
        c.x = x;
        c.top = y - 10 - hgt;
      }
      let n = 0;
      for (const t of tagModels) {
        const el = tags.get(t.id);
        if (!el) continue;
        ctx.project(`vehicle:${t.id}`, P);
        const ok = P.visible && !hideAll && P.y > top + 20 && P.y < bottom;
        C(el, 'off', !ok);
        if (!ok) continue;
        // keep the whole tag on screen (review V1: "Yolda · 2 sn" was cut at the right edge)
        P.x = Math.max(52, Math.min(W - 52, P.x));
        // stack tags of vehicles that are close on screen (convoy leaving the yard)
        let y = P.y - 10;
        for (let i = 0; i < n; i++) if (Math.abs(TX[i] - P.x) < 70 && Math.abs(TY[i] - y) < 24) y = TY[i] - 26;
        if (n < TX.length) {
          TX[n] = P.x;
          TY[n] = y;
          n++;
        }
        S(el, 'transform', `translate3d(${P.x.toFixed(1)}px,${y.toFixed(1)}px,0)`);
      }
    },
  };
}
