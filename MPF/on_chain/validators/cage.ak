use aiken/collection/list.{find, foldl, has, head}
use aiken/crypto.{sha2_256}
use aiken/merkle_patricia_forestry.{MerklePatriciaForestry, Proof}
use aiken/merkle_patricia_forestry as mpf
use aiken/primitive/bytearray.{concat}
use cardano/transaction.{
  InlineDatum, Input, Output, OutputReference, Transaction,
}
use lib.{TokenId, tokenFromValue}
use mint.{CageDatum, Delete, Insert, Request, RequestDatum, State, StateDatum}

pub type Redeemer {
  // Destroy the token
  End
  // Accept a request for the token at the reference
  Contribute(OutputReference)
  // Update the state of the token
  Update(List<Proof>)
  // Request owner takes it back
  Retract
}

validator counterCage {
  spend(
    maybeDatum: Option<CageDatum>,
    redeemer: Redeemer,
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
          Update(proofs) ->
            validRootUpdate(state, input, tokenId, tx, proofs)
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

fn hashAppend(x, acc) {
  sha2_256(concat(acc, x))
}

fn mkUpdate(tokenId) {
  fn(input: Input, acc: (MerklePatriciaForestry, List<Proof>)) -> (
    MerklePatriciaForestry,
    List<Proof>,
  ) {
    when input.output.datum is {
      InlineDatum(datum) ->
        if datum is RequestDatum(request): CageDatum {
          let Request { requestToken,  requestPath, requestValue, .. } = request
          if requestToken == tokenId {
            let (root, proofs) = acc
            let proof, proofsTail <- uncons(proofs)
            let pathHash = foldl(requestPath, "", hashAppend)
            let newRoot = when requestValue is {
              Insert(value) ->
                mpf.insert(root, pathHash, value, proof)
              Delete(value) ->
                mpf.delete(root, pathHash, value, proof)

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
  expect mpf.root(expectedNewRoot) == newRoot
  // fail when the output address is not the same as the input address
  expect
    output.address.payment_credential == input.output.address.payment_credential
  // fail with no signature from the token-id owner
  True
}
// tests //

// const testScriptAddress = from_script("counter_cage")

// const testStateRef =
//   OutputReference { transaction_id: "1234567890abcdef", output_index: 255 }

// const testRequestRef =
//   OutputReference { transaction_id: "2234567890abcdef", output_index: 254 }

// const testToken = TokenId { policyId: "policy_id", assetName: "asset_name" }

// const testValue = valueFromToken(testToken)

// test cageWorks() {
//   let state = State { owner: "owner", root: mpf.empty }
//   let stateDatum = Some(StateDatum(state))
//   let aRequest =
//     RequestDatum(
//       Request {
//         requestToken: testToken,
//         requestPath: Path { segments: [] },
//         requestValue: "42",
//       },
//     )
//   let update =
//     Input {
//       output_reference: testStateRef,
//       output: Output {
//         address: testScriptAddress,
//         value: testValue,
//         datum: InlineDatum(stateDatum),
//         reference_script: None,
//       },
//     }
//   let request =
//     Input {
//       output_reference: testRequestRef,
//       output: Output {
//         address: testScriptAddress,
//         value: from_lovelace(0),
//         datum: InlineDatum(aRequest),
//         reference_script: None,
//       },
//     }
//   let output =
//     Output {
//       address: testScriptAddress,
//       value: testValue,
//       datum: InlineDatum(StateDatum(State { owner: "new-owner", root: mpf.empty })),
//       reference_script: None,
//     }
//   counterCage.spend(
//     stateDatum,
//     Update(
//       [Pair(testRequestRef, Proof { path: [], value: "42" })],
//     ),
//     testStateRef,
//     Transaction {
//       ..transaction.placeholder,
//       outputs: [output],
//       extra_signatories: ["owner"],
//       inputs: [update, request],
//     },
//   ) && counterCage.spend(
//     Some(aRequest),
//     Contribute(testStateRef),
//     testRequestRef,
//     Transaction { ..transaction.placeholder, inputs: [update, request] },
//   )
// }
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
