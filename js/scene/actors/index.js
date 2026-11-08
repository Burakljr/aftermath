// Scene-actors hook (ARCH 5.3). scene-world ships this no-op stub with the full shape so the lab runs;
// scene-actors replaces it (fleet, work loops, corpse, attack director, buyer van).
// `world` is built by js/scene/scene.js; see ARCH 5.3 for its members.
export function createActors(world) {
  void world;
  return {
    update(state, dt, t) {},          // after world sync, before render
    event(type, payload) {},          // forwarded bus events
    attackPose(attack, t) { return null; }, // pure: monster/robot/camera pose for state.attack at t
    previewAttack(desc) {             // for scene.playAttack: { skip(), done, t }
      const h = { t: 0, skip() {}, done: Promise.resolve() };
      return h;
    },
    pickVehicle(x, y) { return null; },  // CSS px -> vehicleId | null
    anchor(name, out) { return null; },  // 'vehicle:<id>' | 'corpse:head' -> THREE.Vector3 | null
    setQuality(q) {},
    stats() { return { vehicles: 0, particles: 0 }; },
    dispose() {},
  };
}
