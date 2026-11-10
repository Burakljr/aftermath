// Quality presets, frame-time measurement and the automatic drop to Low.
//   High: pixel ratio min(dpr, 2), all decor, full particles.
//   Low:  pixel ratio min(dpr, 1.25), no small decor, ~45 % particles.

export const QUALITY = {
  high: { name: 'high', maxDpr: 2, decor: true, particles: 1 },
  low: { name: 'low', maxDpr: 1.25, decor: false, particles: 0.45 },
};

export function presetFor(q) {
  return q === 'low' ? QUALITY.low : QUALITY.high;
}

/**
 * Measures real frame times. When the average frame time stays above `slowMs` for `slowFor`
 * seconds (after a warm-up), calls onSlow() once per warm-up period.
 */
export function createPerfMonitor({ slowMs = 26, slowFor = 3, warmup = 2.5 } = {}) {
  let last = 0;
  let avgMs = 16.7;
  let slowT = 0;
  let warm = warmup;
  let frames = 0, fpsAcc = 0;
  const m = {
    enabled: true,
    onSlow: null,
    fps: 60,
    avgMs: 16.7,
    /** Call once per rendered frame. */
    frame(now = performance.now()) {
      if (!last) { last = now; return; }
      const ms = now - last;
      last = now;
      if (ms <= 0 || ms > 400) return; // tab switch or a hitch: ignore
      frames++; fpsAcc += ms;
      if (fpsAcc >= 500) { m.fps = Math.round((frames * 1000) / fpsAcc); frames = 0; fpsAcc = 0; }
      avgMs += (ms - avgMs) * 0.08;
      m.avgMs = avgMs;
      const sec = ms / 1000;
      if (warm > 0) { warm -= sec; return; }
      if (!m.enabled) { slowT = 0; return; }
      if (avgMs > slowMs) {
        slowT += sec;
        if (slowT >= slowFor) { slowT = 0; warm = warmup; if (m.onSlow) m.onSlow(); }
      } else slowT = Math.max(0, slowT - sec * 0.5);
    },
    /** Pause the slow detection for a moment (after a resize, a location switch...). */
    rest(sec = warmup) { warm = Math.max(warm, sec); last = 0; },
  };
  return m;
}
