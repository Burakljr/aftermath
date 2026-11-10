// Kitchen stations: one merged mesh per station and visual tier (milestones 10/25/50/100 add
// KayKit props or swap to the bigger appliance), a plain counter as the locked placeholder,
// pop / bounce animations on open and upgrade, and a soft glow while a tap boost runs.
import * as THREE from 'three';
import { clamp, easeOutBack } from './kit.js';

export const MILESTONES = [10, 25, 50, 100];
export function tierFor(level) {
  let t = 0;
  for (const m of MILESTONES) if (level >= m) t++;
  return t;
}

// station id -> kind (index order is the fallback: drinks, grill, pot, oven)
const KIND = { juice: 'drinks', cocoa: 'drinks', grill: 'grill', veggie: 'grill', stew: 'pot', soup: 'pot', oven: 'oven', roast: 'oven' };
const KIND_BY_INDEX = ['drinks', 'grill', 'pot', 'oven'];
export function kindOf(id, index) { return KIND[id] || KIND_BY_INDEX[index] || 'drinks'; }

/**
 * Props of a station at a tier, in station space (x right, z toward the room, y up; the
 * station is a 2 x 2 counter footprint centred at 0, its back against the wall at z = -1).
 * Each entry: [name, x, y, z, ry, scale]. `alt` = the Harbor variant (cocoa, veggie burger).
 */
function recipe(kind, tier, alt) {
  const P = [];
  const add = (...a) => P.push(a);
  if (kind === 'drinks') {
    const mugFull = alt ? 'mug_cocoa' : 'mug_juice';
    add('kitchencounter_straight_A_backsplash', 0, 0, 0);
    add(mugFull, -0.55, 1.0, 0.25, 0.4, 1.0);
    add(mugFull, -0.1, 1.0, 0.45, -0.5, 1.0);
    add('mug', 0.45, 1.0, 0.1, 1.2, 1.0);
    add(alt ? 'jar_D_large' : 'jar_C_large', -0.6, 1.0, -0.55, 0, 1.0);
    if (tier >= 1) { add(alt ? 'jar_B_large' : 'jar_A_large', -0.05, 1.0, -0.6, 0, 1.0); add(mugFull, 0.55, 1.0, 0.5, 2.2, 1.0); }
    if (tier >= 2) { add(alt ? 'crate_potatoes' : 'crate_carrots', 0.45, 1.0, -0.45, 0.1, 0.36); }
    if (tier >= 3) { add('kitchencabinet_half', 0, 0, -1, 0, 1); add('jar_C_medium', -0.65, 1.0, -0.1, 0, 0.8); }
    if (tier >= 4) { add('jar_D_large', 0.35, 1.0, -0.05, 0, 0.8); add(mugFull, 0.1, 1.0, 0.05, 0.9, 1.0); }
  } else if (kind === 'grill') {
    if (tier < 2) {
      add('stove_single', 0, 0, 0);
      add('pan_A', -0.05, 1.21, -0.2, Math.PI * 0.85, 0.85);
      add(alt ? 'food_ingredient_vegetableburger_cooked' : 'food_ingredient_burger_cooked', -0.05, 1.27, -0.2, 0, 0.7);
      if (tier >= 1) add('food_ingredient_bun', 0.65, 1.21, 0.45, 0, 0.55);
    } else {
      add(tier >= 3 ? 'stove_multi_decorated' : 'stove_multi', 0, 0, 0);
      add('pan_A', -0.42, 1.2, -0.42, Math.PI * 0.85, 0.7);
      add(alt ? 'food_ingredient_vegetableburger_cooked' : 'food_ingredient_burger_cooked', -0.42, 1.25, -0.42, 0, 0.6);
      add('pan_B', 0.42, 1.2, 0.3, Math.PI * 0.15, 0.7);
      add(alt ? 'food_ingredient_vegetableburger_cooked' : 'food_ingredient_burger_cooked', 0.42, 1.25, 0.3, 0, 0.6);
    }
    if (tier >= 4) add('extractorhood', 0, 0, -1, 0, 1);
  } else if (kind === 'pot') {
    add('kitchencounter_straight_A_backsplash', 0, 0, 0);
    if (tier < 2) {
      add('stove_single_countertop', 0, 0.01, 0, 0, 0.72);
      add('pot_A_stew', 0, 1.2, -0.05, 0, 0.8);
      if (tier >= 1) { add('bowl_small', 0.68, 1.0, 0.5, 0, 0.6); add('bowl_small', 0.68, 1.12, 0.5, 0, 0.6); }
    } else {
      add('stove_multi_countertop', 0, 0.01, 0, 0, 0.98);
      add('pot_large', 0, 1.2, -0.1, 0, 0.7);
      add('stew_pot', 0, 1.2 + 0.0, -0.1, 0, 1.15);
      add('bowl_small', 0.68, 1.0, 0.55, 0, 0.55);
      if (tier >= 3) { add('lid_A', -0.62, 1.0, 0.55, 0.4, 0.55); add('food_ingredient_carrot', 0.55, 1.0, -0.6, 1.2, 0.5); }
      if (tier >= 4) add('extractorhood', 0, 0, -1, 0, 1);
    }
  } else { // oven
    add('oven', 0, 0, 0);
    if (tier >= 1) add('plate_small', -0.55, 2.02, 0.2, 0, 0.7);
    if (tier >= 2) { add('plate_small', -0.55, 2.1, 0.2, 0, 0.7); add('food_ingredient_ham_cooked', 0.3, 2.04, 0.0, 0.6, 0.45); }
    if (tier >= 3) add('crate_potatoes', 0.35, 2.02, -0.5, 0.15, 0.32);
    if (tier >= 4) add('plate_small', -0.55, 2.18, 0.2, 0, 0.7);
  }
  return P;
}

