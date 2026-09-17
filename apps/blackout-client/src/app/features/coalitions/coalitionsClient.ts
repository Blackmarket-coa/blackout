/**
 * API client for the Coalitions network (`/v1/coalitions`). Keep in sync with
 * packages/api/src/routes/coalitions.ts and the Coalition* types in
 * @blackout/core (coalitionNetwork.ts).
 */
import type {
    BoostMeter,
    CampaignStatus,
    CampaignType,
    Coalition,
    CoalitionCampaign,
    CoalitionImpactStats,
    CoalitionJoinMode,
    CoalitionJoinRequest,
    CoalitionJoinRequirementCheck,
    CoalitionJoinRequirements,
    CoalitionMembership,
    CoalitionPermission,
    CoalitionRole,
    CoalitionTierGate,
} from '@blackout/core';
import { deleteJson, getJson, patchJson, postJson } from '../../sdk/json';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

export const COALITIONS_BASE = '/v1/coalitions';

export interface CoalitionRecordView extends Coalition {
    createdAt: string;
    updatedAt: string;
}

export interface CoalitionSummary {
    coalition: CoalitionRecordView;
    memberCount: number;
    activeCampaigns: number;
    viewerRole?: CoalitionRole;
}

export interface UserCoalitionSummary extends CoalitionSummary {
    role: CoalitionRole;
}

export interface CoalitionMemberView {
    userId: string;
    username: string;
    matrixUserId: string | null;
    role: CoalitionRole;
    joinedAt: string;
}

/**
 * `createdBy` and `approvedBy` are omitted for a viewer outside the coalition —
 * on a raised mutual-aid campaign `createdBy` is the member who raised a
 * neighbour's request — so they are optional on the wire.
 */
export interface CoalitionCampaignView extends Omit<CoalitionCampaign, 'createdBy'> {
    createdBy?: string;
    createdAt: string;
    updatedAt: string;
    boost?: BoostMeter;
}

export interface CoalitionView extends CoalitionSummary {
    members: CoalitionMemberView[];
    /** Active members withheld from `members` because they opted out of public listing. */
    hiddenMemberCount: number;
    campaigns: CoalitionCampaignView[];
    stats: CoalitionImpactStats;
    viewer: {
        membership?: CoalitionMembership;
        request?: CoalitionJoinRequest;
        permissions: CoalitionPermission[];
    };
}

export interface JoinRequestView extends CoalitionJoinRequest {
    createdAt: string;
    user: { userId: string; username: string; matrixUserId: string | null };
}

export interface CoalitionInviteView {
    request: CoalitionJoinRequest & { createdAt: string };
    coalition: CoalitionRecordView;
    invitedBy: { userId: string; username: string; matrixUserId: string | null } | null;
}

export interface CreateCoalitionInput {
    name: string;
    mission: string;
    bannerUrl?: string;
    joinMode: CoalitionJoinMode;
    minTierToJoin?: CoalitionTierGate;
    joinRequirements?: CoalitionJoinRequirements;
}

export interface UpdateCoalitionInput {
    name?: string;
    mission?: string;
    bannerUrl?: string | null;
    joinMode?: CoalitionJoinMode;
    minTierToJoin?: CoalitionTierGate | null;
    joinRequirements?: CoalitionJoinRequirements | null;
}

export interface CreateCampaignInput {
    type: CampaignType;
    title: string;
    description?: string;
    goalCents?: number;
    goalUnits?: number;
    startsAt?: string;
    endsAt?: string;
    requiresStewardApproval?: boolean;
    projectId?: string;
    bountyId?: string;
    aidPostId?: string;
    fbmListingId?: string;
    fbmOrderCycleId?: string;
}

const enc = encodeURIComponent;

export function fetchCoalitions(
    query: { q?: string; mine?: boolean } = {},
    token: string | null = readBlackoutApiToken()
): Promise<CoalitionSummary[]> {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.mine) params.set('mine', '1');
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return getJson<{ coalitions: CoalitionSummary[] }>(`${COALITIONS_BASE}${suffix}`, token).then(
        (r) => r.coalitions
    );
}

