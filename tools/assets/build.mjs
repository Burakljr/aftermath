// Asset pipeline for Heroes' Diner (re-runnable).
//
//   cd tools/assets && npm install
//   node build.mjs [<assets-src-dir>]
//
// <assets-src-dir> holds the two KayKit packs as downloaded (CC0, Kay Lousberg):
//   KayKit-Restaurant-Bits-1.0/   and   KayKit-Character-Pack-Adventures-1.0/
// (default: $ASSETS_SRC). Writes to ../../assets/models/:
//   props.glb      every restaurant piece we use, one named root node per model, one shared
//                  material + a 256 px atlas, quantized (KHR_mesh_quantization)
//   <hero>.glb     knight, mage, barbarian, rogue, rogue_hooded: ONE skinned mesh each (body
//                  parts + hat/cape merged, weapons and shields removed), no animations
//   anims.glb      the skeleton (shared by every hero: identical rigs) + only the clips we use,
//                  constant channels and channels of the IK helper bones removed, resampled
//   manifest.json  file sizes, model names, clip names
// and copies the KayKit licence files to ../../assets/LICENSE-KayKit.txt.
import { NodeIO, Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, prune, quantize, resample, textureCompress, mergeDocuments, weld } from '@gltf-transform/functions';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const OUT = path.join(REPO, 'assets/models');
const SRC = path.resolve(process.argv[2] || process.env.ASSETS_SRC || '');
const R_DIR = path.join(SRC, 'KayKit-Restaurant-Bits-1.0/addons/kaykit_restaurant_bits/Assets/gltf');
const C_ROOT = path.join(SRC, 'KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures');
const C_DIR = path.join(C_ROOT, 'Characters/gltf');
const A_DIR = path.join(C_ROOT, 'Assets/gltf');
if (!fs.existsSync(R_DIR) || !fs.existsSync(C_DIR)) {
  console.error('usage: node build.mjs <dir with KayKit-Restaurant-Bits-1.0 and KayKit-Character-Pack-Adventures-1.0>');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'sharp': sharp });

// ------------------------------------------------------------------ selection
// Restaurant Bits models used by the scene (js/scene/*). Knives are left out (no blades).
const PROPS = [
  // room
  'floor_kitchen', 'floor_kitchen_small', 'wall', 'wall_window_open', 'wall_window_closed', 'wall_doorway',
  'wall_orderwindow', 'wall_orderwindow_decorated', 'wall_half', 'door_A', 'door_B', 'pillar_A', 'pillar_B',
  // kitchen
  'kitchencounter_straight_A', 'kitchencounter_straight_B', 'kitchencounter_straight_A_backsplash',
  'kitchencounter_straight_B_backsplash', 'kitchencounter_straight_decorated', 'kitchencounter_straight_A_decorated',
  'kitchencounter_sink_backsplash', 'kitchencounter_outercorner', 'kitchencounter_innercorner',
  'stove_single', 'stove_multi', 'stove_multi_decorated', 'stove_single_countertop', 'stove_multi_countertop',
  'oven', 'fridge_A', 'fridge_A_decorated', 'fridge_B', 'kitchencabinet', 'kitchencabinet_half', 'extractorhood',
  'kitchentable_A', 'kitchentable_A_large', 'kitchentable_A_large_decorated', 'kitchentable_B_large',
  'kitchentable_sink_large_decorated', 'shelf_papertowel', 'shelf_papertowel_decorated', 'dishrack_plates', 'dishrack',
  'cuttingboard', 'pot_A', 'pot_A_stew', 'pot_B_stew', 'pot_large', 'stew_pot', 'pan_A', 'pan_B', 'lid_A', 'lid_large',
  'towelrail', 'papertowel',
  // dining
  'table_round_A', 'table_round_A_small', 'table_round_A_small_decorated', 'table_round_A_decorated', 'table_round_B',
  'chair_A', 'chair_B', 'chair_stool', 'menu',
  // food + tableware
  'plate', 'plate_dirty', 'plate_small', 'bowl', 'bowl_small', 'bowl_dirty', 'stew_bowl', 'food_burger',
  'food_vegetableburger', 'food_stew', 'food_dinner', 'ketchup', 'mustard',
  'food_ingredient_burger_uncooked', 'food_ingredient_burger_cooked', 'food_ingredient_tomato', 'food_ingredient_carrot',
  'food_ingredient_bun', 'food_ingredient_lettuce', 'food_ingredient_onion', 'food_ingredient_potato', 'food_ingredient_cheese',
  'food_ingredient_steak', 'food_ingredient_ham_cooked',
  // decor
  'crate', 'crate_lid', 'crate_tomatoes', 'crate_carrots', 'crate_lettuce', 'crate_onions', 'crate_potatoes', 'crate_buns',
  'crate_cheese', 'crate_steak',
  'jar_A_large', 'jar_A_medium', 'jar_A_small', 'jar_B_large', 'jar_B_medium', 'jar_B_small', 'jar_C_large',
  'jar_C_medium', 'jar_C_small', 'jar_D_large', 'jar_D_medium', 'jar_D_small',
];
// Character-pack mugs (they use the barbarian texture): re-mapped onto the restaurant atlas so
// every prop shares one material. Cells are [column, row] of the 8 x 4 gradient swatches.
// mug_juice / mug_cocoa: the full mug with an orange / brown drink (never beer foam).
const EXTRA_PROPS = ['mug_full', 'mug_empty'];
const MUG_CELLS = { '5,1': [6, 0], '3,1': [3, 0] }; // wood body, metal bands
const MUGS = { mug_juice: { from: 'mug_full', liquid: [4, 2] }, mug_cocoa: { from: 'mug_full', liquid: [5, 0] }, mug: { from: 'mug_empty' } };

