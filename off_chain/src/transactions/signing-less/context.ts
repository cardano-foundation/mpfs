import { MeshTxBuilder, MeshWallet, YaciProvider } from '@meshsdk/core';
import { CagingScript, getCagingScript, Provider } from '../../context';

export type SigninglessContext = {
    cagingScript: CagingScript;
    mkWallet: (walletAddress: string) => MeshWallet;
    txBuilder: () => MeshTxBuilder;
};

export const mkSigninglessContext = (
    provider: Provider
): SigninglessContext => {
    const cagingScript = getCagingScript();
    const mkWallet = (walletAddress: string) =>
        new MeshWallet({
            networkId: 0,
            fetcher: provider,
            submitter: provider,
            key: {
                type: 'address',
                address: walletAddress
            }
        });
    return {
        cagingScript,
        mkWallet,
        txBuilder: () =>
            new MeshTxBuilder({
                fetcher: provider
            })
    };
};
