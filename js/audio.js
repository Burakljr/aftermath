// Aftermath — ses motoru. Tüm efektler ve müzik Web Audio ile anında üretilir:
// ses dosyası, indirme ya da lisans yok. Saldırı sesleri sahnedeki animasyonla
// aynı zamanlamayı kullanır (attack.t), müzik oyunun evresine göre değişir.
import { on } from './bus.js';
import { BAL, MONSTERS } from './data.js';

const PREF_KEY = 'aftermath.audio.v1';
export const prefs = { sfx: true, music: true };
try {
  Object.assign(prefs, JSON.parse(localStorage.getItem(PREF_KEY)) || {});
} catch {
  /* bozuk ayar: varsayılanlar */
}

let ctx = null;
let master;
let sfxBus;
let musicBus;
let musicDuck;
let reverb;
let noiseBuf;
let started = false;

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const now = () => ctx.currentTime;

/* ---------------- Kurulum ---------------- */

function build() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(ctx.destination);

  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = prefs.sfx ? 1 : 0;
  sfxBus.connect(master);

  musicDuck = ctx.createGain();
  musicDuck.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = prefs.music ? 0.55 : 0;
  musicBus.connect(musicDuck);

  // 1 saniyelik beyaz gürültü: patlama, yangın, su, lazer için ham malzeme
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // Yapay yankı: sönümlenen gürültüden üretilen oda tepkisi
  reverb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 2.2);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const ch = ir.getChannelData(c);
    for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  reverb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  reverb.connect(wet);
  wet.connect(master);
  return true;
}

// Tarayıcılar sesi ancak ilk dokunuştan sonra açar
function unlock() {
  if (!ctx && !build()) return;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  if (!started) {
    started = true;
    // iPhone'da sessiz modda bile oyun sesi çalsın (Safari 16.4+)
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'playback';
    } catch {
      /* desteklenmiyor */
    }
    setInterval(schedule, 25);
  }
}

export function initAudio(getState) {
  state = getState;
  for (const ev of ['pointerdown', 'touchend', 'keydown']) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else ctx.resume().catch(() => {});
    stopSiren();
  });
  bindEvents();
}

export function setPref(key, value) {
  prefs[key] = value;
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* depolama kapalı */
  }
  if (!ctx) return;
  const t = now();
  if (key === 'sfx') sfxBus.gain.setTargetAtTime(value ? 1 : 0, t, 0.05);
  if (key === 'music') musicBus.gain.setTargetAtTime(value ? 0.55 : 0, t, 0.15);
}

/* ---------------- Yapı taşları ---------------- */

function env(g, t, vol, a, dur, curve = 'exp') {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  else g.gain.linearRampToValueAtTime(0.0001, t + a + dur);
}

function out(node, { bus = sfxBus, pan = 0, rev = 0 } = {}) {
  let n = node;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    n.connect(p);
    n = p;
  }
  n.connect(bus);
  if (rev) {
    const s = ctx.createGain();
    s.gain.value = rev;
    n.connect(s);
    s.connect(reverb);
  }
}

// Tek bir osilatör notası: tip, frekans kayması, filtre, zarf
function tone({ t = now(), type = 'sine', f = 440, f2 = 0, dur = 0.2, vol = 0.1, a = 0.005, lp = 0, q = 1, detune = 0, curve, ...o }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t + a + dur);
  if (detune) osc.detune.value = detune;
  const g = ctx.createGain();
  env(g, t, vol, a, dur, curve);
  let n = osc;
  if (lp) {
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = lp;
    fl.Q.value = q;
    osc.connect(fl);
    n = fl;
  }
  n.connect(g);
  out(g, o);
  osc.start(t);
  osc.stop(t + a + dur + 0.05);
  return osc;
}

// Süzülmüş gürültü patlaması
function noise({ t = now(), dur = 0.2, vol = 0.1, a = 0.003, type = 'lowpass', f = 1000, f2 = 0, q = 0.8, curve, ...o }) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + dur);
  fl.Q.value = q;
  const g = ctx.createGain();
  env(g, t, vol, a, dur, curve);
  src.connect(fl);
  fl.connect(g);
  out(g, o);
  src.start(t, Math.random() * 1.5);
  src.stop(t + a + dur + 0.05);
}

/* ---------------- Efektler ---------------- */

