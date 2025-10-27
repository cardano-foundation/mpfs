# Signingless MPFS Manual

## Introduction

This document provides a detailed manual for the signingless version of the Merkle Patricia Forestry Service (MPFS).
It is intended for users who want a service that is able to create and balance transactions and delegate the signing to the user.
The tipical interaction is getting the intended cbor for the user goal, sign it locally with a wallet and submit it to the network.
The API is public, no need to authenticate to use it and so it's the operator responsibility to protect it from ddos attacks.
In particular it exposes universally useful end-points, like submitting any transaction.

For the time being only preprod setup is available.

A preprod public instance is running at [https://mpfs.plutimus.com](https://mpfs.plutimus.com), free to use, but with no guarantee of availability. Cardano is a permissionless public network, so anyone can (should) run their own instance of the service.

For the rest of the manual we suppose the user has control of an address which we will refer to as $ADDR, and that the user has a wallet that can sign transactions spending from that address.

In the repository it's included a simple wallet functionality which we will use for the sake of getting thinks done.

## Preprod wallet setup (optional)

### Wallet creation

```bash
git clone https://github.com/paolino/mpfs.git
cd mpfs/off_chain
mkdir tmp
npx tsx src/service/wallet.ts create-wallet tmp/test.json
```

Now you have some menmonics in `tmp/test.json` file, you can use them to sign transactions.

### Address funding

You can get some test ada to your address using the [Cardano Preprod Faucet](https://faucet.preprod.cardano.org/).

Get your address with

```bash
ADDR=$(npx tsx src/service/wallet.ts reveal-address tmp/test.json | jq -r '.address')
echo $ADDR
export ADDR
```

Goto [Faucets](https://docs.cardano.org/cardano-testnets/tools/faucet) paste your address and select preprod.

After several seconds (20 on average, up to minutes) your address will contain a UTxO with 10000 tAda
You can verify it on an explorer.

```bash
brave "https://preprod.cardanoscan.io/address/$ADDR"
```
## Manual library

### Wait for a transaction

You can use the following command to wait for a transaction to be included in the blockchain:

```bash
wait_for_tx() {
  local txId=$1
  while true; do
    result=$(curl -s -X 'GET' "https://mpfs.plutimus.com/transaction?txHash=$txId")
    if [[ $result == *"404 Not Found"* ]]; then
      echo "Transaction $txId not found, waiting..."
      sleep 2
    else
      echo "Transaction $txId found!"
      break
    fi
  done
}
```

### Sign and submit a transaction

This is the most common operation. Once you receive a CBOR encoded transaction from the service, you can sign it with your wallet and submit it to the network.

```bash

sign_and_submit() {
  local file="tmp/tx.cbor"
  local txId=$(npx tsx src/service/wallet.ts sign-transaction tmp/test.json $file)
  result=$(curl -s -X 'POST' \
    "https://mpfs.plutimus.com/transaction" \
    -H 'accept: application/json' \
    -H 'Content-Type: application/json' \
    -d '{"signedTransaction":"'"$(cat $file)"'"}')
  echo $result | jq -r '.txHash'
}
```

### Inspect the current token

You can inspect the current state of a token by its ID. This will return the token's root hash, owner, and other relevant information.

```bash
inspect_token() {
    local tokenId=$TOKEN_ID
    result=$(curl -s -X 'GET' \
        "https://mpfs.plutimus.com/token/$tokenId" \
        -H 'accept: application/json')
    echo $result | jq
}
```

## Token boot

This transaction is meant to start a fresh MPF token. The requester goal is to become the owner of the token. As with all transaction endpoint the requester is supposed to pass an address where the service will select the necessary utxos for the fees.

```bash
result=$(curl -s -X 'GET' \
  "https://mpfs.plutimus.com/transaction/$ADDR/boot-token" \
  -H 'accept: application/json')
```

In the result you will find both the unsigned transaction and the token ID that will be created.
You can save the unsigned transaction to a file:

```bash
echo $result | jq -r '.unsignedTransaction' > tmp/tx.cbor
```

And export the token ID for the next steps:

```bash
TOKEN_ID=$(echo $result | jq -r '.value')
echo "Token ID: $TOKEN_ID"
```

When using an untrusted instance you should inspect the unsigned transaction before signing it. You can do this by using the `cardano-cli` tool or any other CBOR inspection tool. Better support will be added in the future, but in general it's a role of the application to validate contents before and after requesting a transaction to the `mpfs` instance.

Now you can sign and submit the transaction:

```bash
txId=$(sign_and_submit)
echo "Transaction ID: $txId"
```

And wait for it to be included in the blockchain:

```bash
wait_for_tx $txId
```

You can can inspect the token state with:

```bash
inspect_token
```

Critically the token root is the empty hash and the owner is your public key hash.
Also notice the empty set of requests, meaning no change-requests have been made yet.

## Requesting changes

For the sake of the manual we are not going to impersonate different roles, but you can imagine that requests for changes are made by different actors, which means different wallets, addresses and public key hashes. Specifically we are reusing ADDR env var and tmp/test.json mnemonics considering the token owner as requesting changes to himself.

### Request to insert a fact

A fact in this context is a key-value pair. MPFS impose no semantics so you are free to pass a json string for both. In case of binary data some encoding could be necessary, mpfs is not supporting any ATM.

You can ask the owner to insert a fact with

```bash
result=$(curl -s -X 'POST' \
  "https://mpfs.plutimus.com/transaction/$ADDR/request-insert/$TOKEN_ID" \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "key": "exampleKey",
  "value": "exampleValue"
   }')
echo $result | jq -r '.unsignedTransaction' > tmp/tx.cbor
txId=$(sign_and_submit)
wait_for_tx $txId
```

Let's store the first output reference of the transaction for later use inside retracting the request:

```bash
OUTPUT_REF="$txId-0"
```
Now you can inspect the token state again to see the request has been added:

```bash
inspect_token | jq -r '.requests'
```

As already mentioned, in this scenarion, the owner of the request is the same as the owner of the token.
The request owner is relevant when it comes to retracting it. With the current version of mpfs until the request is not processed, the owner can retract it, meaning that the request will be removed from the token state and no longer considered for processing.

### Retracting a request

The owner of the request can retract it with

```bash
result=$(curl -s -X 'GET' \
  "https://mpfs.plutimus.com/transaction/$ADDR/retract-change/$OUTPUT_REF"
  )
echo $result | jq -r '.unsignedTransaction' > tmp/tx.cbor
txId=$(sign_and_submit)
wait_for_tx $txId
```

Now inspecting the token will show that the request has been removed:

```bash
inspect_token | jq -r '.requests'
```
### Processing a request

Let's re-create the request to insert a fact, but this time we will process it.

```bash
result=$(curl -s -X 'POST' \
  "https://mpfs.plutimus.com/transaction/$ADDR/request-insert/$TOKEN_ID" \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "key": "exampleKey",
  "value": "exampleValue"
   }')
echo $result | jq -r '.unsignedTransaction' > tmp/tx.cbor
txId=$(sign_and_submit)
wait_for_tx $txId
```

Now as token owner we can process it into the token state with

```bash

OUTPUT_REF="$txId-0"
result=$(curl -s -X 'GET' \
  "https://mpfs.plutimus.com/transaction/$ADDR/update-token/$TOKEN_ID?request=$OUTPUT_REF" \
  -H 'accept: application/json'
  )
echo $result | jq -r '.unsignedTransaction' > tmp/tx.cbor
txId=$(sign_and_submit)
wait_for_tx $txId
```

Now inspecting the token will show that the request has been processed as the state is not the empty hash:
```bash
inspect_token | jq -r '.state.root'
```

Moreover the mpfs service is storing the facts of each token by indexing the blockchain so we can query them with

```bash
result=$(curl -s -X 'GET' \
  "https://mpfs.plutimus.com/token/$TOKEN_ID/facts" \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  )
echo $result | jq
```

## Request to update a fact

Anyone can request to update a fact by requesting an update to the existing key-value pair. The request is similar to the insert request, but it will update the value of an existing key.

```bash
result=$(curl -s -X 'POST' \
  "https://mpfs.plutimus.com/transaction/$ADDR/request-update/$TOKEN_ID" \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "key": "exampleKey",
  "oldValue": "exampleValue",
  "newValue": "newExampleValue"
   }')
echo $result | jq -r '.unsignedTransaction' > tmp/tx.cbor
txId=$(sign_and_submit)
wait_for_tx $txId
```

The token owner can process the request in the same way as before:

```bash
OUTPUT_REF="$txId-0"
result=$(curl -s -X 'GET' \
  "https://mpfs.plutimus.com/transaction/$ADDR/update-token/$TOKEN_ID?request=$OUTPUT_REF" \
  -H 'accept: application/json'
  )
echo $result | jq -r '.unsignedTransaction' > tmp/tx.cbor
txId=$(sign_and_submit)
wait_for_tx $txId
```

Now inspecting the facts at 'exampleKey' will show the updated value:

```bash
result=$(curl -s -X 'GET' \
  "https://mpfs.plutimus.com/token/$TOKEN_ID/facts" \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  )
echo $result | jq -r '.exampleKey'
```

## Request to delete a fact

Anyone can request to delete a fact by requesting a deletion of the key-value pair. The request is similar to the insert request, but it will remove the key from the token state.

```bash
result=$(curl -s -X 'POST' \
  "https://mpfs.plutimus.com/transaction/$ADDR/request-delete/$TOKEN_ID" \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{
  "key": "exampleKey"
  , "value": "newExampleValue"
   }')
echo $result | jq -r '.unsignedTransaction' > tmp/tx.cbor
txId=$(sign_and_submit)
wait_for_tx $txId
```

The token owner can process the request in the same way as before:

```bash
OUTPUT_REF="$txId-0"
result=$(curl -s -X 'GET' \
  "https://mpfs.plutimus.com/transaction/$ADDR/update-token/$TOKEN_ID?request=$OUTPUT_REF" \
  -H 'accept: application/json')
echo $result | jq -r '.unsignedTransaction' > tmp/tx.cbor
txId=$(sign_and_submit)
wait_for_tx $txId
```

Now facts will not contain the deleted key:

```bash
result=$(curl -s -X 'GET' \
  "https://mpfs.plutimus.com/token/$TOKEN_ID/facts" \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  )
echo $result | jq
```

And the token state will be back to a null hash

```bash
inspect_token | jq -r '.state.root'
```

## Deleting a token

The owner of the token can delete the token making impossible to refer to its facts in other smart contracts with

```bash
result=$(curl -s -X 'GET' \
  "https://mpfs.plutimus.com/transaction/$ADDR/end-token/$TOKEN_ID" \
  -H 'accept: application/json')
echo $result | jq -r '.unsignedTransaction' > tmp/tx.cbor
txId=$(sign_and_submit tmp/tx.cbor)
wait_for_tx $txId
```

And that's it, the token is deleted and its facts are no longer accessible.

```bash
inspect_token
}
```

