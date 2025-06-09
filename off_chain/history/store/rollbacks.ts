import { AbstractSublevel } from 'abstract-level';
import { RollbackKey } from './rollbackkey';

export type RollbackValue = any[];

export type Rollback = {
    key: RollbackKey;
    changes: RollbackValue;
};

/**
 * Interface for managing rollbacks in the state manager.
 */
export type Rollbacks = {
    /**
     * Adds a change to the rollback store.
     * @param rollbackKey - The slot number for the rollback.
     * @param change - The change to be recorded.
     */
    put(rollbackKey: RollbackKey, change: any): Promise<void>;
    /**
     * Extracts all changes after a given rollback key.
     * @param rollbackKey - The slot number to extract changes after.
     * @returns An array of rollbacks with their slot and changes.
     */
    extractAfter(
        rollbackKey: RollbackKey
    ): Promise<{ key: RollbackKey; changes: RollbackValue }[]>;
    /**
     * Prunes all rollbacks before a given rollback key.
     * @param rollbackKey - The slot number to prune rollbacks before.
     */
    pruneBefore(rollbackKey: RollbackKey): Promise<void>;
    close(): Promise<void>;
};

/** * Creates a Rollbacks instance for managing rollbacks in the state manager.
 * @param parent - The parent sublevel where the rollbacks will be stored.
 * @returns A Rollbacks instance.
 */
export const createRollbacks = async (
    parent: AbstractSublevel<any, any, string, any>
): Promise<Rollbacks> => {
    const rollbackStore: AbstractSublevel<
        any,
        any,
        Buffer<ArrayBufferLike>,
        RollbackValue
    > = parent.sublevel('rollbacks', {
        valueEncoding: 'json',
        keyEncoding: 'binary'
    });

    await rollbackStore.open();
    return {
        put: async (rollbackKey: RollbackKey, value: any): Promise<void> => {
            const key = rollbackKey.key;
            const existing = await rollbackStore.get(key);
            if (!existing) {
                await rollbackStore.put(key, [value]);
            } else {
                existing.push(value);
                await rollbackStore.put(key, existing);
            }
        },

        extractAfter: async (
            rollbackKey: RollbackKey
        ): Promise<{ key: RollbackKey; changes: RollbackValue }[]> => {
            const results: { key: RollbackKey; changes: RollbackValue }[] = [];
            const iterator = rollbackStore.iterator({
                gt: rollbackKey.key
            });
            for await (const [key, value] of iterator) {
                results.push({
                    key: RollbackKey.fromKey(key),
                    changes: value
                });
                await rollbackStore.del(key);
            }

            return results;
        },
        close: async (): Promise<void> => {
            await rollbackStore.close();
        },
        pruneBefore: async (rollbackKey: RollbackKey): Promise<void> => {
            const iterator = rollbackStore.iterator({
                gte: RollbackKey.zero.key,
                lt: rollbackKey.key
            });
            for await (const [key] of iterator) {
                await rollbackStore.del(key);
            }
        }
    };
};
