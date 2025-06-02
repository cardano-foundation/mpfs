import WebSocket from 'ws';
import { parseStateDatumCbor, TokenState } from '../token';
import { parseRequestCbor } from '../request';
import { assetName, OutputRef, rootHex, toHex, tokenIdParts } from '../lib';
import { Level } from 'level';
import { Change, SafeTrie, TrieManager } from '../trie';
import { Mutex } from 'async-mutex';
import { Output } from '@meshsdk/core';

export function mkOutputRefId(txId: string, index: number): string {
    return `${txId}#${index}`;
}
export function unmkOutputRefId(refId: string): {
    txId: string;
    index: number;
} {
    const [txId, indexStr] = refId.split('#');
    const index = parseInt(indexStr, 10);
    if (isNaN(index)) {
        throw new Error(`Invalid output reference: ${refId}`);
    }
    return { txId, index };
}

export type DBRequest = {
    owner: string;
    assetName: string;
    change: Change;
};

export type DBTokenState = {
    outputRef: OutputRef;
    state: TokenState;
};

type DBElement = DBRequest | DBTokenState;

// Pattern matching can be done using a type guard:
function isDBRequest(element: DBElement): element is DBRequest {
    return 'change' in element && 'assetName' in element;
}

function isDBTokenState(element: DBElement): element is DBTokenState {
    return 'state' in element && 'outputRef' in element;
}

class StateManager {
    private db: Level<string, DBElement>;

    constructor(dbPath: string) {
        this.db = new Level<string, DBElement>(dbPath, {
            valueEncoding: 'json'
        });
    }

    async getRequest(outputRef: string): Promise<DBRequest | null> {
        const result = await this.db.get(outputRef);

        if (result && 'change' in result) {
            return result as DBRequest;
        }
        return null; // Return null if the element is not a request
    }

    async getToken(assetName: string): Promise<DBTokenState | null> {
        const result = await this.db.get(assetName);
        if (isDBTokenState(result)) {
            return result as DBTokenState;
        }
        return null; // Return null if the element is not a token
    }

    async put(key: string, value: DBElement): Promise<void> {
        await this.db.put(key, value);
    }

    async delete(key: string): Promise<void> {
        await this.db.del(key);
    }
    async getTokens() {
        const tokens: { assetName: string; state: DBTokenState }[] = [];
        for await (const [key, value] of this.db.iterator()) {
            if (isDBTokenState(value)) {
                tokens.push({ assetName: key, state: value as DBTokenState });
            }
        }
        return tokens;
    }
    // Returns all requests, optionally filtered by assetName. The order of the
    // requests is guaranteed to respect their outputRef order. So no need to
    // sort them.
    async getRequests(
        assetName: string | null
    ): Promise<{ outputRef: string; change: Change; owner: string }[]> {
        const requests: { outputRef: string; change: Change; owner: string }[] =
            [];
        for await (const [key, value] of this.db.iterator()) {
            if (isDBRequest(value)) {
                if (!assetName || value.assetName === assetName) {
                    requests.push({
                        outputRef: key,
                        change: value.change,
                        owner: value.owner
                    });
                }
            }
        }
        return requests;
    }
}

class Process {
    private state: StateManager;
    private tries: TrieManager;
    private address: string;
    private policyId: string;

    constructor(
        state: StateManager,
        tries: TrieManager,
        address: string,
        policyId: string
    ) {
        this.state = state;
        this.tries = tries;
        this.address = address;
        this.policyId = policyId;
    }
    get trieManager(): TrieManager {
        return this.tries;
    }
    async process(tx: any): Promise<void> {
        const minted = tx.mint?.[this.policyId];
        if (minted) {
            for (const asset of Object.keys(minted)) {
                if (minted[asset] == -1) {
                    // This is a token end request, delete the token state
                    await this.state.delete(asset);
                }
            }
        }
        for (let index = 0; index < tx.outputs.length; index++) {
            const output: {
                address: string;
                value: Record<string, any>;
                datum: any;
            } = tx.outputs[index];
            if (output.address !== this.address) {
                return; // skip outputs not to the caging script address
            }
            const asset = output.value[this.policyId];
            if (asset) {
                const assetName = Object.keys(asset)[0];

                const tokenState = parseStateDatumCbor(output.datum);

                if (tokenState) {
                    const trie = await this.tries.trie(assetName);
                    await this.processTokenUpdate(
                        assetName,
                        tokenState,
                        trie,
                        tx
                    );

                    const localRoot = rootHex(trie.root());
                    // Assert that roots are the same
                    if (localRoot !== tokenState.root) {
                        throw new Error(
                            `Root mismatch for asset ${assetName}:
                            expected ${tokenState.root}, got ${localRoot}`
                        );
                    }
                    return;
                }
                return; // skip outputs with no state datum and our policyId
            }
            const request = parseRequestCbor(output.datum);
            if (!request) {
                return; // skip outputs with no request datum
            }

            const { policyId: parsedPolicyId, assetName: parsedAssetName } =
                tokenIdParts(request.tokenId);
            if (parsedPolicyId === this.policyId) {
                await this.processRequest(
                    {
                        assetName: parsedAssetName,
                        change: request.change,
                        owner: request.owner
                    },
                    tx,
                    index
                );
            }
        }
    }
    async processRetract(tx: any): Promise<void> {
        const inputs = tx.inputs;
        for (const input of inputs) {
            const ref = mkOutputRefId(input.transaction.id, input.index);
            if (await this.state.getRequest(ref)) {
                this.state.delete(ref); // delete requests from inputs
            }
        }
    }
    private async processTokenUpdate(
        assetName: string,
        state: TokenState,
        trie: SafeTrie,
        tx
    ) {
        for (const input of tx.inputs) {
            const ref = mkOutputRefId(input.transaction.id, input.index);
            const request = await this.state.getRequest(ref);
            if (!request) {
                continue; // skip inputs with no request
            }
            await trie.update(request.change);
        }
        await this.state.put(assetName, {
            state,
            outputRef: { txHash: tx.id, outputIndex: 0 }
        });
    }
    private async processRequest(request: DBRequest, tx, index) {
        const ref = mkOutputRefId(tx.id, index);
        await this.state.put(ref, request);
    }
    get stateManager(): StateManager {
        return this.state;
    }
}

