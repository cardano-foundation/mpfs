import { Proof, Store, Trie } from '@aiken-lang/merkle-patricia-forestry';
import { Data, mConStr0, mConStr1, mConStr2 } from '@meshsdk/core';
import * as crypto from 'crypto';
import fs from 'fs';
import { Facts } from './facts/store';
export type Change = {
    type: 'insert' | 'delete';
    key: string;
    value: string;
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
    private cold_trie: PrivateTrie;
    private hot_trie: PrivateTrie | undefined;
    // private hot_lock: boolean = false;
    private facts: Facts;
    private base_temp_dir: string; // temporary directory for hot trie

    // this is a hack because we cannot currently reuse a directory for the hot trie
    private temporaryDir() {
        const random = crypto.randomBytes(16).toString('hex');
        const tempDir = `${this.base_temp_dir}/trie-${random}`;
        return tempDir;
    }

    private constructor(cold_trie: PrivateTrie, temp: string, facts: Facts) {
        this.base_temp_dir = temp;
        this.cold_trie = cold_trie;
        this.facts = facts;
        this.hot_trie = undefined;
    }
    public static async create(path: string): Promise<SafeTrie> {
        const factsPath = path + '/facts';
        const triePath = path + '/trie';
        const trieTempPath = path + '/trie-tmp';
        const cold_trie = await PrivateTrie.create(triePath);
        await fs.promises.mkdir(trieTempPath, { recursive: true });
        await fs.promises.mkdir(factsPath, { recursive: true });
        await fs.promises.mkdir(triePath, { recursive: true });
        const facts = new Facts(factsPath);
        return new SafeTrie(cold_trie, trieTempPath, facts);
    }
    public async getKey(key: string): Promise<Buffer | undefined> {
        let safe = this.hot_trie ? this.hot_trie : this.cold_trie;
        return safe?.trie.get(key);
    }
    private async hotTrie(): Promise<Trie> {
        if (!this.hot_trie) {
            const coldTriePath = this.cold_trie.path;
            const tempDir = this.temporaryDir();
            // Copy the cold trie to the temp directory
            await fs.promises.mkdir(tempDir, { recursive: true });
            await fs.promises.cp(coldTriePath, tempDir, { recursive: true });
            this.hot_trie = await PrivateTrie.create(tempDir);
        }
        return this.hot_trie.trie;
    }

    public async tryUpdate(key, value, operation): Promise<Proof> {
        const hot = await this.hotTrie();
        const proof = await updateTrie(hot, key, value, operation);
        return proof;
    }
    public async update(key: string, value: string, operation): Promise<void> {
        await updateTrie(this.cold_trie.trie, key, value, operation);
        switch (operation) {
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
    }

    public hotRoot(): Buffer | undefined {
        return this.hot_trie?.trie.hash;
    }
    public coldRoot(): Buffer {
        return this.cold_trie.trie.hash;
    }

    public async close(): Promise<void> {
        await this.cold_trie.close();
        await fs.promises.rm(this.base_temp_dir, { recursive: true });
    }
    public async allFacts(): Promise<Record<string, string>> {
        return await this.facts.getAll();
    }
}

async function updateTrie(
    trie: Trie,
    key: string,
    value: string,
    operation: 'insert' | 'delete'
): Promise<Proof> {
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

    constructor(dbPath: string) {
        this.dbPath = dbPath;
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

    public static async load(dbPath: string): Promise<TrieManager> {
        if (!fs.existsSync(dbPath)) {
            throw new Error(`Database path does not exist: ${dbPath}`);
        }
        return new TrieManager(dbPath);
    }
    async trie(assetName: string): Promise<SafeTrie> {
        if (!this.tries[assetName]) {
            const dbpath = `${this.dbPath}/${assetName}`;
            const trie = await SafeTrie.create(dbpath);
            if (trie) {
                this.tries[assetName] = trie;
            } else {
                throw new Error(
                    `Failed to load or create trie for index: ${assetName}`
                );
            }
        }
        return this.tries[assetName];
    }
}
