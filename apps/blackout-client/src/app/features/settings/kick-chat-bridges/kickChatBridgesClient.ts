import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';

/**
 * Frontend wrappers for /v1/integrations/kick/chat-bridges. Mirrors
 * packages/api/src/routes/kickChatBridges.ts. Kick has no per-user
 * OAuth — chat is public — so there's no "Kick not linked"
 * precondition; the chatroom_id is the only credential.
 */

export interface KickChatBridgeRecord {
    id: string;
    blackoutUserId: string;
    kickChatroomId: string;
    matrixRoomId: string;
    isActive: boolean;
    lastStoppedAt?: string;
    lastStoppedReason?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ListBridgesResponse {
    bridges: KickChatBridgeRecord[];
}

export interface CreateBridgeBody {
    kickChatroomId: string;
    matrixRoomId: string;
}

export interface CreateBridgeResponse {
    bridge: KickChatBridgeRecord;
}

export interface ApiCallOptions {
    token?: string | null;
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const BASE = '/v1/integrations/kick/chat-bridges';

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

// ----------------------------- input validators -----------------------------

/**
 * Kick chatroom ids are positive integers (no leading zeros). 1-18
 * digits is plenty of headroom and dodges any int-overflow surprises
 * if the platform's growing counter ever flirts with 64-bit limits.
 */
export const isValidKickChatroomId = (raw: string): boolean =>
    /^[1-9][0-9]{0,17}$/.test(raw.trim());

export const isValidMatrixRoomId = (raw: string): boolean =>
    /^[!#][^:\s]+:[^:\s]+$/.test(raw.trim());
