// Aftermath — şehir haritası, canavar, ekipler ve efektlerin çizimi (Canvas 2D)
import { SECTORS, COLS, ROWS, MONSTERS, MUTANT_PALETTE, CREWS, CREW_TYPES, BAL, RIVAL } from './data.js';
import { on } from './bus.js';
import { game } from './state.js';
import { mulberry32 } from './util.js';

export const W = 480;
export const H = 360;
const M = 8;
const ROAD = 10;
const SW = (W - 2 * M - (COLS - 1) * ROAD) / COLS;
const SH = (H - 2 * M - (ROWS - 1) * ROAD) / ROWS;
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

export function sectorRect(i) {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  return { x: M + c * (SW + ROAD), y: M + r * (SH + ROAD), w: SW, h: SH };
}
function center(i) {
  const r = sectorRect(i);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 + 6 };
}

const STYLE = {
  harbor:   { g: [200, 14, 30], b: [205, 18, 60], hMul: 0.9 },
  center:   { g: [225, 10, 31], b: [220, 16, 64], hMul: 1.25 },
  finance:  { g: [210, 14, 29], b: [198, 34, 62], hMul: 1.9 },
  industry: { g: [35, 12, 29],  b: [28, 14, 55],  hMul: 0.8 },
  park:     { g: [118, 22, 28], b: [40, 20, 62],  hMul: 0.7 },
  old:      { g: [28, 20, 30],  b: [35, 30, 66],  hMul: 0.65 },
};

let canvas;
let ctx;
let scale = 1;
let time = 0;
let trauma = 0;
let lastStep = -1;
let lastW = 0;
const floats = [];
const particles = [];
let onSelect = () => {};
let getSelected = () => null;

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
const angleOf = (from, to) => Math.atan2(to.y - from.y, to.x - from.x);
const scaleK = (ratio) => 0.45 + 0.55 * Math.sqrt(Math.max(0, ratio));

/* ---------------- Sabit şehir yerleşimi ---------------- */

const layouts = SECTORS.map((sec, i) => makeLayout(i, sec.style));

function makeLayout(i, st) {
  const rng = mulberry32(9001 + i * 7919);
  const r = sectorRect(i);
  const top = r.y + 24;
  const right = r.x + r.w - 8;
  const bottom = r.y + r.h - 6;
  const x0 = st === 'harbor' ? r.x + r.w * 0.36 : r.x + 8;
  const gx = st === 'harbor' ? 2 : 3;
  const gy = 3;
  const lw = (right - x0) / gx;
  const lh = (bottom - top) / gy;
  const lots = [];
  for (let yy = 0; yy < gy; yy++) {
    for (let xx = 0; xx < gx; xx++) {
      if (st === 'center' && xx === 1 && yy === 1) continue;
      const w = lw * (0.55 + rng() * 0.25);
      const d = lh * (0.3 + rng() * 0.14);
      lots.push({
        x: x0 + xx * lw + (lw - w) / 2,
        y: top + yy * lh + lh * 0.62 - d / 2,
        w, d,
        h: 10 + rng() * 18,
        v: rng(),
        win: Math.floor(rng() * 1e6),
        order: rng(),
        chimney: st === 'industry' && rng() < 0.6,
      });
    }
  }
  [...lots].sort((a, b) => a.order - b.order).forEach((l, k) => { l.rank = k; });
  lots.sort((a, b) => a.y - b.y);
  const piles = Array.from({ length: 22 }, () => ({
    x: r.x + 12 + rng() * (r.w - 24), y: r.y + 26 + rng() * (r.h - 36), s: 5 + rng() * 7, c: rng(),
  }));
  const flames = Array.from({ length: 10 }, () => ({
    x: r.x + 16 + rng() * (r.w - 32), y: r.y + 34 + rng() * (r.h - 46), s: 0.7 + rng() * 0.6, p: rng() * 6.28,
  }));
  const trees = Array.from({ length: 16 }, () => ({
    x: r.x + 10 + rng() * (r.w - 20), y: r.y + 26 + rng() * (r.h - 32), s: 5 + rng() * 5,
  }));
  return { st, lots, piles, flames, trees };
}

function visibleLots(st, level) {
  if (st === 'park') return Math.min(4, 1 + level);
  return Math.min(9, 2 + Math.round(level * 1.4));
}

/* ---------------- Kurulum ---------------- */

