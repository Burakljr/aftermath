// ui-lab only: a fake scene over a static proto-B screenshot. Implements the facade subset the UI uses
// (project, setHighlight, frame, setBand, shake) with fixed district anchors, so overlays can be laid out without 3D.
// Selecting a district "frames" it: the backdrop and the anchors slide so it sits in the middle of the free band.

const BASE = {
  0: [112, 268], 3: [278, 256],
  5: [104, 380], 1: [272, 370],
  4: [110, 492], 2: [280, 482],
};
const YARD = [196, 640];
const BG = { calm: 'calm', attack: 'attack', impact: 'impact', work: 'cleanup' };

export function createFakeScene(stage, getState) {
  const bg = document.createElement('div');
  bg.className = 'lab-bg';
  stage.appendChild(bg);
  const hl = document.createElement('div');
  hl.className = 'lab-hl';
  stage.appendChild(hl);
  const marks = {};
  for (const id of Object.keys(BASE)) {
    const m = document.createElement('div');
    m.className = 'lab-mark';
    hl.appendChild(m);
    marks[id] = m;
  }
  const log = [];
  let band = { top: 104, bottom: 300 };
  let target = null;
  let off = 0;
  let offFrom = 0;
  let offTo = 0;
  let offT0 = 0;
  const layers = { select: new Set(), pulse: new Set(), accept: new Set() };
  let bgKey = '';

  function offset() {
    const k = Math.min(1, (performance.now() - offT0) / 700);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    off = offFrom + (offTo - offFrom) * e;
    return off;
  }
  function retarget() {
    const H = stage.clientHeight || 844;
    let to = 0;
    if (target != null && BASE[target]) {
      const mid = (band.top + (H - band.bottom)) / 2;
      to = Math.min(260, Math.max(-300, mid - BASE[target][1] + 30));
    }
    if (to !== offTo) {
      offFrom = offset();
      offTo = to;
      offT0 = performance.now();
    }
  }
  function point(id) {
    const p = BASE[id];
    return p ? [p[0], p[1] + offset()] : null;
  }

  const api = {
    log,
    project(anchor, out) {
      const o = out || {};
      o.visible = false;
      const [kind, ref] = anchor.split(':');
      let p = null;
      if (kind === 'district') p = point(ref);
      else if (kind === 'yard' || kind === 'gate' || kind === 'shed') p = [YARD[0], YARD[1] + offset()];
      else if (kind === 'vehicle') {
        const s = getState();
        const v = s && s.fleet.find((x) => x.id === ref);
        if (v && v.state === 'enroute' && v.sector != null) {
          const a = v.from === 'yard' || v.from == null ? [YARD[0], YARD[1] + offset()] : point(v.from);
          const b = point(v.sector);
          const t = v.eta0 > 0 ? 1 - v.eta / v.eta0 : 1;
          if (a && b) p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        }
      }
      if (p) {
        o.x = p[0];
        o.y = p[1];
        o.visible = true;
      }
      return o;
    },
    setHighlight(ids, kind = 'select') {
      log.push(['setHighlight', ids, kind]);
      const set = layers[kind] || (layers[kind] = new Set());
      set.clear();
      if (ids != null) for (const id of [].concat(ids)) set.add(String(id));
    },
    frame(t, opts) {
      log.push(['frame', t, opts]);
      const m = /^district:(\d)/.exec(t);
      target = m ? m[1] : null;
      retarget();
    },
    setBand(b) {
      band = b;
      retarget();
    },
    shake() {
      bg.classList.remove('shake');
      void bg.offsetWidth;
      bg.classList.add('shake');
    },
    setTime() {},
    /** lab: per-frame backdrop + highlight marks */
    tick(s) {
      const key = !s ? 'calm' : s.phase === 'attack' ? (s.attack && s.attack.t >= 2 ? 'impact' : 'attack') : s.phase === 'calm' && !s.result ? 'calm' : 'work';
      if (key !== bgKey) {
        bgKey = key;
        bg.style.backgroundImage = `url(assets/lab/${BG[key]}.jpg)`;
      }
      const o = offset();
      bg.style.transform = `translate3d(0, ${o.toFixed(1)}px, 0)`;
      for (const id of Object.keys(marks)) {
        const p = point(id);
        const m = marks[id];
        m.style.transform = `translate3d(${p[0]}px, ${p[1] + 34}px, 0)`;
        m.className = `lab-mark${layers.select.has(id) ? ' sel' : ''}${layers.pulse.has(id) ? ' pulse' : ''}${layers.accept.has(id) ? ' accept' : ''}${s && s.sectors[id].warnTo != null ? '' : ''}${s && s.sectors.some((x) => x.warnTo === Number(id)) ? ' spread' : ''}`;
      }
    },
    /** lab: which district is under a tap */
    pick(x, y) {
      let best = null;
      let bd = 1e9;
      for (const id of Object.keys(BASE)) {
        const p = point(id);
        const d = Math.hypot(p[0] - x, p[1] + 30 - y);
        if (d < bd) {
          bd = d;
          best = Number(id);
        }
      }
      return bd < 90 ? { type: 'district', id: best } : null;
    },
  };
  return api;
}
