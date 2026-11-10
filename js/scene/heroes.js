// Hero characters (KayKit Adventurers): templates, tinted materials, pooled instances with one
// AnimationMixer each and crossfades between the shared clips (anims.glb, one rig for all).
//
// Tints: tint 0 is the original outfit; tints 1..3 rotate the hue of the character's signature
// colour (knight red, mage purple, rogue green) on a copy of its texture, skin is untouched.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// model file names used by the game config (CUSTOMER_CHARS) -> our model names
export const CHAR_MODEL = { Knight: 'knight', Mage: 'mage', Rogue_Hooded: 'rogue_hooded', Rogue: 'rogue_hooded', Barbarian: 'barbarian' };
export const HERO_MODELS = ['knight', 'mage', 'rogue_hooded', 'barbarian'];

// hue ranges (degrees) of each outfit's signature colour and the shifts of tints 1..3
const TINTS = {
  // knights also get bronze / gold armour on two tints (grey metal pixels colourised)
  // (matte: low saturation, highlights pulled down so the helmet details survive at 1x)
  knight: { h0: 335, h1: 12, smin: 0.42, shifts: [0, 215, 130, 275], metal: [null, null, { h: 26, s: 0.2, l: 0.8 }, { h: 42, s: 0.3, l: 0.82 }] },
  mage: { h0: 228, h1: 335, smin: 0.18, shifts: [0, 320, 100, 262] },
  rogue_hooded: { h0: 95, h1: 190, smin: 0.25, shifts: [0, 215, 95, 265] },
  // cooks: the blue tunic becomes cream cook's whites (tint 0 is the only one used)
  barbarian: { h0: 190, h1: 230, smin: 0.15, shifts: [0, 0, 0, 0], whites: { h: 38, s: 0.32, l0: 0.6, l1: 0.38 } },
};

function rgb2hsl(r, g, b, out) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  out[0] = h; out[1] = s; out[2] = l;
  return out;
}
function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function hsl2rgb(h, s, l, out) {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) { out[0] = out[1] = out[2] = l; return out; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  out[0] = hue2rgb(p, q, h + 1 / 3);
  out[1] = hue2rgb(p, q, h);
  out[2] = hue2rgb(p, q, h - 1 / 3);
  return out;
}

function tintTexture(base, def, shift, metal) {
  const img = base.image;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  const d = data.data;
  const hsl = [0, 0, 0], rgb = [0, 0, 0];
  const wrap = def.h0 > def.h1;
  for (let i = 0; i < d.length; i += 4) {
    rgb2hsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255, hsl);
    const h = hsl[0];
    if (metal && hsl[1] < 0.14 && hsl[2] > 0.22 && hsl[2] < 0.9) {
      hsl2rgb(metal.h, metal.s, hsl[2] * (metal.l || 0.95) + 0.03, rgb);
      d[i] = rgb[0] * 255; d[i + 1] = rgb[1] * 255; d[i + 2] = rgb[2] * 255;
      continue;
    }
    const inside = wrap ? (h >= def.h0 || h <= def.h1) : (h >= def.h0 && h <= def.h1);
    if (!inside || hsl[1] < def.smin) continue;
    if (def.whites) {
      const w = def.whites;
      hsl2rgb(w.h, w.s, w.l0 + w.l1 * hsl[2], rgb);
      d[i] = rgb[0] * 255; d[i + 1] = rgb[1] * 255; d[i + 2] = rgb[2] * 255;
      continue;
    }
    hsl2rgb(h + shift, hsl[1], hsl[2], rgb);
    d[i] = rgb[0] * 255; d[i + 1] = rgb[1] * 255; d[i + 2] = rgb[2] * 255;
  }
  ctx.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = base.flipY;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

