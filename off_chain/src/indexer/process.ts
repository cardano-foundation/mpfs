import { parseStateDatumCbor } from '../token';
import { parseRequestCbor, RequestCore } from '../request';
import { State } from './state';
import { RollbackKey } from './state/rollbackkey';
import { inputToOutputRef } from '../lib';
import { UnslottedChange } from '../trie/change';
import { addSlot, TrieManager } from '../trie';
import { log } from '../log';

export type BlockCtx = {
    id: string;
    height: number | null;
};

export type Process = (
    slotNumber: RollbackKey,
    tx: any,
    block: BlockCtx
) => Promise<void>;

const countChanges = (
    changes: UnslottedChange[]
): { facts_added: number; facts_removed: number } => {
    let facts_added = 0;
    let facts_removed = 0;
    for (const c of changes) {
        if (c.type === 'insert') facts_added += 1;
        else if (c.type === 'delete') facts_removed += 1;
        else if (c.type === 'update') {
            facts_added += 1;
            facts_removed += 1;
        }
    }
    return { facts_added, facts_removed };
};

export const createProcess =
    (
        tries: TrieManager,
        state: State,
        address: string,
        policyId: string
    ): Process =>
    async (
        slotNumber: RollbackKey,
        tx: any,
        block: BlockCtx
    ): Promise<void> => {
        const indexerLog = log.child({
            component: 'indexer',
            slot: slotNumber.valueOf(),
            block_id: block.id,
            block_height: block.height,
            tx_hash: tx.id
        });
        const minted = tx.mint?.[policyId];
        if (minted) {
            for (const asset of Object.keys(minted)) {
                if (minted[asset] == -1) {
                    // This is a token end request, delete the token state
                    const existing = await state.tokens.getToken(asset);
                    await state.removeToken({
                        slot: slotNumber,
                        value: asset
                    });
                    indexerLog.info('token_state_transition', {
                        kind: 'remove',
                        token_id: asset,
                        before_root: existing?.state.root ?? null,
                        after_root: null
                    });
                }
            }
        }
        for (
            let outputIndex = 0;
            outputIndex < tx.outputs.length;
            outputIndex++
        ) {
            const output = tx.outputs[outputIndex];
            if (output.address !== address) {
                break; // skip outputs not to the caging script address
            }

            const asset = output.value[policyId];

            if (asset) {
                const tokenId = Object.keys(asset)[0];
                const tokenState = parseStateDatumCbor(output.datum);
                if (tokenState) {
                    const present = await state.tokens.getToken(tokenId);

                    if (present) {
                        let changes: UnslottedChange[] = [];
                        for (const input of tx.inputs) {
                            const ref = inputToOutputRef(input);

                            const request = await state.request(ref);
                            if (!request) {
                                continue; // skip inputs with no request
                            }
                            changes.push(request.core.change);
                            const current =
                                await state.tokens.getToken(tokenId);
                            if (!current) {
                                throw new Error(
                                    `Token ${tokenId} not found after update`
                                );
                            }
                        }

                        await state.updateToken({
                            slot: slotNumber,
                            value: {
                                changes: await addSlot(
                                    tries,
                                    tokenId,
                                    slotNumber.valueOf(),
                                    changes
                                ),
                                token: {
                                    tokenId,
                                    current: {
                                        outputRef: {
                                            txHash: tx.id,
                                            outputIndex
                                        },
                                        state: tokenState
                                    }
                                }
                            }
                        });
                        const { facts_added, facts_removed } =
                            countChanges(changes);
                        indexerLog.info('token_state_transition', {
                            kind: 'update',
                            token_id: tokenId,
                            before_root: present.state.root,
                            after_root: tokenState.root,
                            facts_added,
                            facts_removed
                        });
                    } else {
                        await state.addToken({
                            slot: slotNumber,
                            value: {
                                tokenId,
                                current: {
                                    outputRef: {
                                        txHash: tx.id,
                                        outputIndex
                                    },
                                    state: tokenState
                                }
                            }
                        });
                        indexerLog.info('token_state_transition', {
                            kind: 'add',
                            token_id: tokenId,
                            before_root: null,
                            after_root: tokenState.root
                        });
                    }
                }
            } else {
                const request = parseRequestCbor(output.datum);
                if (!request) {
                    break; // skip outputs with no request datum
                }
                const dbRequest: RequestCore = {
                    tokenId: request.tokenId,
                    change: request.change,
                    owner: request.owner
                };
                const ref = {
                    txHash: tx.id,
                    outputIndex
                };
                await state.addRequest({
                    slot: slotNumber,
                    value: { ref, core: dbRequest }
                });
            }
        }
        const inputs = tx.inputs;
        for (const input of inputs) {
            const ref = inputToOutputRef(input);
            state.removeRequest({ slot: slotNumber, value: ref }); // delete requests from inputs
        }
    };
