/**
 * A caller's standing in a canopy's voice rooms (`routes/voice.ts`): read from
 * the canopy's state on the homeserver, never from the request. One read of
 * the state answers two things:
 *
 *   - the **role**, which decides who may create a voice room in a canopy,
 *     take moderation actions in one (lock, mute, remove, readmit) and enter
 *     one that is locked. It used to be taken from the request body, so any
 *     signed-in account could claim `admin` (O4 in
 *     `docs/security/capability-header-triage-2026-10-23.md`);
 *   - the **entry**: whether the canopy admits the account into its voice
 *     rooms at all (V6 there). Until 2026-10-25 an unlocked room was drop-in
 *     for every signed-in, entitled account, one the canopy had banned
 *     included.
 *
 * A voice room is keyed by canopy and channel. `canopyId` is the canopy's
 * Matrix room id, the space the directory lists; `channelId` is a label inside
 * it that the API never resolves to a room. So both answers are the caller's
 * standing in the canopy.
 *
 * The check reads the canopy's current state through the Synapse admin API
 * (`matrixClient.getRoomStateAdmin`), as the canopy listing check does, with
 * that check's readers (`botPostingGate.ts`). The caller's level is
 * `users[mxid] ?? users_default ?? 0`, and the role is:
 *
 *   - `admin`      joined, and the level reaches the level needed to change
 *                  `m.room.power_levels`
 *                  (`events['m.room.power_levels'] ?? state_default ?? 50`),
 *                  the listing check's definition of a canopy admin;
 *   - `moderator`  joined, and the level reaches `kick ?? 50`, the level the
 *                  homeserver requires to remove someone from the canopy;
 *   - `member`     anyone else: not joined (left, invited, banned, never
 *                  there), below both levels, or the room is unknown (a 404),
 *                  so an unknown canopy and one the caller has no standing in
 *                  get the same answer.
 *
 * The entry follows the caller's membership in the canopy and the canopy's
 * join rule (`m.room.join_rules`), the facts the homeserver itself goes by
 * when the account tries to join the canopy:
 *
 *   - `canopy_banned`      membership `ban`: refused, whatever level the
 *                          account kept;
 *   - `ok`                 membership `join` or `invite` (the canopy let them
 *                          in, or asked them in), or any other membership
 *                          where the join rule is `public`, which is what
 *                          makes a room drop-in;
 *   - `not_canopy_member`  anyone else: left, knocked or never there where
 *                          the rule is `invite`, `knock`, `restricted`,
 *                          `knock_restricted` or `private`, or there is no
 *                          rule to read (the API cannot evaluate a restricted
 *                          rule's allow list, so it fails closed), and every
 *                          account for a room the homeserver does not know.
 *
 * When it cannot tell, it says why instead of guessing, in this order. The
 * routes then give no elevated role, and an unlocked room still admits a
 * member, so an ordinary join does not depend on the homeserver; while that
 * holds the entry check cannot run either, which `KNOWN_LIMITATIONS.md`
 * states:
 *
 *   1. `account_unknown`           the caller has no Blackout account (any
 *                                  more), so no Matrix id;
 *   2. `matrix_not_configured`     no homeserver or bot token;
 *   3. `canopy_check_unavailable`  the state could not be read (network, any
 *                                  error but 404, a bad body), or an account
 *                                  that is joined has no power-levels event to
 *                                  be read against, or a level the role needs
 *                                  is not an integer.
 *
 * Levels follow room versions 1 to 11, all the fork knows; in room version 12
 * a creator has no `users` entry and would be read as a member, which fails
 * closed. The canopy is not required to be a space: voice rooms are created
 * only for listed canopies (`hasCanopy`), and listing already requires one.
 */
import { matrixClient, type RoomStateEvent } from '../integrations/matrix-client';
import {
    joinRuleOf,
    membershipOf,
    namedPowerLevel,
    powerLevelsContent,
    requiredPowerLevel,
    userPowerLevel,
} from './botPostingGate';
import type { VoiceRole } from './livekit';
import { matrixUserIdFor } from './userIdentity';

export type VoiceRoleUnavailable =
    | 'account_unknown'
    | 'matrix_not_configured'
    | 'canopy_check_unavailable';

/** The spec's membership states, and `none` for an account with no member event. */
export type CanopyMembership = 'join' | 'invite' | 'knock' | 'leave' | 'ban' | 'none';

/** Whether the canopy admits the account into its voice rooms (V6). */
export type VoiceEntry = 'ok' | 'canopy_banned' | 'not_canopy_member';

export interface VoiceStanding {
    role: VoiceRole;
    membership: CanopyMembership;
    entry: VoiceEntry;
    /**
     * `users[mxid] ?? users_default ?? 0`, read whether or not the account is
     * joined, since moderation compares a moderator's level with a target's.
     * `null` when the level present is not an integer (for a joined account
     * the whole standing is unavailable then); 0 for a room the homeserver
     * does not know, and for an account that is not joined to a room with no
     * power-levels event (its creator's implicit 100 is not read: a joined
     * account is unavailable in such a room, so nothing is compared there).
     */
    level: number | null;
}

export type VoiceRoleVerdict =
    | ({ ok: true } & VoiceStanding)
    | { ok: false; reason: VoiceRoleUnavailable };

