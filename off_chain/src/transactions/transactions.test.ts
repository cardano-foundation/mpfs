import { withContext, mkWallet, sync } from './fixtures';
import { generateMnemonic } from '@meshsdk/core';
import { describe, expect, it } from 'vitest';
import { boot } from './boot';
import { end } from './end';
import { request } from './request';
import { update } from './update';
import { retract } from './retract';
import { Context } from './context';
import { withTempDir } from '../test/lib';
import { mkOutputRefId } from '../outputRef';
import { firstOutputRef, sleep } from '../lib';

const txTest = (name: string, testFn: () => Promise<void>, timeout = 10000) =>
    it(name, { concurrent: true, timeout }, testFn);

describe('Submitting transactions we', () => {
    txTest(
        'can create and delete a token 1',
        async () => {
            await withTempDir(async () => {
                await withContext(null, null, async (context: Context) => {
                    await sync(context);

                    const { value: tokenId } = await boot(context);
                    await sync(context);
                    const tokenBooted = await context.fetchToken(tokenId);
                    expect(tokenBooted).toBeDefined();

                    await end(context, tokenId);

                    await sync(context);
                    const tokenDeleted = await context.fetchToken(tokenId);
                    expect(tokenDeleted).toBeUndefined();
                });
            });
        },
        30000
    );

    txTest(
        'can create a request',
        async () => {
            await withContext(null, null, async (context: Context) => {
                await sync(context);
                const { value: tokenId } = await boot(context);

                await sync(context);
                const { txHash } = await request(context, tokenId, {
                    type: 'insert',
                    key: 'key1',
                    newValue: 'value1'
                });
                const refId = mkOutputRefId(firstOutputRef(txHash));

                await sync(context);
                const requests = await context.fetchRequests(tokenId);
                if (!requests.some(req => req.outputRefId === refId)) {
                    throw new Error(
                        `Request ID ${refId} not found in requests`
                    );
                }

                await sync(context);
                await end(context, tokenId);
            });
        },
        60000
    );

    txTest(
        'can retract a request',
        async () => {
            await withContext(null, null, async (context: Context) => {
                await sync(context);
                const { value: tokenId } = await boot(context);

                await sync(context);
                const { txHash } = await request(context, tokenId, {
                    type: 'insert',
                    key: 'key',
                    newValue: 'value'
                });
                const req = firstOutputRef(txHash);
                const reqId = mkOutputRefId(req);

                await sync(context);
                await retract(context, req);

                await sync(context);
                const reqs = await context.fetchRequests(tokenId);
                if (reqs.some(req => req.outputRefId === reqId)) {
                    throw new Error(
                        `Request ID ${reqId} still found in requests after retraction`
                    );
                }
                await sync(context);
                await end(context, tokenId);
            });
        },
        60000
    );
    txTest(
        'can update a token 1',
        async () => {
            await withContext(null, null, async (context: Context) => {
                await sync(context);
                const { value: tokenId } = await boot(context);

                await sync(context);
                const { txHash } = await request(context, tokenId, {
                    type: 'insert',
                    key: 'key',
                    newValue: 'value'
                });
                const requestRef = firstOutputRef(txHash);
                const requestRefId = mkOutputRefId(requestRef);

                await sync(context);
                await update(context, tokenId, [requestRef]);

                await sync(context);
                const requests = await context.fetchRequests(tokenId);
                if (requests.some(req => req.outputRefId === requestRefId)) {
                    throw new Error(
                        `Request ID ${requestRefId} still found in requests after update`
                    );
                }

                await sync(context);
                const facts = await context.facts(tokenId);
                const { value: fact, slot } = facts['key'];
                expect(fact).toEqual('value');
                expect(slot).toBeGreaterThan(0);

                await sync(context);
                await end(context, tokenId);
            });
        },
        60000
    );
    txTest(
        'can update a token twice 1',
        async () => {
            await withContext(null, null, async (context: Context) => {
                await sync(context);
                const { value: tokenId } = await boot(context);

                await sync(context);
                const { txHash: requestTxHash1 } = await request(
                    context,
                    tokenId,
                    { type: 'insert', key: 'key1', newValue: 'value1' }
                );
                const requestRef1 = firstOutputRef(requestTxHash1);

                await sync(context);
                await update(context, tokenId, [requestRef1]);

                await sync(context);
                const { txHash: requestTxHash2 } = await request(
                    context,
                    tokenId,
                    { type: 'insert', key: 'key2', newValue: 'value2' }
                );
                const requestRef2 = firstOutputRef(requestTxHash2);

                await sync(context);
                await update(context, tokenId, [requestRef2]);

                await sync(context);
                const facts = await context.facts(tokenId);
                const { value: fact1, slot: slot1 } = facts['key1'];
                const { value: fact2, slot: slot2 } = facts['key2'];
                expect(fact1).toEqual('value1');
                expect(fact2).toEqual('value2');
                expect(slot1).toBeLessThan(slot2);

                await sync(context);
                await end(context, tokenId);
            });
        },
        60000
    );
    txTest(
        'cannot update a token in the same way twice',
        async () => {
            await withContext(null, null, async (context: Context) => {
                await sync(context);
                const { value: tokenId } = await boot(context);

                await sync(context);
                const { txHash: requestTxHash1 } = await request(
                    context,
                    tokenId,
                    { type: 'insert', key: 'key1', newValue: 'value1' }
                );
                const requestRef1 = firstOutputRef(requestTxHash1);

                await sync(context);
                await update(context, tokenId, [requestRef1]);

                await sync(context);
                const { txHash: requestTxHash2 } = await request(
                    context,
                    tokenId,
                    { type: 'insert', key: 'key1', newValue: 'value1' }
                );
                const requestRef2 = firstOutputRef(requestTxHash2);

                await sync(context);
                try {
                    await update(context, tokenId, [requestRef2]);
                } catch (_) {
                    await sync(context);
                    const facts = await context.facts(tokenId);
                    const { value: fact1, slot: slot1 } = facts['key1'];
                    expect(fact1).toEqual('value1');
                    expect(slot1).toBeGreaterThan(0);

                    await sync(context);
                    await end(context, tokenId);
                    return;
                }
                throw new Error(
                    'Expected an error when updating with the same request twice'
                );
            });
        },
        60000
    );
    txTest(
        'can update the token with a batch 1',
        async () => {
            await withContext(null, null, async (context: Context) => {
                await sync(context);
                const { value: tokenId } = await boot(context);

                await sync(context);
                const { txHash: requestTxHash1 } = await request(
                    context,
                    tokenId,
                    { type: 'insert', key: 'key1', newValue: 'value1' }
                );
                const requestRef1 = firstOutputRef(requestTxHash1);
                const requestRefId1 = mkOutputRefId(requestRef1);

                await sync(context);
                const { txHash: requestTxHash2 } = await request(
                    context,
                    tokenId,
                    { type: 'insert', key: 'key2', newValue: 'value2' }
                );
                const requestRef2 = firstOutputRef(requestTxHash2);
                const requestRefId2 = mkOutputRefId(requestRef2);

                await sync(context);
                await update(context, tokenId, [requestRef1, requestRef2]);

                await sync(context);
                const requests = await context.fetchRequests(tokenId);
                if (
                    requests.some(req => req.outputRefId === requestRefId1) ||
                    requests.some(req => req.outputRefId === requestRefId2)
                ) {
                    throw new Error(
                        `Request IDs ${requestRefId1} or ${requestRefId2} still found in requests after update`
                    );
                }

                await sync(context);
                const facts = await context.facts(tokenId);
                const { value: fact1, slot: slot1 } = facts['key1'];
                const { value: fact2, slot: slot2 } = facts['key2'];
                expect(fact1).toEqual('value1');
                expect(fact2).toEqual('value2');
                expect(slot1).toEqual(slot2);
                await sync(context);
                await end(context, tokenId);
            });
        },
        60000
    );
});

describe('Restarting the service', () => {
    txTest(
        'should not throw an error',
        async () => {
            const mnemonics = generateMnemonic();
            await withTempDir(async tmpDir => {
                await withContext(
                    tmpDir,
                    mnemonics,
                    async (context1: Context) => {
                        await sync(context1);
                        const { value: tokenId } = await boot(context1);
                        expect(tokenId).toBeDefined();
                        await sync(context1);
                        const { txHash } = await request(context1, tokenId, {
                            type: 'insert',
                            key: 'key1',
                            newValue: 'value1'
                        });
                        const rq1 = firstOutputRef(txHash);
                        await sync(context1);
                        await update(context1, tokenId, [rq1]);
                        await sync(context1);
                        await end(context1, tokenId);
                    }
                );
                await sleep(5);

                await withContext(
                    tmpDir,
                    mnemonics,
                    async (context2: Context) => {
                        await sync(context2);
                        const { value: tokenId } = await boot(context2);
                        expect(tokenId).toBeDefined();
                        await sync(context2);
                        await end(context2, tokenId);
                    }
                );
            });
        },
        60_000
    );
});
