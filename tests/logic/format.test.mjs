import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtMoney, fmtMoneyShort, fmtMoneyExact, fmtTime, fmtDur, fmtPct, fmtTon, fmtInt, trUpper, durLoc } from '../../js/game/format.js';

test('fmtMoney per DESIGN 9.2', () => {
  assert.equal(fmtMoney(900), '900 bin ₺');
  assert.equal(fmtMoney(680), '680 bin ₺');
  assert.equal(fmtMoney(1390), '1,39 milyon ₺');
  assert.equal(fmtMoney(1390, true), '1,39 Mn ₺');
  assert.equal(fmtMoneyShort(2600), '2,6 Mn ₺');
  assert.equal(fmtMoneyShort(1500), '1,5 Mn ₺');
  assert.equal(fmtMoneyShort(2417), '2,41 Mn ₺');
  assert.equal(fmtMoneyShort(50000), '50 Mn ₺');
  assert.equal(fmtMoney(4200), '4,2 milyon ₺');
  assert.equal(fmtMoney(2.4e6, true), '2,4 Mr ₺');
  assert.equal(fmtMoney(1.25e6), '1,25 milyar ₺');
  assert.equal(fmtMoney(216 - 1e-9), '216 bin ₺');
  assert.equal(fmtMoneyExact(1737.5), '1.737.500 ₺');
});

test('time, percent, tons, integers', () => {
  assert.equal(fmtTime(102), '1:42');
  assert.equal(fmtTime(120), '2:00');
  assert.equal(fmtTime(0), '0:00');
  assert.equal(fmtDur(102), '1 dk 42 sn');
  assert.equal(fmtDur(45), '45 sn');
  assert.equal(fmtDur(120), '2 dk');
  assert.equal(fmtDur(3 * 3600), '3 sa');
  assert.equal(durLoc('1 dk 30 sn'), "1 dk 30 sn'de");
  assert.equal(durLoc('2 dk'), "2 dk'da");
  assert.equal(fmtPct(0.62), '%62');
  assert.equal(fmtTon(13.2), '14 ton');
  assert.equal(fmtTon(14), '14 ton');
  assert.equal(fmtInt(1737500), '1.737.500');
});

test('Turkish caps', () => {
  assert.equal(trUpper('istif'), 'İSTİF');
  assert.equal(trUpper('ılık'), 'ILIK');
  assert.equal(trUpper('Liman'), 'LİMAN');
  assert.equal(trUpper('Süpürge Holding'), 'SÜPÜRGE HOLDİNG');
});
