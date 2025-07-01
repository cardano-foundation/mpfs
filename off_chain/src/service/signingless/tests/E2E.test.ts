import { describe } from 'vitest';
import { e2eTest as e2eVitest, Runner } from './fixtures';
import {
    bootTokenTx,
    endTokenTx,
    getTokens,
    requestChangeTx,
    getToken,
    submitTx,
    updateTokenTx,
    getTokenFacts,
    retractChangeTx
} from '../client';
import { assertThrows } from '../../test/E2E/lib';
import { mkOutputRefId } from '../../../outputRef';
import { firstOutputRef } from '../../../lib';

const canBootAToken = async ({ run, log, mpfs }: Runner) => {
    const test = async ({ oracle }) => {
        // calling the mpfs http endpoint to create a token
        const { unsignedTransaction, value: tokenId } = await bootTokenTx(
            mpfs,
            oracle.address
        );
        // using a local wallet with a freshly created mnemonics
        const signedTransaction = await oracle.signTx(unsignedTransaction);

        // submitting the transaction to the mpfs http endpoint
        await submitTx(mpfs, signedTransaction);
        // fetching the tokens from the mpfs http endpoint

        // checking if the token was created by the mpfs http endpoint
        const { tokens } = await getTokens(log, mpfs, 2);
        assertThrows(
            tokens.some(token => token.tokenId === tokenId),
            'Token was not found after creation'
        );
    };
    await run(test, 'mpfs creates a token');
};

const canEndABootedToken = async ({ run, log, mpfs }: Runner) => {
    const test = async ({ oracle }) => {
        const { unsignedTransaction: bootTx, value: tokenId } =
            await bootTokenTx(mpfs, oracle.address);
        const signedBootTx = await oracle.signTx(bootTx);
        await submitTx(mpfs, signedBootTx);
        const { unsignedTransaction } = await endTokenTx(
            mpfs,
            oracle.address,
            tokenId
        );
        const signedTransaction = await oracle.signTx(unsignedTransaction);
        await submitTx(mpfs, signedTransaction);
        const { tokens } = await getTokens(log, mpfs, 2);
        assertThrows(
            !tokens.some(token => token.tokenId === tokenId),
            'Token was not deleted after ending'
        );
    };
    await run(test, 'mpfs ends a booted token');
};

const canRequestAChangeToAtToken = async ({ run, log, mpfs }: Runner) => {
    const test = async ({ oracle, user }) => {
        const { unsignedTransaction: bootTx, value: tokenId } =
            await bootTokenTx(mpfs, oracle.address);
        const signedBootTx = await oracle.signTx(bootTx);
        await submitTx(mpfs, signedBootTx);
        const { unsignedTransaction: requestTx } = await requestChangeTx(
            mpfs,
            user.address,
            tokenId,
            { type: 'insert', key: 'key1', value: 'value1' }
        );
        const signedTransaction = await user.signTx(requestTx);
        const { txHash } = await submitTx(mpfs, signedTransaction);
        const { requests } = await getToken(log, mpfs, tokenId, 2);
        assertThrows(
            requests.length === 1,
            'Request was not created or multiple requests found'
        );
        assertThrows(
            requests[0].outputRefId === mkOutputRefId(firstOutputRef(txHash)),
            'Request was not found after creation'
        );
        assertThrows(
            requests[0].change.key === 'key1' &&
                requests[0].change.value === 'value1' &&
                requests[0].change.type === 'insert',
            'Request change data does not match expected values'
        );
        assertThrows(
            requests[0].owner === user.owner,
            'Request owner does not match expected owner'
        );
    };
    await run(test, 'mpfs requests a change to a token');
};
const canUpdateAToken = async ({ run, log, mpfs }: Runner) => {
    const test = async ({ oracle, user }) => {
        const { unsignedTransaction: bootTx, value: tokenId } =
            await bootTokenTx(mpfs, oracle.address);
        const signedBootTx = await oracle.signTx(bootTx);
        await submitTx(mpfs, signedBootTx);
        const { unsignedTransaction: requestTx } = await requestChangeTx(
            mpfs,
            user.address,
            tokenId,
            { type: 'insert', key: 'key1', value: 'value1' }
        );
        const signedRequestTx = await user.signTx(requestTx);
        const { txHash } = await submitTx(mpfs, signedRequestTx);
        const requestOutputRef = mkOutputRefId(firstOutputRef(txHash));
        const { unsignedTransaction: updateTx } = await updateTokenTx(
            mpfs,
            oracle.address,
            tokenId,
            [requestOutputRef] // requireds
        );
        const signedUpdateTx = await oracle.signTx(updateTx);
        const { txHash: updateTxHash } = await submitTx(mpfs, signedUpdateTx);
        const { requests } = await getToken(log, mpfs, tokenId, 2);
        assertThrows(
            requests.length === 0,
            'Request was not updated or still exists after update'
        );
        const facts = await getTokenFacts(log, mpfs, tokenId);
        assertThrows(
            Object.keys(facts).length === 1,
            'Token facts were not updated or multiple facts found'
        );
        assertThrows(
            facts.key1 === 'value1',
            'Token facts key1 does not match expected value'
        );
    };
    await run(test, 'mpfs updates a token');
};

