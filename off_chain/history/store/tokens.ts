import { TokenState } from '../../token';
import { OutputRef } from '../../lib';
import { AbstractSublevel } from 'abstract-level';

export type DBTokenState = {
    outputRef: OutputRef;
    state: TokenState;
};

export type Tokens = {
    getToken(tokenId: string): Promise<DBTokenState | undefined>;
    putToken(tokenId: string, value: DBTokenState): Promise<void>;
    deleteToken(tokenId: string): Promise<void>;
    getTokens(): Promise<{ tokenId: string; state: DBTokenState }[]>;
    close(): Promise<void>;
};

export const createTokens = async (
    parent: AbstractSublevel<any, any, string, any>
): Promise<Tokens> => {
    const tokenStore: AbstractSublevel<any, any, string, DBTokenState> =
        parent.sublevel('tokens', {
            valueEncoding: 'json'
        });
    await tokenStore.open();
    return {
        getToken: async (
            tokenId: string
        ): Promise<DBTokenState | undefined> => {
            return await tokenStore.get(tokenId);
        },
        putToken: async (
            tokenId: string,
            value: DBTokenState
        ): Promise<void> => {
            await tokenStore.put(tokenId, value);
        },
        deleteToken: async (tokenId: string): Promise<void> => {
            await tokenStore.del(tokenId);
        },
        getTokens: async (): Promise<
            { tokenId: string; state: DBTokenState }[]
        > => {
            const tokens: { tokenId: string; state: DBTokenState }[] = [];
            for await (const [key, value] of tokenStore.iterator()) {
                tokens.push({ tokenId: key, state: value });
            }
            return tokens;
        },
        close: async (): Promise<void> => {
            await tokenStore.close();
        }
    };
};
