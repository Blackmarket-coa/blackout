/**
 * Coalitions network — the service layer behind `/v1/coalitions`.
 *
 * Authorisation is decided HERE, from the membership rows, never from a
 * client-supplied flag or from Matrix power levels (the API does not check
 * power levels on any route today; the Space mirror in coalitionSpaces.ts is
 * downstream of these decisions). Every mutation that changes who is in a
 * coalition or what they may do also asks the Space mirror to follow along —
 * best-effort, awaited, never fatal.
 */
import {
    CAMPAIGN_TRANSITIONS,
    DEFAULT_COALITION_BOOST_DAILY_ALLOWANCE,
    assignableRolesFor,
    boostAllowanceRemaining,
    canTransitionCampaign,
    coalitionRoleCan,
    computeBoostMeter,
    countActiveCoalitionMembers,
    slugifyCoalitionName,
    summarizeCoalitionImpact,
    tierSatisfies,
    utcDayOf,
    type BoostMeter,
    type CampaignStatus,
    type CampaignType,
    type CoalitionImpactStats,
    type CoalitionJoinMode,
    type CoalitionPermission,
    type CoalitionRole,
    type CoalitionTierGate,
} from '@blackout/core';
import { db } from '../db/store';
import type {
    CoalitionCampaignRecord,
    CoalitionJoinRequestRecord,
    CoalitionMembershipRecord,
    CoalitionRecord,
} from '../db/types';
import { emitDomainEvent } from '../modules/domain-events';
import { createBounty, newBountyId } from './bountyStore';
import {
    provisionCoalitionSpace,
    removeCoalitionMemberFromSpace,
    syncCoalitionMemberToSpace,
    syncCoalitionRoleToSpace,
    syncCoalitionSpaceSettings,
} from './coalitionSpaces';
import { resolveMemberTier } from './coalitionTierGate';
import { awardCoalitionKarma, type CoalitionReputationEvent } from './coalitionReputation';
import { openWindowForGoodsDrive, pushCoalitionMilestones } from './coalitionFbmBridge';

const NOW_ISO = () => new Date().toISOString();
const rand = () => Math.random().toString(36).slice(2, 10);
const stamp = () => Date.now().toString(36);

export const newCoalitionId = (): string => `coa_${rand()}_${stamp()}`;
export const newCoalitionMembershipId = (): string => `coam_${rand()}_${stamp()}`;
export const newJoinRequestId = (): string => `coaj_${rand()}_${stamp()}`;
export const newCampaignId = (): string => `camp_${rand()}_${stamp()}`;
export const newBoostId = (): string => `boost_${rand()}_${stamp()}`;

export type CoalitionError =
    | { kind: 'not_found' }
    | { kind: 'archived' }
    | { kind: 'forbidden'; permission?: CoalitionPermission }
    | { kind: 'not_member' }
    | { kind: 'already_member' }
    | { kind: 'approval_required'; request: CoalitionJoinRequestRecord }
    | { kind: 'tier_gate'; required: CoalitionTierGate; actual: CoalitionTierGate }
    | { kind: 'invalid_role' }
    | { kind: 'last_founder' }
    | { kind: 'invalid_transition'; from: CampaignStatus; to: CampaignStatus }
    | { kind: 'campaign_inactive' }
    | { kind: 'boost_allowance_exhausted'; allowance: number }
    | { kind: 'already_boosted' };

export type CoalitionResult<T> = { ok: true; value: T } | { ok: false; error: CoalitionError };

const fail = <T>(error: CoalitionError): CoalitionResult<T> => ({ ok: false, error });
const succeed = <T>(value: T): CoalitionResult<T> => ({ ok: true, value });

const ROLE_RANK: Record<CoalitionRole, number> = { founder: 3, steward: 2, griot: 1, member: 0 };

