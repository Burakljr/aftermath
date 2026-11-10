import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const rows = [];
for (const n of root.listScenes()[0].listChildren()) {
  let bytes = 0, verts = 0, tris = 0;
  n.traverse((c) => { const m = c.getMesh(); if (!m) return; for (const p of m.listPrimitives()) { verts += p.getAttribute('POSITION').getCount(); tris += p.getIndices().getCount() / 3; for (const s of p.listSemantics()) bytes += p.getAttribute(s).getByteLength(); bytes += p.getIndices().getByteLength(); } });
  rows.push([n.getName(), verts, tris, bytes]);
}
rows.sort((a, b) => b[3] - a[3]);
let tot = 0; for (const r of rows) tot += r[3];
console.log(rows.slice(0, 25).map(r => r.join('\t')).join('\n'));
console.log('total geom bytes', tot, 'models', rows.length);
const p0 = root.listMeshes()[0].listPrimitives()[0];
for (const s of p0.listSemantics()) console.log(s, p0.getAttribute(s).getComponentType(), p0.getAttribute(s).getNormalized());
console.log('textures', root.listTextures().map(t => t.getName() + ':' + t.getImage().byteLength + ':' + JSON.stringify(t.getSize())));
console.log('materials', root.listMaterials().map(m => m.getName()));
