import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'node:fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const dir = process.argv[2];
const files = process.argv.slice(3);
for (const f of files) {
  const p = fs.existsSync(`${dir}/${f}.gltf`) ? `${dir}/${f}.gltf` : `${dir}/${f}.glb`;
  const doc = await io.read(p);
  const sc = doc.getRoot().listScenes()[0];
  const b = getBounds(sc);
  const nodes = doc.getRoot().listNodes();
  let verts = 0; for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) verts += pr.getAttribute('POSITION').getCount();
  console.log(f.padEnd(36), 'min', b.min.map(v=>v.toFixed(2)).join(','), 'max', b.max.map(v=>v.toFixed(2)).join(','), 'nodes', nodes.length, 'verts', verts, 'mats', doc.getRoot().listMaterials().map(m=>m.getName()).join('|'));
}
