// The four stations of a factory: chunky toy-like machines built from
// rounded primitives (ink outlines baked in, see kit.js), locked plots, belt
// turntables, progress screens and glows.
//
// Every station is built in a canonical frame (left-column station): the belt
// comes in along -Z, leaves along +X, the corner (turntable / work spot) is
// the origin, the machine stands behind it at (-OFF, -OFF) and the worker at
// the front-left. Right-column stations use the same build mirrored across
// the x = z plane.
import * as THREE from 'three';
import { CORNERS, MACHINE_OFFSET as OFF } from './layout.js';
import { G, Builder, PAL, toyMaterial, shade, ease, clamp, TAU, radialTexture } from './kit.js';
import { BELT_Y } from './factory.js';

const PI = Math.PI;
const DIAG = PI / 4; // ry so that local +Z points from the machine to its turntable
const GOLD = PAL.gold;
const STEEL = 0xe6e4f2;
const INK = PAL.ink;
const PLINTH = 0x3d3357;
const MILESTONES = [10, 25, 50, 100];

export function tierOf(level) {
  let t = 0;
  for (const m of MILESTONES) if (level >= m) t++;
  return t;
}

const MIRROR = new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
/** worker stand spot relative to the corner (canonical) and facing */
export const WORKER_SPOT = { x: -1.0, z: 0.82, ry: 1.55, idleRy: 0.8 };

// -------------------------------------------------------------- machine kit
function cabinet(b, color, h, tier, icon = 'star') {
  const dark = shade(color, -0.32), light = shade(color, 0.2);
  // dark plinth with hazard stripes on the two visible faces
  b.add(G.box(1.84, 0.22, 1.84, 0.09), PLINTH, 0, 0.11, 0);
  for (let k = 0; k < 6; k++) {
    const t = -0.68 + k * 0.27;
    b.add(G.box(0.12, 0.15, 0.02, 0), PAL.yellow, t, 0.11, 0.925, { rz: 0.6, ol: 0 });
    b.add(G.box(0.02, 0.15, 0.12, 0), PAL.yellow, 0.925, 0.11, t, { rx: -0.6, ol: 0 });
  }
  // body, darker skirt, light lid
  b.add(G.box(1.62, h, 1.62, 0.19), color, 0, 0.22 + h / 2, 0);
  b.add(G.box(1.67, 0.12, 1.67, 0.05), dark, 0, 0.3, 0, { ol: 0.7 });
  const top = 0.22 + h;
  b.add(G.box(1.78, 0.17, 1.78, 0.08), tier >= 3 ? GOLD : light, 0, top + 0.04, 0);
  // control panel on the worker side (+Z face): bezel, screen, three chunky buttons
  const sy = 0.22 + h * 0.63;
  b.add(G.box(1.06, 0.46, 0.08, 0.07), PAL.cream, -0.06, sy, 0.79, { ol: 0.8 });
  b.add(G.box(0.9, 0.3, 0.06, 0.06), 0x2b2440, -0.06, sy, 0.82, { ol: 0 });
  const by = 0.22 + h * 0.24;
  b.add(G.cyl(0.085, 0.085, 0.09, 8), PAL.red, -0.42, by, 0.81, { rx: PI / 2, ol: 0.7 });
  b.add(G.cyl(0.085, 0.085, 0.09, 8), PAL.yellow, -0.16, by, 0.81, { rx: PI / 2, ol: 0.7 });
  b.add(G.cyl(0.085, 0.085, 0.09, 8), PAL.green, 0.1, by, 0.81, { rx: PI / 2, ol: 0.7 });
  // round emblem on the belt side (+X face)
  const ey = 0.22 + h * 0.56;
  b.add(G.cyl(0.29, 0.29, 0.07, 14), PAL.cream, 0.81, ey, -0.08, { rz: PI / 2, ol: 0.8 });
  if (icon === 'heart') b.add(G.heart(0.34, 0.05), color, 0.86, ey, -0.08, { ry: PI / 2, ol: 0 });
  else b.add(G.star(0.19, 0.085, 0.05, 5, false), color, 0.86, ey, -0.08, { ry: PI / 2, ol: 0 });
  // rivets on the lid corners
  for (const [x, z] of [[-0.72, 0.72], [0.72, 0.72], [0.72, -0.72]]) b.add(G.sphere(6, 4), dark, x, top + 0.13, z, { s: 0.045, ol: 0 });
  // milestone trims
  if (tier >= 1) b.add(G.box(1.66, 0.1, 1.66, 0.045), tier >= 3 ? GOLD : 0xffffff, 0, 0.22 + h * 0.12 + 0.12, 0, { ol: 0.7 });
  if (tier >= 2) b.add(G.box(1.66, 0.07, 1.66, 0.03), tier >= 3 ? GOLD : 0xffffff, 0, 0.22 + h * 0.93, 0, { ol: 0.7 });
  return { top: top + 0.12, screenY: sy, h };
}

/** small bracket post on the front corner of the top, returns its top y */
function post(b, top, height, color = STEEL, at = 0.56) {
  b.add(G.cyl(0.09, 0.11, height, 10), color, at, top + height / 2, at);
  b.add(G.cyl(0.18, 0.2, 0.09, 12), PLINTH, at, top + 0.045, at);
  return top + height;
}

/** horizontal boom from (at, y, at) to the turntable (T, y, T) */
function boom(b, y, color = STEEL, at = 0.56, end = OFF) {
  const len = (end - at) * Math.SQRT2;
  b.push(at, y, at, { ry: DIAG });
  b.add(G.box(0.16, 0.16, len + 0.14, 0.06), color, 0, 0, len / 2);
  b.add(G.sphere(8, 6), PLINTH, 0, 0, 0, { s: 0.12 });
  b.pop();
}

function roll(pb, colors, r, len, bands = 6) {
  // horizontal roll along local X made of coloured bands
  const w = len / bands;
  for (let i = 0; i < bands; i++) pb.add(G.cyl(r, r, w * 1.01, 14), colors[i % colors.length], -len / 2 + w * (i + 0.5), 0, 0, { rz: PI / 2, ol: 0 });
  pb.add(G.cyl(r, r, len, 14), colors[0], 0, 0, 0, { rz: PI / 2, fill: false }); // outline of the whole roll
  pb.add(G.cyl(r * 0.35, r * 0.35, len + 0.14, 8), PLINTH, 0, 0, 0, { rz: PI / 2 });
}

