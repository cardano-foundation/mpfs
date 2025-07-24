# System architecture

The purpose of the system is to store a knowledge database. The knowledge is a set of keys. In addition, each key can come with a value which we refer to as state.

## Parties

### Knowledge Owner

Someone who controls what is inside the knowledge database.

### Knowledge Contributors

Anyone who wants to contribute to the knowledge database.

### Knowledge Observers

Anyone who needs to queries the knowledge database.

## Blockchain

The blockchain is used to store the state of the knowledge database and to validate operations on it.

## Overview

### Knowledge Storage

All knowledge is stored on the blockchain history, so it's reconstructable by anyone with access to it.
Moreover each of its facts are referrable as transaction inputs to be consumed in smart contracts as if they were stored in the current state of the blockchain.

### Knowledge Control

The knowledge owner is the only one who can add or remove knowledge from the database. To do so he has to consume requests from knowledge contributors. In the current shape of the system, the knowledge owner has full control over the knowledge database, but in the future it could be possible to implement a more decentralized model where this power is distributed among multiple parties.
We often refer to the knowledge owner as the "knowledge authority" or simply "oracle".

## Interaction

### Knowledge Token

We refer to the current state of the knowledge as the "knowledge token". The token is the only value that is part of the blockchain state and it contains the hash of the knowledge and the public key hash of the knowledge owner.
All tokens are sitting at the system address which is determined by the smart contract controlling its identifier and its updating.

### Knowledge Token Transactions

3 transactions are possible involving tokens

1. **Boot**: Anyone can become a knowledge owner by creating a new knowledge token. This token will be started with the null hash and be uniquely identified by an id, the token-id. The knowledge owner will also set the public key hash of the knowledge owner in the token.
2. **Update**: The knowledge owner can update the knowledge token by adding or removing facts from the database. This transaction will consume requests from contributorts and will update the knowledge hash in the token and potentially change the ownership of the token.
3. **End**: The knowledge owner can delete the knowledge token, which will remove the token-id, so no other updates can be applied on it. Future versions of this sytem will allow to use a deleted token knowledge hash as a starting point for a new knowledge token, so the knowledge can be transferred in a new token without losing the history of the previous one.

### Knowledge Change Requests

Knowledge contributors can send requests to the system address. They will be spent in the update transaction of the token they are referring to. The request will contain the key and the value to be added or removed from the knowledge database as well as the token-id of the knowledge token they wantt to be applied to.
The request will also contain the public key hash of the contributor, so
- The request publisher can retract the request if needed.
- The token owner knows how to restitute part of the value that is locked in the request to the contributor.

3 Transactions are possible involving requests

1. **Request**: Anyone can create a request to add or remove knowledge from the database. The request will be stored in the blockchain state and can be consumed by the knowledge owner in the update transaction.
2. **Retract**: The request publisher can retract the request in case the token owner does not accept it.
3. **Update**: This is the same transaction as the update of the knowledge token, which consumes both a token and the requests that were targeting it.

### Smart contracts

A smart contrat is involved in `boot`, `update`, `end`, and `retract` transactions.
For each of these transactions, the smart contract will enforce rules to ensure the integrity of the knowledge database and the validity of the transactions.
- `boot`:
  - The new token-id is unique
  - The hash in the token is null (this is the hash of the knowledge database, implying an empty database)
- `update`:
  - All consumed change-requests have their referred token consumed as well
  - All requests are coupled with a proof that the update is actually performed to the knowledge database
  - The token remains at the system address
  - The token owner is the one who is performing the update
- `end`:
  - The token owner is the one who is performing the end
- `retract`:
  - The request publisher is the one who is performing the retract