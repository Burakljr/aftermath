// The four stations of a factory: toy-like machines built from rounded
// primitives, locked plots, belt turntables, progress screens and glows.
//
// Every station is built in a canonical frame (left-column station): the belt
// comes in along -Z, leaves along +X, the corner (turntable / work spot) is
// the origin, the machine stands behind it at (-OFF, -OFF) and the worker at
// the front-left. Right-column stations use the same build mirrored across
// the x = z plane.
import * as THREE from 'three';
import { CORNERS, MACHINE_OFFSET as OFF } from './layout.js';
import { G, Builder, toyMaterial, shade, ease, clamp, TAU, radialTexture } from './kit.js';
import { BELT_Y } from './factory.js';

const PI = Math.PI;
const DIAG = PI / 4; // ry so that local +Z points from the machine to its turntable
const GOLD = 0xffd23c;
const STEEL = 0xe3e8f5;
const INK = 0x343852;
const MILESTONES = [10, 25, 50, 100];

export function tierOf(level) {
  let t = 0;
  for (const m of MILESTONES) if (level >= m) t++;
  return t;
}

const MIRROR = new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
/** worker stand spot relative to the corner (canonical) and facing */
export const WORKER_SPOT = { x: -1.0, z: 0.82, ry: 1.75 };

// -------------------------------------------------------------- machine kit
function cabinet(b, color, h, tier) {
  const dark = shade(color, -0.38), light = shade(color, 0.32);
  b.add(G.box(1.76, 0.18, 1.76, 0.08), dark, 0, 0.09, 0);
  b.add(G.box(1.6, h, 1.6, 0.2), color, 0, 0.18 + h / 2, 0);
  const top = 0.18 + h;
  b.add(G.box(1.7, 0.14, 1.7, 0.07), tier >= 3 ? GOLD : light, 0, top + 0.03, 0);
  // panel on the worker side (+Z face): bezel, screen, three buttons
  const sy = 0.18 + h * 0.64;
  b.add(G.box(1.04, 0.44, 0.08, 0.07), 0xffffff, -0.06, sy, 0.79);
  b.add(G.box(0.9, 0.3, 0.06, 0.06), 0x2b2d48, -0.06, sy, 0.82);
  const by = 0.18 + h * 0.26;
  b.add(G.cyl(0.075, 0.075, 0.08, 12), 0xff4d6d, -0.42, by, 0.81, { rx: PI / 2 });
  b.add(G.cyl(0.075, 0.075, 0.08, 12), 0xffd23c, -0.18, by, 0.81, { rx: PI / 2 });
  b.add(G.cyl(0.075, 0.075, 0.08, 12), 0x4fd18b, 0.06, by, 0.81, { rx: PI / 2 });
  // vents on the belt side (+X face)
  for (let k = 0; k < 3; k++) b.add(G.box(0.06, 0.07, 0.86, 0.03), light, 0.8, 0.18 + h * (0.38 + k * 0.17), -0.1);
  // milestone trims
  if (tier >= 1) b.add(G.box(1.64, 0.09, 1.64, 0.045), tier >= 3 ? GOLD : 0xffffff, 0, 0.18 + h * 0.08, 0);
  if (tier >= 2) b.add(G.box(1.64, 0.06, 1.64, 0.03), tier >= 3 ? GOLD : 0xffffff, 0, 0.18 + h * 0.94, 0);
  return { top: top + 0.1, screenY: sy, h };
}

/** small bracket post on the front corner of the top, returns its top y */
function post(b, top, height, color = STEEL, at = 0.56) {
  b.add(G.cyl(0.08, 0.1, height, 10), color, at, top + height / 2, at);
  b.add(G.cyl(0.16, 0.18, 0.08, 14), INK, at, top + 0.04, at);
  return top + height;
}

/** horizontal boom from (at, y, at) to the turntable (T, y, T) */
function boom(b, y, color = STEEL, at = 0.56, end = OFF) {
  const len = (end - at) * Math.SQRT2;
  b.push(at, y, at, { ry: DIAG });
  b.add(G.box(0.13, 0.13, len + 0.12, 0.05), color, 0, 0, len / 2);
  b.add(G.sphere(10, 8), INK, 0, 0, 0, { s: 0.1 });
  b.pop();
}

