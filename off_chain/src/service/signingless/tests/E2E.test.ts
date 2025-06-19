import { describe } from 'vitest';
import { e2eTest as e2eVitest, Runner } from './fixtures';
import {
    bootTokenTx,
    endTokenTx,
    getTokens,
    createRequestTx,
    getToken,
    submitTx
} from '../client';
import { assertThrows } from '../../test/E2E/lib';
import { mkOutputRefId } from '../../../outputRef';

const canBootAToken = async ({ run, log, wallets: { charlie } }: Runner) => {
    const test = async ({ address, signTx }) => {
        // calling the mpfs http endpoint to create a token
        const { unsignedTransaction, value: tokenId } = await bootTokenTx(
            charlie,
            address
        );
        // using a local wallet with a freshly created mnemonics
        const signedTransaction = await signTx(unsignedTransaction);

        // submitting the transaction to the mpfs http endpoint
        await submitTx(charlie, signedTransaction);
        // fetching the tokens from the mpfs http endpoint

        // checking if the token was created by the mpfs http endpoint
        const { tokens } = await getTokens(log, charlie, 2);
        assertThrows(
            tokens.some(token => token.tokenId === tokenId),
            'Token was not found after creation'
        );
    };
    await run(test, 'Charlie creates a token');
};

const canEndABootedToken = async ({
    run,
    log,
    wallets: { charlie }
}: Runner) => {
    const test = async ({ address, signTx }) => {
        const { unsignedTransaction: bootTx, value: tokenId } =
            await bootTokenTx(charlie, address);
        const signedBootTx = await signTx(bootTx);
        await submitTx(charlie, signedBootTx);
        const { unsignedTransaction } = await endTokenTx(
            charlie,
            address,
            tokenId
        );
        const signedTransaction = await signTx(unsignedTransaction);
        await submitTx(charlie, signedTransaction);
        const { tokens } = await getTokens(log, charlie, 2);
        assertThrows(
            !tokens.some(token => token.tokenId === tokenId),
            'Token was not deleted after ending'
        );
    };
    await run(test, 'Charlie ends a booted token');
};

const canRequestAChangeToAtToken = async ({
    run,
    log,
    wallets: { charlie }
}: Runner) => {
    const test = async ({ address, owner, signTx }) => {
        const { unsignedTransaction: bootTx, value: tokenId } =
            await bootTokenTx(charlie, address);
        const signedBootTx = await signTx(bootTx);
        await submitTx(charlie, signedBootTx);
        const { unsignedTransaction: requestTx } = await createRequestTx(
            charlie,
            address,
            tokenId,
            'key1',
            'value1',
            'insert'
        );
        const signedTransaction = await signTx(requestTx);
        const { txHash } = await submitTx(charlie, signedTransaction);
        const { requests } = await getToken(log, charlie, tokenId, 2);
        assertThrows(
            requests.length === 1,
            'Request was not created or multiple requests found'
        );
        assertThrows(
            requests[0].outputRef === mkOutputRefId({ txHash, outputIndex: 0 }),
            'Request was not found after creation'
        );
        assertThrows(
            requests[0].change.key === 'key1' &&
                requests[0].change.value === 'value1' &&
                requests[0].change.operation === 'insert',
            'Request change data does not match expected values'
        );
        assertThrows(
            requests[0].owner === owner,
            'Request owner does not match expected owner'
        );
    };
    await run(test, 'Charlie requests a change to a token');
};

describe('E2E Signingless', () => {
    e2eVitest('can boot a token', canBootAToken, 60);
    e2eVitest('can end a booted token', canEndABootedToken, 60);
    e2eVitest(
        'can request a change to a token',
        canRequestAChangeToAtToken,
        60
    );
});
