import test from 'node:test';
import assert from 'node:assert/strict';
import { on } from '../../js/bus.js';
import { newState } from '../../js/game/state.js';
import {
  tick, travel, legFrom, applyOffline, rizaUnit, upkeepRate, startCalm, gradeFor, vehicleCost, owned, silently,
  startAttack, greedyDispatch, HOOKS, jobSectors,
} from '../../js/game/sim.js';
import { setSeed, setRandom } from '../../js/game/rng.js';
import { act } from '../../js/game/actions.js';
import { debugFtue } from '../../js/game/ftue.js';
import { debugScenario, debugUnlockAll } from '../../js/game/debug.js';
import { districtStatus, objective, hud } from '../../js/game/select.js';
import { BAL } from '../../js/game/data.js';

const run = (s, sec) => { for (let t = 0; t < sec - 1e-9; t += 0.05) tick(s, 0.05); };
const runUntil = (s, cond, max = 300) => { for (let t = 0; t < max && !cond(s); t += 0.05) tick(s, 0.05); return cond(s); };

test('travel formula (ARCH 3.3)', () => {
  assert.equal(travel('yard', 4), 2.5); // row 2
  assert.equal(travel('yard', 1), 3.5); // row 1
  assert.equal(travel('yard', 0), 4.5); // row 0
  assert.equal(travel(0, 1), 1.5 + 1 + 0.6);
  assert.equal(travel(2, 2), 0.3);
  assert.equal(travel(4, 2), 1.5 + 0.6);
  assert.equal(travel(1, 'yard'), 3.5);
});

test('hard sequence: refusals with exact reasons, in DESIGN order', () => {
  const s = debugFtue(newState(), 'fire');
  s.progress.ftue = 'done'; // lift the FTUE gate to test the rules alone
  const r = (type, sector) => act(s, 'dispatch', { type, sector }).reason;
  assert.equal(r('debris', 1), 'Yangın sönmeden giremez');
  assert.equal(r('carve', 1), 'Önce yol açılmalı');
  assert.equal(r('fire', 0), 'Bu bölgede yangın yok');
  assert.equal(r('debris', 0), 'Bu bölgede enkaz yok');
  assert.equal(r('carve', 0), 'Bu bölgede canavar yok');
  assert.equal(act(s, 'dispatch', { type: 'fire', sector: 1 }).ok, true);
  assert.equal(r('fire', 1), 'Boşta araç yok.');
  runUntil(s, (x) => x.sectors[1].fire <= 0);
  assert.equal(r('fire', 1), 'Bu bölgede yangın yok');
  assert.equal(r('carve', 1), 'Önce yol açılmalı');
  assert.equal(act(s, 'dispatch', { type: 'debris', sector: 1 }).ok, true);
  assert.equal(act(s, 'dispatch', { type: 'debris', sector: 1 }).ok, true);
  assert.equal(r('debris', 1), 'Boşta araç yok.');
  runUntil(s, (x) => x.sectors[1].rubble <= 0);
  assert.equal(act(s, 'dispatch', { type: 'carve', sector: 1 }).ok, true);
  // money refusal copy
  s.money = 100;
  s.progress.unlocked.company = true;
  assert.equal(act(s, 'buyVehicle', { type: 'fire' }).reason, `Para yetmiyor: ${vehicleCost(s, 'fire') - 100} bin ₺ eksik.`);
});

test('vehicle freed on stage end and re-dispatchable while returning', () => {
  const s = debugScenario('call');
  act(s, 'acceptCall');
  act(s, 'dispatch', { type: 'fire', sector: 1 }); // Konak fire 50
  const v = s.fleet.find((x) => x.type === 'fire' && x.sector === 1);
  runUntil(s, (x) => x.sectors[1].fire <= 0);
  tick(s, 0.05);
  assert.equal(v.state, 'returning');
  assert.equal(v.sector, null);
  run(s, 1);
  const r = act(s, 'dispatch', { type: 'fire', sector: 2 });
  assert.equal(r.ok, true);
  const w = s.fleet.find((x) => x.id === r.vehicleId);
  assert.equal(w.state, 'enroute');
  // the returning truck from Konak was the nearest, or the yard truck; either way eta follows legFrom
  assert.ok(w.eta > 0 && w.eta <= 4.5);
  // recall turns a vehicle around
  const rc = act(s, 'recall', { sector: 2 });
  assert.equal(rc.ok, true);
  assert.equal(s.fleet.find((x) => x.id === rc.vehicleId).state, 'returning');
  assert.equal(act(s, 'recall', { sector: 0 }).reason, 'Bu bölgede araç yok');
});

