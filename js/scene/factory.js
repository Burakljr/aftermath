// Factory themes and the static hall: floor, walls, windows, posters, props,
// the conveyor belt (scrolling texture), the raw material chute, the dock,
// the delivery truck (with its driver) and the forklift near the truck.
import * as THREE from 'three';
import { STEP, CORNERS, STOCK, DOCK, TRUCK, WALLS } from './layout.js';
import { G, Builder, PAL, toyMaterial, canvasTexture, hex, roundRect, shade, rng, ease, clamp, TAU } from './kit.js';

export const BELT_Y = 0.3; // top of the belt surface (items sit here)
export const HALL_Z = DOCK[1] + 0.55; // floor ends here, the yard starts
const BELT_W = 0.72;
const INK = PAL.ink;
const PLINTH_INK = 0x3d3357;
const PI = Math.PI;

// ------------------------------------------------------------------ themes
const BASE = {
  wood: {
    key: 'wood',
    skyTop: 0x5cc8ff, skyBottom: 0xb9ecff,
    floor: 'planks', floorA: 0xffc56e, floorB: 0xf5ad55, floorC: 0xffd286, grout: 0xc97b38,
    wall: 0x62c6ff, wallLow: 0x2b8ff0, wallPanel: 0x2280e0, trim: PAL.cream, beam: PAL.yellow,
    grass: 0x63d147, grassDark: 0x4cbb36, road: 0x77729a, roadLine: 0xffffff,
    belt: 0x463a66, beltStripe: PAL.yellow, rail: PAL.orange, railLow: 0xe0661a,
    machines: ['saw', 'assembly', 'paint', 'wrap'],
    machineColor: [PAL.orange, PAL.blue, PAL.purple, PAL.pink],
    worker: { hat: PAL.yellow, hatBand: PAL.orange, suit: PAL.blue, shirt: 0xffffff, hair: 0x6b3a1f, boots: 0x5a3b2a },
    carrier: { hat: PAL.red, hatBand: 0xffffff, suit: PAL.green, shirt: PAL.yellow, hair: 0x3d2414, boots: 0x5a3b2a },
    truck: PAL.red, truckTrim: 0xffffff, truckDark: 0x3d3357,
    toy: [PAL.red, PAL.blue, PAL.yellow, PAL.green, PAL.pink, PAL.purple],
    box: [PAL.blue, PAL.pink, PAL.green, PAL.orange, PAL.purple],
    ribbon: PAL.yellow,
    wood: 0xf2b469, woodDark: 0xc47a3a,
    plant: 0x3ccf55, pot: PAL.orange,
    accent: [PAL.pink, PAL.yellow, PAL.green, PAL.blue, PAL.purple, PAL.orange],
    logo: 'star',
  },
  teddy: {
    key: 'teddy',
    skyTop: 0xff9ccc, skyBottom: 0xffd9ec,
    floor: 'tiles', floorA: 0xffb3d0, floorB: 0xffe2ee, floorC: 0xffc9de, grout: 0xee86b2,
    wall: 0xb08cff, wallLow: PAL.purple, wallPanel: 0x7a4ee8, trim: PAL.cream, beam: PAL.pink,
    grass: 0x6fd65a, grassDark: 0x58c246, road: 0x857ca8, roadLine: 0xffffff,
    belt: 0x48386c, beltStripe: 0x45e0c4, rail: 0x20c9a8, railLow: 0x14a88b,
    machines: ['cutter', 'stuffing', 'stitching', 'ribbon'],
    machineColor: [PAL.blue, PAL.green, PAL.yellow, PAL.pink],
    worker: { hat: PAL.pink, hatBand: 0xffffff, suit: PAL.purple, shirt: PAL.yellow, hair: 0x4a2b1d, boots: 0x6a3f5e },
    carrier: { hat: PAL.blue, hatBand: 0xffffff, suit: PAL.orange, shirt: 0xffffff, hair: 0x2e1a10, boots: 0x6a3f5e },
    truck: PAL.purple, truckTrim: 0xffffff, truckDark: 0x3d3357,
    toy: [0xc8864c, 0xe8ae74, 0xfff0d8, 0x9a6236, 0xff9fbe, 0xd9a670],
    box: [0x36d6b4, PAL.pink, PAL.yellow, PAL.blue, 0xb68cff],
    ribbon: 0xff3d6b,
    fabric: 0xe2a15e, fabricPink: 0xff8fb8,
    wood: 0xf2b469, woodDark: 0xc47a3a,
    plant: 0x3ccf6a, pot: PAL.pink,
    accent: [PAL.pink, PAL.yellow, 0x36d6b4, PAL.blue, PAL.purple, PAL.orange],
    logo: 'heart',
  },
};

/** Theme for a factory config: scene defaults, coloured by config.palette when given. */
export function themeFor(config) {
  const id = String((config && (config.id || config.nameKey)) || 'wood');
  const key = /teddy|bear|plush/i.test(id) ? 'teddy' : 'wood';
  const t = JSON.parse(JSON.stringify(BASE[key]));
  t.key = key;
  t.id = config && config.id ? config.id : key;
  const p = config && config.palette;
  if (p) {
    if (Array.isArray(p.toy) && p.toy.length >= 2 && key === 'wood') t.toy = p.toy.concat(t.toy.slice(p.toy.length));
    if (typeof p.ribbon === 'number' && key === 'teddy') t.ribbon = p.ribbon;
  }
  return t;
}

// ------------------------------------------------------------------- path
/** Belt polyline: chute -> 4 corners -> dock, with cumulative arc lengths. */
export function createPath() {
  const pts = [STOCK, ...CORNERS, DOCK].map(([x, z]) => new THREE.Vector3(x, BELT_Y, z));
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const dirs = [];
  for (let i = 0; i < pts.length - 1; i++) dirs.push(pts[i + 1].clone().sub(pts[i]).normalize());
  const total = acc[acc.length - 1];
  return {
    pts, acc, dirs, total,
    /** arc length of corner i (station i) */
    corner: (i) => acc[i + 1],
    /** position at arc length s -> out (Vector3); returns segment heading (radians, about Y) */
    at(s, out) {
      s = clamp(s, 0, total);
      let i = 0;
      while (i < acc.length - 2 && s > acc[i + 1]) i++;
      const a = pts[i], d = dirs[i];
      out.copy(a).addScaledVector(d, s - acc[i]);
      return Math.atan2(d.x, d.z);
    },
    /** distance from (x, z) to the belt centre line (for walkers hopping over it) */
    dist(x, z) {
      let best = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], d = dirs[i];
        const len = acc[i + 1] - acc[i];
        let t = (x - a.x) * d.x + (z - a.z) * d.z;
        t = t < 0 ? 0 : t > len ? len : t;
        const px = a.x + d.x * t - x, pz = a.z + d.z * t - z;
        const dd = px * px + pz * pz;
        if (dd < best) best = dd;
      }
      return Math.sqrt(best);
    },
  };
}

