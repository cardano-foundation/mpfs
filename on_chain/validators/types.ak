use aiken/crypto.{VerificationKeyHash}
use aiken/merkle_patricia_forestry.{Proof}
use cardano/transaction.{OutputReference}
use lib.{TokenId}

pub type Mint {
  // The asset name is the hash of the output reference. This must be one of the
  // transaction inputs.
  asset: OutputReference,

}

pub type MintRedeemer {
  Minting(Mint)
  Burning
}

pub type UpdateRedeemer {
  // Destroy the token
  End
  // Accept a request for the token at the reference
  Contribute(OutputReference)
  // Update the state of the token
  Modify(List<Proof>)
  // Request owner takes it back
  Retract

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
  Update(ByteArray, ByteArray)
}

pub type Request {
  requestToken: TokenId,
  requestOwner: VerificationKeyHash,
  requestKey: ByteArray,
  requestValue: Operation,
}

pub type CageDatum {
  RequestDatum(Request)
  StateDatum(State)
}
