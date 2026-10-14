import { describe, expect, it } from 'vitest';
import { Level } from 'level';
import { Store } from './lib/store.js';
import { withTempDir } from '../test/lib';

describe('Trie storage completion', () => {
    it.each(['put', 'del'] as const)(
        '%s waits for the database operation to finish',
        async operation => {
            await withTempDir(async directory => {
                const database = new Level(directory, {
                    valueEncoding: 'json'
                });
                await database.open();
                const key = Buffer.from('key');
                await database.put(key.toString('hex'), 'before');
                let release!: () => void;
                const held = new Promise<void>(resolve => {
                    release = resolve;
                });
                let backend!: Promise<void>;
                const parent = {
                    sublevel: () => ({
                        [operation]: (...args: any[]) => {
                            backend = held.then(() =>
                                (database[operation] as any)(...args)
                            );
                            return backend;
                        }
                    })
                };
                const store = new Store('test', parent);
                let completed = false;
                const pending = (
                    operation === 'put'
                        ? store.put(key, { serialise: () => 'after' })
                        : store.del(key)
                ).then(() => {
                    completed = true;
                });
                try {
                    await Promise.resolve();
                    await Promise.resolve();
                    expect(completed).toBe(false);
                    release();
                    await pending;
                    expect(await database.get(key.toString('hex'))).toBe(
                        operation === 'put' ? 'after' : undefined
                    );
                } finally {
                    release();
                    await backend;
                    await pending;
                    await database.close();
                }
            });
        }
    );
});
