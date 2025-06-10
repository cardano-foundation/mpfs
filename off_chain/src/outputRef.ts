import { OutputRef } from './lib';

export type OutputRefId = string;

export function mkOutputRefId({ txHash, outputIndex }: OutputRef): OutputRefId {
    return `${txHash}-${outputIndex}`;
}
export function unmkOutputRefId(refId: OutputRefId): OutputRef {
    const [txHash, indexStr] = refId.split('-');
    const outputIndex = parseInt(indexStr, 10);
    if (isNaN(outputIndex)) {
        throw new Error(`Invalid output reference: ${refId}`);
    }
    return { txHash, outputIndex };
}
