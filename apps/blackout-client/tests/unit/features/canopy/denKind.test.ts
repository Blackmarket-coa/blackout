import { describe, expect, it, vi } from 'vitest';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import {
    DEN_KIND_STATE_EVENT_TYPE,
    createCategoryInCanopy,
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
    it('returns the explicit voice, forum, stage, or announcement marker', () => {
        expect(resolveDenKind({ kind: 'voice' })).toBe('voice');
        expect(resolveDenKind({ kind: 'forum' })).toBe('forum');
        expect(resolveDenKind({ kind: 'stage' })).toBe('stage');
        expect(resolveDenKind({ kind: 'announcement' })).toBe('announcement');
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
        expect(readDenKind(makeRoom('stage'))).toBe('stage');
        expect(readDenKind(makeRoom('announcement'))).toBe('announcement');
        expect(readDenKind(makeRoom('text'))).toBe('text');
    });

    it('defaults to text when unmarked or no room', () => {
        expect(readDenKind(makeRoom())).toBe('text');
        expect(readDenKind(undefined)).toBe('text');
    });
});

describe('partitionDensByKind', () => {
    it('splits dens into each kind bucket, preserving order', () => {
        const a = makeRoom('text');
        const b = makeRoom('voice');
        const c = makeRoom(); // unmarked -> text
        const d = makeRoom('voice');
        const e = makeRoom('forum');
        const f = makeRoom('stage');
        const g = makeRoom('announcement');

        const { text, voice, forum, stage, announcement } = partitionDensByKind([
            a,
            b,
            c,
            d,
            e,
            f,
            g,
        ]);

        expect(text.map((room) => room.roomId)).toEqual([a.roomId, c.roomId]);
        expect(voice.map((room) => room.roomId)).toEqual([b.roomId, d.roomId]);
        expect(forum.map((room) => room.roomId)).toEqual([e.roomId]);
        expect(stage.map((room) => room.roomId)).toEqual([f.roomId]);
        expect(announcement.map((room) => room.roomId)).toEqual([g.roomId]);
    });

    it('handles an empty list', () => {
        expect(partitionDensByKind([])).toEqual({
            text: [],
            voice: [],
            forum: [],
            stage: [],
            announcement: [],
        });
    });
});

describe('createDenInCanopy', () => {
    const makeMx = () => {
        const sendStateEvent = vi.fn().mockResolvedValue(undefined);
        const createRoom = vi.fn().mockResolvedValue({ room_id: '!new:server' });
        const mx = {
            getDomain: () => 'server',
            createRoom,
            sendStateEvent,
        } as unknown as MatrixClient;
        return { mx, sendStateEvent, createRoom };
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

    it('stamps a stage kind without a power override', async () => {
        const { mx, sendStateEvent, createRoom } = makeMx();
        await createDenInCanopy(mx, {
            canopyId: '!canopy:server',
            name: 'Town Hall',
            kind: 'stage',
        });

        expect(sendStateEvent).toHaveBeenCalledWith(
            '!new:server',
            DEN_KIND_STATE_EVENT_TYPE,
            { kind: 'stage' },
            ''
        );
        expect(createRoom.mock.calls[0][0].power_level_content_override).toBeUndefined();
    });

    it('raises events_default to 50 for an announcement den', async () => {
        const { mx, sendStateEvent, createRoom } = makeMx();
        await createDenInCanopy(mx, {
            canopyId: '!canopy:server',
            name: 'Updates',
            kind: 'announcement',
        });

        expect(sendStateEvent).toHaveBeenCalledWith(
            '!new:server',
            DEN_KIND_STATE_EVENT_TYPE,
            { kind: 'announcement' },
            ''
        );
        expect(createRoom.mock.calls[0][0].power_level_content_override).toEqual({
            events_default: 50,
        });
    });
});

describe('createCategoryInCanopy', () => {
    const makeMx = () => {
        const sendStateEvent = vi.fn().mockResolvedValue(undefined);
        const createRoom = vi.fn().mockResolvedValue({ room_id: '!cat:server' });
        const mx = {
            getDomain: () => 'server',
            createRoom,
            sendStateEvent,
        } as unknown as MatrixClient;
        return { mx, sendStateEvent, createRoom };
    };

    it('creates an m.space sub-room and links it to the canopy', async () => {
        const { mx, sendStateEvent, createRoom } = makeMx();
        const id = await createCategoryInCanopy(mx, { canopyId: '!canopy:server', name: 'Voice' });

        expect(id).toBe('!cat:server');
        expect(createRoom.mock.calls[0][0].creation_content).toEqual({ type: 'm.space' });

        // parent edge on the new category, child edge on the canopy
        expect(sendStateEvent).toHaveBeenCalledWith(
            '!cat:server',
            'm.space.parent',
            expect.objectContaining({ canonical: true, via: ['server'] }),
            '!canopy:server'
        );
        expect(sendStateEvent).toHaveBeenCalledWith(
            '!canopy:server',
            'm.space.child',
            expect.objectContaining({ via: ['server'] }),
            '!cat:server'
        );
    });
});
