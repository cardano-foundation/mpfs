import { mConStr0, mConStr1 } from '@meshsdk/core';
import { Context } from './context';
import { OutputRef } from '../lib';

export async function request(
    context: Context,
    tokenId: string,
    key: string,
    value: string,
    op: 'insert' | 'delete'
): Promise<OutputRef> {
    if (!tokenId) {
        throw new Error('No token id provided');
    }

    const { walletAddress, utxos, signerHash } = await context.wallet();
    if (!utxos.length) {
        throw new Error(
            `No UTxO found. Please fund the wallet ${walletAddress}`
        );
    }
    const { policyId } = context.cagingScript;
    const tokenIdDatum = mConStr0([tokenId]);
    let operation;
    switch (op) {
        case 'insert':
            operation = mConStr0([value]);
            break;
        case 'delete':
            operation = mConStr1([value]);
            break;
    }
    const requestDatum = mConStr0([tokenIdDatum, signerHash, key, operation]);
    const datum = mConStr0([requestDatum]);
    const tx = context.newTxBuilder();
    await tx
        .txOut(context.cagingScript.address, [
            { unit: 'lovelace', quantity: '2000000' }
        ])
        .txOutInlineDatumValue(datum)
        .changeAddress(walletAddress)
        .selectUtxosFrom(utxos)
        .complete();
    const signedTx = await context.signTx(tx);
    const txHash = await context.submitTx(signedTx);

    // const block = await context.waitSettlement(txHash);
    // context.log('block', block);
    return { txHash, outputIndex: 0 };
}
