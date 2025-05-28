import WebSocket from 'ws';
import { parseStateDatumCbor } from '../token';
import { parseRequestCbor } from '../request';
import { rootHex, toHex } from '../lib';
import { Level } from 'level';
import { TrieManager } from '../trie';

function mkOutputRefId(txId: string, index: number): string {
    return `${txId}#${index}`;
}

type Request = {
    assetName: string;
    key: string;
    value: string;
    operation: 'insert' | 'delete';
};

// Managing requests
class RequestManager {
    private db: Level<string, Request>;

    constructor(dbPath: string) {
        this.db = new Level<string, Request>(dbPath, { valueEncoding: 'json' });
    }

    async get(outputRef: string): Promise<Request | null> {
        try {
            return await this.db.get(outputRef);
        } catch (error) {
            if (error.code === 'LEVEL_NOT_FOUND') {
                return null;
            }
            throw error;
        }
    }

    async put(outputRef: string, request: Request): Promise<void> {
        await this.db.put(outputRef, request);
    }
}

class Process {
    private requests: RequestManager;
    private tries: TrieManager;
    private address: string;
    private policyId: string;

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
    async process(tx: any): Promise<void> {
        tx.outputs.forEach(async (output, index) => {
            if (output.address !== this.address) {
                return; // skip outputs not to the caging script address
            }
            const assetName = output.value[this.policyId];
            if (assetName) {
                const state = parseStateDatumCbor(output.datum);
                if (state) {
                    await this.processTokenUpdate(state, tx);
                    return;
                }
                return; // skip outputs with no state datum and our policyId
            }
            const request = parseRequestCbor(output.datum);
            if (request && request.policyId === this.policyId) {
                await this.processRequest(request, tx, index);
            }
        });
    }
    private async processTokenUpdate(state, tx) {
        tx.inputs.forEach(async input => {
            const ref = mkOutputRefId(input.transaction.id, input.index);
            const request = await this.requests.get(ref);
            if (request) {
                const trie = await this.tries.trie(request.assetName);
                await trie.update(
                    request.key,
                    request.value,
                    request.operation
                );
                const localRoot = rootHex(trie.coldRoot());

                // Assert that roots are the same
                if (localRoot !== state.root) {
                    throw new Error(
                        `Root mismatch for asset ${request.assetName}:
                            expected ${state.root}, got ${localRoot}`
                    );
                }
            }
        });
    }
    private async processRequest(request, tx, index) {
        const ref = mkOutputRefId(tx.id, index);
        const value = {
            assetName: request.assetName,
            key: request.key,
            value: request.value,
            operation: request.operation
        };
        await this.requests.put(ref, value);
    }
}

class Indexer {
    private process: Process;
    private client: WebSocket;
    private name: string;

    constructor(process: Process, address: string, name: string = 'Indexer') {
        this.process = process;
        this.client = new WebSocket(address);
        this.name = name;
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
    run(): void {
        this.client.once('open', () => {
            this.rpc(
                'findIntersection',
                { points: ['origin'] },
                'find-intersection'
            );
        });

        this.client.on('message', msg => {
            const response = JSON.parse(msg);

            switch (response.id) {
                case 'find-intersection':
                    if (!response.result.intersection) {
                        throw 'No intersection found';
                    }
                    this.rpc('nextBlock', {}, 1);
                    break;

                default:
                    if (response.result.direction === 'forward') {
                        response.result.block.transactions.forEach(tx => {
                            // console.log(this.name, JSON.stringify(tx.outputs, null, 2))
                            this.process.process(tx);
                        });
                    }

                    this.rpc('nextBlock', {}, 1);
                    break;
            }
        });
    }
}

export { RequestManager, TrieManager, Process, Indexer };
