# Documentation build ownership

The docs package manifest and Yarn lock own the Docusaurus parser/build dependencies. Existing Docusaurus plugins and loaders consume their APIs; the dedicated workflow owns reproducible installation, permanent security checks and the build gate. MkDocs retains its existing publication concern. No MPFS service, wallet, transaction, storage or on-chain module changes are introduced.
