import { mConStr0, mConStr1 } from '@meshsdk/core';
import { getCagingScript } from '../common';
import { Context } from '../context';
import { assetName, OutputRef } from '../lib';

export const nullHash =
    '0000000000000000000000000000000000000000000000000000000000000000';
export async function boot(context: Context) {
    const { log, wallet, signTx, submitTx, newTxBuilder } = context;

    const { utxos, walletAddress, collateral, signerHash } = await wallet();

    const firstUTxO = utxos[0];
    if (!firstUTxO) {
        throw new Error(
            `No UTxO found. Please fund the wallet ${walletAddress}`
        );
    }
    const uniqueness: OutputRef = {
        txHash: firstUTxO.input.txHash,
        outputIndex: firstUTxO.input.outputIndex
    };
    const uniquenessP = mConStr0([uniqueness.txHash, uniqueness.outputIndex]);

    const asset = assetName(uniqueness);
    log('asset-name', asset);

    const {
        address: cageAddress,
        cbor: cageCbor,
        policyId: mintPolicyId
    } = getCagingScript(context);

    const tokenId = mintPolicyId + asset;
    log('token-id', tokenId);

    const tx = newTxBuilder();
    await tx
        .txIn(firstUTxO.input.txHash, firstUTxO.input.outputIndex)
        .mintPlutusScriptV3()
        .mint('1', mintPolicyId, asset)
        .mintingScript(cageCbor)
        .mintRedeemerValue(mConStr0([mConStr0([uniquenessP, signerHash])]))
        .txOut(cageAddress, [{ unit: tokenId, quantity: '1' }])
        .txOutInlineDatumValue(mConStr1([mConStr0([signerHash, nullHash])]))
        .changeAddress(walletAddress)
        .selectUtxosFrom(utxos)
        .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
        .complete();
    const signedTx = await signTx(tx);
    const txHash = await submitTx(signedTx);
    log('txHash', txHash);
    const block = await context.waitSettlement(txHash);
    log('block', block);
    await context.trie(tokenId);
    return tokenId;
}
