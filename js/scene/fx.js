// GPU effects (W4, ported from proto-B fx.js and made state-driven). Every particle is a quad whose
// state is a pure function of uTime and per-particle seeds/attributes, so setTime() gives deterministic
// frames and the CPU only writes uniforms (and a few attributes on one-shot emits).
//   fires   : 8x8 flame flipbook (rendered on the GPU at load), 4 wind-sheared tongues per spot, 5 spots
//             per district; size follows fire / fire0 through uLvl[district].
//   smoke   : tall lit columns per district: dark while fire >= 25 %, white steam below, emission stops
//             when the fire is out (rising puffs finish their life). Opacity capped near must-see points.
//   embers  : rising sparks over burning spots.
//   puffs   : one-shot pool (dust, steam, impact ring) - normal blending, lit.
//   glows   : one-shot pool (sparks, ember arcs) - additive.
//   water   : jets API for actors (spray ribbon + mist), 8 slots, uniforms only.
//   flash, shock ring, ballistic debris (impact).
import * as THREE from 'three';
import { rng, smokeAtlas } from './util.js';
import { chunkProtos } from './damage.js';
import { HEIGHT_FOG_GLSL } from './env.js';

export const fxUniforms = {
  uTime: { value: 0 },
  uFogDensity: { value: 0.002 },
  uFogColor: { value: new THREE.Color(0x96787a) },
  uWind: { value: new THREE.Vector3(-0.38, 0, -0.28) },
  uSunCol: { value: new THREE.Color(1.0, 0.62, 0.36) },
  uSunDir: { value: new THREE.Vector3(-0.5, 0.3, 0.8) },
  uShadowCol: { value: new THREE.Color(0.25, 0.3, 0.42) },
  uKeep: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  uLvl: { value: new Array(6).fill(0) },                                        // flame level per district
  uSmk: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0.8, 1, 1e6)) }, // opacity, dark, under-glow, stop time
  uLow: { value: 0 },
};

const COMMON_VS = /* glsl */`
attribute vec4 aSeed; attribute vec4 aEmit; attribute vec4 aExtra;
uniform float uTime; uniform vec3 uWind; uniform float uFogDensity; uniform vec4 uKeep[3]; uniform float uLow;
varying vec2 vUv; varying float vAge; varying vec4 vSeed; varying float vFog; varying vec4 vExtra; varying float vShade; varying float vCap;
${HEIGHT_FOG_GLSL}
vec3 camRight(){ return vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); }
vec3 camUp(){ return vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
vec3 billboard(vec3 center, vec2 corner, float size, float rot){
  float c = cos(rot), s = sin(rot);
  vec2 q = vec2(corner.x * c - corner.y * s, corner.x * s + corner.y * c);
  return center + (camRight() * q.x + camUp() * q.y) * size;
}
float keepCap(vec3 p){
  float cap = 1.0;
  for (int i = 0; i < 3; i++) {
    if (uKeep[i].w <= 0.0) continue;
    vec3 a = uKeep[i].xyz, ab = cameraPosition - a;
    float t = clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0);
    float d = length(p - (a + ab * t));
    cap = min(cap, mix(0.32, 1.0, smoothstep(uKeep[i].w * 0.8, uKeep[i].w * 1.25, d)));
  }
  return cap;
}
void finish(vec3 wp){
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vFog = heightFog(cameraPosition, wp, uFogDensity);
}
`;
const FOG_FS = /* glsl */`
uniform vec3 uFogColor; uniform vec3 uSunCol; uniform vec3 uSunDir; uniform vec3 uShadowCol;
varying float vFog; varying float vCap;
`;
function quadGeometry(n, fill) {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seed = new Float32Array(n * 4), emit = new Float32Array(n * 4), extra = new Float32Array(n * 4);
  if (fill) for (let i = 0; i < n; i++) fill(i, seed, emit, extra);
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  g.setAttribute('aEmit', new THREE.InstancedBufferAttribute(emit, 4));
  g.setAttribute('aExtra', new THREE.InstancedBufferAttribute(extra, 4));
  g.instanceCount = n;
  return g;
}
function mkMat(vs, fs, opts = {}) {
  const m = new THREE.ShaderMaterial({
    vertexShader: COMMON_VS + vs, fragmentShader: FOG_FS + fs,
    uniforms: { ...fxUniforms, ...(opts.uniforms || {}) },
    transparent: true, depthWrite: false, blending: opts.blending ?? THREE.AdditiveBlending,
  });
  if (opts.premult) { m.blending = THREE.CustomBlending; m.blendSrc = THREE.OneFactor; m.blendDst = THREE.OneMinusSrcAlphaFactor; m.blendSrcAlpha = THREE.OneFactor; m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor; }
  return m;
}
const mesh = (g, m, order, name) => { const x = new THREE.Mesh(g, m); x.frustumCulled = false; x.renderOrder = order; x.name = name; return x; };

