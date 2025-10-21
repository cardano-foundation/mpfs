import { Mutex } from 'async-mutex';
import { createSafeTrie, SafeTrie } from './trie/safeTrie';
import { Level } from 'level';
import { createStashable, Stashable } from './stashing';
import { createHash } from 'crypto';
import stableStringify from 'json-stable-stringify';
import { Change, UnslottedChange } from './trie/change';
import { ValueSlotted } from './trie/fatcs';

export type TrieManager = {
    trieIds(): Promise<string[]>;
    close(): Promise<void>;
    hide: (tokenId: string) => Promise<void>;
    unhide: (tokenId: string) => Promise<void>;
    trie<T>(tokenId: string, f: (trie: SafeTrie) => Promise<T>): Promise<T>;
    delete: (tokenId: string) => Promise<void>;
    hash: () => Promise<string>;
};

const withLock = async <T>(lock: Mutex, f: () => Promise<T>) => {
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

type VisibleTokenId = {
    tokenId: string;
    visible: boolean;
};
const updateTokenIds = async (
    managerDB,
    f = (ids: VisibleTokenId[]) => ids
): Promise<void> => {
    const tokenIds = await managerDB.get('token-ids');
    const updatedIds = f(tokenIds || []);
    await managerDB.put('token-ids', updatedIds);
};

const appendTokenId = async (managerDB, tokenId: string): Promise<void> => {
    await updateTokenIds(managerDB, ids => [
        ...ids,
        { tokenId, visible: true }
    ]);
};

const markTokenIdAs = async (
    managerDB,
    tokenId: string,
    visible: boolean
): Promise<void> => {
    await updateTokenIds(managerDB, ids =>
        ids.map(id => (id.tokenId === tokenId ? { ...id, visible } : id))
    );
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
    let tries: Record<string, Stashable<SafeTrie>> = {};
    for (const { tokenId, visible } of tokenIds) {
        const trie = await createSafeTrie(tokenId, managerDB);
        if (!trie) {
            console.warn(`No trie found for token ID: ${tokenId}`);
            continue;
        }
        if (!trie) {
            throw new Error(`Failed to load trie for token ID: ${tokenId}`);
        }
        tries[tokenId] = createStashable(trie);
        if (!visible) {
            tries[tokenId].hide();
        }
    }
    return {
        trieIds: async () => {
            const tokenIds: VisibleTokenId[] = await managerDB.get('token-ids');
            if (!tokenIds) {
                return [];
            } else
                return tokenIds.reduce((acc, { tokenId, visible }) => {
                    if (visible) {
                        acc.push(tokenId);
                    }
                    return acc;
                }, [] as string[]);
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
        hide: async (tokenId: string) => {
            await markTokenIdAs(managerDB, tokenId, false);
            await withLock(lock, async () => {
                tries[tokenId]?.hide();
            });
        },
        unhide: async (tokenId: string) => {
            await markTokenIdAs(managerDB, tokenId, true);
            await withLock(lock, async () => {
                tries[tokenId]?.unhide();
            });
        },
        trie: async <T>(tokenId: string, f: (trie: SafeTrie) => Promise<T>) => {
            return await withLock(lock, async () => {
                const stashableTrie = tries[tokenId];
                if (!stashableTrie) {
                    const newTrie = await createSafeTrie(tokenId, managerDB);
                    await appendTokenId(managerDB, tokenId);
                    tries[tokenId] = createStashable(newTrie);
                    return await f(newTrie);
                } else {
                    const trie = stashableTrie.get();
                    if (!trie) {
                        throw new Error(
                            `Trie for token ID ${tokenId} is not available.`
                        );
                    }
                    return await f(trie);
                }
            });
        },
        delete: async (tokenId: string) => {
            await withLock(lock, async () => {
                await managerDB.del(tokenId);
                delete tries[tokenId];
                // bad performance
                await updateTokenIds(managerDB, ids =>
                    ids.filter(id => id.tokenId !== tokenId)
                );
            });
        },
        hash: async () => {
            const hash = createHash('sha256');
            const tokenIds: VisibleTokenId[] = await managerDB.get('token-ids');
            hash.update(stableStringify(tokenIds) || '');
            for (const { tokenId, visible } of tokenIds) {
                if (visible) {
                    const trie = tries[tokenId].get();
                    if (trie) {
                        const trieHash = await trie.hash();
                        hash.update(trieHash);
                    }
                }
            }
            return hash.digest('hex');
        }
    };
};

export const withTrieManager = async (
    parent: Level<string, any>,
    f: (manager: TrieManager) => Promise<void>
): Promise<void> => {
    const manager = await createTrieManager(parent);
    try {
        await f(manager);
    } catch (error) {
        console.error('Error during TrieManager operation:', error);
        throw error;
    } finally {
        await manager.close();
    }
};

const getFactsValue = async (
    tries: TrieManager,
    tokenId: string,
    key: string
): Promise<ValueSlotted> => {
    return tries.trie(tokenId, async trie => {
        const facts = await trie.allFacts();
        return facts[key];
    });
};

export const addSlot = async (
    tries: TrieManager,
    tokenId: string,
    slot: number,
    changes: UnslottedChange[]
): Promise<Change[]> => {
    const slottedChanges: Change[] = [];
    for (const change of changes) {
        switch (change.type) {
            case 'insert':
                slottedChanges.push({
                    type: 'insert',
                    key: change.key,
                    newValue: { value: change.newValue, slot }
                });
                break;
            case 'delete':
                slottedChanges.push({
                    type: 'delete',
                    key: change.key,
                    oldValue: await getFactsValue(tries, tokenId, change.key)
                });
                break;
            case 'update':
                slottedChanges.push({
                    type: 'update',
                    key: change.key,
                    oldValue: await getFactsValue(tries, tokenId, change.key),
                    newValue: { value: change.newValue, slot }
                });
                break;
        }
    }
    return slottedChanges;
};
