import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { boot } from './boot';
import { end } from './end';
import { request } from './request';
import { mkOutputRefId } from '../history/store';
import { update } from './update';
import { retract } from './retract';

describe('Using transactions you', () => {
    let context: Context;
    let close: () => Promise<void>;
    beforeAll(async () => {
        const setupResult = await setup(3000);
        context = setupResult.context;
        close = setupResult.close;
    });

    afterAll(async () => {
        await close();
    });

    it('can create and delete a token successfully', async () => {
        await sync(context);
        const tokenId = await boot(context);
        await sync(context);
        const tokenBooted = await context.fetchToken(tokenId);
        expect(tokenBooted).toBeDefined();

        await end(context, tokenId);

        await sync(context);
        const tokenDeleted = await context.fetchToken(tokenId);
        expect(tokenDeleted).toBeUndefined();
    }, 60000);

    it('can create a request successfully', async () => {
        await sync(context);
        const tokenId = await boot(context);

        await sync(context);
        const tokenBooted = await context.fetchToken(tokenId);
        const ref = await request(context, tokenId, 'key', 'value', 'insert');
        const refId = mkOutputRefId(ref);

        await sync(context);
        const requests = await context.fetchRequests(tokenId);
        if (!requests.some(req => req.outputRef === refId)) {
            throw new Error(`Request ID ${refId} not found in requests`);
        }

        await sync(context);
        await end(context, tokenId);
    }, 60000);

    it('can retract a request successfully', async () => {
        await sync(context);
        const tokenId = await boot(context);

        await sync(context);
        const req = await request(context, tokenId, 'key', 'value', 'insert');
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
    }, 60000);
    it('can update a token successfully', async () => {
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
        if (!facts['key']) {
            throw new Error(`Fact 'key' not found in facts after update`);
        }

        const value = facts['key'];
        if (value !== 'value') {
            throw new Error(
                `Fact 'key' has unexpected value: ${value}. Expected 'value'.`
            );
        }

        await sync(context);
        await end(context, tokenId);
    }, 60000);
});

import { generateMnemonic, MeshWallet } from '@meshsdk/core';
import { Context, getCagingScript, newContext, yaciProvider } from '../context';
import { promises as fsPromises } from 'fs';
import { Indexer } from '../history/indexer';
import { TrieManager } from '../trie';
import { withTempDir } from '../test/lib';

export async function setup(port: number) {
    // Ensure the tmp directory is clean before starting
    const { tmpDir, clean } = withTempDir();
    await fsPromises.rm(tmpDir, { recursive: true, force: true });
    const mnemonic = generateMnemonic();

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
    const tries = await TrieManager.create(tmpDir);

    const { address, policyId } = getCagingScript();

    const indexer = Indexer.create(
        tries,
        tmpDir,
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
                console.error(`Topup failed: ${error.message}. Retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retrying
            }
        }
    }
    const cleanAll = async () => {
        await indexer.closeConnection();
        await clean();
    };

    return { context, close: cleanAll };
}
export async function sync(context) {
    while (!(await context.indexer.getSync())) {
        console.log('Waiting for indexer to be ready...');
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}
