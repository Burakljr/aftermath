// Aftermath v2 UI: haptics (DESIGN §8). navigator.vibrate is a no-op where unsupported (iOS Safari).

const MAP = {
  hit: [90, 40, 180],
  dispatch: 10,
  fireOut: 15,
  roadOpen: 15,
  rare: 30,
  clean: 20,
  spread: 40,
  contract: 30,
  reveal: 30,
  sale: 10,
  purchase: 10,
  unlock: 20,
  error: 8,
};

let enabled = true;
export function setHaptics(on) {
  enabled = !!on;
}

export function buzz(name) {
  if (!enabled) return;
  const p = MAP[name];
  if (p == null) return;
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(p);
  } catch {
    /* ignore */
  }
}
