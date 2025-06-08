import { describe, it, expect } from 'vitest';
import { withTempDir } from './test/lib';
import { TrieManager } from './trie';
import { Store, Trie } from './mpf/lib';
import { Level } from 'level';
import { createLoaded } from './trie/loaded';
import { AbstractLevel, AbstractSublevel } from 'abstract-level';

export async function withLevelDB(
    tmpDir,
    callback: (db: Level<any, any>) => Promise<void>
) {
    const db = new Level(tmpDir, { valueEncoding: 'json' });
    try {
        await callback(db);
    } finally {
        await db.close();
    }
}

describe('Trie', () => {
    it('can close and reopen without errors', async () => {
        await withTempDir(async tmpDir => {
            await withLevelDB(tmpDir, async db => {
                const store = new Store('testTrie', db);
                await store.ready();
                const trie = new Trie(store);
                await store.ready();
                expect(trie).toBeDefined();
                await store.close();
            });
            await withLevelDB(tmpDir, async dbReopened => {
                const storeReopened = new Store('testTrie', dbReopened);
                await storeReopened.ready();
            });
        });
    });
});

describe('Loaded', () => {
    it('can create and close', async () => {
        await withTempDir(async tmpDir => {
            await withLevelDB(tmpDir, async db => {
                const trie = await createLoaded('tk1', db);
                expect(trie).toBeDefined();
                await trie.close();
            });
        });
    });
    it('can close and reopen without errors', async () => {
        await withTempDir(async tmpDir => {
            await withLevelDB(tmpDir, async db => {
                const trie = await createLoaded('tk1', db);
                expect(trie).toBeDefined();
                await trie.close();
            });
            await withLevelDB(tmpDir, async reopenedDb => {
                const reopenedTrie = await createLoaded('tk1', reopenedDb);
                expect(reopenedTrie).toBeDefined();
                await reopenedTrie.close();
            });
        });
    });
});

describe('TrieManager', () => {
    it('can close and reopen without errors', async () => {
        await withTempDir(async tmpDir => {
            await withLevelDB(tmpDir, async db => {
                const trieManager = await TrieManager.create(db);
                async function onTrie(trie) {
                    expect(trie).toBeDefined();
                    await trie.update({
                        key: 'testKey',
                        value: 'testValue',
                        operation: 'insert'
                    });
                    expect(trie.root()).toBeDefined();
                    expect(await trie.allFacts()).toEqual({
                        testKey: 'testValue'
                    });
                }
                await trieManager.trie('testTokenId', onTrie);
                await trieManager.close();
            });
            await withLevelDB(tmpDir, async reopenedDb => {
                const reopenedTrieManager = await TrieManager.load(reopenedDb);
                expect(reopenedTrieManager).toBeDefined();
                const tries = reopenedTrieManager.trieIds;
                expect(tries).toBeDefined();
                expect(tries.includes('testTokenId')).toBe(true);
                async function onReopenedTrie(trie) {
                    expect(trie).toBeDefined();
                    expect(trie.root()).toBeDefined();
                    expect(await trie.allFacts()).toEqual({
                        testKey: 'testValue'
                    });
                    await trie.update({
                        key: 'testKey',
                        value: 'testValue',
                        operation: 'delete'
                    });
                    expect(await trie.allFacts()).toEqual({});
                }
                await reopenedTrieManager.trie('testTokenId', onReopenedTrie);
            });
        });
    });
});
