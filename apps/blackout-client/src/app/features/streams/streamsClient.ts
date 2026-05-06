import { createAuthorizedApiClient } from '../../sdk/client';
import { readBlackoutApiToken } from '../monetization/marketplace/useMarketplaceAuth';

const STREAMING_BASE = '/v1/streaming';

export type StreamState = 'live' | 'offline';
export type StreamVisibility = 'public' | 'private' | 'member_only';

export interface StreamSummary {
    id: string;
    creatorId: string;
    state: StreamState;
    title: string;
    category?: string;
    tags: string[];
    visibility: StreamVisibility;
    latencyProfile: 'normal' | 'low';
    replayPointer?: string;
    updatedAt: string;
}

export interface ListStreamsResponse {
    items: StreamSummary[];
}

export interface OwncastOriginConfig {
    origin: string;
    rtmpEndpoint?: string;
    [key: string]: unknown;
}

const callJson = <T>(method: 'GET', path: string, token: string | null): Promise<T> =>
    createAuthorizedApiClient(token)({ method, path }) as Promise<T>;

const appendQuery = (path: string, params: Record<string, string | undefined>): string => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        search.set(key, value);
    }
    const qs = search.toString();
    return qs ? `${path}?${qs}` : path;
};

/**
 * Wraps `GET /v1/streaming/streams` — list public streams. Default
 * sort is live-first then by recency. Capped server-side at 200.
 */
export const listStreams = (
    options: { state?: StreamState; creatorId?: string; limit?: number } = {},
    token: string | null = readBlackoutApiToken()
): Promise<ListStreamsResponse> => {
    const path = appendQuery(`${STREAMING_BASE}/streams`, {
        state: options.state,
        creatorId: options.creatorId,
        limit: options.limit !== undefined ? String(options.limit) : undefined,
    });
    return callJson<ListStreamsResponse>('GET', path, token);
};

/** Wraps `GET /v1/streaming/streams/:streamId`. */
export const fetchStream = (
    streamId: string,
    token: string | null = readBlackoutApiToken()
): Promise<StreamSummary> =>
    callJson<StreamSummary>(
        'GET',
        `${STREAMING_BASE}/streams/${encodeURIComponent(streamId)}`,
        token
    );

/**
 * Wraps `GET /v1/streaming/origin` — Owncast origin config used by the
 * LivestreamViewer to construct the HLS playlist URL.
 */
export const fetchOwncastOrigin = (
    token: string | null = readBlackoutApiToken()
): Promise<OwncastOriginConfig> =>
    callJson<OwncastOriginConfig>('GET', `${STREAMING_BASE}/origin`, token);

/**
 * Owncast HLS playlist URL convention: `<origin>/hls/stream.m3u8`.
 * Owncast itself only serves a single ingest at a time, so we don't
 * vary by streamId — the API may evolve to multiplex per-creator
 * playlists in a follow-up.
 */
export const buildOwncastPlaylistUrl = (origin: string): string => {
    if (!origin) return '';
    const trimmed = origin.replace(/\/+$/, '');
    return `${trimmed}/hls/stream.m3u8`;
};
