import WebSocket from 'ws';
import { Mutex } from 'async-mutex';
import { Process } from './process';
import { RollbackKey } from './state/rollbackkey';
import { samplePowerOfTwoPositions } from './state/intersection';
import { Checkpoint } from './state/checkpoints';
import { State } from './state';

export class Indexer {
    private process: Process;
    private client: WebSocket;
    private indexerTip: number | null = null;
    private networkTip: number | null = null;
    private networkTipQueried: boolean = false;
    private ready: boolean = false;
    private checkingReadiness: boolean = false;
    private stop: Mutex;
    private webSocketAddress: string;
    private state: State;

    constructor(state: State, process: Process, address: string) {
        this.process = process;
        this.stop = new Mutex();
        this.webSocketAddress = address;
        this.state = state;
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
    async getSync(): Promise<{
        ready: boolean;
        networkTip: number | null;
        indexerTip: number | null;
    }> {
        this.checkingReadiness = true;
        this.queryNetworkTip();
        while (this.checkingReadiness) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return {
            ready: this.ready,
            networkTip: this.networkTip,
            indexerTip: this.indexerTip
        };
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
    async close(): Promise<void> {
        const release = await this.stop.acquire();
        if (this.client) {
            this.client.close();
        }
        release();
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
                const checkpoints: Checkpoint[] =
                    await this.state.checkpoints.getAllCheckpoints();
                const sampleCheckpoints = samplePowerOfTwoPositions(
                    checkpoints.reverse()
                );
                const intersections = (
                    sampleCheckpoints.map(convertCheckpoint) as any[]
                ).concat(['origin']);
                this.queryFindIntersection(intersections);
                this.queryNetworkTip();
                break; // Exit the retry loop
            } catch (err) {
                this.client.close(); // Close the client to reset the connection
                console.error(
                    `WebSocket connection failed, retrying (${
                        retries + 1
                    }/${maxRetries})...`
                );
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
                            const slot = new RollbackKey(
                                response.result.block.slot
                            );
                            await this.state.checkpoints.putCheckpoint(
                                {
                                    slot,
                                    blockHash: response.result.block.id
                                },
                                response.result.block.transactions.flatMap(tx =>
                                    tx.inputs.map(Process.inputToOutputRef)
                                )
                            );
                            for (const tx of response.result.block
                                .transactions) {
                                const changes = await this.process.process(
                                    slot,
                                    tx
                                );
                            }
                            this.queryNextBlock();
                            break;
                        case 'backward':
                            const checkpoints =
                                await this.state.checkpoints.getAllCheckpoints();

                            if (response.result.point === 'origin') {
                                await this.rollback(null);
                            } else {
                                await this.rollback(
                                    reconvertCheckpoint(response.result.point)
                                );
                            }

                            this.queryNextBlock();
                            break;
                    }
            }
            release();
        });
    }
    async rollback(checkpoint: Checkpoint | null): Promise<void> {}
}

type WsCheckpoint = {
    slot: number;
    id: string;
};
const convertCheckpoint = (checkpoint: Checkpoint): WsCheckpoint => {
    return {
        slot: checkpoint.slot.value,
        id: checkpoint.blockHash
    };
};

const reconvertCheckpoint = (wsCheckpoint: WsCheckpoint): Checkpoint => {
    return {
        slot: new RollbackKey(wsCheckpoint.slot),
        blockHash: wsCheckpoint.id
    };
};
