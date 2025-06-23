import { Name, withServices } from '../http';
import getPort from 'get-port';
import { generateMnemonic } from '@meshsdk/core';
import { walletTopup } from '../client';
import { it } from 'vitest';
import { retry, withTempDir } from '../../../test/lib';
import { sleep, validatePort } from '../../../lib';
import { Provider, yaciProvider } from '../../../transactions/context/lib';

export type Wallets = {
    charlie: string;
    bob: string;
    alice: string;
};

export type Runner = {
    run: (test: () => Promise<void>, name: string) => Promise<void>;

    log: (message: string) => void;
    wallets: Wallets;
};

export async function withRunner(test) {
    const yaciStorePort = process.env.YACI_STORE_PORT || '8080';
    const yaciStorePortNumber = validatePort(yaciStorePort, 'YACI_STORE_PORT');
    const yaciStoreHost = `http://localhost:${yaciStorePortNumber}`;

    const yaciAdminPort = process.env.YACI_ADMIN_PORT || '10000';
    const yaciAdminPortNumber = validatePort(yaciAdminPort, 'YACI_ADMIN_PORT');
    const yaciAdminHost = `http://localhost:${yaciAdminPortNumber}`;

    const provider = yaciProvider(yaciStoreHost, yaciAdminHost);

    const ogmiosPort = process.env.OGMIOS_HOST || '1337';
    const ogmiosPortNumber = validatePort(ogmiosPort, 'OGMIOS_PORT');
    const ogmiosHost = `http://localhost:${ogmiosPortNumber}`;

    let namesToServe: Name[] = [];

    const setupService = async (envvar: string, name: string) => {
        const port = process.env[envvar];
        if (!port) {
            const mnemonics = generateMnemonic();
            const portNumber = await getPort();
            namesToServe.push({ name, port: portNumber, mnemonics });
            return `http://localhost:${portNumber}`;
        } else {
            const portNumber = validatePort(port, envvar);
            return `http://localhost:${portNumber}`;
        }
    };

    const charlie = await setupService('CHARLIE_PORT', 'charlie');
    const bob = await setupService('BOB_PORT', 'bob');
    const alice = await setupService('ALICE_PORT', 'alice');
    await withTempDir(async tmpDir => {
        await withServices(
            tmpDir,
            tmpDir,
            namesToServe,
            provider,
            ogmiosHost,
            null,
            async () => {
                const wallets: Wallets = { charlie, bob, alice };

                const retryRemoteTopup = async (wallet: string) =>
                    await retry(
                        30,
                        () => Math.random() * 6000 + 4000,
                        async () => await walletTopup(wallet)
                    );

                await retryRemoteTopup(wallets.charlie);
                await retryRemoteTopup(wallets.bob);
                await retryRemoteTopup(wallets.alice);
                await sleep(3);
                const runner: Runner = {
                    run: async (fn: () => Promise<void>, name: string) => {
                        await fn();
                    },

                    log: async (s: string) => {
                        // console.log(`  - ${s}`);
                    },
                    wallets
                };
                await test(runner);
            }
        );
    });
}

export async function e2eTest(
    name: string,
    f: (runner: Runner) => Promise<void>,
    secs = 120
) {
    it(name, { concurrent: true, timeout: secs * 1000, retry: 3 }, async () => {
        await withRunner(f);
    });
}
