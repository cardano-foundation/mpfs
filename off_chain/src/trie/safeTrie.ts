import { Proof } from '../mpf/lib';
import { Buffer } from 'buffer';
import { ValueSlotted, createFacts } from './fatcs';
import { AbstractSublevel } from 'abstract-level';
import {
    Change,
    invertChange,
    invertUnslottedChange,
    toUnslottedChange,
    UnslottedChange,
    updateTrie
} from '../trie/change';
import { createLoaded } from '../trie/loaded';
import { createHash } from 'crypto';
import { nullHash, rootHex } from '../lib';

export type SafeTrie = {
    getKey(key: string): Promise<Buffer | undefined>;
    temporaryUpdate(change: UnslottedChange): Promise<Proof>;
    rollback(): Promise<void>;
    update(change: Change): Promise<Proof>;
    root(): Buffer;
    close(): Promise<void>;
    allFacts(): Promise<Record<string, ValueSlotted>>;
    hash(): Promise<string>;
};

export const createSafeTrie = async (
    tokenId: string,
    parent: AbstractSublevel<any, any, string, any>
): Promise<SafeTrie> => {
    const db = parent.sublevel(tokenId, {
        valueEncoding: 'json'
    });
    const loaded = await createLoaded(tokenId, db);
    const facts = await createFacts(db);
    let tempChanges: UnslottedChange[] = [];
    return {
        getKey: async (key: string): Promise<Buffer | undefined> => {
            return loaded.trie.get(key);
        },
        temporaryUpdate: async (change: UnslottedChange): Promise<Proof> => {
            tempChanges.push(change);
            return await updateTrie(loaded.trie, change);
        },
        rollback: async (): Promise<void> => {
            for (const change of tempChanges.reverse()) {
                const inverted = invertUnslottedChange(change);
                await updateTrie(loaded.trie, inverted);
            }
            tempChanges = [];
        },
        update: async (change: Change): Promise<Proof> => {
            switch (change.type) {
                case 'insert':
                    await facts.set(change.key, change.newValue);
                    break;
                case 'delete':
                    await facts.delete(change.key);
                    break;
                case 'update':
                    await facts.set(change.key, change.newValue);
                    break;
            }
            return await updateTrie(loaded.trie, toUnslottedChange(change));
        },
        root: (): Buffer => {
            return loaded.trie.hash;
        },
        close: async (): Promise<void> => {
            await loaded.close();
            await facts.close();
            await db.close();
        },
        allFacts: async (): Promise<Record<string, ValueSlotted>> => {
            return await facts.getAll();
        },
        hash: async (): Promise<string> => {
            const hash = createHash('sha256');
            const th = rootHex(loaded.trie.hash) || nullHash;
            hash.update(th);
            const fh = await facts.hash();
            hash.update(fh);
            return hash.digest('hex');
        }
    };
};
