// The Circle & Reach feed.
//
// Every item here is in this viewer's feed because a person put it there:
// someone they follow wrote it (Circle), or someone they follow relayed it
// (Reach). There is no ranking, no interest boost, no per-source cap and no
// injection — the sort key is time and nothing else. If something is not in the
// viewer's Circle or Reach it is simply absent, rather than downweighted.
//
// Assembled server-side because the Circle graph and every relay edge live in
// the API's store; walking chains client-side would mean shipping the whole
// graph to every client. Encrypted den activity is deliberately out of scope —
// a room you joined is not something a person relayed to you.
import { Hono } from 'hono';
import { z } from 'zod';
import {
    buildRelayPath,
    canViewWall,
    mergeFeedEntries,
    ringForItem,
    type FeedEntry,
    type RelayLink,
} from '@blackout/core';
import { RELAY_SUBJECT_SOURCES } from '../db/types';
import type { RelaySubjectSource } from '../db/types';
import { db } from '../db/store';
import { readJsonBody } from '../middleware/validate';
import { requireUser } from '../middleware/require-user';
import { emitDomainEvent } from './domain-events';
import type { FeatureModule } from './types';
import { circlesOverlap, listFollowing } from '../services/follows';
import { getProfileOrDefault, listWallPostsByAuthor } from '../services/profileStore';
import {
    reinstateRelay,
    relaySubject,
    resolveSubject,
    withdrawRelay,
    type RelaySubjectCard,
} from '../services/relayStore';

const DEFAULT_FEED_LIMIT = 50;
const MAX_FEED_LIMIT = 200;

const relaySchema = z.object({
    subjectSource: z.enum(RELAY_SUBJECT_SOURCES),
    subjectId: z.string().min(1).max(255),
    /** The relay you saw it through — what makes the chain honest. */
    viaRelayId: z.string().min(1).max(255).nullish(),
    note: z.string().max(280).nullish(),
});

const feedQuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(MAX_FEED_LIMIT).optional(),
    ring: z.enum(['circle', 'reach']).optional(),
});

/** Map a relay failure onto the API's error vocabulary. */
const relayErrorResponse = (
    kind: string
): { code: string; message: string; status: 400 | 403 | 404 } => {
    switch (kind) {
        case 'unknown_subject':
            return { code: 'not_found', message: 'That post is no longer available', status: 404 };
        case 'unknown_parent':
            return {
                code: 'not_found',
                message: 'The relay you saw it through is gone',
                status: 404,
            };
        case 'parent_subject_mismatch':
            return {
                code: 'invalid_request',
                message: 'That relay carried a different post',
                status: 400,
            };
        case 'chain_too_deep':
            return {
                code: 'invalid_request',
                message: 'This chain has reached its limit',
                status: 400,
            };
        case 'not_owner':
            return {
                code: 'forbidden',
                message: 'You can only withdraw your own relay',
                status: 403,
            };
        default:
            return { code: 'not_found', message: 'Relay not found', status: 404 };
    }
};

/** Everything a Circle member authored, as feed entries. */
/**
 * Whether `viewerId` may read the wall owned by `ownerId`, by the same rule the
 * profile surface uses. `friends` resolves to overlapping circles — the
 * two-sided consent the Circle map also requires.
 */
function viewerCanReadWall(viewerId: string, ownerId: string): boolean {
    if (viewerId === ownerId) return true;
    return canViewWall({
        settings: getProfileOrDefault(ownerId).profile.wall,
        ownerId,
        viewerId,
        viewerConnected: circlesOverlap(viewerId, ownerId),
    });
}

function circleRingEntries(
    viewerId: string,
    circle: readonly string[]
): FeedEntry<RelaySubjectCard>[] {
    const circleSet = new Set(circle);
    const entries: FeedEntry<RelaySubjectCard>[] = [];

    for (const item of db.coalitionFeedItems.values()) {
        if (!item.authorId || !circleSet.has(item.authorId)) continue;
        const subject = resolveSubject('coalition_feed', item.id);
        if (!subject) continue;
        entries.push({
            key: `coalition_feed:${item.id}`,
            ring: ringForItem({ authorId: item.authorId, circle: circleSet }),
            at: item.createdAt,
            subject,
            path: null,
            alsoRelayedBy: [],
        });
    }

    for (const authorId of circleSet) {
        for (const post of listWallPostsByAuthor(authorId)) {
            // A wall post lives on someone else's wall, and that owner's
            // visibility setting governs it — not the author's. Following the
            // author must not hand the viewer a `private` wall's contents.
            if (!viewerCanReadWall(viewerId, post.profileUserId)) continue;
            const subject = resolveSubject('wall_post', post.id);
            if (!subject) continue;
            entries.push({
                key: `wall_post:${post.id}`,
                ring: 'circle',
                at: post.createdAt,
                subject,
                path: null,
                alsoRelayedBy: [],
            });
        }
    }

    return entries;
}

/** Everything an active relay by a Circle member carried inward. */
function reachRingEntries(
    circle: readonly string[],
    circleSet: ReadonlySet<string>
): FeedEntry<RelaySubjectCard>[] {
    const delivered = db.listRelayEdgesByRelayers(circle);
    if (delivered.length === 0) return [];

    // Chains climb through relayers who are *not* in the viewer's Circle — that
    // is exactly what Reach means — so the walk needs every edge, not just the
    // delivering ones.
    const edgesById = new Map<string, RelayLink>();
    for (const edge of db.relayEdges.values()) edgesById.set(edge.id, edge as RelayLink);

    return delivered.map((edge) => {
        const subject = resolveSubject(edge.subjectSource, edge.subjectId);
        return {
            key: `${edge.subjectSource}:${edge.subjectId}`,
            ring: ringForItem({ authorId: subject?.authorId ?? null, circle: circleSet }),
            // A relayed item enters *this* feed when it was relayed, not when it
            // was written — that is the moment a person chose to carry it here.
            at: edge.createdAt,
            subject,
            path: buildRelayPath(edge as RelayLink, edgesById),
            alsoRelayedBy: [],
        };
    });
}

