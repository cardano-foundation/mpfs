export function samplePowerOfTwoPositions<T>(arr: T[]): T[] {
    const result: T[] = [];
    const n = arr.length;

    if (n === 0) return result;

    // Always include the first element
    result.push(arr[0]);

    // Include elements at power of 2 positions
    for (let i = 0; ; i++) {
        const index = 1 << i; // 2^i
        if (index >= n) break; // Stop if index exceeds array length
        result.push(arr[index]);
    }
    // Include the last element if it's not already included
    if (result[result.length - 1] !== arr[n - 1]) {
        result.push(arr[n - 1]);
    }

    return result;
}
