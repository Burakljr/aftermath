// Seeded, injectable randomness for all game logic (tests call setSeed / setRandom).

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let src = mulberry32((Math.random() * 0xffffffff) >>> 0);

/** Uniform [0, 1). */
export function rand() {
  return src();
}

/** Re-seeds the generator (deterministic sequence). */
export function setSeed(n) {
  src = mulberry32(n >>> 0);
}

/** Injects any () => [0,1) function, e.g. Math.random or a scripted list. */
export function setRandom(fn) {
  src = typeof fn === 'function' ? fn : mulberry32(1);
}

export const randRange = (a, b) => a + rand() * (b - a);
export const randInt = (a, b) => a + Math.floor(rand() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(rand() * arr.length)];

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}