function bow(pb, color, x, y, z, s = 1) {
  pb.add(G.sphere(8, 6), color, x - 0.11 * s, y, z, { sx: 0.14 * s, sy: 0.1 * s, sz: 0.07 * s, rz: 0.4 });
  pb.add(G.sphere(8, 6), color, x + 0.11 * s, y, z, { sx: 0.14 * s, sy: 0.1 * s, sz: 0.07 * s, rz: -0.4 });
  pb.add(G.sphere(6, 5), shade(color, -0.15), x, y, z, { s: 0.065 * s });
}

function star5(pb, color, x, y, z, s = 1, o = {}) {
  pb.add(G.star(0.2 * s, 0.09 * s, 0.07 * s), color, x, y, z, o);
}

// ---------------------------------------------------------------- machines
// Each builder adds static parts to `b` and creates moving parts with P().
// P(parent, [x,y,z], build(pb), { ry }) -> Object3D (rotation order YXZ).
// It returns { top, screenY, anim(st) } where st has beat (cycles),
// spin (radians), work (0..1), t (s), boost (0/1), tier, progress.
const MACHINES = {
  saw(b, P, th, tier, root) {
    const c = th.machineColor[0];
    const cab = cabinet(b, c, 0.74, tier);
    const top = cab.top;
    b.add(G.box(1.5, 0.1, 1.5, 0.04), th.wood, 0, top, 0);
    // motor tower at the back with an exhaust pipe
    b.add(G.box(0.68, 0.64, 0.68, 0.18), PAL.cream, -0.36, top + 0.34, -0.36);
    b.add(G.box(0.74, 0.14, 0.74, 0.06), shade(c, -0.2), -0.36, top + 0.7, -0.36);
    b.add(G.cyl(0.08, 0.08, 0.3, 8), PLINTH, -0.5, top + 0.9, -0.5);
    b.add(G.cyl(0.11, 0.09, 0.08, 8), PAL.red, -0.5, top + 1.06, -0.5);
    // planks waiting on the table
    b.add(G.box(0.52, 0.11, 0.2, 0.04), th.woodDark, -0.45, top + 0.1, 0.32, { ry: 0.3 });
    b.add(G.box(0.52, 0.11, 0.2, 0.04), th.wood, -0.42, top + 0.21, 0.34, { ry: 0.2 });
    const py = post(b, top, 0.5, STEEL, 0.5);
    const s = 1 + tier * 0.06;
    const arm = P(root, [0.5, py, 0.5], (pb) => {
      pb.add(G.box(0.22, 0.2, 1.32, 0.08), STEEL, 0, 0, 0.6);
      pb.add(G.box(0.3, 0.32, 0.38, 0.12), c, 0, 0.06, 0.1);
      pb.add(G.box(0.14, 0.32, 0.14, 0.05), PLINTH, 0, 0.32, 0.12);
      pb.add(G.torus(0.56 * s, 0.1, 5, 12, PI), c, 0, -0.08, 1.2);
      pb.add(G.box(0.14, 0.14, 0.22, 0.05), c, 0, -0.08, 1.2);
    }, { ry: DIAG });
    const blade = P(arm, [0, -0.08, 1.2], (pb) => {
      pb.add(G.cyl(0.5 * s, 0.5 * s, 0.06, 18), 0xf4f3ff, 0, 0, 0, { rx: PI / 2 });
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU;
        pb.add(G.box(0.14, 0.14, 0.06, 0), 0xc4c0dc, Math.cos(a) * 0.5 * s, Math.sin(a) * 0.5 * s, 0, { rz: a + PI / 4, ol: 0 });
      }
      pb.add(G.cyl(0.16, 0.16, 0.1, 12), c, 0, 0, 0, { rx: PI / 2, ol: 0.7 });
      pb.add(G.box(0.36, 0.07, 0.07, 0.02), 0xffffff, 0, 0.24 * s, 0.035, { ol: 0 });
    });
    return {
      ...cab, top, peak: top + 1.0,
      emit: { kind: 'chip', y: 0.55, rate: 9 },
      anim(st) {
        const chop = Math.pow(Math.max(0, Math.sin(st.beat * TAU)), 2);
        arm.rotation.x = 0.1 + chop * 0.3 * st.work;
        blade.rotation.z = -st.spin * 3;
      },
    };
  },

  assembly(b, P, th, tier, root) {
    const c = th.machineColor[1];
    const cab = cabinet(b, c, 0.74, tier);
    const top = cab.top;
    // spinning gear and a parts bin at the back
    const gear = P(root, [-0.42, top + 0.06, -0.42], (pb) => {
      pb.add(G.cyl(0.32, 0.32, 0.12, 14), PAL.yellow, 0, 0, 0);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; pb.add(G.box(0.14, 0.12, 0.14, 0.02), PAL.yellow, Math.cos(a) * 0.34, 0, Math.sin(a) * 0.34, { ry: -a, ol: 0.8 }); }
      pb.add(G.cyl(0.11, 0.11, 0.16, 8), PLINTH, 0, 0.02, 0);
    });
    b.add(G.box(0.52, 0.28, 0.42, 0.07), PAL.cream, 0.2, top + 0.14, -0.5);
    for (let k = 0; k < 3; k++) b.add(G.box(0.13, 0.13, 0.13, 0.03), [PAL.red, PAL.yellow, PAL.green][k], 0.05 + k * 0.15, top + 0.32, -0.5, { ol: 0.6 });
    b.add(G.cyl(0.38, 0.44, 0.15, 14), PLINTH, 0.42, top + 0.075, 0.42);
    const s = 1 + tier * 0.06;
    const turret = P(root, [0.42, top + 0.15, 0.42], (pb) => {
      pb.add(G.cyl(0.32, 0.35, 0.22, 14), c, 0, 0.11, 0);
      pb.add(G.box(0.28, 0.66, 0.28, 0.12), PAL.yellow, 0, 0.52, 0);
      pb.add(G.sphere(9, 6), PLINTH, 0, 0.88, 0, { s: 0.19 });
    }, { ry: DIAG });
    const fore = P(turret, [0, 0.88, 0], (pb) => {
      pb.add(G.box(0.32, 0.32, 1.0, 0.13), PAL.yellow, 0, 0, 0.42);
      pb.add(G.box(0.26, 0.26, 0.9, 0.11), PAL.yellow, 0, 0, 1.15);
      pb.add(G.cyl(0.18, 0.18, 0.36, 12), PLINTH, 0, 0, 0.88, { rz: PI / 2 });
      pb.add(G.box(0.34, 0.07, 0.6, 0.03), 0xffffff, 0, 0.16, 0.42, { ol: 0 });
      pb.add(G.sphere(9, 6), PLINTH, 0, 0, 1.62, { s: 0.16 });
    });
    const head = P(fore, [0, 0, 1.62], (pb) => {
      pb.add(G.box(0.44 * s, 0.26 * s, 0.44 * s, 0.12), c, 0, -0.19, 0);
      pb.add(G.box(0.48 * s, 0.08, 0.48 * s, 0.03), 0xffffff, 0, -0.06, 0, { ol: 0.7 });
      // two gripper fingers
      pb.add(G.box(0.08, 0.26, 0.17, 0.03), STEEL, -0.14 * s, -0.42, 0);
      pb.add(G.box(0.08, 0.26, 0.17, 0.03), STEEL, 0.14 * s, -0.42, 0);
    });
    const base = 0.55;
    return {
      ...cab, top, peak: top + 1.2,
      emit: { kind: 'spark', y: 0.6, rate: 0, onBeat: 2 },
      anim(st) {
        const tap = Math.pow(Math.abs(Math.sin(st.beat * PI * 2)), 6);
        turret.rotation.y = DIAG + Math.sin(st.t * 1.4) * 0.12 * st.work;
        fore.rotation.x = base - 0.16 + (0.16 + tap * 0.12) * (0.4 + 0.6 * st.work);
        head.rotation.x = -fore.rotation.x;
        gear.rotation.y = st.spin * 0.8;
      },
    };
  },

  paint(b, P, th, tier, root) {
    const c = th.machineColor[2];
    const cab = cabinet(b, c, 0.74, tier);
    const top = cab.top;
    const cans = [PAL.red, PAL.yellow, PAL.blue];
    const spots = [[-0.46, -0.08], [-0.08, -0.48], [-0.5, -0.5]];
    const canParts = [];
    spots.forEach(([x, z], i) => {
      canParts.push(P(root, [x, top, z], (pb) => {
        pb.add(G.cyl(0.22, 0.22, 0.4, 14), 0xffffff, 0, 0.2, 0);
        pb.add(G.cyl(0.225, 0.225, 0.15, 14), cans[i], 0, 0.2, 0, { ol: 0 });
        pb.add(G.cyl(0.235, 0.235, 0.06, 14), cans[i], 0, 0.42, 0);
        pb.add(G.box(0.06, 0.14, 0.03, 0.01), cans[i], 0.1, 0.33, 0.21, { ol: 0 });
      }));
    });
    // paint drips down the cabinet
    const drips = [[0.81, 0.5, -0.5, 0], [0.81, 0.3, -0.15, 1], [0.81, 0.4, 0.3, 2], [0.4, 0.45, 0.81, 0], [-0.62, 0.35, 0.81, 2]];
    for (const [x, len, z, ci] of drips) {
      const onX = x > 0.8;
      b.add(G.box(onX ? 0.04 : 0.13, len, onX ? 0.13 : 0.04, 0.02), cans[ci], onX ? x : z, cab.top - 0.14 - len / 2, onX ? z : x, { ol: 0 });
      b.add(G.sphere(6, 5), cans[ci], onX ? x : z, cab.top - 0.14 - len, onX ? z : x, { s: 0.08, ol: 0 });
    }
    const py = post(b, top, 0.58);
    boom(b, py, STEEL, 0.56, OFF - 0.02);
    const s = 1 + tier * 0.07;
    const nozzle = P(root, [OFF - 0.02, py, OFF - 0.02], (pb) => {
      pb.add(G.box(0.34 * s, 0.28 * s, 0.34 * s, 0.11), PAL.pink, 0, -0.19, 0);
      pb.add(G.cyl(0.19 * s, 0.19 * s, 0.08, 12), 0xffffff, 0, -0.04, 0, { ol: 0.7 });
      pb.add(G.cyl(0.11 * s, 0.14 * s, 0.15, 10), PAL.yellow, 0, -0.39, 0);
      pb.add(G.cone(0.11 * s, 0.17, 10), STEEL, 0, -0.55, 0, { rx: PI });
      pb.add(G.sphere(6, 5), PAL.blue, 0.18 * s, -0.19, 0.0, { s: 0.07, ol: 0.6 });
    });
    return {
      ...cab, top, peak: py + 0.14,
      emit: { kind: 'paint', y: 0.75, rate: 11 },
      anim(st) {
        nozzle.rotation.z = Math.sin(st.beat * TAU * 2) * 0.34 * st.work;
        nozzle.rotation.x = Math.cos(st.beat * TAU * 2) * 0.22 * st.work;
        for (let i = 0; i < 3; i++) {
          const k = Math.max(0, Math.sin(st.beat * TAU + i * 2.1)) * st.work;
          canParts[i].scale.set(1 - k * 0.06, 1 + k * 0.1, 1 - k * 0.06);
        }
      },
    };
  },

  wrap(b, P, th, tier, root) {
    const c = th.machineColor[3];
    const cab = cabinet(b, c, 0.74, tier);
    const top = cab.top;
    // brackets for the paper roll
    const ax = Math.SQRT1_2;
    for (const k of [-1, 1]) b.add(G.box(0.12, 0.46, 0.12, 0.04), STEEL, -0.32 + k * 0.64 * ax, top + 0.23, -0.32 - k * 0.64 * ax);
    const paper = P(root, [-0.32, top + 0.44, -0.32], (pb) => roll(pb, [0xffffff, th.box[0], 0xffffff, PAL.yellow], 0.3 + tier * 0.02, 1.2, 8), { ry: DIAG });
    // ribbon spool on the side
    b.add(G.cyl(0.22, 0.22, 0.15, 14), th.ribbon, 0.45, top + 0.075, -0.42);
    b.add(G.cyl(0.08, 0.08, 0.2, 8), 0xffffff, 0.45, top + 0.1, -0.42, { ol: 0 });
    const py = post(b, top, 0.78);
    boom(b, py, STEEL);
    b.add(G.cyl(0.06, 0.06, 0.32, 8), STEEL, OFF, py - 0.13, OFF);
    const s = 1 + tier * 0.06;
    const hood = P(root, [OFF, py - 0.32, OFF], (pb) => {
      pb.add(G.box(0.7 * s, 0.42 * s, 0.7 * s, 0.11), th.box[1], 0, 0, 0);
      pb.add(G.box(0.72 * s, 0.43 * s, 0.15, 0.04), PAL.yellow, 0, 0, 0, { ol: 0 });
      pb.add(G.box(0.15, 0.43 * s, 0.72 * s, 0.04), PAL.yellow, 0, 0, 0, { ol: 0 });
      bow(pb, PAL.yellow, 0, 0.26 * s, 0, 1.4);
    });
    const hy = py - 0.32;
    return {
      ...cab, top, peak: py + 0.14,
      emit: null,
      anim(st) {
        const x = (st.beat % 1);
        const press = x > 0.55 && x < 0.95 ? Math.sin(((x - 0.55) / 0.4) * PI) : 0;
        hood.position.y = hy - press * 0.64 * st.work;
        hood.scale.set(1 + press * 0.08 * st.work, 1 - press * 0.1 * st.work, 1 + press * 0.08 * st.work);
        paper.rotation.x = st.spin * 1.5;
      },
    };
  },

  cutter(b, P, th, tier, root) {
    const c = th.machineColor[0];
    const cab = cabinet(b, c, 0.76, tier, 'heart');
    const top = cab.top;
    b.add(G.box(1.5, 0.08, 1.5, 0.03), 0xffffff, 0, top, 0, { ol: 0.7 });
    const ax = Math.SQRT1_2;
    for (const k of [-1, 1]) b.add(G.box(0.12, 0.46, 0.12, 0.04), STEEL, -0.32 + k * 0.64 * ax, top + 0.23, -0.32 - k * 0.64 * ax);
    const fab = P(root, [-0.32, top + 0.46, -0.32], (pb) => roll(pb, [th.fabric, th.fabricPink], 0.3 + tier * 0.02, 1.15, 6), { ry: DIAG });
    // fabric sheet from the roll onto the table
    b.add(G.box(0.95, 0.03, 0.62, 0), th.fabric, -0.02, top + 0.06, -0.02, { ry: DIAG, ol: 0.6 });
    const py = post(b, top, 0.66, STEEL, 0.52);
    boom(b, py, STEEL, 0.52, OFF);
    b.add(G.cyl(0.06, 0.06, 0.26, 8), STEEL, OFF, py - 0.13, OFF);
    const s = 1 + tier * 0.07;
    // giant scissors facing the camera: two blades on one pivot
    const piv = P(root, [OFF, py - 0.36, OFF], (pb) => {
      pb.add(G.cyl(0.07, 0.07, 0.09, 10), PLINTH, 0, 0, 0.04, { rx: PI / 2 });
    }, { ry: DIAG });
    const blade = (handle) => (pb) => {
      pb.add(G.box(0.12 * s, 0.5 * s, 0.04, 0), 0xf4f3ff, 0.02, -0.27 * s, 0);
      pb.add(G.box(0.05 * s, 0.46 * s, 0.045, 0), 0xc8c4e0, 0.05, -0.26 * s, 0.004, { ol: 0 });
      pb.add(G.torus(0.12 * s, 0.045, 5, 12), handle, 0.06, 0.19 * s, 0);
      pb.add(G.box(0.07, 0.13, 0.045, 0), handle, 0.03, 0.06, 0);
    };
    const bladeA = P(piv, [0, 0, 0.02], blade(th.fabricPink));
    const bladeB = P(piv, [0, 0, -0.02], blade(PAL.yellow));
    bladeB.scale.x = -1;
    return {
      ...cab, top, peak: py + 0.16,
      emit: { kind: 'scrap', y: 0.6, rate: 6 },
      anim(st) {
        const snip = 0.12 + Math.abs(Math.sin(st.beat * PI * 3)) * 0.36 * st.work;
        bladeA.rotation.z = snip;
        bladeB.rotation.z = -snip;
        fab.rotation.x = st.spin * 1.2;
      },
    };
  },

  stuffing(b, P, th, tier, root) {
    const c = th.machineColor[1];
    const cab = cabinet(b, c, 0.68, tier, 'heart');
    const top = cab.top;
    const s = 1 + tier * 0.06;
    const tank = P(root, [-0.25, top, -0.25], (pb) => {
      pb.add(G.cyl(0.58 * s, 0.62 * s, 0.72, 16), 0xe9fbff, 0, 0.36, 0);
      pb.add(G.cyl(0.64 * s, 0.64 * s, 0.13, 16), shade(c, -0.15), 0, 0.12, 0);
      pb.add(G.cyl(0.62 * s, 0.62 * s, 0.09, 16), shade(c, 0.2), 0, 0.72, 0);
      // cotton cloud on top
      const puffs = [[0, 0.88, 0, 0.38], [0.27, 0.82, 0.1, 0.27], [-0.25, 0.82, 0.16, 0.26], [0.06, 0.84, -0.27, 0.28], [0.1, 1.1, 0.05, 0.23]];
      for (const [x, y, z, r] of puffs) pb.add(G.sphere(10, 7), 0xffffff, x * s, y, z * s, { s: r * s });
      // window with cotton inside
      pb.push(0, 0.38, 0, { ry: DIAG });
      pb.add(G.box(0.48, 0.34, 0.08, 0.07), 0xffffff, 0, 0, 0.57 * s, { ol: 0.7 });
      pb.pop();
    });
    const py = post(b, top, 0.88, shade(c, 0.1), 0.58);
    boom(b, py, shade(c, 0.1), 0.58, OFF);
    b.add(G.cyl(0.08, 0.08, 0.22, 10), shade(c, 0.1), OFF, py - 0.11, OFF);
    b.add(G.cone(0.22, 0.32, 12), 0xffffff, OFF, py - 0.34, OFF, { rx: PI });
    b.add(G.torus(0.13, 0.045, 5, 12), PAL.pink, OFF, py - 0.21, OFF, { rx: PI / 2, ol: 0 });
    return {
      ...cab, top, peak: top + 1.3,
      emit: { kind: 'cotton', y: 0.9, rate: 7 },
      anim(st) {
        const w = Math.sin(st.beat * TAU * 2) * 0.06 * st.work;
        tank.scale.set(1 + w, 1 - w * 1.3, 1 + w);
      },
    };
  },

  stitching(b, P, th, tier, root) {
    const c = th.machineColor[2];
    const cab = cabinet(b, c, 0.72, tier, 'heart');
    const top = cab.top;
    const pink = PAL.pink;
    // pincushion (a red tomato with pins) at the back
    b.add(G.sphere(10, 7), PAL.red, -0.52, top + 0.17, -0.52, { sx: 0.27, sy: 0.2, sz: 0.27 });
    b.add(G.cone(0.09, 0.11, 5), PAL.green, -0.52, top + 0.39, -0.52);
    for (let k = 0; k < 5; k++) {
      const a = k * 1.3;
      b.add(G.sphere(6, 4), [PAL.yellow, PAL.blue, 0xffffff][k % 3], -0.52 + Math.cos(a) * 0.17, top + 0.37, -0.52 + Math.sin(a) * 0.17, { s: 0.045, ol: 0 });
    }
    const s = 1 + tier * 0.06;
    // big thread spool
    const spool = P(root, [-0.2, top, -0.05], (pb) => {
      pb.add(G.cyl(0.26 * s, 0.26 * s, 0.42, 14), pink, 0, 0.27, 0);
      pb.add(G.cyl(0.35 * s, 0.35 * s, 0.08, 14), PAL.cream, 0, 0.04, 0);
      pb.add(G.cyl(0.35 * s, 0.35 * s, 0.08, 14), PAL.cream, 0, 0.5, 0);
      pb.add(G.cyl(0.27 * s, 0.27 * s, 0.03, 14), shade(pink, 0.3), 0, 0.2, 0, { ol: 0 });
      pb.add(G.cyl(0.27 * s, 0.27 * s, 0.03, 14), shade(pink, 0.3), 0, 0.34, 0, { ol: 0 });
    });
    const py = post(b, top, 0.74, PAL.cream, 0.56);
    // thick sewing-machine arm
    const len = (OFF - 0.56) * Math.SQRT2;
    b.push(0.56, py, 0.56, { ry: DIAG });
    b.add(G.box(0.26, 0.26, len + 0.26, 0.11), PAL.cream, 0, 0, len / 2);
    b.add(G.box(0.27, 0.07, len + 0.1, 0.02), c, 0, 0.06, len / 2, { ol: 0 });
    b.pop();
    // thread from the spool to the needle holder
    b.rod([-0.2, top + 0.47, -0.05], [0.56, py + 0.13, 0.56], 0.02, pink, 5, { ol: 0 });
    b.add(G.box(0.3, 0.26, 0.3, 0.1), PAL.cream, OFF, py - 0.12, OFF);
    const needle = P(root, [OFF, py - 0.24, OFF], (pb) => {
      pb.add(G.cyl(0.04 * s, 0.04 * s, 0.48, 6), 0xf4f3ff, 0, -0.21, 0);
      pb.add(G.cone(0.04 * s, 0.12, 6), 0xf4f3ff, 0, -0.51, 0, { rx: PI });
      pb.add(G.box(0.16, 0.1, 0.16, 0.04), pink, 0, -0.03, 0);
    });
    const ny = py - 0.24;
    return {
      ...cab, top, peak: py + 0.18,
      emit: { kind: 'thread', y: 0.6, rate: 5 },
      anim(st) {
        needle.position.y = ny - Math.abs(Math.sin(st.beat * PI * 4)) * 0.17 * st.work;
        spool.rotation.y = st.spin * 2;
      },
    };
  },

  ribbon(b, P, th, tier, root) {
    const c = th.machineColor[3];
    const cab = cabinet(b, c, 0.74, tier, 'heart');
    const top = cab.top;
    const ax = Math.SQRT1_2;
    for (const k of [-1, 1]) b.add(G.box(0.12, 0.44, 0.12, 0.04), STEEL, -0.32 + k * 0.68 * ax, top + 0.22, -0.32 - k * 0.68 * ax);
    const cols = [th.ribbon, th.box[2], th.box[0]];
    const spools = P(root, [-0.32, top + 0.4, -0.32], (pb) => {
      pb.add(G.cyl(0.06, 0.06, 1.4, 8), PLINTH, 0, 0, 0, { rz: PI / 2 });
      for (let i = 0; i < 3; i++) {
        const x = -0.42 + i * 0.42;
        pb.add(G.cyl(0.24 + tier * 0.015, 0.24 + tier * 0.015, 0.22, 14), cols[i], x, 0, 0, { rz: PI / 2 });
        pb.add(G.cyl(0.28, 0.28, 0.04, 14), 0xffffff, x - 0.12, 0, 0, { rz: PI / 2, ol: 0.6 });
        pb.add(G.cyl(0.28, 0.28, 0.04, 14), 0xffffff, x + 0.12, 0, 0, { rz: PI / 2, ol: 0.6 });
      }
    }, { ry: DIAG });
    const py = post(b, top, 0.78);
    boom(b, py, STEEL);
    b.add(G.cyl(0.06, 0.06, 0.32, 8), STEEL, OFF, py - 0.13, OFF);
    const s = 1 + tier * 0.06;
    const hood = P(root, [OFF, py - 0.32, OFF], (pb) => {
      pb.add(G.box(0.68 * s, 0.44 * s, 0.68 * s, 0.13), 0xffffff, 0, 0, 0);
      pb.add(G.box(0.7 * s, 0.45 * s, 0.15, 0.04), th.ribbon, 0, 0, 0, { ol: 0 });
      pb.add(G.box(0.15, 0.45 * s, 0.7 * s, 0.04), th.ribbon, 0, 0, 0, { ol: 0 });
      bow(pb, th.ribbon, 0, 0.28 * s, 0, 1.7);
    });
    const hy = py - 0.32;
    return {
      ...cab, top, peak: py + 0.14,
      emit: null,
      anim(st) {
        const x = (st.beat % 1);
        const press = x > 0.55 && x < 0.95 ? Math.sin(((x - 0.55) / 0.4) * PI) : 0;
        hood.position.y = hy - press * 0.64 * st.work;
        hood.scale.set(1 + press * 0.08 * st.work, 1 - press * 0.1 * st.work, 1 + press * 0.08 * st.work);
        spools.rotation.x = st.spin * 1.4;
      },
    };
  },
};

