import { Change } from '../../trie/change';
import { AbstractSublevel } from 'abstract-level';

export type DBRequest = {
    owner: string; // The owner of the request, a pkh
    tokenId: string; // The token ID associated with the request
    change: Change; // The change for the token
};

export type Requests = {
    get(outputRef: string): Promise<DBRequest | undefined>;
    put(outputRef: string, value: DBRequest): Promise<void>;
    delete(outputRef: string): Promise<void>;
    byToken(
        tokenId: string | null
    ): Promise<{ outputRef: string; change: Change; owner: string }[]>;
    close(): Promise<void>;
};

export async function createRequests(
    parent: AbstractSublevel<any, any, string, any>
): Promise<Requests> {
    const requestStore: AbstractSublevel<any, any, string, DBRequest> =
        parent.sublevel('requests', {
            valueEncoding: 'json'
        });
    await requestStore.open();
    return {
        get: async (
            outputRef: string
        ): Promise<DBRequest | undefined> => {
            return await requestStore.get(outputRef);
        },
        put: async (
            outputRef: string,
            value: DBRequest
        ): Promise<void> => {
            await requestStore.put(outputRef, value);
        },
        delete: async (outputRef: string): Promise<void> => {
            await requestStore.del(outputRef);
        },
        byToken: async (
            tokenId: string | null
        ): Promise<{ outputRef: string; change: Change; owner: string }[]> => {
            const requests: {
                outputRef: string;
                change: Change;
                owner: string;
            }[] = [];
            for await (const [key, value] of requestStore.iterator()) {
                if (!tokenId || value.tokenId === tokenId) {
                    requests.push({
                        outputRef: key,
                        change: value.change,
                        owner: value.owner
                    });
                }
            }
            return requests;
        },
        close: async (): Promise<void> => {
            await requestStore.close();
        }
    };
}
