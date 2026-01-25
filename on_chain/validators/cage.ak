/// MPF Cage Validator - A self-custodial Merkle Patricia Forestry on Cardano.
///
/// This validator implements the "cage" pattern for managing NFTs with associated
/// on-chain data structures. A caged token is an NFT locked at this script's address
/// with a Merkle Patricia Forestry (MPF) root as part of its datum.
///
/// ## Minting Policy
///
/// When minting a new caged token, the validator ensures:
/// - The asset name is derived from a consumed UTxO (ensuring uniqueness)
/// - Exactly one token is minted
/// - The token is sent to this script's address
/// - The initial MPF root is empty
///
/// ## Spending Validator
///
/// The validator supports four operations:
///
/// - **Modify**: Owner updates the MPF by processing pending requests.
///   Requires proofs for each request being folded into the MPF.
///
/// - **Contribute**: Links a Request UTxO to a State UTxO, validating
///   that the request targets the correct token.
///
/// - **Retract**: Allows a request owner to reclaim their Request UTxO
///   if the token owner hasn't accepted it.
///
/// - **End**: Burns the caged token, destroying the cage entirely.
///
/// ## Data Flow
///
/// 1. User creates a caged token via `Minting` (empty MPF root)
/// 2. Others submit requests as separate UTxOs with `RequestDatum`
/// 3. Owner accepts requests via `Modify`, updating the MPF root
/// 4. Request owners can `Retract` unprocessed requests
/// 5. Owner can `End` the cage when done

use aiken/collection/list.{find, foldl, has, head}
use aiken/merkle_patricia_forestry.{MerklePatriciaForestry, Proof, empty, root}
use aiken/merkle_patricia_forestry as mpf
use aiken/option.{is_some}
use cardano/address.{from_script}
use cardano/assets.{PolicyId, from_lovelace, zero}
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Transaction, find_input,
}
use lib.{TokenId, assetName, quantity, tokenFromValue, valueFromToken}
use types.{
  Burning, CageDatum, Contribute, Delete, End, Insert, Mint, MintRedeemer, Minting,
  Modify, Request, RequestDatum, Retract, State, StateDatum, Update, UpdateRedeemer,
}

/// The main validator for caged MPF tokens.
///
/// This validator serves as both a minting policy and a spending validator,
/// using the same script hash for both purposes. This ensures that minted
/// tokens can only be sent to this script's address.
validator mpfCage {
  /// Minting policy: validates creation and destruction of caged tokens.
  ///
  /// - `Minting`: Creates a new caged token with an empty MPF root
  /// - `Burning`: Allows burning (no additional validation needed)
  mint(redeemer: MintRedeemer, policyId: PolicyId, tx: Transaction) {
    trace @"minting": redeemer
    when redeemer is {
      Minting(mint) -> {
        trace "minting": mint
        validateMint(mint, policyId, tx)
        }
      Burning -> True
    }
  }

  /// Spending validator: validates operations on caged UTxOs.
  ///
  /// Dispatches to different validation logic based on the redeemer:
  /// - `Retract`: Request owner reclaims their request
  /// - `Contribute`: Links a request to a state UTxO
  /// - `Modify`: Owner updates the MPF with pending requests
  /// - `End`: Owner burns the caged token
  spend(
    maybeDatum: Option<CageDatum>,
    redeemer: UpdateRedeemer,
    self: OutputReference,
    tx: Transaction,
  ) {
    // fail with no datum
    expect Some(datum) = maybeDatum
    // dispatch based on reedeemer
    when redeemer is {
      Retract -> {
        // fail with no request in the datum
        expect RequestDatum(request) = datum
        // fail when the request is not signed by the owner
        let Request { requestOwner, .. } = request
        let Transaction { extra_signatories, .. } = tx
        expect has(extra_signatories, requestOwner)
        True
      }
      Contribute(tokenRef) -> {
        // fail with no request in the datum
        expect RequestDatum(request) = datum
        validRequest(request, tokenRef, tx)
      }
      _ -> {
        // fail with no state in the datum
        expect StateDatum(state) = datum
        // fail when the transaction is not signed by the state owner
        expect validateOwnership(state, tx)
        let (input, tokenId) = extractToken(self, tx)
        when redeemer is {
          Modify(proofs) -> validRootUpdate(state, input, tokenId, tx, proofs)
          End -> validateEnd(tokenId, tx)
          _ -> fail
        }
      }
    }
  }

  else(_) {
    fail
  }
}

