import { describe, expect, it } from 'vitest';
import {
    byOrderKey,
    byTsOldToNew,
    factoryRoomIdByActivity,
    factoryRoomIdByAtoZ,
    factoryRoomIdByUnreadCount,
} from '../../../src/app/utils/sort';

type FakeRoom = { name?: string; ts?: number };

// Minimal MatrixClient stand-in: only getRoom() is exercised by the sorters.
const fakeMx = (rooms: Record<string, FakeRoom>) =>
    ({
        getRoom: (id: string) => {
            const room = rooms[id];
            if (!room) return null;
            return {
                name: room.name,
                getLastActiveTimestamp: () => room.ts,
            };
        },
    }) as never;

describe('factoryRoomIdByActivity', () => {
    it('orders rooms most-recently-active first', () => {
        const sort = factoryRoomIdByActivity(fakeMx({ a: { ts: 100 }, b: { ts: 300 }, c: { ts: 200 } }));
        expect(['a', 'b', 'c'].sort(sort)).toEqual(['b', 'c', 'a']);
    });

    it('treats missing rooms / timestamps as the oldest possible', () => {
        const sort = factoryRoomIdByActivity(fakeMx({ a: { ts: 100 }, b: {} }));
        // 'missing' has no room at all; 'b' has a room but no timestamp.
        expect(['missing', 'a', 'b'].sort(sort)[0]).toBe('a');
    });
});

describe('factoryRoomIdByAtoZ', () => {
    it('sorts case-insensitively and ignores leading #', () => {
        const sort = factoryRoomIdByAtoZ(fakeMx({ a: { name: '#Zebra' }, b: { name: 'apple' }, c: { name: '#Mango' } }));
        expect(['a', 'b', 'c'].sort(sort)).toEqual(['b', 'c', 'a']);
    });

    it('returns 0 for equal names and handles missing names as empty', () => {
        const sort = factoryRoomIdByAtoZ(fakeMx({ a: { name: 'same' }, b: { name: 'same' } }));
        expect(sort('a', 'b')).toBe(0);
        const sortMissing = factoryRoomIdByAtoZ(fakeMx({ a: { name: 'x' } }));
        expect(sortMissing('missing', 'a')).toBeLessThan(0);
    });
});

describe('factoryRoomIdByUnreadCount', () => {
    it('orders rooms with more unread first', () => {
        const counts: Record<string, number> = { a: 1, b: 9, c: 4 };
        const sort = factoryRoomIdByUnreadCount((id) => counts[id]);
        expect(['a', 'b', 'c'].sort(sort)).toEqual(['b', 'c', 'a']);
    });
});

describe('byTsOldToNew', () => {
    it('sorts ascending', () => {
        expect([30, 10, 20].sort(byTsOldToNew)).toEqual([10, 20, 30]);
    });
});

describe('byOrderKey', () => {
    it('treats two missing keys as equal', () => {
        expect(byOrderKey(undefined, undefined)).toBe(0);
    });

    it('sorts defined keys before missing ones', () => {
        expect(byOrderKey('a', undefined)).toBe(-1);
        expect(byOrderKey(undefined, 'a')).toBe(1);
    });

    it('compares present keys lexicographically', () => {
        expect(byOrderKey('a', 'b')).toBe(-1);
        expect(byOrderKey('b', 'a')).toBe(1);
    });
});
