import { Proof } from '../mpf/lib';
import { Data, mConStr0, mConStr1, mConStr2 } from '@meshsdk/core';

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

export const serializeProof = (proof: Proof): Data => {
    const json = proof.toJSON() as Array<Record<string, unknown>>;
    return json.map((item: Record<string, unknown>) => serializeStepJ(item));
};
