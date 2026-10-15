// postcss, source-map-js, browserslist and nanoid sit under the Docusaurus CSS and bundler
// pipeline. Hostile maps, queries and sizes must be refused or finish; ordinary use works.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { bounded, copiesOf, finished } from './helpers/assertions.mjs';

const fixtures = mkdtempSync(join(tmpdir(), 'docs-security-'));
after(() => rmSync(fixtures, { recursive: true, force: true }));
mkdirSync(join(fixtures, 'src'));
mkdirSync(join(fixtures, 'outside'));
const CANARY = 'TOPSECRET-CANARY-9';
writeFileSync(join(fixtures, 'src', 'secret.txt'), CANARY);
writeFileSync(join(fixtures, 'src', 'near.css.map'),
  JSON.stringify({ version: 3, file: 'near.css', sources: ['near-source.scss'], names: [], mappings: 'AAAA' }));
writeFileSync(join(fixtures, 'outside', 'leak.map'),
  JSON.stringify({ version: 3, file: 'x.css', sources: ['outside-secret-source.scss'], names: [], mappings: 'AAAA' }));

describe('postcss', () => {
  for (const { dir, version } of copiesOf('postcss')) {
    describe(version, () => {
      const from = join(fixtures, 'src', 'in.css');
      const run = (css, extra = '') => finished(bounded(dir, `
        const postcss = lib;
        try {
          const r = postcss().process(${JSON.stringify(css)}, { from: ${JSON.stringify(from)}, to: ${JSON.stringify(join(fixtures, 'src', 'o.css'))}, ${extra} });
          return { css: r.css, sources: r.map ? r.map.toJSON().sources : null };
        } catch (e) { return { threw: e.message }; }`), css);

      it('processes ordinary CSS and honours an inline source map (control)', () => {
        const inline = 'data:application/json;base64,' + Buffer.from(JSON.stringify(
          { version: 3, file: 'x.css', sources: ['inline-source.scss'], names: [], mappings: 'AAAA' })).toString('base64');
        const r = run(`a{b:c}\n/*# sourceMappingURL=${inline} */`, 'map: { inline: false }');
        assert.equal(r.threw, undefined);
        assert.match(r.css, /a\s*\{\s*b:\s*c/);
        assert.ok(r.sources.some((s) => s.includes('inline-source.scss')), JSON.stringify(r.sources));
      });
      it('does not read an arbitrary file named by a sourceMappingURL comment', () => {
        const r = run('a{b:c}\n/*# sourceMappingURL=secret.txt */');
        assert.ok(!JSON.stringify(r).includes(CANARY), `file contents leaked: ${JSON.stringify(r)}`);
      });
      it('does not load a source map from outside the stylesheet directory', () => {
        const r = run('a{b:c}\n/*# sourceMappingURL=../outside/leak.map */', 'map: { inline: false }');
        assert.ok(!JSON.stringify(r).includes('outside-secret-source'), `outside map loaded: ${JSON.stringify(r)}`);
      });
    });
  }
});

describe('source-map-js', () => {
  for (const { dir, version } of copiesOf('source-map-js')) {
    describe(version, () => {
      it('maps through an ordinary indexed source map (control)', () => {
        const r = finished(bounded(dir, `
          const c = new lib.SourceMapConsumer({ version: 3, sections: [{ offset: { line: 1, column: 0 },
            map: { version: 3, sources: ['a.js'], names: [], mappings: 'AAAA' } }] });
          return c.originalPositionFor({ line: 2, column: 1 });`), 'ordinary');
        assert.deepEqual(r, { source: 'a.js', line: 1, column: 0, name: null });
      });
      it('refuses or finishes an indexed map with a huge section offset line', () => {
        finished(bounded(dir, `
          try {
            const c = new lib.SourceMapConsumer({ version: 3, sections: [{ offset: { line: 30000000, column: 0 },
              map: { version: 3, sources: ['a.js'], names: [], mappings: 'AAAA' } }] });
            return lib.SourceNode.fromStringWithSourceMap('x\\n', c).toString().length;
          } catch (e) { return 'rejected'; }`, { heapMb: 96 }), 'section offset');
      });
    });
  }
});

describe('browserslist', () => {
  for (const { dir, version } of copiesOf('browserslist')) {
    describe(version, () => {
      it('resolves an ordinary query (control)', () => {
        const r = finished(bounded(dir, `return lib('last 2 chrome versions').map((x) => x.split(' ')[0]);`), 'ordinary');
        assert.deepEqual(r, ['chrome', 'chrome']);
      });
      it('survives usage statistics keyed by Object.prototype names', () => {
        const r = finished(bounded(dir, `
          try {
            lib('> 1% in my stats', { stats: { toString: { onekey: 5 }, chrome: { 100: 50 } } });
          } catch (e) { return { threw: e.message }; }
          return { polluted: Object.prototype.hasOwnProperty.call(Object.prototype, 'onekey') };`), 'stats');
        assert.equal(r.threw, undefined, `crashed: ${r.threw}`);
        assert.equal(r.polluted, false);
      });
      it('does not grow its result cache without bound across distinct queries', () => {
        finished(bounded(dir, `
          const pad = 'e'.repeat(32000);
          for (let i = 0; i < 3000; i++) lib('last 1 versions', { env: i + pad });
          return 'done';`, { heapMb: 64, deadlineMs: 8000 }), 'distinct queries');
      });
    });
  }
});

describe('nanoid 3', () => {
  for (const { dir, version } of copiesOf('nanoid')) {
    describe(version, () => {
      it('generates distinct ids of the requested size (control)', () => {
        const r = finished(bounded(dir, `
          const ids = new Set(Array.from({ length: 50 }, () => lib.nanoid()));
          return [ids.size, lib.nanoid(8).length, lib.customAlphabet('ab', 12)().length];`), 'ordinary');
        assert.deepEqual(r, [50, 8, 12]);
      });
      it('keeps ids random after an out-of-range size is requested', () => {
        const r = finished(bounded(dir, `
          lib.nanoid();
          try { lib.nanoid(2147483648); } catch {}
          return [lib.nanoid(), lib.nanoid()];`), 'overflow');
        assert.notEqual(r[0], r[1]);
        assert.doesNotMatch(r[0], /^u+$/);
      });
      it('finishes a non-secure custom alphabet with a negative size', () => {
        finished(bounded(dir, `
          const ns = rq(dir + '/non-secure');
          try { return ns.customAlphabet('abc', -1)(); } catch { return 'rejected'; }`), 'negative size');
      });
      it('finishes a custom alphabet and custom random with size zero', () => {
        finished(bounded(dir, `try { return lib.customAlphabet('abc', 0)(); } catch { return 'rejected'; }`), 'size zero');
        finished(bounded(dir, `try { return lib.customRandom('abc', 0, (n) => new Uint8Array(n))(); } catch { return 'rejected'; }`), 'custom random size zero');
      });
    });
  }
});
