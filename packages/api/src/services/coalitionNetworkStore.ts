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
    normalizeJoinRequirements,
    type CoalitionJoinRequirementCheck,
    type CoalitionJoinRequirements,
    utcDayOf,
    type BoostMeter,
    type CampaignStatus,
    campaignPayeeSharesAreValid,
    successionQuorum,
    successionQuorumMet,
    type CampaignType,
    type CoalitionImpactStats,
    type CoalitionJoinMode,
    type CoalitionPermission,
    type CoalitionRole,
    type CoalitionTierGate,
} from '@blackout/core';
import { db } from '../db/store';
import type {
    CoalitionCampaignPayeeRecord,
    CoalitionSuccessionPetitionRecord,
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
    closeCoalitionSpace,
} from './coalitionSpaces';
import { describeUnmet, evaluateJoinRequirements } from './coalitionJoinRequirements';
import { revokeMemberLinks } from './coalitionConnectionCustody';
import { isPubliclyListed } from './profileStore';
import { relaySubject } from './relayStore';
import { incrementCounter } from './marketplaceObservability';
import { resolveBlackoutUserId } from './userIdentity';
import { awardCoalitionKarma, type CoalitionReputationEvent } from './coalitionReputation';
import {
    archiveDriveListing,
    campaignHasCapturedContributions,
    ensureDriveListing,
} from './coalitionDrives';
import {
    openWindowForGoodsDrive,
    pushCoalitionMilestones,
    pushCoalitionStatus,
} from './coalitionFbmBridge';

const NOW_ISO = () => new Date().toISOString();
const rand = () => Math.random().toString(36).slice(2, 10);
const stamp = () => Date.now().toString(36);

export const newCoalitionId = (): string => `coa_${rand()}_${stamp()}`;
export const newCoalitionMembershipId = (): string => `coam_${rand()}_${stamp()}`;
export const newJoinRequestId = (): string => `coaj_${rand()}_${stamp()}`;
export const newCampaignId = (): string => `camp_${rand()}_${stamp()}`;
export const newPayeeId = (): string => `cpay_${rand()}_${stamp()}`;
export const newBoostId = (): string => `boost_${rand()}_${stamp()}`;

export type CoalitionError =
    | { kind: 'not_found' }
    | { kind: 'archived' }
    | { kind: 'forbidden'; permission?: CoalitionPermission }
    | { kind: 'not_member' }
    | { kind: 'already_member' }
    | { kind: 'approval_required'; request: CoalitionJoinRequestRecord }
    | { kind: 'tier_gate'; required: CoalitionTierGate; actual: CoalitionTierGate }
    | { kind: 'payees_invalid'; reason: string }
    | { kind: 'taken_down' }
    | { kind: 'petition_open' }
    | { kind: 'petition_not_found' }
    | { kind: 'quorum_not_met'; needed: number; have: number }
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
    /**
     * How many active members are withheld from `members` because they opted
     * out of public listing. Reported rather than concealed: `memberCount`
     * stays the true total, so a viewer sees "48 members, 41 shown" instead of
     * a roster that silently disagrees with its own count. A count is an
     * aggregate, not an identity — it says someone is private, never who.
     */
    hiddenMemberCount: number;
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
        // The same lookup as `listUserCoalitions` by another door, so it
        // answers the same way for a member who opted out.
        if (filter.memberId !== viewerId && !isPubliclyListed(filter.memberId)) return [];
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
/**
 * The coalitions a member belongs to, for their profile page.
 *
 * Someone who opted out of public listing answers with an EMPTY LIST to
 * everyone but themselves — indistinguishable from a member of no coalitions,
 * so the response cannot be used to detect that the flag is set. A 403 or a
 * distinct code would turn the privacy setting into its own oracle.
 */
export function listUserCoalitions(
    userId: string,
    viewerId?: string
): Array<CoalitionSummary & { role: CoalitionRole }> {
    if (viewerId !== userId && !isPubliclyListed(userId)) return [];
    return db
        .listCoalitionMemberships({ userId })
        .filter((m) => m.active)
        .map((m) => ({ membership: m, coalition: db.getCoalition(m.coalitionId) }))
        .filter(
            (pair): pair is { membership: CoalitionMembershipRecord; coalition: CoalitionRecord } =>
                Boolean(pair.coalition && !isStopped(pair.coalition))
        )
        .map(({ membership, coalition }) => ({ ...summarize(coalition), role: membership.role }));
}