const lastPlayed = {};
function throttle(key, gap) {
  const t = performance.now();
  if (lastPlayed[key] && t - lastPlayed[key] < gap) return false;
  lastPlayed[key] = t;
  return true;
}

const SFX = {
  click() {
    tone({ type: 'sine', f: 1100, f2: 700, dur: 0.04, vol: 0.06 });
  },
  tab() {
    tone({ type: 'triangle', f: 520, f2: 640, dur: 0.05, vol: 0.07 });
  },
  error() {
    const t = now();
    tone({ t, type: 'square', f: 196, dur: 0.12, vol: 0.06, lp: 900 });
    tone({ t: t + 0.13, type: 'square', f: 165, dur: 0.16, vol: 0.06, lp: 900 });
  },
  // Kasa: iki parlak nota + metalik tık
  cash(big) {
    const t = now();
    noise({ t, dur: 0.03, vol: 0.12, type: 'highpass', f: 5000 });
    tone({ t: t + 0.02, type: 'square', f: 1319, dur: 0.06, vol: 0.05, lp: 5000 });
    tone({ t: t + 0.09, type: 'square', f: 1760, dur: big ? 0.5 : 0.3, vol: 0.05, lp: 5000, rev: 0.4 });
    tone({ t: t + 0.09, type: 'sine', f: 3520, dur: 0.4, vol: 0.03, rev: 0.4 });
  },
  part() {
    if (!throttle('part', 90)) return;
    const notes = [76, 79, 81, 83, 86];
    tone({ type: 'triangle', f: mtof(notes[Math.floor(Math.random() * notes.length)]), dur: 0.09, vol: 0.05 });
  },
  rare() {
    const t = now();
    [84, 88, 91, 96, 100].forEach((m, i) => tone({ t: t + i * 0.06, type: 'sine', f: mtof(m), dur: 0.5, vol: 0.05, rev: 0.7 }));
  },
  mystery() {
    const t = now();
    for (const [m, d] of [[45, 0], [48, 6], [51, -6], [57, 4]]) {
      tone({ t, type: 'sawtooth', f: mtof(m), dur: 2.2, a: 0.6, vol: 0.035, lp: 700, detune: d, rev: 0.6, curve: 'lin' });
    }
    tone({ t: t + 0.4, type: 'sine', f: mtof(81), f2: mtof(80), dur: 1.4, a: 0.2, vol: 0.03, rev: 0.8 });
  },
  buy() {
    const t = now();
    [72, 76, 79, 84].forEach((m, i) => tone({ t: t + i * 0.055, type: 'triangle', f: mtof(m), dur: 0.14, vol: 0.06, rev: 0.2 }));
  },
  // İnşaat: üç tok vuruş ve yükselen ton
  build() {
    const t = now();
    for (let i = 0; i < 3; i++) {
      noise({ t: t + i * 0.09, dur: 0.06, vol: 0.18, f: 900, type: 'bandpass', q: 2 });
      tone({ t: t + i * 0.09, type: 'square', f: 140 + i * 30, dur: 0.05, vol: 0.05, lp: 600 });
    }
    [67, 72, 76, 79].forEach((m, i) => tone({ t: t + 0.3 + i * 0.07, type: 'triangle', f: mtof(m), dur: 0.25, vol: 0.06, rev: 0.4 }));
  },
  done() {
    const t = now();
    tone({ t, type: 'sine', f: mtof(79), dur: 0.12, vol: 0.06 });
    tone({ t: t + 0.08, type: 'sine', f: mtof(84), dur: 0.25, vol: 0.06, rev: 0.3 });
  },
  // Fabrika: metal çarpması (uyumsuz frekanslar) + buhar
  factory() {
    const t = now();
    tone({ t, type: 'square', f: 523, dur: 0.25, vol: 0.035, lp: 3000 });
    tone({ t, type: 'square', f: 741, dur: 0.18, vol: 0.03, lp: 3000 });
    tone({ t, type: 'sine', f: 1187, dur: 0.6, vol: 0.03, rev: 0.4 });
    noise({ t: t + 0.05, dur: 0.35, vol: 0.05, type: 'highpass', f: 3000, curve: 'lin' });
  },
  fireSpread() {
    const t = now();
    noise({ t, dur: 0.6, a: 0.12, vol: 0.18, type: 'bandpass', f: 300, f2: 2500, q: 1.2 });
    for (let i = 0; i < 8; i++) noise({ t: t + rnd(0.1, 0.7), dur: 0.02, vol: 0.12, type: 'highpass', f: 2000 });
  },
  win() {
    const t = now();
    const brass = (m, at, d, v = 0.05) => {
      tone({ t: t + at, type: 'sawtooth', f: mtof(m), dur: d, a: 0.02, vol: v, lp: 2200, rev: 0.35 });
      tone({ t: t + at, type: 'sawtooth', f: mtof(m), dur: d, a: 0.02, vol: v * 0.6, lp: 2200, detune: 9 });
    };
    brass(60, 0, 0.12);
    brass(64, 0.12, 0.12);
    brass(67, 0.24, 0.12);
    brass(72, 0.36, 0.7, 0.06);
    brass(64, 0.36, 0.7, 0.03);
  },
  lose() {
    const t = now();
    [67, 66, 65].forEach((m, i) => tone({ t: t + i * 0.28, type: 'sawtooth', f: mtof(m), dur: 0.24, vol: 0.05, lp: 1000 }));
    const o = tone({ t: t + 0.84, type: 'sawtooth', f: mtof(64), dur: 0.9, vol: 0.05, lp: 1000, rev: 0.3 });
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 6;
    lg.gain.value = 9;
    lfo.connect(lg);
    lg.connect(o.frequency);
    lfo.start(t + 0.84);
    lfo.stop(t + 1.8);
  },
  record() {
    SFX.win();
    const t = now() + 0.9;
    [84, 88, 91, 96].forEach((m, i) => tone({ t: t + i * 0.05, type: 'sine', f: mtof(m), dur: 0.6, vol: 0.04, rev: 0.7 }));
  },
  late() {
    const t = now();
    tone({ t, type: 'triangle', f: mtof(60), dur: 0.3, vol: 0.06 });
    tone({ t: t + 0.25, type: 'triangle', f: mtof(56), dur: 0.6, vol: 0.06, rev: 0.3 });
  },
  radar() {
    const t = now();
    tone({ t, type: 'sine', f: 1500, f2: 1800, dur: 0.25, vol: 0.05, rev: 0.5 });
    tone({ t: t + 0.3, type: 'sine', f: 1500, f2: 1800, dur: 0.25, vol: 0.03, rev: 0.5 });
  },
};

