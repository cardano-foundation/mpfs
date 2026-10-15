# Unresolved security findings

Reproductions that fail by design. They are not part of the `yarn test:security` gate.

| Package | Locked version | Failing reproduction |
| --- | --- | --- |
| minimatch 3 | 3.1.2 | repeated wildcards, non-adjacent globstars and nested extglobs run until killed at the deadline |
| picomatch 2 | 2.3.1 | extglobs `+(+(a))`, `*(+(a))` and `+(+(+(a)))` run until killed at the deadline |

The repair attempt did not close these:

- minimatch 3.1.5 (the last 3.x release) fixes the wildcard and globstar cases but no 3.x release changes extglob compilation, so nested extglobs still take exponential time.
- picomatch 2.3.2 stops the extglob stall but no longer matches `+(a|aa)` against `aaa`, which 2.3.1 matched.

Tracked in #44. Run `yarn test:security-findings`; it exits nonzero until both are repaired.
