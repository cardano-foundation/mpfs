# Release implementation plan

Keep the release within its dependency compatibility scope: constrain Vite to the patched 6.4.4 line, update the fixable proxy-addr patch, regenerate the complete npm lock with npm 10.8.2 and verify frozen installation in the deployed Node 18 environment. Existing bundled npm/tar and Vitest worker vulnerabilities remain explicitly reported unless a compatible repair is verified; do not apply unreviewed major overrides to bundled npm internals.

Investigate the hosted trie and retraction failures before editing production code. Execute the exact candidate in a private Yaci DevKit. Add regression tests that exercise the demonstrated failures before implementing fixes. Isolate test fixtures from test declarations so imports cannot register unrelated suites or contaminate mocking scopes. Fix a runtime defect only after a failing behavioral test identifies it; preserve the gate's original scenarios.

Make both Docker builds use frozen installation and pin the base image digest. Preserve the existing compiled validator artifact, verify its identity in the image, and record source revision in OCI labels. Run local gates before pushing, then require passing hosted checks at the final head. Merge through the merge guard using a merge commit.

Publish a new image tag and registry digest, then deploy only MPFS on epyc followed by Foundation. Capture stopped-database backups and previous images separately on both hosts. Verify canary/API/trie/checkpoint/sync and real transaction-building boundaries, record deployment receipts, and retain rollback material through the observation period. Update maintained infrastructure configuration so normal Compose restarts retain the accepted image.
