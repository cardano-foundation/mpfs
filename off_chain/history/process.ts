import { parseStateDatumCbor, TokenState } from '../token';
import { parseRequestCbor } from '../request';
import { TrieManager } from '../trie';
import { StateManager } from './store';
import { RollbackKey } from './store/rollbackkey';
import { mkOutputRefId } from '../outputRef';
import { SafeTrie } from '../trie/safeTrie';

export class Process {
    private state: StateManager;
    private tries: TrieManager;
    private address: string;
    private policyId: string;

    constructor(
        state: StateManager,
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
                    await this.state.tokens.deleteToken(asset);
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

                async function onTrie(
                    state,
                    trie: SafeTrie,
                    tokenState: TokenState
                ) {
                    for (const input of tx.inputs) {
                        const ref = Process.inputToOutputRef(input);
                        const request = await state.getRequest(ref);
                        if (!request) {
                            continue; // skip inputs with no request
                        }
                        await trie.update(request.change);
                        await state.storeRollbackChange(
                            slotNumber,
                            request.change
                        );
                    }
                    await state.tokens.putToken(tokenId, {
                        outputRef: { txHash: tx.id, outputIndex },
                        state: tokenState
                    });
                }
                const tokenState = parseStateDatumCbor(output.datum);
                if (tokenState) {
                    await this.tries.trie(tokenId, async trie => {
                        await onTrie(this.state, trie, tokenState);
                    });
                    break;
                }
                break; // skip outputs with no state datum and our policyId
            }
            const request = parseRequestCbor(output.datum);
            if (!request) {
                break; // skip outputs with no request datum
            }
            const dbRequest = {
                tokenId: request.tokenId,
                change: request.change,
                owner: request.owner
            };
            const ref = mkOutputRefId({
                txHash: tx.id,
                outputIndex
            });
            await this.state.putRequest(slotNumber, ref, dbRequest);
        }
        const inputs = tx.inputs;
        for (const input of inputs) {
            const ref = Process.inputToOutputRef(input);
            if (await this.state.getRequest(ref)) {
                this.state.deleteRequest(slotNumber, ref); // delete requests from inputs
            }
        }
    }
    static inputToOutputRef(input: any): string {
        return mkOutputRefId({
            txHash: input.transaction.id,
            outputIndex: input.index
        });
    }
    get stateManager(): StateManager {
        return this.state;
    }
}
