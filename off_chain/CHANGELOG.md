
## v1.1.0 - 2025-10-22

### Changed (breaking)
- `request-insert` now expects `newValue` instead of `value` as parameter name.
- `request-delete` now expects `oldValue` instead of `value` as parameter name.

### Added

- `facts` now reports slot number along-side value for each key. This is the slot of the last change made to that key.

## v1.0.0 - 2025-06-15

### Added
- Initial implementation of _Merkle-Patricia Forestry Service (MPFS)_, a service around merkle-patricia-forestries with an on-chain (Aiken) and off-chain (Node.js) backend.