export function initRender(cv, opts) {
  canvas = cv;
  ctx = canvas.getContext('2d');
  onSelect = opts.onSelect;
  getSelected = opts.getSelected;
  canvas.addEventListener('pointerup', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    for (let i = 0; i < SECTORS.length; i++) {
      const r = sectorRect(i);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        onSelect(i);
        return;
      }
    }
  });
  on('float', ({ sector, text, color, big }) => spawnFloat(sector, text, color, big));
  on('shake', ({ power }) => { trauma = Math.min(1, trauma + power / 20); });
  on('attack-start', () => { lastStep = -1; });
  on('hit', ({ chain, sectors }) => {
    for (const id of new Set([...chain, ...sectors])) {
      const c = center(id);
      const n = chain.includes(id) ? 30 : 14;
      for (let k = 0; k < n; k++) {
        particles.push({
          x: c.x + (Math.random() - 0.5) * 60, y: c.y + (Math.random() - 0.5) * 40,
          vx: (Math.random() - 0.5) * 90, vy: (Math.random() - 0.5) * 50 - 10, g: 0,
          r: 6 + Math.random() * 10, grow: 22, life: 0, max: 1.2 + Math.random() * 0.8,
          rgb: '160,150,138', a: 0.75,
        });
      }
    }
  });
}

function resize() {
  const w = canvas.clientWidth;
  if (w === lastW && canvas.width) return;
  lastW = w;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(w * 0.75 * dpr);
  scale = canvas.width / W;
}

/* ---------------- Çizim yardımcıları ---------------- */

