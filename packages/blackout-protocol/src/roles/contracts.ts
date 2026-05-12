/**
 * Role contracts.
 *
 * A "role" is a *term-bound, electable* responsibility — facilitator,
 * treasurer, gatekeeper. Roles are first-class objects, not permission
 * flags: they have a name, a one-sentence domain (S3 framing), a current
 * holder, and a phenology phase that visually carries term progression
 * (in leaf → turning → fallen).
 *
 * Stored as a Matrix state event keyed by `roleId`, so a den can carry
 * multiple roles in parallel. Term-end is a visible *seasonal shift over
 * weeks*, not a calendar alarm; clients compute the phase from
 * (termStart, termEnd, now) using the phenology rules below.
 *
 * Election uses the consent-proposal primitive (work-stream D) — no
 * separate election app. The proposal's description references
 * `roleId` so the consenting circle's outcome can update the holder.
 */

import type { EventEnvelope } from '../common/types';
import {
    isPlaybookPhase,
    type PlaybookPhase,
} from '../playbook';

export const ROLES_PROTOCOL_VERSION = 1 as const;

export interface RolePayload {
    /** Stable id; matches the state event's state key. */
    roleId: string;
    /** Human-readable name (Facilitator, Treasurer, Gatekeeper, …). */
    name: string;
    /** One sentence the S3 way: what does this role have authority over? */
    domain: string;
    /** Matrix user id of the current holder. Empty string = vacant. */
    holderId: string;
    /** ISO-8601 timestamp the current term began. */
    termStart: string;
    /** ISO-8601 timestamp the current term ends. */
    termEnd: string;
    /**
     * Optional explicit phase override. When absent, clients derive the
     * phase from (termStart, termEnd, now).
     */
    phase?: PlaybookPhase;
    /** ISO-8601 timestamp of the last edit. */
    updatedAt: string;
}

export const isRolePayload = (value: unknown): value is RolePayload => {
    if (!value || typeof value !== 'object') return false;
    const p = value as Record<string, unknown>;
    if (typeof p.roleId !== 'string') return false;
    if (typeof p.name !== 'string') return false;
    if (typeof p.domain !== 'string') return false;
    if (typeof p.holderId !== 'string') return false;
    if (typeof p.termStart !== 'string') return false;
    if (typeof p.termEnd !== 'string') return false;
    if (typeof p.updatedAt !== 'string') return false;
    if (p.phase !== undefined && !isPlaybookPhase(p.phase)) return false;
    return true;
};

export type RoleSetEvent = EventEnvelope<'blackout.governance.role.set', RolePayload>;

export interface RolesProtocolSurface {
    owner: '@blackout/protocol';
    version: typeof ROLES_PROTOCOL_VERSION;
    policy: 'additive-only-minor';
}

export const ROLES_PROTOCOL_SURFACE: RolesProtocolSurface = {
    owner: '@blackout/protocol',
    version: ROLES_PROTOCOL_VERSION,
    policy: 'additive-only-minor',
};

/**
 * Pure: derive the phenology phase of a role from its term and the current
 * time. Bare-knuckle heuristic so the bar shifts gradually:
 *   • before term start          → 'spring'   (newly held / newly elected)
 *   • first 60% of term          → 'summer'   (in service)
 *   • last 40% of term           → 'autumn'   (turning, term ending soon)
 *   • after term end + no rehold → 'winter'   (overdue rotation)
 *   • empty holder               → 'winter'   (vacant; rotate stewards)
 */
export function phaseFromRoleTerm(
    role: Pick<RolePayload, 'holderId' | 'termStart' | 'termEnd'>,
    nowMs: number = Date.now(),
): PlaybookPhase {
    if (!role.holderId || role.holderId.trim().length === 0) return 'winter';
    const start = Date.parse(role.termStart);
    const end = Date.parse(role.termEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'summer';
    if (nowMs < start) return 'spring';
    if (nowMs >= end) return 'winter';
    const elapsed = nowMs - start;
    const total = end - start;
    if (elapsed / total >= 0.6) return 'autumn';
    if (elapsed / total <= 0.1) return 'spring';
    return 'summer';
}
