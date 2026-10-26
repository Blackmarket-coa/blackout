/**
 * The gate every bot post made on a user's behalf goes through.
 *
 * The Blackout bot sends scheduled messages (`scheduledMessageDispatcher`) and
 * the legacy message endpoint's room post (`routes/messages.ts`) as itself,
 * with the author's name in the text. The bot is a plain HTTP client with no
 * Megolm, so whatever it sends is plaintext. Before this gate existed the API
 * never looked at the target room, so any signed-in account could make the bot
 * post into any room the bot had joined, including end-to-end encrypted rooms
 * whose members' composer told them the server could not read the room.
 *
 * The check reads the room's current state through the Synapse admin API
 * (`matrixClient.getRoomStateAdmin`), which works whether or not the bot is in
 * the room, and refuses, in this order:
 *
 *   1. `author_unknown`        the author has no Blackout account (any more);
 *   2. `matrix_not_configured` no homeserver or bot token;
 *   3. `room_check_unavailable` the state could not be read (a 404, an unknown
 *                              room, counts as `not_room_member` instead);
 *   4. `not_room_member`       the author's membership is not `join`;
 *   5. `insufficient_power`    the author may not send `m.room.message`;
 *   6. `room_encrypted`        the room has an `m.room.encryption` state event;
 *   7. `bot_not_in_room`       the bot's membership is not `join`.
 *
 * Membership is checked before anything else about the room, so a caller who
 * is not in a room learns nothing more about it than "not a member", the same
 * answer an unknown room id gets.
 *
 * The author's Matrix id is `@<username>:<MATRIX_HOMESERVER_DOMAIN>`
 * (`matrixUserIdFor`): every sign-up path stores the Matrix localpart as the
 * username. If that domain differs from Synapse's `server_name` the author is
 * never found and every post is refused, which fails safe.
 *
 * Power levels follow the room v10 rules (the fork's default room version):
 * `users[mxid] ?? users_default ?? 0` must reach
 * `events['m.room.message'] ?? events_default ?? 0`; with no power-levels
 * event anyone may post. A level that is present but not an integer refuses.
 * The membership, join-rule and power-level readers are exported for the
 * canopy listing check (`canopyListingGate.ts`) and the voice-room standing
 * check (`voiceRoleGate.ts`), so all three read a room's state the same way.
 */
import { matrixClient, type RoomStateEvent } from '../integrations/matrix-client';
import { matrixUserIdFor } from './userIdentity';

export type BotPostRefusal =
    | 'author_unknown'
    | 'matrix_not_configured'
    | 'room_check_unavailable'
    | 'not_room_member'
    | 'insufficient_power'
    | 'room_encrypted'
    | 'bot_not_in_room';

export type BotPostVerdict = { ok: true } | { ok: false; reason: BotPostRefusal };

/**
 * Refusals that may clear on their own (an outage, a deploy without Matrix
 * configured yet). The dispatcher retries these; every other refusal ends the
 * scheduled message.
 */
export const RETRYABLE_BOT_POST_REFUSALS: ReadonlySet<BotPostRefusal> = new Set([
    'matrix_not_configured',
    'room_check_unavailable',
]);

const refuse = (reason: BotPostRefusal): BotPostVerdict => ({ ok: false, reason });

export const membershipOf = (state: RoomStateEvent[], mxid: string): unknown =>
    state.find((e) => e.type === 'm.room.member' && e.state_key === mxid)?.content?.membership;

/** The room's join rule (`m.room.join_rules`, `join_rule`); `undefined` when absent or not a string. */
export const joinRuleOf = (state: RoomStateEvent[]): string | undefined => {
    const rule = state.find((e) => e.type === 'm.room.join_rules' && !e.state_key)?.content
        ?.join_rule;
    return typeof rule === 'string' ? rule : undefined;
};

/**
 * A power level as an integer; `undefined` when absent, `null` when present
 * but unusable. Room versions before v10 allowed integer strings.
 */
const asLevel = (value: unknown): number | null | undefined => {
    if (value === undefined) return undefined;
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'string' && /^\s*[+-]?\d+\s*$/.test(value)) {
        return Number.parseInt(value, 10);
    }
    return null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};

/** First level that is present (`null` included), else 0. */
const firstLevel = (...candidates: Array<number | null | undefined>): number | null => {
    for (const candidate of candidates) {
        if (candidate !== undefined) return candidate;
    }
    return 0;
};