// ------------------------------------------------------------------ FLAME ATLAS (GPU, once)
export function makeFlameAtlas(renderer) {
  const S = 1024;
  const rt = new THREE.WebGLRenderTarget(S, S, { type: THREE.UnsignedByteType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  const mat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      float h(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++){ v += a * n2(p); p = p * 2.07 + 3.1; a *= 0.5; } return v; }
      float loopN(vec2 p, float t, float speed){ float a = fbm(p + vec2(0.0, -t * speed)); float b = fbm(p + vec2(0.0, -(t - 1.0) * speed) + 17.3); return mix(a, b, t); }
      void main(){
        vec2 cell = floor(vUv * 8.0);
        vec2 uv = fract(vUv * 8.0);
        float frame = cell.x + (7.0 - cell.y) * 8.0;
        float t = frame / 64.0;
        float n1 = loopN(vec2(uv.x * 3.0, uv.y * 2.2), t, 2.4);
        float n2v = loopN(vec2(uv.x * 6.5 + 4.0, uv.y * 5.0), t, 4.0);
        float y = uv.y;
        float x = (uv.x - 0.5) * 2.0 + (n1 - 0.5) * 0.9 * y;
        float width = mix(0.82, 0.06, pow(y, 0.8));
        float shape = 1.0 - smoothstep(width * 0.45, width + 0.06, abs(x));
        shape *= smoothstep(0.0, 0.08, y);
        float temp = shape * (1.15 - y * 0.85) * (0.55 + 0.9 * n2v * n1 * 1.3);
        temp = clamp(temp, 0.0, 1.0);
        float soot = smoothstep(0.02, 0.2, shape) * (1.0 - smoothstep(0.18, 0.42, temp)) * smoothstep(0.25, 0.9, y + n2v * 0.3);
        gl_FragColor = vec4(temp, soot, smoothstep(0.03, 0.25, shape * (0.4 + n1)), 1.0);
      }`,
  });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const sc = new THREE.Scene(); sc.add(q);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(prev);
  mat.dispose(); q.geometry.dispose();
  return rt;
}

export const SPOTS = 5, PER_SPOT = 4, COLS = 3, PUFFS = 28;

export function createFx(scene, renderer) {
  const flameRT = makeFlameAtlas(renderer);
  const smokeTex = smokeAtlas(128);
  const group = new THREE.Group(); group.name = 'fx';
  scene.add(group);
  const R = rng(4242);

  // ---------------------------------------------------------------- district fires (120 tongues)
  const NF = 6 * SPOTS * PER_SPOT;
  const fireG = quadGeometry(NF, (i, s, e, x) => {
    s.set([R(), R(), R(), R()], i * 4);
    const d = Math.floor(i / (SPOTS * PER_SPOT)), k = i % PER_SPOT;
    x.set([d, k, 0, 0], i * 4);
  });
  const fireMat = mkMat(/* glsl */`
uniform float uFps; uniform float uLvl[6];
varying float vFrame;
void main(){
  vSeed = aSeed; vUv = uv; vExtra = aExtra;
  float lv = uLvl[int(aExtra.x + 0.5)];
  float on = aExtra.z * step(0.001, lv) * (aExtra.y > 2.5 ? 1.0 - uLow : 1.0);
  float sc = aEmit.w * (0.3 + 0.7 * lv) * on;
  float w = 7.0 * sc * (0.85 + 0.3 * aSeed.y), h = 12.0 * sc * (0.85 + 0.35 * aSeed.z) * (0.9 + 0.1 * sin(uTime * 3.0 + aSeed.x * 20.0));
  vec3 right = normalize(vec3(camRight().x, 0.0, camRight().z));
  float yy = position.y + 0.5;
  vec3 p = aEmit.xyz + right * position.x * w + vec3(0.0, yy * h, 0.0) + uWind * yy * yy * h * 0.55;
  p.y -= 0.6 * sc;
  vFrame = uTime * uFps + aSeed.x * 64.0;
  vAge = 0.0; vShade = 0.0; vCap = 1.0;
  finish(p);
}`, /* glsl */`
uniform sampler2D uTex; varying vec2 vUv; varying vec4 vSeed; varying float vFrame;
vec3 sampleF(float f){
  float fi = mod(floor(f), 64.0);
  vec2 cell = vec2(mod(fi, 8.0), 7.0 - floor(fi / 8.0));
  vec2 uv = (cell + clamp(vUv, 0.01, 0.99)) / 8.0;
  if (vSeed.w > 0.5) uv.x = (cell.x + 1.0 - clamp(vUv.x, 0.01, 0.99)) / 8.0;
  return texture2D(uTex, uv).rgb;
}
void main(){
  float fr = fract(vFrame);
  vec3 a = mix(sampleF(vFrame), sampleF(vFrame + 1.0), fr);
  float T = a.r, soot = a.g, mask = a.b;
  vec3 col = vec3(0.0);
  col = mix(col, vec3(0.55, 0.06, 0.015) * 1.4, smoothstep(0.12, 0.3, T));
  col = mix(col, vec3(1.0, 0.36, 0.05) * 3.0, smoothstep(0.3, 0.6, T));
  // review 2 F13: a warmer, less blown-out core and soft tongue edges (they read as hard white cones)
  col = mix(col, vec3(1.0, 0.7, 0.32) * 4.2, smoothstep(0.66, 0.95, T));
  float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x) * smoothstep(1.0, 0.7, vUv.y);
  float emitA = smoothstep(0.06, 0.4, T) * mask * edge;
  float sootA = soot * 0.55 * mask;
  col *= (1.0 - vFog * 0.85);
  gl_FragColor = vec4(col * emitA, sootA * (1.0 - vFog));
}`, { premult: true, uniforms: { uTex: { value: flameRT.texture }, uFps: { value: 22 } } });
  group.add(mesh(fireG, fireMat, 6, 'fires'));

  // ---------------------------------------------------------------- ground glow under fires
  const glowPos = new Float32Array(6 * SPOTS * 6 * 3), glowUv = new Float32Array(6 * SPOTS * 6 * 2), glowD = new Float32Array(6 * SPOTS * 6);
  const ggG = new THREE.BufferGeometry();
  ggG.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  ggG.setAttribute('uv', new THREE.BufferAttribute(glowUv, 2));
  ggG.setAttribute('aD', new THREE.BufferAttribute(glowD, 1));
  const ggMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: fxUniforms.uTime, uLvl: fxUniforms.uLvl },
    vertexShader: `attribute float aD; uniform float uLvl[6]; varying vec2 vUv; varying vec3 vW; varying float vL;
      void main(){ vUv = uv; vW = position; vL = uLvl[int(aD + 0.5)]; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vW; varying float vL;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.0);
        float fl = 0.8 + 0.2 * sin(uTime * 9.0 + vW.x) * sin(uTime * 6.3 + vW.z);
        gl_FragColor = vec4(vec3(1.0, 0.36, 0.08) * a * 0.9 * fl * vL, 1.0); }`,
  });
  const groundGlow = new THREE.Mesh(ggG, ggMat); groundGlow.frustumCulled = false; groundGlow.renderOrder = 3; groundGlow.name = 'fireGlow';
  group.add(groundGlow);

  // ---------------------------------------------------------------- smoke columns (504 puffs)
  const NS = 6 * COLS * PUFFS;
  const smokeG = quadGeometry(NS, (i, s, e, x) => {
    s.set([R(), R(), R(), R()], i * 4);
    const d = Math.floor(i / (COLS * PUFFS));
    x.set([110, d, 15, 0], i * 4);
  });
  const smokeMat = mkMat(/* glsl */`