test('crews derived from fleet every tick (audio.js reads sectors[].crews)', () => {
  const s = debugScenario('cleanup');
  run(s, 0.1);
  for (const sec of s.sectors) {
    for (const type of ['fire', 'debris', 'carve']) {
      const n = s.fleet.filter((v) => v.state === 'working' && v.sector === sec.id && v.type === type).length;
      assert.equal(sec.crews[type], n);
    }
  }
});

test('fire spread: 10 s unattended -> 5 s warning -> spread -> pause -> resume', () => {
  setSeed(9);
  const s = debugScenario('call');
  const ev = [];
  for (const e of ['spread-warn', 'spread-cancel', 'spread']) on(e, (p) => ev.push([e, p, s.clock]));
  act(s, 'acceptCall');
  // contract #2: Alsancak 75 is the only fire >= 70; leave it alone, put a debris crew in Kültürpark's neighbour
  const t0 = s.clock;
  runUntil(s, (x) => x.sectors[2].warnTo != null, 30);
  assert.ok(Math.abs(s.clock - t0 - 10) < 0.11, `warning after ${s.clock - t0}`);
  assert.equal(s.sectors[2].warnTo, 4, 'scripted target Kültürpark');
  assert.equal(districtStatus(s, 4).threatened.from, 2);
  assert.equal(districtStatus(s, 2).spreading.text, 'Sıçramak üzere');
  assert.ok(s.npc && s.npc.text === "Alsancak'taki yangın Kültürpark'a sıçramak üzere.");
  runUntil(s, (x) => x.sectors[4].fire > 0, 10);
  assert.equal(s.sectors[4].fire, BAL.spreadNew);
  assert.equal(s.sectors[4].damaged, true);
  assert.ok(s.contract.sectors.includes(4));
  assert.ok(ev.some(([e]) => e === 'spread'));
  // paused: debris already working in Kemeraltı (no fire) — spread into a district with a crew pauses it
  const s2 = debugScenario('call');
  act(s2, 'acceptCall');
  act(s2, 'dispatch', { type: 'fire', sector: 1 });
  runUntil(s2, (x) => x.sectors[1].fire <= 0, 40);
  act(s2, 'dispatch', { type: 'debris', sector: 1 });
  runUntil(s2, (x) => x.fleet.some((v) => v.type === 'debris' && v.state === 'working'), 10);
  const before = s2.sectors[1].rubble;
  s2.sectors[1].fire = 35; // as if spread in
  s2.sectors[1].fire0 = 35;
  run(s2, 1);
  assert.equal(s2.sectors[1].paused, true);
  assert.equal(s2.sectors[1].rubble, before, 'no progress while paused');
  assert.ok(districtStatus(s2, 1).status.includes('Durdu'));
  act(s2, 'dispatch', { type: 'fire', sector: 1 });
  runUntil(s2, (x) => x.sectors[1].fire <= 0, 30);
  run(s2, 0.5);
  assert.equal(s2.sectors[1].paused, false);
  assert.ok(s2.sectors[1].rubble < before, 'resumed');
});

test('spread warning cancelled when a fire truck heads there', () => {
  const s = debugScenario('spread');
  const ev = [];
  on('spread-cancel', (p) => ev.push(p));
  assert.ok(s.sectors[2].warnTo != null);
  // free a truck: recall the one at Konak and send it to Alsancak
  act(s, 'recall', { sector: 1 });
  const r = act(s, 'dispatch', { type: 'fire', sector: 2 });
  assert.equal(r.ok, true);
  tick(s, 0.05);
  assert.equal(s.sectors[2].warnTo, null);
  assert.equal(ev.length, 1);
});

test('contract grade: early bonus, on time, late cut with floor', () => {
  assert.deepEqual(gradeFor({ pay: 900, elapsed: 48, deadline: 120 }), { grade: 'early', pay: 900, bonus: 225, cut: 0, trustD: 8, ratio: 0.4 });
  const ot = gradeFor({ pay: 1000, elapsed: 100, deadline: 120 });
  assert.equal(ot.grade, 'ontime');
  assert.equal(ot.trustD, 4);
  const late = gradeFor({ pay: 1000, elapsed: 150, deadline: 120 });
  assert.equal(late.grade, 'late');
  assert.equal(late.pay, 750);
  assert.equal(late.cut, 250);
  assert.equal(late.trustD, -6);
  assert.equal(gradeFor({ pay: 1000, elapsed: 400, deadline: 120 }).pay, 400);
});

