// Number and time formatting per language. All words/suffixes come from the
// language files (num.* and time.* keys), so new languages only add strings.
import { dict } from './i18n.js';

function fill(tpl, n, s) {
  return tpl.replace('{n}', n).replace('{s}', s);
}

function fixed(value, digits, decimal) {
  let str = value.toFixed(digits);
  if (digits > 0) str = str.replace(/\.?0+$/, '');
  return decimal === '.' ? str : str.replace('.', decimal);
}

function grouped(int, sep) {
  const s = String(int);
  if (s.length <= 3) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += sep;
    out += s[i];
  }
  return out;
}

const suffixCache = {};
function suffixes(lang) {
  if (!suffixCache[lang]) suffixCache[lang] = dict(lang)['num.suffixes'].split(',');
  return suffixCache[lang];
}

// Short number: 7, 8.5, 999, 1.2K / 1,2 B, 12.3M ...
// Values under 10 keep one decimal (dropped when zero), under 1000 are whole.
export function formatNumber(value, lang = 'en') {
  const d = dict(lang);
  const dec = d['num.decimal'];
  if (!Number.isFinite(value)) return '0';
  const neg = value < 0;
  let v = Math.abs(value);
  let out;
  if (v < 10) {
    out = fixed(Math.floor(v * 10) / 10, 1, dec);
  } else if (v < 1000) {
    out = String(Math.floor(v));
  } else {
    const sx = suffixes(lang);
    let i = 0;
    while (v >= 1000 && i < sx.length) { v /= 1000; i++; }
    if (v >= 1000) {
      out = fill(d['num.short'], grouped(Math.floor(v), d['num.group']), sx[i - 1]);
    } else {
      // 3 significant digits, rounded down so we never show more than we have
      const digits = v < 10 ? 2 : v < 100 ? 1 : 0;
      const p = Math.pow(10, digits);
      let t = Math.floor(v * p + 1e-9) / p;
      out = fill(d['num.short'], fixed(t, digits, dec), sx[i - 1]);
    }
  }
  return neg ? '-' + out : out;
}

// Whole number with grouping (for counts like guests served): 1,234 / 1.234
export function formatInt(value, lang = 'en') {
  const d = dict(lang);
  return grouped(Math.floor(Math.max(0, value)), d['num.group']);
}

// Seconds with one decimal: "1.6 s" / "1,6 sn"
export function formatSeconds(sec, lang = 'en') {
  const d = dict(lang);
  const digits = sec < 10 ? 1 : 0;
  const str = fixed(Math.round(sec * 10) / 10, digits, d['num.decimal']);
  return d['time.sec'].replace('{n}', str);
}

// Durations for "while you were away": "1 h 20 min" / "1 sa 20 dk", "45 min", "2 h"
export function formatDuration(sec, lang = 'en') {
  const d = dict(lang);
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0 && m > 0) return d['time.hm'].replace('{h}', h).replace('{m}', m);
  if (h > 0) return d['time.h'].replace('{h}', h);
  if (m > 0) return d['time.m'].replace('{m}', m);
  return d['time.s'].replace('{s}', total);
}
