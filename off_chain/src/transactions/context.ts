/**
 * Transaction context for building and submitting cage transactions.
 *
 * This module provides the Context type and factory function that bundle
 * together all the dependencies needed for transaction building:
 * - Script information (address, CBOR, policy ID)
 * - Wallet access (signing and observing)
 * - State queries (tokens, requests)
 * - Trie access for proof generation
 * - Indexer control for atomic operations
 * @module
 */

import { MeshTxBuilder } from '@meshsdk/core';
import { CurrentToken } from '../token';
import { Indexer } from '../indexer/indexer';
import { UnslottedChange } from '../trie/change';
import { ValueSlotted } from '../trie/fatcs';
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

/**
 * Transaction context providing all dependencies for building transactions.
 *
 * The context bundles together:
 * - Script information for the cage validator
 * - Wallet access for signing and querying UTxOs
 * - State queries for tokens and requests
 * - Trie access for generating MPF proofs
 * - Indexer control for pausing during atomic operations
 */
export type Context = {
    /** The cage script's address, CBOR, script hash, and policy ID */
    cagingScript: {
        cbor: string;
        address: string;
        scriptHash: string;
        policyId: string;
    };
    /** Signing wallet (if mnemonics provided) for automatic signing */
    signingWallet: SigningWallet | undefined;
    /** Get wallet info for any address (UTxOs, collateral, signer hash) */
    addressWallet: (address: string) => Promise<WalletInfo>;
    /** Create a new MeshTxBuilder instance */
    newTxBuilder: () => MeshTxBuilder;
    /** Fetch all tracked tokens */
    fetchTokens: () => Promise<Token[]>;
    /** Fetch a specific token by asset name */
    fetchToken: (tokenId: string) => Promise<CurrentToken | undefined>;
    /** Fetch pending requests, optionally filtered by token */
    fetchRequests: (
        tokenId: string | null
    ) => Promise<
        { outputRefId: string; change: UnslottedChange; owner: string }[]
    >;
    /** Evaluate a transaction for execution units */
    evaluate: (txHex: string) => Promise<any>;
    /** Access a token's trie for proof generation */
    trie: (
        tokenId: string,
        f: (trie: SafeTrie) => Promise<any>
    ) => Promise<void>;
    /** Wait for n blocks to be processed */
    waitBlocks(n: number): Promise<number>;
    /** Get current network and indexer tips */
    tips(): Promise<{ networkTip: number | null; indexerTip: number | null }>;
    /** Wait for a transaction to be confirmed */
    waitSettlement(txHash: string): Promise<string>;
    /** Get all facts for a token */
    facts(tokenId: string): Promise<Record<string, ValueSlotted>>;
    /** Pause the indexer, returns a release function */
    pauseIndexer: () => Promise<() => void>;
    /** Submit a signed transaction */
    submitTx: (txHex: string) => Promise<string>;
    /** Get transaction info by hash */
    txInfo: (txHash: string) => Promise<any | null>;
};

/**
 * Create a transaction context.
 *
 * @param ogmios - Ogmios WebSocket URL for transaction submission
 * @param provider - Blockchain provider for queries
 * @param mnemonics - Optional wallet mnemonics for signing (null for observe-only)
 * @param indexer - The chain indexer instance
 * @param state - The state manager for tokens and requests
 * @param tries - The trie manager for MPF access
 * @returns A Context object with all transaction dependencies
 */
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
        newTxBuilder: () => getTxBuilder(provider, ogmios),
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
        txInfo: async (txHash: string) => {
            try {
                return await provider.fetchTxInfo(txHash);
            } catch (e) {
                return null;
            }
        }
    };
};
