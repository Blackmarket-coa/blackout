/**
 * A stand-in homeserver for tests of bot posting on a user's behalf.
 *
 * It answers the three calls the bot-posting gate and the senders make:
 *   - `GET  /_matrix/client/v3/account/whoami` → the bot's user id;
 *   - `GET  /_synapse/admin/v1/rooms/{room}/state` → `{ state }` from `rooms`
 *     (a number there is answered as that HTTP status; an unknown room is 404,
 *     as Synapse answers);
 *   - `PUT  /_matrix/client/v3/rooms/{room}/send/{type}/{txn}` → recorded in
 *     `sends`, answered with `sendStatus`.
 * And, for the bot's own rooms (the dead-man release notifier):
 *   - `POST /_matrix/client/v3/createRoom` → recorded in `creates`; a new room
 *     `!created-<n>:<domain>` is added to `rooms` with the state the fork's
 *     create leaves (`createdRoomState`), answered with `createStatus`; a
 *     `room_alias_name` is recorded in `aliases` as
 *     `#<name>:<domain>`, one already taken is refused 400 `M_ROOM_IN_USE`, as
 *     Synapse refuses it before making a room (`handlers/room.py`, "Room alias
 *     already taken"), and while `aliasRefusal` is set any alias is refused
 *     with it (an alias policy or an appservice's namespace); refusals are
 *     recorded in `createRefusals`;
 *   - `GET  /_matrix/client/v3/directory/room/{alias}` → `{ room_id }` from
 *     `aliases`, or 404;
 *   - `PUT  /_matrix/client/v3/rooms/{room}/state/m.room.member/{user}` and
 *     `POST /_matrix/client/v3/rooms/{room}/invite` → recorded in `invites`;
 *     the member's state in `rooms` becomes `invite`, answered with
 *     `inviteStatus`.
 * `purgeRoom` removes a room and its aliases, as Synapse's purge does
 * (`storage/databases/main/purge_events.py` deletes `room_aliases`).
 * Anything else goes to `fallback` (default: an empty JSON 200).
 *
 * Set `MATRIX_HOMESERVER_DOMAIN` to the stub's domain so `matrixUserIdFor`
 * yields `@<username>:<domain>`.
 */

export interface StubStateEvent {
    type: string;
    state_key?: string;
    content?: Record<string, unknown>;
    sender?: string;
}

export interface StubSend {
    roomId: string;
    eventType: string;
    txnId: string;
    raw: string;
    body: Record<string, unknown>;
}

export interface StubCreate {
    body: Record<string, unknown>;
    roomId: string;
}

/** A `createRoom` the stub refused, with the Matrix error code it answered. */
export interface StubCreateRefusal {
    body: Record<string, unknown>;
    errcode: string;
}

export interface StubInvite {
    roomId: string;
    userId: string;
    /** `state` for the member state PUT, `invite` for POST /invite. */
    via: 'state' | 'invite';
    body: Record<string, unknown>;
}

export interface MatrixStub {
    domain: string;
    botUserId: string;
    rooms: Map<string, StubStateEvent[] | number>;
    /** Room aliases (`#name:domain`) to room ids, as the homeserver's directory. */
    aliases: Map<string, string>;
    sends: StubSend[];
    creates: StubCreate[];
    /** Creates refused with a Matrix error code (a taken alias). Cleared with the calls. */
    createRefusals: StubCreateRefusal[];
    invites: StubInvite[];
    stateReads: string[];
    /** Alias lookups, the alias as asked. Cleared with the calls. */
    aliasReads: string[];
    /**
     * Matrix ids the homeserver already has. The admin single-user GET answers
     * 200 for these and 404 otherwise, and the admin PUT (account creation)
     * answers 200 ("modified") for these and 201 ("created") otherwise. A test
     * that needs account creation to meet an existing name adds its mxid here.
     */
    existingUsers: Set<string>;
    /** Matrix ids the admin GET was asked about. */
    userLookups: string[];
    /** Matrix ids the admin PUT (account create/update) was asked to write. */
    userWrites: string[];
    sendStatus: number;
    createStatus: number;
    inviteStatus: number;
    /**
     * When set, a create naming any alias is refused with this status and
     * Matrix error code and makes no room, as a homeserver whose
     * `alias_creation_rules` forbid the bot answers 403, or one whose
     * appservice holds the namespace 400 `M_EXCLUSIVE` (`handlers/directory.py`).
     */
    aliasRefusal: { status: number; errcode: string } | null;
    /** Runs when a room's state is read, before the answer goes back. */
    onStateRead: ((roomId: string) => void) | null;
    fetch: typeof fetch;
    /** Forget recorded calls (rooms, aliases and existing users are kept). */
    clearCalls(): void;
    /** Matrix id of a username on the stub's domain. */
    mxid(username: string): string;
    /** Sends into one room. */
    sendsTo(roomId: string): StubSend[];
    /** Remove a room and every alias pointing at it, as a purge does. */
    purgeRoom(roomId: string): void;
}