export function createStations(kit, layout, mats = {}) {
  const group = new THREE.Group();
  group.name = 'stations';
  const alt = layout.id === 'harbor';
  const views = layout.stations.map((ls, i) => {
    const kind = kindOf(ls.id, i);
    const holder = new THREE.Group();
    holder.position.set(ls.pos[0], 0, ls.pos[1]);
    holder.rotation.y = ls.facing || 0;
    group.add(holder);
    const glow = makeGlow();
    glow.position.set(0, 0.02, 1.75);
    holder.add(glow);
    return {
      id: ls.id, index: i, kind, ls, holder, glow,
      cache: new Map(), // tier key -> Mesh group
      shown: null, key: null,
      open: false, level: 0, tier: -1,
      anim: 0, animKind: '', // seconds left / type of the current pop
      boost: 0,
    };
  });

  function build(v, key) {
    let g = v.cache.get(key);
    if (g) return g;
    const b = kit.batch();
    if (key === 'locked') {
      b.add('kitchencounter_straight_B', 0, 0, 0);
    } else {
      for (const [name, x, y, z, ry = 0, s = 1] of recipe(v.kind, Number(key), alt)) b.add(name, x, y, z, ry, s);
    }
    g = b.build('station:' + v.id + ':' + key);
    v.cache.set(key, g);
    return g;
  }

  function show(v, key) {
    if (v.key === key) return;
    if (v.shown) v.holder.remove(v.shown);
    v.shown = build(v, key);
    v.holder.add(v.shown);
    v.key = key;
  }

  /** Sync with state.stations (by index) and animate. */
  function update(stState, dt) {
    for (let i = 0; i < views.length; i++) {
      const v = views[i];
      const s = stState && stState[i];
      const open = !!(s && s.open);
      const level = s ? s.level : 1;
      const tier = open ? tierFor(level) : -1;
      const key = open ? String(tier) : 'locked';
      if (v.key !== key) {
        // first sync: no animation; later: pop
        if (v.key !== null) { v.anim = 0.55; v.animKind = 'pop'; }
        show(v, key);
      }
      v.open = open; v.level = level; v.tier = tier;
      // boost glow
      const target = s && s.boostT > 0 ? 1 : 0;
      v.boost += (target - v.boost) * Math.min(1, dt * 8);
      v.glow.visible = v.boost > 0.02;
      if (v.glow.visible) {
        v.glow.material.opacity = 0.55 * v.boost;
        const k = 1 + 0.06 * Math.sin(performance.now() * 0.008);
        v.glow.scale.set(k, 1, k);
      }
      // pop / bounce
      const sh = v.shown;
      if (v.anim > 0) {
        v.anim = Math.max(0, v.anim - dt);
        if (v.animKind === 'pop') {
          const t = 1 - v.anim / 0.55;
          const s0 = clamp(easeOutBack(clamp(t * 1.15, 0, 1), 2.2), 0, 1.3);
          sh.scale.set(0.6 + 0.4 * s0, 0.3 + 0.7 * s0, 0.6 + 0.4 * s0);
        } else {
          const t = 1 - v.anim / 0.3;
          const k = Math.sin(t * Math.PI) * (1 - t);
          sh.scale.set(1 + 0.06 * k, 1 - 0.1 * k, 1 + 0.06 * k);
        }
        sh.updateMatrixWorld(true);
      } else if (sh.scale.x !== 1 || sh.scale.y !== 1) {
        sh.scale.set(1, 1, 1);
        sh.updateMatrixWorld(true);
      }
    }
  }

  function bounce(id) {
    const v = views.find((x) => x.id === id);
    if (v && v.anim <= 0) { v.anim = 0.3; v.animKind = 'bounce'; }
  }
  function pop(id) {
    const v = views.find((x) => x.id === id);
    if (v) { v.anim = 0.55; v.animKind = 'pop'; }
  }

  function dispose() {
    for (const v of views) for (const g of v.cache.values()) g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }

  return { group, views, update, bounce, pop, dispose };
}

// soft warm glow on the floor in front of a boosted station (additive radial gradient)
let glowTex = null;
function makeGlow() {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,236,170,1)');
    g.addColorStop(0.55, 'rgba(255,200,90,0.55)');
    g.addColorStop(1, 'rgba(255,190,80,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
    glowTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 2.0).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }),
  );
  m.visible = false;
  m.renderOrder = 2;
  return m;
}
