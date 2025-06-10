import { Store, Trie } from '../mpf/lib';
import { AbstractSublevel } from 'abstract-level';

export type Loaded = {
    close(): Promise<void>;
    trie: Trie;
};

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
