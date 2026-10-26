/**
 * Who may list a canopy in the Blackout canopy directory, or change its entry
 * (`POST /v1/discovery/index/canopies`): an admin of that canopy on the
 * homeserver.
 *
 * A directory entry is what voice-room creation (`routes/voice.ts`) and app
 * installs (`services/apps.ts`) look for (`hasCanopy`), and its name and
 * summary are what anyone browsing the directory reads. Every session token
 * carries `discovery.write`, so the scope alone stops nobody. Before this
 * check, any signed-in account could list any room id under any name, or
 * rename another canopy's entry.
 *
 * The check reads the room's current state through the Synapse admin API
 * (`matrixClient.getRoomStateAdmin`), as the bot-posting gate does, and
 * refuses, in this order:
 *
 *   1. `account_unknown`          the caller has no Blackout account (any
 *                                 more), so no Matrix id;
 *   2. `matrix_not_configured`    no homeserver or bot token;
 *   3. `canopy_check_unavailable` the state could not be read (a 404, an
 *                                 unknown room, counts as `not_canopy_admin`);
 *   4. `not_canopy_admin`         the caller's membership is not `join`;
 *   5. `canopy_check_unavailable` the room has no power-levels event, or a
 *                                 level the check needs is not an integer;
 *   6. `not_canopy_admin`         the caller's level is below the level needed
 *                                 to change `m.room.power_levels`;
 *   7. `canopy_check_unavailable` the room has no create event;
 *   8. `not_a_space`              the create event's `type` is not `m.space`.
 *
 * Membership and power are checked before anything else about the room, so a
 * caller who is not an admin of a room learns nothing more about it than "not
 * an admin", the same answer an unknown room id gets.
 *
 * Levels are read the way the bot-posting gate reads them:
 * `users[mxid] ?? users_default ?? 0` must reach
 * `events['m.room.power_levels'] ?? state_default ?? 50`. That is the rule in
 * room versions 1 to 11, all the fork knows; in room version 12 a creator has
 * no `users` entry and would be refused, which fails closed.
 *
 * The canopy's join rule is not checked: its admin can list a canopy that is
 * not public (`KNOWN_LIMITATIONS.md`, "New canopy and den defaults").
 *
 * The same check, under the name `checkCanopyAdmin`, gates the other writes
 * that change a canopy's configuration: installing, revoking and metering an
 * app there (`routes/apps.ts`) and linking it to another canopy
 * (`routes/federation.ts`).
 */
import { matrixClient } from '../integrations/matrix-client';
import {
    membershipOf,
    powerLevelsContent,
    requiredPowerLevel,
    userPowerLevel,
} from './botPostingGate';
import { matrixUserIdFor } from './userIdentity';

export type CanopyListingRefusal =
    | 'account_unknown'
    | 'matrix_not_configured'
    | 'canopy_check_unavailable'
    | 'not_canopy_admin'
    | 'not_a_space';

export type CanopyListingVerdict = { ok: true } | { ok: false; reason: CanopyListingRefusal };

const refuse = (reason: CanopyListingRefusal): CanopyListingVerdict => ({ ok: false, reason });

/**
 * May the Blackout user `userId` list `canopyId` in the directory, or change
 * its entry? See the file comment for the order of the checks.
 */
export async function checkMayListCanopy(
    userId: string,
    canopyId: string
): Promise<CanopyListingVerdict> {
    const mxid = matrixUserIdFor(userId);
    if (!mxid) return refuse('account_unknown');

    const room = await matrixClient.getRoomStateAdmin(canopyId);
    if (!room.ok) {
        if (room.reason === 'matrix_not_configured') return refuse('matrix_not_configured');
        if ('status' in room && room.status === 404) return refuse('not_canopy_admin');
        return refuse('canopy_check_unavailable');
    }

    const { state } = room;
    if (membershipOf(state, mxid) !== 'join') return refuse('not_canopy_admin');

    const powerLevels = powerLevelsContent(state);
    if (!powerLevels) return refuse('canopy_check_unavailable');
    const level = userPowerLevel(powerLevels, mxid);
    const required = requiredPowerLevel(powerLevels, 'm.room.power_levels', 'state');
    if (level === null || required === null) return refuse('canopy_check_unavailable');
    if (level < required) return refuse('not_canopy_admin');

    const create = state.find((e) => e.type === 'm.room.create' && !e.state_key);
    if (!create) return refuse('canopy_check_unavailable');
    if (create.content?.type !== 'm.space') return refuse('not_a_space');

    return { ok: true };
}

/**
 * Is the Blackout user `userId` an admin of the canopy `canopyId` on the
 * homeserver? The listing check itself, for the routes that need the same
 * standing for something other than the directory entry: same rule, same
 * order, same refusals, and it fails closed when the homeserver cannot answer.
 */
export const checkCanopyAdmin = checkMayListCanopy;

/**
 * HTTP status and body for a refusal. `notAdminMessage` says what being an
 * admin was needed for; the default is the directory listing's.
 */
export const canopyListingRefusalResponse = (
    reason: CanopyListingRefusal,
    notAdminMessage = 'Only an admin of this canopy can list it in the directory.'
): { status: 401 | 403 | 409 | 503; body: { code: CanopyListingRefusal; message: string } } => {
    switch (reason) {
        case 'not_canopy_admin':
            return {
                status: 403,
                body: { code: reason, message: notAdminMessage },
            };
        case 'not_a_space':
            return {
                status: 409,
                body: { code: reason, message: 'That room is not a canopy (a Matrix space).' },
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
                body: { code: reason, message: 'Could not check this canopy on the homeserver.' },
            };
        default: {
            const exhaustive: never = reason;
            return {
                status: 503,
                body: {
                    code: exhaustive,
                    message: 'Could not check this canopy on the homeserver.',
                },
            };
        }
    }
};

/** `canopyListingRefusalResponse`, named for the routes that use `checkCanopyAdmin`. */
export const canopyAdminRefusalResponse = canopyListingRefusalResponse;
