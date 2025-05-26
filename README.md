# Merkle Patricia Forestry Service

## Overview

The Merkle Patricia Forestry (MPF) service provides an HTTP service over
<https://aiken-lang.github.io/merkle-patricia-forestry/aiken/merkle_patricia_forestry.html>.

The service is designed to manage a MPF value inside a Cardano token. The
token is enforced to start with the MPF in an empty state, and all updates to
the MPF value are tracked inside Cardano transactions. The token is caged forever
in a smart contract that makes sure of the following:
- The MPF root never leaves the address. Transactions that updated the MPF value
  can only update it at the same address.
- The root of the new MPF is verified on-chain as well as the changes that are
  all included in the transactions that update the MPF value.
Moreover, when the MPF token is created, its minting policy enforces its state to be empty and
its address to be the caging address.

This system is designed so that the updates can only be performed by a single
designated owner at any given time.

The requests to update the token must be reviewed by the owner, who determines
which updates are valid. The owner then includes these updates in transactions,
effectively acting as **an oracle** by ensuring that only updates reflecting
external realities are applied.

Key implications of this design are as follows:
- The spending validator that cages the token is universal, meaning it can be
    used to track any MPF token. This is referred to as the `universal MPF caging
    address` or simply `caging address`.
- The ownership of the MPF token (i.e., the right to update the MPF value) is encoded within
    the token itself.
- The initial ownership of an MPF token is determined at the time of minting.
- The updates to the MPF value are submitted as requests, which are placed in the
    caging address along with their respective target MPF token.

## Running the service

### Mnemonics
The service is designed to control a wallet, so you need to expose the
mnemonics of the wallet in order to make transactions.

The file with the mnemonics is passed as `--seed` argument.
Using the `-g` option one can overwrite the mnemonics file with the new mnemonics.

### Blockchain interaction

The blockchain can be interacted via either yaci or blockfrost.

#### Via yaci

