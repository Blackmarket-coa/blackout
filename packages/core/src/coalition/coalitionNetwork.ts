/**
 * Coalitions network: durable, multi-member groups that replace the friends
 * list. A Coalition is a first-class entity with its own membership, roles,
 * join policy and campaigns; it is mirrored (best-effort) onto a Matrix Space
 * so the coalition's dens, hierarchy and power levels ride on Matrix, while
 * the Postgres rows stay the source of truth for server-side authorisation.
 *
 * Naming: the pre-existing per-canopy mutual-aid hub keeps its `coalition`
 * code namespace (`/v1/coalition`, `co.bmc.coalition`, `features/coalition`)
 * and is relabelled "Commons" in UI copy; the network described here lives
 * under the plural `coalitions` namespace throughout.
 */

export const COALITION_JOIN_MODES = ['open', 'approval'] as const;
export type CoalitionJoinMode = typeof COALITION_JOIN_MODES[number];

/**
 * Roles are scoped to one coalition. They reuse the ecosystem's tier language
 * (Steward, Griot) but are NOT a user's personal KARMA tier: a Seedling can be
 * a coalition's Steward and an Ancestor can be a plain member.
 *
 * - founder: created the coalition; owns it (archive, transfer, everything).
 * - steward: launches drives/campaigns, approves join requests, manages roles.
 * - griot: promo and storytelling — cross-posts campaigns, curates the feed.
 * - member: participates, contributes, boosts.
 */
export const COALITION_ROLES = ['founder', 'steward', 'griot', 'member'] as const;
export type CoalitionRole = typeof COALITION_ROLES[number];

/** Matrix power level each role is mirrored to on the coalition Space. */
export const COALITION_ROLE_POWER_LEVELS: Record<CoalitionRole, number> = {
    founder: 100,
    steward: 50,
    griot: 25,
    member: 0,
};

export const COALITION_ROLE_LABELS: Record<CoalitionRole, string> = {
    founder: 'Founder',
    steward: 'Steward',
    griot: 'Griot',
    member: 'Member',
};

/**
 * Personal KARMA tiers (the ladder FBM already runs: Seedling → Sprout → Root
 * → Canopy → Ancestor). Used only as an optional minimum-tier-to-join gate;
 * never as a coalition role.
 */
export const COALITION_TIER_GATES = ['seedling', 'sprout', 'root', 'canopy', 'ancestor'] as const;
export type CoalitionTierGate = typeof COALITION_TIER_GATES[number];

export const COALITION_PERMISSIONS = [
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
] as const;
export type CoalitionPermission = typeof COALITION_PERMISSIONS[number];

const STEWARD_PERMISSIONS: readonly CoalitionPermission[] = [
    'coalition.edit',
    'members.approve',
    'members.role',
    'members.remove',
    'members.invite',
    'campaigns.launch',
    'campaigns.approve',
    'campaigns.promote',
    'connections.manage',
    'externals.moderate',
];

/** Server-enforced permission matrix. Founder holds every permission. */
export const COALITION_ROLE_PERMISSIONS: Record<CoalitionRole, readonly CoalitionPermission[]> = {
    founder: [...COALITION_PERMISSIONS],
    steward: STEWARD_PERMISSIONS,
    griot: ['campaigns.promote', 'members.invite'],
    member: [],
};

export function isCoalitionRole(value: unknown): value is CoalitionRole {
    return typeof value === 'string' && (COALITION_ROLES as readonly string[]).includes(value);
}
export function isCoalitionJoinMode(value: unknown): value is CoalitionJoinMode {
    return typeof value === 'string' && (COALITION_JOIN_MODES as readonly string[]).includes(value);
}
export function isCoalitionTierGate(value: unknown): value is CoalitionTierGate {
    return typeof value === 'string' && (COALITION_TIER_GATES as readonly string[]).includes(value);
}