// ------------------------------------------------------------ locked plot
function buildPlot() {
  const b = new Builder();
  b.add(G.box(1.86, 0.1, 1.86, 0.05), PAL.cream, 0, 0.05, 0);
  // dashed hazard border
  const n = 6, L = 1.7;
  for (let i = 0; i < n; i++) {
    const t = -L / 2 + (i + 0.5) * (L / n);
    const col = i % 2 ? INK : PAL.yellow;
    b.add(G.box(L / n * 0.98, 0.04, 0.13, 0), col, t, 0.11, -L / 2, { ol: 0 });
    b.add(G.box(L / n * 0.98, 0.04, 0.13, 0), col, t, 0.11, L / 2, { ol: 0 });
    b.add(G.box(0.13, 0.04, L / n * 0.98, 0), col, -L / 2, 0.11, t, { ol: 0 });
    b.add(G.box(0.13, 0.04, L / n * 0.98, 0), col, L / 2, 0.11, t, { ol: 0 });
  }
  // cones at the corners
  for (const [x, z] of [[-0.72, -0.72], [0.72, -0.72], [-0.72, 0.72], [0.72, 0.72]]) {
    b.add(G.box(0.32, 0.05, 0.32, 0.02), PAL.orange, x, 0.12, z, { ol: 0.6 });
    b.add(G.cone(0.14, 0.42, 10), PAL.orange, x, 0.35, z);
    b.add(G.cyl(0.09, 0.105, 0.08, 10), 0xffffff, x, 0.32, z, { ol: 0 });
  }
  // little sawhorse barrier in front (toward the camera)
  b.push(0.38, 0, 0.38, { ry: DIAG });
  b.add(G.box(0.94, 0.16, 0.07, 0.03), 0xffffff, 0, 0.44, 0);
  for (let i = 0; i < 3; i++) b.add(G.box(0.15, 0.165, 0.075, 0), PAL.red, -0.3 + i * 0.3, 0.44, 0, { rz: 0.5, ol: 0 });
  b.add(G.box(0.07, 0.44, 0.07, 0.02), INK, -0.4, 0.22, 0, { ol: 0 });
  b.add(G.box(0.07, 0.44, 0.07, 0.02), INK, 0.4, 0.22, 0, { ol: 0 });
  b.pop();
  // toolbox, a stack of bricks and a shovel
  b.add(G.box(0.42, 0.22, 0.26, 0.06), PAL.red, -0.35, 0.21, -0.25, { ry: 0.4 });
  b.add(G.box(0.24, 0.06, 0.06, 0.02), INK, -0.35, 0.35, -0.25, { ry: 0.4, ol: 0 });
  b.add(G.box(0.32, 0.15, 0.19, 0.03), 0xffa25a, 0.2, 0.18, -0.45);
  b.add(G.box(0.32, 0.15, 0.19, 0.03), 0xff8a45, 0.25, 0.33, -0.42, { ry: 0.25 });
  return b.build();
}

