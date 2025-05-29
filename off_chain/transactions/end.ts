import { mConStr0, mConStr1 } from '@meshsdk/core';
import { Context } from '../context';
import { tokenIdParts } from '../lib';
import { tokenOfTokenId } from '../token';

export async function end(context: Context, tokenId: string) {
    context.log('token-id', tokenId);

    const { policyId, assetName } = tokenIdParts(tokenId);
    context.log('asset-name', assetName);

    context.log('policy-id', policyId);

    const { utxos, walletAddress, collateral, signerHash } =
        await context.wallet();

    const cageUTxOs = await context.fetchUTxOs();
    const {
        address: cageAddress,
        cbor: cageCbor,
        scriptHash: cageScriptHash
    } = context.cagingScript;

    const { state: token } = tokenOfTokenId(cageUTxOs, tokenId);

    context.log('token', token);
    const tx = context.newTxBuilder();
    await tx
        .spendingPlutusScriptV3()
        .txIn(token.input.txHash, token.input.outputIndex)
        .spendingReferenceTxInInlineDatumPresent()
        .spendingReferenceTxInRedeemerValue(mConStr0([]))
        .txInScript(cageCbor)
        .mintPlutusScriptV3()
        .mint('-1', policyId, assetName)
        .mintRedeemerValue(mConStr1([]))
        .mintingScript(cageCbor)
        .changeAddress(walletAddress) // send change back to the wallet address
        .requiredSignerHash(signerHash)
        .txInCollateral(collateral.input.txHash, collateral.input.outputIndex)
        .selectUtxosFrom(utxos)
        .complete();

    const signedTx = await context.signTx(tx);
    const txHash = await context.submitTx(signedTx);
    context.log('txHash', txHash);
    const block = await context.waitSettlement(txHash);
    context.log('block', block);
    const trie = await context.trie(assetName);
    await trie.close();
    return txHash;
}
