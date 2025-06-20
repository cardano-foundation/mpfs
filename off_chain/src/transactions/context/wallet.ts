import { MeshWallet, UTxO } from '@meshsdk/core';
import { getWalletInfoForTx } from './lib';
import fs from 'fs';

export type WalletInfo = {
    utxos: UTxO[];
    firstUTxO: UTxO;
    collateral: UTxO;
    walletAddress: string;
    signerHash: string;
};

export type SigningWallet = {
    info: () => Promise<WalletInfo>;
    signTx: (tx: string) => Promise<string>;
};

export const mkSigningWallet = (mnemonic, provider) => {
    const wallet = new MeshWallet({
        networkId: 0,
        fetcher: provider,
        submitter: provider,
        key: {
            type: 'mnemonic',
            words: mnemonic.split(' ')
        }
    });

    return {
        info: async () => await getWalletInfoForTx(wallet),
        signTx: async tx => await wallet.signTx(tx)
    };
};
export const mkObservingWallet = provider => async (walletAddress: string) => {
    const wallet = new MeshWallet({
        networkId: 0,
        fetcher: provider,
        key: {
            type: 'address',
            address: walletAddress
        }
    });
    return await getWalletInfoForTx(wallet);
};
