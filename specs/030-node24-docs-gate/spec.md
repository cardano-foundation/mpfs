# Supported runtime and documentation builds

An MPFS operator needs a supported JavaScript runtime while token state, live ledger parameter reads and transaction behavior remain unchanged. A documentation maintainer needs the Docusaurus dependency tree to be built on pull requests even though the published site uses MkDocs.

Both service Docker variants and service CI use a qualified Node24 LTS toolchain. Frozen installs reproduce their locks. Native storage, startup, the complete transaction/indexer suite and unchanged validator identity must pass. A dedicated Docusaurus PR job performs frozen Yarn installation and build; preexisting typecheck failures are baselined and reported before being made blocking. Candidates that regress these properties are held.

Scope is build/runtime/CI wiring. Dependency-family, SDK and application behavior changes remain separate. No high-alert closure is claimed by this prerequisite. Issue30 is the first slice of security epic29.
