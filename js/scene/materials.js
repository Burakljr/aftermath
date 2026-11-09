// City + shared materials (ported from proto-B citymat.js). All patterns are computed in the fragment shader from uv / world position, so
// the city ships zero textures and stays crisp at any distance (with derivative-based fading).
//   facadeMaterial: plaster walls (desaturated so colour belongs to the actors), windows, blinds,
//                   shutters, shopfronts, lit windows, baked base AO, three damage tiers
//                   (soot + blown windows / corner bite with stepped floor slabs / stump), fire light
//                   and soot from nearby fires, and the gameplay camera CUTAWAY (buildings between
//                   the camera and the selected site drop to a cut-floor stub).
//   groundMaterial: asphalt, lane markings, crossings, paving, promenade, lamp pools, and around the
//                   corpse: crater rim, cracks, scorch and a grey-beige dust-and-rubble field.
//   seaMaterial:    sea with procedural ripples, sky reflection, a sun path and quay foam.
import * as THREE from 'three';
import { HEIGHT_FOG_GLSL } from './env.js';
import { ROADS, XR, ZR, COAST } from './layout.js';

export const cityUniforms = {
  uTime: { value: 0 },
  uNight: { value: 1 },                          // window light level (per time-of-day preset)
  uLamps: { value: 1 },                          // street lamp level
  uPower: { value: new THREE.Vector4(0, 0, 0, 0) }, // power cut zone: centre xz, radius, enabled
  uDust: { value: 0 },                           // impact dust coat level
  uSegA: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) }, // corpse capsules xz->xz
  uSegR: { value: new Array(8).fill(0) },
  uFire: { value: 0 },
  uFires: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) }, // fire xyz + intensity
  uCutA: { value: new THREE.Vector4(0, 0, 0, 0) },  // cutaway site xyz + radius (0 = off)
  uCutH: { value: 4.2 },
  uDesat: { value: 0.72 },
  uDis: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) }, // per district: wave front y, wave boost, power cut, dust
  uHi: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0)) },  // per district highlight tint rgb + amount
  uReb: { value: new Array(6).fill(0) },          // per district rebuild scaffold cover (1 = wrapped, 0 = done; polish W4)
};

const COMMON = /* glsl */`
float h21(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 4; k++){ v += a * vn(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
float box1(float x, float a, float b, float w){ return smoothstep(a - w, a + w, x) * (1.0 - smoothstep(b - w, b + w, x)); }
float rect(vec2 p, vec2 a, vec2 b, vec2 w){ return box1(p.x, a.x, b.x, w.x) * box1(p.y, a.y, b.y, w.y); }
`;

// ------------------------------------------------------------------------------------------- FACADE
export function facadeMaterial({ damaged = false } = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.0, side: damaged ? THREE.DoubleSide : THREE.FrontSide });
  mat.shadowSide = THREE.FrontSide;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, cityUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 aFac; attribute vec4 aDmg; attribute vec2 aBite; attribute float aDist;
