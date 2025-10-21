import { AbstractSublevel } from 'abstract-level';
import { levelHash } from '../indexer/level-hash';

export type ValueSlotted = {
    value: string;
    slot: number;
};

export type Facts = {
    set(key: string, value: ValueSlotted): Promise<void>;
    get(key: string): Promise<ValueSlotted | undefined>;
    getAll(): Promise<Record<string, string>>;
    delete(key: string): Promise<void>;
    close(): Promise<void>;
    hash(): Promise<string>;
};

export const createFacts = async (
    parent: AbstractSublevel<any, any, string, any>
) => {
    const db = parent.sublevel('facts');

    return {
        async set(key: string, value: ValueSlotted): Promise<void> {
            await db.put(key, JSON.stringify(value));
        },

        async get(key: string): Promise<ValueSlotted | undefined> {
            return await db.get(key).then(str => {
                return JSON.parse(str!);
            });
        },

        async getAll(): Promise<Record<string, ValueSlotted>> {
            const result: Record<string, ValueSlotted> = {};
            for await (const [key, value] of db.iterator()) {
                result[key] = JSON.parse(value);
            }
            return result;
        },

        async delete(key: string): Promise<void> {
            await db.del(key);
        },

        async close(): Promise<void> {
            await db.close();
        },
        async hash(): Promise<string> {
            return await levelHash(db);
        }
    };
};
