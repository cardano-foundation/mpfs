/**
 * Trie loading and lifecycle management.
 *
 * This module provides utilities for loading an MPF trie from storage
 * and managing its lifecycle (creation, loading, closing).
 * @module
 */

import { Store, Trie } from '../mpf/lib';
import { AbstractSublevel } from 'abstract-level';

/**
 * A loaded trie with lifecycle management.
 */
export type Loaded = {
    /** Close the trie and its underlying store */
    close(): Promise<void>;
    /** The MPF trie instance */
    trie: Trie;
};

/**
 * Create or load a trie for a specific token.
 *
 * Attempts to load an existing trie from storage. If no trie exists
 * (first time for this token), creates a new empty trie.
 *
 * @param tokenId - The token identifier (used as sublevel key)
 * @param parent - The parent database level
 * @returns Promise resolving to a Loaded object with trie and close method
 */
export const createLoaded = async (tokenId: string, parent: any) => {
    const store = new Store(tokenId, parent);
    await store.ready();
    let trie: Trie;
    try {
        trie = await Trie.load(store);
    } catch (error) {
        trie = new Trie(store);
    }
    return {
        trie,
        close: async () => {
            await trie.store.close();
        }
    };
};
