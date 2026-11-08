// Environment (ported from proto-B, made state-driven): gradient sky with a sun glow (no stars), one
// shadowed sun, a hemisphere fill, exponential HEIGHT fog injected into every built-in material, and one
// time-of-day preset per game look. Looks crossfade over 1.5 s (numeric lerp, no allocations).
//   golden  : calm            (sunset over the bay: the sun sits over the sea, west = -z side)
//   dusk    : attack (pre-hit) (sun on the horizon, red grade)
//   blue    : impact           (attack after the hit: sun gone, fires and windows carry the image)
//   work    : tender / cleanup / rival (blue hour kept readable: brighter fill, lit windows, fires as keys)
import * as THREE from 'three';

export const FOG_B = 0.0115;
export const HEIGHT_FOG_GLSL = /* glsl */`
float heightFog(vec3 ro, vec3 wp, float a) {
  vec3 rd = wp - ro; float d = length(rd); rd /= max(d, 1e-4);
  float b = ${FOG_B.toFixed(5)};
  float k = abs(rd.y) < 1e-3 ? a * exp(-b * ro.y) * d
          : (a / b) * exp(-b * ro.y) * (1.0 - exp(-d * rd.y * b)) / rd.y;
  return 1.0 - exp(-max(k, 0.0));
}`;
THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
varying vec3 vFogWP;
#endif`;
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
vFogWP = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz);
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
uniform vec3 fogColor; uniform float fogDensity; uniform float fogNear; uniform float fogFar;
varying vec3 vFogWP;
${HEIGHT_FOG_GLSL}
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
float fogFactor = heightFog(cameraPosition, vFogWP, fogDensity);
float fogL = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(fogL), fogFactor * 0.6);
gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif`;

// azimuth: 0 = -Z (the bay), 90 = +X, 180 = +Z (camera side), 270 = -X
const dirArr = (azDeg, elDeg) => {
  const a = azDeg * Math.PI / 180, e = elDeg * Math.PI / 180;
  return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)];
};
const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

// field layout of one preset vector (colours = 3 floats in linear space)
const FIELDS = [
  ['sun', 3], ['sunCol', 3], ['sunI', 1], ['hemiSky', 3], ['hemiGround', 3], ['hemiI', 1],
  ['zenith', 3], ['mid', 3], ['horizon', 3], ['glow', 3], ['fog', 3], ['fogD', 1],
  ['exposure', 1], ['night', 1], ['lamps', 1], ['shadowRadius', 1],
  ['seaDeep', 3], ['seaShallow', 3], ['seaSkyLo', 3], ['seaSkyHi', 3], ['sunPathI', 1],
  ['shadowTint', 3], ['highTint', 3], ['sat', 1], ['alert', 1], ['desat', 1], ['bloom', 1], ['contrast', 1], ['fireK', 1],
];
const OFF = {}; let SIZE = 0;
for (const [k, n] of FIELDS) { OFF[k] = SIZE; SIZE += n; }

const RAW = {
  golden: {
    sun: dirArr(228, 30), sunCol: C(0xffc488), sunI: 6.4, hemiSky: C(0x8ea0d0), hemiGround: C(0x5a4a3e), hemiI: 1.2,
    zenith: C(0x3d5a98), mid: C(0x9c9cbc), horizon: C(0xf6be8c), glow: C(0xffae66), fog: C(0xcdb6aa), fogD: 0.0012,
    exposure: 1.08, night: 0.14, lamps: 0.1, shadowRadius: 2.2,
    seaDeep: C(0x173048), seaShallow: C(0x2c5664), seaSkyLo: C(0xeab08c), seaSkyHi: C(0x6474a4), sunPathI: 1.0,
    shadowTint: [0.9, 0.96, 1.1], highTint: [1.05, 1.0, 0.93], sat: 1.04, alert: 0, desat: 0.74, bloom: 0.45, contrast: 1.1, fireK: 0.6,
  },
  dusk: {
    sun: dirArr(286, 9), sunCol: C(0xff9a5a), sunI: 4.6, hemiSky: C(0x7a7aac), hemiGround: C(0x3a2a26), hemiI: 1.0,
    zenith: C(0x2a3468), mid: C(0x8a6a8a), horizon: C(0xf0905a), glow: C(0xff8a48), fog: C(0xa8807a), fogD: 0.0015,
    exposure: 1.12, night: 0.5, lamps: 0.6, shadowRadius: 2.5,
    seaDeep: C(0x101a2c), seaShallow: C(0x22364a), seaSkyLo: C(0xd8885e), seaSkyHi: C(0x4a4a7a), sunPathI: 1.2,
    shadowTint: [0.86, 0.9, 1.12], highTint: [1.1, 0.96, 0.86], sat: 1.06, alert: 0.55, desat: 0.7, bloom: 0.6, contrast: 1.1, fireK: 1.0,
  },
  blue: {
    sun: dirArr(300, 14), sunCol: C(0x8ea2d6), sunI: 1.6, hemiSky: C(0x4e64a4), hemiGround: C(0x1c1b24), hemiI: 0.95,
    zenith: C(0x0f1a3a), mid: C(0x2a3c6e), horizon: C(0x6a5a8a), glow: C(0xa06a7a), fog: C(0x2e3a5c), fogD: 0.0016,
    exposure: 1.3, night: 1.0, lamps: 1.0, shadowRadius: 3.0,
    seaDeep: C(0x060c18), seaShallow: C(0x101c2e), seaSkyLo: C(0x4a4a78), seaSkyHi: C(0x121c3a), sunPathI: 0.25,
    shadowTint: [0.86, 0.94, 1.16], highTint: [1.08, 0.98, 0.88], sat: 1.06, alert: 0.15, desat: 0.7, bloom: 0.62, contrast: 1.08, fireK: 1.0,
  },
  work: {
    sun: dirArr(232, 36), sunCol: C(0xe6c8d4), sunI: 3.8, hemiSky: C(0x8aa0d8), hemiGround: C(0x34303a), hemiI: 1.15,
    zenith: C(0x22356a), mid: C(0x5a6898), horizon: C(0xc89aa0), glow: C(0xe8a088), fog: C(0x50597a), fogD: 0.0011,
    exposure: 1.14, night: 0.8, lamps: 0.9, shadowRadius: 3.0,
    seaDeep: C(0x0c1626), seaShallow: C(0x1c2c44), seaSkyLo: C(0xa88a9a), seaSkyHi: C(0x2a3a64), sunPathI: 0.35,
    shadowTint: [0.88, 0.95, 1.14], highTint: [1.05, 1.0, 0.95], sat: 1.04, alert: 0, desat: 0.6, bloom: 0.55, contrast: 1.16, fireK: 1.0,
  },
};
const toVec = (P) => { const v = new Float32Array(SIZE); for (const [k, n] of FIELDS) { const val = P[k]; if (n === 1) v[OFF[k]] = val; else for (let i = 0; i < n; i++) v[OFF[k] + i] = val[i]; } return v; };
export const PRESETS = Object.fromEntries(Object.entries(RAW).map(([k, P]) => [k, toVec(P)]));

const SKY_VS = /* glsl */`
varying vec3 vDir;
void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = /* glsl */`
uniform vec3 uSun, uZenith, uMid, uHorizon, uGlow, uAlertCol, uFogCol; uniform float uAlert;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, h));
  col = mix(col, uZenith, smoothstep(0.15, 0.7, h));
  float s = max(dot(d, uSun), 0.0);
  float side = pow(max(dot(normalize(d.xz), normalize(uSun.xz)) * 0.5 + 0.5, 0.0), 3.0);
  col += uGlow * (side * (1.0 - smoothstep(0.0, 0.32, h)) * 0.55 + pow(s, 8.0) * 0.5 + pow(s, 64.0) * 1.2);
  col += uGlow * pow(s, 1200.0) * 14.0 * step(0.0, uSun.y);
  float az = atan(d.x, d.z);
  float band = smoothstep(0.04, 0.1, h) * (1.0 - smoothstep(0.14, 0.3, h));
  float cl = vn(vec2(az * 7.0, h * 60.0)) * vn(vec2(az * 2.5 + 5.0, h * 16.0));
  col = mix(col, uGlow * (0.45 + 0.9 * side) + uMid * 0.3, smoothstep(0.28, 0.62, cl) * band * 0.5);
  col = mix(col, uAlertCol * (0.4 + 0.6 * (1.0 - h)) + col * 0.45, uAlert * 0.28);
  col = mix(uFogCol, col, smoothstep(-0.03, 0.05, h));
  gl_FragColor = vec4(col, 1.0);
}`;

