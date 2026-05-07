import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';

/**
 * Frontend wrappers around the /v1/integrations/twitch/chat-bridges API.
 * The shapes here mirror the server response bodies — keep them in sync
 * with packages/api/src/routes/twitchChatBridges.ts when it changes.
 */

export interface TwitchChatBridgeRecord {
    id: string;
    blackoutUserId: string;
    twitchChannel: string;
    matrixRoomId: string;
    isActive: boolean;
    lastStoppedAt?: string;
    lastStoppedReason?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ListBridgesResponse {
    bridges: TwitchChatBridgeRecord[];
}

export interface CreateBridgeBody {
    twitchChannel: string;
    matrixRoomId: string;
}

export interface CreateBridgeResponse {
    bridge: TwitchChatBridgeRecord;
}

export interface ApiCallOptions {
    /** Override the auth token (defaults to localStorage lookup). */
    token?: string | null;
    /** Override the API client for tests. */
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const BASE = '/v1/integrations/twitch/chat-bridges';

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

export interface SayBody {
    body: string;
}

export const sayInBridge = (
    bridgeId: string,
    body: SayBody,
    options?: ApiCallOptions,
): Promise<{ ok: true }> =>
    client(options)({
        method: 'POST',
        path: `${BASE}/${encodeURIComponent(bridgeId)}/say`,
        body,
    }) as Promise<{ ok: true }>;

// ----------------------------- input validators -----------------------------

/**
 * Twitch channel logins are 1-25 characters of [A-Za-z0-9_]. We validate
 * client-side so the user gets immediate feedback; the server enforces the
 * same rule and is the source of truth.
 */
export const isValidTwitchChannelLogin = (raw: string): boolean =>
    /^[a-zA-Z0-9_]{1,25}$/.test(raw.trim());

/**
 * Matrix room ids look like `!opaque:server.tld`; aliases look like
 * `#alias:server.tld`. The API accepts both shapes — server validates
 * authoritatively.
 */
export const isValidMatrixRoomId = (raw: string): boolean =>
    /^[!#][^:\s]+:[^:\s]+$/.test(raw.trim());
