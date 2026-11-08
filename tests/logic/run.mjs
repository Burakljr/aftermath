// Runs every logic test: node tests/logic/run.mjs [name-filter...]  (same as: node --test tests/logic/*.test.mjs)
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => !only.length || only.some((o) => f.includes(o)))
  .sort()
  .map((f) => join(dir, f));
const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