export function boostDailyAllowance(): number {
    const raw = Number.parseInt(process.env.COALITION_BOOST_DAILY_ALLOWANCE ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_COALITION_BOOST_DAILY_ALLOWANCE;
}

export interface CoalitionSummary {
    coalition: CoalitionRecord;
    memberCount: number;
    activeCampaigns: number;
    viewerRole?: CoalitionRole;
}

export interface CoalitionMemberView {
    userId: string;
    role: CoalitionRole;
    joinedAt: string;
}

export interface CoalitionView extends CoalitionSummary {
    members: CoalitionMemberView[];
    campaigns: CoalitionCampaignRecord[];
    stats: CoalitionImpactStats;
    viewer: {
        membership?: CoalitionMembershipRecord;
        request?: CoalitionJoinRequestRecord;
        permissions: CoalitionPermission[];
    };
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function getCoalition(idOrSlug: string): CoalitionRecord | undefined {
    return db.getCoalition(idOrSlug) ?? db.getCoalitionBySlug(idOrSlug);
}

export function activeMembership(
    coalitionId: string,
    userId: string
): CoalitionMembershipRecord | undefined {
    const membership = db.getCoalitionMembership(coalitionId, userId);
    return membership && membership.active ? membership : undefined;
}

export function activeMembers(coalitionId: string): CoalitionMembershipRecord[] {
    return db.listCoalitionMemberships({ coalitionId }).filter((m) => m.active);
}

export function memberCount(coalitionId: string): number {
    return countActiveCoalitionMembers(db.listCoalitionMemberships({ coalitionId }));
}

/** The permissions a user holds in a coalition (empty when not a member). */
export function permissionsFor(coalitionId: string, userId: string): CoalitionPermission[] {
    const membership = activeMembership(coalitionId, userId);
    if (!membership) return [];
    return [...(coalitionRolePermissions(membership.role) as CoalitionPermission[])];
}

function coalitionRolePermissions(role: CoalitionRole): readonly CoalitionPermission[] {
    return (
        [
            'coalition.edit',
            'coalition.archive',
            'members.approve',
            'members.role',
            'members.remove',
            'members.invite',
            'campaigns.launch',
            'campaigns.approve',
            'campaigns.promote',
            'connections.manage',
            'externals.moderate',
        ] as const
    ).filter((permission) => coalitionRoleCan(role, permission));
}

/**
 * Server-side gate: the caller must be an active member whose role grants
 * `permission`. Returns the membership so callers can reason about rank.
 */
export function requirePermission(
    coalition: CoalitionRecord,
    userId: string,
    permission: CoalitionPermission
): CoalitionResult<CoalitionMembershipRecord> {
    const membership = activeMembership(coalition.id, userId);
    if (!membership) return fail({ kind: 'not_member' });
    if (!coalitionRoleCan(membership.role, permission)) {
        return fail({ kind: 'forbidden', permission });
    }
    return succeed(membership);
}

function activeCampaignCount(coalitionId: string): number {
    return db.listCoalitionCampaigns({ coalitionId, status: 'active' }).length;
}

export function summarize(coalition: CoalitionRecord, viewerId?: string): CoalitionSummary {
    const viewer = viewerId ? activeMembership(coalition.id, viewerId) : undefined;
    return {
        coalition,
        memberCount: memberCount(coalition.id),
        activeCampaigns: activeCampaignCount(coalition.id),
        ...(viewer ? { viewerRole: viewer.role } : {}),
    };
}

export function listCoalitions(
    filter: { memberId?: string; q?: string; includeArchived?: boolean } = {},
    viewerId?: string
): CoalitionSummary[] {
    let rows = db.listCoalitions();
    if (!filter.includeArchived) rows = rows.filter((row) => !row.archivedAt);
    if (filter.memberId) {
        const ids = new Set(
            db
                .listCoalitionMemberships({ userId: filter.memberId })
                .filter((m) => m.active)
                .map((m) => m.coalitionId)
        );
        rows = rows.filter((row) => ids.has(row.id));
    }
    if (filter.q) {
        const needle = filter.q.toLowerCase();
        rows = rows.filter(
            (row) =>
                row.name.toLowerCase().includes(needle) ||
                row.mission.toLowerCase().includes(needle) ||
                row.slug.includes(needle)
        );
    }
    return rows
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((row) => summarize(row, viewerId));
}

/** The coalitions a user belongs to, with their role — the profile's replacement for "friends". */
export function listUserCoalitions(
    userId: string
): Array<CoalitionSummary & { role: CoalitionRole }> {
    return db
        .listCoalitionMemberships({ userId })
        .filter((m) => m.active)
        .map((m) => ({ membership: m, coalition: db.getCoalition(m.coalitionId) }))
        .filter(
            (pair): pair is { membership: CoalitionMembershipRecord; coalition: CoalitionRecord } =>
                Boolean(pair.coalition && !pair.coalition.archivedAt)
        )
        .map(({ membership, coalition }) => ({ ...summarize(coalition), role: membership.role }));
}

/** Non-members see only public campaign states; members see everything. */
export function visibleCampaigns(
    coalitionId: string,
    viewerIsMember: boolean
): CoalitionCampaignRecord[] {
    const rows = db.listCoalitionCampaigns({ coalitionId });
    const visible = viewerIsMember
        ? rows
        : rows.filter((row) => row.status === 'active' || row.status === 'completed');
    return visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getCoalitionView(
    idOrSlug: string,
    viewerId?: string
): CoalitionResult<CoalitionView> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const membership = viewerId ? activeMembership(coalition.id, viewerId) : undefined;
    const request = viewerId ? db.getCoalitionJoinRequest(coalition.id, viewerId) : undefined;
    const members = activeMembers(coalition.id)
        .sort(
            (a, b) =>
                ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.createdAt.localeCompare(b.createdAt)
        )
        .map((m) => ({ userId: m.userId, role: m.role, joinedAt: m.createdAt }));
    const campaigns = visibleCampaigns(coalition.id, Boolean(membership));
    const allCampaigns = db.listCoalitionCampaigns({ coalitionId: coalition.id });
    return succeed({
        ...summarize(coalition, viewerId),
        members,
        campaigns,
        stats: summarizeCoalitionImpact(allCampaigns, members.length),
        viewer: {
            ...(membership ? { membership } : {}),
            ...(request && (request.status === 'pending' || request.status === 'invited')
                ? { request }
                : {}),
            permissions: viewerId ? permissionsFor(coalition.id, viewerId) : [],
        },
    });
}

// ---------------------------------------------------------------------------
// Coalition lifecycle
// ---------------------------------------------------------------------------

function uniqueSlug(name: string, exceptId?: string): string {
    const base = slugifyCoalitionName(name);
    let slug = base;
    let suffix = 2;
    for (;;) {
        const taken = db.getCoalitionBySlug(slug);
        if (!taken || taken.id === exceptId) return slug;
        slug = `${base}-${suffix}`;
        suffix += 1;
    }
}

export interface CreateCoalitionInput {
    name: string;
    mission: string;
    bannerUrl?: string;
    joinMode: CoalitionJoinMode;
    minTierToJoin?: CoalitionTierGate;
    createdBy: string;
}

export async function createCoalition(input: CreateCoalitionInput): Promise<{
    coalition: CoalitionRecord;
    membership: CoalitionMembershipRecord;
    space: { ok: boolean; detail?: string };
}> {
    const id = newCoalitionId();
    let coalition = db.upsertCoalition({
        id,
        slug: uniqueSlug(input.name),
        name: input.name,
        mission: input.mission,
        ...(input.bannerUrl ? { bannerUrl: input.bannerUrl } : {}),
        joinMode: input.joinMode,
        ...(input.minTierToJoin ? { minTierToJoin: input.minTierToJoin } : {}),
        createdBy: input.createdBy,
    });
    const membership = db.upsertCoalitionMembership({
        id: newCoalitionMembershipId(),
        coalitionId: id,
        userId: input.createdBy,
        role: 'founder',
        active: true,
    });
    const space = await provisionCoalitionSpace(coalition);
    if (space.ok && space.roomId) {
        coalition = db.upsertCoalition({ ...coalition, spaceRoomId: space.roomId });
    }
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.created',
        payload: { coalitionId: id, createdBy: input.createdBy, joinMode: input.joinMode },
    });
    // Reputation is a side effect, never a precondition: fire-and-forget so a
    // slow or absent FBM never delays the founder's first page load.
    void awardCoalitionKarma({
        eventType: 'coalition_founded',
        blackoutUserId: input.createdBy,
        coalitionId: id,
        referenceId: id,
    });
    return {
        coalition,
        membership,
        space: { ok: space.ok, ...(space.detail ? { detail: space.detail } : {}) },
    };
}