export function coalitionRoleCan(role: CoalitionRole, permission: CoalitionPermission): boolean {
    return COALITION_ROLE_PERMISSIONS[role].includes(permission);
}

/** Roles a given actor may assign. Founder is never assignable (it is transferred). */
export function assignableRolesFor(actorRole: CoalitionRole): readonly CoalitionRole[] {
    if (actorRole === 'founder') return ['steward', 'griot', 'member'];
    if (actorRole === 'steward') return ['griot', 'member'];
    return [];
}

/** `tier` satisfies a minimum-tier gate when it sits at or above the gate. */
export function tierSatisfies(
    tier: CoalitionTierGate,
    gate: CoalitionTierGate | undefined
): boolean {
    if (!gate) return true;
    return COALITION_TIER_GATES.indexOf(tier) >= COALITION_TIER_GATES.indexOf(gate);
}

export interface Coalition {
    id: string;
    /** URL-safe handle, unique per server. */
    slug: string;
    name: string;
    mission: string;
    bannerUrl?: string;
    joinMode: CoalitionJoinMode;
    /** Optional personal-tier gate; existing members are never re-checked. */
    minTierToJoin?: CoalitionTierGate;
    /** The Matrix Space this coalition is mirrored to, once provisioned. */
    spaceRoomId?: string;
    createdBy: string;
    archivedAt?: string;
}

export interface CoalitionMembership {
    id: string;
    coalitionId: string;
    userId: string;
    role: CoalitionRole;
    /** Toggled false on leave/removal (upsert-only; no row deletion). */
    active: boolean;
}

export const COALITION_JOIN_REQUEST_STATUSES = [
    'pending',
    'invited',
    'approved',
    'declined',
    'withdrawn',
] as const;
export type CoalitionJoinRequestStatus = typeof COALITION_JOIN_REQUEST_STATUSES[number];

/**
 * One row per (coalition, user). `pending` = the user asked to join an
 * approval-mode coalition; `invited` = a steward invited the user and the user
 * has not answered yet.
 */
export interface CoalitionJoinRequest {
    id: string;
    coalitionId: string;
    userId: string;
    message?: string;
    status: CoalitionJoinRequestStatus;
    invitedBy?: string;
    reviewedBy?: string;
    reviewedAt?: string;
}

export function isCoalitionJoinRequestStatus(value: unknown): value is CoalitionJoinRequestStatus {
    return (
        typeof value === 'string' &&
        (COALITION_JOIN_REQUEST_STATUSES as readonly string[]).includes(value)
    );
}

/** External platforms a coalition can connect. */
export const COALITION_PLATFORMS = [
    'x',
    'bluesky',
    'discord',
    'instagram',
    'tiktok',
    'mastodon',
] as const;
export type CoalitionPlatform = typeof COALITION_PLATFORMS[number];

/**
 * Platforms that allow bot / webhook posting get full API posting; the others
 * only ever get a pre-filled share link — never an unsupported automation.
 */
export const COALITION_PLATFORM_CAPABILITIES: Record<
    CoalitionPlatform,
    { apiPost: boolean; inbound: boolean; label: string }
> = {
    x: { apiPost: true, inbound: true, label: 'X' },
    bluesky: { apiPost: true, inbound: true, label: 'Bluesky' },
    discord: { apiPost: true, inbound: true, label: 'Discord' },
    mastodon: { apiPost: true, inbound: true, label: 'Mastodon' },
    instagram: { apiPost: false, inbound: false, label: 'Instagram' },
    tiktok: { apiPost: false, inbound: false, label: 'TikTok' },
};

export function isCoalitionPlatform(value: unknown): value is CoalitionPlatform {
    return typeof value === 'string' && (COALITION_PLATFORMS as readonly string[]).includes(value);
}

/** Set per platform, not once per coalition. */
export const CONNECTION_AUTH_MODES = ['personal', 'shared'] as const;
export type ConnectionAuthMode = typeof CONNECTION_AUTH_MODES[number];