/**
 * Non-members see only public campaign states, and never the member ids on a
 * campaign.
 *
 * `createdBy` on a raised mutual-aid campaign is the member who raised a
 * neighbour's request; `approvedBy` is the steward who launched it. Both are
 * raw Blackout ids that join straight back against the roster, so redacting
 * them here — the one function that already draws the member/non-member line —
 * covers every read projection at once.
 *
 * It is deliberately NOT done in `getCampaign`, which the contribute route
 * uses: `createdBy` is the tip's fallback beneficiary, so redacting it on that
 * path would misroute money rather than protect anyone.
 */
export function visibleCampaigns(
    coalitionId: string,
    viewerIsMember: boolean
): CoalitionCampaignRecord[] {
    const rows = db.listCoalitionCampaigns({ coalitionId });
    const visible = viewerIsMember
        ? rows
        : rows
              .filter((row) => row.status === 'active' || row.status === 'completed')
              .map((row) => redactCampaignIdentities(row));
    return visible.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Strip the member ids a public reader has no business joining on. */
export function redactCampaignIdentities(
    campaign: CoalitionCampaignRecord
): CoalitionCampaignRecord {
    const {
        createdBy: _createdBy,
        approvedBy: _approvedBy,
        // On a raised mutual-aid campaign this is the person who asked for
        // help. Publishing it would name someone in need to the whole internet.
        beneficiaryUserId: _beneficiaryUserId,
        ...rest
    } = campaign;
    return rest as CoalitionCampaignRecord;
}

export function getCoalitionView(
    idOrSlug: string,
    viewerId?: string
): CoalitionResult<CoalitionView> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const membership = viewerId ? activeMembership(coalition.id, viewerId) : undefined;
    const request = viewerId ? db.getCoalitionJoinRequest(coalition.id, viewerId) : undefined;
    const allMembers = activeMembers(coalition.id)
        .sort(
            (a, b) =>
                ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.createdAt.localeCompare(b.createdAt)
        )
        .map((m) => ({ userId: m.userId, role: m.role, joinedAt: m.createdAt }));
    // The coalition is public; a member can choose not to be. Fellow members
    // always see the whole roster — they are already inside the room.
    const viewerIsMember = Boolean(membership);
    const members = viewerIsMember
        ? allMembers
        : allMembers.filter((m) => isPubliclyListed(m.userId));
    const campaigns = visibleCampaigns(coalition.id, viewerIsMember);
    const allCampaigns = db.listCoalitionCampaigns({ coalitionId: coalition.id });
    return succeed({
        ...summarize(coalition, viewerId),
        members,
        hiddenMemberCount: allMembers.length - members.length,
        campaigns,
        // The true total, matching `memberCount` from `summarize` — the impact
        // stats are the coalition's reach, not a roster, so a private member
        // still counts toward what the group achieved.
        stats: summarizeCoalitionImpact(allCampaigns, allMembers.length),
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
    joinRequirements?: CoalitionJoinRequirements;
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
        ...(normalizeJoinRequirements(input.joinRequirements)
            ? { joinRequirements: normalizeJoinRequirements(input.joinRequirements) }
            : {}),
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
    joinRequirements?: CoalitionJoinRequirements | null;
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
    if (isStopped(coalition)) return fail(stoppedError(coalition));
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
    if (patch.joinRequirements === null) delete next.joinRequirements;
    else if (patch.joinRequirements !== undefined) {
        // Normalizing on the way in means a nonsense threshold is dropped once,
        // here, rather than re-interpreted on every join for the life of the
        // coalition. A requirements object that normalizes to nothing clears
        // the field rather than persisting an empty one.
        const normalized = normalizeJoinRequirements(patch.joinRequirements);
        if (normalized) next.joinRequirements = normalized;
        else delete next.joinRequirements;
    }
    const saved = db.upsertCoalition(next);
    if (saved.spaceRoomId && (patch.joinMode !== undefined || patch.name !== undefined)) {
        await syncCoalitionSpaceSettings(saved);
    }
    return succeed(saved);
}

/**
 * A coalition that has stopped accepting activity — archived by its own
 * founder, or taken down by the platform. Every mutation path tests this one
 * predicate so the two cannot drift apart.
 */
export function isStopped(coalition: CoalitionRecord): boolean {
    return Boolean(coalition.archivedAt || coalition.takenDownAt);
}

function stoppedError(coalition: CoalitionRecord): CoalitionError {
    return coalition.takenDownAt ? { kind: 'taken_down' } : { kind: 'archived' };
}

/**
 * Take a coalition down. Platform authority, not the coalition's own.
 *
 * Archiving was never a stop: it set a timestamp that seven of twenty mutation
 * paths happened to check, while money, cross-posting, the public widget and
 * the Matrix Space all carried on. A takedown has to actually stop things, so
 * it sets a flag the coalition cannot clear, closes the Space, and tells FBM to
 * pull the collective storefront.
 */
/**
 * Withdraw every drive listing a coalition owns.
 *
 * FBM's checkout surfaces resolve a listing and never consult the coalition it
 * belongs to, so stopping a coalition on this side does nothing to a listing
 * that is already published: a taken-down coalition would keep taking money
 * through drives it can no longer run. `pushCoalitionStatus` only flips the
 * mirrored cooperative's flags and does not reach listings either.
 */
async function withdrawCoalitionListings(coalitionId: string): Promise<void> {
    for (const campaign of db.listCoalitionCampaigns({ coalitionId })) {
        if (campaign.fbmListingId) await archiveDriveListing(campaign);
    }
}

export async function takeDownCoalition(
    idOrSlug: string,
    adminUserId: string,
    reason: string
): Promise<CoalitionResult<CoalitionRecord>> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    if (coalition.takenDownAt) return succeed(coalition);
    const saved = db.upsertCoalition({
        ...coalition,
        takenDownAt: NOW_ISO(),
        takenDownBy: adminUserId,
        takedownReason: reason,
        reinstatedAt: undefined,
    });
    // Both are best-effort and neither may fail the takedown: the flag is what
    // stops the platform, and a Matrix or FBM outage must not leave a coalition
    // running because its side effects could not be delivered.
    await closeCoalitionSpace(saved);
    void pushCoalitionStatus(saved.id, 'taken_down');
    void withdrawCoalitionListings(saved.id);
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.taken_down',
        payload: { coalitionId: coalition.id, by: adminUserId, reason },
    });
    return succeed(saved);
}

