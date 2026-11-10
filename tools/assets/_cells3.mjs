import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
const R = '/tmp/claude-0/-home-user-aftermath/a2b2bb86-d226-5b76-8c09-c4a191c5ba8d/scratchpad/assets-src/KayKit-Restaurant-Bits-1.0/addons/kaykit_restaurant_bits/Assets/gltf';
for (const name of process.argv.slice(2)) {
  const doc = await io.read(`${R}/${name}.gltf`);
  const out = {};
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const uv = p.getAttribute('TEXCOORD_0'), pos = p.getAttribute('POSITION'), nor = p.getAttribute('NORMAL');
    const e = [0,0], q=[0,0,0], n=[0,0,0];
    for (let i = 0; i < uv.getCount(); i++) { uv.getElement(i, e); pos.getElement(i,q); nor.getElement(i,n);
      const dir = Math.abs(n[1])>0.7?(n[1]>0?'up':'down'):Math.abs(n[2])>0.7?(n[2]>0?'+z':'-z'):(n[0]>0?'+x':'-x');
      const c = Math.floor(e[0]*8)+','+Math.floor(e[1]*4);
      const k = dir+' '+c; out[k] = out[k] || {n:0,ymin:9,ymax:-9,vmin:9,vmax:-9}; const o=out[k]; o.n++; o.ymin=Math.min(o.ymin,q[1]); o.ymax=Math.max(o.ymax,q[1]); o.vmin=Math.min(o.vmin,e[1]); o.vmax=Math.max(o.vmax,e[1]); }
  }
  console.log(name); for (const [k,o] of Object.entries(out).sort()) console.log('  ', k.padEnd(10), o.n, 'y', o.ymin.toFixed(2), o.ymax.toFixed(2), 'v', o.vmin.toFixed(3), o.vmax.toFixed(3));
}
