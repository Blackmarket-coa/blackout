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
    /**
     * Matrix den (room) the stream is associated with, if any. The
     * LivestreamViewer surfaces a CTA into the den chat when this is
     * set so viewers can talk while watching.
     */
    denId?: string;
    /**
     * Twitch-compat extension panels to render below the player. Populated by
     * the API once an extension registry exists; absent/empty today so the
     * viewer renders no extension surfaces by default.
     */
    extensions?: TwitchExtensionPanel[];
    updatedAt: string;
}

/** A Twitch-extension-compat panel surface attached to a stream. */
export interface TwitchExtensionPanel {
    id: string;
    label: string;
    /** URL the extension bundle JS is fetched from (same-origin or CORS-enabled). */
    bundleUrl: string;
    /** Granted `twitch.ext.*` capabilities for this panel. */
    capabilities: string[];
}

export interface ListStreamsResponse {
    items: StreamSummary[];
}

export interface ClipSummary {
    id: string;
    creatorId: string;
    sourceStreamId?: string;
    title: string;
    mediaPointer: string;
    thumbnailPointer?: string;
    durationSeconds: number;
    visibility: StreamVisibility;
    tags: string[];
    createdAt: string;
    updatedAt: string;
}

export interface ListClipsResponse {
    items: ClipSummary[];
}

export interface CreateClipInput {
    creatorId: string;
    title: string;
    mediaPointer: string;
    sourceStreamId?: string;
    thumbnailPointer?: string;
    durationSeconds?: number;
    visibility?: StreamVisibility;
    tags?: string[];
}

export interface OwncastOriginConfig {
    origin: string;
    rtmpEndpoint?: string;
    [key: string]: unknown;
}

const callJson = <T>(
    method: 'GET' | 'POST',
    path: string,
    token: string | null,
    body?: unknown
): Promise<T> => createAuthorizedApiClient(token)({ method, path, body }) as Promise<T>;

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

export interface ExtensionTokenResponse {
    token: string;
    channelId: string;
    role: 'broadcaster' | 'moderator' | 'viewer';
    opaqueUserId: string;
    userId: string | null;
    expiresAt: string;
}

/**
 * Wraps `GET /v1/integrations/twitch/extensions/token` — mints the EBS JWT the
 * `Twitch.ext` shim hands an extension bundle's `onAuthorized` callback.
 */
export const fetchExtensionToken = (
    streamId: string,
    options: { shareIdentity?: boolean } = {},
    token: string | null = readBlackoutApiToken()
): Promise<ExtensionTokenResponse> => {
    const path = appendQuery('/v1/integrations/twitch/extensions/token', {
        streamId,
        shareIdentity: options.shareIdentity ? 'true' : undefined,
    });
    return callJson<ExtensionTokenResponse>('GET', path, token);
};

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

/** Wraps `GET /v1/streaming/clips` — list public short-form clips, newest first. */
export const listClips = (
    options: { creatorId?: string; limit?: number } = {},
    token: string | null = readBlackoutApiToken()
): Promise<ListClipsResponse> => {
    const path = appendQuery(`${STREAMING_BASE}/clips`, {
        creatorId: options.creatorId,
        limit: options.limit !== undefined ? String(options.limit) : undefined,
    });
    return callJson<ListClipsResponse>('GET', path, token);
};

/** Wraps `GET /v1/streaming/clips/:clipId`. */
export const fetchClip = (
    clipId: string,
    token: string | null = readBlackoutApiToken()
): Promise<ClipSummary> =>
    callJson<ClipSummary>('GET', `${STREAMING_BASE}/clips/${encodeURIComponent(clipId)}`, token);

/** Wraps `POST /v1/streaming/clips` — create a clip (creatorId must be the caller). */
export const createClip = (
    input: CreateClipInput,
    token: string | null = readBlackoutApiToken()
): Promise<ClipSummary> => callJson<ClipSummary>('POST', `${STREAMING_BASE}/clips`, token, input);
