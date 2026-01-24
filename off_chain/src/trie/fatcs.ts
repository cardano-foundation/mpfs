/**
 * Facts storage for MPF key-value pairs with slot tracking.
 *
 * This module manages the authoritative storage of key-value pairs
 * alongside the MPF trie. While the trie stores hashes for proof
 * generation, the facts store keeps the actual values with their
 * insertion slot numbers for ordering and rollback purposes.
 * @module
 */

import { AbstractSublevel } from 'abstract-level';
import { levelHash } from '../indexer/level-hash';

/**
 * A value with its insertion slot number.
 *
 * The slot number indicates when this value was inserted,
 * enabling proper ordering and rollback operations.
 */
export type ValueSlotted = {
    value: string;
    slot: number;
};

/**
 * Interface for the facts storage.
 */
export type Facts = {
    /** Store a key-value pair with slot information */
    set(key: string, value: ValueSlotted): Promise<void>;
    /** Retrieve a value by key */
    get(key: string): Promise<ValueSlotted | undefined>;
    /** Get all key-value pairs */
    getAll(): Promise<Record<string, string>>;
    /** Delete a key */
    delete(key: string): Promise<void>;
    /** Close the storage */
    close(): Promise<void>;
    /** Compute a hash of all stored facts */
    hash(): Promise<string>;
};

/**
 * Create a facts storage instance.
 *
 * The facts are stored in a sublevel named 'facts' under the parent level.
 * Values are JSON-serialized for storage.
 *
 * @param parent - The parent database level
 * @returns Promise resolving to a Facts interface
 */
export const createFacts = async (
    parent: AbstractSublevel<any, any, string, any>
) => {
    const db = parent.sublevel('facts');

    return {
        /**
         * Store a key-value pair with slot information.
         */
        async set(key: string, value: ValueSlotted): Promise<void> {
            await db.put(key, JSON.stringify(value));
        },

        /**
         * Retrieve a value by key.
         *
         * @returns The slotted value, or undefined if not found
         */
        async get(key: string): Promise<ValueSlotted | undefined> {
            return await db.get(key).then(str => {
                return JSON.parse(str!);
            });
        },

        /**
         * Get all stored key-value pairs.
         *
         * @returns Record mapping keys to their slotted values
         */
        async getAll(): Promise<Record<string, ValueSlotted>> {
            const result: Record<string, ValueSlotted> = {};
            for await (const [key, value] of db.iterator()) {
                result[key] = JSON.parse(value);
            }
            return result;
        },

        /**
         * Delete a key from storage.
         */
        async delete(key: string): Promise<void> {
            await db.del(key);
        },

        /**
         * Close the storage.
         */
        async close(): Promise<void> {
            await db.close();
        },

        /**
         * Compute a hash of all stored facts.
         *
         * Useful for integrity verification and comparison.
         */
        async hash(): Promise<string> {
            return await levelHash(db);
        }
    };
};
