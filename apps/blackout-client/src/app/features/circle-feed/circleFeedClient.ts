/**
 * API client for the Circle & Reach feed.
 *
 * The server owns assembly (the Circle graph and every relay edge live there),
 * so this is a thin transport: it does not sort, rank, filter or merge. What
 * comes back is what the viewer sees, in the order the server sent it.
 */
import { deleteJson, getJson, postJson } from '../../sdk/json';
import type { RelaySubjectSource } from '@blackout/protocol';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const FEED_BASE = '/v1/feed';
const CIRCLE_BASE = '/v1/circle';

/** One hop in a visible `[You] → [X] → [Y]` path. */
export interface RelayHopView {
    relayId: string;
    userId: string;
    note: string | null;
    /** False once this relayer withdrew. Shown anyway, marked. */
    active: boolean;
    at: string;
}

export interface RelayPathView {
    /** Nearest relayer first, original relayer last. */
    hops: RelayHopView[];
    originAuthorId: string | null;
    length: number;
}

export interface RelaySubjectView {
    source: RelaySubjectSource;
    id: string;
    title: string;
    body: string | null;
    authorId: string | null;
    createdAt: string | null;
    mediaUrl: string | null;
    tags: string[];
}

export interface CircleFeedItem {
    /** `${source}:${subjectId}` — stable across sources. */
    key: string;
    ring: 'circle' | 'reach';
    at: string;
    /** Null when the underlying post could not be loaded; the chain still stands. */
    subject: RelaySubjectView | null;
    /** Null for a Circle-authored post — nobody relayed it, you follow them. */
    path: RelayPathView | null;
    /** Others who also carried this, beyond the displayed path. */
    alsoRelayedBy: string[];
}

export interface CircleFeedResponse {
    generatedAt: string;
    /** Surfaced so an empty feed can explain itself instead of looking broken. */
    circleSize: number;
    items: CircleFeedItem[];
}

export function fetchCircleFeed(
    options: { limit?: number; ring?: 'circle' | 'reach' } = {},
    token: string | null = readBlackoutApiToken()
): Promise<CircleFeedResponse> {
    const search = new URLSearchParams();
    if (options.limit !== undefined) search.set('limit', String(options.limit));
    if (options.ring) search.set('ring', options.ring);
    const qs = search.toString();
    return getJson<CircleFeedResponse>(`${FEED_BASE}${qs ? `?${qs}` : ''}`, token);
}

export interface RelayRecordView {
    id: string;
    relayerUserId: string;
    subjectSource: RelaySubjectSource;
    subjectId: string;
    parentRelayId: string | null;
    rootRelayId: string;
    chainDepth: number;
    note: string | null;
    active: boolean;
    createdAt: string;
}

/**
 * Relay a subject onward to your own Circle.
 *
 * `viaRelayId` is the edge you saw it through, and passing it is what keeps the
 * chain truthful — omit it only when relaying straight from the origin.
 */
export function relayItem(
    input: {
        subjectSource: RelaySubjectSource;
        subjectId: string;
        viaRelayId?: string | null;
        note?: string | null;
    },
    token: string | null = readBlackoutApiToken()
): Promise<{ relay: RelayRecordView }> {
    return postJson<{ relay: RelayRecordView }>(`${FEED_BASE}/relays`, input, token);
}

/** Withdraw your relay. Downstream relayers keep it alive for their own Circles. */
export function withdrawRelay(
    relayId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ relay: RelayRecordView }> {
    return deleteJson<{ relay: RelayRecordView }>(`${FEED_BASE}/relays/${relayId}`, token);
}

export function reinstateRelay(
    relayId: string,
    token: string | null = readBlackoutApiToken()
): Promise<{ relay: RelayRecordView }> {
    return postJson<{ relay: RelayRecordView }>(
        `${FEED_BASE}/relays/${relayId}/reinstate`,
        {},
        token
    );
}

export interface RelayChainResponse {
    path: RelayPathView;
    subject: RelaySubjectView | null;
    /** Everyone who carried this subject, in the order they did. */
    allRelayers: { relayId: string; userId: string; active: boolean; at: string }[];
}

/** The full chain behind one relay — every person, not just the nearest link. */
export function fetchRelayChain(
    relayId: string,
    token: string | null = readBlackoutApiToken()
): Promise<RelayChainResponse> {
    return getJson<RelayChainResponse>(`${FEED_BASE}/relays/${relayId}/chain`, token);
}

export function fetchMyRelays(
    token: string | null = readBlackoutApiToken()
): Promise<{ relays: RelayRecordView[] }> {
    return getJson<{ relays: RelayRecordView[] }>(`${FEED_BASE}/relays/mine`, token);
}

export interface IlluminationView {
    circleSize: number;
    heldByCount: number;
    overlapCount: number;
    relayedCount: number;
    downstreamCount: number;
    litCount: number;
    /** Reported, never hidden — the honest nudge to connect. */
    unlitCount: number;
    networkSize: number;
}

export function fetchIllumination(
    token: string | null = readBlackoutApiToken()
): Promise<IlluminationView> {
    return getJson<IlluminationView>(`${CIRCLE_BASE}/illumination`, token);
}
