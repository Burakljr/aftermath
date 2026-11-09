// Per-district runtime visuals (W4): fire / smoke levels from state (with fire-out steam bursts),
// windows power + lights wave on clean, ground dust level, highlight layers (select / pulse / accept and
// the scene-driven spread warning), and upkeep dressing (teal banners per Bakım kademesi).
import * as THREE from 'three';
import { Builder } from './util.js';
import { DISTRICTS } from './layout.js';
import { cityUniforms } from './materials.js';
import { fxUniforms } from './fx.js';

const LAYER_COL = {
  select: new THREE.Color(1.0, 0.76, 0.1),
  pulse: new THREE.Color(1.0, 0.48, 0.08),
  accept: new THREE.Color(0.3, 0.95, 0.85),
  spread: new THREE.Color(1.0, 0.12, 0.06),
};

export function createDistricts(scene, { fx, rubble, traffic }) {
  const st = Array.from({ length: 6 }, (_, i) => ({
    i, lvl: 0, lvlTarget: 0, prevFire: 0, fireOn: false, smokeStop: 1e6, smokeOp: 0, dark: 0.78,
    power: 0, powerTarget: 0, dust: 0, dustTarget: 0, waveT: -1, waveDelay: 0, boost: 0,
    hi: { select: 0, pulse: 0, accept: 0, spread: 0 }, upkeep: 0,
  }));
  // ---------------------------------------------------------------- highlight overlay (one mesh, 6 cells)
  const pos = [], loc = [], did = [];
  for (let d = 0; d < 6; d++) {
    const D = DISTRICTS[d];
    const hx = (D.x1 - D.x0) / 2 + 9, hz = (D.z1 - D.z0) / 2 + 9;
    for (const [x, z] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, -hz], [hx, hz], [-hx, hz]]) { pos.push(D.cx + x, 0.45, D.cz + z); loc.push(x, z); did.push(d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aLoc', new THREE.Float32BufferAttribute(loc, 2));
  g.setAttribute('aD', new THREE.Float32BufferAttribute(did, 1));
  const hiU = { uFill: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uLine: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) } };
  const overlay = new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: hiU,
    vertexShader: `attribute vec2 aLoc; attribute float aD; uniform vec4 uFill[6]; uniform vec4 uLine[6]; varying vec2 vL; varying vec4 vF; varying vec4 vLn;
      void main(){ vL = aLoc; int i = int(aD + 0.5); vF = uFill[i]; vLn = uLine[i]; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vL; varying vec4 vF; varying vec4 vLn;
      void main(){
        if (vF.w <= 0.0 && vLn.w <= 0.0) discard;
        vec2 hs = vec2(${((DISTRICTS[0].x1 - DISTRICTS[0].x0) / 2 + 4).toFixed(1)}, ${((DISTRICTS[0].z1 - DISTRICTS[0].z0) / 2 + 4).toFixed(1)});
        vec2 q = abs(vL) - hs;
        float inside = step(max(q.x, q.y), 0.0);
        float band = step(abs(max(q.x, q.y)), 1.5);
        vec2 cq = abs(vL) - (hs - vec2(16.0));
        float corner = band * step(0.0, cq.x) * step(0.0, cq.y);
        float edge = band * 0.35;
        float fw = fwidth(vL.x);
        float a = inside * vF.w * 0.11 + max(corner, edge) * vLn.w;
        vec3 col = mix(vF.rgb, vLn.rgb, max(corner, edge)) * (1.0 + corner * 2.0);
        gl_FragColor = vec4(col, a);
      }`,
  }));
  overlay.renderOrder = 3; overlay.frustumCulled = false; overlay.name = 'highlights';
  scene.add(overlay);

  // ---------------------------------------------------------------- upkeep dressing (teal banners)
  const bannerG = (() => {
    const B = new Builder(9);
    B.cyl(0.12, 0.14, 7, 0, 3.5, 0, 0x3a3e42, { seg: 5 });
    B.box(0.1, 3.4, 2.2, 0, 5.0, 1.15, 0x18a898, { jitter: 0 });
    B.box(0.12, 0.5, 2.2, 0, 3.2, 1.15, 0xf5b400, { jitter: 0 });
    B.cyl(0.9, 1.0, 0.8, 0, 0.4, 0, 0x8a7a6a, { seg: 8 });
    B.box(1.4, 0.5, 1.4, 0, 1.0, 0, 0x3f6a2c, { jitter: 0.2 });
    return B.build();
  })();
  const PER = 12;
  const banners = new THREE.InstancedMesh(bannerG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), 6 * PER);
  banners.frustumCulled = false; banners.name = 'upkeep';
  const _m = new THREE.Matrix4(), _zero = new THREE.Matrix4().makeScale(0, 0, 0), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(2.2, 2.2, 2.2), _e = new THREE.Euler();
  const bannerSpots = DISTRICTS.map((D) => {
    const out = [];
    const xs = [D.x0 + 3, D.cx - 18, D.cx + 18, D.x1 - 3], zs = [D.z0 + 3, D.z1 - 3];
    for (const z of zs) for (const x of xs) out.push([x, z]);
    out.push([D.x0 + 3, D.cz - 20], [D.x1 - 3, D.cz - 20], [D.x0 + 3, D.cz + 20], [D.x1 - 3, D.cz + 20]);
    return out;
  });
  for (let i = 0; i < 6 * PER; i++) banners.setMatrixAt(i, _zero);
  scene.add(banners);
  function setUpkeep(d, tier) {
    const n = Math.min(PER, tier * 3);
    for (let k = 0; k < PER; k++) {
      if (k < n) { const [x, z] = bannerSpots[d][k]; _q.setFromEuler(_e.set(0, (x < DISTRICTS[d].cx ? -1 : 1) * 0.6, 0)); _p.set(x, 0.2, z); _m.compose(_p, _q, _s); banners.setMatrixAt(d * PER + k, _m); }
      else banners.setMatrixAt(d * PER + k, _zero);
    }
    banners.instanceMatrix.needsUpdate = true;
  }

  // highlights API: independent layers
  const layers = { select: new Set(), pulse: new Set(), accept: new Set() };
  function setHighlight(ids, kind = 'select') {
    if (!layers[kind]) return;
    layers[kind].clear();
    if (ids === null || ids === undefined) return;
    for (const id of Array.isArray(ids) ? ids : [ids]) if (id >= 0 && id < 6) layers[kind].add(id);
  }
  const fill = new THREE.Color(), line = new THREE.Color();
  const acc = { fa: 0, la: 0 };
  const add = (col, f, l) => { fill.r += col.r * f; fill.g += col.g * f; fill.b += col.b * f; line.r += col.r * l; line.g += col.g * l; line.b += col.b * l; acc.fa += f; acc.la += l; };

  const api = {
    st, overlay, setHighlight, layers,
    selected: () => (layers.select.size ? [...layers.select][0] : null),
    // juice: windows light up bottom-to-top over 0.8 s, power returns
    lightsWave(d, delay = 0) { if (delay > 0) { st[d].waveDelay = delay; st[d].waveT = -1; } else st[d].waveT = 0; st[d].powerTarget = 0; },
    setPower(d, cut) { st[d].powerTarget = cut ? 0.85 : 0; },
    setDust(d, v, instant = false) { st[d].dustTarget = v; if (instant) st[d].dust = v; },
    setFireOn(d, on) { st[d].fireOn = on; if (!on) { st[d].lvl = 0; st[d].lvlTarget = 0; fxUniforms.uLvl.value[d] = 0; fxUniforms.uSmk.value[d].x = 0; } },
    // state sync (sectors[]) - juice=false snaps (prime)
    sync(sectors, dt, now, { juice = true, upkeepOn = false } = {}) {
      for (let d = 0; d < 6; d++) {
        const s = st[d], sec = sectors ? sectors[d] : null;
        // fire
        const f = sec ? sec.fire : 0, f0 = sec ? Math.max(sec.fire0 || 0, sec.fire || 0) : 0;
        s.lvlTarget = s.fireOn && f0 > 0 ? f / f0 : 0;
        if (!juice) s.lvl = s.lvlTarget;
        else if (s.lvlTarget < s.lvl) s.lvl = Math.max(s.lvlTarget, s.lvl - dt * (s.lvlTarget === 0 ? 4 : 1.5));
        else s.lvl = Math.min(s.lvlTarget, s.lvl + dt * 1.5);
        fxUniforms.uLvl.value[d] = s.lvl;
        const S = fxUniforms.uSmk.value[d];
        if (s.fireOn && f > 0) {
          if (s.smokeStop < 1e5) s.smokeStop = 1e6;
          // polish W2: the column thins with the fire (a quarter-strength fire smokes about 45 %)
          const opT = 0.25 + 0.75 * s.lvl;
          s.smokeOp = juice ? (s.smokeOp < opT ? Math.min(opT, s.smokeOp + dt * 0.6) : Math.max(opT, s.smokeOp - dt * 0.8)) : opT;
          const darkT = s.lvlTarget >= 0.25 ? 0.8 : 0.0;
          s.dark = juice ? s.dark + (darkT - s.dark) * Math.min(1, dt * 1.5) : darkT;
        } else if (s.prevFire > 0 && f <= 0) {
          // fire out: steam burst, flames gone in 250 ms, the column stops (rising puffs finish)
          s.smokeStop = now; s.dark = 0;
          if (juice && s.fireOn) { const sp = fx.spots(d); for (const p of sp) fx.steam(p.x, p.y + 1, p.z, 8, { size: 8 * p.s, life: 1.4 }); }
        } else if (!s.fireOn || f <= 0) s.smokeOp = juice ? Math.max(0, s.smokeOp - dt * 0.45) : 0; // the leftover column clears in about 2 s
        s.prevFire = s.fireOn ? f : 0;
        S.x = s.smokeOp; S.y = s.dark; S.z = Math.min(1, s.lvl * 1.4); S.w = s.smokeStop;
        // power / windows wave / dust
        s.power = juice ? s.power + (s.powerTarget - s.power) * Math.min(1, dt * 2.5) : s.powerTarget;
        let waveY = 0, boost = 0;
        if (s.waveDelay > 0) { s.waveDelay -= dt; if (s.waveDelay <= 0) { s.waveDelay = 0; s.waveT = 0; } }
        if (s.waveT >= 0) {
          s.waveT += dt;
          waveY = Math.min(1, s.waveT / 0.8) * 46;
          boost = s.waveT < 0.8 ? 1 : Math.max(0, 1 - (s.waveT - 0.8) / 2.0);
          if (s.waveT > 2.8) s.waveT = -1;
        }
        s.dust = juice ? s.dust + (s.dustTarget - s.dust) * Math.min(1, dt * 1.5) : s.dustTarget;
        cityUniforms.uDis.value[d].set(waveY, boost, s.power, s.dust);
        // upkeep
        const tier = upkeepOn && sec ? sec.upkeep | 0 : 0;
        if (tier !== s.upkeep) { s.upkeep = tier; setUpkeep(d, tier); }
        // spread warning (scene-driven red 2 Hz)
        s.hi.spread = 0;
      }
      if (sectors) for (let d = 0; d < 6; d++) { const w = sectors[d] && sectors[d].warnTo; if (w !== null && w !== undefined && w >= 0 && sectors[d].warnT > 0) st[w].hi.spread = 1; }
      // highlight colours
      const pulse1 = 0.55 + 0.45 * Math.sin(now * Math.PI * 2);
      const pulse2 = 0.5 + 0.5 * Math.sin(now * Math.PI * 4);
      for (let d = 0; d < 6; d++) {
        const s = st[d];
        fill.setRGB(0, 0, 0); line.setRGB(0, 0, 0);
        acc.fa = 0; acc.la = 0;
        if (layers.accept.has(d)) add(LAYER_COL.accept, 0.6, 0.55);
        if (layers.pulse.has(d)) add(LAYER_COL.pulse, 0.7 * pulse1, 1.0 * pulse1);
        if (layers.select.has(d)) add(LAYER_COL.select, 0.8, 1.0);
        if (s.hi.spread) add(LAYER_COL.spread, 0.9 * pulse2, 1.0 * pulse2);
        const fa = acc.fa, la = acc.la;
        if (fa > 0) fill.multiplyScalar(1 / fa);
        if (la > 0) line.multiplyScalar(1 / la);
        hiU.uFill.value[d].set(fill.r, fill.g, fill.b, Math.min(1, fa));
        hiU.uLine.value[d].set(line.r, line.g, line.b, Math.min(1, la));
        cityUniforms.uHi.value[d].set(line.r, line.g, line.b, Math.min(1, la) * 0.9);
      }
    },
  };
  void rubble; void traffic;
  return api;
}
