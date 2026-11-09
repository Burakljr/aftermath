// Attack cinematic director (A4). Everything is a function of state.attack.t (logic owns the clock), so a
// skip, a reload or a deterministic __setTime frame always shows the right picture.
//   t < 2.0  TV shot down the Kordon promenade (camera low over the water, sun behind it): Magmadon wades
//            ashore, KALKAN-07 lands on lift-jets at 0.9, wind-up 1.0-1.45, strike, a 2-frame contact hold
//            at 1.58-1.66 (shockwave dust ring, glass shards from the waterfront, camera kick), head snap,
//            stagger, roar at 1.85. 3/4 front framing: visor, fist and the monster's face all read.
//   2.0      cut to the gameplay camera framing the chain (attack:cut). Magmadon stands on the chain axis and
//            topples onto its side (2.0-2.6) into exactly the corpse pose; at 2.6 (= BAL.attackHit, logic's
//            'hit') the baked corpse takes over; scene-world swaps damage, rings, shakes, ignites fires.
//   2.6-end  settle: slow dolly out to the exact gameplay framing; the camera is handed back at `end`.
// First attack: t runs from -2.4 (about 6.2 s). Later attacks start at 0 (3.6 s).
import * as THREE from 'three';
import { standPose, corpsePose } from './magmadon.js';
import { createRobot, punchPoseR, afterPoseR, standPoseR, shovePoseR, mixPoseR, newPoseR, setLeg, setArm } from './robot.js';
import { smooth, lerp, noise2 } from '../util.js';

// polish round: `settle` = the impact settle frame (carcass + fires + KALKAN-07 standing back), `out` = the camera
// starts easing to the gameplay framing (it arrives at attack.end)
export const TL = { land: 0.9, wind: 1.0, strike: 1.45, contact: 1.58, release: 1.64, roar: 1.85, cut: 2.0, hit: 2.6, settle: 2.72, out: 3.2 };
// hit-stop on the punch contact frame (visual only: logic's clock and audio cues are untouched)
export const HITSTOP = 0.07;
const ptime = (t) => (t < TL.contact ? t : t < TL.contact + HITSTOP ? TL.contact : t - HITSTOP);
const MON_DIR = new THREE.Vector3(-0.78, 0, -0.62).normalize();
const ROB_DIR = new THREE.Vector3(-0.62, 0, 0.78).normalize();
const QUAY = -186, SEA_Y = -1.1;
const ROLL = 1.3;
const ROB_RATIO = 0.72;          // KALKAN-07 height / Magmadon height in the fight (review F11: 60-75 %)