export function play(name, arg) {
  if (!ctx || ctx.state !== 'running' || !prefs.sfx) return;
  const fn = SFX[name];
  if (fn) fn(arg);
}

/* ---------------- Saldırı sahnesi ---------------- */

let siren = null;

function startSiren() {
  stopSiren();
  const t = now();
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.045, t + 0.2);
  const fl = ctx.createBiquadFilter();
  fl.type = 'lowpass';
  fl.frequency.value = 1800;
  const lfo = ctx.createOscillator();
  lfo.type = 'triangle';
  lfo.frequency.value = 0.9;
  const depth = ctx.createGain();
  depth.gain.value = 220;
  lfo.connect(depth);
  const oscs = [0, 7].map((det) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 680;
    o.detune.value = det;
    depth.connect(o.frequency);
    o.connect(fl);
    o.start(t);
    return o;
  });
  fl.connect(g);
  out(g, { rev: 0.5 });
  lfo.start(t);
  siren = { g, oscs, lfo };
}

function stopSiren(fade = 0.05) {
  if (!siren) return;
  const t = now();
  const { g, oscs, lfo } = siren;
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(g.gain.value, t);
  g.gain.linearRampToValueAtTime(0.0001, t + fade);
  for (const o of [...oscs, lfo]) o.stop(t + fade + 0.05);
  siren = null;
}

function footstep(mutant) {
  const t = now();
  const k = mutant ? 0.8 : 1;
  tone({ t, type: 'sine', f: 70 * k, f2: 28 * k, dur: 0.45, vol: 0.5 });
  noise({ t, dur: 0.35, vol: 0.25, f: 400, f2: 80 });
  for (let i = 0; i < 4; i++) noise({ t: t + rnd(0.05, 0.3), dur: 0.03, vol: 0.06, type: 'bandpass', f: rnd(1500, 3500), q: 3 });
}

