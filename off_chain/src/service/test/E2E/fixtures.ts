import { Name, withServices } from '../../http';
import getPort from 'get-port';
import { generateMnemonic, MeshWallet } from '@meshsdk/core';
import { walletTopup } from '../../client';
import { it } from 'vitest';
import { retry, withTempDir } from '../../../test/lib';
import { validatePort } from '../../../lib';
import {
    Provider,
    topup,
    yaciProvider
} from '../../../transactions/context/lib';

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

export type Wallets = {
    charlie: string;
    bob: string;
    alice: string;
};

export type Runner = {
    run: (test: () => Promise<void>, name: string) => Promise<void>;
    runSigningless: (
        test: (
            address: string,
            signAndSubmitTx: (cbor: string) => Promise<string>
        ) => Promise<void>,
        name: string
    ) => Promise<void>;
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
            const portNumber = await getPort();
            namesToServe.push({ name, port: portNumber });
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
            newWallet,
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

                const mnemonics = generateMnemonic();
                const clientWallet = new MeshWallet({
                    networkId: 0,
                    fetcher: provider,
                    submitter: provider,
                    key: {
                        type: 'mnemonic',
                        words: mnemonics.split(' ')
                    }
                });
                await topup(provider)(clientWallet.getChangeAddress(), 10_000);

                const walletAddress = clientWallet.getChangeAddress();
                const runner: Runner = {
                    run: async (fn: () => Promise<void>, name: string) => {
                        await fn();
                    },
                    runSigningless: async (
                        fn: (
                            address: string,
                            signAndSubmitTx: (cbor: string) => Promise<string>
                        ) => Promise<void>,
                        name: string
                    ) =>
                        await fn(walletAddress, async (cbor: string) => {
                            const signed = await clientWallet.signTx(cbor);
                            return await clientWallet.submitTx(signed);
                        }),

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
    it(name, { concurrent: true, timeout: secs * 1000, retry: 0 }, async () => {
        await withRunner(f);
    });
}
