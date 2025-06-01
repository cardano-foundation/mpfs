import WebSocket from 'ws';
import { parseStateDatumCbor, TokenState } from '../token';
import { parseRequestCbor } from '../request';
import { assetName, rootHex, toHex, tokenIdParts } from '../lib';
import { Level } from 'level';
import { Change, SafeTrie, TrieManager } from '../trie';
import { Mutex } from 'async-mutex';

function mkOutputRefId(txId: string, index: number): string {
    return `${txId}#${index}`;
}

type DBRequest = {
    assetName: string;
    change: Change;
};

type DBElement = DBRequest | TokenState;

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

    async getToken(assetName: string): Promise<TokenState | null> {
        const result = await this.db.get(assetName);
        if (result && 'owner' in result) {
            return result as TokenState;
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
        const tokens: { assetName: string; state: TokenState }[] = [];
        for await (const [key, value] of this.db.iterator()) {
            if ('owner' in value) {
                tokens.push({ assetName: key, state: value as TokenState });
            }
        }
        return tokens;
    }
}

class Process {
    private state: StateManager;
    private tries: TrieManager;
    private address: string;
    private policyId: string;
    private lock = new Mutex();

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

        // TODO use for loop instead of forEach to handle async properly
        await tx.outputs.forEach(async (output, index) => {
            if (output.address !== this.address) {
                return; // skip outputs not to the caging script address
            }
            const asset = output.value[this.policyId];
            if (asset) {
                const assetName = Object.keys(asset)[0];

                const tokenState = parseStateDatumCbor(output.datum);

                if (tokenState) {
                    const release = await this.lock.acquire(); // TODO granularize lock
                    const trie = await this.tries.trie(assetName);
                    await this.processTokenUpdate(
                        assetName,
                        tokenState,
                        trie,
                        tx
                    );

                    const localRoot = rootHex(trie.root());
                    release();
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
                    { assetName: parsedAssetName, change: request.change },
                    tx,
                    index
                );
            }
        });
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
        await this.state.put(assetName, state);
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

    async fetchTokens(): Promise<{ assetName: string; state: TokenState }[]> {
        return await this.process.stateManager.getTokens();
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
