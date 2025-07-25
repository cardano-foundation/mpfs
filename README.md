# Merkle Patricia Forestry Service (MPFS)

_MPFS_ is an http service wrapping the functionalities from the [Merkle Patricia Forestry library](https://github.com/aiken-lang/merkle-patricia-forestry) in one smart contract tracking and controlling the merkle-tree history of changes and an off-chain transaction builder that helps building transactions to interact with the smart contract.

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

### Linux and docker

If you are on linux you can use the docker image paolino/mpfs:0.0.1 to run the service. The image is available on Docker Hub and can be pulled with the command:

```bash
docker pull paolino/mpfs:0.0.1
```

Tweak the compose file in [compose](off_chain/docker/preprod/docker-compose.yaml) to your needs.

### Source

Altenatively, you can run the service from source. To do so, you need to have nodejs and npm and installed on your system. Then you can clone the repository and run the following commands:

```bash
git clone https://github.com/paolino/mpfs
cd off_chain
npx tsx src/service/signingless/main.ts --port 3000 \
    --provider yaci --yaci-store-host http://localhost:8080 \
    --ogmios-host http://localhost:1337 \
    --database-path ./mpfs.db \
    --since-slot 94898393 \
    --since-block-id ef94934f8eb129ebf07eeaab007b81ecb1bc58b121d19ac0ffe81f928bf56cc
```

This will start the service on port 3000, using the Yaci store running on http://localhost:8080 and the Ogmios server running on http://localhost:1337. The database will be stored in the file `mpfs.db` in the current directory. The `since-slot` and `since-block-id` parameters are used to specify the starting point for the service to track events.

> Be careful to start indexing before the token you are going to use was created. If you are creating a new token, just start 5 days ago.

## Usage

- [Signingless API Reference](https://mpfs.plutimus.com/api-docs)
- [Signingless API Manual](docs/manual/signingless.md)

## Code

We are using [radicle](https://radicle.xyz/) to track the code and the issues.
You can observe the code at
[rad:zpZ4szHxvnyVyDiy2acfcVEzxza9](https://app.radicle.xyz/nodes/seed.radicle.garden/rad:zpZ4szHxvnyVyDiy2acfcVEzxza9)

## See Also

- [Architecture](docs/architecture.md)
- [License](./LICENSE)
- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)
- Other projects by [HAL][HAL]
- Other projects by the [Cardano Foundation][CF]
- About [Cardano][Cardano]

[HAL]: https://github.com/cardano-foundation/hal
[CF]: https://github.com/cardano-foundation
[Cardano]: https://cardano.org/
