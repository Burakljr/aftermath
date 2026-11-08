// KALKAN-07: original municipal civil-defence machine (~46 m). Livery chosen to stand apart from the
// warm city: off-white armour, steel-blue trim, graphite frame, high-vis chevrons on the forearms and
// a stencilled "07" on the chest and shoulders. Silhouette in three readable masses: a wide shoulder
// yoke, a narrow waist with a visible piston spine, and heavy pistoned legs. The head is a
// firefighter-style helmet (rear neck brim, comb) with one wide cyan visor. No exhaust stacks.
// v2 (scene-actors): ported from proto-B. Wider yoke with hi-vis chevron edges, a narrower waist, panel
// lines, shoulder lift-jets for the landing (additive glow cones), the "07" stencil redrawn once the
// vendored stencil font is ready. Body parts share the scene's vehicle material (one program).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Builder, smooth, lerp } from '../util.js';

const WHITE = 0xe9e6de, WHITE2 = 0xcfccc4, BLUE = 0x34577c, BLUE2 = 0x27425f, FRAME = 0x2a2d31, STEEL = 0x8d9296, DARK = 0x16181b, YEL = 0xf2b51a, INK = 0x1c2a40;

class Part {
  constructor(seed) { this.B = new Builder(seed); }
  rbox(w, h, d, x, y, z, color, { r = 0.5, rx = 0, ry = 0, rz = 0, seg = 2, jitter = 0.04 } = {}) {
    const g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
    if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    // subtle panel shading: darker toward the bottom of each part (cheap baked AO)
    return this.B.push(g, color, { jitter, grad: (px, py) => 0.8 + 0.2 * smooth(y - h / 2, y + h / 2, py) });
  }
  box(w, h, d, x, y, z, color, o = {}) { return this.B.box(w, h, d, x, y, z, color, { jitter: 0.03, ...o }); }
  cyl(rt, rb, h, x, y, z, color, o = {}) { return this.B.cyl(rt, rb, h, x, y, z, color, { jitter: 0.03, seg: 12, ...o }); }
  piston(a, b, r, rodColor = STEEL) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    const barrel = new THREE.CylinderGeometry(r, r, len * 0.56, 10); barrel.translate(0, -len * 0.2, 0);
    this.B.geo(barrel, BLUE2, m, { jitter: 0.03 });
    const rod = new THREE.CylinderGeometry(r * 0.52, r * 0.52, len * 0.56, 10); rod.translate(0, len * 0.21, 0);
    this.B.geo(rod, rodColor, m, { jitter: 0.01 });
    for (const e of [a, b]) { const k = new THREE.SphereGeometry(r * 1.05, 8, 6); k.translate(e.x, e.y, e.z); this.B.push(k, FRAME, { jitter: 0.02 }); }
  }
  // high-vis chevron band wrapped around a box section (alternating diagonal blocks)
  chevrons(w, h, d, x, y, z, n = 6) {
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const g = new THREE.BoxGeometry(w / n * 1.02, h, d);
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) pos.setX(k, pos.getX(k) + (pos.getY(k) > 0 ? 0.35 : -0.35) * (w / n));
      g.translate(x + t * w, y, z);
      this.B.push(g, i % 2 ? DARK : YEL, { jitter: 0.02 });
    }
  }
  mesh(mat) { const m = new THREE.Mesh(this.B.build(), mat); m.castShadow = true; m.receiveShadow = true; return m; }
}

