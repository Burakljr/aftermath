import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const R = '/tmp/claude-0/-home-user-aftermath/a2b2bb86-d226-5b76-8c09-c4a191c5ba8d/scratchpad/assets-src/KayKit-Restaurant-Bits-1.0/addons/kaykit_restaurant_bits/Assets/gltf';
for (const name of process.argv.slice(2)) {
  const doc = await io.read(`${R}/${name}.gltf`);
  const cells = {};
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const uv = p.getAttribute('TEXCOORD_0'); const e = [0, 0];
    for (let i = 0; i < uv.getCount(); i++) { uv.getElement(i, e); const c = Math.floor(e[0] * 8) + ',' + Math.floor(e[1] * 4); cells[c] = (cells[c] || 0) + 1; }
  }
  console.log(name.padEnd(28), Object.entries(cells).sort((a, b) => b[1] - a[1]).map(([c, n]) => c + ':' + n).join(' '));
}
