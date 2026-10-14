# Reproducible dependency security release

As an MPFS operator, I install a fixed dependency tree, retain existing preprod token state and transaction behavior, and can restore the previous image and database if verification fails.

The release repairs PR #27's incomplete npm lock and unintended Vite major upgrade, accurately reports remaining security advisories, and repairs the causes of the failing integration gate. It publishes one digest-bound image for the epyc and Foundation signingless services. Validator compiled code, network selection, service API and persistent database format remain bound to the deployed v1.3.0 baseline. Any validator identity change stops this release.

Acceptance requires frozen installation with the container's Node/npm versions, patched target package versions, an explicit residual advisory report, Aiken check/build, the full AVA and Yaci/Vitest gate, built-image verification, and per-host API/state/sync checks. A transaction-construction behavior repair also requires the constitution's confirmed live preprod transaction before merge. Existing test timeouts or transient passes cannot substitute for a deterministic repair.

The existing review and deployment plan live outside the repository at `/code/mpfs-review-27-20261014/`. They contain the original candidate, regression receipts, host inventory and rollback details. This release does not alter Haskell UMPFS deployments.