export function isConnectionAuthMode(value: unknown): value is ConnectionAuthMode {
    return (
        typeof value === 'string' && (CONNECTION_AUTH_MODES as readonly string[]).includes(value)
    );
}

export interface CoalitionConnection {
    id: string;
    coalitionId: string;
    platform: CoalitionPlatform;
    authMode: ConnectionAuthMode;
    /**
     * Opaque reference to a credential held by the linked-accounts /
     * integrations credential store (never the secret itself). Only set when
     * `authMode === 'shared'`.
     */
    credentialRef?: string;
    /** Display handle for the shared account / webhook target (no secrets). */
    displayHandle?: string;
    createdBy: string;
    active: boolean;
}

/** Only populated when the platform's coalition connection is `personal`. */
export interface CoalitionMemberConnection {
    id: string;
    coalitionId: string;
    userId: string;
    platform: CoalitionPlatform;
    credentialRef: string;
    displayHandle?: string;
    revokedAt?: string;
}

export const CAMPAIGN_TYPES = ['drive', 'project', 'boost', 'mutual_aid', 'goods_drive'] as const;
export type CampaignType = typeof CAMPAIGN_TYPES[number];

export const CAMPAIGN_STATUSES = [
    'draft',
    'pending_approval',
    'active',
    'completed',
    'cancelled',
] as const;
export type CampaignStatus = typeof CAMPAIGN_STATUSES[number];

export function isCampaignType(value: unknown): value is CampaignType {
    return typeof value === 'string' && (CAMPAIGN_TYPES as readonly string[]).includes(value);
}
export function isCampaignStatus(value: unknown): value is CampaignStatus {
    return typeof value === 'string' && (CAMPAIGN_STATUSES as readonly string[]).includes(value);
}

/** Legal status moves. Terminal states have no exits. */
export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
    draft: ['pending_approval', 'active', 'cancelled'],
    pending_approval: ['active', 'draft', 'cancelled'],
    active: ['completed', 'cancelled'],
    completed: [],
    cancelled: [],
};

export function canTransitionCampaign(from: CampaignStatus, to: CampaignStatus): boolean {
    return CAMPAIGN_TRANSITIONS[from].includes(to);
}

/**
 * A campaign run by a coalition. Money never lives here: a `drive` records
 * captured contributions (`raisedCents`) that were settled through the
 * existing tip → FBM checkout → marketplace-webhook path at the flat 3%.
 */
export interface CoalitionCampaign {
    id: string;
    coalitionId: string;
    type: CampaignType;
    title: string;
    description: string;
    /** Funding goal for `drive` / `project`; unit goal for `goods_drive`. */
    goalCents?: number;
    goalUnits?: number;
    raisedCents: number;
    contributorCount: number;
    status: CampaignStatus;
    requiresStewardApproval: boolean;
    createdBy: string;
    approvedBy?: string;
    startsAt?: string;
    endsAt?: string;
    completedAt?: string;
    /** Existing hub project (funding meter, milestones, surge) when type is project/drive. */
    projectId?: string;
    /** Creator Hub bounty when type is project (bounty splits). */
    bountyId?: string;
    /** Mutual-aid post raised to this coalition when type is mutual_aid. */
    aidPostId?: string;
    /** FBM listing contributions are purchased against (drive checkout). */
    fbmListingId?: string;
    /** FBM order cycle for goods drives. */
    fbmOrderCycleId?: string;
    /** Blackstar drive reference for physical fulfilment hand-off. */
    logisticsDriveRef?: string;
}

export const CAMPAIGN_POST_DIRECTIONS = ['out', 'in'] as const;
export type CampaignPostDirection = typeof CAMPAIGN_POST_DIRECTIONS[number];

export const CAMPAIGN_POST_SYNC_STATUSES = [
    'pending',
    'posted',
    'failed',
    'share_link',
    'received',
] as const;
export type CampaignPostSyncStatus = typeof CAMPAIGN_POST_SYNC_STATUSES[number];

