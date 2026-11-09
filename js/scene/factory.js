// Factory themes and the static hall: floor, walls, windows, props, the
// conveyor belt (scrolling texture), the raw material chute, the dock and
// the delivery truck.
import * as THREE from 'three';
import { STEP, CORNERS, STOCK, DOCK, TRUCK, WALLS } from './layout.js';
import { G, Builder, toyMaterial, canvasTexture, hex, roundRect, radialTexture, shade, mix, rng, ease, clamp, TAU } from './kit.js';

export const BELT_Y = 0.3; // top of the belt surface (items sit here)
export const HALL_Z = DOCK[1] + 0.55; // floor tiles end here, the yard starts
const BELT_W = 0.72;

// ------------------------------------------------------------------ themes
const BASE = {
  wood: {
    key: 'wood',
    skyTop: 0x9fdcff, skyBottom: 0xe4f7ff,
    floorA: 0xffe8bf, floorB: 0xffdba3, grout: 0xf6cf8f,
    wall: 0x8fd6ff, wallLow: 0x5dbcf2, trim: 0xffffff,
    grass: 0x8ddc6a, grassDark: 0x6cc653, road: 0x7c86a6, roadLine: 0xffffff,
    belt: 0x4b587c, beltStripe: 0x8a98c8, rail: 0xffc23c, railLow: 0xff9f1c,
    machines: ['saw', 'assembly', 'paint', 'wrap'],
    machineColor: [0xff8a3d, 0x25c1b4, 0x9b6bff, 0xff5a7a],
    worker: { hat: 0xffcc29, hatBand: 0xff9f1c, suit: 0x3f8cff, shirt: 0xffffff, hair: 0x6b3f25, boots: 0x5b4636 },
    truck: 0xff5a5f, truckTrim: 0xffffff, truckDark: 0x3a3f5c,
    toy: [0xff5a5f, 0x3fa9f5, 0xffcc29, 0x4fd18b, 0xff8ad8, 0x9b6bff],
    box: [0x6c8cff, 0xff6b9a, 0x4fd18b, 0xffb03a, 0x2ec4b6],
    ribbon: 0xffe14d,
    wood: 0xe9b36f, woodDark: 0xc98a4b,
    plant: 0x4fc76a, pot: 0xff8a5c,
    accent: [0xff6b6b, 0xffc23c, 0x4fd18b, 0x6c8cff],
    logo: 'star',
  },
  teddy: {
    key: 'teddy',
    skyTop: 0xffc9e4, skyBottom: 0xfff0f7,
    floorA: 0xffe3ef, floorB: 0xffd1e4, grout: 0xf9bcd6,
    wall: 0xb7a6ff, wallLow: 0x9b86f5, trim: 0xffffff,
    grass: 0x9be27a, grassDark: 0x7fd062, road: 0x8a7fa8, roadLine: 0xffffff,
    belt: 0x5a4b7c, beltStripe: 0xa08fd0, rail: 0x66d9c2, railLow: 0x3fc0a6,
    machines: ['cutter', 'stuffing', 'stitching', 'ribbon'],
    machineColor: [0x4fb8ff, 0x49d6a0, 0xffc93c, 0xff7eb6],
    worker: { hat: 0xff7eb6, hatBand: 0xffffff, suit: 0x8f7bff, shirt: 0xfff6d6, hair: 0x4a2b1d, boots: 0x6a4a6e },
    truck: 0x8f7bff, truckTrim: 0xffffff, truckDark: 0x3d345e,
    toy: [0xc8945f, 0xf2c38f, 0xfff4e6, 0xa8724a, 0xffb3c8, 0xd9b38c],
    box: [0x66d9c2, 0xff7eb6, 0xffd166, 0x8fb7ff, 0xc9a7ff],
    ribbon: 0xff4f6d,
    fabric: 0xd9a066, fabricPink: 0xff9fc2,
    wood: 0xe9b36f, woodDark: 0xc98a4b,
    plant: 0x5fd08a, pot: 0xff9ec4,
    accent: [0xff7eb6, 0xffd166, 0x66d9c2, 0x8f7bff],
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
  };
}