uniform vec4 uSmk[6];
varying vec3 vRight; varying vec3 vUpv; varying vec4 vSm;
void main(){
  vSeed = aSeed; vUv = uv; vExtra = aExtra;
  vec4 S = uSmk[int(aExtra.y + 0.5)];
  vSm = S;
  float life = aExtra.z * (0.8 + aSeed.y * 0.4);
  float ph = uTime / life + aSeed.x;
  float age = fract(ph);
  float birth = uTime - age * life;
  float alive = step(birth, S.w) * step(0.001, S.x) * aEmit.w * (aSeed.w > 0.5 ? 1.0 - uLow : 1.0);
  vAge = age;
  float sc = max(aEmit.w, 0.01);
  float H = aExtra.x * mix(0.55, 1.0, S.y);
  float rise = H * (1.0 - pow(1.0 - age, 1.35));
  vec3 p = aEmit.xyz + vec3((aSeed.z - 0.5), 0.0, (aSeed.w - 0.5)) * sc * (2.0 + 10.0 * age);
  p.y += rise;
  p += uWind * pow(age, 1.3) * H * 1.15;
  p.x += sin(age * 5.0 + aSeed.z * 12.0) * 3.0 * age * sc;
  float size = sc * mix(6.0, 36.0, pow(age, 0.6)) * (0.75 + aSeed.w * 0.5) * alive;
  vShade = clamp(rise / max(H, 1.0), 0.0, 1.0);
  vCap = keepCap(p);
  vRight = camRight(); vUpv = camUp();
  finish(billboard(p, position.xy, size, aSeed.y * 6.28 + age * (aSeed.z - 0.5) * 1.5));
}`, /* glsl */`
uniform sampler2D uTex;
varying vec2 vUv; varying float vAge; varying vec4 vSeed; varying vec4 vExtra; varying float vShade; varying vec3 vRight; varying vec3 vUpv; varying vec4 vSm;
void main(){
  vec2 q = vec2(step(0.5, vSeed.x), step(0.5, vSeed.y)) * 0.5;
  vec2 uv = q + clamp(vUv, 0.02, 0.98) * 0.5;
  vec4 t = texture2D(uTex, uv);
  float dx = texture2D(uTex, uv + vec2(0.012, 0.0)).a - texture2D(uTex, uv - vec2(0.012, 0.0)).a;
  float dy = texture2D(uTex, uv + vec2(0.0, 0.012)).a - texture2D(uTex, uv - vec2(0.0, 0.012)).a;
  vec2 c = (vUv - 0.5) * 2.0;
  vec3 nV = normalize(vec3(c.x - dx * 2.5, c.y - dy * 2.5, 0.6));
  vec3 N = normalize(vRight * nV.x + vUpv * nV.y + cross(vRight, vUpv) * nV.z);
  float lit = clamp(dot(N, normalize(uSunDir)) * 0.6 + 0.45, 0.0, 1.0);
  float dark = vSm.y;
  vec3 albedo = mix(vec3(0.82, 0.82, 0.84), vec3(0.09, 0.085, 0.08), dark);
  vec3 col = albedo * mix(uShadowCol * (1.0 + (1.0 - dark) * 0.8), uSunCol * 1.15, lit);
  float under = (1.0 - smoothstep(0.0, 0.28, vShade)) * clamp(-N.y * 0.7 + 0.5, 0.0, 1.0);
  col += vec3(1.0, 0.35, 0.08) * under * 1.8 * vSm.z;
  col = mix(col, uFogColor, vFog * 0.9);
  float fade = smoothstep(0.0, 0.06, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge));
  float a = t.a * fade * mix(0.42, 0.78, clamp(dark, 0.0, 1.0)) * smoothstep(0.0, 0.12, vAge) * min(vSm.x, 1.0);
  gl_FragColor = vec4(col, min(a, vCap));
}`, { blending: THREE.NormalBlending, uniforms: { uTex: { value: smokeTex } } });
  group.add(mesh(smokeG, smokeMat, 8, 'smoke'));

  // ---------------------------------------------------------------- embers over burning spots
  const NE = 6 * SPOTS * 6;
  const emberG = quadGeometry(NE, (i, s, e, x) => { s.set([R(), R(), R(), R()], i * 4); x.set([Math.floor(i / (SPOTS * 6)), 0, 0, 0], i * 4); });
  const emberMat = mkMat(/* glsl */`