function roll(pb, colors, r, len, bands = 6) {
  // horizontal roll along local X made of coloured bands
  const w = len / bands;
  for (let i = 0; i < bands; i++) pb.add(G.cyl(r, r, w * 1.01, 18), colors[i % colors.length], -len / 2 + w * (i + 0.5), 0, 0, { rz: PI / 2 });
  pb.add(G.cyl(r * 0.35, r * 0.35, len + 0.12, 10), INK, 0, 0, 0, { rz: PI / 2 });
}

function bow(pb, color, x, y, z, s = 1) {
  pb.add(G.sphere(10, 8), color, x - 0.1 * s, y, z, { sx: 0.13 * s, sy: 0.09 * s, sz: 0.06 * s, rz: 0.4 });
  pb.add(G.sphere(10, 8), color, x + 0.1 * s, y, z, { sx: 0.13 * s, sy: 0.09 * s, sz: 0.06 * s, rz: -0.4 });
  pb.add(G.sphere(8, 6), shade(color, -0.12), x, y, z, { s: 0.06 * s });
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
    const cab = cabinet(b, c, 0.82, tier);
    const top = cab.top;
    b.add(G.box(1.52, 0.1, 1.52, 0.05), th.wood, 0, top, 0);
    // motor tower at the back
    b.add(G.box(0.64, 0.6, 0.64, 0.16), STEEL, -0.36, top + 0.33, -0.36);
    b.add(G.box(0.7, 0.12, 0.7, 0.06), shade(c, -0.12), -0.36, top + 0.66, -0.36);
    b.add(G.cyl(0.08, 0.08, 0.18, 8), INK, -0.36, top + 0.8, -0.36);
    // planks waiting on the table
    b.add(G.box(0.5, 0.1, 0.18, 0.04), th.woodDark, -0.45, top + 0.1, 0.32, { ry: 0.3 });
    b.add(G.box(0.5, 0.1, 0.18, 0.04), th.wood, -0.42, top + 0.2, 0.34, { ry: 0.2 });
    const py = post(b, top, 0.5, STEEL, 0.5);
    const s = 1 + tier * 0.07;
    const arm = P(root, [0.5, py, 0.5], (pb) => {
      pb.add(G.box(0.2, 0.18, 1.32, 0.08), STEEL, 0, 0, 0.6);
      pb.add(G.box(0.26, 0.28, 0.34, 0.1), c, 0, 0.06, 0.1);
      pb.add(G.box(0.12, 0.3, 0.12, 0.05), INK, 0, 0.3, 0.12);
      pb.add(G.torus(0.47 * s, 0.09, 6, 14, PI), c, 0, -0.08, 1.2);
      pb.add(G.box(0.12, 0.12, 0.2, 0.05), c, 0, -0.08, 1.2);
    }, { ry: DIAG });
    const blade = P(arm, [0, -0.08, 1.2], (pb) => {
      pb.add(G.cyl(0.42 * s, 0.42 * s, 0.05, 22), 0xf2f5ff, 0, 0, 0, { rx: PI / 2 });
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * TAU;
        pb.add(G.box(0.12, 0.12, 0.05, 0.01), 0xb9c3dc, Math.cos(a) * 0.42 * s, Math.sin(a) * 0.42 * s, 0, { rz: a + PI / 4 });
      }
      pb.add(G.cyl(0.13, 0.13, 0.09, 12), c, 0, 0, 0, { rx: PI / 2 });
      pb.add(G.box(0.3, 0.06, 0.06, 0.02), 0xffffff, 0, 0.2 * s, 0.03);
    });
    return {
      ...cab, top,
      emit: { kind: 'chip', y: 0.55, rate: 9 },
      anim(st) {
        const chop = Math.pow(Math.max(0, Math.sin(st.beat * TAU)), 2);
        arm.rotation.x = 0.1 + chop * 0.26 * st.work;
        blade.rotation.z = -st.spin * 3;
      },
    };
  },

  assembly(b, P, th, tier, root) {
    const c = th.machineColor[1];
    const cab = cabinet(b, c, 0.8, tier);
    const top = cab.top;
    // gear decoration and a parts bin at the back
    b.push(-0.42, top + 0.05, -0.42);
    b.add(G.cyl(0.3, 0.3, 0.1, 16), GOLD, 0, 0, 0);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; b.add(G.box(0.12, 0.1, 0.12, 0.02), GOLD, Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32, { ry: -a }); }
    b.add(G.cyl(0.1, 0.1, 0.14, 10), INK, 0, 0.02, 0);
    b.pop();
    b.add(G.box(0.5, 0.26, 0.4, 0.06), 0xffffff, 0.2, top + 0.13, -0.5);
    for (let k = 0; k < 3; k++) b.add(G.box(0.12, 0.12, 0.12, 0.03), th.wood, 0.05 + k * 0.15, top + 0.3, -0.5);
    b.add(G.cyl(0.36, 0.42, 0.14, 18), INK, 0.42, top + 0.07, 0.42);
    const s = 1 + tier * 0.06;
    const turret = P(root, [0.42, top + 0.14, 0.42], (pb) => {
      pb.add(G.cyl(0.3, 0.33, 0.2, 18), c, 0, 0.1, 0);
      pb.add(G.box(0.26, 0.62, 0.26, 0.11), 0xffd23c, 0, 0.5, 0);
      pb.add(G.sphere(12, 8), INK, 0, 0.84, 0, { s: 0.18 });
    }, { ry: DIAG });
    const fore = P(turret, [0, 0.84, 0], (pb) => {
      pb.add(G.box(0.22, 0.22, 1.62, 0.09), 0xffd23c, 0, 0, 0.8);
      pb.add(G.box(0.24, 0.06, 1.2, 0.03), shade(0xffd23c, -0.15), 0, 0.12, 0.8);
      pb.add(G.sphere(12, 8), INK, 0, 0, 1.62, { s: 0.13 });
    });
    const head = P(fore, [0, 0, 1.62], (pb) => {
      pb.add(G.box(0.36 * s, 0.3 * s, 0.36 * s, 0.11), c, 0, -0.2, 0);
      pb.add(G.box(0.4 * s, 0.08, 0.4 * s, 0.04), 0xffffff, 0, -0.07, 0);
      pb.add(G.cyl(0.06, 0.02, 0.24, 8), STEEL, 0, -0.45, 0);
    });
    const base = 0.63;
    return {
      ...cab, top,
      emit: { kind: 'spark', y: 0.6, rate: 0, onBeat: 2 },
      anim(st) {
        const tap = Math.pow(Math.abs(Math.sin(st.beat * PI * 2)), 6);
        turret.rotation.y = DIAG + Math.sin(st.t * 1.4) * 0.1 * st.work;
        fore.rotation.x = base - 0.16 + (0.16 + tap * 0.1) * (0.4 + 0.6 * st.work);
        head.rotation.x = -fore.rotation.x;
      },
    };
  },

  paint(b, P, th, tier, root) {
    const c = th.machineColor[2];
    const cab = cabinet(b, c, 0.8, tier);
    const top = cab.top;
    const cans = [0xff5a5f, 0xffcc29, 0x3fa9f5];
    const spots = [[-0.48, -0.12], [-0.12, -0.5], [-0.52, -0.52]];
    spots.forEach(([x, z], i) => {
      b.add(G.cyl(0.19, 0.19, 0.34, 14), 0xffffff, x, top + 0.17, z);
      b.add(G.cyl(0.195, 0.195, 0.12, 14), cans[i], x, top + 0.17, z);
      b.add(G.cyl(0.2, 0.2, 0.05, 14), cans[i], x, top + 0.36, z);
    });
    // paint drips down the cabinet
    const drips = [[0.81, 0.5, -0.5, 0], [0.81, 0.3, -0.15, 1], [0.81, 0.4, 0.3, 2], [0.4, 0.45, 0.81, 0], [-0.62, 0.35, 0.81, 2]];
    for (const [x, len, z, ci] of drips) {
      const onX = x > 0.8;
      b.add(G.box(onX ? 0.04 : 0.12, len, onX ? 0.12 : 0.04, 0.02), cans[ci], onX ? x : z, cab.top - 0.12 - len / 2, onX ? z : x);
      b.add(G.sphere(8, 6), cans[ci], onX ? x : z, cab.top - 0.12 - len, onX ? z : x, { s: 0.075 });
    }
    const py = post(b, top, 0.55);
    boom(b, py, STEEL, 0.56, OFF - 0.02);
    const s = 1 + tier * 0.07;
    const nozzle = P(root, [OFF - 0.02, py, OFF - 0.02], (pb) => {
      pb.add(G.cyl(0.13 * s, 0.13 * s, 0.32, 12), c, 0, -0.16, 0);
      pb.add(G.cyl(0.15 * s, 0.15 * s, 0.07, 12), 0xffffff, 0, -0.06, 0);
      pb.add(G.cone(0.11 * s, 0.18, 12), STEEL, 0, -0.42, 0, { rx: PI });
    });
    return {
      ...cab, top,
      emit: { kind: 'paint', y: 0.75, rate: 11 },
      anim(st) {
        nozzle.rotation.z = Math.sin(st.beat * TAU * 2) * 0.32 * st.work;
        nozzle.rotation.x = Math.cos(st.beat * TAU * 2) * 0.2 * st.work;
      },
    };
  },

  wrap(b, P, th, tier, root) {
    const c = th.machineColor[3];
    const cab = cabinet(b, c, 0.8, tier);
    const top = cab.top;
    // brackets for the paper roll
    const ax = Math.SQRT1_2;
    for (const k of [-1, 1]) b.add(G.box(0.1, 0.42, 0.1, 0.04), STEEL, -0.32 + k * 0.62 * ax, top + 0.21, -0.32 - k * 0.62 * ax);
    const paper = P(root, [-0.32, top + 0.4, -0.32], (pb) => roll(pb, [0xffffff, th.box[1], 0xffffff, th.box[0]], 0.27 + tier * 0.02, 1.2, 8), { ry: -DIAG });
    // ribbon spool on the side
    b.add(G.cyl(0.2, 0.2, 0.14, 16), th.ribbon, 0.45, top + 0.07, -0.42);
    b.add(G.cyl(0.07, 0.07, 0.18, 8), 0xffffff, 0.45, top + 0.1, -0.42);
    const py = post(b, top, 0.75);
    boom(b, py, STEEL);
    b.add(G.cyl(0.05, 0.05, 0.3, 8), STEEL, OFF, py - 0.12, OFF);
    const s = 1 + tier * 0.06;
    const hood = P(root, [OFF, py - 0.3, OFF], (pb) => {
      pb.add(G.box(0.66 * s, 0.4 * s, 0.66 * s, 0.1), th.box[0], 0, 0, 0);
      pb.add(G.box(0.68 * s, 0.41 * s, 0.14, 0.04), th.ribbon, 0, 0, 0);
      pb.add(G.box(0.14, 0.41 * s, 0.68 * s, 0.04), th.ribbon, 0, 0, 0);
      bow(pb, th.ribbon, 0, 0.24 * s, 0, 1.3);
    });
    const hy = py - 0.3;
    return {
      ...cab, top,
      emit: null,
      anim(st) {
        const x = (st.beat % 1);
        const press = x > 0.55 && x < 0.95 ? Math.sin(((x - 0.55) / 0.4) * PI) : 0;
        hood.position.y = hy - press * 0.62 * st.work;
        paper.rotation.x = st.spin * 1.5;
      },
    };
  },

  cutter(b, P, th, tier, root) {
    const c = th.machineColor[0];
    const cab = cabinet(b, c, 0.82, tier);
    const top = cab.top;
    b.add(G.box(1.5, 0.08, 1.5, 0.04), 0xffffff, 0, top, 0);
    const ax = Math.SQRT1_2;
    for (const k of [-1, 1]) b.add(G.box(0.1, 0.42, 0.1, 0.04), STEEL, -0.32 + k * 0.62 * ax, top + 0.21, -0.32 - k * 0.62 * ax);
    const fab = P(root, [-0.32, top + 0.42, -0.32], (pb) => roll(pb, [th.fabric, shade(th.fabric, 0.18)], 0.28 + tier * 0.02, 1.15, 6), { ry: -DIAG });
    // fabric sheet hanging from the roll onto the table
    b.add(G.box(0.95, 0.03, 0.62, 0.01), th.fabric, -0.05, top + 0.06, -0.05, { ry: -DIAG });
    const py = post(b, top, 0.55, STEEL, 0.5);
    b.push(0.5, py, 0.5, { ry: DIAG });
    b.add(G.box(0.18, 0.14, 1.32, 0.06), STEEL, 0, 0, 0.62);
    b.add(G.box(0.24, 0.06, 1.2, 0.03), c, 0, 0.09, 0.66);
    b.pop();
    const s = 1 + tier * 0.07;
    const head = P(root, [OFF, py, OFF], (pb) => {
      pb.add(G.box(0.32 * s, 0.3 * s, 0.32 * s, 0.1), c, 0, -0.1, 0);
      pb.add(G.box(0.34 * s, 0.07, 0.34 * s, 0.03), 0xffffff, 0, 0.02, 0);
      pb.add(G.cone(0.08, 0.2, 10), INK, 0, -0.34, 0, { rx: PI });
      pb.add(G.sphere(8, 6), 0xff4d6d, 0, -0.46, 0, { s: 0.055 });
    }, { ry: DIAG });
    return {
      ...cab, top,
      emit: { kind: 'scrap', y: 0.5, rate: 6 },
      anim(st) {
        const k = Math.sin(st.beat * TAU * 1.5) * 0.24 * st.work;
        head.position.set(OFF + k * Math.SQRT1_2 - 0.12, head.position.y, OFF - k * Math.SQRT1_2 - 0.12);
        fab.rotation.x = st.spin * 1.2;
      },
    };
  },

  stuffing(b, P, th, tier, root) {
    const c = th.machineColor[1];
    const cab = cabinet(b, c, 0.7, tier);
    const top = cab.top;
    const s = 1 + tier * 0.06;
    const tank = P(root, [-0.25, top, -0.25], (pb) => {
      pb.add(G.cyl(0.56 * s, 0.6 * s, 0.7, 20), 0xeefbff, 0, 0.35, 0);
      pb.add(G.cyl(0.62 * s, 0.62 * s, 0.12, 20), shade(c, -0.1), 0, 0.12, 0);
      pb.add(G.cyl(0.6 * s, 0.6 * s, 0.08, 20), shade(c, 0.2), 0, 0.7, 0);
      // cotton cloud on top
      const puffs = [[0, 0.86, 0, 0.36], [0.26, 0.8, 0.1, 0.26], [-0.24, 0.8, 0.16, 0.25], [0.06, 0.82, -0.26, 0.27], [0.1, 1.08, 0.05, 0.22]];
      for (const [x, y, z, r] of puffs) pb.add(G.sphere(12, 8), 0xffffff, x * s, y, z * s, { s: r * s });
      // window with cotton inside
      pb.push(0, 0.38, 0, { ry: DIAG });
      pb.add(G.box(0.46, 0.32, 0.08, 0.06), 0xffffff, 0, 0, 0.55 * s);
      pb.pop();
    });
    const py = post(b, top, 0.85, shade(c, 0.1), 0.58);
    boom(b, py, shade(c, 0.1), 0.58, OFF);
    b.add(G.cyl(0.07, 0.07, 0.2, 10), shade(c, 0.1), OFF, py - 0.1, OFF);
    b.add(G.cone(0.2, 0.3, 14), 0xffffff, OFF, py - 0.32, OFF, { rx: PI });
    b.add(G.torus(0.12, 0.04, 6, 14), c, OFF, py - 0.2, OFF, { rx: PI / 2 });
    return {
      ...cab, top,
      emit: { kind: 'cotton', y: 0.9, rate: 7 },
      anim(st) {
        const w = Math.sin(st.beat * TAU * 2) * 0.05 * st.work;
        tank.scale.set(1 + w, 1 - w * 1.2, 1 + w);
      },
    };
  },

  stitching(b, P, th, tier, root) {
    const c = th.machineColor[2];
    const cab = cabinet(b, c, 0.75, tier);
    const top = cab.top;
    const cream = 0xfff1d6;
    // sewing machine: pillar, arm over the turntable, head
    b.add(G.box(1.2, 0.12, 0.7, 0.05), cream, 0, top + 0.06, 0, { ry: DIAG });
    b.add(G.box(0.36, 0.95, 0.36, 0.12), cream, -0.05, top + 0.55, -0.05);
    const ay = top + 0.92;
    b.push(-0.05, ay, -0.05, { ry: DIAG });
    const len = (OFF + 0.05) * Math.SQRT2;
    b.add(G.box(0.3, 0.26, len + 0.1, 0.1), cream, 0, 0, len / 2);
    b.add(G.box(0.32, 0.06, len - 0.2, 0.03), th.machineColor[3], 0, 0.12, len / 2);
    b.add(G.box(0.36, 0.4, 0.36, 0.1), cream, 0, -0.08, len);
    b.pop();
    const s = 1 + tier * 0.06;
    const needle = P(root, [OFF, ay - 0.3, OFF], (pb) => {
      pb.add(G.cyl(0.035, 0.035, 0.4, 8), STEEL, 0, -0.15, 0);
      pb.add(G.cone(0.03, 0.08, 6), STEEL, 0, -0.39, 0, { rx: PI });
    });
    // thread spool + hand wheel
    const spool = P(root, [-0.05, top + 1.14, -0.05], (pb) => {
      pb.add(G.cyl(0.12 * s, 0.12 * s, 0.24, 12), th.machineColor[3], 0, 0.12, 0);
      pb.add(G.cyl(0.16 * s, 0.16 * s, 0.04, 12), 0xffffff, 0, 0.02, 0);
      pb.add(G.cyl(0.16 * s, 0.16 * s, 0.04, 12), 0xffffff, 0, 0.24, 0);
    });
    const wheel = P(root, [-0.27, top + 0.6, -0.27], (pb) => {
      pb.add(G.cyl(0.24 * s, 0.24 * s, 0.08, 16), INK, 0, 0, 0, { rz: PI / 2 });
      pb.add(G.box(0.1, 0.36 * s, 0.06, 0.02), 0xffffff, 0.05, 0, 0);
    }, { ry: -DIAG + PI / 2 });
    const ny = ay - 0.3;
    return {
      ...cab, top,
      emit: { kind: 'thread', y: 0.55, rate: 5 },
      anim(st) {
        needle.position.y = ny - Math.abs(Math.sin(st.beat * PI * 4)) * 0.16 * st.work;
        spool.rotation.y = st.spin * 2;
        wheel.rotation.x = st.spin * 2.5;
      },
    };
  },

  ribbon(b, P, th, tier, root) {
    const c = th.machineColor[3];
    const cab = cabinet(b, c, 0.8, tier);
    const top = cab.top;
    const ax = Math.SQRT1_2;
    for (const k of [-1, 1]) b.add(G.box(0.1, 0.4, 0.1, 0.04), STEEL, -0.32 + k * 0.66 * ax, top + 0.2, -0.32 - k * 0.66 * ax);
    const cols = [th.ribbon, th.box[2], th.box[3]];
    const spools = P(root, [-0.32, top + 0.36, -0.32], (pb) => {
      pb.add(G.cyl(0.05, 0.05, 1.36, 8), INK, 0, 0, 0, { rz: PI / 2 });
      for (let i = 0; i < 3; i++) {
        const x = -0.4 + i * 0.4;
        pb.add(G.cyl(0.22 + tier * 0.015, 0.22 + tier * 0.015, 0.2, 16), cols[i], x, 0, 0, { rz: PI / 2 });
        pb.add(G.cyl(0.26, 0.26, 0.03, 16), 0xffffff, x - 0.11, 0, 0, { rz: PI / 2 });
        pb.add(G.cyl(0.26, 0.26, 0.03, 16), 0xffffff, x + 0.11, 0, 0, { rz: PI / 2 });
      }
    }, { ry: -DIAG });
    const py = post(b, top, 0.75);
    boom(b, py, STEEL);
    b.add(G.cyl(0.05, 0.05, 0.3, 8), STEEL, OFF, py - 0.12, OFF);
    const s = 1 + tier * 0.06;
    const hood = P(root, [OFF, py - 0.3, OFF], (pb) => {
      pb.add(G.box(0.64 * s, 0.42 * s, 0.64 * s, 0.12), 0xffffff, 0, 0, 0);
      pb.add(G.box(0.66 * s, 0.43 * s, 0.14, 0.04), th.ribbon, 0, 0, 0);
      pb.add(G.box(0.14, 0.43 * s, 0.66 * s, 0.04), th.ribbon, 0, 0, 0);
      bow(pb, th.ribbon, 0, 0.26 * s, 0, 1.6);
    });
    const hy = py - 0.3;
    return {
      ...cab, top,
      emit: null,
      anim(st) {
        const x = (st.beat % 1);
        const press = x > 0.55 && x < 0.95 ? Math.sin(((x - 0.55) / 0.4) * PI) : 0;
        hood.position.y = hy - press * 0.62 * st.work;
        spools.rotation.x = st.spin * 1.4;
      },
    };
  },
};

