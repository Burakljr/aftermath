// Dining tables: a small round KayKit table with two chairs per table, merged into one mesh.
// Tables not bought yet are drawn faded (same mesh, a pale see-through material) as the spot
// for the UI's "buy" sign; buying one pops it in.
import * as THREE from 'three';
import { clamp, easeOutBack } from './kit.js';

export function createTables(kit, layout, mats = {}) {
  const base = mats.base || kit.materials.base;
  const group = new THREE.Group();
  group.name = 'tables';
  const harbor = layout.id === 'harbor';
  const ghost = new THREE.MeshLambertMaterial({
    map: base.map, color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false,
  });
  ghost.userData.shared = true;
  const views = layout.tables.map((t, i) => {
    const b = kit.batch(base);
    b.add(harbor ? 'table_round_B' : 'table_round_A_small', 0, 0, 0, 0, harbor ? [0.52, 1, 0.52] : 1);
    for (const s of t.seats) {
      b.add(harbor ? 'chair_B' : 'chair_A', s.chair.pos[0] - t.pos[0], 0, s.chair.pos[1] - t.pos[1], s.chair.facing, 1);
    }
    const built = b.build('table:' + t.id);
    const mesh = built.children[0];
    const holder = new THREE.Group();
    holder.position.set(t.pos[0], 0, t.pos[1]);
    holder.add(built);
    group.add(holder);
    return { id: t.id, index: i, t, holder, mesh, built, owned: null, anim: 0 };
  });

  function update(tState, dt) {
    for (let i = 0; i < views.length; i++) {
      const v = views[i];
      const owned = !!(tState && tState[i] && tState[i].owned);
      if (owned !== v.owned) {
        if (v.owned === false && owned) v.anim = 0.5;
        v.owned = owned;
        v.mesh.material = owned ? base : ghost;
        v.mesh.renderOrder = owned ? 0 : 3;
      }
      if (v.anim > 0) {
        v.anim = Math.max(0, v.anim - dt);
        const t = 1 - v.anim / 0.5;
        const s = clamp(easeOutBack(t, 2.4), 0, 1.3);
        v.built.scale.set(0.5 + 0.5 * s, 0.2 + 0.8 * s, 0.5 + 0.5 * s);
        v.built.updateMatrixWorld(true);
      } else if (v.built.scale.x !== 1) {
        v.built.scale.set(1, 1, 1);
        v.built.updateMatrixWorld(true);
      }
    }
  }
  function pop(id) {
    const v = views.find((x) => x.id === id);
    if (v) v.anim = 0.5;
  }
  function dispose() {
    for (const v of views) v.built.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    ghost.dispose();
  }
  return { group, views, update, pop, dispose };
}
