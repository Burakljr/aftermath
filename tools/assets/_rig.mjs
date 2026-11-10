import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const C = process.argv[2];
const names = ['Knight','Mage','Barbarian','Rogue','Rogue_Hooded'];
const rigs = {};
for (const n of names) {
  const doc = await io.read(`${C}/${n}.glb`);
  const root = doc.getRoot();
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  rigs[n] = { joints: joints.map(j => [j.getName(), j.getTranslation().map(v=>+v.toFixed(4)), j.getRotation().map(v=>+v.toFixed(4)), j.getScale().map(v=>+v.toFixed(3))]), doc };
  if (n === 'Knight') {
    console.log('joints', joints.map(j=>j.getName()).join(' '));
    const keep = ['Idle','Unarmed_Idle','Walking_A','Sit_Chair_Down','Sit_Chair_Idle','Interact','Cheer'];
    for (const a of root.listAnimations()) {
      if (!keep.includes(a.getName())) continue;
      const tg = new Set(); let keys = 0, paths = {};
      for (const ch of a.listChannels()) { tg.add(ch.getTargetNode().getName()); paths[ch.getTargetPath()] = (paths[ch.getTargetPath()]||0)+1; keys += ch.getSampler().getInput().getCount(); }
      const s0 = a.listChannels()[0].getSampler();
      console.log(a.getName(), 'channels', a.listChannels().length, JSON.stringify(paths), 'keys', keys, 'dur', s0.getInput().getMax([])[0].toFixed(2), 'interp', s0.getInterpolation(), 'nonjoint targets', [...tg].filter(t => !joints.some(j=>j.getName()===t)).join(','));
    }
    // total accessor bytes for animations
    let animBytes = 0; for (const a of root.listAnimations()) for (const s of a.listSamplers()) { animBytes += s.getInput().getArray().byteLength + s.getOutput().getArray().byteLength; }
    console.log('anim bytes total', animBytes);
  }
}
for (const n of names.slice(1)) {
  let diff = 0; const a = rigs.Knight.joints, b = rigs[n].joints;
  for (let i = 0; i < a.length; i++) { if (a[i][0] !== b[i][0] || JSON.stringify(a[i].slice(1)) !== JSON.stringify(b[i].slice(1))) { diff++; if (diff < 6) console.log(n, 'diff', JSON.stringify(a[i]), JSON.stringify(b[i])); } }
  console.log(n, 'joint diffs', diff, 'of', a.length);
}