varying vec4 vFac; varying vec4 vDmg; varying vec2 vBite; varying vec2 vFUv; varying vec3 vWP; varying float vDist;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vFac = aFac; vDmg = aDmg; vBite = aBite; vFUv = uv; vDist = aDist - 1.0;   // aDist = district id + 1 (0 = none)
vec4 wpos = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
wpos = instanceMatrix * wpos;
#endif
vWP = (modelMatrix * wpos).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime, uNight, uLamps, uDust, uFire, uCutH, uDesat; uniform vec4 uPower; uniform vec4 uCutA; uniform vec4 uFires[8];
uniform vec4 uDis[6]; uniform vec4 uHi[6]; uniform float uReb[6];
varying vec4 vFac; varying vec4 vDmg; varying vec2 vBite; varying vec2 vFUv; varying vec3 vWP; varying float vDist;
${COMMON}
vec3 facEmit = vec3(0.0); float facRough = 1.0; float cutEdge = 0.0;
`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  float kindD = floor(vFac.x + 0.5);
  float breakLine = 1e5;
  // ---- damage: stump (tier c) or corner bite (tier b)
  if (vDmg.x > 0.0) {
    bool bite = abs(vDmg.z) + abs(vDmg.w) > 0.01;
    float along = vWP.x * 0.83 + vWP.z * 0.57;
    float jag = (vn(vec2(along * 0.9, 0.37)) - 0.5) * 1.3 + (vn(vec2(along * 2.4, 1.7)) - 0.5) * 0.4;
    if (bite) {
      float R = vBite.x * (kindD > 4.5 && kindD < 5.5 ? 0.78 : 1.0);
      float d = distance(vWP.xz, vDmg.zw) + jag * 1.2;
      float t = clamp(d / R, 0.0, 1.0);
      float hb = vDmg.x + pow(t, 1.6) * (vBite.y + 6.0 - vDmg.x);
      hb = floor((hb - 4.0) / 3.0 + 0.5) * 3.0 + 4.0 + jag * 0.5;   // breaks follow the floor lines
      if (d < R && vWP.y > hb) discard;
      breakLine = d < R * 1.25 ? hb : 1e5;
    } else {
      float cell = floor(along / 3.1);
      float steps = floor(h21(vec2(cell, floor(vDmg.x * 7.0))) * 2.99);
      breakLine = vDmg.x - steps * 1.5 + jag;
      if (vWP.y > breakLine) discard;
    }
  }
  // ---- gameplay cutaway: a camera-facing capsule from the selected site towards the camera
  if (uCutA.w > 0.0) {
    vec3 ab = cameraPosition - uCutA.xyz;
    float L = length(ab);
    float t = clamp(dot(vWP - uCutA.xyz, ab) / (L * L), 0.0, 1.0);
    float dd = length(vWP - (uCutA.xyz + ab * t));
    float along = t * L;
    float rad = uCutA.w * smoothstep(8.0, 26.0, along);
    if (dd < rad) {
      float hcut = uCutH + 26.0 * smoothstep(rad * 0.7, rad, dd);
      if (vWP.y > hcut) discard;
      cutEdge = smoothstep(hcut - 0.5, hcut, vWP.y);
    }
  }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
  float kind = floor(vFac.x + 0.5);
  float seed = mod(floor(vFac.y + 0.5), 97.0) * 0.731 + 0.37;   // small, exact ids (no float precision noise)
  float fz = floor(vFac.z + 0.5);
  float style = mod(fz, 4.0);
  float wallType = floor(fz / 4.0 + 0.01);    // 0 front/back, 1 balcony wall, 2 gable side
  float shop = floor(vFac.w + 0.001);
  float litFrac = fract(vFac.w);
  float soot = vDmg.y;
  if (uPower.w > 0.5 && distance(vWP.xz, uPower.xy) < uPower.z) litFrac = 0.0;
  int di = int(vDist + 0.5);
  vec4 DIS = vDist > -0.5 ? uDis[di] : vec4(0.0);
  litFrac *= 1.0 - DIS.z;
  float wave = DIS.y * (1.0 - smoothstep(DIS.x - 3.0, DIS.x, vWP.y));
  litFrac = mix(litFrac, 0.97, wave);
  vec3 base = diffuseColor.rgb;
  base = mix(vec3(dot(base, vec3(0.2126, 0.7152, 0.0722))), base, uDesat);
  float grain = vn(vWP.xz * 1.7 + vWP.y * 1.3) * 0.5 + vn(vec2(vWP.x + vWP.z, vWP.y) * 0.35) * 0.5;
  if (kind > 0.5 && kind < 1.5) {
    vec2 uv = vFUv;
    float bay = floor(uv.x), fl = floor(uv.y);
    vec2 f = fract(uv);
    vec2 aa = fwidth(uv) * 1.2;
    float far = smoothstep(0.16, 0.42, max(aa.x, aa.y));
    float hA = h21(vec2(bay * 1.37 + seed, fl * 2.11 + seed * 3.7));
    float hB = h21(vec2(bay * 3.17 + seed * 1.3, fl * 1.73 + seed * 7.1));
    float hC = h21(vec2(bay * 0.71 + seed * 5.3, fl * 4.33 + seed * 1.7));
    vec3 wall = base * (0.93 + 0.1 * grain);
    float band = box1(f.y, -0.02, 0.07, aa.y);
    wall = mix(wall, base * 1.07, band * 0.6 * step(0.5, fl));
    float streak = smoothstep(0.55, 1.0, vn(vec2(vWP.x * 1.3 + vWP.z * 1.3, 0.5))) * (1.0 - f.y) * 0.1;
    wall *= 1.0 - streak;
    vec3 col = wall;
    float glass = 0.0; vec3 glassCol = vec3(0.0);
    vec3 lightCol = vec3(0.0);
    float sootWin = 0.0;
    if (fl < 0.5) {
      wall = mix(wall, base * 0.6, 1.0 - smoothstep(0.0, 0.08, f.y));
      col = wall;
      if (shop > 0.5) {
        float shut = step(0.72, hA);
        float g = rect(f, vec2(0.06, 0.07), vec2(0.94, 0.74), aa);
        float mull = 1.0 - box1(f.x, 0.48, 0.52, aa.x) * step(0.5, hC);
        vec3 inner = mix(vec3(0.05), vec3(0.15, 0.12, 0.1), f.y);
        vec3 lit = vec3(1.0, 0.7, 0.42) * (0.9 + 0.6 * hB);
        vec3 shutter = vec3(0.42, 0.42, 0.4) * (0.92 + 0.08 * sin(f.y * 120.0) * (1.0 - far));
        col = mix(col, vec3(0.12, 0.12, 0.13), rect(f, vec2(0.04, 0.05), vec2(0.96, 0.76), aa));
        col = mix(col, shut > 0.5 ? shutter : inner, g * mull);
        if (shut < 0.5) lightCol += lit * g * mull * step(0.12, litFrac) * 1.6;
        vec3 signC = vec3(0.45, 0.12, 0.1);
        float sc = h21(vec2(seed * 7.0 + 0.5, 3.0));
        if (sc > 0.75) signC = vec3(0.08, 0.22, 0.3); else if (sc > 0.5) signC = vec3(0.12, 0.26, 0.17); else if (sc > 0.25) signC = vec3(0.55, 0.4, 0.12);
        float sb = rect(f, vec2(-0.01, 0.8), vec2(1.01, 0.96), aa);
        col = mix(col, signC, sb);
        float letters = sb * step(0.45, vn(vec2(uv.x * 9.0, 2.0))) * rect(f, vec2(0.1, 0.84), vec2(0.9, 0.92), aa);
        col = mix(col, vec3(0.92, 0.88, 0.8), letters);
        lightCol += vec3(1.0, 0.85, 0.6) * letters * 0.8 * step(0.12, litFrac);
      } else {
        float w = rect(f, vec2(0.25, 0.35), vec2(0.75, 0.82), aa);
        col = mix(col, vec3(0.86, 0.86, 0.84) * 0.85, rect(f, vec2(0.22, 0.32), vec2(0.78, 0.85), aa));
        glass = w; glassCol = vec3(0.07, 0.08, 0.09);
        if (hB < litFrac) lightCol += vec3(1.0, 0.66, 0.36) * w * (0.6 + hC);
      }
    } else {
      bool gable = wallType > 1.5;
      bool balc = wallType > 0.5 && wallType < 1.5;
      float skip = gable ? step(0.45, hC) : 0.0;
      vec2 a0 = vec2(0.24, 0.3), a1 = vec2(0.76, 0.86);
      if (style > 1.5 && style < 2.5) { a0 = vec2(0.12, 0.34); a1 = vec2(0.88, 0.84); }
      if (style > 2.5) { a0 = vec2(0.3, 0.26); a1 = vec2(0.7, 0.88); }
      if (balc && mod(bay, 2.0) < 0.5) { a0 = vec2(0.3, 0.06); a1 = vec2(0.7, 0.86); }
      if (gable) { a0 = vec2(0.32, 0.36); a1 = vec2(0.68, 0.84); }
      float fr = 0.035;
      float frameM = rect(f, a0 - fr, a1 + fr, aa) * (1.0 - skip);
      float glassM = rect(f, a0, a1, aa) * (1.0 - skip);
      vec3 frameC = style > 1.5 && style < 2.5 ? vec3(0.16, 0.16, 0.17) : vec3(0.84, 0.83, 0.8);
      col = mix(col, frameC, frameM);
      col = mix(col, base * 1.12, rect(f, vec2(a0.x - 0.06, a0.y - 0.07), vec2(a1.x + 0.06, a0.y - fr), aa) * (1.0 - skip));
      float blind = hA < 0.3 ? 0.0 : (hA > 0.9 ? 1.0 : (hA - 0.3) * 1.1);
      float wy = (f.y - a0.y) / (a1.y - a0.y);
      float blindM = glassM * step(1.0 - blind, wy);
      vec3 blindC = mix(vec3(0.74, 0.72, 0.68), vec3(0.63, 0.61, 0.58), (0.5 + 0.5 * sin(wy * 75.0)) * (1.0 - far));
      if (style > 2.5 && hB > 0.45) {
        float sw = (a1.x - a0.x) * 0.5;
        float shutterM = (rect(f, vec2(a0.x - sw - 0.02, a0.y), vec2(a0.x - 0.02, a1.y), aa) + rect(f, vec2(a1.x + 0.02, a0.y), vec2(a1.x + sw + 0.02, a1.y), aa)) * (1.0 - skip);
        vec3 shC = hC > 0.5 ? vec3(0.22, 0.3, 0.25) : vec3(0.34, 0.24, 0.17);
        col = mix(col, shC * (0.92 + 0.08 * sin(f.y * 80.0) * (1.0 - far)), shutterM);
      }
      glass = glassM * (1.0 - blindM);
      glassCol = mix(vec3(0.05, 0.06, 0.075), vec3(0.19, 0.19, 0.23), smoothstep(0.2, 1.0, wy) * 0.6);
      glassCol = mix(glassCol, vec3(0.03, 0.03, 0.035), step(0.5, hC) * 0.4);
      col = mix(col, blindC, blindM);
      if (hB < litFrac) {
        vec3 lc = hC > 0.92 ? vec3(0.55, 0.7, 1.0) : mix(vec3(1.0, 0.56, 0.26), vec3(1.0, 0.74, 0.46), hC);
        float inten = 0.5 + 1.1 * fract(hA * 7.31);
        float curtain = 0.75 + 0.25 * smoothstep(0.0, 0.25, abs(f.x - 0.5 * (a0.x + a1.x)) / (a1.x - a0.x));
        lightCol += lc * inten * curtain * glass;
        lightCol += lc * inten * 0.08 * blindM;
      }
      // tier a: blown-out windows (black holes, no blinds) and soot streaks licking up from them
      if (soot > 0.05) {
        float blown = step(0.35, hA) * glassM;
        col = mix(col, vec3(0.02, 0.018, 0.016), blown * soot);
        glass *= 1.0 - blown * soot;
        float above = rect(f, vec2(a0.x - 0.05, a1.y), vec2(a1.x + 0.05, 1.05), aa) * step(0.35, hA);
        sootWin = above * (1.0 - (f.y - a1.y) / 0.2) * soot;
        lightCol *= 1.0 - soot;
      }
    }
    col = mix(col, glassCol, glass);
    col *= 1.0 - 0.75 * clamp(sootWin, 0.0, 1.0);
    facRough = mix(1.0, 0.25, glass);
    vec3 avg = mix(wall, vec3(0.12, 0.12, 0.13), fl < 0.5 ? 0.5 : 0.32);
    col = mix(col, avg, far * 0.85);
    lightCol *= mix(1.0, 0.75, far);
    // baked AO: walls darken towards the ground
    col *= mix(0.58, 1.0, smoothstep(0.0, 4.5, vWP.y));
    diffuseColor.rgb = col;
    facEmit = lightCol * (uNight + wave * 1.1);
  } else if (kind > 4.5 && kind < 5.5) {
    // exposed floor slab (concrete, dusty top, broken)
    diffuseColor.rgb = vec3(0.52, 0.5, 0.47) * (0.85 + 0.25 * grain);
  } else {
    diffuseColor.rgb = base * (0.94 + 0.1 * grain);
    if (kind > 1.5 && kind < 2.5) facEmit = base * 2.2 * uLamps;
    if (kind > 2.5 && kind < 3.5) facRough = 0.35;
    if (kind > 5.5 && kind < 6.5) {   // corrugated cladding (warehouses, sheds)
      float rib = 0.5 + 0.5 * sin((vWP.x + vWP.z) * 5.2);
      float fwr = fwidth((vWP.x + vWP.z) * 5.2);
      diffuseColor.rgb *= mix(0.86 + 0.14 * rib, 0.93, smoothstep(0.8, 2.0, fwr));
      diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 3.0, vWP.y));
    }
    if (kind > 6.5 && kind < 7.5) {   // striped awning (bazaar)
      float st = step(0.5, fract(vFUv.x * 6.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.83, 0.76), st * 0.8);
    }
  }
  // soot near a break
  if (breakLine < 1e4) {
    float s = smoothstep(breakLine - 8.0, breakLine, vWP.y);
    diffuseColor.rgb *= 1.0 - 0.7 * s;
    facEmit *= 1.0 - s;
  }
  // fire light from nearby fires: warm flicker on facades, soot above the flames, glowing interiors
  for (int i = 0; i < 8; i++) {
    vec4 F = uFires[i];
    if (F.w <= 0.0) continue;
    vec3 L = F.xyz - vWP;
    float d2 = dot(L, L);
    float flick = 0.75 + 0.25 * sin(uTime * 13.0 + F.x) * sin(uTime * 7.7 + F.z);
    facEmit += vec3(1.0, 0.4, 0.09) * F.w * 70.0 / (40.0 + d2) * flick * uFire;
    float hd = length(L.xz);
    float up = vWP.y - F.y;
    float sootF = (1.0 - smoothstep(3.0, 9.0, hd)) * smoothstep(-2.0, 3.0, up) * (1.0 - smoothstep(10.0, 22.0, up));
    diffuseColor.rgb *= 1.0 - 0.7 * sootF * uFire * min(F.w, 1.0);
  }
  if (uDust > 0.0) {
    float dn = vn(vWP.xz * 0.6) * 0.5 + 0.5;
    float up = 1.0 - smoothstep(0.0, 14.0, vWP.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.57, 0.52), uDust * 0.35 * dn * up);
  }
  // cut-floor stub: a pale cut line on top of the stub walls
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.84, 0.78), cutEdge);
  // polish W4: a cleaned block rises wrapped in scaffold netting; the tarp comes down from the roofs as it finishes
  if (vDist > -0.5 && uReb[di] > 0.001) {
    float front = uReb[di] * 50.0;
    float cover = 1.0 - smoothstep(front - 1.5, front, vWP.y);
    float alongS = (vWP.x + vWP.z) / 2.6, upS = vWP.y / 2.0;
    float gx = abs(fract(alongS + 0.5) - 0.5), gy = abs(fract(upS + 0.5) - 0.5);
    float grid = (1.0 - smoothstep(0.03, 0.08, min(gx, gy))) * (1.0 - smoothstep(0.2, 0.5, max(fwidth(alongS), fwidth(upS))));
    vec3 net = vec3(0.25, 0.37, 0.4) * (0.85 + 0.25 * vn(vWP.xz * 0.4 + vWP.y * 0.25));
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(net, vec3(0.66, 0.63, 0.56), grid), cover * 0.94);
    facEmit *= 1.0 - cover * 0.92;
  }
  if (vDist > -0.5) {
    vec4 HI = uHi[di];
    if (HI.w > 0.0) { float roofish = smoothstep(0.6, 0.9, abs(normalize(cross(dFdx(vWP), dFdy(vWP))).y)); diffuseColor.rgb = mix(diffuseColor.rgb, HI.rgb, HI.w * (0.08 + 0.12 * roofish)); facEmit += HI.rgb * HI.w * (0.05 + 0.1 * roofish); }
  }
  }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor *= facRough;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += facEmit;`)
      .replace('#include <opaque_fragment>', `if (!gl_FrontFacing) outgoingLight = vec3(0.03, 0.027, 0.025) + facEmit * 0.15;   // interiors: flat dark, unlit (no back-face shadow acne)
#include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'facadeV2' + (damaged ? 'D' : '');
  return mat;
}

// ------------------------------------------------------------------------------------------- GROUND
// aKind: 0 asphalt, 1 sidewalk/lot, 2 promenade paving, 3 park grass, 4 quay stone, 5 yard concrete,
//        6 square paving, 7 port apron, 8 pond water
const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2);
export function groundMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const VX = [...ROADS.v.map((r) => r.x), ...ROADS.laneX], VW = [...ROADS.v.map((r) => r.w / 2), ROADS.lane / 2, ROADS.lane / 2];
  const HZ = [...ROADS.h.map((r) => r.z), ...ROADS.laneZ], HW = [...ROADS.h.map((r) => r.w / 2), ROADS.lane / 2, ROADS.lane / 2, ROADS.lane / 2];
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, cityUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aKind; varying float vKind; varying vec3 vWP;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
vKind = aKind; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime, uNight, uLamps, uDust, uDesat; uniform vec4 uPower; uniform vec4 uSegA[8]; uniform float uSegR[8]; uniform vec4 uDis[6];
varying float vKind; varying vec3 vWP;
${COMMON}
const float VX[5] = float[](${VX.map(f2).join(',')});
const float VW[5] = float[](${VW.map(f2).join(',')});
const float HZ[7] = float[](${HZ.map(f2).join(',')});
const float HW[7] = float[](${HW.map(f2).join(',')});
const float ZQUAY = ${f2(COAST.quay)}, ZPROM = ${f2(COAST.promenade1)};
vec3 gEmit = vec3(0.0);
float segD(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0); return length(pa - ba * h); }
float corpseDist(vec2 p){ float d = 1e4; for (int i = 0; i < 8; i++){ if (uSegR[i] > 0.0) d = min(d, segD(p, uSegA[i].xy, uSegA[i].zw) - uSegR[i]); } return d; }
int distAt(vec2 p){
  if (abs(p.x) > 136.0 || p.y < -174.0 || p.y > 168.0) return -1;
  int col = p.x < 0.0 ? 0 : 1; int row = p.y < -56.0 ? 0 : (p.y < 56.0 ? 1 : 2);
  if (row == 0) return col == 0 ? 0 : 3;
  if (row == 1) return col == 0 ? 5 : 1;
  return col == 0 ? 4 : 2;
}
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
  vec2 p = vWP.xz;
  vec2 aa = fwidth(p);
  float aw = max(aa.x, aa.y);
  vec3 col;
  float n1 = fbm(p * 0.08), n2 = vn(p * 1.1);
  // nearest vertical / horizontal road (main roads 0..2 / 0..3, lanes after)
  float vd = 1e4, vhw = 0.0; int vi = -1;
  for (int i = 0; i < 5; i++) { float d = abs(p.x - VX[i]); bool lane = i >= 3; if (lane && (p.y < -162.0 || p.y > 162.0)) continue; if (d - VW[i] < vd - vhw) { vd = d; vhw = VW[i]; vi = i; } }
  float hd = 1e4, hhw = 0.0; int hi = -1;
  for (int i = 0; i < 7; i++) { float d = abs(p.y - HZ[i]); bool lane = i >= 4; if (lane && abs(p.x) > 118.0) continue; if (d - HW[i] < hd - hhw) { hd = d; hhw = HW[i]; hi = i; } }
  bool onV = vd < vhw && p.y > -174.0 && p.y < 174.0;
  bool onH = hd < hhw && abs(p.x) < 175.0;
  float dEdge = min(vd - vhw, hd - hhw);
  if (vKind < 0.5) {
    col = vec3(0.19, 0.195, 0.205) * (0.86 + 0.22 * n1 + 0.06 * n2);
    col = mix(col, vec3(0.15, 0.155, 0.165), smoothstep(0.62, 0.7, fbm(p * 0.05 + 3.0)) * 0.6);
    float mark = 0.0;
    bool laneV = vi >= 3, laneH = hi >= 4;
    if (onV && !onH && !laneV) {
      if (vi == 1) mark += box1(abs(vd - 0.25), -0.08, 0.08, aw);               // avenue: double centre line
      else mark += box1(vd, -0.1, 0.1, aw) * step(0.5, fract(p.y / 6.0));
      mark += box1(vd, vhw - 0.75, vhw - 0.55, aw) * 0.8;                       // edge lines
      float zone = box1(hd, hhw + 1.2, hhw + 4.2, aw);
      mark += zone * step(0.5, fract(p.x / 1.1)) * box1(vd, -vhw + 0.8, vhw - 0.8, aw);
    }
    if (onH && !onV && !laneH) {
      if (hi == 0) mark += box1(abs(hd - 0.2), -0.07, 0.07, aw);
      else mark += box1(hd, -0.1, 0.1, aw) * step(0.5, fract(p.x / 6.0));
      mark += box1(hd, hhw - 0.75, hhw - 0.55, aw) * 0.8;
      float zone = box1(vd, vhw + 1.2, vhw + 4.2, aw);
      mark += zone * step(0.5, fract(p.y / 1.1)) * box1(hd, -hhw + 0.8, hhw - 0.8, aw);
    }
    col = mix(col, vec3(0.6, 0.59, 0.55), clamp(mark, 0.0, 1.0) * (0.6 + 0.3 * n2) * (1.0 - smoothstep(0.4, 1.2, aw * 3.0) * 0.5));
    col *= 0.86 + 0.14 * smoothstep(0.3, 1.4, -dEdge);
  } else if (vKind < 1.5) {
    vec2 q = p / 0.62;
    float joint = max(box1(fract(q.x), -0.04, 0.04, aw / 0.62), box1(fract(q.y), -0.04, 0.04, aw / 0.62));
    col = vec3(0.43, 0.415, 0.39) * (0.9 + 0.12 * n1 + 0.05 * h21(floor(q)));
    col *= 1.0 - joint * 0.12;
    col = mix(vec3(0.58, 0.56, 0.52), col, smoothstep(0.25, 0.4, dEdge));     // kerb
    float lot = smoothstep(3.6, 4.4, dEdge);
    vec3 garden = mix(vec3(0.27, 0.25, 0.21), vec3(0.22, 0.27, 0.16), smoothstep(0.45, 0.6, fbm(p * 0.3)));
    col = mix(col, garden * (0.85 + 0.3 * n2), lot * 0.85);
  } else if (vKind < 2.5) {
    vec2 q = p / vec2(1.6, 1.2);
    q.x += step(0.5, fract(q.y * 0.5)) * 0.5;
    float joint = max(box1(fract(q.x), -0.03, 0.03, aw / 1.6), box1(fract(q.y), -0.03, 0.03, aw / 1.2));
    col = vec3(0.6, 0.53, 0.47) * (0.9 + 0.1 * h21(floor(q)) + 0.1 * n1);
    col *= 1.0 - joint * 0.15;
    col = mix(vec3(0.72, 0.68, 0.62), col, smoothstep(0.9, 1.1, p.y - ZQUAY));
  } else if (vKind < 3.5) {
    col = mix(vec3(0.18, 0.24, 0.13), vec3(0.25, 0.29, 0.15), fbm(p * 0.2)) * (0.85 + 0.25 * n2);
    float path = box1(abs(fract(p.x / 30.0 + 0.5) - 0.5) * 30.0, -1.4, 1.4, aw) + box1(abs(fract(p.y / 26.0 + 0.5) - 0.5) * 26.0, -1.4, 1.4, aw);
    col = mix(col, vec3(0.56, 0.5, 0.41), clamp(path, 0.0, 1.0));
  } else if (vKind < 4.5) {
    vec2 q = vec2(vWP.x / 1.4 + step(0.5, fract(vWP.y / 0.7 * 0.5)) * 0.5 + vWP.z / 1.4, vWP.y / 0.7);
    float joint = max(box1(fract(q.x), -0.04, 0.04, 0.05), box1(fract(q.y), -0.05, 0.05, 0.05));
    col = vec3(0.52, 0.48, 0.43) * (0.85 + 0.15 * h21(floor(q))) * (1.0 - joint * 0.3);
    col *= mix(0.55, 1.0, smoothstep(-1.4, -0.6, vWP.y));
  } else if (vKind < 5.5) {
    vec2 q = p / 6.0;
    float joint = max(box1(fract(q.x), -0.01, 0.01, aw / 6.0), box1(fract(q.y), -0.01, 0.01, aw / 6.0));
    col = vec3(0.34, 0.345, 0.35) * (0.9 + 0.12 * n1) * (1.0 - joint * 0.25);
    col = mix(col, vec3(0.32, 0.31, 0.3), smoothstep(0.55, 0.75, fbm(p * 0.12)) * 0.4);
  } else if (vKind < 6.5) {
    vec2 q = p / vec2(2.2, 2.2);
    float joint = max(box1(fract(q.x + q.y * 0.0), -0.02, 0.02, aw / 2.2), box1(fract(q.y), -0.02, 0.02, aw / 2.2));
    col = vec3(0.7, 0.66, 0.6) * (0.92 + 0.08 * h21(floor(q))) * (1.0 - joint * 0.12);
    float r = length(p - vec2(${f2(18)}, ${f2(-42)}));
    col = mix(col, vec3(0.55, 0.5, 0.45), box1(fract(r / 6.0), 0.0, 0.08, aw / 6.0) * 0.5);
  } else if (vKind < 7.5) {
    vec2 q = p / 12.0;
    float joint = max(box1(fract(q.x), -0.006, 0.006, aw / 12.0), box1(fract(q.y), -0.006, 0.006, aw / 12.0));
    col = vec3(0.46, 0.45, 0.43) * (0.9 + 0.12 * n1) * (1.0 - joint * 0.3);
    col = mix(col, vec3(0.62, 0.5, 0.12), box1(fract(p.x / 14.0), 0.0, 0.025, aw / 14.0) * 0.7);
  } else {
    vec3 V = normalize(cameraPosition - vWP);
    float fr = pow(1.0 - max(V.y, 0.0), 3.0);
    col = mix(vec3(0.05, 0.09, 0.09), vec3(0.3, 0.36, 0.45), fr) * (0.9 + 0.2 * vn(p * 0.4 + uTime * 0.2));
  }
  col = mix(vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), col, mix(1.0, uDesat, 0.6));
  // street lamp pools along the main roads (24 m pitch, both kerbs)
  float lamp = 0.0;
  if (abs(p.x) < 136.0 && p.y > ZPROM - 2.0 && p.y < 175.0) {
    if (vi >= 0 && vi < 3) { float cz = (floor(p.y / 24.0) + 0.5) * 24.0; for (int s = -1; s <= 1; s += 2) { vec2 lp = vec2(VX[vi] + float(s) * (VW[vi] + 0.9), cz); float d = length(p - lp); lamp += exp(-d * d / 40.0); } }
    if (hi >= 0 && hi < 4) { float cx = (floor(p.x / 24.0) + 0.5) * 24.0; for (int s = -1; s <= 1; s += 2) { vec2 lp = vec2(cx, HZ[hi] + float(s) * (HW[hi] + 0.9)); float d = length(p - lp); lamp += exp(-d * d / 40.0); } }
  }
  int di = distAt(p);
  float power = di >= 0 ? 1.0 - uDis[di].z : 1.0;
  gEmit += col * vec3(1.0, 0.66, 0.36) * lamp * 0.55 * uLamps * power;
  // monster aftermath: crater rim, cracks, scorch, grey-beige dust and rubble specks (per district)
  float dz = di >= 0 ? uDis[di].w : uDust;
  if (dz > 0.0) {
    float cd = corpseDist(p);
    float dustR = 34.0 + 22.0 * fbm(p * 0.035 + 4.0);
    float dust = 1.0 - smoothstep(dustR * 0.55, dustR, cd);
    vec3 dustC = vec3(0.47, 0.45, 0.42) * (0.88 + 0.24 * n2);
    col = mix(col, dustC, dust * dz * 0.85);
    vec2 cell = floor(p / 0.9);
    float r1 = h21(cell * 1.31), r2 = h21(cell * 2.77 + 4.0);
    vec2 cp = (fract(p / 0.9) - 0.5) - (vec2(r1, r2) - 0.5) * 0.5;
    float chip = (1.0 - smoothstep(0.08, 0.16 + aw * 0.4, length(cp))) * step(0.55, r1) * dust;
    col = mix(col, mix(vec3(0.3, 0.29, 0.27), vec3(0.72, 0.7, 0.66), r2), chip * dz * 0.8);
    float scorch = (1.0 - smoothstep(2.0, 14.0 + 10.0 * fbm(p * 0.05), cd)) * smoothstep(0.35, 0.55, fbm(p * 0.09 + 11.0) + 0.25);
    float crack = 1.0 - smoothstep(0.0, 0.06 + aw * 0.2, abs(fbm(p * 0.18) - 0.5));
    crack *= 1.0 - smoothstep(4.0, 26.0, cd);
    float rim = 1.0 - smoothstep(0.0, 6.0, cd);
    // polish W1: lighter scorch so the dark carcass separates from the ground at phone size (it sat on a black hole)
    col *= 1.0 - scorch * 0.36 * dz;
    col *= 1.0 - crack * 0.5 * dz;
    col *= 1.0 - rim * 0.32 * dz;
    col *= 1.0 - (1.0 - smoothstep(-3.0, 0.0, cd)) * 0.3 * dz;   // scorched crater floor under the body
    // embers along the footprint edge: patchy (noise-broken), never a continuous glowing outline (review V6)
    float emb = smoothstep(0.52, 0.72, fbm(p * 0.11 + 3.0));
    gEmit += vec3(1.0, 0.3, 0.06) * (1.0 - smoothstep(0.0, 3.0, abs(cd - 0.5))) * 0.24 * emb * dz * (0.6 + 0.4 * sin(uTime * 1.3 + p.x * 0.2));
  }
  diffuseColor.rgb = col;
  }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += gEmit;`);
  };
  mat.customProgramCacheKey = () => 'groundV2b';
  return mat;
}

