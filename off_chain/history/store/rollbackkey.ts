export class RollbackKey extends Number {
    constructor(value: number) {
        super(value);
        this.valueOf = () => value;
    }
    get value(): number {
        return this.valueOf();
    }
    get key(): Buffer {
        const buffer = Buffer.alloc(8);
        buffer.writeBigUInt64BE(BigInt(this.valueOf()));
        return buffer;
    }
    static fromKey(buffer: Buffer<ArrayBufferLike>): RollbackKey {
        if (!Buffer.isBuffer(buffer)) {
            throw new Error('Input is not a valid Buffer');
        }
        if (buffer.length !== 8) {
            throw new Error('Buffer must be 8 bytes long');
        }
        const value = buffer.readBigUInt64BE(0);
        return new RollbackKey(Number(value));
    }
    static get zero(): RollbackKey {
        return new RollbackKey(0);
    }
}
