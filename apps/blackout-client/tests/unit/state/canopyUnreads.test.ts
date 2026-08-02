import { describe, expect, it } from 'vitest';
import type { Room } from 'matrix-js-sdk';
import { rollupCanopyUnreads } from '../../../src/app/state/canopyUnreads';
import type { RoomUnread } from '../../../src/app/state/bmc-unreads';

const den = (roomId: string): Room => ({ roomId, getType: () => undefined } as unknown as Room);

const space = (roomId: string): Room => ({ roomId, getType: () => 'm.space' } as unknown as Room);

const unread = (total: number, highlight: number): RoomUnread => ({
    total,
    highlight,
    mentions: highlight,
});

describe('rollupCanopyUnreads', () => {
    it('sums a den into its parent canopy', () => {
        const result = rollupCanopyUnreads(
            [den('!den:x'), space('!canopy:x')],
            new Map([['!den:x', new Set(['!canopy:x'])]]),
            new Map([['!den:x', unread(3, 1)]])
        );
        expect(result.get('!canopy:x')).toEqual({ total: 3, mentions: 1 });
    });

    it('counts a den into every parent canopy it belongs to', () => {
        const result = rollupCanopyUnreads(
            [den('!den:x')],
            new Map([['!den:x', new Set(['!a:x', '!b:x'])]]),
            new Map([['!den:x', unread(2, 2)]])
        );
        expect(result.get('!a:x')).toEqual({ total: 2, mentions: 2 });
        expect(result.get('!b:x')).toEqual({ total: 2, mentions: 2 });
    });

    it('aggregates multiple dens under the same canopy', () => {
        const result = rollupCanopyUnreads(
            [den('!a:x'), den('!b:x')],
            new Map([
                ['!a:x', new Set(['!canopy:x'])],
                ['!b:x', new Set(['!canopy:x'])],
            ]),
            new Map([
                ['!a:x', unread(3, 1)],
                ['!b:x', unread(4, 0)],
            ])
        );
        expect(result.get('!canopy:x')).toEqual({ total: 7, mentions: 1 });
    });

    it('ignores spaces as sources — a canopy timeline never counts toward itself', () => {
        const result = rollupCanopyUnreads(
            [space('!child-space:x')],
            new Map([['!child-space:x', new Set(['!canopy:x'])]]),
            new Map([['!child-space:x', unread(5, 5)]])
        );
        expect(result.size).toBe(0);
    });

    it('ignores unparented rooms and all-read dens', () => {
        const result = rollupCanopyUnreads(
            [den('!orphan:x'), den('!read:x')],
            new Map([['!read:x', new Set(['!canopy:x'])]]),
            new Map([
                ['!orphan:x', unread(9, 9)],
                ['!read:x', unread(0, 0)],
            ])
        );
        expect(result.size).toBe(0);
    });

    it('returns an empty map for empty inputs', () => {
        expect(rollupCanopyUnreads([], new Map(), new Map()).size).toBe(0);
    });
});
