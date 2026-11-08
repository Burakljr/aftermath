export function createAttack(world) {
  return { update() {}, event() {}, pose() { return null; }, preview() { return { t: 0, skip() {}, done: Promise.resolve() }; }, setQuality() {}, particles() { return 0; }, dispose() {} };
}
