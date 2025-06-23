import { describe, it, expect } from 'vitest';
import { withTempDir } from '../test/lib';
import { withLevelDB } from '../trie.test';
import { createState, State, withState } from './state';
import { createTrieManager, TrieManager, withTrieManager } from '../trie';
import { createProcess } from './process';
import { Context, mkContext } from '../transactions/context';
import { createIndexer, withIndexer, Indexer } from './indexer';
import {
    Checkpoint,
    checkpointWithOriginGreaterThan
} from './state/checkpoints';
import { generateMnemonic } from 'bip39';
import { boot } from '../transactions/boot';
import { request } from '../transactions/request';
import { update } from '../transactions/update';
import { firstOutputRef, nullHash, sleep, WithOrigin } from '../lib';
import { end } from '../transactions/end';
import { Level } from 'level';
import {
    getCagingScript,
    topup,
    yaciProvider
} from '../transactions/context/lib';

describe('State and Indexer', () => {
    it('can restart with indexer', { timeout: 20000 }, async () => {
        const checkpointsSize = 10;
        const { address, policyId } = getCagingScript();
        let last: WithOrigin<Checkpoint> = 'origin';
        await withTempDir(async tmpDir => {
            await withLevelDB(tmpDir, async db => {
                const tries = await createTrieManager(db);
                const stateManager = await createState(
                    db,
                    tries,
                    checkpointsSize
                );
                const process = createProcess(stateManager, address, policyId);
                const indexer = await createIndexer(
                    stateManager,
                    process,
                    'http://localhost:1337'
                );
                await indexer.waitBlocks(0);
                await indexer.close();
                const cps = await stateManager.checkpoints.getIntersections();
                last = cps[0];
                await stateManager.close();
            });

            expect(last).toBeDefined();
            await sleep(2);

            await withLevelDB(tmpDir, async reopenedDb => {
                const tries = await createTrieManager(reopenedDb);
                const reopenedState = await createState(
                    reopenedDb,
                    tries,
                    checkpointsSize
                );
                const process = createProcess(reopenedState, address, policyId);

                const indexer = await createIndexer(
                    reopenedState,
                    process,
                    'http://localhost:1337'
                );
                await indexer.waitBlocks(1);
                await indexer.close();
                const finalPoints =
                    await reopenedState.checkpoints.getAllCheckpoints();
                expect(finalPoints).toContainEqual(last);
                const intersections =
                    await reopenedState.checkpoints.getIntersections();
                expect(
                    checkpointWithOriginGreaterThan(intersections[0], last)
                ).toBe(true);

                await reopenedState.close();
            });
        });
    });
    it(
        'can restart after rolling back the db by hand',
        { timeout: 20000, retry: 3 },
        async () => {
            const checkpointsSize = null;
            const { address, policyId } = getCagingScript();
            let rollback: WithOrigin<Checkpoint> = 'origin';
            await withTempDir(async tmpDir => {
                await withLevelDB(tmpDir, async db => {
                    const tries = await createTrieManager(db);
                    const stateManager = await createState(
                        db,
                        tries,
                        checkpointsSize
                    );
                    const process = createProcess(
                        stateManager,
                        address,
                        policyId
                    );
                    const indexer = await createIndexer(
                        stateManager,
                        process,
                        'http://localhost:1337'
                    );
                    await indexer.waitBlocks(0);
                    await indexer.close();
                    const cps =
                        await stateManager.checkpoints.getAllCheckpoints();
                    rollback = cps[Math.floor(Math.random() * cps.length)];
                    await stateManager.rollback(rollback.slot);
                    await stateManager.close();
                });

                expect(rollback).toBeDefined();
                await sleep(2);

                await withLevelDB(tmpDir, async reopenedDb => {
                    const tries = await createTrieManager(reopenedDb);
                    const reopenedState = await createState(
                        reopenedDb,
                        tries,
                        checkpointsSize
                    );
                    const process = createProcess(
                        reopenedState,
                        address,
                        policyId
                    );

                    const indexer = await createIndexer(
                        reopenedState,
                        process,
                        'http://localhost:1337'
                    );
                    await indexer.waitBlocks(1);
                    await indexer.close();
                    const finalPoints =
                        await reopenedState.checkpoints.getAllCheckpoints();
                    expect(finalPoints).toContainEqual(rollback);
                    const intersections =
                        await reopenedState.checkpoints.getIntersections();
                    expect(
                        checkpointWithOriginGreaterThan(
                            intersections[0],
                            rollback
                        )
                    ).toBe(true);

                    await reopenedState.close();
                });
            });
        }
    );
    it(
        'can restart after rolling back the db by hand and contains one empty token',
        { timeout: 60000, retry: 3 },
        async () => {
            let rollback: Checkpoint | undefined = undefined;
            let tokenId: string | undefined = undefined;
            await withTempDir(async tmpDir => {
                const mnemonic = generateMnemonic();
                // first run
                await withSetup(
                    mnemonic,
                    10, // checkpointsSize
                    tmpDir,
                    async (db, tries, state, indexer, context) => {
                        ({ value: tokenId } = await boot(context));
                        await indexer.waitBlocks(2);
                        await indexer.close(); // this is not very friendly with 'withIndexer', but we risk to lose the last checkpoint
                        const cps = await state.checkpoints.getAllCheckpoints();
                        rollback = cps[0]; // oldest possible checkpoint
                        await state.rollback(rollback.slot);
                    }
                );
                // restart with the same DB
                await withSetup(
                    mnemonic,
                    10,
                    tmpDir,
                    async (db, tries, state, indexer, context) => {
                        await indexer.waitBlocks(0);
                        const token = await state.tokens.getToken(tokenId!);
                        expect(token).toBeDefined();
                        const { signerHash } =
                            await context.signingWallet!.info();
                        expect(token!.state.owner).toEqual(signerHash);
                        expect(token!.state.root).toEqual(nullHash);
                    }
                );
            });
        }
    );
    type FullStateHash = {
        checkpointsHash: string;
        rollbacksHash: string;
        requestsHash: string;
        tokensHash: string;
        triesHash: string;
    };
    const fullStateHash = async (
        state: State,
        tries: TrieManager
    ): Promise<FullStateHash> => {
        return {
            checkpointsHash: await state.checkpoints.hash(),
            rollbacksHash: await state.rollbacks.hash(),
            requestsHash: await state.requests.hash(),
            tokensHash: await state.tokens.hash(),
            triesHash: await tries.hash()
        };
    };
    it(
        'can restart after rolling back the db by hand and contains one full token',
        { timeout: 60000, retry: 3 },
        async () => {
            let tokenId: string | undefined = undefined;
            let points: {
                checkpoint: Checkpoint;
                stateHash: {
                    checkpointsHash: string;
                    rollbacksHash: string;
                    requestsHash: string;
                    tokensHash: string;
                    triesHash: string;
                };
            }[] = [];
            const rollbackAndTest = async (
                state: State,
                tries: TrieManager
            ) => {
                const point = points.pop();
                if (!point) {
                    return false;
                }
                const { checkpoint, stateHash } = point;

                await state.rollback(checkpoint.slot);
                const newHash = await fullStateHash(state, tries);
                expect(newHash).toEqual(stateHash);
                return true;
            };
            await withTempDir(async tmpDir => {
                const mnemonic = generateMnemonic();

                await withSetup(
                    mnemonic,
                    null, // checkpointsSize
                    tmpDir,
                    async (db, tries, state, indexer, context) => {
                        const pushCheckpoint = async () => {
                            await indexer.waitBlocks(2);
                            const release = await context.pauseIndexer();
                            const stateHash = await fullStateHash(state, tries);
                            const checkpoint = await getFirstCheckpoint(state);
                            points.push({
                                checkpoint,
                                stateHash
                            });

                            release();
                        };
                        await pushCheckpoint();
                        ({ value: tokenId } = await boot(context));
                        await pushCheckpoint();
                        const { txHash } = await request(context, tokenId, {
                            type: 'insert',
                            key: 'key-1',
                            value: 'value-1'
                        });
                        const requestId = firstOutputRef(txHash);
                        await pushCheckpoint();
                        await update(context, tokenId, [requestId]);
                        await pushCheckpoint();
                        await end(context, tokenId);
                        await pushCheckpoint();
                    }
                );
                let shouldContinue: boolean = true;
                const restore = async () => {
                    await withSetup(
                        mnemonic,
                        null,
                        tmpDir,
                        async (db, tries, state, indexer, context) => {
                            await indexer.waitBlocks(0);
                            indexer.close();
                            shouldContinue = await rollbackAndTest(
                                state,
                                tries
                            );
                        }
                    );
                };
                while (shouldContinue) {
                    await restore();
                }
            });
        }
    );
});
const getFirstCheckpoint = async (state: State): Promise<Checkpoint> => {
    const checkpoints = await state.checkpoints.getAllCheckpoints();
    return checkpoints[checkpoints.length - 1];
};

const withSetup = async (
    maybeMnemonic: string | undefined,
    checkpointsSize: number | null,
    tmpDir: string,
    f: (
        db: Level<string, any>,
        tries: TrieManager,
        state: State,
        indexer: Indexer,
        context: Context
    ) => Promise<void>
): Promise<void> => {
    const { address, policyId } = getCagingScript();
    const provider = yaciProvider(
        `http://localhost:8080`,
        `http://localhost:10000`
    );
    const mnemonics = maybeMnemonic ? maybeMnemonic : generateMnemonic();
    await withLevelDB(tmpDir, async db => {
        await withTrieManager(db, async tries => {
            await withState(db, tries, checkpointsSize, null, async state => {
                const process = createProcess(state, address, policyId);
                await withIndexer(
                    state,
                    process,
                    'http://localhost:1337',
                    async indexer => {
                        const context = mkContext(
                            'http://localhost:1337',
                            provider,
                            mnemonics,
                            indexer,
                            state,
                            tries
                        );
                        const { walletAddress } =
                            await context.signingWallet!.info();
                        await topup(provider)(walletAddress, 10_000);
                        await indexer.waitBlocks(0);
                        await f(db, tries, state, indexer, context);
                    }
                );
            });
        });
    });
};
