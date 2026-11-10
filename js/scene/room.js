// Static part of a location: outside ground, floors, walls, kitchen back row (fridge, sink,
// cabinets), pass counters and decor, all KayKit pieces merged by material (kit.batch).
// Stations and tables are dynamic and live in stations.js / tables.js.
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

// Themes: colours of the repainted atlas swatches + background / outside ground.
export const THEMES = {
  inn: {
    background: '#9fc98f',
    ground: '#8fbf7e',
    path: '#d9c39a',
    // lower wainscot ([2,1]) warm wood, upper wall ([4,1]) cream plaster
    wall: [{ cell: CELL.wall, top: '#b77649', bottom: '#8f5434' }, { cell: CELL.trim, top: '#fbf0dc', bottom: '#efdcbc' }],
    dining: [{ cell: CELL.tileDark, top: '#b98a5e', bottom: '#b08257' }, { cell: CELL.tileLight, top: '#c99a6c', bottom: '#c09163' }],
    kitchen: [{ cell: CELL.tileDark, top: '#c5ccd1', bottom: '#bcc4ca' }, { cell: CELL.tileLight, top: '#f6f3ec', bottom: '#efebe2' }],
    windowLight: '#fff1c9',
    // warmer, slightly softer wood for counters, tables and chairs than the stock orange
    base: [{ cell: CELL.wood, top: '#e29a58', bottom: '#b4652f' }],
  },
  harbor: {
    background: '#7fc4dd',
    ground: '#d9bf8f',
    path: '#b8935f',
    sea: '#6fb9d6',
    wall: [{ cell: CELL.wall, top: '#4f8fb0', bottom: '#3f7896' }, { cell: CELL.trim, top: '#eef7fa', bottom: '#d8eaf1' }],
    dining: [{ cell: CELL.tileDark, top: '#5e9dbb', bottom: '#548fab' }, { cell: CELL.tileLight, top: '#eef4f2', bottom: '#e2ebe9' }],
    kitchen: [{ cell: CELL.tileDark, top: '#c97d5d', bottom: '#b86e50' }, { cell: CELL.tileLight, top: '#f3e6d3', bottom: '#e9dac4' }],
    windowLight: '#eaf8ff',
  },
};

export function themeFor(id) { return THEMES[id] || THEMES.inn; }

/**
 * Build the static room for a layout. quality: 'high' adds the small decor.
 * Returns { group, tris, focus: Vector3[] (points the camera must frame) }.
 */