export function createAttack(world, { corpse }) {
  const model = corpse.model;
  // KALKAN-07 shares Magmadon's cinematic key / rim uniforms (one place drives both)
  const robot = createRobot({ uKeyCol: model.U.uKeyCol, uKeyDir: model.U.uKeyDir, uRimCol: model.U.uRimCol });
  robot.group.visible = false;
  world.scene.add(robot.group);
  const shards = createShards(world);
  const shock = createShockRing(world);
  const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _tgt = new THREE.Vector3(), _com = new THREE.Vector3(), _k = new THREE.Vector3();
  const _gp = new THREE.Vector3(), _gt = new THREE.Vector3();
  const RP = newPoseR(), RP2 = newPoseR(), RP3 = newPoseR();
  let setupKey = '', F = null;           // fight geometry for the current attack
  let owning = false, framedChain = false, lastT = -99, lastKey = '';
  let preview = null;
  const pose = { visible: false };

  // ---------------------------------------------------------------- fight geometry (cached per attack)
  function setup(a, fit) {
    const S = fit.ky * fit.s;
    const P = new THREE.Vector3(-92, 0, QUAY + 4);
    // monster at the contact moment, at the origin, to find its face
    model.group.position.set(0, 0, 0); model.group.rotation.set(0, Math.atan2(MON_DIR.x, MON_DIR.z), 0); model.group.scale.setScalar(S);
    model.root.position.set(0, 0, 0); model.root.rotation.set(0, 0, 0);
    // exactly the pose apply() shows at the contact frame, so the fist lands on the face (review V3: it missed by ~80 px)
    const tc = TL.contact;
    model.setPose(standPose(1.3 + 0.9 * 2.4 + (tc - 0.9) * 0.3, { lunge: smooth(0.8, 1.4, tc) * 0.5, roar: 0, snap: 0, stagger: 0, breath: Math.sin(tc * 1.6) }));
    const mouth = model.worldPoint('mouth').clone(), headP = model.worldPoint('head').clone();
    const monTop = model.worldPoint('shellTop').y + 3.5 * S;
    // robot: ROB_RATIO of the monster's height above the water (review F11: it read as a third of the monster),
    // the fist meets the face at whatever height that gives (between the jaw and the brow)
    robot.group.position.set(0, 0, 0); robot.group.rotation.set(0, Math.atan2(ROB_DIR.x, ROB_DIR.z), 0); robot.group.scale.setScalar(1);
    robot.pose(punchPoseR(0.6, RP)); robot.group.updateMatrixWorld(true);
    const fist1 = robot.J.handR.localToWorld(robot.fistLocal.clone());
    let RS = Math.max(0.3, Math.min(2.2, ROB_RATIO * (monTop - SEA_Y) / (robot.height - 3)));
    const sink = (rs) => SEA_Y - 3.0 * rs;          // shin-deep in the shallows
    let k = (fist1.y * RS + sink(RS) - mouth.y) / Math.max(1, headP.y - mouth.y);
    const kc = Math.max(-0.2, Math.min(1.15, k));
    const face = mouth.clone().lerp(headP, kc);
    if (kc !== k) RS = Math.max(0.3, Math.min(2.2, (face.y - SEA_Y) / (fist1.y - 3.0)));
    P.y = face.y;
    const M = new THREE.Vector3(P.x - face.x + MON_DIR.x * 3 * S, 0, P.z - face.z + MON_DIR.z * 3 * S);
    const toMon = new THREE.Vector3(M.x - P.x, 0, M.z - P.z).normalize();
    const R = new THREE.Vector3(P.x - fist1.x * RS + toMon.x * 1.5 * RS, 0, P.z - fist1.z * RS + toMon.z * 1.5 * RS);
    // waterfront facades behind the monster: glass shard origins
    const shardO = new THREE.Vector3(P.x + 30 * S, 0, -160);
    // TV camera: low, over the water west of the fight, looking east along the promenade; low 3/4 front framing
    const cam = new THREE.Vector3(P.x - 128 * S, 17 * S + 4, QUAY - 22 * S);
    const camT = new THREE.Vector3(P.x + 4 * S, 27 * S, P.z - 5 * S);
    // warm key from the camera side, high (the sunset is behind the fighters; without it both read as black shapes)
    const keyTV = new THREE.Vector3().subVectors(cam, P).setY(0).normalize().multiplyScalar(0.8).add(new THREE.Vector3(0.25, 0.75, 0.2)).normalize();
    // ---- the chain (cut .. end): KALKAN-07 followed the staggering monster and shoves it over; it stands on the side
    // the body rolls away from (the camera side), then steps back and turns toward the camera for the settle frame
    const pl = corpse.placementOf(a);
    const fs = fit.side || 1;
    const d = new THREE.Vector3(pl.dir.x, 0, pl.dir.z), l = new THREE.Vector3(fs * pl.dir.z, 0, -fs * pl.dir.x);
    const centre = new THREE.Vector3(pl.nose.x - d.x * pl.length * 0.5, 0, pl.nose.z - d.z * pl.length * 0.5);
    // KALKAN-07 stands on the camera side level with the head (it shoved the staggering monster over), so the settle
    // frame is the hero shot: the robot in the foreground on one side, the head, tusks and the fires on the other,
    // the body receding behind them (the portrait band is narrow: the body is seen from its head end, foreshortened)
    const CR = new THREE.Vector3(pl.nose.x + d.x * 6 * S + l.x * 40 * S, 0, pl.nose.z + d.z * 6 * S + l.z * 40 * S);
    CR.y = world.groundY(CR.x, CR.z);
    const back = new THREE.Vector3().copy(l).multiplyScalar(5 * RS).addScaledVector(d, 2 * RS);
    // camera direction on the chain: from the head end, turned toward the robot's side
    const camDir = (th, out) => out.copy(d).multiplyScalar(Math.cos(th)).addScaledVector(l, Math.sin(th)).normalize();
    const dirTop = camDir(0.42, new THREE.Vector3()), dirSet = camDir(0.5, new THREE.Vector3());
    const head = new THREE.Vector3(pl.nose.x - d.x * 0.2 * pl.length, 0, pl.nose.z - d.z * 0.2 * pl.length);
    // facing: at the shove toward the monster's flank, at the settle 3/4 toward the lens
    const yawShove = Math.atan2(-l.x, -l.z);
    const faceSet = new THREE.Vector3().copy(dirSet).multiplyScalar(0.7).addScaledVector(l, -0.55).normalize();
    const yawSet = Math.atan2(faceSet.x, faceSet.z);
    const keyChain = new THREE.Vector3().copy(dirSet).multiplyScalar(0.7).add(new THREE.Vector3(0, 0.75, 0)).normalize();
    const D = 215 * S + 0.25 * pl.length;
    F = { S, RS, P, M, R, cam, camT, shardO, keyTV, wadeFrom: new THREE.Vector3(M.x - 20 * S, 0, M.z - 105 * S),
      sinkY: sink(RS), pl, d, l, centre, head, CR, back, dirTop, dirSet, yawShove, yawSet, keyChain, D, len: pl.length, wid: pl.width };
  }

  // ---------------------------------------------------------------- pose = f(attack, t) (fills `out`)
  function poseInto(a, t, fit, out) {
    out.t = t; out.visible = !!a && t < a.end + 0.01;
    if (!out.visible) return out;
    const hit = TL.hit;
    out.tv = t < TL.cut;
    const pt = ptime(t);                // frozen for HITSTOP on the contact frame
    // monster
    out.monVisible = t < hit;
    if (out.tv) {
      const wadeK = smooth(-2.4, 0.75, pt);
      out.mx = lerp(F.wadeFrom.x, F.M.x, wadeK); out.mz = lerp(F.wadeFrom.z, F.M.z, wadeK);
      out.my = -16 * F.S * (1 - smooth(-1.2, 0.7, pt));
      const shoreYaw = Math.atan2(F.M.x - F.wadeFrom.x, F.M.z - F.wadeFrom.z);
      out.myaw = lerpAngle(shoreYaw, Math.atan2(MON_DIR.x, MON_DIR.z), smooth(0.3, 1.2, pt));
      const since = pt - TL.contact;
      out.snap = since > 0 ? Math.min(1, since / 0.06) * Math.exp(-Math.max(0, since - 0.06) * 1.8) : 0;
      out.stag = since > 0 ? smooth(0.02, 0.3, since) : 0;
      out.lunge = smooth(0.8, 1.4, pt) * 0.5;
      out.roar = since > 0 ? smooth(TL.roar - 0.1, TL.roar + 0.05, pt) * 0.9 : smooth(-0.2, 0.6, pt) * 0.4 * (1 - smooth(1.2, 1.5, pt));
      out.walk = 1.3 + Math.min(pt, 0.9) * 2.4 + Math.max(0, pt - 0.9) * 0.3;
      out.mx += (F.M.x - F.R.x) * 0.06 * out.stag; out.mz += (F.M.z - F.R.z) * 0.06 * out.stag;
      out.topple = 0;
    } else {
      // on the chain axis, toppling onto its side into the corpse pose
      const k = Math.pow(smooth(TL.cut, hit, t), 1.6);
      out.topple = k;
      out.snap = 0.4 * (1 - k); out.stag = 1 - k * 0.6; out.lunge = 0; out.roar = 0.6; out.walk = 2.3;
    }
    // robot
    out.robVisible = !out.tv || t > 0.1;
    if (out.tv) {
      const land = smooth(0.15, TL.land, t);
      out.ry = F.sinkY + 110 * F.RS * Math.pow(1 - land, 2.2);
      out.thrust = t < TL.land ? smooth(-0.2, 0.3, t) : Math.max(0, 1 - (t - TL.land) / 0.35);
      out.rx = F.R.x; out.rz = F.R.z; out.ryaw = Math.atan2(ROB_DIR.x, ROB_DIR.z);
      out.punch = pt < TL.wind ? 0 : pt < TL.strike ? 0.45 * smooth(TL.wind, TL.strike, pt) : pt < TL.contact ? 0.45 + 0.15 * Math.pow((pt - TL.strike) / (TL.contact - TL.strike), 2) : pt < TL.release ? 0.6 + 0.02 * (pt - TL.contact) / (TL.release - TL.contact) : Math.min(1, 0.62 + 0.38 * (pt - TL.release) / 0.6);
      out.crouch = t > TL.land - 0.05 ? Math.exp(-Math.max(0, t - TL.land) * 7) * smooth(TL.land - 0.05, TL.land, t) : 0;
      out.shove = -1; out.after = 0;
    } else {
      // on the chain: the shove (cut), recovery (to the hit), step back and turn to the camera (settle), lift-off (end)
      const st = smooth(hit, TL.settle + 0.25, t);
      out.rx = F.CR.x + F.back.x * st; out.rz = F.CR.z + F.back.z * st;
      out.ryaw = lerpAngle(F.yawShove, F.yawSet, smooth(hit + 0.05, TL.settle + 0.35, t));
      out.punch = -1; out.crouch = 0;
      out.shove = smooth(TL.cut + 0.06, hit, t);
      out.after = smooth(hit, TL.settle + 0.2, t);
      const lift = smooth(a.end - 0.75, a.end, t);
      out.ry = F.CR.y + lift * 70 * F.RS; out.thrust = smooth(a.end - 1.0, a.end - 0.75, t);
    }
    return out;
  }

  // ---------------------------------------------------------------- apply a pose to the models + camera
  const _sc = new THREE.Vector3();
  function apply(a, t, fit) {
    poseInto(a, t, fit, pose);
    const mutant = !!a.mutant;
    if (!pose.visible) { hide(); return; }
    // ---- cinematic light (shared uniforms): warm key from the camera side + rim, so neither fighter is a black shape
    const U = model.U;
    if (pose.tv) { U.uKeyDir.value.copy(F.keyTV); U.uKeyCol.value.setRGB(0.5, 0.36, 0.26); U.uRimCol.value.setRGB(0.26, 0.2, 0.36); }
    else { U.uKeyDir.value.copy(F.keyChain); U.uKeyCol.value.setRGB(0.62, 0.4, 0.24); U.uRimCol.value.setRGB(0.16, 0.22, 0.38); }
    U.uSkyCol.value.setRGB(0.06, 0.065, 0.08);
    // ---- monster
    model.group.visible = pose.monVisible;
    if (pose.monVisible) {
      model.setHeat(true, 1, mutant);
      model.U.uTime.value = t;
      if (pose.tv) {
        model.group.position.set(pose.mx, pose.my, pose.mz);
        model.group.rotation.set(0, pose.myaw, 0);
        model.group.scale.setScalar(F.S);
        model.root.position.set(0, 0, 0); model.root.rotation.set(0, 0, 0);
        model.setPose(standPose(pose.walk, { lunge: pose.lunge, roar: pose.roar, snap: pose.snap, stagger: pose.stag, breath: Math.sin(ptime(t) * 1.6) }));
      } else {
        const k = pose.topple, side = fit.side;
        // scale: uniform alive scale -> the corpse's (kw, ky, 1) * s
        _sc.set(lerp(F.S, fit.kw * fit.s, k), lerp(F.S, fit.ky * fit.s, k), lerp(F.S, fit.s, k));
        model.group.scale.copy(_sc);
        model.group.rotation.set(0, fit.yaw, 0);
        // standing on the axis, ending exactly where the baked corpse lies
        const xs = -corpse.bakeXC() * fit.kw * fit.s * side;
        const ox = fit.pos.x - fit.lx.x * xs * (1 - k), oz = fit.pos.z - fit.lx.z * xs * (1 - k);
        model.group.position.set(ox, lerp(0, fit.pos.y, k), oz);
        const st = standPose(2.3 + (t - TL.cut) * 2, { snap: pose.snap, stagger: pose.stag, roar: pose.roar });
        const cp = side > 0 ? (CP_POS || (CP_POS = corpsePose({ roll: ROLL, side: 1, neck: [0.6, 0, 0], head: [0.45, 0, -0.2], jaw: 0.66 })))
          : (CP_NEG || (CP_NEG = corpsePose({ roll: ROLL, side: -1, neck: [0.6, 0, 0], head: [0.45, 0, -0.2], jaw: 0.66 })));
        model.setPose(mixPose(st, cp, k, MIX));
        model.root.rotation.set(0, 0, side * ROLL * k);
        model.root.position.set(0, corpse.bakeLift() * k, 0);
      }
    }
    // ---- robot
    robot.group.visible = pose.robVisible;
    if (pose.robVisible) {
      robot.group.scale.setScalar(F.RS);
      robot.group.position.set(pose.rx, pose.ry, pose.rz);
      robot.group.rotation.set(0, pose.ryaw, 0);
      const p = RP;
      if (pose.tv) {
        if (pose.punch > 0) punchPoseR(pose.punch, p); else standPoseR(p);
        if (pose.crouch > 0) { p.drop -= 3.5 * pose.crouch; setLeg(p.legL, -0.5 * pose.crouch - 0.1, 1.0 * pose.crouch + 0.18, -0.4 * pose.crouch); setLeg(p.legR, -0.4 * pose.crouch + 0.08, 0.9 * pose.crouch + 0.15, -0.45 * pose.crouch); }
      } else {
        shovePoseR(pose.shove, RP2);
        if (pose.after > 0) { afterPoseR(RP3); mixPoseR(RP2, RP3, pose.after, p); } else mixPoseR(RP2, RP2, 0, p);
      }
      if (pose.ry - (pose.tv ? F.sinkY : F.CR.y) > 1) { setLeg(p.legL, 0.25, 0.5, 0.2); setLeg(p.legR, -0.1, 0.35, 0.1); setArm(p.armL, -0.3, 0.5, -0.6, 0); setArm(p.armR, -0.2, 0.5, -0.5, 0); }
      robot.pose(p);
      robot.thrust(pose.thrust);
      robot.lights(true, t);
    }
    // ---- shock ring at the fist (after the hit-stop)
    shock.update(t - TL.contact - HITSTOP, F.P, F.S, world.camera);
  }
  function hide() { model.group.visible = false; robot.group.visible = false; robot.thrust(0); shock.off(); }

  // ---------------------------------------------------------------- camera
  function camFn(camera, t, rig) {
    const a = curA;
    if (!a) return;
    const at = curT;
    if (at < TL.cut) {
      const pt = ptime(at);
      const push = smooth(-2.4, TL.cut, pt);
      _v.copy(F.cam).lerp(F.camT, 0.06 * push);
      _v.x += (noise2(pt * 0.9, 1.7) - 0.5) * 1.6 * F.S; _v.y += (noise2(pt * 0.8, 5.1) - 0.5) * 1.0 * F.S;
      // first attack intro: follow the monster wading in, then settle on the fight
      const follow = 1 - smooth(-0.8, 0.7, pt);
      _tgt.copy(F.camT);
      if (follow > 0) { _tgt.x += (pose.mx - F.camT.x) * 0.55 * follow; _tgt.z += (pose.mz - F.camT.z) * 0.8 * follow; _tgt.y += (16 * F.S - F.camT.y) * 0.5 * follow; }
      _tgt.y += (noise2(pt * 0.7, 9.3) - 0.5) * 1.2 * F.S;
      // the camera tilts up a little to follow the robot down
      if (pt < TL.land) _tgt.y += 12 * F.S * (1 - smooth(-0.4, TL.land, pt));
      camera.position.copy(_v); camera.up.set(0, 1, 0); camera.lookAt(_tgt);
      return;
    }
    // chain: topple (cut .. hit) in a low 3/4 from the head end with KALKAN-07 on the near side, then the settle frame,
    // then an ease into the exact gameplay framing (arrives at attack.end, where the camera is handed back)
    const D = F.D;
    if (at < TL.hit) {
      const k = smooth(TL.cut, TL.hit, at);
      const Dk = D * (1.06 - 0.06 * k);
      model.worldPoint('shellTop', _w);
      _com.set((_w.x + model.group.position.x) * 0.5, Math.max(4 * F.S, _w.y * 0.45), (_w.z + model.group.position.z) * 0.5);
      // KALKAN-07 (near side) and the toppling body share the frame
      _tgt.copy(_com).lerp(_k.set(pose.rx, pose.ry + 16 * F.RS, pose.rz), 0.42);
      camera.position.set(_tgt.x + F.dirTop.x * Dk * 0.88, Dk * 0.48 + 4 * F.S, _tgt.z + F.dirTop.z * Dk * 0.88);
      camera.up.set(0, 1, 0); camera.lookAt(_tgt);
      return;
    }
    // settle frame: KALKAN-07 standing back on one side, the head, tusks and fires on the other; a slow push-in
    const ks = smooth(TL.hit, TL.settle + 0.3, at);
    const Ds = D * (1.0 - 0.04 * smooth(TL.hit, TL.out, at));
    _com.set(F.head.x, 6 * F.S, F.head.z);
    _tgt.copy(_com).lerp(_k.set(pose.rx, pose.ry + 16 * F.RS, pose.rz), 0.42);
    _w.copy(F.dirTop).lerp(F.dirSet, ks).normalize();
    _v.set(_tgt.x + _w.x * Ds * 0.86, Ds * 0.52 + 4 * F.S, _tgt.z + _w.z * Ds * 0.86);
    const e = smooth(TL.out, a.end, at);
    if (e > 0) {
      _gp.copy(rig.target).addScaledVector(rig.fwd, -rig.dist);
      _v.lerp(_gp, e); _tgt.lerp(rig.target, e);
    }
    camera.position.copy(_v); camera.up.set(0, 1, 0); camera.lookAt(_tgt);
  }
  let curA = null, curT = 0, tvFov = false;
  // the promenade palms read as black sticks in front of the TV camera (review 2 F12): hidden for the TV shot only
  let palms;
  function palmsOn(on) {
    if (palms === undefined) palms = world.scene.getObjectByName('palms') || null;
    if (palms && palms.visible !== on) palms.visible = on;
  }
  function own(a, t) {
    curA = a; curT = t;
    palmsOn(t >= TL.cut);
    if (!owning) { world.cam.override(camFn); owning = true; tvFov = false; }
    if (t < TL.cut && !tvFov) { world.cam.setVisFov(34); tvFov = true; framedChain = false; }
    if (t >= TL.cut && !framedChain) { world.cam.setVisFov(26); world.cam.frame('chain', { instant: true }); framedChain = true; tvFov = false; }
  }
  function release() { if (owning) { world.cam.override(null); owning = false; } curA = null; framedChain = false; tvFov = false; palmsOn(true); }

  // ---------------------------------------------------------------- one-shot juice on time crossings
  function juice(a, t0, t1) {
    const cross = (T) => t0 < T && t1 >= T;
    if (cross(TL.land)) {
      // a few short-lived puffs at the feet, not a haze slab over the lower third (review 2 F12)
      world.fx.dust(F.R.x, 1, F.R.z, 6, { size: 4 + 7 * F.RS, spread: 12, rise: 2, life: 1.6 });
      world.fx.steam(F.R.x, 1, F.R.z, 4, { size: 6 * F.RS, spread: 8, life: 1.2 });
      world.cam.shake(0.35);
    }
    if (cross(TL.contact)) {
      // the contact frame (frozen for HITSTOP): a small hot flash and sparks at the fist, no bloom ball (review 2 F2)
      world.fx.flash(F.P.x, F.P.y, F.P.z, 3.5 * F.S, 0.12);
      world.fx.sparks(F.P.x, F.P.y, F.P.z, 26, { speed: 26, size: 1.0 });
    }
    if (cross(TL.contact + HITSTOP)) {
      // release: camera kick, shockwave dust at the monster's feet, glass from the waterfront
      world.fx.ring(F.P.x, F.P.z + 6 * F.S, 55 * F.S, 12);
      world.fx.sparks(F.P.x, F.P.y, F.P.z, 12, { speed: 14, size: 0.7 });
      world.cam.shake(0.75);
      shards.burst(F.shardO, F.S, t1);
    }
    if (cross(TL.roar)) world.fx.steam(F.M.x, 20 * F.S, F.M.z, 4, { size: 10 * F.S, life: 1.6 });
    if (cross(TL.cut + 0.02)) world.fx.dust(F.CR.x, F.CR.y + 1, F.CR.z, 5, { size: 5 + 6 * F.RS, spread: 10, rise: 2, life: 1.8 });
    if (cross(TL.hit + 0.05)) world.fx.dust(F.CR.x + F.back.x, F.CR.y + 1, F.CR.z + F.back.z, 4, { size: 5 + 5 * F.RS, spread: 9, rise: 2, life: 1.6 });
    if (cross(a.end - 0.8)) world.fx.dust(F.CR.x + F.back.x, F.CR.y + 1, F.CR.z + F.back.z, 6, { size: 6 + 6 * F.RS, spread: 12, rise: 3, life: 1.8 });
  }

  // ---------------------------------------------------------------- update (game state or preview)
  let runA = null, runFit = null, runKey = '';
  function run(a, t, dt) {
    const fit = corpse.fitFor(a);
    if (!fit) return;
    if (a !== runA || fit !== runFit) { runA = a; runFit = fit; runKey = `${a.n}|${(a.chain || []).join(',')}|${a.mutant ? 1 : 0}|${fit.s.toFixed(3)}`; }
    const key = runKey;
    if (key !== setupKey) { setupKey = key; setup(a, fit); }
    if (key !== lastKey) { lastKey = key; lastT = t - 1e-3; }
    apply(a, t, fit);
    juice(a, lastT, t);
    lastT = t;
    shards.update(t);
    if (t < a.end) own(a, t); else release();
  }

  const api = {
    robot,
    update(state, t, dt) {
      if (preview) {
        preview.t += dt;
        const a = preview.a; a.t = preview.t; a.hit = a.t >= TL.hit;
        preview.emitCross(a.t);
        if (a.t >= a.end) { preview.finish(); preview = null; hide(); release(); shards.off(); return; }
        run(a, a.t, dt);
        return;
      }
      const a = state && state.attack;
      if (!a || state.phase !== 'attack') { hide(); release(); shards.off(); return; }
      run(a, a.t, dt);
    },
    event() {},
    pose(a, t) {
      if (!a) return null;
      const fit = corpse.fitFor(a);
      if (!fit) return null;
      const key = `${a.n}|${(a.chain || []).join(',')}|${a.mutant ? 1 : 0}|${fit.s.toFixed(3)}`;
      if (key !== setupKey) { setupKey = key; setup(a, fit); }
      const o = poseInto(a, t ?? a.t, fit, {});
      o.camera = o.tv ? { mode: 'tv', position: F.cam.toArray(), target: F.camT.toArray(), fov: 34 } : { mode: 'game', frame: 'chain' };
      return o;
    },
    // preview (labs, title loops): its own clock over the same pose function. desc: { chain, first, mutant, n, onEvent }
    preview(desc) {
      const first = !!desc.first;
      const chain = desc.chain && desc.chain.length ? desc.chain : [1];
      const segs = {}; chain.forEach((id, k) => { segs[id] = ['head', 'body', 'tail'][k]; });
      const a = { n: desc.n || 1, t: first ? -2.4 : 0, hit: false, first, pre: first ? 2.4 : 0, end: first ? 3.8 : 3.6, monster: 'magmadon', mutant: !!desc.mutant, chain, segments: segs, sectors: chain.slice() };
      let resolve;
      const done = new Promise((r) => { resolve = r; });
      const emit = (type, p) => { if (desc.onEvent) desc.onEvent(type, p); };
      const fired = new Set();
      const h = {
        a, t: a.t, done,
        skip() { if (h.t < TL.hit) h.t = TL.hit; else h.t = a.end; },
        emitCross(t) {
          if (!fired.has('start')) { fired.add('start'); emit('attack-start', { n: a.n, monster: a.monster, mutant: a.mutant, chain, segments: segs, sectors: a.sectors, first }); }
          if (t >= TL.cut && !fired.has('cut')) { fired.add('cut'); emit('attack:cut', {}); }
          if (t >= TL.hit && !fired.has('hit')) { fired.add('hit'); emit('hit', { chain, sectors: a.sectors }); world.cam.shake(0.85); }
          if (t >= a.end && !fired.has('end')) { fired.add('end'); emit('attack:end', {}); }
        },
        finish() { resolve(); },
      };
      preview = h;
      return h;
    },
    previewState() { return preview ? preview.a : null; },
    setQuality() {},
    particles() { return shards.count(); },
    dispose() { world.scene.remove(robot.group); shards.dispose(); shock.dispose(); release(); },
  };
  return api;
}

