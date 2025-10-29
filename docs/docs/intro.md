# Introduction to MPFS

## Merkle Patricia Forestry

A Merkle Patricia Forestry (MPF) is a data structure that allows storing key-value pairs (facts) in a verifiable and immutable way on the a blockchain.
For a primer on MPF, see [CF Presentation](https://cardanofoundation.org/blog/merkle-patricia-tries-deep-dive).

Storing facts inside an MPF provides cryptographic proofs of inclusion and exclusion for each fact, allowing anyone to verify the integrity of the data. When an MPF is available inside a UTxO on the Cardano blockchain i.e., transactions can refer to it as input to pass smart contract validation.

How to provide and access MPF's facts and how to publish the MPF root is left to be decided.
MPFS takes some decisions to provide a complete solution to manage MPF tokens on Cardano.

### Design choices to run MPF on Cardano

- All modifications to an MPF root have to appear on-chain. This gives anyone with access to the blockchain history the ability to reconstruct the full history of changes and so the current facts.
- All modifications must be consumed under a smart contract validation. This eliminates the burden to prove that an MPF contains only facts that are the result of modifications that have been on chain.
- MPF are owned. This gives the smart contract the ability to operate on multiple MPF tokens, each controlled by a different user. Products of MPF roots and owners are referred to as MPF tokens from now on.
- MPF token can be modified only by their owner. This gives full control to the owner on which facts are part of the MPF token. The owner of an MPF token is referred to as `oracle` from now on.
- MPF tokens have a unique identifier. This gives the ability to address a specific MPF token inside a modification.
- Specific MPF modifications are owned. This gives the modification requester the ability to retract modifications if they are not accepted by the owner. The owner of a modification request is referred to as `requester` from now on.

## MPFS: the service
_MPFS_ is an http service wrapping
    - MPF operations from the [Merkle Patricia Forestry library](https://github.com/aiken-lang/merkle-patricia-forestry) in one smart contract to track and validate each MPF history of changes
    - an off-chain transaction builder that helps building transactions to interact with the smart contract
    - an indexer over the smart contract events to reconstruct and serve the MPF state

It is designed to be used by anyone who wants to store and manage knowledge in a decentralized manner, allowing contributors to add or remove facts while ensuring the integrity and history of the knowledge database.

It is particularly useful for applications that require a verifiable and immutable record of knowledge, such as decentralized applications (dApps), knowledge management systems, and collaborative platforms.

The service comes in 2 flavors signingful and signingless. The signingful version is suitable for local installations where it controls a private key for the user, while the signingless version is suitable for remote installations where the user has to provide a signature for each transaction. This introduction focuses on the signingless version, which is the one used in production in some projects.

## Pre-requisites

Being an HTTP service no particular skill is required to use it, but some knowledge of Cardano transactions and smart contracts is useful to understand how to interact with it.

Deployment has some external requirements:
1. [Yaci store](https://github.com/bloxbean/yaci-store). This is required to provide address to utxo mapping. When building transactions the user will provide an address that he controls and wants to spend from. The service will use the Yaci store to find the UTxOs that are associated with that address and build the transaction accordingly.
2. [Ogmios](https://github.com/cardanoSolutions/ogmios). This is required to track the events involving the system address.
3. [Cardano node](https://github.com/intersectMBO/cardano-node). This is indirectly required by both Yaci store and Ogmios.

The mpfs service in itself is a typescript application so any nodejs supported platform should be able to run it. It is tested on Linux and MacOS, but it should work on Windows as well.

## Getting started

### Docker

The image is available on ghcr.io and can be pulled with the command:

```bash
docker pull ghcr.io/cardano-foundation/mpfs/mpfs:v1.1.0
```

This is an expample of a working deployment: [mpfs in CF](https://github.com/cardano-foundation/hal/blob/main/docs/deployment/mpfs/docker-compose.yml)
Consider sourcing [bootstrap.sh](https://github.com/cardano-foundation/hal/blob/main/docs/deployment/mpfs/bootstrap.sh) as mentioned in [setup instructions](https://github.com/cardano-foundation/hal/blob/main/docs/deployment/mpfs/README.md) to speedup the node syncing.

### Source

Altenatively, you can run the service from source. To do so, you need to have nodejs and npm and installed on your system. Then you can clone the repository and run the following commands:

```bash
git clone https://github.com/cardano-foundation/mpfs
cd off_chain
npx tsx src/service/signingless/main.ts --port 3000 \
    --provider yaci --yaci-store-host http://localhost:8080 \
    --ogmios-host http://localhost:1337 \
    --database-path ./mpfs.db \
    --since-slot 94898393 \
    --since-block-id ef94934f8eb129ebf07eeaab007b81ecb1bc58b121d19ac0ffe81f928bf56cc
```

This will start the service on port 3000, using the Yaci store running on http://localhost:8080 and the Ogmios server running on http://localhost:1337. The database will be stored in the file `mpfs.db` in the current directory. The `since-slot` and `since-block-id` parameters are used to specify the starting point for the service to track events.

> Be careful to start indexing before the token you are going to use was created. If you are creating a new token, just start from nowish.

## Usage

- [Signingless API Reference](https://mpfs.plutimus.com/api-docs)
