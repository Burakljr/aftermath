// Small procedural sounds with the Web Audio API (no files).
// createAudio() -> { unlock(), play(name), setEnabled(bool), enabled() }
// The context is created on the first user gesture (unlock), as browsers require.

export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = true;
  let lastPlay = {};

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      // gentle limiter so stacked sounds never clip
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.ratio.value = 6;
      master.connect(comp);
      comp.connect(ctx.destination);
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function unlock() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  // one oscillator note with an attack/decay envelope
  function note(freq, start, dur, { type = 'sine', vol = 0.3, slide = 0, attack = 0.005 } = {}) {
    const t0 = ctx.currentTime + start;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(start, dur, { vol = 0.15, freq = 1200, q = 0.8 } = {}) {
    const t0 = ctx.currentTime + start;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
  }

  const SOUNDS = {
    tap: () => note(660, 0, 0.07, { type: 'triangle', vol: 0.18, slide: 1.3 }),
    boost: () => { note(880, 0, 0.08, { type: 'triangle', vol: 0.14, slide: 1.6 }); note(1320, 0.03, 0.08, { type: 'sine', vol: 0.08 }); },
    nope: () => note(220, 0, 0.14, { type: 'square', vol: 0.07, slide: 0.8 }),
    upgrade: () => {
      note(523, 0, 0.1, { type: 'triangle', vol: 0.22 });
      note(784, 0.06, 0.16, { type: 'triangle', vol: 0.22 });
    },
    milestone: () => {
      [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.07, 0.22, { type: 'triangle', vol: 0.22 }));
      note(1568, 0.3, 0.35, { type: 'sine', vol: 0.12 });
    },
    coin: () => {
      note(1568, 0, 0.06, { type: 'square', vol: 0.045 });
      note(2093, 0.045, 0.12, { type: 'square', vol: 0.04 });
    },
    claim: () => {
      [988, 1319, 1568].forEach((f, i) => note(f, i * 0.05, 0.12, { type: 'square', vol: 0.05 }));
    },
    open: () => {
      noise(0, 0.25, { vol: 0.12, freq: 900 });
      [392, 523, 659, 784].forEach((f, i) => note(f, 0.05 + i * 0.06, 0.3, { type: 'triangle', vol: 0.2 }));
    },
    goal: () => {
      note(784, 0, 0.12, { type: 'sine', vol: 0.25 });
      note(1175, 0.1, 0.28, { type: 'sine', vol: 0.22 });
    },
    complete: () => {
      const seq = [523, 659, 784, 1047, 784, 1047, 1319];
      seq.forEach((f, i) => note(f, i * 0.11, i === seq.length - 1 ? 0.6 : 0.16, { type: 'triangle', vol: 0.24 }));
      noise(0.75, 0.4, { vol: 0.08, freq: 3000, q: 0.5 });
    },
    honk: () => { note(330, 0, 0.16, { type: 'square', vol: 0.08 }); note(415, 0.2, 0.2, { type: 'square', vol: 0.08 }); },
  };

  // per-sound minimum gap so rapid events do not turn into noise
  const MIN_GAP = { coin: 0.09, tap: 0.04, boost: 0.05, upgrade: 0.05, claim: 0.1 };

  function play(name) {
    if (!enabled) return;
    const c = ensure();
    if (!c || c.state !== 'running') return;
    const fn = SOUNDS[name];
    if (!fn) return;
    const now = c.currentTime;
    const gap = MIN_GAP[name] || 0.03;
    if (lastPlay[name] && now - lastPlay[name] < gap) return;
    lastPlay[name] = now;
    try { fn(); } catch { /* ignore */ }
  }

  function setEnabled(on) {
    enabled = !!on;
    if (master && ctx) master.gain.setTargetAtTime(enabled ? 0.5 : 0, ctx.currentTime, 0.02);
  }

  return { unlock, play, setEnabled, enabled: () => enabled, sounds: Object.keys(SOUNDS) };
}
