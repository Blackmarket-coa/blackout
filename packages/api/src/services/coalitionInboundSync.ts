/**
 * Reading back what a coalition's posts actually got.
 *
 * `ingestExternalActivity` has existed, and been tested, and had no production
 * caller at all — no webhook, no poller, no subscriber. The moderation queue,
 * the approve/reject routes and the public thread were wired to something
 * nothing could fill. This is the half that fills it.
 *
 * **Why a poller and not webhooks.** None of the three platforms we can post to
 * will push replies to us. Mastodon has no outbound webhooks; Bluesky has none;
 * a Discord incoming webhook is write-only by design and cannot read its own
 * channel without a bot account and a developer agreement. Polling the posts we
 * made is the only mechanism that actually exists, so it is the one built —
 * rather than a webhook receiver that would sit empty looking finished.
 *
 * **The numbers/words split.** Every read returns two different kinds of thing
 * and they are treated differently on purpose:
 *
 *   - **Counts** (likes, reshares, replies) are signal. Nobody wrote them, they
 *     name nobody, they cannot carry abuse. They land in
 *     `coalition_campaign_engagement` immediately and unmoderated, so a
 *     coalition can watch its own reach without a steward in the loop.
 *   - **Replies** are words a stranger wrote. They go through
 *     `ingestExternalActivity`, which quarantines them unless the coalition has
 *     chosen otherwise for its own mission.
 *
 * **What it will not do.** Only posts this server made are read, and only for
 * coalitions that are still running. There is no search, no firehose, and no
 * reading of anything the coalition did not itself publish.
 */
import { type CoalitionPlatform } from '@blackout/core';
import { db } from '../db/store';
import type { CoalitionCampaignPostRecord } from '../db/types';
import { log } from '../telemetry/logger';
import { isStopped } from './coalitionNetworkStore';
import { ingestExternalActivity, inboundSyncEnabled } from './coalitionSync';
import { memberCredentialAad, sharedCredentialAad } from './coalitionPlatformAdapters';
import { decryptSecret } from './secretBox';

const TIMEOUT_MS = 8_000;

/** How far back to keep re-reading a post. */
const READ_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

/** Replies taken from any single read. A busy post does not get to flood. */
const REPLIES_PER_READ = 50;

export interface EngagementReading {
    likes: number;
    reshares: number;
    replies: number;
    /** Newest first; the caller ingests them as words, separately. */
    recentReplies: Array<{ externalId: string; author: string; content: string; at?: string }>;
}

type FetchImpl = typeof fetch;
let fetchImpl: FetchImpl | undefined;

/** Test seam: swap the transport without standing up two real services. */
export function __setInboundFetchForTests(impl: FetchImpl | undefined): void {
    fetchImpl = impl;
}

async function request(url: string, init: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        return await (fetchImpl ?? fetch)(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

const str = (value: unknown, fallback = ''): string =>
    typeof value === 'string' ? value : fallback;
const num = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

// ---------------------------------------------------------------------------
// Bluesky — the post thread
// ---------------------------------------------------------------------------

async function readBluesky(credential: string, uri: string): Promise<EngagementReading | null> {
    const separator = credential.indexOf('|');
    if (separator < 0) return null;
    const session = await request('https://bsky.social/xrpc/com.atproto.server.createSession', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            identifier: credential.slice(0, separator),
            password: credential.slice(separator + 1),
        }),
    });
    if (!session.ok) return null;
    const auth = (await session.json().catch(() => null)) as { accessJwt?: string } | null;
    if (!auth?.accessJwt) return null;

    const res = await request(
        `https://bsky.social/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(
            uri
        )}&depth=1`,
        { headers: { authorization: `Bearer ${auth.accessJwt}` } }
    );
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as {
        thread?: {
            post?: { likeCount?: unknown; repostCount?: unknown; replyCount?: unknown };
            replies?: Array<{
                post?: {
                    uri?: unknown;
                    author?: { handle?: unknown };
                    record?: { text?: unknown; createdAt?: unknown };
                };
            }>;
        };
    } | null;
    const thread = body?.thread;
    if (!thread?.post) return null;

    return {
        likes: num(thread.post.likeCount),
        reshares: num(thread.post.repostCount),
        replies: num(thread.post.replyCount),
        recentReplies: (thread.replies ?? [])
            .slice(0, REPLIES_PER_READ)
            .map((entry) => ({
                externalId: str(entry.post?.uri),
                author: str(entry.post?.author?.handle, 'unknown'),
                content: str(entry.post?.record?.text),
                at: str(entry.post?.record?.createdAt) || undefined,
            }))
            .filter((reply) => reply.externalId && reply.content),
    };
}

// ---------------------------------------------------------------------------
// Mastodon — the status and its context
// ---------------------------------------------------------------------------

/**
 * Mastodon serves reply bodies as HTML. The moderation queue and the public
 * thread both render text, so the markup is stripped here rather than at every
 * display site — and stripping it means a reply cannot carry markup into a page
 * that trusts approved content.
 */
