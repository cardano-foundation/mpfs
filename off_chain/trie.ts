import { Mutex } from 'async-mutex';
import { createSafeTrie, SafeTrie } from './trie/safeTrie';
import { Level } from 'level';
import { update } from './transactions/update';

export type TrieManager = {
    trieIds(): Promise<string[]>;
    close(): Promise<void>;
    trie(tokenId: string, f: (trie: SafeTrie) => Promise<any>): Promise<void>;
};

const withLock = async (lock: Mutex, f: () => Promise<void>) => {
    const release = await lock.acquire();
    try {
        return await f();
    } finally {
        release();
    }
};

const withTrieLock = async (
    locks: Record<string, Mutex>,
    tokenId: string,
    f: () => Promise<void>
) => {
    if (!locks[tokenId]) {
        locks[tokenId] = new Mutex();
    }
    const lock = locks[tokenId];
    const release = await lock.acquire();
    try {
        return await f();
    } finally {
        release();
    }
};

const updateTokenIds = async (
    managerDB,
    f = (ids: string[]) => ids
): Promise<void> => {
    const tokenIds = await managerDB.get('token-ids');
    const updatedIds = f(tokenIds || []);
    await managerDB.put('token-ids', updatedIds);
};

const appendTokenId = async (managerDB, tokenId: string): Promise<void> => {
    await updateTokenIds(managerDB, ids => [...ids, tokenId]);
};

export const createTrieManager = async (
    parent: Level<string, any>
): Promise<TrieManager> => {
    const managerDB = parent.sublevel<string, any>('tries', {
        valueEncoding: 'json'
    });
    await managerDB.open();
    // let locks: Record<string, Mutex> = {};
    const lock = new Mutex();
    const tokenIds = (await managerDB.get('token-ids')) || [];
    await managerDB.put('token-ids', tokenIds);
    let tries: Record<string, SafeTrie> = {};
    for (const tokenId of tokenIds) {
        const trie = await createSafeTrie(tokenId, managerDB);
        if (!trie) {
            throw new Error(`Failed to load trie for token ID: ${tokenId}`);
        }
        tries[tokenId] = trie;
    }
    return {
        trieIds: async () => {
            const tokenIds = await managerDB.get('token-ids');
            return tokenIds || [];
        },
        close: async () => {
            const tokenIds = await managerDB.get('token-ids');
            for (const tokenId of tokenIds) {
                await withLock(lock, async () => {
                    const trie = await managerDB.get(tokenId);
                    if (trie) {
                        await trie.close();
                    }
                });
            }
            await managerDB.close();
            tries = {};
        },
        trie: async (tokenId: string, f: (trie: SafeTrie) => Promise<any>) => {
            await withLock(lock, async () => {
                const trie = tries[tokenId];
                if (!trie) {
                    const newTrie = await createSafeTrie(tokenId, managerDB);
                    await appendTokenId(managerDB, tokenId);
                    tries[tokenId] = newTrie;
                    await f(newTrie);
                } else {
                    await f(trie);
                }
            });
        }
    };
};
