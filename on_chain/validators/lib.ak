/// Helper functions for token handling in the MPF Cage validator.
///
/// This module provides utilities for:
/// - Token identification and extraction from values
/// - Asset name computation from output references
/// - Value construction for single tokens

use aiken/collection/dict.{get, keys}
use aiken/collection/list.{delete, find}
use aiken/crypto.{Hash, Sha2_256, sha2_256}
use aiken/primitive/bytearray.{concat, from_int_big_endian}
use cardano/assets.{AssetName, PolicyId, Value, from_asset, policies, tokens}
use cardano/transaction.{Input, Output, OutputReference}

/// A unique identifier for a token, consisting of just the asset name.
///
/// The policy ID is provided separately in functions that need it,
/// allowing the same TokenId to be used across different contexts.
pub type TokenId {
  assetName: AssetName,
}

/// Get the quantity of a specific token in a value.
///
/// Returns `Some(quantity)` if the token exists, `None` otherwise.
pub fn quantity(policyId : PolicyId, value: Value, TokenId { assetName }) -> Option<Int> {
  get(tokens(value, policyId), assetName)
}

/// Compute a unique asset name from an output reference.
///
/// The asset name is the SHA2-256 hash of the transaction ID concatenated
/// with the output index (as 2 big-endian bytes). This ensures uniqueness
/// since an output reference can only be consumed once.
pub fn assetName(ref: OutputReference) -> Hash<Sha2_256, OutputReference> {
  let bytes =
    concat(ref.transaction_id, from_int_big_endian(ref.output_index, 2))
  sha2_256(bytes)
}

/// Construct a Value containing exactly 1 of the specified token.
///
/// Used when creating outputs that should hold a single NFT.
pub fn valueFromToken(policyId : PolicyId , TokenId { assetName }: TokenId) -> Value {
  from_asset(policyId, assetName, 1)
}

/// Extract a single token ID from a value.
///
/// This function expects the value to contain exactly one non-ADA policy
/// with exactly one asset name. Returns `None` if the value doesn't match
/// this pattern (e.g., contains multiple tokens or no tokens).
///
/// This is useful for extracting the caged token from a UTxO that should
/// contain only ADA and a single NFT.
pub fn tokenFromValue(value: Value) -> Option<TokenId> {
  when delete(policies(value), "") is {
    [policyId] -> {
      let tokens = tokens(value, policyId)
      when keys(tokens) is {
        [assetName] ->
          when get(tokens, assetName) is {
            Some(_) -> Some(TokenId { assetName })
            _ -> None
          }
        _ -> None
      }
    }
    _ -> None
  }
}

/// Find an input by output reference and extract its token.
///
/// Searches the input list for the specified output reference and extracts
/// the single token from that input's value. Returns `None` if the input
/// is not found or doesn't contain exactly one token (aside from ADA).
pub fn extractTokenFromInputs(what: OutputReference, inputs: List<Input>) {
  when find(inputs, fn(input) { input.output_reference == what }) is {
    Some(input) ->
      when tokenFromValue(input.output.value) is {
        Some(tokenId) -> Some((input, tokenId))
        _ -> None
      }
    _ -> None
  }
}