/// Extract the token from a transaction input by its output reference.
///
/// Finds the input matching the given output reference and extracts the
/// single token from its value. Fails if the input is not found or
/// doesn't contain exactly one non-ADA token.
pub fn extractToken(what: OutputReference, tx: Transaction) {
  expect Some(input) =
    find(tx.inputs, fn(input) { input.output_reference == what })
  expect Some(tokenId) = tokenFromValue(input.output.value)
  (input, tokenId)
}

/// Validate that the token is being burned.
///
/// Checks that the mint field contains the same token as the one being spent.
/// The minting policy and ledger ensure the quantity is exactly -1.
fn validateEnd(tokenId, tx) {
  let Transaction { mint, .. } = tx
  // fail when the mint does not contain only one token-id aside lovelaces
  expect Some(mintToken) = tokenFromValue(mint)
  // fail when the mint token-id is not the same as the one in the state
  expect tokenId == mintToken
  True
}

/// Validate that the state owner has signed the transaction.
///
/// Checks that the owner's verification key hash is in the transaction's
/// extra signatories list.
fn validateOwnership(state: State, tx: Transaction) {
  let Transaction { extra_signatories, .. } = tx
  let State { owner, .. } = state
  expect has(extra_signatories, owner)
  True
}

/// Validate that a request matches the token being updated.
///
/// Ensures the request's target token matches the token at the given
/// output reference. This prevents requests from being applied to
/// the wrong caged token.
fn validRequest(request: Request, tokenRef: OutputReference, tx: Transaction) {
  let Request { requestToken, .. } = request
  let (_input, tokenId) = extractToken(tokenRef, tx)
  expect requestToken == tokenId
  True
}

/// Helper to deconstruct a non-empty list with continuation.
///
/// Calls the continuation with the head and tail. Fails on empty list.
fn uncons(list: List<a>, cont: fn(a, List<a>) -> b) -> b {
  when list is {
    [] -> fail
    [x, ..xs] -> cont(x, xs)
  }
}

/// Create an update function for folding requests into the MPF.
///
/// Returns a function that, given an input and accumulator, checks if
/// the input contains a Request targeting this token. If so, applies
/// the request's operation to the MPF using the corresponding proof.
fn mkUpdate(tokenId) {
  fn(input: Input, acc: (MerklePatriciaForestry, List<Proof>)) -> (
    MerklePatriciaForestry,
    List<Proof>,
  ) {
    when input.output.datum is {
      InlineDatum(datum) ->
        if datum is RequestDatum(request): CageDatum {
          let Request { requestToken, requestKey, requestValue, .. } = request
          if requestToken == tokenId {
            let (root, proofs) = acc
            let proof, proofsTail <- uncons(proofs)
            let newRoot =
              when requestValue is {
                Insert(value) -> mpf.insert(root, requestKey, value, proof)
                Delete(value) -> mpf.delete(root, requestKey, value, proof)
                Update(oldValue, newValue) ->
                  mpf.update(root, requestKey, proof, oldValue, newValue)
              }
            (newRoot, proofsTail)
          } else {
            acc
          }
        } else {
          acc
        }
      _ -> acc
    }
  }
}

/// Validate that the MPF root was correctly updated.
///
/// This is the core validation for the `Modify` operation. It:
/// 1. Extracts the new root from the output datum
/// 2. Folds all input requests into the current MPF using the provided proofs
/// 3. Verifies the computed root matches the output's root
/// 4. Ensures the token stays at the same script address
///
/// The proofs list must contain one proof per request being processed,
/// in the same order as the requests appear in the inputs.
fn validRootUpdate(
  state: State,
  input: Input,
  tokenId: TokenId,
  tx: Transaction,
  proofs: List<Proof>,
) {
  let Transaction { outputs, inputs, .. } = tx
  let State { root, .. } = state
  expect Some(output) = head(outputs)
  expect InlineDatum(state) = output.datum
  expect StateDatum(State { root: newRoot, .. }) = state

  // Fold all requests into the MPF, consuming proofs as we go
  let (expectedNewRoot, _) =
    inputs |> foldl((mpf.from_root(root), proofs), mkUpdate(tokenId))
  // Verify the new root matches what we computed
  expect (mpf.root(expectedNewRoot) == newRoot)?
  // Ensure the token stays locked at the same script
  expect
    output.address.payment_credential == input.output.address.payment_credential
  True
}