// ---------------------------------------------------------------- textures
function floorTexture(t) {
  if (t.floor === 'planks') {
    return canvasTexture(256, 256, (ctx, w) => {
      const r = rng(31);
      const rows = 4, rh = w / rows;
      ctx.fillStyle = hex(t.grout);
      ctx.fillRect(0, 0, w, w);
      const cols = [t.floorA, t.floorB, t.floorC];
      for (let row = 0; row < rows; row++) {
        const y = row * rh;
        let x = -((row * 97) % 128);
        while (x < w) {
          const len = 96 + Math.floor(r() * 3) * 32;
          const c = cols[Math.floor(r() * 3)];
          const draw = (ox) => {
            ctx.fillStyle = hex(c);
            roundRect(ctx, x + ox + 2, y + 2, len - 4, rh - 4, 6);
            ctx.fill();
            // top highlight, bottom shade, grain
            ctx.fillStyle = 'rgba(255,255,255,0.32)';
            ctx.fillRect(x + ox + 8, y + 5, len - 16, 4);
            ctx.fillStyle = 'rgba(160,80,20,0.16)';
            ctx.fillRect(x + ox + 6, y + rh - 9, len - 12, 4);
            ctx.fillRect(x + ox + 18, y + rh * 0.45, len * 0.45, 2);
            // nails
            ctx.fillStyle = 'rgba(110,55,20,0.5)';
            ctx.beginPath(); ctx.arc(x + ox + 9, y + rh / 2, 2.6, 0, TAU); ctx.fill();
            ctx.beginPath(); ctx.arc(x + ox + len - 9, y + rh / 2, 2.6, 0, TAU); ctx.fill();
          };
          draw(0);
          if (x + len > w) draw(-w);
          x += len;
        }
      }
    }, { repeat: true });
  }
  return canvasTexture(256, 256, (ctx, w) => {
    ctx.fillStyle = hex(t.grout);
    ctx.fillRect(0, 0, w, w);
    const half = w / 2, g = 7;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = hex((i + j) % 2 ? t.floorB : t.floorA);
      roundRect(ctx, i * half + g / 2, j * half + g / 2, half - g, half - g, 16);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      roundRect(ctx, i * half + g / 2 + 12, j * half + g / 2 + 9, half - g - 44, 9, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(200,60,120,0.12)';
      roundRect(ctx, i * half + g / 2 + 10, j * half + half - g - 16, half - g - 20, 8, 4);
      ctx.fill();
    }
  }, { repeat: true });
}

function grassTexture(t) {
  return canvasTexture(128, 128, (ctx, w) => {
    ctx.fillStyle = hex(t.grass);
    ctx.fillRect(0, 0, w, w);
    const r = rng(7);
    ctx.fillStyle = hex(t.grassDark);
    for (let i = 0; i < 22; i++) {
      const x = r() * w, y = r() * w;
      // little grass tufts (three blades)
      ctx.beginPath();
      ctx.moveTo(x - 6, y + 4); ctx.lineTo(x - 3, y - 6); ctx.lineTo(x, y + 4);
      ctx.lineTo(x + 2, y - 8); ctx.lineTo(x + 4, y + 4); ctx.lineTo(x + 7, y - 5); ctx.lineTo(x + 9, y + 4);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.arc(r() * w, r() * w, 2.2, 0, TAU); ctx.fill(); }
  }, { repeat: true });
}

function beltTexture(t) {
  // chevrons pointing along +u (the travel direction)
  return canvasTexture(128, 64, (ctx, w, h) => {
    ctx.fillStyle = hex(t.belt);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, 0, w, 6); ctx.fillRect(0, h - 6, w, 6);
    ctx.strokeStyle = hex(t.beltStripe);
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const ox of [0, 64]) {
      ctx.beginPath();
      ctx.moveTo(ox + 18, 15);
      ctx.lineTo(ox + 40, 32);
      ctx.lineTo(ox + 18, 49);
      ctx.stroke();
    }
  }, { repeat: true });
}

// ------------------------------------------------------------- environment
export function createEnvironment(theme, preset) {
  const group = new THREE.Group();
  group.name = 'environment';
  const mat = toyMaterial();
  const disposables = [];
  SHADOW_SPOTS.length = 0;

  // floor (hall) and yard: unlit textures (the floor faces the light anyway)
  const floorTex = floorTexture(theme);
  disposables.push(floorTex);
  const x0 = WALLS.x - 0.25, z0 = WALLS.z - 0.25, x1 = 26, z1 = HALL_Z, tile = 2.4;
  const floorGeo = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  remapUV(floorGeo, tile, 0.6, 0.6);
  const floorMat = new THREE.MeshBasicMaterial({ map: floorTex });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.name = 'floor';
  group.add(floor);

  const grassTex = grassTexture(theme);
  disposables.push(grassTex);
  const yardGeo = new THREE.PlaneGeometry(50, 30).rotateX(-Math.PI / 2).translate(2, -0.01, HALL_Z + 15);
  remapUV(yardGeo, 3.2, 0, 0);
  const yard = new THREE.Mesh(yardGeo, new THREE.MeshBasicMaterial({ map: grassTex }));
  yard.name = 'yard';
  group.add(yard);

  // static props in one merged mesh, decor (hidden on Low) in another
  const b = new Builder();
  const d = new Builder();
  buildWalls(b, d, theme);
  buildBeltFrame(b, theme);
  buildChute(b, theme);
  buildDock(b, theme);
  buildYard(b, d, theme);
  buildDecor(d, theme);
  const staticMesh = new THREE.Mesh(b.build(), mat);
  staticMesh.name = 'env-static';
  group.add(staticMesh);
  const decorMesh = new THREE.Mesh(d.build(), mat);
  decorMesh.name = 'env-decor';
  group.add(decorMesh);

  // sunlight patches from the windows (decor)
  const sun = buildSunPatches(theme);
  group.add(sun);

  // moving belt surface
  const beltTex = beltTexture(theme);
  disposables.push(beltTex);
  const beltMesh = buildBeltSurface(beltTex);
  group.add(beltMesh);

  function setPreset(p) {
    decorMesh.visible = p.decor;
    sun.visible = p.decor;
  }
  setPreset(preset);

  return {
    group,
    setPreset,
    /** static blob shadow spots [x, z, radius] for the shadow layer */
    shadows: SHADOW_SPOTS.slice(),
    update(dt) {
      beltTex.offset.x -= dt * 0.9;
      if (beltTex.offset.x < -1000) beltTex.offset.x = 0;
    },
    dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      floorMat.dispose(); yard.material.dispose(); beltMesh.material.dispose(); sun.material.dispose();
      for (const t of disposables) t.dispose();
    },
  };
}

function remapUV(geo, tile, ox, oz) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + ox) / tile, -(pos.getZ(i) + oz) / tile);
  uv.needsUpdate = true;
}

const SHADOW_SPOTS = [];

