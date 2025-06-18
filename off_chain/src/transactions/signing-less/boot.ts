import { deserializeAddress, mConStr0, mConStr1 } from '@meshsdk/core';
import { assetName, nullHash, OutputRef } from '../../lib';
import { Context } from '../context';

export type WithUnsignedTransaction<T> = {
    unsignedTransaction: string;
    value: T;
};

export async function bootSigningless(
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
        .mintRedeemerValue(mConStr0([mConStr0([uniquenessP, signerHash])]))
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