function lerpAngle(a, b, k) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; }
// the corpse pose is constant per side and the mixed pose is written into one reused object (no per-frame garbage)
let CP_POS = null, CP_NEG = null;
const MIX = { y: 0, pitch: 0, roll: 0, yaw: 0, breath: 0, neck: [], head: [], jaw: 0, tail: [], legs: { FL: [], FR: [], HL: [], HR: [] } };
const LEG_NAMES = ['FL', 'FR', 'HL', 'HR'];
function mixArr(a, b, k, out) { out.length = a.length; for (let i = 0; i < a.length; i++) out[i] = lerp(a[i], b[i] ?? 0, k); return out; }
function mixPose(A, B, k, out) {
  out.y = lerp(A.y ?? 0, B.y ?? 0, k); out.pitch = lerp(A.pitch ?? 0, B.pitch ?? 0, k); out.roll = lerp(A.roll ?? 0, B.roll ?? 0, k);
  out.yaw = lerp(A.yaw ?? 0, B.yaw ?? 0, k); out.breath = lerp(A.breath ?? 0, 0, k); out.jaw = lerp(A.jaw ?? 0, B.jaw ?? 0, k);
  mixArr(A.neck, B.neck, k, out.neck); mixArr(A.head, B.head, k, out.head); mixArr(A.tail, B.tail, k, out.tail);
  for (let i = 0; i < 4; i++) { const n = LEG_NAMES[i]; mixArr(A.legs[n], B.legs[n], k, out.legs[n]); }
  return out;
}

