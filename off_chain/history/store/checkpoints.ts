import { Level } from 'level';
import { AbstractSublevel } from 'abstract-level';
import { RollbackKey } from './rollbackkey';
import { A, C } from 'vitest/dist/chunks/environment.d.cL3nLXbE.js';
import { an } from 'vitest/dist/chunks/reporters.d.C1ogPriE.js';
import { check } from 'fast-check';

export type Checkpoint = {
    slot: RollbackKey;
    blockHash: string;
};
export type BlockHash = string;

export type CheckpointValue = {
    blockHash: BlockHash;
    consumedRefIds: string[];
};

export type Checkpoints = {
    putCheckpoint(
        checkpoint: Checkpoint,
        consumedRefIds: string[]
    ): Promise<void>;
    getCheckpoint(slot: RollbackKey): Promise<BlockHash | undefined>;
    getAllCheckpoints(): Promise<Checkpoint[]>;
    extractCheckpointsAfter(cp: Checkpoint | null): Promise<CheckpointValue[]>;
    close(): Promise<void>;
};

export const createCheckpoints = async (
    parent: AbstractSublevel<any, any, any, any>,
    size: number | null = null
): Promise<Checkpoints> => {
    const db: AbstractSublevel<
        any,
        any,
        Buffer<ArrayBufferLike>,
        CheckpointValue
    > = parent.sublevel('checkpoints', {
        valueEncoding: 'json',
        keyEncoding: 'binary'
    });
    await db.open();
    let count = 0;
    const dropCheckpointsTail = async (): Promise<void> => {
        if (size === null) {
            return; // No decimation if checkpointsSize is not set
        }
        if (count < 2 * size) {
            return; // No need to decimate if we have fewer checkpoints than the size
        }
        const iterator = db.iterator({
            gte: RollbackKey.zero.key,
            limit: count - size
        });
        for await (const [key] of iterator) {
            await db.del(key);
            count--;
        }
    };
    return {
        putCheckpoint: async (
            checkpoint: Checkpoint,
            consumedRefIds: string[]
        ) => {
            await db.put(checkpoint.slot.key, {
                blockHash: checkpoint.blockHash,
                consumedRefIds
            });
            count++;
            await dropCheckpointsTail();
        },
        getCheckpoint: async (slot: RollbackKey) => {
            const value = await db.get(slot.key);
            return value?.blockHash;
        },
        getAllCheckpoints: async () => {
            const checkpoints: Checkpoint[] = [];
            for await (const [key, value] of db.iterator()) {
                checkpoints.push({
                    slot: RollbackKey.fromKey(key),
                    blockHash: value.blockHash
                });
            }
            return checkpoints;
        },
        extractCheckpointsAfter: async (cp: Checkpoint | null) => {
            const checkpoints: CheckpointValue[] = [];
            const iterator = db.iterator({
                gt: cp?.slot.key || RollbackKey.zero.key
            });
            for await (const [key, value] of iterator) {
                checkpoints.push(value);
            }
            return checkpoints;
        },
        close: async () => {
            try {
                await db.close();
            } catch (error) {
                console.error('Error closing Checkpoints:', error);
            }
        }
    };
};
// export class CheckpointsC {
//     private checkpointStore: AbstractSublevel<
//         any,
//         any,
//         Buffer<ArrayBufferLike>,
//         CheckpointValue
//     >;
//     private checkpointsCount: number = 0;
//     private readonly checkpointsSize: number | null;

//     private constructor(
//         parent: Level<string, any>,
//         checkpointsSize: number | null
//     ) {
//         this.checkpointStore = parent.sublevel('checkpoints', {
//             valueEncoding: 'json',
//             keyEncoding: 'binary'
//         });
//         this.checkpointsSize = checkpointsSize;
//     }
//     static async create(
//         parent: Level<string, any>,
//         checkpointsSize: number | null = null
//     ): Promise<Checkpoints> {
//         const manager = new Checkpoints(parent, checkpointsSize);

//         await manager.checkpointStore.open();
//         return manager;
//     }

//     async close(): Promise<void> {
//         try {
//             await this.checkpointStore.close();
//         } catch (error) {
//             console.error('Error closing StateManager:', error);
//         }
//     }
//     async putCheckpoint(
//         checkpoint: Checkpoint,
//         consumedRefIds: string[]
//     ): Promise<void> {
//         await this.checkpointStore.put(checkpoint.slot.key, {
//             blockHash: checkpoint.blockHash,
//             consumedRefIds
//         });

//         this.checkpointsCount++;
//         await this.dropCheckpointsTail();
//     }
//     async getCheckpoint(slot: RollbackKey): Promise<BlockHash | undefined> {
//         return (await this.checkpointStore.get(slot.key))?.blockHash;
//     }

//     private async dropCheckpointsTail(): Promise<void> {
//         if (this.checkpointsSize === null) {
//             return; // No decimation if checkpointsSize is not set
//         }
//         if (this.checkpointsCount < 2 * this.checkpointsSize) {
//             return; // No need to decimate if we have fewer checkpoints than the size
//         }
//         const iterator = this.checkpointStore.iterator({
//             gte: RollbackKey.zero.key,
//             limit: this.checkpointsCount - this.checkpointsSize
//         });
//         for await (const [key] of iterator) {
//             await this.checkpointStore.del(key);
//             this.checkpointsCount--;
//         }
//     }

//     async getAllCheckpoints(): Promise<Checkpoint[]> {
//         const checkpoints: Checkpoint[] = [];
//         for await (const [key, value] of this.checkpointStore.iterator()) {
//             checkpoints.push({
//                 slot: RollbackKey.fromKey(key),
//                 blockHash: value.blockHash
//             });
//         }
//         return checkpoints;
//     }
//     async extractCheckpointsAfter(
//         cp: Checkpoint | null
//     ): Promise<CheckpointValue[]> {
//         const checkpoints: CheckpointValue[] = [];
//         const iterator = this.checkpointStore.iterator({
//             gt: cp?.slot.key || RollbackKey.zero.key
//         });
//         for await (const [key, value] of iterator) {
//             checkpoints.push(value);
//         }
//         return checkpoints;
//     }
// }
