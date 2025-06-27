import { MeshTxBuilder } from '@meshsdk/core';
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
    onTxConfirmedPromise,
    Provider
} from './context/lib';
import {
    mkObservingWallet,
    mkSigningWallet,
    SigningWallet,
    WalletInfo
} from './context/wallet';
import { submitTransaction } from '../submitter';

export type Context = {
    cagingScript: {
        cbor: string;
        address: string;
        scriptHash: string;
        policyId: string;
    };
    signingWallet: SigningWallet | undefined;
    addressWallet: (address: string) => Promise<WalletInfo>;
    newTxBuilder: () => MeshTxBuilder;
    fetchTokens: () => Promise<Token[]>;
    fetchToken: (tokenId: string) => Promise<CurrentToken | undefined>;
    fetchRequests: (
        tokenId: string | null
    ) => Promise<{ outputRefId: string; change: Change; owner: string }[]>;
    evaluate: (txHex: string) => Promise<any>;
    trie: (
        tokenId: string,
        f: (trie: SafeTrie) => Promise<any>
    ) => Promise<void>;
    waitBlocks(n: number): Promise<number>;
    tips(): Promise<{ networkTip: number | null; indexerTip: number | null }>;
    waitSettlement(txHash: string): Promise<string>;
    facts(tokenId: string): Promise<Record<string, string>>;
    pauseIndexer: () => Promise<() => void>;
    submitTx: (txHex: string) => Promise<string>;
    txInfo: (txHash: string) => Promise<any | null>;
};

export const mkContext = (
    ogmios: string,
    provider: Provider,
    mnemonics: string | null,
    indexer: Indexer,
    state: State,
    tries: TrieManager
): Context => {
    let signingWallet: SigningWallet | undefined;
    if (mnemonics) {
        signingWallet = mkSigningWallet(mnemonics, provider);
    } else {
        signingWallet = undefined;
    }
    const observingWallet = mkObservingWallet(provider);
    return {
        cagingScript: getCagingScript(),
        signingWallet: signingWallet,
        addressWallet: async (walletAddress: string) =>
            await observingWallet(walletAddress),
        newTxBuilder: () => getTxBuilder(provider),
        fetchTokens: async () => await state.tokens.getTokens(),
        fetchToken: async (tokenId: string) =>
            await state.tokens.getToken(tokenId),
        fetchRequests: async (tokenId: string | null) =>
            await state.requests.byToken(tokenId),

        evaluate: async (txHex: string) => {
            await provider.evaluateTx(txHex);
        },
        trie: async (tokenId: string, f: (trie: SafeTrie) => Promise<any>) => {
            return await tries.trie(tokenId, f);
        },
        waitBlocks: async n => {
            return await indexer.waitBlocks(n);
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
        pauseIndexer: async () => indexer.pause(),
        submitTx: async (txHex: string) => {
            return await submitTransaction(ogmios, txHex);
        },
        txInfo: async (txHash: string ) => {
            try {
                return await provider.fetchTxInfo(txHash);
            }
            catch (e) {
                return null
            }

        }
    };
};
