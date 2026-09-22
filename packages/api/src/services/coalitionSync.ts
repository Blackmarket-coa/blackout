/**
 * Coalition cross-posting and external sync.
 *
 * Three rules shape this module, and each is enforced here rather than left to
 * a caller's good manners:
 *
 *  1. **Nothing broadcasts without consent.** A member's external account is
 *     only used for a campaign they explicitly opted that platform into
 *     (`coalition_campaign_sync_opt_ins`). An absent row means off. There is no
 *     "opt out" default and no coalition-wide switch that enrolls people.
 *  2. **Nothing inbound is trusted.** Replies from other platforms land in
 *     `coalition_external_activity` as `pending` and are invisible until a
 *     moderator approves them. The external author is display text — never a
 *     Blackout user, never a profile, never a permission.
 *  3. **Two-way sync is off by default**, behind
 *     `BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED`, and refuses rather than
 *     half-working. It is not sequenced behind BO-1: what it ingests is public
 *     text from public platforms, moderated before display, and it makes no
 *     confidentiality claim — TRANSMUTATION_NOTES.md §5 draws the BO-1 line at
 *     surfaces that make one. See `inboundSyncEnabled` for what an operator
 *     needs in place before turning it on.
 *
 * Platforms that permit bot/webhook posting get real posts; the rest get a
 * pre-filled share link a human completes. We never automate a platform that
 * has not sanctioned it.
 */
import {
    COALITION_PLATFORM_CAPABILITIES,
    platformAllowsAuthMode,
    isCoalitionPlatform,
    COALITION_SHARE_TARGETS,
    COALITION_SHARE_TARGET_SPECS,
    buildShareHref,
    coalitionRoleCan,
    type CoalitionPlatform,
    type CoalitionShareTarget,
    type ConnectionAuthMode,
} from '@blackout/core';
import { db } from '../db/store';
import type {
    CoalitionCampaignRecord,
    CoalitionCampaignPostRecord,
    CoalitionExternalActivityRecord,
    CoalitionRecord,
} from '../db/types';
import { emitDomainEvent } from '../modules/domain-events';
import { encryptSecret } from './secretBox';
import {
    credentialLooksValid,
    memberCredentialAad,
    postToPlatform,
    sharedCredentialAad,
} from './coalitionPlatformAdapters';
import { withAttribution } from './coalitionAttribution';
import { revokeMemberLinks } from './coalitionConnectionCustody';
import { activeMembership, getCampaign, getCoalition, isStopped } from './coalitionNetworkStore';
import { isPubliclyListed } from './profileStore';

const NOW_ISO = () => new Date().toISOString();
const rand = () => Math.random().toString(36).slice(2, 10);
const stamp = () => Date.now().toString(36);

export const newConnectionId = (): string => `coacon_${rand()}_${stamp()}`;
export const newMemberConnectionId = (): string => `coamc_${rand()}_${stamp()}`;
export const newOptInId = (): string => `coaopt_${rand()}_${stamp()}`;
export const newCampaignPostId = (): string => `coapost_${rand()}_${stamp()}`;
export const newExternalActivityId = (): string => `coaext_${rand()}_${stamp()}`;

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

/**
 * Inbound (two-way) sync master gate. Off by default; not sequenced behind
 * BO-1 (see rule 3 in the module header). An operator turning it on needs:
 *
 *   - every migration through 099 applied (the coalition tables begin at 091);
 *   - the external-activity retention sweep running
 *     (`services/coalitionExternalRetention.ts`, daily; windows pending 30d /
 *     rejected 30d / approved 365d, set by
 *     `BLACKOUT_COALITION_EXTERNAL_RETENTION_{PENDING,REJECTED,APPROVED}_DAYS`);
 *   - each coalition's `externalReplyPolicy` (default `moderated`);
 *   - a platform moderator able to remove any reply via
 *     `POST /v1/coalitions/:id/externals/:activityId/takedown`.
 *
 * Those are the conditions; nothing else gates it.
 */
export const inboundSyncEnabled = (): boolean =>
    process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED === '1' ||
    process.env.BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED?.toLowerCase() === 'true';

/** Outbound posting gate, separate so cross-posting can ship before ingestion. */
export const outboundSyncEnabled = (): boolean =>
    process.env.BLACKOUT_COALITION_CROSSPOST_ENABLED === '1' ||
    process.env.BLACKOUT_COALITION_CROSSPOST_ENABLED?.toLowerCase() === 'true';

// ---------------------------------------------------------------------------
// Frequency guardrails
// ---------------------------------------------------------------------------

/** Minutes a member must wait between cross-posts for one coalition. */
export function crosspostCooldownMinutes(): number {
    const raw = Number.parseInt(process.env.COALITION_CROSSPOST_COOLDOWN_MINUTES ?? '', 10);
    return Number.isFinite(raw) && raw >= 0 ? raw : 60;
}

