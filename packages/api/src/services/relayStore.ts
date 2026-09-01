/**
 * Relay writes and subject resolution — the machinery behind the Circle/Reach
 * feed.
 *
 * A relay is one person vouching for one thing to their own Circle. The product
 * calls the action "Boost"; the code calls it a relay because `co.bmc.boost` is
 * already the fundraiser state event and `communityBoosts` is the paid-pledge
 * flow.
 *
 * Nothing here ranks. A relay either exists and carries an item to a Circle, or
 * it does not; there is no score, no decay, and no injection.
 */
import { randomUUID } from 'node:crypto';
import { MAX_RELAY_CHAIN_DEPTH, nextChainDepth, type RelayLink } from '@blackout/core';
import { db } from '../db/store';
import type { RelayEdgeRecord, RelaySubjectSource } from '../db/types';
import { findWallPost, getProfile } from './profileStore';

export type RelayFailure =
    | { kind: 'unknown_subject' }
    | { kind: 'unknown_parent' }
    | { kind: 'parent_subject_mismatch' }
    | { kind: 'chain_too_deep' }
    | { kind: 'not_owner' }
    | { kind: 'not_found' };

export type RelayResult<T> = { ok: true; value: T } | { ok: false; error: RelayFailure };

/**
 * A resolved subject, flattened to what a feed card needs. `null` from
 * `resolveSubject` means the underlying object could not be loaded — a deleted
 * post, or a marketplace listing whose cache is cold.
 */
export interface RelaySubjectCard {
    source: RelaySubjectSource;
    id: string;
    title: string;
    body: string | null;
    authorId: string | null;
    createdAt: string | null;
    mediaUrl: string | null;
    tags: string[];
}

/**
 * Turn a `(source, id)` pair into a renderable card.
 *
 * Every source here is resolvable server-side, which is exactly why encrypted
 * den content is not a relay subject: the server cannot resolve a room event for
 * a viewer outside the room and does not try.
 */
export function resolveSubject(
    source: RelaySubjectSource,
    subjectId: string
): RelaySubjectCard | null {
    switch (source) {
        case 'coalition_feed': {
            const item = db.getCoalitionFeedItem(subjectId);
            if (!item) return null;
            return {
                source,
                id: item.id,
                title: item.title,
                body: item.body ?? null,
                authorId: item.authorId ?? null,
                createdAt: item.createdAt,
                mediaUrl: item.mediaUrl ?? null,
                tags: item.tags ?? [],
            };
        }
        case 'coliseum_topic': {
            const topic = db.getColiseumTopic(subjectId);
            if (!topic) return null;
            return {
                source,
                id: topic.id,
                title: topic.title,
                body: null,
                // Topics carry no author, so a coliseum item can only ever reach
                // someone through a relay — never as a Circle-authored post.
                authorId: null,
                createdAt: topic.createdAt,
                mediaUrl: null,
                tags: topic.tags ?? [],
            };
        }
        case 'wall_post': {
            const post = findWallPost(subjectId);
            if (!post) return null;
            return {
                source,
                id: post.id,
                title: `Wall post by ${post.authorId}`,
                body: post.body,
                authorId: post.authorId,
                createdAt: post.createdAt,
                mediaUrl: null,
                tags: [],
            };
        }
        case 'status': {
            // A status is addressed by whose it is — one live status per person.
            const profile = getProfile(subjectId);
            const status = profile?.profile.status;
            if (!profile || !status) return null;
            return {
                source,
                id: subjectId,
                title: profile.displayName,
                body: status.text,
                authorId: subjectId,
                createdAt: null,
                mediaUrl: null,
                tags: [],
            };
        }
        case 'stream': {
            const stream = db.getStream(subjectId);
            if (!stream) return null;
            return {
                source,
                id: stream.id,
                title: stream.title,
                body: null,
                authorId: stream.creatorId,
                createdAt: null,
                mediaUrl: null,
                tags: stream.tags ?? [],
            };
        }
        case 'marketplace': {
            // Listings live in a per-query cache rather than a per-listing table,
            // so a relayed listing resolves only while some cached page still
            // holds it. An unresolved subject is reported honestly rather than
            // dropped — the relay chain is real either way.
            for (const entry of db.marketplaceListingsCache.values()) {
                for (const raw of entry.listings) {
                    const listing = raw as {
                        providerListingId?: string;
                        title?: string;
                        mediaUrls?: string[];
                        tags?: string[];
                    };
                    if (listing?.providerListingId !== subjectId) continue;
                    return {
                        source,
                        id: subjectId,
                        title: listing.title ?? 'Listing',
                        body: null,
                        authorId: null,
                        createdAt: null,
                        mediaUrl: listing.mediaUrls?.[0] ?? null,
                        tags: listing.tags ?? [],
                    };
                }
            }
            return null;
        }
    }
}

