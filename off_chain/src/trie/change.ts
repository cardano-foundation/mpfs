import { Slotted } from '../indexer/state';
import { Proof, Trie } from '../mpf/lib/trie';
import { ValueSlotted } from './fatcs';

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
export type UnslottedChange = AChange<string>;

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

export type Change = AChange<ValueSlotted>;

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

export async function updateTrie(
    trie: Trie,
    change: UnslottedChange
): Promise<Proof> {
    switch (change.type) {
        case 'insert':
            await trie.insert(change.key, change.newValue);
            return await trie.prove(change.key);
        case 'delete':
            const proof = await trie.prove(change.key);
            await trie.delete(change.key);
            return proof;
        case 'update':
            const oldProof = await trie.prove(change.key);
            await trie.delete(change.key);
            await trie.insert(change.key, change.newValue);
            return oldProof;
    }
}
