# Qualification strategy

Keep application code and validator bytes fixed while moving Docker and service CI together to an immutable Node24 image and explicit compatible installer. Qualify frozen installation, native LevelDB and the complete existing service suite under the new runtime. Add a separate Docusaurus PR job; the existing MkDocs publisher cannot supply that evidence.

Use one writer and hosted CI as the gate for this build-plumbing slice. The coordinator owns review, push, live-preprod confirmation and merge. No additional agents or production mutations are delegated. Build one linux/amd64 candidate image from the exact accepted tree and retain source/image/lock/validator identities. Confirm a dedicated preprod journey before merge because the runtime also hosts native/WASM crypto. Retain complete baseline failures and distinguish setup errors from behavioral failures.

The existing136-high planning snapshot is not a current closure receipt. Later dependency PRs refresh and reconcile the per-alert ledger separately. Do not fold major SDK upgrades or unrelated behavior fixes into this prerequisite.
