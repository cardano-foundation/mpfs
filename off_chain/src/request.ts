/**
 * Request parsing and handling for MPF modification requests.
 *
 * This module provides utilities for:
 * - Parsing RequestDatum from CBOR-encoded plutus data
 * - Extracting and filtering requests from UTxOs
 * - Converting on-chain request data to off-chain representations
 * @module
 */

import { deserializeDatum, UTxO } from '@meshsdk/core';
import { fromHex, OutputRef } from './lib';
import { UnslottedChange } from './trie/change';

/**
 * Core data of a request without its location.
 *
 * Corresponds to the `Request` type in the Aiken validator:
 * - tokenId: asset name of the target caged token
 * - change: the MPF operation to perform
 * - owner: verification key hash of the request creator
 */
export type RequestCore = {
    tokenId: string;
    change: UnslottedChange;
    owner: string;
};

/**
 * A complete request including its UTxO location.
 */
export type Request = {
    core: RequestCore;
    ref: OutputRef;
};

/**
 * Parse a RequestDatum from CBOR-encoded plutus data.
 *
 * The datum structure expected:
 * ```
 * RequestDatum(Request {
 *   requestToken: TokenId { assetName },
 *   requestOwner: ByteArray,
 *   requestKey: ByteArray,
 *   requestValue: Operation
 * })
 * ```
 *
 * Operation variants:
 * - 0: Insert(value)
 * - 1: Delete(value)
 * - 2: Update(oldValue, newValue)
 *
 * @param cbor - The CBOR-encoded datum string
 * @returns The parsed RequestCore, or undefined if parsing fails
 */
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

/**
 * Parse a request from a UTxO's plutus data.
 *
 * @param utxo - The UTxO containing the request datum
 * @returns The parsed RequestCore, or undefined if parsing fails
 * @throws Error if the UTxO has no plutus data
 */
export function parseRequest(utxo: UTxO) {
    if (!utxo.output.plutusData) {
        throw new Error('Plutus data is undefined');
    }
    return parseRequestCbor(utxo.output.plutusData);
}

/**
 * Filter UTxOs to find requests targeting a specific token.
 *
 * @param utxos - List of UTxOs to search
 * @param tokenIdWanted - The asset name of the target token
 * @returns Object containing the filtered list of request UTxOs
 */
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

/**
 * Extract all valid requests from a list of UTxOs.
 *
 * @param utxos - List of UTxOs to search
 * @returns Array of Request objects (core data + location)
 */
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