/** Undo a takedown. Only the platform can, and only it could. */
export async function reinstateCoalition(
    idOrSlug: string,
    adminUserId: string
): Promise<CoalitionResult<CoalitionRecord>> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    if (!coalition.takenDownAt) return succeed(coalition);
    const saved = db.upsertCoalition({
        ...coalition,
        takenDownAt: undefined,
        takedownReason: undefined,
        reinstatedAt: NOW_ISO(),
    });
    void pushCoalitionStatus(saved.id, 'active');
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.reinstated',
        payload: { coalitionId: coalition.id, by: adminUserId },
    });
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
    if (isStopped(coalition)) return succeed(coalition);
    const saved = db.upsertCoalition({ ...coalition, archivedAt: NOW_ISO() });
    // Same reason as takedown: archiving here does not reach a published
    // listing, and an archived coalition's drives must stop taking money.
    void withdrawCoalitionListings(saved.id);
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
    return membership;
}

export type JoinOutcome =
    | { joined: true; membership: CoalitionMembershipRecord }
    | {
          joined: false;
          request: CoalitionJoinRequestRecord;
          /**
           * Requirements this member did not clear, when that is why they were
           * queued rather than admitted.
           *
           * Carried so the joiner can be told which bar they missed, and so a
           * steward reading the queue can see it too. Empty on an
           * approval-mode coalition, where being queued is simply the mode.
           */
          unmet?: CoalitionJoinRequirementCheck[];
          /** One line for the joiner. Null when the coalition just uses approval mode. */
          reason?: string | null;
      };

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
    if (isStopped(coalition)) return fail(stoppedError(coalition));
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

    // An unmet requirement files a request for the steward queue; it never
    // refuses outright. A steward reading a request can see what a threshold
    // cannot, and the tier half of this can be genuinely unanswerable — FBM
    // unconfigured, no linked identity, a timeout — in which case refusing
    // would tell everyone their standing was too low on the strength of a
    // lookup that never happened.
    const evaluation = await evaluateJoinRequirements(coalition, userId);

    if (coalition.joinMode === 'open' && evaluation.clear) {
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
        payload: {
            coalitionId: coalition.id,
            userId,
            // Which bars were missed, so the queue is legible without re-running
            // the evaluation. Never the member's actual values.
            unmet: evaluation.unmet.map((check) => check.key),
        },
    });
    return succeed({
        joined: false,
        request,
        unmet: evaluation.unmet,
        reason: describeUnmet(evaluation.unmet),
    });
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
    if (isStopped(coalition)) return fail(stoppedError(coalition));
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
    if (isStopped(coalition)) return fail(stoppedError(coalition));
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
                Boolean(pair.coalition && !isStopped(pair.coalition))
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
    // Custody ends with membership. A departing member's personal platform
    // token was held only because this coalition asked them to link it, so
    // the coalition does not get to keep it once they are out.
    revokeMemberLinks(coalition.id, { userId });
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
    // Custody ends with membership. A departing member's personal platform
    // token was held only because this coalition asked them to link it, so
    // the coalition does not get to keep it once they are out.
    revokeMemberLinks(coalition.id, { userId });
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
    return transferFounderUnchecked(coalition, userId);
}

