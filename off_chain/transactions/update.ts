import {
    Data,
    mConStr0,
    mConStr1,
    mConStr2,
    mOutputReference
} from '@meshsdk/core';

import { Context } from '../context';
import { Proof } from '@aiken-lang/merkle-patricia-forestry';
import { serializeProof } from '../trie';
import { nullHash, OutputRef, toHex } from '../lib';
import { unmkOutputRefId } from '../history/indexer';

const guessingLowCost = {
    mem: 1_000_000,
    steps: 1_000_000_000
};

const guessingRequestCost = {
    mem: 200_000,
    steps: 100_000_000
};

export async function update(
    context: Context,
    tokenId: string,
    requireds: OutputRef[]
): Promise<string> {
    context.log('token-id', tokenId);

    const { utxos, walletAddress, collateral, signerHash } =
        await context.wallet();

    const { address: cageAddress, cbor: cageCbor } = context.cagingScript;

    const dbState = await context.fetchToken(tokenId);
    if (!dbState) {
        throw new Error(`Token with ID ${tokenId} not found`);
    }
    const { outputRef } = dbState;

    const stateOutputRef = mConStr1([
        mOutputReference(outputRef.txHash, outputRef.outputIndex)
    ]);
    const presents = await context.fetchRequests(tokenId);
    const resolvedPresents = presents.map(present => ({
        ...present,
        resolvedRef: unmkOutputRefId(present.outputRef)
    }));
    const promoteds = resolvedPresents.filter(present =>
        requireds.some(
            required =>
                present.resolvedRef.txId === required.txHash &&
                present.resolvedRef.index === required.outputIndex
        )
    );

    let proofs: Proof[] = [];
    let txHash: string;
    const tx = context.newTxBuilder();
    const releaseIndexer = await context.stopIndexer();
    const trie = await context.trie(tokenId);
    const { policyId } = context.cagingScript;
    const unit = policyId + tokenId;
    try {
        for (const promoted of promoteds) {
            proofs.push(await trie.temporaryUpdate(promoted.change));
            tx.spendingPlutusScriptV3()
                .txIn(promoted.resolvedRef.txId, promoted.resolvedRef.index)
                .txInInlineDatumPresent()
                .txInRedeemerValue(stateOutputRef, 'Mesh', guessingRequestCost)
                .txInScript(cageCbor);
        }
        if (proofs.length === 0) {
            throw new Error('No requests found');
        }
        const root = trie.root();
        const newRoot = root ? toHex(root) : nullHash;
        const newStateDatum = mConStr1([mConStr0([signerHash, newRoot])]);
        const jsonProofs: Data[] = proofs.map(serializeProof);
        tx.selectUtxosFrom(utxos) // select the remaining UTXOs
            .spendingPlutusScriptV3()
            .txIn(outputRef.txHash, outputRef.outputIndex)
            .txInInlineDatumPresent()
            .txInRedeemerValue(mConStr2([jsonProofs]), 'Mesh', guessingLowCost)
            .txInScript(cageCbor)
            .txOut(cageAddress, [{ unit, quantity: '1' }])
            .txOutInlineDatumValue(newStateDatum, 'Mesh');
        tx.requiredSignerHash(signerHash)
            .changeAddress(walletAddress)
            .txInCollateral(
                collateral.input.txHash,
                collateral.input.outputIndex
            );

        await tx.complete();
        const signedTx = await context.signTx(tx);

        // const e = await evaluate(tx.txHex)
        // console.log('evaluate', JSON.stringify(e, null, 2));
        txHash = await context.submitTx(signedTx);
        context.log('txHash', txHash);
        const block = await context.waitSettlement(txHash);
        context.log('block', block);
    } catch (error) {
        trie.rollback();
        await releaseIndexer();
        throw new Error(`Failed to create or submit a transaction: ${error}`);
    }
    await trie.rollback(); // Rollback the trie to the previous state

    await releaseIndexer();
    return txHash;
}
