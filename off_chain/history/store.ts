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

type DBElement = DBRequest | DBTokenState;

// Pattern matching can be done using a type guard:
function isDBRequest(element: DBElement): element is DBRequest {
    return 'change' in element && 'tokenId' in element;
}

function isDBTokenState(element: DBElement): element is DBTokenState {
    return 'state' in element && 'outputRef' in element;
}

export class StateManager {
    private db: Level<string, DBElement>;

    constructor(dbPath: string) {
        this.db = new Level<string, DBElement>(dbPath, {
            valueEncoding: 'json'
        });
    }

    async getRequest(outputRef: string): Promise<DBRequest | null> {
        const result = await this.db.get(outputRef);

        if (result && 'change' in result) {
            return result as DBRequest;
        }
        return null; // Return null if the element is not a request
    }

    async getToken(tokenId: string): Promise<DBTokenState | null> {
        const result = await this.db.get(tokenId);
        if (!result) {
            return null; // Return null if the token does not exist
        }
        if (isDBTokenState(result)) {
            return result as DBTokenState;
        }
        return null; // Return null if the element is not a token
    }

    async put(key: string, value: DBElement): Promise<void> {
        await this.db.put(key, value);
    }

    async delete(key: string): Promise<void> {
        await this.db.del(key);
    }
    async getTokens() {
        const tokens: { tokenId: string; state: DBTokenState }[] = [];
        for await (const [key, value] of this.db.iterator()) {
            if (isDBTokenState(value)) {
                tokens.push({ tokenId: key, state: value as DBTokenState });
            }
        }
        return tokens;
    }
    // Returns all requests, optionally filtered by tokenId. The order of the
    // requests is guaranteed to respect their outputRef order. So no need to
    // sort them.
    async getRequests(
        tokenId: string | null
    ): Promise<{ outputRef: string; change: Change; owner: string }[]> {
        const requests: { outputRef: string; change: Change; owner: string }[] =
            [];
        for await (const [key, value] of this.db.iterator()) {
            if (isDBRequest(value)) {
                if (!tokenId || value.tokenId === tokenId) {
                    requests.push({
                        outputRef: key,
                        change: value.change,
                        owner: value.owner
                    });
                }
            }
        }
        return requests;
    }
}