export interface RelayInput {
    relayerUserId: string;
    subjectSource: RelaySubjectSource;
    subjectId: string;
    /** The edge the relayer saw it through; omitted when relaying from the origin. */
    viaRelayId?: string | null;
    note?: string | null;
}

/**
 * Record a relay.
 *
 * Idempotent per `(relayer, subject)`: relaying something you already relayed
 * reactivates your existing edge rather than minting a second one, so nobody
 * appears twice in a chain. A re-relay keeps the parent it was first minted
 * with — re-parenting would rewrite a path other people have already seen.
 */
export function relaySubject(input: RelayInput): RelayResult<RelayEdgeRecord> {
    const subject = resolveSubject(input.subjectSource, input.subjectId);
    if (!subject) return { ok: false, error: { kind: 'unknown_subject' } };

    let parent: RelayEdgeRecord | null = null;
    if (input.viaRelayId) {
        parent = db.getRelayEdge(input.viaRelayId) ?? null;
        if (!parent) return { ok: false, error: { kind: 'unknown_parent' } };
        // A parent from a different subject would fabricate provenance.
        if (parent.subjectSource !== input.subjectSource || parent.subjectId !== input.subjectId) {
            return { ok: false, error: { kind: 'parent_subject_mismatch' } };
        }
    }

    const { depth, withinLimit } = nextChainDepth(parent as RelayLink | null);
    if (!withinLimit) return { ok: false, error: { kind: 'chain_too_deep' } };

    const id = randomUUID();
    const record = db.upsertRelayEdge({
        id,
        relayerUserId: input.relayerUserId,
        subjectSource: input.subjectSource,
        subjectId: input.subjectId,
        parentRelayId: parent?.id ?? null,
        rootRelayId: parent?.rootRelayId ?? id,
        chainDepth: depth,
        originAuthorId: subject.authorId,
        note: input.note?.trim() ? input.note.trim().slice(0, 280) : null,
        active: true,
    });
    return { ok: true, value: record };
}

/**
 * Withdraw a relay. The row is kept and `active` flipped, so downstream relays
 * keep their parent pointer and the chain they show stays truthful.
 *
 * Visibility is recomputed from active edges on every read, so this alone drops
 * the item for anyone who reached it only through this relayer — while a
 * downstream relayer's own edge, still active, keeps it alive for theirs.
 */
export function withdrawRelay(relayId: string, userId: string): RelayResult<RelayEdgeRecord> {
    const existing = db.getRelayEdge(relayId);
    if (!existing) return { ok: false, error: { kind: 'not_found' } };
    if (existing.relayerUserId !== userId) return { ok: false, error: { kind: 'not_owner' } };
    return { ok: true, value: db.upsertRelayEdge({ ...existing, active: false }) };
}

/** Re-relay something you previously withdrew. */
export function reinstateRelay(relayId: string, userId: string): RelayResult<RelayEdgeRecord> {
    const existing = db.getRelayEdge(relayId);
    if (!existing) return { ok: false, error: { kind: 'not_found' } };
    if (existing.relayerUserId !== userId) return { ok: false, error: { kind: 'not_owner' } };
    return { ok: true, value: db.upsertRelayEdge({ ...existing, active: true }) };
}

export { MAX_RELAY_CHAIN_DEPTH };