// Heroes: which non-skinned meshes to keep (merged into the body); every other mesh under a
// hand slot (swords, axes, shields, staffs, wands, books, knives, crossbows, mugs) is dropped.
// Cast: cooks are Barbarians (bald and bearded, no fur cape or bear hood), guests are Knights,
// Mages and hooded Rogues.
const HEROES = {
  knight: { file: 'Knight', keep: ['Knight_Helmet', 'Knight_Cape'] },
  mage: { file: 'Mage', keep: ['Mage_Hat', 'Mage_Cape'] },
  barbarian: { file: 'Barbarian', keep: [] },
  rogue_hooded: { file: 'Rogue_Hooded', keep: ['Rogue_Cape'] },
};
// Animation clips used by js/scene/characters.js (everything else is stripped).
const CLIPS = [
  'Idle', 'Unarmed_Idle', 'Walking_A', 'Walking_B', 'Running_A', 'Sit_Chair_Down', 'Sit_Chair_Idle', 'Sit_Chair_StandUp',
  'Interact', 'Cheer', 'PickUp', 'Use_Item',
];
// Helper bones of the original IK rig: no vertex is weighted to them and three.js does no IK,
// so their animation channels are dead weight.
const IK_BONE = /IK|control-/;

// ------------------------------------------------------------------ tiny mat4 helpers (column-major)
function mat4FromTRS(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
function mat4Mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function mat4Invert(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det,
    (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det,
    (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det,
    (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det,
    (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ];
}
function xformPoint(m, x, y, z) {
  return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
}
function xformDir(m, x, y, z) {
  const v = [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z];
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
const localMatrix = (n) => mat4FromTRS(n.getTranslation(), n.getRotation(), n.getScale());

// disposing an Animation leaves its samplers (and their accessors) behind: drop them all
function disposeAnimation(a) {
  for (const ch of a.listChannels()) ch.dispose();
  for (const s of a.listSamplers()) {
    const i = s.getInput(), o = s.getOutput();
    s.dispose();
    for (const acc of [i, o]) if (acc && acc.listParents().every((p) => p.propertyType === 'Root')) acc.dispose();
  }
  a.dispose();
}

async function resizeTextures(doc, size) {
  // gradient-swatch atlases: 1024 px source, plenty at 256 px (the scene samples them without mipmaps)
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'png', resize: [size, size] }));
}

function remapMugs(doc, scene) {
  const root = doc.getRoot();
  const mat = root.listMaterials().find((m) => m.getName() === 'restaurant');
  const buffer = root.listBuffers()[0];
  const groups = Object.fromEntries(scene.listChildren().map((n) => [n.getName(), n]));
  for (const [name, def] of Object.entries(MUGS)) {
    const src = groups[def.from];
    const g = doc.createNode(name);
    scene.addChild(g);
    src.traverse((n) => {
      const mesh = n.getMesh();
      if (!mesh) return;
      const m2 = doc.createMesh(name);
      for (const p of mesh.listPrimitives()) {
        const uv = p.getAttribute('TEXCOORD_0');
        const out = new Float32Array(uv.getCount() * 2);
        const e = [0, 0];
        for (let i = 0; i < uv.getCount(); i++) {
          uv.getElement(i, e);
          const c = Math.min(7, Math.floor(e[0] * 8)), r = Math.min(3, Math.floor(e[1] * 4));
          const to = MUG_CELLS[c + ',' + r] || def.liquid || [c, r];
          out[i * 2] = (to[0] + (e[0] * 8 - c)) / 8;
          out[i * 2 + 1] = (to[1] + (e[1] * 4 - r)) / 4;
        }
        const p2 = p.clone().setMaterial(mat)
          .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(out).setBuffer(buffer));
        m2.addPrimitive(p2);
      }
      g.addChild(doc.createNode(n.getName()).setMesh(m2)
        .setTranslation(n.getTranslation()).setRotation(n.getRotation()).setScale(n.getScale()));
    });
  }
  for (const n of EXTRA_PROPS) groups[n].dispose();
}

// ------------------------------------------------------------------ props.glb
async function buildProps() {
  const doc = new Document();
  doc.createBuffer();
  const scene = doc.createScene('props');
  const add = async (file, name) => {
    const src = await io.read(file);
    const map = mergeDocuments(doc, src);
    const srcScene = src.getRoot().listScenes()[0];
    const merged = map.get(srcScene);
    const group = doc.createNode(name);
    for (const child of merged.listChildren()) group.addChild(child);
    scene.addChild(group);
    merged.dispose();
  };
  for (const name of PROPS) await add(path.join(R_DIR, name + '.gltf'), name);
  for (const name of EXTRA_PROPS) await add(path.join(A_DIR, name + '.gltf'), name);
  // one buffer
  const buffers = doc.getRoot().listBuffers();
  for (const b of buffers.slice(1)) {
    for (const acc of doc.getRoot().listAccessors()) if (acc.getBuffer() === b) acc.setBuffer(buffers[0]);
    b.dispose();
  }
  for (const s of doc.getRoot().listScenes()) if (s !== scene) s.dispose();
  doc.getRoot().setDefaultScene(scene);
  await doc.transform(dedup(), weld(), prune({ keepLeaves: true }));
  remapMugs(doc, scene);
  await doc.transform(prune({ keepLeaves: true }));
  await resizeTextures(doc, 256);
  await doc.transform(
    quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, cleanup: true }),
    dedup(),
    prune({ keepLeaves: true }),
  );
  return doc;
}

