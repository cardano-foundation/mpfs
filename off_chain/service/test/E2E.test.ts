import { validatePort } from '../../lib';
import { Name, runServices, Service, stopServices } from '../http';
import getPort from 'get-port';
import { Provider, yaciProvider } from '../../context';
import { generateMnemonic, MeshWallet } from '@meshsdk/core';
import { walletTopup } from './E2E/client';
import {
    canAccessWallets,
    cannotDeleteAnotherUsersToken,
    canRetractRequest,
    createTokenAndDelete as canCreateTokenAndDelete,
    Runner,
    tokensAreEmpty as canRetrieveTokens,
    Wallets,
    cannotRetractAnotherUsersRequest,
    cannotUpdateATokenWithNoRequests,
    canInspectRequestsForAToken,
    canUpdateAToken,
    cannotUpdateAnotherUsersToken,
    canDeleteFacts,
    canBatchUpdate,
    insertCommutes,
    deleteCommutes,
    canUpdateATokenTwice
} from './E2E/scenarios';
import { catchFailure } from './E2E/lib';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { withTempDir } from '../../test/lib';

function newWallet(provider: Provider) {
    const seed = crypto.getRandomValues(new Uint32Array(4)).join('');
    const entropy = Buffer.from(`${seed}`.repeat(32).slice(0, 32), 'utf8');
    const mnemonic = generateMnemonic(256, () => entropy);
    return new MeshWallet({
        networkId: 0,
        fetcher: provider,
        submitter: provider,
        key: {
            type: 'mnemonic',
            words: mnemonic.split(' ')
        }
    });
}

async function setup() {
    const yaciStoreHost = 'http://localhost:8080';

    const yaciAdminHost = 'http://localhost:10000';

    const ogmiosHost = 'http://localhost:1337';

    const provider = yaciProvider(yaciStoreHost, yaciAdminHost);

    let namesToServe: Name[] = [];

    const charliePort = await getPort();
    const charlie = `http://localhost:${charliePort}`;
    namesToServe.push({ name: 'charlie', port: charliePort });
    const bobPort = await getPort();
    const bob = `http://localhost:${bobPort}`;
    namesToServe.push({ name: 'bob', port: bobPort });
    const alicePort = await getPort();
    const alice = `http://localhost:${alicePort}`;
    namesToServe.push({ name: 'alice', port: alicePort });
    const { tmpDir, clean } = withTempDir();
    const servers = await runServices(
        tmpDir,
        tmpDir,
        namesToServe,
        provider,
        newWallet,
        ogmiosHost
    );
    const wallets: Wallets = { charlie, bob, alice };

    await walletTopup(wallets.charlie);
    await walletTopup(wallets.bob);
    await walletTopup(wallets.alice);

    const runner: Runner = {
        run: async (fn: () => Promise<void>, name: string) => {
            await fn();
        },
        log: async (s: string) => {
            // console.log(`  - ${s}`);
        },
        wallets
    };
    return { servers, runner, clean };
}

describe('E2E Tests', () => {
    let servers: Service[];
    let runner: Runner;
    let clean: () => void;
    beforeAll(async () => {
        const setupResult = await setup();
        servers = setupResult.servers;
        runner = setupResult.runner;
        clean = setupResult.clean;
    });
    afterAll(async () => {
        await stopServices(servers);
        clean();
    }, 60_000);
    it('can access wallets', async () => {
        await canAccessWallets(runner);
    }, 60_000);
    it('can retrieve tokens', async () => {
        await canRetrieveTokens(runner);
    }, 60_000);
    it('can create and delete a token', async () => {
        await canCreateTokenAndDelete(runner);
    }, 60_000);
    it("cannot delete another user's token", async () => {
        await cannotDeleteAnotherUsersToken(runner);
    }, 60_000);
    it('can retract a request', async () => {
        await canRetractRequest(runner);
    }, 60_000);
    it("cannot retract another user's request", async () => {
        await cannotRetractAnotherUsersRequest(runner);
    }, 60_000);
    it('cannot update a token with no requests', async () => {
        await cannotUpdateATokenWithNoRequests(runner);
    }, 60_000);
    it('can inspect requests for a token', async () => {
        await canInspectRequestsForAToken(runner);
    }, 60_000);
    it('can update a token', async () => {
        await canUpdateAToken(runner);
    }, 60_000);
    it("cannot update another user's token", async () => {
        await cannotUpdateAnotherUsersToken(runner);
    }, 60_000);
    it('can update a token twice', async () => {
        await canUpdateATokenTwice(runner);
    }, 90_000);
    it('can delete facts', async () => {
        await canDeleteFacts(runner);
    }, 60_000);
    it('can batch update', async () => {
        await canBatchUpdate(runner);
    }, 90_000);
    it('can insert commutes', async () => {
        await insertCommutes(runner);
    }, 120_000);
    it('can delete commutes', async () => {
        await deleteCommutes(runner);
    }, 120_000);
});