export const memberEvent = (userId: string, membership = 'join'): StubStateEvent => ({
    type: 'm.room.member',
    state_key: userId,
    content: { membership },
});

export const joinRulesEvent = (joinRule: string): StubStateEvent => ({
    type: 'm.room.join_rules',
    state_key: '',
    content: { join_rule: joinRule },
});

export const encryptionEvent = (): StubStateEvent => ({
    type: 'm.room.encryption',
    state_key: '',
    content: { algorithm: 'm.megolm.v1.aes-sha2' },
});

export const powerLevelsEvent = (content: Record<string, unknown>): StubStateEvent => ({
    type: 'm.room.power_levels',
    state_key: '',
    content,
});

/**
 * The state a completed `createRoom` leaves, as the fork writes it
 * (`handlers/room.py`, `_send_events_for_new_room`): the creator's
 * `m.room.create`, the creator's join, then one batch with the power levels
 * (Synapse's defaults with the body's `power_level_content_override` over
 * them), the canonical alias, the preset's join rule and history visibility
 * unless `initial_state` has its own, the `initial_state`, and the name; then
 * the invites. A create abandoned part way leaves a prefix of this.
 */
export const createdRoomState = (
    creator: string,
    body: Record<string, unknown> = {},
    alias?: string
): StubStateEvent[] => {
    const initial = (
        Array.isArray(body.initial_state) ? body.initial_state : []
    ) as StubStateEvent[];
    const invited = (Array.isArray(body.invite) ? body.invite : []) as string[];
    const has = (type: string) =>
        initial.some((e) => e.type === type && (e.state_key ?? '') === '');
    const preset = typeof body.preset === 'string' ? body.preset : 'private_chat';
    const override = (body.power_level_content_override ?? {}) as Record<string, unknown>;
    return [
        { type: 'm.room.create', state_key: '', sender: creator, content: { room_version: '10' } },
        memberEvent(creator),
        powerLevelsEvent({
            users: { [creator]: 100 },
            users_default: 0,
            events_default: 0,
            state_default: 50,
            ban: 50,
            kick: 50,
            redact: 50,
            invite: 50,
            ...override,
        }),
        ...(alias ? [{ type: 'm.room.canonical_alias', state_key: '', content: { alias } }] : []),
        ...(has('m.room.join_rules')
            ? []
            : [joinRulesEvent(preset === 'public_chat' ? 'public' : 'invite')]),
        ...(has('m.room.history_visibility')
            ? []
            : [
                  {
                      type: 'm.room.history_visibility',
                      state_key: '',
                      content: { history_visibility: 'shared' },
                  },
              ]),
        ...initial.map((e) => ({ ...e, state_key: e.state_key ?? '' })),
        ...(typeof body.name === 'string'
            ? [{ type: 'm.room.name', state_key: '', content: { name: body.name } }]
            : []),
        ...invited.map((userId) => memberEvent(userId, 'invite')),
    ];
};

const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });

const urlOf = (input: RequestInfo | URL): string =>
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

