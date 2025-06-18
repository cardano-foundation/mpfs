import { mConStr0, mConStr1 } from '@meshsdk/core';
import { Context } from './context';

export async function end(context: Context, tokenId: string) {
    const signingWallet = context.signingWallet;
    if (!signingWallet) {
        throw new Error('No signing wallet found');
    }
    const { info, signTx, submitTx } = signingWallet;
    const { walletAddress } = await info();

    const { unsignedTransaction } = await endTransaction(
        context,
        walletAddress,
        tokenId
    );

    const signedTx = await signTx(unsignedTransaction);
    const txHash = await submitTx(signedTx);
    return txHash;
}

export async function endTransaction(
    context: Context,
    walletAddress: string,
    tokenId: string
) {
    const { cbor: cageCbor, policyId } = context.cagingScript;
    const { utxos, collateral, signerHash } =
        await context.addressWallet(walletAddress);
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
    return {
        unsignedTransaction: tx.txHex,
        value: null
    };
}