/** Maximum cross-posts per member per coalition per rolling 24h. */
export function crosspostDailyCap(): number {
    const raw = Number.parseInt(process.env.COALITION_CROSSPOST_DAILY_CAP ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 3;
}

export interface GuardrailState {
    allowed: boolean;
    reason?: 'cooldown' | 'daily_cap';
    /** Seconds until the next post is allowed, when blocked by cooldown. */
    retryAfterSeconds?: number;
    postsToday: number;
    cap: number;
}

/**
 * Campaign-blast fatigue is a real cost borne by a member's own followers, so
 * the limit is per member per coalition — not per campaign, which would let
 * ten campaigns blast ten times.
 */
export function checkGuardrails(
    coalitionId: string,
    userId: string,
    now = NOW_ISO()
): GuardrailState {
    const cap = crosspostDailyCap();
    const cooldownMs = crosspostCooldownMinutes() * 60_000;
    const nowMs = Date.parse(now);
    const dayAgo = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString();

    const mine = db
        .listCoalitionCampaignPosts({ coalitionId })
        .filter(
            (post) =>
                post.direction === 'out' &&
                post.authorUserId === userId &&
                post.createdAt >= dayAgo &&
                (post.syncStatus === 'posted' || post.syncStatus === 'pending')
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (mine.length >= cap) {
        return { allowed: false, reason: 'daily_cap', postsToday: mine.length, cap };
    }
    const last = mine[0];
    if (last && cooldownMs > 0) {
        const elapsed = nowMs - Date.parse(last.createdAt);
        if (elapsed < cooldownMs) {
            return {
                allowed: false,
                reason: 'cooldown',
                retryAfterSeconds: Math.ceil((cooldownMs - elapsed) / 1000),
                postsToday: mine.length,
                cap,
            };
        }
    }
    return { allowed: true, postsToday: mine.length, cap };
}

// ---------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------

export type SyncError =
    | { kind: 'not_found' }
    | { kind: 'not_member' }
    | { kind: 'forbidden' }
    | { kind: 'disabled'; gate: 'inbound' | 'outbound' }
    | { kind: 'no_connection'; platform: CoalitionPlatform }
    | { kind: 'not_opted_in'; platform: CoalitionPlatform }
    | { kind: 'guardrail'; state: GuardrailState }
    | { kind: 'campaign_inactive' }
    | { kind: 'credentials_unavailable' }
    | { kind: 'private_subject' }
    | { kind: 'auth_mode_unsupported'; platform: CoalitionPlatform }
    | { kind: 'credential_malformed'; platform: CoalitionPlatform }
    | { kind: 'already_moderated'; status: 'rejected' };

export type SyncResult<T> = { ok: true; value: T } | { ok: false; error: SyncError };
const fail = <T>(error: SyncError): SyncResult<T> => ({ ok: false, error });
const succeed = <T>(value: T): SyncResult<T> => ({ ok: true, value });

export interface ConnectPlatformInput {
    platform: CoalitionPlatform;
    authMode: ConnectionAuthMode;
    /** Only for `shared`: the bot token / webhook URL the coalition posts with. */
    secret?: string;
    displayHandle?: string;
}

/**
 * Connect a platform for the coalition. Auth mode is per platform, so a
 * coalition can post to Discord with a shared webhook while every member uses
 * their own X account in the same coalition.
 */
export function connectPlatform(
    idOrSlug: string,
    actorId: string,
    input: ConnectPlatformInput
): SyncResult<{
    platform: CoalitionPlatform;
    authMode: ConnectionAuthMode;
    displayHandle?: string;
}> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const membership = activeMembership(coalition.id, actorId);
    if (!membership) return fail({ kind: 'not_member' });
    if (!coalitionRoleCan(membership.role, 'connections.manage'))
        return fail({ kind: 'forbidden' });

    // Not every platform may be connected in every mode. Discord is shared-only
    // because the only thing a member could paste for a personal Discord
    // connection is their user token, and user-token automation is self-botting
    // — terminate-on-sight under Discord's terms. The schema accepted any pair.
    if (!platformAllowsAuthMode(input.platform, input.authMode)) {
        return fail({ kind: 'auth_mode_unsupported', platform: input.platform });
    }

    // A connection row is harmless and is what share-link mode runs on, so the
    // route stays open. Accepting a SECRET does not: custody starts when
    // posting does.
    if (input.authMode === 'shared' && input.secret && !outboundSyncEnabled()) {
        return fail({ kind: 'disabled', gate: 'outbound' });
    }

    // Tell a steward their webhook URL is wrong now, not at the first post —
    // and for Discord, refuse anything that is not a Discord webhook URL, so
    // the coalition's posts cannot be aimed at a third party.
    if (input.secret && !credentialLooksValid(input.platform, input.secret)) {
        return fail({ kind: 'credential_malformed', platform: input.platform });
    }

    // Shared credentials are encrypted at rest with the same envelope every
    // other third-party secret uses; the plaintext never returns from here.
    let credentialRef: string | undefined;
    if (input.authMode === 'shared' && input.secret) {
        try {
            const ciphertext = encryptSecret(input.secret, {
                aad: `coalition_connection:${coalition.id}:${input.platform}`,
            });
            // The envelope already begins with its key id; prefixing it again
            // produced a five-part string that `decryptSecret` rejects outright,
            // so every credential stored this way was write-only ciphertext that
            // could never be read back or revoked.
            credentialRef = ciphertext;
        } catch {
            // The envelope key is an operator setting; say so rather than
            // storing a credential in the clear or failing opaquely.
            return fail({ kind: 'credentials_unavailable' });
        }
    }

    const existing = db.getCoalitionConnection(coalition.id, input.platform);
    const saved = db.upsertCoalitionConnection({
        id: existing?.id ?? newConnectionId(),
        coalitionId: coalition.id,
        platform: input.platform,
        authMode: input.authMode,
        // Carry the stored credential forward only when the auth mode has not
        // changed. Flipping shared -> personal used to keep the shared bot
        // token in the row while `listConnections` reported the new mode, so
        // a steward who believed they had stopped using the coalition account
        // still had its secret at rest with nothing pointing at it.
        ...(credentialRef
            ? { credentialRef }
            : existing?.credentialRef && existing.authMode === input.authMode
            ? { credentialRef: existing.credentialRef }
            : {}),
        ...(input.displayHandle ? { displayHandle: input.displayHandle } : {}),
        createdBy: actorId,
        active: true,
    });
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.connection.set',
        payload: {
            coalitionId: coalition.id,
            platform: saved.platform,
            authMode: saved.authMode,
            by: actorId,
        },
    });
    return succeed({
        platform: saved.platform,
        authMode: saved.authMode,
        ...(saved.displayHandle ? { displayHandle: saved.displayHandle } : {}),
    });
}

