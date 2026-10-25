/**
 * A caller's role in a canopy's voice rooms (`routes/voice.ts`): read from the
 * canopy's power levels on the homeserver, never from the request.
 *
 * The role decides who may create a voice room in a canopy, take moderation
 * actions in one (lock, mute, remove) and enter one that is locked. It used to
 * be taken from the request body, so any signed-in account could claim
 * `admin` (O4 in `docs/security/capability-header-triage-2026-10-23.md`).
 *
 * A voice room is keyed by canopy and channel. `canopyId` is the canopy's
 * Matrix room id, the space the directory lists; `channelId` is a label inside
 * it that the API never resolves to a room. So the role is the caller's
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
 * When it cannot tell, it says why instead of guessing, in this order, and the
 * routes then give no elevated role:
 *
 *   1. `account_unknown`           the caller has no Blackout account (any
 *                                  more), so no Matrix id;
 *   2. `matrix_not_configured`     no homeserver or bot token;
 *   3. `canopy_check_unavailable`  the state could not be read (network, any
 *                                  error but 404, a bad body), or the caller
 *                                  is joined but the room has no power-levels
 *                                  event, or a level the check needs is not an
 *                                  integer.
 *
 * Levels follow room versions 1 to 11, all the fork knows; in room version 12
 * a creator has no `users` entry and would be read as a member, which fails
 * closed. The canopy is not required to be a space: voice rooms are created
 * only for listed canopies (`hasCanopy`), and listing already requires one.
 */
import { matrixClient } from '../integrations/matrix-client';
import {
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

export type VoiceRoleVerdict =
    | { ok: true; role: VoiceRole }
    | { ok: false; reason: VoiceRoleUnavailable };

/** What a route that needs an elevated role answers instead. */
export type VoiceRoleRefusal = VoiceRoleUnavailable | 'not_canopy_moderator';

const unavailable = (reason: VoiceRoleUnavailable): VoiceRoleVerdict => ({ ok: false, reason });
const role = (value: VoiceRole): VoiceRoleVerdict => ({ ok: true, role: value });

/**
 * The Blackout user `userId`'s role in the voice rooms of `canopyId`. See the
 * file comment for the rule and the order of the checks.
 */
export async function readVoiceRole(userId: string, canopyId: string): Promise<VoiceRoleVerdict> {
    const mxid = matrixUserIdFor(userId);
    if (!mxid) return unavailable('account_unknown');

    const room = await matrixClient.getRoomStateAdmin(canopyId);
    if (!room.ok) {
        if (room.reason === 'matrix_not_configured') return unavailable('matrix_not_configured');
        if ('status' in room && room.status === 404) return role('member');
        return unavailable('canopy_check_unavailable');
    }

    const { state } = room;
    if (membershipOf(state, mxid) !== 'join') return role('member');

    const powerLevels = powerLevelsContent(state);
    if (!powerLevels) return unavailable('canopy_check_unavailable');
    const level = userPowerLevel(powerLevels, mxid);
    const adminLevel = requiredPowerLevel(powerLevels, 'm.room.power_levels', 'state');
    const moderatorLevel = namedPowerLevel(powerLevels, 'kick', 50);
    if (level === null || adminLevel === null || moderatorLevel === null) {
        return unavailable('canopy_check_unavailable');
    }

    if (level >= adminLevel) return role('admin');
    if (level >= moderatorLevel) return role('moderator');
    return role('member');
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
                    message: 'Could not check your role in this canopy on the homeserver.',
                },
            };
        default: {
            const exhaustive: never = reason;
            return {
                status: 503,
                body: {
                    code: exhaustive,
                    message: 'Could not check your role in this canopy on the homeserver.',
                },
            };
        }
    }
};
