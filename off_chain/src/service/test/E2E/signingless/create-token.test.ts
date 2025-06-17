import { describe } from 'vitest';
import { e2eTest as e2eVitest, Runner } from '../fixtures';
import { createTokenTx, getTokens, sync } from '../../../client';
import { assertThrows } from '../lib';

describe('E2E Signingless Tests', () => {
    const canCreateToken = async ({
        runSigningless,
        log,
        wallets: { charlie }
    }: Runner) => {
        const test = async (address, signAndSubmitTx) => {
            // calling the mpfs http endpoint to create a token
            const { unsignedTransaction, value: tokenId } = await createTokenTx(
                charlie,
                address
            );
            // using a local wallet with a freshly created mnemonics
            const txHash = await signAndSubmitTx(unsignedTransaction);
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
    e2eVitest('can create token', canCreateToken, 60);
});
