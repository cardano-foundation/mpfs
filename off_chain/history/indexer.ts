import WebSocket from 'ws';
import { Change, TrieManager } from '../trie';
import { Mutex } from 'async-mutex';
import { DBTokenState, RollbackKey, StateChange, StateManager } from './store';
import { Process } from './process';

class Indexer {
    private process: Process;
    private client: WebSocket;
    private name: string;
    private indexerTip: number | null = null;
    private networkTip: number | null = null;
    private networkTipQueried: boolean = false;
    private ready: boolean = false;
    private checkingReadiness: boolean = false;
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
        const requests = new StateManager(
            `${dbPath}/tokens`,
            `${dbPath}/requests`,
            `${dbPath}/rollback`
        );
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

    async splitRollbacks(slot: number): Promise<StateChange[]> {
        return await this.process.stateManager.splitRollbacks(slot);
    }

    async removeRollbacksBefore(rollbackKey: RollbackKey): Promise<void> {
        await this.process.stateManager.removeRollbacksBefore(rollbackKey);
    }

    async fetchTokens(): Promise<{ tokenId: string; state: DBTokenState }[]> {
        return await this.process.stateManager.getTokens();
    }

    async fetchToken(tokenId: string): Promise<DBTokenState | null> {
        return await this.process.stateManager.getToken(tokenId);
    }

    async fetchRequests(
        tokenId: string | null = null
    ): Promise<{ outputRef: string; change: Change; owner: string }[]> {
        return await this.process.stateManager.getRequests(tokenId);
    }

    close(): void {
        this.client.close();
    }
    async getSync(): Promise<{
        ready: boolean;
        networkTip: number | null;
        indexerTip: number | null;
    }> {
        this.checkingReadiness = true;
        this.queryNetworkTip();
        while (this.checkingReadiness) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return {
            ready: this.ready,
            networkTip: this.networkTip,
            indexerTip: this.indexerTip
        };
    }
    get tries(): TrieManager {
        return this.process.trieManager;
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
    async closeConnection(): Promise<void> {
        if (this.client) {
            this.client.close();
        }
        this.client = null;
    }
    async run(): Promise<void> {
        const maxRetries = 1000; // Maximum number of retries

        const connectWebSocket = async () => {
            return new Promise<void>((resolve, reject) => {
                this.client = new WebSocket(this.webSocketAddress);
                this.client.on('open', () => {
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
                await connectWebSocket();
                // Once connected, proceed with initialization
                this.queryFindIntersection(['origin']);
                this.queryNetworkTip();
                break; // Exit the retry loop
            } catch (err) {
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
                    this.checkingReadiness = false;
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
                                const changes = await this.process.process(
                                    response.result.block.slot,
                                    tx
                                );
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