/**
 * The mechanical half of a founder transfer, with no authority check.
 *
 * Callers own the authority question: `transferFounder` requires the outgoing
 * founder, while a succession petition requires a quorum of stewards precisely
 * because the founder is not there to ask.
 */
async function transferFounderUnchecked(
    coalition: CoalitionRecord,
    userId: string
): Promise<
    CoalitionResult<{ founder: CoalitionMembershipRecord; previous: CoalitionMembershipRecord }>
> {
    const target = activeMembership(coalition.id, userId);
    if (!target) return fail({ kind: 'not_member' });
    const outgoing = activeMembers(coalition.id).find((m) => m.role === 'founder');
    const founder = db.upsertCoalitionMembership({ ...target, role: 'founder' });
    const previous = outgoing
        ? db.upsertCoalitionMembership({ ...outgoing, role: 'steward' })
        : founder;
    await syncCoalitionRoleToSpace(coalition, userId, 'founder');
    if (outgoing) await syncCoalitionRoleToSpace(coalition, outgoing.userId, 'steward');
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.founder.transferred',
        payload: { coalitionId: coalition.id, from: outgoing?.userId ?? null, to: userId },
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
    if (isStopped(coalition)) return fail(stoppedError(coalition));
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
    if (status === 'active') {
        void openWindowForGoodsDrive(withBounty);
        void ensureDriveListing(withBounty);
    }
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
    void ensureDriveListing(saved);
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
    if (to === 'active') {
        // A funding drive needs a listing to take money through. Provisioned on
        // activation rather than at launch, so a campaign that never clears
        // approval never gets a purchasable listing.
        void ensureDriveListing(saved);
    }
    if (to === 'completed' || to === 'cancelled') {
        // FBM's checkout surfaces do not consult campaign status, so a drive
        // that is over keeps taking money until its listing is withdrawn.
        void archiveDriveListing(saved);
    }
    if (to === 'completed') {
        // The campaign's organiser is credited, not the closer — a steward
        // clicking "complete" on someone else's drive did not do the work.
        //
        // And only when somebody actually paid in. Completion is a click; a
        // captured contribution is a fact the platform observed. Without this
        // one person could found a coalition, create a drive, mark it complete
        // and repeat, minting soulbound reputation from nothing.
        //
        // The transition itself stays unconditional — a drive that raised
        // nothing must still be closeable, or a failed campaign is trapped
        // active forever. It is the award that is gated, not the state machine.
        const eventType = completionEventFor(campaign.type);
        if (eventType && campaignHasCapturedContributions(campaign.id, campaign.createdBy)) {
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
    if (isStopped(coalition)) return fail(stoppedError(coalition));
    // Anyone signed in may boost — membership is not required. Amplifying a
    // neighbour's request is exactly the thing an outsider should be able to
    // do, and it is how someone finds the coalition in the first place.
    const campaign = db.getCoalitionCampaign(campaignId);
    if (!campaign || campaign.coalitionId !== coalition.id) return fail({ kind: 'not_found' });
    if (campaign.status !== 'active') return fail({ kind: 'campaign_inactive' });
    const day = utcDayOf(now);
    const allowance = boostDailyAllowance();
    // The cap is per person per day across the whole server, not per coalition.
    // Keyed per coalition it would bound a member and not bound an outsider at
    // all: they would simply get the full allowance again in every coalition.
    const spentToday = db.listCoalitionBoosts({ userId: actorId, day }).length;
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
    // Publicize it: the booster's own relay edge carries the campaign into
    // their Circle and onward through Reach. This is the same mechanism the
    // feed's own Boost button uses, not a parallel one — so many boosters
    // collapse into a single card that names who else passed it on.
    //
    // Best-effort. A relay that cannot be minted must not lose the boost.
    try {
        relaySubject({
            relayerUserId: actorId,
            subjectSource: 'coalition_campaign',
            subjectId: campaignId,
            viaRelayId: null,
            note: null,
        });
    } catch {
        incrementCounter('coalition_boost_relay_failed');
    }

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
    if (isStopped(coalition)) return fail(stoppedError(coalition));
    if (!activeMembership(coalition.id, actorId)) return fail({ kind: 'not_member' });

    const post = db.listCoalitionAidPosts().find((row) => row.id === aidPostId);
    if (!post) return fail({ kind: 'not_found' });
    const beneficiaryUserId = resolveBlackoutUserId(post.customerId) ?? undefined;

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
        // The money is for the person who asked, not the member who raised it
        // on their behalf. A post mirrored in from FBM has no payable author —
        // that projection withholds the requester's id — so this can be absent,
        // and a contribution to such a campaign is refused rather than paid to
        // the wrong person.
        ...(beneficiaryUserId ? { beneficiaryUserId } : {}),
    });
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.aid.raised',
        payload: { coalitionId: coalition.id, campaignId: campaign.id, aidPostId, by: actorId },
    });
    return succeed(campaign);
}

