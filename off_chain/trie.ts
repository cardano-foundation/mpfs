import { Mutex } from 'async-mutex';
import { Level } from 'level';
import { AbstractSublevel } from 'abstract-level';
import { createSafeTrie, SafeTrie } from './trie/safeTrie';

// Managing tries
export class TrieManager {
    private tries: Record<string, SafeTrie> = {};
    private lock: Mutex = new Mutex();
    private managerDB: AbstractSublevel<any, any, string, any>;

    private constructor(db: AbstractSublevel<any, any, string, any>) {
        this.managerDB = db;
    }
    get trieIds() {
        return Object.keys(this.tries);
    }
    async close(): Promise<void> {
        const release = await this.lock.acquire();
        for (const [_tokenId, trie] of Object.entries(this.tries)) {
            await trie.close();
        }
        this.tries = {};
        await this.managerDB.close();
        release();
    }
    public static async create(
        parent: Level<string, any>
    ): Promise<TrieManager> {
        const manager = parent.sublevel<string, any>('tries', {
            valueEncoding: 'json'
        });
        await manager.open();
        const noTokens: string[] = [];
        await manager.put('token-ids', noTokens);
        return new TrieManager(manager);
    }

    public static async load(parent): Promise<TrieManager> {
        const managerDB = parent.sublevel('tries', {
            valueEncoding: 'json'
        });
        const manager = new TrieManager(managerDB);
        const tokenIds = await managerDB.get('token-ids');
        for (const tokenId of tokenIds) {
            const trie = await createSafeTrie(tokenId, managerDB);
            if (trie) {
                manager.tries[tokenId] = trie;
            } else {
                throw new Error(`Failed to load trie for token ID: ${tokenId}`);
            }
        }
        return manager;
    }
    async trie(
        tokenId: string,
        f: (trie: SafeTrie) => Promise<any>
    ): Promise<void> {
        const release = await this.lock.acquire(); // should be at the trie level
        try {
            if (!this.tries[tokenId]) {
                const trie = await createSafeTrie(tokenId, this.managerDB);
                await this.managerDB.put('token-ids', [
                    ...this.trieIds,
                    tokenId
                ]);
                if (trie) {
                    this.tries[tokenId] = trie;
                    await f(trie);
                } else {
                    throw new Error(
                        `Failed to load or create trie for index: ${tokenId}`
                    );
                }
            } else {
                await f(this.tries[tokenId]);
            }
        } finally {
            release();
        }
    }
}
