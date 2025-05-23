import { Proof, Store, Trie } from '@aiken-lang/merkle-patricia-forestry';
import { Data, mConStr0, mConStr1, mConStr2 } from '@meshsdk/core';
import * as crypto from 'crypto';
import fs from 'fs';
export type Change = {
    type: 'insert' | 'delete';
    key: string;
    value: string;
};

class PrivateTrie {
    public trie: Trie;
    private store: Store;
    public path: string;

    private constructor(path: string, store: Store, trie: Trie) {
        this.path = path;
        this.store = store;
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
        return new PrivateTrie(path, store, trie);
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
    private changes: Change[] = [];
    private base_temp_dir: string; // temporary directory for hot trie
    private current_temp_dir: string; // current temporary directory for hot trie

    // this is a hack because we cannot currently reuse a directory for the hot trie
    private temporaryDir() {
        const random = crypto.randomBytes(16).toString('hex');
        const tempDir = `${this.base_temp_dir}/trie-${random}`;
        return tempDir;
    }

    private constructor(cold_trie: PrivateTrie, temp: string) {
        this.base_temp_dir = temp;
        this.cold_trie = cold_trie;
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
        return new SafeTrie(cold_trie, trieTempPath);
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

    public async update(key, value, operation): Promise<Proof> {
        const hot = await this.hotTrie();
        const proof = await updateTrie(hot, key, value, operation);
        this.changes.push({ type: operation, key: key, value });
        return proof;
    }

    public async rollback(): Promise<void> {
        if (this.hot_trie) {
            this.hot_trie.close();
            this.hot_trie = undefined;
            this.changes = [];
        }
    }
    public hotRoot(): Buffer | undefined {
        return this.hot_trie?.trie.hash;
    }
    public coldRoot(): Buffer {
        return this.cold_trie.trie.hash;
    }
    public async commit(): Promise<{ proofs: Proof[]; root: Buffer }> {
        const cold = this.cold_trie.trie;
        const proofs: Proof[] = [];
        try {
            for (const change of this.changes) {
                const { type, key, value } = change;
                proofs.push(await updateTrie(cold, key, value, type));
            }
        } finally {
            await this.rollback();
        }

        return { proofs, root: cold.hash };
    }
    public async close(): Promise<void> {
        this.rollback();
        await this.cold_trie.close();
        await fs.promises.rm(this.base_temp_dir, { recursive: true });
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
