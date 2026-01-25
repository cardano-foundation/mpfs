/**
 * Request transaction for submitting MPF modification requests.
 *
 * This module provides the transaction builder for creating a request
 * to modify someone else's caged token. The request transaction:
 * - Creates a new UTxO at the cage script address
 * - Attaches a RequestDatum with the desired operation
 * - Locks some ADA (refundable via retract or consumed on accept)
 * @module
 */

import { mConStr0, mConStr1, mConStr2 } from '@meshsdk/core';
import { Context } from './context';
import { signAndSubmit, WithTxHash } from './context/lib';
import { UnslottedChange } from '../trie/change';

/**
 * Create and submit a request transaction.
 *
 * Signs and submits a transaction that creates a pending request.
 *
 * @param context - The transaction context
 * @param tokenId - The asset name of the target token
 * @param change - The MPF operation to request (insert/delete/update)
 * @returns Promise resolving to the tx hash
 */
export async function request(
    context: Context,
    tokenId: string,
    change: UnslottedChange
): Promise<WithTxHash<null>> {
    return await signAndSubmit(context, async walletAddress => {
        return await requestTx(context, walletAddress, tokenId, change);
    });
}

/**
 * Build an unsigned request transaction.
 *
 * Creates a transaction that:
 * 1. Creates a UTxO at the cage script address with 10 ADA
 * 2. Attaches a RequestDatum containing:
 *    - tokenId: the target token
 *    - owner: the requester's pub key hash
 *    - key: the MPF key to modify
 *    - operation: insert/delete/update with values
 *
 * The locked ADA is returned when the request is either:
 * - Accepted by the token owner (consumed in update tx)
 * - Retracted by the request owner
 *
 * @param context - The transaction context
 * @param walletAddress - The wallet address creating the request
 * @param tokenId - The asset name of the target token
 * @param change - The MPF operation to request
 * @returns Promise resolving to unsigned tx
 * @throws Error if the wallet has no UTxOs
 */
export const requestTx = async (
    context: Context,
    walletAddress: string,
    tokenId: string,
    change: UnslottedChange
): Promise<{ unsignedTransaction: string; value: null }> => {
    const { utxos, signerHash } = await context.addressWallet(walletAddress);
    if (!utxos.length) {
        throw new Error(
            `No UTxO found. Please fund the wallet ${walletAddress}`
        );
    }
    const tokenIdDatum = mConStr0([tokenId]);
    let operation;
    switch (change.type) {
        case 'insert':
            operation = mConStr0([change.newValue]);
            break;
        case 'delete':
            operation = mConStr1([change.oldValue]);
            break;
        case 'update':
            operation = mConStr2([change.oldValue, change.newValue]);
    }
    const requestDatum = mConStr0([
        tokenIdDatum,
        signerHash,
        change.key,
        operation
    ]);
    const datum = mConStr0([requestDatum]);
    const tx = context.newTxBuilder();
    await tx
        .txOut(context.cagingScript.address, [
            { unit: 'lovelace', quantity: '10000000' }
        ])
        .txOutInlineDatumValue(datum)
        .changeAddress(walletAddress)
        .selectUtxosFrom(utxos)
        .complete();
    return {
        unsignedTransaction: tx.txHex,
        value: null
    };
};
