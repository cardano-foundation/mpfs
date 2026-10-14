# MPFS v1.3.1 release evidence

Accepted source: `e322e658a1f2622168f8a234980bb78a48d1c070`, merged by [PR #27](https://github.com/cardano-foundation/mpfs/pull/27) as `8b9806e1a33a2fa41a98cec53de90ab67a707669`. Their trees match: `5ad1f399ea80528fe05e4584c3ab678fe4a18b42`.

[Release v1.3.1](https://github.com/cardano-foundation/mpfs/releases/tag/v1.3.1) ships `ghcr.io/cardano-foundation/mpfs/mpfs:v1.3.1@sha256:7ae4f6dbadde0f823371a0aba6173807e89d7d2167de5db9bfd72951e9df524b` for linux/amd64. Its OCI revision is the accepted source. Runtime Node 18.20.8/npm 10.8.2 and installed lock hash `99f7eed9de4d622b1432012b4d1a9e4cf7bd1829735c51274acd5cd17bf8751c` were read from the running image on both hosts. Validator hash `c1e392ee7da9415f946de9d2aef9607322b47d6e84e8142ef0c340bf` and compiled code remain unchanged.

## Checks and live transactions

Host and container gates each passed 84 Vitest cases and 45 AVA cases, with two existing AVA skips. Three timing regressions failed when production repairs were reverted and passed with the repair. Aiken 1.1.16 check/build passed and compiled validator code matched the deployed blueprint. Frozen npm/Yarn installations and the Docusaurus build passed.

The [accepted-head hosted gate](https://github.com/cardano-foundation/mpfs/actions/runs/38546710466) and [merged service gate](https://github.com/cardano-foundation/mpfs/actions/runs/38548511024) passed. A preexisting broken manual link was corrected in `b288981ab929ea558d32afe86d510733ea138342`; its [publisher](https://github.com/cardano-foundation/mpfs/actions/runs/38550226418) and [service gate](https://github.com/cardano-foundation/mpfs/actions/runs/38550226484) passed, and the served getting-started page was verified.

A dedicated preprod token completed boot, request, update, request, retract and end with the qualified image. Confirmed update: `3d377653b7148edc0bd46afe2c1847bafcd4ebf4093e890dfa78a3651a9f00a6`. Confirmed retract: `402fa9a9cfe72483facaca66d12ae705b53b3a3f6d6d3e50048e5863ff7c6704`. End: `894a62d043a765e9889e033c09916c1ab90bd5610df8d6157fd8b21447dea793`. The inserted fact was observed, the retracted request disappeared, and inventory returned to 13 tokens.

## Deployment and recovery

Both MPFS instances use the same accepted registry digest in their persisted Compose configurations. Epyc runs `mpfs-compose-mpfs-1`; Foundation runs `mpfs-mpfs-1`. Separate stopped-database archives were hashed and test-extracted before rollout; previous configurations/images remain retained. Foundation configuration [HAL PR #30](https://github.com/cardano-foundation/hal/pull/30) merged as `e7fab1b1acb24f8f8c50804e8887958350e07722`; epyc infrastructure commit is `97c8c2e`.

Controlled MPFS restarts retained all 13 token states/facts. Epyc passed at least 30 minutes before Foundation rollout. A genuine token update during that window was confirmed by Yaci and the still-old Foundation instance; it was accounted for when comparing snapshots.

At the operator's additional request, the two MPFS preprod Cardano nodes were upgraded from 11.1.2 to [11.1.3](https://github.com/IntersectMBO/cardano-node/releases/tag/11.1.3), digest `c526d01a6d5c866a05109f0e79cca6a4c0e90fd359f846cc983a788f320bf570`, binary revision `938cba990357ae7c4b7f95c8f75dd9d31174bbeb`. Existing databases and IPC/config mounts were retained. Foundation [HAL PR #31](https://github.com/cardano-foundation/hal/pull/31) merged as `d3b2d9b94aee6de02d108058feb0af5007cec31e`; epyc source commit is `8110e01`.

Each node reached 100% sync, Ogmios reconnected, and Yaci reported synced/receiving blocks. MPFS needed a controlled restart after its dependency connection was interrupted. Post-upgrade unsigned script construction/evaluation passed independently on both deployments using actual Ogmios cost-model vectors 332/332/350, digest `8430db226d71e399a2bb0e119e983b36f252fc7da25f339b444d0de792255ec2`; neither transaction was signed or submitted.

Observation logs and their computed summaries are retained with the operator receipts below. Final rollout acceptance is recorded in [the receipt PR](https://github.com/cardano-foundation/mpfs/pull/28) after the observations complete.

## Operator receipts and limits

Execution records live under `/code/mpfs-review-27-20261014/execution/`, including the full test logs, transaction journey, image readback, per-host snapshots and sampled observation logs. Epyc MPFS backups are under `/srv/prod-hot/services/mpfs-compose/receipts/pr27-20261014`; Foundation backups are under `/home/paolino/deployment-receipts/mpfs-pr27-20261014`. These are operator-host paths, not public downloadable artifacts. Node upgrade receipts include configuration/image/checkpoint records, not complete node database backups. Node downgrade database compatibility was not tested.

Seven of eight targeted Dependabot alerts closed after merge; bundled tar alert #235 remains open. npm audit still reports 94 entries, including three critical package entries (tar, tinypool and vitest). The current GitHub scan has five open critical alerts: two tinypool alerts, bundled tar, and docs-only shell-quote/proxy-addr alerts. This release does not claim complete critical remediation.

Automatic MPFS WebSocket recovery after a node restart was not demonstrated; controlled restart restored service. Foundation deploys from the exact merged HAL revision in a detached checkout, preserving its divergent local main branch.

The docs-only fix `b288981a` bypassed the intended PR flow because its branch inherited `origin/main` under `push.default=upstream`. No history rewrite followed. Subsequent branch pushes specify the remote destination explicitly.
