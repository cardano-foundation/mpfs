import { generateMnemonic, MeshWallet } from '@meshsdk/core';
import { newContext, withContext, yaciProvider } from '../../context';
import { promises as fsPromises } from 'fs';

export async function setup() {
    await fsPromises.rm('tmp', { recursive: true, force: true });
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
    const ctxProvider = yaciProvider(
        'http://localhost:8080',
        'http://localhost:10000'
    );
    const wallet = mkWallet(ctxProvider.provider);
    const context = await newContext(ctxProvider, wallet);
    if (ctxProvider.topup) {
        const { walletAddress } = await context.wallet();
        await ctxProvider.topup(walletAddress, 10_000);
    }
    return context;
}
