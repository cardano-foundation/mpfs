import { mConStr0, mConStr1 } from '@meshsdk/core';
import { fetchTokenIdUTxO, getCagingScript } from '../common';
import { Context } from '../context';
import { OutputRef, tokenIdParts } from '../lib';

export async function request(
    context: Context,
    tokenId: string,
    key: string,
    value: string,
    op: 'insert' | 'delete'
): Promise<OutputRef> {
    const { log, wallet, signTx, submitTx, newTxBuilder } = context;
    if (!tokenId) {
        throw new Error('No token id provided');
    }
    log('token-id', tokenId);

    const { address: cageAddress } = getCagingScript(context);
    const _ = await fetchTokenIdUTxO(context, cageAddress, tokenId);
    const { policyId, assetName } = tokenIdParts(tokenId);
    const { walletAddress, utxos, signerHash } = await wallet();
    if (!utxos.length) {
        throw new Error(
            `No UTxO found. Please fund the wallet ${walletAddress}`
        );
    }
    const tokenIdDatum = mConStr0([policyId, assetName]);
    log('token-id-datum', tokenIdDatum);
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
    log('request-datum', requestDatum);
    const datum = mConStr0([requestDatum]);
    log('datum', datum);
    const tx = newTxBuilder();
    await tx
        .txOut(cageAddress, [{ unit: 'lovelace', quantity: '2000000' }])
        .txOutInlineDatumValue(datum)
        .changeAddress(walletAddress)
        .selectUtxosFrom(utxos)
        .complete();
    const signedTx = await signTx(tx);
    const txHash = await submitTx(signedTx);
    log('txHash', txHash);

    const block = await context.waitSettlement(txHash);
    log('block', block);
    return { txHash, outputIndex: 0 };
}
