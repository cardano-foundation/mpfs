import { Change, invertChange } from '../trie/change';
import { AbstractSublevel } from 'abstract-level';
import { RollbackKey } from './store/rollbackkey';
import { Checkpoints, createCheckpoints } from './store/checkpoints';
import { createTokens, DBTokenState, Tokens } from './store/tokens';
import { createRequests, DBRequest, Requests } from './store/requests';
import { createRollbacks, Rollbacks } from './store/rollbacks';

export type StateChange =
    | { type: 'AddRequest'; outputRef: string; request: DBRequest }
    | { type: 'RemoveRequest'; outputRef: string }
    | { type: 'AddToken'; tokenId: string; state: DBTokenState }
    | { type: 'RemoveToken'; tokenId: string }
    | { type: 'UpdateToken'; change: Change };

export class StateManager {
    private stateStore: AbstractSublevel<any, any, string, any>;
    public tokens: Tokens;
    public requests: Requests;
    public rollbacks: Rollbacks;
    public checkpoints: Checkpoints;

    private constructor(
        stateStore: AbstractSublevel<any, any, string, any>,
        tokens: Tokens,
        requests: Requests,
        rollbacks: Rollbacks,
        checkpoints: Checkpoints
    ) {
        this.stateStore = stateStore;
        this.tokens = tokens;
        this.requests = requests;
        this.rollbacks = rollbacks;
        this.checkpoints = checkpoints;
    }
    static async create(
        parent: AbstractSublevel<any, any, string, any>,
        checkpointsSize: number | null = null
    ): Promise<StateManager> {
        const stateStore = parent.sublevel('state', {
            valueEncoding: 'json'
        });
        await stateStore.open();
        const tokens = await createTokens(stateStore);
        const requestStore = await createRequests(stateStore);
        const rollbacks = await createRollbacks(stateStore);
        const checkpoints = await createCheckpoints(
            stateStore,
            checkpointsSize
        );
        return new StateManager(
            stateStore,
            tokens,
            requestStore,
            rollbacks,
            checkpoints
        );
    }

    async close(): Promise<void> {
        try {
            await this.rollbacks.close();
            await this.requests.close();
            await this.tokens.close();
            await this.checkpoints.close();
            await this.stateStore.close();
        } catch (error) {
            console.error('Error closing StateManager:', error);
        }
    }

    async putRequest(
        rollbackKey: RollbackKey,
        outputRef: string,
        value: DBRequest
    ): Promise<void> {
        await this.requests.put(outputRef, value);
        await this.rollbacks.put(rollbackKey, {
            type: 'RemoveRequest',
            outputRef
        });
    }

    async deleteRequest(
        rollbackKey: RollbackKey,
        outputRef: string
    ): Promise<void> {
        const request = await this.requests.get(outputRef);
        if (!request) {
            throw new Error(
                `Request with output reference ${outputRef} does not exist.`
            );
        }
        await this.requests.delete(outputRef);
        await this.rollbacks.put(rollbackKey, {
            type: 'AddRequest',
            outputRef,
            request
        });
    }
}
