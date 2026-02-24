/**
 * Change types and operations for MPF (Merkle Patricia Forestry) updates.
 *
 * This module defines the change types that represent modifications to the MPF:
 * - Insert: Add a new key-value pair
 * - Delete: Remove an existing key-value pair
 * - Update: Change the value for an existing key
 *
 * It also provides utilities for inverting changes (for rollbacks) and
 * applying changes to a trie.
 * @module
 */

import { Slotted } from '../indexer/state';
import { Proof, Trie } from '../mpf/lib/trie';
import { ValueSlotted } from './fatcs';

/**
 * A generic change operation on the MPF.
 *
 * @template T - The type of values being changed
 */
export type AChange<T> =
    | {
          type: 'insert';
          key: string;
          newValue: T;
      }
    | {
          type: 'delete';
          key: string;
          oldValue: T;
      }
    | {
          type: 'update';
          key: string;
          oldValue: T;
          newValue: T;
      };

/**
 * A change with simple string values (no slot information).
 * Used for on-chain operations where slot tracking isn't needed.
 */
export type UnslottedChange = AChange<string>;

/**
 * Invert an unslotted change for rollback purposes.
 *
 * - Insert becomes Delete (with newValue becoming oldValue)
 * - Delete becomes Insert (with oldValue becoming newValue)
 * - Update swaps oldValue and newValue
 *
 * @param change - The change to invert
 * @returns The inverted change that undoes the original
 */
export const invertUnslottedChange = (
    change: UnslottedChange
): UnslottedChange => {
    switch (change.type) {
        case 'insert':
            return {
                type: 'delete',
                key: change.key,
                oldValue: change.newValue
            };
        case 'delete':
            return {
                type: 'insert',
                key: change.key,
                newValue: change.oldValue
            };
        case 'update':
            return {
                type: 'update',
                key: change.key,
                oldValue: change.newValue,
                newValue: change.oldValue
            };
    }
};

/**
 * A change with slotted values (includes slot number for ordering).
 * Used for off-chain state tracking where we need to know when values were set.
 */
export type Change = AChange<ValueSlotted>;

/**
 * Invert a slotted change for rollback purposes.
 *
 * @param change - The slotted change to invert
 * @returns The inverted change that undoes the original
 */
export const invertChange = (change: Change): Change => {
    switch (change.type) {
        case 'insert':
            return {
                type: 'delete',
                key: change.key,
                oldValue: change.newValue
            };
        case 'delete':
            return {
                type: 'insert',
                key: change.key,
                newValue: change.oldValue
            };
        case 'update':
            return {
                type: 'update',
                key: change.key,
                oldValue: change.newValue,
                newValue: change.oldValue
            };
    }
};

/**
 * Convert a slotted change to an unslotted change.
 *
 * Strips the slot information, keeping only the raw values.
 *
 * @param change - The slotted change to convert
 * @returns The unslotted equivalent
 */
export const toUnslottedChange = (change: Change): UnslottedChange => {
    switch (change.type) {
        case 'insert':
            return {
                type: 'insert',
                key: change.key,
                newValue: change.newValue.value
            };
        case 'delete':
            return {
                type: 'delete',
                key: change.key,
                oldValue: change.oldValue.value
            };
        case 'update':
            return {
                type: 'update',
                key: change.key,
                oldValue: change.oldValue.value,
                newValue: change.newValue.value
            };
    }
};

/**
 * Apply a change to a trie and return the proof.
 *
 * For insert: inserts the value, then generates a proof for the key.
 * For delete: generates proof first (while key exists), then deletes.
 * For update: generates proof, deletes old value, inserts new value.
 *
 * The proof is needed for on-chain validation of the MPF update.
 *
 * @param trie - The trie to update
 * @param change - The change to apply
 * @returns Promise resolving to the proof for on-chain validation
 */
export async function updateTrie(
    trie: Trie,
    change: UnslottedChange
): Promise<Proof> {
    switch (change.type) {
        case 'insert': {
            await trie.insert(change.key, change.newValue);
            return await trie.prove(change.key);
        }
        case 'delete': {
            const proof = await trie.prove(change.key);
            await trie.delete(change.key);
            return proof;
        }
        case 'update': {
            const oldProof = await trie.prove(change.key);
            await trie.delete(change.key);
            await trie.insert(change.key, change.newValue);
            return oldProof;
        }
    }
}
