import { mConStr0, mConStr1 } from '@meshsdk/core';
import { Context } from './context';

export async function end(context: Context, tokenId: string) {
    const wallet = context.signingWallet!;
    const { utxos, walletAddress, collateral, signerHash } =
        await wallet.info();

    const { cbor: cageCbor, policyId } = context.cagingScript;

    const dbState = await context.fetchToken(tokenId);
    if (!dbState) {
        throw new Error(`Token with ID ${tokenId} not found`);
    }
    const { outputRef } = dbState;
    const tx = context.newTxBuilder();
    await tx
        .spendingPlutusScriptV3()
        .txIn(outputRef.txHash, outputRef.outputIndex)
        .spendingReferenceTxInInlineDatumPresent()
        .spendingReferenceTxInRedeemerValue(mConStr0([]))
        .txInScript(cageCbor)
        .mintPlutusScriptV3()
        .mint('-1', policyId, tokenId)
        .mintRedeemerValue(mConStr1([]))
        .mintingScript(cageCbor)
        .changeAddress(walletAddress) // send change back to the wallet address
        .requiredSignerHash(signerHash)
        .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
        .selectUtxosFrom(utxos)
        .complete();

    const signedTx = await wallet.signTx(tx.txHex);
    const txHash = await wallet.submitTx(signedTx);
    // const block = await context.waitSettlement(txHash);
    // context.log('block', block);
    return txHash;
}