export function buildRoom(kit, layout, quality = 'high') {
  const theme = themeFor(layout.id);
  const mats = {
    base: theme.base ? kit.themed(layout.id + ':base', theme.base) : kit.materials.base,
    wall: kit.themed(layout.id + ':wall', theme.wall),
    dining: kit.themed(layout.id + ':dining', theme.dining),
    kitchen: kit.themed(layout.id + ':kitchen', theme.kitchen),
  };
  const b = kit.batch(mats.base);
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const decor = quality !== 'low';
  const harbor = layout.id === 'harbor';

  // ---- floors (floor_kitchen: 4 x 4 tile, 0.5 thick)
  const kz = layout.kitchen.maxZ; // kitchen tiles reach under the pass
  for (let x = minX + 2; x < maxX; x += 4) {
    for (let z = minZ + 2; z < maxZ; z += 4) {
      const kitchen = z < kz;
      b.add('floor_kitchen', x, -0.5, z, 0, 1, kitchen ? mats.kitchen : mats.dining);
    }
  }

  // ---- back wall (z = minZ): plain, plain with cabinets / hood, window
  const bw = minZ - 0.25;
  const backPieces = harbor ? ['wall_window_open', 'wall', 'wall'] : ['wall', 'wall', 'wall_window_open'];
  backPieces.forEach((p, i) => b.add(p, minX + 2 + i * 4, 0, bw, 0, 1, mats.wall));
  // side walls (edge-on from the camera, they frame the room)
  for (let z = minZ + 2; z < maxZ; z += 4) {
    b.add(z < 2 && z > -6 ? 'wall_window_open' : 'wall', minX - 0.25, 0, z, H, 1, mats.wall);
    b.add(z < 2 && z > -6 ? 'wall_window_open' : 'wall', maxX + 0.25, 0, z, -H, 1, mats.wall);
  }
  // front wall: low (a dollhouse cut), open at the door
  const dx = layout.door.pos[0];
  const fw = maxZ + 0.25;
  const lowS = [1, 0.28, 1];
  for (let x0 = minX; x0 < maxX - 0.01; x0 += 2) {
    const cx = x0 + 1;
    if (Math.abs(cx - dx) < 1.9) continue; // doorway 4 wide
    b.add('wall_half', x0, 0, fw, 0, lowS, mats.wall);
  }
  // corner posts + door posts
  for (const [x, z] of [[minX - 0.25, minZ - 0.25], [maxX + 0.25, minZ - 0.25]]) b.add('pillar_A', x, 0, z, 0, [1, 0.98, 1], mats.wall);
  for (const x of [minX - 0.25, maxX + 0.25, dx - 2, dx + 2]) b.add('pillar_A', x, 0, fw, 0, [0.9, 0.3, 0.9], mats.wall);

  // ---- kitchen back row (fridge left, sink right, cabinets above)
  const sz = layout.stations[0].pos[1];
  b.add(harbor ? 'fridge_B' : 'fridge_A', minX + 1, 0, sz);
  b.add('kitchencounter_sink_backsplash', maxX - 1, 0, sz);
  if (!harbor) {
    b.add('kitchencabinet', minX + 3, 0, minZ);
    b.add('kitchencabinet', minX + 5, 0, minZ);
    b.add('shelf_papertowel_decorated', 1, 2.75, minZ);
  } else {
    b.add('kitchencabinet', minX + 7, 0, minZ);
    b.add('kitchencabinet', minX + 9, 0, minZ);
    b.add('kitchencabinet_half', minX + 11, 0, minZ);
    b.add('shelf_papertowel_decorated', minX + 5, 2.75, minZ);
  }
  if (decor) {
    b.add('dishrack_plates', maxX - 1.45, 1.0, sz + 0.05, 0, 0.7);
    b.add('papertowel', maxX - 0.35, 1.0, sz - 0.5, 0, 0.8);
  }

  // ---- pass counters with a few things on top
  for (const seg of layout.kitchen.pass) {
    for (let x = seg.x0 + 1; x < seg.x1 - 0.01; x += 2) b.add('kitchencounter_straight_B', x, 0, seg.z);
  }
  if (decor) {
    const P = layout.kitchen.pass;
    const left = P[0], right = P[P.length - 1];
    const lz = left.z;
    // left pass: plates, mugs, jars
    b.add('plate_small', left.x1 - 0.7, 1.0, lz - 0.2, 0, 0.8);
    b.add('plate_small', left.x1 - 0.7, 1.08, lz - 0.2, 0, 0.8);
    b.add('plate_small', left.x1 - 0.7, 1.16, lz - 0.2, 0, 0.8);
    b.add('jar_C_large', left.x0 + 0.6, 1.0, lz - 0.4, 0, 0.9);
    b.add('jar_D_medium', left.x0 + 1.15, 1.0, lz - 0.45, 0, 0.9);
    b.add('menu', left.x1 - 1.8, 1.0, lz + 0.1, 0.3, 1.1);
    // right pass: ketchup / mustard, bowls, a crate of buns
    b.add('ketchup', right.x0 + 0.55, 1.0, lz + 0.05);
    b.add('mustard', right.x0 + 0.9, 1.0, lz + 0.1);
    b.add('bowl_small', right.x0 + 1.7, 1.0, lz - 0.2, 0, 0.75);
    b.add('bowl_small', right.x0 + 1.7, 1.18, lz - 0.2, 0, 0.75);
    b.add('crate_buns', right.x1 - 0.85, 1.0, lz - 0.15, 0.1, 0.38);
  }

  // ---- dining decor: crates by the door, pillars
  if (decor) {
    const cz = maxZ - 1.0;
    const sideL = minX + 0.75, sideR = maxX - 0.75;
    const crateL = harbor ? 'crate_potatoes' : 'crate_carrots';
    const crateR = harbor ? 'crate_onions' : 'crate_tomatoes';
    if (Math.abs(sideL - dx) > 3) {
      b.add('crate', sideL, 0, cz, 0.08, 0.5);
      b.add(crateL, sideL, 0.4, cz, -0.1, 0.42);
      b.add('crate_lettuce', sideL + 1.05, 0, cz + 0.1, 0.25, 0.42);
    }
    if (Math.abs(sideR - dx) > 3) {
      b.add('crate', sideR, 0, cz, -0.06, 0.5);
      b.add(crateR, sideR, 0.4, cz, 0.12, 0.42);
      b.add('crate_cheese', sideR - 1.05, 0, cz + 0.1, -0.2, 0.42);
    }
    // a small host desk with a menu and a mug by the door
    const hx = harbor ? dx + 3.0 : dx - 3.0, hz = maxZ - 0.75;
    b.add('kitchentable_A', hx, 0, hz, 0, [0.62, 0.95, 0.5]);
    b.add('menu', hx - 0.25, 0.95, hz, 0.25, 1.0);
    b.add(harbor ? 'mug_cocoa' : 'mug_juice', hx + 0.3, 0.95, hz + 0.05, 2.4, 0.9);
    // jars on the cabinet line / sink
    b.add('jar_A_large', maxX - 0.4, 1.0, sz + 0.55, 0, 0.8);
  }

  const group = b.build('room:' + layout.id);

  // ---- soft contact shadows along walls and counters + warm window light (2 draw calls)
  const shade = new THREE.MeshBasicMaterial({ color: 0x3a2414, alphaMap: softTexture(), transparent: true, opacity: 0.32, depthWrite: false });
  const light = new THREE.MeshBasicMaterial({ color: theme.windowLight, map: softTexture(), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
  const sb = [], lb = [];
  const quad = (list, x, z, w, d, y = 0.012, ry = 0) => {
    const g = new THREE.PlaneGeometry(w, d).rotateX(-H);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    list.push(g);
  };
  const sw = maxX - minX;
  quad(sb, (minX + maxX) / 2, sz + 1.25, sw + 1, 1.1);                 // under the kitchen row
  for (const seg of layout.kitchen.pass) {
    quad(sb, (seg.x0 + seg.x1) / 2, seg.z + 1.2, seg.x1 - seg.x0 + 0.8, 1.0);    // in front of the pass
    quad(sb, (seg.x0 + seg.x1) / 2, seg.z - 1.15, seg.x1 - seg.x0 + 0.6, 0.8);   // behind it
  }
  quad(sb, minX + 0.25, (minZ + maxZ) / 2, 1.0, maxZ - minZ + 1);      // along the side walls
  quad(sb, maxX - 0.25, (minZ + maxZ) / 2, 1.0, maxZ - minZ + 1);
  quad(sb, (minX + maxX) / 2, maxZ - 0.2, sw + 1, 0.7);                 // along the front wall
  for (const z of [-4, 0]) {                                             // sun through the side windows
    quad(lb, minX + 1.7, z + 0.6, 3.2, 2.2, 0.02, -0.35);
  }
  quad(lb, harbor ? minX + 2.6 : maxX - 2.6, minZ + 2.4, 2.4, 2.0, 0.02, harbor ? -0.25 : 0.25); // and the kitchen window
  const sm = new THREE.Mesh(mergeGeometries(sb), shade);
  sm.renderOrder = 1;
  const lm = new THREE.Mesh(mergeGeometries(lb), light);
  lm.renderOrder = 1;
  group.add(sm, lm);

  // ---- outside ground (plain colour) + a path to the door
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200).rotateX(-H),
    new THREE.MeshLambertMaterial({ color: theme.ground }),
  );
  ground.position.y = -0.52;
  ground.matrixAutoUpdate = false;
  ground.updateMatrix();
  ground.name = 'ground';
  group.add(ground);
  const pathMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 14).rotateX(-H),
    new THREE.MeshLambertMaterial({ color: theme.path }),
  );
  pathMesh.position.set(dx, -0.5, maxZ + 7);
  pathMesh.matrixAutoUpdate = false;
  pathMesh.updateMatrix();
  group.add(pathMesh);
  if (theme.sea) {
    // the harbour: water behind the tavern
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 60).rotateX(-H), new THREE.MeshLambertMaterial({ color: theme.sea }));
    sea.position.set(0, -0.51, minZ - 33);
    sea.matrixAutoUpdate = false;
    sea.updateMatrix();
    group.add(sea);
  }

  // points the camera keeps in view: the floor corners, the station tops, the door
  const focus = [
    new THREE.Vector3(minX - 0.1, 0, maxZ + 0.5), new THREE.Vector3(maxX + 0.1, 0, maxZ + 0.5),
    new THREE.Vector3(minX - 0.1, 2.6, minZ + 0.4), new THREE.Vector3(maxX + 0.1, 2.6, minZ + 0.4),
  ];
  return { group, tris: b.tris, focus, theme, mats };
}
