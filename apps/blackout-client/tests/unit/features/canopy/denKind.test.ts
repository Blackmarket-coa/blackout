import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import {
    DEN_KIND_STATE_EVENT_TYPE,
    createDenInCanopy,
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
    } as unknown as Room);

describe('resolveDenKind', () => {
    it('returns the explicit voice or forum marker', () => {
        expect(resolveDenKind({ kind: 'voice' })).toBe('voice');
        expect(resolveDenKind({ kind: 'forum' })).toBe('forum');
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
        expect(readDenKind(makeRoom('forum'))).toBe('forum');
        expect(readDenKind(makeRoom('text'))).toBe('text');
    });

    it('defaults to text when unmarked or no room', () => {
        expect(readDenKind(makeRoom())).toBe('text');
        expect(readDenKind(undefined)).toBe('text');
    });
});

describe('partitionDensByKind', () => {
    it('splits dens into text, voice, and forum, preserving order', () => {
        const a = makeRoom('text');
        const b = makeRoom('voice');
        const c = makeRoom(); // unmarked -> text
        const d = makeRoom('voice');
        const e = makeRoom('forum');

        const { text, voice, forum } = partitionDensByKind([a, b, c, d, e]);

        expect(text.map((room) => room.roomId)).toEqual([a.roomId, c.roomId]);
        expect(voice.map((room) => room.roomId)).toEqual([b.roomId, d.roomId]);
        expect(forum.map((room) => room.roomId)).toEqual([e.roomId]);
    });

    it('handles an empty list', () => {
        expect(partitionDensByKind([])).toEqual({ text: [], voice: [], forum: [] });
    });
});

describe('createDenInCanopy', () => {
    const makeMx = () => {
        const sendStateEvent = vi.fn().mockResolvedValue(undefined);
        const mx = {
            getDomain: () => 'server',
            createRoom: vi.fn().mockResolvedValue({ room_id: '!new:server' }),
            sendStateEvent,
        } as unknown as MatrixClient;
        return { mx, sendStateEvent };
    };

    const eventTypes = (sendStateEvent: ReturnType<typeof vi.fn>) =>
        sendStateEvent.mock.calls.map((call) => call[1]);

    it('stamps a forum kind and a default enabled co.bmc.forum settings event', async () => {
        const { mx, sendStateEvent } = makeMx();
        await createDenInCanopy(mx, { canopyId: '!canopy:server', name: 'Help', kind: 'forum' });

        expect(sendStateEvent).toHaveBeenCalledWith(
            '!new:server',
            DEN_KIND_STATE_EVENT_TYPE,
            { kind: 'forum' },
            ''
        );
        expect(sendStateEvent).toHaveBeenCalledWith(
            '!new:server',
            'co.bmc.forum',
            expect.objectContaining({ enabled: true, defaultSort: 'hot' }),
            ''
        );
    });

    it('does not write forum settings for a text den', async () => {
        const { mx, sendStateEvent } = makeMx();
        await createDenInCanopy(mx, { canopyId: '!canopy:server', name: 'general' });
        expect(eventTypes(sendStateEvent)).not.toContain('co.bmc.forum');
    });
});
