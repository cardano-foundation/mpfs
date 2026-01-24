/**
 * End transaction for destroying caged tokens.
 *
 * This module provides the transaction builder for burning a caged token,
 * effectively ending the cage. The end transaction:
 * - Spends the State UTxO containing the token
 * - Burns the token (-1 quantity)
 * - Requires the owner's signature
 * @module
 */

import { mConStr0, mConStr1 } from '@meshsdk/core';
import { Context } from './context';
import { signAndSubmit, WithUnsignedTransaction } from './context/lib';

/**
 * Create and submit an end transaction.
 *
 * Signs and submits a transaction that burns a caged token.
 *
 * @param context - The transaction context
 * @param tokenId - The asset name of the token to burn
 * @returns Promise resolving to the tx hash
 */
export async function end(context: Context, tokenId: string) {
    return await signAndSubmit(context, async walletAddress => {
        return await endTransaction(context, walletAddress, tokenId);
    });
}

/**
 * Build an unsigned end transaction.
 *
 * Creates a transaction that:
 * 1. Spends the State UTxO with the End redeemer
 * 2. Burns the token (mints -1)
 * 3. Requires the owner's signature
 *
 * @param context - The transaction context
 * @param walletAddress - The wallet address (must be the owner)
 * @param tokenId - The asset name of the token to burn
 * @returns Promise resolving to unsigned tx
 * @throws Error if the token is not found
 */
export async function endTransaction(
    context: Context,
    walletAddress: string,
    tokenId: string
): Promise<WithUnsignedTransaction<null>> {
    const { cbor: cageCbor, policyId } = context.cagingScript;
    const { utxos, collateral, signerHash } =
        await context.addressWallet(walletAddress);
    const dbState = await context.fetchToken(tokenId);
    if (!dbState) {
        throw new Error(`Token with ID ${tokenId} not found`);
    }
    const { outputRef } = dbState;
    const tx = context.newTxBuilder();
    await tx
        .spendingPlutusScriptV3()
        .txIn(outputRef.txHash, outputRef.outputIndex)
        .spendingReferenceTxInInlineDatumPresent()
        .spendingReferenceTxInRedeemerValue(mConStr0([]))
        .txInScript(cageCbor)
        .mintPlutusScriptV3()
        .mint('-1', policyId, tokenId)
        .mintRedeemerValue(mConStr1([]))
        .mintingScript(cageCbor)
        .changeAddress(walletAddress) // send change back to the wallet address
        .requiredSignerHash(signerHash)
        .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
        .selectUtxosFrom(utxos)
        .complete();
    return {
        unsignedTransaction: tx.txHex,
        value: null
    };
}
