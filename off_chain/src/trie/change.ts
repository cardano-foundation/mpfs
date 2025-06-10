import { Proof, Trie } from '../mpf/lib/trie';

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

export async function updateTrie(trie: Trie, change: Change): Promise<Proof> {
    const { key, value, operation } = change;
    switch (operation) {
        case 'insert':
            await trie.insert(key, value);
            return await trie.prove(key);
        case 'delete':
            const proof = await trie.prove(key);
            await trie.delete(key);
            return proof;
    }
}