// ------------------------------------------------------------------------------------------- SHARED (actors)
// One material per role keeps the program count low. Actors build vertex-coloured geometry.
export const sharedUniforms = { uTime: cityUniforms.uTime, uGain: { value: 5.0 } };
export function sharedMaterials() {
  const vehicle = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.15, flatShading: true });
  const rival = vehicle.clone(); rival.color = new THREE.Color(0xb89ae8);
  const tarp = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const glowVS = `attribute float aBlink; varying vec3 vC; varying float vB;
    void main(){ vC = vec3(1.0);
    #ifdef USE_COLOR
    vC = color;
    #endif
    vB = aBlink; vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * p; }`;
  // glow: steady HDR emissive (vertex colour x gain). beacon: aBlink 0 steady, 1 phase A, 2 phase B (4 Hz alternating), 3 amber slow pulse
  const glow = new THREE.ShaderMaterial({
    uniforms: sharedUniforms, vertexColors: true,
    vertexShader: glowVS,
    fragmentShader: `uniform float uTime, uGain; varying vec3 vC; varying float vB;
      void main(){ gl_FragColor = vec4(vC * uGain, 1.0);
      #include <colorspace_fragment>
      }`,
  });
  const beacon = new THREE.ShaderMaterial({
    uniforms: sharedUniforms, vertexColors: true,
    vertexShader: glowVS,
    fragmentShader: `uniform float uTime, uGain; varying vec3 vC; varying float vB;
      void main(){ float on = 1.0;
        if (vB > 0.5 && vB < 2.5) { float ph = vB > 1.5 ? 0.5 : 0.0; float f = fract(uTime * 4.0 + ph); on = mix(0.06, 1.0, smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.42, 0.5, f))); }
        else if (vB > 2.5) { on = mix(0.15, 1.0, pow(0.5 + 0.5 * sin(uTime * 7.0), 3.0)); }
        gl_FragColor = vec4(vC * uGain * 1.2 * on, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return { vehicle, rival, tarp, glow, beacon };
}

// ------------------------------------------------------------------------------------------- SEA
export function seaMaterial(fogU) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: cityUniforms.uTime,
      uSunPath: { value: new THREE.Vector3(-0.4, 0.5, -0.75).normalize() }, uSunPathI: { value: 1 }, // = real sun direction
      uGlow: { value: new THREE.Color(0xffa25a) },
      uFogColor: fogU.color, uFogDensity: fogU.density,
      uDeep: { value: new THREE.Color(0x13283a) }, uShallow: { value: new THREE.Color(0x2a4e5c) },
      uSkyLo: { value: new THREE.Color(0xe0a07c) }, uSkyHi: { value: new THREE.Color(0x5a6a98) },
      uQuayZ: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vWP;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uFogDensity, uQuayZ, uSunPathI; uniform vec3 uSunPath, uGlow, uFogColor, uDeep, uShallow, uSkyLo, uSkyHi;
      varying vec3 vWP;
      ${COMMON}
      ${HEIGHT_FOG_GLSL}
      vec2 wave(vec2 p, float t, float fw){
        vec2 g = vec2(0.0);
        float hf = 1.0 - smoothstep(0.15, 0.8, fw);   // kill sub-pixel ripples (no moire)
        g += vec2(cos(dot(p, vec2(0.09, 0.05)) + t * 0.9)) * vec2(0.09, 0.05) * 3.0;
        g += vec2(cos(dot(p, vec2(0.31, 0.22)) + t * 1.6)) * vec2(0.31, 0.22) * 1.6 * hf;
        g += vec2(cos(dot(p, vec2(-0.47, 0.38)) + t * 2.1)) * vec2(-0.47, 0.38) * 0.9 * hf;
        g += (vec2(vn(p * 0.6 + t * 0.3), vn(p * 0.6 - t * 0.27 + 5.0)) - 0.5) * 1.2 * hf;
        g += (vec2(vn(p * 0.07 + t * 0.05), vn(p * 0.07 - t * 0.04 + 9.0)) - 0.5) * 1.5;
        return g * 0.08;
      }
      void main(){
        vec3 V = normalize(cameraPosition - vWP);
        float fw = length(fwidth(vWP.xz));
        vec2 g = wave(vWP.xz, uTime, fw);
        vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
        float fres = pow(1.0 - max(dot(N, V), 0.0), 5.0) * 0.7 + 0.22;   // high camera: keep a sky sheen on the bay
        vec3 R = reflect(-V, N);
        vec3 sky = mix(uSkyLo, uSkyHi, smoothstep(0.0, 0.35, R.y));
        vec3 water = mix(uShallow, uDeep, smoothstep(0.0, 60.0, uQuayZ - vWP.z));
        vec3 col = mix(water, sky, fres);
        col += vec3(0.02, 0.05, 0.07) * (0.5 + 0.5 * vn(vWP.xz * 0.05 + uTime * 0.05));
        // sun path: broad warm sheen + sparkling ripple crests along the sun direction
        float sp = max(dot(R, uSunPath), 0.0);
        col += uGlow * (pow(sp, 10.0) * 0.1 + pow(sp, 60.0) * 0.5) * uSunPathI;
        float gl = smoothstep(0.86, 0.98, vn(vWP.xz * vec2(0.9, 2.2) + vec2(uTime * 0.6, -uTime * 0.2))) * (1.0 - smoothstep(0.0, 1.0, fw));
        col += uGlow * gl * pow(sp, 6.0) * 0.6 * uSunPathI;
        // wind ripples catching the light everywhere (not only along the sun path): small glints
        float rip = smoothstep(0.78, 0.95, vn(vWP.xz * vec2(0.35, 0.9) + vec2(uTime * 0.25, -uTime * 0.1))) * (1.0 - smoothstep(0.0, 1.2, fw));
        col += mix(uSkyLo, uGlow, 0.5) * rip * 0.18;
        float foam = (1.0 - smoothstep(0.0, 2.5, uQuayZ - vWP.z)) * smoothstep(0.4, 0.7, vn(vWP.xz * 0.8 + uTime * 0.4));
        col = mix(col, vec3(0.7, 0.68, 0.64), foam * 0.6);
        float fog = heightFog(cameraPosition, vWP, uFogDensity);
        col = mix(col, uFogColor, fog * 0.55);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
