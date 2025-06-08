import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { boot } from './boot';
import { end } from './end';
import { request } from './request';
import { update } from './update';
import { retract } from './retract';
import { generateMnemonic, MeshWallet } from '@meshsdk/core';
import { Context, getCagingScript, newContext, yaciProvider } from '../context';
import { Indexer } from '../history/indexer';
import { withTempDir } from '../test/lib';
import { withLevelDB } from '../trie.test';
import { mkOutputRefId } from '../outputRef';
import { createTrieManager, TrieManager } from '../trie';

describe('Restarting the service', () => {
    it('should not throw an error', async () => {
        const mnemonics = generateMnemonic();
        await withTempDir(async tmpDir => {
            await withContext(3000, tmpDir, mnemonics, async context1 => {
                await sync(context1);
                const tokenId = await boot(context1);
                expect(tokenId).toBeDefined();
                await sync(context1);
                const rq1 = await request(
                    context1,
                    tokenId,
                    'key1',
                    'value1',
                    'insert'
                );
                await sync(context1);
                await update(context1, tokenId, [rq1]);
                await sync(context1);
                await end(context1, tokenId);
            });
            await new Promise(resolve => setTimeout(resolve, 5000));

            await withContext(3000, tmpDir, mnemonics, async context2 => {
                await sync(context2);
                const tokenId = await boot(context2);
                expect(tokenId).toBeDefined();
                await sync(context2);
                await end(context2, tokenId);
            });
        });
    }, 60_000);
});
describe('Submitting transactions we', () => {
    it('can create and delete a token', async () => {
        await withTempDir(async tmpDir => {
            await withContext(3000, null, null, async context => {
                await sync(context);

                const tokenId = await boot(context);
                await sync(context);
                const tokenBooted = await context.fetchToken(tokenId);
                expect(tokenBooted).toBeDefined();

                await end(context, tokenId);

                await sync(context);
                const tokenDeleted = await context.fetchToken(tokenId);
                expect(tokenDeleted).toBeUndefined();
            });
        });
    }, 20000);

    it('can create a request', async () => {
        await withContext(3000, null, null, async context => {
            await sync(context);
            const tokenId = await boot(context);

            await sync(context);
            const tokenBooted = await context.fetchToken(tokenId);
            const ref = await request(
                context,
                tokenId,
                'key',
                'value',
                'insert'
            );
            const refId = mkOutputRefId(ref);

            await sync(context);
            const requests = await context.fetchRequests(tokenId);
            if (!requests.some(req => req.outputRef === refId)) {
                throw new Error(`Request ID ${refId} not found in requests`);
            }

            await sync(context);
            await end(context, tokenId);
        });
    }, 60000);

    it('can retract a request', async () => {
        await withContext(3000, null, null, async context => {
            await sync(context);
            const tokenId = await boot(context);

            await sync(context);
            const req = await request(
                context,
                tokenId,
                'key',
                'value',
                'insert'
            );
            const reqId = mkOutputRefId(req);

            await sync(context);
            await retract(context, req);

            await sync(context);
            const reqs = await context.fetchRequests(tokenId);
            if (reqs.some(req => req.outputRef === reqId)) {
                throw new Error(
                    `Request ID ${reqId} still found in requests after retraction`
                );
            }
            await sync(context);
            await end(context, tokenId);
        });
    }, 60000);
    it('can update a token', async () => {
        await withContext(3000, null, null, async context => {
            await sync(context);
            const tokenId = await boot(context);

            await sync(context);
            const requestRef = await request(
                context,
                tokenId,
                'key',
                'value',
                'insert'
            );
            const requestRefId = mkOutputRefId(requestRef);

            await sync(context);
            await update(context, tokenId, [requestRef]);

            await sync(context);
            const requests = await context.fetchRequests(tokenId);
            if (requests.some(req => req.outputRef === requestRefId)) {
                throw new Error(
                    `Request ID ${requestRefId} still found in requests after update`
                );
            }

            await sync(context);
            const facts = await context.facts(tokenId);
            expect(facts).toEqual({
                key: 'value'
            });

            await sync(context);
            await end(context, tokenId);
        });
    }, 60000);
    it('can update a token twice tr', async () => {
        await withContext(3000, null, null, async context => {
            await sync(context);
            const tokenId = await boot(context);

            await sync(context);
            const requestRef1 = await request(
                context,
                tokenId,
                'key1',
                'value1',
                'insert'
            );
            const requestRefId1 = mkOutputRefId(requestRef1);

            await sync(context);
            await update(context, tokenId, [requestRef1]);

            await sync(context);
            const requestRef2 = await request(
                context,
                tokenId,
                'key2',
                'value2',
                'insert'
            );
            const requestRefId2 = mkOutputRefId(requestRef2);

            await sync(context);
            await update(context, tokenId, [requestRef2]);

            await sync(context);
            const requests = await context.fetchRequests(tokenId);

            await sync(context);
            const facts = await context.facts(tokenId);
            expect(facts).toEqual({
                key1: 'value1',
                key2: 'value2'
            });

            await sync(context);
            await end(context, tokenId);
        });
    }, 60000);
    it('can update the token with a batch', async () => {
        await withContext(3000, null, null, async context => {
            await sync(context);
            const tokenId = await boot(context);

            await sync(context);
            const requestRef1 = await request(
                context,
                tokenId,
                'key1',
                'value1',
                'insert'
            );
            const requestRefId1 = mkOutputRefId(requestRef1);

            await sync(context);
            const requestRef2 = await request(
                context,
                tokenId,
                'key2',
                'value2',
                'insert'
            );
            const requestRefId2 = mkOutputRefId(requestRef2);

            await sync(context);
            await update(context, tokenId, [requestRef1, requestRef2]);

            await sync(context);
            const requests = await context.fetchRequests(tokenId);
            if (
                requests.some(req => req.outputRef === requestRefId1) ||
                requests.some(req => req.outputRef === requestRefId2)
            ) {
                throw new Error(
                    `Request IDs ${requestRefId1} or ${requestRefId2} still found in requests after update`
                );
            }

            await sync(context);
            const facts = await context.facts(tokenId);
            expect(facts).toEqual({
                key1: 'value1',
                key2: 'value2'
            });

            await sync(context);
            await end(context, tokenId);
        });
    }, 60000);
});