export interface CampaignPost {
    id: string;
    campaignId: string;
    coalitionId: string;
    platform: CoalitionPlatform;
    externalPostId?: string;
    direction: CampaignPostDirection;
    syncStatus: CampaignPostSyncStatus;
    /** The member whose connection carried the post (personal mode) or who triggered it. */
    authorUserId?: string;
    /** Pre-filled share link for platforms without bot posting. */
    shareUrl?: string;
    error?: string;
}

export const EXTERNAL_ACTIVITY_MODERATION_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ExternalActivityModerationStatus = typeof EXTERNAL_ACTIVITY_MODERATION_STATUSES[number];

/**
 * A reply / engagement that arrived from an external platform. The author is
 * display-only text: no Blackout profile, identity or permission is ever
 * implied. Nothing is visible until `moderationStatus === 'approved'`.
 */
export interface ExternalActivity {
    id: string;
    campaignPostId: string;
    campaignId: string;
    coalitionId: string;
    sourcePlatform: CoalitionPlatform;
    externalAuthor: string;
    externalId?: string;
    content: string;
    moderationStatus: ExternalActivityModerationStatus;
    reviewedBy?: string;
    reviewedAt?: string;
    receivedAt: string;
}

/** Explicit per-member, per-campaign, per-platform opt-in. Off by default. */
export interface CampaignSyncOptIn {
    id: string;
    campaignId: string;
    coalitionId: string;
    userId: string;
    platform: CoalitionPlatform;
    enabled: boolean;
}

/**
 * A member's Boost on a campaign. Coalition Boost is a SEPARATE pool from
 * Community Boost pledges (money) and from Circle relays: one row per
 * (campaign, member, UTC day), so the meter counts distinct boosts and never
 * double-counts a relay or a pledge.
 */
export interface CoalitionBoost {
    id: string;
    campaignId: string;
    coalitionId: string;
    userId: string;
    /** UTC calendar day `YYYY-MM-DD` the boost was spent on. */
    day: string;
}

/**
 * One captured contribution toward a campaign goal. Mirrors the shape the
 * hub's project supports already use, so a drive reads like a project.
 */
export interface CoalitionCampaignContribution {
    id: string;
    campaignId: string;
    coalitionId: string;
    supporterUserId: string;
    /** The captured tip that carried the money. Unique — replays never double-count. */
    tipId: string;
    amountCents: number;
    currency: string;
}

/** Per member, per coalition, per UTC day. Configurable by the server. */
export const DEFAULT_COALITION_BOOST_DAILY_ALLOWANCE = 3;

export interface BoostMeter {
    /** Total boosts on the campaign. */
    total: number;
    /** Distinct members who boosted. */
    members: number;
    /** Boosts in the trailing 24h and the 24h before, for the surge multiplier. */
    last24h: number;
    prev24h: number;
    /** Same Laplace-smoothed acceleration used by project Surges (0..1). */
    surgeFactor: number;
    /** Visibility multiplier applied to feed ranking (1 = neutral). */
    visibilityMultiplier: number;
}

export function utcDayOf(iso: string): string {
    return iso.slice(0, 10);
}

/**
 * Aggregate a campaign's boosts into a meter. Reuses the Surge acceleration
 * formula ((last+1)/(last+prev+2)) so a burst of boosts lifts a campaign the
 * same way a burst of support lifts a project.
 */