export function createHeroLib(models, animsGltf) {
  const clips = {};
  for (const c of animsGltf.animations) clips[c.name] = c;
  const templates = {};
  for (const name of HERO_MODELS) {
    const g = models[name];
    if (!g) continue;
    let mesh = null;
    g.scene.traverse((o) => { if (o.isSkinnedMesh && !mesh) mesh = o; });
    templates[name] = { scene: g.scene, map: mesh.material.map };
  }
  const maps = new Map(); // `${name}:${tint}` -> texture
  function mapFor(name, tint) {
    const key = name + ':' + tint;
    let m = maps.get(key);
    if (!m) {
      const def = TINTS[name];
      const k = def ? tint % def.shifts.length : 0;
      const shift = def ? def.shifts[k] : 0;
      const metal = def && def.metal ? def.metal[k] : null;
      m = shift || metal || (def && def.whites) ? tintTexture(templates[name].map, def, shift, metal) : templates[name].map;
      maps.set(key, m);
    }
    return m;
  }

  const pools = {};
  let made = 0;

  function make(name) {
    const t = templates[name];
    const model = SkeletonUtils.clone(t.scene);
    let mesh = null;
    const bones = {};
    model.traverse((o) => {
      if (o.isSkinnedMesh) mesh = o;
      if (o.isBone) bones[o.name] = o;
    });
    mesh.frustumCulled = false;
    const material = new THREE.MeshLambertMaterial({ map: t.map, transparent: false });
    mesh.material = material;
    const root = new THREE.Group();
    root.name = 'hero:' + name;
    root.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const n in clips) actions[n] = mixer.clipAction(clips[n]);
    made++;
    const hero = {
      name, root, model, mesh, material, mixer, actions, bones,
      handL: bones['handslotl'] || bones['handslot.l'] || bones['handl'],
      handR: bones['handslotr'] || bones['handslot.r'] || bones['handr'],
      head: bones['head'],
      cur: null, curAction: null, tint: -1, opacity: 1,
      // play(clip, fade seconds, speed, loop): crossfade from the current clip (no allocation)
      play(clip, fade = 0.2, speed = 1, loop = true, restart = false) {
        const a = actions[clip];
        if (!a) return null;
        if (hero.cur === clip && !restart) { a.timeScale = speed; return a; }
        const prev = hero.curAction;
        a.reset();
        a.enabled = true;
        a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        a.clampWhenFinished = !loop;
        a.timeScale = speed;
        a.time = 0;
        a.setEffectiveWeight(1);
        if (prev && prev !== a && fade > 0) {
          a.play();
          prev.crossFadeTo(a, fade, false);
        } else {
          if (prev && prev !== a) prev.stop();
          a.play();
        }
        hero.cur = clip;
        hero.curAction = a;
        return a;
      },
      setTint(tint) {
        if (hero.tint === tint) return;
        hero.tint = tint;
        material.map = mapFor(name, tint);
        material.needsUpdate = true;
      },
      setOpacity(o) {
        if (o === hero.opacity) return;
        const was = hero.opacity < 1;
        hero.opacity = o;
        material.opacity = o;
        const now = o < 1;
        if (now !== was) { material.transparent = now; material.depthWrite = !now; material.needsUpdate = true; }
      },
    };
    return hero;
  }

  /** A hero instance (from the pool if possible). */
  function acquire(name, tint = 0) {
    if (!templates[name]) name = 'knight';
    const pool = pools[name] || (pools[name] = []);
    const hero = pool.pop() || make(name);
    hero.setTint(tint);
    hero.setOpacity(1);
    hero.root.visible = true;
    hero.root.scale.setScalar(1);
    hero.cur = null;
    hero.curAction = null;
    hero.mixer.stopAllAction();
    return hero;
  }
  function release(hero) {
    hero.root.visible = false;
    if (hero.root.parent) hero.root.parent.remove(hero.root);
    hero.mixer.stopAllAction();
    (pools[hero.name] || (pools[hero.name] = [])).push(hero);
  }
  /** Pre-build tinted textures so the first appearance does not hitch. */
  function warm(names = HERO_MODELS, tints = 4) {
    for (const n of names) for (let t = 0; t < tints; t++) if (templates[n]) mapFor(n, t);
  }

  return { clips, templates, acquire, release, warm, get made() { return made; } };
}