/// Validate minting of a new caged token.
///
/// Ensures:
/// - The asset name source (output reference) is consumed in the transaction
/// - Exactly one token is minted
/// - The token is sent to this script's address
/// - The output datum contains an empty MPF root
pub fn validateMint(minting: Mint, policyId: PolicyId, tx: Transaction) {
  let Mint { asset } = minting
  let Transaction { outputs, mint, inputs, .. } = tx
  let tokenId = TokenId { assetName: assetName(asset) }
  // Source of uniqueness for the asset name
  expect is_some(find_input(inputs, asset))
  // Mint only one token-id
  expect
    when quantity(policyId, mint, tokenId) is {
      Some(quantity) -> quantity == 1
      None -> False
    }
  // There is only one output with the token-id
  expect Some(output) = head(outputs)
  // The output address is a script address
  expect address.Script(targetScriptHash) = output.address.payment_credential
  // The output address is the same as the caging_script (context)
  expect targetScriptHash == policyId
  // The output datum is inline
  expect InlineDatum(tokenState) = output.datum
  // The output datum is respecting requested owner (redeemer) and root (context)
  expect StateDatum(State { root: tokenRoot, owner: _ }) = tokenState
  expect tokenRoot == root(empty)
  True
}

// ============================================================================
// Tests
// ============================================================================

const testScriptAddress = from_script("counter_cage")

const testStateRef =
  OutputReference { transaction_id: "1234567890abcdef", output_index: 255 }

const testRequestRef =
  OutputReference { transaction_id: "2234567890abcdef", output_index: 254 }

const testToken = TokenId { assetName: "asset_name" }

const testValue = valueFromToken("policy_id", testToken)

const state = State { owner: "owner", root: root(mpf.empty) }

const stateDatum = Some(StateDatum(state))

const aRequest =
  RequestDatum(
    Request {
      requestToken: testToken,
      requestKey: "42",
      requestValue: Insert("42"),
      requestOwner: "owner",
    },
  )

const update =
  Input {
    output_reference: testStateRef,
    output: Output {
      address: testScriptAddress,
      value: testValue,
      datum: InlineDatum(stateDatum),
      reference_script: None,
    },
  }

const request =
  Input {
    output_reference: testRequestRef,
    output: Output {
      address: testScriptAddress,
      value: from_lovelace(0),
      datum: InlineDatum(aRequest),
      reference_script: None,
    },
  }

const output =
  Output {
    address: testScriptAddress,
    value: testValue,
    datum: InlineDatum(
      StateDatum(
        State {
          owner: "new-owner",
          root: #"484dee386bcb51e285896271048baf6ea4396b2ee95be6fd29a92a0eeb8462ea",
        },
      ),
    ),
    reference_script: None,
  }

test canCage() {
  mpfCage.spend(
    stateDatum,
    Modify([[]]),
    testStateRef,
    Transaction {
      ..transaction.placeholder,
      outputs: [output],
      extra_signatories: ["owner"],
      inputs: [update, request],
    },
  ) && mpfCage.spend(
    Some(aRequest),
    Contribute(testStateRef),
    testRequestRef,
    Transaction { ..transaction.placeholder, inputs: [update, request] },
  )
}

const reference =
  OutputReference { transaction_id: "1234567890abcdef", output_index: 255 }

const token = TokenId { assetName: assetName(reference) }

const minting = Mint { asset: reference}

const minted_value = valueFromToken("policy_id", token)

const output_address = address.from_script("policy_id")

const minted =
  Output {
    address: output_address,
    value: minted_value,
    datum: InlineDatum(
      StateDatum(State { owner: "owner", root: root(empty) }),
    ),
    reference_script: None,
  }

const paying_address = address.from_verification_key("paying_address")

const consumed_value = zero

const consumed_utxo =
  Output {
    address: paying_address,
    value: consumed_value,
    datum: NoDatum,
    reference_script: None,
  }

test canMint() {
  mpfCage.mint(
    Minting(minting),
    "policy_id",
    Transaction {
      ..transaction.placeholder,
      outputs: [minted],
      mint: minted_value,
      inputs: [Input { output_reference: reference, output: consumed_utxo }],
    },
  )
}
