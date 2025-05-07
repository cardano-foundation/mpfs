import { mConStr0, mConStr1 } from '@meshsdk/core';
import { fetchTokenIdUTxO, getCagingScript, getMintingScript } from '../common';
import { Context } from '../context';
import { tokenIdParts } from '../lib';

export async function end(context: Context, index: number, tokenId: string) {
    const { log, wallet, signTx, submitTx, newTxBuilder } = context;
    log('token-id', tokenId);

    const { policyId, assetName } = tokenIdParts(tokenId);
    log('asset-name', assetName);

    log('policy-id', policyId);

    const { utxos, walletAddress, collateral, signerHash } = await wallet();

    const {
        address: cageAddress,
        cbor: cageCbor,
        scriptHash: cageScriptHash
    } = getCagingScript(context);
    
    const { cbor: mintCbor } = getMintingScript(context, cageScriptHash);

    const { state: token } = await fetchTokenIdUTxO(
        context,
        cageAddress,
        tokenId
    );
    log('token', token);
    const tx = newTxBuilder();
    await tx
        .spendingPlutusScriptV3()
        .txIn(token.input.txHash, token.input.outputIndex)
        .spendingReferenceTxInInlineDatumPresent()
        .spendingReferenceTxInRedeemerValue(mConStr0([]))
        .txInScript(cageCbor)
        .mintPlutusScriptV3()
        .mint('-1', policyId, assetName)
        .mintRedeemerValue(mConStr1([]))
        .mintingScript(mintCbor)
        .changeAddress(walletAddress) // send change back to the wallet address
        .requiredSignerHash(signerHash)
        .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
        .selectUtxosFrom(utxos)
        .complete();

    const signedTx = await signTx(index, tx);
    const txHash = await submitTx(index, signedTx);
    log('txHash', txHash);
    const block = await context.waitSettlement(txHash);
    log('block', block);
    const trie = await context.trie(tokenId);
    await trie.close();
    return txHash;
}