export async function withContext(
    port: number,
    maybeDatabaseDir: string | null = null,
    maybeMnemonic: string | null = null,
    f
) {
    await withTempDir(async tmpDirFresh => {
        const databaseDir = maybeDatabaseDir || tmpDirFresh;
        const mnemonic = maybeMnemonic || generateMnemonic();

        const mkWallet = provider =>
            new MeshWallet({
                networkId: 0,
                fetcher: provider,
                submitter: provider,
                key: {
                    type: 'mnemonic',
                    words: mnemonic.split(' ')
                }
            });
        const yaciStorePort = process.env.YACI_STORE_PORT;
        const yaciStorePortNumber = yaciStorePort
            ? parseInt(yaciStorePort, 10)
            : 8080;
        const yaciAdminPort = process.env.YACI_ADMIN_PORT;
        const yaciAdminPortNumber = yaciAdminPort
            ? parseInt(yaciAdminPort, 10)
            : 10000;
        const ctxProvider = yaciProvider(
            `http://localhost:${yaciStorePortNumber}`,
            `http://localhost:${yaciAdminPortNumber}`
        );
        const ogmiosPort = process.env.OGMIOS_PORT;
        const ogmiosPortNumber = ogmiosPort ? parseInt(ogmiosPort, 10) : 1337;

        const ogmios = `http://localhost:${ogmiosPortNumber}`;
        const wallet = mkWallet(ctxProvider.provider);
        await withLevelDB(databaseDir, async db => {
            const tries = await createTrieManager(db);

            const { address, policyId } = getCagingScript();

            const indexer = await Indexer.create(
                tries,
                db,
                address,
                policyId,
                ogmios,
                'test-service' + port.toString()
            );

            new Promise(async () => {
                await indexer.run();
            });

            const context = await newContext(indexer, ctxProvider, wallet);
            if (ctxProvider.topup) {
                const { walletAddress } = await context.wallet();
                const startTime = Date.now();
                const timeout = 30 * 1000; // 30 seconds

                while (Date.now() - startTime < timeout) {
                    try {
                        await ctxProvider.topup(walletAddress, 10_000);
                        break; // Exit loop if topup succeeds
                    } catch (error) {
                        console.error(
                            `Topup failed: ${error.message}. Retrying...`
                        );
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
                    }
                }
                await f(context);
            }
            await indexer.close();
        });
    });
}

export async function sync(context: Context) {
    while (!(await context.indexer.getSync())) {
        console.log('Waiting for indexer to be ready...');
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}