/** What a route answers instead of serving the caller. */
export type VoiceRoleRefusal =
    | VoiceRoleUnavailable
    | 'not_canopy_moderator'
    | Exclude<VoiceEntry, 'ok'>;

const MEMBERSHIPS: ReadonlySet<string> = new Set(['join', 'invite', 'knock', 'leave', 'ban']);

const membershipIn = (state: RoomStateEvent[], mxid: string): CanopyMembership => {
    const membership = membershipOf(state, mxid);
    return typeof membership === 'string' && MEMBERSHIPS.has(membership)
        ? (membership as CanopyMembership)
        : 'none';
};

const entryFor = (membership: CanopyMembership, joinRule: string | undefined): VoiceEntry => {
    if (membership === 'ban') return 'canopy_banned';
    if (membership === 'join' || membership === 'invite') return 'ok';
    return joinRule === 'public' ? 'ok' : 'not_canopy_member';
};

/** Every account's standing in a room the homeserver does not know (404). */
const UNKNOWN_CANOPY: VoiceStanding = {
    role: 'member',
    membership: 'none',
    entry: 'not_canopy_member',
    level: 0,
};

/**
 * The standing of the Matrix id `mxid` in a canopy with this state; `null`
 * when the state cannot be read against for it (`canopy_check_unavailable`).
 */
export function standingOf(state: RoomStateEvent[], mxid: string): VoiceStanding | null {
    const membership = membershipIn(state, mxid);
    const entry = entryFor(membership, joinRuleOf(state));
    const powerLevels = powerLevelsContent(state);
    if (!powerLevels) {
        return membership === 'join' ? null : { role: 'member', membership, entry, level: 0 };
    }
    const level = userPowerLevel(powerLevels, mxid);
    if (membership !== 'join') return { role: 'member', membership, entry, level };
    if (level === null) return null;
    const adminLevel = requiredPowerLevel(powerLevels, 'm.room.power_levels', 'state');
    const moderatorLevel = namedPowerLevel(powerLevels, 'kick', 50);
    if (adminLevel === null || moderatorLevel === null) return null;
    const role: VoiceRole =
        level >= adminLevel ? 'admin' : level >= moderatorLevel ? 'moderator' : 'member';
    return { role, membership, entry, level };
}

/**
 * The standings of several accounts (Matrix ids) in `canopyId`, from one read
 * of its state, so that a moderator and their target are judged against the
 * same state. See the file comment for the rule and the order of the checks.
 */
export async function readCanopyStandings(
    canopyId: string,
    mxids: readonly string[]
): Promise<
    | { ok: true; standings: Map<string, VoiceStanding> }
    | { ok: false; reason: Exclude<VoiceRoleUnavailable, 'account_unknown'> }
> {
    const room = await matrixClient.getRoomStateAdmin(canopyId);
    if (!room.ok) {
        if (room.reason === 'matrix_not_configured') {
            return { ok: false, reason: 'matrix_not_configured' };
        }
        if ('status' in room && room.status === 404) {
            return { ok: true, standings: new Map(mxids.map((mxid) => [mxid, UNKNOWN_CANOPY])) };
        }
        return { ok: false, reason: 'canopy_check_unavailable' };
    }
    const standings = new Map<string, VoiceStanding>();
    for (const mxid of mxids) {
        const standing = standingOf(room.state, mxid);
        if (!standing) return { ok: false, reason: 'canopy_check_unavailable' };
        standings.set(mxid, standing);
    }
    return { ok: true, standings };
}

/**
 * The Blackout user `userId`'s standing in the voice rooms of `canopyId`. See
 * the file comment for the rule and the order of the checks.
 */
export async function readVoiceRole(userId: string, canopyId: string): Promise<VoiceRoleVerdict> {
    const mxid = matrixUserIdFor(userId);
    if (!mxid) return { ok: false, reason: 'account_unknown' };
    const read = await readCanopyStandings(canopyId, [mxid]);
    if (!read.ok) return { ok: false, reason: read.reason };
    return { ok: true, ...read.standings.get(mxid)! };
}

/** HTTP status and body for a refusal. */
export const voiceRoleRefusalResponse = (
    reason: VoiceRoleRefusal
): { status: 401 | 403 | 503; body: { code: VoiceRoleRefusal; message: string } } => {
    switch (reason) {
        case 'not_canopy_moderator':
            return {
                status: 403,
                body: {
                    code: reason,
                    message: 'Only a moderator or admin of this canopy can do that.',
                },
            };
        case 'canopy_banned':
            return {
                status: 403,
                body: { code: reason, message: 'This canopy has banned your account.' },
            };
        case 'not_canopy_member':
            return {
                status: 403,
                body: {
                    code: reason,
                    message: 'You are not a member of this canopy, and it is not open to join.',
                },
            };
        case 'account_unknown':
            return {
                status: 401,
                body: { code: reason, message: 'Your account could not be found.' },
            };
        case 'matrix_not_configured':
            return {
                status: 503,
                body: { code: reason, message: 'Matrix is not configured on this server.' },
            };
        case 'canopy_check_unavailable':
            return {
                status: 503,
                body: {
                    code: reason,
                    message: 'Could not check your standing in this canopy on the homeserver.',
                },
            };
        default: {
            const exhaustive: never = reason;
            return {
                status: 503,
                body: {
                    code: exhaustive,
                    message: 'Could not check your standing in this canopy on the homeserver.',
                },
            };
        }
    }
};
