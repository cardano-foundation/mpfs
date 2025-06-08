import { deserializeDatum, UTxO } from '@meshsdk/core';
import { fromHex, OutputRef } from './lib';
import { Change } from './trie/change';

export type RequestCore = {
    tokenId: string;
    change: Change;
    owner: string;
};
export type Request = RequestCore & {
    ref: OutputRef;
};

export function parseRequestCbor(cbor: string): RequestCore | undefined {
    try {
        const datum = deserializeDatum(cbor);
        const stateDatum = datum.fields[0];
        const tokenIdP = stateDatum.fields[0];
        const tokenId = tokenIdP.fields[0].bytes;
        const op = stateDatum.fields[3].constructor as number;
        const opname = op == 0 ? 'insert' : 'delete';
        const value = fromHex(stateDatum.fields[3].fields[0].bytes);
        const key = fromHex(stateDatum.fields[2].bytes);
        const owner = stateDatum.fields[1].bytes;
        const change: Change = {
            key,
            value,
            operation: opname
        };
        return { tokenId, change, owner };
    } catch (error) {
        return undefined;
    }
}

export function parseRequest(utxo: UTxO) {
    if (!utxo.output.plutusData) {
        throw new Error('Plutus data is undefined');
    }
    return parseRequestCbor(utxo.output.plutusData);
}

export function selectUTxOsRequests(
    utxos: UTxO[],
    tokenIdWanted: string
): { requests: UTxO[] } {
    var requests: UTxO[] = [];

    for (const utxo of utxos) {
        const request = parseRequest(utxo);

        if (!request) continue;
        const { tokenId } = request;
        if (tokenIdWanted !== tokenId) continue;
        requests.push(utxo);
    }
    return { requests };
}

export function findRequests(utxos: UTxO[]): Request[] {
    const requests: Request[] = [];
    for (const utxo of utxos) {
        const requestCore = parseRequest(utxo);
        if (requestCore) {
            requests.push({
                ...requestCore,
                ref: utxo.input
            });
        }
    }
    return requests;
}
