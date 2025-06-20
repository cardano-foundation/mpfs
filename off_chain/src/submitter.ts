import WebSocket from 'ws';
import { sleepMs } from './lib';

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
                        new Error(
                            `Transaction submission failed: ${response.error.message}`
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
