// Runs every tests/logic/*.test.mjs file: node tests/logic/run.mjs [filter]
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tests } from './harness.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';
const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs') && f.includes(filter)).sort();
let pass = 0;
let fail = 0;
for (const f of files) {
  const start = tests.length;
  await import(pathToFileURL(join(dir, f)).href);
  for (const t of tests.slice(start)) {
    const t0 = Date.now();
    try {
      await t.fn();
      pass++;
      console.log(`ok   ${f} > ${t.name} (${Date.now() - t0} ms)`);
    } catch (e) {
      fail++;
      console.log(`FAIL ${f} > ${t.name}\n     ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n     ')}`);
    }
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
