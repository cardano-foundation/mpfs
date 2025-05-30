import { nullHash, OutputRef } from '../../../lib';
import {
    createRequest,
    createToken,
    deleteRequest,
    deleteToken,
    getToken,
    getTokenFacts,
    getTokens,
    getWallet,
    updateToken
} from './client';
import { assertThrows, shouldFail } from './lib';

export {
    Wallets,
    Runner,
    canAccessWallets,
    tokensAreEmpty,
    createTokenAndDelete,
    cannotDeleteAnotherUsersToken,
    canRetractRequest,
    cannotRetractAnotherUsersRequest,
    cannotUpdateATokenWithNoRequests,
    canInspectRequestsForAToken,
    canUpdateAToken,
    cannotUpdateAnotherUsersToken,
    canDeleteFacts,
    canBatchUpdate,
    insertCommutes,
    deleteCommutes
};

type Wallets = {
    charlie: string;
    bob: string;
    alice: string;
};

type Runner = {
    run: (test: () => Promise<void>, name: string) => Promise<void>;
    log: (message: string) => void;
    wallets: Wallets;
};

const canAccessWallets = async ({
    run,
    log,
    wallets: { charlie, bob, alice }
}: Runner) => {
    const test = async () => {
        log('charlie can get his wallet');
        getWallet(charlie);
        log('bob can get his wallet');
        getWallet(bob);
        log('alice can get her wallet');
        getWallet(alice);
    };
    await run(test, 'users can access wallets');
};

const tokensAreEmpty = async ({
    run,
    log,
    wallets: { charlie, bob, alice }
}: Runner) => {
    const test = async () => {
        log('charlie can get his tokens');
        const tks = await getTokens(charlie);
        assertThrows(tks.length == 0, 'Tokens found');
        log('bob can get his tokens');
        const tks2 = await getTokens(bob);
        assertThrows(tks2.length == 0, 'Tokens found');
        log('alice can get her tokens');
        const tks3 = await getTokens(alice);
        assertThrows(tks3.length == 0, 'Tokens found');
    };
    await run(test, 'users can retrieve their tokens');
};

const createTokenAndDelete = async ({ run, log, wallets: { charlie } }) => {
    const test = async () => {
        const tk = await createToken(charlie);
        log('charlie created an mpf token');
        const tks1 = await getTokens(charlie);
        assertThrows(tks1.length == 1, 'Token not found');
        await deleteToken(charlie, tk);
        log('charlie deleted the mpf token');
        const tks2 = await getTokens(charlie);
        assertThrows(tks2.length == 0, 'Tokens found');
    };
    await run(test, 'users can create and delete a token');
};

const cannotDeleteAnotherUsersToken = async ({
    run,
    log,
    wallets: { charlie, bob }
}) => {
    const test = async () => {
        const tk = await createToken(charlie);
        log('charlie created an mpf token');
        await shouldFail(deleteToken(bob, tk));
        log('bob failed to delete charlie token as expected');
        const tks = await getTokens(charlie);
        assertThrows(tks.length == 1, 'Token not found');
        await deleteToken(charlie, tk);
        log('charlie deleted the mpf token');
    };
    await run(test, 'users cannot delete another user token');
};

const canRetractRequest = async ({ run, log, wallets: { charlie, bob } }) => {
    const test = async () => {
        const tk = await createToken(charlie);
        log('charlie created an mpf token');
        const request = await createRequest(bob, tk, 'abc', 'value', 'insert');
        log('bob created a request to insert a fact');
        await deleteRequest(bob, request);
        log('bob retracted his request');
        await deleteToken(charlie, tk);
        log('charlie deleted the mpf token');
    };
    await run(test, 'users can create and retract requests');
};

const cannotRetractAnotherUsersRequest = async ({
    run,
    log,
    wallets: { charlie, bob }
}) => {
    const test = async () => {
        const tk = await createToken(charlie);
        log('charlie created an mpf token');
        const request = await createRequest(bob, tk, 'abc', 'value', 'insert');
        log('bob created a request to insert a fact');
        await shouldFail(deleteRequest(charlie, request));
        log('charlie failed to retract bob request as expected');
        await deleteToken(charlie, tk);
        log('charlie deleted the mpf token');
    };
    await run(test, 'users cannot retract another user request');
};

const cannotUpdateATokenWithNoRequests = async ({
    run,
    log,
    wallets: { charlie, bob }
}) => {
    const test = async () => {
        const tk = await createToken(charlie);
        log('charlie created an mpf token');
        await shouldFail(updateToken(charlie, tk, []));
        log('charlie failed to update the mpf token as expected');
        await deleteToken(charlie, tk);
        log('charlie deleted the mpf token');
    };
    await run(test, 'users cannot update a token with no requests');
};

