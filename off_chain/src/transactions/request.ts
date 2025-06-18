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
    const signingWallet = context.signingWallet;
    if (!signingWallet) {
        throw new Error('No signing wallet found');
    }
    const { info, signTx, submitTx } = signingWallet;
    const { walletAddress, utxos, signerHash } = await info();
    const { unsignedTransaction } = await requestTx(
        context,
        walletAddress,
        tokenId,
        key,
        value,
        op
    );
    const signedTx = await signTx(unsignedTransaction);
    const txHash = await submitTx(signedTx);

    return { txHash, outputIndex: 0 };
}

export const requestTx = async (
    context: Context,
    walletAddress: string,
    tokenId: string,
    key: string,
    value: string,
    op: 'insert' | 'delete'
): Promise<{ unsignedTransaction: string; value: null }> => {
    const { utxos, signerHash } = await context.addressWallet(walletAddress);
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
    return {
        unsignedTransaction: tx.txHex,
        value: null
    };
};
