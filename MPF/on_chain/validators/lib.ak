use aiken/collection/dict.{get, keys}
use aiken/collection/list.{delete, filter, find}
use aiken/crypto.{Hash, Sha2_256, sha2_256}
use aiken/primitive/bytearray.{concat, from_int_big_endian}
use cardano/assets.{AssetName, PolicyId, Value, from_asset, policies, tokens}
use cardano/transaction.{Input, Output, OutputReference}

pub type TokenId {
  policyId: PolicyId,
  assetName: AssetName,
}

// Extract the outputs that contain a token-id
pub fn outputsOfToken(outputs: List<Output>, tokenId: TokenId) -> List<Output> {
  outputs
    |> filter(
        fn(output) {
          when quantity(output.value, tokenId) is {
            Some(_) -> True
            None -> False
          }
        },
      )
}

pub fn quantity(value: Value, TokenId { policyId, assetName }) -> Option<Int> {
  get(tokens(value, policyId), assetName)
}

// Compute the asset name from the output reference
pub fn assetName(ref: OutputReference) -> Hash<Sha2_256, OutputReference> {
  let bytes =
    concat(ref.transaction_id, from_int_big_endian(ref.output_index, 2))
  sha2_256(bytes)
}

pub fn valueFromToken(TokenId { policyId, assetName }: TokenId) -> Value {
  from_asset(policyId, assetName, 1)
}

// Extract the token-id from a value given it contains only one token-id aside lovelaces
pub fn tokenFromValue(value: Value) -> Option<TokenId> {
  when delete(policies(value), "") is {
    [policyId] -> {
      let tokens = tokens(value, policyId)
      when keys(tokens) is {
        [assetName] ->
          when get(tokens, assetName) is {
            Some(_) -> Some(TokenId { policyId, assetName })
            _ -> None
          }
        _ -> None
      }
    }
    _ -> None
  }
}

pub fn extractTokenFromInputs(what: OutputReference, inputs: List<Input>) {
  // fail with no input for the output reference
  when find(inputs, fn(input) { input.output_reference == what }) is {
    Some(input) ->
      // fail when the input does not contain only one token-id aside lovelaces
      when tokenFromValue(input.output.value) is {
        Some(tokenId) -> Some((input, tokenId))
        _ -> None
      }
    _ -> None
  }
}
