import { Asset, deserializeDatum, UTxO } from '@meshsdk/core';
import { findRequests } from './request';
import { selectUTxOWithToken } from './lib';

export function parseStateDatumCbor(cbor: string) {
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
export function parseStateDatum(utxo: UTxO) {
    if (!utxo.output.plutusData) {
        throw new Error('Plutus data is undefined');
    }
    return parseStateDatumCbor(utxo.output.plutusData);
}

const selectTokenId: (assets: Asset[]) => string | undefined = (
    assets: Asset[]
) => {
    for (const asset of assets) {
        if (asset.unit !== 'lovelace') {
            return asset.unit;
        }
    }
    return undefined;
};

export function findTokens(
    utxos: UTxO[]
): { tokenId: string; owner: string; root: string }[] {
    const states: { tokenId: string; owner: string; root: string }[] = [];
    for (const utxo of utxos) {
        const state = parseStateDatum(utxo);
        if (state) {
            const tokenId = selectTokenId(utxo.output.amount);
            if (tokenId) {
                states.push({
                    tokenId,
                    owner: state.owner,
                    root: state.root
                });
            }
        }
    }
    return states;
}

export function findTokenIdRequests(utxos: UTxO[], tokenId: string) {
    const requests = findRequests(utxos);
    return requests.filter(request => request.tokenId === tokenId);
}

export function tokenOfTokenId(
    utxos: UTxO[],
    tokenId: string
): { state: UTxO; token: { owner: string; root: string } } {
    const state = selectUTxOWithToken(utxos, tokenId);
    if (!state) {
        throw new Error('No state UTxO found');
    }
    const token = parseStateDatum(state);
    if (!token) {
        throw new Error('No token found in state UTxO');
    }
    return { state, token };
}
