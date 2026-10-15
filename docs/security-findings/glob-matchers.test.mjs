// Unresolved findings (#44): minimatch 3 and picomatch 2 are NOT repaired by this change.
// These reproductions fail by design on the locked versions: `yarn test:security-findings`.
// Their ordinary controls are the ones the repair attempt could not keep (picomatch 2.3.2 stops
// matching +(a|aa)) or the hostile input still stalls (minimatch 3.1.5 nested extglobs).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bounded, copiesOf, finished } from '../tests/helpers/assertions.mjs';

describe('minimatch 3', () => {
  for (const { dir, version } of copiesOf('minimatch')) {
    describe(version, () => {
      it('matches ordinary globs (control)', () => {
        const r = finished(bounded(dir, `
          return [
            lib('foo/bar.js', '**/*.js'), lib('a/b', 'a/*'), lib('a/b/c', 'a/*'),
            lib('x.md', '*.js'), lib('a/c/d', 'a/{b,c}/d'), lib('abab', '+(a|b)'),
          ];`), 'ordinary');
        assert.deepEqual(r, [true, true, false, false, true, true]);
      });
      it('finishes repeated wildcards followed by a literal that never matches', () => {
        finished(bounded(dir, `return lib('a'.repeat(30), '*'.repeat(14) + 'b');`), 'wildcards');
      });
      it('finishes many non-adjacent globstar segments', () => {
        finished(bounded(dir, `return lib('a/'.repeat(30) + 'x', Array(13).fill('**').join('/a/') + '/b');`), 'globstars');
      });
      it('finishes nested extglobs against a non-matching input', () => {
        finished(bounded(dir, `return lib('a'.repeat(30) + 'c', '*(*(*(a|b)))');`), 'extglob');
      });
    });
  }
});

describe('picomatch 2', () => {
  for (const { dir, version } of copiesOf('picomatch')) {
    describe(version, () => {
      it('matches ordinary globs (control)', () => {
        const r = finished(bounded(dir, `
          return [lib('*.js')('a.js'), lib('src/**/*.ts')('src/a/b.ts'), lib('*.js')('a.ts'), lib('+(a|aa)')('aaa')];`), 'ordinary');
        assert.deepEqual(r, [true, true, false, true]);
      });
      for (const pattern of ['+(+(a))', '*(+(a))', '+(+(+(a)))']) {
        it(`finishes extglob ${pattern} on a non-matching input`, () => {
          finished(bounded(dir, `return lib(${JSON.stringify(pattern)})('a'.repeat(30) + 'b');`), pattern);
        });
      }
    });
  }
});