function rrect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function ellipse(x, y, rx, ry, color) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2);
  if (color) ctx.fillStyle = color;
  ctx.fill();
}
function circle(x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  ctx.fill();
}
function tri(x1, y1, x2, y2, x3, y3) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}
function diamond(x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x - w, y);
  ctx.closePath();
  ctx.fill();
}
function xMark(x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.stroke();
}
function emoji(ch, x, y, size) {
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, x, y);
}
function caption(text, x, y, size, color) {
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/* ---------------- Ana çizim ---------------- */

export function draw(dt) {
  const s = game.s;
  time += dt;
  resize();
  trauma = Math.max(0, trauma - dt * 1.6);
  const sh = trauma * trauma * 12;
  const ox = (Math.random() * 2 - 1) * sh;
  const oy = (Math.random() * 2 - 1) * sh;
  ctx.setTransform(scale, 0, 0, scale, ox * scale, oy * scale);

  ctx.fillStyle = '#2b2f39';
  ctx.fillRect(-20, -20, W + 40, H + 40);
  drawRoadMarks();
  for (let i = 0; i < SECTORS.length; i++) drawSector(s, i);
  for (let i = 0; i < SECTORS.length; i++) drawRubble(s, i);
  drawCorpse(s);
  for (let i = 0; i < SECTORS.length; i++) drawFlames(s, i);
  ambient(s, dt);
  drawCrews(s, dt);
  if (s.phase === 'rival') drawRival(s);
  updateParticles(dt);
  drawParticles();
  for (let i = 0; i < SECTORS.length; i++) drawLabel(s, i);
  if (s.phase === 'attack') drawAttack(s);
  drawFloats(dt);
}

function drawRoadMarks() {
  ctx.strokeStyle = 'rgba(255,214,90,0.35)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  for (let c = 1; c < COLS; c++) {
    const x = M + c * SW + (c - 0.5) * ROAD;
    ctx.moveTo(x, 4);
    ctx.lineTo(x, H - 4);
  }
  for (let r = 1; r < ROWS; r++) {
    const y = M + r * SH + (r - 0.5) * ROAD;
    ctx.moveTo(4, y);
    ctx.lineTo(W - 4, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawSector(s, i) {
  const sec = s.sectors[i];
  const L = layouts[i];
  const st = STYLE[L.st];
  const r = sectorRect(i);
  const damaged = sec.rubble > 0 || sec.corpse > 0;

  ctx.save();
  rrect(r.x, r.y, r.w, r.h, 10);
  ctx.fillStyle = hsl(st.g[0], st.g[1], st.g[2] + sec.level * 2.2);
  ctx.fill();
  ctx.clip();

  if (L.st === 'harbor') {
    ctx.fillStyle = '#1f5a7a';
    ctx.fillRect(r.x, r.y, r.w * 0.32, r.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 7; k++) {
      const wy = r.y + 20 + k * 21;
      const wx = r.x + 6 + ((time * 8 + k * 13) % (r.w * 0.24));
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + 4, wy - 3, wx + 8, wy);
      ctx.stroke();
    }
    const by = r.y + r.h * 0.55 + Math.sin(time * 1.6) * 2;
    ctx.fillStyle = '#e8e2d0';
    tri(r.x + 14, by, r.x + 40, by, r.x + 36, by + 7);
    ctx.fillStyle = '#c2483a';
    ctx.fillRect(r.x + 22, by - 8, 7, 8);
    ctx.fillStyle = '#8a6d4a';
    ctx.fillRect(r.x + r.w * 0.32, r.y, 4, r.h);
  }
  if (L.st === 'center') {
    const cx = r.x + r.w / 2;
    const cy = r.y + 24 + ((r.h - 30) / 3) * 1.6;
    ellipse(cx, cy, 20, 13, 'rgba(210,205,190,0.35)');
    ellipse(cx, cy, 8, 5, '#3e86b8');
    ctx.strokeStyle = 'rgba(160,220,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 8 + ((time * 6) % 8), 5 + ((time * 4) % 5), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (L.st === 'park') {
    ellipse(r.x + r.w * 0.68, r.y + r.h * 0.6, 26, 15, '#2f6f8f');
  }

  const treeCount = L.st === 'park' ? 8 + sec.level * 1.5 : sec.level >= 2 ? sec.level : 0;
  for (let k = 0; k < Math.min(L.trees.length, treeCount); k++) {
    const t = L.trees[k];
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ellipse(t.x + 2, t.y + t.s * 0.8, t.s, t.s * 0.4);
    ctx.fillStyle = damaged ? '#4c5a36' : '#3f8a4a';
    circle(t.x, t.y, t.s);
    ctx.fillStyle = damaged ? '#5c6b40' : '#58a85e';
    circle(t.x - t.s * 0.3, t.y - t.s * 0.3, t.s * 0.55);
  }

  const visible = visibleLots(L.st, sec.level);
  for (const b of L.lots) {
    if (b.rank >= visible) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(b.x, b.y, b.w, b.d);
      ctx.setLineDash([]);
      continue;
    }
    drawBuilding(b, L.st, st, sec.level, damaged);
  }
  ctx.restore();
}

function drawBuilding(b, styleName, st, level, damaged) {
  let h = b.h * st.hMul * (0.75 + level * 0.12);
  const broken = damaged && b.v < 0.6;
  if (broken) h *= 0.45;
  const hue = st.b[0] + b.v * 16 - 8;
  const light = st.b[2] - 6 + b.v * 12;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(b.x + 3, b.y + b.d - 2, b.w, 5);
  ctx.fillStyle = hsl(hue, st.b[1], light - 16);
  ctx.fillRect(b.x, b.y + b.d - h, b.w, h);
  if (h > 9) {
    let k = 0;
    for (let wy = b.y + b.d - h + 3; wy < b.y + b.d - 4; wy += 6) {
      for (let wx = b.x + 3; wx < b.x + b.w - 4; wx += 6) {
        k++;
        const lit = ((b.win * k * 2654435761) >>> 0) % 100 < 55 && !broken;
        ctx.fillStyle = lit ? 'rgba(255,224,138,0.85)' : 'rgba(30,36,50,0.8)';
        ctx.fillRect(wx, wy, 3, 3);
      }
    }
  }
  const roofY = b.y + b.d - h - b.d;
  if (broken) {
    ctx.fillStyle = hsl(hue, st.b[1], light - 22);
    ctx.beginPath();
    ctx.moveTo(b.x, roofY + b.d);
    ctx.lineTo(b.x, roofY + 2);
    const n = 4;
    for (let k = 1; k <= n; k++) {
      ctx.lineTo(b.x + (b.w * k) / n - b.w / (2 * n), roofY - 3 + ((k + b.win) % 2) * 6);
      ctx.lineTo(b.x + (b.w * k) / n, roofY + 2);
    }
    ctx.lineTo(b.x + b.w, roofY + b.d);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = styleName === 'old' ? hsl(10 + b.v * 10, 48, 44) : hsl(hue, st.b[1], light + 4);
    ctx.fillRect(b.x, roofY, b.w, b.d);
    if (styleName === 'old') {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.moveTo(b.x, roofY + b.d / 2);
      ctx.lineTo(b.x + b.w, roofY + b.d / 2);
      ctx.stroke();
    }
    if (b.chimney) {
      ctx.fillStyle = '#4a4440';
      ctx.fillRect(b.x + b.w * 0.7, roofY - 10, 5, 12);
      b.chimTop = { x: b.x + b.w * 0.7 + 2.5, y: roofY - 10 };
    }
  }
  if (!b.chimney || broken) b.chimTop = null;
}

function drawRubble(s, i) {
  const sec = s.sectors[i];
  const L = layouts[i];
  if (sec.rubble > 0 && sec.rubbleMax > 0) {
    const n = Math.min(L.piles.length, Math.ceil((L.piles.length * sec.rubble) / sec.rubbleMax));
    for (let k = 0; k < n; k++) {
      const p = L.piles[k];
      const brown = p.c < 0.5;
      ctx.fillStyle = brown ? '#6f604f' : '#62666f';
      circle(p.x, p.y, p.s);
      ctx.fillStyle = brown ? '#8f7d68' : '#80858f';
      circle(p.x - p.s * 0.4, p.y - p.s * 0.3, p.s * 0.6);
      ctx.fillStyle = brown ? '#54493d' : '#4b4f57';
      ctx.fillRect(p.x + p.s * 0.2, p.y - p.s * 0.2, p.s * 0.6, p.s * 0.4);
    }
  }
}

function drawFlames(s, i) {
  const sec = s.sectors[i];
  const L = layouts[i];
  if (sec.fire > 0) {
    const n = Math.min(L.flames.length, Math.ceil(sec.fire / 10));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const f = L.flames[k];
      ctx.fillStyle = 'rgba(255,110,30,0.16)';
      circle(f.x, f.y - 6, 18 * f.s);
    }
    ctx.restore();
    for (let k = 0; k < n; k++) {
      const f = L.flames[k];
      const sz = f.s * (1 + 0.18 * Math.sin(time * 9 + f.p));
      ctx.fillStyle = 'rgba(255,84,26,0.95)';
      flame(f.x, f.y, 9 * sz, 17 * sz);
      ctx.fillStyle = 'rgba(255,206,64,0.95)';
      flame(f.x, f.y + 1, 5 * sz, 10 * sz);
    }
  }
}