/** framed poster on a wall; local frame: +Z out of the wall */
function poster(bb, t, kind, bg, w = 0.9, h = 1.1) {
  bb.add(G.box(w + 0.14, h + 0.14, 0.06, 0.05), t.trim, 0, 0, 0.03);
  bb.add(G.box(w, h, 0.05, 0.03), bg, 0, 0, 0.06, { ol: 0 });
  const o = { ol: 0.7 };
  if (kind === 'star') {
    bb.add(G.star(0.3, 0.14, 0.05), PAL.yellow, 0, 0.08, 0.1, o);
    bb.add(G.box(w * 0.6, 0.1, 0.03, 0.03), 0xffffff, 0, -0.36, 0.1, { ol: 0 });
  } else if (kind === 'car') {
    bb.add(G.box(0.5, 0.18, 0.05, 0.06), PAL.red, 0, 0.0, 0.1, o);
    bb.add(G.box(0.28, 0.16, 0.05, 0.06), PAL.red, -0.04, 0.15, 0.1, o);
    bb.add(G.cyl(0.08, 0.08, 0.06, 10), INK, -0.15, -0.12, 0.12, { rx: PI / 2, ol: 0 });
    bb.add(G.cyl(0.08, 0.08, 0.06, 10), INK, 0.15, -0.12, 0.12, { rx: PI / 2, ol: 0 });
    bb.add(G.box(w * 0.6, 0.1, 0.03, 0.03), 0xffffff, 0, -0.38, 0.1, { ol: 0 });
  } else if (kind === 'rocket') {
    bb.add(G.cyl(0.11, 0.11, 0.42, 10), 0xffffff, 0, 0.0, 0.1, o);
    bb.add(G.cone(0.11, 0.2, 10), PAL.red, 0, 0.31, 0.1, o);
    bb.add(G.cone(0.08, 0.14, 3), PAL.red, -0.13, -0.15, 0.1, { rz: 0.5, ol: 0.7 });
    bb.add(G.cone(0.08, 0.14, 3), PAL.red, 0.13, -0.15, 0.1, { rz: -0.5, ol: 0.7 });
    bb.add(G.cone(0.08, 0.16, 8), PAL.yellow, 0, -0.3, 0.1, { rx: PI, ol: 0 });
  } else if (kind === 'heart') {
    bb.add(G.heart(0.52, 0.06), PAL.red, 0, 0.06, 0.1, o);
    bb.add(G.box(w * 0.6, 0.1, 0.03, 0.03), 0xffffff, 0, -0.38, 0.1, { ol: 0 });
  } else if (kind === 'bear') {
    bb.add(G.sphere(10, 7), 0xc8864c, 0, 0.02, 0.1, { sx: 0.26, sy: 0.24, sz: 0.06, ol: 0.7 });
    bb.add(G.sphere(8, 6), 0xc8864c, -0.2, 0.22, 0.1, { sx: 0.09, sy: 0.09, sz: 0.05, ol: 0.7 });
    bb.add(G.sphere(8, 6), 0xc8864c, 0.2, 0.22, 0.1, { sx: 0.09, sy: 0.09, sz: 0.05, ol: 0.7 });
    bb.add(G.sphere(8, 6), 0xfff0d8, 0, -0.05, 0.15, { sx: 0.1, sy: 0.07, sz: 0.03, ol: 0 });
    bb.add(G.sphere(6, 4), INK, -0.08, 0.07, 0.16, { s: 0.03, ol: 0 });
    bb.add(G.sphere(6, 4), INK, 0.08, 0.07, 0.16, { s: 0.03, ol: 0 });
    bb.add(G.box(w * 0.6, 0.1, 0.03, 0.03), 0xffffff, 0, -0.38, 0.1, { ol: 0 });
  }
}

function buildWalls(b, d, t) {
  const H = WALLS.height, T = 0.26;
  const zEnd = HALL_Z - 0.1;
  const xEnd = 24;
  const wx = WALLS.x - T / 2, wz = WALLS.z - T / 2;
  const lenX = xEnd - WALLS.x + T, cX = (xEnd + WALLS.x) / 2 - T / 2;
  const lenZ = zEnd - WALLS.z + T, cZ = (zEnd + WALLS.z) / 2 - T / 2;
  const LOW = 0.86;
  // back-right wall (runs along X) and back-left wall (runs along Z)
  b.add(G.box(lenX, H, T, 0.03), t.wall, cX, H / 2, wz, { ol: 0 });
  b.add(G.box(T, H, lenZ, 0.03), t.wall, wx, H / 2, cZ, { ol: 0 });
  // wainscot (lower band) with vertical boards, chair rail, top beam
  b.add(G.box(lenX + 0.02, LOW, T + 0.06, 0.03), t.wallLow, cX, LOW / 2, wz, { ol: 0 });
  b.add(G.box(T + 0.06, LOW, lenZ + 0.02, 0.03), t.wallLow, wx, LOW / 2, cZ, { ol: 0 });
  for (let x = WALLS.x + 0.3; x < 12; x += 0.55) b.add(G.box(0.05, LOW - 0.16, 0.02, 0), t.wallPanel, x, LOW / 2, wz + T / 2 + 0.035, { ol: 0 });
  for (let z = WALLS.z + 0.3; z < zEnd - 0.2; z += 0.55) b.add(G.box(0.02, LOW - 0.16, 0.05, 0), t.wallPanel, wx + T / 2 + 0.035, LOW / 2, z, { ol: 0 });
  b.add(G.box(lenX + 0.06, 0.1, T + 0.14, 0.04), t.trim, cX, LOW, wz, { ol: 0.8 });
  b.add(G.box(T + 0.14, 0.1, lenZ + 0.06, 0.04), t.trim, wx, LOW, cZ, { ol: 0.8 });
  b.add(G.box(lenX + 0.1, 0.2, T + 0.18, 0.06), t.beam, cX, H, wz);
  b.add(G.box(T + 0.18, 0.2, lenZ + 0.1, 0.06), t.beam, wx, H, cZ);
  // end pillar where the left wall meets the yard, corner post
  b.add(G.box(0.46, H + 0.3, 0.46, 0.1), t.trim, wx, (H + 0.3) / 2, zEnd);
  b.add(G.box(0.4, H + 0.24, 0.4, 0.1), t.beam, wx, (H + 0.24) / 2, wz);

  // windows: rounded frame, sky glass with a cloud, cross bars, flower box
  const winX = [0.75, 3.15, 5.6];
  for (const x of winX) window_(b, x, wz + T / 2 + 0.01, 0);
  const winZ = [-1.45, 1.65];
  for (const z of winZ) window_(b, wx + T / 2 + 0.01, z, 1);
  function window_(bb0, x, z, side) {
    const bb = bb0;
    const w = 1.5, h = 1.1, y = 1.62;
    const ry = side ? Math.PI / 2 : 0;
    bb.push(x, y, z, { ry });
    bb.add(G.box(w + 0.22, h + 0.22, 0.12, 0.08), t.trim, 0, 0, 0.03);
    bb.add(G.box(w, h, 0.06, 0.02), 0x8fdcff, 0, 0, 0.08, { ol: 0 });
    bb.add(G.box(w, h * 0.42, 0.065, 0.02), 0xc6efff, 0, -h * 0.29, 0.082, { ol: 0 });
    // little cloud
    bb.add(G.sphere(8, 5), 0xffffff, -0.28, 0.2, 0.1, { sx: 0.2, sy: 0.12, sz: 0.02, ol: 0 });
    bb.add(G.sphere(8, 5), 0xffffff, -0.12, 0.25, 0.1, { sx: 0.16, sy: 0.14, sz: 0.02, ol: 0 });
    bb.add(G.box(0.3, 0.07, 0.02, 0.01), 0xffffff, 0.38, 0.3, 0.12, { rz: 0.6, ol: 0 });
    bb.add(G.box(0.08, h, 0.1, 0.03), t.trim, 0, 0, 0.11, { ol: 0.7 });
    bb.add(G.box(w, 0.08, 0.1, 0.03), t.trim, 0, 0, 0.11, { ol: 0.7 });
    bb.pop();
    // flower box under the window (decor)
    d.push(x, y, z, { ry });
    d.add(G.box(w * 0.8, 0.2, 0.26, 0.03), t.accent[Math.abs(Math.round(x * 3 + z)) % 4], 0, -h / 2 - 0.2, 0.17);
    for (let k = 0; k < 3; k++) {
      d.add(G.sphere(6, 4), t.plant, -0.38 + k * 0.38, -h / 2 - 0.05, 0.2, { s: 0.15, ol: 0.7 });
      d.add(G.sphere(5, 3), k % 2 ? PAL.yellow : PAL.pink, -0.38 + k * 0.38 + 0.06, -h / 2 + 0.04, 0.31, { s: 0.065, ol: 0 });
    }
    d.pop();
  }

  // bunting flags along the top of both walls (decor)
  const flagCols = t.accent;
  let k = 0;
  for (let x = WALLS.x + 0.35; x < 11.5; x += 0.42) {
    const sag = Math.sin(((x - WALLS.x) / 2.4) * PI) * 0.1;
    d.add(G.cone(0.13, 0.28, 3), flagCols[k++ % flagCols.length], x, H - 0.32 - Math.abs(sag), wz + T / 2 + 0.06, { rx: PI, sz: 0.25, ol: 0.6 });
  }
  for (let z = WALLS.z + 0.35; z < zEnd - 0.3; z += 0.42) {
    const sag = Math.sin(((z - WALLS.z) / 2.4) * PI) * 0.1;
    d.add(G.cone(0.13, 0.28, 3), flagCols[k++ % flagCols.length], wx + T / 2 + 0.06, H - 0.32 - Math.abs(sag), z, { rx: PI, sx: 0.25, ry: PI / 2, ol: 0.6 });
  }

  // clock on the back wall
  d.push(-0.95, 1.8, wz + T / 2 + 0.02);
  d.add(G.cyl(0.38, 0.38, 0.1, 16), t.beam, 0, 0, 0.05, { rx: Math.PI / 2 });
  d.add(G.cyl(0.3, 0.3, 0.04, 16), 0xffffff, 0, 0, 0.11, { rx: Math.PI / 2, ol: 0 });
  d.add(G.box(0.05, 0.2, 0.02, 0), INK, 0, 0.08, 0.14, { ol: 0 });
  d.add(G.box(0.16, 0.05, 0.02, 0), INK, 0.06, 0, 0.14, { ol: 0 });
  d.pop();
  // posters on the left wall and between the back windows
  const kinds = t.key === 'teddy' ? ['heart', 'bear', 'star'] : ['star', 'car', 'rocket'];
  d.push(wx + T / 2 + 0.02, 1.62, 0.1, { ry: Math.PI / 2 });
  poster(d, t, kinds[0], t.accent[0]);
  d.pop();
  d.push(wx + T / 2 + 0.02, 1.62, 3.3, { ry: Math.PI / 2 });
  poster(d, t, kinds[1], t.accent[2], 0.8, 0.95);
  d.pop();
  d.push(7.75, 1.62, wz + T / 2 + 0.02);
  poster(d, t, kinds[2], t.accent[3], 0.8, 0.95);
  d.pop();
}