const canUpdateATokenTwice = async ({ run, log, mpfs }: Runner) => {
    const test = async ({ oracle, user }) => {
        const { unsignedTransaction: bootTx, value: tokenId } =
            await bootTokenTx(mpfs, oracle.address);
        const signedBootTx = await oracle.signTx(bootTx);
        await submitTx(mpfs, signedBootTx);
        const { unsignedTransaction: requestTx } = await requestChangeTx(
            mpfs,
            user.address,
            tokenId,
            { type: 'insert', key: 'key1', value: 'value1' }
        );
        const signedRequestTx = await user.signTx(requestTx);
        const { txHash } = await submitTx(mpfs, signedRequestTx);
        const requestOutputRef = mkOutputRefId(firstOutputRef(txHash));
        const { unsignedTransaction: updateTx } = await updateTokenTx(
            mpfs,
            oracle.address,
            tokenId,
            [requestOutputRef] // requireds
        );
        const signedUpdateTx = await oracle.signTx(updateTx);
        const { txHash: updateTxHash } = await submitTx(mpfs, signedUpdateTx);
        const { unsignedTransaction: secondRequestTx } = await requestChangeTx(
            mpfs,
            user.address,
            tokenId,
            { type: 'insert', key: 'key2', value: 'value2' }
        );
        const signedSecondRequestTx = await user.signTx(secondRequestTx);
        const { txHash: secondTxHash } = await submitTx(
            mpfs,
            signedSecondRequestTx
        );
        const secondRequestOutputRef = mkOutputRefId(
            firstOutputRef(secondTxHash)
        );
        const { unsignedTransaction: secondUpdateTx } = await updateTokenTx(
            mpfs,
            oracle.address,
            tokenId,
            [secondRequestOutputRef]
        );
        const signedSecondUpdateTx = await oracle.signTx(secondUpdateTx);
        const { txHash: secondUpdateTxHash } = await submitTx(
            mpfs,
            signedSecondUpdateTx
        );
        const { unsignedTransaction: deleteSecondFactTx } =
            await requestChangeTx(mpfs, user.address, tokenId, {
                type: 'delete',
                key: 'key2',
                value: 'value2'
            });
        const signedDeleteSecondFactTx = await user.signTx(deleteSecondFactTx);
        const { txHash: deleteSecondFactTxHash } = await submitTx(
            mpfs,
            signedDeleteSecondFactTx
        );
        const deleteSecondFactOutputRef = mkOutputRefId(
            firstOutputRef(deleteSecondFactTxHash)
        );
        const { unsignedTransaction: deleteSecondFactUpdateTx } =
            await updateTokenTx(mpfs, oracle.address, tokenId, [
                deleteSecondFactOutputRef
            ]);
        const signedDeleteSecondFactUpdateTx = await oracle.signTx(
            deleteSecondFactUpdateTx
        );
        const { txHash: deleteSecondFactUpdateTxHash } = await submitTx(
            mpfs,
            signedDeleteSecondFactUpdateTx
        );
        const { unsignedTransaction: deleteFirstFactTx } =
            await requestChangeTx(mpfs, user.address, tokenId, {
                type: 'delete',
                key: 'key1',
                value: 'value1'
            });
        const signedDeleteFirstFactTx = await user.signTx(deleteFirstFactTx);
        const { txHash: deleteFirstFactTxHash } = await submitTx(
            mpfs,
            signedDeleteFirstFactTx
        );
        const deleteFirstFactOutputRef = mkOutputRefId(
            firstOutputRef(deleteFirstFactTxHash)
        );
        const { unsignedTransaction: deleteFirstFactUpdateTx } =
            await updateTokenTx(mpfs, oracle.address, tokenId, [
                deleteFirstFactOutputRef
            ]);
        const signedDeleteFirstFactUpdateTx = await oracle.signTx(
            deleteFirstFactUpdateTx
        );
        const { txHash: deleteFirstFactUpdateTxHash } = await submitTx(
            mpfs,
            signedDeleteFirstFactUpdateTx
        );
        const { requests } = await getToken(log, mpfs, tokenId, 2);
        assertThrows(
            requests.length === 0,
            'Request was not updated or still exists after update'
        );
        const facts = await getTokenFacts(log, mpfs, tokenId);
        assertThrows(
            Object.keys(facts).length === 0,
            'Token facts key1 does not match expected value'
        );
    };
    await run(test, 'mpfs updates a token');
};