// ------------------------------------------------------------ locked plot
function buildPlot(theme) {
  const b = new Builder();
  const slab = 0xf1ecf7;
  b.add(G.box(1.84, 0.08, 1.84, 0.04), slab, 0, 0.04, 0);
  // dashed hazard border
  const n = 6, L = 1.7;
  for (let i = 0; i < n; i++) {
    const t = -L / 2 + (i + 0.5) * (L / n);
    const col = i % 2 ? INK : 0xffc928;
    b.add(G.box(L / n * 0.98, 0.04, 0.12, 0.02), col, t, 0.09, -L / 2);
    b.add(G.box(L / n * 0.98, 0.04, 0.12, 0.02), col, t, 0.09, L / 2);
    b.add(G.box(0.12, 0.04, L / n * 0.98, 0.02), col, -L / 2, 0.09, t);
    b.add(G.box(0.12, 0.04, L / n * 0.98, 0.02), col, L / 2, 0.09, t);
  }
  // cones at the corners
  for (const [x, z] of [[-0.72, -0.72], [0.72, -0.72], [-0.72, 0.72], [0.72, 0.72]]) {
    b.add(G.box(0.3, 0.04, 0.3, 0.02), 0xff8a3d, x, 0.1, z);
    b.add(G.cone(0.13, 0.4, 12), 0xff8a3d, x, 0.32, z);
    b.add(G.cyl(0.085, 0.1, 0.07, 12), 0xffffff, x, 0.3, z);
  }
  // little sawhorse barrier in front (toward the camera)
  b.push(0.38, 0, 0.38, { ry: -DIAG });
  b.add(G.box(0.9, 0.14, 0.06, 0.03), 0xffffff, 0, 0.42, 0);
  for (let i = 0; i < 3; i++) b.add(G.box(0.14, 0.145, 0.065, 0.01), 0xff5a5f, -0.3 + i * 0.3, 0.42, 0, { rz: 0.5 });
  b.add(G.box(0.06, 0.42, 0.06, 0.02), INK, -0.38, 0.21, 0);
  b.add(G.box(0.06, 0.42, 0.06, 0.02), INK, 0.38, 0.21, 0);
  b.pop();
  // toolbox and a stack of bricks
  b.add(G.box(0.4, 0.2, 0.24, 0.05), 0xff5a5f, -0.35, 0.18, -0.25, { ry: 0.4 });
  b.add(G.box(0.22, 0.05, 0.05, 0.02), INK, -0.35, 0.31, -0.25, { ry: 0.4 });
  b.add(G.box(0.3, 0.14, 0.18, 0.03), 0xffb36b, 0.2, 0.15, -0.45);
  b.add(G.box(0.3, 0.14, 0.18, 0.03), 0xff9f5a, 0.25, 0.29, -0.42, { ry: 0.25 });
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

export function createStations(theme, preset) {
  const group = new THREE.Group();
  group.name = 'stations';
  const mat = toyMaterial();
  const plotGeo = buildPlot(theme);

  // turntables (instanced, one draw call)
  const ttb = new Builder();
  ttb.add(G.cyl(0.56, 0.58, 0.07, 24), shade(theme.rail, 0.25), 0, 0, 0);
  for (let k = 0; k < 4; k++) ttb.add(G.box(0.5, 0.02, 0.08, 0.01), shade(theme.rail, -0.12), Math.cos(k * PI / 2) * 0.25, 0.04, Math.sin(k * PI / 2) * 0.25, { ry: -k * PI / 2 });
  ttb.add(G.cyl(0.1, 0.1, 0.02, 12), 0xffffff, 0, 0.045, 0);
  const turntables = new THREE.InstancedMesh(ttb.build(), mat, 4);
  turntables.name = 'turntables';
  group.add(turntables);

  // progress fills on the machine screens
  const fb = new Builder();
  fb.add(G.box(1, 1, 1, 0.3), 0xffffff, 0.5, 0, 0, { tint: 1 });
  const fills = new THREE.InstancedMesh(fb.build(), mat, 4);
  fills.name = 'progress-fills';
  fills.setColorAt(0, _c.set(0xffffff));
  fills.count = 0;
  group.add(fills);

  // floor glows (milestone gold, boost cyan)
  const glowMat = new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: false });
  const glows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2), glowMat, 8);
  glows.name = 'glows';
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
      emitAcc: 0, lastBeat: 0, cheer: 0,
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
      b.add(G.cyl(0.05, 0.05, 0.3, 8), STEEL, 0.55, info.top + 0.15, -0.55);
      beacon = P(st.machine, [0.55, info.top + 0.34, -0.55], (pb) => {
        pb.add(G.cyl(0.13, 0.15, 0.06, 12), INK, 0, -0.03, 0);
        pb.add(G.hemi(12, 6), tier >= 3 ? GOLD : 0xff5a5f, 0, 0, 0, { s: 0.14 });
        pb.add(G.box(0.2, 0.05, 0.05, 0.02), 0xffffff, 0, 0.07, 0);
      });
    }
    if (tier >= 4) {
      star = P(st.machine, [-0.06, info.screenY + 0.42, 0.86], (pb) => star5(pb, GOLD, 0, 0, 0, 1.1));
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
      out.y = st.open && st.built ? st.built.top + 0.95 : 1.45;
      return out;
    },
    /** centre of the machine (for bursts) */
    center(i, out, y = 1.0) {
      out.set(0, 0, 0).applyMatrix4(stations[i].spot.matrixWorld);
      out.y = y;
      return out;
    },
    turntableAngle(i) { return stations[i].spin * 0.55; },
    workerSpot(i, out) {
      const st = stations[i];
      out.set(WORKER_SPOT.x, 0, WORKER_SPOT.z).applyMatrix4(st.frame.matrixWorld);
      let ry = WORKER_SPOT.ry;
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
        const s = ss[i] || { open: i < 2, level: 1, progress: 0, tray: 0, boostT: 0 };
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

        // animation
        st.pop = Math.max(0, st.pop - dt * 2.2);
        st.cyclePop = Math.max(0, st.cyclePop - dt * 5);
        st.cheer = Math.max(0, st.cheer - dt * 1.1);
        let sx = 1, sy = 1;
        if (st.openT >= 0) {
          st.openT += dt;
          const k = clamp(st.openT / 0.75, 0, 1);
          const e = ease.outElastic(k);
          sx = sy = 0.05 + 0.95 * e;
          if (k >= 1) st.openT = -1;
        }
        if (st.pop > 0) {
          const k = 1 - st.pop;
          const a = Math.sin(k * PI * 3) * Math.exp(-k * 3) * (st.popKind === 2 ? 0.2 : 0.12);
          sy *= 1 + a; sx *= 1 - a * 0.6;
        }
        if (st.cyclePop > 0) { const a = Math.sin(st.cyclePop * PI) * 0.025; sy *= 1 - a; sx *= 1 + a * 0.5; }
        if (st.boostAmt > 0.01) { const w = Math.sin(st.t * 40) * 0.008 * st.boostAmt; sx *= 1 + w; }
        st.machine.scale.set(sx, sy, sx);
        if (st.open && st.built) {
          st.built.anim(st);
          if (st.built.beacon) {
            st.built.beacon.rotation.y = st.t * 3;
            const bl = 1 + 0.12 * Math.sin(st.t * 6) * st.work;
            st.built.beacon.scale.setScalar(bl);
          }
          if (st.built.star) { st.built.star.rotation.y = Math.sin(st.t * 1.5) * 0.5; }
        }
        // turntable
        _p.set(CORNERS[i][0], BELT_Y - 0.03, CORNERS[i][1]);
        _q.setFromAxisAngle(_up, st.spin * 0.55);
        _s.set(1, 1, 1);
        turntables.setMatrixAt(i, _m4.compose(_p, _q, _s));

        // progress screen fill
        if (st.open && st.built && st.openT < 0) {
          const w = 0.8 * clamp(p, 0, 1);
          if (w > 0.01) {
            st.spot.updateMatrixWorld(true);
            const mirrored = st.mirrored;
            // canonical screen spans x in [-0.46, 0.34] on the +Z face
            const x0 = mirrored ? 0.34 - w : -0.46;
            _p.set(-OFF + x0 + 0, st.built.screenY, -OFF + 0.86);
            _q.identity();
            _s.set(w, 0.17, 0.03);
            _m4.compose(_p, _q, _s).premultiply(st.frame.matrixWorld);
            fills.setMatrixAt(nFill, _m4);
            if (st.blocked) _c.set(0xffb02e).multiplyScalar(0.85 + 0.15 * Math.sin(st.t * 8));
            else if (st.boost) _c.set(0x5ff0ff);
            else _c.set(0x6dff8e);
            fills.setColorAt(nFill, _c);
            nFill++;
          }
        }
        // glows
        if (st.open && st.boostAmt > 0.02) {
          api.center(i, _v, 0.02);
          const sc = 3.0 + Math.sin(st.t * 10) * 0.15;
          _m4.compose(_v.set((_v.x + CORNERS[i][0]) / 2, 0.03, (_v.z + CORNERS[i][1]) / 2), _q.identity(), _s.set(sc * 1.2, 1, sc * 1.2));
          glows.setMatrixAt(nGlow, _m4);
          glows.setColorAt(nGlow, _c.set(0x46e0ff).multiplyScalar(0.55 * st.boostAmt));
          nGlow++;
        }
        if (st.open && st.tier >= 3) {
          api.center(i, _v, 0.025);
          const sc = 2.7 + Math.sin(st.t * 2) * 0.12;
          _m4.compose(_v, _q.identity(), _s.set(sc, 1, sc));
          glows.setMatrixAt(nGlow, _m4);
          glows.setColorAt(nGlow, _c.set(st.tier >= 4 ? 0xff9cf2 : 0xffd23c).multiplyScalar(0.45));
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