export function createEnv(scene) {
  const fogCol = new THREE.Color(0xc6a08c);
  scene.fog = new THREE.FogExp2(fogCol, 0.0015);
  scene.background = fogCol;
  const U = {
    uSun: { value: new THREE.Vector3(0, 0.3, 1) }, uZenith: { value: new THREE.Color() }, uMid: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uAlertCol: { value: new THREE.Color(0x6a140c) },
    uFogCol: { value: fogCol }, uAlert: { value: 0 },
  };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 24, 12), new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U }));
  sky.frustumCulled = false; sky.renderOrder = -10; sky.name = 'sky';
  scene.add(sky);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.35;
  scene.add(sun, sun.target);

  const cur = new Float32Array(SIZE), from = new Float32Array(SIZE);
  cur.set(PRESETS.golden);
  const env = { sun, hemi, sky, skyU: U, fogCol, sunDir: new THREE.Vector3(), cur, name: 'golden', target: 'golden', t: 1, dur: 1.5 };
  const tmpC = new THREE.Color();
  env.get = (k) => cur[OFF[k]];
  env.color = (k, out) => out.setRGB(cur[OFF[k]], cur[OFF[k] + 1], cur[OFF[k] + 2], THREE.LinearSRGBColorSpace);
  env.vec3 = (k, out) => out.set(cur[OFF[k]], cur[OFF[k] + 1], cur[OFF[k] + 2]);

  // fit the orthographic shadow camera around a ground box (centre, half extents)
  const _tgt = new THREE.Vector3();
  env.fitShadow = (cx, cz, halfW, halfD, height = 60) => {
    _tgt.set(cx, 0, cz);
    sun.target.position.copy(_tgt);
    sun.position.copy(_tgt).addScaledVector(env.sunDir, 500);
    const sc = sun.shadow.camera;
    const r = Math.max(halfW, halfD);
    sc.left = -r; sc.right = r; sc.top = r * 0.85 + height * 0.4; sc.bottom = -r * 0.85 - height * 0.4;
    sc.near = 150; sc.far = 950;
    sc.updateProjectionMatrix();
    sun.target.updateMatrixWorld();
    env.shadowBox = [cx, cz, halfW, halfD, height];
  };
  function applyVec() {
    env.vec3('sun', env.sunDir).normalize();
    U.uSun.value.copy(env.sunDir);
    env.color('zenith', U.uZenith.value); env.color('mid', U.uMid.value); env.color('horizon', U.uHorizon.value); env.color('glow', U.uGlow.value);
    env.color('fog', fogCol);
    scene.fog.density = env.get('fogD');
    env.color('hemiSky', hemi.color); env.color('hemiGround', hemi.groundColor); hemi.intensity = env.get('hemiI');
    env.color('sunCol', sun.color); sun.intensity = env.get('sunI');
    sun.shadow.radius = env.get('shadowRadius');
    U.uAlert.value = env.get('alert');
    if (env.shadowBox) env.fitShadow(...env.shadowBox);
  }
  // set the target look; instant skips the 1.5 s crossfade
  env.setLook = (name, instant = false) => {
    if (!PRESETS[name]) return;
    if (name === env.target && !instant) return;
    env.target = name;
    if (instant) { cur.set(PRESETS[name]); env.t = 1; env.name = name; applyVec(); return; }
    from.set(cur); env.t = 0;
  };
  env.update = (dt) => {
    if (env.t >= 1) return false;
    env.t = Math.min(1, env.t + dt / env.dur);
    const k = env.t * env.t * (3 - 2 * env.t);
    const to = PRESETS[env.target];
    for (let i = 0; i < SIZE; i++) cur[i] = from[i] + (to[i] - from[i]) * k;
    if (env.t >= 1) env.name = env.target;
    applyVec();
    return true;
  };
  env.apply = applyVec;
  env.setLook('golden', true);
  env.fitShadow(0, 20, 170, 220, 40);
  void tmpC;
  return env;
}
