import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatrixClient, Room } from 'matrix-js-sdk';
import { setNewRoomSurfaceForTests } from '../../../../src/app/components/create-room/newRoomDefaults';
import {
    AUTO_CATEGORY_ORDER,
    CATEGORY_STATE_EVENT_TYPE,
    DEN_KIND_STATE_EVENT_TYPE,
    createCategoryInCanopy,
    createDenInCanopy,
    findOrCreateCategory,
    partitionDensByKind,
    readCategoryPurpose,
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
            // The canopy is not loaded in this client (as right after it was
            // created): its kind reads as non-public, the private side.
            getRoom: () => null,
            getCapabilities: async () => ({ 'm.room_versions': { default: '10', available: {} } }),
        } as unknown as MatrixClient;
        return { mx, sendStateEvent, createRoom };
    };

    const eventTypes = (sendStateEvent: ReturnType<typeof vi.fn>) =>
        sendStateEvent.mock.calls.map((call) => call[1]);

    it('creates the den encrypted', async () => {
        // Regression: this path created every den in plaintext, which was the
        // largest gap in the 2026-08-10 encryption audit. Encryption must be in
        // `initial_state` — a follow-up state event would leave a window where
        // the den exists unencrypted.
        const { mx, createRoom } = makeMx();
        await createDenInCanopy(mx, { canopyId: '!canopy:server', name: 'Help' });

        const [opts] = createRoom.mock.calls[0];
        expect(opts.initial_state).toContainEqual(
            expect.objectContaining({
                type: 'm.room.encryption',
                content: { algorithm: 'm.megolm.v1.aes-sha2' },
            })
        );
    });

    it('encrypts announcement dens too', async () => {
        const { mx, createRoom } = makeMx();
        await createDenInCanopy(mx, {
            canopyId: '!canopy:server',
            name: 'News',
            kind: 'announcement',
        });

        const [opts] = createRoom.mock.calls[0];
        expect(opts.power_level_content_override).toEqual({ events_default: 50 });
        expect(opts.initial_state).toContainEqual(
            expect.objectContaining({ type: 'm.room.encryption' })
        );
    });

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

/**
 * The access and encryption a den gets from the one table in
 * `newRoomDefaults.ts`, by the canopy it is created in. Until 2026-10 this
 * path sent no join rule at all (invite by homeserver preset) and always
 * encrypted.
 */