export interface UpdateCoalitionInput {
    name?: string;
    mission?: string;
    bannerUrl?: string | null;
    joinMode?: CoalitionJoinMode;
    minTierToJoin?: CoalitionTierGate | null;
}

/**
 * Edit a coalition. Changing `joinMode` or the tier gate never touches
 * existing memberships — they were admitted under the policy of their day.
 */
export async function updateCoalition(
    idOrSlug: string,
    actorId: string,
    patch: UpdateCoalitionInput
): Promise<CoalitionResult<CoalitionRecord>> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    if (coalition.archivedAt) return fail({ kind: 'archived' });
    const gate = requirePermission(coalition, actorId, 'coalition.edit');
    if (!gate.ok) return gate;
    const next: CoalitionRecord = { ...coalition };
    if (patch.name !== undefined) {
        next.name = patch.name;
        next.slug = uniqueSlug(patch.name, coalition.id);
    }
    if (patch.mission !== undefined) next.mission = patch.mission;
    if (patch.bannerUrl === null) delete next.bannerUrl;
    else if (patch.bannerUrl !== undefined) next.bannerUrl = patch.bannerUrl;
    if (patch.joinMode !== undefined) next.joinMode = patch.joinMode;
    if (patch.minTierToJoin === null) delete next.minTierToJoin;
    else if (patch.minTierToJoin !== undefined) next.minTierToJoin = patch.minTierToJoin;
    const saved = db.upsertCoalition(next);
    if (saved.spaceRoomId && (patch.joinMode !== undefined || patch.name !== undefined)) {
        await syncCoalitionSpaceSettings(saved);
    }
    return succeed(saved);
}

export function archiveCoalition(
    idOrSlug: string,
    actorId: string
): CoalitionResult<CoalitionRecord> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const gate = requirePermission(coalition, actorId, 'coalition.archive');
    if (!gate.ok) return gate;
    if (coalition.archivedAt) return succeed(coalition);
    const saved = db.upsertCoalition({ ...coalition, archivedAt: NOW_ISO() });
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.archived',
        payload: { coalitionId: coalition.id },
    });
    return succeed(saved);
}

// ---------------------------------------------------------------------------
// Membership: join, approval queue, invites, leave, roles
// ---------------------------------------------------------------------------