const ADMIN_STATE_RE = /\/_synapse\/admin\/v1\/rooms\/([^/?]+)\/state(?:\?|$)/;
const SEND_RE = /\/_matrix\/client\/v3\/rooms\/([^/]+)\/send\/([^/]+)\/([^/?]+)/;
const CREATE_RE = /\/_matrix\/client\/v3\/createRoom(?:\?|$)/;
const DIRECTORY_RE = /\/_matrix\/client\/v3\/directory\/room\/([^/?]+)(?:\?|$)/;
const MEMBER_STATE_RE = /\/_matrix\/client\/v3\/rooms\/([^/]+)\/state\/m\.room\.member\/([^/?]+)/;
const INVITE_RE = /\/_matrix\/client\/v3\/rooms\/([^/]+)\/invite(?:\?|$)/;

const parseBody = (init?: RequestInit): Record<string, unknown> => {
    if (typeof init?.body !== 'string') return {};
    try {
        return JSON.parse(init.body) as Record<string, unknown>;
    } catch {
        return {};
    }
};
// The single-user admin endpoint, `/_synapse/admin/v2/users/{mxid}` — distinct
// from the list endpoint, which has a `?` query. The id segment is a URL-encoded
// mxid, so it carries no bare `/` and ends at the end of the path.
const ADMIN_USER_RE = /\/_synapse\/admin\/v2\/users\/([^/?]+)$/;

