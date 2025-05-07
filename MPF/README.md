# Merkle Patricia Forestry Service

## Overview

The Merkle Patricia Forestry (MPF) service provides an HTTP service over
<https://aiken-lang.github.io/merkle-patricia-forestry/aiken/merkle_patricia_forestry.html>.

The service is designed to manage an MPF value inside a Cardano token. The
token is enforced to start with the MPF in an empty state, and all updates to
the MPF are tracked inside Cardano transactions. The token is caged forever
in a smart contract that controls:
- The MPF root never leaves the address. Transactions that updated the MPF
  can only update it at the address.
- The root of the new MPF is verified on-chain as the application of changes that are
  all included in the transaction that updates the MPF.
Moreover, when the MPF token is created, its minting policy enforces its state to be empty and its address to be the caging address.

This system is designed so that updates can only be performed by a single
designated owner at any given time.

Requests to update the token must be reviewed by the owner, who determines
which updates are valid. The owner then includes these updates in transactions,
effectively acting as an oracle by ensuring that only updates reflecting
external realities are applied.

Key implications of this design include:
- The spending validator that cages the token is universal, meaning it can be
    used to track any MPF token. This is referred to as the `universal MPF caging
    address` or simply `caging address`.
- Ownership of the MPF token (i.e., the right to update the MPF) is encoded within
    the token itself.
- The initial ownership of an MPF token is determined at the time of minting.
- Updates to the MPF are submitted as requests, which are placed in the
    caging address along with their target MPF token.

## Running the service

### Mnemonics
ATM the service is designed to control a wallet, so you need to expose some
mnemonics to it.

The file with the mnemonics is passed as `--seed` argument.
The `-g` option it will (re)write the menmonics file with new menmonics.

### Via yaci

