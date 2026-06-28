import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient } from 'matrix-js-sdk';
import {
    computeBucketReorder,
    reorderDenInCanopy,
    type BucketDen,
} from '../../../../src/app/features/canopy/denOrder';

const bucket: BucketDen[] = [
    { roomId: '!a:server', order: 'a' },
    { roomId: '!b:server', order: 'b' },
    { roomId: '!c:server', order: 'c' },
];

const orderOf = (changes: { roomId: string; order: string }[], roomId: string) =>
    changes.find((change) => change.roomId === roomId)?.order;

describe('computeBucketReorder', () => {
    it('moves a den to the front, giving it an order that sorts first', () => {
        const changes = computeBucketReorder(bucket, 2, 0); // move !c before !a
        expect(changes.map((change) => change.roomId)).toEqual(['!c:server']);
        const newC = orderOf(changes, '!c:server')!;
        expect(newC.localeCompare('a')).toBeLessThan(0);
    });

    it('moves a den to the end, giving it an order that sorts last', () => {
        const changes = computeBucketReorder(bucket, 0, 2); // move !a after !c
        expect(changes.map((change) => change.roomId)).toEqual(['!a:server']);
        const newA = orderOf(changes, '!a:server')!;
        expect(newA.localeCompare('c')).toBeGreaterThan(0);
    });

    it('returns no changes for a no-op move', () => {
        expect(computeBucketReorder(bucket, 1, 1)).toEqual([]);
    });

    it('ignores out-of-range indices', () => {
        expect(computeBucketReorder(bucket, -1, 0)).toEqual([]);
        expect(computeBucketReorder(bucket, 0, 5)).toEqual([]);
    });
});

describe('reorderDenInCanopy', () => {
    it('writes m.space.child for each change, preserving via/suggested', async () => {
        const sendStateEvent = vi.fn().mockResolvedValue(undefined);
        const mx = { sendStateEvent } as unknown as MatrixClient;

        await reorderDenInCanopy(mx, {
            parentId: '!canopy:server',
            changes: [{ roomId: '!c:server', order: 'A' }],
            contentByDenId: {
                '!c:server': { via: ['server'], suggested: true, order: 'c' },
            },
        });

        expect(sendStateEvent).toHaveBeenCalledWith(
            '!canopy:server',
            'm.space.child',
            { via: ['server'], suggested: true, order: 'A' },
            '!c:server'
        );
    });
});