function buildBeltFrame(b, t) {
  const path = [STOCK, ...CORNERS, DOCK];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const ry = Math.atan2(bx - ax, bz - az);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    b.push(cx, 0, cz, { ry });
    // body
    b.add(G.box(BELT_W + 0.14, BELT_Y - 0.06, len - 0.2, 0.06), shade(t.belt, -0.2), 0, (BELT_Y - 0.06) / 2 + 0.04, 0, { ol: 0 });
    // chunky rails
    for (const sx of [-1, 1]) {
      b.add(G.box(0.14, 0.2, len - 0.5, 0.06), t.rail, sx * (BELT_W / 2 + 0.07), BELT_Y - 0.02, 0, { ol: 0.9 });
    }
    // little legs
    const n = Math.max(1, Math.floor(len / 1.4));
    for (let k = 0; k <= n; k++) {
      const z = -len / 2 + 0.45 + (k * (len - 0.9)) / n;
      for (const sx of [-1, 1]) b.add(G.box(0.1, 0.14, 0.1, 0.03), INK, sx * (BELT_W / 2 + 0.07), 0.07, z, { ol: 0 });
    }
    b.pop();
  }
  // corner bases (turntables sit on top, see stations.js)
  for (const [x, z] of CORNERS) {
    b.add(G.cyl(0.7, 0.74, BELT_Y - 0.06, 18), shade(t.belt, -0.2), x, (BELT_Y - 0.06) / 2 + 0.02, z, { ol: 0.9 });
    b.add(G.torus(0.68, 0.075, 4, 16), t.rail, x, BELT_Y - 0.03, z, { rx: Math.PI / 2, ol: 0.9 });
    SHADOW_SPOTS.push([x, z, 1.0]);
  }
}

function buildChute(b, t) {
  // raw material hatch in the back wall, feeding the belt toward station 1
  const [x] = STOCK;
  const wz = WALLS.z;
  b.push(x, 0, wz + 0.35);
  b.add(G.box(1.6, 1.4, 0.7, 0.14), t.trim, 0, 0.7, 0);
  b.add(G.box(1.12, 0.8, 0.2, 0.08), 0x3a2d55, 0, 0.6, 0.3, { ol: 0 });
  // striped awning
  for (let i = 0; i < 5; i++) {
    b.add(G.box(0.34, 0.14, 0.66, 0.03), i % 2 ? 0xffffff : t.accent[0], -0.66 + i * 0.33, 1.5, 0.32, { rx: 0.35, ol: 0.8 });
  }
  // round sign with the factory logo above
  b.add(G.cyl(0.3, 0.3, 0.08, 16), t.beam, 0, 1.98, 0.08, { rx: PI / 2 });
  if (t.logo === 'heart') b.add(G.heart(0.36, 0.06), PAL.red, 0, 1.97, 0.15, { ol: 0.6 });
  else b.add(G.star(0.2, 0.09, 0.06), PAL.red, 0, 1.98, 0.15, { ol: 0.6 });
  b.pop();
  SHADOW_SPOTS.push([x, wz + 0.4, 1.0]);
}

function buildDock(b, t) {
  const [x, z] = DOCK;
  // hazard-striped edge and bumpers at the belt end
  b.push(x, 0, z + 0.05);
  for (let i = 0; i < 6; i++) b.add(G.box(0.26, 0.07, 0.3, 0.02), i % 2 ? INK : PAL.yellow, -0.66 + i * 0.264, 0.035, 0.32, { ol: 0 });
  b.add(G.box(0.26, 0.55, 0.22, 0.08), INK, -0.75, 0.27, 0.38, { ol: 0 });
  b.add(G.box(0.26, 0.55, 0.22, 0.08), INK, 0.75, 0.27, 0.38, { ol: 0 });
  b.add(G.box(0.3, 0.1, 0.26, 0.04), PAL.yellow, -0.75, 0.55, 0.38);
  b.add(G.box(0.3, 0.1, 0.26, 0.04), PAL.yellow, 0.75, 0.55, 0.38);
  b.pop();
}

