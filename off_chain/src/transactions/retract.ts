/**
 * Retract transaction for reclaiming pending requests.
 *
 * This module provides the transaction builder for retracting a request
 * that hasn't been accepted by the token owner yet. The retract transaction:
 * - Spends the Request UTxO with the Retract redeemer
 * - Requires the request owner's signature
 * - Returns the locked ADA to the request owner
 * @module
 */

import { mConStr3 } from '@meshsdk/core';
import { Context } from './context';
import { OutputRef } from '../lib';
import { mkOutputRefId } from '../outputRef';
import {
    signAndSubmit,
    WithTxHash,
    WithUnsignedTransaction
} from './context/lib';

/** Estimated execution cost for the Retract redeemer */
const guessingLowCost = {
    mem: 1_000_000,
    steps: 1_000_000_000
};

/**
 * Create and submit a retract transaction.
 *
 * Signs and submits a transaction that reclaims a pending request.
 *
 * @param context - The transaction context
 * @param requestOutputRef - The output reference of the request to retract
 * @returns Promise resolving to the tx hash
 */
export async function retract(
    context: Context,
    requestOutputRef: OutputRef
): Promise<WithTxHash<null>> {
    return await signAndSubmit(context, async walletAddress => {
        return await retractTransaction(
            context,
            walletAddress,
            requestOutputRef
        );
    });
}

/**
 * Build an unsigned retract transaction.
 *
 * Creates a transaction that:
 * 1. Spends the Request UTxO with the Retract redeemer (ConStr3)
 * 2. Requires the request owner's signature
 * 3. Returns the locked ADA as change
 *
 * @param context - The transaction context
 * @param walletAddress - The wallet address (must be the request owner)
 * @param requestOutputRef - The output reference of the request
 * @returns Promise resolving to unsigned tx
 * @throws Error if the request is not found or signer doesn't match owner
 */
export async function retractTransaction(
    context: Context,
    walletAddress: string,
    requestOutputRef: OutputRef
): Promise<WithUnsignedTransaction<null>> {
    const { utxos, collateral, signerHash } =
        await context.addressWallet(walletAddress);
    const { cbor: cageCbor } = context.cagingScript;
    const requests = await context.fetchRequests(null);
    const ouputRefId = mkOutputRefId(requestOutputRef);
    const request = requests.find(
        request => request.outputRefId === ouputRefId
    );
    if (!request) {
        throw new Error('Request not found');
    }

    const { owner } = request;

    if (owner !== signerHash) {
        throw new Error('Request owner does not match signer');
    }

    const tx = context.newTxBuilder(); // Initialize the transaction builder
    tx.spendingPlutusScriptV3()
        .txIn(requestOutputRef.txHash, requestOutputRef.outputIndex)
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr3([]), 'Mesh', guessingLowCost)
        .txInScript(cageCbor);

    tx.requiredSignerHash(signerHash)
        .changeAddress(walletAddress)
        .selectUtxosFrom(utxos)
        .txInCollateral(collateral.input.txHash, collateral.input.outputIndex);
    await tx.complete();
    return {
        unsignedTransaction: tx.txHex,
        value: null
    };
}
