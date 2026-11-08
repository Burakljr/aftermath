// scene-lab driver (ARCH 5.6): fake states from URL params, on-screen buttons, deterministic __setTime,
// stats overlay. Hooks: window.__setTime(t), window.lab = { state, step(dt), scene, emit(type, payload) }.
import * as THREE from 'three';
import { createScene } from '../scene.js';
import { fakeState, ATTACK } from './fake-state.js';
import { createFakeSim } from './fake-sim.js';
import actorCases from './actor-cases.js';

const Q = new URLSearchParams(location.search);
const num = (k, d = null) => (Q.has(k) ? Number(Q.get(k)) : d);
const list = (k) => (Q.get(k) ? Q.get(k).split(',').filter((x) => x !== '').map(Number) : null);
const fleetParam = () => { if (!Q.get('fleet')) return null; const o = {}; for (const p of Q.get('fleet').split(',')) { const [k, v] = p.split(':'); o[k] = Number(v); } return o; };
const opts = {
  phase: Q.get('phase') || 'calm', t: num('t'), chain: list('chain') || [1], extra: list('extra') || [], first: Q.get('first') === '1', mutant: Q.get('mutant') === '1',
  stage: Q.get('stage') || 'fire', fire: num('fire'), rubble: num('rubble'), carve: num('carve'), fleet: fleetParam(), sel: num('sel'), inv: Q.get('inv') === '1',
  job: num('job'), upkeep: num('upkeep', 0), warn: list('warn'), result: Q.get('result') === '1', seed: num('seed', 3),
};
if (Q.get('hud') === '0') document.body.classList.add('nohud');
if (Q.get('ui') === '0') document.body.classList.add('noui');
const canvas = document.getElementById('scene');
const events = [];
const scene = createScene(canvas, { quality: Q.get('q') === 'low' ? 'low' : 'high', band: { top: 96, bottom: 260 }, onEvent: (type, p) => events.push([type, p]) });
let state = fakeState(opts);
const sim = createFakeSim((type, payload) => { events.push([type, payload]); scene.event(type, payload); });
let live = Q.get('live') === '1';
let sel = opts.sel;
const errors = [];
let ghost = null, ghostKey = '';
addEventListener('error', (e) => errors.push(String(e.message)));

function emit(type, payload) { events.push([type, payload]); scene.event(type, payload); }
function setState(s, { juice = true } = {}) {
  state = s; window.lab.state = s;
  if (!juice) return scene.prime(s);
  scene.update(s, 0);
  return Promise.resolve();
}
function applyFraming(instant = true) {
  if (sel !== null && sel !== undefined) scene.setHighlight(sel, 'select'); else scene.setHighlight(null, 'select');
  if (Q.get('pulse')) scene.setHighlight(list('pulse'), 'pulse');
  if (Q.get('accept')) scene.setHighlight(list('accept'), 'accept');
  const zoom = Q.get('zoom');
  if (Q.get('frame')) scene.frame(Q.get('frame'), { instant, zoom: zoom || undefined });
  else if (zoom === 'district' && sel !== null) scene.frame('district:' + sel, { zoom: 'district', instant });
  else if (state.phase === 'attack') scene.frame('chain', { instant });
  else scene.frame('city', { instant });
}

// deterministic frame: attack clock follows t during the attack, visual clock = t
window.__setTime = (t) => {
  live = false;
  if (state.phase === 'attack' && state.attack) {
    const a = state.attack;
    const wasHit = a.hit;
    a.t = t; a.hit = t >= ATTACK.hit;
    if (a.hit && !wasHit) {
      for (const id of a.sectors) {
        const sec = state.sectors[id], inChain = a.chain.includes(id);
        sec.damaged = true; sec.fire0 = inChain ? 60 : 0; sec.fire = sec.fire0; sec.rubbleMax = sec.rubble = inChain ? 40 : 30; sec.corpseMax = sec.corpse = inChain ? 40 : 0;
      }
      scene.setTime(ATTACK.hit);
    }
  }
  scene.update(state, 0, { render: false });
  syncGhost();
  scene.setTime(t);
  return scene.stats();
};

