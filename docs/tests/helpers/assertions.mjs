import assert from 'node:assert/strict';
import { installedCopies, runBounded } from './bounded.mjs';

// The load preamble every snippet shares: `lib` is the installed copy under test.
export const LOAD = `
  const rq = (await import('node:module')).createRequire(dir + '/package.json');
  const lib = rq(dir);
`;

export function copiesOf(name) {
  const copies = installedCopies(name);
  assert.ok(copies.length > 0, `no installed copy of ${name} found; the check would be vacuous`);
  return copies;
}

// The hostile input finished: it was neither killed at the deadline nor did it crash the process.
export function finished(r, what) {
  assert.ok(!r.timedOut, `${what}: still running after ${r.ms} ms, killed at the deadline`);
  assert.ok(!r.crashed, `${what}: process died (${r.signal || r.status}) ${r.stderr.split('\n').find((l) => /FATAL|heap|Aborted/.test(l)) || ''}`);
  return r.result;
}

export function bounded(dir, body, opts) {
  return runBounded(dir, LOAD + body, opts);
}
