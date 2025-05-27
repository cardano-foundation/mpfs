import { mConStr3, Output } from '@meshsdk/core';
import { findRequests, getCagingScript } from '../common';
import { Context } from '../context';
import { OutputRef } from '../lib';

const guessingLowCost = {
    mem: 1_000_000,
    steps: 1_000_000_000
};

export async function retract(
    context: Context,
    requestOutputRef: OutputRef
): Promise<string> {
    const { log, wallet, signTx, submitTx, newTxBuilder } = context;

    const { utxos, walletAddress, collateral, signerHash } = await wallet();

    const { address: cageAddress, cbor: cageCbor } = getCagingScript(context);

    const requests = await findRequests(context);
    log('request-output-ref', requestOutputRef);
    log('requests', requests);
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

    const tx = newTxBuilder(); // Initialize the transaction builder
    tx.spendingPlutusScriptV3()
        .txIn(request.ref.txHash, request.ref.outputIndex)
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr3([]), 'Mesh', guessingLowCost)
        .txInScript(cageCbor);

    tx.requiredSignerHash(signerHash)
        .changeAddress(walletAddress)
        .txInCollateral(collateral.input.txHash, collateral.input.outputIndex);

    await tx.complete();
    const signedTx = await signTx(tx);
    const txHash = await submitTx(signedTx);
    log('txHash', txHash);
    const block = await context.waitSettlement(txHash);
    log('block', block);
    return txHash;
}
