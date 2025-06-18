import {
    MeshTxBuilder,
    MeshWallet} from '@meshsdk/core';
import { CurrentToken } from '../token';
import { Indexer } from '../indexer/indexer';
import { Change } from '../trie/change';
import { SafeTrie } from '../trie/safeTrie';
import { Token } from '../indexer/state/tokens';
import { State } from '../indexer/state';
import { TrieManager } from '../trie';
import {
    getCagingScript,
    getTxBuilder,
    getWalletInfoForTx,
    onTxConfirmedPromise,
    Provider,
    Wallet
} from './context/lib';

export type Context = {
    cagingScript: {
        cbor: string;
        address: string;
        scriptHash: string;
        policyId: string;
    };
    wallet: () => Promise<Wallet>;
    newTxBuilder: () => MeshTxBuilder;
    fetchTokens: () => Promise<Token[]>;
    fetchToken: (tokenId: string) => Promise<CurrentToken | undefined>;
    fetchRequests: (
        tokenId: string | null
    ) => Promise<{ outputRef: string; change: Change; owner: string }[]>;
    signTx: (tx: MeshTxBuilder) => Promise<string>;
    submitTx: (tx: string) => Promise<string>;
    evaluate: (txHex: string) => Promise<any>;
    trie: (
        tokenId: string,
        f: (trie: SafeTrie) => Promise<any>
    ) => Promise<void>;
    waitBlocks(n: number): Promise<void>;
    tips(): Promise<{ networkTip: number | null; indexerTip: number | null }>;
    waitSettlement(txHash: string): Promise<string>;
    facts(tokenId: string): Promise<Record<string, string>>;
    pauseIndexer: () => Promise<() => void>;
};

export const mkContext = (
    provider: Provider,
    wallet: MeshWallet,
    indexer: Indexer,
    state: State,
    tries: TrieManager
): Context => {
    return {
        cagingScript: getCagingScript(),
        wallet: async () => await getWalletInfoForTx(wallet),
        newTxBuilder: () => getTxBuilder(provider),
        fetchTokens: async () => await state.tokens.getTokens(),
        fetchToken: async (tokenId: string) =>
            await state.tokens.getToken(tokenId),
        fetchRequests: async (tokenId: string | null) =>
            await state.requests.byToken(tokenId),
        signTx: async (tx: MeshTxBuilder) => {
            const unsignedTx = tx.txHex;
            const signedTx = await wallet.signTx(unsignedTx);
            return signedTx;
        },
        submitTx: async (tx: string) => {
            const txHash = await wallet.submitTx(tx);
            return txHash;
        },
        evaluate: async (txHex: string) => {
            await provider.evaluateTx(txHex);
        },
        trie: async (tokenId: string, f: (trie: SafeTrie) => Promise<any>) => {
            return await tries.trie(tokenId, f);
        },
        waitBlocks: async n => {
            await indexer.waitBlocks(n);
        },
        tips: async () => {
            return await indexer.tips();
        },
        waitSettlement: async (txHash: string) => {
            return await onTxConfirmedPromise(provider, txHash, 50);
        },
        facts: async (tokenId: string) => {
            let fs = {};
            await tries.trie(tokenId, async trie => {
                fs = await trie.allFacts();
            });
            return fs;
        },
        pauseIndexer: async () => indexer.pause()
    };
};
