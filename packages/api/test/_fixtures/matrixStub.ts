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

export interface MatrixStub {
    domain: string;
    botUserId: string;
    rooms: Map<string, StubStateEvent[] | number>;
    sends: StubSend[];
    stateReads: string[];
    sendStatus: number;
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

export function createMatrixStub(
    options: { domain?: string; botLocalpart?: string; fallback?: typeof fetch } = {}
): MatrixStub {
    const domain = options.domain ?? 'test.local';
    const stub: MatrixStub = {
        domain,
        botUserId: `@${options.botLocalpart ?? 'blackout'}:${domain}`,
        rooms: new Map(),
        sends: [],
        stateReads: [],
        sendStatus: 200,
        onStateRead: null,
        fetch: (async () => json({})) as typeof fetch,
        clearCalls() {
            stub.sends.length = 0;
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
        if (options.fallback) return options.fallback(input, init);
        return json({});
    }) as typeof fetch;

    return stub;
}