export function createMatrixStub(
    options: { domain?: string; botLocalpart?: string; fallback?: typeof fetch } = {}
): MatrixStub {
    const domain = options.domain ?? 'test.local';
    // Room ids are never reused, however often the calls are cleared.
    let createdRooms = 0;
    const stub: MatrixStub = {
        domain,
        botUserId: `@${options.botLocalpart ?? 'blackout'}:${domain}`,
        rooms: new Map(),
        aliases: new Map(),
        sends: [],
        creates: [],
        createRefusals: [],
        invites: [],
        stateReads: [],
        aliasReads: [],
        existingUsers: new Set(),
        userLookups: [],
        userWrites: [],
        sendStatus: 200,
        createStatus: 200,
        inviteStatus: 200,
        aliasRefusal: null,
        onStateRead: null,
        fetch: (async () => json({})) as typeof fetch,
        clearCalls() {
            stub.sends.length = 0;
            stub.creates.length = 0;
            stub.createRefusals.length = 0;
            stub.invites.length = 0;
            stub.stateReads.length = 0;
            stub.aliasReads.length = 0;
            stub.userLookups.length = 0;
            stub.userWrites.length = 0;
        },
        mxid: (username: string) => `@${username}:${domain}`,
        sendsTo: (roomId: string) => stub.sends.filter((s) => s.roomId === roomId),
        purgeRoom(roomId: string) {
            stub.rooms.delete(roomId);
            for (const [alias, target] of [...stub.aliases.entries()]) {
                if (target === roomId) stub.aliases.delete(alias);
            }
        },
    };

    stub.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input);
        if (url.includes('/_matrix/client/v3/account/whoami')) {
            return json({ user_id: stub.botUserId });
        }
        const userMatch = ADMIN_USER_RE.exec(url);
        if (userMatch) {
            const userId = decodeURIComponent(userMatch[1]);
            const method = (init?.method ?? 'GET').toUpperCase();
            if (method === 'PUT') {
                stub.userWrites.push(userId);
                // 200 = modified an account that already existed; 201 = created.
                return json({ name: userId }, stub.existingUsers.has(userId) ? 200 : 201);
            }
            stub.userLookups.push(userId);
            return stub.existingUsers.has(userId)
                ? json({ name: userId }, 200)
                : json({ errcode: 'M_NOT_FOUND' }, 404);
        }
        const stateMatch = ADMIN_STATE_RE.exec(url);
        if (stateMatch) {
            const roomId = decodeURIComponent(stateMatch[1]);
            stub.stateReads.push(roomId);
            stub.onStateRead?.(roomId);
            const room = stub.rooms.get(roomId);
            if (room === undefined) return json({ errcode: 'M_NOT_FOUND' }, 404);
            if (typeof room === 'number') return json({ errcode: 'M_UNKNOWN' }, room);
            return json({ state: room });
        }
        const sendMatch = SEND_RE.exec(url);
        if (sendMatch && (init?.method ?? 'GET').toUpperCase() === 'PUT') {
            const raw = typeof init?.body === 'string' ? init.body : '';
            let body: Record<string, unknown> = {};
            try {
                body = JSON.parse(raw) as Record<string, unknown>;
            } catch {
                /* recorded raw */
            }
            stub.sends.push({
                roomId: decodeURIComponent(sendMatch[1]),
                eventType: decodeURIComponent(sendMatch[2]),
                txnId: decodeURIComponent(sendMatch[3]),
                raw,
                body,
            });
            return stub.sendStatus >= 200 && stub.sendStatus < 300
                ? json({ event_id: `$evt-${stub.sends.length}:${domain}` }, stub.sendStatus)
                : json({ errcode: 'M_UNKNOWN' }, stub.sendStatus);
        }
        const method = (init?.method ?? 'GET').toUpperCase();
        if (CREATE_RE.test(url) && method === 'POST') {
            if (stub.createStatus < 200 || stub.createStatus >= 300) {
                return json({ errcode: 'M_UNKNOWN' }, stub.createStatus);
            }
            const body = parseBody(init);
            const alias =
                typeof body.room_alias_name === 'string'
                    ? `#${body.room_alias_name}:${domain}`
                    : undefined;
            if (alias && stub.aliases.has(alias)) {
                // Synapse checks the alias before it makes the room, and makes none.
                stub.createRefusals.push({ body, errcode: 'M_ROOM_IN_USE' });
                return json({ errcode: 'M_ROOM_IN_USE', error: 'Room alias already taken' }, 400);
            }
            if (alias && stub.aliasRefusal) {
                // Synapse makes a room id before the alias is refused, but no
                // event in it: nothing anyone can see, so none here.
                const { status, errcode } = stub.aliasRefusal;
                stub.createRefusals.push({ body, errcode });
                return json({ errcode, error: 'Not allowed to create alias' }, status);
            }
            createdRooms += 1;
            const roomId = `!created-${createdRooms}:${domain}`;
            stub.rooms.set(roomId, createdRoomState(stub.botUserId, body, alias));
            if (alias) stub.aliases.set(alias, roomId);
            stub.creates.push({ body, roomId });
            return json({ room_id: roomId }, stub.createStatus);
        }
        const directoryMatch = DIRECTORY_RE.exec(url);
        if (directoryMatch && method === 'GET') {
            const alias = decodeURIComponent(directoryMatch[1]);
            stub.aliasReads.push(alias);
            const roomId = stub.aliases.get(alias);
            if (!roomId)
                return json({ errcode: 'M_NOT_FOUND', error: 'Room alias not found' }, 404);
            return json({ room_id: roomId, servers: [domain] });
        }
        const memberMatch = MEMBER_STATE_RE.exec(url);
        if (memberMatch && method === 'PUT') {
            return invite(
                decodeURIComponent(memberMatch[1]),
                decodeURIComponent(memberMatch[2]),
                'state',
                parseBody(init)
            );
        }
        const inviteMatch = INVITE_RE.exec(url);
        if (inviteMatch && method === 'POST') {
            const body = parseBody(init);
            return invite(
                decodeURIComponent(inviteMatch[1]),
                String(body.user_id ?? ''),
                'invite',
                body
            );
        }
        if (options.fallback) return options.fallback(input, init);
        return json({});
    }) as typeof fetch;

    function invite(
        roomId: string,
        userId: string,
        via: StubInvite['via'],
        body: Record<string, unknown>
    ): Response {
        stub.invites.push({ roomId, userId, via, body });
        if (stub.inviteStatus < 200 || stub.inviteStatus >= 300) {
            return json({ errcode: 'M_FORBIDDEN' }, stub.inviteStatus);
        }
        const room = stub.rooms.get(roomId);
        if (Array.isArray(room)) {
            const rest = room.filter(
                (e) => !(e.type === 'm.room.member' && e.state_key === userId)
            );
            stub.rooms.set(roomId, [...rest, memberEvent(userId, 'invite')]);
        }
        return json({ event_id: `$invite-${stub.invites.length}:${domain}` });
    }

    return stub;
}