// Kükreme: titreşimli testere dalgası + hırıltılı gürültü, ağız açılır gibi süzgeç
function roar(monster, mutant) {
  const t = now();
  const base = ((MONSTERS[monster] && MONSTERS[monster].voice) || 90) * (mutant ? 0.75 : 1);
  const dur = 1.2;
  const fl = ctx.createBiquadFilter();
  fl.type = 'bandpass';
  fl.Q.value = 3;
  fl.frequency.setValueAtTime(300, t);
  fl.frequency.linearRampToValueAtTime(1200, t + 0.35);
  fl.frequency.exponentialRampToValueAtTime(250, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.12);
  g.gain.setValueAtTime(0.5, t + 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const vib = ctx.createOscillator();
  vib.frequency.value = 28;
  const vibG = ctx.createGain();
  vibG.gain.value = base * 0.35;
  vib.connect(vibG);
  for (const [mul, det] of [[1, 0], [1.5, 12], [2.02, -10]]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base * mul, t);
    o.frequency.linearRampToValueAtTime(base * mul * 1.35, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(base * mul * 0.7, t + dur);
    o.detune.value = det;
    vibG.connect(o.frequency);
    o.connect(fl);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  vib.start(t);
  vib.stop(t + dur + 0.05);
  fl.connect(g);
  out(g, { rev: 0.6 });
  noise({ t, dur, a: 0.1, vol: 0.18, type: 'bandpass', f: 600, f2: 300, q: 1.5, rev: 0.5 });
}

function jets() {
  const t = now();
  for (const pan of [-0.7, 0.7]) {
    noise({ t, dur: 1.4, a: 0.4, vol: 0.12, type: 'bandpass', f: 400, f2: 2200, q: 1.5, pan, curve: 'lin' });
    tone({ t, type: 'sawtooth', f: 90, f2: 160, dur: 1.4, a: 0.4, vol: 0.03, lp: 500, pan, curve: 'lin' });
  }
}

function laser() {
  const t = now();
  const pan = Math.random() < 0.5 ? -0.6 : 0.6;
  tone({ t, type: 'square', f: rnd(2400, 3200), f2: rnd(250, 400), dur: 0.11, vol: 0.05, lp: 4000, pan, rev: 0.2 });
}

function whistle() {
  tone({ type: 'sine', f: 1300, f2: 180, dur: BAL.attackHit - 2.3, a: 0.05, vol: 0.06, curve: 'lin', rev: 0.3 });
}

function impact() {
  const t = now();
  tone({ t, type: 'sine', f: 80, f2: 22, dur: 1.8, vol: 0.9 });
  tone({ t, type: 'triangle', f: 50, f2: 30, dur: 1.2, vol: 0.4 });
  noise({ t, dur: 2.2, vol: 0.55, f: 1800, f2: 60, rev: 0.6 });
  noise({ t, dur: 0.25, vol: 0.4, type: 'highpass', f: 1500 });
  // Dökülen enkaz
  for (let i = 0; i < 26; i++) {
    const at = t + 0.15 + rnd(0, 1.6) ** 1.5;
    noise({ t: at, dur: rnd(0.02, 0.08), vol: rnd(0.04, 0.12), type: 'bandpass', f: rnd(600, 4000), q: 4 });
  }
  // Müziği kısa süre kıs
  musicDuck.gain.cancelScheduledValues(t);
  musicDuck.gain.setValueAtTime(0.15, t);
  musicDuck.gain.linearRampToValueAtTime(1, t + 3);
}

const atk = { step: -1, roar: false, jets: false, whistle: false, laserT: 0 };

function attackTick(s, dt) {
  const a = s.attack;
  const t = a.t;
  if (t < 1.8) {
    const step = Math.floor(t / 0.45);
    if (step !== atk.step) {
      atk.step = step;
      footstep(a.mutant);
    }
  }
  if (!atk.jets && t >= 0.9) {
    atk.jets = true;
    jets();
  }
  if (!atk.roar && t >= 1.85) {
    atk.roar = true;
    roar(a.monster, a.mutant);
  }
  if (t > 1.4 && t < 2.35) {
    atk.laserT -= dt;
    if (atk.laserT <= 0) {
      atk.laserT = rnd(0.07, 0.14);
      laser();
    }
  }
  if (!atk.whistle && t >= 2.3 && t < BAL.attackHit) {
    atk.whistle = true;
    whistle();
  }
}

/* ---------------- Ortam: yangın, su, iş makineleri ---------------- */

let amb = null;

function loopNoise(type, f, q) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  src.connect(fl);
  fl.connect(g);
  out(g);
  src.start();
  return g;
}

function ambient(s, dt) {
  if (!amb) {
    amb = {
      fire: loopNoise('lowpass', 500, 0.5),
      water: loopNoise('highpass', 3500, 0.5),
      engine: loopNoise('lowpass', 160, 2),
      beepT: 3,
    };
  }
  let fire = 0;
  let fireCrews = 0;
  let workCrews = 0;
  let debrisCrews = 0;
  for (const sec of s.sectors) {
    fire += sec.fire;
    if (sec.fire > 0) fireCrews += sec.crews.fire;
    if (sec.rubble > 0) debrisCrews += sec.crews.debris;
    if (sec.corpse > 0) workCrews += sec.crews.carve;
  }
  workCrews += debrisCrews;
  const active = s.phase === 'cleanup' || s.phase === 'rival' || s.phase === 'tender' || (s.phase === 'attack' && s.attack.hit);
  const fireLvl = active ? Math.min(1, fire / 160) : 0;
  const t = now();
  amb.fire.gain.setTargetAtTime(fireLvl * 0.1, t, 0.4);
  amb.water.gain.setTargetAtTime(s.phase === 'cleanup' ? Math.min(1, fireCrews / 4) * 0.025 : 0, t, 0.3);
  const engine = s.phase === 'cleanup' ? Math.min(1, workCrews / 6) : s.phase === 'rival' ? 0.35 : 0;
  amb.engine.gain.setTargetAtTime(engine * 0.12, t, 0.5);

  // Yangın çıtırtısı
  if (fireLvl > 0 && Math.random() < fireLvl * 22 * dt) {
    noise({ dur: rnd(0.01, 0.03), vol: rnd(0.03, 0.09) * fireLvl, type: 'bandpass', f: rnd(1200, 5000), q: 2 });
  }
  // Geri vites uyarısı: enkaz kamyonları çalışırken arada bir
  if (s.phase === 'cleanup' && debrisCrews > 0) {
    amb.beepT -= dt;
    if (amb.beepT <= 0) {
      amb.beepT = rnd(5, 11);
      const at = now();
      for (let i = 0; i < 3; i++) tone({ t: at + i * 0.45, type: 'square', f: 1050, dur: 0.22, a: 0.01, vol: 0.012, lp: 2500, pan: rnd(-0.8, 0.8), curve: 'lin' });
    }
  }
  // Parçalama ekipleri: arada bir testere vınlaması
  if (s.phase === 'cleanup' && workCrews - debrisCrews > 0 && Math.random() < 0.12 * dt) {
    tone({ type: 'sawtooth', f: rnd(160, 220), f2: rnd(240, 320), dur: rnd(0.4, 0.8), a: 0.08, vol: 0.012, lp: 1400, pan: rnd(-0.8, 0.8) });
  }
}

/* ---------------- Müzik ---------------- */
// Adım sıralayıcı: her ölçü 16 adım; notalar 120 ms ileriye planlanır.
// Her evrenin kendi parçası var; geçişler ölçü başında olur.

const ins = {
  pad(notes, t, dur, vol = 0.018, cut = 1100) {
    for (const m of notes) {
      for (const det of [-7, 7]) tone({ t, type: 'sawtooth', f: mtof(m), dur, a: dur * 0.35, vol, lp: cut, detune: det, bus: musicBus, rev: 0.5, curve: 'lin' });
    }
  },
  bass(m, t, dur, vol = 0.09) {
    tone({ t, type: 'triangle', f: mtof(m), dur, a: 0.01, vol, bus: musicBus });
    tone({ t, type: 'square', f: mtof(m), dur: dur * 0.8, a: 0.01, vol: vol * 0.25, lp: 400, bus: musicBus });
  },
  pluck(m, t, vol = 0.035, dur = 0.35, pan = 0) {
    tone({ t, type: 'triangle', f: mtof(m), dur, vol, bus: musicBus, rev: 0.35, pan });
    tone({ t, type: 'square', f: mtof(m), dur: dur * 0.4, vol: vol * 0.3, lp: 2200, bus: musicBus, pan });
  },
  lead(m, t, dur, vol = 0.03) {
    tone({ t, type: 'sawtooth', f: mtof(m), dur, a: 0.02, vol, lp: 2600, bus: musicBus, rev: 0.4 });
    tone({ t, type: 'square', f: mtof(m), dur, a: 0.02, vol: vol * 0.5, lp: 1800, detune: 8, bus: musicBus });
  },
  kick(t, vol = 0.35) {
    tone({ t, type: 'sine', f: 140, f2: 42, dur: 0.22, vol, bus: musicBus });
  },
  snare(t, vol = 0.09) {
    noise({ t, dur: 0.14, vol, type: 'bandpass', f: 2000, q: 0.7, bus: musicBus, rev: 0.2 });
    tone({ t, type: 'triangle', f: 190, f2: 150, dur: 0.08, vol: vol * 0.8, bus: musicBus });
  },
  hat(t, vol = 0.025, open = false) {
    noise({ t, dur: open ? 0.16 : 0.03, vol, type: 'highpass', f: 7500, bus: musicBus });
  },
  tom(t, m, vol = 0.25) {
    tone({ t, type: 'sine', f: mtof(m), f2: mtof(m - 7), dur: 0.35, vol, bus: musicBus, rev: 0.4 });
    noise({ t, dur: 0.06, vol: vol * 0.3, f: 800, bus: musicBus });
  },
};

// Akorlar MIDI nota numarası; ilk nota kök
const SONGS = {
  // Sakin: Aftermath Co. ofisi. La minör, yumuşak arpej, hafif ritim.
  calm: {
    bpm: 86,
    chords: [[57, 60, 64, 67], [53, 57, 60, 64], [48, 52, 55, 59], [55, 59, 62, 66]],
    play(st, t, bar, ch, sd) {
      if (st === 0) ins.pad(ch.map((m) => m + 12), t, sd * 16, 0.012, 900);
      if (st === 0 || st === 10) ins.bass(ch[0] - 12, t, sd * 5);
      const pat = bar % 4 < 2 ? [0, 1, 2, 3, 2, 1, 3, 2] : [0, 2, 1, 3, 0, 3, 2, 1];
      if (st % 2 === 0) {
        const m = ch[pat[st / 2]] + 12 + (st === 14 && bar % 2 ? 12 : 0);
        ins.pluck(m, t, 0.028, 0.5, st % 4 ? 0.3 : -0.3);
      }
      if (st === 0 || st === 8) ins.kick(t, 0.16);
      if (st % 4 === 2) ins.hat(t, 0.012);
    },
  },
  // İhale: saat tik takları, gergin re minör nabız
  tender: {
    bpm: 100,
    chords: [[50, 53, 57], [46, 50, 53], [50, 53, 57], [45, 49, 52]],
    play(st, t, bar, ch, sd) {
      if (st === 0) ins.pad(ch, t, sd * 16, 0.016, 700);
      if (st % 2 === 0) ins.bass(ch[0] - 12, t, sd * 1.4, 0.07);
      if (st % 4 === 0) ins.hat(t, 0.03);
      if (st === 12 && bar % 2) ins.pluck(ch[2] + 24, t, 0.02, 0.6);
    },
  },
  // Temizlik: iş başında! Mi minör, sürükleyici bas ve davul. Süre daralınca hızlanır.
  cleanup: {
    bpm: 116,
    chords: [[52, 55, 59], [48, 52, 55], [55, 59, 62], [50, 54, 57]],
    play(st, t, bar, ch, sd, s) {
      const c = s && s.contract;
      const urgent = c && c.elapsed / c.deadline > 0.75;
      if (st === 0) ins.pad(ch.map((m) => m + 12), t, sd * 16, 0.01, 1300);
      const bassPat = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 12, 7, 10];
      if (st % 2 === 0 || urgent) ins.bass(ch[0] - 12 + bassPat[st], t, sd * 0.9, 0.075);
      if (st % 4 === 0) ins.kick(t, 0.28);
      if (st === 4 || st === 12) ins.snare(t, 0.07);
      ins.hat(t, st % 2 ? 0.012 : 0.022, st === 14);
      const arp = [0, 1, 2, 1];
      if (st % 2 === 1 || urgent) ins.pluck(ch[arp[st % 4]] + 24, t, 0.016, 0.18, st % 4 < 2 ? -0.4 : 0.4);
      // Ana tema: her dört ölçüde bir dönen kısa melodi
      const theme = { 0: [76, 3], 3: [79, 3], 6: [78, 2], 8: [76, 6] };
      const theme2 = { 0: [74, 3], 3: [72, 3], 6: [71, 2], 8: [74, 6] };
      const m = (bar % 4 === 1 ? theme : bar % 4 === 3 ? theme2 : null);
      if (m && m[st]) ins.lead(m[st][0], t, sd * m[st][1], urgent ? 0.03 : 0.022);
    },
    bpmFor(s) {
      const c = s && s.contract;
      return c && c.elapsed / c.deadline > 0.75 ? 132 : 116;
    },
  },
  // Saldırı: davullar ve alçak gerilim
  attack: {
    bpm: 140,
    chords: [[38, 45, 50]],
    play(st, t, bar, ch, sd) {
      if (st === 0) ins.pad(ch, t, sd * 16, 0.02, 500);
      const toms = { 0: 45, 3: 45, 6: 40, 8: 45, 10: 43, 12: 40, 14: 38 };
      if (toms[st]) ins.tom(t, toms[st], 0.2);
    },
  },
  // Rakip kazandı: hüzünlü, seyrek
  rival: {
    bpm: 72,
    chords: [[57, 60, 64], [52, 55, 59], [53, 57, 60], [52, 56, 59]],
    play(st, t, bar, ch, sd) {
      if (st === 0) ins.pad(ch, t, sd * 16, 0.014, 700);
      if (st === 0) ins.bass(ch[0] - 12, t, sd * 12, 0.06);
      if (st === 0 || st === 6 || st === 12) ins.pluck(ch[(st / 6) % 3] + 12, t, 0.025, 0.9);
    },
  },
};

