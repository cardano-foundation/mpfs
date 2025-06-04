import { TokenState } from '../token';
import { OutputRef } from '../lib';
import { Level } from 'level';
import { Change, invertChange } from '../trie';
import { AbstractSublevel } from 'abstract-level';

export function mkOutputRefId({ txHash, outputIndex }: OutputRef): string {
    return `${txHash}-${outputIndex}`;
}
export function unmkOutputRefId(refId: string): OutputRef {
    const [txHash, indexStr] = refId.split('-');
    const outputIndex = parseInt(indexStr, 10);
    if (isNaN(outputIndex)) {
        throw new Error(`Invalid output reference: ${refId}`);
    }
    return { txHash, outputIndex };
}

export type DBRequest = {
    owner: string;
    tokenId: string;
    change: Change;
};

export type DBTokenState = {
    outputRef: OutputRef;
    state: TokenState;
};

export type RollbackKey = number;

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
    private stateStore: Level<string, any>;
    private tokenStore: AbstractSublevel<any, any, string, DBTokenState>;
    private requestStore: AbstractSublevel<any, any, string, DBRequest>;
    private rollbackStore: AbstractSublevel<
        any,
        any,
        RollbackKey,
        RollbackValue
    >;

    constructor(dbPath: string) {
        this.stateStore = new Level(dbPath, {
            valueEncoding: 'json'
        });
        this.tokenStore = this.stateStore.sublevel('tokens', {
            valueEncoding: 'json'
        });
        this.requestStore = this.stateStore.sublevel('requests', {
            valueEncoding: 'json'
        });
        this.rollbackStore = this.stateStore.sublevel('rollback', {
            valueEncoding: 'json'
        });
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
        const existing = await this.rollbackStore.get(rollbackKey);
        if (!existing) {
            await this.rollbackStore.put(rollbackKey, [value]);
        } else {
            existing.push(value);
            await this.rollbackStore.put(rollbackKey, existing);
        }
    }
    async getToken(tokenId: string): Promise<DBTokenState | null> {
        try {
            const result = await this.tokenStore.get(tokenId);
            return result || null;
        } catch (error) {
            if (error.notFound) return null;
            throw error;
        }
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
            gte: 0,
            lt: rollbackKey
        });
        for await (const [key] of iterator) {
            await this.rollbackStore.del(key);
        }
    }

    async splitRollbacks(key: RollbackKey): Promise<StateChange[]> {
        const changes: StateChange[] = [];
        const iterator = this.rollbackStore.iterator({
            gt: key
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