// ---------------------------------------------------------------------------
// Succession: taking over a coalition whose founder has gone
// ---------------------------------------------------------------------------

export const newPetitionId = (): string => `csuc_${rand()}_${stamp()}`;

/** Stewards who could back a petition — everyone but the candidate. */
function eligibleSeconders(coalitionId: string, candidateUserId: string): string[] {
    return activeMembers(coalitionId)
        .filter((m) => m.role === 'steward' && m.userId !== candidateUserId)
        .map((m) => m.userId);
}

/**
 * Open a petition to succeed the founder.
 *
 * Only a founder can hand the role on and nobody can be promoted into it, so a
 * coalition whose founder walks away is otherwise frozen permanently. A steward
 * petitions; the other stewards decide. One petition at a time, or the seconds
 * split between candidates and neither reaches quorum.
 */
export function openSuccessionPetition(
    idOrSlug: string,
    actorId: string,
    reason: string
): CoalitionResult<CoalitionSuccessionPetitionRecord> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    if (isStopped(coalition)) return fail(stoppedError(coalition));
    const gate = requirePermission(coalition, actorId, 'coalition.succeed');
    if (!gate.ok) return gate;
    if (db.getOpenCoalitionSuccessionPetition(coalition.id)) return fail({ kind: 'petition_open' });
    const petition = db.upsertCoalitionSuccessionPetition({
        id: newPetitionId(),
        coalitionId: coalition.id,
        candidateUserId: actorId,
        openedBy: actorId,
        reason,
        secondedBy: [],
        status: 'open',
    });
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.succession.opened',
        payload: { coalitionId: coalition.id, petitionId: petition.id, candidate: actorId },
    });
    return succeed(petition);
}

/**
 * Back an open petition. Reaching quorum resolves it immediately — there is
 * nobody left to press a separate confirm button, which is the situation.
 */
export async function secondSuccessionPetition(
    idOrSlug: string,
    actorId: string
): Promise<CoalitionResult<CoalitionSuccessionPetitionRecord>> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    if (isStopped(coalition)) return fail(stoppedError(coalition));
    const gate = requirePermission(coalition, actorId, 'coalition.succeed');
    if (!gate.ok) return gate;
    const petition = db.getOpenCoalitionSuccessionPetition(coalition.id);
    if (!petition) return fail({ kind: 'petition_not_found' });
    // The candidate cannot second themselves into the role.
    if (petition.candidateUserId === actorId)
        return fail({ kind: 'forbidden', permission: 'coalition.succeed' });

    const secondedBy = petition.secondedBy.includes(actorId)
        ? petition.secondedBy
        : [...petition.secondedBy, actorId];
    const eligible = eligibleSeconders(coalition.id, petition.candidateUserId).length;
    if (!successionQuorumMet(secondedBy, eligible)) {
        const saved = db.upsertCoalitionSuccessionPetition({ ...petition, secondedBy });
        return succeed(saved);
    }

    const transferred = await transferFounderUnchecked(coalition, petition.candidateUserId);
    if (!transferred.ok) return transferred;
    const saved = db.upsertCoalitionSuccessionPetition({
        ...petition,
        secondedBy,
        status: 'approved',
        resolvedBy: actorId,
        resolvedAt: NOW_ISO(),
    });
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.succession.approved',
        payload: {
            coalitionId: coalition.id,
            petitionId: saved.id,
            candidate: petition.candidateUserId,
            seconds: secondedBy.length,
        },
    });
    return succeed(saved);
}

