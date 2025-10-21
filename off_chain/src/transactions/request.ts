import { mConStr0, mConStr1, mConStr2 } from '@meshsdk/core';
import { Context } from './context';
import { signAndSubmit, WithTxHash } from './context/lib';
import { UnslottedChange } from '../trie/change';

export async function request(
    context: Context,
    tokenId: string,
    change: UnslottedChange
): Promise<WithTxHash<null>> {
    return await signAndSubmit(context, async walletAddress => {
        return await requestTx(context, walletAddress, tokenId, change);
    });
}

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
            operation = mConStr0([change.value]);
            break;
        case 'delete':
            operation = mConStr1([change.value]);
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
