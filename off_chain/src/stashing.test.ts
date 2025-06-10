import { describe, it, expect } from 'vitest';
import { collectStashables, createStashable } from './stashing';

describe('Stashing', () => {
    it('should change an element as an object', () => {
        const objs = [createStashable(0)];
        const res = collectStashables(objs);
        expect(res).toEqual([0]);
        objs[0].set(1);
        const res2 = collectStashables(objs);
        expect(res2).toEqual([1]);
        objs[0].hide();
        const res3 = collectStashables(objs);
        expect(res3).toEqual([]);
        objs[0].unhide();
        const res4 = collectStashables(objs);
        expect(res4).toEqual([1]);
    });
});