/** A user's coalitions with their role; `userId` may be a Matrix id or a Blackout id. */
export function fetchUserCoalitions(
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<UserCoalitionSummary[]> {
    return getJson<{ coalitions: UserCoalitionSummary[] }>(
        `${COALITIONS_BASE}/users/${enc(userId)}`,
        token
    ).then((r) => r.coalitions);
}

export function fetchCoalition(
    idOrSlug: string,
    token: string | null = readBlackoutApiToken()
): Promise<CoalitionView> {
    return getJson<CoalitionView>(`${COALITIONS_BASE}/${enc(idOrSlug)}`, token);
}

export function createCoalition(
    input: CreateCoalitionInput,
    token: string | null = readBlackoutApiToken()
): Promise<{
    coalition: CoalitionRecordView;
    membership: CoalitionMembership;
    space: { ok: boolean };
}> {
    return postJson(COALITIONS_BASE, input, token);
}

export function updateCoalition(
    idOrSlug: string,
    input: UpdateCoalitionInput,
    token: string | null = readBlackoutApiToken()
): Promise<{ coalition: CoalitionRecordView }> {
    return patchJson(`${COALITIONS_BASE}/${enc(idOrSlug)}`, input, token);
}

export function archiveCoalition(
    idOrSlug: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ coalition: CoalitionRecordView }> {
    return postJson(`${COALITIONS_BASE}/${enc(idOrSlug)}/archive`, {}, token);
}

export type JoinOutcome =
    | { joined: true; membership: CoalitionMembership }
    | {
          joined: false;
          request: CoalitionJoinRequest;
          /** Requirements this member did not clear. Empty in plain approval mode. */
          unmet?: CoalitionJoinRequirementCheck[];
          /** One line to show the joiner. Null when approval mode alone queued them. */
          reason?: string | null;
      };

export function joinCoalition(
    idOrSlug: string,
    message?: string,
    token: string | null = readBlackoutApiToken()
): Promise<JoinOutcome> {
    return postJson(`${COALITIONS_BASE}/${enc(idOrSlug)}/join`, message ? { message } : {}, token);
}

export function leaveCoalition(
    idOrSlug: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ membership: CoalitionMembership }> {
    return postJson(`${COALITIONS_BASE}/${enc(idOrSlug)}/leave`, {}, token);
}

export function fetchJoinRequests(
    idOrSlug: string,
    token: string | null = readBlackoutApiToken()
): Promise<JoinRequestView[]> {
    return getJson<{ requests: JoinRequestView[] }>(
        `${COALITIONS_BASE}/${enc(idOrSlug)}/requests`,
        token
    ).then((r) => r.requests);
}

export function reviewJoinRequest(
    idOrSlug: string,
    userId: string,
    decision: 'approve' | 'decline',
    token: string | null = readBlackoutApiToken()
): Promise<{ request: CoalitionJoinRequest; membership?: CoalitionMembership }> {
    return postJson(
        `${COALITIONS_BASE}/${enc(idOrSlug)}/requests/${enc(userId)}/${decision}`,
        {},
        token
    );
}

export function withdrawJoinRequest(
    idOrSlug: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ request: CoalitionJoinRequest }> {
    return postJson(`${COALITIONS_BASE}/${enc(idOrSlug)}/requests/withdraw`, {}, token);
}

export function inviteToCoalition(
    idOrSlug: string,
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ request: CoalitionJoinRequest }> {
    return postJson(`${COALITIONS_BASE}/${enc(idOrSlug)}/invites`, { userId }, token);
}

export function fetchMyInvites(
    token: string | null = readBlackoutApiToken()
): Promise<CoalitionInviteView[]> {
    return getJson<{ invites: CoalitionInviteView[] }>(
        `${COALITIONS_BASE}/invites/mine`,
        token
    ).then((r) => r.invites);
}

export function setMemberRole(
    idOrSlug: string,
    userId: string,
    role: CoalitionRole,
    token: string | null = readBlackoutApiToken()
): Promise<{ membership: CoalitionMembership }> {
    return patchJson(`${COALITIONS_BASE}/${enc(idOrSlug)}/members/${enc(userId)}`, { role }, token);
}

export function removeMember(
    idOrSlug: string,
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ membership: CoalitionMembership }> {
    return deleteJson(`${COALITIONS_BASE}/${enc(idOrSlug)}/members/${enc(userId)}`, token);
}

export function transferFounder(
    idOrSlug: string,
    userId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ founder: CoalitionMembership; previous: CoalitionMembership }> {
    return postJson(`${COALITIONS_BASE}/${enc(idOrSlug)}/transfer`, { userId }, token);
}

export function fetchCampaigns(
    idOrSlug: string,
    token: string | null = readBlackoutApiToken()
): Promise<CoalitionCampaignView[]> {
    return getJson<{ campaigns: CoalitionCampaignView[] }>(
        `${COALITIONS_BASE}/${enc(idOrSlug)}/campaigns`,
        token
    ).then((r) => r.campaigns);
}

export function createCampaign(
    idOrSlug: string,
    input: CreateCampaignInput,
    token: string | null = readBlackoutApiToken()
): Promise<{ campaign: CoalitionCampaignView }> {
    return postJson(`${COALITIONS_BASE}/${enc(idOrSlug)}/campaigns`, input, token);
}

export function approveCampaign(
    idOrSlug: string,
    campaignId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ campaign: CoalitionCampaignView }> {
    return postJson(
        `${COALITIONS_BASE}/${enc(idOrSlug)}/campaigns/${enc(campaignId)}/approve`,
        {},
        token
    );
}

export function setCampaignStatus(
    idOrSlug: string,
    campaignId: string,
    status: CampaignStatus,
    token: string | null = readBlackoutApiToken()
): Promise<{ campaign: CoalitionCampaignView }> {
    return postJson(
        `${COALITIONS_BASE}/${enc(idOrSlug)}/campaigns/${enc(campaignId)}/status`,
        { status },
        token
    );
}

export function boostCampaign(
    idOrSlug: string,
    campaignId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ meter: BoostMeter; remainingToday: number }> {
    return postJson(
        `${COALITIONS_BASE}/${enc(idOrSlug)}/campaigns/${enc(campaignId)}/boost`,
        {},
        token
    );
}

export interface ShareTargetView {
    target: string;
    label: string;
    href?: string;
    needsInstanceHost?: boolean;
}

export interface CampaignShareView {
    campaignId: string;
    coalitionSlug: string;
    url: string;
    text: string;
    title: string;
    targets: ShareTargetView[];
}

/**
 * Share links for a campaign. Works signed out — the endpoint takes an optional
 * token, and a visitor who can see a public campaign can pass it on.
 */
export function fetchCampaignShare(
    idOrSlug: string,
    campaignId: string,
    instanceHost?: string,
    token: string | null = readBlackoutApiToken()
): Promise<CampaignShareView> {
    const query = instanceHost ? `?instanceHost=${enc(instanceHost)}` : '';
    return getJson<CampaignShareView>(
        `${COALITIONS_BASE}/${enc(idOrSlug)}/campaigns/${enc(campaignId)}/share${query}`,
        token
    );
}