const canInspectRequestsForAToken = async ({
    run,
    log,
    wallets: { charlie, bob, alice }
}) => {
    const test = async () => {
        const tk = await createToken(charlie);
        log('charlie created an mpf token');
        await createRequest(bob, tk, 'abc', 'value', 'insert');
        log('bob created a request to insert a fact');
        const { owner, root, requests } = await getToken(bob, tk);
        const { owner: charlieSig } = await getWallet(charlie);
        assertThrows(owner === charlieSig, 'Token owner is not charlie');
        assertThrows(root === nullHash, 'Token root is not null');
        assertThrows(requests.length === 1, 'Requests are not one');
        assertThrows(requests[0].key === 'abc', 'Request key abc');
        assertThrows(
            requests[0].value === 'value',
            'Request value is not value'
        );
        assertThrows(
            requests[0].operation === 'insert',
            'Request operation is not insert'
        );
        log('bob inspected charlie mpf token');
        await deleteRequest(bob, requests[0].ref);
        log('bob retracted his request');
        const { requests: requests2 } = await getToken(alice, tk);
        assertThrows(requests2.length === 0, 'Request still found');
        log('alice inspected charlie mpf token');
        await deleteToken(charlie, tk);
        log('charlie deleted the mpf token');
    };
    await run(test, 'users can inspect requests for a token');
};

