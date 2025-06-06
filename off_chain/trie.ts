import { Proof, Store, Trie } from './mpf/lib';
import { Data, mConStr0, mConStr1, mConStr2 } from '@meshsdk/core';
import fs from 'fs';
import { Facts } from './facts/store';
import { Mutex } from 'async-mutex';

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

class PrivateTrie {
    public trie: Trie;
    public path: string;

    private constructor(path: string, trie: Trie) {
        this.path = path;
        this.trie = trie;
    }
    public static async create(path: string): Promise<PrivateTrie> {
        const store = new Store(path);
        await store.ready();
        let trie: Trie;
        try {
            trie = await Trie.load(store);
        } catch (error) {
            trie = new Trie(store);
        }
        return new PrivateTrie(path, trie);
    }
    public async close(): Promise<void> {
        // we would like to close the store before deleting it
        await fs.promises.rm(this.path, { recursive: true });
    }
}
// An MPF that can roll back operations
export class SafeTrie {
    private privateTrie: PrivateTrie;
    // private hot_lock: boolean = false;
    private facts: Facts;
    private tempChanges: Change[] = [];
    // private lock: Mutex = new Mutex();

    private constructor(trie: PrivateTrie, facts: Facts) {
        this.privateTrie = trie;
        this.facts = facts;
    }
    public static async create(path: string): Promise<SafeTrie> {
        const factsPath = path + '/facts';
        const triePath = path + '/trie';
        const trie = await PrivateTrie.create(triePath);
        await fs.promises.mkdir(factsPath, { recursive: true });
        await fs.promises.mkdir(triePath, { recursive: true });
        const facts = new Facts(factsPath);
        return new SafeTrie(trie, facts);
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
    }
    public async allFacts(): Promise<Record<string, string>> {
        return await this.facts.getAll();
    }
}

async function updateTrie(trie: Trie, change: Change): Promise<Proof> {
    const { key, value, operation } = change;
    const present = await trie.get(key);
    switch (operation) {
        case 'insert':
            if (present !== undefined) {
                throw new Error('Key already exists');
            }
            await trie.insert(key, value);
            return await trie.prove(key);
        case 'delete':
            if (present === undefined) {
                throw new Error('Key does not exist');
            }
            const proof = await trie.prove(key);
            await trie.delete(key);
            return proof;
    }
}

const serializeStepJ = (step: Record<string, unknown>): Data => {
    if (step.type === 'leaf') {
        const skip = step.skip as number;
        const neighbor = step.neighbor as Record<string, unknown>;
        const key = neighbor.key as string;
        const value = neighbor.value as string;
        return mConStr2([skip, key, value]);
    } else if (step.type === 'branch') {
        const skip = step.skip as number;
        const neighbors = step.neighbors as string;
        return mConStr0([skip, neighbors]);
    } else {
        const skip = step.skip as number;
        const neighbor = step.neighbor as Record<string, unknown>;
        const nibble = neighbor.nibble as number;
        const prefix = neighbor.prefix as string;
        const root = neighbor.root as string;
        return mConStr1([skip, mConStr0([nibble, prefix, root])]);
    }
};

export const serializeProof = (proof: Proof): Data => {
    const json = proof.toJSON() as Array<Record<string, unknown>>;
    return json.map((item: Record<string, unknown>) => serializeStepJ(item));
};

// Managing tries
export class TrieManager {
    private tries: Record<string, SafeTrie> = {};
    private dbPath: string;
    private lock: Mutex = new Mutex();

    constructor(dbPath: string) {
        this.dbPath = `${dbPath}/tries`;
    }
    public static async create(dbPath: string): Promise<TrieManager> {
        if (!fs.existsSync(dbPath)) {
            fs.mkdirSync(dbPath, { recursive: true });
        } else {
            fs.rmSync(dbPath, { recursive: true, force: true });
            fs.mkdirSync(dbPath, { recursive: true });
        }
        return new TrieManager(dbPath);
    }

    public static async load(dbPathRoot: string): Promise<TrieManager> {
        const dbPath = `${dbPathRoot}/tries`;
        const manager = new TrieManager(dbPath);
        if (!fs.existsSync(dbPath)) {
            throw new Error(`Database path does not exist: ${dbPath}`);
        }
        for (const file of fs.readdirSync(dbPath)) {
            const filePath = `${dbPath}/${file}`;
            if (fs.statSync(filePath).isDirectory()) {
                // Load existing trie
                const trie = await SafeTrie.create(filePath);
                console.log(`Loaded trie from: ${filePath}`);
                if (trie) {
                    manager.ptries[file] = trie;
                } else {
                    throw new Error(`Failed to load trie from: ${filePath}`);
                }
            }
        }
        return manager;
    }
    async trie(tokenId: string): Promise<SafeTrie> {
        const release = await this.lock.acquire();
        try {
            if (!this.tries[tokenId]) {
                const dbpath = `${this.dbPath}/${tokenId}`;
                const trie = await SafeTrie.create(dbpath);
                if (trie) {
                    this.tries[tokenId] = trie;
                } else {
                    throw new Error(
                        `Failed to load or create trie for index: ${tokenId}`
                    );
                }
            }
        } finally {
            release();
        }
        return this.tries[tokenId];
    }
}
