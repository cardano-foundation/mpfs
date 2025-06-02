import { generateMnemonic, MeshWallet } from '@meshsdk/core';
import { getCagingScript, newContext, yaciProvider } from '../../context';
import { promises as fsPromises } from 'fs';
import { Indexer } from '../../history/indexer';
import { TrieManager } from '../../trie';

export async function setup(port: number) {
    // Ensure the tmp directory is clean before starting
    const tmpDir = `tmp/${port}`;
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
        await ctxProvider.topup(walletAddress, 10_000);
    }
    return { context, close: async () => indexer.closeConnection() };
}
export async function sync(context) {
    while (!(await context.indexerStatus())) {
        console.log('Waiting for indexer to be ready...');
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}