// ---------------------------------------------------------------- textures
function floorTexture(t) {
  return canvasTexture(256, 256, (ctx, w) => {
    ctx.fillStyle = hex(t.grout);
    ctx.fillRect(0, 0, w, w);
    const half = w / 2, g = 6;
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = hex((i + j) % 2 ? t.floorB : t.floorA);
      roundRect(ctx, i * half + g / 2, j * half + g / 2, half - g, half - g, 14);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(ctx, i * half + g / 2 + 10, j * half + g / 2 + 8, half - g - 40, 10, 5);
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
    for (let i = 0; i < 26; i++) {
      const x = r() * w, y = r() * w;
      ctx.beginPath(); ctx.ellipse(x, y, 5 + r() * 4, 3 + r() * 2, 0, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let i = 0; i < 10; i++) {
      const x = r() * w, y = r() * w;
      ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
    }
  }, { repeat: true });
}

function beltTexture(t) {
  // chevrons pointing along +u (the travel direction)
  return canvasTexture(128, 64, (ctx, w, h) => {
    ctx.fillStyle = hex(t.belt);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hex(t.beltStripe);
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const ox of [0, 64]) {
      ctx.beginPath();
      ctx.moveTo(ox + 16, 12);
      ctx.lineTo(ox + 40, 32);
      ctx.lineTo(ox + 16, 52);
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

  // floor (hall) and yard
  const floorTex = floorTexture(theme);
  disposables.push(floorTex);
  const x0 = WALLS.x - 0.25, z0 = WALLS.z - 0.25, x1 = 26, z1 = HALL_Z, tile = 2.4;
  const floorGeo = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  remapUV(floorGeo, tile, 0.6, 0.6);
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.name = 'floor';
  group.add(floor);

  const grassTex = grassTexture(theme);
  disposables.push(grassTex);
  const yardGeo = new THREE.PlaneGeometry(50, 30).rotateX(-Math.PI / 2).translate(2, -0.01, HALL_Z + 15);
  remapUV(yardGeo, 3.2, 0, 0);
  const yard = new THREE.Mesh(yardGeo, new THREE.MeshLambertMaterial({ map: grassTex }));
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

function buildWalls(b, d, t) {
  const H = WALLS.height, T = 0.26;
  const zEnd = HALL_Z - 0.1;
  const xEnd = 24;
  const wx = WALLS.x - T / 2, wz = WALLS.z - T / 2;
  // back-right wall (runs along X) and back-left wall (runs along Z)
  b.add(G.box(xEnd - WALLS.x + T, H, T, 0.04), t.wall, (xEnd + WALLS.x) / 2 - T / 2, H / 2, wz);
  b.add(G.box(T, H, zEnd - WALLS.z + T, 0.04), t.wall, wx, H / 2, (zEnd + WALLS.z) / 2 - T / 2);
  // lower band + top cap + skirting
  b.add(G.box(xEnd - WALLS.x + T + 0.02, 0.62, T + 0.04, 0.04), t.wallLow, (xEnd + WALLS.x) / 2 - T / 2, 0.31, wz);
  b.add(G.box(T + 0.04, 0.62, zEnd - WALLS.z + T + 0.02, 0.04), t.wallLow, wx, 0.31, (zEnd + WALLS.z) / 2 - T / 2);
  b.add(G.box(xEnd - WALLS.x + T + 0.06, 0.12, T + 0.12, 0.05), t.trim, (xEnd + WALLS.x) / 2 - T / 2, H, wz);
  b.add(G.box(T + 0.12, 0.12, zEnd - WALLS.z + T + 0.06, 0.05), t.trim, wx, H, (zEnd + WALLS.z) / 2 - T / 2);
  b.add(G.box(xEnd - WALLS.x + T + 0.04, 0.08, T + 0.08, 0.03), t.trim, (xEnd + WALLS.x) / 2 - T / 2, 0.64, wz);
  b.add(G.box(T + 0.08, 0.08, zEnd - WALLS.z + T + 0.04, 0.03), t.trim, wx, 0.64, (zEnd + WALLS.z) / 2 - T / 2);
  // end pillar where the left wall meets the yard
  b.add(G.box(0.46, H + 0.2, 0.46, 0.08), t.trim, wx, (H + 0.2) / 2, zEnd);

  // windows: frame, glass, cross bars, sill
  const glass = 0xcdf3ff, glassHi = 0xffffff;
  const winX = [0.7, 3.1, 5.5, 8.6];
  for (const x of winX) window_(b, x, wz + T / 2 + 0.01, 0);
  const winZ = [-1.5, 1.6];
  for (const z of winZ) window_(b, wx + T / 2 + 0.01, z, 1);
  function window_(bb, x, z, side) {
    const w = 1.5, h = 1.05, y = 1.55;
    const ry = side ? Math.PI / 2 : 0;
    bb.push(x, y, z, { ry });
    bb.add(G.box(w + 0.18, h + 0.18, 0.1, 0.05), t.trim, 0, 0, 0.02);
    bb.add(G.box(w, h, 0.06, 0.02), glass, 0, 0, 0.07);
    bb.add(G.box(0.36, 0.08, 0.02, 0.01), glassHi, -0.42, 0.28, 0.11, { rz: 0.5 });
    bb.add(G.box(0.18, 0.06, 0.02, 0.01), glassHi, -0.2, 0.32, 0.11, { rz: 0.5 });
    bb.add(G.box(0.07, h, 0.08, 0.02), t.trim, 0, 0, 0.1);
    bb.add(G.box(w, 0.07, 0.08, 0.02), t.trim, 0, 0, 0.1);
    bb.add(G.box(w + 0.34, 0.1, 0.24, 0.04), t.trim, 0, -h / 2 - 0.1, 0.12);
    bb.pop();
  }

  // wall decor: clock, poster, shelf with boxes, hanging lamps
  d.push(-0.9, 1.75, wz + T / 2 + 0.02);
  d.add(G.cyl(0.36, 0.36, 0.08, 20), t.trim, 0, 0, 0.04, { rx: Math.PI / 2 });
  d.add(G.cyl(0.3, 0.3, 0.04, 20), 0xfff8e8, 0, 0, 0.09, { rx: Math.PI / 2 });
  d.add(G.box(0.04, 0.2, 0.02, 0.01), 0x3a3f5c, 0, 0.08, 0.12);
  d.add(G.box(0.15, 0.04, 0.02, 0.01), 0x3a3f5c, 0.06, 0, 0.12);
  d.pop();
  // poster on the left wall
  d.push(wx + T / 2 + 0.02, 1.5, 0.15, { ry: Math.PI / 2 });
  d.add(G.box(0.95, 1.15, 0.04, 0.03), t.trim, 0, 0, 0);
  d.add(G.box(0.8, 1.0, 0.03, 0.02), t.accent[0], 0, 0, 0.02);
  d.add(G.star(0.26, 0.12, 0.04), t.accent[1], 0, 0.12, 0.05);
  d.add(G.box(0.5, 0.08, 0.02, 0.02), t.trim, 0, -0.3, 0.04);
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
    b.add(G.box(BELT_W + 0.16, BELT_Y - 0.04, len, 0.06), shade(t.belt, -0.15), 0, (BELT_Y - 0.04) / 2, 0);
    // rails
    for (const sx of [-1, 1]) {
      b.add(G.box(0.1, 0.12, len, 0.04), t.rail, sx * (BELT_W / 2 + 0.06), BELT_Y + 0.02, 0);
      b.add(G.box(0.12, 0.12, len - 0.02, 0.04), t.railLow, sx * (BELT_W / 2 + 0.09), 0.12, 0);
    }
    // little feet
    const n = Math.max(1, Math.floor(len / 1.2));
    for (let k = 0; k <= n; k++) {
      const z = -len / 2 + 0.3 + (k * (len - 0.6)) / n;
      for (const sx of [-1, 1]) b.add(G.cyl(0.06, 0.08, 0.06, 8), 0x3a3f5c, sx * (BELT_W / 2 + 0.05), 0.03, z);
    }
    b.pop();
  }
  // corner bases (turntables sit on top, see stations.js)
  for (const [x, z] of CORNERS) {
    b.add(G.cyl(0.66, 0.7, BELT_Y - 0.04, 24), shade(t.belt, -0.15), x, (BELT_Y - 0.04) / 2, z);
    b.add(G.torus(0.66, 0.06, 6, 28), t.rail, x, BELT_Y - 0.02, z, { rx: Math.PI / 2 });
    SHADOW_SPOTS.push([x, z, 1.0]);
  }
}

function buildChute(b, t) {
  // raw material hatch in the back wall, feeding the belt toward station 1
  const [x, z] = STOCK;
  const wz = WALLS.z;
  b.push(x, 0, wz + 0.35);
  b.add(G.box(1.5, 1.35, 0.7, 0.12), t.trim, 0, 0.68, 0);
  b.add(G.box(1.1, 0.75, 0.2, 0.08), 0x3a3550, 0, 0.62, 0.3);
  // awning with stripes
  for (let i = 0; i < 5; i++) {
    b.add(G.box(0.34, 0.12, 0.62, 0.05), i % 2 ? t.trim : t.accent[0], -0.62 + i * 0.31, 1.42, 0.3, { rx: 0.35 });
  }
  b.pop();
  SHADOW_SPOTS.push([x, wz + 0.4, 1.0]);
}

function buildDock(b, t) {
  const [x, z] = DOCK;
  // dock bumpers and a hazard-striped edge at the belt end
  b.push(x, 0, z + 0.05);
  for (let i = 0; i < 6; i++) b.add(G.box(0.26, 0.07, 0.3, 0.03), i % 2 ? 0x3a3f5c : 0xffd23c, -0.66 + i * 0.264, 0.035, 0.32);
  b.add(G.box(0.24, 0.5, 0.2, 0.06), 0x3a3f5c, -0.75, 0.25, 0.38);
  b.add(G.box(0.24, 0.5, 0.2, 0.06), 0x3a3f5c, 0.75, 0.25, 0.38);
  b.pop();
}

function buildYard(b, d, t) {
  // road for the truck, from the dock out to the bottom of the screen
  const [tx] = TRUCK;
  const z0 = HALL_Z, z1 = HALL_Z + 18;
  b.add(G.box(2.5, 0.04, z1 - z0, 0.02), t.road, tx, 0.02, (z0 + z1) / 2);
  b.add(G.box(0.12, 0.05, z1 - z0, 0.02), t.roadLine, tx - 1.1, 0.03, (z0 + z1) / 2);
  b.add(G.box(0.12, 0.05, z1 - z0, 0.02), t.roadLine, tx + 1.1, 0.03, (z0 + z1) / 2);
  // curb between hall and yard
  b.add(G.box(30, 0.1, 0.24, 0.04), shade(t.floorB, -0.12), 7, 0.05, HALL_Z);
  // bushes and trees in the yard
  const r = rng(11);
  const bush = (x, z, s) => {
    d.add(G.sphere(10, 8), t.plant, x, 0.35 * s, z, { s: 0.45 * s });
    d.add(G.sphere(10, 8), shade(t.plant, 0.12), x + 0.28 * s, 0.3 * s, z + 0.1 * s, { s: 0.33 * s });
    d.add(G.sphere(10, 8), shade(t.plant, -0.08), x - 0.25 * s, 0.28 * s, z + 0.15 * s, { s: 0.3 * s });
    SHADOW_SPOTS.push([x, z, 0.9 * s]);
  };
  const tree = (x, z, s) => {
    d.add(G.cyl(0.1 * s, 0.14 * s, 0.9 * s, 8), t.woodDark, x, 0.45 * s, z);
    d.add(G.sphere(10, 8), t.plant, x, 1.15 * s, z, { s: 0.6 * s });
    d.add(G.sphere(10, 8), shade(t.plant, 0.15), x + 0.25 * s, 1.35 * s, z + 0.2 * s, { s: 0.36 * s });
    SHADOW_SPOTS.push([x, z, 1.1 * s]);
  };
  bush(4.9, 7.0, 1.0);
  tree(4.1, 8.6, 1.1);
  bush(9.8, 7.4, 0.9);
  tree(10.8, 9.2, 1.0);
  bush(5.3, 9.9, 0.8);
  for (let i = 0; i < 6; i++) {
    // flowers
    const fx = 4.6 + r() * 1.4, fz = 7.6 + r() * 1.6;
    d.add(G.sphere(6, 4), t.accent[i % 4], fx, 0.08, fz, { s: 0.07 });
  }
}

function buildDecor(d, t) {
  // potted plants, crates, a shelf: cheap shapes in open floor spots
  const plant = (x, z, s = 1) => {
    d.add(G.cyl(0.24 * s, 0.18 * s, 0.36 * s, 12), t.pot, x, 0.18 * s, z);
    d.add(G.cyl(0.26 * s, 0.26 * s, 0.06 * s, 12), shade(t.pot, 0.2), x, 0.36 * s, z);
    d.add(G.sphere(10, 8), t.plant, x, 0.62 * s, z, { s: 0.32 * s });
    d.add(G.sphere(10, 8), shade(t.plant, 0.15), x + 0.16 * s, 0.78 * s, z + 0.1 * s, { s: 0.2 * s });
    d.add(G.sphere(10, 8), shade(t.plant, -0.1), x - 0.15 * s, 0.74 * s, z + 0.08 * s, { s: 0.18 * s });
    SHADOW_SPOTS.push([x, z, 0.55 * s]);
  };
  const crate = (x, y, z, s = 0.5, c = t.wood) => {
    d.add(G.box(s, s, s, 0.05), c, x, y + s / 2, z);
    d.add(G.box(s * 1.02, s * 0.14, s * 1.02, 0.03), shade(c, -0.18), x, y + s * 0.3, z);
    d.add(G.box(s * 1.02, s * 0.14, s * 1.02, 0.03), shade(c, -0.18), x, y + s * 0.72, z);
  };
  plant(-2.75, 3.6, 1.0);
  plant(5.3, -2.75, 1.1);
  plant(10.4, 1.0, 1.0);
  // crate stacks
  crate(0.7, 0, 2.6, 0.55);
  crate(1.15, 0, 3.05, 0.45);
  crate(0.85, 0.55, 2.7, 0.42, shade(t.wood, 0.1));
  SHADOW_SPOTS.push([0.9, 2.8, 1.0]);
  crate(6.4, 0, 0.6, 0.5, t.accent[3]);
  crate(6.95, 0, 0.75, 0.42, t.accent[2]);
  SHADOW_SPOTS.push([6.6, 0.7, 0.9]);
  // a little shelf against the back wall with colourful boxes
  const sx = 6.9, sz = WALLS.z + 0.3;
  d.add(G.box(1.6, 0.06, 0.5, 0.02), t.trim, sx, 0.75, sz);
  d.add(G.box(1.6, 0.06, 0.5, 0.02), t.trim, sx, 1.35, sz);
  d.add(G.box(0.06, 1.4, 0.5, 0.02), t.trim, sx - 0.78, 0.7, sz);
  d.add(G.box(0.06, 1.4, 0.5, 0.02), t.trim, sx + 0.78, 0.7, sz);
  for (let i = 0; i < 4; i++) d.add(G.box(0.28, 0.3, 0.3, 0.05), t.accent[i], sx - 0.5 + i * 0.34, 0.93, sz);
  for (let i = 0; i < 3; i++) d.add(G.box(0.34, 0.26, 0.3, 0.05), t.box[i], sx - 0.4 + i * 0.4, 1.51, sz);
  // traffic cone next to the dock
  d.add(G.cone(0.16, 0.4, 12), 0xff8a3d, 8.85, 0.22, DOCK[1] - 0.2);
  d.add(G.box(0.36, 0.04, 0.36, 0.02), 0xff8a3d, 8.85, 0.02, DOCK[1] - 0.2);
}

function buildSunPatches(t) {
  const b = new Builder();
  const wz = WALLS.z, wx = WALLS.x;
  // light falls toward +X +Z (in from the back windows)
  for (const x of [0.7, 3.1, 5.5, 8.6]) {
    b.push(x + 0.55, 0.012, wz + 1.5, { ry: -0.5 });
    b.add(G.plane(1.4, 2.4), 0xfffbe0, 0, 0, 0);
    b.pop();
  }
  for (const z of [-1.5, 1.6]) {
    b.push(wx + 1.5, 0.012, z + 0.55, { ry: 0.5 });
    b.add(G.plane(2.4, 1.4), 0xfffbe0, 0, 0, 0);
    b.pop();
  }
  const m = new THREE.Mesh(b.build(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.32, depthWrite: false }));
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
    // winding so the face points up
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
  let flip = false;
  if (n.getY(0) < 0) flip = true;
  if (flip) { for (let i = 0; i < idx.length; i += 3) { const a = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = a; } g.setIndex(idx); g.computeVertexNormals(); }
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: tex }));
  m.name = 'belt';
  return m;
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
  b.add(G.box(1.36, 0.3, 2.85, 0.1), dark, 0, 0.42, 0);
  // cab (front = +Z)
  b.add(G.box(1.5, 0.95, 1.0, 0.24), c, 0, 1.0, 0.86);
  b.add(G.box(1.42, 0.42, 0.96, 0.18), c, 0, 1.5, 0.78);
  b.add(G.box(1.3, 0.38, 0.06, 0.06), 0xcdf3ff, 0, 1.47, 1.27);  // windscreen
  b.add(G.box(0.06, 0.34, 0.6, 0.05), 0xcdf3ff, 0.72, 1.47, 0.82); // side windows
  b.add(G.box(0.06, 0.34, 0.6, 0.05), 0xcdf3ff, -0.72, 1.47, 0.82);
  b.add(G.box(0.3, 0.06, 0.02, 0.01), 0xffffff, -0.3, 1.58, 1.31, { rz: 0.5 });
  b.add(G.box(1.56, 0.2, 0.2, 0.08), trim, 0, 0.55, 1.36);          // bumper
  b.add(G.cyl(0.11, 0.11, 0.06, 12), 0xfff2a8, 0.5, 0.86, 1.37, { rx: Math.PI / 2 }); // lights
  b.add(G.cyl(0.11, 0.11, 0.06, 12), 0xfff2a8, -0.5, 0.86, 1.37, { rx: Math.PI / 2 });
  b.add(G.box(0.7, 0.1, 0.04, 0.03), shade(c, -0.25), 0, 0.82, 1.37);  // grille
  b.add(G.box(0.36, 0.14, 0.26, 0.07), 0xffd23c, 0, 1.76, 0.75);       // roof light
  // logo on the doors
  for (const sx of [-1, 1]) {
    if (theme.logo === 'heart') {
      b.add(G.sphere(10, 8), trim, sx * 0.76, 1.0, 0.82, { s: 0.11 });
      b.add(G.sphere(10, 8), trim, sx * 0.76, 1.0, 0.98, { s: 0.11 });
      b.add(G.cone(0.15, 0.2, 10), trim, sx * 0.76, 0.88, 0.9, { rx: Math.PI });
    } else {
      b.add(G.star(0.17, 0.08, 0.04), trim, sx * 0.76, 0.98, 0.86, { ry: sx * Math.PI / 2 });
    }
  }
  // cargo bed (open top) with low rails
  b.add(G.box(1.46, 0.12, 1.75, 0.05), shade(c, -0.1), 0, 0.62, -0.5);
  b.add(G.box(0.1, 0.3, 1.75, 0.04), trim, 0.69, 0.82, -0.5);
  b.add(G.box(0.1, 0.3, 1.75, 0.04), trim, -0.69, 0.82, -0.5);
  b.add(G.box(1.46, 0.3, 0.1, 0.04), trim, 0, 0.82, 0.32);
  b.add(G.box(1.46, 0.16, 0.1, 0.04), trim, 0, 0.74, -1.33);
  const bodyMesh = new THREE.Mesh(b.build(), toyMaterial());
  body.add(bodyMesh);
  // wheels
  const wb = new Builder();
  wb.add(G.cyl(0.32, 0.32, 0.26, 18), 0x2f3247, 0, 0, 0, { rz: Math.PI / 2 });
  wb.add(G.cyl(0.16, 0.16, 0.28, 12), 0xdfe4f2, 0, 0, 0, { rz: Math.PI / 2 });
  wb.add(G.cyl(0.06, 0.06, 0.3, 8), shade(c, -0.1), 0, 0, 0, { rz: Math.PI / 2 });
  const wheelGeo = wb.build();
  const wheels = new THREE.InstancedMesh(wheelGeo, toyMaterial(), 4);
  wheels.name = 'truck-wheels';
  group.add(wheels);
  const WHEELS = [[0.7, 0.32, 0.85], [-0.7, 0.32, 0.85], [0.7, 0.32, -0.85], [-0.7, 0.32, -0.85]];
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
      out.set(col ? 0.33 : -0.33, 0.68 + truck.bounceY, -1.05 + row * 0.52).add(group.position);
      return out;
    },
    bounceY: 0,
    addLoad() {
      truck.load++;
      truck.bounce = 1;
      if (truck.load >= TRUCK_CAP) { truck.phase = 'leaving'; truck.t = -0.45; }
    },
    poke() { truck.honk = 1; truck.bounce = 1; },
    update(dt) {
      truck.t += dt;
      let z = park.z;
      let speed = 0;
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
      truck.bounceY = -Math.sin(bb * Math.PI * 3) * 0.05 * bb;
      body.position.y = truck.bounceY + (speed !== 0 ? Math.sin(truck.t * 30) * 0.015 : 0);
      body.scale.set(1 + bb * 0.04 * Math.sin(bb * 9), 1 - bb * 0.05 * Math.sin(bb * 9), 1);
      body.rotation.x = speed * -0.004;
      truck.wheelRot += speed * dt / 0.32;
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
