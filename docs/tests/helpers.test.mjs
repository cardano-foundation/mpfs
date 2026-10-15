// The classifier behind every other check: a killed, aborted or nonzero-exit child must
// never be read as a patched success, and a normal result must be.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { finished } from './helpers/assertions.mjs';
import { docsRoot, runBounded } from './helpers/bounded.mjs';

describe('bounded child classification', () => {
  const here = docsRoot; // any real directory; the snippets do not load it

  it('accepts a child that returns a value and exits normally', () => {
    assert.equal(finished(runBounded(here, 'return 41 + 1;'), 'normal'), 42);
  });
  it('accepts a graceful refusal reported as a value', () => {
    assert.deepEqual(finished(runBounded(here, `try { throw new Error('refused'); } catch (e) { return { refused: e.message }; }`), 'refusal'), { refused: 'refused' });
  });
  it('rejects a child still running at the deadline', () => {
    assert.throws(() => finished(runBounded(here, 'for (;;) {}', { deadlineMs: 300 }), 'loop'), /killed at the deadline/);
  });
  it('rejects a child that aborts after printing its result', () => {
    const r = runBounded(here, `process.stdout.write('RESULT 1\\n'); process.abort();`);
    assert.throws(() => finished(r, 'abort after result'), /process died/);
  });
  it('rejects a child that exits nonzero after printing its result', () => {
    const r = runBounded(here, `process.stdout.write('RESULT 1\\n'); process.exit(3);`);
    assert.throws(() => finished(r, 'exit 3 after result'), /process died/);
  });
  it('rejects a child that runs out of heap', () => {
    const r = runBounded(here, 'const keep = []; for (;;) keep.push(new Array(1e5).fill(keep.length));', { heapMb: 32, deadlineMs: 8000 });
    assert.throws(() => finished(r, 'heap'), /process died|killed at the deadline/);
  });
  it('runs children with core dumps disabled', () => {
    // The limit a shell inherits from the bounded child is the limit any process it starts would get.
    const r = finished(runBounded(here, `
      return require('node:child_process').execFileSync('sh', ['-c', 'ulimit -c'], { encoding: 'utf8' }).trim();`), 'core limit');
    assert.equal(r, '0');
  });
});
