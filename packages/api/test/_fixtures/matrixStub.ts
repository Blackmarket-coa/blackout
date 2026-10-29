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
 *     `!created-<n>:<domain>` is added to `rooms` with the bot joined and each
 *     invitee invited, answered with `createStatus`;
 *   - `PUT  /_matrix/client/v3/rooms/{room}/state/m.room.member/{user}` and
 *     `POST /_matrix/client/v3/rooms/{room}/invite` → recorded in `invites`;
 *     the member's state in `rooms` becomes `invite`, answered with
 *     `inviteStatus`.
 * Anything else goes to `fallback` (default: an empty JSON 200).
 *
 * Set `MATRIX_HOMESERVER_DOMAIN` to the stub's domain so `matrixUserIdFor`
 * yields `@<username>:<domain>`.
 */

export interface StubStateEvent {
    type: string;
    state_key?: string;
    content?: Record<string, unknown>;
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
    sends: StubSend[];
    creates: StubCreate[];
    invites: StubInvite[];
    stateReads: string[];
    sendStatus: number;
    createStatus: number;
    inviteStatus: number;
    /** Runs when a room's state is read, before the answer goes back. */
    onStateRead: ((roomId: string) => void) | null;
    fetch: typeof fetch;
    /** Forget recorded calls (rooms are kept). */
    clearCalls(): void;
    /** Matrix id of a username on the stub's domain. */
    mxid(username: string): string;
    /** Sends into one room. */
    sendsTo(roomId: string): StubSend[];
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
        sends: [],
        creates: [],
        invites: [],
        stateReads: [],
        sendStatus: 200,
        createStatus: 200,
        inviteStatus: 200,
        onStateRead: null,
        fetch: (async () => json({})) as typeof fetch,
        clearCalls() {
            stub.sends.length = 0;
            stub.creates.length = 0;
            stub.invites.length = 0;
            stub.stateReads.length = 0;
        },
        mxid: (username: string) => `@${username}:${domain}`,
        sendsTo: (roomId: string) => stub.sends.filter((s) => s.roomId === roomId),
    };

    stub.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = urlOf(input);
        if (url.includes('/_matrix/client/v3/account/whoami')) {
            return json({ user_id: stub.botUserId });
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
            createdRooms += 1;
            const roomId = `!created-${createdRooms}:${domain}`;
            const invited = Array.isArray(body.invite) ? (body.invite as string[]) : [];
            stub.rooms.set(roomId, [
                memberEvent(stub.botUserId),
                ...invited.map((userId) => memberEvent(userId, 'invite')),
            ]);
            stub.creates.push({ body, roomId });
            return json({ room_id: roomId }, stub.createStatus);
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