const waitForSync = async (log, wallet, tk) => {
    while (true) {
        const { ready, networkTip, indexerTip } = (await getTokens(wallet)).indexerStatus;
        if (ready) {
            break;
        }
        log(
            `waiting 5s for token to sync: indexer tip ${indexerTip}, network tip ${networkTip}`
        );
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
};

const waitAndUpdate = async (log, wallet, tk, refs) => {
    await waitForSync(log, wallet, tk);
    await updateToken(wallet, tk, refs);
};

const canUpdateAToken = async ({ run, log, wallets: { charlie, bob } }) => {
    const test = async () => {
        const tk = await createToken(charlie);
        log('charlie created an mpf token');
        const { txHash, outputIndex } = await createRequest(
            bob,
            tk,
            'abc',
            'value',
            'insert'
        );
        log('bob created a request to insert a fact');
        await waitAndUpdate(log, charlie, tk, [{ txHash, outputIndex }]);
        log('charlie updated the mpf token');
        const facts = await getTokenFacts(charlie, tk);
        assertThrows(facts['abc'] === 'value', 'Token fact is not value');
        const factsBob = await getTokenFacts(bob, tk);
        assertThrows(facts['abc'] === 'value', 'Token fact is not value');
        await deleteToken(charlie, tk);
        log('charlie deleted the mpf token');
    };
    await run(test, 'users can update a token');
};

const cannotUpdateAnotherUsersToken = async ({
    run,
    log,
    wallets: { charlie, bob }
}) => {
    const test = async () => {
        const tk = await createToken(charlie);
        log('charlie created an mpf token');
        const request = await createRequest(bob, tk, 'abc', 'value', 'insert');
        log('bob created a request to insert a fact');
        await shouldFail(updateToken(bob, tk, [request]));
        log('bob failed to update charlie token as expected');
        await deleteRequest(bob, request);
        log('bob retracted his request');
        await deleteToken(charlie, tk);
        log('charlie deleted the mpf token');
    };
    await run(test, 'users cannot update another user token');
};

const canDeleteFacts = async ({
    run,
    log,
    wallets: { charlie, bob, alice }
}) => {
    const test = async () => {
        const tk = await createToken(charlie);
        log('charlie created an mpf token');
        const bobRequest = await createRequest(
            bob,
            tk,
            'abc',
            'value',
            'insert'
        );
        log('bob created a request to insert a fact');
        await updateToken(charlie, tk, [bobRequest]);
        log('charlie updated the mpf token');
        const aliceRequest = await createRequest(
            alice,
            tk,
            'abc',
            'value',
            'delete'
        );
        log('alice created a request to delete a fact');
        await updateToken(charlie, tk, [aliceRequest]);
        const facts = await getTokenFacts(charlie, tk);
        assertThrows(facts['abc'] === undefined, 'Token fact is not deleted');
        log('charlie updated the mpf token');
        const { root } = await getToken(charlie, tk);
        assertThrows(root === nullHash, 'Token root is not null');
        await deleteToken(charlie, tk);
        log('charlie deleted the mpf token');
    };
    await run(test, 'users can delete facts from a token');
};

const canBatchUpdate = async ({
    run,
    log,
    wallets: { charlie, bob, alice }
}) => {
    const test = async () => {
        const tk = await createToken(charlie);
        log('charlie created an mpf token');
        const bobRequest = await createRequest(
            bob,
            tk,
            'abc',
            'value',
            'insert'
        );
        log('bob created a request to insert a fact');
        const aliceRequest = await createRequest(
            alice,
            tk,
            'abd',
            'value',
            'insert'
        );
        log('alice created a request to insert a fact');
        await updateToken(charlie, tk, [bobRequest, aliceRequest]);
        log('charlie updated the mpf token');
        const facts = await getTokenFacts(charlie, tk);
        assertThrows(facts['abc'] === 'value', 'Token fact abc is not value');
        assertThrows(facts['abd'] === 'value', 'Token fact abd is not value');
        log('charlie verified the token facts');
        await deleteToken(charlie, tk);
        log('charlie deleted the mpf token');
    };
    await run(test, 'users can batch update a token');
};

const requestAndUpdate = async (
    log,
    owner,
    tk,
    requests: { author; key; value; op }[]
) => {
    let refs: OutputRef[] = [];
    for (const { author, key, value, op } of requests) {
        const { txHash, outputIndex } = await createRequest(
            author,
            tk,
            key,
            value,
            op
        );
        log(`request created for ${key} = ${value}`);
        refs.push({ txHash, outputIndex });
    }
    await updateToken(owner, tk, refs);
    const { root } = await getToken(owner, tk);
    return root;
};

const insertCommutes = async ({
    run,
    log,
    wallets: { charlie, bob, alice }
}) => {
    const test = async () => {
        const tk = await createToken(bob);
        log('bob created an mpf token');
        await requestAndUpdate(log, bob, tk, [
            { author: charlie, key: 'a', value: 'value1', op: 'insert' }
        ]);
        log('charlie got a token insertion for a = value1');
        const root1 = await requestAndUpdate(log, bob, tk, [
            { author: alice, key: 'b', value: 'value2', op: 'insert' }
        ]);
        log('alice got a token insertion for b = value2');
        await requestAndUpdate(log, bob, tk, [
            { author: bob, key: 'a', value: 'value1', op: 'delete' },
            { author: bob, key: 'b', value: 'value2', op: 'delete' }
        ]);
        log('bob got a token deletion for a = value1 and b = value2');
        await requestAndUpdate(log, bob, tk, [
            { author: alice, key: 'b', value: 'value2', op: 'insert' }
        ]);
        log('alice got a token insertion for b = value2');
        const root2 = await requestAndUpdate(log, bob, tk, [
            { author: charlie, key: 'a', value: 'value1', op: 'insert' }
        ]);
        log('charlie got a token insertion for a = value1');
        assertThrows(root1 === root2, 'Token state is not the same');
        await deleteToken(bob, tk);
        log('bob deleted the mpf token');
    };
    await run(test, 'user can commute insertions');
};

const deleteCommutes = async ({
    run,
    log,
    wallets: { charlie, bob, alice }
}) => {
    const test = async () => {
        const tk = await createToken(bob);
        log('bob created an mpf token');
        await requestAndUpdate(log, bob, tk, [
            { author: charlie, key: 'a', value: 'value1', op: 'insert' },
            { author: alice, key: 'b', value: 'value2', op: 'insert' }
        ]);
        log(
            'charlie and alice got token insertions for a = value1 and b = value2'
        );
        await requestAndUpdate(log, bob, tk, [
            { author: charlie, key: 'a', value: 'value1', op: 'delete' }
        ]);
        log('charlie got a token deletion for a = value1');
        const root1 = await requestAndUpdate(log, bob, tk, [
            { author: alice, key: 'b', value: 'value2', op: 'delete' }
        ]);
        log('alice got a token deletion for b = value2');
        assertThrows(root1 === nullHash, 'Token root is not null');
        await requestAndUpdate(log, bob, tk, [
            { author: charlie, key: 'a', value: 'value1', op: 'insert' },
            { author: alice, key: 'b', value: 'value2', op: 'insert' }
        ]);
        log(
            'charlie and alice got token insertions for a = value1 and b = value2'
        );
        await requestAndUpdate(log, bob, tk, [
            { author: alice, key: 'b', value: 'value2', op: 'delete' }
        ]);
        log('alice got a token deletion for b = value2');
        const root2 = await requestAndUpdate(log, bob, tk, [
            { author: charlie, key: 'a', value: 'value1', op: 'delete' }
        ]);
        log('charlie got a token deletion for a = value1');
        assertThrows(root1 === root2, 'Token state is not the same');
        await deleteToken(bob, tk);
        log('bob deleted the mpf token');
    };
    await run(test, 'user can commute deletions');
};
