import WebSocket from 'ws';
import { Mutex } from 'async-mutex';
import { Process } from './process';
import { RollbackKey } from './state/rollbackkey';
import { samplePowerOfTwoPositions } from './state/intersection';
import { Checkpoint } from './state/checkpoints';
import { State } from './state';

const connectWebSocket = async (address: string) => {
    return new Promise<WebSocket>((resolve, reject) => {
        const client = new WebSocket(address);
        client.on('open', () => {
            resolve(client);
        });

        client.on('error', err => {
            console.error('WebSocket connection error:', err);
            reject(err);
        });
    });
};

const connect = async (address): Promise<Client> => {
    const maxRetries = 1000; // Maximum number of retries
    return await new Promise(async (resolve, reject) => {
        let retries = 0;
        for (; retries < maxRetries; retries++) {
            try {
                const websocket = await connectWebSocket(address);
                resolve(createClient(websocket));
                break;
            } catch (err) {
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
            reject(
                new Error(
                    `Failed to connect to WebSocket after ${maxRetries} attempts`
                )
            );
        }
    });
};

const withTips = (w, f) => {
    if (w.networkTip && w.indexerTip) {
        f(w.networkTip, w.indexerTip);
    }
};

type Client = {
    findIntersection: (points: any[]) => void;
    queryNetworkTip: () => void;
    nextBlock: () => void;
    reply: (f: (string) => Promise<void>) => void;
    close: () => void;
};

const createClient = (client: WebSocket): Client => {
    const rpc = (method: string, params: any, id: any): void => {
        client.send(
            JSON.stringify({
                jsonrpc: '2.0',
                method,
                params,
                id
            })
        );
    };
    const rpcClient: Client = {
        findIntersection: (points: any[]) => {
            rpc('findIntersection', { points }, 'intersection');
        },
        queryNetworkTip: () => {
            rpc(`queryNetwork/tip`, {}, 'tip');
        },
        nextBlock: () => {
            rpc('nextBlock', {}, 'block');
        },
        close: () => {
            client.close();
        },
        reply: (f: (string) => Promise<void>) => {
            client.on('message', async msg => {
                const response = JSON.parse(msg);
                await f(response);
            });
        }
    };
    return rpcClient;
};

export type Indexer = {
    getSync: () => Promise<{
        ready: boolean;
        networkTip: number | null;
        indexerTip: number | null;
    }>;
    pause: () => Promise<() => void>;
    close: () => Promise<void>;
};

export const createIndexer = async (
    state: State,
    process: Process,
    ogmios: string
): Promise<Indexer> => {
    let indexerTip: number | null = null;
    let networkTip: number | null = null;
    let networkTipQueried: boolean = false;
    let ready: boolean = false;
    let checkingReadiness: boolean = false;
    const stop: Mutex = new Mutex();
    const client = await connect(ogmios);
    const checkpoints: Checkpoint[] =
        await state.checkpoints.getAllCheckpoints();
    const sampleCheckpoints = samplePowerOfTwoPositions(checkpoints.reverse());
    const intersections = (
        sampleCheckpoints.map(convertCheckpoint) as any[]
    ).concat(['origin']);
    client.findIntersection(intersections);
    client.queryNetworkTip();
    client.reply(async response => {
        const release = await stop.acquire();
        try {
            switch (response.id) {
                case 'intersection':
                    if (!response.result.intersection) {
                        throw 'No intersection found';
                    }
                    client.nextBlock();
                    break;
                case 'tip':
                    checkingReadiness = false;
                    networkTip = response.result.slot;
                    networkTipQueried = false;
                    withTips(
                        { networkTip, indexerTip },
                        (networkTip, indexerTip) => {
                            ready = networkTip === indexerTip;
                            if (networkTip < indexerTip) {
                                client.queryNetworkTip();
                            }
                        }
                    );
                    break;
                case 'block':
                    switch (response.result.direction) {
                        case 'forward':
                            indexerTip = response.result.block.slot;
                            withTips(
                                { networkTip, indexerTip },
                                (networkTip, indexerTip) => {
                                    if (networkTip < indexerTip) {
                                        client.queryNetworkTip();
                                    }
                                }
                            );
                            const slot = new RollbackKey(
                                response.result.block.slot
                            );
                            await state.checkpoints.putCheckpoint(
                                { slot, blockHash: response.result.block.id },
                                response.result.block.transactions.flatMap(tx =>
                                    tx.inputs.map(Process.inputToOutputRef)
                                )
                            );
                            for (const tx of response.result.block
                                .transactions) {
                                await process.process(slot, tx);
                            }

                            client.nextBlock();
                            break;
                        case 'backward':
                            const checkpoints =
                                await state.checkpoints.getAllCheckpoints();

                            client.nextBlock();
                            break;
                    }
            }
        } catch (error) {
            console.error('Error processing response:', error);
            throw error;
        } finally {
            release();
        }
    });

    return {
        getSync: async () => {
            checkingReadiness = true;
            client.queryNetworkTip();
            while (checkingReadiness) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            return {
                ready: ready,
                networkTip: networkTip,
                indexerTip: indexerTip
            };
        },
        pause: async () => {
            const release = await stop.acquire();
            return () => {
                release();
            };
        },
        close: async () => {
            const release = await stop.acquire();
            client.close();
            release();
        }
    };
};

//     async run(): Promise<void> {

//         this.client.on('message', async msg => {
//             const release = await this.stop.acquire();
//             const response = JSON.parse(msg);

//             switch (response.id) {
//                 case 'intersection':
//                     if (!response.result.intersection) {
//                         throw 'No intersection found';
//                     }
//                     this.queryNextBlock();
//                     break;
//                 case 'tip':
//                     this.checkingReadiness = false;
//                     this.networkTip = response.result.slot;
//                     this.networkTipQueried = false;
//                     this.withTips((networkTip, indexerTip) => {
//                         if (networkTip == indexerTip) {
//                             this.ready = true;
//                         } else {
//                             this.ready = false;
//                             if (networkTip < indexerTip) {
//                                 this.queryNetworkTip();
//                             }
//                         }
//                     });
//                     break;
//                 case 'block':
//                     switch (response.result.direction) {
//                         case 'forward':
//                             this.indexerTip = response.result.block.slot;
//                             this.withTips((networkTip, indexerTip) => {
//                                 if (networkTip < indexerTip) {
//                                     this.queryNetworkTip();
//                                 }
//                             });
//                             const slot = new RollbackKey(
//                                 response.result.block.slot
//                             );
//                             await this.state.checkpoints.putCheckpoint(
//                                 {
//                                     slot,
//                                     blockHash: response.result.block.id
//                                 },
//                                 response.result.block.transactions.flatMap(tx =>
//                                     tx.inputs.map(Process.inputToOutputRef)
//                                 )
//                             );
//                             for (const tx of response.result.block
//                                 .transactions) {
//                                 const changes = await this.process.process(
//                                     slot,
//                                     tx
//                                 );
//                             }
//                             this.queryNextBlock();
//                             break;
//                         case 'backward':
//                             const checkpoints =
//                                 await this.state.checkpoints.getAllCheckpoints();

//                             if (response.result.point === 'origin') {
//                                 await this.rollback(null);
//                             } else {
//                                 await this.rollback(
//                                     reconvertCheckpoint(response.result.point)
//                                 );
//                             }

//                             this.queryNextBlock();
//                             break;
//                     }
//             }
//             release();
//         });
//     }
//     async rollback(checkpoint: Checkpoint | null): Promise<void> {
//         // remove all checkpoints after this one

//         const requests = await this.state.checkpoints.extractCheckpointsAfter(
//             checkpoint
//         );

//         // // get out the rollbacks after this checkpoint
//         // const rollbacks = await this.state.extractRollbacksAfter(
//         //     checkpoint.slot
//         // );
//         // // and backapply them to the tries
//         // for (const rollback of rollbacks) {
//         //     await this.process.trieManager.applyRollback(rollback);
//         // }
//         // // prune the requests after this checkpoint
//         // for (const request of requests) {
//         //     await this.state.removeRequest(request.outputRef);
//         // }
//     }
// }

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