uniform float uLvl[6];
void main(){
  vSeed = aSeed; vUv = uv; vExtra = aExtra; vCap = 1.0; vShade = 0.0;
  float lv = uLvl[int(aExtra.x + 0.5)];
  float sc = aEmit.w;
  float life = 2.5 + aSeed.y * 2.5;
  float age = fract(uTime / life + aSeed.x);
  vec3 p = aEmit.xyz + vec3((aSeed.z - 0.5) * 5.0, 2.0 + age * 26.0 * sc, (aSeed.w - 0.5) * 5.0);
  p += uWind * age * 22.0;
  p.x += sin(uTime * 2.0 + aSeed.z * 40.0) * 2.0 * age;
  float size = (0.45 + aSeed.y * 0.35) * step(0.05, lv) * aExtra.z * (aSeed.w > 0.5 ? 1.0 - uLow : 1.0);
  vAge = age;
  finish(billboard(p, position.xy, size, 0.0));
}`, /* glsl */`
varying vec2 vUv; varying float vAge; varying vec4 vSeed;
void main(){
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 2.0);
  float flick = 0.6 + 0.4 * sin(vAge * 40.0 + vSeed.x * 60.0);
  vec3 col = mix(vec3(1.0, 0.65, 0.2), vec3(1.0, 0.2, 0.02), vAge);
  float fade = 1.0 - smoothstep(0.6, 1.0, vAge);
  gl_FragColor = vec4(col * a * fade * flick * 7.0 * (1.0 - vFog), 1.0);
}`);
  group.add(mesh(emberG, emberMat, 7, 'embers'));

  // per district spot data -> attributes (only on change)
  const spots = Array.from({ length: 6 }, () => []);
  function setSpots(did, list) {
    spots[did] = list.slice(0, SPOTS);
    const fe = fireG.attributes.aEmit.array, fx = fireG.attributes.aExtra.array;
    const r = rng(did * 71 + 5);
    for (let s = 0; s < SPOTS; s++) {
      const sp = spots[did][s];
      for (let k = 0; k < PER_SPOT; k++) {
        const i = (did * SPOTS + s) * PER_SPOT + k;
        if (!sp) { fx[i * 4 + 2] = 0; continue; }
        const ang = (k / PER_SPOT) * Math.PI * 2 + r();
        const rad = k === 0 ? 0 : (1.5 + r() * 2.5) * sp.s;
        fe[i * 4] = sp.x + Math.cos(ang) * rad; fe[i * 4 + 1] = sp.y; fe[i * 4 + 2] = sp.z + Math.sin(ang) * rad;
        fe[i * 4 + 3] = sp.s * (k === 0 ? 1.25 : 0.7 + r() * 0.35);
        fx[i * 4 + 2] = 1;
      }
      // ground glow quad
      for (let v = 0; v < 6; v++) {
        const j = ((did * SPOTS + s) * 6 + v);
        const [ox, oz, u, w] = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, -1, 0, 0], [1, 1, 1, 1], [-1, 1, 0, 1]][v];
        const rr = sp ? 26 * sp.s : 0;
        glowPos[j * 3] = (sp ? sp.x : 0) + ox * rr / 2; glowPos[j * 3 + 1] = 0.5; glowPos[j * 3 + 2] = (sp ? sp.z : 0) + oz * rr / 2;
        glowUv[j * 2] = u; glowUv[j * 2 + 1] = w; glowD[j] = did;
      }
      // embers
      for (let k = 0; k < 6; k++) {
        const i = (did * SPOTS + s) * 6 + k;
        const ee = emberG.attributes.aEmit.array, ex = emberG.attributes.aExtra.array;
        if (sp) { ee[i * 4] = sp.x; ee[i * 4 + 1] = sp.y; ee[i * 4 + 2] = sp.z; ee[i * 4 + 3] = sp.s; }
        ex[i * 4 + 2] = sp ? 1 : 0;
      }
    }
    // smoke columns: the first COLS spots (biggest first)
    const se = smokeG.attributes.aEmit.array;
    for (let c = 0; c < COLS; c++) {
      const sp = spots[did][c];
      for (let k = 0; k < PUFFS; k++) {
        const i = (did * COLS + c) * PUFFS + k;
        if (sp) { se[i * 4] = sp.x; se[i * 4 + 1] = sp.y + 4; se[i * 4 + 2] = sp.z; se[i * 4 + 3] = sp.s * (c === 0 ? 1.0 : 0.8); }
        else se[i * 4 + 3] = 0;
      }
    }
    for (const a of [fireG.attributes.aEmit, fireG.attributes.aExtra, smokeG.attributes.aEmit, emberG.attributes.aEmit, emberG.attributes.aExtra]) a.needsUpdate = true;
    for (const a of [ggG.attributes.position, ggG.attributes.uv, ggG.attributes.aD]) a.needsUpdate = true;
    ggG.computeBoundingSphere();
  }

  // ---------------------------------------------------------------- one-shot pools
  // puffs: aEmit = p0 + t0, aExtra = v + life, aSeed.x/y random, aSeed.z = kind (0 dust, 1 steam), aSeed.w = size
  const NP = 320;
  const puffG = quadGeometry(NP, (i, s, e, x) => { s.set([R(), R(), 0, 0], i * 4); e.set([0, -100, 0, -100], i * 4); x.set([0, 0, 0, 1], i * 4); });
  const puffMat = mkMat(/* glsl */`