function buildYard(b, d, t) {
  // road for the truck, from the dock out to the bottom of the screen
  const [tx] = TRUCK;
  const z0 = HALL_Z, z1 = HALL_Z + 18;
  b.add(G.box(2.6, 0.04, z1 - z0, 0), t.road, tx, 0.02, (z0 + z1) / 2, { ol: 0 });
  for (let z = z0 + 0.6; z < z1; z += 1.2) b.add(G.box(0.12, 0.05, 0.6, 0), t.roadLine, tx, 0.03, z, { ol: 0 });
  b.add(G.box(0.14, 0.06, z1 - z0, 0), shade(t.road, 0.5), tx - 1.36, 0.04, (z0 + z1) / 2, { ol: 0 });
  b.add(G.box(0.14, 0.06, z1 - z0, 0), shade(t.road, 0.5), tx + 1.36, 0.04, (z0 + z1) / 2, { ol: 0 });
  // chunky curb between hall and yard
  b.add(G.box(30, 0.14, 0.3, 0.05), t.trim, 7, 0.07, HALL_Z, { ol: 0.8 });
  // bushes and trees in the yard
  const r = rng(11);
  const bush = (x, z, s) => {
    d.add(G.sphere(8, 6), t.plant, x, 0.36 * s, z, { s: 0.46 * s });
    d.add(G.sphere(7, 5), shade(t.plant, 0.15), x + 0.3 * s, 0.3 * s, z + 0.12 * s, { s: 0.33 * s });
    d.add(G.sphere(7, 5), shade(t.plant, -0.08), x - 0.27 * s, 0.28 * s, z + 0.16 * s, { s: 0.3 * s });
    SHADOW_SPOTS.push([x, z, 0.9 * s]);
  };
  const tree = (x, z, s) => {
    d.add(G.cyl(0.11 * s, 0.15 * s, 0.9 * s, 8), t.woodDark, x, 0.45 * s, z);
    d.add(G.sphere(9, 6), t.plant, x, 1.2 * s, z, { s: 0.62 * s });
    d.add(G.sphere(7, 5), shade(t.plant, 0.15), x + 0.28 * s, 1.42 * s, z + 0.22 * s, { s: 0.36 * s });
    SHADOW_SPOTS.push([x, z, 1.1 * s]);
  };
  bush(4.9, 7.0, 1.0);
  tree(4.1, 8.6, 1.1);
  bush(9.9, 7.5, 0.9);
  tree(10.9, 9.2, 1.0);
  for (let i = 0; i < 7; i++) {
    const fx = 4.6 + r() * 1.5, fz = 7.6 + r() * 1.6;
    d.add(G.sphere(6, 4), t.accent[i % 4], fx, 0.09, fz, { s: 0.08, ol: 0.6 });
  }
}

function buildDecor(d, t) {
  // potted plants, crates, a shelf, pallets: chunky shapes in open floor spots
  const plant = (x, z, s = 1) => {
    d.add(G.cyl(0.25 * s, 0.19 * s, 0.38 * s, 12), t.pot, x, 0.19 * s, z);
    d.add(G.cyl(0.28 * s, 0.28 * s, 0.08 * s, 12), shade(t.pot, 0.25), x, 0.38 * s, z);
    d.add(G.sphere(8, 6), t.plant, x, 0.66 * s, z, { s: 0.34 * s });
    d.add(G.sphere(6, 5), shade(t.plant, 0.15), x + 0.17 * s, 0.82 * s, z + 0.1 * s, { s: 0.21 * s });
    d.add(G.sphere(6, 5), shade(t.plant, -0.1), x - 0.16 * s, 0.78 * s, z + 0.08 * s, { s: 0.19 * s });
    SHADOW_SPOTS.push([x, z, 0.55 * s]);
  };
  const crate = (x, y, z, s = 0.5, c = t.wood) => {
    d.add(G.box(s, s, s, 0.05), c, x, y + s / 2, z);
    d.add(G.box(s * 1.03, s * 0.14, s * 1.03, 0.03), shade(c, -0.2), x, y + s * 0.3, z, { ol: 0 });
    d.add(G.box(s * 1.03, s * 0.14, s * 1.03, 0.03), shade(c, -0.2), x, y + s * 0.72, z, { ol: 0 });
  };
  plant(-2.75, 3.6, 1.05);
  plant(5.3, -2.75, 1.1);
  plant(10.4, 1.0, 1.0);
  // crate stacks
  crate(0.7, 0, 2.6, 0.56);
  crate(1.18, 0, 3.08, 0.46);
  crate(0.85, 0.56, 2.7, 0.42, shade(t.wood, 0.12));
  SHADOW_SPOTS.push([0.9, 2.8, 1.0]);
  crate(6.4, 0, 0.6, 0.5, t.accent[3]);
  crate(6.95, 0, 0.75, 0.42, t.accent[2]);
  SHADOW_SPOTS.push([6.6, 0.7, 0.9]);
  // a little shelf against the back wall with colourful boxes
  const sx = 6.9, sz = WALLS.z + 0.3;
  d.add(G.box(1.6, 0.08, 0.5, 0.03), t.trim, sx, 0.75, sz);
  d.add(G.box(1.6, 0.08, 0.5, 0.03), t.trim, sx, 1.35, sz);
  d.add(G.box(0.08, 1.4, 0.5, 0.03), t.trim, sx - 0.78, 0.7, sz);
  d.add(G.box(0.08, 1.4, 0.5, 0.03), t.trim, sx + 0.78, 0.7, sz);
  for (let i = 0; i < 4; i++) d.add(G.box(0.28, 0.3, 0.3, 0.03), t.accent[i], sx - 0.5 + i * 0.34, 0.94, sz, { ol: 0.8 });
  for (let i = 0; i < 3; i++) d.add(G.box(0.34, 0.26, 0.3, 0.03), t.box[i], sx - 0.4 + i * 0.4, 1.52, sz, { ol: 0.8 });
  // pallet with gift boxes where the forklift loads (right of the dock)
  pallet(d, t, FORK.stack[0], FORK.stack[1], true);
  SHADOW_SPOTS.push([FORK.stack[0], FORK.stack[1], 1.0]);
  // water cooler (a carrier takes a break here when not needed)
  {
    const wx = 2.6, wz = 5.5;
    d.add(G.box(0.4, 0.62, 0.36, 0.08), PAL.cream, wx, 0.31, wz);
    d.add(G.box(0.3, 0.1, 0.04, 0.02), 0x3d3357, wx, 0.44, wz + 0.19, { ol: 0 });
    d.add(G.cyl(0.05, 0.05, 0.05, 6), PAL.red, wx - 0.08, 0.5, wz + 0.2, { rx: PI / 2, ol: 0 });
    d.add(G.cyl(0.05, 0.05, 0.05, 6), PAL.blue, wx + 0.08, 0.5, wz + 0.2, { rx: PI / 2, ol: 0 });
    d.add(G.cyl(0.17, 0.17, 0.42, 12), 0x8fdcff, wx, 0.84, wz);
    d.add(G.cyl(0.12, 0.12, 0.06, 10), 0x5fc0ff, wx, 1.07, wz, { ol: 0.6 });
    d.add(G.box(0.05, 0.3, 0.03, 0), 0xffffff, wx - 0.08, 0.86, wz + 0.16, { ol: 0 });
    SHADOW_SPOTS.push([wx, wz, 0.55]);
  }
  // traffic cones next to the dock
  for (const [cx, cz] of [[10.2, 3.0], [6.25, DOCK[1] - 0.15]]) {
    d.add(G.cone(0.17, 0.42, 10), PAL.orange, cx, 0.24, cz);
    d.add(G.cyl(0.11, 0.13, 0.08, 10), 0xffffff, cx, 0.22, cz, { ol: 0 });
    d.add(G.box(0.38, 0.05, 0.38, 0.02), PAL.orange, cx, 0.025, cz, { ol: 0.7 });
  }
}