// stencil "07" decal atlas drawn with the vendored Big Shoulders Stencil font (falls back to a bold sans)
function stencilTexture() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const ctx = cv.getContext('2d');
  const t = new THREE.CanvasTexture(cv);
  const draw = () => {
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 230px "Big Shoulders Stencil Display", "Big Shoulders Display", "Arial Narrow", sans-serif';
    ctx.fillText('07', 128, 140);
    t.needsUpdate = true;
  };
  draw();
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) document.fonts.ready.then(draw).catch(() => {});
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createRobot(sharedMat) {
  const mat = sharedMat || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15, flatShading: true });
  const jetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.6, 4.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x06222a, roughness: 0.15, metalness: 0.2, emissive: new THREE.Color(0.25, 0.95, 1.0), emissiveIntensity: 4.0 });
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.5, 2.6, 0.3) });
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 4.4, 4.0) });
  const decalMat = new THREE.MeshStandardMaterial({ map: stencilTexture(), color: INK, transparent: true, alphaTest: 0.4, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
  const group = new THREE.Group();
  const J = {}, jets = [];
  const mk = (name, parent, x, y, z) => { const o = new THREE.Group(); o.position.set(x, y, z); o.name = name; parent.add(o); J[name] = o; return o; };
  const decal = (parent, w, h, x, y, z, ry = 0, rx = 0) => {
    const g = new THREE.PlaneGeometry(w, h); const m = new THREE.Mesh(g, decalMat);
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.renderOrder = 2; parent.add(m); return m;
  };

  const pelvis = mk('pelvis', group, 0, 21, 0);
  const waist = mk('waist', pelvis, 0, 2.2, 0);
  const torso = mk('torso', waist, 0, 3.2, 0);
  // ---------------- pelvis: armoured hip block with blue skirt plates
  {
    const P = new Part(1);
    P.rbox(12, 3.8, 7.5, 0, 0, 0, FRAME, { r: 0.6 });
    P.rbox(9.5, 3.0, 8.4, 0, 0.3, 0.2, WHITE2, { r: 0.6 });
    for (const s of [-1, 1]) P.rbox(3.6, 4.6, 7.8, s * 5.6, -1.6, 0.2, BLUE, { r: 0.6, rz: s * 0.12 });
    P.cyl(1.6, 1.6, 14, 0, -0.8, 0, STEEL, { rz: Math.PI / 2 });
    pelvis.add(P.mesh(mat));
  }
  // ---------------- waist: narrow, with a piston spine and side rams
  {
    const P = new Part(2);
    P.cyl(2.2, 2.9, 4.6, 0, 0.8, 0, FRAME, { seg: 10 });
    P.rbox(3.6, 3.8, 3.6, 0, 1.0, 1.4, BLUE2, { r: 0.5 });
    for (const s of [-1, 1]) P.piston(new THREE.Vector3(s * 3.6, -1.2, -0.6), new THREE.Vector3(s * 3.9, 3.6, -0.4), 0.55);
    P.piston(new THREE.Vector3(0, -1.2, -3.0), new THREE.Vector3(0, 3.8, -3.0), 0.6);
    waist.add(P.mesh(mat));
  }
  // ---------------- torso: tapered chest + the wide shoulder yoke
  {
    const P = new Part(3);
    P.rbox(11.5, 7.5, 9.2, 0, 3.6, 0.2, FRAME, { r: 0.8 });
    P.rbox(14.5, 8.5, 9.0, 0, 6.6, 1.0, WHITE, { r: 1.4, seg: 3 });           // chest plate
    P.rbox(11.0, 3.6, 8.0, 0, 1.6, 1.5, BLUE, { r: 0.8 });                    // lower chest band
    P.rbox(6.0, 4.4, 1.0, 0, 6.8, 5.6, WHITE2, { r: 0.4 });                    // number panel
    // shoulder yoke: one wide horizontal mass (off-white top, blue under-band)
    P.rbox(27, 6.4, 11.4, 0, 11.4, 0.0, WHITE, { r: 2.0, seg: 3 });
    for (const s of [-1, 1]) P.rbox(7.4, 5.2, 10.4, s * 12.0, 9.6, 0.0, WHITE2, { r: 1.6, rz: s * 0.32 });
    P.rbox(25, 1.6, 11.8, 0, 8.2, 0.0, BLUE, { r: 0.6 });
    P.chevrons(20, 1.1, 0.4, 0, 13.9, 5.6, 10);                                   // hi-vis edge on the yoke
    for (let i = 0; i < 3; i++) P.box(0.25, 5.0, 0.3, -6 + i * 6, 11.2, 5.75, BLUE2); // panel lines
    P.rbox(10, 2.6, 7.0, 0, 14.4, -0.6, WHITE2, { r: 1.0 });                  // collar
    // back: armoured spine plate (no exhaust stacks)
    P.rbox(10, 9.0, 3.0, 0, 6.5, -5.0, BLUE2, { r: 0.8 });
    for (let i = 0; i < 4; i++) P.box(8.4, 0.5, 0.5, 0, 3.6 + i * 1.9, -6.55, DARK);
    // vents on the lower chest
    for (let i = 0; i < 4; i++) P.box(7.0, 0.32, 0.4, 0, 0.4 + i * 0.75, 5.5, DARK);
    torso.add(P.mesh(mat));
    decal(torso, 5.4, 5.4, 0, 7.1, 6.15);
    for (const s of [-1, 1]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(1.8, 14, 10, 1, true), jetMat);
      cone.rotation.x = Math.PI; cone.position.set(s * 7.5, 0.2, -6.2); cone.name = 'jet'; torso.add(cone); jets.push(cone);
    }
    // lift-jet nozzles on the back of the yoke (glow cones point down, scaled by thrust)
    for (const s of [-1, 1]) { P.cyl(1.5, 1.9, 2.6, s * 7.5, 8.8, -6.2, DARK, { seg: 10 }); P.cyl(1.9, 1.9, 0.5, s * 7.5, 7.4, -6.2, STEEL, { seg: 10 }); }
    // amber beacons on the yoke + flood lamps
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 1.0, 10), beaconMat); b.position.set(s * 12.5, 14.6, -1.0); torso.add(b);
      const l = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 0.2), lampMat); l.position.set(s * 9.0, 11.4, 5.3); torso.add(l);
    }
  }
  // ---------------- helmet head: firefighter-style dome, comb, rear neck brim, wide cyan visor
  const head = mk('head', torso, 0, 15.2, 0.6);
  head.scale.setScalar(1.3);
  {
    const P = new Part(4);
    P.cyl(2.2, 2.6, 2.2, 0, 0.4, 0, FRAME, { seg: 10 });                      // neck ring
    const dome = new THREE.SphereGeometry(4.2, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    dome.scale(1.0, 1.0, 1.12); dome.translate(0, 3.0, 0.2);
    P.B.push(dome, WHITE, { jitter: 0.03, grad: (x, y) => 0.82 + 0.18 * smooth(2, 7, y) });
    P.rbox(8.6, 2.6, 8.8, 0, 2.6, 0.2, WHITE2, { r: 1.0 });                    // helmet band
    P.rbox(1.0, 1.6, 8.6, 0, 7.0, -0.2, BLUE, { r: 0.4 });                     // comb ridge
    const brim = new THREE.CylinderGeometry(5.8, 6.4, 0.6, 18, 1, false, Math.PI * 0.55, Math.PI * 0.9);
    brim.translate(0, 1.6, -0.6); P.B.push(brim, WHITE2, { jitter: 0.03 });   // rear neck brim
    P.rbox(7.2, 2.8, 2.0, 0, 3.3, 4.2, FRAME, { r: 0.7 });                     // visor frame
    P.rbox(2.2, 1.6, 0.6, 0, 6.0, 4.3, BLUE, { r: 0.3 });                      // front badge
    head.add(P.mesh(mat));
    const visor = new THREE.Mesh(new RoundedBoxGeometry(6.2, 1.1, 0.6, 2, 0.25), visorMat);
    visor.position.set(0, 3.3, 5.05); head.add(visor);
  }
  // ---------------- arms
  function arm(side) {
    const S = side > 0 ? 'L' : 'R';
    const sh = mk('shoulder' + S, torso, side * 15.4, 10.4, 0.2);
    const P = new Part(10 + side);
    P.rbox(8.6, 8.4, 10.4, side * 0.9, 1.4, 0, WHITE, { r: 2.0, seg: 3 });     // pauldron
    P.rbox(8.8, 1.6, 10.8, side * 0.9, -2.4, 0, BLUE, { r: 0.6 });
    P.cyl(2.6, 2.6, 3.4, 0, -1.4, 0, FRAME, { rz: Math.PI / 2 });
    sh.add(P.mesh(mat));
    decal(sh, 4.6, 4.6, side * 5.42, 1.6, 0, side * Math.PI / 2);
    const upper = mk('upper' + S, sh, side * 0.4, -3.2, 0);
    const U = new Part(20 + side);
    U.rbox(4.0, 8.6, 4.2, 0, -4.2, 0, FRAME, { r: 0.6 });
    U.rbox(5.0, 5.0, 5.2, 0, -3.4, 0.2, WHITE2, { r: 0.9 });
    U.piston(new THREE.Vector3(side * 2.8, -1.0, 1.4), new THREE.Vector3(side * 2.8, -8.4, 1.8), 0.6);
    U.cyl(2.2, 2.2, 5.2, 0, -8.8, 0, STEEL, { rz: Math.PI / 2 });
    upper.add(U.mesh(mat));
    const fore = mk('fore' + S, upper, 0, -8.8, 0);
    const F = new Part(30 + side);
    F.rbox(4.6, 9.4, 4.8, 0, -4.8, 0, FRAME, { r: 0.6 });
    F.rbox(6.2, 7.6, 6.0, 0, -5.0, 0.2, WHITE, { r: 1.2, seg: 3 });           // forearm guard
    F.chevrons(6.4, 1.5, 6.25, 0, -2.6, 0.2, 6);                              // hi-vis chevron band
    F.chevrons(6.4, 1.5, 6.25, 0, -7.2, 0.2, 6);
    F.piston(new THREE.Vector3(0, -0.8, -3.3), new THREE.Vector3(0, -9.0, -3.1), 0.6);
    fore.add(F.mesh(mat));
    const hand = mk('hand' + S, fore, 0, -9.8, 0);
    const H = new Part(40 + side);
    if (side < 0) {
      // right: the punching fist (knuckle block + four fingers + thumb)
      H.rbox(6.2, 4.6, 6.0, 0, -2.4, 0, FRAME, { r: 1.0 });
      H.rbox(6.6, 2.0, 6.4, 0, -0.6, 0, BLUE, { r: 0.6 });
      for (let k = 0; k < 4; k++) H.rbox(1.45, 2.6, 2.4, -2.2 + k * 1.47, -5.0, 1.6, WHITE2, { r: 0.5 });
      H.rbox(1.8, 2.6, 2.0, side * -3.4, -3.4, 2.2, WHITE2, { r: 0.5, rz: 0.4 });
      H.box(6.0, 0.6, 0.4, 0, -6.1, 2.85, STEEL);                              // steel knuckle plate
    } else {
      // left: demolition grapple (three jaws)
      H.rbox(5.0, 3.2, 5.0, 0, -1.6, 0, FRAME, { r: 0.6 });
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5;
        const g = new RoundedBoxGeometry(1.3, 6.4, 1.7, 1, 0.35);
        g.translate(0, -3.0, 0); g.rotateX(0.35); g.rotateY(-a + Math.PI / 2); g.translate(Math.cos(a) * 1.8, -2.6, Math.sin(a) * 1.8);
        H.B.push(g, k === 0 ? YEL : WHITE2, { jitter: 0.04 });
      }
    }
    hand.add(H.mesh(mat));
  }
  arm(1); arm(-1);
  // ---------------- legs: heavy, pistoned, big knee guards, wide feet
  function leg(side) {
    const S = side > 0 ? 'L' : 'R';
    const hip = mk('hip' + S, pelvis, side * 5.4, -1.2, 0);
    const T = new Part(50 + side);
    T.rbox(5.4, 10.6, 6.0, 0, -5.0, 0, FRAME, { r: 0.7 });
    T.rbox(6.8, 7.8, 7.0, side * 0.2, -4.4, 0.4, WHITE, { r: 1.4, seg: 3 });   // thigh armour
    T.rbox(7.0, 1.4, 7.2, side * 0.2, -1.0, 0.4, BLUE, { r: 0.5 });
    T.piston(new THREE.Vector3(side * 3.6, -0.8, 2.4), new THREE.Vector3(side * 3.6, -10.0, 2.8), 0.75);
    T.piston(new THREE.Vector3(-side * 3.4, -0.8, -2.6), new THREE.Vector3(-side * 3.4, -10.0, -2.2), 0.7);
    T.cyl(2.6, 2.6, 6.2, 0, -10.4, 0, STEEL, { rz: Math.PI / 2 });
    hip.add(T.mesh(mat));
    const knee = mk('knee' + S, hip, 0, -10.4, 0);
    const K = new Part(60 + side);
    K.rbox(5.8, 11.0, 6.2, 0, -5.6, -0.3, FRAME, { r: 0.7 });
    K.rbox(7.6, 7.6, 7.2, 0, -5.4, 0.6, WHITE, { r: 1.4, seg: 3 });           // shin guard
    K.rbox(5.6, 4.2, 3.0, 0, 0.4, 3.0, BLUE, { r: 1.0 });                      // knee cap
    K.chevrons(7.8, 1.2, 7.3, 0, -8.3, 0.6, 7);
    K.piston(new THREE.Vector3(side * 3.8, 0.0, -2.0), new THREE.Vector3(side * 3.8, -10.0, -1.6), 0.7);
    K.piston(new THREE.Vector3(-side * 3.8, 0.0, -2.0), new THREE.Vector3(-side * 3.8, -10.0, -1.6), 0.7);
    knee.add(K.mesh(mat));
    const ankle = mk('ankle' + S, knee, 0, -11.2, 0);
    const Fo = new Part(70 + side);
    Fo.rbox(8.2, 2.6, 12.0, 0, -0.6, 1.6, FRAME, { r: 0.6 });
    Fo.rbox(7.4, 1.8, 10.0, 0, 1.2, 1.0, WHITE2, { r: 0.6 });
    Fo.rbox(8.0, 1.2, 3.0, 0, 0.6, 7.2, BLUE, { r: 0.4 });
    for (let i = 0; i < 6; i++) Fo.box(8.4, 0.5, 1.0, 0, -2.0, -3.4 + i * 1.9, DARK);
    Fo.cyl(1.8, 1.8, 6.2, 0, 1.0, 0, STEEL, { rz: Math.PI / 2 });
    ankle.add(Fo.mesh(mat));
  }
  leg(1); leg(-1);

  function pose(p) {
    pelvis.position.set(p.px ?? 0, 21 + (p.drop ?? 0), p.pz ?? 0);
    pelvis.rotation.set(p.pelvisPitch ?? 0, p.pelvisYaw ?? 0, p.pelvisRoll ?? 0);
    waist.rotation.set(p.waistPitch ?? 0, p.waistYaw ?? 0, 0);
    torso.rotation.set(p.torsoPitch ?? 0.05, p.torsoYaw ?? 0, p.torsoRoll ?? 0);
    head.rotation.set(p.headPitch ?? 0, p.headYaw ?? 0, 0);
    for (const [s, k] of [['L', 1], ['R', -1]]) {
      const a = p['arm' + s] || [0, 0, 0, 0];   // shoulder pitch (- = forward), shoulder out, elbow (- = bend forward), wrist
      J['shoulder' + s].rotation.set(a[0], a[4] ?? 0, a[1] * k);
      J['fore' + s].rotation.set(a[2], 0, 0);
      J['hand' + s].rotation.set(a[3], 0, 0);
      const l = p['leg' + s] || [0, 0, 0];       // hip pitch, knee, ankle, hip out
      J['hip' + s].rotation.set(l[0], 0, (l[3] ?? 0.04) * k);
      J['knee' + s].rotation.set(l[1], 0, 0);
      J['ankle' + s].rotation.set(l[2], 0, 0);
    }
  }
  pose(standPoseR());
  function lights(on) { lampMat.color.setScalar(on ? 4.5 : 0.2); beaconMat.color.setRGB(on ? 5.5 : 0.3, on ? 2.6 : 0.1, 0.3); }
  function thrust(k) { jetMat.opacity = Math.min(1, k); for (const j of jets) { j.visible = k > 0.01; j.scale.set(0.7 + 0.3 * k, 0.4 + 0.8 * k, 0.7 + 0.3 * k); } }
  group.traverse((o) => { if (o.isMesh && o.material !== jetMat) { o.castShadow = true; o.receiveShadow = true; } });
  thrust(0);
  return { group, J, pose, lights, thrust, visorMat };
}

