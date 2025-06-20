import {
    applyParamsToScript,
    BlockfrostProvider,
    MeshTxBuilder,
    MeshWallet,
    resolveScriptHash,
    serializePlutusScript,
    YaciProvider
} from '@meshsdk/core';
import { deserializeAddress } from '@meshsdk/core';
import blueprint from '../../plutus.json';
import { retry } from '../../test/lib';
import { WalletInfo } from './wallet';
import { Context } from '../context';

export function getTxBuilder(provider: Provider) {
    return new MeshTxBuilder({
        fetcher: provider,
        submitter: provider
    });
}

export async function getWalletInfoForTx(
    wallet: MeshWallet
): Promise<WalletInfo> {
    const utxos = await wallet.getUtxos();
    const collateral = (await wallet.getCollateral())[0];
    const walletAddress = wallet.getChangeAddress();

    if (!walletAddress) {
        throw new Error('No wallet address found');
    }
    const firstUTxO = utxos[0];
    const signerHash = deserializeAddress(walletAddress).pubKeyHash;
    const walletInfo = {
        utxos,
        firstUTxO,
        collateral,
        walletAddress,
        signerHash
    };
    return walletInfo;
}

export async function onTxConfirmedPromise(
    provider,
    txHash,
    limit = 100
): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        let attempts = 0;
        const checkTx = setInterval(async () => {
            if (attempts >= limit) {
                clearInterval(checkTx);
                reject(new Error('Transaction confirmation timed out'));
            }
            provider
                .fetchTxInfo(txHash)
                .then(txInfo => {
                    if (txInfo.block === undefined) {
                        clearInterval(checkTx);
                        resolve('No block info available');
                    } else {
                        provider
                            .fetchBlockInfo(txInfo.block)
                            .then(blockInfo => {
                                if (blockInfo?.confirmations > 0) {
                                    clearInterval(checkTx);
                                    resolve(blockInfo.hash); // Resolve the promise when confirmed
                                }
                            })
                            .catch(error => {
                                attempts += 1;
                            });
                    }
                })
                .catch(error => {
                    attempts += 1;
                });
        }, 5000);
    });
}

export type CagingScript = {
    cbor: string;
    address: string;
    scriptHash: string;
    policyId: string;
};

export function getCagingScript(): CagingScript {
    const cbor = applyParamsToScript(
        blueprint.validators[0].compiledCode, // crap
        []
    );
    const address = serializePlutusScript({
        code: cbor,
        version: 'V3'
    }).address;
    const { scriptHash } = deserializeAddress(address);
    const policyId = resolveScriptHash(cbor, 'V3');
    const caging = {
        cbor,
        address,
        scriptHash,
        policyId
    };
    return caging;
}

export type Provider = BlockfrostProvider | YaciProvider;

export const yaciProvider = (
    storeHost: string,
    adminHost?: string
): Provider => {
    return new YaciProvider(
        `${storeHost}/api/v1/`,
        adminHost ? `${adminHost}` : undefined
    );
};

export const blockfrostProvider = (projectId: string): Provider => {
    return new BlockfrostProvider(projectId);
};

export const hasTopup = (provider: Provider): provider is YaciProvider => {
    return provider instanceof YaciProvider;
};

export type TopUp = (address: string, amount: number) => Promise<void>;
export const topup =
    (provider: Provider) => async (address: string, amount: number) => {
        if (hasTopup(provider)) {
            await retry(
                30,
                () => Math.random() * 6000 + 4000,
                async () => {
                    await provider.addressTopup(address, amount.toString());
                }
            );
        }
    };

export type WithUnsignedTransaction<T> = {
    unsignedTransaction: string;
    value: T;
};

export type WithTxHash<T> = {
    txHash: string;
    value: T;
};

export async function signAndSubmit<T>(
    context: Context,
    f: (walletAddress: string) => PromiseLike<WithUnsignedTransaction<T>>
): Promise<WithTxHash<T>> {
    const signingWallet = context.signingWallet;
    if (!signingWallet) {
        throw new Error('No signing wallet found');
    }
    const { info, signTx } = signingWallet;
    const { walletAddress } = await info();

    const { unsignedTransaction, value } = await f(walletAddress);

    const signedTx = await signTx(unsignedTransaction);
    const txHash = await context.submitTx(signedTx);
    return { txHash, value };
}
