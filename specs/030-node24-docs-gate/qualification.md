# Node 24 qualification

Implementation candidate: `0554beb85da2dab7238a799cad2dc2130e29333d`; image `sha256:976bedbdbad51422b48be40e69d4d476a76e2f80fd47ce09277c096954b8e011`. Application sources, test assertions/population, locks and validator bytes remain unchanged. Node 24.22.0 and npm 10.9.9 are qualified for the signingless service. Both Docker variants install the frozen lock; the unused signing variant's preexisting missing entrypoint remains a limitation.

Both exact-head hosted jobs passed: [MPFS and Aiken](https://github.com/cardano-foundation/mpfs/actions/runs/38730200031) and [Docusaurus](https://github.com/cardano-foundation/mpfs/actions/runs/38730200259). Two fresh unmodified candidate-image runs passed all 84 Vitest and 45 AVA tests, with the two existing AVA skips. Native LevelDB persistence and signingless startup/restart passed. Docusaurus frozen install/build passed; deliberate lock drift and a broken page failed those commands.

The first candidate-image run timed out in one concurrent create/delete test. It is preserved as a failure. Matched qualification-only stage traces on Node 18 and Node 24 subsequently passed and showed Yaci funding rejections plus random retry delays within the test's deadline on both runtimes. Measured token-operation latency was similar. This supports a shared fixture-timing mechanism but does not directly identify the original untraced failure. [Issue #33](https://github.com/cardano-foundation/mpfs/issues/33) retains the diagnostic debt; no retries, skips, timeout increases or assertion changes were adopted.

A dedicated preprod journey confirmed all six transactions through the candidate image, verified the inserted fact, verified retraction and removed the dedicated token:

| Operation | Confirmed transaction | Slot |
|---|---|---|
| boot | `1f4aea52c1da2e4cdfa58bac26de3b71eaecdcc17ecaec72abd1f6fdbd88dba8` | 136382643 |
| request-insert | `918db69fce108e04e448e1728b98ebabc3d1bf499cc4f16985676a853af0ca99` | 136382702 |
| update | `dc80ca1941ea7f98ed27deafebd4cb6af5ea3b14bf274aa5682eccaf632e482b` | 136382752 |
| request-for-retraction | `15e0b4e0650cb431f6e0c94ee872da62b4722eed948c08efc2a7d2b970a522df` | 136382837 |
| retract | `12cc7d219a0c859fe0964ce0935d390fede7bde5aac1cc3f495f239f2bda09ab` | 136382914 |
| end-dedicated-token | `440aef2b151991ead46e0538d311c04b479aeffe0ff1138744b63ce4419d7802` | 136383075 |

At the final checkpoint (136383086), live and candidate have identical states and facts for all 13 existing tokens. One existing token changed between the older snapshot and this journey; confirmed transaction `cc8d06a27d2906c84fedcc2afa7d63725b32d4a28ed7ba1135c48bf6ee3a63bb` at slot 136381653 predates the journey's boot at 136382643. Both runtimes followed the same new output/root. This is chain progress, not a preserved-unchanged-state claim.

Validator hash: `c1e392ee7da9415f946de9d2aef9607322b47d6e84e8142ef0c340bf`; compiled hex-text SHA256 `0ee6aa6ecf8169d2ea0052de7229f705ac2acd299f8cb4b0698dae5f2811542b`. Frozen application lock SHA256 `99f7eed9de4d622b1432012b4d1a9e4cf7bd1829735c51274acd5cd17bf8751c`. Machine identities and confirmations are in qualification.json. Full original logs and the trace patch remain under /code/mpfs-security-execution-20261015; author handoff hashes: 8c36a2a35a6237c9316dc0388ac48481ea968d8247471958d1bfba54a4a45cd9, dd6288e2461fc198bd04ac46280f28d31517b1ce9bd3e2c579657b37b543652d; diagnostic addendum bcfadc28315d808b93b19674ee911574e9beba0168dd035130ea6e88b27f4dc2.

Limits: Docusaurus typecheck retains 37 baseline errors and is excluded from the build job. Startup/restart does not prove reindexing was skipped. This prerequisite closes no high-advisory alert and makes no publication/deployment claim. One operator-authorized Sonnet writer, coordinator review and hosted CI were used; no independent audit is claimed.