export function standPoseR() {
  return { torsoPitch: 0.05, armL: [0.05, 0.12, -0.35, 0], armR: [0.05, 0.1, -0.4, 0], legL: [-0.1, 0.18, -0.08], legR: [0.08, 0.15, -0.23] };
}

// Punch timeline, k in [0,1] over one 4 s beat:
//   0.00-0.45 wind-up (torso twists back, fist cocked by the head)
//   0.45-0.56 strike (fast, ease-in)
//   0.56-0.62 contact hold (two frames frozen at full extension)
//   0.62-1.00 recoil back towards guard
export function punchPhase(k) {
  if (k < 0.45) return { wind: smooth(0, 0.45, k), strike: 0 };
  if (k < 0.56) { const t = (k - 0.45) / 0.11; return { wind: 1, strike: t * t }; }
  if (k < 0.62) return { wind: 1, strike: 1 };
  const t = smooth(0.62, 1.0, k);
  return { wind: 1 - t, strike: 1 - t * 0.85 };
}
export function punchPoseR(k) {
  const { wind, strike } = punchPhase(k);
  const w = wind * (1 - strike), s = strike;
  return {
    torsoPitch: 0.06 + 0.12 * s, torsoYaw: -0.45 * w + 0.42 * s, torsoRoll: 0.04 - 0.06 * s,
    waistYaw: -0.15 * w + 0.16 * s, pelvisYaw: -0.08 * w + 0.1 * s, drop: -0.6 * w - 1.6 * s, pz: 2.2 * s,
    headPitch: -0.14 * s + 0.05 * w, headYaw: 0.55 * w - 0.5 * s,
    // right arm: cocked back and up (wind) -> straight forward (strike)
    armR: [lerp(0.15, 0.55, w) - 1.5 * s, lerp(0.1, 0.42, w) - 0.32 * s, lerp(-0.4, -2.1, w) * (1 - s) - 0.06 * s, -0.25 * s, 0.25 * w],
    armL: [lerp(-0.35, -0.75, w) + 0.6 * s, 0.25 + 0.1 * s, -1.25 + 0.3 * s, 0.1],
    legL: [-0.55 * s - 0.25 * w - 0.05, 0.6 * s + 0.35 * w + 0.12, -0.15 * s, 0.08],
    legR: [0.42 * s + 0.12 * w + 0.05, 0.3 + 0.1 * w, -0.45 * s - 0.1, 0.06],
  };
}
// battered, standing guard after the fight (arm hanging, slight list)
export function afterPoseR() {
  return { torsoPitch: 0.16, torsoRoll: -0.05, headPitch: 0.18, armL: [0.2, 0.2, -0.6, 0], armR: [0.0, 0.08, -0.2, 0], legL: [-0.1, 0.25, -0.12], legR: [0.15, 0.3, -0.42], drop: -0.6 };
}
