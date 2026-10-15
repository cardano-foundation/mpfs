# Axios security qualification

Implementation `da8779bb101e8660055d713b8ff566dd3243c09e`, image `sha256:ddc607d2f882c343a6c1c3822bfe8bc621986ba039cf4231349f86e3bc0c5cef`, frozen lock SHA256 `988d2f8ec2d1a9741c74ad71d3b4f17c317fa47c1fca314de07813655cb7915c`. The source-imported client now declares Axios ^1.20.0; its actual adapter moves from a transitive 0.28.1 to 1.20.0. Both nested 1.9.0 copies are deduplicated into the patched root. The older SDK's ^0.28.0 constraint retains its own 0.28.1 copy; no major override was applied.

A bounded 4096-byte data URL with maxContentLength 1024 fails in all three old consumer resolutions (actual Vitest exit 1, three failures/five passes) and is rejected correctly after the patch (eight passes). Ordinary GET/POST behavior, the complete actual /tokens payload, within-limit data and a 400response are checked over real loopback HTTP. This directly demonstrates GHSA-4hjh-wcwx-xvwj; other advisories are supported by official patched-version/range evidence, not per-advisory exploit tests. Temporary wrapper exit propagation was corrected and tested with a deliberate failing subject before the full candidate gate; the original actual failing assertions are preserved.

The candidate image passed 45 AVA tests with the same two old skips and 92 Vitest tests in 19 files (baseline 84 plus eight new cases). Aiken check/build and compiled validator comparison passed. Both exact-implementation-head hosted jobs passed: [MPFS](https://github.com/cardano-foundation/mpfs/actions/runs/38736969534) and [Docusaurus](https://github.com/cardano-foundation/mpfs/actions/runs/38736969284). The source/lock diff is focused on Axios and its required dependency edges; no application/validator behavior was edited.

The refreshed npm audit adds no high/critical advisory. npm's propagated package counts remain 62 high/3 critical (total 94→93), and are distinct from GitHub alert rows. Independent lock reconciliation finds exactly 12 target high rows without a current vulnerable-version match, while the older 0.x family remains. No GitHub closure is claimed before rescan.

Six preprod transactions confirmed the full journey:

| Operation | Confirmed transaction | Slot |
|---|---|---|
| boot | `1da45955253106cf652e55b5d9a05e5ec60c8d23d8d1f52463a2439e0f1bc2b6` | 136385129 |
| request-insert | `d75942024c5e0a794789baea8833679d7c618de37fb3f5d055f1332f2e6e245c` | 136385202 |
| update | `ba1e833d1b295045b14412c75da3fff540eec36c3ff130b923617a8b99077401` | 136385236 |
| request-for-retraction | `d76d38e4c18aa1a665f7fcca2d3866ca133e9e303cfb6fa888ddf954644e7771` | 136385313 |
| retract | `c953f57048ec39a1aa50a22479f718477a9ba82016c3bce9067196bb3063a21c` | 136385349 |
| end-dedicated-token | `b6998a3f2bb4867f035a1ac7fe3b50092a5db036791d35e7f033226625883d72` | 136385406 |

The inserted fact and retraction were verified, the dedicated token was removed and all 13 existing tokens' states/facts remained unchanged from checkpoint 136385099 through 136385489. Live and candidate final snapshots match. Validator hash `c1e392ee7da9415f946de9d2aef9607322b47d6e84e8142ef0c340bf`; compiled hex-text SHA256 `0ee6aa6ecf8169d2ea0052de7229f705ac2acd299f8cb4b0698dae5f2811542b`.

Machine evidence is in qualification.json. Author handoff SHA256 d4e020c7a0332672718b86ccffad0518b10c154a30309408eca49091b3816856; receipt 518870f5c49e150858b61ba171073a771da3b06614d0eec52e6eef94c8304a56. Full logs, actual audit snapshots and original regression failures remain under /code/mpfs-security-execution-20261015/sonnet-axios and evidence. The inherited issue #33 funding timing limitation is retained; this gate passed once and does not prove that fixture issue fixed. One authorized Sonnet writer, coordinator review and hosted CI; no independent audit, release or deployment claim.
