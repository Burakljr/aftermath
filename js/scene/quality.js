// Quality tiers (W6, ARCH 5.5) and budget counters.
//   high: DPR min(devicePixelRatio, 1.5), one 2048 shadow map with a tight frustum, grade + bloom + vignette, 100 % particles
//   low : DPR 1.0, no shadows (AO skirts + actor blob shadows), grade only, 50 % particles / traffic / pedestrians
export const QUALITY = {
  high: { dprCap: 1.5, shadows: true, shadowSize: 2048, bloom: true, particles: 1 },
  low: { dprCap: 1.0, shadows: false, shadowSize: 1024, bloom: false, particles: 0.5 },
};
export const BUDGET = { drawCalls: 150, triangles: 400000, particles: 300, downloadBytes: 3 * 1024 * 1024 };

export function qualityPreset(q) { return QUALITY[q === 'low' ? 'low' : 'high']; }
export function dprFor(q) {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return Math.min(dpr, qualityPreset(q).dprCap);
}

// frame-time EMA; hint() returns true once when fps stays under `min` for `hold` seconds
export function createFpsMeter({ min = 28, hold = 5, ignore = 10 } = {}) {
  let ema = 60, low = 0, age = 0, hinted = false, last = 0;
  return {
    tick(nowMs, paused = false) {
      if (!last) { last = nowMs; return ema; }
      const dt = Math.min(0.5, (nowMs - last) / 1000); last = nowMs;
      if (dt <= 0) return ema;
      age += dt;
      ema += (1 / dt - ema) * Math.min(1, dt * 2);
      if (age > ignore && !paused && ema < min) low += dt; else low = 0;
      return ema;
    },
    fps: () => ema,
    hint() { if (!hinted && low > hold) { hinted = true; return true; } return false; },
    reset() { low = 0; age = 0; hinted = false; last = 0; },
  };
}
