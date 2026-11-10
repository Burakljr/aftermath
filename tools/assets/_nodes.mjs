import { NodeIO } from '@gltf-transform/core';
const io = new NodeIO();
const doc = await io.read(process.argv[2]);
for (const n of doc.getRoot().listNodes()) { if (['root','hips','spine','chest','head','hand.r','handslot.r','hand.l','handslot.l','upperleg.l','lowerleg.l','foot.l'].includes(n.getName())) console.log(n.getName(), n.getTranslation().map(v=>v.toFixed(3)).join(','), n.getRotation().map(v=>v.toFixed(3)).join(','), n.getScale().map(v=>v.toFixed(3)).join(',')); }