test('late contract: GECİKME chip, zones events, receipt late', () => {
  const s = debugScenario('call');
  const zones = [];
  on('deadline-zone', (p) => zones.push(p.zone));
  act(s, 'acceptCall');
  s.contract.deadline = 10;
  run(s, 11);
  assert.deepEqual(zones.slice(-3), ['gold-end', 'warn90', 'late']);
  assert.equal(hud(s).chip.label, 'GECİKME');
  assert.match(hud(s).chip.time, /^\+0:0\d$/);
});

test('Rıza: 60 % of base, -1 % per unit, linear recovery within 60 s', () => {
  const s = debugScenario('calm');
  for (const k in s.market) s.market[k].m = 1;
  s.inv.scale = 10;
  assert.equal(rizaUnit(s, 'scale'), 24);
  const r = act(s, 'sell', { item: 'scale', qty: 10 });
  assert.equal(r.ok, true);
  // 24 × (1 + 0.99 + ... + 0.91) = 24 × 9.55 = 229.2
  assert.equal(r.total, 229);
  assert.ok(Math.abs(s.riza.drop.scale - 0.1) < 1e-9);
  for (const k in s.market) s.market[k].m = 1;
  assert.ok(Math.abs(rizaUnit(s, 'scale') - 21.6) < 1e-6);
  run(s, 30);
  assert.ok(Math.abs(s.riza.drop.scale - 0.05) < 0.002);
  run(s, 31);
  assert.equal(s.riza.drop.scale, 0);
});

test('upkeep: tiers, costs, paused while damaged, income event every 10 s', () => {
  const s = debugScenario('late');
  const inc = [];
  on('income', (p) => inc.push(p.amount));
  const rate = upkeepRate(s);
  assert.ok(Math.abs(rate - 9 * 1.2) < 1e-9);
  run(s, 10.05);
  assert.ok(inc.length >= 1 && Math.abs(inc[0] - rate * 10) < rate * 0.06);
  s.sectors[1].damaged = true;
  assert.ok(Math.abs(upkeepRate(s) - 6 * 1.2) < 1e-9);
  assert.equal(act(s, 'signUpkeep', { sector: 1 }).reason, 'Önce bölge temizlenmeli');
  s.sectors[1].damaged = false;
  const m0 = s.money;
  const r = act(s, 'signUpkeep', { sector: 4 });
  assert.equal(r.ok, true);
  assert.equal(r.cost, 350);
  assert.ok(Math.abs(m0 - s.money - 350) < 1);
  assert.equal(act(s, 'signUpkeep', { sector: 4 }).cost, 650);
  s.sectors[1].upkeep = 4;
  assert.equal(act(s, 'signUpkeep', { sector: 1 }).reason, 'En üst kademede');
});

test('offline income after G7 only, capped and halved, credited on ack', () => {
  const s = debugScenario('late');
  const rate = upkeepRate(s);
  const m0 = s.money;
  const amt = applyOffline(s, 10 * 3600);
  assert.equal(amt, Math.round(rate * 4 * 3600 * 0.5));
  assert.equal(s.notices[0].kind, 'offline');
  assert.equal(s.money, m0);
  act(s, 'ackNotice');
  assert.ok(Math.abs(s.money - m0 - amt) < 1e-6);
  const f = debugScenario('calm');
  assert.equal(applyOffline(f, 3600), 0);
  assert.equal(f.notices.length, 0);
  assert.equal(f.timer, 3, 'radar shortened to 3 s');
});

test('factory: recipes gated, lines, material copy, auto-repeat after G11', () => {
  const s = debugScenario('depot');
  s.inv.bone = 2;
  assert.equal(act(s, 'startJob', { rid: 'armor' }).reason, 'Henüz açılmadı');
  assert.equal(act(s, 'startJob', { rid: 'concrete' }).reason, 'Malzeme yetmiyor: 1 kemik eksik.');
  s.inv.bone = 9;
  assert.equal(act(s, 'startJob', { rid: 'concrete' }).ok, true);
  assert.equal(act(s, 'startJob', { rid: 'concrete' }).reason, 'Tüm hatlar dolu');
  assert.equal(act(s, 'toggleAuto', { rid: 'concrete' }).reason, 'Vardiya şefiyle açılır');
  run(s, 12.1);
  assert.equal(s.inv.concrete, 1);
  assert.equal(s.stats.made, 1);
  const u = debugScenario('late');
  u.inv.bone = 9;
  assert.equal(act(u, 'toggleAuto', { rid: 'concrete' }).ok, true);
  run(u, 12.1 * 3);
  assert.equal(u.inv.concrete >= 2 + 3, true);
});

