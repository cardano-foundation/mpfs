import { describe, it, expect } from 'vitest';
import { withTempDir } from './test/lib';
import { PrivateTrie, TrieManager } from './trie';
import { Store, Trie } from './mpf/lib';

describe('Trie', () => {
    it('can close and reopen without errors', async () => {
        const { tmpDir, clean } = withTempDir();
        try {
            const store = new Store(tmpDir + '/trie');
            await store.ready();
            const trie = new Trie(store);
            await store.ready();
            expect(trie).toBeDefined();
            await store.close();
            const storeReopened = new Store(tmpDir + '/trie');
            await storeReopened.ready();
        } finally {
            await clean();
        }
    });
});

describe('PrivateTrie', () => {
    it('can close and reopen without errors', async () => {
        const { tmpDir, clean } = withTempDir();
        try {
            const trie = await PrivateTrie.create(tmpDir + '/trie');
            expect(trie).toBeDefined();
            await trie.close();
            const reopenedTrie = await PrivateTrie.create(tmpDir + '/trie');
            expect(reopenedTrie).toBeDefined();
            await reopenedTrie.close();
        } finally {
            await clean();
        }
    });
});

describe('TrieManager', () => {
    it('can close and reopen without errors', async () => {
        const { tmpDir, clean } = withTempDir();
        try {
            const trieManager = await TrieManager.create(tmpDir);
            async function onTrie(trie) {
                expect(trie).toBeDefined();
                await trie.update({
                    key: 'testKey',
                    value: 'testValue',
                    operation: 'insert'
                });
                expect(trie.root()).toBeDefined();
                expect(await trie.allFacts()).toEqual({ testKey: 'testValue' });
            }
            await trieManager.trie('testTokenId', onTrie);
            await trieManager.close();
            const reopenedTrieManager = await TrieManager.load(tmpDir);
            expect(reopenedTrieManager).toBeDefined();
            const tries = reopenedTrieManager.trieIds;
            expect(tries).toBeDefined();
            expect(tries.includes('testTokenId')).toBe(true);
            async function onReopenedTrie(trie) {
                expect(trie).toBeDefined();
                expect(trie.root()).toBeDefined();
                expect(await trie.allFacts()).toEqual({ testKey: 'testValue' });
                await trie.update({
                    key: 'testKey',
                    value: 'testValue',
                    operation: 'delete'
                });
                expect(await trie.allFacts()).toEqual({});
            }
            await reopenedTrieManager.trie('testTokenId', onReopenedTrie);
        } finally {
            await clean();
        }
    });
});
