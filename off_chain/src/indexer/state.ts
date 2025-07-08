import { Change, invertChange } from '../trie/change';
import { AbstractSublevel } from 'abstract-level';
import { RollbackKey } from './state/rollbackkey';
import { TrieManager } from '../trie';
import { mkOutputRefId } from '../outputRef';
import { CurrentToken } from '../token';
import {
    Checkpoint,
    Checkpoints,
    createCheckpoints
} from './state/checkpoints';
import { createRollbacks, Rollbacks } from './state/rollbacks';
import { createTokens, Token, Tokens } from './state/tokens';
import { createRequests, Requests } from './state/requests';
import { Request } from '../request';
import { OutputRef, rootHex, WithOrigin } from '../lib';
import { Level } from 'level';
import { assert } from 'console';
import { Mutex } from 'async-mutex';

export type Slotted<T> = {
    slot: RollbackKey;
    value: T;
};

export type TokenChange = {
    token: Token;
    changes: Change[];
};

export type State = {
    addRequest: (request: Slotted<Request>) => Promise<void>;
    removeRequest: (request: Slotted<OutputRef>) => Promise<void>;
    addToken: (token: Slotted<Token>) => Promise<void>;
    removeToken: (token: Slotted<string>) => Promise<void>;
    updateToken: (change: Slotted<TokenChange>) => Promise<void>;
    rollback: (slot: WithOrigin<RollbackKey>) => Promise<void>;
    request: (outputRef: OutputRef) => Promise<Request | undefined>;
    tokens: Tokens;
    requests: Requests;
    checkpoints: Checkpoints;
    rollbacks: Rollbacks;
    close: () => Promise<void>;
};

export const createState = async (
    parent: Level<string, any>,
    tries: TrieManager,
    checkpointsSize: number | null = null,
    since: Checkpoint | null = null
): Promise<State> => {
    const state: AbstractSublevel<any, any, string, any> = parent.sublevel(
        'state',
        {
            valueEncoding: 'json'
        }
    );
    await state.open();
    const tokens = await createTokens(state);
    const requests = await createRequests(state);
    const rollbacks = await createRollbacks(state);
    const checkpoints = await createCheckpoints(state, checkpointsSize, since);

    const lock = new Mutex();

    return {
        close: async (): Promise<void> => {
            try {
                await rollbacks.close();
                await requests.close();
                await tokens.close();
                await checkpoints.close();
                await state.close();
            } catch (error) {
                console.error('Error closing State:', error);
            }
        },
        tokens,
        requests,
        checkpoints,
        rollbacks,
        request: async (outputRef: OutputRef): Promise<Request | undefined> => {
            const requestCore = await requests.get(mkOutputRefId(outputRef));
            if (!requestCore) {
                return undefined;
            }
            return {
                ref: outputRef,
                core: requestCore
            };
        },
        addRequest: async (request: Slotted<Request>): Promise<void> => {
            const release = await lock.acquire();
            try {
                const { slot, value } = request;
                await requests.put(mkOutputRefId(value.ref), value.core);
                await rollbacks.put(slot, {
                    type: 'RemoveRequest',
                    request: mkOutputRefId(value.ref)
                });
            } finally {
                release();
            }
        },
        removeRequest: async (request: Slotted<OutputRef>): Promise<void> => {
            const release = await lock.acquire();
            try {
                const ref = request.value;

                const refId = mkOutputRefId(ref);
                const existing = await requests.get(refId);
                if (existing) {
                    await requests.delete(refId);
                    await rollbacks.put(request.slot, {
                        type: 'AddRequest',
                        ref,
                        request: existing
                    });
                }
            } finally {
                release();
            }
        },
        addToken: async (token: Slotted<Token>): Promise<void> => {
            const release = await lock.acquire();
            try {
                const { slot, value } = token;
                await tokens.putToken(value.tokenId, value.current);
                await tries.trie(value.tokenId, async trie => {});
                await rollbacks.put(slot, {
                    type: 'RemoveToken',
                    tokenId: value.tokenId
                });
            } finally {
                release();
            }
        },
        removeToken: async (token: Slotted<string>): Promise<void> => {
            const release = await lock.acquire();
            try {
                const { slot, value: tokenId } = token;
                const existing = await tokens.getToken(tokenId);
                if (existing) {
                    await tries.hide(tokenId);
                    await tokens.deleteToken(tokenId);
                    await rollbacks.put(slot, {
                        type: 'AddToken',
                        tokenId: tokenId,
                        token: existing
                    });
                }
            } finally {
                release();
            }
        },
        updateToken: async (change: Slotted<TokenChange>): Promise<void> => {
            const release = await lock.acquire();
            try {
                const { slot, value: tokenChange } = change;
                const { tokenId } = tokenChange.token;
                const existing = await tokens.getToken(tokenId);
                if (existing) {
                    const root = await tries.trie(tokenId, async trie => {
                        for (const change of tokenChange.changes) {
                            await trie.update(change);
                        }
                    });
                    await tokens.putToken(tokenId, tokenChange.token.current);

                    await rollbacks.put(slot, {
                        type: 'UpdateToken',
                        tokenChange: {
                            current: existing,
                            changes: tokenChange.changes
                                .reverse()
                                .map(invertChange),
                            tokenId: tokenId
                        }
                    });
                }
            } finally {
                release();
            }
        },
        rollback: async (slot: WithOrigin<RollbackKey>): Promise<void> => {
            const release = await lock.acquire();
            try {
                await checkpoints.rollback(slot);
                const rollbackSteps = await rollbacks.extractAfter(slot);
                for (const rollback of rollbackSteps) {
                    switch (rollback.type) {
                        case 'RemoveRequest': {
                            const request = rollback.request;
                            await requests.delete(request);
                            break;
                        }
                        case 'AddRequest': {
                            const { ref, request } = rollback;
                            await requests.put(mkOutputRefId(ref), request);
                            break;
                        }
                        case 'RemoveToken': {
                            const tokenId = rollback.tokenId;
                            await tokens.deleteToken(tokenId);
                            await tries.delete(tokenId);
                            break;
                        }
                        case 'AddToken': {
                            const { tokenId, token } = rollback;
                            await tokens.putToken(tokenId, token);
                            await tries.unhide(tokenId);
                            break;
                        }
                        case 'UpdateToken': {
                            const { tokenChange } = rollback;
                            for (const change of tokenChange.changes) {
                                await tries.trie(
                                    tokenChange.tokenId,
                                    async trie => {
                                        await trie.update(change);
                                    }
                                );
                            }
                            await tokens.putToken(
                                tokenChange.tokenId,
                                tokenChange.current
                            );
                            break;
                        }
                    }
                }
            } finally {
                release();
            }
        }
    };
};

const assertThrow = (condition: boolean, message: string): void => {
    if (!condition) {
        throw new Error(message);
    }
};

export const withState = async (
    parent: Level<string, any>,
    tries: TrieManager,
    checkpointsSize: number | null = null,
    since: Checkpoint | null = null,
    f: (state: State) => Promise<void>
): Promise<void> => {
    const state = await createState(parent, tries, checkpointsSize, since);
    try {
        await f(state);
    } finally {
        await state.close();
    }
};