function flame(x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.quadraticCurveTo(x + w, y - h * 0.25, x, y);
  ctx.quadraticCurveTo(x - w, y - h * 0.25, x, y - h);
  ctx.fill();
}

/* ---------------- Canavar ---------------- */

function drawHead(k, pal, ratio, alive) {
  ctx.fillStyle = pal.spike;
  tri(-14 * k, -12 * k, -32 * k, -26 * k, -4 * k, -19 * k);
  tri(-14 * k, 12 * k, -32 * k, 26 * k, -4 * k, 19 * k);
  ellipse(0, 0, 26 * k, 21 * k, pal.body);
  ellipse(20 * k, 0, 18 * k, 13 * k, pal.body);
  ellipse(22 * k, 5 * k, 13 * k, 7 * k, pal.belly);
  ctx.fillStyle = '#fff';
  for (let j = 0; j < 4; j++) tri((14 + j * 6) * k, 9 * k, (17.5 + j * 6) * k, 9 * k, (15.7 + j * 6) * k, 14 * k);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  circle(33 * k, -4 * k, 1.6 * k);
  circle(33 * k, 4 * k, 1.6 * k);
  if (alive) {
    for (const ey of [-9, 9]) {
      ellipse(6 * k, ey * k, 5 * k, 4 * k, '#ffe14d');
      ellipse(7 * k, ey * k, 1.4 * k, 3.4 * k, '#1a0d0d');
    }
  } else {
    ctx.strokeStyle = '#1a0d0d';
    ctx.lineWidth = 2.4 * k;
    xMark(6 * k, -9 * k, 4 * k);
    xMark(6 * k, 9 * k, 4 * k);
    ellipse(38 * k, 9 * k, 6 * k, 2.6 * k, '#e25a8a');
  }
  if (!alive && ratio < 0.45) {
    ctx.globalAlpha = Math.min(0.9, ((0.45 - ratio) / 0.45) * 1.1);
    ellipse(0, 0, 18 * k, 14 * k, '#efe6d2');
    ellipse(17 * k, 0, 12 * k, 8 * k, '#efe6d2');
    ctx.fillStyle = '#3a2a22';
    circle(5 * k, -6 * k, 3.5 * k);
    circle(5 * k, 6 * k, 3.5 * k);
    ctx.globalAlpha = 1;
  }
}