/** wooden pallet (+ a stack of gift boxes) centred at x, z */
function pallet(bb, t, x, z, boxes, y = 0) {
  bb.add(G.box(0.86, 0.06, 0.86, 0.02), t.wood, x, y + 0.13, z, { ol: 0.8 });
  for (const k of [-1, 0, 1]) bb.add(G.box(0.86, 0.1, 0.14, 0.02), t.woodDark, x, y + 0.05, z + k * 0.34, { ol: 0 });
  if (!boxes) return;
  const cols = t.box;
  bb.add(G.box(0.38, 0.32, 0.38, 0.03), cols[0], x - 0.2, y + 0.32, z - 0.2);
  bb.add(G.box(0.38, 0.32, 0.38, 0.03), cols[1], x + 0.2, y + 0.32, z - 0.2);
  bb.add(G.box(0.38, 0.32, 0.38, 0.03), cols[2], x - 0.2, y + 0.32, z + 0.2);
  bb.add(G.box(0.38, 0.32, 0.38, 0.03), cols[3], x + 0.2, y + 0.32, z + 0.2);
  bb.add(G.box(0.4, 0.34, 0.4, 0.05), cols[4], x, y + 0.65, z, { ry: 0.3 });
  for (const [ox, oz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) bb.add(G.box(0.39, 0.06, 0.07, 0.01), t.ribbon, x + ox, y + 0.48, z + oz, { ol: 0 });
}

function buildSunPatches() {
  const b = new Builder({ ol: 0 });
  const wz = WALLS.z, wx = WALLS.x;
  // light falls toward +X +Z (in from the back windows)
  for (const x of [0.75, 3.15, 5.6]) {
    b.push(x + 0.55, 0.012, wz + 1.5, { ry: -0.5 });
    b.add(G.plane(1.4, 2.4), 0xfffbe0, 0, 0, 0);
    b.pop();
  }
  for (const z of [-1.45, 1.65]) {
    b.push(wx + 1.5, 0.012, z + 0.55, { ry: 0.5 });
    b.add(G.plane(2.4, 1.4), 0xfffbe0, 0, 0, 0);
    b.pop();
  }
  const m = new THREE.Mesh(b.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false }));
  m.renderOrder = 1;
  m.name = 'sun-patches';
  return m;
}

function buildBeltSurface(tex) {
  const path = [STOCK, ...CORNERS, DOCK];
  const positions = [], uvs = [], idx = [];
  let s = 0, v = 0;
  const w = BELT_W;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const px = -dz * w / 2, pz = dx * w / 2; // perpendicular
    const u0 = s / 0.62, u1 = (s + len) / 0.62;
    positions.push(ax + px, BELT_Y, az + pz, ax - px, BELT_Y, az - pz, bx + px, BELT_Y, bz + pz, bx - px, BELT_Y, bz - pz);
    uvs.push(u0, 1, u0, 0, u1, 1, u1, 0);
    idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    v += 4;
    s += len;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure normals point up whatever the winding
  const n = g.attributes.normal;
  if (n.getY(0) < 0) { for (let i = 0; i < idx.length; i += 3) { const a = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = a; } g.setIndex(idx); g.computeVertexNormals(); }
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex }));
  m.name = 'belt';
  return m;
}

// ------------------------------------------------------- chibi head (props)
/** a small chibi head + cap for drivers (local origin = neck) */
export function chibiHead(b, skin, cap, capBand, hair, s = 1) {
  b.add(G.sphere(10, 7), skin, 0, 0.26 * s, 0, { s: 0.26 * s });
  b.add(G.sphere(8, 6), hair, 0, 0.3 * s, -0.05 * s, { sx: 0.27 * s, sy: 0.22 * s, sz: 0.25 * s, ol: 0 });
  for (const sx of [-1, 1]) {
    b.add(G.sphere(8, 6), INK, sx * 0.085 * s, 0.27 * s, 0.225 * s, { sx: 0.035 * s, sy: 0.05 * s, sz: 0.025 * s, ol: 0 });
    b.add(G.sphere(6, 4), 0xffffff, sx * 0.085 * s + 0.012 * s, 0.288 * s, 0.245 * s, { s: 0.012 * s, ol: 0 });
    b.add(G.sphere(6, 4), 0xff8fa8, sx * 0.15 * s, 0.2 * s, 0.2 * s, { sx: 0.045 * s, sy: 0.028 * s, sz: 0.02 * s, ol: 0 });
  }
  b.add(G.torus(0.04 * s, 0.012 * s, 4, 8, PI), INK, 0, 0.19 * s, 0.245 * s, { rz: PI, ol: 0 });
  b.add(G.hemi(10, 4), cap, 0, 0.34 * s, -0.01 * s, { sx: 0.275 * s, sy: 0.22 * s, sz: 0.275 * s });
  b.add(G.box(0.3 * s, 0.04 * s, 0.18 * s, 0.02), cap, 0, 0.345 * s, 0.25 * s, { rx: -0.1 });
  b.add(G.sphere(6, 4), capBand, 0, 0.56 * s, -0.01 * s, { s: 0.05 * s, ol: 0.7 });
}

// ------------------------------------------------------------------- truck
const TRUCK_CAP = 6;
const TRUCK_AWAY = 11; // distance the truck drives off along +Z

