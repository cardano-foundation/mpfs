import { parseStateDatumCbor } from '../token';
import { parseRequestCbor, RequestCore } from '../request';
import { TrieManager } from '../trie';
import { State } from './state';
import { RollbackKey } from './state/rollbackkey';
import { OutputRef } from '../lib';

export class Process {
    private state: State;
    private tries: TrieManager;
    private address: string;
    private policyId: string;

    constructor(
        state: State,
        tries: TrieManager,
        address: string,
        policyId: string
    ) {
        this.state = state;
        this.tries = tries;
        this.address = address;
        this.policyId = policyId;
    }
    get trieManager(): TrieManager {
        return this.tries;
    }
    async process(slotNumber: RollbackKey, tx: any): Promise<void> {
        const minted = tx.mint?.[this.policyId];
        if (minted) {
            for (const asset of Object.keys(minted)) {
                if (minted[asset] == -1) {
                    // This is a token end request, delete the token state
                    await this.state.removeToken({
                        slot: slotNumber,
                        value: asset
                    });
                }
            }
        }
        for (
            let outputIndex = 0;
            outputIndex < tx.outputs.length;
            outputIndex++
        ) {
            const output: {
                address: string;
                value: Record<string, any>;
                datum: any;
            } = tx.outputs[outputIndex];

            if (output.address !== this.address) {
                break; // skip outputs not to the caging script address
            }

            const asset = output.value[this.policyId];

            if (asset) {
                const tokenId = Object.keys(asset)[0];
                const tokenState = parseStateDatumCbor(output.datum);
                if (tokenState) {
                    const present = await this.state.tokens.getToken(tokenId);

                    if (present) {
                        for (const input of tx.inputs) {
                            const ref = Process.inputToOutputRef(input);

                            const request = await this.state.request(ref);
                            if (!request) {
                                continue; // skip inputs with no request
                            }
                            await this.state.updateToken({
                                slot: slotNumber,
                                value: {
                                    change: request.core.change,
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
                        }
                    } else {
                        await this.state.addToken({
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
                await this.state.addRequest({
                    slot: slotNumber,
                    value: { ref, core: dbRequest }
                });
            }
        }
        const inputs = tx.inputs;
        for (const input of inputs) {
            const ref = Process.inputToOutputRef(input);
            this.state.removeRequest({ slot: slotNumber, value: ref }); // delete requests from inputs
        }
    }
    static inputToOutputRef(input: any): OutputRef {
        return {
            txHash: input.transaction.id,
            outputIndex: input.index
        };
    }
    // get stateManager(): State {
    //     return this.state;
}
