// Dashed route lines (A1): drawn from the vehicle to its work spot while it is in transit. All routes
// share one ribbon mesh (one draw call); each route owns a slot of CAP points. The part behind the
// vehicle is cut by a per-slot progress uniform; dashes flow toward the destination.
import * as THREE from 'three';

const R = 12, CAP = 128, W = 2.0, LANE = 3.0;

export function createRoutes(world) {
  const { scene } = world;
  const nV = R * CAP * 2;
  const pos = new Float32Array(nV * 3), aS = new Float32Array(nV), aR = new Float32Array(nV), aL = new Float32Array(nV);
  const idx = [];
  for (let r = 0; r < R; r++) for (let i = 0; i < CAP - 1; i++) {
    const a = (r * CAP + i) * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  for (let r = 0; r < R; r++) for (let i = 0; i < CAP * 2; i++) aR[r * CAP * 2 + i] = r;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  geo.setAttribute('aR', new THREE.BufferAttribute(aR, 1));
  geo.setAttribute('aL', new THREE.BufferAttribute(aL, 1));
  geo.setIndex(idx);
  const prog = new Float32Array(R), on = new Float32Array(R), len = new Float32Array(R);
  const U = { uProg: { value: prog }, uOn: { value: on }, uLen: { value: len }, uTime: world.materials.glow.uniforms.uTime };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4,
    vertexShader: `attribute float aS, aR, aL; uniform float uProg[${R}], uOn[${R}], uLen[${R}];
      varying float vS, vP, vOn, vL, vSide;
      void main(){ int r = int(aR + 0.5); vS = aS; vP = uProg[r]; vOn = uOn[r]; vL = uLen[r]; vSide = aL;
        gl_Position = vOn > 0.5 ? projectionMatrix * modelViewMatrix * vec4(position, 1.0) : vec4(0.0, 0.0, -2.0, 1.0); }`,
    fragmentShader: `uniform float uTime; varying float vS, vP, vOn, vL, vSide;
      void main(){
        if (vOn < 0.5 || vS < vP + 4.0) discard;
        float dash = fract((vS - uTime * 9.0) / 9.0);
        float d = smoothstep(0.0, 0.08, dash) * (1.0 - smoothstep(0.5, 0.58, dash));
        float edge = 1.0 - smoothstep(0.55, 1.0, abs(vSide));
        float head = smoothstep(vP + 4.0, vP + 14.0, vS) * (1.0 - smoothstep(vL - 3.0, vL, vS));
        float a = (0.35 + 0.65 * d) * edge * head;
        gl_FragColor = vec4(vec3(1.0, 0.72, 0.05) * (1.4 + 1.2 * d), a * 0.9);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.name = 'routes';
  scene.add(mesh);
  const slots = new Array(R).fill(null);   // vehicle id per slot

  function slotOf(id, create) {
    let k = slots.indexOf(id);
    if (k < 0 && create) { k = slots.indexOf(null); if (k < 0) k = 0; slots[k] = id; }
    return k;
  }
  function write(k, P) {
    const base = k * CAP * 2;
    const n = Math.min(P.n, CAP);
    for (let i = 0; i < CAP; i++) {
      const j = Math.min(i, n - 1);
      const x = P.xz[j * 2], z = P.xz[j * 2 + 1];
      const j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
      let dx = P.xz[j1 * 2] - P.xz[j0 * 2], dz = P.xz[j1 * 2 + 1] - P.xz[j0 * 2 + 1];
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const s = P.cum[j];
      const lane = LANE * Math.min(1, Math.min(s, P.len - s) / 10);
      const cx = x - dz * lane, cz = z + dx * lane;
      const y = world.groundY(cx, cz) + 0.45;
      for (let e = 0; e < 2; e++) {
        const side = e ? 1 : -1, v = base + i * 2 + e;
        pos[v * 3] = cx - dz * side * W / 2; pos[v * 3 + 1] = y; pos[v * 3 + 2] = cz + dx * side * W / 2;
        aS[v] = s; aL[v] = side;
      }
    }
    len[k] = P.len;
    geo.attributes.position.needsUpdate = true; geo.attributes.aS.needsUpdate = true; geo.attributes.aL.needsUpdate = true;
  }
  return {
    set(id, P) {
      if (!P || P.n < 2) { const k = slotOf(id, false); if (k >= 0) { on[k] = 0; slots[k] = null; } return; }
      const k = slotOf(id, true);
      write(k, P); on[k] = 1; prog[k] = 0;
    },
    progress(id, s) { const k = slotOf(id, false); if (k >= 0) prog[k] = s; },
    clear(id) { const k = slotOf(id, false); if (k >= 0) { on[k] = 0; slots[k] = null; } },
    active() { let n = 0; for (let k = 0; k < R; k++) if (on[k] > 0.5) n++; return n; },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