async function admit(
    coalition: CoalitionRecord,
    userId: string,
    role: CoalitionRole,
    via: 'open' | 'approved' | 'invited'
): Promise<CoalitionMembershipRecord> {
    const existing = db.getCoalitionMembership(coalition.id, userId);
    const membership = db.upsertCoalitionMembership({
        id: existing?.id ?? newCoalitionMembershipId(),
        coalitionId: coalition.id,
        userId,
        role: existing?.active ? existing.role : role,
        active: true,
    });
    await syncCoalitionMemberToSpace(coalition, userId, membership.role);
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.member.joined',
        payload: { coalitionId: coalition.id, userId, role: membership.role, via },
    });
    // Keyed on the membership row, not the moment: leaving and rejoining a
    // coalition reuses the same row, so it cannot farm the join award.
    void awardCoalitionKarma({
        eventType: 'member_joined',
        blackoutUserId: userId,
        coalitionId: coalition.id,
        referenceId: membership.id,
    });
    return membership;
}

export type JoinOutcome =
    | { joined: true; membership: CoalitionMembershipRecord }
    | { joined: false; request: CoalitionJoinRequestRecord };

/**
 * Join flow for both modes. `open` admits immediately (after the tier gate);
 * `approval` files a request for the steward queue. A user holding an
 * outstanding invite is admitted on either path — the invite already carries
 * a steward's decision.
 */
export async function requestJoin(
    idOrSlug: string,
    userId: string,
    message?: string
): Promise<CoalitionResult<JoinOutcome>> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    if (coalition.archivedAt) return fail({ kind: 'archived' });
    if (activeMembership(coalition.id, userId)) return fail({ kind: 'already_member' });

    const existingRequest = db.getCoalitionJoinRequest(coalition.id, userId);
    if (existingRequest?.status === 'invited') {
        db.upsertCoalitionJoinRequest({
            ...existingRequest,
            status: 'approved',
            reviewedBy: existingRequest.invitedBy ?? existingRequest.reviewedBy,
            reviewedAt: NOW_ISO(),
        });
        const membership = await admit(coalition, userId, 'member', 'invited');
        return succeed({ joined: true, membership });
    }

    // An unmet tier files a request for the steward queue; it never refuses
    // outright. The gate resolves a member's tier from FBM, so it answers
    // "seedling" for anyone FBM cannot place — every non-vendor, and everyone
    // at all when the integration is unconfigured. Refusing on that answer
    // meant a founder who picked any rung above the floor created a coalition
    // that rejected 100% of joiners permanently, with no way to appeal to a
    // human. A steward reading a request can see what a tier lookup cannot.
    const gated =
        coalition.minTierToJoin !== undefined &&
        !tierSatisfies(await resolveMemberTier(userId), coalition.minTierToJoin);

    if (coalition.joinMode === 'open' && !gated) {
        const membership = await admit(coalition, userId, 'member', 'open');
        return succeed({ joined: true, membership });
    }

    const request = db.upsertCoalitionJoinRequest({
        id: existingRequest?.id ?? newJoinRequestId(),
        coalitionId: coalition.id,
        userId,
        ...(message ? { message } : {}),
        status: 'pending',
    });
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.join.requested',
        payload: { coalitionId: coalition.id, userId },
    });
    return succeed({ joined: false, request });
}

/** The steward-visible queue: pending requests only (invites live on the invitee's side). */
export function listJoinRequests(
    idOrSlug: string,
    actorId: string
): CoalitionResult<CoalitionJoinRequestRecord[]> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const gate = requirePermission(coalition, actorId, 'members.approve');
    if (!gate.ok) return gate;
    return succeed(
        db
            .listCoalitionJoinRequests({ coalitionId: coalition.id, status: 'pending' })
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    );
}

export async function reviewJoinRequest(
    idOrSlug: string,
    actorId: string,
    userId: string,
    decision: 'approve' | 'decline'
): Promise<
    CoalitionResult<{ request: CoalitionJoinRequestRecord; membership?: CoalitionMembershipRecord }>
> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    if (coalition.archivedAt) return fail({ kind: 'archived' });
    const gate = requirePermission(coalition, actorId, 'members.approve');
    if (!gate.ok) return gate;
    const request = db.getCoalitionJoinRequest(coalition.id, userId);
    if (!request || request.status !== 'pending') return fail({ kind: 'not_found' });
    const reviewed = db.upsertCoalitionJoinRequest({
        ...request,
        status: decision === 'approve' ? 'approved' : 'declined',
        reviewedBy: actorId,
        reviewedAt: NOW_ISO(),
    });
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.join.reviewed',
        payload: { coalitionId: coalition.id, userId, decision, reviewedBy: actorId },
    });
    if (decision === 'decline') return succeed({ request: reviewed });
    const membership = await admit(coalition, userId, 'member', 'approved');
    return succeed({ request: reviewed, membership });
}

export function withdrawJoinRequest(
    idOrSlug: string,
    userId: string
): CoalitionResult<CoalitionJoinRequestRecord> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const request = db.getCoalitionJoinRequest(coalition.id, userId);
    if (!request || (request.status !== 'pending' && request.status !== 'invited')) {
        return fail({ kind: 'not_found' });
    }
    return succeed(db.upsertCoalitionJoinRequest({ ...request, status: 'withdrawn' }));
}