function drawBody(k, pal, ratio) {
  for (const [lx, ly] of [[14, -25], [-14, -25], [14, 25], [-14, 25]]) {
    ellipse(lx * k, ly * k, 7 * k, 9 * k, pal.body);
    ctx.fillStyle = '#f4efe4';
    const sy = Math.sign(ly);
    for (const cx of [-3, 0, 3]) tri((lx + cx - 1.2) * k, (ly + sy * 7) * k, (lx + cx + 1.2) * k, (ly + sy * 7) * k, (lx + cx) * k, (ly + sy * 11) * k);
  }
  ellipse(0, 0, 36 * k, 25 * k, pal.body);
  ellipse(0, 7 * k, 27 * k, 12 * k, pal.belly);
  ctx.fillStyle = pal.spike;
  for (let j = -2; j <= 2; j++) diamond(j * 12 * k, -5 * k, 4.5 * k, 7 * k);
  if (ratio < 0.7) {
    ctx.strokeStyle = `rgba(245,238,220,${Math.min(1, ((0.7 - ratio) / 0.7) * 1.3)})`;
    ctx.lineWidth = 2.6 * k;
    for (let j = -2; j <= 2; j++) {
      ctx.beginPath();
      ctx.moveTo(j * 11 * k, -18 * k);
      ctx.quadraticCurveTo(j * 11 * k + 5 * k, 0, j * 11 * k, 18 * k);
      ctx.stroke();
    }
    ctx.lineWidth = 3.4 * k;
    ctx.beginPath();
    ctx.moveTo(-30 * k, 0);
    ctx.lineTo(30 * k, 0);
    ctx.stroke();
  }
}

function drawTail(k, pal, ratio) {
  ctx.fillStyle = pal.body;
  ctx.beginPath();
  ctx.moveTo(22 * k, -16 * k);
  ctx.quadraticCurveTo(-10 * k, -14 * k, -52 * k, 0);
  ctx.quadraticCurveTo(-10 * k, 14 * k, 22 * k, 16 * k);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = pal.spike;
  [[10, 6], [-5, 5], [-20, 4], [-34, 3]].forEach(([x, sz]) => diamond(x * k, -3 * k, sz * 0.7 * k, sz * k));
  if (ratio < 0.5) {
    ctx.fillStyle = 'rgba(245,238,220,0.9)';
    for (let x = 16; x > -46; x -= 8) circle(x * k, 0, 2.2 * k * (1 - (16 - x) / 90));
  }
}

function drawFullMonster(x, y, K, ang, pal) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.save();
  ctx.translate(-34 * K, 0);
  drawTail(K, pal, 1);
  ctx.restore();
  drawBody(K, pal, 1);
  ctx.translate(42 * K, 0);
  drawHead(K, pal, 1, true);
  ctx.restore();
}

// Canavar parçalarının konumu: parçalar birbirine doğru çekilir, böylece canavar
// bölgeler arasındaki yolun üstüne yığılmış gibi görünür.
function segPositions(chain) {
  const pts = chain.map(center);
  return pts.map((p, k) => {
    let o = null;
    if (pts.length === 2) o = pts[1 - k];
    else if (pts.length === 3 && k !== 1) o = pts[1];
    if (!o) return { x: p.x, y: p.y };
    const f = pts.length === 2 ? 0.34 : 0.36;
    return { x: p.x + (o.x - p.x) * f, y: p.y + (o.y - p.y) * f };
  });
}

