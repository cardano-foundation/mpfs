import { Proof, Trie } from '../mpf/lib/trie';

export type Change =
    | {
          type: 'insert';
          key: string;
          value: string;
      }
    | { type: 'delete'; key: string; value: string }
    | { type: 'update'; key: string; oldValue: string; newValue: string };

export const invertChange = (change: Change): Change => {
    switch (change.type) {
        case 'insert':
            return { type: 'delete', key: change.key, value: change.value };
        case 'delete':
            return { type: 'insert', key: change.key, value: change.value };
        case 'update':
            return {
                type: 'update',
                key: change.key,
                oldValue: change.newValue,
                newValue: change.oldValue
            };
    }
};

export async function updateTrie(trie: Trie, change: Change): Promise<Proof> {
    switch (change.type) {
        case 'insert':
            await trie.insert(change.key, change.value);
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
