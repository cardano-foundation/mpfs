import {
    applyParamsToScript,
    Asset,
    builtinByteString,
    conStr0,
    deserializeAddress,
    deserializeDatum,
    integer,
    resolveScriptHash,
    serializePlutusScript,
    UTxO
} from '@meshsdk/core';
import blueprint from './plutus.json';
import { Context } from './context';
import { OutputRef, selectUTxOWithToken, tokenIdParts } from './lib';

export function getCagingScript(context: Context) {
    const { log } = context;
    const cbor = applyParamsToScript(
        blueprint.validators[0].compiledCode, // crap
        []
    );
    const address = serializePlutusScript({
        code: cbor,
        version: 'V3'
    }).address;
    const { scriptHash } = deserializeAddress(address);
    const caging = {
        cbor,
        address,
        scriptHash
    };
    context.log('caging-script', caging);
    return caging;
}

export function getMintingScript(context: Context, cageScriptHash: string) {
    const cbor = applyParamsToScript(
        blueprint.validators[2].compiledCode, // crap
        [builtinByteString(cageScriptHash)],
        'JSON'
    );
    const { address } = serializePlutusScript(
        { code: cbor, version: 'V3' },
        undefined
    );

    const policyId = resolveScriptHash(cbor, 'V3');
    const minting = {
        cbor,
        address,
        policyId
    };
    context.log('minting-script', minting);
    return minting;
}

export function getThresholdScript(
    context: Context,
    tokenId: string,
    threshold: number
) {
    const { log } = context;
    const { policyId, assetName } = tokenIdParts(tokenId);
    const cbor = applyParamsToScript(
        blueprint.validators[4].compiledCode, // crap
        [
            conStr0([
                builtinByteString(policyId),
                builtinByteString(assetName)
            ]),
            integer(threshold)
        ],
        'JSON'
    );
    const { address } = serializePlutusScript(
        { code: cbor, version: 'V3' },
        undefined
    );
    const script = { cbor, address };
    context.log('threshold-script', script);
    return script;
}

export async function fetchTokenIdUTxO(
    context: Context,
    cageAddress: string,
    tokenId: string
): Promise<{ state: UTxO; cageUTxOs: UTxO[] }> {
    const { log, fetchAddressUTxOs } = context;
    const cageUTxOs = await fetchAddressUTxOs(cageAddress);
    log('cage-utxos', cageUTxOs);

    const state = selectUTxOWithToken(cageUTxOs, tokenId);
    if (!state) {
        throw new Error('No state UTxO found');
    }
    return { state, cageUTxOs };
}

export function extractPlutusData(utxo: UTxO): any {
    if (!utxo.output.plutusData) {
        throw new Error('Plutus data is undefined');
    }
    return deserializeDatum(utxo.output.plutusData);
}

export function parseStateDatum(utxo: UTxO) {
    try {
        const datum = extractPlutusData(utxo);
        const stateDatum = datum.fields[0];
        const owner = stateDatum.fields[0].bytes;
        const root = stateDatum.fields[1].bytes;
        return { owner, root };
    } catch (error) {
        return undefined;
    }
}

export const toHex = (buffer: Buffer): string => buffer.toString('hex');
export function fromHex(hex: string) {
    const buffer = Buffer.from(hex, 'hex');
    return buffer.toString('utf-8');
}

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
        const key = stateDatum.fields[2].list.map((item: any) =>
            fromHex(item.bytes)
        );
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

export async function findTokens(context: Context) {
    const { log, fetchAddressUTxOs } = context;
    const caging = getCagingScript(context);
    const utxos = await fetchAddressUTxOs(caging.address);
    log('cage-utxos', utxos);

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
    log('states', states);
    return states;
}

export type Request = {
    tokenId: string;
    key: string[];
    value: string;
    operation: string;
    owner: string;
    ref: OutputRef;
};
export async function findRequests(context: Context) {
    const { log, fetchAddressUTxOs } = context;
    const caging = getCagingScript(context);
    const utxos = await fetchAddressUTxOs(caging.address);

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
                ref: {txHash: utxo.input.txHash,
                    outputIndex: utxo.input.outputIndex
                }
            });
        }
    }
    log('requests', requests);
    return requests;
}

export async function findTokenIdRequests(context: Context, tokenId: string) {
    const requests = await findRequests(context);
    return requests.filter(request => request.tokenId === tokenId);
}
