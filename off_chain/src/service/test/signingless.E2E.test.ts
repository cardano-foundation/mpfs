import { describe } from 'vitest';
import { e2eTest as e2eVitest, Runner } from './E2E/fixtures';
import { bootTokenTx, endTokenTx, getTokens, sync } from '../client';
import { assertThrows } from './E2E/lib';
import { end } from '../../transactions/end';

const canBootAToken = async ({
    runSigningless,
    log,
    wallets: { charlie }
}: Runner) => {
    const test = async (address, signAndSubmitTx) => {
        // calling the mpfs http endpoint to create a token
        const { unsignedTransaction, value: tokenId } = await bootTokenTx(
            charlie,
            address
        );
        // using a local wallet with a freshly created mnemonics
        await signAndSubmitTx(unsignedTransaction);
        // waiting for the transaction to be included in the blockchain using an mpfs http endpoint
        await sync(charlie, 2);
        // fetching the tokens from the mpfs http endpoint
        const { tokens } = await getTokens(log, charlie, 2);
        assertThrows(
            tokens.some(token => token.tokenId === tokenId),
            'Token was not found after creation'
        );
    };
    await runSigningless(test, 'Charlie creates a token');
};

const canEndABootedToken = async ({
    runSigningless,
    log,
    wallets: { charlie }
}: Runner) => {
    const test = async (address, signAndSubmitTx) => {
        const { unsignedTransaction: bootTx, value: tokenId } =
            await bootTokenTx(charlie, address);
        await signAndSubmitTx(bootTx);
        await sync(charlie, 2);

        const { unsignedTransaction } = await endTokenTx(
            charlie,
            address,
            tokenId
        );
        await signAndSubmitTx(unsignedTransaction);
        await sync(charlie, 2);
        const { tokens } = await getTokens(log, charlie, 2);
        assertThrows(
            !tokens.some(token => token.tokenId === tokenId),
            'Token was not deleted after ending'
        );
    };
    await runSigningless(test, 'Charlie ends a booted token');
};

describe('E2E Signingless Tests', () => {
    // e2eVitest('can boot a token', canBootAToken, 60);
    e2eVitest('can end a booted token', canEndABootedToken, 60);
});
