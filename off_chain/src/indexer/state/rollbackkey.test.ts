import { describe, it, expect } from 'vitest';
import { RollbackKey } from './rollbackkey';
import * as fc from 'fast-check';

describe('RollbackKey Class', () => {
    it('should create a RollbackKey with random numeric values', () => {
        for (let i = 0; i < 10000; i++) {
            const randomValue = Math.floor(
                Math.random() * Number.MAX_SAFE_INTEGER
            );
            const key = new RollbackKey(randomValue);
            expect(key.value).toBe(randomValue);
            expect(key.key).toBeInstanceOf(Buffer);
            expect(key.key.length).toBe(8);
        }
    });
    it('should convert from a Buffer key', () => {
        const buffer = Buffer.alloc(8);
        buffer.writeBigUInt64BE(BigInt(12345));
        const key = RollbackKey.fromKey(buffer);
        expect(key.value).toBe(12345);
    });
    it('should throw an error for invalid Buffer length', () => {
        const buffer = Buffer.alloc(4);
        expect(() => RollbackKey.fromKey(buffer)).toThrow(
            'Buffer must be 8 bytes long'
        );
    });
    it('should throw an error for non-Buffer input', () => {
        const invalidInput = 'not a buffer';
        expect(() => RollbackKey.fromKey(invalidInput as any)).toThrow(
            'Input is not a valid Buffer'
        );
    });
    it('should return zero for RollbackKey.zero', () => {
        const zeroKey = RollbackKey.zero;
        expect(zeroKey.value).toBe(0);
        expect(zeroKey.key).toBeInstanceOf(Buffer);
        expect(zeroKey.key.length).toBe(8);
    });
    it('should convert back and forth between number and Buffer', () => {
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 2 ^ (64 - 1) }), num => {
                const key = new RollbackKey(num);
                expect(key.value).toBe(num);
                expect(key.key).toBeInstanceOf(Buffer);
                expect(key.key.length).toBe(8);

                const convertedKey = RollbackKey.fromKey(key.key);
                expect(convertedKey.value).toBe(num);
            })
        );
    });

    it('should preserve ordering when converting numbers to and from buffers', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 2 ^ (64 - 1) }), // Random number in the range of 64-bit unsigned integers
                fc.integer({ min: 0, max: 2 ^ (64 - 1) }), // Another random number in the same range
                (num1, num2) => {
                    const key1 = new RollbackKey(num1);
                    const key2 = new RollbackKey(num2);

                    const buffer1 = key1.key;
                    const buffer2 = key2.key;

                    if (num1 < num2) {
                        expect(buffer1.compare(buffer2)).toBeLessThan(0);
                    } else if (num1 > num2) {
                        expect(buffer1.compare(buffer2)).toBeGreaterThan(0);
                    } else {
                        expect(buffer1.compare(buffer2)).toBe(0);
                    }
                }
            )
        );
    });
});