export function computeBoostMeter(
    boosts: readonly Pick<CoalitionBoost, 'userId' | 'day'>[],
    now: string
): BoostMeter {
    const today = utcDayOf(now);
    const yesterday = utcDayOf(
        new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString()
    );
    const members = new Set(boosts.map((b) => b.userId)).size;
    const last24h = boosts.filter((b) => b.day === today).length;
    const prev24h = boosts.filter((b) => b.day === yesterday).length;
    const surgeFactor = Math.max(0, Math.min(1, (last24h + 1) / (last24h + prev24h + 2)));
    // Two non-negative bonuses over a neutral 1, so that boosting a campaign can
    // never rank it below one nobody has ever boosted.
    //
    // The previous form folded the raw surge factor straight into the
    // multiplier, which had two consequences nobody would choose: a campaign
    // boosted three times yesterday and not today scored 0.940 against 1.000
    // for a campaign with no boosts at all, and a campaign whose boosts were
    // all older than 48h scored 1.200 against 1.004 for one boosted yesterday —
    // so amplification demoted, and staleness outranked recency.
    //
    //   acceleration  0..1   momentum only, 0 unless today beats yesterday
    //   reach         0..0.2 distinct support, saturating at 10 boosts
    //
    // `surgeFactor` is unchanged and still the project-Surge Laplace ratio; it
    // is 0.5 at rest, so only its excess over 0.5 counts as acceleration.
    const acceleration = Math.max(0, surgeFactor - 0.5) * 2;
    const reach = Math.min(0.2, boosts.length / 50);
    const visibilityMultiplier = 1 + 0.4 * acceleration + reach;
    return {
        total: boosts.length,
        members,
        last24h,
        prev24h,
        surgeFactor,
        visibilityMultiplier: Number(visibilityMultiplier.toFixed(3)),
    };
}

/** Whether a member may spend another boost today given the daily allowance. */
export function boostAllowanceRemaining(
    boostsToday: number,
    allowance = DEFAULT_COALITION_BOOST_DAILY_ALLOWANCE
): number {
    return Math.max(0, allowance - boostsToday);
}

/** State event stamped on a coalition's Matrix Space so clients can find the entity. */
export const COALITION_SPACE_STATE_EVENT_TYPE = 'co.bmc.coalition.space' as const;

export interface CoalitionSpaceStateEventContent {
    coalitionId: string;
    slug: string;
    joinMode: CoalitionJoinMode;
}

export interface CoalitionImpactStats {
    fundsRaisedCents: number;
    drivesCompleted: number;
    activeCampaigns: number;
    memberCount: number;
}

/** Cumulative impact from the campaigns list — no money is stored on the coalition row. */
export function summarizeCoalitionImpact(
    campaigns: readonly Pick<CoalitionCampaign, 'type' | 'status' | 'raisedCents'>[],
    memberCount: number
): CoalitionImpactStats {
    let fundsRaisedCents = 0;
    let drivesCompleted = 0;
    let activeCampaigns = 0;
    for (const campaign of campaigns) {
        fundsRaisedCents += campaign.raisedCents;
        if (campaign.status === 'active') activeCampaigns += 1;
        // A completed drive counts only if it raised something. Closing an
        // empty drive is a click, and this figure is on the coalition's public
        // page — it should say what the group did, not how often it pressed a
        // button. `raisedCents` moves only on a captured contribution.
        if (
            campaign.status === 'completed' &&
            campaign.raisedCents > 0 &&
            (campaign.type === 'drive' || campaign.type === 'goods_drive')
        ) {
            drivesCompleted += 1;
        }
    }
    return { fundsRaisedCents, drivesCompleted, activeCampaigns, memberCount };
}

export function countActiveCoalitionMembers(
    memberships: readonly Pick<CoalitionMembership, 'active'>[]
): number {
    return memberships.reduce((total, m) => total + (m.active ? 1 : 0), 0);
}

const SLUG_RE = /[^a-z0-9]+/g;

/** Derive a URL-safe slug from a name; callers de-duplicate with a suffix. */
export function slugifyCoalitionName(name: string): string {
    const base = name
        .toLowerCase()
        .replace(SLUG_RE, '-')
        .replace(/^-+|-+$/g, '');
    return base.length > 0 ? base.slice(0, 48) : 'coalition';
}
