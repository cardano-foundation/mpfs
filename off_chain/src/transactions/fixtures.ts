import { generateMnemonic, MeshWallet } from '@meshsdk/core';
import { Context, mkContext } from './context';
import { createIndexer } from '../indexer/indexer';
import { withTempDir, withLevelDB } from '../test/lib';
import { createTrieManager } from '../trie';
import { createState } from '../indexer/state';
import { createProcess } from '../indexer/process';
import { sleep } from '../lib';
import { getCagingScript, topup, yaciProvider } from './context/lib';

export const mkWallet = (mnemonic: string) => (provider: any) =>
    new MeshWallet({
        networkId: 0,
        fetcher: provider,
        submitter: provider,
        key: {
            type: 'mnemonic',
            words: mnemonic.split(' ')
        }
    });

export async function withContext(
    maybeDatabaseDir: string | null = null,
    maybeMnemonic: string | null = null,
    f
) {
    await withTempDir(async tmpDirFresh => {
        const databaseDir = maybeDatabaseDir || tmpDirFresh;
        const mnemonics = maybeMnemonic || generateMnemonic();

        const yaciStorePort = process.env.YACI_STORE_PORT;
        const yaciStorePortNumber = yaciStorePort
            ? parseInt(yaciStorePort, 10)
            : 8080;
        const yaciAdminPort = process.env.YACI_ADMIN_PORT;
        const yaciAdminPortNumber = yaciAdminPort
            ? parseInt(yaciAdminPort, 10)
            : 10000;
        const provider = yaciProvider(
            `http://localhost:${yaciStorePortNumber}`,
            `http://localhost:${yaciAdminPortNumber}`
        );
        const ogmiosPort = process.env.OGMIOS_PORT;
        const ogmiosPortNumber = ogmiosPort ? parseInt(ogmiosPort, 10) : 1337;

        const ogmios = `http://localhost:${ogmiosPortNumber}`;
        await withLevelDB(databaseDir, async db => {
            const tries = await createTrieManager(db);
            const state = await createState(db, tries, 2160);
            const { address, policyId } = getCagingScript();
            const process = createProcess(tries, state, address, policyId);

            const indexer = await createIndexer(state, process, ogmios);
            try {
                const context = mkContext(
                    ogmios,
                    provider,
                    mnemonics,
                    indexer,
                    state,
                    tries
                );
                const { walletAddress } = await context.signingWallet!.info();
                await topup(provider)(walletAddress, 10_000);
                await f(context);
            } finally {
                await indexer.close();
                await sleep(1);
                await state.close();
                await tries.close();
            }
        });
    });
}

export async function sync(context: Context) {
    await context.waitBlocks(2);
}
