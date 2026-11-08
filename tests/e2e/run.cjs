// Runs the whole check list (ARCH 9.2): node logic tests (DESIGN §12 items 8-9 live there), then the Playwright
// e2e scripts against one local server. Usage: node tests/e2e/run.cjs   (PORT=5173 default)
const { spawnSync } = require('child_process');
const path = require('path');
const { startServer, PORT } = require('./lib.cjs');

const ROOT = path.join(__dirname, '..', '..');
function run(label, args, env = {}) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } });
  const ok = r.status === 0;
  console.log(`== ${label}: ${ok ? 'ok' : 'FAIL'} (${Math.round((Date.now() - t0) / 1000)} s)`);
  return ok;
}

(async () => {
  const results = [run('logic', ['tests/logic/run.mjs'])];
  const server = await startServer();
  try {
    for (const f of ['ftue.cjs', 'smoke.cjs']) results.push(run(`e2e ${f}`, [path.join('tests', 'e2e', f)], { SERVE: '0', PORT: String(PORT) }));
  } finally {
    server.stop();
  }
  const ok = results.every(Boolean);
  console.log(ok ? 'ALL OK' : 'SOME CHECKS FAILED');
  process.exit(ok ? 0 : 1);
})();
