/**
 * Coalition Rings: persistent trusted circles / crews / guilds. A Ring is a
 * named group a user belongs to, surfaced on profiles, the map ('communities'
 * layer), dens, and events — a durable social structure that replaces ephemeral
 * follower counts with membership.
 */

export const RING_KINDS = ['circle', 'crew', 'guild'] as const;
export type RingKind = typeof RING_KINDS[number];

export const RING_VISIBILITY = ['public', 'community', 'private'] as const;
export type RingVisibility = typeof RING_VISIBILITY[number];

export const RING_ROLES = ['owner', 'admin', 'member'] as const;
export type RingRole = typeof RING_ROLES[number];

export interface RingLocation {
    latitude: number;
    longitude: number;
    address?: string;
}

export interface CoalitionRing {
    id: string;
    name: string;
    description: string;
    kind: RingKind;
    visibility: RingVisibility;
    ownerId: string;
    /** Optional map presence; public rings with a location appear on the map. */
    location?: RingLocation;
    /** Optional linked den (Matrix room) for the ring. */
    denId?: string;
}

export interface RingMembership {
    id: string;
    ringId: string;
    userId: string;
    role: RingRole;
    /** Toggled false on leave (upsert-only; no row deletion). */
    active: boolean;
}

export interface RingSummary {
    memberCount: number;
}

export function isRingKind(value: unknown): value is RingKind {
    return typeof value === 'string' && (RING_KINDS as readonly string[]).includes(value);
}
export function isRingVisibility(value: unknown): value is RingVisibility {
    return typeof value === 'string' && (RING_VISIBILITY as readonly string[]).includes(value);
}
export function isRingRole(value: unknown): value is RingRole {
    return typeof value === 'string' && (RING_ROLES as readonly string[]).includes(value);
}

export const RING_INVITATION_STATUSES = ['pending', 'accepted', 'declined', 'revoked'] as const;
export type RingInvitationStatus = typeof RING_INVITATION_STATUSES[number];

/** An invitation into a ring (the way to join private rings). */
export interface RingInvitation {
    id: string;
    ringId: string;
    inviterId: string;
    inviteeId: string;
    status: RingInvitationStatus;
}

export function isRingInvitationStatus(value: unknown): value is RingInvitationStatus {
    return (
        typeof value === 'string' && (RING_INVITATION_STATUSES as readonly string[]).includes(value)
    );
}

/** Active membership count — the metric that surfaces in place of followers. */
export function countActiveMembers(memberships: readonly Pick<RingMembership, 'active'>[]): number {
    return memberships.reduce((total, m) => total + (m.active ? 1 : 0), 0);
}

/** Whether a user may manage the ring (owner or admin, actively a member). */
export function canManageRing(
    memberships: readonly Pick<RingMembership, 'userId' | 'role' | 'active'>[],
    userId: string
): boolean {
    return memberships.some(
        (m) => m.userId === userId && m.active && (m.role === 'owner' || m.role === 'admin')
    );
}

/**
 * The size a crew works at: small enough that everyone can speak, large enough
 * to survive a few quiet weeks.
 *
 * Advisory, never enforced. A crew that has grown past the range keeps working —
 * silently locking people out of a group they already belong to would be a worse
 * outcome than a crew of nine — so `crewSizeStatus` reports the state and lets
 * the UI nudge rather than block.
 */
export const CREW_SIZE_RANGE = { min: 4, max: 8 } as const;

export type CrewSizeState = 'forming' | 'healthy' | 'crowded';

export interface CrewSizeStatus {
    state: CrewSizeState;
    memberCount: number;
    /** One line the UI can show verbatim. */
    advice: string;
}

export function crewSizeStatus(memberCount: number): CrewSizeStatus {
    if (memberCount < CREW_SIZE_RANGE.min) {
        return {
            state: 'forming',
            memberCount,
            advice: `Crews work best from ${CREW_SIZE_RANGE.min} people — invite a few more.`,
        };
    }
    if (memberCount > CREW_SIZE_RANGE.max) {
        return {
            state: 'crowded',
            memberCount,
            advice: `Past ${CREW_SIZE_RANGE.max} people a crew starts to feel like a room. Consider splitting.`,
        };
    }
    return { state: 'healthy', memberCount, advice: 'A good size for a crew.' };
}
