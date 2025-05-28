import { generateMnemonic, MeshWallet } from '@meshsdk/core';
import { newContext, yaciProvider } from '../../context';
import { promises as fsPromises } from 'fs';

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
    const ctxProvider = yaciProvider(
        'http://localhost:8080',
        'http://localhost:10000'
    );
    const wallet = mkWallet(ctxProvider.provider);
    const context = await newContext(tmpDir, ctxProvider, wallet);
    if (ctxProvider.topup) {
        const { walletAddress } = await context.wallet();
        await ctxProvider.topup(walletAddress, 10_000);
    }
    return context;
}
