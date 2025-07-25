# Signingful Merkle Patricia Forestry Service (OUTDATED)

## Running the service

### Mnemonics
The service is designed to control a wallet, so you need to expose the
mnemonics of the wallet in order to make transactions.

The file with the mnemonics is passed as `--seed` argument.
Using the `-g` option one can overwrite the mnemonics file with the new mnemonics.


## Illustrative example

ATM nix is not able to bring the node dependencies in scope, so you need to

```bash
cd off_chain
```

and manually install the dependencies:

```bash
npm install
```

To illustrate the example usage of the service, we will use a local cluster with `yaci`, so that we can
easily create wallets and fund them.

We will create 3 wallets:  `charlie`, `alice` and `bob`.
`charlie` will be the owner of the token, and `alice` and `bob` will
both request for the updates to the token.

First of all, start with `nix develop` in **five** separate terminals.

Make sure you have **yaci** up in one terminal (`just run-yaci`). Then in the other three, representing
`charlie`, `alice` and `bob`, respectively, we type the following:



```bash
npx tsx src/service/main.ts --seed ./mnemonics.txt --provider yaci --port 3000 --yaci-store-host http://localhost:8080 --yaci-admin-host http://localhost:10000 -g
```

```bash
npx tsx src/service/main.ts --seed ./mnemonics2.txt --provider yaci --port 3002 --yaci-store-host http://localhost:8080 --yaci-admin-host http://localhost:10000 -g
```

```bash
npx tsx src/service/main.ts --seed ./mnemonics3.txt --provider yaci --port 3004 --yaci-store-host http://localhost:8080 --yaci-admin-host http://localhost:10000 -g
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
owner=$(curl -s -X GET $charlie/wallet | jq -r '.owner')
echo $owner
```

```json
42d965308b42b2f62934cec8e33458ad0c6a37353d817cafaab1f403
```

Now `charlie` can create a token under his control via:

```bash
tokenId=$(curl -s -X POST $charlie/token \
  -H "Content-Type: application/json" \
  -d "{\"owner\": \"$owner\"}" | jq -r '.tokenId')
echo $tokenId
```

```
5d32fe6ee4ec1326bf14ebbc67dd566e03d4bd04881c463107485398d9901196
```

That token id is unique inside the network and can be used to identify the token later.
Notice that we do not support ownership transfer at this moment (which is allowed on-chain generally).
Nevertheless, anyone can always query all tokens at caging address with:

```bash
curl -s -X GET $alice/tokens | jq
```

```json
{
  "tokens": [
    {
      "tokenId": "5d32fe6ee4ec1326bf14ebbc67dd566e03d4bd04881c463107485398d9901196",
      "state": {
        "owner": "42d965308b42b2f62934cec8e33458ad0c6a37353d817cafaab1f403",
        "root": "0000000000000000000000000000000000000000000000000000000000000000"
      }
    }
  ],
  "indexerStatus": {
    "ready": true,
    "networkTip": 846,
    "indexerTip": 846
  }
}
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
reqBob=$(curl -s -X POST $bob/token/$tokenId/request \
  -H "Content-Type: application/json" \
  -d '{"operation": "insert","key": "abc","value": "value1"}' | jq -r)
echo $reqBob
```

```
ac8b76b77b7c189213b1fea58b3d365bb5bde0d9987c0be79c52c494b3e79f36-0
```

> The current API uses the wallet owner as the owner of the request. This is not validated by the contract, but it could be a requirement for the token owner to accept the request. I.E. the owner could be programmed to accept specific semantics (key modifications) request only by the specified owners and that would require the token owner to sign the request like we do here.

The request is now in the caging address, and anyone can see it by inspecting the token field `requests`:

```bash
curl -s -X GET $alice/token/$tokenId | jq '.requests'
```

```json
[
  {
    "outputRef": "ac8b76b77b7c189213b1fea58b3d365bb5bde0d9987c0be79c52c494b3e79f36-0",
    "change": {
      "key": "abc",
      "value": "value1",
      "operation": "insert"
    },
    "owner": "3db404e05ce862b4c8286341f78eae59a1f9f710c5a2d3afe32df7bd"
  }
]
```

Notice that the owner of the request is `bob`, which is the wallet that created the request.

```bash
curl -s -X GET $bob/wallet | jq -r '.owner'
```

```
3db404e05ce862b4c8286341f78eae59a1f9f710c5a2d3afe32df7bd
```

Let's add a request from `alice` to insert another value:

```bash
reqAlice=$(curl -s -X POST $alice/token/$tokenId/request \
  -H "Content-Type: application/json" \
  -d '{"operation": "insert","key": "abd","value": "value2"}' | jq -r)
echo $reqAlice
```