function createFeedRouter() {
    const feed = new Hono();

    feed.get('/', (c) => {
        const user = requireUser(c, 'Sign in to see your feed');
        if (user instanceof Response) return user;

        const parsed = feedQuerySchema.safeParse(c.req.query());
        if (!parsed.success) {
            return c.json(
                {
                    code: 'invalid_request',
                    message: 'Invalid feed query',
                    details: { issues: parsed.error.issues.map((i) => i.message) },
                },
                400
            );
        }
        const limit = parsed.data.limit ?? DEFAULT_FEED_LIMIT;

        const circle = listFollowing(user.sub).map((e) => e.followeeId);
        const circleSet = new Set(circle);

        const entries = [
            ...circleRingEntries(user.sub, circle),
            ...reachRingEntries(circle, circleSet),
        ];
        // Filter *before* the limit slice. Filtering after it meant a page whose
        // newest `limit` entries happened to be all Reach returned nothing for
        // ?ring=circle, and the client then said nobody in your Circle had
        // posted — which was simply false.
        const ring = parsed.data.ring;
        const scoped = ring ? entries.filter((entry) => entry.ring === ring) : entries;
        const items = mergeFeedEntries(scoped, limit);

        return c.json({
            generatedAt: new Date().toISOString(),
            // An empty feed for a new account is the honest answer, not a bug:
            // nothing is here because nobody they follow has posted or relayed
            // yet. Discover is the on-ramp.
            circleSize: circle.length,
            items,
        });
    });

    feed.post('/relays', async (c) => {
        const user = requireUser(c, 'Sign in to relay');
        if (user instanceof Response) return user;

        const parsed = await readJsonBody(c, relaySchema);
        if (parsed instanceof Response) return parsed;

        const outcome = relaySubject({
            relayerUserId: user.sub,
            subjectSource: parsed.subjectSource as RelaySubjectSource,
            subjectId: parsed.subjectId,
            viaRelayId: parsed.viaRelayId ?? null,
            note: parsed.note ?? null,
        });
        if (!outcome.ok) {
            const { code, message, status } = relayErrorResponse(outcome.error.kind);
            return c.json({ code, message }, status);
        }

        const event = emitDomainEvent({
            module: 'feed',
            type: 'feed.relay.created',
            payload: {
                relayId: outcome.value.id,
                relayerUserId: user.sub,
                subjectSource: outcome.value.subjectSource,
                subjectId: outcome.value.subjectId,
                chainDepth: outcome.value.chainDepth,
            },
        });
        return c.json({ relay: outcome.value, event }, 201);
    });

    feed.delete('/relays/:relayId', (c) => {
        const user = requireUser(c, 'Sign in to withdraw a relay');
        if (user instanceof Response) return user;

        const outcome = withdrawRelay(c.req.param('relayId'), user.sub);
        if (!outcome.ok) {
            const { code, message, status } = relayErrorResponse(outcome.error.kind);
            return c.json({ code, message }, status);
        }

        const event = emitDomainEvent({
            module: 'feed',
            type: 'feed.relay.withdrawn',
            payload: { relayId: outcome.value.id, relayerUserId: user.sub },
        });
        return c.json({ relay: outcome.value, event });
    });

    feed.post('/relays/:relayId/reinstate', (c) => {
        const user = requireUser(c, 'Sign in to relay');
        if (user instanceof Response) return user;

        const outcome = reinstateRelay(c.req.param('relayId'), user.sub);
        if (!outcome.ok) {
            const { code, message, status } = relayErrorResponse(outcome.error.kind);
            return c.json({ code, message }, status);
        }
        return c.json({ relay: outcome.value });
    });

    /**
     * The full chain behind one relay — every person in it, not just the nearest
     * link. Withdrawn hops are included and flagged: a chain with a hole in it
     * would misrepresent how the item travelled.
     */
    feed.get('/relays/:relayId/chain', (c) => {
        const user = requireUser(c, 'Sign in to see a relay chain');
        if (user instanceof Response) return user;

        const edge = db.getRelayEdge(c.req.param('relayId'));
        if (!edge) return c.json({ code: 'not_found', message: 'Relay not found' }, 404);

        const edgesById = new Map<string, RelayLink>();
        for (const row of db.relayEdges.values()) edgesById.set(row.id, row as RelayLink);

        return c.json({
            path: buildRelayPath(edge as RelayLink, edgesById),
            subject: resolveSubject(edge.subjectSource, edge.subjectId),
            // Everyone who carried this, in the order they did.
            allRelayers: db
                .listRelayEdgesForSubject(edge.subjectSource, edge.subjectId)
                .map((row) => ({
                    relayId: row.id,
                    userId: row.relayerUserId,
                    active: row.active,
                    at: row.createdAt,
                })),
        });
    });

    /** This viewer's own relays, so a profile can pin the chains they started. */
    feed.get('/relays/mine', (c) => {
        const user = requireUser(c, 'Sign in to see your relays');
        if (user instanceof Response) return user;
        return c.json({
            relays: db.listRelayEdgesByRelayers([user.sub]),
        });
    });

    return feed;
}

export const feedModule: FeatureModule = {
    id: 'feed',
    mountPath: '/feed',
    registerRoutes: createFeedRouter,
};
