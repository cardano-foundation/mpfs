import { mConStr3, Output } from '@meshsdk/core';
import { Context } from '../context';
import { OutputRef } from '../lib';
import { findRequests } from '../request';

const guessingLowCost = {
    mem: 1_000_000,
    steps: 1_000_000_000
};

export async function retract(
    context: Context,
    requestOutputRef: OutputRef
): Promise<string> {
    const { walletAddress, collateral, signerHash } = await context.wallet();

    const { cbor: cageCbor } = context.cagingScript;
    const cageUTxOs = await context.fetchUTxOs();
    const requests = findRequests(cageUTxOs);
    const request = requests.find(
        request =>
            request.ref.txHash === requestOutputRef.txHash &&
            request.ref.outputIndex === requestOutputRef.outputIndex
    );
    if (!request) {
        throw new Error('Request not found');
    }

    const { owner } = request;

    if (owner !== signerHash) {
        throw new Error('Request owner does not match signer');
    }

    const tx = context.newTxBuilder(); // Initialize the transaction builder
    tx.spendingPlutusScriptV3()
        .txIn(request.ref.txHash, request.ref.outputIndex)
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr3([]), 'Mesh', guessingLowCost)
        .txInScript(cageCbor);

    tx.requiredSignerHash(signerHash)
        .changeAddress(walletAddress)
        .txInCollateral(collateral.input.txHash, collateral.input.outputIndex);

    await tx.complete();
    const signedTx = await context.signTx(tx);
    const txHash = await context.submitTx(signedTx);
    context.log('txHash', txHash);
    const block = await context.waitSettlement(txHash);
    context.log('block', block);
    return txHash;
}
