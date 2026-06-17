import { describe, expect, it } from 'vitest';
import type { Room } from 'matrix-js-sdk';
import {
    DEN_KIND_STATE_EVENT_TYPE,
    partitionDensByKind,
    readDenKind,
    resolveDenKind,
} from '../../../../src/app/features/canopy/denKind';

const makeRoom = (kind?: string): Room =>
    ({
        roomId: `!${kind ?? 'none'}:server`,
        currentState: {
            getStateEvents: (type: string) =>
                type === DEN_KIND_STATE_EVENT_TYPE && kind !== undefined
                    ? { getContent: () => ({ kind }) }
                    : undefined,
        },
    }) as unknown as Room;

describe('resolveDenKind', () => {
    it('returns voice only for an explicit voice marker', () => {
        expect(resolveDenKind({ kind: 'voice' })).toBe('voice');
    });

    it('defaults to text for text, missing, or unknown markers', () => {
        expect(resolveDenKind({ kind: 'text' })).toBe('text');
        expect(resolveDenKind(undefined)).toBe('text');
        expect(resolveDenKind({ kind: 'bogus' as 'text' })).toBe('text');
    });
});

describe('readDenKind', () => {
    it('reads the den kind from room state', () => {
        expect(readDenKind(makeRoom('voice'))).toBe('voice');
        expect(readDenKind(makeRoom('text'))).toBe('text');
    });

    it('defaults to text when unmarked or no room', () => {
        expect(readDenKind(makeRoom())).toBe('text');
        expect(readDenKind(undefined)).toBe('text');
    });
});

describe('partitionDensByKind', () => {
    it('splits dens into text and voice, preserving order', () => {
        const a = makeRoom('text');
        const b = makeRoom('voice');
        const c = makeRoom(); // unmarked -> text
        const d = makeRoom('voice');

        const { text, voice } = partitionDensByKind([a, b, c, d]);

        expect(text.map((room) => room.roomId)).toEqual([a.roomId, c.roomId]);
        expect(voice.map((room) => room.roomId)).toEqual([b.roomId, d.roomId]);
    });

    it('handles an empty list', () => {
        expect(partitionDensByKind([])).toEqual({ text: [], voice: [] });
    });
});
