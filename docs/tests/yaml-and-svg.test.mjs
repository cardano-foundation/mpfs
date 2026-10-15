// js-yaml 3 and 4 parse front matter and config; svgo 3 optimises SVG assets.
// Hostile documents must finish; ordinary documents must parse the same as before.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bounded, copiesOf, finished } from './helpers/assertions.mjs';

const MERGE_CHAIN = `
  const n = 4000;
  const lines = ['a0: &a0 { k0: 0 }'];
  for (let i = 1; i < n; i++) lines.push('a' + i + ': &a' + i + ' { <<: *a' + (i - 1) + ', k' + i + ': ' + i + ' }');
  lines.push('b: *a' + (n - 1));
  const src = lines.join('\\n') + '\\n';`;
const OMAP = `
  const n = 150000;
  const src = '!!omap\\n' + Array.from({ length: n }, (_, i) => '- k' + i + ': ' + i).join('\\n') + '\\n';`;
const EMPTY_MERGES = `
  const n = 20000;
  const src = 'arr: &arr [' + '{},'.repeat(n).slice(0, -1) + ']\\ntargets:\\n' + '  - <<: *arr\\n'.repeat(n);`;

// A hostile document may be rejected with an error or parsed; it must not stall or crash.
const attempt = (payload, parse) => `${payload} try { ${parse}; return 'parsed'; } catch (e) { return 'rejected'; }`;

describe('js-yaml', () => {
  for (const { dir, version } of copiesOf('js-yaml')) {
    describe(version, () => {
      it('parses ordinary documents, merge keys and ordered maps (control)', () => {
        const r = finished(bounded(dir, `
          const a = lib.load('a: 1\\nb: [x, y]\\nc: {d: true}');
          const m = lib.load('base: &b {x: 1}\\nd:\\n  <<: *b\\n  y: 2');
          const o = lib.load('!!omap\\n- a: 1\\n- b: 2');
          return [a, m.d, o];`), 'ordinary');
        assert.deepEqual(r, [{ a: 1, b: ['x', 'y'], c: { d: true } }, { x: 1, y: 2 }, [{ a: 1 }, { b: 2 }]]);
      });
      it('finishes a chain of mappings that each merge the previous one', () => {
        finished(bounded(dir, attempt(MERGE_CHAIN, 'lib.load(src)'), { heapMb: 96 }), 'merge chain');
      });
      it('finishes a large ordered map', () => {
        finished(bounded(dir, attempt(OMAP, 'lib.load(src)')), 'omap');
      });
      it('finishes repeated merges of empty mappings', () => {
        finished(bounded(dir, attempt(EMPTY_MERGES, 'lib.load(src)')), 'empty merges');
      });
    });
  }
});

describe('gray-matter front matter (the Docusaurus consumer of js-yaml 3)', () => {
  for (const { dir, version } of copiesOf('gray-matter')) {
    describe(version, () => {
      it('parses ordinary front matter (control)', () => {
        const r = finished(bounded(dir, `const f = lib('---\\ntitle: Hello\\ntags: [a, b]\\n---\\nbody\\n'); return [f.data, f.content];`), 'ordinary');
        assert.deepEqual(r, [{ title: 'Hello', tags: ['a', 'b'] }, 'body\n']);
      });
      it('finishes hostile front matter', () => {
        finished(bounded(dir, attempt(MERGE_CHAIN, `lib('---\\n' + src + '---\\nbody\\n')`), { heapMb: 96 }), 'merge chain');
        finished(bounded(dir, attempt(OMAP, `lib('---\\n' + src + '---\\nbody\\n')`)), 'omap');
      });
    });
  }
});

const ENTITY_BOMB = `
  const e = (n, p) => '<!ENTITY lol' + n + ' "' + ('&lol' + p + ';').repeat(10) + '">';
  const svg = '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol">' +
    [1, 2, 3, 4, 5, 6, 7].map((n) => e(n, n === 1 ? '' : n - 1)).join('') + ']><lolz>&lol7;</lolz>';`;
const SCRIPT_BYPASSES = `
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" xmlns:uwu="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">' +
    '<a uwu:href="JavaScript:alert(1)"><text y="30">one</text></a>' +
    '<svg:script>alert(2)</svg:script>' +
    '<svg:a href="java&#9;script:alert(3)"><text>three</text></svg:a>' +
    '<a href="java&#10;script:alert(4)"><text>four</text></a>' +
    '<a href="https://example.com/ok"><text>kept</text></a></svg>';`;

describe('svgo 3', () => {
  for (const { dir, version } of copiesOf('svgo')) {
    describe(version, () => {
      it('optimises an ordinary SVG and keeps its shapes (control)', () => {
        const r = finished(bounded(dir, `
          const out = lib.optimize('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><g><rect width="5" height="5" fill="red"/></g></svg>');
          return out.data;`), 'ordinary');
        assert.match(r, /^<svg[^>]*>/);
        assert.match(r, /<(rect|path)\b[^>]*fill="red"/, 'the red shape was lost');
      });
      it('finishes a nested-entity DOCTYPE expansion', () => {
        finished(bounded(dir, attempt(ENTITY_BOMB, 'lib.optimize(svg)'), { heapMb: 64 }), 'entity expansion');
      });
      it('script removal strips namespaced script elements and obfuscated javascript: links', () => {
        const r = finished(bounded(dir, `${SCRIPT_BYPASSES}
          return lib.optimize(svg, { plugins: ['removeScriptElement'] }).data;`), 'removeScriptElement');
        assert.equal(typeof r, 'string', `removeScriptElement did not run: ${JSON.stringify(r)}`);
        assert.doesNotMatch(r, /script/i, 'a script element or javascript: link survived');
        assert.doesNotMatch(r, /alert/, 'script text survived');
        assert.match(r, /https:\/\/example\.com\/ok/, 'the ordinary link was removed');
      });
    });
  }
});