varying vec3 vRight; varying vec3 vUpv;
void main(){
  vSeed = aSeed; vUv = uv; vExtra = aExtra;
  float t = uTime - aEmit.w;
  float life = aExtra.w;
  float age = t / life;
  vAge = age;
  bool on = t >= 0.0 && age < 1.0;
  float k = aSeed.z;
  float drag = k > 0.5 ? 1.4 : 2.2;
  vec3 travel = aExtra.xyz * (1.0 - exp(-t * drag)) / drag;
  vec3 p = aEmit.xyz + travel + uWind * t * (k > 0.5 ? 2.0 : 1.2) + vec3(0.0, k > 0.5 ? t * 3.0 : t * 0.6, 0.0);
  float size = on ? aSeed.w * mix(0.45, 1.0, pow(clamp(age, 0.0, 1.0), 0.4)) : 0.0;
  vShade = k;
  vCap = keepCap(p);
  vRight = camRight(); vUpv = camUp();
  finish(billboard(p, position.xy, size, aSeed.y * 6.28 + t * 0.1));
}`, /* glsl */`
uniform sampler2D uTex;
varying vec2 vUv; varying float vAge; varying vec4 vSeed; varying float vShade; varying vec3 vRight; varying vec3 vUpv;
void main(){
  if (vAge < 0.0 || vAge > 1.0) discard;
  vec2 q = vec2(step(0.5, vSeed.x), step(0.5, vSeed.y)) * 0.5;
  vec4 t = texture2D(uTex, q + clamp(vUv, 0.02, 0.98) * 0.5);
  vec2 c = (vUv - 0.5) * 2.0;
  vec3 N = normalize(vRight * c.x + vUpv * c.y + cross(vRight, vUpv) * 0.7);
  float lit = clamp(dot(N, normalize(uSunDir)) * 0.6 + 0.45, 0.0, 1.0);
  vec3 alb = vShade > 0.5 ? vec3(0.95, 0.96, 0.98) : vec3(0.78, 0.74, 0.68);
  vec3 col = alb * mix(uShadowCol * (vShade > 0.5 ? 2.2 : 1.4) + vec3(0.06), uSunCol, lit) + (vShade > 0.5 ? vec3(0.1) : vec3(0.12, 0.06, 0.02));
  col = mix(col, uFogColor, vFog * 0.7);
  float fade = smoothstep(0.0, 0.04, vAge) * (1.0 - smoothstep(0.35, 1.0, vAge));
  gl_FragColor = vec4(col, min(t.a * t.a * fade * (vShade > 0.5 ? 0.9 : 0.62), vCap));
}`, { blending: THREE.NormalBlending, uniforms: { uTex: { value: smokeTex } } });
  group.add(mesh(puffG, puffMat, 9, 'puffs'));
  let puffHead = 0;
  const pe = puffG.attributes.aEmit, px = puffG.attributes.aExtra, ps = puffG.attributes.aSeed;
  function puff(x, y, z, vx, vy, vz, life, kind, size, t0) {
    const i = puffHead; puffHead = (puffHead + 1) % NP;
    pe.array.set([x, y, z, t0], i * 4); px.array.set([vx, vy, vz, life], i * 4);
    ps.array[i * 4 + 2] = kind; ps.array[i * 4 + 3] = size;
    pe.needsUpdate = px.needsUpdate = ps.needsUpdate = true;
  }

  // glows: aEmit = p0 + t0, aExtra = v + life, aSeed.x/y random, aSeed.z = kind (0 spark ballistic, 1 arc), aSeed.w = size
  // arcs use aV as the target point and aExtra.w as life; the arc height is fixed at 14 m
  const NG = 200;
  const glowGeo = quadGeometry(NG, (i, s, e, x) => { s.set([R(), R(), 0, 0], i * 4); e.set([0, -100, 0, -100], i * 4); x.set([0, 0, 0, 1], i * 4); });
  const glowMat = mkMat(/* glsl */`
