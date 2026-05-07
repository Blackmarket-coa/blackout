import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';

/**
 * Frontend wrappers for /v1/integrations/simulcast/destinations. Mirrors
 * packages/api/src/routes/simulcastDestinations.ts; keep shapes in sync.
 *
 * The plaintext stream key is sent to the server ONCE on create. Server
 * encrypts at rest and never returns it; UI never persists it client-side.
 */

export interface SimulcastDestinationSummary {
    id: string;
    provider: string;
    label?: string;
    ingestUrl: string;
    isEnabled: boolean;
    lastUsedAt?: string;
    lastError?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ListResponse {
    destinations: SimulcastDestinationSummary[];
}

export interface CreateBody {
    provider: string;
    label?: string;
    ingestUrl: string;
    streamKey: string;
}

export interface CreateResponse {
    destination: SimulcastDestinationSummary;
}

export interface ApiCallOptions {
    token?: string | null;
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const BASE = '/v1/integrations/simulcast/destinations';

export const listDestinations = (options?: ApiCallOptions): Promise<ListResponse> =>
    client(options)({ method: 'GET', path: BASE }) as Promise<ListResponse>;

export const createDestination = (
    body: CreateBody,
    options?: ApiCallOptions,
): Promise<CreateResponse> =>
    client(options)({ method: 'POST', path: BASE, body }) as Promise<CreateResponse>;

export const setDestinationEnabled = (
    destinationId: string,
    isEnabled: boolean,
    options?: ApiCallOptions,
): Promise<{ destination: SimulcastDestinationSummary }> =>
    client(options)({
        method: 'PUT',
        path: `${BASE}/${encodeURIComponent(destinationId)}/enabled`,
        body: { isEnabled },
    }) as Promise<{ destination: SimulcastDestinationSummary }>;

export const deleteDestination = (
    destinationId: string,
    options?: ApiCallOptions,
): Promise<{ ok: true }> =>
    client(options)({
        method: 'DELETE',
        path: `${BASE}/${encodeURIComponent(destinationId)}`,
    }) as Promise<{ ok: true }>;

// ----------------------------- input validators -----------------------------

export const isValidRtmpUrl = (raw: string): boolean =>
    /^(rtmp|rtmps):\/\/[^\s]+$/i.test(raw.trim());

export const isValidProvider = (raw: string): boolean =>
    /^[a-z][a-z0-9_-]{0,31}$/.test(raw.trim().toLowerCase());

/**
 * Common preset endpoints to make the create form easier. Free-form
 * input is still allowed for arbitrary RTMP servers.
 */
export const PRESETS: ReadonlyArray<{ provider: string; label: string; ingestUrl: string }> = [
    { provider: 'twitch', label: 'Twitch (US)', ingestUrl: 'rtmp://live.twitch.tv/app' },
    { provider: 'youtube', label: 'YouTube Live', ingestUrl: 'rtmp://a.rtmp.youtube.com/live2' },
    { provider: 'kick', label: 'Kick', ingestUrl: 'rtmps://fa723fc1b171.global-contribute.live-video.net/app' },
    { provider: 'trovo', label: 'Trovo', ingestUrl: 'rtmp://livepush.trovo.live/live/' },
];
