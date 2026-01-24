/**
 * Boot transaction for creating new caged tokens.
 *
 * This module provides the transaction builder for minting a new caged token.
 * The boot transaction:
 * - Consumes a UTxO for uniqueness (its hash becomes the asset name)
 * - Mints exactly 1 token with the derived asset name
 * - Sends the token to the cage script address
 * - Sets the initial state with the signer as owner and empty MPF root
 * @module
 */

import { mConStr0, mConStr1 } from '@meshsdk/core';
import { deserializeAddress } from '@meshsdk/core';
import { OutputRef, assetName, nullHash } from '../lib';
import { Context } from './context';
import {
    signAndSubmit,
    WithTxHash,
    WithUnsignedTransaction
} from './context/lib';

/**
 * Create and submit a boot transaction.
 *
 * Signs and submits a transaction that mints a new caged token.
 *
 * @param context - The transaction context
 * @returns Promise resolving to the tx hash and new token's asset name
 */
export async function boot(context: Context): Promise<WithTxHash<string>> {
    return await signAndSubmit(context, async walletAddress => {
        return await bootTransaction(context, walletAddress);
    });
}

/**
 * Build an unsigned boot transaction.
 *
 * Creates a transaction that:
 * 1. Consumes the first UTxO from the wallet (for uniqueness)
 * 2. Mints a new token with asset name = hash(txHash || outputIndex)
 * 3. Sends the token to the cage script address
 * 4. Attaches a StateDatum with owner = signer and root = empty
 *
 * @param context - The transaction context
 * @param walletAddress - The wallet address to use
 * @returns Promise resolving to unsigned tx and the new token's asset name
 * @throws Error if the wallet has no UTxOs
 */
export async function bootTransaction(
    context: Context,
    walletAddress: string
): Promise<WithUnsignedTransaction<string>> {
    const cagingScript = context.cagingScript;
    const { utxos, firstUTxO } = await context.addressWallet(walletAddress);
    if (!firstUTxO) {
        throw new Error(
            `No UTxO found. Please fund the wallet ${walletAddress}`
        );
    }
    const uniqueness: OutputRef = firstUTxO.input;
    const uniquenessP = mConStr0([uniqueness.txHash, uniqueness.outputIndex]);

    const asset = assetName(uniqueness);

    const {
        address: cageAddress,
        cbor: cageCbor,
        policyId: mintPolicyId
    } = cagingScript;

    const unit = mintPolicyId + asset;

    const tx = context.newTxBuilder();
    const signerHash = deserializeAddress(walletAddress).pubKeyHash;
    await tx
        .txIn(uniqueness.txHash, uniqueness.outputIndex)
        .mintPlutusScriptV3()
        .mint('1', mintPolicyId, asset)
        .mintingScript(cageCbor)
        .mintRedeemerValue(mConStr0([mConStr0([uniquenessP])]))
        .txOut(cageAddress, [{ unit, quantity: '1' }])
        .txOutInlineDatumValue(mConStr1([mConStr0([signerHash, nullHash])]))
        .changeAddress(walletAddress)
        .selectUtxosFrom(utxos)
        .txInCollateral(firstUTxO.input.txHash, firstUTxO.input.outputIndex)
        .complete();

    return {
        unsignedTransaction: tx.txHex,
        value: asset
    };
}