// glass shards bursting from the waterfront facades at the punch: GPU-driven (pure function of time)
function createShards(world) {
  const N = 70;
  const g = new THREE.PlaneGeometry(1, 1.4);
  const seed = new Float32Array(N * 4);
  for (let i = 0; i < N * 4; i++) seed[i] = Math.random();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  const U = { uT0: { value: 1e9 }, uNow: { value: 0 }, uO: { value: new THREE.Vector3() }, uS: { value: 1 } };
  const m = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `attribute vec4 aSeed; uniform float uT0, uNow, uS; uniform vec3 uO; varying float vA, vG;
      void main(){ float t = uNow - uT0; vA = 0.0; vG = 0.0;
        if (uT0 > 1.0e8 || t < 0.0 || t > 2.2) { gl_Position = vec4(0.0, 0.0, -2.0, 1.0); return; }
        vec3 o = uO + vec3((aSeed.x - 0.5) * 70.0 * uS, 6.0 + aSeed.y * 22.0 * uS, (aSeed.z - 0.5) * 6.0);
        vec3 v = vec3((aSeed.x - 0.5) * 30.0, 6.0 + aSeed.w * 16.0, -10.0 - aSeed.y * 24.0) * (0.7 + 0.3 * uS);
        vec3 p = o + v * t + vec3(0.0, -18.0, 0.0) * t * t;
        p.y = max(p.y, 0.3);
        float a = t * (6.0 + aSeed.w * 10.0);
        vec3 lp = position * (0.5 + aSeed.z) * 1.6 * uS;
        lp.xy = mat2(cos(a), -sin(a), sin(a), cos(a)) * lp.xy;
        lp.yz = mat2(cos(a * 0.7), -sin(a * 0.7), sin(a * 0.7), cos(a * 0.7)) * lp.yz;
        vA = (1.0 - smoothstep(1.4, 2.2, t));
        vG = 0.5 + 0.5 * sin(a * 2.0 + aSeed.x * 20.0);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p + lp, 1.0); }`,
    fragmentShader: `varying float vA, vG; void main(){ gl_FragColor = vec4(vec3(0.75, 0.92, 1.0) * (0.35 + 2.2 * vG * vG) * vA, 1.0); }`,
  });
  const mesh = new THREE.InstancedMesh(g, m, N);
  for (let i = 0; i < N; i++) mesh.setMatrixAt(i, new THREE.Matrix4());
  mesh.frustumCulled = false; mesh.renderOrder = 8; mesh.visible = false; mesh.name = 'glassShards';
  world.scene.add(mesh);
  return {
    burst(o, s, t) { U.uO.value.copy(o); U.uS.value = s; U.uT0.value = t; mesh.visible = true; },
    update(t) { U.uNow.value = t; const a = t - U.uT0.value; mesh.visible = U.uT0.value < 1e8 && a >= 0 && a < 2.2; },
    // review2 F1: outside a burst the shards are switched off outright (uT0 = -99 drew all 70 at the origin)
    off() { U.uT0.value = 1e9; mesh.visible = false; },
    count() { return mesh.visible ? N : 0; },
    dispose() { world.scene.remove(mesh); g.dispose(); m.dispose(); },
  };
}

// shock ring at the punch contact: a thin additive ring facing the camera, expanding over 0.22 s (pure function of
// the time since the hit-stop released). One draw call while it lives, invisible otherwise.
function createShockRing(world) {
  const g = new THREE.RingGeometry(0.9, 1.0, 48, 1);
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.35, 1.05), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.visible = false; mesh.frustumCulled = false; mesh.renderOrder = 9; mesh.name = 'shockRing';
  world.scene.add(mesh);
  return {
    update(dt, P, S, camera) {
      if (dt < 0 || dt > 0.22) { mesh.visible = false; return; }
      const k = dt / 0.22;
      mesh.visible = true;
      mesh.position.copy(P);
      mesh.quaternion.copy(camera.quaternion);
      mesh.scale.setScalar((3 + 15 * Math.pow(k, 0.6)) * S);
      m.opacity = 0.75 * (1 - k) * (1 - k);
    },
    off() { mesh.visible = false; },
    dispose() { world.scene.remove(mesh); g.dispose(); m.dispose(); },
  };
}
