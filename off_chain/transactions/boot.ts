import { mConStr0, mConStr1 } from '@meshsdk/core';
import { Context } from '../context';
import { assetName, nullHash, OutputRef } from '../lib';

export async function boot(context: Context) {
    const { utxos, walletAddress, collateral, signerHash } =
        await context.wallet();

    const firstUTxO = utxos[0];
    if (!firstUTxO) {
        throw new Error(
            `No UTxO found. Please fund the wallet ${walletAddress}`
        );
    }
    const uniqueness: OutputRef = firstUTxO.input;
    const uniquenessP = mConStr0([uniqueness.txHash, uniqueness.outputIndex]);

    const asset = assetName(uniqueness);
    context.log('asset-name', asset);

    const {
        address: cageAddress,
        cbor: cageCbor,
        policyId: mintPolicyId
    } = context.cagingScript;

    const unit = mintPolicyId + asset;

    const tx = context.newTxBuilder();
    await tx
        .txIn(uniqueness.txHash, uniqueness.outputIndex)
        .mintPlutusScriptV3()
        .mint('1', mintPolicyId, asset)
        .mintingScript(cageCbor)
        .mintRedeemerValue(mConStr0([mConStr0([uniquenessP, signerHash])]))
        .txOut(cageAddress, [{ unit, quantity: '1' }])
        .txOutInlineDatumValue(mConStr1([mConStr0([signerHash, nullHash])]))
        .changeAddress(walletAddress)
        .selectUtxosFrom(utxos)
        .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
        .complete();
    const signedTx = await context.signTx(tx);
    const txHash = await context.submitTx(signedTx);
    context.log('txHash', txHash);
    const block = await context.waitSettlement(txHash);
    context.log('block', block);
    return asset;
}
