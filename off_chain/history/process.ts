import { parseStateDatumCbor, TokenState } from '../token';
import { parseRequestCbor } from '../request';
import { rootHex } from '../lib';
import { SafeTrie, TrieManager } from '../trie';
import { DBRequest, mkOutputRefId, StateManager } from './store';

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
    async process(tx: any): Promise<void> {
        const minted = tx.mint?.[this.policyId];
        if (minted) {
            for (const asset of Object.keys(minted)) {
                if (minted[asset] == -1) {
                    // This is a token end request, delete the token state
                    await this.state.deleteToken(asset);
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
                return; // skip outputs not to the caging script address
            }
            const asset = output.value[this.policyId];
            if (asset) {
                const tokenId = Object.keys(asset)[0];

                const tokenState = parseStateDatumCbor(output.datum);

                if (tokenState) {
                    const trie = await this.tries.trie(tokenId);
                    await this.processTokenUpdate(
                        tokenId,
                        tokenState,
                        trie,
                        tx
                    );

                    const localRoot = rootHex(trie.root());
                    // Assert that roots are the same
                    if (localRoot !== tokenState.root) {
                        throw new Error(
                            `Root mismatch for asset ${tokenId}:
                            expected ${tokenState.root}, got ${localRoot}`
                        );
                    }
                    return;
                }
                return; // skip outputs with no state datum and our policyId
            }
            const request = parseRequestCbor(output.datum);
            if (!request) {
                return; // skip outputs with no request datum
            }

            await this.processRequest(
                {
                    tokenId: request.tokenId,
                    change: request.change,
                    owner: request.owner
                },
                tx,
                outputIndex
            );
        }
    }
    private inputToOutputRef(input: any): string {
        return mkOutputRefId({
            txHash: input.transaction.id,
            outputIndex: input.index
        });
    }
    async processRetract(tx: any): Promise<void> {
        const inputs = tx.inputs;
        for (const input of inputs) {
            const ref = this.inputToOutputRef(input);
            if (await this.state.getRequest(ref)) {
                this.state.deleteRequest(ref); // delete requests from inputs
            }
        }
    }
    private async processTokenUpdate(
        tokenId: string,
        state: TokenState,
        trie: SafeTrie,
        tx
    ) {
        for (const input of tx.inputs) {
            const ref = this.inputToOutputRef(input);
            const request = await this.state.getRequest(ref);
            if (!request) {
                continue; // skip inputs with no request
            }
            await trie.update(request.change);
        }
        await this.state.putToken(tokenId, {
            state,
            outputRef: { txHash: tx.id, outputIndex: 0 }
        });
    }
    private async processRequest(request: DBRequest, tx, outputIndex) {
        const ref = mkOutputRefId({
            txHash: tx.id,
            outputIndex
        });
        await this.state.putRequest(ref, request);
    }
    get stateManager(): StateManager {
        return this.state;
    }
}