/** Withdraw your own petition. */
export function withdrawSuccessionPetition(
    idOrSlug: string,
    actorId: string
): CoalitionResult<CoalitionSuccessionPetitionRecord> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const petition = db.getOpenCoalitionSuccessionPetition(coalition.id);
    if (!petition) return fail({ kind: 'petition_not_found' });
    if (petition.candidateUserId !== actorId) {
        return fail({ kind: 'forbidden', permission: 'coalition.succeed' });
    }
    return succeed(
        db.upsertCoalitionSuccessionPetition({
            ...petition,
            status: 'withdrawn',
            resolvedBy: actorId,
            resolvedAt: NOW_ISO(),
        })
    );
}

export function getSuccessionPetition(
    idOrSlug: string
): CoalitionResult<{ petition: CoalitionSuccessionPetitionRecord | null; quorum: number }> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const petition = db.getOpenCoalitionSuccessionPetition(coalition.id) ?? null;
    return succeed({
        petition,
        quorum: successionQuorum(
            eligibleSeconders(coalition.id, petition?.candidateUserId ?? '').length
        ),
    });
}

export interface PayeeInput {
    userId: string;
    shareBps: number;
    role: string;
}

/**
 * Set who a campaign's money divides among.
 *
 * Replaces the list wholesale: every payee not named is deactivated, so the
 * stored active rows are always exactly what was last agreed. Shares must sum
 * to the denominator exactly — a list that does not divide the whole is a
 * drafting error, and accepting it would mean silently keeping the remainder.
 */
export function setCampaignPayees(
    idOrSlug: string,
    actorId: string,
    campaignId: string,
    payees: readonly PayeeInput[]
): CoalitionResult<CoalitionCampaignPayeeRecord[]> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    if (isStopped(coalition)) return fail(stoppedError(coalition));
    const gate = requirePermission(coalition, actorId, 'campaigns.launch');
    if (!gate.ok) return gate;
    const campaign = db.getCoalitionCampaign(campaignId);
    if (!campaign || campaign.coalitionId !== coalition.id) return fail({ kind: 'not_found' });

    const resolved: PayeeInput[] = [];
    for (const entry of payees) {
        const userId = resolveBlackoutUserId(entry.userId);
        if (!userId) return fail({ kind: 'payees_invalid', reason: 'unknown_user' });
        // A payee must be someone the coalition can account for: a member, or
        // the beneficiary the campaign already names.
        if (!activeMembership(coalition.id, userId) && campaign.beneficiaryUserId !== userId) {
            return fail({ kind: 'payees_invalid', reason: 'not_a_member' });
        }
        if (resolved.some((r) => r.userId === userId)) {
            return fail({ kind: 'payees_invalid', reason: 'duplicate' });
        }
        resolved.push({ userId, shareBps: entry.shareBps, role: entry.role });
    }
    if (!campaignPayeeSharesAreValid(resolved.map((r) => ({ ...r, active: true })))) {
        return fail({ kind: 'payees_invalid', reason: 'shares_must_total_100' });
    }

    const named = new Set(resolved.map((r) => r.userId));
    for (const existing of db.listCoalitionCampaignPayees({ campaignId: campaign.id })) {
        if (!named.has(existing.userId) && existing.active) {
            db.upsertCoalitionCampaignPayee({ ...existing, active: false });
        }
    }
    const saved = resolved.map((entry) =>
        db.upsertCoalitionCampaignPayee({
            id: newPayeeId(),
            campaignId: campaign.id,
            coalitionId: coalition.id,
            userId: entry.userId,
            shareBps: entry.shareBps,
            role: entry.role,
            active: true,
        })
    );
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.campaign.payees.set',
        payload: {
            coalitionId: coalition.id,
            campaignId: campaign.id,
            payees: saved.length,
            by: actorId,
        },
    });
    return succeed(saved);
}

/** The active shares on a campaign, or an empty list when it pays one person. */
export function listCampaignPayees(campaignId: string): CoalitionCampaignPayeeRecord[] {
    return db.listCoalitionCampaignPayees({ campaignId }).filter((row) => row.active);
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
    db.coalitionSuccessionPetitions.clear();
    db.coalitionCampaignPayees.clear();
}
