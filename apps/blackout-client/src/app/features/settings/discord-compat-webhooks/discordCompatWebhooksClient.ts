import { createAuthorizedApiClient } from '../../../sdk/client';
import { readBlackoutApiToken } from '../../monetization/marketplace/useMarketplaceAuth';

/**
 * Frontend wrappers for /v1/integrations/discord-compat/webhooks. Mirrors
 * packages/api/src/routes/discordCompatWebhooks.ts.
 *
 * The "execute URL" returned by createWebhook is a Discord-shape URL
 * (`/discord-compat/webhooks/{id}/{token}`) that the user pastes into
 * any 3rd-party service that already speaks "Discord webhook".
 */

export interface DiscordCompatWebhook {
    id: string;
    matrixRoomId: string;
    name: string;
    avatarUrl?: string;
    isActive: boolean;
    lastUsedAt?: string;
    deliveryCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface ListWebhooksResponse {
    webhooks: DiscordCompatWebhook[];
}

export interface CreateWebhookBody {
    matrixRoomId: string;
    name: string;
    avatarUrl?: string;
}

export interface CreateWebhookResponse {
    webhook: DiscordCompatWebhook;
    /** Plaintext token, only ever returned at create time. */
    token: string;
    /** Path-only URL the user pastes into the source service. Prepend the API origin. */
    url: string;
}

export interface ApiCallOptions {
    token?: string | null;
    apiClient?: ReturnType<typeof createAuthorizedApiClient>;
}

const client = (options?: ApiCallOptions) =>
    options?.apiClient ?? createAuthorizedApiClient(options?.token ?? readBlackoutApiToken());

const BASE = '/v1/integrations/discord-compat/webhooks';

export const listWebhooks = (options?: ApiCallOptions): Promise<ListWebhooksResponse> =>
    client(options)({ method: 'GET', path: BASE }) as Promise<ListWebhooksResponse>;

export const createWebhook = (
    body: CreateWebhookBody,
    options?: ApiCallOptions,
): Promise<CreateWebhookResponse> =>
    client(options)({ method: 'POST', path: BASE, body }) as Promise<CreateWebhookResponse>;

export const deleteWebhook = (
    webhookId: string,
    options?: ApiCallOptions,
): Promise<{ ok: true }> =>
    client(options)({
        method: 'DELETE',
        path: `${BASE}/${encodeURIComponent(webhookId)}`,
    }) as Promise<{ ok: true }>;

// ----------------------------- input validators -----------------------------

export const isValidMatrixRoomId = (raw: string): boolean =>
    /^[!#][^:\s]+:[^:\s]+$/.test(raw.trim());

export const isValidWebhookName = (raw: string): boolean => {
    const t = raw.trim();
    return t.length > 0 && t.length <= 80;
};

export const isValidAvatarUrl = (raw: string): boolean => {
    const t = raw.trim();
    if (!t) return true; // optional
    if (t.length > 2048) return false;
    return /^https?:\/\//i.test(t);
};