export interface ConnectionView {
    platform: CoalitionPlatform;
    authMode: ConnectionAuthMode;
    displayHandle?: string;
    /** Whether this platform accepts real API posting, or only a share link. */
    apiPost: boolean;
    /** Whether the viewer has linked their own account (personal mode only). */
    memberLinked: boolean;
}

export function listConnections(coalitionId: string, viewerId?: string): ConnectionView[] {
    const memberLinks = viewerId
        ? new Set(
              db
                  .listCoalitionMemberConnections({ coalitionId, userId: viewerId })
                  .filter((row) => !row.revokedAt)
                  .map((row) => row.platform)
          )
        : new Set<string>();
    return db
        .listCoalitionConnections(coalitionId)
        .filter((row) => row.active)
        .map((row) => ({
            platform: row.platform,
            authMode: row.authMode,
            ...(row.displayHandle ? { displayHandle: row.displayHandle } : {}),
            apiPost: COALITION_PLATFORM_CAPABILITIES[row.platform].apiPost,
            memberLinked: memberLinks.has(row.platform),
        }));
}

/**
 * Disconnect a platform: deactivate the row and drop the stored credential.
 *
 * This is the answer to "our coalition bot token leaked". Before it, the only
 * one was a direct database write — nothing in the repo ever set `active` to
 * false or cleared `credentialRef`, and there was no DELETE or PATCH on any
 * connection route.
 *
 * The credential is dropped, not merely orphaned. A deactivated row that still
 * holds ciphertext is a secret at rest that nobody is watching and no screen
 * admits exists; reconnecting asks for a fresh one, which is what a steward
 * revoking a leaked token wants anyway.
 *
 * Personal links for the same platform go with it. Those are members' own
 * tokens, held only because the coalition asked them to link, so the coalition
 * ending that arrangement has to end the custody too.
 */
export function disconnectPlatform(
    idOrSlug: string,
    actorId: string,
    platform: CoalitionPlatform
): SyncResult<{ platform: CoalitionPlatform; memberLinksRevoked: number }> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const membership = activeMembership(coalition.id, actorId);
    if (!membership) return fail({ kind: 'not_member' });
    if (!coalitionRoleCan(membership.role, 'connections.manage')) {
        return fail({ kind: 'forbidden' });
    }
    const existing = db.getCoalitionConnection(coalition.id, platform);
    if (!existing) return fail({ kind: 'no_connection', platform });

    const { credentialRef: _dropped, ...withoutCredential } = existing;
    db.upsertCoalitionConnection({ ...withoutCredential, active: false });

    const memberLinksRevoked = revokeMemberLinks(coalition.id, { platform });
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.connection.revoked',
        payload: { coalitionId: coalition.id, platform, by: actorId, memberLinksRevoked },
    });
    return succeed({ platform, memberLinksRevoked });
}

/** A member links their own account for a platform the coalition set to `personal`. */
export function linkMemberAccount(
    idOrSlug: string,
    userId: string,
    platform: CoalitionPlatform,
    secret: string,
    displayHandle?: string
): SyncResult<{ platform: CoalitionPlatform; displayHandle?: string }> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    if (!activeMembership(coalition.id, userId)) return fail({ kind: 'not_member' });
    const connection = db.getCoalitionConnection(coalition.id, platform);
    if (!connection || !connection.active) return fail({ kind: 'no_connection', platform });
    if (connection.authMode !== 'personal') return fail({ kind: 'forbidden' });
    if (!credentialLooksValid(platform, secret)) {
        return fail({ kind: 'credential_malformed', platform });
    }
    // Same rule as the shared credential above: a member's personal platform
    // token is the highest-value secret this feature touches, so it is not
    // accepted until the thing that would use it is switched on.
    if (!outboundSyncEnabled()) return fail({ kind: 'disabled', gate: 'outbound' });

    let ciphertext: string;
    try {
        ciphertext = encryptSecret(secret, {
            aad: `coalition_member_connection:${coalition.id}:${userId}:${platform}`,
        });
    } catch {
        return fail({ kind: 'credentials_unavailable' });
    }
    const existing = db
        .listCoalitionMemberConnections({ coalitionId: coalition.id, userId })
        .find((row) => row.platform === platform);
    const saved = db.upsertCoalitionMemberConnection({
        id: existing?.id ?? newMemberConnectionId(),
        coalitionId: coalition.id,
        userId,
        platform,
        credentialRef: ciphertext,
        ...(displayHandle ? { displayHandle } : {}),
    });
    return succeed({
        platform: saved.platform,
        ...(saved.displayHandle ? { displayHandle: saved.displayHandle } : {}),
    });
}

// ---------------------------------------------------------------------------
// Opt-in
// ---------------------------------------------------------------------------

