import {
    Data,
    mConStr0,
    mConStr1,
    mConStr2,
    mOutputReference
} from '@meshsdk/core';

import { Context } from '../context';
import { Proof } from '@aiken-lang/merkle-patricia-forestry';
import { SafeTrie, serializeProof } from '../trie';
import { nullHash, OutputRef, toHex, tokenIdParts } from '../lib';
import { parseStateDatum, tokenOfTokenId } from '../token';
import { parseRequest, selectUTxOsRequests } from '../request';
import { Indexer } from '../history/indexer';

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
    if (context.indexerStatus.ready === false) {
        throw new Error(
            'Indexer is not ready. Please wait for the indexer to be ready.'
        );
    }

    context.log('token-id', tokenId);

    const { utxos, walletAddress, collateral, signerHash } =
        await context.wallet();

    const { address: cageAddress, cbor: cageCbor } = context.cagingScript;

    const cageUTxOs = await context.fetchUTxOs();
    const { state } = tokenOfTokenId(cageUTxOs, tokenId);
    const datum = parseStateDatum(state);
    context.log('datum:', datum);

    if (!datum) {
        throw new Error(`State datum not found for tokenId: ${tokenId}`);
    }

    const { root } = datum;
    context.log('root', root);

    const stateOutputRef = mConStr1([
        mOutputReference(state.input.txHash, state.input.outputIndex)
    ]);

    const { requests: presents } = selectUTxOsRequests(cageUTxOs, tokenId);
    const promoteds = presents.filter(present =>
        requireds.some(
            required =>
                present.input.txHash === required.txHash &&
                present.input.outputIndex === required.outputIndex
        )
    );
    context.log('promoteds', promoteds);

    let proofs: Proof[] = [];
    let txHash: string;
    const tx = context.newTxBuilder();
    const { assetName } = tokenIdParts(tokenId);
    const releaseIndexer = await context.stopIndexer();
    const trie = await context.trie(assetName);
    const oldRoot = trie.root();
    try {
        for (const promoted of promoteds) {
            proofs.push(await addRequest(trie, promoted));
            tx.spendingPlutusScriptV3()
                .txIn(promoted.input.txHash, promoted.input.outputIndex)
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
        context.log('newStateDatum', newStateDatum);
        const jsonProofs: Data[] = proofs.map(serializeProof);

        tx.selectUtxosFrom(utxos) // select the remaining UTXOs
            .spendingPlutusScriptV3()
            .txIn(state.input.txHash, state.input.outputIndex)
            .txInInlineDatumPresent()
            .txInRedeemerValue(mConStr2([jsonProofs]), 'Mesh', guessingLowCost)
            .txInScript(cageCbor)
            .txOut(cageAddress, [{ unit: tokenId, quantity: '1' }])
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

async function addRequest(trie: SafeTrie, request: any): Promise<Proof> {
    const parsed = parseRequest(request);
    if (!parsed) {
        throw new Error('Invalid request');
    }
    const { change } = parsed;
    return await trie.temporaryUpdate(change);
}
