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
    'coalition.succeed',
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
    // Stewards can petition to succeed a founder who has gone; they cannot
    // archive, which stays the founder's own act.
    'coalition.succeed',
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

/**
 * What a coalition asks of someone before admitting them, beyond its join mode.
 *
 * Every field is optional and absent means "do not ask". A coalition that sets
 * none of them admits on its join mode alone, which is the default and the
 * common case — the platform has no opinion about who belongs in someone
 * else's mission.
 *
 * These are all answered from Blackout's own records, synchronously, and that
 * is why they live apart from `minTierToJoin`. The tier comes from FBM over
 * HTTP and can be genuinely unknowable — the member may have no FBM identity at
 * all, or the service may be down — so an unmet tier and an unanswerable tier
 * have to be distinguishable. These cannot fail that way: an account either is
 * old enough or is not.
 *
 * None of them is purchasable, which is deliberate. A subscription must not be
 * able to answer the question of whether someone may join a community.
 */
export interface CoalitionJoinRequirements {
    /** Whole days the account must have existed. */
    minAccountAgeDays?: number;
    /** The member must have confirmed an email address. */
    requireVerifiedEmail?: boolean;
    /** Minimum score on Blackout's own reputation event log. */
    minReputationScore?: number;
    /** Captured contributions the member has made to any coalition drive. */
    minCoalitionContributions?: number;
}

export const COALITION_JOIN_REQUIREMENT_KEYS = [
    'account_age',
    'verified_email',
    'reputation',
    'contributions',
    'tier',
] as const;
export type CoalitionJoinRequirementKey = typeof COALITION_JOIN_REQUIREMENT_KEYS[number];

/**
 * One requirement's verdict.
 *
 * `unverified` is a third state, not a flavour of `met: false`. A gate the
 * server could not check must never produce a message telling someone their
 * reputation is too low — during an FBM outage that would be a lie, and it
 * would be told to everyone.
 */
export interface CoalitionJoinRequirementCheck {
    key: CoalitionJoinRequirementKey;
    met: boolean;
    /** The answer could not be determined. Never grounds for a refusal. */
    unverified?: boolean;
    /** What the coalition asks for, rendered for display. */
    required: string;
    /** What the member has, when it is known. */
    actual?: string;
}

/** Requirements a joiner did not clear. Empty means "admit on join mode". */
export function unmetRequirements(
    checks: readonly CoalitionJoinRequirementCheck[]
): CoalitionJoinRequirementCheck[] {
    return checks.filter((check) => !check.met);
}

/**
 * Normalize founder input. Out-of-range and non-finite numbers are dropped
 * rather than clamped: a coalition that asked for a nonsense threshold asked
 * for nothing, which is safer than the platform inventing a number and
 * enforcing it against real people.
 */
export function normalizeJoinRequirements(
    input: CoalitionJoinRequirements | null | undefined
): CoalitionJoinRequirements | undefined {
    if (!input) return undefined;
    const out: CoalitionJoinRequirements = {};
    const whole = (value: unknown, max: number): number | undefined => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
        const n = Math.floor(value);
        return n > 0 && n <= max ? n : undefined;
    };
    const age = whole(input.minAccountAgeDays, 3650);
    if (age !== undefined) out.minAccountAgeDays = age;
    const rep = whole(input.minReputationScore, 1_000_000);
    if (rep !== undefined) out.minReputationScore = rep;
    const contributions = whole(input.minCoalitionContributions, 10_000);
    if (contributions !== undefined) out.minCoalitionContributions = contributions;
    if (input.requireVerifiedEmail === true) out.requireVerifiedEmail = true;
    return Object.keys(out).length > 0 ? out : undefined;
}

