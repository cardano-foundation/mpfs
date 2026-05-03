import WebSocket from 'ws';
import { sleepMs } from './lib';
import { Action, IEvaluator } from '@meshsdk/common';

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

export type Client = {
    close: () => void;
    reply: (f: (string) => Promise<void>) => void;
    submitTx: (txHex: string) => void;
    evaluateTx: (txHex: string) => void;
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
        submitTx: (txHex: string) => {
            rpc(
                'submitTransaction',
                { transaction: { cbor: txHex } },
                'submitTransaction'
            );
        },
        evaluateTx: (txHex: string) => {
            rpc(
                'evaluateTransaction',
                { transaction: { cbor: txHex } },
                'evaluateTransaction'
            );
        },
        reply: (f: (string) => Promise<void>) => {
            client.on('message', async msg => {
                const response = JSON.parse(msg);
                await f(response);
            });
        },
        close: () => {
            client.close();
        }
    };
    return rpcClient;
};

export class TxSubmissionError extends Error {
    public readonly ogmiosError: unknown;
    constructor(message: string, ogmiosError: unknown) {
        super(message);
        this.name = 'TxSubmissionError';
        this.ogmiosError = ogmiosError;
    }
}

type OgmiosValidator = {
    purpose:
        | 'spend'
        | 'mint'
        | 'publish'
        | 'withdraw'
        | 'vote'
        | 'propose';
    index: number;
};

type OgmiosBudget = { memory: number; cpu: number };

type OgmiosEvalEntry = {
    validator: OgmiosValidator;
    budget: OgmiosBudget;
};

const ogmiosPurposeToTag = (
    p: OgmiosValidator['purpose']
): Action['tag'] => {
    switch (p) {
        case 'spend':
            return 'SPEND';
        case 'mint':
            return 'MINT';
        case 'publish':
            return 'CERT';
        case 'withdraw':
            return 'REWARD';
        case 'vote':
            return 'VOTE';
        case 'propose':
            return 'PROPOSE';
    }
};

/**
 * IEvaluator backed by ogmios `evaluateTransaction` (JSON-RPC over the
 * same websocket the submitter uses). Bypasses yaci-store's evaluate
 * proxy, which has been observed returning empty 500s on Plutus V3
 * txs. Returns Mesh's redeemer-shape { tag, index, budget: {mem,steps} }.
 */
export const mkOgmiosEvaluator = (ogmios: string): IEvaluator => ({
    evaluateTx: async (txHex: string) => {
        const client = await connect(ogmios);
        return new Promise<Omit<Action, 'data'>[]>((resolve, reject) => {
            client.reply(async response => {
                if (response.id !== 'evaluateTransaction') return;
                if (response.error) {
                    client.close();
                    reject(
                        new Error(
                            `ogmios evaluateTransaction error: ${JSON.stringify(
                                response.error
                            )}`
                        )
                    );
                    return;
                }
                const entries: OgmiosEvalEntry[] = response.result;
                const actions: Omit<Action, 'data'>[] = entries.map(e => ({
                    tag: ogmiosPurposeToTag(e.validator.purpose),
                    index: e.validator.index,
                    budget: { mem: e.budget.memory, steps: e.budget.cpu }
                }));
                client.close();
                resolve(actions);
            });
            client.evaluateTx(txHex);
        });
    }
});

export const submitTransaction = async (
    ogmios,
    txHex: string
): Promise<string> => {
    const client = await connect(ogmios);

    return new Promise<string>((resolve, reject) => {
        client.reply(async response => {
            if (response.id === 'submitTransaction') {
                if (response.error) {
                    reject(
                        new TxSubmissionError(
                            `Transaction submission failed: ${response.error.message}`,
                            response.error
                        )
                    );
                } else {
                    resolve(response.result.transaction.id);
                    client.close();
                }
            }
        });
        client.submitTx(txHex);
    });
};
