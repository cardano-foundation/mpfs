# Consumer ownership

The service router consumes path-to-regexp through Express, the indexer consumes ws through its Ogmios connection, and the devkit/native tooling reaches tar-fs through dockerode. Other targeted utilities retain their existing parent ownership. The manifest/lock own version selection; narrow tests exercise actual consumers and security boundaries. No module direction, public API, database schema, wallet role or validator change is introduced.
