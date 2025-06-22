import { mConStr3 } from '@meshsdk/core';
import { Context } from './context';
import { OutputRef } from '../lib';
import { mkOutputRefId } from '../outputRef';
import {
    signAndSubmit,
    WithTxHash,
    WithUnsignedTransaction
} from './context/lib';

const guessingLowCost = {
    mem: 1_000_000,
    steps: 1_000_000_000
};

export async function retract(
    context: Context,
    requestOutputRef: OutputRef
): Promise<WithTxHash<null>> {
    return await signAndSubmit(context, async walletAddress => {
        return await retractTransaction(
            context,
            walletAddress,
            requestOutputRef
        );
    });
}

export async function retractTransaction(
    context: Context,
    walletAddress: string,
    requestOutputRef: OutputRef
): Promise<WithUnsignedTransaction<null>> {
    const { utxos, collateral, signerHash } =
        await context.addressWallet(walletAddress);
    const { cbor: cageCbor } = context.cagingScript;
    const requests = await context.fetchRequests(null);
    const ouputRefId = mkOutputRefId(requestOutputRef);
    const request = requests.find(
        request => request.outputRefId === ouputRefId
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
        .txIn(requestOutputRef.txHash, requestOutputRef.outputIndex)
        .txInInlineDatumPresent()
        .txInRedeemerValue(mConStr3([]), 'Mesh', guessingLowCost)
        .txInScript(cageCbor);

    tx.requiredSignerHash(signerHash)
        .changeAddress(walletAddress)
        .txInCollateral(collateral.input.txHash, collateral.input.outputIndex);

    await tx.complete();
    return {
        unsignedTransaction: tx.txHex,
        value: null
    };
}