/** A steward/griot invite: the invitee accepts by calling the join route. */
export function inviteMember(
    idOrSlug: string,
    actorId: string,
    userId: string
): CoalitionResult<CoalitionJoinRequestRecord> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    if (coalition.archivedAt) return fail({ kind: 'archived' });
    const gate = requirePermission(coalition, actorId, 'members.invite');
    if (!gate.ok) return gate;
    if (activeMembership(coalition.id, userId)) return fail({ kind: 'already_member' });
    const existing = db.getCoalitionJoinRequest(coalition.id, userId);
    const request = db.upsertCoalitionJoinRequest({
        id: existing?.id ?? newJoinRequestId(),
        coalitionId: coalition.id,
        userId,
        status: 'invited',
        invitedBy: actorId,
    });
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.member.invited',
        payload: { coalitionId: coalition.id, userId, invitedBy: actorId },
    });
    return succeed(request);
}

/** Invitations addressed to a user, for their inbox. */
export function listInvitesFor(
    userId: string
): Array<{ request: CoalitionJoinRequestRecord; coalition: CoalitionRecord }> {
    return db
        .listCoalitionJoinRequests({ userId, status: 'invited' })
        .map((request) => ({ request, coalition: db.getCoalition(request.coalitionId) }))
        .filter(
            (pair): pair is { request: CoalitionJoinRequestRecord; coalition: CoalitionRecord } =>
                Boolean(pair.coalition && !pair.coalition.archivedAt)
        );
}

export async function leaveCoalition(
    idOrSlug: string,
    userId: string
): Promise<CoalitionResult<CoalitionMembershipRecord>> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const membership = activeMembership(coalition.id, userId);
    if (!membership) return fail({ kind: 'not_member' });
    // The founder transfers first (POST /transfer) — a coalition never loses its owner by accident.
    if (membership.role === 'founder') return fail({ kind: 'last_founder' });
    const saved = db.upsertCoalitionMembership({ ...membership, active: false });
    await removeCoalitionMemberFromSpace(coalition, userId, `Left ${coalition.name}`);
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.member.left',
        payload: { coalitionId: coalition.id, userId, via: 'left' },
    });
    return succeed(saved);
}

export async function removeMember(
    idOrSlug: string,
    actorId: string,
    userId: string
): Promise<CoalitionResult<CoalitionMembershipRecord>> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const gate = requirePermission(coalition, actorId, 'members.remove');
    if (!gate.ok) return gate;
    if (actorId === userId) return fail({ kind: 'forbidden', permission: 'members.remove' });
    const target = activeMembership(coalition.id, userId);
    if (!target) return fail({ kind: 'not_member' });
    // Only outrank removes: a steward cannot remove another steward or the founder.
    if (ROLE_RANK[gate.value.role] <= ROLE_RANK[target.role]) {
        return fail({ kind: 'forbidden', permission: 'members.remove' });
    }
    const saved = db.upsertCoalitionMembership({ ...target, active: false });
    await removeCoalitionMemberFromSpace(coalition, userId, `Removed from ${coalition.name}`);
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.member.left',
        payload: { coalitionId: coalition.id, userId, via: 'removed', by: actorId },
    });
    return succeed(saved);
}

export async function setMemberRole(
    idOrSlug: string,
    actorId: string,
    userId: string,
    role: CoalitionRole
): Promise<CoalitionResult<CoalitionMembershipRecord>> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const gate = requirePermission(coalition, actorId, 'members.role');
    if (!gate.ok) return gate;
    const target = activeMembership(coalition.id, userId);
    if (!target) return fail({ kind: 'not_member' });
    if (target.role === 'founder') return fail({ kind: 'invalid_role' });
    if (!assignableRolesFor(gate.value.role).includes(role)) return fail({ kind: 'invalid_role' });
    // Stewards may only reshape ranks below their own.
    if (ROLE_RANK[gate.value.role] <= ROLE_RANK[target.role] && gate.value.role !== 'founder') {
        return fail({ kind: 'forbidden', permission: 'members.role' });
    }
    const saved = db.upsertCoalitionMembership({ ...target, role });
    await syncCoalitionRoleToSpace(coalition, userId, role);
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.role.changed',
        payload: { coalitionId: coalition.id, userId, role, by: actorId },
    });
    return succeed(saved);
}

/** Hand the founder role to another active member; the old founder becomes a steward. */
export async function transferFounder(
    idOrSlug: string,
    actorId: string,
    userId: string
): Promise<
    CoalitionResult<{ founder: CoalitionMembershipRecord; previous: CoalitionMembershipRecord }>
> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const actor = activeMembership(coalition.id, actorId);
    if (!actor) return fail({ kind: 'not_member' });
    if (actor.role !== 'founder')
        return fail({ kind: 'forbidden', permission: 'coalition.archive' });
    const target = activeMembership(coalition.id, userId);
    if (!target || target.userId === actorId) return fail({ kind: 'not_member' });
    const founder = db.upsertCoalitionMembership({ ...target, role: 'founder' });
    const previous = db.upsertCoalitionMembership({ ...actor, role: 'steward' });
    db.upsertCoalition({ ...coalition, createdBy: coalition.createdBy });
    await syncCoalitionRoleToSpace(coalition, userId, 'founder');
    await syncCoalitionRoleToSpace(coalition, actorId, 'steward');
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.founder.transferred',
        payload: { coalitionId: coalition.id, from: actorId, to: userId },
    });
    return succeed({ founder, previous });
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export interface CreateCampaignInput {
    type: CampaignType;
    title: string;
    description: string;
    goalCents?: number;
    goalUnits?: number;
    startsAt?: string;
    endsAt?: string;
    /** Default: true unless the creator can launch campaigns themselves. */
    requiresStewardApproval?: boolean;
    projectId?: string;
    bountyId?: string;
    aidPostId?: string;
    fbmListingId?: string;
    fbmOrderCycleId?: string;
    /**
     * Post this project to the Creator Hub bounty board as the coalition. Uses
     * the existing bounty system (category 'coalition', scoped by coalitionId)
     * rather than a second board.
     */
    bounty?: {
        rewardType: 'cash' | 'revenue_share' | 'product_token' | 'store_credit' | 'digital_product';
        rewardSummary: string;
        rewardAmountCents?: number;
        requirements?: string[];
        deliverables?: string[];
    };
}

/**
 * Members propose, stewards launch. A campaign from someone without
 * `campaigns.launch` always waits in `pending_approval`; a steward's own
 * campaign goes live unless they ask for a second pair of eyes.
 */
export function createCampaign(
    idOrSlug: string,
    actorId: string,
    input: CreateCampaignInput
): CoalitionResult<CoalitionCampaignRecord> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    if (coalition.archivedAt) return fail({ kind: 'archived' });
    const membership = activeMembership(coalition.id, actorId);
    if (!membership) return fail({ kind: 'not_member' });
    const canLaunch = coalitionRoleCan(membership.role, 'campaigns.launch');
    const requiresStewardApproval = canLaunch ? input.requiresStewardApproval === true : true;
    const status: CampaignStatus = requiresStewardApproval ? 'pending_approval' : 'active';
    const campaign = db.upsertCoalitionCampaign({
        id: newCampaignId(),
        coalitionId: coalition.id,
        type: input.type,
        title: input.title,
        description: input.description,
        ...(input.goalCents !== undefined ? { goalCents: input.goalCents } : {}),
        ...(input.goalUnits !== undefined ? { goalUnits: input.goalUnits } : {}),
        raisedCents: 0,
        contributorCount: 0,
        status,
        requiresStewardApproval,
        createdBy: actorId,
        ...(status === 'active' ? { approvedBy: actorId } : {}),
        ...(input.startsAt ? { startsAt: input.startsAt } : {}),
        ...(input.endsAt ? { endsAt: input.endsAt } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
        ...(input.bountyId ? { bountyId: input.bountyId } : {}),
        ...(input.aidPostId ? { aidPostId: input.aidPostId } : {}),
        ...(input.fbmListingId ? { fbmListingId: input.fbmListingId } : {}),
        ...(input.fbmOrderCycleId ? { fbmOrderCycleId: input.fbmOrderCycleId } : {}),
    });
    // Projects can carry a bounty so collaborators find the work on the
    // Creator Hub board they already read. The bounty is posted by the campaign
    // creator and scoped to the coalition, so `GET /v1/bounties?coalitionId=`
    // lists it alongside the coalition's other work.
    let withBounty = campaign;
    if (input.bounty && (input.type === 'project' || input.type === 'drive')) {
        const bounty = createBounty({
            id: newBountyId(),
            category: 'coalition',
            title: input.title,
            description: input.description,
            creatorId: actorId,
            rewardType: input.bounty.rewardType,
            rewardSummary: input.bounty.rewardSummary,
            ...(input.bounty.rewardAmountCents !== undefined
                ? { rewardAmountCents: input.bounty.rewardAmountCents }
                : {}),
            ...(input.bounty.requirements ? { requirements: input.bounty.requirements } : {}),
            ...(input.bounty.deliverables ? { deliverables: input.bounty.deliverables } : {}),
            coalitionId: coalition.id,
        });
        withBounty = db.upsertCoalitionCampaign({ ...campaign, bountyId: bounty.id });
    }

    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.campaign.created',
        payload: {
            coalitionId: coalition.id,
            campaignId: campaign.id,
            type: campaign.type,
            status,
            bountyId: withBounty.bountyId ?? null,
        },
    });
    // A steward's campaign is born active and never passes through a
    // transition, so the window has to be opened from every path that reaches
    // `active` — here, on approval, and on an explicit status change.
    if (status === 'active') void openWindowForGoodsDrive(withBounty);
    return succeed(withBounty);
}

export function getCampaign(
    idOrSlug: string,
    campaignId: string,
    viewerId?: string
): CoalitionResult<CoalitionCampaignRecord> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const campaign = db.getCoalitionCampaign(campaignId);
    if (!campaign || campaign.coalitionId !== coalition.id) return fail({ kind: 'not_found' });
    const isMember = viewerId ? Boolean(activeMembership(coalition.id, viewerId)) : false;
    if (!isMember && campaign.status !== 'active' && campaign.status !== 'completed') {
        return fail({ kind: 'not_found' });
    }
    return succeed(campaign);
}

