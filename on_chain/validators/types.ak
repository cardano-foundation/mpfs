/// Core type definitions for the MPF Cage validator.
///
/// This module defines the data structures used for:
/// - Minting and burning caged tokens
/// - Managing state updates via the Merkle Patricia Forestry
/// - Processing contribution requests from other users
///
/// ## Cage Pattern Overview
///
/// A "caged" token is an NFT locked at a script address with an associated
/// Merkle Patricia Forestry (MPF) root. The owner can update the MPF by
/// accepting requests from other users, enabling collaborative data structures
/// on-chain.

use aiken/crypto.{VerificationKeyHash}
use aiken/merkle_patricia_forestry.{Proof}
use cardano/transaction.{OutputReference}
use lib.{TokenId}

/// Parameters for minting a new caged token.
///
/// The asset name is derived from the hash of the output reference,
/// ensuring uniqueness.
pub type Mint {
  /// The output reference used to derive the asset name (via hash).
  /// This must be one of the transaction inputs to ensure uniqueness.
  asset: OutputReference,
}

/// Redeemer for the minting policy.
pub type MintRedeemer {
  /// Mint a new caged token with the given parameters
  Minting(Mint)
  /// Burn an existing caged token (no additional validation)
  Burning
}

/// Redeemer for spending caged UTxOs.
///
/// Different actions are available depending on whether the UTxO
/// contains a State or a Request datum.
pub type UpdateRedeemer {
  /// Destroy the caged token (burns the NFT). Requires State datum.
  End
  /// Accept a pending request, folding it into the MPF. Requires Request datum.
  /// The OutputReference points to the State UTxO being updated.
  Contribute(OutputReference)
  /// Update the MPF state by processing input requests. Requires State datum.
  /// The proofs list must match the requests being processed.
  Modify(List<Proof>)
  /// Allow the request owner to reclaim their Request UTxO. Requires Request datum.
  Retract
}

/// The state of a caged token, stored as inline datum.
///
/// This represents the current owner and MPF root of the caged token.
pub type State {
  /// The verification key hash of the token owner.
  /// Only the owner can modify the MPF state or end the cage.
  owner: VerificationKeyHash,
  /// The current Merkle Patricia Forestry root hash.
  /// This commits to all key-value pairs stored in the MPF.
  root: ByteArray,
}

/// Operations that can be performed on the MPF.
///
/// Each operation modifies the MPF in a specific way and requires
/// a corresponding proof to validate the transition.
pub type Operation {
  /// Insert a new key-value pair. Fails if key already exists.
  Insert(ByteArray)
  /// Delete an existing key-value pair. The ByteArray is the expected value.
  Delete(ByteArray)
  /// Update an existing key's value. Args: (old_value, new_value)
  Update(ByteArray, ByteArray)
}

/// A request to modify a caged token's MPF.
///
/// Requests are created by users who want to contribute data to
/// someone else's caged token. The token owner can then accept
/// the request by including it in a Modify transaction.
pub type Request {
  /// The token this request targets (by asset name)
  requestToken: TokenId,
  /// The owner of this request (can reclaim via Retract)
  requestOwner: VerificationKeyHash,
  /// The key to insert/update/delete in the MPF
  requestKey: ByteArray,
  /// The operation to perform on the key
  requestValue: Operation,
}

/// Datum for UTxOs locked at the cage script address.
///
/// The cage script can hold two types of UTxOs:
/// - State UTxOs: contain the caged token and its MPF root
/// - Request UTxOs: contain pending requests to modify a token's MPF
pub type CageDatum {
  /// A pending request to modify someone's caged token
  RequestDatum(Request)
  /// The current state of a caged token
  StateDatum(State)
}