let state = () => null;
let song = 'calm';
let nextStep = 0;
let step = 0;
let bar = 0;

function moodFor(s) {
  if (!s) return 'calm';
  if (s.phase === 'attack') return 'attack';
  if (s.phase === 'tender') return 'tender';
  if (s.phase === 'cleanup') return 'cleanup';
  if (s.phase === 'rival') return 'rival';
  return 'calm';
}

function schedule() {
  if (!ctx || ctx.state !== 'running') return;
  const s = state();
  const t0 = now();
  if (nextStep < t0) nextStep = t0 + 0.05;
  while (nextStep < t0 + 0.12) {
    if (step === 0) {
      const want = moodFor(s);
      if (want !== song) {
        song = want;
        bar = 0;
      }
    }
    const sg = SONGS[song];
    const bpm = sg.bpmFor ? sg.bpmFor(s) : sg.bpm;
    const sd = 60 / bpm / 4;
    if (prefs.music) sg.play(step, nextStep, bar, sg.chords[bar % sg.chords.length], sd, s);
    nextStep += sd;
    step = (step + 1) % 16;
    if (step === 0) bar++;
  }
}

// Saldırı başlayınca müzik ölçü sonunu beklemeden değişsin
function jumpTo(name) {
  song = name;
  step = 0;
  bar = 0;
  if (ctx) nextStep = now() + 0.05;
}

