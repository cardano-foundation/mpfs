# Merkle Patricia Forestry Service (MPFS)

[![Documentation](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://cardano-foundation.github.io/mpfs/)
[![License](https://img.shields.io/badge/license-Apache%202.0-green)](LICENSE)

MPFS is a Cardano-native service for managing verifiable key-value stores using Merkle Patricia Forestry (MPF) data structures on-chain.

## Overview

MPFS enables:

- **Verifiable Data Storage**: Store key-value pairs (facts) with cryptographic proofs of inclusion/exclusion
- **On-chain Validation**: All modifications are validated by Cardano smart contracts
- **Decentralized Knowledge**: Build dApps, knowledge bases, and collaborative platforms with immutable history

## Architecture

```
┌─────────────┐     ┌─────────────────┐     ┌────────────────┐
│   Client    │────▶│   MPFS Service  │────▶│    Cardano     │
│  (Wallet)   │     │  (TypeScript)   │     │   Blockchain   │
└─────────────┘     └─────────────────┘     └────────────────┘
                            │
                    ┌───────┴───────┐
                    ▼               ▼
            ┌───────────┐   ┌───────────────┐
            │  Indexer  │   │  Trie Manager │
            │ (Ogmios)  │   │    (MPF)      │
            └───────────┘   └───────────────┘
```

## Quick Start

### Using Docker

```bash
docker pull ghcr.io/cardano-foundation/mpfs/mpfs:v1.1.0
```

See the [deployment guide](https://github.com/cardano-foundation/hal/blob/main/docs/deployment/mpfs/README.md) for full setup instructions.

### From Source

```bash
git clone https://github.com/cardano-foundation/mpfs
cd mpfs/off_chain
npm install
npx tsx src/service/signingless/main.ts --port 3000 \
    --provider yaci --yaci-store-host http://localhost:8080 \
    --ogmios-host http://localhost:1337 \
    --database-path ./mpfs.db \
    --since-slot 94898393 \
    --since-block-id ef94934f8eb129ebf07eeaab007b81ecb1bc58b121d19ac0ffe81f928bf56cc
```

### Development with Nix

```bash
nix develop
```

This provides all development tools including:
- Node.js and npm
- Aiken (smart contract language)
- Cardano node and CLI tools
- mkdocs for documentation

## Documentation

Full documentation is available at [cardano-foundation.github.io/mpfs](https://cardano-foundation.github.io/mpfs/).

### Building Docs Locally

```bash
nix develop
mkdocs serve
```

Then open http://localhost:8000 in your browser.

## Project Structure

```
mpfs/
├── on_chain/           # Aiken smart contracts
│   └── validators/     # Cage validator and types
├── off_chain/          # TypeScript service
│   └── src/
│       ├── service/    # HTTP API (signingless/signingful)
│       ├── transactions/ # Transaction builders
│       ├── indexer/    # Chain event indexer
│       └── trie/       # MPF trie management
├── docs-mkdocs/        # Documentation (mkdocs)
└── flake.nix           # Nix development environment
```

## API

A public preprod instance is available at [mpfs.plutimus.com](https://mpfs.plutimus.com).

See the [API Reference](https://cardano-foundation.github.io/mpfs/swagger-ui/) for full documentation.

### Key Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /tokens` | List all MPF tokens |
| `GET /token/{id}` | Get token state and requests |
| `GET /token/{id}/facts` | Get all facts in a token |
| `GET /transaction/{addr}/boot-token` | Create a new token |
| `POST /transaction/{addr}/request-insert/{id}` | Request to insert a fact |
| `GET /transaction/{addr}/update-token/{id}` | Process pending requests |

## Dependencies

- [Yaci Store](https://github.com/bloxbean/yaci-store) - Address to UTxO mapping
- [Ogmios](https://github.com/cardanoSolutions/ogmios) - Chain event tracking
- [Cardano Node](https://github.com/intersectMBO/cardano-node) - Blockchain access

## Code Tracking

We use [Radicle](https://radicle.xyz/) for decentralized code tracking:

[rad:zpZ4szHxvnyVyDiy2acfcVEzxza9](https://app.radicle.xyz/nodes/seed.radicle.garden/rad:zpZ4szHxvnyVyDiy2acfcVEzxza9)

## See Also

- [HAL - Cardano Foundation](https://github.com/cardano-foundation/hal)
- [Merkle Patricia Forestry Library](https://github.com/aiken-lang/merkle-patricia-forestry)
- [Cardano Foundation](https://github.com/cardano-foundation)
- [About Cardano](https://cardano.org/)

## License

Apache 2.0
