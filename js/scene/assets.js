// The one place that loads 3D assets (assets/models/*.glb, built by tools/assets/build.mjs).
//
// loadModel(name) -> Promise<gltf>: fetches assets/models/<name>.glb relative to this module
// (works from a sub-path and inside a sandboxed iframe). If window.__EMBED[name] holds the file
// as base64 (a preview host that cannot serve .glb files), that is parsed instead.
// Every texture is set up for the KayKit gradient atlases: sRGB, linear filtering, no mipmaps
// (mip levels would blend neighbouring colour swatches), no anisotropy needed.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = new URL('../../assets/models/', import.meta.url).href;
const cache = new Map();
let loader = null;

function base64ToBuffer(b64) {
  const s = atob(b64.replace(/^data:[^,]*,/, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out.buffer;
}

function setupTextures(gltf) {
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      const t = m && m.map;
      if (!t || t.userData.dinerSetup) continue;
      t.colorSpace = THREE.SRGBColorSpace;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = 1;
      t.needsUpdate = true;
      t.userData.dinerSetup = true;
    }
  });
  return gltf;
}

export function loadModel(name) {
  if (cache.has(name)) return cache.get(name);
  if (!loader) loader = new GLTFLoader();
  const embed = typeof window !== 'undefined' && window.__EMBED && window.__EMBED[name];
  // plain fetch + arrayBuffer (not GLTFLoader.load: its progress stream wrapper makes Chromium
  // report finished downloads as aborted)
  const bytes = embed
    ? Promise.resolve().then(() => base64ToBuffer(embed))
    : fetch(BASE + name + '.glb').then((r) => {
      if (!r.ok) throw new Error(`${name}.glb: HTTP ${r.status}`);
      return r.arrayBuffer();
    });
  const p = bytes.then((buf) => new Promise((resolve, reject) => {
    loader.parse(buf, BASE, (g) => resolve(setupTextures(g)), reject);
  }));
  cache.set(name, p);
  p.catch(() => cache.delete(name));
  return p;
}

/** Load several models in parallel; onProgress(done, total) after each one. Resolves { name: gltf }. */
export async function loadModels(names, onProgress) {
  let done = 0;
  const out = {};
  await Promise.all(names.map((n) => loadModel(n).then((g) => {
    out[n] = g;
    done++;
    if (onProgress) onProgress(done, names.length);
  })));
  return out;
}

export const MODEL_BASE = BASE;
