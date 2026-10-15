// lodash and lodash-es compile templates, shell-quote builds and splits command lines,
// and the Babel SystemJS plugin rewrites module exports in the Docusaurus bundler.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { runBounded } from './helpers/bounded.mjs';
import { bounded, copiesOf, finished } from './helpers/assertions.mjs';

const TEMPLATE_INJECTION = `
  globalThis.__injected = 0;
  try { TEMPLATE('x', { imports: { 'a = (globalThis.__injected = 1)': undefined } }); } catch {}
  return globalThis.__injected;`;

describe('lodash', () => {
  for (const { dir, version } of copiesOf('lodash')) {
    describe(version, () => {
      it('renders an ordinary template with imports (control)', () => {
        const r = finished(bounded(dir, `return lib.template('<%= greet(name) %>', { imports: { greet: (n) => 'hi ' + n } })({ name: 'x' });`), 'ordinary');
        assert.equal(r, 'hi x');
      });
      it('does not execute code smuggled in as an imports key name', () => {
        assert.equal(finished(bounded(dir, TEMPLATE_INJECTION.replace('TEMPLATE', 'lib.template')), 'imports key'), 0);
      });
    });
  }
});

describe('lodash-es', () => {
  for (const { dir, version } of copiesOf('lodash-es')) {
    describe(version, () => {
      // lodash-es is ES-module only, so it cannot use the shared require-based preamble.
      const esm = (body) => runBounded(dir, `
        const { pathToFileURL } = await import('node:url');
        const lib = await import(pathToFileURL(dir + '/lodash.js').href);
        ${body}`);
      it('renders an ordinary template with imports (control)', () => {
        const r = finished(esm(`return lib.template('<%= greet(name) %>', { imports: { greet: (n) => 'hi ' + n } })({ name: 'x' });`), 'ordinary');
        assert.equal(r, 'hi x');
      });
      it('does not execute code smuggled in as an imports key name', () => {
        assert.equal(finished(esm(TEMPLATE_INJECTION.replace('TEMPLATE', 'lib.template')), 'imports key'), 0);
      });
    });
  }
});

describe('shell-quote', () => {
  for (const { dir, version } of copiesOf('shell-quote')) {
    describe(version, () => {
      it('quotes and parses ordinary command lines (control)', () => {
        const r = finished(bounded(dir, `
          return [lib.quote(['echo', 'a b', "it's"]), lib.parse("echo 'a b' \\"c d\\" e"), lib.parse('echo $HOME', { HOME: '/h' })];`), 'ordinary');
        assert.deepEqual(r, ["echo 'a b' \"it's\"", ['echo', 'a b', 'c d', 'e'], ['echo', '/h']]);
      });
      it('keeps a token after a comment token inert when the line is run by sh', () => {
        const out = finished(bounded(dir, `
          try { return { line: lib.quote(['printf', '%s|', 'ok', { comment: 'x' }, 'a\\necho INJECTED;#']) }; }
          catch (e) { return { refused: e.message }; }`), 'quote');
        if (out.refused !== undefined) return; // refusing the unsafe input is a safe outcome
        const sh = spawnSync('sh', ['-c', out.line], { encoding: 'utf8', timeout: 5000, cwd: '/' });
        assert.doesNotMatch(sh.stdout, /INJECTED/, `the second line ran as a command: ${JSON.stringify(sh.stdout)}`);
      });
      it('parses a long list of plain words without stalling', () => {
        finished(bounded(dir, `return lib.parse('x '.repeat(120000)).length;`), 'parse');
      });
    });
  }
});

describe('@babel/plugin-transform-modules-systemjs', () => {
  for (const { dir, version } of copiesOf('@babel/plugin-transform-modules-systemjs')) {
    describe(version, () => {
      const compile = `
        const babel = rq('@babel/core');
        const out = babel.transformSync(SRC, { configFile: false, babelrc: false, sourceType: 'module', plugins: [dir] }).code;
        const calls = [];
        globalThis.__pwn = 0;
        new Function('System', out)({ register(deps, declare) {
          const s = declare((...a) => calls.push(a), {});
          s.setters[0]({ a: 1, b: { inherited: true }, q: 2 });
        } });`;
      it('compiles an ordinary re-export to working SystemJS (control)', () => {
        const r = finished(bounded(dir, `${compile.replace('SRC', JSON.stringify('export * from "m"; export { a as renamed } from "m";'))}
          const o = calls[0][0]; return [o.q, o.renamed];`), 'ordinary');
        assert.deepEqual(r, [2, 1]);
      });
      it('does not turn a string export name into executable code', () => {
        const src = 'export * from "m"; export { a as "y = 1; globalThis.__pwn = 1; var z" } from "m";';
        const r = finished(bounded(dir, `${compile.replace('SRC', JSON.stringify(src))} return globalThis.__pwn;`), 'string export');
        assert.equal(r, 0, 'the export name ran as code');
      });
      it('keeps an export named __proto__ an own property instead of a prototype', () => {
        const src = 'export * from "m"; export { b as "__proto__" } from "m";';
        const r = finished(bounded(dir, `${compile.replace('SRC', JSON.stringify(src))}
          const o = calls[0][0]; return { own: Object.hasOwn(o, '__proto__'), inherited: o.inherited === true };`), '__proto__ export');
        assert.deepEqual(r, { own: true, inherited: false });
      });
    });
  }
});
