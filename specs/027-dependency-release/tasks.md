# Release tasks

- [X] T001 Repair the dependency graph and frozen builds; use the base-pass/candidate-fail npm 10.8.2 installation as the regression proof and verify the final install and dependency versions. Commit dependencies and their build changes together.
- [X] T002 Diagnose the full integration gate, execute regression tests before code repairs, and commit each demonstrated cause with its tests. Preserve retraction, update, rollback and cost-model scenarios.
- [X] T003 Run the complete local gate, correct PR claims and residual advisories, push and obtain final-head hosted checks.
- [ ] T004 Merge, publish one verified image, deploy epyc and Foundation with separate backups, and record verification and rollback receipts.

Local evidence on 14 October 2026: Node 18/npm 10 frozen installation passes; Vite 6.4.4 and proxy-addr 2.0.8 are installed. Three timing regressions fail with reverted production code and pass with the repair. Aiken 1.1.16 check/build passes and rebuilt validator code matches the deployed blueprint. Full Vitest: 84 passed, 18 files; AVA: 45 passed, 2 existing skips. Frozen Yarn and Docusaurus build passed in the review. npm audit: 94 total, 3 critical entries remain (bundled tar, tinypool and vitest); no complete critical remediation is claimed. Accepted-head hosted checks and image qualification passed. Both hosts are deployed; final observation is pending. See [deployment.md](deployment.md) for exact identities, transaction evidence and remaining limits.