/* ---------------- Olaylar ---------------- */

function bindEvents() {
  on('attack-start', () => {
    if (!ctx || ctx.state !== 'running') return;
    Object.assign(atk, { step: -1, roar: false, jets: false, whistle: false, laserT: 0 });
    jumpTo('attack');
    if (prefs.sfx) startSiren();
  });
  on('hit', () => {
    if (!ctx || ctx.state !== 'running') return;
    stopSiren(0.4);
    if (prefs.sfx) impact();
  });
  on('sfx', ({ name, arg }) => play(name, arg));
  on('toast', ({ kind }) => {
    if (kind === 'bad') play('error');
  });
  on('float', ({ text }) => {
    if (text.includes('Yangın sıçradı')) play('fireSpread');
    else if (text.includes('boşa çıktı')) play('done');
    else if (text.includes('Göz')) play('rare');
    else if (text.startsWith('+1')) play('part');
    else if (text.includes('Seviye')) play('build');
  });
}

// Her karede çağrılır: saldırı koreografisi ve ortam sesleri
export function updateAudio(s, dt) {
  if (!ctx || ctx.state !== 'running') return;
  if (s.phase === 'attack' && !s.attack.hit && prefs.sfx) attackTick(s, dt);
  else if (siren && s.phase !== 'attack') stopSiren(0.3);
  if (prefs.sfx) ambient(s, dt);
  else if (amb) for (const k of ['fire', 'water', 'engine']) amb[k].gain.setTargetAtTime(0, now(), 0.1);
}