function stripHtml(html: string): string {
    return (
        html
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n')
            .replace(/<[^>]*>/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            // Last, so a doubly-encoded entity cannot be decoded into a tag.
            .replace(/&amp;/g, '&')
            .trim()
    );
}

async function readMastodon(
    credential: string,
    statusId: string
): Promise<EngagementReading | null> {
    const separator = credential.indexOf('|');
    if (separator < 0) return null;
    const instance = credential.slice(0, separator).replace(/\/+$/, '');
    const token = credential.slice(separator + 1);
    if (!instance.startsWith('https://')) return null;
    const headers = { authorization: `Bearer ${token}` };

    const status = await request(`${instance}/api/v1/statuses/${statusId}`, { headers });
    if (!status.ok) return null;
    const post = (await status.json().catch(() => null)) as {
        favourites_count?: unknown;
        reblogs_count?: unknown;
        replies_count?: unknown;
    } | null;
    if (!post) return null;

    const context = await request(`${instance}/api/v1/statuses/${statusId}/context`, { headers });
    const ctx = context.ok
        ? ((await context.json().catch(() => null)) as {
              descendants?: Array<{
                  id?: unknown;
                  content?: unknown;
                  created_at?: unknown;
                  account?: { acct?: unknown };
              }>;
          } | null)
        : null;

    return {
        likes: num(post.favourites_count),
        reshares: num(post.reblogs_count),
        replies: num(post.replies_count),
        recentReplies: (ctx?.descendants ?? [])
            .slice(0, REPLIES_PER_READ)
            .map((entry) => ({
                externalId: str(entry.id),
                author: str(entry.account?.acct, 'unknown'),
                content: stripHtml(str(entry.content)),
                at: str(entry.created_at) || undefined,
            }))
            .filter((reply) => reply.externalId && reply.content),
    };
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

/** Platforms we can read back from. Discord webhooks are write-only. */
const READABLE: ReadonlySet<CoalitionPlatform> = new Set(['bluesky', 'mastodon']);

function credentialFor(post: CoalitionCampaignPostRecord): string | null {
    const connection = db.getCoalitionConnection(post.coalitionId, post.platform);
    if (!connection?.active) return null;

    if (connection.authMode === 'personal') {
        if (!post.authorUserId) return null;
        const link = db
            .listCoalitionMemberConnections({
                coalitionId: post.coalitionId,
                userId: post.authorUserId,
            })
            .find((row) => row.platform === post.platform && !row.revokedAt && row.credentialRef);
        if (!link?.credentialRef) return null;
        try {
            return decryptSecret(link.credentialRef, {
                aad: memberCredentialAad(post.coalitionId, post.authorUserId, post.platform),
            });
        } catch {
            return null;
        }
    }

    if (!connection.credentialRef) return null;
    try {
        return decryptSecret(connection.credentialRef, {
            aad: sharedCredentialAad(post.coalitionId, post.platform),
        });
    } catch {
        return null;
    }
}

export interface InboundSweepResult {
    read: number;
    ingested: number;
    failed: number;
}

/**
 * Read back every post this server made recently, on every platform we can.
 *
 * Never throws. One unreachable instance must not stop the others being read.
 */
export async function sweepInboundActivity(now = Date.now()): Promise<InboundSweepResult> {
    const result: InboundSweepResult = { read: 0, ingested: 0, failed: 0 };
    if (!inboundSyncEnabled()) return result;

    const cutoff = new Date(now - READ_WINDOW_MS).toISOString();

    for (const coalition of db.listCoalitions()) {
        if (isStopped(coalition)) continue;
        // A coalition set to `off` is still read for counts: a number is not a
        // comment section. Its replies are refused one layer down, by
        // `ingestExternalActivity`, so there is one place that decides.

        for (const campaign of db.listCoalitionCampaigns({ coalitionId: coalition.id })) {
            for (const post of db.listCoalitionCampaignPosts({ campaignId: campaign.id })) {
                if (post.direction !== 'out' || post.syncStatus !== 'posted') continue;
                if (!post.externalPostId || !READABLE.has(post.platform)) continue;
                if (post.createdAt < cutoff) continue;

                const credential = credentialFor(post);
                if (!credential) continue;

                let reading: EngagementReading | null = null;
                try {
                    reading =
                        post.platform === 'bluesky'
                            ? await readBluesky(credential, post.externalPostId)
                            : await readMastodon(credential, post.externalPostId);
                } catch {
                    reading = null;
                }
                if (!reading) {
                    result.failed += 1;
                    continue;
                }
                result.read += 1;

                // Numbers: straight in, no moderation, no author, no content.
                const existing = db.getCampaignEngagement(post.id);
                db.upsertCampaignEngagement({
                    id: post.id,
                    campaignPostId: post.id,
                    campaignId: post.campaignId,
                    coalitionId: post.coalitionId,
                    platform: post.platform,
                    likes: reading.likes,
                    reshares: reading.reshares,
                    replies: reading.replies,
                    // Clicks come from the campaign's own landing page, not from
                    // a platform, so a read must never zero what it cannot see.
                    clicks: existing?.clicks ?? 0,
                    lastReadAt: new Date(now).toISOString(),
                });

                // Words: through the quarantine, one at a time, each one
                // independently refusable.
                for (const reply of reading.recentReplies) {
                    const outcome = ingestExternalActivity({
                        campaignPostId: post.id,
                        sourcePlatform: post.platform,
                        externalAuthor: reply.author,
                        externalId: reply.externalId,
                        content: reply.content,
                        ...(reply.at ? { receivedAt: reply.at } : {}),
                    });
                    if (outcome.ok) result.ingested += 1;
                }
            }
        }
    }

    if (result.read || result.failed) log.info('coalition_inbound_sweep', { ...result });
    return result;
}