export interface OptInView {
    platform: CoalitionPlatform;
    enabled: boolean;
}

/** A member's per-campaign, per-platform choices. Absent row = off. */
export function listOptIns(campaignId: string, userId: string): OptInView[] {
    const rows = db.listCoalitionCampaignSyncOptIns({ campaignId, userId });
    return rows.map((row) => ({ platform: row.platform, enabled: row.enabled }));
}

export function isOptedIn(
    campaignId: string,
    userId: string,
    platform: CoalitionPlatform
): boolean {
    return db
        .listCoalitionCampaignSyncOptIns({ campaignId, userId })
        .some((row) => row.platform === platform && row.enabled);
}

/**
 * Toggle one platform for one campaign. Explicit per campaign by design: a
 * member who shared one drive has not agreed to share the next one.
 */
export function setOptIn(
    idOrSlug: string,
    userId: string,
    campaignId: string,
    platform: CoalitionPlatform,
    enabled: boolean
): SyncResult<OptInView> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    if (!activeMembership(coalition.id, userId)) return fail({ kind: 'not_member' });
    const campaign = db.getCoalitionCampaign(campaignId);
    if (!campaign || campaign.coalitionId !== coalition.id) return fail({ kind: 'not_found' });
    const connection = db.getCoalitionConnection(coalition.id, platform);
    if (!connection || !connection.active) return fail({ kind: 'no_connection', platform });

    const existing = db
        .listCoalitionCampaignSyncOptIns({ campaignId, userId })
        .find((row) => row.platform === platform);
    const saved = db.upsertCoalitionCampaignSyncOptIn({
        id: existing?.id ?? newOptInId(),
        campaignId,
        coalitionId: coalition.id,
        userId,
        platform,
        enabled,
    });
    return succeed({ platform: saved.platform, enabled: saved.enabled });
}

// ---------------------------------------------------------------------------
// Outbound
// ---------------------------------------------------------------------------

export interface ComposedPost {
    text: string;
    url: string;
    title: string;
}

const CAMPAIGN_VERB: Record<string, string> = {
    drive: 'is raising for',
    goods_drive: 'is collecting for',
    project: 'is building',
    boost: 'is boosting',
    mutual_aid: 'is amplifying',
};

/**
 * Longest campaign title we will put in a post.
 *
 * A coalition name is capped at 80 and a title at 160, so an untruncated post
 * runs to roughly 330 characters and X rejects it. The URL is the one part
 * that must survive intact — a share that loses its link back to Blackout is
 * the one failure this feature cannot tolerate — so the title absorbs the cut.
 */
const TITLE_BUDGET = 120;