```
91c86a67b93007231b17789831d39ec0a2b0fd69c9e029fdf8246f1635a86bc4-0
```

The request is now in the caging address, and anyone can see it with:

```bash
curl -s -X GET $bob/token/$tokenId | jq '.requests'
```

```json
[
  {
    "outputRef": "91c86a67b93007231b17789831d39ec0a2b0fd69c9e029fdf8246f1635a86bc4-0",
    "change": {
      "key": "abd",
      "value": "value2",
      "operation": "insert"
    },
    "owner": "97c5d79444e0dca4cfbb561c561630fd1f1cea75e4938e006177a1ed"
  },
  {
    "outputRef": "ac8b76b77b7c189213b1fea58b3d365bb5bde0d9987c0be79c52c494b3e79f36-0",
    "change": {
      "key": "abc",
      "value": "value1",
      "operation": "insert"
    },
    "owner": "3db404e05ce862b4c8286341f78eae59a1f9f710c5a2d3afe32df7bd"
  }
]
```

Note that the request is not applied to the token yet, and it can be retracted by the owner of the request.

Let `bob` retract his request with:

```bash
curl -s -X DELETE $bob/request/$bobReq | jq
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
    "outputRef": "91c86a67b93007231b17789831d39ec0a2b0fd69c9e029fdf8246f1635a86bc4-0",
    "change": {
      "key": "abd",
      "value": "value2",
      "operation": "insert"
    },
    "owner": "97c5d79444e0dca4cfbb561c561630fd1f1cea75e4938e006177a1ed"
  }
]
```

Note that only `bob` (as request owner) was actually able to retract the request.
If `bob` tries to retract the request that was  not created by him, he will fail:

```bash
curl -s -X DELETE $bob/request/$aliceReq | jq
```

```json
{
  "error": "Error retracting",
  "details": "Request owner does not match signer"
}
```

Now `charlie` who is the owner of the token can apply the request(s) to the token.

> ATM batching is possible but very primitive, do not batch more than 4 requests.

```bash
curl -s -X PUT $charlie/token/$tokenId  \
    -H "Content-Type: application/json" \
    -d "{\"requestIds\":[\"$reqAlice\"]}" | jq
```

```json
{ "txHash": "b82b1109930a9ec710f07e2ac5eca779115d20ec113933a029a3d7ce9be0cc5e"
}
```

The request is now applied to the token and anyone can see the root has changed.

```bash
curl -s -X GET $alice/token/$tokenId | jq
```

```json
{
  "owner": "42d965308b42b2f62934cec8e33458ad0c6a37353d817cafaab1f403",
  "root": "62e32748610361630d6e3078f741ba931e13b1f2d53e5cde79e543e80a61ce6e",
  "requests": []
}

```

Note that the requests are now empty and the root is updated.

But anyone can also retrieve the facts.

```bash
curl -s -X GET $bob/token/$tokenId/facts
```

```json
{"abd": "value2"}
```

## Deleting facts

When a fact does not hold anymore, it can be deleted from the MPF token. Again it goes through the request process.


```bash
delReq=$(curl -s -X POST $bob/token/$tokenId/request \
  -H "Content-Type: application/json" \
  -d '{"operation": "delete", "key": "abd", "value" : "value2"}' | jq -r)
```

```
b2cc05799bf26ae8770ef7ba767819f85c5f383eb66688d34657994438eb291c-0
```

Then `charlie` can apply the request to the token. It's always the token  owner responsible for applying the requests.

```bash
curl -s -X PUT $charlie/token/$tokenId \
  -H "Content-Type: application/json" \
  -d "{\"requestIds\":[\"$delReq\"]}" | jq
```

```json
{
  "txHash": "b8fb8036ee94dd88fbdd90681852a6a6807406e602f6cd990d6ff76c4d84f2f7"
}
```

Now the facts are empty and the root is empty as well:

```bash
curl -s -X GET $alice/token/$tokenId | jq
```

```json
{
  "owner": "42d965308b42b2f62934cec8e33458ad0c6a37353d817cafaab1f403",
  "root": "0000000000000000000000000000000000000000000000000000000000000000",
  "requests": []
}
```

```bash
curl -s -X GET $charlie/token/$tokenId/facts | jq
```

```json
{}
```

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

```

You will have port 3000 and 3002 and 3004 as users. Be careful to stop yaci before running the docker compose.

All of the above applies to the docker compose as well.

```bash
curl -s -X GET $charlie/tokens | jq
```


```json
{
  "tokens": [],
  "indexerStatus": {
    "ready": true,
    "networkTip": 645,
    "indexerTip": 645
  }
}
```

Shut down the docker compose with:

```bash
docker compose -f docker/docker-compose.yaml down --volumes
```

## Radicle
