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
        const getCapabilities = vi.fn(async () => capabilities);
        const mx = {
            getDomain: () => 'server',
            createRoom,
            sendStateEvent,
            getRoom: (id: string) => rooms[id] ?? null,
            getCapabilities,
        } as unknown as MatrixClient;
        return { mx, createRoom, getCapabilities };
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

    const presetSent = (createRoom: ReturnType<typeof vi.fn>): unknown =>
        createRoom.mock.calls[0][0].preset;

    const allow = (...roomIds: string[]) =>
        roomIds.map((roomId) => ({ type: 'm.room_membership', room_id: roomId }));

    afterEach(() => {
        setNewRoomSurfaceForTests(null);
    });

    it('names the public_chat preset for a public den and private_chat for every other, so the homeserver backstop leaves a public den plaintext', async () => {
        // Synapse adds `m.room.encryption` to every `private_chat` room under
        // `encryption_enabled_by_default_for_room_type: invite`, and a request
        // with no preset is `private_chat`; `public_chat` is how a public den
        // stays what the chooser says it is.
        setNewRoomSurfaceForTests('app');
        const pub = makeMx({ '!canopy:server': space('!canopy:server', 'public') });
        await createDenInCanopy(pub.mx, { canopyId: '!canopy:server', name: 'general' });
        expect(presetSent(pub.createRoom)).toBe('public_chat');

        const priv = makeMx({ '!canopy:server': space('!canopy:server', 'invite') });
        await createDenInCanopy(priv.mx, { canopyId: '!canopy:server', name: 'general' });
        expect(presetSent(priv.createRoom)).toBe('private_chat');

        const fallback = makeMx(
            { '!canopy:server': space('!canopy:server', 'invite') },
            UNSUPPORTED
        );
        await createDenInCanopy(fallback.mx, { canopyId: '!canopy:server', name: 'general' });
        expect(presetSent(fallback.createRoom)).toBe('private_chat');

        setNewRoomSurfaceForTests('panel');
        const panel = makeMx({ '!canopy:server': space('!canopy:server', 'public') });
        await createDenInCanopy(panel.mx, { canopyId: '!canopy:server', name: 'general' });
        expect(presetSent(panel.createRoom)).toBe('private_chat');
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

    it('placed in a category, admits members of the category and the canopy, and is public only when both are', async () => {
        setNewRoomSurfaceForTests('app');
        const canopy = space('!canopy:server', 'public');
        const publicCategory = space('!cat:server', 'public', [{ id: '!canopy:server' }]);
        const publicCase = makeMx({ '!canopy:server': canopy, '!cat:server': publicCategory });
        await createDenInCanopy(publicCase.mx, { canopyId: '!cat:server', name: 'topic' });
        expect(sent(publicCase.createRoom)).toEqual({
            joinRule: { join_rule: 'public' },
            encrypted: false,
        });

        // An older, invite-only category (every category made before 2026-10
        // was) inside a public canopy: the most private space on the chain
        // decides, so the den is restricted to category and canopy, and
        // encrypted, rather than public.
        const oldCategory = space('!cat:server', 'invite', [{ id: '!canopy:server' }]);
        const oldCase = makeMx({ '!canopy:server': canopy, '!cat:server': oldCategory });
        await createDenInCanopy(oldCase.mx, { canopyId: '!cat:server', name: 'topic' });
        expect(sent(oldCase.createRoom)).toEqual({
            joinRule: {
                join_rule: 'restricted',
                allow: allow('!cat:server', '!canopy:server'),
            },
            encrypted: true,
        });

        const privateCanopy = space('!canopy:server', 'invite');
        const privateCase = makeMx({ '!canopy:server': privateCanopy, '!cat:server': oldCategory });
        await createDenInCanopy(privateCase.mx, { canopyId: '!cat:server', name: 'topic' });
        expect(sent(privateCase.createRoom)).toEqual({
            joinRule: {
                join_rule: 'restricted',
                allow: allow('!cat:server', '!canopy:server'),
            },
            encrypted: true,
        });
    });

    it('placed directly in a private sub-canopy nested under a public canopy, is restricted and encrypted (the most private space on the chain decides)', async () => {
        // The voice/forum/stage/announcement controls are the only way to make
        // those den kinds and offer no chooser, so this path must land where
        // the forms opened in the same sub-canopy land: restricted + encrypted,
        // not the public canopy's public + plaintext.
        setNewRoomSurfaceForTests('app');
        const top = space('!top:server', 'public');
        const privateSub = space('!sub:server', 'invite', [{ id: '!top:server' }]);
        const nested = makeMx({ '!top:server': top, '!sub:server': privateSub });
        await createDenInCanopy(nested.mx, { canopyId: '!sub:server', name: 'ops', kind: 'voice' });
        expect(sent(nested.createRoom)).toEqual({
            joinRule: {
                join_rule: 'restricted',
                allow: allow('!sub:server', '!top:server'),
            },
            encrypted: true,
        });
        expect(nested.createRoom.mock.calls[0][0].preset).toBe('private_chat');

        // The mirror: a public sub-canopy under a private canopy is not public
        // either; a private space anywhere on the chain makes the den non-public.
        const privateTop = space('!top:server', 'invite');
        const publicSub = space('!sub:server', 'public', [{ id: '!top:server' }]);
        const mirror = makeMx({ '!top:server': privateTop, '!sub:server': publicSub });
        await createDenInCanopy(mirror.mx, { canopyId: '!sub:server', name: 'ops' });
        expect(sent(mirror.createRoom)).toEqual({
            joinRule: {
                join_rule: 'restricted',
                allow: allow('!sub:server', '!top:server'),
            },
            encrypted: true,
        });

        // Every space on the chain public: public and plaintext.
        const allPublic = makeMx({ '!top:server': top, '!sub:server': publicSub });
        await createDenInCanopy(allPublic.mx, { canopyId: '!sub:server', name: 'ops' });
        expect(sent(allPublic.createRoom)).toEqual({
            joinRule: { join_rule: 'public' },
            encrypted: false,
        });
    });

    it('placed in a category this client has not synced yet, follows the hinted canopy and admits both', async () => {
        // `useDiscussionDen` and the Discord import create a category and then
        // its dens before the sync brings the category back, so the walk from
        // the category cannot start; the caller names the canopy instead.
        setNewRoomSurfaceForTests('app');
        const publicCase = makeMx({ '!canopy:server': space('!canopy:server', 'public') });
        await createDenInCanopy(publicCase.mx, {
            canopyId: '!cat:server',
            rootCanopyId: '!canopy:server',
            name: 'topic',
        });
        expect(sent(publicCase.createRoom)).toEqual({
            joinRule: { join_rule: 'public' },
            encrypted: false,
        });

        const privateCase = makeMx({ '!canopy:server': space('!canopy:server', 'invite') });
        await createDenInCanopy(privateCase.mx, {
            canopyId: '!cat:server',
            rootCanopyId: '!canopy:server',
            name: 'topic',
        });
        expect(sent(privateCase.createRoom)).toEqual({
            joinRule: {
                join_rule: 'restricted',
                allow: allow('!cat:server', '!canopy:server'),
            },
            encrypted: true,
        });

        // Neither loaded (the Discord import right after making its canopy):
        // non-public, restricted to category and canopy.
        const neither = makeMx({});
        await createDenInCanopy(neither.mx, {
            canopyId: '!cat:server',
            rootCanopyId: '!canopy:server',
            name: 'topic',
        });
        expect(sent(neither.createRoom).joinRule).toEqual({
            join_rule: 'restricted',
            allow: allow('!cat:server', '!canopy:server'),
        });

        // A hint the walk already reached changes nothing.
        const reached = makeMx({
            '!canopy:server': space('!canopy:server', 'public'),
            '!cat:server': space('!cat:server', 'public', [{ id: '!canopy:server' }]),
        });
        await createDenInCanopy(reached.mx, {
            canopyId: '!cat:server',
            rootCanopyId: '!canopy:server',
            name: 'topic',
        });
        expect(sent(reached.createRoom).joinRule).toEqual({ join_rule: 'public' });

        // The placement room is loaded but the space above it is not: the
        // walk did not get past the placement room, so the hint still counts
        // and joins the chain.
        const parentUnloaded = makeMx({
            '!canopy:server': space('!canopy:server', 'invite'),
            '!cat:server': space('!cat:server', 'public', [{ id: '!canopy:server' }]),
        });
        await createDenInCanopy(parentUnloaded.mx, {
            canopyId: '!cat:server',
            rootCanopyId: '!canopy:server',
            name: 'topic',
        });
        expect(sent(parentUnloaded.createRoom)).toEqual({
            joinRule: {
                join_rule: 'restricted',
                allow: allow('!cat:server', '!canopy:server'),
            },
            encrypted: true,
        });

        // And the hint joins the chain rather than replacing it: a loaded,
        // invite-only placement room with no parent edge yet plus a public
        // hint is still non-public.
        const placementPrivate = makeMx({
            '!canopy:server': space('!canopy:server', 'public'),
            '!cat:server': space('!cat:server', 'invite'),
        });
        await createDenInCanopy(placementPrivate.mx, {
            canopyId: '!cat:server',
            rootCanopyId: '!canopy:server',
            name: 'topic',
        });
        expect(sent(placementPrivate.createRoom)).toEqual({
            joinRule: {
                join_rule: 'restricted',
                allow: allow('!cat:server', '!canopy:server'),
            },
            encrypted: true,
        });
    });

    it('ignores the rootCanopyId hint once the walk has reached a parent, even a different canopy', async () => {
        // The hint exists for a placement room the walk cannot start from. When
        // the walk did reach a loaded parent, that parent is the truth about
        // where the den sits; a hint naming a different (public) canopy must
        // neither decide the kind nor be admitted to the den.
        setNewRoomSurfaceForTests('app');
        const { mx, createRoom } = makeMx({
            '!q:server': space('!q:server', 'invite'),
            '!p:server': space('!p:server', 'public'),
            '!cat:server': space('!cat:server', 'invite', [{ id: '!q:server' }]),
        });
        await createDenInCanopy(mx, {
            canopyId: '!cat:server',
            rootCanopyId: '!p:server',
            name: 'topic',
        });
        expect(sent(createRoom)).toEqual({
            joinRule: {
                join_rule: 'restricted',
                allow: allow('!cat:server', '!q:server'),
            },
            encrypted: true,
        });
    });

    it('fetches the default room version only when the den could be restricted', async () => {
        // A public den does not depend on the room version, so no
        // getCapabilities round-trip; a den in a non-public canopy does.
        setNewRoomSurfaceForTests('app');
        const pub = makeMx({ '!canopy:server': space('!canopy:server', 'public') });
        await createDenInCanopy(pub.mx, { canopyId: '!canopy:server', name: 'general' });
        expect(sent(pub.createRoom).joinRule).toEqual({ join_rule: 'public' });
        expect(pub.getCapabilities).not.toHaveBeenCalled();

        const priv = makeMx({ '!canopy:server': space('!canopy:server', 'invite') });
        await createDenInCanopy(priv.mx, { canopyId: '!canopy:server', name: 'general' });
        expect(sent(priv.createRoom).joinRule.join_rule).toBe('restricted');
        expect(priv.getCapabilities).toHaveBeenCalledTimes(1);

        // In the panel a den in a public canopy is restricted, so the version
        // is needed there.
        setNewRoomSurfaceForTests('panel');
        const panel = makeMx({ '!canopy:server': space('!canopy:server', 'public') });
        await createDenInCanopy(panel.mx, { canopyId: '!canopy:server', name: 'general' });
        expect(sent(panel.createRoom).joinRule.join_rule).toBe('restricted');
        expect(panel.getCapabilities).toHaveBeenCalledTimes(1);
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
            // And the preset says so too, so the homeserver's backstop (which
            // encrypts every `private_chat` room) does not apply.
            expect(createRoom.mock.calls[0][0].preset).toBe('public_chat');
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

        expect(restricted.createRoom.mock.calls[0][0].preset).toBe('private_chat');

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
