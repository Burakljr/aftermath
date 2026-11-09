// DESIGN §9 lint over every string literal in js/game/** and js/ui/** (comments ignored).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { NEWS, GOAL_COPY, FTUE_COPY, REASON } from '../../js/game/copy.js';
import { DISTRICTS } from '../../js/game/data.js';
import { trLower } from '../../js/game/format.js';

const ROOT = new URL('../../', import.meta.url).pathname;
const BANNED = ['harika', 'muhteşem', 'tebrikler', 'hadi', 'efsane', 'çılgınlık', 'kapış kapış', 'pırıl pırıl', 'unutma ki', 'dünyanın en büyük'];

function files(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (f.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Minimal JS lexer: returns string literal contents (template static parts included), skipping comments and regexes. */
export function strings(src) {
  const out = [];
  let i = 0;
  let prev = ''; // last significant char, to tell regex from division
  const isRegexStart = () => !prev || /[(,=:[!&|?{};+\-*%<>~^]$/.test(prev) || /\b(return|typeof|case|in|of)$/.test(prev);
  function readTemplate() {
    let buf = '';
    i++; // `
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { buf += src[i + 1]; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        out.push(buf);
        buf = '';
        i += 2;
        let depth = 1;
        const start = i;
        while (i < src.length && depth) {
          const c = src[i];
          if (c === '{') depth++;
          else if (c === '}') { depth--; if (!depth) break; }
          else if (c === '`' || c === '"' || c === "'") {
            const sub = src.slice(i);
            const j = skipString(sub);
            out.push(...strings(sub.slice(0, j)));
            i += j;
            continue;
          }
          i++;
        }
        void start;
        i++;
        continue;
      }
      buf += src[i++];
    }
    out.push(buf);
    i++;
  }
  function skipString(s) {
    const q = s[0];
    let k = 1;
    if (q === '`') {
      let depth = 0;
      while (k < s.length) {
        if (s[k] === '\\') { k += 2; continue; }
        if (!depth && s[k] === '`') return k + 1;
        if (s[k] === '$' && s[k + 1] === '{') { depth++; k += 2; continue; }
        if (depth && s[k] === '}') depth--;
        k++;
      }
      return k;
    }
    while (k < s.length && s[k] !== q) k += s[k] === '\\' ? 2 : 1;
    return k + 1;
  }
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') { i = src.indexOf('*/', i + 2) + 2; if (i < 2) break; continue; }
    if (c === '"' || c === "'") {
      const j = skipString(src.slice(i));
      out.push(src.slice(i + 1, i + j - 1).replace(/\\(.)/g, '$1'));
      i += j;
      prev = 'x';
      continue;
    }
    if (c === '`') { readTemplate(); prev = 'x'; continue; }
    if (c === '/' && isRegexStart()) {
      i++;
      let cls = false;
      while (i < src.length && (src[i] !== '/' || cls)) {
        if (src[i] === '\\') i++;
        else if (src[i] === '[') cls = true;
        else if (src[i] === ']') cls = false;
        i++;
      }
      i++;
      while (/[a-z]/i.test(src[i] || '')) i++;
      prev = 'x';
      continue;
    }
    if (!/\s/.test(c)) {
      if (/[A-Za-z0-9_$]/.test(c)) {
        let w = '';
        while (i < src.length && /[A-Za-z0-9_$]/.test(src[i])) w += src[i++];
        prev = w;
        continue;
      }
      prev = c;
    }
    i++;
  }
  return out;
}

const SOURCES = [...files(join(ROOT, 'js/game')), ...files(join(ROOT, 'js/ui'))];

test('lexer sanity', () => {
  assert.deepEqual(strings("const a = 'x!'; // 'y'\n/* 'z' */ const b = `t${c ? 'u' : 'v'}w`; const r = /a'b/g;"), ['x!', 't', 'u', 'v', 'w']);
});

test('no "!", no emoji, no banned words, no ellipsis endings in UI strings', () => {
  const problems = [];
  let n = 0;
  for (const f of SOURCES) {
    for (const str of strings(readFileSync(f, 'utf8'))) {
      n++;
      const where = `${relative(ROOT, f)}: ${JSON.stringify(str).slice(0, 70)}`;
      if (str.includes('!')) problems.push(`"!" ${where}`);
      if (/\p{Extended_Pictographic}/u.test(str)) problems.push(`emoji ${where}`);
      const low = trLower(str);
      for (const b of BANNED) if (new RegExp(`(^|[^a-zçğıöşü])${b}([^a-zçğıöşü]|$)`, 'u').test(low)) problems.push(`banned "${b}" ${where}`);
      if (/(\.\.\.|…)\s*$/.test(str)) problems.push(`ellipsis ${where}`);
      if (/\b(Merkez|Eski Çarşı|Finans|Sanayi)\b/u.test(str) || /(^|[^a-zü])Park\b/.test(str)) problems.push(`v1 district name ${where}`);
    }
  }
  assert.deepEqual(problems, []);
  console.log(`  ${n} string literals in ${SOURCES.length} files`);
});

test('headlines fit one line (≤ 56 characters) with realistic values', () => {
  const lines = [NEWS.attack, NEWS.mutant, NEWS.lost, NEWS.late, NEWS.rivalDump, NEWS.scandal, NEWS.donated, NEWS.fillerMutant,
    ...NEWS.filler, ...Object.values(NEWS.boom), NEWS.won(129), NEWS.won(3599), NEWS.early(90), NEWS.early(119)];
  for (const id of [0, 1, 2, 3, 4, 5]) {
    lines.push(NEWS.ontime(id));
    for (const to of [0, 1, 2, 3, 4, 5]) if (to !== id) lines.push(NEWS.spread(id, to));
  }
  const long = lines.filter((x) => x.length > 56);
  assert.deepEqual(long, []);
});

test('short copy: objectives, reasons ≤ 8 words, sentences ≤ 12 words', () => {
  const words = (x) => x.trim().split(/\s+/).length;
  for (const r of Object.values(REASON)) {
    const t = typeof r === 'function' ? r(120, 'scale') : r;
    if (t.startsWith('Kazanma')) continue; // confirm dialog question, not a refusal
    assert.ok(words(t) <= 8, t);
  }
  for (const g of Object.values(GOAL_COPY)) assert.ok(words(g.text) <= 8, g.text);
  for (const f of Object.values(FTUE_COPY)) for (const v of Object.values(f)) for (const sent of v.split(/[.:;]\s/)) assert.ok(words(sent) <= 12, v);
  for (const d of DISTRICTS) assert.equal(d.caps, d.caps.normalize());
});
