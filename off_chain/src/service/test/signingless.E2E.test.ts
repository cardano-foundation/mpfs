import { describe } from 'vitest';
import { e2eTest as e2eVitest, Runner } from './E2E/fixtures';
import {
    bootTokenTx,
    endTokenTx,
    getTokens,
    createRequestTx,
    getToken
} from '../client';
import { assertThrows } from './E2E/lib';
import { mkOutputRefId } from '../../outputRef';
import { assert } from 'console';

const canBootAToken = async ({
    runSigningless,
    log,
    wallets: { charlie }
}: Runner) => {
    const test = async (address, _owner, signAndSubmitTx) => {
        // calling the mpfs http endpoint to create a token
        const { unsignedTransaction, value: tokenId } = await bootTokenTx(
            charlie,
            address
        );
        // using a local wallet with a freshly created mnemonics
        await signAndSubmitTx(unsignedTransaction);
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
    const test = async (address, _owner, signAndSubmitTx) => {
        const { unsignedTransaction: bootTx, value: tokenId } =
            await bootTokenTx(charlie, address);
        await signAndSubmitTx(bootTx);

        const { unsignedTransaction } = await endTokenTx(
            charlie,
            address,
            tokenId
        );
        await signAndSubmitTx(unsignedTransaction);
        const { tokens } = await getTokens(log, charlie, 2);
        assertThrows(
            !tokens.some(token => token.tokenId === tokenId),
            'Token was not deleted after ending'
        );
    };
    await runSigningless(test, 'Charlie ends a booted token');
};

const canRequestAChangeToAtToken = async ({
    runSigningless,
    log,
    wallets: { charlie }
}: Runner) => {
    const test = async (address, owner, signAndSubmitTx) => {
        const { unsignedTransaction: bootTx, value: tokenId } =
            await bootTokenTx(charlie, address);
        await signAndSubmitTx(bootTx);
        const { unsignedTransaction: requestTx } = await createRequestTx(
            charlie,
            address,
            tokenId,
            'key1',
            'value1',
            'insert'
        );
        const outputRef = await signAndSubmitTx(requestTx);
        const { requests } = await getToken(log, charlie, tokenId, 2);
        assertThrows(
            requests.length === 1,
            'Request was not created or multiple requests found'
        );
        assertThrows(
            requests[0].outputRef === mkOutputRefId(outputRef),
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
    await runSigningless(test, 'Charlie requests a change to a token');
};

describe('E2E Signingless Tests', () => {
    e2eVitest('can boot a token', canBootAToken, 60);
    e2eVitest('can end a booted token', canEndABootedToken, 60);
    e2eVitest(
        'can request a change to a token',
        canRequestAChangeToAtToken,
        60
    );
});
