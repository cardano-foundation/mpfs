import { describe, it, expect } from 'vitest';
import { RollbackKey } from './store/rollbackkey';
import { Checkpoint, StateManager } from './store';
import { Level } from 'level';
import { AbstractSublevel } from 'abstract-level';
import { mkOutputRefId, unmkOutputRefId } from './store';
import { rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as fc from 'fast-check';

describe('level-db', () => {
    it('supports Buffer as keys', async () => {
        const { tmpDir, clean } = withTempDir();
        try {
            const db = new Level<Buffer, string>(tmpDir, {
                valueEncoding: 'utf8',
                keyEncoding: 'binary'
            });
            const key = Buffer.from('test-key');
            const value = 'test-value';
            await db.put(key, value);
            const retrievedValue = await db.get(key);
            expect(retrievedValue).toBe(value);
            await db.del(key);
            await db.close();
        } finally {
            clean(); // Cleanup tmpDir
        }
    });
    it('Return keys in lexicographic order for Buffer keys', async () => {
        fc.assert(
            fc.asyncProperty(
                fc.array(fc.string({ minLength: 1, maxLength: 10 }), {
                    minLength: 1,
                    maxLength: 100
                }),
                async keys => {
                    const { tmpDir, clean } = withTempDir();
                    try {
                        const db = new Level<Buffer, string>(tmpDir, {
                            valueEncoding: 'utf8',
                            keyEncoding: 'binary'
                        });
                        const uniqueKeys = Array.from(new Set(keys)).sort();
                        // Ensure keys are unique and sorted
                        const bufferKeys = uniqueKeys.map(k => Buffer.from(k));
                        for (const key of bufferKeys) {
                            await db.put(key, 'value');
                        }
                        const retrievedKeys: Buffer[] = [];
                        for await (const key of db.keys()) {
                            retrievedKeys.push(key);
                        }
                        expect(retrievedKeys).toEqual(
                            bufferKeys.sort(Buffer.compare)
                        );
                        await db.close();
                    } finally {
                        clean(); // Cleanup tmpDir
                    }
                }
            )
        );
    });
    it('Returns keys in lexicographic order for RollbackKeys', async () => {
        fc.assert(
            fc.asyncProperty(
                fc.array(fc.integer({ min: 0, max: 2 ^ (64 - 1) }), {
                    minLength: 100,
                    maxLength: 1000
                }),
                async values => {
                    const { tmpDir, clean } = withTempDir();
                    try {
                        const db = new Level<Buffer, string>(tmpDir, {
                            valueEncoding: 'utf8',
                            keyEncoding: 'binary'
                        });
                        const uniqueValues = Array.from(new Set(values)).sort();
                        // Ensure values are unique and sorted
                        const rollbackKeys = uniqueValues.map(
                            v => new RollbackKey(v)
                        );
                        for (const key of rollbackKeys) {
                            await db.put(key.key, 'value');
                        }
                        const retrievedKeys: Buffer[] = [];
                        for await (const key of db.keys()) {
                            retrievedKeys.push(key);
                        }
                        expect(retrievedKeys).toEqual(
                            retrievedKeys.sort(Buffer.compare)
                        );
                        await db.close();
                    } finally {
                        clean(); // Cleanup tmpDir
                    }
                }
            )
        );
    });
});
const genCheckpoints = (min, max) =>
    fc
        .tuple(
            fc.tuple(
                fc.integer({ min: 0, max: 100000 }), // Starting value
                fc.array(fc.integer({ min: 1, max: 3 }), {
                    minLength: min,
                    maxLength: max
                }) // Positive increments
            ),
            fc.string({ minLength: 5, maxLength: 10 }).map(s => mkHash(s)) // Random block hash
        )
        .map(([[start, increments], hash]) => {
            let current = start;
            const vector: Checkpoint[] = [];
            for (const inc of increments) {
                current += inc; // Add positive increment for strict increase
                vector.push({
                    slot: new RollbackKey(current),
                    blockHash: hash
                });
            }
            return vector;
        });

function mkHash(string: string): string {
    return Buffer.from(string).toString('base64');
}
describe('mkOutputRefId and unmkOutputRefId', () => {
    it('should correctly generate and parse output reference IDs', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 4, maxLength: 64 }), // Random transaction hash with base16 chars
                fc.integer({ min: 0 }), // Random output index
                (txHashS, outputIndex) => {
                    const txHash = mkHash(txHashS);
                    const outputRef = { txHash, outputIndex };
                    const refId = mkOutputRefId(outputRef);
                    const parsedRef = unmkOutputRefId(refId);
                    expect(parsedRef).toEqual(outputRef);
                }
            )
        );
    });
});
describe('StateManager Class', () => {
    it('should create a StateManager instance with correct properties', () => {
        const { tmpDir, clean } = withTempDir();
        try {
            const checkpointsSize = 100;
            const stateManager = new StateManager(tmpDir, checkpointsSize);

            expect(stateManager).toBeInstanceOf(StateManager);
            expect(stateManager['stateStore']).toBeInstanceOf(Level);
            expect(stateManager['tokenStore']).toBeInstanceOf(AbstractSublevel);
            expect(stateManager['requestStore']).toBeInstanceOf(
                AbstractSublevel
            );
            expect(stateManager['rollbackStore']).toBeInstanceOf(
                AbstractSublevel
            );
            expect(stateManager['checkpointStore']).toBeInstanceOf(
                AbstractSublevel
            );
            expect(stateManager['checkpointsCount']).toBe(0);
            expect(stateManager['checkpointsSize']).toBe(checkpointsSize);
        } finally {
            clean();
        }
    });

    it('should generate and parse output reference IDs correctly', () => {
        const outputRef = { txHash: 'abc123', outputIndex: 0 };
        const refId = mkOutputRefId(outputRef);
        expect(refId).toBe('abc123-0');

        const parsedRef = unmkOutputRefId(refId);
        expect(parsedRef).toEqual(outputRef);
    });
    it('should store and retrieve checkpoints', async () => {
        const { tmpDir, clean } = withTempDir();
        const dbPath = tmpDir;
        const checkpointsSize = 10;
        const stateManager = new StateManager(dbPath, checkpointsSize);
        const checkpoint = {
            slot: new RollbackKey(123456789),
            blockHash: 'blockhash123'
        };

        try {
            await stateManager.putCheckpoint(checkpoint);
            const retrievedHash = await stateManager.getAllCheckpoints();
            expect(retrievedHash).toContainEqual(checkpoint);
        } finally {
            clean();
        }
    });
    it('should store checkpoints and retrieve them in order', async () => {
        await fc.assert(
            fc.asyncProperty(genCheckpoints(0, 100), async checkpoints => {
                const { tmpDir, clean } = withTempDir();
                const dbPath = tmpDir;
                const checkpointsSize = null;
                const stateManager = new StateManager(dbPath, checkpointsSize);

                try {
                    for (const checkpoint of checkpoints) {
                        await stateManager.putCheckpoint(checkpoint);
                    }

                    const retrievedCheckpoints =
                        await stateManager.getAllCheckpoints();
                    expect(retrievedCheckpoints).toEqual(checkpoints);
                } finally {
                    clean();
                }
            }),
            { numRuns: 100, verbose: true }
        );
    }, 30000);
    it('should maintain a population at most double than requested and at least the requested size', async () => {
        await fc.assert(
            fc.asyncProperty(genCheckpoints(20, 1000), async checkpoints => {
                const { tmpDir, clean } = withTempDir();
                const dbPath = tmpDir;
                const checkpointsSize = 20;
                const stateManager = new StateManager(dbPath, checkpointsSize);

                try {
                    for (const checkpoint of checkpoints) {
                        await stateManager.putCheckpoint(checkpoint);
                    }

                    const retrievedCheckpoints =
                        await stateManager.getAllCheckpoints();

                    expect(retrievedCheckpoints.length).toBeLessThan(
                        checkpointsSize * 2
                    );
                    expect(retrievedCheckpoints.length).toBeGreaterThanOrEqual(
                        checkpointsSize
                    );
                } finally {
                    clean(); // Cleanup tmpDir
                }
            }),
            { numRuns: 10, verbose: true }
        );
    }, 30000);
});

function withTempDir(): { tmpDir: string; clean: () => void } {
    const tmpDir = join(
        tmpdir(),
        `testdb-${Math.random().toString(36).substring(2, 15)}`
    );
    rmSync(tmpDir, { recursive: true, force: true }); // Ensure the directory is clean
    return {
        tmpDir,
        clean: () => rmSync(tmpDir, { recursive: true, force: true })
    };
}