void main(){
  vSeed = aSeed; vUv = uv; vExtra = aExtra; vCap = 1.0; vShade = 0.0;
  float t = uTime - aEmit.w;
  float life = aExtra.w;
  float age = t / life;
  vAge = age;
  bool on = t >= 0.0 && age < 1.0;
  vec3 p;
  if (aSeed.z < 0.5) { p = aEmit.xyz + aExtra.xyz * t + vec3(0.0, -9.8, 0.0) * t * t * 0.5; p.y = max(p.y, 0.3); }
  else { float a = clamp(age, 0.0, 1.0); p = mix(aEmit.xyz, aExtra.xyz, a); p.y += 14.0 * 4.0 * a * (1.0 - a); p.x += sin(a * 9.0 + aSeed.x * 20.0) * 1.5; }
  float size = on ? aSeed.w * (1.0 - age * 0.6) : 0.0;
  finish(billboard(p, position.xy, size, 0.0));
}`, /* glsl */`
varying vec2 vUv; varying float vAge; varying vec4 vSeed;
void main(){
  if (vAge < 0.0 || vAge > 1.0) discard;
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 2.0);
  vec3 col = mix(vec3(1.0, 0.9, 0.6), vec3(1.0, 0.3, 0.04), vAge);
  gl_FragColor = vec4(col * a * 7.0 * (1.0 - vAge) * (1.0 - vFog), 1.0);
}`);
  group.add(mesh(glowGeo, glowMat, 10, 'glows'));
  let glowHead = 0;
  const ge = glowGeo.attributes.aEmit, gx = glowGeo.attributes.aExtra, gs = glowGeo.attributes.aSeed;
  function glow(x, y, z, vx, vy, vz, life, kind, size, t0) {
    const i = glowHead; glowHead = (glowHead + 1) % NG;
    ge.array.set([x, y, z, t0], i * 4); gx.array.set([vx, vy, vz, life], i * 4);
    gs.array[i * 4 + 2] = kind; gs.array[i * 4 + 3] = size;
    ge.needsUpdate = gx.needsUpdate = gs.needsUpdate = true;
  }

  // ---------------------------------------------------------------- flash, shock ring, debris
  const flashMat = new THREE.SpriteMaterial({ color: new THREE.Color(7, 5, 3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0 });
  { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const ctx = cv.getContext('2d');
    const grd = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.18, 'rgba(255,230,180,0.65)'); grd.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 128, 128); flashMat.map = new THREE.CanvasTexture(cv); }
  const flashS = new THREE.Sprite(flashMat); flashS.renderOrder = 20; flashS.visible = false; flashS.name = 'flash';
  group.add(flashS);
  const flashState = { t0: -100, dur: 0.5, size: 40 };
  const ringG = new THREE.PlaneGeometry(2, 2); ringG.rotateX(-Math.PI / 2);
  const ringMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: -1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uT; varying vec2 vUv;
      float h1(vec2 q){ return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
      float vn(vec2 q){ vec2 i = floor(q), f = fract(q); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y); }
      void main(){ if (uT < 0.0) discard; vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
        // soft, noise-eroded dust front (review V3: no flat disc with a hard rim)
        float ang = atan(p.y, p.x);
        float er = vn(vec2(ang * 5.0 + 3.0, r * 6.0 - uT * 2.0)) * 0.7 + vn(vec2(ang * 13.0, r * 14.0)) * 0.3;
        float front = (1.0 - exp(-uT * 3.0)) * (0.88 + 0.16 * er); float d = abs(r - front);
        float a = (1.0 - smoothstep(0.0, 0.12 + 0.14 * uT, d)) * (1.0 - smoothstep(0.25, 1.0, uT)) * smoothstep(0.0, 0.05, uT) * (1.0 - smoothstep(0.85, 1.0, r));
        a *= smoothstep(0.3, 0.75, er);
        gl_FragColor = vec4(vec3(1.0, 0.85, 0.65) * a * 0.32, 1.0); }`,
  });
  const ringM = new THREE.Mesh(ringG, ringMat); ringM.renderOrder = 4; ringM.visible = false; ringM.name = 'ring';
  group.add(ringM);
  const ringState = { t0: -100 };

  const DN = 40;
  const debrisGeo = chunkProtos()[1].clone(); debrisGeo.computeVertexNormals();
  const debris = new THREE.InstancedMesh(debrisGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.95 }), DN);
  debris.castShadow = false; debris.frustumCulled = false; debris.visible = false; debris.name = 'debris';
  const dItems = Array.from({ length: DN }, () => ({ px: 0, py: 0, pz: 0, vx: 0, vy: 0, vz: 0, wx: 0, wy: 0, wz: 0, s: 1, delay: 0 }));
  { const cols = [0x8d8a86, 0x6a6764, 0x9b9893, 0x77746f, 0xb0a894, 0x5d5a57, 0xc4bcae]; const c = new THREE.Color(); for (let i = 0; i < DN; i++) debris.setColorAt(i, c.set(cols[i % cols.length])); }
  group.add(debris);
  const debrisState = { t0: -100 };
  const _m4 = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _ee = new THREE.Euler(), _pp = new THREE.Vector3(), _sc = new THREE.Vector3(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);

  // ---------------------------------------------------------------- water jets (actors)
  const JETS = 8, SEG = 24;
  const jetA = Array.from({ length: JETS }, () => new THREE.Vector4(0, 0, 0, 0)), jetB = Array.from({ length: JETS }, () => new THREE.Vector4(0, 0, 0, 7));
  const jetFree = Array.from({ length: JETS }, (_, i) => i);
  {
    const aT = [], aSide = [], aJ = [], pos = [];
    for (let j = 0; j < JETS; j++) for (let k = 0; k < SEG; k++) for (const [t, sd] of [[k / SEG, -1], [k / SEG, 1], [(k + 1) / SEG, 1], [k / SEG, -1], [(k + 1) / SEG, 1], [(k + 1) / SEG, -1]]) { pos.push(0, 0, 0); aT.push(t); aSide.push(sd); aJ.push(j); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aT', new THREE.Float32BufferAttribute(aT, 1));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(aSide, 1));
    g.setAttribute('aJ', new THREE.Float32BufferAttribute(aJ, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: fxUniforms.uTime, uFogDensity: fxUniforms.uFogDensity, uA: { value: jetA }, uB: { value: jetB } },
      vertexShader: /* glsl */`
        attribute float aT, aSide, aJ; uniform vec4 uA[${JETS}], uB[${JETS}];
        uniform float uTime, uFogDensity; varying float vT; varying float vS; varying float vFog;
        ${HEIGHT_FOG_GLSL}
        vec3 arcP(vec3 a, vec3 b, float h, float t){ vec3 p = mix(a, b, t); p.y += h * 4.0 * t * (1.0 - t); return p; }
        void main(){
          vec4 A = uA[int(aJ + 0.5)], B = uB[int(aJ + 0.5)];
          vec3 p = arcP(A.xyz, B.xyz, B.w, aT);
          vec3 tan = normalize(arcP(A.xyz, B.xyz, B.w, min(aT + 0.02, 1.0)) - arcP(A.xyz, B.xyz, B.w, max(aT - 0.02, 0.0)) + vec3(1e-4));
          vec3 side = normalize(cross(tan, normalize(cameraPosition - p)) + vec3(1e-4));
          float w = mix(0.9, 4.2, pow(aT, 1.3)) * A.w;
          p += side * aSide * w;
          vT = aT; vS = aSide;
          vFog = heightFog(cameraPosition, p, uFogDensity);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; varying float vT; varying float vS; varying float vFog;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          float edge = 1.0 - smoothstep(0.25, 1.0, abs(vS));
          float streak = n2(vec2(vT * 26.0 - uTime * 9.0, vS * 3.0)) * 0.6 + n2(vec2(vT * 60.0 - uTime * 16.0, vS * 6.0)) * 0.4;
          float a = edge * (mix(0.95, 0.35, vT) * 0.7 + streak * 0.5) * smoothstep(0.0, 0.03, vT) * (1.0 - smoothstep(0.88, 1.0, vT));
          gl_FragColor = vec4(vec3(0.82, 0.9, 1.0) * a * 1.3 * (1.0 - vFog), 1.0);
        }`,
    });
    const rib = new THREE.Mesh(g, m); rib.frustumCulled = false; rib.renderOrder = 7; rib.name = 'waterJets';
    group.add(rib);
    const MPJ = 36;
    const mg = quadGeometry(JETS * MPJ, (i, s, e, x) => { s.set([R(), R(), R(), R()], i * 4); x.set([Math.floor(i / MPJ), 0, 0, 0], i * 4); });
    const mm = mkMat(/* glsl */`
uniform vec4 uA[${JETS}], uB[${JETS}];
void main(){
  vSeed = aSeed; vUv = uv; vExtra = aExtra; vCap = 1.0; vShade = 0.0;
  vec4 A = uA[int(aExtra.x + 0.5)], B = uB[int(aExtra.x + 0.5)];
  float age = fract(uTime / 1.1 + aSeed.x);
  vAge = age;
  vec3 p = mix(A.xyz, B.xyz, age); p.y += B.w * 4.0 * age * (1.0 - age);
  p += (aSeed.yzw - 0.5) * (0.3 + age * age * 6.0);
  float size = mix(0.6, 4.2, age * age) * (0.6 + aSeed.y * 0.8) * A.w * (aSeed.w > 0.5 ? 1.0 - uLow : 1.0);
  finish(billboard(p, position.xy, size, aSeed.z * 6.28));
}`, /* glsl */`
varying vec2 vUv; varying float vAge;
void main(){
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 1.8);
  float fade = smoothstep(0.0, 0.05, vAge) * (1.0 - smoothstep(0.7, 1.0, vAge));
  gl_FragColor = vec4(vec3(0.8, 0.88, 1.0) * a * fade * 0.45 * (1.0 - vFog), 1.0);
}`, { uniforms: { uA: { value: jetA }, uB: { value: jetB } } });
    group.add(mesh(mg, mm, 7, 'waterMist'));
  }

  let now = 0, scale = 1;
  const api = {
    group, flameTexture: flameRT.texture, smokeTex,
    setSpots, spots: (did) => spots[did],
    setTime(t) { now = t; fxUniforms.uTime.value = t; },
    setQuality(q) { scale = q === 'low' ? 0.5 : 1; fxUniforms.uLow.value = q === 'low' ? 1 : 0; },
    // n puffs of dust at (x,y,z); o: { size, spread, rise, life }
    dust(x, y, z, n = 8, o = {}) {
      const k = Math.max(1, Math.round(n * scale));
      for (let i = 0; i < k; i++) {
        const a = Math.random() * 6.283, sp = (o.spread ?? 6) * (0.5 + Math.random());
        puff(x + Math.cos(a) * 1.5, y, z + Math.sin(a) * 1.5, Math.cos(a) * sp, (o.rise ?? 3) * Math.random(), Math.sin(a) * sp, (o.life ?? 2.6) * (0.8 + Math.random() * 0.4), 0, (o.size ?? 7) * (0.7 + Math.random() * 0.6), now + Math.random() * 0.08);
      }
    },
    // white steam burst rising ~1.2 s (fire out)
    steam(x, y, z, n = 12, o = {}) {
      const k = Math.max(1, Math.round(n * scale));
      for (let i = 0; i < k; i++) {
        const a = Math.random() * 6.283, sp = (o.spread ?? 4) * Math.random();
        puff(x + Math.cos(a) * 2, y, z + Math.sin(a) * 2, Math.cos(a) * sp, 6 + Math.random() * 6, Math.sin(a) * sp, (o.life ?? 1.8) * (0.8 + Math.random() * 0.5), 1, (o.size ?? 8) * (0.7 + Math.random() * 0.6), now + Math.random() * 0.15);
      }
    },
    sparks(x, y, z, n = 6, o = {}) {
      const k = Math.max(1, Math.round(n * scale));
      for (let i = 0; i < k; i++) {
        const a = Math.random() * 6.283, up = 0.4 + Math.random();
        const sp = (o.speed ?? 9) * (0.5 + Math.random());
        glow(x, y, z, Math.cos(a) * sp * (o.dx ?? 1), sp * up, Math.sin(a) * sp * (o.dz ?? 1), 0.45 + Math.random() * 0.4, 0, (o.size ?? 0.45) * (0.7 + Math.random() * 0.6), now);
      }
    },
    // ember arcs from -> to over ~0.6 s (fire spread)
    embers(from, to, n = 8) {
      for (let i = 0; i < n; i++) glow(from.x + (Math.random() - 0.5) * 6, (from.y ?? 6) + Math.random() * 4, from.z + (Math.random() - 0.5) * 6, to.x + (Math.random() - 0.5) * 10, to.y ?? 4, to.z + (Math.random() - 0.5) * 10, 0.6 + Math.random() * 0.25, 1, 0.8 + Math.random() * 0.5, now + i * 0.03);
    },
    // impact dust ring: fast ground-hugging front, then a slower roll
    ring(x, z, radius = 40, n = 24) {
      // a ground-hugging dust wall: the fast front (2 puffs per direction, overlapping) and a slower inner roll
      const k = Math.max(10, Math.round(n * 1.6 * scale));
      for (let i = 0; i < k; i++) {
        const a = (i / k) * 6.283 + Math.random() * 0.15;
        const sp = radius * 2.0 * (0.9 + Math.random() * 0.2);
        puff(x + Math.cos(a) * 4, 2, z + Math.sin(a) * 4, Math.cos(a) * sp, 1 + Math.random() * 2, Math.sin(a) * sp, 6 + Math.random() * 3, 0, 26 + Math.random() * 12, now + Math.random() * 0.04);
        if (i % 2 === 0) puff(x + Math.cos(a) * 4, 3, z + Math.sin(a) * 4, Math.cos(a) * sp * 0.55, 3 + Math.random() * 4, Math.sin(a) * sp * 0.55, 8 + Math.random() * 3, 0, 30 + Math.random() * 14, now + 0.1 + Math.random() * 0.1);
      }
      ringM.position.set(x, 0.6, z); ringM.scale.setScalar(radius * 1.6); ringState.t0 = now; ringM.visible = true;
    },
    flash(x, y, z, size = 60, dur = 0.5) { flashS.position.set(x, y, z); flashState.t0 = now; flashState.dur = dur; flashState.size = size; flashS.visible = true; },
    debris(origins) {
      for (let i = 0; i < DN; i++) {
        const o = origins[i % origins.length], it = dItems[i];
        const sp = 6 + Math.random() * 16, a = Math.atan2(o.dz ?? 0, o.dx ?? 1) + (Math.random() - 0.5) * 2.4;
        it.px = o.x + (Math.random() - 0.5) * 8; it.py = 3 + Math.random() * 10; it.pz = o.z + (Math.random() - 0.5) * 8;
        it.vx = Math.cos(a) * sp; it.vy = 12 + Math.random() * 22; it.vz = Math.sin(a) * sp;
        it.wx = (Math.random() - 0.5) * 7; it.wy = (Math.random() - 0.5) * 7; it.wz = (Math.random() - 0.5) * 7;
        it.s = (2.2 + Math.random() * 3.2) * (scale < 1 ? 0.9 : 1); it.delay = Math.random() * 0.18;
      }
      debrisState.t0 = now; debris.visible = true;
    },
    // water jets: handle.set(from, to, on); from/to: {x,y,z}; arc height from the distance
    water() {
      const j = jetFree.length ? jetFree.shift() : -1;
      return {
        set(from, to, on = true) {
          if (j < 0) return;
          jetA[j].set(from.x, from.y, from.z, on ? 1 : 0);
          const dd = Math.hypot(to.x - from.x, to.z - from.z);
          jetB[j].set(to.x, to.y, to.z, on ? Math.max(3, dd * 0.22) : 0);
        },
        dispose() { if (j >= 0) { jetA[j].w = 0; jetB[j].w = 0; jetFree.push(j); } },
      };
    },
    update() {
      // flash, ring, debris time-driven
      const ft = now - flashState.t0;
      if (flashS.visible) {
        if (ft > flashState.dur || ft < 0) { flashS.visible = false; flashMat.opacity = 0; }
        else { const k = 1 - ft / flashState.dur; flashMat.opacity = k * k; flashS.scale.setScalar(flashState.size * (0.6 + 0.4 * k)); }
      }
      const rt = now - ringState.t0;
      ringMat.uniforms.uT.value = rt >= 0 && rt < 1.2 ? rt : -1;
      if (rt > 1.2) ringM.visible = false;
      if (debris.visible) {
        const tS = now - debrisState.t0;
        if (tS > 14 || tS < 0) debris.visible = false;
        for (let i = 0; i < DN; i++) {
          const it = dItems[i];
          const t = tS - it.delay;
          if (t < 0) { debris.setMatrixAt(i, _zero); continue; }
          const rest = it.s * 0.3;
          const tLand = (it.vy + Math.sqrt(it.vy * it.vy + 2 * 9.8 * Math.max(0, it.py - rest))) / 9.8;
          const tf = Math.min(t, tLand);
          _pp.set(it.px + it.vx * tf, Math.max(rest, it.py + it.vy * tf - 4.9 * tf * tf), it.pz + it.vz * tf);
          _ee.set(it.wx * tf, it.wy * tf, it.wz * tf); _qq.setFromEuler(_ee);
          _sc.setScalar(tS > 10 ? it.s * Math.max(0, 1 - (tS - 10) / 3) : it.s);
          _m4.compose(_pp, _qq, _sc); debris.setMatrixAt(i, _m4);
        }
        debris.instanceMatrix.needsUpdate = true;
      }
    },
    flashLevel() { const ft = now - flashState.t0; return ft >= 0 && ft < flashState.dur ? Math.pow(1 - ft / flashState.dur, 2) : 0; },
    count() { return NF + NS + NE + NP + NG + JETS * 36; },
    /** live one-shot juice particles (puffs + sparks/arcs) at the current visual time; the DESIGN §8 cap of 300 applies here */
    live() {
      let n = 0;
      for (let i = 0; i < NP; i++) { const t = now - pe.array[i * 4 + 3]; if (t >= 0 && t < px.array[i * 4 + 3]) n++; }
      for (let i = 0; i < NG; i++) { const t = now - ge.array[i * 4 + 3]; if (t >= 0 && t < gx.array[i * 4 + 3]) n++; }
      return n;
    },
    dispose() { flameRT.dispose(); smokeTex.dispose(); group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); scene.remove(group); },
  };
  return api;
}