/** The content of the room's `m.room.power_levels` event; `undefined` when it has none. */
export const powerLevelsContent = (
    state: RoomStateEvent[]
): Record<string, unknown> | undefined => {
    const powerLevels = state.find((e) => e.type === 'm.room.power_levels' && !e.state_key);
    return powerLevels ? asRecord(powerLevels.content) : undefined;
};

/** `users[mxid] ?? users_default ?? 0`; `null` when the level present is unusable. */
export const userPowerLevel = (content: Record<string, unknown>, mxid: string): number | null =>
    firstLevel(asLevel(asRecord(content.users)[mxid]), asLevel(content.users_default));

/**
 * The level needed to send `eventType`: `events[eventType]`, else
 * `state_default ?? 50` for a state event and `events_default ?? 0` for any
 * other (the spec's defaults); `null` when the level present is unusable.
 */
export const requiredPowerLevel = (
    content: Record<string, unknown>,
    eventType: string,
    kind: 'state' | 'message'
): number | null => {
    const events = asRecord(content.events);
    return kind === 'state'
        ? firstLevel(asLevel(events[eventType]), asLevel(content.state_default), 50)
        : firstLevel(asLevel(events[eventType]), asLevel(content.events_default));
};

/**
 * One of the spec's named levels (`kick`, `ban`, `redact`, `invite`), else
 * `fallback`, the spec's default for it (50 for the first three, 0 for
 * `invite`); `null` when the level present is unusable.
 */
export const namedPowerLevel = (
    content: Record<string, unknown>,
    name: 'kick' | 'ban' | 'redact' | 'invite',
    fallback: number
): number | null => firstLevel(asLevel(content[name]), fallback);

const mayPostMessage = (state: RoomStateEvent[], mxid: string): boolean => {
    const content = powerLevelsContent(state);
    if (!content) return true;
    const userLevel = userPowerLevel(content, mxid);
    const required = requiredPowerLevel(content, 'm.room.message', 'message');
    if (userLevel === null || required === null) return false;
    return userLevel >= required;
};

/**
 * May the bot post into `roomId` on behalf of the Blackout user
 * `authorUserId`? See the file comment for the order of the checks.
 */
export async function checkBotMayPostAs(
    authorUserId: string,
    roomId: string
): Promise<BotPostVerdict> {
    const authorMxid = matrixUserIdFor(authorUserId);
    if (!authorMxid) return refuse('author_unknown');

    const botMxid = await matrixClient.botUserId();
    if (!botMxid) return refuse('matrix_not_configured');

    const room = await matrixClient.getRoomStateAdmin(roomId);
    if (!room.ok) {
        if (room.reason === 'matrix_not_configured') return refuse('matrix_not_configured');
        if ('status' in room && room.status === 404) return refuse('not_room_member');
        return refuse('room_check_unavailable');
    }

    const { state } = room;
    if (membershipOf(state, authorMxid) !== 'join') return refuse('not_room_member');
    if (!mayPostMessage(state, authorMxid)) return refuse('insufficient_power');
    if (state.some((e) => e.type === 'm.room.encryption')) return refuse('room_encrypted');
    if (membershipOf(state, botMxid) !== 'join') return refuse('bot_not_in_room');
    return { ok: true };
}

/** HTTP status and body for a refusal at a request-path caller. */
export const botPostRefusalResponse = (
    reason: BotPostRefusal
): { status: 401 | 403 | 409 | 503; body: { code: BotPostRefusal; message: string } } => {
    switch (reason) {
        case 'not_room_member':
            return {
                status: 403,
                body: { code: reason, message: 'You are not a member of that room.' },
            };
        case 'insufficient_power':
            return {
                status: 403,
                body: { code: reason, message: 'You are not allowed to post in that room.' },
            };
        case 'room_encrypted':
            return {
                status: 409,
                body: {
                    code: reason,
                    message:
                        'That room is end-to-end encrypted. The Blackout bot cannot encrypt, so it does not post there.',
                },
            };
        case 'bot_not_in_room':
            return {
                status: 409,
                body: { code: reason, message: 'The Blackout bot is not in that room.' },
            };
        case 'matrix_not_configured':
            return {
                status: 503,
                body: { code: reason, message: 'Matrix is not configured on this server.' },
            };
        case 'room_check_unavailable':
            return {
                status: 503,
                body: { code: reason, message: 'Could not check the room. Try again.' },
            };
        case 'author_unknown':
            return {
                status: 401,
                body: { code: reason, message: 'Your account could not be found.' },
            };
        default: {
            const exhaustive: never = reason;
            return {
                status: 503,
                body: { code: exhaustive, message: 'Could not check the room. Try again.' },
            };
        }
    }
};