const canRetractAChangeForAToken = async ({ run, log, mpfs }: Runner) => {
    const test = async ({ oracle, user }) => {
        const { unsignedTransaction: bootTx, value: tokenId } =
            await bootTokenTx(mpfs, oracle.address);
        const signedBootTx = await oracle.signTx(bootTx);
        await submitTx(mpfs, signedBootTx);
        const { unsignedTransaction: requestTx } = await requestChangeTx(
            mpfs,
            user.address,
            tokenId,
            { type: 'insert', key: 'key1', value: 'value1' }
        );
        const signedRequestTx = await user.signTx(requestTx);
        const { txHash } = await submitTx(mpfs, signedRequestTx);
        const requestOutputRefId = mkOutputRefId(firstOutputRef(txHash));
        const { unsignedTransaction: retractTx } = await retractChangeTx(
            mpfs,
            user.address,
            requestOutputRefId
        );
        const signedRetractTx = await user.signTx(retractTx);
        await submitTx(mpfs, signedRetractTx);
        const { requests } = await getToken(log, mpfs, tokenId, 2);
        assertThrows(
            requests.length === 0,
            'Request was not retracted or still exists after retraction'
        );
        const facts = await getTokenFacts(log, mpfs, tokenId);
        assertThrows(
            Object.keys(facts).length === 0,
            'Token facts were not retracted or still exist after retraction'
        );
    };
    await run(test, 'mpfs retracts a change for a token');
};

describe('E2E Signingless', () => {
    e2eVitest('can boot a token', canBootAToken, 60);
    e2eVitest('can end a booted token', canEndABootedToken, 60);
    e2eVitest(
        'can request a change to a token',
        canRequestAChangeToAtToken,
        60
    );
    e2eVitest('can update a token', canUpdateAToken, 60);
    e2eVitest(
        'can retract a change for a token',
        canRetractAChangeForAToken,
        60
    );
    e2eVitest(
        'can update a token twice with different values',
        canUpdateATokenTwice,
        120
    );
});
