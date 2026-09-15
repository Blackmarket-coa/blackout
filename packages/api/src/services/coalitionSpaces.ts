/**
 * Mirrors a coalition onto a Matrix Space — best-effort, never authoritative.
 *
 * The Postgres rows (`coalitions`, `coalition_memberships`) decide who is a
 * member and what they may do; this module keeps a Space in step with them so
 * the coalition's dens, hierarchy and power levels ride on Matrix:
 *
 *   - the Space is created BY THE BOT (so the bot holds PL100 and can write
 *     state and power levels later), with the founder granted PL100 too;
 *   - `join_mode` maps to the Space's join rule: `open` → `public`,
 *     `approval` → `invite` (admission happens through the Postgres request
 *     queue, then an invite / admin force-join — the same sequence the
 *     invitations service already uses for canopies);
 *   - each role is mirrored to a power level (founder 100, steward 50,
 *     griot 25, member 0) via a read-merge-write of m.room.power_levels.
 *
 * Every function returns an outcome instead of throwing: when Matrix is not
 * configured (tests, single-process dev) the coalition still works, it simply
 * has no Space yet. Spaces are plaintext by design ("hierarchy state only" —
 * the same rationale as vendor/community Spaces).
 */
import {
    COALITION_ROLE_POWER_LEVELS,
    COALITION_SPACE_STATE_EVENT_TYPE,
    type CoalitionJoinMode,
    type CoalitionRole,
    type CoalitionSpaceStateEventContent,
} from '@blackout/core';
import { matrixClient } from '../integrations/matrix-client';
import type { CoalitionRecord } from '../db/types';
import { matrixUserIdFor } from './userIdentity';

export interface SpaceOutcome {
    ok: boolean;
    /** Machine-readable reason when not ok (e.g. `matrix_not_configured`). */
    detail?: string;
    roomId?: string;
}

export type CoalitionMatrix = Pick<
    typeof matrixClient,
    | 'createRoom'
    | 'inviteToRoom'
    | 'adminJoinUserToRoom'
    | 'kickFromRoom'
    | 'getStateEvent'
    | 'sendStateEvent'
>;

let matrix: CoalitionMatrix = matrixClient;

/** Test seam: swap the Matrix client for a fake; pass null to restore. */
export function __setCoalitionMatrixForTests(client: CoalitionMatrix | null): void {
    matrix = client ?? matrixClient;
}

function joinRuleFor(joinMode: CoalitionJoinMode): 'public' | 'invite' {
    return joinMode === 'open' ? 'public' : 'invite';
}

function detailOf(result: Record<string, unknown>): string {
    if (typeof result.reason === 'string') return result.reason;
    if (typeof result.detail === 'string') return result.detail;
    if (typeof result.status === 'number') return `http_${result.status}`;
    return 'unknown';
}

/** Invite first; standing rooms may already contain the user or the bot may lack invite power. */
async function inviteOrJoin(roomId: string, mxid: string, reason: string): Promise<SpaceOutcome> {
    const invited = await matrix.inviteToRoom(roomId, mxid, reason);
    if (invited.ok) return { ok: true, roomId };
    const joined = await matrix.adminJoinUserToRoom(roomId, mxid);
    if (joined.ok) return { ok: true, roomId };
    return { ok: false, roomId, detail: detailOf(joined as Record<string, unknown>) };
}

/** Read-modify-write m.room.power_levels so `users[mxid] = level`. */
async function applyPowerLevel(roomId: string, mxid: string, level: number): Promise<SpaceOutcome> {
    const current = await matrix.getStateEvent(roomId, 'm.room.power_levels', '');
    const content: { users?: Record<string, number> } & Record<string, unknown> =
        current.ok && 'content' in current && current.content
            ? (current.content as { users?: Record<string, number> } & Record<string, unknown>)
            : {};
    const users = { ...(content.users ?? {}) };
    if (users[mxid] === level) return { ok: true, roomId };
    users[mxid] = level;
    const written = await matrix.sendStateEvent(
        roomId,
        'm.room.power_levels',
        { ...content, users },
        ''
    );
    return written.ok
        ? { ok: true, roomId }
        : { ok: false, roomId, detail: detailOf(written as Record<string, unknown>) };
}

/**
 * Create the coalition's Space. The founder is granted PL100 at creation and
 * invited (or force-joined) so they own the Space alongside the bot.
 */
