import { TokenState } from '../token';
import { OutputRef } from '../lib';
import { Level } from 'level';
import { Change } from '../trie';

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

export class StateManager {
    private tokenStore: Level<string, DBTokenState>;
    private requestStore: Level<string, DBRequest>;

    constructor(tokenDbPath: string, requestDbPath: string) {
        this.tokenStore = new Level<string, DBTokenState>(tokenDbPath, {
            valueEncoding: 'json'
        });
        this.requestStore = new Level<string, DBRequest>(requestDbPath, {
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

    async getToken(tokenId: string): Promise<DBTokenState | null> {
        try {
            const result = await this.tokenStore.get(tokenId);
            return result || null;
        } catch (error) {
            if (error.notFound) return null;
            throw error;
        }
    }

    async putToken(tokenId: string, value: DBTokenState): Promise<void> {
        await this.tokenStore.put(tokenId, value);
    }

    async putRequest(outputRef: string, value: DBRequest): Promise<void> {
        await this.requestStore.put(outputRef, value);
    }

    async deleteToken(tokenId: string): Promise<void> {
        await this.tokenStore.del(tokenId);
    }

    async deleteRequest(outputRef: string): Promise<void> {
        await this.requestStore.del(outputRef);
    }

    async getTokens(): Promise<{ tokenId: string; state: DBTokenState }[]> {
        const tokens: { tokenId: string; state: DBTokenState }[] = [];
        for await (const [key, value] of this.tokenStore.iterator()) {
            tokens.push({ tokenId: key, state: value });
        }
        return tokens;
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
