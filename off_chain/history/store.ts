import { TokenState } from '../token';
import { OutputRef } from '../lib';
import { Change, invertChange } from '../trie/change';
import { AbstractSublevel } from 'abstract-level';
import { RollbackKey } from './store/rollbackkey';
import { Checkpoints, createCheckpoints } from './store/checkpoints';
import { createTokens, DBTokenState, Tokens } from './store/tokens';

export type DBRequest = {
    owner: string;
    tokenId: string;
    change: Change;
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
    public tokens: Tokens;
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
        tokens: Tokens,
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
        this.tokens = tokens;
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
        const tokens = await createTokens(stateStore);
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
            tokens,
            requestStore,
            rollbackStore,
            checkpoints
        );
    }

    async close(): Promise<void> {
        try {
            await this.rollbackStore.close();
            await this.requestStore.close();
            await this.tokens.close();
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
