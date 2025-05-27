import { UTxO } from '@meshsdk/core';
import { extractPlutusData, fromHex, OutputRef } from './lib';

export type Request = {
    tokenId: string;
    key: string;
    value: string;
    operation: string;
    owner: string;
    ref: OutputRef;
};

export function parseRequest(utxo: UTxO) {
    try {
        const datum = extractPlutusData(utxo);
        const stateDatum = datum.fields[0];
        const tokenIdP = stateDatum.fields[0];
        const policyId = tokenIdP.fields[0].bytes;
        const assetName = tokenIdP.fields[1].bytes;
        const op = stateDatum.fields[3].constructor as number;
        const opname = op == 0 ? 'insert' : 'delete';
        const value = fromHex(stateDatum.fields[3].fields[0].bytes);
        const key = fromHex(stateDatum.fields[2].bytes);
        const owner = stateDatum.fields[1].bytes;
        return { policyId, assetName, key, value, operation: opname, owner };
    } catch (error) {
        return undefined;
    }
}

export function selectUTxOsRequests(
    utxos: UTxO[],
    tokenId: string
): { requests: UTxO[] } {
    var requests: UTxO[] = [];

    for (const utxo of utxos) {
        const request = parseRequest(utxo);
        if (!request) continue;
        const { policyId, assetName, value } = request;
        if (policyId + assetName !== tokenId) continue;
        requests.push(utxo);
    }
    return { requests };
}

export function findRequests(utxos: UTxO[]): Request[] {
    const requests: Request[] = [];
    for (const utxo of utxos) {
        const request = parseRequest(utxo);
        if (request) {
            requests.push({
                tokenId: request.policyId + request.assetName,
                key: request.key,
                value: request.value,
                operation: request.operation,
                owner: request.owner,
                ref: {
                    txHash: utxo.input.txHash,
                    outputIndex: utxo.input.outputIndex
                }
            });
        }
    }
    return requests;
}