// ------------------------------------------------------------------ heroes
async function buildHero(key, def) {
  const doc = await io.read(path.join(C_DIR, def.file + '.glb'));
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const ibm = skin.getInverseBindMatrices().getArray();
  const bindWorld = joints.map((_, i) => mat4Invert(Array.from(ibm.subarray(i * 16, i * 16 + 16))));

  const parts = []; // { prim, matrix|null, joint }
  let material = null;
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (node.getSkin()) {
      for (const p of mesh.listPrimitives()) parts.push({ prim: p, matrix: null });
    } else if (def.keep.includes(node.getName())) {
      const parent = node.getParentNode();
      const ji = joints.indexOf(parent);
      if (ji < 0) throw new Error(key + ': accessory ' + node.getName() + ' not under a joint');
      const m = mat4Mul(bindWorld[ji], localMatrix(node));
      for (const p of mesh.listPrimitives()) parts.push({ prim: p, matrix: m, joint: ji });
    }
  }
  // merge into one primitive
  let nv = 0, ni = 0;
  for (const { prim } of parts) { nv += prim.getAttribute('POSITION').getCount(); ni += prim.getIndices().getCount(); }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const jnt = new Uint8Array(nv * 4), wgt = new Float32Array(nv * 4);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io2 = 0;
  const used = new Set();
  for (const { prim, matrix, joint } of parts) {
    const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), T = prim.getAttribute('TEXCOORD_0');
    const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
    material = material || prim.getMaterial();
    const c = P.getCount();
    const e3 = [0, 0, 0], e2 = [0, 0], e4 = [0, 0, 0, 0];
    for (let i = 0; i < c; i++) {
      P.getElement(i, e3);
      const p = matrix ? xformPoint(matrix, e3[0], e3[1], e3[2]) : e3;
      pos.set(p, (vo + i) * 3);
      N.getElement(i, e3);
      const n = matrix ? xformDir(matrix, e3[0], e3[1], e3[2]) : e3;
      nor.set(n, (vo + i) * 3);
      T.getElement(i, e2);
      uv.set(e2, (vo + i) * 2);
      if (matrix) {
        jnt.set([joint, 0, 0, 0], (vo + i) * 4);
        wgt.set([1, 0, 0, 0], (vo + i) * 4);
        used.add(joint);
      } else {
        J.getElement(i, e4);
        jnt.set(e4, (vo + i) * 4);
        const jj = e4.slice();
        W.getElement(i, e4);
        // renormalise (some exporters leave tiny sums)
        const s = e4[0] + e4[1] + e4[2] + e4[3] || 1;
        wgt.set([e4[0] / s, e4[1] / s, e4[2] / s, e4[3] / s], (vo + i) * 4);
        for (let k = 0; k < 4; k++) if (e4[k] > 0) used.add(jj[k]);
      }
    }
    const I = prim.getIndices();
    for (let k = 0; k < I.getCount(); k++) idx[io2 + k] = I.getScalar(k) + vo;
    vo += c;
    io2 += I.getCount();
  }
  const buffer = root.listBuffers()[0];
  const acc = (type, arr, normalized = false) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buffer).setNormalized(normalized);
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', pos))
    .setAttribute('NORMAL', acc('VEC3', nor))
    .setAttribute('TEXCOORD_0', acc('VEC2', uv))
    .setAttribute('JOINTS_0', acc('VEC4', jnt))
    .setAttribute('WEIGHTS_0', acc('VEC4', wgt))
    .setIndices(acc('SCALAR', idx))
    .setMaterial(material);
  const mesh = doc.createMesh(key).addPrimitive(prim);
  // remove every old mesh node, add one skinned node next to the skeleton
  const rigNode = joints[0].getParentNode(); // 'Rig'
  for (const node of root.listNodes()) if (node.getMesh()) node.dispose();
  const body = doc.createNode(key + '_body').setMesh(mesh).setSkin(skin);
  (rigNode || root.listScenes()[0]).addChild(body);
  for (const a of root.listAnimations()) disposeAnimation(a);
  await doc.transform(prune({ keepLeaves: true }), dedup());
  await resizeTextures(doc, 256);
  const usedNames = [...used].sort((a, b) => a - b).map((i) => joints[i].getName());
  return { doc, verts: nv, tris: ni / 3, usedNames };
}

