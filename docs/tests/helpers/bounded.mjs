// Run a snippet in a child Node process with a hard wall-clock deadline and a
// small heap, so a vulnerable dependency can only ever cost `deadlineMs`.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const docsRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Every installed copy of a package, found by walking node_modules.
export function installedCopies(name) {
  const found = [];
  const walk = (nm) => {
    let entries;
    try {
      entries = readdirSync(nm);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.startsWith('.')) continue;
      const dir = join(nm, e);
      if (e.startsWith('@')) {
        for (const s of readdirSync(dir)) visit(join(dir, s));
      } else {
        visit(dir);
      }
    }
  };
  const visit = (dir) => {
    try {
      if (!statSync(dir).isDirectory()) return;
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      if (pkg.name === name) found.push({ dir, version: pkg.version });
    } catch {
      // not a package directory
    }
    walk(join(dir, 'node_modules'));
  };
  walk(join(docsRoot, 'node_modules'));
  return found;
}

// `body` is the text of an async function; it receives `dir` and returns a
// JSON-serialisable value printed as the single stdout result line.
export function runBounded(dir, body, { deadlineMs = 4000, heapMb = 128, stackKb } = {}) {
  const script = `
    const dir = process.argv[1];
    (async () => {
      const out = await (async () => { ${body} })();
      process.stdout.write('RESULT ' + JSON.stringify(out === undefined ? null : out) + '\\n');
    })().catch((e) => {
      process.stdout.write('RESULT ' + JSON.stringify({ threw: String((e && e.message) || e).slice(0, 200) }) + '\\n');
    });
  `;
  const flags = [`--max-old-space-size=${heapMb}`];
  if (stackKb) flags.push(`--stack-size=${stackKb}`);
  const start = Date.now();
  // `ulimit -c 0` first: an intentional out-of-memory abort of a vulnerable dependency must not write a core dump.
  const r = spawnSync('sh', ['-c', 'ulimit -c 0; exec "$@"', 'sh', process.execPath, ...flags, '-e', script, dir], {
    encoding: 'utf8',
    timeout: deadlineMs,
    killSignal: 'SIGKILL',
    maxBuffer: 1 << 20,
  });
  const ms = Date.now() - start;
  const timedOut = r.error?.code === 'ETIMEDOUT';
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
  return {
    timedOut,
    ms,
    status: r.status,
    signal: r.signal,
    // Only a child that wrote its result line AND exited normally counts as having finished.
    crashed: !timedOut && (!line || r.status !== 0 || r.signal !== null),
    result: line ? JSON.parse(line.slice(7)) : undefined,
    stderr: (r.stderr || '').slice(0, 300),
  };
}
