import { OutputRef } from './lib';

export function mkOutputRefId({ txHash, outputIndex }: OutputRef): string {
    return `${txHash}-${outputIndex}`;
}
export function unmkOutputRefId(refId: string): OutputRef {
    const [txHash, indexStr] = refId.split('-');
    const outputIndex = parseInt(indexStr, 10);
    if (isNaN(outputIndex)) {
        throw new Error(`Invalid output reference: ${refId}`);
    }
    return { txHash, outputIndex };
}
