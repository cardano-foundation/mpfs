import { deserializeDatum, UTxO } from '@meshsdk/core';
import { fromHex, OutputRef } from './lib';
import { UnslottedChange } from './trie/change';

export type RequestCore = {
    tokenId: string;
    change: UnslottedChange;
    owner: string;
};
export type Request = {
    core: RequestCore;
    ref: OutputRef;
};

// we pass the slot number of the change-request tx but we would like to store the slot number of the state change
export function parseRequestCbor(cbor: string): RequestCore | undefined {
    try {
        const datum = deserializeDatum(cbor);
        const stateDatum = datum.fields[0];
        const tokenIdP = stateDatum.fields[0];
        const tokenId = tokenIdP.fields[0].bytes;
        const op = stateDatum.fields[3].constructor as number;
        const key = fromHex(stateDatum.fields[2].bytes);
        const owner = stateDatum.fields[1].bytes;
        let change: UnslottedChange;
        switch (op) {
            case 0:
                change = {
                    type: 'insert',
                    key,
                    newValue: fromHex(stateDatum.fields[3].fields[0].bytes)
                };
                break;
            case 1:
                change = {
                    type: 'delete',
                    key,
                    oldValue: fromHex(stateDatum.fields[3].fields[0].bytes)
                };
                break;
            case 2:
                change = {
                    type: 'update',
                    key,
                    oldValue: fromHex(stateDatum.fields[3].fields[0].bytes),
                    newValue: fromHex(stateDatum.fields[3].fields[1].bytes)
                };
                break;
            default:
                throw new Error(`Unknown operation: ${op}`);
        }
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
                core: requestCore,
                ref: utxo.input
            });
        }
    }
    return requests;
}