export async function provisionCoalitionSpace(coalition: CoalitionRecord): Promise<SpaceOutcome> {
    const founderMxid = matrixUserIdFor(coalition.createdBy);
    const marker: CoalitionSpaceStateEventContent = {
        coalitionId: coalition.id,
        slug: coalition.slug,
        joinMode: coalition.joinMode,
    };
    const created = await matrix.createRoom({
        name: coalition.name,
        topic: coalition.mission,
        visibility: coalition.joinMode === 'open' ? 'public' : 'private',
        preset: coalition.joinMode === 'open' ? 'public_chat' : 'private_chat',
        // Spaces hold hierarchy state only; nothing conversational lives here.
        encrypted: false,
        creationContent: { type: 'm.space' },
        powerLevelOverride: {
            users: founderMxid ? { [founderMxid]: COALITION_ROLE_POWER_LEVELS.founder } : {},
            events_default: COALITION_ROLE_POWER_LEVELS.steward,
            invite: COALITION_ROLE_POWER_LEVELS.griot,
        },
        initialState: [
            { type: COALITION_SPACE_STATE_EVENT_TYPE, state_key: '', content: { ...marker } },
            {
                type: 'm.room.join_rules',
                state_key: '',
                content: { join_rule: joinRuleFor(coalition.joinMode) },
            },
        ],
    });
    if (!created.ok || !('roomId' in created) || !created.roomId) {
        return { ok: false, detail: detailOf(created as Record<string, unknown>) };
    }
    const roomId = created.roomId;
    if (founderMxid) {
        await inviteOrJoin(roomId, founderMxid, `Founded ${coalition.name}`);
    }
    return { ok: true, roomId };
}

/** Admit a member to the Space and mirror their role as a power level. */
export async function syncCoalitionMemberToSpace(
    coalition: Pick<CoalitionRecord, 'spaceRoomId' | 'name'>,
    userId: string,
    role: CoalitionRole
): Promise<SpaceOutcome> {
    if (!coalition.spaceRoomId) return { ok: false, detail: 'no_space' };
    const mxid = matrixUserIdFor(userId);
    if (!mxid) return { ok: false, detail: 'unresolved_user' };
    const admitted = await inviteOrJoin(coalition.spaceRoomId, mxid, `Joined ${coalition.name}`);
    if (!admitted.ok) return admitted;
    return applyPowerLevel(coalition.spaceRoomId, mxid, COALITION_ROLE_POWER_LEVELS[role]);
}

/** Mirror a role change without re-inviting. */
export async function syncCoalitionRoleToSpace(
    coalition: Pick<CoalitionRecord, 'spaceRoomId'>,
    userId: string,
    role: CoalitionRole
): Promise<SpaceOutcome> {
    if (!coalition.spaceRoomId) return { ok: false, detail: 'no_space' };
    const mxid = matrixUserIdFor(userId);
    if (!mxid) return { ok: false, detail: 'unresolved_user' };
    return applyPowerLevel(coalition.spaceRoomId, mxid, COALITION_ROLE_POWER_LEVELS[role]);
}

/** Remove a member from the Space (leave or removal); resets their power level first. */
export async function removeCoalitionMemberFromSpace(
    coalition: Pick<CoalitionRecord, 'spaceRoomId' | 'name'>,
    userId: string,
    reason: string
): Promise<SpaceOutcome> {
    if (!coalition.spaceRoomId) return { ok: false, detail: 'no_space' };
    const mxid = matrixUserIdFor(userId);
    if (!mxid) return { ok: false, detail: 'unresolved_user' };
    await applyPowerLevel(coalition.spaceRoomId, mxid, COALITION_ROLE_POWER_LEVELS.member);
    const kicked = await matrix.kickFromRoom(coalition.spaceRoomId, mxid, reason);
    return kicked.ok
        ? { ok: true, roomId: coalition.spaceRoomId }
        : {
              ok: false,
              roomId: coalition.spaceRoomId,
              detail: detailOf(kicked as Record<string, unknown>),
          };
}

/** Keep the Space's join rule and marker in step after a join-mode edit. */
export async function syncCoalitionSpaceSettings(
    coalition: CoalitionRecord
): Promise<SpaceOutcome> {
    if (!coalition.spaceRoomId) return { ok: false, detail: 'no_space' };
    const rule = await matrix.sendStateEvent(
        coalition.spaceRoomId,
        'm.room.join_rules',
        { join_rule: joinRuleFor(coalition.joinMode) },
        ''
    );
    const marker: CoalitionSpaceStateEventContent = {
        coalitionId: coalition.id,
        slug: coalition.slug,
        joinMode: coalition.joinMode,
    };
    const stamped = await matrix.sendStateEvent(
        coalition.spaceRoomId,
        COALITION_SPACE_STATE_EVENT_TYPE,
        { ...marker },
        ''
    );
    if (rule.ok && stamped.ok) return { ok: true, roomId: coalition.spaceRoomId };
    return {
        ok: false,
        roomId: coalition.spaceRoomId,
        detail: detailOf((rule.ok ? stamped : rule) as Record<string, unknown>),
    };
}