const panel = document.getElementById('panel');
function btn(label, fn, cls) { const b = document.createElement('button'); b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', fn); panel.appendChild(b); return b; }
function sep() { const d = document.createElement('div'); d.className = 'sep'; panel.appendChild(d); }
function rebuild(over) { Object.assign(opts, over); setState(fakeState(opts), { juice: false }).then(() => applyFraming(false)); }

await scene.ready;
window.lab = { state, step: (dt) => { sim.step(state, dt); scene.update(state, dt); }, scene, emit, setState, fakeState, opts, events, errors, rebuild, sim };
await scene.prime(state);
applyFraming(true);
if (opts.t !== null && opts.t !== undefined) window.__setTime(opts.t); else scene.update(state, 0);

for (const ph of ['calm', 'attack', 'impact', 'cleanup', 'tender', 'rival']) btn(ph, () => rebuild({ phase: ph, t: ph === 'attack' ? 0.2 : null }));
btn('oynat', (e) => { live = !live; e.target.classList.toggle('on', live); }, live ? 'on' : '');
btn('kalite', () => { scene.setQuality(scene.quality() === 'high' ? 'low' : 'high'); });
btn('şehir', () => scene.frame('city'));
btn('bölge', () => { if (sel !== null) scene.frame('district:' + sel, { zoom: 'district' }); });
btn('saha', () => scene.frame('yard'));
btn('sars', () => scene.shake(0.6));
sep();
for (const type of ['fire', 'debris', 'carve']) btn('gönder ' + type, () => { if (sel !== null) sim.dispatch(state, type, sel); });
btn('stage-done', () => { if (sel === null) return; const s = state.sectors[sel]; if (s.fire > 0) { s.fire = 0; emit('stage-done', { sectorId: sel, stage: 'fire' }); } else if (s.rubble > 0) { s.rubble = 0; emit('stage-done', { sectorId: sel, stage: 'rubble' }); } else if (s.corpse > 0) { s.corpse = 0; emit('stage-done', { sectorId: sel, stage: 'carve' }); } });
btn('clean', () => { if (sel === null) return; const s = state.sectors[sel]; s.fire = s.rubble = s.corpse = 0; s.damaged = false; emit('clean', { sectorId: sel }); });
btn('spread-warn', () => { const from = sel ?? 1; const to = [5, 2, 3, 0][from % 4]; state.sectors[from].warnT = 5; state.sectors[from].warnTo = to; emit('spread-warn', { from, to, t: 5 }); });
btn('spread', () => { const from = sel ?? 1; const to = state.sectors[from].warnTo ?? [5, 2, 3, 0][from % 4]; state.sectors[from].warnT = 0; state.sectors[from].warnTo = null; const t = state.sectors[to]; t.damaged = true; t.fire = 35; t.fire0 = 35; emit('spread', { from, to }); });
btn('part', () => emit('part', { sectorId: sel ?? 1, vehicleId: null, item: 'scale' }));
btn('rare', () => emit('rare', { sectorId: sel ?? 1, item: 'eye' }));
btn('sale', () => emit('sale', { buyer: 'riza', item: 'all', qty: 6, total: 400 }));
btn('purchase', () => emit('purchase', { kind: 'vehicle', type: 'fire', vehicleId: 'v9' }));
btn('factory-done', () => { state.inv.concrete = (state.inv.concrete || 0) + 1; emit('factory-done', { jobId: 'j1', rid: 'concrete', line: 0 }); });
btn('stok', () => { for (const k of Object.keys(state.inv)) state.inv[k] += 2; });
btn('istatistik', () => document.getElementById('stats').classList.toggle('off'));
if (actorCases && actorCases.length) { sep(); for (const c of actorCases) btn(c.label, () => c.run(window.lab)); }

// tap to select (pick)
canvas.addEventListener('pointerup', (e) => {
  const p = scene.pick(e.clientX, e.clientY);
  window.lab.lastPick = p;
  if (p && p.type === 'district') { sel = p.id; scene.setHighlight(sel, 'select'); }
  else if (!p || p.type !== 'vehicle') { sel = null; scene.setHighlight(null, 'select'); }
});

// placeholder carcass (lab only, until scene-actors draws Magmadon): a low dark body where corpsePlacement says
function syncGhost() {
  if (Q.get('ghost') === '0' || (scene.world.actors && scene.world.actors.drawsCorpse)) return;   // scene-actors draws Magmadon
  const P = scene.world.placement();
  const show = P && state.attack && state.attack.hit && state.sectors.some((s) => s.damaged && s.corpse > 0);
  const key = P ? `${P.x},${P.z},${P.length}` : '';
  if (key !== ghostKey) {
    if (ghost) { scene._debug.scene.remove(ghost); ghost.traverse((o) => o.geometry && o.geometry.dispose()); ghost = null; }
    ghostKey = key;
    if (P) {
      ghost = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x2c2420, roughness: 0.9, emissive: 0x3a0c04 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), mat);
      body.scale.set(P.width * 0.48, P.width * 0.32, P.length * 0.42); body.position.y = P.width * 0.12;
      const head = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat);
      head.scale.set(P.width * 0.22, P.width * 0.2, P.width * 0.3); head.position.set(0, P.width * 0.12, P.length * 0.44);
      ghost.add(body, head);
      ghost.position.set(P.x, 0, P.z); ghost.rotation.y = P.yaw;
      ghost.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      scene._debug.scene.add(ghost);
    }
  }
  if (ghost) ghost.visible = !!show;
}
const statsEl = document.getElementById('stats');
let last = performance.now(), acc = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  syncGhost();
  if (live) { sim.step(state, dt); scene.update(state, dt); }
  acc += dt;
  if (acc > 0.5 && !statsEl.classList.contains('off')) {
    acc = 0;
    const s = scene.stats();
    statsEl.textContent = `${state.phase}  q ${s.quality}  calls ${s.drawCalls}  tris ${(s.triangles / 1000).toFixed(0)}k  fps ${s.fps}  prog ${s.programs}  jobs ${s.jobs}` + (sel !== null ? `  seçili ${sel}` : '');
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
window.__ready = true;
