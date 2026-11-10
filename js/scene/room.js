// Static part of a location, built for the diagonal (iso) camera: a cutaway room on a little
// garden plot. Two tall back walls (kitchen wall with cabinets, dining wall with windows), low
// cut front walls with their thickness showing, the open front corner as the door, floors with
// a visible slab edge, the kitchen back row (fridge, sink, cabinets), decor, contact shadows,
// and outside: a raised plot with soil sides, a path to the door, bushes and trees, a backdrop
// gradient (scene.background). KayKit pieces are merged by material (kit.batch); the plot,
// path and greenery are a few merged meshes with vertex colours.
// Stations and tables are dynamic and live in stations.js / tables.js.
//
// The room is described in "canonical" coordinates (kitchen on the z = minZ wall). A layout
// with `swapped` (Harbor Tavern) is the same plan mirrored across x = z: put() swaps x / z and
// turns every piece to PI/2 - ry, so props keep their handedness.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CELL } from './kit.js';

let softTex = null;
function softTexture() {
  if (softTex) return softTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.45, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(c);
  return softTex;
}

const H = Math.PI / 2;

// sky gradient with a band of hills / sea at the bottom (colours: sky top, haze, land)
const viewTex = new Map();
function viewTexture(cols) {
  const key = cols.join();
  if (viewTex.has(key)) return viewTex.get(key);
  const c = document.createElement('canvas');
  c.width = 16; c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, cols[0]);
  g.addColorStop(0.62, cols[1]);
  g.addColorStop(0.66, cols[2]);
  g.addColorStop(1, cols[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  viewTex.set(key, t);
  return t;
}

// backdrop: a soft vertical gradient with a faint vignette (drawn once into scene.background)
const backTex = new Map();
export function backdropTexture(cols) {
  const key = cols.join();
  if (backTex.has(key)) return backTex.get(key);
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, cols[0]);
  g.addColorStop(0.55, cols[1]);
  g.addColorStop(1, cols[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 256);
  const v = ctx.createRadialGradient(32, 120, 20, 32, 120, 170);
  v.addColorStop(0, 'rgba(255,255,255,0.10)');
  v.addColorStop(0.6, 'rgba(255,255,255,0)');
  v.addColorStop(1, 'rgba(40,30,20,0.16)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, 64, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  backTex.set(key, t);
  return t;
}

// Themes: colours of the repainted atlas swatches + backdrop / plot / greenery.
//   base       the shared prop material: counter tops [6,3], fridge [2,1], oven / stove body [1,1]
//   furniture  dining tables + chairs (table_round_A / chair_A use [6,3], _B use [6,0])
//   wall, dining, kitchen: wall and floor swatches
//   view       the sky / scenery painted behind the window openings (top -> bottom)
export const THEMES = {
  inn: {
    background: '#cfe6dc',
    backdrop: ['#bfe1ef', '#e4f0dc', '#f3e6cc'],
    grass: ['#9cc97c', '#86b866'],
    soil: ['#b98a5c', '#8a6040'],
    path: '#e3cfa6',
    pathEdge: '#c9ad7f',
    leaves: ['#7fbf5e', '#5c9e45', '#4a8a3a'],
    trunk: '#8a5a3a',
    flowers: ['#ffd36b', '#ff9fb0', '#ffffff'],
    // lower wainscot ([2,1]) walnut, upper wall ([4,1]) cream plaster
    wall: [{ cell: CELL.wall, top: '#a8724b', bottom: '#7d5133' }, { cell: CELL.trim, top: '#fbf0dc', bottom: '#efdcbc' }],
    // pale sandstone flags: the walnut tables and the guests read clearly on it
    // honey / caramel checker in the dining room (warm, and the walnut tables still read)
    dining: [{ cell: CELL.tileDark, top: '#d6ae7c', bottom: '#cda472' }, { cell: CELL.tileLight, top: '#f1dbb4', bottom: '#ead2a8' }],
    kitchen: [{ cell: CELL.tileDark, top: '#b9c3ca', bottom: '#b0bac2' }, { cell: CELL.tileLight, top: '#f6f3ec', bottom: '#efebe2' }],
    windowLight: '#fff1c9',
    // light natural-wood counter tops, a cream fridge, a brick-red oven
    base: [
      { cell: CELL.wood, top: '#f2d6a6', bottom: '#c99a64' },
      { cell: CELL.fridge, top: '#f4ead6', bottom: '#cbb38c' },
      { cell: CELL.enamel, top: '#c46c4c', bottom: '#87422d' },
    ],
    furniture: [{ cell: CELL.wood, top: '#a46a40', bottom: '#6a3f22' }],
    cupboard: ['#b98258', '#8a5a3a'],
    view: ['#9fd3f0', '#d6eef8', '#a7d08c'],
  },
  harbor: {
    background: '#9fd2e6',
    backdrop: ['#9ed4ec', '#cdeaf4', '#eef6f1'],
    grass: ['#d9b98a', '#c9a676'],     // the pier deck
    soil: ['#8a6446', '#5e4330'],      // pier planks
    path: '#ecdcb6',
    pathEdge: '#b9946a',
    water: '#3f9cc4',
    bed: '#6e4f35',
    fence: '#ffffff',
    fenceDark: '#d6e4ea',
    leaves: ['#8cc76a', '#6aa84f', '#548f40'],
    trunk: '#9a6a44',
    flowers: ['#ffffff', '#ffd36b', '#9fd7ff'],
    wall: [{ cell: CELL.wall, top: '#4f8fb0', bottom: '#3f7896' }, { cell: CELL.trim, top: '#eef7fa', bottom: '#d8eaf1' }],
    dining: [{ cell: CELL.tileDark, top: '#5e9dbb', bottom: '#548fab' }, { cell: CELL.tileLight, top: '#eef4f2', bottom: '#e2ebe9' }],
    // scrubbed deck planks in the kitchen
    kitchen: [{ cell: CELL.tileDark, top: '#c49a6c', bottom: '#b88d60' }, { cell: CELL.tileLight, top: '#d8b384', bottom: '#cfa878' }],
    windowLight: '#eaf8ff',
    // navy counter tops, a white fridge, white enamel stoves and oven
    base: [
      { cell: CELL.wood, top: '#4f84ad', bottom: '#2a557a' },
      { cell: CELL.fridge, top: '#f7fafb', bottom: '#c3d0d8' },
      { cell: CELL.enamel, top: '#f1f5f7', bottom: '#a9bac6' },
    ],
    furniture: [{ cell: CELL.woodDark, top: '#9a6a46', bottom: '#5e3b23' }],
    cupboard: ['#5f93b8', '#3f6f93'],
    view: ['#a6dcf5', '#e6f6fc', '#4fa3c9'],
  },
};

export function themeFor(id) { return THEMES[id] || THEMES.inn; }

// ------------------------------------------------------------------ vertex-coloured shapes
const _c = new THREE.Color();
function colorize(g, top, bottom, y0, y1) {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(top), b = new THREE.Color(bottom);
  for (let i = 0; i < pos.count; i++) {
    const k = Math.min(1, Math.max(0, (pos.getY(i) - y0) / (y1 - y0 || 1)));
    _c.copy(b).lerp(a, k);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function clean(g) {
  // only position / normal / color, non-indexed, so everything merges
  const n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') n.deleteAttribute(k);
  return n;
}

/**
 * Build the static room for a layout. quality: 'high' adds the small decor.
 * Returns { group, tris, focus: Vector3[] (points the camera must frame), theme, mats }.
 */
export function buildRoom(kit, layout, quality = 'high') {
  const theme = themeFor(layout.id);
  const base = theme.base ? kit.themed(layout.id + ':base', theme.base) : kit.materials.base;
  const mats = {
    base,
    furniture: theme.furniture ? kit.themed(layout.id + ':furniture', theme.furniture) : base,
    wall: kit.themed(layout.id + ':wall', theme.wall),
    dining: kit.themed(layout.id + ':dining', theme.dining),
    kitchen: kit.themed(layout.id + ':kitchen', theme.kitchen),
  };
  const b = kit.batch(mats.base);
  const sw = !!layout.swapped;
  // canonical bounds (the layout's own bounds are swapped for a mirrored plan: they are square)
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const decor = quality !== 'low';
  const harbor = layout.id === 'harbor';
  // place a prop in canonical coordinates
  const put = (name, x, y, z, ry = 0, s = 1, mat) => (sw ? b.add(name, z, y, x, H - ry, s, mat) : b.add(name, x, y, z, ry, s, mat));
  const P = (x, z) => (sw ? [z, x] : [x, z]); // canonical -> world floor point
  // stations / door in canonical coordinates
  const C = (p) => (sw ? [p[1], p[0]] : [p[0], p[1]]); // world <-> canonical (its own inverse)
  const door = C(layout.door.pos);
  const K = layout.kitchen.depth || 3.5;   // kitchen L: within K of a back wall
  const reach = layout.kitchen.reach ?? 1.6; // ... up to this coordinate along the walls

  // ---- floors: 4 x 4 tiles plus a strip of 2 x 2 tiles where the size is not a multiple of 4;
  // the slab edge (0.5) shows along the cut front
  const spans = (a0, a1) => {
    const out = [];
    let a = a0;
    for (; a + 4 <= a1 + 1e-6; a += 4) out.push([a, 4]);
    for (; a + 2 <= a1 + 1e-6; a += 2) out.push([a, 2]);
    return out;
  };
  const isKitchen = (x, z) => (x < minX + K && z < reach + 0.5) || (z < minZ + K && x < reach + 0.5);
  for (const [x0, wx] of spans(minX, maxX)) {
    for (const [z0, wz] of spans(minZ, maxZ)) {
      for (let x = x0; x < x0 + wx - 1e-6; x += Math.min(wx, wz)) {
        for (let z = z0; z < z0 + wz - 1e-6; z += Math.min(wx, wz)) {
          const t = Math.min(wx, wz);
          const cx = x + t / 2, cz = z + t / 2;
          put(t === 4 ? 'floor_kitchen' : 'floor_kitchen_small', cx, -0.5, cz, 0, 1, isKitchen(cx, cz) ? mats.kitchen : mats.dining);
        }
      }
    }
  }

  // ---- back walls (full height): back-right (z = minZ) and back-left (x = minX). Plain with
  // cabinets along the kitchen arms, windows over the dining room.
  const WH = 0.86; // wall height scale (4 -> 3.44): a lower box keeps more of the room in view
  const bw = minZ - 0.25, lw = minX - 0.25;
  for (const [a0, w] of spans(minX, maxX)) {
    const c = a0 + w / 2;
    const win = w === 4 && a0 >= reach - 1;
    if (w === 4) {
      put(win ? 'wall_window_open' : 'wall', c, 0, bw, 0, [1, WH, 1], mats.wall);
      put(win ? 'wall_window_open' : 'wall', lw, 0, c, H, [1, WH, 1], mats.wall);
    } else {
      put('wall_half', a0, 0, bw, 0, [1, WH, 1], mats.wall);
      put('wall_half', lw, 0, a0 + 2, H, [1, WH, 1], mats.wall);
    }
  }
  // corner + end pillars (the ends of the tall walls at the side corners)
  put('pillar_A', lw, 0, bw, 0, [1.05, WH * 1.02, 1.05], mats.wall);
  put('pillar_A', lw, 0, maxZ + 0.25, 0, [1.0, WH * 1.02, 1.0], mats.wall);
  put('pillar_A', maxX + 0.25, 0, bw, 0, [1.0, WH * 1.02, 1.0], mats.wall);

  // ---- front walls: cut low (dollhouse), the front corner is open as the door
  const LOW = [1, 0.13, 1];
  const gapFrom = Math.min(door[0], door[1]) - 2.0; // walls stop before the door corner
  let gEnd = minX;
  for (let a0 = minX; a0 + 2 <= gapFrom + 1e-6; a0 += 2) {
    put('wall_half', a0, 0, maxZ + 0.25, 0, LOW, mats.wall);
    put('wall_half', maxX + 0.25, 0, a0 + 2, H, LOW, mats.wall);
    gEnd = a0 + 2;
  }
  put('pillar_A', gEnd, 0, maxZ + 0.25, 0, [0.95, 0.24, 0.95], mats.wall);
  put('pillar_A', maxX + 0.25, 0, gEnd, 0, [0.95, 0.24, 0.95], mats.wall);

  // ---- kitchen L: the cooks' lanes run along the back walls behind the station counters.
  // Shelves high on the walls over the lanes (clear of the cooks' heads), the cooks' corner
  // with a few crates, and past the end of each counter row: sink + fridge on the back-right
  // wall, a dresser with plates and jars on the back-left wall.
  const ctr = layout.kitchen.counter ?? 2.2;
  const rowEnd = reach - 1;  // the counter rows end here (along the walls)
  // wooden wall cupboards (cosier than more cream): the cupboard body swatch repainted
  const cab = kit.themed(layout.id + ':cupboard', [{ cell: CELL.white, top: theme.cupboard[0], bottom: theme.cupboard[1] }, ...(theme.base || []).filter((c) => c.cell === CELL.wood)]);
  for (let a = minX + 2.4; a < rowEnd + 0.6; a += 2) {
    put('kitchencabinet_half', a, -0.55, minZ, 0, [1, 1, 1], cab);
    put('kitchencabinet_half', minX, -0.55, a, H, [1, 1, 1], cab);
  }
  put('kitchencabinet_half', minX + 1.2, -0.55, minZ, 0, [0.6, 1, 1], cab);
  put('kitchencabinet_half', minX, -0.55, minZ + 1.2, H, [0.6, 1, 1], cab);
  put('kitchencounter_sink_backsplash', 2.6, 0, minZ + 1);
  put(harbor ? 'fridge_B' : 'fridge_A', 5.6, 0, minZ + 1);
  put('kitchencabinet', 2.6, -0.3, minZ, 0, [1, 0.9, 1], cab);
  put('kitchencounter_straight_B_backsplash', minX + 0.9, 0, 2.6, H, [1, 1, 0.9]);
  if (decor) {
    put('dishrack_plates', 2.15, 1.0, minZ + 1.05, 0, 0.7);
    put('jar_A_large', 3.2, 1.0, minZ + 1.55, 0, 0.8);
    put('jar_B_medium', 5.4, 2.5, minZ + 1.1, 0, 0.9);
    put('plate_small', minX + 1.2, 1.0, 2.2, 0, 0.8);
    put('plate_small', minX + 1.2, 1.08, 2.2, 0, 0.8);
    put('plate_small', minX + 1.2, 1.16, 2.2, 0, 0.8);
    put('jar_C_large', minX + 0.6, 1.0, 3.05, 0, 0.9);
    put('crate_buns', minX + 1.0, 1.0, 2.75, H, 0.3);
    // the cooks' corner: jars on the shelves
    put('jar_A_medium', minX + 0.3, 2.5, minZ + 1.6, 0, 0.8);
    put('jar_D_medium', minX + 1.6, 2.5, minZ + 0.3, 0, 0.8);
  }

  // ---- the dining walls: crates and a menu stand by the side corners
  if (decor) {
    put('crate', minX + 0.8, 0, maxZ - 1.2, 0.1, 0.5);
    put(harbor ? 'crate_potatoes' : 'crate_carrots', minX + 0.8, 0.4, maxZ - 1.2, -0.1, 0.42);
    put('crate_lettuce', minX + 0.75, 0, maxZ - 2.3, 0.2, 0.42);
    put('crate', maxX - 1.2, 0, minZ + 2.6, -0.1, 0.5);
    put(harbor ? 'crate_onions' : 'crate_tomatoes', maxX - 1.2, 0.4, minZ + 2.6, 0.12, 0.42);
    put('menu', minX + 0.4, 0.0, 4.9, H, 1.6);
  }

  const group = b.build('room:' + layout.id);

  // ---- soft contact shadows along walls and counters (one draw call)
  const shade = new THREE.MeshBasicMaterial({ color: 0x3a2414, alphaMap: softTexture(), transparent: true, opacity: 0.3, depthWrite: false });
  const sb = [];
  const quad = (list, x, z, w, d, y = 0.012, ry = 0) => {
    const g = new THREE.PlaneGeometry(w, d).rotateX(-H);
    const [wx, wz] = P(x, z);
    const r = sw ? H - ry : ry;
    if (r) g.rotateY(r);
    g.translate(wx, y, wz);
    list.push(g);
  };
  const W = maxX - minX;
  const KL = reach - minX; // length of a kitchen arm
  quad(sb, (minX + reach) / 2, minZ + 3.45, KL - 0.4, 0.9);       // in front of the counter rows
  quad(sb, minX + 3.45, (minZ + reach) / 2, 0.9, KL - 0.4);
  quad(sb, (minX + reach) / 2, minZ + 0.3, KL + 0.6, 0.9);        // along the walls behind the lanes
  quad(sb, minX + 0.3, (minZ + reach) / 2, 0.9, KL + 0.6);
  quad(sb, (reach + maxX) / 2, minZ + 0.35, maxX - reach + 0.6, 1.0); // along the dining walls
  quad(sb, minX + 0.35, (reach + maxZ) / 2, 1.0, maxZ - reach + 0.6);
  quad(sb, (minX + maxX) / 2, maxZ - 0.15, W + 1, 0.6);             // along the front walls
  quad(sb, maxX - 0.15, (minZ + maxZ) / 2, 0.6, W + 1);
  const sm = new THREE.Mesh(mergeGeometries(sb), shade);
  sm.renderOrder = 1;
  group.add(sm);
  // warm light falling in through the dining-room windows (additive, one draw call)
  const light = new THREE.MeshBasicMaterial({ color: theme.windowLight, map: softTexture(), transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending });
  const lb = [];
  for (const [a0, w] of spans(minX, maxX)) {
    if (w !== 4 || a0 < reach - 1) continue;
    quad(lb, a0 + 2.6, minZ + 1.9, 3.0, 2.4, 0.02, 0.3);
    quad(lb, minX + 1.9, a0 + 2.6, 2.4, 3.0, 0.02, -0.3);
  }
  if (lb.length) {
    const lm = new THREE.Mesh(mergeGeometries(lb), light);
    lm.renderOrder = 1;
    group.add(lm);
  }

  // ---- the view through the window openings: a soft sky (and hills / sea) behind them
  if (theme.view) {
    const vm = new THREE.MeshBasicMaterial({ map: viewTexture(theme.view), fog: false });
    const vg = [];
    const pane = (x, z, ry) => {
      const g = new THREE.PlaneGeometry(3.4, 3.2);
      const [wx, wz] = P(x, z);
      g.rotateY(sw ? H - ry : ry);
      g.translate(wx, 1.9, wz);
      vg.push(g);
    };
    for (const [a0, w] of spans(minX, maxX)) {
      if (w !== 4 || a0 < reach - 1) continue;
      pane(a0 + 2, bw - 0.45, 0);
      pane(lw - 0.45, a0 + 2, H);
    }
    const view = new THREE.Mesh(mergeGeometries(vg), vm);
    view.name = 'view';
    group.add(view);
  }

  // ---- outside: a raised plot (grass / deck top, soil / plank sides), the path to the door,
  // a picket fence, lanterns, flower beds, bushes and trees: one vertex-coloured mesh
  const og = [];
  const M = 3.6;                  // plot margin around the walls
  const px0 = minX - M, px1 = maxX + M, pz0 = minZ - M, pz1 = maxZ + M;
  const PT = -0.5, PB = -2.4;     // plot top / bottom
  // a box in canonical coordinates (y = bottom), turned by ry, coloured top -> bottom
  const box = (w, h, d, x, y, z, top, bottom = top, ry = 0) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
    colorize(g, top, bottom, 0, h);
    if (ry) g.rotateY(ry);
    const [wx, wz] = P(x, z);
    if (sw) g.rotateY(H - 2 * ry); // mirror: turn to PI/2 - ry
    g.translate(wx, y, wz);
    og.push(g);
    return g;
  };
  {
    const w = px1 - px0, d = pz1 - pz0;
    box(w, 0.3, d, (px0 + px1) / 2, PT - 0.3, (pz0 + pz1) / 2, theme.grass[0], theme.grass[1]);
    box(w - 0.02, PB - (PT - 0.3) < 0 ? (PT - 0.3) - PB : 0.1, d - 0.02, (px0 + px1) / 2, PB, (pz0 + pz1) / 2, theme.soil[0], theme.soil[1]);
  }
  // the path: from the door corner straight out along the diagonal (straight down on screen)
  {
    const len = Math.hypot(px1 - door[0], pz1 - door[1]) + 0.6;
    const path = new THREE.BoxGeometry(2.6, 0.06, len).translate(0, PT + 0.03, len / 2 - 0.3);
    path.rotateY(Math.PI / 4);
    path.translate(door[0] - 0.2, 0, door[1] - 0.2);
    colorize(path, theme.path, theme.path, 0, 1);
    const edge = new THREE.BoxGeometry(3.1, 0.04, len).translate(0, PT + 0.015, len / 2 - 0.3);
    edge.rotateY(Math.PI / 4);
    edge.translate(door[0] - 0.2, 0, door[1] - 0.2);
    colorize(edge, theme.pathEdge, theme.pathEdge, 0, 1);
    og.push(path, edge);
    // stepping stones in the path
    for (let k = 0; k < 4; k++) {
      const t = 1.6 + k * 1.25;
      const st = new THREE.CylinderGeometry(0.42, 0.46, 0.05, 7).translate(door[0] + t * 0.7071 + (k % 2 ? 0.35 : -0.35) * 0.7071, PT + 0.06, door[1] + t * 0.7071 - (k % 2 ? 0.35 : -0.35) * 0.7071);
      colorize(st, theme.pathEdge, theme.pathEdge, 0, 1);
      og.push(st);
    }
  }
  // greenery: round trees behind the back walls, bushes, flowers
  const tree = (x, z, s = 1) => {
    const trunk = new THREE.CylinderGeometry(0.16 * s, 0.24 * s, 1.6 * s, 6).translate(x, PT + 0.8 * s, z);
    colorize(trunk, theme.trunk, theme.trunk, 0, 1);
    og.push(trunk);
    const crowns = [[0, 2.3, 0, 1.15], [0.45, 1.85, 0.3, 0.8], [-0.4, 1.95, -0.2, 0.85], [0.05, 3.0, 0.05, 0.8]];
    for (const [cx, cy, cz, r] of crowns) {
      const g = new THREE.IcosahedronGeometry(r * s, 1).translate(x + cx * s, PT + cy * s, z + cz * s);
      colorize(g, theme.leaves[0], theme.leaves[2], PT + (cy - r) * s, PT + (cy + r) * s);
      og.push(g);
    }
  };
  const bush = (x, z, s = 1) => {
    for (const [cx, cz, r] of [[0, 0, 0.62], [0.5, 0.2, 0.45], [-0.45, 0.15, 0.48]]) {
      const g = new THREE.IcosahedronGeometry(r * s, 1).scale(1, 0.85, 1).translate(x + cx * s, PT + r * 0.55 * s, z + cz * s);
      colorize(g, theme.leaves[0], theme.leaves[2], PT, PT + r * 1.4 * s);
      og.push(g);
    }
  };
  const flower = (x, z, c) => {
    const g = new THREE.IcosahedronGeometry(0.14, 0).translate(x, PT + 0.22, z);
    colorize(g, c, c, 0, 1);
    og.push(g);
    const leaf = new THREE.IcosahedronGeometry(0.17, 0).scale(1, 0.5, 1).translate(x, PT + 0.08, z);
    colorize(leaf, theme.leaves[1], theme.leaves[2], 0, 1);
    og.push(leaf);
  };
  const tuft = (x, z) => {
    for (const [cx, cz, h] of [[0, 0, 0.42], [0.12, 0.08, 0.32], [-0.1, 0.06, 0.3]]) {
      const g = new THREE.ConeGeometry(0.07, h, 4).translate(x + cx, PT + h / 2, z + cz);
      colorize(g, theme.leaves[0], theme.leaves[2], PT, PT + h);
      og.push(g);
    }
  };
  // canonical -> world for the round shapes (positions only)
  const T = (fn) => (x, z, ...a) => { const [wx, wz] = P(x, z); fn(wx, wz, ...a); };
  const tr = T(tree), bu = T(bush), fl = T(flower), tu = T(tuft);
  const dc = door[0]; // the door corner is on the diagonal: dc = door x = door z
  // trees: behind the far corner (they peek over the walls) and at the sides
  tr(minX - 1.9, minZ - 1.7, 1.3);
  tr(minX - 2.0, minZ + 3.6, 1.05);
  tr(minX + 3.6, minZ - 2.0, 1.1);
  tr(minX - 1.6, maxZ - 2.0, 0.95);
  tr(maxX - 2.0, minZ - 1.6, 0.95);
  if (!theme.water) {
    tr(minX - 1.9, maxZ + 1.9, 1.0);
    tr(maxX + 1.9, minZ - 1.9, 1.0);
  }
  if (decor) {
    // flower beds along the outside of the low front walls, with a picket fence in front
    const bedFrom = minX + 1.0, bedTo = dc - 3.0;
    for (const side of [0, 1]) {
      const pos = (a, off) => (side ? [maxX + off, a] : [a, maxZ + off]);
      const ry = side ? H : 0;
      const L2 = bedTo - bedFrom;
      const [bx, bz] = pos((bedFrom + bedTo) / 2, 0.95);
      box(side ? 1.1 : L2, 0.1, side ? L2 : 1.1, bx, PT, bz, theme.bed || '#8a6243');
      let k = side;
      for (let a = bedFrom + 0.4; a < bedTo - 0.2; a += 0.62) {
        const [fx, fz] = pos(a, 0.75 + ((k * 7) % 3) * 0.22);
        fl(fx, fz, theme.flowers[k++ % theme.flowers.length]);
      }
      // picket fence: posts + two rails
      const fFrom = minX - 2.0, fTo = dc - 2.6, off = 2.15;
      for (let a = fFrom; a <= fTo + 1e-6; a += 0.9) {
        const [qx, qz] = pos(a, off);
        box(0.14, 0.78, 0.14, qx, PT, qz, theme.fence || '#f5ead6', theme.fenceDark || '#d9c6a6');
      }
      for (const y of [0.25, 0.55]) {
        const [rx, rz] = pos((fFrom + fTo) / 2, off);
        box(side ? 0.08 : fTo - fFrom, 0.09, side ? fTo - fFrom : 0.08, rx, PT + y, rz, theme.fence || '#f5ead6', theme.fenceDark || '#d9c6a6');
      }
      // a lantern post on each side of the path, a bush at the fence end
      const [lx, lz] = pos(dc + 0.2, 2.15);
      box(0.42, 0.22, 0.42, lx, PT, lz, '#b9a58a', '#9c8a72');
      box(0.2, 1.35, 0.2, lx, PT + 0.2, lz, '#6a4630', '#553623');
      box(0.36, 0.06, 0.36, lx, PT + 1.55, lz, '#4a2f1e');
      box(0.3, 0.38, 0.3, lx, PT + 1.6, lz, '#fff2b8', '#ffcf5a');
      box(0.46, 0.08, 0.46, lx, PT + 1.98, lz, '#4a2f1e');
      box(0.22, 0.12, 0.22, lx, PT + 2.06, lz, '#4a2f1e');
      const [ex, ez] = pos(fTo + 0.9, off + 0.2);
      bu(ex, ez, 0.75);
    }
    bu(minX - 1.2, maxZ + 2.3, 0.9);
    bu(maxX + 2.3, minZ - 1.2, 0.9);
    bu(minX - 2.4, minZ + 7.5, 0.85);
    bu(minX + 7.5, minZ - 2.4, 0.85);
    // grass tufts scattered on the plot
    const tufts = [[minX - 1.2, 0.5], [minX - 2.6, -3.2], [minX - 0.9, 4.2], [minX + 2.0, maxZ + 2.9], [minX + 6.2, maxZ + 2.8],
      [0.5, minZ - 1.2], [-3.2, minZ - 2.6], [4.2, minZ - 0.9], [maxX + 2.9, minZ + 2.0], [maxX + 2.8, minZ + 6.2],
      [dc + 2.9, dc + 1.3], [dc + 1.3, dc + 2.9], [minX - 2.9, minZ - 3.0], [minX + 0.8, minZ - 2.9]];
    for (const [x, z] of tufts) tu(x, z);
  }
  const outside = new THREE.Mesh(mergeGeometries(og.map(clean)), new THREE.MeshLambertMaterial({ vertexColors: true }));
  outside.name = 'outside';
  outside.matrixAutoUpdate = false;
  group.add(outside);

  if (theme.water) {
    // the harbour: the plot is a pier in the sea, with posts and a foam line around it
    const pg = [];
    const post = (x, z) => {
      const g = new THREE.CylinderGeometry(0.28, 0.3, 2.4, 7).translate(x, -1.6, z);
      colorize(g, theme.soil[0], theme.soil[1], -2.8, -0.4);
      pg.push(g);
    };
    for (let a = px0; a <= px1 + 1e-6; a += 2.4) { post(...P(a, pz1 + 0.05)); post(...P(px1 + 0.05, a)); post(...P(a, pz0 - 0.05)); post(...P(px0 - 0.05, a)); }
    const foam = new THREE.BoxGeometry(px1 - px0 + 1.2, 0.04, pz1 - pz0 + 1.2).translate((px0 + px1) / 2, -1.68, (pz0 + pz1) / 2);
    colorize(foam, '#e8f7fb', '#e8f7fb', 0, 1);
    pg.push(foam);
    const pier = new THREE.Mesh(mergeGeometries(pg.map(clean)), new THREE.MeshLambertMaterial({ vertexColors: true }));
    pier.name = 'pier';
    pier.matrixAutoUpdate = false;
    group.add(pier);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-H), new THREE.MeshLambertMaterial({ color: theme.water }));
    sea.position.y = -1.7;
    sea.matrixAutoUpdate = false;
    sea.updateMatrix();
    sea.name = 'sea';
    group.add(sea);
  }

  // points the camera keeps in view: the outer seats of the tables (left), the last station
  // (right), the top of the far corner and the path in front of the door. The side corners of
  // the room may bleed off the screen edges (only a crate and the sink live there).
  const V = (x, y, z) => { const [wx, wz] = P(x, z); return new THREE.Vector3(wx, y, wz); };
  const focus = [
    V(-5.9, 0, 3.0), V(3.0, 0, -5.9),
    V(minX - 0.5, 4 * WH, minZ - 0.5), V(maxX + 0.6, 0, maxZ + 0.6),
  ];
  return { group, tris: b.tris, focus, theme, mats };
}
