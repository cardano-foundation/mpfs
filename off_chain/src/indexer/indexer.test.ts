import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIndexer } from './indexer';

const transport = vi.hoisted(() => ({ client: undefined as any }));

vi.mock('ws', async () => {
    const { EventEmitter } = await import('node:events');
    return {
        default: class extends EventEmitter {
            height = 10;
            sentInitialBlock = false;
            constructor() {
                super();
                transport.client = this;
                queueMicrotask(() => this.emit('open'));
            }
            response(id: string, result: any) {
                setTimeout(
                    () => this.emit('message', JSON.stringify({ id, result })),
                    0
                );
            }
            forward(height: number) {
                this.height = height;
                this.response('block', {
                    direction: 'forward',
                    block: {
                        slot: height,
                        height,
                        id: String(height),
                        transactions: []
                    }
                });
            }
            send(message: string) {
                const { method, id } = JSON.parse(message);
                if (method === 'findIntersection') {
                    this.response(id, { intersection: 'origin' });
                } else if (method === 'queryNetwork/tip') {
                    this.response(id, { slot: this.height });
                } else if (method === 'nextBlock' && !this.sentInitialBlock) {
                    this.sentInitialBlock = true;
                    this.forward(10);
                }
            }
            close() {}
        }
    };
});

afterEach(() => vi.useRealTimers());

describe('Indexer block waits', () => {
    it('completes when processing advances beyond the requested height between polls', async () => {
        vi.useFakeTimers();
        const checkpoints = {
            getIntersections: async () => ['origin'],
            putCheckpoint: async () => {}
        };
        const indexer = await createIndexer(
            { checkpoints } as any,
            async () => {},
            'ws://controlled-test'
        );
        try {
            await vi.advanceTimersByTimeAsync(0);
            let completedHeight: number | undefined;
            void indexer.waitBlocks(2).then(height => {
                completedHeight = height;
            });
            await vi.advanceTimersByTimeAsync(500);
            transport.client.forward(14);
            await vi.advanceTimersByTimeAsync(500);
            expect(completedHeight).toBe(14);
        } finally {
            await indexer.close();
            vi.clearAllTimers();
        }
    });
});
