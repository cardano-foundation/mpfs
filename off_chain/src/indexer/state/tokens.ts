import { CurrentToken, TokenState } from '../../token';
import { AbstractSublevel } from 'abstract-level';

export type Token = {
    current: CurrentToken;
    tokenId: string;
};

export type Tokens = {
    getToken(tokenId: string): Promise<CurrentToken | undefined>;
    putToken(tokenId: string, value: CurrentToken): Promise<void>;
    deleteToken(tokenId: string): Promise<void>;
    getTokens(): Promise<Token[]>;
    close(): Promise<void>;
};

export const createTokens = async (
    parent: AbstractSublevel<any, any, string, any>
): Promise<Tokens> => {
    const tokenStore: AbstractSublevel<any, any, string, CurrentToken> =
        parent.sublevel('tokens', {
            valueEncoding: 'json'
        });
    await tokenStore.open();
    return {
        getToken: async (
            tokenId: string
        ): Promise<CurrentToken | undefined> => {
            return await tokenStore.get(tokenId);
        },
        putToken: async (
            tokenId: string,
            value: CurrentToken
        ): Promise<void> => {
            await tokenStore.put(tokenId, value);
        },
        deleteToken: async (tokenId: string): Promise<void> => {
            await tokenStore.del(tokenId);
        },
        getTokens: async (): Promise<Token[]> => {
            const tokens: Token[] = [];
            for await (const [key, value] of tokenStore.iterator()) {
                tokens.push({ tokenId: key, current: value });
            }
            return tokens;
        },
        close: async (): Promise<void> => {
            await tokenStore.close();
        }
    };
};
