import fs from 'node:fs';
import {
    BlockfrostProvider,
    MeshTxBuilder,
    MeshWallet,
    YaciProvider
} from '@meshsdk/core';
import { CurrentToken } from './token';
import { Indexer } from './indexer/indexer';
import { Change } from './trie/change';
import { SafeTrie } from './trie/safeTrie';
import { Token } from './indexer/state/tokens';
import { State } from './indexer/state';
import { TrieManager } from './trie';
import {
    getCagingScript,
    getTxBuilder,
    getWalletInfoForTx,
    onTxConfirmedPromise,
    Provider,
    Wallet
} from './transactions/context/lib';
import { retry } from './test/lib';

export type WithContext = (context: Context) => Promise<any>;

export class Context {
    private provider: Provider;
    private walletInstance: MeshWallet;
    public indexer: Indexer;
    private state: State;
    private tries: TrieManager;

    constructor(
        provider: Provider,
        wallet: MeshWallet,
        indexer: Indexer,
        state: State,
        tries: TrieManager
    ) {
        this.provider = provider;
        this.walletInstance = wallet;
        this.indexer = indexer;
        this.state = state;
        this.tries = tries;
        this.state = state;
        this.tries = tries;
    }

    get cagingScript(): {
        cbor: string;
        address: string;
        scriptHash: string;
        policyId: string;
    } {
        return getCagingScript();
    }

    async wallet(): Promise<Wallet> {
        return await getWalletInfoForTx(this.walletInstance);
    }

    newTxBuilder(): MeshTxBuilder {
        return getTxBuilder(this.provider);
    }

    async fetchTokens(): Promise<Token[]> {
        return await this.state.tokens.getTokens();
    }
    async fetchToken(tokenId: string): Promise<CurrentToken | undefined> {
        return await this.state.tokens.getToken(tokenId);
    }

    async fetchRequests(
        tokenId: string | null
    ): Promise<{ outputRef: string; change: Change; owner: string }[]> {
        return await this.state.requests.byToken(tokenId);
    }

    async signTx(tx: MeshTxBuilder): Promise<string> {
        const unsignedTx = tx.txHex;
        const signedTx = await this.walletInstance.signTx(unsignedTx);
        return signedTx;
    }

    async submitTx(tx: string): Promise<string> {
        const txHash = await this.walletInstance.submitTx(tx);
        return txHash;
    }

    async evaluate(txHex: string): Promise<any> {
        await this.provider.evaluateTx(txHex);
    }

    async trie(
        tokenId: string,
        f: (trie: SafeTrie) => Promise<any>
    ): Promise<void> {
        return await this.tries.trie(tokenId, f);
    }

    async waitBlocks(n) {
        await this.indexer.waitBlocks(n);
    }

    async tips(): Promise<{
        networkTip: number | null;
        indexerTip: number | null;
    }> {
        return await this.indexer.tips();
    }

    async waitSettlement(txHash: string): Promise<string> {
        return await onTxConfirmedPromise(this.provider, txHash, 50);
    }

    async facts(tokenId: string): Promise<Record<string, string>> {
        let fs = {};
        await this.trie(tokenId, async trie => {
            fs = await trie.allFacts();
        });
        return fs;
    }
}
