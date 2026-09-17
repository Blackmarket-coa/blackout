/**
 * Where a visitor came from, and nothing about who they are.
 *
 * The posted campaign URL carried no attribution at all: one identical link for
 * every sharer on every platform, so nothing could tell a click from X from a
 * click from a mailing list, and a coalition could not see whether any of its
 * posting worked. This adds a short signed token to the link.
 *
 * **What the token identifies.** The campaign, the channel it went out on, and
 * — when a person shared it — which member. That is all. It says nothing about
 * the visitor, because it is minted before any visitor exists: one token per
 * share, handed to everyone who sees that post.
 *
 * **What is deliberately not here.** No cookie, no IP, no IP hash, no user
 * agent, no fingerprint, no third-party anything. The client holds the token in
 * `sessionStorage` and sends it back only if the visitor goes on to act — the
 * same shape the invite flow already uses. A visitor who reads the page and
 * leaves is a `+1` on a counter and has left nothing behind.
 *
 * **Signed, because the return leg mints things.** Attribution eventually
 * decides which coalition is credited with a member, and a forgeable string in
 * a URL is a self-referral farm. The signature is over the fields, keyed to the
 * server, and the token carries its own expiry.
 *
 * **What a founder sees.** Counts, never a list. TRUST.md §2 is explicit that
 * inbound connections are counted and not listed — "handing you a list of
 * everyone who follows you would export their associations under the banner of
 * your portability" — and a dashboard naming which member's share produced
 * which signup is exactly that list. So the API serves totals.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
    isCoalitionPlatform,
    type AttributionConversion,
    type CoalitionPlatform,
} from '@blackout/core';
import { db } from '../db/store';

/** How a share went out. Wider than `CoalitionPlatform`: a link can be copied. */
export type AttributionChannel = CoalitionPlatform | 'copy' | 'auto' | 'embed';

export interface AttributionClaim {
    campaignId: string;
    channel: AttributionChannel;
    /** The member who shared, when a person did. Absent for automated posts. */
    sharerUserId?: string;
    /** Seconds since the epoch. */
    issuedAt: number;
}

/** Tokens stop being honoured after this. A share is news for a while, not forever. */
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

const b64url = (input: Buffer | string): string => Buffer.from(input).toString('base64url');

/**
 * The signing key.
 *
 * Falls back to the JWT secret because attribution is worth exactly as much as
 * the session signing it protects, and a separate key that operators must
 * remember to set would be absent on most deployments — which is how an
 * unsigned token ends up shipping. Returns null only when neither exists, in
 * which case no token is minted and the link goes out bare rather than
 * forgeable.
 */
function signingKey(env = process.env): string | null {
    return env.BLACKOUT_ATTRIBUTION_SECRET || env.JWT_SECRET_PRIMARY || null;
}

function sign(payload: string, key: string): string {
    return createHmac('sha256', key).update(payload).digest('base64url');
}

/**
 * Mint a `ref` value for a share.
 *
 * Returns null when there is no key, and the caller emits a link with no `ref`.
 * A missing attribution parameter costs a statistic; a forgeable one costs
 * money, because the settlement path downstream can mint a referral bonus.
 */
export function mintAttributionRef(
    claim: Omit<AttributionClaim, 'issuedAt'>,
    now = Date.now(),
    env = process.env
): string | null {
    const key = signingKey(env);
    if (!key) return null;
    const payload = b64url(
        JSON.stringify({
            c: claim.campaignId,
            h: claim.channel,
            ...(claim.sharerUserId ? { s: claim.sharerUserId } : {}),
            t: Math.floor(now / 1000),
        })
    );
    return `${payload}.${sign(payload, key)}`;
}

/**
 * Read a `ref` back, or null if it is forged, expired, or malformed.
 *
 * Every failure is the same `null`: a caller must not be able to tell a bad
 * signature from an expired one, and there is nothing useful to do differently
 * anyway — an unreadable ref is simply a visit with no known source.
 */