function drawCorpse(s) {
  const a = s.attack;
  if (!a || !a.hit) return;
  const pal = a.mutant ? MUTANT_PALETTE : MONSTERS[a.monster];
  const base = (a.mutant ? 1.2 : 1) * 1.1;
  const pos = segPositions(a.chain);
  const segs = a.chain.map((id, k) => {
    const sec = s.sectors[id];
    const ratio = sec.corpseMax > 0 ? sec.corpse / sec.corpseMax : 0;
    return { id, k, ratio, alive: sec.corpse > 0, p: pos[k] };
  });
  if (!segs.some((g) => g.alive)) return;

  for (const g of segs) {
    if (!g.alive) continue;
    const q = 0.5 + 0.5 * g.ratio;
    ellipse(g.p.x, g.p.y + 6, 46 * base * q, 24 * base * q, 'rgba(110,10,20,0.42)');
  }
  ctx.lineCap = 'round';
  for (let k = 0; k < segs.length - 1; k++) {
    const g1 = segs[k];
    const g2 = segs[k + 1];
    if (!g1.alive || !g2.alive) continue;
    const kk = Math.min(scaleK(g1.ratio), scaleK(g2.ratio)) * base;
    ctx.strokeStyle = pal.body;
    ctx.lineWidth = 30 * kk;
    ctx.beginPath();
    ctx.moveTo(g1.p.x, g1.p.y);
    ctx.lineTo(g2.p.x, g2.p.y);
    ctx.stroke();
  }
  const last = segs.length - 1;
  for (const g of segs) {
    if (!g.alive) continue;
    const kk = scaleK(g.ratio) * base;
    let ang = 0;
    if (segs.length > 1) {
      if (g.k === 0) ang = angleOf(segs[1].p, g.p);
      else if (g.k === last && segs.length === 2) ang = angleOf(g.p, segs[0].p);
      else if (g.k === last) ang = angleOf(g.p, segs[g.k - 1].p);
      else ang = angleOf(segs[g.k + 1].p, segs[g.k - 1].p);
    }
    ctx.save();
    ctx.translate(g.p.x, g.p.y);
    ctx.rotate(ang);
    if (g.k === 0) {
      drawHead(kk * 1.1, pal, g.ratio, false);
    } else if (g.k === last && segs.length === 2) {
      ctx.save();
      ctx.translate(-36 * kk, 0);
      drawTail(kk * 0.85, pal, g.ratio);
      ctx.restore();
      drawBody(kk, pal, g.ratio);
    } else if (g.k === last) {
      drawTail(kk * 1.1, pal, g.ratio);
    } else {
      drawBody(kk, pal, g.ratio);
    }
    ctx.restore();
  }
}

/* ---------------- Ekipler & efektler ---------------- */

function drawCrews(s, dt) {
  const a = s.attack;
  const segPos = a ? segPositions(a.chain) : null;
  for (const sec of s.sectors) {
    const L = layouts[sec.id];
    let c = center(sec.id);
    if (segPos && a.chain.includes(sec.id)) c = segPos[a.chain.indexOf(sec.id)];
    for (const type of CREW_TYPES) {
      const n = Math.min(sec.crews[type], 6);
      for (let j = 0; j < n; j++) {
        let tx;
        let ty;
        if (type === 'fire') {
          const f = L.flames[j % L.flames.length];
          tx = f.x + 14;
          ty = f.y + 10;
        } else if (type === 'debris') {
          const p = L.piles[(j * 3) % L.piles.length];
          tx = p.x;
          ty = p.y + 8;
        } else {
          tx = c.x + Math.cos(j * 2.1) * 30;
          ty = c.y + Math.sin(j * 2.1) * 20;
        }
        const x = tx + Math.sin(time * 1.7 + j * 2.3 + sec.id) * 9;
        const y = ty + Math.cos(time * 1.3 + j * 1.1) * 5;
        if (type === 'fire') {
          ctx.strokeStyle = 'rgba(130,205,255,0.75)';
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.lineDashOffset = -time * 30;
          ctx.beginPath();
          ctx.moveTo(x, y - 6);
          ctx.quadraticCurveTo((x + tx - 14) / 2, y - 22, tx - 14, ty - 18);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ellipse(x, y + 8, 7, 2.5);
        emoji(CREWS[type].icon, x, y, 17);
        if (Math.random() < dt * 4) workParticle(type, x, y);
      }
    }
  }
}

function workParticle(type, x, y) {
  const presets = {
    debris: { rgb: '150,128,100', r: 3, grow: 10, vy: -20, a: 0.7 },
    fire: { rgb: '210,225,235', r: 4, grow: 14, vy: -30, a: 0.55 },
    carve: { rgb: '190,30,40', r: 2, grow: 2, vy: -40, a: 0.9, g: 120 },
  };
  const p = presets[type];
  particles.push({
    x: x + (Math.random() - 0.5) * 12, y: y - 4, vx: (Math.random() - 0.5) * 30, vy: p.vy * (0.6 + Math.random() * 0.8),
    g: p.g || 0, r: p.r, grow: p.grow, life: 0, max: 0.9, rgb: p.rgb, a: p.a,
  });
}

function ambient(s, dt) {
  for (const sec of s.sectors) {
    const L = layouts[sec.id];
    if (L.st === 'industry') {
      for (const b of L.lots) {
        if (b.chimTop && b.rank < visibleLots(L.st, sec.level) && Math.random() < dt * 1.2) {
          particles.push({ x: b.chimTop.x, y: b.chimTop.y, vx: 6, vy: -14, g: 0, r: 3, grow: 6, life: 0, max: 2.4, rgb: '185,185,195', a: 0.45 });
        }
      }
    }
    if (sec.fire > 0 && Math.random() < (dt * sec.fire) / 22) {
      const f = L.flames[Math.floor(Math.random() * Math.min(L.flames.length, Math.ceil(sec.fire / 10)))];
      particles.push({ x: f.x, y: f.y - 14, vx: 4 + Math.random() * 6, vy: -22, g: 0, r: 4, grow: 9, life: 0, max: 2, rgb: '50,46,46', a: 0.5 });
    }
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life >= p.max) {
      particles.splice(i, 1);
      continue;
    }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.r += p.grow * dt;
  }
  if (particles.length > 400) particles.splice(0, particles.length - 400);
}

