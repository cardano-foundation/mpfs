import WebSocket from 'ws';
import { parseStateDatumCbor } from '../token';
import { parseRequestCbor } from '../request';
import { rootHex, toHex, tokenIdParts } from '../lib';
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

// Managing requests
class RequestManager {
    private db: Level<string, DBRequest>;

    constructor(dbPath: string) {
        this.db = new Level<string, DBRequest>(dbPath, {
            valueEncoding: 'json'
        });
    }

    async get(outputRef: string): Promise<DBRequest | null> {
        return await this.db.get(outputRef);
    }

    async put(outputRef: string, request: DBRequest): Promise<void> {
        await this.db.put(outputRef, request);
    }
}

class Process {
    private requests: RequestManager;
    private tries: TrieManager;
    private address: string;
    private policyId: string;
    private lock = new Mutex();

    constructor(
        requests: RequestManager,
        tries: TrieManager,
        address: string,
        policyId: string
    ) {
        this.requests = requests;
        this.tries = tries;
        this.address = address;
        this.policyId = policyId;
    }
    get trieManager(): TrieManager {
        return this.tries;
    }
    async process(tx: any): Promise<void> {
        await tx.outputs.forEach(async (output, index) => {
            if (output.address !== this.address) {
                return; // skip outputs not to the caging script address
            }
            const asset = output.value[this.policyId];
            if (asset) {
                const assetName = Object.keys(asset)[0];

                const state = parseStateDatumCbor(output.datum);

                if (state) {
                    const release = await this.lock.acquire(); // TODO granularize lock
                    const trie = await this.tries.trie(assetName);
                    await this.processTokenUpdate(trie, tx);

                    const localRoot = rootHex(trie.root());
                    release();
                    // Assert that roots are the same
                    if (localRoot !== state.root) {
                        throw new Error(
                            `Root mismatch for asset ${assetName}:
                            expected ${state.root}, got ${localRoot}`
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
    private async processTokenUpdate(trie: SafeTrie, tx) {
        for (const input of tx.inputs) {
            const ref = mkOutputRefId(input.transaction.id, input.index);
            const request = await this.requests.get(ref);
            if (!request) {
                continue; // skip inputs with no request
            }
            await trie.update(request.change);
        }
    }
    private async processRequest(request: DBRequest, tx, index) {
        const ref = mkOutputRefId(tx.id, index);
        await this.requests.put(ref, request);
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

    constructor(process: Process, address: string, name: string = 'Indexer') {
        this.process = process;
        this.client = new WebSocket(address);
        this.name = name;
        this.stop = new Mutex();
    }

    public static create(
        tries: TrieManager,
        dbPath: string,
        address: string,
        policyId: string,
        wsAddress: string,
        name: string = 'Indexer'
    ): Indexer {
        const requests = new RequestManager(`${dbPath}/requests`);
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
        this.client.on('open', () => {
            this.queryFindIntersection(['origin']);
            this.queryNetworkTip();
        });

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

export { RequestManager, TrieManager, Process, Indexer };
