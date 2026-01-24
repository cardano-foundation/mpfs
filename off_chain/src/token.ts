/**
 * Token state parsing and handling for caged tokens.
 *
 * This module provides utilities for:
 * - Parsing StateDatum from CBOR-encoded plutus data
 * - Extracting token state (owner and MPF root) from UTxOs
 * @module
 */

import { deserializeDatum, UTxO } from '@meshsdk/core';
import { OutputRef } from './lib';

/**
 * The state of a caged token.
 *
 * Corresponds to the `State` type in the Aiken validator:
 * - owner: verification key hash of the token owner
 * - root: current Merkle Patricia Forestry root hash
 */
export type TokenState = {
    owner: string;
    root: string;
};

/**
 * A caged token with its current state and location.
 */
export type CurrentToken = {
    state: TokenState;
    outputRef: OutputRef;
};

/**
 * Parse a StateDatum from CBOR-encoded plutus data.
 *
 * The datum structure expected:
 * ```
 * StateDatum(State { owner: ByteArray, root: ByteArray })
 * ```
 *
 * @param cbor - The CBOR-encoded datum string
 * @returns The parsed TokenState, or undefined if parsing fails
 */
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
