import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import axios, { AxiosError, AxiosStatic } from 'axios';
import { bootTokenTx, getTokens, requestChangeTx, submitTx } from '../client';

// GHSA-4hjh-wcwx-xvwj: the Node http adapter decoded `data:` URLs without
// honouring maxContentLength. The payload below is a few KiB, never a
// resource-exhausting size; the observable outcome is whether the configured
// limit is enforced.
const dataUrl = (bytes: number) =>
    'data:application/octet-stream;base64,' +
    Buffer.alloc(bytes).toString('base64');

const LIMIT = 1024;
const PAYLOAD = 4096;

// Every Axios copy that MPFS code or its wallet providers resolve at runtime.
const require = createRequire(import.meta.url);
const copyUsedBy = (parent: string): AxiosStatic =>
    createRequire(require.resolve(parent))('axios');

const resolved: [string, AxiosStatic][] = [
    ['signingless client', axios],
    ['@meshsdk/provider', copyUsedBy('@meshsdk/provider')],
    ['@cardano-sdk/key-management', copyUsedBy('@cardano-sdk/key-management')]
];

describe('axios data: URL size limit (GHSA-4hjh-wcwx-xvwj)', () => {
    it.each(resolved)(
        '%s rejects a data: URL larger than maxContentLength',
        async (_name, ax) => {
            const outcome = await ax
                .get(dataUrl(PAYLOAD), {
                    responseType: 'arraybuffer',
                    maxContentLength: LIMIT
                })
                .then(
                    r =>
                        `decoded ${r.data.length} bytes past a ${LIMIT} byte limit`,
                    (e: Error) => e.message
                );
            expect(outcome).toMatch(/maxContentLength/);
        }
    );

    it.each(resolved)(
        '%s still serves a data: URL within maxContentLength',
        async (_name, ax) => {
            const response = await ax.get(dataUrl(LIMIT / 2), {
                responseType: 'arraybuffer',
                maxContentLength: LIMIT
            });
            expect(response.status).toBe(200);
            expect(response.data.length).toBe(LIMIT / 2);
        }
    );
});

describe('signingless client over real HTTP', () => {
    // the shape the signingless service returns from GET /tokens
    const tokensBody = {
        tokens: [
            { tokenId: 'abc', current: { state: { owner: 'o', root: 'r' } } }
        ],
        indexerStatus: { ready: true, networkTip: 42, indexerTip: 41 }
    };
    type Seen = {
        method?: string;
        url?: string;
        headers: IncomingMessage['headers'];
        body: string;
    };
    let server: Server;
    let host: string;
    const seen: Seen[] = [];

    beforeAll(async () => {
        server = createServer((req, res) => {
            const chunks: Buffer[] = [];
            req.on('data', c => chunks.push(c));
            req.on('end', () => {
                seen.push({
                    method: req.method,
                    url: req.url,
                    headers: req.headers,
                    body: Buffer.concat(chunks).toString()
                });
                res.setHeader('content-type', 'application/json');
                if (req.url?.includes('/refused')) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'refused by service' }));
                } else if (req.url === '/tokens') {
                    res.end(JSON.stringify(tokensBody));
                } else if (req.url?.endsWith('/boot-token')) {
                    res.end(
                        JSON.stringify({
                            unsignedTransaction: 'cafe',
                            value: 'abc'
                        })
                    );
                } else if (req.url?.includes('/request-insert/')) {
                    res.end(
                        JSON.stringify({
                            unsignedTransaction: 'beef',
                            value: null
                        })
                    );
                } else if (req.url === '/transaction') {
                    res.end(JSON.stringify({ txHash: 'f00d' }));
                } else {
                    res.end('{}');
                }
            });
        });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
        host = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });
    afterAll(() => new Promise<void>(r => server.close(() => r())));

    it('keeps the GET and POST request contracts', async () => {
        expect(await getTokens(() => undefined, host, 1)).toEqual(tokensBody);
        expect(await bootTokenTx(host, 'addr_test1', 1)).toEqual({
            unsignedTransaction: 'cafe',
            value: 'abc'
        });
        expect(
            await requestChangeTx(
                host,
                'addr_test1',
                'tok',
                { type: 'insert', key: 'k', newValue: 'v' },
                1
            )
        ).toEqual({ unsignedTransaction: 'beef', value: null });
        expect(await submitTx(host, 'signed-cbor')).toEqual({ txHash: 'f00d' });

        const calls = seen.map(s => `${s.method} ${s.url}`);
        expect(calls).toEqual([
            'POST /indexer/wait-blocks',
            'GET /tokens',
            'POST /indexer/wait-blocks',
            'GET /transaction/addr_test1/boot-token',
            'POST /indexer/wait-blocks',
            'POST /transaction/addr_test1/request-insert/tok',
            'POST /transaction'
        ]);

        const post = (url: string) => seen.find(s => s.url === url)!;
        expect(JSON.parse(post('/indexer/wait-blocks').body)).toEqual({ n: 1 });
        expect(
            JSON.parse(post('/transaction/addr_test1/request-insert/tok').body)
        ).toEqual({ key: 'k', newValue: 'v' });
        expect(JSON.parse(post('/transaction').body)).toEqual({
            signedTransaction: 'signed-cbor'
        });

        for (const s of seen) {
            expect(s.headers.authorization).toBeUndefined();
            if (s.method === 'POST') {
                expect(s.headers['content-type']).toMatch(/^application\/json/);
            }
        }
    });

    it('surfaces a non-2xx refusal as a rejection carrying status and body', async () => {
        const failure = await bootTokenTx(host, 'refused', 1).then(
            () => undefined,
            (e: AxiosError) => e
        );
        expect(failure?.response?.status).toBe(400);
        expect(failure?.response?.data).toEqual({
            error: 'refused by service'
        });
    });
});
