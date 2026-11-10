import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
const A = '/tmp/claude-0/-home-user-aftermath/a2b2bb86-d226-5b76-8c09-c4a191c5ba8d/scratchpad/assets-src/KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Assets/gltf';
for (const name of ['mug_full','mug_empty']) {
  const doc = await io.read(`${A}/${name}.gltf`);
  const cells = {};
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const uv = p.getAttribute('TEXCOORD_0'); const pos = p.getAttribute('POSITION'); const e = [0, 0], q=[0,0,0];
    for (let i = 0; i < uv.getCount(); i++) { uv.getElement(i, e); pos.getElement(i,q); const c = Math.floor(e[0] * 8) + ',' + Math.floor(e[1] * 4); cells[c] = cells[c] || {n:0, ymin:9, ymax:-9}; cells[c].n++; cells[c].ymin=Math.min(cells[c].ymin,q[1]); cells[c].ymax=Math.max(cells[c].ymax,q[1]); }
  }
  console.log(name, JSON.stringify(cells));
}
