# Signingful MPFS Manual

!!! warning "Outdated"
    This documentation is outdated. The signingful version is primarily for local development and testing. For production use, see the [Signingless Manual](signingless.md).

## Running the Service

### Mnemonics

The service is designed to control a wallet, so you need to expose the mnemonics of the wallet in order to make transactions.

The file with the mnemonics is passed as `--seed` argument.
Using the `-g` option one can overwrite the mnemonics file with the new mnemonics.

## Illustrative Example

First, navigate to the off_chain directory and install dependencies:

```bash
cd off_chain
npm install
```

To illustrate the example usage of the service, we will use a local cluster with `yaci`, so that we can easily create wallets and fund them.

We will create 3 wallets: `charlie`, `alice` and `bob`.
`charlie` will be the owner of the token, and `alice` and `bob` will both request for the updates to the token.

First of all, start with `nix develop` in **five** separate terminals.

Make sure you have **yaci** up in one terminal (`just run-yaci`). Then in the other three, representing `charlie`, `alice` and `bob`, respectively, we type the following:

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

Let's fund `charlie`, `bob` and `alice` wallets:

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

Querying `charlie` wallet shows that it has some UTxOs:

```bash
curl -s -X GET $charlie/wallet | jq
```

## New Tokens

In order to create a new MPF token that `charlie` controls, he can get his owner id from the retrieved wallet, and use it in token minting.

```bash
owner=$(curl -s -X GET $charlie/wallet | jq -r '.owner')
echo $owner
```

Now `charlie` can create a token under his control via:

```bash
tokenId=$(curl -s -X POST $charlie/token \
  -H "Content-Type: application/json" \
  -d "{\"owner\": \"$owner\"}" | jq -r '.tokenId')
echo $tokenId
```

That token id is unique inside the network and can be used to identify the token later.
Anyone can always query all tokens at caging address with:

```bash
curl -s -X GET $alice/tokens | jq
```

Take notice that the root is empty, meaning no facts are inside.

## Requests to Update a Token

The request comprises of 4 fields:

- `operation`: The operation to perform on the MPF token. This can be one of the following:
  - `insert`: Insert a new value into the MPF.
  - `delete`: Delete a value from the MPF.
- `key`: The key of the value to update.
- `value`: The value to be updated at a specified `key`.
- `owner`: The owner of the request. This is implicit in the current API.

The owner of the request is (for now) allowed to retract his request whenever he wants.

Anyone can create a request to update a token. For example, let `bob` create a request to update the token we created before.

```bash
reqBob=$(curl -s -X POST $bob/token/$tokenId/request \
  -H "Content-Type: application/json" \
  -d '{"operation": "insert","key": "abc","value": "value1"}' | jq -r)
echo $reqBob
```

The request is now in the caging address, and anyone can see it by inspecting the token field `requests`:

```bash
curl -s -X GET $alice/token/$tokenId | jq '.requests'
```

Let's add a request from `alice` to insert another value:

```bash
reqAlice=$(curl -s -X POST $alice/token/$tokenId/request \
  -H "Content-Type: application/json" \
  -d '{"operation": "insert","key": "abd","value": "value2"}' | jq -r)
echo $reqAlice
```

Let `bob` retract his request with:

```bash
curl -s -X DELETE $bob/request/$bobReq | jq
```

Now `charlie` who is the owner of the token can apply the request(s) to the token:

```bash
curl -s -X PUT $charlie/token/$tokenId  \
    -H "Content-Type: application/json" \
    -d "{\"requestIds\":[\"$reqAlice\"]}" | jq
```

The request is now applied to the token. Anyone can also retrieve the facts:

```bash
curl -s -X GET $bob/token/$tokenId/facts
```

## Deleting Facts

When a fact does not hold anymore, it can be deleted from the MPF token. Again it goes through the request process.

```bash
delReq=$(curl -s -X POST $bob/token/$tokenId/request \
  -H "Content-Type: application/json" \
  -d '{"operation": "delete", "key": "abd", "value" : "value2"}' | jq -r)
```

Then `charlie` can apply the request to the token:

```bash
curl -s -X PUT $charlie/token/$tokenId \
  -H "Content-Type: application/json" \
  -d "{\"requestIds\":[\"$delReq\"]}" | jq
```

## Deleting Tokens

`charlie` can delete the token with:

```bash
curl -s -X DELETE $charlie/token/$tokenId | jq
```

## Docker

Build the docker image with:

```bash
cd off_chain
docker build -f docker/Dockerfile -t mpf-service .
```

There is a docker-compose file that will run the service with yaci.

You will have port 3000 and 3002 and 3004 as users. Be careful to stop yaci before running the docker compose.

Shut down the docker compose with:

```bash
docker compose -f docker/docker-compose.yaml down --volumes
```