describe('createDenInCanopy: join rule and encryption by canopy kind', () => {
    const SUPPORTED = { 'm.room_versions': { default: '10', available: {} } };
    const UNSUPPORTED = { 'm.room_versions': { default: '1', available: {} } };

    const space = (
        roomId: string,
        joinRule: string,
        parents: Array<{ id: string; canonical?: boolean }> = []
    ): Room =>
        ({
            roomId,
            getType: () => 'm.space',
            getJoinRule: () => joinRule,
            currentState: {
                getStateEvents: (type: string) =>
                    type === 'm.space.parent'
                        ? parents.map((parent) => ({
                              getStateKey: () => parent.id,
                              getContent: () => ({
                                  canonical: parent.canonical ?? true,
                                  via: ['server'],
                              }),
                          }))
                        : [],
            },
        } as unknown as Room);

    const makeMx = (rooms: Record<string, Room>, capabilities: unknown = SUPPORTED) => {
        const sendStateEvent = vi.fn().mockResolvedValue(undefined);
        const createRoom = vi.fn().mockResolvedValue({ room_id: '!new:server' });
        const mx = {
            getDomain: () => 'server',
            createRoom,
            sendStateEvent,
            getRoom: (id: string) => rooms[id] ?? null,
            getCapabilities: async () => capabilities,
        } as unknown as MatrixClient;
        return { mx, createRoom };
    };

    const sent = (createRoom: ReturnType<typeof vi.fn>) => {
        const state = createRoom.mock.calls[0][0].initial_state as Array<{
            type: string;
            content: Record<string, unknown>;
        }>;
        return {
            joinRule: state.find((event) => event.type === 'm.room.join_rules')?.content,
            encrypted: state.some((event) => event.type === 'm.room.encryption'),
        };
    };

    const allow = (...roomIds: string[]) =>
        roomIds.map((roomId) => ({ type: 'm.room_membership', room_id: roomId }));

    afterEach(() => {
        setNewRoomSurfaceForTests(null);
    });

    it('in the app, a den in a public canopy is public and not encrypted', async () => {
        setNewRoomSurfaceForTests('app');
        const { mx, createRoom } = makeMx({ '!canopy:server': space('!canopy:server', 'public') });
        await createDenInCanopy(mx, { canopyId: '!canopy:server', name: 'general' });
        expect(sent(createRoom)).toEqual({ joinRule: { join_rule: 'public' }, encrypted: false });
    });

    it('in the panel, a den in a public canopy is restricted to the canopy and encrypted', async () => {
        setNewRoomSurfaceForTests('panel');
        const { mx, createRoom } = makeMx({ '!canopy:server': space('!canopy:server', 'public') });
        await createDenInCanopy(mx, { canopyId: '!canopy:server', name: 'general' });
        expect(sent(createRoom)).toEqual({
            joinRule: { join_rule: 'restricted', allow: allow('!canopy:server') },
            encrypted: true,
        });
    });

    it('a den in a private canopy is restricted to the canopy and encrypted, on both surfaces', async () => {
        for (const surface of ['app', 'panel'] as const) {
            setNewRoomSurfaceForTests(surface);
            const { mx, createRoom } = makeMx({
                '!canopy:server': space('!canopy:server', 'invite'),
            });
            await createDenInCanopy(mx, { canopyId: '!canopy:server', name: 'general' });
            expect(sent(createRoom)).toEqual({
                joinRule: { join_rule: 'restricted', allow: allow('!canopy:server') },
                encrypted: true,
            });
        }
    });

    it('a den in a restricted canopy is restricted to the canopy and encrypted', async () => {
        setNewRoomSurfaceForTests('app');
        const { mx, createRoom } = makeMx({
            '!canopy:server': space('!canopy:server', 'restricted'),
        });
        await createDenInCanopy(mx, { canopyId: '!canopy:server', name: 'general' });
        expect(sent(createRoom)).toEqual({
            joinRule: { join_rule: 'restricted', allow: allow('!canopy:server') },
            encrypted: true,
        });
    });

    it('a canopy this client has not loaded is treated as not public', async () => {
        setNewRoomSurfaceForTests('app');
        const { mx, createRoom } = makeMx({});
        await createDenInCanopy(mx, { canopyId: '!canopy:server', name: 'general' });
        expect(sent(createRoom)).toEqual({
            joinRule: { join_rule: 'restricted', allow: allow('!canopy:server') },
            encrypted: true,
        });
    });

    it('falls back to invite-only when the default room version has no restricted rule', async () => {
        setNewRoomSurfaceForTests('app');
        const { mx, createRoom } = makeMx(
            { '!canopy:server': space('!canopy:server', 'invite') },
            UNSUPPORTED
        );
        await createDenInCanopy(mx, { canopyId: '!canopy:server', name: 'general' });
        expect(sent(createRoom)).toEqual({ joinRule: { join_rule: 'invite' }, encrypted: true });
    });

    it('placed in a category, follows the canopy above it and admits members of either', async () => {
        setNewRoomSurfaceForTests('app');
        const canopy = space('!canopy:server', 'public');
        const category = space('!cat:server', 'invite', [{ id: '!canopy:server' }]);
        const publicCase = makeMx({ '!canopy:server': canopy, '!cat:server': category });
        await createDenInCanopy(publicCase.mx, { canopyId: '!cat:server', name: 'topic' });
        // The canopy is public, so the den is public even though the (older,
        // invite-only) category is not.
        expect(sent(publicCase.createRoom).joinRule).toEqual({ join_rule: 'public' });

        const privateCanopy = space('!canopy:server', 'invite');
        const privateCase = makeMx({ '!canopy:server': privateCanopy, '!cat:server': category });
        await createDenInCanopy(privateCase.mx, { canopyId: '!cat:server', name: 'topic' });
        expect(sent(privateCase.createRoom)).toEqual({
            joinRule: {
                join_rule: 'restricted',
                allow: allow('!cat:server', '!canopy:server'),
            },
            encrypted: true,
        });
    });

    it('still writes the den kind and the parent/child edges', async () => {
        setNewRoomSurfaceForTests('app');
        const { mx } = makeMx({ '!canopy:server': space('!canopy:server', 'public') });
        await createDenInCanopy(mx, { canopyId: '!canopy:server', name: 'general', kind: 'voice' });
        const sendStateEvent = mx.sendStateEvent as unknown as ReturnType<typeof vi.fn>;
        expect(sendStateEvent).toHaveBeenCalledWith(
            '!new:server',
            DEN_KIND_STATE_EVENT_TYPE,
            { kind: 'voice' },
            ''
        );
        expect(sendStateEvent).toHaveBeenCalledWith(
            '!new:server',
            'm.space.parent',
            expect.objectContaining({ canonical: true }),
            '!canopy:server'
        );
    });
});

