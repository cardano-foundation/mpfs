import { TokenState } from '../token';
import { OutputRef } from '../lib';
import { Level } from 'level';
import { Change, invertChange } from '../trie/change';
import { AbstractSublevel } from 'abstract-level';
import { RollbackKey } from './store/rollbackkey';
import { Checkpoints, createCheckpoints } from './store/checkpoints';

export type DBRequest = {
    owner: string;
    tokenId: string;
    change: Change;
};

export type DBTokenState = {
    outputRef: OutputRef;
    state: TokenState;
};

export type StateChange =
    | { type: 'AddRequest'; outputRef: string; request: DBRequest }
    | { type: 'RemoveRequest'; outputRef: string }
    | { type: 'AddToken'; tokenId: string; state: DBTokenState }
    | { type: 'RemoveToken'; tokenId: string }
    | { type: 'UpdateToken'; change: Change };

export type RollbackValue = StateChange[];

export type Rollback = {
    key: RollbackKey;
    changes: RollbackValue;
};

export class StateManager {
    private stateStore: AbstractSublevel<any, any, string, any>;
    private tokenStore: AbstractSublevel<any, any, string, DBTokenState>;
    private requestStore: AbstractSublevel<any, any, string, DBRequest>;
    private rollbackStore: AbstractSublevel<
        any,
        any,
        Buffer<ArrayBufferLike>,
        RollbackValue
    >;
    public checkpoints: Checkpoints;

    private constructor(
        stateStore: AbstractSublevel<any, any, string, any>,
        tokenStore: AbstractSublevel<any, any, string, DBTokenState>,
        requestStore: AbstractSublevel<any, any, string, DBRequest>,
        rollbackStore: AbstractSublevel<
            any,
            any,
            Buffer<ArrayBufferLike>,
            RollbackValue
        >,
        checkpoints: Checkpoints
    ) {
        this.stateStore = stateStore;
        this.tokenStore = tokenStore;
        this.requestStore = requestStore;
        this.rollbackStore = rollbackStore;
        this.checkpoints = checkpoints;
    }
    static async create(
        parent: AbstractSublevel<any, any, string, any>,
        checkpointsSize: number | null = null
    ): Promise<StateManager> {
        const stateStore = parent.sublevel('state', {
            valueEncoding: 'json'
        });
        await stateStore.open();
        const tokenStore: AbstractSublevel<any, any, string, DBTokenState> =
            stateStore.sublevel('tokens', {
                valueEncoding: 'json'
            });
        await tokenStore.open();
        const requestStore: AbstractSublevel<any, any, string, DBRequest> =
            stateStore.sublevel('requests', {
                valueEncoding: 'json'
            });
        await requestStore.open();
        const rollbackStore: AbstractSublevel<
            any,
            any,
            Buffer<ArrayBufferLike>,
            RollbackValue
        > = stateStore.sublevel('rollback', {
            valueEncoding: 'json',
            keyEncoding: 'binary'
        });
        await rollbackStore.open();
        const checkpoints = await createCheckpoints(
            stateStore,
            checkpointsSize
        );
        return new StateManager(
            stateStore,
            tokenStore,
            requestStore,
            rollbackStore,
            checkpoints
        );
    }

    async close(): Promise<void> {
        try {
            await this.rollbackStore.close();
            await this.requestStore.close();
            await this.tokenStore.close();
            await this.checkpoints.close();
            await this.stateStore.close();
        } catch (error) {
            console.error('Error closing StateManager:', error);
        }
    }
    async getRequest(outputRef: string): Promise<DBRequest | null> {
        try {
            const result = await this.requestStore.get(outputRef);
            return result || null;
        } catch (error) {
            if (error.notFound) return null;
            throw error;
        }
    }

    private async putRollbackValue(
        rollbackKey: RollbackKey,
        value: StateChange
    ): Promise<void> {
        const key = rollbackKey.key;
        const existing = await this.rollbackStore.get(key);
        if (!existing) {
            await this.rollbackStore.put(key, [value]);
        } else {
            existing.push(value);
            await this.rollbackStore.put(key, existing);
        }
    }
    async getToken(tokenId: string): Promise<DBTokenState | undefined> {
        return await this.tokenStore.get(tokenId);
    }

    async putToken(
        rollbackKey: RollbackKey,
        tokenId: string,
        value: DBTokenState
    ): Promise<void> {
        await this.tokenStore.put(tokenId, value);
        await this.putRollbackValue(rollbackKey, {
            type: 'RemoveToken',
            tokenId
        });
    }

    async putRequest(
        rollbackKey: RollbackKey,
        outputRef: string,
        value: DBRequest
    ): Promise<void> {
        await this.requestStore.put(outputRef, value);
        await this.putRollbackValue(rollbackKey, {
            type: 'RemoveRequest',
            outputRef
        });
    }

    async deleteToken(
        rollbackKey: RollbackKey,
        tokenId: string
    ): Promise<void> {
        const token = await this.getToken(tokenId);
        if (!token) {
            throw new Error(`Token with ID ${tokenId} does not exist.`);
        }
        await this.tokenStore.del(tokenId);
        await this.putRollbackValue(rollbackKey, {
            type: 'AddToken',
            tokenId,
            state: token
        });
    }

    async deleteRequest(
        rollbackKey: RollbackKey,
        outputRef: string
    ): Promise<void> {
        const request = await this.getRequest(outputRef);
        if (!request) {
            throw new Error(
                `Request with output reference ${outputRef} does not exist.`
            );
        }
        await this.requestStore.del(outputRef);
        await this.putRollbackValue(rollbackKey, {
            type: 'AddRequest',
            outputRef,
            request
        });
    }

    async getTokens(): Promise<{ tokenId: string; state: DBTokenState }[]> {
        const tokens: { tokenId: string; state: DBTokenState }[] = [];
        for await (const [key, value] of this.tokenStore.iterator()) {
            tokens.push({ tokenId: key, state: value });
        }
        return tokens;
    }

    async storeRollbackChange(
        rollbackKey: RollbackKey,
        change: Change
    ): Promise<void> {
        await this.putRollbackValue(rollbackKey, {
            type: 'UpdateToken',
            change: invertChange(change)
        });
    }

    async removeRollbacksBefore(rollbackKey: RollbackKey): Promise<void> {
        const iterator = this.rollbackStore.iterator({
            gte: RollbackKey.zero.key,
            lt: rollbackKey.key
        });
        for await (const [key] of iterator) {
            await this.rollbackStore.del(key);
        }
    }

    async splitRollbacks(splitKey: RollbackKey): Promise<StateChange[]> {
        const changes: StateChange[] = [];
        const iterator = this.rollbackStore.iterator({
            gt: splitKey.key
        });
        for await (const [key, value] of iterator) {
            await this.rollbackStore.del(key);
            changes.push(...value.reverse());
        }
        return changes.reverse();
    }

    async getRequests(
        tokenId: string | null
    ): Promise<{ outputRef: string; change: Change; owner: string }[]> {
        const requests: { outputRef: string; change: Change; owner: string }[] =
            [];
        for await (const [key, value] of this.requestStore.iterator()) {
            if (!tokenId || value.tokenId === tokenId) {
                requests.push({
                    outputRef: key,
                    change: value.change,
                    owner: value.owner
                });
            }
        }
        return requests;
    }
}