function drawParticles() {
  for (const p of particles) {
    ctx.fillStyle = `rgba(${p.rgb},${p.a * (1 - p.life / p.max)})`;
    circle(p.x, p.y, p.r);
  }
}

function spawnFloat(sector, text, color, big) {
  const c = center(sector);
  floats.push({
    x: c.x + (Math.random() - 0.5) * 50, y: c.y - 10 + (Math.random() - 0.5) * 20,
    text, color: color || '#ffffff', life: 0, max: big ? 1.9 : 1.2, big,
  });
  if (floats.length > 40) floats.shift();
}

function drawFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.life += dt;
    if (f.life >= f.max) {
      floats.splice(i, 1);
      continue;
    }
    const p = f.life / f.max;
    ctx.globalAlpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    ctx.font = `800 ${f.big ? 15 : 12}px system-ui, ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    const y = f.y - p * 30;
    ctx.strokeText(f.text, f.x, y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, y);
    ctx.globalAlpha = 1;
  }
}

function drawLabel(s, i) {
  const r = sectorRect(i);
  const sec = s.sectors[i];
  const name = SECTORS[i].name;
  ctx.font = 'bold 11px system-ui, sans-serif';
  const tw = ctx.measureText(name).width;
  const starW = sec.level ? sec.level * 7 + 4 : 0;
  ctx.fillStyle = 'rgba(10,12,18,0.72)';
  rrect(r.x + 5, r.y + 5, tw + 12 + starW, 16, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, r.x + 11, r.y + 13.5);
  if (sec.level) {
    ctx.fillStyle = '#ffc94a';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText('★'.repeat(sec.level), r.x + 14 + tw, r.y + 13.5);
  }
  if (s.phase === 'cleanup') {
    const work = sec.rubble > 0 || sec.fire > 0 || sec.corpse > 0;
    const crews = sec.crews.fire + sec.crews.debris + sec.crews.carve;
    if (work && !crews) {
      const p = 1 + 0.15 * Math.sin(time * 8);
      ctx.fillStyle = '#ff8a3d';
      circle(r.x + r.w - 14, r.y + 14, 8 * p);
      ctx.fillStyle = '#1d1004';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', r.x + r.w - 14, r.y + 14.5);
    }
  }
  if (getSelected() === i) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#ff8a3d';
    ctx.shadowBlur = 12;
    rrect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 10);
    ctx.stroke();
    ctx.restore();
  }
}

function drawRival(s) {
  for (const sec of s.sectors) {
    if (sec.rubble <= 0 && sec.corpse <= 0 && sec.fire <= 0) continue;
    const c = center(sec.id);
    for (let j = 0; j < 2; j++) {
      emoji('🧹', c.x + Math.sin(time * 2 + j * 3 + sec.id) * 30, c.y + Math.cos(time * 1.6 + j * 2) * 18, 18);
    }
  }
  const p = Math.min(1, s.rivalT / BAL.rivalTime);
  const text = `${RIVAL} temizliyor · %${Math.round(p * 100)}`;
  ctx.font = 'bold 12px system-ui, sans-serif';
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = 'rgba(70,40,140,0.9)';
  rrect(W / 2 - tw / 2 - 10, H / 2 - 13, tw + 20, 26, 13);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2);
}

/* ---------------- Saldırı sinematiği ---------------- */

function drawRobot(x, y, flip) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip ? -1 : 1, 1);
  ctx.fillStyle = 'rgba(255,160,40,0.9)';
  tri(-6, 16, 6, 16, 0, 27 + Math.sin(time * 40) * 4);
  ctx.fillStyle = '#9aa7bd';
  rrect(-12, -14, 24, 30, 5);
  ctx.fill();
  ctx.fillStyle = '#5f6b80';
  ctx.fillRect(-19, -9, 7, 17);
  ctx.fillRect(12, -9, 7, 17);
  ctx.fillStyle = '#c3cbd9';
  rrect(-9, -27, 18, 13, 4);
  ctx.fill();
  ctx.fillStyle = '#35f0ff';
  ctx.fillRect(-6, -23, 12, 4);
  ctx.restore();
}

function drawAttack(s) {
  const a = s.attack;
  const t = a.t;
  const mon = MONSTERS[a.monster];
  const pal = a.mutant ? MUTANT_PALETTE : mon;
  const HIT = BAL.attackHit;

  if (t < HIT) {
    ctx.fillStyle = `rgba(200,20,20,${0.12 + 0.1 * Math.sin(t * 10)})`;
    ctx.fillRect(0, 0, W, H);
  }
  const landing = segPositions(a.chain);
  if (t > 2.0 && t < HIT) {
    const p = (t - 2.0) / (HIT - 2.0);
    for (const c of landing) ellipse(c.x, c.y + 4, 50 * p, 26 * p, 'rgba(0,0,0,0.35)');
  }

  let mx = 240;
  let my = 140;
  if (t < HIT) {
    let K = 1.5 * (a.mutant ? 1.2 : 1);
    let ang = 0;
    let alpha = 1;
    if (t < 1.8) {
      mx = -110 + (t / 1.8) * 350;
      my = 140 + Math.sin(t * 9) * 4;
      const step = Math.floor(t / 0.45);
      if (step !== lastStep) {
        lastStep = step;
        trauma = Math.min(1, trauma + 0.25);
      }
    } else if (t < 2.3) {
      mx = 240 + Math.sin(t * 40) * 3;
      ang = Math.sin(t * 22) * 0.12;
    } else {
      const p = (t - 2.3) / (HIT - 2.3);
      const c = landing[0];
      mx = 240 + (c.x - 240) * p;
      my = 140 + (c.y - 140) * p;
      K *= 1 - 0.45 * p;
      ang = p * 1.2;
      alpha = 1 - p * 0.3;
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    drawFullMonster(mx, my, K, ang, pal);
    ctx.restore();
    if (t > 1.85 && t < 2.3 && Math.sin(t * 50) > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(0, 0, W, H);
    }
  }

  if (t > 0.9 && t < 3.6) {
    let ry;
    if (t < 1.4) ry = 420 - ((t - 0.9) / 0.5) * 120;
    else if (t < HIT) ry = 300 + Math.sin(t * 5) * 4;
    else ry = 300 - ((t - HIT) / (3.6 - HIT)) * 380;
    const robots = [[70, false], [410, true]];
    if (t > 1.4 && t < 2.35 && Math.sin(t * 35) > -0.2) {
      ctx.save();
      ctx.strokeStyle = '#7ff6ff';
      ctx.shadowColor = '#35f0ff';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 3;
      for (const [rx] of robots) {
        ctx.beginPath();
        ctx.moveTo(rx, ry - 22);
        ctx.lineTo(mx + (Math.random() - 0.5) * 20, my + (Math.random() - 0.5) * 16);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (const [rx, flip] of robots) drawRobot(rx, ry, flip);
  }

  if (t < HIT) {
    if (Math.sin(t * 12) > -0.3) caption('⚠️ KAİJU ALARMI ⚠️', W / 2, 28, 24, '#ffdf5d');
    caption(mon.name + (a.mutant ? ' (MUTANT)' : ''), W / 2, 54, 14, '#ffffff');
  } else {
    const p = Math.min(1, (t - HIT) / 0.3);
    caption('💥 DÜŞTÜ!', W / 2, H / 2 - 20, 22 + 14 * p, '#ffffff');
  }
}
