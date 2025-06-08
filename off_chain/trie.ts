import { Proof, Store, Trie } from './mpf/lib';
import { Facts } from './facts/store';
import { Mutex } from 'async-mutex';
import { Level } from 'level';
import { AbstractSublevel } from 'abstract-level';

export type Change = {
    operation: 'insert' | 'delete';
    key: string;
    value: string;
};

export const invertChange = (change: Change): Change => {
    const { operation, key, value } = change;
    return {
        operation: operation === 'insert' ? 'delete' : 'insert',
        key,
        value
    };
};
export class PrivateTrie {
    public trie: Trie;

    private constructor(trie: Trie) {
        this.trie = trie;
    }
    public static async create(
        tokenId: string,
        levelDB: AbstractSublevel<any, any, any, any>
    ): Promise<PrivateTrie> {
        const store = new Store(tokenId, levelDB);
        await store.ready();
        let trie: Trie;
        try {
            trie = await Trie.load(store);
        } catch (error) {
            trie = new Trie(store);
        }
        return new PrivateTrie(trie);
    }
    public async close(): Promise<void> {
        await this.trie.store.close();
    }
}
// An MPF that can roll back operations
export class SafeTrie {
    private privateTrie: PrivateTrie;
    // private hot_lock: boolean = false;
    private facts: Facts;
    private tempChanges: Change[] = [];
    private db: AbstractSublevel<any, any, string, any>;
    // private lock: Mutex = new Mutex();

    private constructor(db, trie: PrivateTrie, facts: Facts) {
        this.privateTrie = trie;
        this.facts = facts;
        this.db = db;
    }
    public static async create(
        tokenId,
        parent: AbstractSublevel<any, any, string, any>
    ): Promise<SafeTrie> {
        const db = parent.sublevel(tokenId, {
            valueEncoding: 'json'
        });
        const trie = await PrivateTrie.create(tokenId, db);
        const facts = await Facts.create(db);
        return new SafeTrie(db, trie, facts);
    }
    public async getKey(key: string): Promise<Buffer | undefined> {
        return this.privateTrie?.trie.get(key);
    }

    public async temporaryUpdate(change: Change): Promise<Proof> {
        this.tempChanges.push(change);
        return await this.update(change);
    }

    public async rollback(): Promise<void> {
        for (const change of this.tempChanges.reverse()) {
            const inverted = invertChange(change);
            await updateTrie(this.privateTrie.trie, inverted);
        }
        this.tempChanges = [];
    }
    public async update(change: Change): Promise<Proof> {
        const { key, value, operation } = change;
        const proof = await updateTrie(this.privateTrie.trie, change);
        switch (change.operation) {
            case 'insert': {
                await this.facts.set(key, value);
                break;
            }
            case 'delete': {
                await this.facts.delete(key);
                break;
            }
            default: {
                throw new Error(`Unknown operation type: ${operation}`);
            }
        }
        return proof;
    }

    public root(): Buffer {
        return this.privateTrie.trie.hash;
    }

    public async close(): Promise<void> {
        await this.privateTrie.close();
        await this.facts.close();
        await this.db.close();
    }
    public async allFacts(): Promise<Record<string, string>> {
        return await this.facts.getAll();
    }
}

async function updateTrie(trie: Trie, change: Change): Promise<Proof> {
    const { key, value, operation } = change;
    switch (operation) {
        case 'insert':
            await trie.insert(key, value);
            return await trie.prove(key);
        case 'delete':
            const proof = await trie.prove(key);
            await trie.delete(key);
            return proof;
    }
}

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
            const trie = await SafeTrie.create(tokenId, managerDB);
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
                const trie = await SafeTrie.create(tokenId, this.managerDB);
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