const clip = (value: string, max: number): string =>
    value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}\u2026`;

export const coalitionBaseUrl = (
    baseUrl = process.env.BLACKOUT_PUBLIC_BASE_URL ?? 'https://theblackout.app'
): string => baseUrl.replace(/\/+$/, '');

/**
 * The URL we put in posts.
 *
 * Points at the API's server-rendered preview, not the SPA, because a crawler
 * reads meta tags and does not run JS: the SPA path unfurls as the static
 * "Blackout Client" card on every platform. The preview answers with the
 * campaign's own card and then sends the human on to `campaignAppUrl`.
 *
 * Served under `/v1/c/` for the same reason invite links are served under
 * `/v1/i/` — the pretty top-level `/c/` path needs an nginx rule that may not
 * be deployed on every host, and a share link that 404s is worse than an ugly
 * one.
 */
export function campaignShareUrl(
    coalition: Pick<CoalitionRecord, 'slug'>,
    campaignId: string,
    baseUrl?: string
): string {
    return `${coalitionBaseUrl(baseUrl)}/v1/c/${encodeURIComponent(
        coalition.slug
    )}/${encodeURIComponent(campaignId)}`;
}

/** Where a human ends up: the SPA campaign deep link. */
export function campaignAppUrl(
    coalition: Pick<CoalitionRecord, 'slug'>,
    campaignId: string,
    baseUrl?: string
): string {
    return `${coalitionBaseUrl(baseUrl)}/coalitions/${encodeURIComponent(
        coalition.slug
    )}/c/${encodeURIComponent(campaignId)}`;
}

/** The one place campaign copy is composed, so every platform says the same thing. */
export function composePost(
    coalition: CoalitionRecord,
    campaign: CoalitionCampaignRecord,
    baseUrl?: string
): ComposedPost {
    const verb = CAMPAIGN_VERB[campaign.type] ?? 'is running';
    const goal =
        campaign.goalCents && campaign.goalCents > 0
            ? ` Goal: $${(campaign.goalCents / 100).toLocaleString()}.`
            : '';
    // The campaign, not the coalition. Every campaign in a coalition used to
    // share one link, so a shared drive landed on a page that never named it.
    const url = campaignShareUrl(coalition, campaign.id, baseUrl);
    const title = clip(campaign.title, TITLE_BUDGET);
    return {
        text: `${coalition.name} ${verb} ${title}.${goal} ${url}`,
        url,
        title: `${coalition.name}: ${title}`,
    };
}

/**
 * Pre-filled share link for a coalition *platform*, used by the crosspost path.
 *
 * Thin adapter over the share-target table in core so the crosspost outcomes
 * and the share sheet can never drift apart. Targets with no reachable web
 * composer (Instagram, TikTok) get the bare campaign URL, which is honest
 * about what the link does; Discord gets null, as it always has.
 */
export function shareLinkFor(platform: CoalitionPlatform, post: ComposedPost): string | null {
    if (platform === 'discord') return null;
    return buildShareHref(platform, post) ?? post.url;
}

export interface CrosspostOutcome {
    platform: CoalitionPlatform;
    status: CoalitionCampaignPostRecord['syncStatus'];
    postId: string;
    shareUrl?: string;
    error?: string;
}

export interface PlatformPoster {
    (input: {
        platform: CoalitionPlatform;
        text: string;
        url: string;
        credentialRef: string | null;
        /**
         * The additional authenticated data the credential was sealed with.
         * Decryption fails without the exact string, which is what stops a
         * credential stored for one coalition being replayed against another.
         */
        credentialAad: string;
    }): Promise<{ ok: boolean; externalPostId?: string; error?: string }>;
}

/**
 * The real adapters, injectable so tests need not stand up three services.
 *
 * This used to default to a stub answering `no_adapter`, which meant every
 * platform the capabilities table marked postable wrote a failed row. The
 * adapters decide per platform now — and still answer `no_adapter` for the
 * ones we have genuinely not built, which is the honest half of that stub.
 */
let poster: PlatformPoster = postToPlatform;

export function __setPlatformPosterForTests(next: PlatformPoster | null): void {
    poster = next ?? postToPlatform;
}

/**
 * Cross-post a campaign to the platforms this member opted this campaign into.
 * Platforms that cannot be posted to programmatically yield a share link
 * instead of a failure — that is the designed fallback, not an error.
 */
export async function crosspostCampaign(
    idOrSlug: string,
    userId: string,
    campaignId: string,
    now = NOW_ISO()
): Promise<SyncResult<{ outcomes: CrosspostOutcome[]; guardrails: GuardrailState }>> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    // A stopped coalition stops promoting itself. `shareCampaign` has always
    // checked this; the credentialed path did not, so an archived coalition —
    // or one the platform had taken down — kept broadcasting under its own
    // name to every connected account.
    if (isStopped(coalition)) return fail({ kind: 'not_found' });
    const membership = activeMembership(coalition.id, userId);
    if (!membership) return fail({ kind: 'not_member' });
    // Posting under the coalition's name is a promotion act, not a membership
    // act: `campaigns.promote` is held by griot, steward and founder, and was
    // defined for exactly this. Without the check any member could speak for
    // the whole coalition on X, Bluesky or Discord.
    if (!coalitionRoleCan(membership.role, 'campaigns.promote')) return fail({ kind: 'forbidden' });
    if (!outboundSyncEnabled()) return fail({ kind: 'disabled', gate: 'outbound' });

    const campaign = db.getCoalitionCampaign(campaignId);
    if (!campaign || campaign.coalitionId !== coalition.id) return fail({ kind: 'not_found' });
    if (campaign.status !== 'active') return fail({ kind: 'campaign_inactive' });
    // The privacy gate every other share surface applies. It exists to stop a
    // mutual-aid campaign naming someone who kept their profile unlisted from
    // being broadcast, and this — the credentialed, higher-volume path — was
    // the one surface that did not consult it. `shareCampaign` checks it, and
    // so does the OG card; a person who opted out of being listed was
    // protected from a menu click and not from an API post.
    if (!campaignIsPubliclyShareable(campaign)) return fail({ kind: 'private_subject' });

    const optIns = db
        .listCoalitionCampaignSyncOptIns({ campaignId, userId })
        .filter((row) => row.enabled);
    if (optIns.length === 0) {
        return fail({ kind: 'not_opted_in', platform: 'x' });
    }

    const guardrails = checkGuardrails(coalition.id, userId, now);
    if (!guardrails.allowed) return fail({ kind: 'guardrail', state: guardrails });

    const basePost = composePost(coalition, campaign);
    const outcomes: CrosspostOutcome[] = [];

    for (const optIn of optIns) {
        const platform = optIn.platform;
        const connection = db.getCoalitionConnection(coalition.id, platform);
        if (!connection || !connection.active) {
            // Report it instead of dropping it. Skipping silently answered 200
            // with an empty outcomes array, so a member whose steward had
            // deactivated a connection was told nothing at all and had no way
            // to tell a successful post from a no-op.
            outcomes.push({
                platform,
                status: 'failed',
                postId: newCampaignPostId(),
                error: 'no_connection',
            });
            continue;
        }

        const capability = COALITION_PLATFORM_CAPABILITIES[platform];
        const id = newCampaignPostId();
        // Per platform, so the coalition can see which one actually worked.
        const attributedUrl = withAttribution(basePost.url, {
            campaignId,
            channel: platform,
            sharerUserId: userId,
        });
        const post = {
            ...basePost,
            url: attributedUrl,
            text: basePost.text.replace(basePost.url, attributedUrl),
        };

        if (!capability.apiPost) {
            const shareUrl = shareLinkFor(platform, post) ?? post.url;
            db.upsertCoalitionCampaignPost({
                id,
                campaignId,
                coalitionId: coalition.id,
                platform,
                direction: 'out',
                syncStatus: 'share_link',
                authorUserId: userId,
                shareUrl,
            });
            outcomes.push({ platform, status: 'share_link', postId: id, shareUrl });
            continue;
        }

        // Personal mode posts with the member's own linked credential; shared
        // mode posts with the coalition's. A personal platform with no link is
        // skipped rather than silently falling back to the shared account.
        let credentialRef: string | null = null;
        if (connection.authMode === 'personal') {
            const link = db
                .listCoalitionMemberConnections({ coalitionId: coalition.id, userId })
                // A revoked link keeps its row but not its secret, so both
                // halves have to hold for it to be usable.
                .find((row) => row.platform === platform && !row.revokedAt && row.credentialRef);
            if (!link?.credentialRef) {
                const shareUrl = shareLinkFor(platform, post) ?? post.url;
                db.upsertCoalitionCampaignPost({
                    id,
                    campaignId,
                    coalitionId: coalition.id,
                    platform,
                    direction: 'out',
                    syncStatus: 'share_link',
                    authorUserId: userId,
                    shareUrl,
                });
                outcomes.push({ platform, status: 'share_link', postId: id, shareUrl });
                continue;
            }
            credentialRef = link.credentialRef;
        } else {
            credentialRef = connection.credentialRef ?? null;
        }

        const result = await poster({
            platform,
            text: post.text,
            url: post.url,
            credentialRef,
            credentialAad:
                connection.authMode === 'personal'
                    ? memberCredentialAad(coalition.id, userId, platform)
                    : sharedCredentialAad(coalition.id, platform),
        });
        db.upsertCoalitionCampaignPost({
            id,
            campaignId,
            coalitionId: coalition.id,
            platform,
            direction: 'out',
            syncStatus: result.ok ? 'posted' : 'failed',
            authorUserId: userId,
            ...(result.externalPostId ? { externalPostId: result.externalPostId } : {}),
            ...(result.error ? { error: result.error } : {}),
        });
        outcomes.push({
            platform,
            status: result.ok ? 'posted' : 'failed',
            postId: id,
            ...(result.error ? { error: result.error } : {}),
        });
    }

    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.campaign.crossposted',
        payload: {
            coalitionId: coalition.id,
            campaignId,
            userId,
            platforms: outcomes.map((o) => o.platform),
        },
    });
    return succeed({ outcomes, guardrails: checkGuardrails(coalition.id, userId, now) });
}

export function listCampaignPosts(campaignId: string): CoalitionCampaignPostRecord[] {
    return db
        .listCoalitionCampaignPosts({ campaignId })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// Inbound (off by default) + moderation
// ---------------------------------------------------------------------------

/** A cap breach reported in the shape the guardrail error already carries. */
const rejectedByCap = (postsToday: number): GuardrailState => ({
    allowed: false,
    reason: 'daily_cap',
    postsToday,
    cap: EXTERNAL_REPLY_CAP_PER_POST,
});

export interface IngestInput {
    campaignPostId: string;
    sourcePlatform: CoalitionPlatform;
    /** Display text only. Never resolved to a Blackout user. */
    externalAuthor: string;
    externalId?: string;
    content: string;
    receivedAt?: string;
}

/** Bounds on text that arrived from outside. Clamped, never rejected. */
const EXTERNAL_AUTHOR_MAX = 120;
const EXTERNAL_CONTENT_MAX = 2000;

/** Replies one post may accumulate before the coalition stops taking more. */
const EXTERNAL_REPLY_CAP_PER_POST = 500;

/**
 * Record an inbound reply against the campaign post it answers. Lands
 * `pending` unless the coalition chose the `open` reply policy for its own
 * mission, and nothing pending is visible before a moderator approves it.
 * Refuses entirely while `BLACKOUT_COALITION_EXTERNAL_SYNC_ENABLED` is off —
 * it does not half-work.
 */
export function ingestExternalActivity(
    input: IngestInput
): SyncResult<CoalitionExternalActivityRecord> {
    if (!inboundSyncEnabled()) return fail({ kind: 'disabled', gate: 'inbound' });
    const post = db.getCoalitionCampaignPost(input.campaignPostId);
    if (!post) return fail({ kind: 'not_found' });

    // The reply has to have arrived on the platform the post went out on.
    // Without this a receiver for one platform could file replies against
    // another platform's post, and the moderation queue would attribute a
    // stranger's words to an account that never saw them.
    if (post.platform !== input.sourcePlatform) return fail({ kind: 'not_found' });
    if (!COALITION_PLATFORM_CAPABILITIES[input.sourcePlatform].inbound) {
        return fail({ kind: 'disabled', gate: 'inbound' });
    }

    const coalition = db.getCoalition(post.coalitionId);
    if (!coalition || isStopped(coalition)) return fail({ kind: 'not_found' });

    // A coalition decides for its own mission what happens to a stranger's
    // words. `off` is a coalition that wants its reach measured without running
    // a comment section — engagement counts are unaffected, because they are
    // not content.
    const policy = coalition.externalReplyPolicy ?? 'moderated';
    if (policy === 'off') return fail({ kind: 'forbidden' });

    const campaign = db.getCoalitionCampaign(post.campaignId);
    if (!campaign) return fail({ kind: 'not_found' });
    if (campaign.status !== 'active' && campaign.status !== 'completed') {
        return fail({ kind: 'campaign_inactive' });
    }

    // A cap per post, because the receiver is reachable by anyone who can reply
    // on a platform and an unbounded queue is a way to bury a steward or fill a
    // disk. New arrivals past the cap are refused, not silently dropped.
    const existingForPost = db
        .listCoalitionExternalActivity({ campaignId: post.campaignId })
        .filter((row) => row.campaignPostId === post.id);
    if (existingForPost.length >= EXTERNAL_REPLY_CAP_PER_POST) {
        return fail({ kind: 'guardrail', state: rejectedByCap(existingForPost.length) });
    }

    // At-least-once delivery: an origin id we have already stored wins.
    if (input.externalId) {
        const seen = db
            .listCoalitionExternalActivity({ campaignId: post.campaignId })
            .find(
                (row) =>
                    row.campaignPostId === post.id &&
                    row.sourcePlatform === input.sourcePlatform &&
                    row.externalId === input.externalId
            );
        if (seen) return succeed(seen);
    }

    const saved = db.upsertCoalitionExternalActivity({
        id: newExternalActivityId(),
        campaignPostId: post.id,
        campaignId: post.campaignId,
        coalitionId: post.coalitionId,
        sourcePlatform: input.sourcePlatform,
        // Clamped rather than refused: a long reply is a long reply, not an
        // attack, and truncating shows the steward what arrived. `clip` is the
        // same helper the outbound path uses.
        externalAuthor: clip(input.externalAuthor, EXTERNAL_AUTHOR_MAX),
        ...(input.externalId ? { externalId: input.externalId } : {}),
        content: clip(input.content, EXTERNAL_CONTENT_MAX),
        moderationStatus: policy === 'open' ? 'approved' : 'pending',
        receivedAt: input.receivedAt ?? NOW_ISO(),
    });
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.external.received',
        payload: {
            coalitionId: post.coalitionId,
            campaignId: post.campaignId,
            activityId: saved.id,
            sourcePlatform: saved.sourcePlatform,
        },
    });
    return succeed(saved);
}

export interface ExternalActivityView {
    id: string;
    campaignId: string;
    campaignPostId: string;
    sourcePlatform: CoalitionPlatform;
    /**
     * Rendered attribution, e.g. `Ada via X`. Deliberately a string: the author
     * has no Blackout identity, so nothing here can be mistaken for a user ref.
     */
    attribution: string;
    externalAuthor: string;
    content: string;
    moderationStatus: CoalitionExternalActivityRecord['moderationStatus'];
    receivedAt: string;
}

function toView(row: CoalitionExternalActivityRecord): ExternalActivityView {
    return {
        id: row.id,
        campaignId: row.campaignId,
        campaignPostId: row.campaignPostId,
        sourcePlatform: row.sourcePlatform,
        attribution: `${row.externalAuthor} via ${
            COALITION_PLATFORM_CAPABILITIES[row.sourcePlatform].label
        }`,
        externalAuthor: row.externalAuthor,
        content: row.content,
        moderationStatus: row.moderationStatus,
        receivedAt: row.receivedAt,
    };
}

/**
 * Approved replies on a campaign thread — the only inbound content anyone sees.
 *
 * A stopped coalition shows none. `getCampaign` still resolves a campaign of an
 * archived or taken-down coalition (members need to read their own history),
 * but a stranger's words were approved for display under a coalition that no
 * longer stands, and a platform takedown that left them up would not be one.
 */
export function listApprovedActivity(campaignId: string): ExternalActivityView[] {
    const campaign = db.getCoalitionCampaign(campaignId);
    if (!campaign) return [];
    const coalition = db.getCoalition(campaign.coalitionId);
    if (!coalition || isStopped(coalition)) return [];
    return db
        .listCoalitionExternalActivity({ campaignId, moderationStatus: 'approved' })
        .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
        .map(toView);
}

/** The moderation queue for a coalition. Requires `externals.moderate`. */
export function listPendingActivity(
    idOrSlug: string,
    actorId: string
): SyncResult<ExternalActivityView[]> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const membership = activeMembership(coalition.id, actorId);
    if (!membership) return fail({ kind: 'not_member' });
    if (!coalitionRoleCan(membership.role, 'externals.moderate'))
        return fail({ kind: 'forbidden' });
    return succeed(
        db
            .listCoalitionExternalActivity({
                coalitionId: coalition.id,
                moderationStatus: 'pending',
            })
            .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))
            .map(toView)
    );
}

export function moderateActivity(
    idOrSlug: string,
    actorId: string,
    activityId: string,
    decision: 'approve' | 'reject'
): SyncResult<ExternalActivityView> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const membership = activeMembership(coalition.id, actorId);
    if (!membership) return fail({ kind: 'not_member' });
    if (!coalitionRoleCan(membership.role, 'externals.moderate'))
        return fail({ kind: 'forbidden' });
    const row = db.getCoalitionExternalActivity(activityId);
    if (!row || row.coalitionId !== coalition.id) return fail({ kind: 'not_found' });

    const target = decision === 'approve' ? 'approved' : 'rejected';
    // Same decision twice is a no-op: the row keeps its original reviewer and
    // time, and no second event is written for a click that changed nothing.
    if (row.moderationStatus === target) return succeed(toView(row));
    // Rejection is terminal. A rejected row is scheduled for purge, and a
    // platform takedown lands here too — neither may be reversed by a steward
    // approving after the fact.
    if (row.moderationStatus === 'rejected') {
        return fail({ kind: 'already_moderated', status: 'rejected' });
    }
    // What remains: approve from pending, reject from pending, and reject from
    // approved (a steward retracting an approval).
    const saved = db.upsertCoalitionExternalActivity({
        ...row,
        moderationStatus: target,
        reviewedBy: actorId,
        reviewedAt: NOW_ISO(),
    });
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.external.moderated',
        payload: {
            coalitionId: coalition.id,
            activityId: saved.id,
            decision,
            reviewedBy: actorId,
        },
    });
    return succeed(toView(saved));
}

/**
 * Platform removal of a single external reply.
 *
 * Platform authority, not the coalition's: the route behind this is gated on
 * the admin allowlist, the same as a coalition takedown. A stopped coalition
 * is still in scope — a moderator can always remove content — and the result
 * is a `rejected` row, so a steward cannot approve it back (see
 * `moderateActivity`) and the retention sweep purges it on the rejected
 * window. The event carries ids and the reason only; the reply's text and
 * author never leave the row.
 */
export function takeDownExternalActivity(
    idOrSlug: string,
    moderatorId: string,
    activityId: string,
    reason: string
): SyncResult<ExternalActivityView> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    const row = db.getCoalitionExternalActivity(activityId);
    if (!row || row.coalitionId !== coalition.id) return fail({ kind: 'not_found' });
    if (row.moderationStatus === 'rejected') return succeed(toView(row));
    const saved = db.upsertCoalitionExternalActivity({
        ...row,
        moderationStatus: 'rejected',
        reviewedBy: moderatorId,
        reviewedAt: NOW_ISO(),
    });
    emitDomainEvent({
        module: 'coalitions',
        type: 'coalition.external.taken_down',
        payload: {
            coalitionId: coalition.id,
            campaignId: saved.campaignId,
            activityId: saved.id,
            moderatorId,
            reason,
        },
    });
    return succeed(toView(saved));
}

// ---------------------------------------------------------------------------
// Share sheet
// ---------------------------------------------------------------------------

export interface ShareTargetView {
    target: CoalitionShareTarget;
    label: string;
    /** Opens a pre-filled composer; absent when the target needs the clipboard. */
    href?: string;
    /** True when the caller should ask for a Mastodon instance and retry. */
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
 * Is this campaign safe to broadcast off-platform?
 *
 * Coalitions are public on purpose — that is how people find the platform —
 * but a campaign can still be *about* a person, and a person who has opted out
 * of public listing must not be pushed onto X by someone else's share button.
 *
 * Mutual aid is the case that matters: the campaign exists to raise money for a
 * named individual, so the subject is the beneficiary (or, when the aid post
 * carried no resolvable customer, whoever raised it). Drives, projects and
 * goods drives are about the coalition's work and name no one, so a private
 * creator does not block them — nothing in the composed copy identifies them,
 * and `redactCampaignIdentities` keeps it that way on the read paths.
 */
export function campaignIsPubliclyShareable(campaign: CoalitionCampaignRecord): boolean {
    if (campaign.type !== 'mutual_aid') {
        return campaign.beneficiaryUserId ? isPubliclyListed(campaign.beneficiaryUserId) : true;
    }
    const subject = campaign.beneficiaryUserId ?? campaign.createdBy;
    return subject ? isPubliclyListed(subject) : true;
}

/**
 * Mint share links for a campaign, for every target we know how to reach.
 *
 * Deliberately unlike `crosspostCampaign` in every way that matters:
 *
 *   - **no outbound gate.** `BLACKOUT_COALITION_CROSSPOST_ENABLED` exists to
 *     hold back *automation posting under a coalition's credentials*. A share
 *     link carries no credential and posts nothing; it hands a person a URL
 *     their own click completes.
 *   - **no connection row, no opt-in, no `campaigns.promote`.** Requiring a
 *     steward to pre-register a platform before anyone could share meant a
 *     griot — the role that exists for promotion — could not share at all.
 *   - **no membership.** A campaign visible to a logged-out visitor is a
 *     campaign they can pass on. That is the growth surface.
 *
 * It writes nothing. A minted link is not a share; recording one would count
 * intent, not action, and would be farmable by anyone who can open a menu.
 */
export function shareCampaign(
    idOrSlug: string,
    campaignId: string,
    viewerId?: string,
    instanceHost?: string
): SyncResult<CampaignShareView> {
    const coalition = getCoalition(idOrSlug);
    if (!coalition) return fail({ kind: 'not_found' });
    // A stopped coalition stops promoting itself, whether the founder archived
    // it or a moderator took it down.
    if (isStopped(coalition)) return fail({ kind: 'not_found' });
    const found = getCampaign(coalition.id, campaignId, viewerId);
    if (!found.ok) return fail({ kind: 'not_found' });
    const campaign = found.value;
    if (campaign.status !== 'active' && campaign.status !== 'completed') {
        return fail({ kind: 'campaign_inactive' });
    }
    if (!campaignIsPubliclyShareable(campaign)) return fail({ kind: 'private_subject' });

    const post = composePost(coalition, campaign);
    const targets: ShareTargetView[] = COALITION_SHARE_TARGETS.map((target) => {
        const spec = COALITION_SHARE_TARGET_SPECS[target];
        // Each target gets its own link, so a coalition can tell a click from
        // Mastodon from a click from a group chat. The token names the
        // campaign, the channel and the sharer — never the person who clicks.
        const attributed = withAttribution(post.url, {
            campaignId: campaign.id,
            channel: isCoalitionPlatform(target) ? target : 'copy',
            ...(viewerId ? { sharerUserId: viewerId } : {}),
        });
        const href =
            buildShareHref(
                target,
                { ...post, url: attributed, text: post.text.replace(post.url, attributed) },
                instanceHost
            ) ?? undefined;
        return {
            target,
            label: spec.label,
            ...(href ? { href } : {}),
            ...(spec.needsInstanceHost && !href ? { needsInstanceHost: true } : {}),
        };
    });
    return succeed({
        campaignId: campaign.id,
        coalitionSlug: coalition.slug,
        url: post.url,
        text: post.text,
        title: post.title,
        targets,
    });
}