// ------------------------------------------------------------------ anims.glb
async function buildAnims(usedJoints) {
  const doc = await io.read(path.join(C_DIR, 'Knight.glb'));
  const root = doc.getRoot();
  for (const node of root.listNodes()) if (node.getMesh()) node.dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const a of root.listAnimations()) if (!CLIPS.includes(a.getName())) disposeAnimation(a);
  // keep a channel only if it animates a deforming joint (or a hand slot) away from its rest pose
  const keepNode = (n) => !IK_BONE.test(n.getName());
  let removed = 0, kept = 0;
  for (const a of root.listAnimations()) {
    for (const ch of a.listChannels()) {
      const n = ch.getTargetNode();
      const p = ch.getTargetPath();
      const out = ch.getSampler().getOutput().getArray();
      const rest = p === 'translation' ? n.getTranslation() : p === 'rotation' ? n.getRotation() : n.getScale();
      const k = rest.length;
      let constant = true;
      for (let i = 0; i < out.length && constant; i += k) {
        for (let j = 0; j < k; j++) if (Math.abs(out[i + j] - rest[j]) > (p === 'rotation' ? 2e-4 : 1e-4)) { constant = false; break; }
      }
      if (!keepNode(n) || constant || (p === 'scale' && constant)) {
        const s = ch.getSampler();
        ch.dispose();
        if (!s.listParents().some((x) => x.propertyType === 'AnimationChannel')) {
          const i = s.getInput(), o = s.getOutput();
          s.dispose();
          for (const acc of [i, o]) if (acc && acc.listParents().every((q) => q.propertyType === 'Root')) acc.dispose();
        }
        removed++;
      } else kept++;
    }
  }
  await doc.transform(resample({ tolerance: 2e-4 }), prune({ keepLeaves: true }), dedup());
  // drop the IK helper nodes themselves (no channel targets them any more)
  for (const n of root.listNodes()) if (IK_BONE.test(n.getName())) n.dispose();
  await doc.transform(prune({ keepLeaves: true }));
  const clips = root.listAnimations().map((a) => {
    let dur = 0;
    for (const s of a.listSamplers()) dur = Math.max(dur, s.getInput().getMax([0])[0]);
    return { name: a.getName(), channels: a.listChannels().length, duration: +dur.toFixed(3) };
  });
  return { doc, clips, removed, kept };
}

