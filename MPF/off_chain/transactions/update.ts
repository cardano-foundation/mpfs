import {
    Data,
    mConStr0,
    mConStr1,
    mConStr2,
    mOutputReference
} from '@meshsdk/core';
import {
    extractPlutusData,
    fetchTokenIdUTxO,
    getCagingScript,
    parseRequest,
    selectUTxOsRequests,
    toHex
} from '../common';
import { Context } from '../context';
import { Proof } from '@aiken-lang/merkle-patricia-forestry';
import { nullHash } from './boot';
import { SafeTrie, serializeProof } from '../trie';
import { OutputRef } from '../lib';

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
    const { log, wallet, signTx, submitTx, newTxBuilder, evaluate } = context;
    log('token-id', tokenId);

    const { utxos, walletAddress, collateral, signerHash } = await wallet();

    const { address: cageAddress, cbor: cageCbor } = getCagingScript(context);

    const { state, cageUTxOs } = await fetchTokenIdUTxO(
        context,
        cageAddress,
        tokenId
    );
    const datum = extractPlutusData(state);
    log('datum:', datum);

    const root = datum.fields[0].fields[1].bytes;
    log('root', root);

    const stateOutputRef = mConStr1([
        mOutputReference(state.input.txHash, state.input.outputIndex)
    ]);

    const { requests: presents } = selectUTxOsRequests(cageUTxOs, tokenId);
    log('requests', presents);
    const promoteds = presents.filter(present =>
        requireds.some(
            required =>
                present.input.txHash === required.txHash &&
                present.input.outputIndex === required.outputIndex
        )
    );
    log('promoteds', promoteds);

    let proofs: Proof[] = [];
    let txHash: string;
    const tx = newTxBuilder();
    const trie = await context.trie(tokenId);
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
        const hotRoot = trie.hotRoot();
        const newRoot = hotRoot ? toHex(hotRoot) : nullHash;
        const newStateDatum = mConStr1([mConStr0([signerHash, newRoot])]);
        log('newStateDatum', newStateDatum);
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
        const signedTx = await signTx(tx);

        // const e = await evaluate(tx.txHex)
        // console.log('evaluate', JSON.stringify(e, null, 2));
        txHash = await submitTx(signedTx);
        log('txHash', txHash);
        const block = await context.waitSettlement(txHash);
        log('block', block);
    } catch (error) {
        trie.rollback();
        throw new Error(`Failed to create or submit a transaction: ${error}`);
    }
    trie.commit();
    return txHash;
}

async function addRequest(trie: SafeTrie, request: any): Promise<Proof> {
    const parsed = parseRequest(request);
    if (!parsed) {
        throw new Error('Invalid request');
    }
    const { key, value } = parsed;
    return await trie.update(key, value, parsed.operation);
}
