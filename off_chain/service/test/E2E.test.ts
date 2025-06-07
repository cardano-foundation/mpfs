import {
    canAccessWallets,
    cannotDeleteAnotherUsersToken,
    canRetractRequest,
    createTokenAndDelete as canCreateTokenAndDelete,
    tokensAreEmpty as canRetrieveTokens,
    cannotRetractAnotherUsersRequest,
    cannotUpdateATokenWithNoRequests,
    canInspectRequestsForAToken,
    canUpdateAToken,
    cannotUpdateAnotherUsersToken,
    canDeleteFacts,
    canBatchUpdate,
    insertCommutes,
    deleteCommutes,
    canUpdateATokenTwice
} from './E2E/scenarios';
import { describe } from 'vitest';
import { e2eTest as e2eVitest } from './E2E/fixtures';

describe('E2E Tests', () => {
    e2eVitest('can access wallets', canAccessWallets, 60);
    e2eVitest('can retrieve tokens', canRetrieveTokens, 60);
    e2eVitest('can create and delete a token', canCreateTokenAndDelete, 60);
    e2eVitest(
        "cannot delete another user's token",
        cannotDeleteAnotherUsersToken,
        60
    );
    e2eVitest('can retract a request', canRetractRequest, 60);
    e2eVitest(
        "cannot retract another user's request",
        cannotRetractAnotherUsersRequest,
        60
    );
    e2eVitest(
        'cannot update a token with no requests',
        cannotUpdateATokenWithNoRequests,
        60
    );
    e2eVitest(
        'can inspect requests for a token',
        canInspectRequestsForAToken,
        60
    );
    e2eVitest('can update a token', canUpdateAToken, 60);
    e2eVitest(
        "cannot update another user's token",
        cannotUpdateAnotherUsersToken,
        60
    );
    e2eVitest('can update a token twice', canUpdateATokenTwice, 90);
    e2eVitest('can delete facts', canDeleteFacts, 60);
    e2eVitest('can batch update', canBatchUpdate, 90);
    e2eVitest('can insert commutes', insertCommutes, 120);
    e2eVitest('can delete commutes', deleteCommutes, 120);
});
