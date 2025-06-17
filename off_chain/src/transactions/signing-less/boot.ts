import { deserializeAddress, mConStr0, mConStr1 } from '@meshsdk/core';
import { assetName, nullHash, OutputRef } from '../../lib';
import { SigninglessContext } from './context';

export type WithUnsignedTransaction<T> = {
    unsignedTransaction: string;
    value: T;
};

export async function bootSigningless(
    signinglessContext: SigninglessContext,
    walletAddress: string
): Promise<WithUnsignedTransaction<string>> {
    const { cagingScript, mkWallet, txBuilder } = signinglessContext;
    const wallet = mkWallet(walletAddress);
    const utxos = await wallet.getUtxos();
    const firstUTxO = utxos[0];
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

    const tx = txBuilder();
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
