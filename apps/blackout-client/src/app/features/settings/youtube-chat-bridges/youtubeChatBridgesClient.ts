import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';

/**
 * Frontend wrappers for /v1/integrations/youtube/chat-bridges. Mirrors
 * packages/api/src/routes/youtubeChatBridges.ts — keep the shapes in sync
 * when the server contract moves.
 */

export interface YoutubeChatBridgeRecord {
    id: string;
    blackoutUserId: string;
    youtubeChannelId: string;
    matrixRoomId: string;
    isActive: boolean;
    lastStoppedAt?: string;
    lastStoppedReason?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ListBridgesResponse {
    bridges: YoutubeChatBridgeRecord[];
}

export interface CreateBridgeBody {
    youtubeChannelId: string;
    matrixRoomId: string;
}

export interface CreateBridgeResponse {
    bridge: YoutubeChatBridgeRecord;
}

export interface SyncBridgeResponse {
    ok: true;
    messages: number;
    delivered: number;
    pollingIntervalMillis?: number;
}

export interface ApiCallOptions {
    token?: string | null;
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const BASE = '/v1/integrations/youtube/chat-bridges';

export const listBridges = (options?: ApiCallOptions): Promise<ListBridgesResponse> =>
    client(options)({ method: 'GET', path: BASE }) as Promise<ListBridgesResponse>;

export const createBridge = (
    body: CreateBridgeBody,
    options?: ApiCallOptions,
): Promise<CreateBridgeResponse> =>
    client(options)({ method: 'POST', path: BASE, body }) as Promise<CreateBridgeResponse>;

export const deleteBridge = (
    bridgeId: string,
    options?: ApiCallOptions,
): Promise<{ ok: true }> =>
    client(options)({
        method: 'DELETE',
        path: `${BASE}/${encodeURIComponent(bridgeId)}`,
    }) as Promise<{ ok: true }>;

export const syncBridge = (
    bridgeId: string,
    options?: ApiCallOptions,
): Promise<SyncBridgeResponse> =>
    client(options)({
        method: 'POST',
        path: `${BASE}/${encodeURIComponent(bridgeId)}/sync`,
    }) as Promise<SyncBridgeResponse>;

export interface SayBody {
    body: string;
}

export interface SayResponse {
    ok: true;
    messageId: string;
}

export const sayInBridge = (
    bridgeId: string,
    body: SayBody,
    options?: ApiCallOptions,
): Promise<SayResponse> =>
    client(options)({
        method: 'POST',
        path: `${BASE}/${encodeURIComponent(bridgeId)}/say`,
        body,
    }) as Promise<SayResponse>;

// ----------------------------- input validators -----------------------------

/**
 * YouTube channel ids are `UC` + 22 base64url chars. The server is
 * authoritative; this is the same regex it uses, lifted to the client
 * for instant feedback.
 */
export const isValidYoutubeChannelId = (raw: string): boolean =>
    /^UC[A-Za-z0-9_-]{20,40}$/.test(raw.trim());

export const isValidMatrixRoomId = (raw: string): boolean =>
    /^[!#][^:\s]+:[^:\s]+$/.test(raw.trim());
