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
    e2eVitest('can access wallets', canAccessWallets);
    e2eVitest('can retrieve tokens', canRetrieveTokens);
    e2eVitest('can create and delete a token', canCreateTokenAndDelete);
    e2eVitest(
        "cannot delete another user's token",
        cannotDeleteAnotherUsersToken
    );
    e2eVitest('can retract a request', canRetractRequest);
    e2eVitest(
        "cannot retract another user's request",
        cannotRetractAnotherUsersRequest
    );
    e2eVitest(
        'cannot update a token with no requests',
        cannotUpdateATokenWithNoRequests
    );
    e2eVitest('can inspect requests for a token', canInspectRequestsForAToken);
    e2eVitest('can update a token', canUpdateAToken);
    e2eVitest(
        "cannot update another user's token",
        cannotUpdateAnotherUsersToken
    );
    e2eVitest('can update a token twice', canUpdateATokenTwice);
    e2eVitest('can delete facts', canDeleteFacts);
    e2eVitest('can batch update', canBatchUpdate);
    e2eVitest('can insert commutes', insertCommutes);
    e2eVitest('can delete commutes', deleteCommutes);
});
