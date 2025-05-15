use aiken/crypto.{ScriptHash, VerificationKeyHash}
use aiken/option.{is_some}
use cardano/address as address
use cardano/assets.{PolicyId, zero}
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Transaction, find_input,
}
use lib.{TokenId, assetName, quantity, valueFromToken}
use aiken/merkle_patricia_forestry.{empty, root}
use aiken/collection/list.{head}

// NFT mint
// This validator is instantiated with a script address
// and a root datum.
// The script address is the address we expect the token to be sent to.
// The root is the datum we expect to be found in the token datum.

// The validator will receive a redeemer with the following fields:
// - asset: the hash of the output reference. This must be one of the transaction
//      inputs and source of uniqueness for the asset name.
// - owner: the public key of the owner of the token. This is not used in the
//      validator, but it will be passed verbatim in the datum.

// The validator will check that
// - the target address is a script address
// - the asset minted has quantity 1
// - the asset has the name of the hash of the output reference in the redeemer
// - the minted token has the owner and the root datum

pub type Mint {
  // The asset name is the hash of the output reference. This must be one of the
  // transaction inputs.
  asset: OutputReference,
  // The owner is the public key of the owner of the token. This is not used
  // in the validator, but is used to create the datum.
  owner: VerificationKeyHash,
}

pub type Redeemer {
  Minting(Mint)
  Burning
}

pub type State {
  // The owner is the public key of the owner of the token. The caging_script
  // is supposed to use this key to allow only the owner to spend the token.
  owner: VerificationKeyHash,
  // The initial root the token is supposed to carry, for this experiment just an int
  root: ByteArray,
}

pub type Operation {
    Insert(ByteArray)
    Delete(ByteArray)
    }

pub type Request {
  requestToken: TokenId,
  requestOwner: VerificationKeyHash,
  requestPath: List<ByteArray>,
  requestValue: Operation,
}

pub type CageDatum {
  RequestDatum(Request)
  StateDatum(State)
}

validator newToken(caging_script: ScriptHash) {
  mint(redeemer: Redeemer, policyId: PolicyId, tx: Transaction) {
    when redeemer is {
      Minting(mint) -> validateMint(mint, caging_script, policyId, tx)
      Burning -> True
    }
  }

  else(_) {
    fail
  }
}

fn validateMint(
  minting: Mint,
  caging_script: ScriptHash,
  policyId: PolicyId,
  tx: Transaction,
) {
  let Mint { asset, owner } = minting
  let Transaction { outputs, mint, inputs, .. } = tx
  let tokenId = TokenId { policyId, assetName: assetName(asset) }
  // Source of uniqueness for the asset name
  expect is_some(find_input(inputs, asset))
  // Mint only one token-id
  expect
    when quantity(mint, tokenId) is {
      Some(quantity) -> quantity == 1
      None -> False
    }
  // There is only one output with the token-id
  expect Some(output) = head(outputs)
  // The output address is a script address
  expect address.Script(targetScriptHash) = output.address.payment_credential
  // The output address is the same as the caging_script (context)
  expect targetScriptHash == caging_script
  // The output datum is inline
  expect InlineDatum(tokenState) = output.datum
  // The output datum is respecting requested owner (redeemer) and root (context)
  expect StateDatum(State { root: tokenRoot, owner: tokenOwner }) = tokenState
  expect tokenRoot == root(empty)
  expect tokenOwner == owner
  True
}

test newToken() {
  let reference =
    OutputReference { transaction_id: "1234567890abcdef", output_index: 255 }
  let token = TokenId { policyId: "policy_id", assetName: assetName(reference) }
  let minting = Mint { asset: reference, owner: "public_key" }
  let redeemer = Minting(minting)
  let minted_value = valueFromToken(token)
  let output_address = address.from_script("caging_script")
  let minted =
    Output {
      address: output_address,
      value: minted_value,
      datum: InlineDatum(StateDatum(State { owner: minting.owner, root: root(empty) })),
      reference_script: None,
    }
  let paying_address = address.from_verification_key("paying_address")
  let consumed_value = zero
  let consumed_utxo =
    Output {
      address: paying_address,
      value: consumed_value,
      datum: NoDatum,
      reference_script: None,
    }
  expect address.Script(scriptHash) = output_address.payment_credential
  newToken.mint(
    scriptHash,
    redeemer,
    token.policyId,
    Transaction {
      ..transaction.placeholder,
      outputs: [minted],
      mint: minted_value,
      inputs: [Input { output_reference: reference, output: consumed_utxo }],
    },
  )
}