export interface Coalition {
    id: string;
    /** URL-safe handle, unique per server. */
    slug: string;
    name: string;
    mission: string;
    bannerUrl?: string;
    joinMode: CoalitionJoinMode;
    /**
     * Optional KARMA-tier gate, resolved from FBM's coalition ladder.
     *
     * Checked once, at join. Existing members are never re-checked: a standing
     * condition evaluated against a remote service would demote a whole roster
     * during an outage.
     */
    minTierToJoin?: CoalitionTierGate;
    /** Founder-chosen local requirements. Absent means the join mode alone decides. */
    joinRequirements?: CoalitionJoinRequirements;
    /** The Matrix Space this coalition is mirrored to, once provisioned. */
    spaceRoomId?: string;
    createdBy: string;
    archivedAt?: string;
    /**
     * Set by the platform, never by the coalition. Separate from `archivedAt`
     * on purpose: archiving is the founder's own reversible act, and the
     * subject of a takedown must not be able to clear it by un-archiving.
     */
    takenDownAt?: string;
    takenDownBy?: string;
    takedownReason?: string;
    reinstatedAt?: string;
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

/**
 * Where a campaign can be shared TO.
 *
 * Deliberately a superset of `COALITION_PLATFORMS` and a separate type. A
 * *platform* is something a coalition connects: it has credential rows, opt-in
 * rows, inbound moderation and a `VARCHAR(16)` column in three tables. A
 * *share target* is just a URL shape — no credential, no row, no setup, no
 * steward. Folding the two together would widen the persisted enum of every
 * connection table with values that can never legally appear in one.
 *
 * `copy` is the terminal fallback that makes "any platform" true: whatever the
 * person uses, they can always take the text and the link.
 */
export const COALITION_SHARE_TARGETS = [
    'copy',
    'x',
    'bluesky',
    'mastodon',
    'threads',
    'facebook',
    'reddit',
    'linkedin',
    'telegram',
    'whatsapp',
    'email',
    'sms',
    'instagram',
    'tiktok',
    'discord',
] as const;
export type CoalitionShareTarget = typeof COALITION_SHARE_TARGETS[number];

/**
 * How a target accepts a share:
 *   - `intent`  the target has a web composer that takes the text in a query
 *               param, so one click opens a pre-filled post;
 *   - `copy`    the target has no composer reachable by URL (Instagram,
 *               TikTok, Discord), so the honest offer is the text on the
 *               clipboard and the app opened by the person.
 *
 * Every target carries the campaign URL one way or another — that is the whole
 * point of the feature, so `buildShareHref` never returns a bare intent link
 * without it.
 */
export interface CoalitionShareTargetSpec {
    label: string;
    kind: 'intent' | 'copy';
    /**
     * Mastodon has no central share router: the composer lives on the member's
     * own instance (`https://<host>/share?text=`). Without a host there is
     * nowhere correct to send them, so the target degrades to `copy` rather
     * than dumping everyone on mastodon.social logged out.
     */
    needsInstanceHost?: boolean;
}

export const COALITION_SHARE_TARGET_SPECS: Record<CoalitionShareTarget, CoalitionShareTargetSpec> =
    {
        copy: { label: 'Copy link', kind: 'copy' },
        x: { label: 'X', kind: 'intent' },
        bluesky: { label: 'Bluesky', kind: 'intent' },
        mastodon: { label: 'Mastodon', kind: 'intent', needsInstanceHost: true },
        threads: { label: 'Threads', kind: 'intent' },
        facebook: { label: 'Facebook', kind: 'intent' },
        reddit: { label: 'Reddit', kind: 'intent' },
        linkedin: { label: 'LinkedIn', kind: 'intent' },
        telegram: { label: 'Telegram', kind: 'intent' },
        whatsapp: { label: 'WhatsApp', kind: 'intent' },
        email: { label: 'Email', kind: 'intent' },
        sms: { label: 'Messages', kind: 'intent' },
        instagram: { label: 'Instagram', kind: 'copy' },
        tiktok: { label: 'TikTok', kind: 'copy' },
        discord: { label: 'Discord', kind: 'copy' },
    };

export function isCoalitionShareTarget(value: unknown): value is CoalitionShareTarget {
    return (
        typeof value === 'string' && (COALITION_SHARE_TARGETS as readonly string[]).includes(value)
    );
}

/** A hostname, for Mastodon's per-instance composer. Rejects anything else. */
const INSTANCE_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

export function isInstanceHost(value: string): boolean {
    return value.length <= 253 && INSTANCE_HOST.test(value);
}

export interface ShareComposition {
    /** The full post copy, which already ends with `url`. */
    text: string;
    /** The canonical Blackout campaign URL. Never truncated, never dropped. */
    url: string;
    /** Short headline for targets that take a title separately (Reddit, email). */
    title: string;
}

/**
 * Build the href that opens `target`'s composer pre-filled with `post`.
 *
 * Returns `null` for `copy`-kind targets and for a Mastodon share with no
 * instance host: there is no URL that does the right thing, and inventing one
 * sends the person somewhere they are not logged in. The caller falls back to
 * the clipboard, which is why `copy` is a first-class target rather than a
 * failure mode.
 */
export function buildShareHref(
    target: CoalitionShareTarget,
    post: ShareComposition,
    instanceHost?: string
): string | null {
    const spec = COALITION_SHARE_TARGET_SPECS[target];
    if (!spec || spec.kind === 'copy') return null;
    const text = encodeURIComponent(post.text);
    const url = encodeURIComponent(post.url);
    const title = encodeURIComponent(post.title);
    switch (target) {
        case 'x':
            return `https://x.com/intent/post?text=${text}`;
        case 'bluesky':
            return `https://bsky.app/intent/compose?text=${text}`;
        case 'mastodon':
            return instanceHost && isInstanceHost(instanceHost)
                ? `https://${instanceHost}/share?text=${text}`
                : null;
        case 'threads':
            return `https://www.threads.net/intent/post?text=${text}`;
        case 'facebook':
            // Facebook strips any caption a third party supplies and renders
            // the destination's own OpenGraph card instead — which is exactly
            // why the campaign preview route exists.
            return `https://www.facebook.com/sharer/sharer.php?u=${url}`;
        case 'reddit':
            return `https://www.reddit.com/submit?url=${url}&title=${title}`;
        case 'linkedin':
            return `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
        case 'telegram':
            return `https://t.me/share/url?url=${url}&text=${title}`;
        case 'whatsapp':
            return `https://wa.me/?text=${text}`;
        case 'email':
            return `mailto:?subject=${title}&body=${text}`;
        case 'sms':
            // `?&body=` is the form both iOS and Android parse; `?body=` alone
            // is dropped by iOS.
            return `sms:?&body=${text}`;
        default:
            return null;
    }
}

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
    /**
     * Opaque reference to the member's encrypted platform credential.
     *
     * Absent once the link is revoked: revocation deletes the secret rather
     * than orphaning it, because a dead row still holding ciphertext is a
     * credential at rest that no screen admits exists and nobody is watching.
     */
    credentialRef?: string;
    displayHandle?: string;
    revokedAt?: string;
}