// ------------------------------------------------------------------ main
const manifest = { generated: new Date().toISOString(), source: 'KayKit Restaurant Bits 1.0 + KayKit Adventurers Character Pack 1.0 by Kay Lousberg (CC0)', files: {}, total: 0 };

const props = await buildProps();
props.createExtension(KHRMeshQuantization).setRequired(true);
await io.write(path.join(OUT, 'props.glb'), props);
manifest.props = props.getRoot().listScenes()[0].listChildren().map((n) => n.getName());

const heroes = {};
let usedJoints = new Set();
for (const [key, def] of Object.entries(HEROES)) {
  const r = await buildHero(key, def);
  await io.write(path.join(OUT, key + '.glb'), r.doc);
  heroes[key] = { verts: r.verts, tris: r.tris };
  r.usedNames.forEach((n) => usedJoints.add(n));
}
manifest.heroes = heroes;
manifest.weightedJoints = [...usedJoints];

const anims = await buildAnims(usedJoints);
await io.write(path.join(OUT, 'anims.glb'), anims.doc);
manifest.clips = anims.clips;
manifest.channels = { kept: anims.kept, removed: anims.removed };

for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith('.glb')).sort()) {
  const size = fs.statSync(path.join(OUT, f)).size;
  manifest.files[f] = size;
  manifest.total += size;
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// licences
const lic = [
  path.join(SRC, 'KayKit-Restaurant-Bits-1.0/LICENSE.txt'),
  path.join(SRC, 'KayKit-Character-Pack-Adventures-1.0/LICENSE.txt'),
].map((f) => fs.readFileSync(f, 'utf8').trim());
fs.writeFileSync(path.join(REPO, 'assets/LICENSE-KayKit.txt'),
  'The 3D models in assets/models/ are made from these CC0 packs by Kay Lousberg (www.kaylousberg.com).\n' +
  'They were converted to .glb, trimmed (unused meshes, weapons and animations removed) and their textures downscaled.\n\n' +
  lic.join('\n\n------------------------------------------------------------\n\n') + '\n');

console.log('heroes', JSON.stringify(heroes));
console.log('weighted joints', manifest.weightedJoints.length, manifest.weightedJoints.join(' '));
console.log('clips', anims.clips.map((c) => `${c.name}:${c.channels}ch/${c.duration}s`).join(' '));
console.log('channels kept', anims.kept, 'removed', anims.removed);
for (const [f, s] of Object.entries(manifest.files)) console.log(f.padEnd(20), (s / 1024).toFixed(1).padStart(8), 'KB');
console.log('TOTAL', (manifest.total / 1024 / 1024).toFixed(2), 'MB');
