import { Name, withServices } from '../http';
import getPort from 'get-port';
import {
    deserializeAddress,
    generateMnemonic,
    MeshWallet
} from '@meshsdk/core';
import { sync } from '../../signing/client';
import { it } from 'vitest';
import { withTempDir } from '../../../test/lib';
import { validatePort } from '../../../lib';
import { topup, yaciProvider } from '../../../transactions/context/lib';

export type Wallets = {
    charlie: string;
    bob: string;
    alice: string;
};

export type TestCtx = {
    address: string;
    owner: string;
    signTx: (cbor: string) => Promise<string>;
};

export type Runner = {
    run: (
        test: (testCtx: TestCtx) => Promise<void>,
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

                const address = clientWallet.getChangeAddress();
                const owner = deserializeAddress(address).pubKeyHash;
                const signTx = async (cbor: string) => {
                    const signed = await clientWallet.signTx(cbor);
                    await sync(charlie, 2); // wait for the transaction to be included
                    return signed;
                };
                const runner: Runner = {
                    run: async (
                        fn: (test: TestCtx) => Promise<void>,
                        name: string
                    ) => await fn({ address, owner, signTx }),
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
