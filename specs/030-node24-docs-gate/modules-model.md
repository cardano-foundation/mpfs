# Build responsibilities

Both off_chain/docker Dockerfiles own deployable runtime selection and frozen installation. The service GitHub workflow owns runtime-equivalent validation. The new docs workflow owns the distinct Docusaurus lock/build check; the MkDocs publisher retains its existing role. Application modules and dependency direction remain unchanged.
