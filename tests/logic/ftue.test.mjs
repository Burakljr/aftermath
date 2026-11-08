import test from 'node:test';
import assert from 'node:assert/strict';
import { on } from '../../js/bus.js';
import { newState, save, load } from '../../js/game/state.js';
import { tick } from '../../js/game/sim.js';
import { setSeed } from '../../js/game/rng.js';
import { act } from '../../js/game/actions.js';
import { ftueView, ftueAllows, debugFtue, FTUE_ORDER } from '../../js/game/ftue.js';
import { objective, receipt, depot, hud, districtStatus, callCard, company } from '../../js/game/select.js';
import { memStorage } from './helpers.mjs';

const events = [];
let cur = null;
for (const e of ['ftue', 'part', 'rare', 'dispatch', 'sale', 'contract-done', 'unlock']) on(e, (p) => cur && events.push({ e, p, t: cur.clock }));

// performs one action taken only from the current step's allow list
function allowedAction(s) {
  const v = ftueView(s);
  for (const a of v.allow) {
    const [id, x, y] = a.split(':');
    let r = null;
    if (id === 'skipAttack' && s.phase === 'attack') r = act(s, 'skipAttack');
    else if (id === 'acceptCall' || id === 'collectPayment') r = act(s, id);
    else if (id === 'dispatch') {
      const st = districtStatus(s, Number(y));
      if (st.buttons[x].enabled) r = act(s, 'dispatch', { type: x, sector: Number(y) });
    } else if (id === 'sellAll') r = act(s, 'sellAll', { buyer: 'riza' });
    else if (id === 'buyVehicle') r = act(s, 'buyVehicle', { type: x });
    if (r && r.ok) return r;
  }
  return null;
}

test('FTUE: only allowed actions, scripted yields, receipt, Rıza 472, money 2417, radar 40 s', () => {
  setSeed(42);
  const s = newState();
  cur = s;
  events.length = 0;
  const steps = [s.progress.ftue];
  let firstDispatch = null;
  let firstSale = null;
  let receiptSeen = null;
  let rizaText = null;
  let emptyObjective = 0;
  let nextSample = 0;
  for (let i = 0; i < 4000 && s.progress.ftue !== 'done'; i++) {
    if (s.progress.ftue === 'deliver' && !receiptSeen) receiptSeen = receipt(s);
    if (s.progress.ftue === 'sell' && !rizaText) rizaText = depot(s).riza.allText;
    if (s.progress.ftue === 'call') assert.equal(callCard(s).lines[1], "Canavar Konak'a düştü. Yangın var, yol enkazla kapalı.");
    const r = allowedAction(s);
    if (r && firstDispatch == null && events.some((x) => x.e === 'dispatch')) firstDispatch = s.clock;
    if (r && firstSale == null && events.some((x) => x.e === 'sale')) firstSale = s.clock;
    if (s.progress.ftue !== steps[steps.length - 1]) steps.push(s.progress.ftue);
    tick(s, 0.1);
    if (s.progress.ftue !== steps[steps.length - 1]) steps.push(s.progress.ftue);
    if (s.clock >= nextSample) {
      nextSample += 0.5;
      if (s.phase !== 'attack' && !objective(s).text) emptyObjective++;
    }
  }
  assert.deepEqual(steps, FTUE_ORDER);
  assert.equal(emptyObjective, 0, 'objective always present outside the attack');
  // scripted yields: Pul 3, Magma özü 2, Kemik 2, Göz 1
  const parts = events.filter((x) => x.e === 'part').map((x) => x.p.item);
  const count = (k) => parts.filter((p) => p === k).length;
  assert.deepEqual([count('scale'), count('blood'), count('bone'), count('eye')], [3, 2, 2, 1]);
  assert.ok(events.some((x) => x.e === 'rare' && x.p.item === 'eye'));
  assert.equal(receiptSeen.stamp, 'ERKEN TESLİM');
  assert.equal(receiptSeen.title, 'Konak teslim edildi');
  assert.ok(receiptSeen.rows.some((r) => r.label === 'Erken teslim primi' && r.value === '225 bin ₺'));
  assert.ok(receiptSeen.rows.some((r) => r.label === 'Ödeme' && r.value === '900 bin ₺'));
  assert.equal(receiptSeen.trustText, '+8 güven');
  assert.equal(rizaText, "Hepsini Rıza'ya sat · 472 bin ₺");
  assert.equal(s.money, 2417);
  assert.equal(s.progress.ftue, 'done');
  assert.equal(s.timerMax, 40);
  assert.ok(s.timer > 39.5 && s.timer <= 40);
  assert.equal(hud(s).chip.label, 'RADAR');
  assert.equal(hud(s).chip.time, '0:40');
  assert.equal(objective(s).text, 'Sıradaki saldırıya hazırlan');
  assert.ok(s.progress.unlocked.depot && s.progress.unlocked.company && !s.progress.unlocked.factory);
  assert.ok(firstDispatch <= 15, `first dispatch at ${firstDispatch}`);
  assert.ok(firstSale <= 90, `first sale at ${firstSale}`);
  console.log(`  first dispatch ${firstDispatch.toFixed(1)} s, first sale ${firstSale.toFixed(1)} s (game clock, skip used)`);
  cur = null;
});

test('FTUE gate: disallowed actions refused with code ftue and empty reason', () => {
  const s = debugFtue(newState(), 'fire');
  assert.equal(s.progress.ftue, 'fire');
  const r = act(s, 'dispatch', { type: 'fire', sector: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'ftue');
  assert.equal(r.reason, '');
  assert.equal(act(s, 'sellAll', { buyer: 'riza' }).code, 'ftue');
  assert.equal(ftueAllows(s, 'select:1'), true);
  assert.equal(ftueAllows(s, 'select:2'), false);
  assert.equal(ftueAllows(s, 'settings'), true);
  // the sheet shows the rule reasons of DESIGN step 2
  const st = districtStatus(s, 1);
  assert.equal(st.buttons.fire.enabled, true);
  assert.equal(st.buttons.fire.primary, true);
  assert.equal(st.buttons.fire.sub, '1 araç hazır');
  assert.equal(st.buttons.debris.reason, 'Yangın sönmeden giremez');
  assert.equal(st.buttons.carve.reason, 'Önce yol açılmalı');
  assert.equal(ftueView(s).bubble.text, "Konak'a dokun.");
  const b = debugFtue(newState(), 'buy');
  assert.equal(ftueAllows(b, 'tab:factory'), true);
  assert.equal(ftueAllows(b, 'buyVehicle:carve'), false);
  assert.equal(company(b).fleet.find((x) => x.type === 'fire').primary, true);
  const sell = debugFtue(newState(), 'sell');
  assert.equal(ftueAllows(sell, 'sellAll:riza'), true);
  assert.equal(ftueAllows(sell, 'tab:company'), false);
});

test('FTUE resume: reload at every step resumes the same step with the same progress', () => {
  for (const step of FTUE_ORDER) {
    setSeed(5);
    const s = debugFtue(newState(), step);
    assert.equal(s.progress.ftue, step);
    for (let i = 0; i < 7; i++) tick(s, 0.1);
    const st = memStorage();
    save(s, st);
    const b = load(st);
    assert.equal(b.progress.ftue, s.progress.ftue, step);
    assert.equal(b.sectors[1].rubble, s.sectors[1].rubble);
    assert.deepEqual(b.fleet.map((v) => v.state), s.fleet.map((v) => v.state));
    if (step !== 'done') assert.ok(ftueView(b), step);
  }
});
