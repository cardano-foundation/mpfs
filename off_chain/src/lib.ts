/**
 * Core utilities for the MPF Cage off-chain code.
 *
 * This module provides:
 * - Output reference handling (matching on-chain Aiken representation)
 * - Asset name computation (must match on-chain logic)
 * - UTxO filtering and token extraction
 * - Hex encoding/decoding utilities
 * @module
 */

import { UTxO } from '@meshsdk/core';
import { createHash } from 'crypto';

/**
 * A reference to a specific transaction output (UTxO).
 * This is the off-chain representation of Aiken's `OutputReference`.
 */
export type OutputRef = {
    txHash: string;
    outputIndex: number;
};

/**
 * Compare two output references for equality.
 */
export function outputRefEqual(a: OutputRef, b: OutputRef): boolean {
    return a.txHash === b.txHash && a.outputIndex === b.outputIndex;
}

/**
 * Compute the asset name from an output reference.
 *
 * This MUST match the Aiken implementation in `lib.ak`:
 * - Concatenate transaction ID (32 bytes) with output index (2 bytes big-endian)
 * - SHA256 hash the result
 *
 * This ensures uniqueness since each output reference can only be consumed once.
 *
 * @param outputRef - The output reference to derive the asset name from
 * @returns The hex-encoded SHA256 hash (64 characters)
 */
export function assetName(outputRef: OutputRef) {
    const { txHash, outputIndex: outputIndex } = outputRef;
    const transaction_id_bytes = Buffer.from(txHash, 'hex');
    const outputIndexBytes = Buffer.alloc(2);
    outputIndexBytes.writeUInt16BE(outputIndex, 0);
    const bytes = Buffer.concat([transaction_id_bytes, outputIndexBytes]);
    return createHash('sha256').update(bytes).digest().toString('hex');
}

/**
 * Split a Cardano unit string into policy ID and asset name.
 *
 * @param unit - The unit string (policy ID + asset name concatenated)
 * @returns Object with policyId (first 56 chars) and assetName (remainder)
 */
export function unitParts(unit: string) {
    const policyId = unit.slice(0, 56);
    const assetName = unit.slice(56);
    return { policyId, assetName };
}

/**
 * Check if a UTxO contains a specific token.
 *
 * @param utxo - The UTxO to check
 * @param tokenId - The full token identifier (policyId + assetName)
 * @returns True if the token is present in the UTxO's value
 */
export function containsToken(utxo: UTxO, tokenId: string) {
    const value = utxo.output.amount.find((v: any) => v.unit === tokenId);
    return value !== undefined;
}

/**
 * Find a UTxO containing a specific token from a list.
 *
 * @param utxos - List of UTxOs to search
 * @param tokenId - The full token identifier to find
 * @returns The first UTxO containing the token, or undefined
 */
export function selectUTxOWithToken(utxos: UTxO[], tokenId: string) {
    return utxos.find(utxo => containsToken(utxo, tokenId));
}

/**
 * Validate and parse a port number from an environment variable.
 *
 * @param port - The port string to validate
 * @param name - Name of the env var for error messages (default: 'PORT')
 * @returns The validated port number
 * @throws Error if the port is missing, not a number, or out of range
 */
export function validatePort(port: string | undefined, name: string = 'PORT') {
    if (!port) {
        throw new Error(`${name} env var is not set`);
    }
    const portNumber = parseInt(port, 10);
    if (isNaN(portNumber)) {
        throw new Error(`${name} env var is not a number`);
    }
    if (portNumber < 1024 || portNumber > 65535) {
        throw new Error(`${name} env var is not a valid port number`);
    }
    return portNumber;
}

/** 64-character zero hash used as placeholder for empty/null roots */
export const nullHash =
    '0000000000000000000000000000000000000000000000000000000000000000';

/** Convert a Buffer to hex string */
export const toHex = (buffer: Buffer): string => buffer.toString('hex');

/**
 * Convert an MPF root to hex, returning nullHash if undefined.
 *
 * @param root - The root buffer, or undefined for empty trees
 * @returns Hex string of the root, or nullHash for undefined
 */
export const rootHex = (root: Buffer | undefined): string => {
    if (!root) {
        return nullHash;
    }
    return toHex(root);
};

/**
 * Decode a hex string to UTF-8 text.
 *
 * @param hex - The hex-encoded string
 * @returns The decoded UTF-8 string
 */
export function fromHex(hex: string) {
    const buffer = Buffer.from(hex, 'hex');
    return buffer.toString('utf-8');
}

/**
 * Convert a Cardano input object to an OutputRef.
 *
 * @param input - Input object with transaction.id and index properties
 * @returns OutputRef with txHash and outputIndex
 */
export const inputToOutputRef = (input: any): OutputRef => {
    return {
        txHash: input.transaction.id,
        outputIndex: input.index
    };
};

/**
 * Sleep for a given number of milliseconds.
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 */
export const sleepMs = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Sleep for a given number of seconds.
 *
 * @param seconds - Seconds to sleep
 * @returns Promise that resolves after the delay
 */
export const sleep = (seconds: number): Promise<void> => {
    return sleepMs(seconds * 1000);
};

/** Type for values that can be an actual value or the special 'origin' marker */
export type WithOrigin<T> = T | 'origin';

/**
 * Create an OutputRef for the first output of a transaction.
 *
 * @param txHash - The transaction hash
 * @returns OutputRef with outputIndex 0
 */
export const firstOutputRef = (txHash: string) => {
    return { txHash, outputIndex: 0 };
};