To run the service, you need to have [yaci](https://github.com/bloxbean/yaci-devkit?tab=readme-ov-file) running.

Start it with its store enabled (after going to nix via `nix develop`):

```bash
yaci-cli up --enable-yaci-store
```

or alternatively

```bash
just run-yaci
```

This will spin up a local cluster so that you can experimnent with the service. The rest of the
commands will be run against `yaci` and the local cluster.

**NOTE**: `yaci-store` listens by default on port 8080, which is what the following instructions expect. Should you happen to modify `yaci-store`'s default configuration please use the correct port. In the `yaci-cli/config/application.properties` check the following lines

```
## Default ports
#ogmios.port=1337
#kupo.port=1442
#yaci.store.port=8080
#socat.port=3333
#prometheus.port=12798
```

#### Via blockfrost

To use blockfrost with preview network just export your blockfrost key:

```bash
export BLOCKFROST_PROJECT_ID=your_blockfrost_key
```

and, in the next example, use the `--provider` option to specify `blockfrost` and `--blockfrost-project-id` to specify `$BLOCKFROST_PROJECT_ID`

i.e.

```bash
npx tsx service/main.ts --seed ./mnemonics.txt --provider blockfrost --blockfrost-project-id $BLOCKFROST_PROJECT_ID --port $WALLET_PORT
```

## Illustrative example

To illustrate the example usage of the service, we will use a local cluster with `yaci`, so that we can
easily create wallets and fund them.

We will create 3 wallets:  `charlie`, `alice` and `bob`.
`charlie` will be the owner of the token, and `alice` and `bob` will
both request for the updates to the token.

First of all, start with `nix develop` in **five** separate terminals.

Make sure you have **yaci** up in one terminal (`just run-yaci`). Then in the other three, representing
`charlie`, `alice` and `bob`, respectively, we type the following:

```bash
cd ./off_chain/
npx tsx service/main.ts --seed ./mnemonics.txt --provider yaci --port 3000 --yaci-store-host http://localhost:8080 --yaci-admin-host http://localhost:10000 -g
```

```bash
cd ./off_chain/
npx tsx service/main.ts --seed ./mnemonics2.txt --provider yaci --port 3002 --yaci-store-host http://localhost:8080 --yaci-admin-host http://localhost:10000 -g
```

```bash
cd ./off_chain/
npx tsx service/main.ts --seed ./mnemonics3.txt --provider yaci --port 3004 --yaci-store-host http://localhost:8080 --yaci-admin-host http://localhost:10000 -g
```

The `-g` option enforces using the new mnemonics every time.

Now, in the last fifth terminal paste the following:

```bash
export charlie='http://localhost:3000'
export alice='http://localhost:3002'
export bob='http://localhost:3004'
```

Let's fund `charlie`, `bob` and `alice` wallets

```bash
curl -s -X PUT $charlie/wallet/topup -H "Content-Type: application/json" -d '{"amount": 10000}' | jq
curl -s -X PUT $alice/wallet/topup -H "Content-Type: application/json" -d '{"amount": 10000}' | jq
curl -s -X PUT $bob/wallet/topup -H "Content-Type: application/json" -d '{"amount": 10000}' | jq
```

After each command you should see:

```json
{
  "message": "Top up successful"
}
```

Querying `charlie` wallet shows that it has some UTXOs

```bash
curl -s -X GET $charlie/wallet | jq
```

```json
{
  "address": "addr_test1qzlxxg4p8gkqdwt0vttvadgx59xqn72uttp89mp2s8kw88fd7vd6n95tsrtlmjcm24n4ke9hha6ukupnvxcf27s72jpsywzxln",
  "owner": "be6322a13a2c06b96f62d6ceb506a14c09f95c5ac272ec2a81ece39d",
  "utxos": [
    {
      "input": {
        "outputIndex": 0,
        "txHash": "ef549632aad2f930709944c3584dac46c772722375b7702f4d7ee1ae2ee2482e"
      },
      "output": {
        "address": "addr_test1qzlxxg4p8gkqdwt0vttvadgx59xqn72uttp89mp2s8kw88fd7vd6n95tsrtlmjcm24n4ke9hha6ukupnvxcf27s72jpsywzxln",
        "amount": [
          {
            "unit": "lovelace",
            "quantity": "10000000000"
          }
        ]
      }
    },
    {
      "input": {
        "outputIndex": 0,
        "txHash": "2371a7ea99c11e9b230592bccdea68abf684ee9b349fa2152fce0f0148dfe68a"
      },
      "output": {
        "address": "addr_test1qzlxxg4p8gkqdwt0vttvadgx59xqn72uttp89mp2s8kw88fd7vd6n95tsrtlmjcm24n4ke9hha6ukupnvxcf27s72jpsywzxln",
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

In order to create a new MPF token that `charlie` controls, he can get his owner id from the retrieved wallet,
and use it in token minting.

```bash
curl -s -X GET $charlie/wallet | head -1 | jq -r '.owner'
```

```json
be6322a13a2c06b96f62d6ceb506a14c09f95c5ac272ec2a81ece39d
```

Now `charlie` can create a token under his control via:

```bash
curl -s -X POST $charlie/token \
  -H "Content-Type: application/json" \
  -d "$(curl -s -X GET $charlie/wallet | head -1 | jq '{"owner": .owner}')"
```

```json
{"tokenId":"07787355a72191e2ff52d2802b0e28855c24fab16499163c4b5fb3815e7297ab686898bbfb6b712bc78bfb2062d2e5f84bd587411624911210617824"}
```

As we are going to use this token id later, let's store it in a `tokenId` variable:

```bash
export tokenId='07787355a72191e2ff52d2802b0e28855c24fab16499163c4b5fb3815e7297ab686898bbfb6b712bc78bfb2062d2e5f84bd587411624911210617824'
```

That token id is unique inside the network and can be used to identify the token later.
Notice that we do not support ownership transfer at this moment (which is allowed on-chain generally).
Nevertheless, anyone can always query all tokens at caging address with:

```bash
curl -s -X GET $alice/tokens | jq
```

```json
[
  {
    "tokenId": "07787355a72191e2ff52d2802b0e28855c24fab16499163c4b5fb3815e7297ab686898bbfb6b712bc78bfb2062d2e5f84bd587411624911210617824",
    "owner": "be6322a13a2c06b96f62d6ceb506a14c09f95c5ac272ec2a81ece39d",
    "root": "0000000000000000000000000000000000000000000000000000000000000000"
  }
]
```

Take notice that the root is empty, meaning no facts are inside.
In this situation, besides inserting a new value, the only operation we could do with this token is to delete it.
Which we will demonstrate, but later.

## Requests to update a token

The request comprises of 4 fields:
- `operation`: The operation to perform on the MPF token. This can be one of the following:
  - `insert`: Insert a new value into the MPF.
  - `delete`: Delete a value from the MPF.
- `key`: The key of the value to update.
- `value`: The value to be updated at a specified `key`.
- `owner`: The owner of the request. This is implicit in the current API.

The owner of the request is (for now) allowed to retract his request whenever he wants.
This will change in the future for the sake of protecting against a form of DDoS attack against the token.

> ATM requests are completely consumed in terms of value by the token update transaction, this is unacceptable and the update should only cost a fee.
> We are planning the support for `update` and `expiration` date (against DDoS)

Anyone can create a request to update a token. For example,
let `bob` create a request to update the token we created before.

```bash
curl -s -X POST $bob/token/$tokenId/request \
  -H "Content-Type: application/json" \
  -d '{"operation": "insert","key": "abc","value": "value1"}' | jq
```

```json
{
  "txHash": "1037d25b412c7bedda2e29f417d2a2bfce3fbe84db26b3600cc2ff53e60723f5",
  "outputIndex": 0
}
```

> The current API uses the wallet owner as the owner of the request. This is not validated by the contract, but it could be a requirement for the token owner to accept the request. I.E. the owner could be programmed to accept specific semantics (key modifications) request only by the specified owners and that would require the token owner to sign the request like we do here.

The request is now in the caging address, and anyone can see it by inspecting the token field `requests`:

```bash
curl -s -X GET $alice/token/$tokenId | jq '.requests'
```

```json
[
  {
    "tokenId": "07787355a72191e2ff52d2802b0e28855c24fab16499163c4b5fb3815e7297ab686898bbfb6b712bc78bfb2062d2e5f84bd587411624911210617824",
    "key": "abc",
    "value": "value1",
    "operation": "insert",
    "owner": "a08a2febc48d613727c1e8c11b7f7d1d4128b80dde34afd7f393e732",
    "ref": {
      "txHash": "1037d25b412c7bedda2e29f417d2a2bfce3fbe84db26b3600cc2ff53e60723f5",
      "outputIndex": 0
    }
  }
]
```

Let's add a request from `alice` to insert another value:

```bash
curl -s -X POST $alice/token/$tokenId/request \
  -H "Content-Type: application/json" \
  -d '{ "operation": "insert", "key": "abd", "value": "value2"}' | jq
```

```json
{
  "txHash": "2f1571c88dd2b44eead4eb687771af7e0c859acfd7eb949d2f25a8ef9146f88d",
  "outputIndex": 0
}
```

The request is now in the caging address, and anyone can see it with:

```bash
curl -s -X GET $bob/token/$tokenId | jq '.requests'
```

```json
[
  {
    "tokenId": "07787355a72191e2ff52d2802b0e28855c24fab16499163c4b5fb3815e7297ab686898bbfb6b712bc78bfb2062d2e5f84bd587411624911210617824",
    "key": "abc",
    "value": "value1",
    "operation": "insert",
    "owner": "a08a2febc48d613727c1e8c11b7f7d1d4128b80dde34afd7f393e732",
    "ref": {
      "txHash": "1037d25b412c7bedda2e29f417d2a2bfce3fbe84db26b3600cc2ff53e60723f5",
      "outputIndex": 0
    }
  },
  {
    "tokenId": "07787355a72191e2ff52d2802b0e28855c24fab16499163c4b5fb3815e7297ab686898bbfb6b712bc78bfb2062d2e5f84bd587411624911210617824",
    "key": "abd",
    "value": "value2",
    "operation": "insert",
    "owner": "fa9bf2e2edacf7038735d1ea4482e842d2c33e0e65b59273c228b10f",
    "ref": {
      "txHash": "2f1571c88dd2b44eead4eb687771af7e0c859acfd7eb949d2f25a8ef9146f88d",
      "outputIndex": 0
    }
  }
]
```

Note that the request is not applied to the token yet, and it can be retracted by the owner of the request.

Let `bob` retract his request with:

```bash
$ curl -s -X DELETE $bob/request/1037d25b412c7bedda2e29f417d2a2bfce3fbe84db26b3600cc2ff53e60723f5/0 | jq
```

```json
{
  "txHash": "b355ecbb5c07491f45690f8894db8ac4b7931a5fe49ed071acff7953b88d921b"
}
```

The request is now retracted and we can see it with:

```bash
 curl -s -X GET $charlie/token/$tokenId | jq '.requests'
```

```json
[
  {
    "tokenId": "07787355a72191e2ff52d2802b0e28855c24fab16499163c4b5fb3815e7297ab686898bbfb6b712bc78bfb2062d2e5f84bd587411624911210617824",
    "key": "abd",
    "value": "value2",
    "operation": "insert",
    "owner": "fa9bf2e2edacf7038735d1ea4482e842d2c33e0e65b59273c228b10f",
    "ref": {
      "txHash": "2f1571c88dd2b44eead4eb687771af7e0c859acfd7eb949d2f25a8ef9146f88d",
      "outputIndex": 0
    }
  }
]
```

Note that only `bob` (as request owner) was actually able to retract the request.
If `bob` tries to retract the request that has not originated with him it is not successful:

```bash
$ curl -s -X DELETE $bob/request/2f1571c88dd2b44eead4eb687771af7e0c859acfd7eb949d2f25a8ef9146f88d/0 | jq
```

```bash
 curl -s -X GET $charlie/token/$tokenId | jq '.requests'
```

```json
[
  {
    "tokenId": "07787355a72191e2ff52d2802b0e28855c24fab16499163c4b5fb3815e7297ab686898bbfb6b712bc78bfb2062d2e5f84bd587411624911210617824",
    "key": "abd",
    "value": "value2",
    "operation": "insert",
    "owner": "fa9bf2e2edacf7038735d1ea4482e842d2c33e0e65b59273c228b10f",
    "ref": {
      "txHash": "2f1571c88dd2b44eead4eb687771af7e0c859acfd7eb949d2f25a8ef9146f88d",
      "outputIndex": 0
    }
  }
]
```


Now `charlie` who is the owner of the token can apply the request(s) to the token.

> ATM batching is possible but very primitive, do not batch more than 4 requests.

```bash
curl -s -X PUT $charlie/token/$tokenId \
  -H "Content-Type: application/json" \
  -d '{"requests": [{"txHash": "2f1571c88dd2b44eead4eb687771af7e0c859acfd7eb949d2f25a8ef9146f88d","outputIndex": 0}]}' | jq
```

```json
{
  "txHash": "b8fb8036ee94dd88fbdd90681852a6a6807406e602f6cd990d6ff76c4d84f2f7"
}
```

The request is now applied to the token and anyone can see it:

```bash
curl -s -X GET $charlie/token/$tokenId | jq
```

```json
{
  "owner": "be6322a13a2c06b96f62d6ceb506a14c09f95c5ac272ec2a81ece39d",
  "root": "62e32748610361630d6e3078f741ba931e13b1f2d53e5cde79e543e80a61ce6e",
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
  "txHash": "c535a3f3c2762677951a80dc25903a74eb9f6ad9933925716321fe91359e612e"
}
```

## Docker

Build the docker image with:

```bash
cd off_chain
docker build -f docker/Dockerfile -t mpf-service .
```

There is a docker-compose file that will run the service with yaci

```bash
docker compose -f docker/docker-compose.yaml up -d
```

You will have port 3000 and 3001 as users

```bash
curl -s -X GET http://localhost:3000/tokens | jq
```

```json
[]
```

Shut down the docker compose with:

```bash
docker compose -f docker/docker-compose.yaml down --volumes
```

## Radicle

We are using [radicle](https://radicle.xyz/) to track the code and the issues.
You can observe the code at [rad:zpZ4szHxvnyVyDiy2acfcVEzxza9](https://app.radicle.xyz/nodes/ash.radicle.garden/rad:zpZ4szHxvnyVyDiy2acfcVEzxza9)

Developers:
 - paolino, [did:key:z6MksH6Yr4pkJqPYnY4N5e5a5bCdyCW88grKRkkK6KeMGwLN](https://app.radicle.xyz/nodes/ash.radicle.garden/users/did:key:z6MksH6Yr4pkJqPYnY4N5e5a5bCdyCW88grKRkkK6KeMGwLN)
 - paweljakubas, [did:key:z6Mks4nj3eXrWhjEXknLooeH8ac9c8XcTSzmM7GaooaVyEMN](https://app.radicle.xyz/nodes/ash.radicle.garden/users/did:key:z6Mks4nj3eXrWhjEXknLooeH8ac9c8XcTSzmM7GaooaVyEMN)
 - anviking, [did:key:z6MkoqswZoM5EtGgsWyTYbrbAw2MXWd2JmSvsQ8Ns9jstmCX](https://app.radicle.xyz/nodes/ash.radicle.garden/users/did:key:z6MkoqswZoM5EtGgsWyTYbrbAw2MXWd2JmSvsQ8Ns9jstmCX)
 - abailly, [did:key:z6MkhgPg6WShnhJcmfwox4G5yL3EvJ2zW8L31SZLD95yUi11](https://app.radicle.xyz/nodes/ash.radicle.garden/users/did:key:z6MkhgPg6WShnhJcmfwox4G5yL3EvJ2zW8L31SZLD95yUi11)