// ------------------------------------------------------------------ module
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const DEFAULT_OPEN = Object.freeze({ open: true, level: 1, progress: 0, tray: 0, boostT: 0 });
const DEFAULT_LOCKED = Object.freeze({ open: false, level: 1, progress: 0, tray: 0, boostT: 0 });

export function createStations(theme, preset) {
  const group = new THREE.Group();
  group.name = 'stations';
  const mat = toyMaterial();
  const plotGeo = buildPlot();

  // turntables (instanced, one draw call)
  const ttb = new Builder();
  ttb.add(G.cyl(0.58, 0.6, 0.09, 18), shade(theme.rail, 0.3), 0, 0, 0, { ol: 0.8 });
  for (let k = 0; k < 4; k++) ttb.add(G.box(0.5, 0.02, 0.09, 0), shade(theme.rail, -0.1), Math.cos(k * PI / 2) * 0.25, 0.05, Math.sin(k * PI / 2) * 0.25, { ry: -k * PI / 2, ol: 0 });
  ttb.add(G.cyl(0.11, 0.11, 0.03, 10), 0xffffff, 0, 0.05, 0, { ol: 0 });
  const turntables = new THREE.InstancedMesh(ttb.build(), mat, 4);
  turntables.name = 'turntables';
  turntables.frustumCulled = false;
  group.add(turntables);

  // progress fills on the machine screens (unlit, no outline)
  const fb = new Builder({ ol: 0 });
  fb.add(G.box(1, 1, 1, 0.3), 0xffffff, 0.5, 0, 0, { tint: 1 });
  const fills = new THREE.InstancedMesh(fb.build(), toyMaterial({ unlit: true }), 4);
  fills.name = 'progress-fills';
  fills.frustumCulled = false;
  fills.setColorAt(0, _c.set(0xffffff));
  fills.count = 0;
  group.add(fills);

  // floor glows (milestone gold, boost cyan)
  const glowMat = new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, opacity: 0.85, depthWrite: false });
  const glows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2), glowMat, 8);
  glows.name = 'glows';
  glows.frustumCulled = false;
  glows.setColorAt(0, _c.set(0xffffff));
  glows.count = 0;
  glows.renderOrder = 2;
  group.add(glows);

  const stations = [];
  for (let i = 0; i < 4; i++) stations.push(makeStation(i));

  function makeStation(i) {
    const [cx, cz] = CORNERS[i];
    const mirrored = i % 2 === 1;
    const root = new THREE.Group();
    root.position.set(cx, 0, cz);
    group.add(root);
    const frame = new THREE.Group();
    frame.matrixAutoUpdate = false;
    if (mirrored) frame.matrix.copy(MIRROR);
    root.add(frame);
    const spot = new THREE.Group(); // machine spot (scaled for pops)
    spot.position.set(-OFF, 0, -OFF);
    frame.add(spot);
    const plot = new THREE.Mesh(plotGeo, mat);
    plot.userData.sharedGeometry = true;
    spot.add(plot);
    const machine = new THREE.Group();
    spot.add(machine);
    root.updateMatrixWorld(true);

    const st = {
      i, root, frame, spot, plot, machine, mirrored,
      kind: theme.machines[i],
      open: false, level: 1, tier: -1, built: null,
      beat: 0, spin: 0, work: 0, rate: 0, t: 0, boost: 0, boostAmt: 0, progress: 0, lastP: 0,
      pop: 0, popKind: 0, openT: -1, cyclePop: 0, init: false, blocked: false, idle: true,
      emitAcc: 0, lastBeat: 0, cheer: 0, hop: 0,
      box: new THREE.Box3(),
    };
    computePickBox(st);
    return st;
  }

  function computePickBox(st) {
    const pts = [];
    const add = (x, y, z) => pts.push(new THREE.Vector3(x, y, z));
    // canonical: machine footprint, turntable, worker
    for (const x of [-OFF - 0.95, -OFF + 0.95]) for (const z of [-OFF - 0.95, -OFF + 0.95]) { add(x, 0, z); add(x, 2.3, z); }
    add(0.65, 0, 0.65); add(0.65, 0.8, -0.3); add(-0.3, 0.8, 0.65);
    add(WORKER_SPOT.x - 0.45, 1.3, WORKER_SPOT.z + 0.45); add(WORKER_SPOT.x - 0.45, 0, WORKER_SPOT.z + 0.45);
    st.box.makeEmpty();
    st.frame.updateMatrixWorld(true);
    for (const p of pts) st.box.expandByPoint(p.applyMatrix4(st.frame.matrixWorld));
  }

  function build(st, tier) {
    if (st.built) {
      st.machine.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      st.machine.clear();
    }
    const b = new Builder();
    const parts = [];
    const P = (parent, pos, fn, o = {}) => {
      const pb = new Builder();
      fn(pb);
      const obj = new THREE.Group();
      obj.rotation.order = 'YXZ';
      obj.position.set(pos[0], pos[1], pos[2]);
      if (o.ry) obj.rotation.y = o.ry;
      const mesh = new THREE.Mesh(pb.build(), mat);
      obj.add(mesh);
      parent.add(obj);
      parts.push(obj);
      return obj;
    };
    const fn = MACHINES[st.kind] || MACHINES.saw;
    const info = fn(b, P, theme, tier, st.machine);
    // milestone beacon and star
    let beacon = null, star = null;
    if (tier >= 2) {
      // warning beacon on the front-left corner of the roof (visible from the camera)
      b.add(G.cyl(0.07, 0.08, 0.24, 8), STEEL, -0.62, info.top + 0.12, 0.62);
      beacon = P(st.machine, [-0.62, info.top + 0.28, 0.62], (pb) => {
        pb.add(G.cyl(0.19, 0.21, 0.09, 12), PLINTH, 0, -0.03, 0);
        pb.add(G.hemi(10, 5), tier >= 3 ? GOLD : PAL.red, 0, 0, 0, { sx: 0.21, sy: 0.27, sz: 0.21 });
        pb.add(G.box(0.3, 0.07, 0.07, 0), 0xffffff, 0, 0.11, 0, { ol: 0 });
      });
    }
    if (tier >= 4) {
      b.add(G.cyl(0.05, 0.06, 0.32, 8), GOLD, 0.62, info.top + 0.16, -0.62);
      star = P(st.machine, [0.62, info.top + 0.52, -0.62], (pb) => star5(pb, GOLD, 0, 0, 0, 1.6), { ry: DIAG });
    }
    const body = new THREE.Mesh(b.build(), mat);
    st.machine.add(body);
    st.built = { ...info, beacon, star, parts };
    st.tier = tier;
  }

  function setOpen(st, open, animate) {
    st.open = open;
    st.plot.visible = !open;
    st.machine.visible = open;
    if (open && st.tier < 0) build(st, tierOf(st.level));
    if (open && animate) { st.openT = 0; }
  }

  const api = {
    group,
    stations,
    /** world position of the item spot (turntable) */
    corner(i, out) { return out.set(CORNERS[i][0], BELT_Y, CORNERS[i][1]); },
    /** UI anchor point (a little above the machine / plot) */
    anchorPoint(i, out) {
      const st = stations[i];
      out.set(0, 0, 0).applyMatrix4(st.spot.matrixWorld);
      // locked plot: low over the plot, so the UI's sign stands on its own plot
      out.y = st.open && st.built ? Math.max(st.built.peak || 0, st.built.top + 0.5) + 0.25 : 0.3;
      return out;
    },
    /** centre of the machine (for bursts) */
    center(i, out, y = 1.0) {
      out.set(0, 0, 0).applyMatrix4(stations[i].spot.matrixWorld);
      out.y = y;
      return out;
    },
    turntableAngle(i) { return stations[i].spin * 0.55; },
    /** worker stand spot -> out; returns the facing (radians) for a work amount 0..1 */
    workerSpot(i, out, work = 1) {
      const st = stations[i];
      out.set(WORKER_SPOT.x, 0, WORKER_SPOT.z).applyMatrix4(st.frame.matrixWorld);
      let ry = WORKER_SPOT.idleRy + (WORKER_SPOT.ry - WORKER_SPOT.idleRy) * work;
      if (st.mirrored) ry = PI / 2 - ry;
      return ry;
    },
    pickBox(i) { return stations[i].box; },
    pop(i, kind = 1) { const st = stations[i]; st.pop = 1; st.popKind = kind; st.cheer = 1; },
    cyclePop(i) { stations[i].cyclePop = 1; },
    setPreset() {},

    update(state, dt) {
      const ss = (state && state.factory && state.factory.stations) || [];
      let nFill = 0, nGlow = 0;
      for (let i = 0; i < 4; i++) {
        const st = stations[i];
        const s = ss[i] || (i < 2 ? DEFAULT_OPEN : DEFAULT_LOCKED);
        // open / level changes
        const open = !!s.open;
        if (!st.init) { st.level = s.level || 1; setOpen(st, open, false); st.init = true; st.lastP = s.progress || 0; }
        else if (open !== st.open) setOpen(st, open, open);
        st.level = s.level || 1;
        if (st.open) {
          const tier = tierOf(st.level);
          if (tier !== st.tier) build(st, tier);
        }
        // work rate from progress
        const p = s.progress || 0;
        let dp = p - st.lastP;
        if (dp < -0.001) dp += 1; // a cycle ended and a new one started
        if (p === 0 && st.lastP === 0) dp = 0;
        st.lastP = p;
        st.progress = p;
        st.blocked = p >= 1;
        st.idle = p <= 0;
        const inst = dt > 0 ? dp / dt : 0;
        st.rate += (clamp(inst, 0, 30) - st.rate) * (1 - Math.exp(-dt * 6));
        const working = st.open && !st.blocked && !st.idle;
        st.work += ((working ? 1 : 0) - st.work) * (1 - Math.exp(-dt * 7));
        st.boost = s.boostT > 0 ? 1 : 0;
        st.boostAmt += (st.boost - st.boostAmt) * (1 - Math.exp(-dt * 6));
        // visual beat: follows the real cycle rate, capped so it never strobes
        const beatRate = working ? clamp(st.rate, 0.45, 2.4) : 0;
        st.beat += dt * beatRate;
        st.spin += dt * st.work * (5 + st.boostAmt * 6);
        st.t += dt;

        // animation: open bounce, upgrade jump + squash and stretch, cycle squash
        st.pop = Math.max(0, st.pop - dt * 1.9);
        st.cyclePop = Math.max(0, st.cyclePop - dt * 5);
        st.cheer = Math.max(0, st.cheer - dt * 1.1);
        let sx = 1, sy = 1, hop = 0;
        if (st.openT >= 0) {
          st.openT += dt;
          const k = clamp(st.openT / 0.8, 0, 1);
          const e = ease.outElastic(k);
          sx = sy = 0.05 + 0.95 * e;
          if (k >= 1) st.openT = -1;
        }
        if (st.pop > 0) {
          const k = 1 - st.pop;
          const big = st.popKind === 2;
          // anticipation squash, jump with stretch, landing squash, wobble
          if (k < 0.08) { const a = Math.sin((k / 0.08) * PI * 0.5) * 0.14; sy *= 1 - a; sx *= 1 + a * 0.7; }
          else {
            const j = (k - 0.08) / 0.92;
            hop = Math.max(0, Math.sin(Math.min(1, j / 0.3) * PI)) * (big ? 0.55 : 0.32);
            const a = Math.sin(j * PI * 3.2) * Math.exp(-j * 3.4) * (big ? 0.26 : 0.18);
            sy *= 1 + a; sx *= 1 - a * 0.65;
          }
        }
        if (st.cyclePop > 0) { const a = Math.sin(st.cyclePop * PI) * 0.03; sy *= 1 - a; sx *= 1 + a * 0.5; }
        if (st.boostAmt > 0.01) { const w = Math.sin(st.t * 40) * 0.01 * st.boostAmt; sx *= 1 + w; }
        st.machine.scale.set(sx, sy, sx);
        st.machine.position.y = hop;
        st.hop = hop;
        if (st.open && st.built) {
          st.built.anim(st);
          if (st.built.beacon) {
            st.built.beacon.rotation.y = st.t * 3;
            const bl = 1 + 0.14 * Math.sin(st.t * 6) * st.work;
            st.built.beacon.scale.setScalar(bl);
          }
          if (st.built.star) { st.built.star.rotation.y = DIAG + st.t * 1.6; st.built.star.position.y = st.built.top + 0.52 + Math.sin(st.t * 2.5) * 0.06; }
        }
        // turntable
        _p.set(CORNERS[i][0], BELT_Y - 0.035, CORNERS[i][1]);
        _q.setFromAxisAngle(_up, st.spin * 0.55);
        _s.set(1, 1, 1);
        turntables.setMatrixAt(i, _m4.compose(_p, _q, _s));

        // progress screen fill
        if (st.open && st.built && st.openT < 0) {
          const w = 0.8 * clamp(p, 0, 1);
          if (w > 0.01) {
            const mirrored = st.mirrored;
            // canonical screen spans x in [-0.46, 0.34] on the +Z face
            const x0 = mirrored ? 0.34 - w : -0.46;
            _p.set(-OFF + x0 * sx, st.built.screenY * sy + hop, -OFF + 0.86 * sx);
            _q.identity();
            _s.set(w * sx, 0.17 * sy, 0.03);
            _m4.compose(_p, _q, _s).premultiply(st.frame.matrixWorld);
            fills.setMatrixAt(nFill, _m4);
            if (st.blocked) _c.set(0xffa21f).multiplyScalar(0.85 + 0.15 * Math.sin(st.t * 8));
            else if (st.boost) _c.set(0x4ff0ff);
            else _c.set(0x52ff6e);
            fills.setColorAt(nFill, _c);
            nFill++;
          }
        }
        // glows
        if (st.open && st.boostAmt > 0.02) {
          api.center(i, _v, 0.02);
          const sc = (4.2 + Math.sin(st.t * 10) * 0.2) * (0.6 + 0.4 * st.boostAmt);
          _m4.compose(_v.set(_v.x * 0.45 + CORNERS[i][0] * 0.55, 0.03, _v.z * 0.45 + CORNERS[i][1] * 0.55), _q.identity(), _s.set(sc, 1, sc));
          glows.setMatrixAt(nGlow, _m4);
          glows.setColorAt(nGlow, _c.set(0x1fcfff));
          nGlow++;
        }
        if (st.open && st.tier >= 3) {
          api.center(i, _v, 0.025);
          const sc = 3.4 + Math.sin(st.t * 2) * 0.12;
          _m4.compose(_v.set(_v.x * 0.6 + CORNERS[i][0] * 0.4, 0.025, _v.z * 0.6 + CORNERS[i][1] * 0.4), _q.identity(), _s.set(sc, 1, sc));
          glows.setMatrixAt(nGlow, _m4);
          glows.setColorAt(nGlow, _c.set(st.tier >= 4 ? 0xff8ae6 : 0xffc21a));
          nGlow++;
        }
      }
      turntables.instanceMatrix.needsUpdate = true;
      fills.count = nFill;
      if (nFill) { fills.instanceMatrix.needsUpdate = true; fills.instanceColor.needsUpdate = true; }
      glows.count = nGlow;
      if (nGlow) { glows.instanceMatrix.needsUpdate = true; glows.instanceColor.needsUpdate = true; }
    },

    dispose() {
      for (const st of stations) st.machine.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      plotGeo.dispose();
      turntables.geometry.dispose(); fills.geometry.dispose(); glows.geometry.dispose(); glowMat.dispose();
    },
  };
  return api;
}