To run the service, you need to have [yaci](https://github.com/bloxbean/yaci-devkit?tab=readme-ov-file)

Start it with its store enabled:

```bash
./yaci-cli up --enable-yaci-store
```

This will spin up a local cluster so that you can experimnent with the service. The rest of the
commands will be run against `yaci` and the local cluster.

### Via blockfrost

To use blockfrost with preview network just export your blockfrost key:

```bash
export BLOCKFROST_PROJECT_ID=your_blockfrost_key
```

and, in the next example, use the `--provider` option to specify `blockfrost` and `--blockfrost-project-id` to specify `$BLOCKFROST_PROJECT_ID`

i.e.

```bash
npx tsx service/main.ts --seed ./mnemonics.txt --provider blockfrost --blockfrost-project-id $BLOCKFROST_PROJECT_ID --port $WALLET_PORT
```

## Setup
To illustrate the service, we will use a local cluster with `yaci`, so that we can
easily create wallets and fund them.

We will crerate 3 wallets:  `charlie`, `alice` and `bob`.
`charlie` will be the owner of the token, and `alice` and `bob` will be
requesting for updates to the token.


```bash
npx tsx service/main.ts --seed ./mnemonics.txt --provider yaci --port 3000 --yaci-store-port 8080 --yaci-admin-port 10000 -g
```

```bash
npx tsx service/main.ts --seed ./mnemonics2.txt --provider yaci --port 3002 --yaci-store-port 8080 --yaci-admin-port 10000 -g
```

```bash
npx tsx service/main.ts --seed ./mnemonics3.txt --provider yaci --port 3004 --yaci-store-port 8080 --yaci-admin-port 10000 -g
```

> Remember to remove the `-g` option if you want to use the same mnemonics as the last time.


To proceed let's name the services

```bash
export charlie='http://localhost:3000'
export alice='http://localhost:3002'
export bob='http://localhost:3004'
```

Let's fund charlie, `bob` and `alice` wallets

```bash
curl -s -X PUT $charlie/wallet/topup -H "Content-Type: application/json" -d '{"amount": 10000}' | jq
```

```bash
curl -s -X PUT $bob/wallet/topup -H "Content-Type: application/json" -d '{"amount": 10000}' | jq
```

```bash
curl -s -X PUT $alice/wallet/topup -H "Content-Type: application/json" -d '{"amount": 10000}' | jq
```

Querying `charlie` wallet .i.e will show that it has some UTXOs

```bash
curl -s -X GET $charlie/wallet | jq
```

```json
{
  "address": "addr_test1qzg2r2smu39njy32fm5mlvcj85xag2gcs6lz7wsau8z7kz8st6lky72t62568x94l2t885t6zmk9p4h9nqqneyzxrmyqn6etyh",
  "owner": "90a1aa1be44b39122a4ee9bfb3123d0dd4291886be2f3a1de1c5eb08",
  "utxos": [
    {
      "input": {
        "outputIndex": 0,
        "txHash": "8dcb91f18a5eb3ade499076302948bb0f4111f79f889343ecab0e6b10c0d4e36"
      },
      "output": {
        "address": "addr_test1qzg2r2smu39njy32fm5mlvcj85xag2gcs6lz7wsau8z7kz8st6lky72t62568x94l2t885t6zmk9p4h9nqqneyzxrmyqn6etyh",
        "amount": [
          {
            "unit": "lovelace",
            "quantity": "10000000000"
          }
        ]
      }
    }
  ]
}
```

## New tokens

To create a new MPF token that `charlie` controls, he can retrieve his wallet to get his owner id.

```bash
curl -X GET $charlie/wallet | jq '.owner'
```

```json
"90a1aa1be44b39122a4ee9bfb3123d0dd4291886be2f3a1de1c5eb08"
```

`charlie` can create a token which he controls via:

```bash
curl -s -X POST $charlie/token \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "90a1aa1be44b39122a4ee9bfb3123d0dd4291886be2f3a1de1c5eb08"
    }'
```

```json
{
  "tokenId": "fbf668ff40ed073a443b5c5084f2c09b2a151df4222f8daae45772e89cb0e3240830d99e766b97edd7e43638c309ce56e7e413271d12ef779f328387"
}
```

As we are going to use this token id in the future, let's store it in a variable:

```bash
export tokenId='fbf668ff40ed073a443b5c5084f2c09b2a151df4222f8daae45772e89cb0e3240830d99e766b97edd7e43638c309ce56e7e413271d12ef779f328387'
```

That token id is unique inside the at least current network and can be used to identify the token in the future.

Notice that despite in the API we do not support yet ownership transfer (which is allowed on-chain), we could already give up control of the token at the beginning by creating the token with a different owner.

Anyone can always query all tokens at caging address with:

```bash
curl -s -X GET $alice/tokens | jq
```

```json
[
  {
    "tokenId": "$tokenId",
    "owner": "90a1aa1be44b39122a4ee9bfb3123d0dd4291886be2f3a1de1c5eb08",
    "root": "0000000000000000000000000000000000000000000000000000000000000000"
  }
]
```

The root as promised is the empty root.

In this situation the only other thing we could do with this token is to delete it. But we'll do that later.

## Requests to update tokens

Requests comes with 4 fields:
- `operation`: The operation to perform on the MPF token. This can be one of the following:
  - `insert`: Insert a new value into the MPF, containing
  - `delete`: Delete a value from the MPF.
- `key`: The key of the value to update.
- `value`: The value to delete at that key.
- `owner`: The owner of the request. This is implicit in the current API

The owner of the request is (for now) allowed to retract his reques whenever he wants.
This will change in the future to protect against a form of ddos attack against the token.

> ATM requests are completely consumed in terms of value by the token update transaction, this is unacceptable and the update should only consume a fee.

> In the plans it's support for `update` and `expiration` date (against ddos)

Anyone can create a request to update a token.

Let `bob` create a request to update the token we created before.

```bash
curl -s -X POST $bob/token/$tokenId/request \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "insert",
    "key": ["a","b","c"],
    "value": "value"
  }' | jq
```

```json
{
  "txHash": "0a787f4923cf1526dd05d7a33a4ebba3db5a89ff838fbf358ae3604aac21de3f",
  "outputIndex": 0
}
```
> Current API use the wallet owner as the owner of the request. This is not validated by the contract, but it could be a requirement for the token owner to accept the request. I.E. the owner could be programmed to accept specific semantics (key modifications) request only by specified owners and that would require the request owner to sign the request like we do here.

The request is now in the caging address, and anyone can see it by inspecting the token field `requests` with:

```bash
curl -s -X GET $alice/token/$tokenId | jq '.requests'
```

```json
[
  {
    "tokenId": "fbf668ff40ed073a443b5c5084f2c09b2a151df4222f8daae45772e89cb0e3240830d99e766b97edd7e43638c309ce56e7e413271d12ef779f328387",
    "key": [
      "a",
      "b",
      "c"
    ],
    "value": "value1",
    "operation": "insert",
    "owner": "1378eb79b3abd54d5083e3744cd4dd5b05900ac07430a5740f086f5d",
    "ref": {
      "txHash": "0a787f4923cf1526dd05d7a33a4ebba3db5a89ff838fbf358ae3604aac21de3f",
      "outputIndex": 0
    }
  }
]

```

Let's add a request from `alice` to insert another value:

```bash
curl -s -X POST $alice/token/$tokenId/request \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "insert",
    "key": ["a","b","d"],
    "value": "value2"
  }' | jq
```

```json
{
  "txHash": "8e6e8d8d73c04a4d4fc445ae8ce695f37531c7148f8476575a0e7348922a67e9",
  "outputIndex": 0
}
```

The request is now in the caging address, and anyone can see it with:

```bash
curl -s -X GET $bob/token/$tokenId | jq '.requests
```
```json
[
  {
    "tokenId": "fbf668ff40ed073a443b5c5084f2c09b2a151df4222f8daae45772e89cb0e3240830d99e766b97edd7e43638c309ce56e7e413271d12ef779f328387",
    "key": [
      "a",
      "b",
      "c"
    ],
    "value": "value1",
    "operation": "insert",
    "owner": "1378eb79b3abd54d5083e3744cd4dd5b05900ac07430a5740f086f5d",
    "ref": {
      "txHash": "0a787f4923cf1526dd05d7a33a4ebba3db5a89ff838fbf358ae3604aac21de3f",
      "outputIndex": 0
    }
  },
  {
    "tokenId": "fbf668ff40ed073a443b5c5084f2c09b2a151df4222f8daae45772e89cb0e3240830d99e766b97edd7e43638c309ce56e7e413271d12ef779f328387",
    "key": [
      "a",
      "b",
      "d"
    ],
    "value": "value2",
    "operation": "insert",
    "owner": "11980c569c0da73ba5742589013501270532ba4f748262407fd4a11b",
    "ref": {
      "txHash": "8e6e8d8d73c04a4d4fc445ae8ce695f37531c7148f8476575a0e7348922a67e9",
      "outputIndex": 0
    }
  }
]
```

Note that the request is not yet applied to the token, and it can be retracted by the owner of the request.

Let `bob` retract his request with:

```bash
curl -s -X DELETE $bob/token/$tokenId/request/0a787f4923cf1526dd05d7a33a4ebba3db5a89ff838fbf358ae3604aac21de3f/0 | jq
```

```json
{
  "txHash": "d6cddfa5f54c565e6a6a3b8db163a630d96a80559cf04edea3bd793da5eda8ee"
}
```

The request is now retracted and we can see it with:

```bash
 curl -s -X GET $charlie/token/$tokenId | jq '.requests'
```

```json
[
  {
    "tokenId": "fbf668ff40ed073a443b5c5084f2c09b2a151df4222f8daae45772e89cb0e3240830d99e766b97edd7e43638c309ce56e7e413271d12ef779f328387",
    "key": [
      "a",
      "b",
      "d"
    ],
    "value": "value2",
    "operation": "insert",
    "owner": "11980c569c0da73ba5742589013501270532ba4f748262407fd4a11b",
    "ref": {
      "txHash": "8e6e8d8d73c04a4d4fc445ae8ce695f37531c7148f8476575a0e7348922a67e9",
      "outputIndex": 0
    }
  }
]
```

Note that only `bob` (as request owner) was actually able to retract the request.

Now `charlie` who is the owner of the token can apply the request(s) to the token.

> ATM batching is possible but very primitive, do not batch more than 4 requests.

```bash

curl -s -X PUT $charlie/token/$tokenId \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      {
        "txHash": "8e6e8d8d73c04a4d4fc445ae8ce695f37531c7148f8476575a0e7348922a67e9",
        "outputIndex": 0
      }
    ]
  }' | jq
```

```json
{
  "txHash": "6d7e1dfff9ac00260dc94b13416f80baad71905b3a36619c62c5cab9f6052c3a"
}
```
The request is now applied to the token and anyone can see it with:

```bash
curl -s -X GET $charlie/token/$tokenId | jq
```

```json
{
  "owner": "90a1aa1be44b39122a4ee9bfb3123d0dd4291886be2f3a1de1c5eb08",
  "root": "2038581807645d794627ccc8354ac5e3cbcd9fa3514e2e31dfdb36dd474431c9",
  "requests": []
}
```

Notice that the requests are now empty and the root is updated.

## Deleting tokens

`charlie` can delete the token with:

```bash

curl -s -X DELETE $charlie/token/$tokenId | jq
```

```json
{
  "txHash": "c7cc90274192c1bf14015cb6c366e7b0dc8a4b4204d3c52e523a1cbd747f106a"
}

```