test('Vardiya şefi dispatches idle vehicles every second', () => {
  const s = debugScenario('late');
  assert.equal(act(s, 'buyUpgrade', { key: 'foreman' }).ok, true);
  s.timer = 0;
  runUntil(s, (x) => x.phase === 'tender', 20);
  if (s.tender.kind === 'bid') {
    act(s, 'confirmRed');
    if (s.tender.reveal.win) act(s, 'startWork');
    else act(s, 'takeTail');
  } else act(s, 'acceptCall');
  run(s, 1.2);
  assert.ok(s.fleet.some((v) => v.state === 'enroute' || v.state === 'working'));
});

test('DNA: guaranteed in the first head from contract #7, buyer visit next calm, mutant after a sale', () => {
  setSeed(77);
  const s = debugScenario('depot');
  silently(() => {
    s.progress.contractNo = 6;
    s.stats.contracts = 6;
  });
  const rare = [];
  on('rare', (p) => rare.push(p.item));
  s.timer = 0;
  runUntil(s, (x) => x.phase === 'tender', 20);
  // force a direct award path regardless of unlocks
  if (s.tender.kind === 'bid') {
    setRandom(() => 0);
    act(s, 'confirmRed');
    setSeed(78);
    act(s, 'startWork');
  } else act(s, 'acceptCall');
  for (let t = 0; t < 600 && !s.result; t += 0.1) {
    greedyDispatch(s, jobSectors(s), HOOKS);
    tick(s, 0.1);
  }
  assert.ok(s.result);
  assert.equal(s.dna, 1);
  assert.ok(rare.includes('dna'));
  act(s, 'collectPayment');
  runUntil(s, (x) => x.notices.some((n) => n.kind === 'buyer'), 60);
  const n = s.notices.find((x) => x.kind === 'buyer');
  assert.ok(n && n.data.offer > 0);
  const t0 = s.timer;
  run(s, 2);
  assert.equal(s.timer, t0, 'radar waits for the decision');
  assert.equal(act(s, 'ackNotice').ok, false);
  const r = act(s, 'decideBuyer', { sell: true });
  assert.equal(r.ok, true);
  assert.equal(s.flags.mutantNext, true);
  assert.equal(s.dna, 0);
  s.timer = 0;
  runUntil(s, (x) => x.phase === 'attack', 5);
  assert.equal(s.attack.mutant, true);
  assert.equal(s.attack.chain.length, 3);
});

test('rival phase: Kuyruk sende — tail is yours, rival clears the rest, back to calm', () => {
  const s = debugScenario('rival');
  assert.equal(s.phase, 'rival');
  const tail = s.rival.tail;
  assert.ok(tail != null);
  assert.equal(s.sectors[tail].fire, 0);
  assert.equal(s.sectors[tail].rubble, 0);
  assert.ok(s.sectors[tail].corpse > 0);
  assert.ok(objective(s).text.includes('kuyruğu parçala'));
  const others = s.attack.sectors.filter((id) => id !== tail);
  assert.ok(others.every((id) => s.sectors[id].rival));
  assert.equal(act(s, 'dispatch', { type: 'fire', sector: others[0] }).reason, "Bu bölge Süpürge Holding'de");
  const inv0 = s.inv.scale;
  runUntil(s, (x) => x.phase === 'calm', 200);
  assert.equal(s.phase, 'calm');
  assert.ok(s.inv.scale > inv0, 'tail parts are yours');
  assert.ok(s.sectors.every((x) => x.fire === 0 && x.rubble === 0 && x.corpse === 0));
  assert.ok(s.timer > 30);
});

test('releaseTail ends the tail job; rival finishes it', () => {
  const s = debugScenario('rival');
  assert.equal(act(s, 'releaseTail').ok, true);
  assert.equal(s.rival.tail, null);
  runUntil(s, (x) => x.phase === 'calm', 60);
  assert.equal(s.phase, 'calm');
});

test('skip radar after G4 only; skip attack jumps to impact then end', () => {
  const s = debugScenario('calm');
  assert.equal(act(s, 'skipRadar').ok, false);
  const t = debugScenario('depot');
  assert.equal(act(t, 'skipRadar').ok, true);
  tick(t, 0.05);
  assert.equal(t.phase, 'attack');
  assert.equal(act(t, 'skipAttack').ok, true);
  tick(t, 0.05);
  assert.equal(t.attack.hit, true);
  tick(t, 0.05);
  assert.equal(t.phase, 'tender');
});

test('calm lengths: 15 after FTUE, 35 for #2-#4, 45 later, 60 with upkeep + offers', () => {
  const s = debugScenario('calm');
  assert.equal(s.timerMax, 15);
  const d = debugScenario('depot');
  assert.equal(d.timerMax, 35);
  d.progress.contractNo = 5;
  startCalm(d);
  assert.equal(d.timerMax, 45);
  const l = debugScenario('late');
  startCalm(l);
  assert.equal(l.timerMax, 60);
});
