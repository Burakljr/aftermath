// Cinematic post chain (ported from proto-B, quality-aware): HDR scene -> quarter-res bloom (2 levels)
// -> grade. Grade = exposure, split toning (cool shadows / warm highlights), ACES filmic, sRGB, black
// point, light vignette, very subtle grain, red-alert tint. No chromatic fringe.
// high: MSAA x4 scene target + bloom + vignette (6 extra draws, 4 at low res); low: grade only.
import * as THREE from 'three';

const VS = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const BRIGHT = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThreshold;
varying vec2 vUv;
void main(){
  // 4-tap box downsample + soft threshold
  vec3 c = vec3(0.0);
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0,-1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2( 1.0,-1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture2D(tSrc, vUv + uTexel * vec2( 1.0, 1.0)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThreshold, uThreshold * 2.2, l);
  gl_FragColor = vec4(min(c * k, vec3(24.0)), 1.0);
}`;

const BLUR = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uDir;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270;
  c += texture2D(tSrc, vUv + uDir * 1.3846154).rgb * 0.3162162;
  c += texture2D(tSrc, vUv - uDir * 1.3846154).rgb * 0.3162162;
  c += texture2D(tSrc, vUv + uDir * 3.2307692).rgb * 0.0702703;
  c += texture2D(tSrc, vUv - uDir * 3.2307692).rgb * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const GRADE = /* glsl */`
uniform sampler2D tScene; uniform sampler2D tBloomA; uniform sampler2D tBloomB;
uniform float uExposure, uBloom, uTime, uAlert, uSat, uContrast, uVignette, uGrain, uFlash, uBlack;
uniform vec3 uShadowTint, uHighTint;
uniform vec2 uRes;
varying vec2 vUv;

vec3 RRTAndODTFit(vec3 v){ vec3 a = v*(v+0.0245786)-0.000090537; vec3 b = v*(0.983729*v+0.4329510)+0.238081; return a/b; }
vec3 aces(vec3 color){
  const mat3 IN = mat3(0.59719,0.07600,0.02840, 0.35458,0.90834,0.13383, 0.04823,0.01566,0.83777);
  const mat3 OUT = mat3(1.60475,-0.10208,-0.00327, -0.53108,1.10813,-0.07276, -0.07367,-0.00605,1.07602);
  color = IN * color; color = RRTAndODTFit(color); color = OUT * color; return clamp(color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c){ return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float hash(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }

void main(){
  vec2 uv = vUv;
  vec2 d = uv - 0.5;
  vec3 col = texture2D(tScene, uv).rgb;
  vec3 bloom = texture2D(tBloomA, uv).rgb * 0.6 + texture2D(tBloomB, uv).rgb * 0.8;
  col += bloom * uBloom;
  col *= uExposure;
  col += uFlash * vec3(1.0, 0.85, 0.7);

  // split toning in linear space by luminance
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float sh = 1.0 - smoothstep(0.0, 0.35, lum);
  float hi = smoothstep(0.25, 1.4, lum);
  col *= mix(vec3(1.0), uShadowTint, sh);
  col *= mix(vec3(1.0), uHighTint, hi);

  // red alert: keep colour separation; tint the shadows crimson and pulse a red vignette later
  float pulse = 0.65 + 0.35 * sin(uTime * 5.5);
  col = mix(col, col * vec3(1.18, 0.78, 0.74), uAlert * 0.6 * sh);

  col = aces(col);
  // saturation + contrast in display-ish space
  float l2 = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l2), col, uSat);
  col = toSRGB(col);
  col = (col - 0.5) * uContrast + 0.5;
  col = max(col - uBlack, 0.0) / (1.0 - uBlack);   // deeper black point (no milky shadows)

  // vignette (stronger and redder in alert)
  float vig = 1.0 - smoothstep(0.18, 0.85, length(d * vec2(1.0, uRes.y / uRes.x * 0.62)));
  col *= mix(1.0, vig, uVignette);
  col = mix(col, col * vec3(1.0, 0.32, 0.26), uAlert * (1.0 - vig) * pulse * 0.95);

  // film grain
  float g = hash(uv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
  col += g * uGrain;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class Post {
  constructor(renderer) {
    this.renderer = renderer;
    const caps = renderer.capabilities;
    const type = caps.isWebGL2 !== false ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.type = type;
    this.rtScene = new THREE.WebGLRenderTarget(4, 4, { type, samples: 4, depthBuffer: true });
    this.bloomOn = true;
    const lo = { type, depthBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(4, 4, lo);
    this.rtB = new THREE.WebGLRenderTarget(4, 4, lo);
    this.rtC = new THREE.WebGLRenderTarget(4, 4, lo);
    this.rtD = new THREE.WebGLRenderTarget(4, 4, lo);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
    this.mBright = mk(BRIGHT, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.35 } });
    this.mBlur = mk(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.mGrade = mk(GRADE, {
      tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
      uExposure: { value: 1.25 }, uBloom: { value: 0.55 }, uTime: { value: 0 }, uAlert: { value: 0 },
      uSat: { value: 1.0 }, uContrast: { value: 1.08 }, uVignette: { value: 0.32 }, uGrain: { value: 0.01 }, uFlash: { value: 0 }, uBlack: { value: 0.025 },
      uShadowTint: { value: new THREE.Color(0.82, 0.96, 1.16) }, uHighTint: { value: new THREE.Color(1.08, 0.98, 0.86) },
      uRes: { value: new THREE.Vector2(1, 1) },
    });
    this.grade = this.mGrade.uniforms;
  }

  setQuality(q) {
    const hi = q !== 'low';
    this.bloomOn = hi;
    this.grade.uBloom.value = hi ? this.bloomLevel ?? 0.5 : 0;
    this.grade.uVignette.value = hi ? 0.3 : 0.2;
    this.grade.uGrain.value = hi ? 0.008 : 0;
    const samples = hi ? 4 : 0;
    if (this.rtScene.samples !== samples) {
      const w = this.rtScene.width, h = this.rtScene.height;
      this.rtScene.dispose();
      this.rtScene = new THREE.WebGLRenderTarget(w, h, { type: this.type, samples, depthBuffer: true });
    }
  }

  setSize(w, h) {
    this.rtScene.setSize(w, h);
    const qw = Math.max(1, Math.round(w / 4)), qh = Math.max(1, Math.round(h / 4));
    this.rtA.setSize(qw, qh); this.rtB.setSize(qw, qh);
    const ew = Math.max(1, Math.round(w / 10)), eh = Math.max(1, Math.round(h / 10));
    this.rtC.setSize(ew, eh); this.rtD.setSize(ew, eh);
    this.grade.uRes.value.set(w, h);
    this.w = w; this.h = h;
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  render(scene, camera) {
    const r = this.renderer;
    r.setRenderTarget(this.rtScene);
    r.render(scene, camera);
    const calls = r.info.render.calls, tris = r.info.render.triangles;
    if (!this.stats) this.stats = { sceneCalls: 0, sceneTris: 0 }; // reused: no per-frame allocation
    this.stats.sceneCalls = calls; this.stats.sceneTris = tris;
    this.grade.tScene.value = this.rtScene.texture;
    if (!this.bloomOn) {
      this.grade.tBloomA.value = this.rtScene.texture; this.grade.tBloomB.value = this.rtScene.texture;
      this.pass(this.mGrade, null);
      return;
    }
    // bloom level 1 (quarter res)
    this.mBright.uniforms.tSrc.value = this.rtScene.texture;
    this.mBright.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
    this.pass(this.mBright, this.rtA);
    this.mBlur.uniforms.tSrc.value = this.rtA.texture;
    this.mBlur.uniforms.uDir.value.set(1 / this.rtA.width, 0);
    this.pass(this.mBlur, this.rtB);
    this.mBlur.uniforms.tSrc.value = this.rtB.texture;
    this.mBlur.uniforms.uDir.value.set(0, 1 / this.rtA.height);
    this.pass(this.mBlur, this.rtA);
    // bloom level 2 (tenth res, wide glow)
    this.mBlur.uniforms.tSrc.value = this.rtA.texture;
    this.mBlur.uniforms.uDir.value.set(1.5 / this.rtC.width, 0);
    this.pass(this.mBlur, this.rtC);
    this.mBlur.uniforms.tSrc.value = this.rtC.texture;
    this.mBlur.uniforms.uDir.value.set(0, 1.5 / this.rtC.height);
    this.pass(this.mBlur, this.rtD);
    this.grade.tScene.value = this.rtScene.texture;
    this.grade.tBloomA.value = this.rtA.texture;
    this.grade.tBloomB.value = this.rtD.texture;
    this.pass(this.mGrade, null);
  }
  dispose() {
    for (const rt of [this.rtScene, this.rtA, this.rtB, this.rtC, this.rtD]) rt.dispose();
    for (const m of [this.mBright, this.mBlur, this.mGrade]) m.dispose();
    this.quad.geometry.dispose();
  }
}
