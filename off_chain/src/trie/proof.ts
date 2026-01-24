/**
 * Proof serialization for on-chain MPF validation.
 *
 * This module converts MPF proofs from their JavaScript representation
 * to Plutus Data format suitable for on-chain validation.
 *
 * The proof structure matches the Aiken `Proof` type which is a list of steps:
 * - Branch: ConStr0 with skip count and neighbors hash
 * - Fork: ConStr1 with skip count and neighbor info (nibble, prefix, root)
 * - Leaf: ConStr2 with skip count and neighbor (key, value)
 * @module
 */

import { Proof } from '../mpf/lib';
import { Data, mConStr0, mConStr1, mConStr2 } from '@meshsdk/core';

/**
 * Serialize a single proof step to Plutus Data format.
 *
 * @param step - The proof step from the MPF library
 * @returns Plutus Data representation of the step
 */
const serializeStepJ = (step: Record<string, unknown>): Data => {
    if (step.type === 'leaf') {
        const skip = step.skip as number;
        const neighbor = step.neighbor as Record<string, unknown>;
        const key = neighbor.key as string;
        const value = neighbor.value as string;
        return mConStr2([skip, key, value]);
    } else if (step.type === 'branch') {
        const skip = step.skip as number;
        const neighbors = step.neighbors as string;
        return mConStr0([skip, neighbors]);
    } else {
        const skip = step.skip as number;
        const neighbor = step.neighbor as Record<string, unknown>;
        const nibble = neighbor.nibble as number;
        const prefix = neighbor.prefix as string;
        const root = neighbor.root as string;
        return mConStr1([skip, mConStr0([nibble, prefix, root])]);
    }
};

/**
 * Serialize a complete MPF proof to Plutus Data format.
 *
 * Converts the proof to JSON and maps each step to its Plutus Data equivalent.
 * The result can be used as a redeemer in the Modify transaction.
 *
 * @param proof - The MPF proof object
 * @returns Array of Plutus Data representing the proof steps
 */
export const serializeProof = (proof: Proof): Data => {
    const json = proof.toJSON() as Array<Record<string, unknown>>;
    return json.map((item: Record<string, unknown>) => serializeStepJ(item));
};