/** A category follows its canopy's kind and is never encrypted. */
describe('createCategoryInCanopy: join rule by canopy kind', () => {
    const canopy = (joinRule: string): Room =>
        ({
            roomId: '!canopy:server',
            getType: () => 'm.space',
            getJoinRule: () => joinRule,
            currentState: { getStateEvents: () => [] },
        } as unknown as Room);

    const makeMx = (room: Room | null, version = '10') => {
        const createRoom = vi.fn().mockResolvedValue({ room_id: '!cat:server' });
        const mx = {
            getDomain: () => 'server',
            createRoom,
            sendStateEvent: vi.fn().mockResolvedValue(undefined),
            getRoom: () => room,
            getCapabilities: async () => ({
                'm.room_versions': { default: version, available: {} },
            }),
        } as unknown as MatrixClient;
        return { mx, createRoom };
    };

    const stateSent = (createRoom: ReturnType<typeof vi.fn>) =>
        createRoom.mock.calls[0][0].initial_state as Array<{
            type: string;
            content: Record<string, unknown>;
        }>;

    afterEach(() => {
        setNewRoomSurfaceForTests(null);
    });

    it('is public in a public canopy, on both surfaces, and carries no encryption', async () => {
        for (const surface of ['app', 'panel'] as const) {
            setNewRoomSurfaceForTests(surface);
            const { mx, createRoom } = makeMx(canopy('public'));
            await createCategoryInCanopy(mx, { canopyId: '!canopy:server', name: 'Ops' });
            const state = stateSent(createRoom);
            expect(state.find((e) => e.type === 'm.room.join_rules')?.content).toEqual({
                join_rule: 'public',
            });
            expect(state.some((e) => e.type === 'm.room.encryption')).toBe(false);
        }
    });

    it('is restricted to a canopy that is not public, else invite-only', async () => {
        setNewRoomSurfaceForTests('app');
        const restricted = makeMx(canopy('invite'));
        await createCategoryInCanopy(restricted.mx, { canopyId: '!canopy:server', name: 'Ops' });
        expect(
            stateSent(restricted.createRoom).find((e) => e.type === 'm.room.join_rules')?.content
        ).toEqual({
            join_rule: 'restricted',
            allow: [{ type: 'm.room_membership', room_id: '!canopy:server' }],
        });

        const invite = makeMx(canopy('invite'), '1');
        await createCategoryInCanopy(invite.mx, { canopyId: '!canopy:server', name: 'Ops' });
        expect(
            stateSent(invite.createRoom).find((e) => e.type === 'm.room.join_rules')?.content
        ).toEqual({ join_rule: 'invite' });

        const unknown = makeMx(null);
        await createCategoryInCanopy(unknown.mx, { canopyId: '!canopy:server', name: 'Ops' });
        expect(
            stateSent(unknown.createRoom).find((e) => e.type === 'm.room.join_rules')?.content
        ).toEqual({
            join_rule: 'restricted',
            allow: [{ type: 'm.room_membership', room_id: '!canopy:server' }],
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
            // The canopy is not loaded in this client (as right after it was
            // created): its kind reads as non-public, the private side.
            getRoom: () => null,
            getCapabilities: async () => ({ 'm.room_versions': { default: '10', available: {} } }),
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

    it('leaves a hand-made category unmarked and unordered', async () => {
        const { mx, sendStateEvent } = makeMx();
        await createCategoryInCanopy(mx, { canopyId: '!canopy:server', name: 'Voice' });

        // The purpose marker is for categories the app made on the user's
        // behalf; one someone typed a name into carries no purpose.
        expect(sendStateEvent).not.toHaveBeenCalledWith(
            expect.anything(),
            CATEGORY_STATE_EVENT_TYPE,
            expect.anything(),
            expect.anything()
        );
        const childEdge = sendStateEvent.mock.calls.find(
            (call) => call[1] === 'm.space.child'
        )?.[2] as Record<string, unknown>;
        expect(childEdge.order).toBeUndefined();
    });
});

/** A category room stub whose `co.bmc.category` state names a purpose. */
const makeCategory = (purpose?: string, type = 'm.space'): Room =>
    ({
        roomId: `!cat-${purpose ?? 'plain'}:server`,
        getType: () => type,
        currentState: {
            getStateEvents: (eventType: string) =>
                eventType === CATEGORY_STATE_EVENT_TYPE && purpose !== undefined
                    ? { getContent: () => ({ purpose }) }
                    : undefined,
        },
    } as unknown as Room);

describe('readCategoryPurpose', () => {
    it('reads the purpose marker off a category space', () => {
        expect(readCategoryPurpose(makeCategory('topics'))).toBe('topics');
    });

    it('returns null for an unmarked category, an unknown purpose, or a non-space', () => {
        expect(readCategoryPurpose(makeCategory())).toBeNull();
        expect(readCategoryPurpose(makeCategory('bogus'))).toBeNull();
        // A den is not a category no matter what state it carries.
        expect(readCategoryPurpose(makeCategory('topics', 'm.room'))).toBeNull();
        expect(readCategoryPurpose(undefined)).toBeNull();
    });
});

describe('findOrCreateCategory', () => {
    const makeMx = (children: Record<string, Room | undefined>) => {
        const sendStateEvent = vi.fn().mockResolvedValue(undefined);
        const createRoom = vi.fn().mockResolvedValue({ room_id: '!new-cat:server' });
        const canopy = {
            roomId: '!canopy:server',
            getType: () => 'm.space',
            getJoinRule: () => 'invite',
            currentState: {
                getStateEvents: (type: string) =>
                    type === 'm.space.child'
                        ? Object.keys(children).map((id) => ({ getStateKey: () => id }))
                        : [],
            },
        } as unknown as Room;
        const mx = {
            getDomain: () => 'server',
            createRoom,
            sendStateEvent,
            getRoom: (id: string) => (id === '!canopy:server' ? canopy : children[id]),
            getCapabilities: async () => ({ 'm.room_versions': { default: '10', available: {} } }),
        } as unknown as MatrixClient;
        return { mx, sendStateEvent, createRoom };
    };

    it('reuses an existing category found by its marker', async () => {
        const existing = makeCategory('topics');
        const { mx, createRoom } = makeMx({ [existing.roomId]: existing });

        const id = await findOrCreateCategory(mx, {
            canopyId: '!canopy:server',
            purpose: 'topics',
        });

        expect(id).toBe(existing.roomId);
        expect(createRoom).not.toHaveBeenCalled();
    });

    /**
     * Matching by display name would break the moment someone renamed the
     * category, and would hijack any hand-made category called "Topics".
     */
    it('ignores a same-named category that carries no marker', async () => {
        const lookalike = { ...makeCategory(), name: 'Topics' } as Room;
        const { mx, createRoom } = makeMx({ '!lookalike:server': lookalike });

        const id = await findOrCreateCategory(mx, {
            canopyId: '!canopy:server',
            purpose: 'topics',
        });

        expect(id).toBe('!new-cat:server');
        expect(createRoom).toHaveBeenCalled();
    });

    it('stamps the marker and a tail order on a category it creates', async () => {
        const { mx, sendStateEvent } = makeMx({});

        await findOrCreateCategory(mx, { canopyId: '!canopy:server', purpose: 'topics' });

        expect(sendStateEvent).toHaveBeenCalledWith(
            '!new-cat:server',
            CATEGORY_STATE_EVENT_TYPE,
            { purpose: 'topics' },
            ''
        );
        // `getOrderedChildIds` gives unordered children 'zzz', so this sorts
        // after every hand-made channel — deliberately, not by accident.
        expect(AUTO_CATEGORY_ORDER > 'zzz').toBe(true);
        expect(sendStateEvent).toHaveBeenCalledWith(
            '!canopy:server',
            'm.space.child',
            expect.objectContaining({ order: AUTO_CATEGORY_ORDER }),
            '!new-cat:server'
        );
    });

    it('survives a canopy whose child rooms are not loaded', async () => {
        const { mx, createRoom } = makeMx({ '!unloaded:server': undefined });

        const id = await findOrCreateCategory(mx, {
            canopyId: '!canopy:server',
            purpose: 'topics',
        });

        expect(id).toBe('!new-cat:server');
        expect(createRoom).toHaveBeenCalled();
    });
});
