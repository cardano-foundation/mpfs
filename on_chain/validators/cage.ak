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
  Request, RequestDatum, Retract, State, StateDatum, Update, UpdateRedeemer,
}

validator mpfCage {
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
          Update(proofs) -> validRootUpdate(state, input, tokenId, tx, proofs)
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

pub fn extractToken(what: OutputReference, tx: Transaction) {
  // fail with no input for the output reference
  expect Some(input) =
    find(tx.inputs, fn(input) { input.output_reference == what })
  // fail when the input does not contain only one token-id aside lovelaces
  expect Some(tokenId) = tokenFromValue(input.output.value)
  (input, tokenId)
}

// We do not check for quantities. We expect the minting policy and the ledger
// to safeguard against any quantity different from (-1)
fn validateEnd(tokenId, tx) {
  let Transaction { mint, .. } = tx
  // fail when the mint does not contain only one token-id aside lovelaces
  expect Some(mintToken) = tokenFromValue(mint)
  // fail when the mint token-id is not the same as the one in the state
  expect tokenId == mintToken
  True
}

fn validateOwnership(state: State, tx: Transaction) {
  let Transaction { extra_signatories, .. } = tx
  let State { owner, .. } = state
  expect has(extra_signatories, owner)
  True
}

fn validRequest(request: Request, tokenRef: OutputReference, tx: Transaction) {
  let Request { requestToken, .. } = request
  let (_input, tokenId) = extractToken(tokenRef, tx)
  // fail when the hinted input token-id is not the same as the one in the request
  expect requestToken == tokenId
  True
}

fn uncons(list: List<a>, cont: fn(a, List<a>) -> b) -> b {
  when list is {
    [] -> fail
    [x, ..xs] -> cont(x, xs)
  }
}

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

fn validRootUpdate(
  state: State,
  input: Input,
  tokenId: TokenId,
  tx: Transaction,
  proofs: List<Proof>,
) {
  let Transaction { outputs, inputs, .. } = tx
  let State { root, .. } = state
  // fail when there is not only one output with the token-id (impossible)
  expect Some(output) = head(outputs)
  // fail when the output datum is not inline
  expect InlineDatum(state) = output.datum
  // fail when the output datum is not a state
  expect StateDatum(State { root: newRoot, .. }) = state

  // collect addendums
  let (expectedNewRoot, _) =
    inputs |> foldl((mpf.from_root(root), proofs), mkUpdate(tokenId))
  // fail when root was not updated as expected
  expect (mpf.root(expectedNewRoot) == newRoot)?
  // fail when the output address is not the same as the input address
  expect
    output.address.payment_credential == input.output.address.payment_credential
  // fail with no signature from the token-id owner
  True
}

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

// tests //

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
    Update([[]]),
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
// // Test that the script fails if the owner of the token-id-id hasn't signed
// // the transaction
// test missingSignature() fail {
//   let datum = Some(State { owner: "owner", root: 0 })
//   let input =
//     Input {
//       output_reference: test_tx_in,
//       output: Output {
//         address: test_script_address,
//         value: test_value,
//         datum: InlineDatum(datum),
//         reference_script: None,
//       },
//     }
//   let output =
//     Output {
//       address: test_script_address,
//       value: test_value,
//       datum: InlineDatum(State { owner: "new-owner", root: 1 }),
//       reference_script: None,
//     }
//   counter_cage.spend(
//     datum,
//     Void,
//     test_tx_in,
//     Transaction {
//       ..transaction.placeholder,
//       outputs: [output],
//       extra_signatories: ["owner-other"],
//       inputs: [input],
//     },
//   )
// }

// // Test that the script fails if the root was not updated accordingly
// test wrongDatum() fail {
//   let datum = Some(State { owner: "owner", root: 0 })
//   let input =
//     Input {
//       output_reference: test_tx_in,
//       output: Output {
//         address: test_script_address,
//         value: test_value,
//         datum: InlineDatum(datum),
//         reference_script: None,
//       },
//     }
//   let output =
//     Output {
//       address: test_script_address,
//       value: test_value,
//       datum: InlineDatum(State { owner: "new-owner", root: 2 }),
//       reference_script: None,
//     }
//   counter_cage.spend(
//     datum,
//     Void,
//     test_tx_in,
//     Transaction {
//       ..transaction.placeholder,
//       outputs: [output],
//       extra_signatories: ["owner"],
//       inputs: [input],
//     },
//   )
// }

// test tokenNotCaged() fail {
//   let datum = Some(State { owner: "owner", root: 0 })
//   let input =
//     Input {
//       output_reference: test_tx_in,
//       output: Output {
//         address: test_script_address,
//         value: test_value,
//         datum: InlineDatum(datum),
//         reference_script: None,
//       },
//     }
//   let output =
//     Output {
//       address: from_script("wrong_script_address"),
//       value: test_value,
//       datum: InlineDatum(State { owner: "new-owner", root: 1 }),
//       reference_script: None,
//     }
//   counter_cage.spend(
//     datum,
//     Void,
//     test_tx_in,
//     Transaction {
//       ..transaction.placeholder,
//       outputs: [output],
//       extra_signatories: ["owner"],
//       inputs: [input],
//     },
//   )
// }
