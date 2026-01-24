/**
 * Safe trie wrapper with rollback and facts synchronization.
 *
 * This module provides a higher-level interface over the raw MPF trie
 * that maintains synchronization between the trie (for proofs) and
 * the facts store (for actual values), and supports temporary updates
 * with rollback capability.
 *
 * Key features:
 * - Atomic updates to both trie and facts store
 * - Temporary updates that can be rolled back
 * - Combined hash of trie root and facts for verification
 * @module
 */

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

/**
 * Interface for a safe trie with rollback support.
 */
export type SafeTrie = {
    /** Get the value for a key from the trie */
    getKey(key: string): Promise<Buffer | undefined>;
    /** Apply a temporary update (can be rolled back) */
    temporaryUpdate(change: UnslottedChange): Promise<Proof>;
    /** Rollback all temporary updates */
    rollback(): Promise<void>;
    /** Apply a permanent update to both trie and facts */
    update(change: Change): Promise<Proof>;
    /** Get the current trie root hash */
    root(): Buffer;
    /** Close the trie and all associated storage */
    close(): Promise<void>;
    /** Get all facts (key-value pairs with slots) */
    allFacts(): Promise<Record<string, ValueSlotted>>;
    /** Compute combined hash of trie root and facts */
    hash(): Promise<string>;
};

/**
 * Create a safe trie instance for a token.
 *
 * The safe trie:
 * - Loads or creates a trie for the given token ID
 * - Maintains a facts store alongside the trie
 * - Tracks temporary changes for rollback
 * - Provides atomic updates to both trie and facts
 *
 * @param tokenId - The token identifier
 * @param parent - The parent database level
 * @returns Promise resolving to a SafeTrie interface
 */
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
        /**
         * Get the value for a key from the trie.
         */
        getKey: async (key: string): Promise<Buffer | undefined> => {
            return loaded.trie.get(key);
        },

        /**
         * Apply a temporary update to the trie.
         *
         * Temporary updates are tracked and can be undone via rollback().
         * They only affect the trie, not the facts store.
         *
         * @returns The proof for on-chain validation
         */
        temporaryUpdate: async (change: UnslottedChange): Promise<Proof> => {
            tempChanges.push(change);
            return await updateTrie(loaded.trie, change);
        },

        /**
         * Rollback all temporary updates.
         *
         * Applies the inverse of each temporary change in reverse order.
         */
        rollback: async (): Promise<void> => {
            for (const change of tempChanges.reverse()) {
                const inverted = invertUnslottedChange(change);
                await updateTrie(loaded.trie, inverted);
            }
            tempChanges = [];
        },

        /**
         * Apply a permanent update to both trie and facts.
         *
         * Updates the facts store with the new value (or deletes it),
         * then applies the change to the trie.
         *
         * @returns The proof for on-chain validation
         */
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

        /**
         * Get the current trie root hash.
         */
        root: (): Buffer => {
            return loaded.trie.hash;
        },

        /**
         * Close the trie and all associated storage.
         */
        close: async (): Promise<void> => {
            await loaded.close();
            await facts.close();
            await db.close();
        },

        /**
         * Get all facts (key-value pairs with slots).
         */
        allFacts: async (): Promise<Record<string, ValueSlotted>> => {
            return await facts.getAll();
        },

        /**
         * Compute combined hash of trie root and facts.
         *
         * Useful for verifying complete state integrity.
         */
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