export function createTruck(theme) {
  const group = new THREE.Group();
  group.name = 'truck';
  const body = new THREE.Group();
  group.add(body);
  const b = new Builder();
  const c = theme.truck, trim = theme.truckTrim, dark = theme.truckDark;
  // chassis
  b.add(G.box(1.36, 0.3, 2.9, 0.1), dark, 0, 0.42, 0);
  // cab (front = +Z): chunky rounded block with a big windscreen
  b.add(G.box(1.56, 0.78, 1.06, 0.19), c, 0, 0.92, 0.86);
  b.add(G.box(1.5, 0.14, 0.98, 0.07), c, 0, 1.86, 0.78);
  for (const sx of [-1, 1]) for (const sz of [0.36, 1.2]) b.add(G.box(0.1, 0.62, 0.1, 0.04), c, sx * 0.7, 1.52, sz, { ol: 0.8 });
  b.add(G.box(1.3, 0.05, 0.03, 0), 0xffffff, 0, 1.76, 1.22, { ol: 0 });
  b.add(G.box(1.36, 0.56, 0.06, 0), 0x2e2445, 0, 1.52, 0.36, { ol: 0 }); // dark cab back wall
  // driver in the open cab
  b.push(0.0, 1.16, 0.86);
  b.add(G.box(0.4, 0.3, 0.3, 0.1), PAL.blue, 0, 0.1, -0.05, { ol: 0.8 });
  chibiHead(b, 0xf2b98f, PAL.orange, 0xffffff, 0x4a2b1d, 1.15);
  b.pop();
  b.add(G.cyl(0.18, 0.18, 0.04, 12), PLINTH_INK, 0.26, 1.42, 1.12, { rx: 1.0, ol: 0.6 }); // steering wheel
  b.add(G.box(1.62, 0.22, 0.24, 0.1), trim, 0, 0.56, 1.38);          // bumper
  b.add(G.cyl(0.13, 0.13, 0.08, 12), 0xfff2a8, 0.52, 0.88, 1.39, { rx: Math.PI / 2, ol: 0.7 }); // lights
  b.add(G.cyl(0.13, 0.13, 0.08, 12), 0xfff2a8, -0.52, 0.88, 1.39, { rx: Math.PI / 2, ol: 0.7 });
  b.add(G.box(0.62, 0.16, 0.04, 0.03), shade(c, -0.3), 0, 0.84, 1.4, { ol: 0 });  // grille
  b.add(G.box(0.42, 0.16, 0.28, 0.07), PAL.yellow, 0, 1.84, 0.74);       // roof light
  // logo on the doors
  for (const sx of [-1, 1]) {
    b.add(G.cyl(0.21, 0.21, 0.04, 14), trim, sx * 0.79, 0.98, 0.86, { rz: Math.PI / 2, ol: 0.6 });
    if (theme.logo === 'heart') b.add(G.heart(0.3, 0.05), PAL.red, sx * 0.81, 0.98, 0.86, { ry: sx * Math.PI / 2, ol: 0 });
    else b.add(G.star(0.15, 0.07, 0.04), PAL.yellow, sx * 0.81, 0.98, 0.86, { ry: sx * Math.PI / 2, ol: 0.5 });
  }
  // cargo bed (open top) with chunky rails
  b.add(G.box(1.5, 0.14, 1.8, 0.05), shade(c, -0.12), 0, 0.62, -0.5);
  b.add(G.box(0.12, 0.34, 1.8, 0.05), trim, 0.69, 0.84, -0.5);
  b.add(G.box(0.12, 0.34, 1.8, 0.05), trim, -0.69, 0.84, -0.5);
  b.add(G.box(1.5, 0.34, 0.12, 0.05), trim, 0, 0.84, 0.36);
  b.add(G.box(1.5, 0.2, 0.12, 0.05), trim, 0, 0.76, -1.36);
  b.add(G.box(1.52, 0.08, 0.14, 0.02), c, 0, 0.98, 0.36, { ol: 0 });
  // mudguards
  for (const sx of [-1, 1]) for (const sz of [0.85, -0.85]) b.add(G.box(0.3, 0.12, 0.74, 0.03), dark, sx * 0.72, 0.72, sz, { ol: 0.7 });
  const bodyMesh = new THREE.Mesh(b.build(), toyMaterial());
  body.add(bodyMesh);
  // wheels
  const wb = new Builder();
  wb.add(G.cyl(0.34, 0.34, 0.28, 14), 0x2f2840, 0, 0, 0, { rz: Math.PI / 2 });
  wb.add(G.cyl(0.17, 0.17, 0.3, 10), 0xe9e4f5, 0, 0, 0, { rz: Math.PI / 2, ol: 0 });
  wb.add(G.cyl(0.07, 0.07, 0.32, 6), c, 0, 0, 0, { rz: Math.PI / 2, ol: 0 });
  const wheelGeo = wb.build();
  const wheels = new THREE.InstancedMesh(wheelGeo, toyMaterial(), 4);
  wheels.name = 'truck-wheels';
  group.add(wheels);
  const WHEELS = [[0.72, 0.34, 0.85], [-0.72, 0.34, 0.85], [0.72, 0.34, -0.85], [-0.72, 0.34, -0.85]];
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _ax = new THREE.Vector3(1, 0, 0);

  const park = new THREE.Vector3(TRUCK[0], 0, TRUCK[1]);
  group.position.copy(park);

  const truck = {
    group,
    capacity: TRUCK_CAP,
    load: 0,
    phase: 'parked', // parked | leaving | away | arriving
    t: 0,
    bounce: 0,
    wheelRot: 0,
    honk: 0,
    get parked() { return truck.phase === 'parked' && truck.load < TRUCK_CAP; },
    /** world position of cargo slot k (0..5) on the bed */
    slot(k, out) {
      const col = k % 2, row = (k >> 1) % 3;
      out.set(col ? 0.33 : -0.33, 0.69 + truck.bounceY, -1.05 + row * 0.52).add(group.position);
      return out;
    },
    bounceY: 0,
    addLoad() {
      truck.load = Math.min(TRUCK_CAP, truck.load + 1);
      truck.bounce = 1;
    },
    poke() { truck.honk = 1; truck.bounce = 1; },
    update(dt) {
      truck.t += dt;
      let z = park.z;
      let speed = 0;
      // leave when full, but stay parked a few seconds at least (no frantic back and forth)
      if (truck.phase === 'parked' && truck.load >= TRUCK_CAP && truck.t >= 3) { truck.phase = 'leaving'; truck.t = -0.35; }
      if (truck.phase === 'leaving') {
        const k = clamp(truck.t / 1.1, 0, 1);
        z = park.z + TRUCK_AWAY * k * k;
        speed = TRUCK_AWAY * 2 * k / 1.1;
        if (truck.t >= 1.1) { truck.phase = 'away'; truck.t = 0; truck.load = 0; }
      } else if (truck.phase === 'away') {
        z = park.z + TRUCK_AWAY;
        if (truck.t >= 0.35) { truck.phase = 'arriving'; truck.t = 0; }
      } else if (truck.phase === 'arriving') {
        const k = clamp(truck.t / 1.2, 0, 1);
        const e = 1 - (1 - k) * (1 - k);
        z = park.z + TRUCK_AWAY * (1 - e);
        speed = -TRUCK_AWAY * 2 * (1 - k) / 1.2;
        if (k >= 1) { truck.phase = 'parked'; truck.t = 0; truck.bounce = 0.7; }
      }
      group.position.z = z;
      truck.bounce = Math.max(0, truck.bounce - dt * 2.2);
      const bb = truck.bounce;
      truck.bounceY = -Math.sin(bb * Math.PI * 3) * 0.06 * bb;
      body.position.y = truck.bounceY + (speed !== 0 ? Math.sin(truck.t * 30) * 0.02 : 0);
      body.scale.set(1 + bb * 0.06 * Math.sin(bb * 9), 1 - bb * 0.08 * Math.sin(bb * 9), 1);
      body.rotation.x = speed * -0.005;
      truck.wheelRot += speed * dt / 0.34;
      _q.setFromAxisAngle(_ax, truck.wheelRot);
      for (let i = 0; i < 4; i++) {
        _p.set(WHEELS[i][0], WHEELS[i][1], WHEELS[i][2]);
        _m.compose(_p, _q, _s);
        wheels.setMatrixAt(i, _m);
      }
      wheels.instanceMatrix.needsUpdate = true;
    },
    dispose() { bodyMesh.geometry.dispose(); wheelGeo.dispose(); },
  };
  truck.update(0);
  return truck;
}