export function approveCampaign(
    idOrSlug: string,
    actorId: string,
    campaignId: string
): CoalitionResult<CoalitionCampaignRecord> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const gate = requirePermission(coalition, actorId, 'campaigns.approve');
    if (!gate.ok) return gate;
    const campaign = db.getCoalitionCampaign(campaignId);
    if (!campaign || campaign.coalitionId !== coalition.id) return fail({ kind: 'not_found' });
    if (!canTransitionCampaign(campaign.status, 'active')) {
        return fail({ kind: 'invalid_transition', from: campaign.status, to: 'active' });
    }
    const saved = db.upsertCoalitionCampaign({
        ...campaign,
        status: 'active',
        approvedBy: actorId,
    });
    void openWindowForGoodsDrive(saved);
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.campaign.status',
        payload: { coalitionId: coalition.id, campaignId, status: 'active', by: actorId },
    });
    return succeed(saved);
}

/**
 * Move a campaign along CAMPAIGN_TRANSITIONS. The creator may cancel or
 * complete their own campaign; approving (→ active) is steward-only.
 */
/**
 * What completing a campaign of each type is worth on the ladder. `boost` has
 * no completion award: amplification is not an outcome, and paying for it
 * would make boosting itself farmable.
 */
function completionEventFor(type: CampaignType): CoalitionReputationEvent | null {
    if (type === 'drive' || type === 'goods_drive') return 'drive_completed';
    if (type === 'project') return 'project_delivered';
    if (type === 'mutual_aid') return 'mutual_aid_fulfilled';
    return null;
}

export function transitionCampaign(
    idOrSlug: string,
    actorId: string,
    campaignId: string,
    to: CampaignStatus
): CoalitionResult<CoalitionCampaignRecord> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const membership = activeMembership(coalition.id, actorId);
    if (!membership) return fail({ kind: 'not_member' });
    const campaign = db.getCoalitionCampaign(campaignId);
    if (!campaign || campaign.coalitionId !== coalition.id) return fail({ kind: 'not_found' });
    const isSteward = coalitionRoleCan(membership.role, 'campaigns.approve');
    if (to === 'active' && !isSteward)
        return fail({ kind: 'forbidden', permission: 'campaigns.approve' });
    if (campaign.createdBy !== actorId && !isSteward) {
        return fail({ kind: 'forbidden', permission: 'campaigns.launch' });
    }
    if (!canTransitionCampaign(campaign.status, to)) {
        return fail({ kind: 'invalid_transition', from: campaign.status, to });
    }
    const saved = db.upsertCoalitionCampaign({
        ...campaign,
        status: to,
        ...(to === 'active' ? { approvedBy: actorId } : {}),
        ...(to === 'completed' ? { completedAt: NOW_ISO() } : {}),
    });
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.campaign.status',
        payload: { coalitionId: coalition.id, campaignId, status: to, by: actorId },
    });
    if (to === 'active' && saved.type === 'goods_drive') {
        // A goods drive needs somewhere for members to actually order: FBM
        // opens the shared window and projects every member shop into it.
        void openWindowForGoodsDrive(saved);
    }
    if (to === 'completed') {
        // The campaign's organiser is credited, not the closer — a steward
        // clicking "complete" on someone else's drive did not do the work.
        const eventType = completionEventFor(campaign.type);
        if (eventType) {
            void awardCoalitionKarma({
                eventType,
                blackoutUserId: campaign.createdBy,
                coalitionId: coalition.id,
                referenceId: campaign.id,
            });
        }
        // Absolute totals, recomputed from Blackout's own rows — so a push
        // that never lands self-heals on the next drive to close.
        void pushCoalitionMilestones(coalition.id);
    }
    return succeed(saved);
}

export const CAMPAIGN_STATUS_GRAPH = CAMPAIGN_TRANSITIONS;

// ---------------------------------------------------------------------------
// Boost meter (separate pool; one boost per member per campaign per UTC day)
// ---------------------------------------------------------------------------

export function campaignBoostMeter(campaignId: string, now = NOW_ISO()): BoostMeter {
    return computeBoostMeter(db.listCoalitionBoosts({ campaignId }), now);
}

