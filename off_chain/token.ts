import { deserializeDatum, UTxO } from '@meshsdk/core';

export type TokenState = {
    owner: string;
    root: string;
};

export function parseStateDatumCbor(cbor: string): TokenState | undefined {
    try {
        const datum = deserializeDatum(cbor);
        const stateDatum = datum.fields[0];
        const owner = stateDatum.fields[0].bytes;
        const root = stateDatum.fields[1].bytes;
        return { owner, root };
    } catch (error) {
        return undefined;
    }
}
