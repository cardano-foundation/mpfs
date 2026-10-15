// brace-expansion 1 expands the brace patterns that glob matchers feed it. Hostile patterns
// must finish without exhausting the stack, heap or time; ordinary braces must expand.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bounded, copiesOf, finished } from './helpers/assertions.mjs';

describe('brace-expansion 1', () => {
  for (const { dir, version } of copiesOf('brace-expansion')) {
    describe(version, () => {
      it('expands ordinary braces (control)', () => {
        const r = finished(bounded(dir, `
          return [lib('a{b,c}d'), lib('{1..3}'), lib('x{a,b}{1,2}'), lib('plain')];`), 'ordinary');
        assert.deepEqual(r, [['abd', 'acd'], ['1', '2', '3'], ['xa1', 'xa2', 'xb1', 'xb2'], ['plain']]);
      });
      it('does not exhaust the stack on a long run of comma-separated groups', () => {
        const r = finished(bounded(dir, `return lib('{' + '{a},'.repeat(7000) + 'b}').length;`), 'comma groups');
        assert.equal(typeof r, 'number', `threw instead of expanding: ${JSON.stringify(r)}`);
      });
      it('does not exhaust the stack on deeply nested groups', () => {
        const r = finished(bounded(dir, `return lib('{'.repeat(3200) + 'a,b' + '}'.repeat(3200)).length;`), 'nested');
        assert.equal(typeof r, 'number', `threw instead of expanding: ${JSON.stringify(r)}`);
        const r2 = finished(bounded(dir, `return lib('{a,'.repeat(4000) + 'z' + '}'.repeat(4000)).length;`), 'nested comma');
        assert.equal(typeof r2, 'number', `threw instead of expanding: ${JSON.stringify(r2)}`);
      });
      it('survives a short input that chains many brace groups under a small heap', () => {
        finished(bounded(dir, `return lib('{a,b}'.repeat(1500)).length;`, { heapMb: 64, deadlineMs: 8000 }), 'chained groups');
      });
      it('survives a range with a very long leading zero run', () => {
        finished(bounded(dir, `return lib('{' + '0'.repeat(120000) + '1..100000}').length;`, { heapMb: 64, deadlineMs: 8000 }), 'padded range');
      });
    });
  }
});