export async function boostCampaign(
    idOrSlug: string,
    actorId: string,
    campaignId: string,
    now = NOW_ISO()
): Promise<CoalitionResult<{ meter: BoostMeter; remainingToday: number }>> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    if (coalition.archivedAt) return fail({ kind: 'archived' });
    if (!activeMembership(coalition.id, actorId)) return fail({ kind: 'not_member' });
    const campaign = db.getCoalitionCampaign(campaignId);
    if (!campaign || campaign.coalitionId !== coalition.id) return fail({ kind: 'not_found' });
    if (campaign.status !== 'active') return fail({ kind: 'campaign_inactive' });
    const day = utcDayOf(now);
    const allowance = boostDailyAllowance();
    const spentToday = db.listCoalitionBoosts({
        coalitionId: coalition.id,
        userId: actorId,
        day,
    }).length;
    if (db.listCoalitionBoosts({ campaignId, userId: actorId, day }).length > 0) {
        return fail({ kind: 'already_boosted' });
    }
    if (boostAllowanceRemaining(spentToday, allowance) <= 0) {
        return fail({ kind: 'boost_allowance_exhausted', allowance });
    }
    db.upsertCoalitionBoost({
        id: newBoostId(),
        campaignId,
        coalitionId: coalition.id,
        userId: actorId,
        day,
    });
    const meter = campaignBoostMeter(campaignId, now);
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.campaign.boosted',
        payload: { coalitionId: coalition.id, campaignId, userId: actorId, total: meter.total },
    });
    return succeed({ meter, remainingToday: boostAllowanceRemaining(spentToday + 1, allowance) });
}

// ---------------------------------------------------------------------------
// Amplification: raising a mutual-aid request to a coalition
// ---------------------------------------------------------------------------

/**
 * Raise an existing mutual-aid post to a coalition so its members can amplify
 * it. This creates a `mutual_aid` campaign pointing at the post — it never
 * copies the post's content, so the aid board stays the single source of
 * truth and an external/mirrored post keeps its provenance.
 *
 * Amplification itself reuses the Surge mechanic: members boost the campaign,
 * and the boost meter's visibility multiplier (the same Laplace-smoothed
 * acceleration a project Surge uses) lifts it. No second multiplier exists.
 */
export function raiseAidPost(
    idOrSlug: string,
    actorId: string,
    aidPostId: string
): CoalitionResult<CoalitionCampaignRecord> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    if (coalition.archivedAt) return fail({ kind: 'archived' });
    if (!activeMembership(coalition.id, actorId)) return fail({ kind: 'not_member' });

    const post = db.listCoalitionAidPosts().find((row) => row.id === aidPostId);
    if (!post) return fail({ kind: 'not_found' });

    // Already raised here: return the existing campaign rather than a duplicate.
    const existing = db
        .listCoalitionCampaigns({ coalitionId: coalition.id, type: 'mutual_aid' })
        .find((row) => row.aidPostId === aidPostId);
    if (existing) return succeed(existing);

    const campaign = db.upsertCoalitionCampaign({
        id: newCampaignId(),
        coalitionId: coalition.id,
        type: 'mutual_aid',
        title: post.title,
        description: post.description,
        raisedCents: 0,
        contributorCount: 0,
        // Amplification needs no steward gate: raising is not spending, and any
        // member vouching for a neighbour's ask is the point.
        status: 'active',
        requiresStewardApproval: false,
        createdBy: actorId,
        approvedBy: actorId,
        aidPostId,
    });
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.aid.raised',
        payload: { coalitionId: coalition.id, campaignId: campaign.id, aidPostId, by: actorId },
    });
    void awardCoalitionKarma({
        eventType: 'aid_raised',
        blackoutUserId: actorId,
        coalitionId: coalition.id,
        referenceId: campaign.id,
    });
    return succeed(campaign);
}

export interface AmplifiedAidView {
    campaign: CoalitionCampaignRecord;
    aidPostId: string;
    boost: BoostMeter;
}

/**
 * The coalition's raised aid, ranked by the same visibility multiplier that
 * lifts a surging project — most-amplified first.
 */
export function listAmplifiedAid(
    idOrSlug: string,
    now = NOW_ISO()
): CoalitionResult<AmplifiedAidView[]> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const rows = db
        .listCoalitionCampaigns({ coalitionId: coalition.id, type: 'mutual_aid' })
        .filter((row) => row.status === 'active' && row.aidPostId)
        .map((campaign) => ({
            campaign,
            aidPostId: campaign.aidPostId as string,
            boost: campaignBoostMeter(campaign.id, now),
        }))
        // Reach saturates, so two well-supported asks tie on the multiplier
        // often. Break that on live activity first and recency second, or the
        // list becomes a permanent accumulation leaderboard where the
        // longest-standing ask outranks the one people are backing today.
        .sort(
            (a, b) =>
                b.boost.visibilityMultiplier - a.boost.visibilityMultiplier ||
                b.boost.last24h - a.boost.last24h ||
                b.campaign.createdAt.localeCompare(a.campaign.createdAt)
        );
    return succeed(rows);
}

/** Test-only reset of every coalitions-network map. */
export function __resetCoalitionsForTests(): void {
    db.coalitions.clear();
    db.coalitionMemberships.clear();
    db.coalitionJoinRequests.clear();
    db.coalitionConnections.clear();
    db.coalitionMemberConnections.clear();
    db.coalitionCampaigns.clear();
    db.coalitionCampaignPosts.clear();
    db.coalitionExternalActivity.clear();
    db.coalitionCampaignSyncOptIns.clear();
    db.coalitionBoosts.clear();
    db.coalitionCampaignContributions.clear();
}