class Indexer {
    private process: Process;
    private client: WebSocket;
    private name: string;
    private indexerTip: number | null = null;
    private networkTip: number | null = null;
    private networkTipQueried: boolean = false;
    private ready: boolean = false;
    private stop: Mutex;
    private webSocketAddress: string;

    constructor(process: Process, address: string, name: string = 'Indexer') {
        this.process = process;
        this.name = name;
        this.stop = new Mutex();
        this.webSocketAddress = address;
    }

    public static create(
        tries: TrieManager,
        dbPath: string,
        address: string,
        policyId: string,
        wsAddress: string,
        name: string = 'Indexer'
    ): Indexer {
        const requests = new StateManager(`${dbPath}/state`);
        const process = new Process(requests, tries, address, policyId);

        return new Indexer(process, wsAddress, name);
    }

    private rpc(method: string, params: any, id: any): void {
        this.client.send(
            JSON.stringify({
                jsonrpc: '2.0',
                method,
                params,
                id
            })
        );
    }

    async fetchTokens(): Promise<{ assetName: string; state: DBTokenState }[]> {
        return await this.process.stateManager.getTokens();
    }

    async fetchToken(assetName: string): Promise<DBTokenState | null> {
        return await this.process.stateManager.getToken(assetName);
    }

    async fetchRequests(
        assetName: string | null = null
    ): Promise<{ outputRef: string; change: Change; owner: string }[]> {
        return await this.process.stateManager.getRequests(assetName);
    }

    close(): void {
        this.client.close();
    }
    get isReady(): boolean {
        return this.ready;
    }
    get tries(): TrieManager {
        return this.process.trieManager;
    }
    get networkTipSlot(): number | null {
        return this.networkTip;
    }
    get indexerTipSlot(): number | null {
        return this.indexerTip;
    }
    async pause() {
        return await this.stop.acquire();
    }
    private withTips(f) {
        if (this.networkTip && this.indexerTip) {
            f(this.networkTip, this.indexerTip);
        }
    }
    private queryFindIntersection(points: any[]): void {
        this.rpc('findIntersection', { points }, 'intersection');
    }
    private queryNetworkTip(): void {
        if (!this.networkTipQueried) {
            this.rpc('queryNetwork/tip', {}, 'tip');
            this.networkTipQueried = true;
        }
    }
    private queryNextBlock(): void {
        this.rpc('nextBlock', {}, 'block');
    }
    async run(): Promise<void> {
        const maxRetries = 1000; // Maximum number of retries

        const connectWebSocket = async () => {
            return new Promise<void>((resolve, reject) => {
                this.client = new WebSocket(this.webSocketAddress);
                this.client.on('open', () => {
                    console.log('WebSocket connection established.');
                    resolve();
                });

                this.client.on('error', err => {
                    console.error('WebSocket connection error:', err);
                    reject(err);
                });
            });
        };
        let retries = 0;
        for (; retries < maxRetries; retries++) {
            try {
                console.log(
                    `Attempting to connect to WebSocket (${retries}/${maxRetries})...`
                );
                await connectWebSocket();
                // Once connected, proceed with initialization
                this.queryFindIntersection(['origin']);
                this.queryNetworkTip();
                break; // Exit the retry loop
            } catch (err) {
                console.log(
                    `Retrying WebSocket connection (${retries}/${maxRetries})...`
                );
                this.client.close(); // Close the client to reset the connection
                await new Promise(resolve =>
                    setTimeout(resolve, 1000 * retries)
                );
            }
        }
        if (retries === maxRetries) {
            throw new Error(
                'Failed to connect to WebSocket after maximum retries'
            );
        }

        this.client.on('message', async msg => {
            const release = await this.stop.acquire();
            const response = JSON.parse(msg);

            switch (response.id) {
                case 'intersection':
                    if (!response.result.intersection) {
                        throw 'No intersection found';
                    }
                    this.queryNextBlock();
                    break;
                case 'tip':
                    this.networkTip = response.result.slot;
                    this.networkTipQueried = false;
                    this.withTips((networkTip, indexerTip) => {
                        if (networkTip == indexerTip) {
                            this.ready = true;
                        } else {
                            this.ready = false;
                            if (networkTip < indexerTip) {
                                this.queryNetworkTip();
                            }
                        }
                    });
                    break;
                case 'block':
                    switch (response.result.direction) {
                        case 'forward':
                            this.indexerTip = response.result.block.slot;
                            this.withTips((networkTip, indexerTip) => {
                                if (networkTip < indexerTip) {
                                    this.queryNetworkTip();
                                }
                            });
                            for (const tx of response.result.block
                                .transactions) {
                                //console.log(JSON.stringify(tx, null, 2));
                                await this.process.process(tx);
                                await this.process.processRetract(tx);
                            }
                            this.queryNextBlock();
                            break;
                        case 'backward':
                            this.queryNextBlock();
                            break;
                    }
            }
            release();
        });
    }
}

export { StateManager, TrieManager, Process, Indexer };
