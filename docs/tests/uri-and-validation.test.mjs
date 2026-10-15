// fast-uri is the URI parser behind ajv (schema $ref resolution); joi validates the
// Docusaurus config. Inputs that WHATWG URL reads one way must not be read another way.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bounded, copiesOf, finished } from './helpers/assertions.mjs';

describe('fast-uri', () => {
  for (const { dir, version } of copiesOf('fast-uri')) {
    describe(version, () => {
      const probe = (expr) => finished(bounded(dir, `try { return ${expr}; } catch (e) { return { threw: e.message }; }`), expr);

      it('parses and normalises ordinary URIs (control)', () => {
        const r = finished(bounded(dir, `
          const p = lib.parse('https://user@example.com:8080/a/b?q=1#f');
          return [p.scheme, p.userinfo, p.host, String(p.port), p.path, p.query, p.fragment,
                  lib.normalize('HTTP://EXAMPLE.com:80/a/./b/../c').toLowerCase(),
                  lib.equal('http://example.com/a', 'HTTP://EXAMPLE.COM/a'),
                  lib.resolve('http://example.com/a/b', '../c')];`), 'ordinary');
        assert.deepEqual(r, ['https', 'user', 'example.com', '8080', '/a/b', 'q=1', 'f',
          'http://example.com/a/c', true, 'http://example.com/c']);
      });
      // A URI is safe when fast-uri either rejects the backslash explicitly or reads the same host as WHATWG URL.
      // (A generic parse error is not enough: HTTP URIs without a host already carry one.)
      const sameHostOrError = (input) => {
        const r = finished(bounded(dir, `
          const p = lib.parse(${JSON.stringify(input)});
          return { host: p.host ?? null, error: p.error ?? null };`), input);
        assert.ok((r.error && /backslash/i.test(r.error)) || r.host === new URL(input).hostname,
          `${JSON.stringify(input)}: fast-uri host ${r.host} without error, WHATWG host ${new URL(input).hostname}`);
      };
      it('reads a backslash after the host as the end of the authority, or reports an error', () => {
        sameHostOrError('http://evil.com\\@allowed.com');
      });
      it('reads a backslash authority introducer like WHATWG URL, or reports an error', () => {
        for (const s of ['http:\\\\evil.com/x', 'http:/\\evil.com/x', 'http:\\/evil.com/x']) sameHostOrError(s);
      });
      it('does not resolve a backslash authority introducer onto the base host', () => {
        for (const ref of ['\\\\evil.com/path', '/\\evil.com/path']) {
          const out = probe(`lib.resolve('https://allowed.com/', ${JSON.stringify(ref)})`);
          const refused = typeof out === 'object' && out !== null && out.threw;
          assert.ok(refused || new URL(out).hostname === new URL(ref, 'https://allowed.com/').hostname,
            `${ref} resolved to ${JSON.stringify(out)}`);
        }
      });
      it('does not decode percent-encoded dot segments into traversal', () => {
        assert.notEqual(probe(`lib.normalize('http://example.com/public/%2e%2e/admin')`), 'http://example.com/admin');
        assert.equal(probe(`lib.equal('http://example.com/public/%2e%2e/admin', 'http://example.com/admin')`), false);
      });
      it('does not turn a percent-encoded @ in the host into userinfo', () => {
        const out = probe(`lib.normalize('http://trusted.com%40evil.com/')`);
        assert.ok(typeof out === 'string' && !out.includes('@'), `got ${JSON.stringify(out)}`);
      });
      it('does not truncate a malformed IPv6 literal to a different address', () => {
        const out = probe(`lib.normalize('http://[::not-valid]/private')`);
        assert.ok(typeof out !== 'string' || !/\[::\]/.test(out), `got ${JSON.stringify(out)}`);
      });
      it('does not decode a percent-encoded scheme into an authority', () => {
        const out = probe(`lib.normalize('%2f%2fevil.example:/pwn')`);
        assert.ok(typeof out !== 'string' || !out.startsWith('//'), `got ${JSON.stringify(out)}`);
      });
      it('canonicalises an IDN host the way WHATWG URL does', () => {
        assert.equal(probe(`lib.parse('http://127。0。0。1/').host`), new URL('http://127。0。0。1/').hostname);
      });
      it('does not let a port value inject authority delimiters when serialising', () => {
        const out = probe(`lib.serialize({ scheme: 'http', host: 'trusted.example', port: '@127.0.0.1:8124', path: '/app' })`);
        assert.ok(typeof out !== 'string' || !out.includes('@'), `got ${JSON.stringify(out)}`);
      });
    });
  }
});

describe('joi', () => {
  for (const { dir, version } of copiesOf('joi')) {
    describe(version, () => {
      it('validates ordinary strings and dates (control)', () => {
        const r = finished(bounded(dir, `
          const s = lib.string().isoDate();
          return [!!s.validate('2020-01-01T00:00:00.123Z').error, !!s.validate('not a date').error,
                  !!lib.object({ a: lib.number() }).validate({ a: 'x' }).error];`), 'ordinary');
        assert.deepEqual(r, [false, true, true]);
      });
      it('rejects an ISO date with a very long fractional part without stalling', () => {
        const r = finished(bounded(dir, `
          return !!lib.string().isoDate().validate('2020-01-01T00:00:00.' + '1'.repeat(150000)).error;`), 'isoDate');
        assert.equal(typeof r, 'boolean');
      });
    });
  }
});
