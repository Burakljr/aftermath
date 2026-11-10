// Tiny test harness (no dependencies). Test files call test(name, fn).
export const tests = [];
export function test(name, fn) { tests.push({ name, fn }); }
export function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
export function eq(a, b, msg) {
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) throw new Error(`${msg || 'not equal'}\n  got:      ${sa}\n  expected: ${sb}`);
}
export function near(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg || 'not near'}: ${a} vs ${b} (tol ${tol})`);
}
