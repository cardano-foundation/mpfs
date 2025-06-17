import WebSocket from 'ws';
import { Mutex } from 'async-mutex';
import { RollbackKey } from './state/rollbackkey';
import { Checkpoints } from './state/checkpoints';
import { inputToOutputRef, sleepMs } from '../lib';
import { Process } from './process';
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

export const connect = async (address): Promise<Client> => {
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
                await sleepMs(1000 * retries);
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

export type Client = {
    findIntersection: (points: any[]) => void;
    queryNetworkTip: () => void;
    nextBlock: () => void;
    reply: (f: (string) => Promise<void>) => void;
    close: () => void;
};

export const createClient = (client: WebSocket): Client => {
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
    tips: () => Promise<{
        ready: boolean;
        networkTip: number | null;
        indexerTip: number | null;
    }>;

    waitBlocks: (n: number) => Promise<number>;
    pause: () => Promise<() => void>;
    close: () => Promise<void>;
};

const intersect = async (client: Client, checkpoints: Checkpoints) => {
    const intersections = await checkpoints.getIntersections();
    client.findIntersection(intersections);
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
    let blockHeight: number | null = null;
    const stop: Mutex = new Mutex();
    const client = await connect(ogmios);
    const checkpoints = state.checkpoints;
    await intersect(client, checkpoints);
    client.queryNetworkTip();
    client.reply(async response => {
        const release = await stop.acquire(); // In case we should pause the indexer
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
                            blockHeight = response.result.block.height || null;
                            withTips(
                                { networkTip, indexerTip },
                                (networkTip, indexerTip) => {
                                    if (networkTip < indexerTip) {
                                        client.queryNetworkTip();
                                    }
                                }
                            );
                            if (response.result.block.slot) {
                                const slot = new RollbackKey(
                                    response.result.block.slot
                                );
                                const inputRefs = response.result.block
                                    .transactions
                                    ? response.result.block.transactions.flatMap(
                                          tx => tx.inputs.map(inputToOutputRef)
                                      )
                                    : [];
                                await checkpoints.putCheckpoint(
                                    { slot, id: response.result.block.id },

                                    inputRefs
                                );
                                if (response.result.block.transactions)
                                    for (const tx of response.result.block
                                        .transactions) {
                                        await process(slot, tx);
                                    }
                            }
                            client.nextBlock();
                            break;
                        case 'backward':
                            const sampleCheckpoints =
                                await checkpoints.getIntersections();
                            const moreRecent = sampleCheckpoints[0];
                            if (response.result.point === 'origin') {
                                if (moreRecent !== 'origin') {
                                    throw new Error(
                                        `Impossible request, more recent is ${JSON.stringify(moreRecent)}`
                                    );

                                    // await state.rollback('origin');
                                    // issue 9b1ac369760ddbece549abd8afeafec4c733f3ee, over stability rollback
                                }
                                client.nextBlock();
                                break;
                            }
                            if (moreRecent === 'origin')
                                throw new Error(`Impossible request`);

                            if (
                                moreRecent.slot.value !==
                                response.result.point.slot
                            ) {
                                state.rollback(
                                    new RollbackKey(response.result.point.slot)
                                );
                                const intersection = (
                                    await checkpoints.getIntersections()
                                )[0];
                                if (intersection === response.result.point) {
                                    client.nextBlock();
                                    break;
                                } else {
                                    await intersect(client, checkpoints);
                                }
                            } else client.nextBlock();

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
    const tips = async () => {
        checkingReadiness = true;
        client.queryNetworkTip();
        while (checkingReadiness) await sleepMs(100);
        return {
            ready,
            networkTip,
            indexerTip
        };
    };
    const sync = async () => {
        await new Promise<void>(async resolve => {
            const checkReadiness = async () => {
                const { ready, networkTip, indexerTip } = await tips();
                if (ready) {
                    resolve();
                } else {
                    setTimeout(checkReadiness, 100);
                }
            };
            await checkReadiness();
        });
    };

    return {
        tips,

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
        },
        waitBlocks: async (n: number): Promise<number> => {
            await sync();
            if (blockHeight === null) {
                throw new Error('Block height is not available');
            }
            const currentHeight = blockHeight;
            const targetHeight = currentHeight + n;
            await new Promise<void>(resolve => {
                const checkHeight = () => {
                    if (blockHeight === targetHeight) {
                        resolve();
                    } else {
                        setTimeout(checkHeight, 100);
                    }
                };
                checkHeight();
            });
            return blockHeight;
        }
    };
};

export const withIndexer = async (
    state: State,
    process: Process,
    ogmios: string,
    f: (indexer: Indexer) => Promise<void>
): Promise<void> => {
    const indexer = await createIndexer(state, process, ogmios);
    try {
        await f(indexer);
    } finally {
        await indexer.close();
    }
};