// ---------------------------------------------------------------- forklift
/** forklift route: pallet stack (loads here) and the spot beside the truck bed */
export const FORK = { stack: [10.8, 5.0], drop: [8.9, 7.25] };

export function createForklift(theme) {
  const group = new THREE.Group();
  group.name = 'forklift';
  const b = new Builder();
  const Y = PAL.yellow, D = theme.truckDark;
  // body (front = +Z, forks in front)
  b.add(G.box(0.8, 0.36, 1.0, 0.12), Y, 0, 0.36, -0.05);
  b.add(G.box(0.84, 0.16, 0.5, 0.08), D, 0, 0.62, -0.38);              // counterweight
  b.add(G.box(0.5, 0.12, 0.4, 0.06), INK, 0, 0.6, 0.06, { ol: 0 });    // seat base
  b.add(G.box(0.36, 0.3, 0.1, 0.05), PAL.red, 0, 0.78, -0.12);         // seat back
  // roll cage
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(G.box(0.06, 0.78, 0.06, 0), D, sx * 0.34, 0.92, 0.1 + sz * 0.26 - 0.1, { ol: 0.7 });
  b.add(G.box(0.8, 0.07, 0.66, 0.03), Y, 0, 1.33, 0.0);
  // driver
  b.push(0, 0.66, 0.05);
  b.add(G.box(0.3, 0.26, 0.22, 0.1), theme.carrier.suit, 0, 0.12, 0);
  chibiHead(b, 0xc98d64, theme.carrier.hat, 0xffffff, 0x2e1a10, 0.95);
  b.pop();
  // wheels (static)
  for (const sx of [-1, 1]) for (const sz of [0.3, -0.38]) {
    b.add(G.cyl(0.19, 0.19, 0.16, 10), 0x2f2840, sx * 0.4, 0.19, sz, { rz: PI / 2 });
    b.add(G.cyl(0.09, 0.09, 0.17, 6), 0xe9e4f5, sx * 0.4, 0.19, sz, { rz: PI / 2, ol: 0 });
  }
  // mast
  for (const sx of [-1, 1]) b.add(G.box(0.08, 1.2, 0.08, 0), D, sx * 0.24, 0.66, 0.52);
  b.add(G.box(0.56, 0.07, 0.08, 0.02), D, 0, 1.24, 0.52);
  const bodyMesh = new THREE.Mesh(b.build(), toyMaterial());
  group.add(bodyMesh);
  // forks + pallet + boxes (one part, rises and lowers)
  const fb = new Builder();
  fb.add(G.box(0.56, 0.3, 0.06, 0.02), D, 0, 0.15, 0.0);
  for (const sx of [-1, 1]) fb.add(G.box(0.08, 0.04, 0.62, 0.01), 0xb9b2cc, sx * 0.17, 0.02, 0.32);
  const forks = new THREE.Group();
  forks.position.set(0, 0.12, 0.58);
  forks.add(new THREE.Mesh(fb.build(), toyMaterial()));
  group.add(forks);
  const lb = new Builder();
  pallet(lb, theme, 0, 0.34, true, -0.08);
  const load = new THREE.Mesh(lb.build(), toyMaterial());
  load.scale.setScalar(0.72);
  forks.add(load);

  // poses: L = forks in the pallet stack (facing +X), D = forks over the truck bed (facing -X)
  const L = [FORK.stack[0] - 0.95, FORK.stack[1]], DP = [FORK.drop[0], FORK.drop[1]];
  const WAY = [FORK.stack[0] - 0.6, FORK.stack[1] + 1.3];
  const st = { phase: 'load', t: 0, x: L[0], z: L[1], ry: PI / 2, lift: 0, bump: 0, path: null, pi: 0, face: 0 };
  group.position.set(st.x, 0, st.z);

  function turnTo(want, dt, rate = 3.2) {
    let d = want - st.ry;
    while (d > PI) d -= 2 * PI;
    while (d < -PI) d += 2 * PI;
    const step = Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    st.ry += step;
    return Math.abs(d - step) < 0.02;
  }
  /** drive along st.path (turn in place, then go); returns true when done and facing st.face */
  function drive(dt) {
    if (st.pi >= st.path.length) return turnTo(st.face, dt);
    const p = st.path[st.pi];
    const dx = p[0] - st.x, dz = p[1] - st.z, d = Math.hypot(dx, dz);
    if (d < 0.02) { st.pi++; return false; }
    const aligned = turnTo(Math.atan2(dx, dz), dt, 4);
    let dd = st.ry - Math.atan2(dx, dz);
    while (dd > PI) dd -= 2 * PI;
    while (dd < -PI) dd += 2 * PI;
    if (aligned || Math.abs(dd) < 0.35) {
      const step = Math.min(d, 1.5 * dt);
      st.x += (dx / d) * step; st.z += (dz / d) * step;
      st.bump = Math.sin(st.t * 24) * 0.014;
    }
    return false;
  }

  const api = {
    group,
    spot: st,
    update(dt, truck) {
      st.t += dt;
      st.bump = 0;
      const parked = truck && truck.phase === 'parked';
      switch (st.phase) {
        case 'load': // forks under the pallet: lift it
          load.visible = true;
          st.lift = Math.min(1, st.t / 0.7);
          if (st.t > 1.0) { st.phase = 'go'; st.t = 0; st.path = [WAY, DP]; st.pi = 0; st.face = -PI / 2; }
          break;
        case 'go':
          if (drive(dt)) { st.phase = 'wait'; st.t = 0; }
          break;
        case 'wait': // until the truck is parked
          if (parked && st.t > 0.3) { st.phase = 'drop'; st.t = 0; }
          break;
        case 'drop':
          st.lift = 1 + Math.sin(Math.min(1, st.t / 0.5) * PI) * 0.4;
          if (st.t > 0.4 && load.visible) { load.visible = false; if (truck) truck.bounce = Math.max(truck.bounce, 0.6); }
          if (st.t > 0.8) { st.phase = 'back'; st.t = 0; st.path = [WAY, L]; st.pi = 0; st.face = PI / 2; }
          break;
        case 'back':
          st.lift = Math.max(0, st.lift - dt * 2);
          if (drive(dt)) { st.phase = 'pause'; st.t = 0; }
          break;
        default: // pause at the stack
          if (st.t > 1.4) { st.phase = 'load'; st.t = 0; }
      }
      group.position.set(st.x, st.bump, st.z);
      group.rotation.y = st.ry;
      forks.position.y = 0.12 + st.lift * 0.42;
    },
    dispose() { bodyMesh.geometry.dispose(); forks.children[0].geometry.dispose(); load.geometry.dispose(); },
  };
  api.update(0, null);
  return api;
}
