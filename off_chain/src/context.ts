import fs from 'node:fs';
import {
    applyParamsToScript,
    BlockfrostProvider,
    deserializeAddress,
    MeshTxBuilder,
    MeshWallet,
    resolveScriptHash,
    serializePlutusScript,
    UTxO,
    YaciProvider
} from '@meshsdk/core';
import { OutputLogger } from './logging';
import blueprint from './plutus.json';
import { CurrentToken } from './token';
import { Indexer } from './indexer/indexer';
import { Change } from './trie/change';
import { SafeTrie } from './trie/safeTrie';
import { Token } from './indexer/state/tokens';
import { State } from './indexer/state';
import { TrieManager } from './trie';

export type Log = (key: string, value: any) => void;
export type Provider = BlockfrostProvider | YaciProvider;
export type WithContext = (context: Context) => Promise<any>;
export type Wallet = {
    utxos: UTxO[];
    firstUTxO: UTxO;
    collateral: UTxO;
    walletAddress: string;
    signerHash: string;
};
export type TopUp = (address: string, amount: number) => Promise<void>;

export class Context {
    private logger: OutputLogger;
    private provider: Provider;
    private walletInstance: MeshWallet;
    private indexer: Indexer;
    private state: State;
    private tries: TrieManager;

    constructor(
        provider: Provider,
        wallet: MeshWallet,
        indexer: Indexer,
        state: State,
        tries: TrieManager
    ) {
        this.logger = new OutputLogger();
        this.provider = provider;
        this.walletInstance = wallet;
        this.indexer = indexer;
        this.state = state;
        this.tries = tries;
        this.state = state;
        this.tries = tries;
    }

    log(key: string, value: any): void {
        this.logger.log(key, value);
    }

    logs(): any {
        return this.logger.getLogs();
    }

    deleteLogs(): void {
        this.logger.deleteLogs();
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
        return await getWalletInfoForTx(
            this.log.bind(this),
            this.walletInstance
        );
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
        this.log('tx-hex', unsignedTx);
        const signedTx = await this.walletInstance.signTx(unsignedTx);
        return signedTx;
    }

    async submitTx(tx: string): Promise<string> {
        const txHash = await this.walletInstance.submitTx(tx);
        this.log('tx-hash', txHash);
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
        return await onTxConfirmedPromise(
            this.provider,
            txHash,
            this.progress,
            50
        );
    }

    async facts(tokenId: string): Promise<Record<string, string>> {
        let fs = {};
        await this.trie(tokenId, async trie => {
            fs = await trie.allFacts();
        });
        return fs;
    }
}

export async function withContext(
    baseDir: string,
    name: string,
    context: Context,
    f: WithContext
) {
    const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
    const newBaseDir = `${baseDir}/${timestamp}`;
    const newPath = `${newBaseDir}/${name}.json`;
    fs.mkdirSync(newBaseDir, { recursive: true });
    const write = () => {
        const json = JSON.stringify(context.logs(), null, 2);
        fs.writeFileSync(newPath, json, 'utf-8');
    };

    try {
        const result = await f(context);
        write();
        return result;
    } catch (error) {
        write();
        throw error;
    }
}

export type CagingScript = {
    cbor: string;
    address: string;
    scriptHash: string;
    policyId: string;
};

export function getCagingScript(): CagingScript {
    const cbor = applyParamsToScript(
        blueprint.validators[0].compiledCode, // crap
        []
    );
    const address = serializePlutusScript({
        code: cbor,
        version: 'V3'
    }).address;
    const { scriptHash } = deserializeAddress(address);
    const policyId = resolveScriptHash(cbor, 'V3');
    const caging = {
        cbor,
        address,
        scriptHash,
        policyId
    };
    return caging;
}

export type ContextProvider = {
    provider: Provider;
    topup: TopUp | undefined;
    evaluate: (txHex: string) => Promise<any>;
};

export function yaciProvider(
    storeHost: string,
    adminHost?: string
): ContextProvider {
    const provider = new YaciProvider(
        `${storeHost}/api/v1/`,
        adminHost ? `${adminHost}` : undefined
    );
    async function topup(address: string, amount: number) {
        await provider.addressTopup(address, amount.toString());
    }
    return {
        provider,
        topup,
        evaluate: async (txHex: string) => {
            await provider.evaluateTx(txHex);
        }
    };
}

export function blockfrostProvider(projectId: string): ContextProvider {
    const provider = new BlockfrostProvider(projectId);
    return {
        provider,
        topup: undefined,
        evaluate: async (txHex: string) => {
            await provider.evaluateTx(txHex);
        }
    };
}

export function getTxBuilder(provider: Provider) {
    return new MeshTxBuilder({
        fetcher: provider,
        submitter: provider
    });
}

export async function getWalletInfoForTx(
    log: Log,
    wallet: MeshWallet
): Promise<Wallet> {
    const utxos = await wallet.getUtxos();
    const collateral = (await wallet.getCollateral())[0];
    const walletAddress = wallet.getChangeAddress();

    if (!walletAddress) {
        throw new Error('No wallet address found');
    }
    const firstUTxO = utxos[0];
    const signerHash = deserializeAddress(walletAddress).pubKeyHash;
    const walletInfo = {
        utxos,
        firstUTxO,
        collateral,
        walletAddress,
        signerHash
    };
    return walletInfo;
}

async function onTxConfirmedPromise(
    provider,
    txHash,
    progress?,
    limit = 100
): Promise<string> {
    const progressR = progress || (() => {});
    return new Promise<string>((resolve, reject) => {
        let attempts = 0;
        const checkTx = setInterval(async () => {
            if (attempts >= limit) {
                clearInterval(checkTx);
                reject(new Error('Transaction confirmation timed out'));
            }
            provider
                .fetchTxInfo(txHash)
                .then(txInfo => {
                    if (txInfo.block === undefined) {
                        clearInterval(checkTx);
                        resolve('No block info available');
                    } else {
                        provider
                            .fetchBlockInfo(txInfo.block)
                            .then(blockInfo => {
                                if (blockInfo?.confirmations > 0) {
                                    clearInterval(checkTx);
                                    resolve(blockInfo.hash); // Resolve the promise when confirmed
                                }
                            })
                            .catch(error => {
                                progressR(
                                    `Still fetching block info for txHash: ${txHash}: ${error}`
                                );
                                attempts += 1;
                            });
                    }
                })
                .catch(error => {
                    progressR(
                        `Still fetching tx info for txHash: ${txHash}: ${error}`
                    );
                    attempts += 1;
                });
        }, 5000);
    });
}