export const COALITION_SUCCESSION_STATUSES = ['open', 'approved', 'declined', 'withdrawn'] as const;
export type CoalitionSuccessionStatus = typeof COALITION_SUCCESSION_STATUSES[number];

/**
 * A steward's petition to take over a coalition whose founder has gone.
 *
 * Only a founder can hand the role on, and nobody can be promoted into it — so
 * without this a coalition outlives its founder only as a frozen shell. The
 * petition is seconded by other stewards rather than decided by one, because
 * the whole point is that the person who would normally decide is absent.
 */
export interface CoalitionSuccessionPetition {
    id: string;
    coalitionId: string;
    /** The steward proposed as the new founder. */
    candidateUserId: string;
    openedBy: string;
    reason: string;
    /** Stewards who have backed it, never including the candidate. */
    secondedBy: string[];
    status: CoalitionSuccessionStatus;
    resolvedBy?: string;
    resolvedAt?: string;
}

/**
 * How many stewards must back a petition: a majority of the stewards who are
 * not the candidate, and never fewer than one. A sole steward in a coalition
 * the founder abandoned can therefore succeed alone, which is the case this
 * exists for; a large coalition needs real agreement.
 */
export function successionQuorum(eligibleStewards: number): number {
    return Math.max(1, Math.ceil(eligibleStewards / 2));
}

export function successionQuorumMet(
    secondedBy: readonly string[],
    eligibleStewards: number
): boolean {
    return secondedBy.length >= successionQuorum(eligibleStewards);
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
    /** Creator Hub bounty when type is project. */
    bountyId?: string;
    /** Mutual-aid post raised to this coalition when type is mutual_aid. */
    aidPostId?: string;
    /**
     * Who the money is for. Server-derived and never client-writable — for a
     * raised mutual-aid campaign it is the person who asked for help, not the
     * member who raised it. Absent falls back to the organiser.
     */
    beneficiaryUserId?: string;
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

/**
 * One share of a campaign's money.
 *
 * Basis points, not percentages, so a three-way split is exact and the active
 * rows can be required to sum to the denominator with no rounding argument.
 *
 * A contribution is still ONE payment: Blackout opens a single checkout and
 * records the allocation against it, because splitting into N tips would mean
 * N card charges for one contributor and nobody completes three redirects.
 * The allocation rides the capture event; FBM settles it.
 */
export interface CampaignPayee {
    id: string;
    campaignId: string;
    coalitionId: string;
    userId: string;
    /** Integer basis points. Active rows must sum to exactly 10000. */
    shareBps: number;
    /** Free-text reason this person is on the list ("organiser", "driver"). */
    role: string;
    active: boolean;
}

export const CAMPAIGN_PAYEE_BPS_DENOMINATOR = 10_000;

/** Active shares must divide the whole, exactly. */
export function campaignPayeeSharesAreValid(
    payees: readonly Pick<CampaignPayee, 'shareBps' | 'active'>[]
): boolean {
    const active = payees.filter((p) => p.active);
    if (active.length === 0) return false;
    if (active.some((p) => !Number.isInteger(p.shareBps) || p.shareBps < 0)) return false;
    return active.reduce((sum, p) => sum + p.shareBps, 0) === CAMPAIGN_PAYEE_BPS_DENOMINATOR;
}

/**
 * Divide `netCents` across the shares, in cents, losing nothing.
 *
 * Largest-remainder: floor every share, then hand the leftover pennies to the
 * largest remainders. The parts always sum back to `netCents`, so a split
 * cannot quietly evaporate a cent or invent one.
 */
export function allocatePayeeCents(
    netCents: number,
    payees: readonly Pick<CampaignPayee, 'userId' | 'shareBps' | 'active'>[]
): Array<{ userId: string; amountCents: number }> {
    const active = payees.filter((p) => p.active);
    if (active.length === 0 || netCents <= 0) return [];
    const exact = active.map((p) => ({
        userId: p.userId,
        floor: Math.floor((netCents * p.shareBps) / CAMPAIGN_PAYEE_BPS_DENOMINATOR),
        remainder: (netCents * p.shareBps) % CAMPAIGN_PAYEE_BPS_DENOMINATOR,
    }));
    let left = netCents - exact.reduce((sum, e) => sum + e.floor, 0);
    const order = [...exact].sort((a, b) => b.remainder - a.remainder);
    for (const entry of order) {
        if (left <= 0) break;
        entry.floor += 1;
        left -= 1;
    }
    return exact.map((e) => ({ userId: e.userId, amountCents: e.floor }));
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