export function readAttributionRef(
    ref: string,
    now = Date.now(),
    env = process.env
): AttributionClaim | null {
    const key = signingKey(env);
    if (!key || typeof ref !== 'string') return null;
    const dot = ref.indexOf('.');
    if (dot <= 0) return null;
    const payload = ref.slice(0, dot);
    const presented = ref.slice(dot + 1);
    const expected = sign(payload, key);
    if (presented.length !== expected.length) return null;
    try {
        if (!timingSafeEqual(Buffer.from(presented), Buffer.from(expected))) return null;
    } catch {
        return null;
    }

    let parsed: { c?: unknown; h?: unknown; s?: unknown; t?: unknown };
    try {
        parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
    if (typeof parsed.c !== 'string' || typeof parsed.h !== 'string') return null;
    if (typeof parsed.t !== 'number' || !Number.isFinite(parsed.t)) return null;
    if (Math.floor(now / 1000) - parsed.t > MAX_AGE_SECONDS) return null;

    return {
        campaignId: parsed.c,
        channel: parsed.h as AttributionChannel,
        ...(typeof parsed.s === 'string' ? { sharerUserId: parsed.s } : {}),
        issuedAt: parsed.t,
    };
}

/** Append a minted `ref` to a share URL, or hand back the URL unchanged. */
export function withAttribution(
    url: string,
    claim: Omit<AttributionClaim, 'issuedAt'>,
    now = Date.now(),
    env = process.env
): string {
    const ref = mintAttributionRef(claim, now, env);
    if (!ref) return url;
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}ref=${encodeURIComponent(ref)}`;
}

// ---------------------------------------------------------------------------
// Recording what a share produced
// ---------------------------------------------------------------------------

/**
 * Count one thing a visitor did against the share that brought them.
 *
 * Every failure is silent and total: a bad ref, a campaign that has since been
 * archived, a coalition that was taken down. Attribution is a statistic, and a
 * statistic must never be able to fail the action it is describing — nobody's
 * signup gets rejected because a counter could not be written.
 */
export function recordAttributedAction(
    ref: string | undefined,
    conversion: AttributionConversion,
    now = Date.now()
): void {
    if (!ref) return;
    try {
        const claim = readAttributionRef(ref, now);
        if (!claim) return;
        const campaign = db.getCoalitionCampaign(claim.campaignId);
        if (!campaign) return;

        const existing = db
            .listCampaignAttribution({ campaignId: campaign.id })
            .find(
                (row) =>
                    row.channel === claim.channel &&
                    (row.sharerUserId ?? '') === (claim.sharerUserId ?? '')
            );

        const base = existing ?? {
            campaignId: campaign.id,
            coalitionId: campaign.coalitionId,
            channel: claim.channel,
            ...(claim.sharerUserId ? { sharerUserId: claim.sharerUserId } : {}),
            visits: 0,
            signups: 0,
            joins: 0,
            contributions: 0,
        };

        db.upsertCampaignAttribution({
            ...base,
            visits: base.visits + (conversion === 'visit' ? 1 : 0),
            signups: base.signups + (conversion === 'signup' ? 1 : 0),
            joins: base.joins + (conversion === 'join' ? 1 : 0),
            contributions: base.contributions + (conversion === 'contribution' ? 1 : 0),
        });

        // A visit is also a click on the post that carried it, which is the one
        // number a platform read cannot see. Only for real platform channels:
        // a copied link or an embed has no post behind it.
        if (conversion === 'visit' && isCoalitionPlatform(claim.channel)) {
            const post = db
                .listCoalitionCampaignPosts({ campaignId: campaign.id })
                .find((row) => row.direction === 'out' && row.platform === claim.channel);
            if (post) {
                const engagement = db.getCampaignEngagement(post.id);
                db.upsertCampaignEngagement({
                    id: post.id,
                    campaignPostId: post.id,
                    campaignId: campaign.id,
                    coalitionId: campaign.coalitionId,
                    platform: claim.channel,
                    likes: engagement?.likes ?? 0,
                    reshares: engagement?.reshares ?? 0,
                    replies: engagement?.replies ?? 0,
                    clicks: (engagement?.clicks ?? 0) + 1,
                    lastReadAt: engagement?.lastReadAt ?? new Date(now).toISOString(),
                });
            }
        }
    } catch {
        // See above: never fails the caller.
    }
}

/** Totals for a campaign, per channel. Counts only — never a list of people. */
export function campaignAttributionTotals(campaignId: string): {
    totals: { visits: number; signups: number; joins: number; contributions: number };
    byChannel: Array<{
        channel: string;
        visits: number;
        signups: number;
        joins: number;
        contributions: number;
    }>;
} {
    const rows = db.listCampaignAttribution({ campaignId });
    const byChannel = new Map<
        string,
        { channel: string; visits: number; signups: number; joins: number; contributions: number }
    >();
    for (const row of rows) {
        const acc = byChannel.get(row.channel) ?? {
            channel: row.channel,
            visits: 0,
            signups: 0,
            joins: 0,
            contributions: 0,
        };
        acc.visits += row.visits;
        acc.signups += row.signups;
        acc.joins += row.joins;
        acc.contributions += row.contributions;
        byChannel.set(row.channel, acc);
    }
    const list = [...byChannel.values()];
    return {
        totals: list.reduce(
            (acc, row) => ({
                visits: acc.visits + row.visits,
                signups: acc.signups + row.signups,
                joins: acc.joins + row.joins,
                contributions: acc.contributions + row.contributions,
            }),
            { visits: 0, signups: 0, joins: 0, contributions: 0 }
        ),
        byChannel: list,
    };
}
