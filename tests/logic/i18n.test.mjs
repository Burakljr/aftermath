import { test, assert, eq } from './harness.mjs';
import en from '../../js/i18n/en.js';
import tr from '../../js/i18n/tr.js';
import { FACTORIES } from '../../js/game/config.js';
import { GOAL_TEXT_KEYS } from '../../js/game/goals.js';
import { detectLang, t, DICTS } from '../../js/game/i18n.js';
import { formatNumber, formatDuration, formatSeconds, formatInt } from '../../js/game/format.js';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort();
// Emoji and pictographs (incl. variation selectors and keycaps)
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}\u{1F1E6}-\u{1F1FF}]/u;

test('en and tr have exactly the same keys', () => {
  const a = Object.keys(en).sort();
  const b = Object.keys(tr).sort();
  const missingTr = a.filter((k) => !(k in tr));
  const missingEn = b.filter((k) => !(k in en));
  eq(missingTr, [], 'keys missing in tr');
  eq(missingEn, [], 'keys missing in en');
});

test('every key has the same placeholders in en and tr', () => {
  for (const k of Object.keys(en)) eq(placeholders(tr[k]), placeholders(en[k]), `placeholders of ${k}`);
});

test('no emoji anywhere, no exclamation marks in Turkish, no empty strings', () => {
  for (const [name, d] of Object.entries(DICTS)) {
    for (const [k, v] of Object.entries(d)) {
      assert(typeof v === 'string' && v.length > 0, `${name}.${k} empty`);
      assert(!EMOJI.test(v), `${name}.${k} has an emoji: ${v}`);
    }
  }
  for (const [k, v] of Object.entries(tr)) assert(!v.includes('!'), `tr.${k} has "!": ${v}`);
});

test('config and UI keys exist in the dictionaries', () => {
  const need = new Set(Object.values(GOAL_TEXT_KEYS));
  for (const f of FACTORIES) {
    need.add(f.nameKey); need.add(f.toyKey);
    for (const s of f.stations) { need.add(s.nameKey); need.add(s.nameKey + '.acc'); need.add(s.nameKey + '.desc'); }
  }
  // every t('...') / tk('...') literal used by the UI
  const root = join(dirname(fileURLToPath(import.meta.url)), '../../js');
  for (const dir of ['ui', 'game', '.']) {
    for (const file of readdirSync(join(root, dir)).filter((f) => f.endsWith('.js'))) {
      const src = readFileSync(join(root, dir, file), 'utf8');
      for (const m of src.matchAll(/\b(?:tk|tx)\(\s*'([a-zA-Z0-9_.]+)'/g)) need.add(m[1]);
    }
  }
  for (const k of need) {
    assert(k in en, `en missing ${k}`);
    assert(k in tr, `tr missing ${k}`);
  }
});

test('Turkish text uses correct dotted/dotless i (spot checks)', () => {
  assert(tr['settings.title'] === 'Ayarlar');
  assert(tr['complete.title'].includes('tamamlandı'), 'dotless ı in tamamlandı');
  assert(tr['app.title'] === 'Oyuncak Fabrikası');
  assert(!/[İI]stasyon/.test(tr['goal.allLevel']) && tr['goal.allLevel'].includes('istasyonları'));
});

test('language detection follows the phone language, English otherwise', () => {
  eq(detectLang(['tr-TR', 'en-US']), 'tr');
  eq(detectLang(['de-DE', 'tr']), 'tr');
  eq(detectLang(['en-GB']), 'en');
  eq(detectLang(['fr-FR']), 'en');
  eq(detectLang([]), 'en');
});

test('t() fills placeholders and falls back to English', () => {
  eq(t('tr', 'goal.sold', { n: '25' }), '25 oyuncak sat');
  eq(t('en', 'goal.level', { station: 'the Saw', n: 10 }), 'Upgrade the Saw to level 10');
  eq(t('tr', 'goal.level', { station: 'Testereyi', n: 10 }), 'Testereyi 10. seviyeye yükselt');
  eq(t('xx', 'card.upgrade'), 'Upgrade');
  eq(t('en', 'no.such.key'), 'no.such.key');
});

test('number formatting per language', () => {
  eq(formatNumber(7, 'en'), '7');
  eq(formatNumber(8.56, 'en'), '8.5');
  eq(formatNumber(8.56, 'tr'), '8,5');
  eq(formatNumber(999.9, 'en'), '999');
  eq(formatNumber(1234, 'en'), '1.23K');
  eq(formatNumber(1200, 'en'), '1.2K');
  eq(formatNumber(1200, 'tr'), '1,2 B');
  eq(formatNumber(12345, 'en'), '12.3K');
  eq(formatNumber(123456, 'tr'), '123 B');
  eq(formatNumber(2.5e6, 'en'), '2.5M');
  eq(formatNumber(2.5e6, 'tr'), '2,5 Mn');
  eq(formatNumber(3e9, 'en'), '3B');
  eq(formatNumber(3e9, 'tr'), '3 Mr');
  eq(formatNumber(4.2e12, 'en'), '4.2T');
  eq(formatNumber(4.2e12, 'tr'), '4,2 Tn');
  eq(formatInt(1234567, 'en'), '1,234,567');
  eq(formatInt(1234567, 'tr'), '1.234.567');
  eq(formatSeconds(1.5, 'en'), '1.5 s');
  eq(formatSeconds(0.75, 'tr'), '0,8 sn');
  eq(formatDuration(4800, 'en'), '1 h 20 min');
  eq(formatDuration(4800, 'tr'), '1 sa 20 dk');
  eq(formatDuration(7200, 'tr'), '2 sa');
  eq(formatDuration(600, 'en'), '10 min');
});
